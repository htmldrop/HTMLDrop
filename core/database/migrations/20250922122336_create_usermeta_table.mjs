import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.ts'
const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }usermeta`

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
    table.string('field_slug')
    table.text('value')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.unique(['user_id', 'field_slug'])
    table.index('field_slug')
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
