const tableName = `${process.env.TABLE_PREFIX}users`

/**
 * Add reset_token_prefix column for fast indexed lookup
 * This prevents brute-force enumeration by avoiding full table scans
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.table(tableName, (table) => {
    table.string('reset_token_prefix', 16).nullable().index()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.table(tableName, (table) => {
    table.dropColumn('reset_token_prefix')
  })
}
