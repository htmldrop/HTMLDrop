const tableName = `${process.env.TABLE_PREFIX}oauth_states`

/**
 * Create oauth_states table for CSRF protection in OAuth flows
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id').primary()
    table.string('state_hash', 64).notNullable().index()
    table.string('provider', 50).notNullable()
    table.datetime('expires_at').notNullable().index()
    table.datetime('created_at').defaultTo(knex.fn.now())
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists(tableName)
}
