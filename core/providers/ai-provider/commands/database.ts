import type { AICommand, AICommandResult } from '../../../registries/RegisterAICommands.ts'

type RegisterFn = (command: AICommand, priority?: number) => void

export default function registerDatabaseCommands(register: RegisterFn, context: HTMLDrop.Context): void {
  const { knex } = context

  register({
    slug: 'database.status',
    name: 'Get Migration Status',
    description: 'Get the current database migration status',
    category: 'database',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_options'],
    parameters: [],
    contextProviders: ['database'],
    execute: async (): Promise<AICommandResult> => {
      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      try {
        // Get completed migrations
        const completed = await knex.migrate.list()
        const [ran, pending] = completed

        // Get database info
        const client = knex.client.config.client
        let version = 'unknown'

        if (client === 'better-sqlite3' || client === 'sqlite3') {
          const result = await knex.raw('SELECT sqlite_version() as version')
          version = result[0]?.version || 'unknown'
        } else if (client === 'mysql' || client === 'mysql2') {
          const result = await knex.raw('SELECT VERSION() as version')
          version = result[0]?.[0]?.version || 'unknown'
        } else if (client === 'pg') {
          const result = await knex.raw('SELECT version()')
          version = result.rows?.[0]?.version?.split(' ')[1] || 'unknown'
        }

        return {
          success: true,
          message: `Database status: ${ran.length} migrations ran, ${pending.length} pending`,
          data: {
            client,
            version,
            migrations: {
              completed: ran.map((m: { name: string }) => m.name),
              pending: pending.map((m: { name: string }) => m.name)
            },
            totalCompleted: ran.length,
            totalPending: pending.length
          }
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to get migration status: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: 'STATUS_FAILED'
        }
      }
    }
  })

  register({
    slug: 'database.migrate',
    name: 'Run Migrations',
    description: 'Run all pending database migrations',
    category: 'database',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['manage_options'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      try {
        const [batchNo, migrations] = await knex.migrate.latest()

        if (migrations.length === 0) {
          return {
            success: true,
            message: 'No pending migrations to run'
          }
        }

        return {
          success: true,
          message: `Successfully ran ${migrations.length} migrations (batch ${batchNo})`,
          data: {
            batchNo,
            migrations
          }
        }
      } catch (error) {
        return {
          success: false,
          message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: 'MIGRATION_FAILED'
        }
      }
    }
  })

  register({
    slug: 'database.rollback',
    name: 'Rollback Migrations',
    description: 'Rollback the last batch of migrations',
    category: 'database',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['manage_options'],
    parameters: [
      { name: 'all', type: 'boolean', required: false, description: 'Rollback all migrations (dangerous!)' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { all = false } = params as { all?: boolean }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      try {
        if (all) {
          // Rollback all migrations
          const [batchNo, migrations] = await knex.migrate.rollback(undefined, true)
          return {
            success: true,
            message: `Rolled back all migrations (${migrations.length} total)`,
            data: { batchNo, migrations }
          }
        } else {
          // Rollback last batch
          const [batchNo, migrations] = await knex.migrate.rollback()

          if (migrations.length === 0) {
            return {
              success: true,
              message: 'No migrations to rollback'
            }
          }

          return {
            success: true,
            message: `Rolled back ${migrations.length} migrations from batch ${batchNo}`,
            data: { batchNo, migrations }
          }
        }
      } catch (error) {
        return {
          success: false,
          message: `Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: 'ROLLBACK_FAILED'
        }
      }
    }
  })

  register({
    slug: 'database.seed',
    name: 'Run Database Seeds',
    description: 'Run database seed files to populate initial data',
    category: 'database',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['manage_options'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      try {
        const [seeds] = await knex.seed.run()

        return {
          success: true,
          message: `Successfully ran ${seeds.length} seed files`,
          data: { seeds }
        }
      } catch (error) {
        return {
          success: false,
          message: `Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: 'SEED_FAILED'
        }
      }
    }
  })

  register({
    slug: 'database.tables',
    name: 'List Tables',
    description: 'List all database tables',
    category: 'database',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_options'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      try {
        const client = knex.client.config.client
        let tables: string[] = []

        if (client === 'better-sqlite3' || client === 'sqlite3') {
          const result = await knex.raw(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
          )
          tables = result.map((r: { name: string }) => r.name)
        } else if (client === 'mysql' || client === 'mysql2') {
          const result = await knex.raw('SHOW TABLES')
          tables = result[0].map((r: Record<string, string>) => Object.values(r)[0])
        } else if (client === 'pg') {
          const result = await knex.raw(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
          )
          tables = result.rows.map((r: { tablename: string }) => r.tablename)
        }

        return {
          success: true,
          message: `Found ${tables.length} tables`,
          data: { tables }
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to list tables: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: 'LIST_TABLES_FAILED'
        }
      }
    }
  })

  register({
    slug: 'database.query',
    name: 'Execute Read Query',
    description: 'Execute a read-only SQL query (SELECT only)',
    category: 'database',
    type: 'read',
    permission: 'require_approval', // Even reads need approval for raw SQL
    capabilities: ['manage_options'],
    parameters: [
      { name: 'sql', type: 'string', required: true, description: 'SQL SELECT query to execute' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { sql } = params as { sql: string }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      // Only allow SELECT queries
      const trimmed = sql.trim().toLowerCase()
      if (!trimmed.startsWith('select')) {
        return {
          success: false,
          message: 'Only SELECT queries are allowed',
          error: 'INVALID_QUERY'
        }
      }

      // Block dangerous patterns
      const dangerous = ['drop', 'delete', 'update', 'insert', 'alter', 'truncate', 'create']
      for (const keyword of dangerous) {
        if (trimmed.includes(keyword)) {
          return {
            success: false,
            message: `Query contains forbidden keyword: ${keyword}`,
            error: 'FORBIDDEN_KEYWORD'
          }
        }
      }

      try {
        const result = await knex.raw(sql)
        const rows = Array.isArray(result) ? result : result.rows || result[0] || []

        return {
          success: true,
          message: `Query returned ${rows.length} rows`,
          data: {
            rows: rows.slice(0, 100), // Limit to 100 rows
            totalRows: rows.length,
            truncated: rows.length > 100
          }
        }
      } catch (error) {
        return {
          success: false,
          message: `Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: 'QUERY_FAILED'
        }
      }
    }
  })
}
