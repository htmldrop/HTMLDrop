/**
 * Plugin Migration Service
 *
 * Allows plugins to define and run their own database migrations
 * Integrates with Knex.js migration system
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

class PluginMigrationService {
  constructor(context) {
    this.context = context
    this.knex = context.knex
    this.PLUGINS_BASE = path.resolve('./hd-content/plugins')
  }

  /**
   * Get plugin migrations directory
   * @param {string} pluginSlug - The plugin slug
   * @returns {string} Path to plugin migrations directory
   */
  getPluginMigrationsDir(pluginSlug) {
    return path.join(this.PLUGINS_BASE, pluginSlug, 'migrations')
  }

  /**
   * Check if plugin has migrations
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<boolean>} True if plugin has migrations
   */
  async hasPluginMigrations(pluginSlug) {
    const migrationsDir = this.getPluginMigrationsDir(pluginSlug)

    if (!fs.existsSync(migrationsDir)) {
      return false
    }

    const files = await fs.promises.readdir(migrationsDir)
    const migrationFiles = files.filter((f) => f.endsWith('.mjs') || f.endsWith('.js'))

    return migrationFiles.length > 0
  }

  /**
   * Get all migration files for a plugin
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Array>} Array of migration file objects
   */
  async getPluginMigrationFiles(pluginSlug) {
    const migrationsDir = this.getPluginMigrationsDir(pluginSlug)

    if (!fs.existsSync(migrationsDir)) {
      return []
    }

    const files = await fs.promises.readdir(migrationsDir)
    const migrationFiles = files
      .filter((f) => f.endsWith('.mjs') || f.endsWith('.js'))
      .map((f) => {
        const match = f.match(/^(\d+)_(.+)\.(mjs|js)$/)
        return {
          filename: f,
          path: path.join(migrationsDir, f),
          timestamp: match ? match[1] : null,
          name: match ? match[2] : f,
          extension: match ? match[3] : 'mjs'
        }
      })
      .sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return a.timestamp.localeCompare(b.timestamp)
        }
        return a.filename.localeCompare(b.filename)
      })

    return migrationFiles
  }

  /**
   * Create plugin migrations tracking table if it doesn't exist
   * @returns {Promise<void>}
   */
  async ensurePluginMigrationsTable() {
    const tableName = this.context.table('plugin_migrations')
    const exists = await this.knex.schema.hasTable(tableName)

    if (!exists) {
      await this.knex.schema.createTable(tableName, (table) => {
        table.increments('id').primary()
        table.string('plugin_slug', 255).notNullable()
        table.string('migration_name', 255).notNullable()
        table.timestamp('migration_time').defaultTo(this.knex.fn.now())
        table.integer('batch').notNullable()

        table.index(['plugin_slug'])
        table.index(['batch'])
        table.unique(['plugin_slug', 'migration_name'])
      })

      console.log('Created plugin_migrations tracking table')
    }
  }

  /**
   * Get current batch number
   * @returns {Promise<number>} Current batch number
   */
  async getCurrentBatch() {
    const tableName = this.context.table('plugin_migrations')
    const result = await this.knex(tableName).max('batch as max_batch').first()

    return result?.max_batch || 0
  }

  /**
   * Get completed migrations for a plugin
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Array>} Array of completed migration names
   */
  async getCompletedMigrations(pluginSlug) {
    await this.ensurePluginMigrationsTable()

    const tableName = this.context.table('plugin_migrations')
    const rows = await this.knex(tableName)
      .where({ plugin_slug: pluginSlug })
      .orderBy('migration_time', 'asc')
      .select('migration_name')

    return rows.map((row) => row.migration_name)
  }

  /**
   * Get pending migrations for a plugin
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Array>} Array of pending migration file objects
   */
  async getPendingMigrations(pluginSlug) {
    const allMigrations = await this.getPluginMigrationFiles(pluginSlug)
    const completedMigrations = await this.getCompletedMigrations(pluginSlug)

    return allMigrations.filter((migration) => !completedMigrations.includes(migration.name))
  }

  /**
   * Run a single migration file
   * @param {string} pluginSlug - The plugin slug
   * @param {Object} migrationFile - Migration file object
   * @param {string} direction - 'up' or 'down'
   * @returns {Promise<void>}
   */
  async runMigrationFile(pluginSlug, migrationFile, direction = 'up') {
    try {
      // Dynamic import with cache-busting
      const timestamp = Date.now()
      const fileUrl = `file://${migrationFile.path}?t=${timestamp}`
      const migration = await import(fileUrl)

      // Check if migration has the specified direction
      if (typeof migration[direction] !== 'function') {
        throw new Error(`Migration ${migrationFile.name} does not have a ${direction} function`)
      }

      // Run the migration
      console.log(`Running migration ${direction}: ${pluginSlug}/${migrationFile.name}`)
      await migration[direction](this.knex, this.context)

      console.log(`Migration ${direction} completed: ${pluginSlug}/${migrationFile.name}`)
    } catch (error) {
      console.error(`Migration ${direction} failed: ${pluginSlug}/${migrationFile.name}`, error)
      throw error
    }
  }

  /**
   * Run all pending migrations for a plugin
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Object>} Result with count of migrations run
   */
  async runPluginMigrations(pluginSlug) {
    await this.ensurePluginMigrationsTable()

    const pendingMigrations = await this.getPendingMigrations(pluginSlug)

    if (pendingMigrations.length === 0) {
      console.log(`No pending migrations for plugin: ${pluginSlug}`)
      return { count: 0, migrations: [] }
    }

    const batch = (await this.getCurrentBatch()) + 1
    const tableName = this.context.table('plugin_migrations')
    const ranMigrations = []

    // Run migrations in a transaction
    await this.knex.transaction(async (trx) => {
      for (const migrationFile of pendingMigrations) {
        try {
          // Temporarily replace knex with transaction
          const originalKnex = this.knex
          this.knex = trx

          await this.runMigrationFile(pluginSlug, migrationFile, 'up')

          // Restore original knex
          this.knex = originalKnex

          // Record migration
          await trx(tableName).insert({
            plugin_slug: pluginSlug,
            migration_name: migrationFile.name,
            batch
          })

          ranMigrations.push(migrationFile.name)
        } catch (error) {
          // Rollback will happen automatically
          throw new Error(`Migration failed: ${migrationFile.name}. Error: ${error.message}`)
        }
      }
    })

    console.log(`Ran ${ranMigrations.length} migrations for plugin: ${pluginSlug}`)
    return { count: ranMigrations.length, migrations: ranMigrations }
  }

  /**
   * Rollback last batch of migrations for a plugin
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Object>} Result with count of migrations rolled back
   */
  async rollbackPluginMigrations(pluginSlug) {
    await this.ensurePluginMigrationsTable()

    const tableName = this.context.table('plugin_migrations')
    const currentBatch = await this.getCurrentBatch()

    if (currentBatch === 0) {
      console.log(`No migrations to rollback for plugin: ${pluginSlug}`)
      return { count: 0, migrations: [] }
    }

    // Get migrations from last batch for this plugin
    const migrationsToRollback = await this.knex(tableName)
      .where({ plugin_slug: pluginSlug, batch: currentBatch })
      .orderBy('migration_time', 'desc')
      .select('migration_name')

    if (migrationsToRollback.length === 0) {
      console.log(`No migrations to rollback in batch ${currentBatch} for plugin: ${pluginSlug}`)
      return { count: 0, migrations: [] }
    }

    const allMigrations = await this.getPluginMigrationFiles(pluginSlug)
    const rolledBackMigrations = []

    // Rollback migrations in reverse order
    await this.knex.transaction(async (trx) => {
      for (const row of migrationsToRollback) {
        const migrationFile = allMigrations.find((m) => m.name === row.migration_name)

        if (!migrationFile) {
          console.warn(`Migration file not found: ${row.migration_name}`)
          continue
        }

        try {
          // Temporarily replace knex with transaction
          const originalKnex = this.knex
          this.knex = trx

          await this.runMigrationFile(pluginSlug, migrationFile, 'down')

          // Restore original knex
          this.knex = originalKnex

          // Remove migration record
          await trx(tableName).where({ plugin_slug: pluginSlug, migration_name: row.migration_name }).del()

          rolledBackMigrations.push(row.migration_name)
        } catch (error) {
          throw new Error(`Rollback failed: ${row.migration_name}. Error: ${error.message}`)
        }
      }
    })

    console.log(`Rolled back ${rolledBackMigrations.length} migrations for plugin: ${pluginSlug}`)
    return { count: rolledBackMigrations.length, migrations: rolledBackMigrations }
  }

  /**
   * Get migration status for a plugin
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Object>} Migration status
   */
  async getPluginMigrationStatus(pluginSlug) {
    const allMigrations = await this.getPluginMigrationFiles(pluginSlug)
    const completedMigrations = await this.getCompletedMigrations(pluginSlug)

    const status = allMigrations.map((migration) => ({
      name: migration.name,
      filename: migration.filename,
      completed: completedMigrations.includes(migration.name)
    }))

    return {
      total: allMigrations.length,
      completed: completedMigrations.length,
      pending: allMigrations.length - completedMigrations.length,
      migrations: status
    }
  }

  /**
   * Reset all migrations for a plugin (dangerous!)
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<void>}
   */
  async resetPluginMigrations(pluginSlug) {
    await this.ensurePluginMigrationsTable()

    const tableName = this.context.table('plugin_migrations')

    // Get all migrations in reverse order
    const allMigrations = await this.knex(tableName)
      .where({ plugin_slug: pluginSlug })
      .orderBy('migration_time', 'desc')
      .select('migration_name')

    const migrationFiles = await this.getPluginMigrationFiles(pluginSlug)

    // Run down on all migrations
    for (const row of allMigrations) {
      const migrationFile = migrationFiles.find((m) => m.name === row.migration_name)

      if (!migrationFile) {
        console.warn(`Migration file not found: ${row.migration_name}`)
        continue
      }

      try {
        await this.runMigrationFile(pluginSlug, migrationFile, 'down')
      } catch (error) {
        console.error(`Failed to rollback migration: ${row.migration_name}`, error)
        // Continue with other migrations
      }
    }

    // Clear all migration records for this plugin
    await this.knex(tableName).where({ plugin_slug: pluginSlug }).del()

    console.log(`Reset all migrations for plugin: ${pluginSlug}`)
  }

  /**
   * Create a new migration file for a plugin
   * @param {string} pluginSlug - The plugin slug
   * @param {string} migrationName - Name of the migration (e.g., 'create_table')
   * @returns {Promise<string>} Path to created migration file
   */
  async createMigrationFile(pluginSlug, migrationName) {
    const migrationsDir = this.getPluginMigrationsDir(pluginSlug)

    // Create migrations directory if it doesn't exist
    await fs.promises.mkdir(migrationsDir, { recursive: true })

    // Generate timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/T/, '')
      .replace(/\.\d{3}Z/, '')
      .slice(0, 14)

    // Normalize migration name
    const normalizedName = migrationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    const filename = `${timestamp}_${normalizedName}.mjs`
    const filepath = path.join(migrationsDir, filename)

    // Create migration file with template
    const template = `/**
 * Migration: ${normalizedName}
 * Plugin: ${pluginSlug}
 * Created: ${new Date().toISOString()}
 */

/**
 * Run the migration
 * @param {import('knex').Knex} knex - Knex instance
 * @param {Object} context - HTMLDrop context
 * @returns {Promise<void>}
 */
export async function up(knex, context) {
  const tableName = context.table('${pluginSlug}_example')

  // Example: Create a table
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id').primary()
    table.string('name', 255).notNullable()
    table.text('description')
    table.timestamps(true, true)
  })

  console.log(\`Created table: \${tableName}\`)
}

/**
 * Reverse the migration
 * @param {import('knex').Knex} knex - Knex instance
 * @param {Object} context - HTMLDrop context
 * @returns {Promise<void>}
 */
export async function down(knex, context) {
  const tableName = context.table('${pluginSlug}_example')

  // Example: Drop the table
  await knex.schema.dropTableIfExists(tableName)

  console.log(\`Dropped table: \${tableName}\`)
}
`

    await fs.promises.writeFile(filepath, template, 'utf8')

    console.log(`Created migration file: ${filename}`)
    return filepath
  }
}

export default PluginMigrationService
