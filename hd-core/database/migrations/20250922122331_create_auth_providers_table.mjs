import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.mjs'

const tableName = `${process.env.TABLE_PREFIX  }auth_providers`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table.string('name')
    table.string('slug').notNullable().unique()
    table.string('client_id').notNullable()
    table.string('secret_env_key').notNullable()
    table.json('scope')
    table.string('auth_url').notNullable() // authorization endpoint
    table.string('token_url').notNullable() // access token endpoint
    table.string('user_info_url').notNullable() // endpoint to fetch user info
    table.string('redirect_uri').notNullable() // where provider will redirect
    table.boolean('active').defaultTo(false)
    table.json('response_params')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
  })
  await knexUp(knex, tableName)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knexDown(knex, tableName)
  await knex.schema.dropTable(tableName)
}
