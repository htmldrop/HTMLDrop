import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.mjs'

const tableName = `${process.env.TABLE_PREFIX  }revoked_tokens`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table.string('token').unique().notNullable()
    table.datetime('expires_at')
    table.datetime('revoked_at')
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
