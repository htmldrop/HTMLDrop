const tableName = `${process.env.TABLE_PREFIX}users`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.table(tableName, (table) => {
    table.string('reset_token', 255).nullable()
    table.datetime('reset_token_expires_at').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.table(tableName, (table) => {
    table.dropColumn('reset_token')
    table.dropColumn('reset_token_expires_at')
  })
}
