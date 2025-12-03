import type { Knex } from 'knex'

/**
 * Validates table name to prevent SQL injection
 * Table names must contain only alphanumeric characters and underscores
 */
function validateTableName(tableName: string): boolean {
  if (!tableName || typeof tableName !== 'string') {
    throw new Error('Table name must be a non-empty string')
  }

  // Table names should only contain letters, numbers, and underscores
  // Must start with a letter or underscore
  const validTableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/
  if (!validTableNameRegex.test(tableName)) {
    throw new Error(
      `Invalid table name: ${tableName}. Table names must contain only alphanumeric characters and underscores, and start with a letter or underscore.`
    )
  }

  // Reasonable length limit
  if (tableName.length > 64) {
    throw new Error('Table name is too long')
  }

  return true
}

export const up = async (knex: Knex, tableName: string): Promise<void> => {
  // Validate table name to prevent SQL injection
  validateTableName(tableName)

  const client = knex.client.config.client as string
  const isSQLite = ['sqlite3', 'better-sqlite3'].includes(client)
  const isMySQL = ['mysql', 'mysql2'].includes(client)
  const isPostgres = ['pg', 'postgres'].includes(client)

  if (isSQLite) {
    // Using ?? for identifier escaping with knex.raw
    await knex.raw(
      `
            CREATE TRIGGER IF NOT EXISTS ??
            AFTER UPDATE ON ??
            BEGIN
                UPDATE ??
                SET updated_at = CURRENT_TIMESTAMP
                WHERE rowid = NEW.rowid;
            END;
        `,
      [`${tableName}_updated_at_trigger`, tableName, tableName]
    )
  } else if (isMySQL) {
    await knex.schema.alterTable(tableName, (t) => {
      t.datetime('updated_at').defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')).alter()
    })
  } else if (isPostgres) {
    await knex.raw(
      `
            CREATE OR REPLACE FUNCTION ??()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `,
      [`${tableName}_update_updated_at`]
    )

    await knex.raw(
      `
            CREATE TRIGGER ??
            BEFORE UPDATE ON ??
            FOR EACH ROW
            EXECUTE FUNCTION ${tableName}_update_updated_at();
        `,
      [`${tableName}_updated_at_trigger`, tableName]
    )
  }
}

export const down = async (knex: Knex, tableName: string): Promise<void> => {
  // Validate table name to prevent SQL injection
  validateTableName(tableName)

  const client = knex.client.config.client as string
  const isSQLite = ['sqlite3', 'better-sqlite3'].includes(client)
  const isPostgres = ['pg', 'postgres'].includes(client)

  if (isSQLite) {
    await knex.raw('DROP TRIGGER IF EXISTS ??', [`${tableName}_updated_at_trigger`])
  } else if (isPostgres) {
    await knex.raw('DROP TRIGGER IF EXISTS ?? ON ??', [`${tableName}_updated_at_trigger`, tableName])
    await knex.raw('DROP FUNCTION IF EXISTS ??()', [`${tableName}_update_updated_at`])
  }
}
