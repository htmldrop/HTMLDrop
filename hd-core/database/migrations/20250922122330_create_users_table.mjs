import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.mjs'

const tableName = `${process.env.TABLE_PREFIX  }users`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table.string('username').unique()
    table.string('status').defaultTo('active')
    table.string('first_name')
    table.string('middle_name')
    table.string('last_name')
    table.string('picture', 1024)
    table.string('locale')
    table.string('email').unique()
    table.string('phone').unique()
    table.string('password')
    table.datetime('email_verified_at')
    table.datetime('phone_verified_at')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.datetime('deleted_at').nullable()
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
