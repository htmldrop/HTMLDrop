import path from 'path'
import fs from 'fs'
import type { Knex } from 'knex'

interface PluginMigrationContext {
  knex: Knex
  table: (name: string) => string
}

interface MigrationFile {
  name: string
  fullPath: string
  timestamp: number
}

interface MigrationResult {
  success: boolean
  direction: 'up' | 'down'
  migrations: string[]
  errors: string[]
}

/**
 * Plugin Migration Service
 * Handles database migrations for plugins
 *
 * Plugins can include a `database/migrations` folder with migration files.
 * Migration files should follow the naming convention: YYYYMMDDHHMMSS_migration_name.mjs
 *
 * Each migration file should export:
 * - up(knex, table): Promise<void> - runs when migrating
 * - down(knex, table): Promise<void> - runs when rolling back
 */
export default class PluginMigrationService {
  private context: PluginMigrationContext
  private knex: Knex
  private table: (name: string) => string

  constructor(context: PluginMigrationContext) {
    this.context = context
    this.knex = context.knex
    this.table = context.table
  }

  /**
   * Ensure migration tracking table exists
   */
  async ensureMigrationTable(): Promise<void> {
    const tableName = this.table('plugin_migrations')

    const exists = await this.knex.schema.hasTable(tableName)
    if (!exists) {
      await this.knex.schema.createTable(tableName, (t) => {
        t.increments('id').primary()
        t.string('plugin_slug').notNullable()
        t.string('migration_name').notNullable()
        t.integer('batch').notNullable()
        t.timestamp('ran_at').defaultTo(this.knex.fn.now())
        t.unique(['plugin_slug', 'migration_name'])
      })

      console.log(`[PluginMigration] Created migration table: ${tableName}`)
    }
  }

