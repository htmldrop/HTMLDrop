import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.mjs'

const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }refresh_tokens`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable(`${prefix  }users`)
      .onDelete('CASCADE')
    table.string('token').unique().notNullable()
    table.datetime('expires_at')
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