  /**
   * Get all migration files for a plugin
   */
  getMigrationFiles(pluginSlug: string): MigrationFile[] {
    const migrationsPath = path.resolve(`./content/plugins/${pluginSlug}/database/migrations`)

    if (!fs.existsSync(migrationsPath)) {
      return []
    }

    const files = fs.readdirSync(migrationsPath).filter((f) => f.endsWith('.mjs') || f.endsWith('.js') || f.endsWith('.ts'))

    return files
      .map((name) => {
        // Extract timestamp from filename (YYYYMMDDHHMMSS_name.mjs)
        const match = name.match(/^(\d{14})_/)
        const timestamp = match ? parseInt(match[1], 10) : 0

        return {
          name,
          fullPath: path.join(migrationsPath, name),
          timestamp
        }
      })
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get ran migrations for a plugin
   */
  async getRanMigrations(pluginSlug: string): Promise<string[]> {
    await this.ensureMigrationTable()

    const migrations = await this.knex(this.table('plugin_migrations'))
      .where('plugin_slug', pluginSlug)
      .select('migration_name')

    return migrations.map((m: { migration_name: string }) => m.migration_name)
  }

  /**
   * Get pending migrations for a plugin
   */
  async getPendingMigrations(pluginSlug: string): Promise<MigrationFile[]> {
    const files = this.getMigrationFiles(pluginSlug)
    const ran = await this.getRanMigrations(pluginSlug)

    return files.filter((f) => !ran.includes(f.name))
  }

  /**
   * Get next batch number
   */
  async getNextBatch(pluginSlug: string): Promise<number> {
    const result = await this.knex(this.table('plugin_migrations'))
      .where('plugin_slug', pluginSlug)
      .max('batch as maxBatch')
      .first()

    return ((result?.maxBatch as number) || 0) + 1
  }

  /**
   * Run pending migrations for a plugin
   */
  async migrate(pluginSlug: string): Promise<MigrationResult> {
    const pending = await this.getPendingMigrations(pluginSlug)

    if (pending.length === 0) {
      return { success: true, direction: 'up', migrations: [], errors: [] }
    }

    const batch = await this.getNextBatch(pluginSlug)
    const ran: string[] = []
    const errors: string[] = []

    for (const migration of pending) {
      try {
        console.log(`[PluginMigration] Running: ${pluginSlug}/${migration.name}`)

        // Import migration module
        const mod = await import(migration.fullPath)

        if (typeof mod.up !== 'function') {
          throw new Error(`Migration ${migration.name} must export an 'up' function`)
        }

        // Run migration
        await mod.up(this.knex, this.table)

        // Record migration
        await this.knex(this.table('plugin_migrations')).insert({
          plugin_slug: pluginSlug,
          migration_name: migration.name,
          batch
        })

        ran.push(migration.name)
        console.log(`[PluginMigration] Completed: ${pluginSlug}/${migration.name}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[PluginMigration] Failed: ${pluginSlug}/${migration.name}`, error)
        errors.push(`${migration.name}: ${message}`)
        // Stop on first error to maintain consistency
        break
      }
    }

    return {
      success: errors.length === 0,
      direction: 'up',
      migrations: ran,
      errors
    }
  }

  /**
   * Rollback last batch of migrations for a plugin
   */
  async rollback(pluginSlug: string): Promise<MigrationResult> {
    await this.ensureMigrationTable()

    // Get last batch
    const lastBatch = await this.knex(this.table('plugin_migrations'))
      .where('plugin_slug', pluginSlug)
      .max('batch as maxBatch')
      .first()

    if (!lastBatch?.maxBatch) {
      return { success: true, direction: 'down', migrations: [], errors: [] }
    }

    // Get migrations in that batch (in reverse order)
    const migrations = await this.knex(this.table('plugin_migrations'))
      .where('plugin_slug', pluginSlug)
      .where('batch', lastBatch.maxBatch)
      .orderBy('id', 'desc')

    const rolled: string[] = []
    const errors: string[] = []

    for (const record of migrations) {
      try {
        const migrationPath = path.resolve(
          `./content/plugins/${pluginSlug}/database/migrations/${record.migration_name}`
        )

        if (!fs.existsSync(migrationPath)) {
          throw new Error(`Migration file not found: ${record.migration_name}`)
        }

        console.log(`[PluginMigration] Rolling back: ${pluginSlug}/${record.migration_name}`)

        // Import migration module
        const mod = await import(migrationPath)

        if (typeof mod.down !== 'function') {
          throw new Error(`Migration ${record.migration_name} must export a 'down' function`)
        }

        // Run rollback
        await mod.down(this.knex, this.table)

        // Remove migration record
        await this.knex(this.table('plugin_migrations')).where('id', record.id).delete()

        rolled.push(record.migration_name)
        console.log(`[PluginMigration] Rolled back: ${pluginSlug}/${record.migration_name}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[PluginMigration] Rollback failed: ${pluginSlug}/${record.migration_name}`, error)
        errors.push(`${record.migration_name}: ${message}`)
        break
      }
    }

    return {
      success: errors.length === 0,
      direction: 'down',
      migrations: rolled,
      errors
    }
  }

  /**
   * Rollback all migrations for a plugin
   */
  async reset(pluginSlug: string): Promise<MigrationResult> {
    const allMigrations: string[] = []
    const allErrors: string[] = []

    // Keep rolling back until no more batches
    let hasMore = true
    while (hasMore) {
      const result = await this.rollback(pluginSlug)
      allMigrations.push(...result.migrations)
      allErrors.push(...result.errors)

      if (result.migrations.length === 0 || result.errors.length > 0) {
        hasMore = false
      }
    }

    return {
      success: allErrors.length === 0,
      direction: 'down',
      migrations: allMigrations,
      errors: allErrors
    }
  }

  /**
   * Get migration status for a plugin
   */
  async status(pluginSlug: string): Promise<{
    pending: string[]
    ran: { name: string; batch: number; ranAt: string }[]
  }> {
    await this.ensureMigrationTable()

    const pending = await this.getPendingMigrations(pluginSlug)

    const ran = await this.knex(this.table('plugin_migrations'))
      .where('plugin_slug', pluginSlug)
      .orderBy('batch', 'asc')
      .orderBy('id', 'asc')

    return {
      pending: pending.map((p) => p.name),
      ran: ran.map((r: { migration_name: string; batch: number; ran_at: string }) => ({
        name: r.migration_name,
        batch: r.batch,
        ranAt: r.ran_at
      }))
    }
  }

  /**
   * Check if a plugin has any migrations
   */
  hasPluginMigrations(pluginSlug: string): boolean {
    const files = this.getMigrationFiles(pluginSlug)
    return files.length > 0
  }

  /**
   * Run migrations for a plugin (alias for migrate)
   */
  async runPluginMigrations(pluginSlug: string): Promise<MigrationResult> {
    return this.migrate(pluginSlug)
  }

  /**
   * Reset migrations for a plugin (delete all migration records)
   */
  async resetPluginMigrations(pluginSlug: string): Promise<void> {
    await this.ensureMigrationTable()
    await this.knex(this.table('plugin_migrations'))
      .where('plugin_slug', pluginSlug)
      .delete()
    console.log(`[PluginMigration] Reset migrations for plugin: ${pluginSlug}`)
  }
}
