import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.mjs'

const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }posts`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table
      .integer('post_type_id')
      .unsigned()
      .references('id')
      .inTable(`${prefix  }post_types`)
      .onDelete('SET NULL')
    table.string('post_type_slug').notNullable()
    table.string('slug')
    table.string('status').defaultTo('draft')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.datetime('deleted_at').defaultTo(null)
    table.index('status')
    table.index('post_type_id')
    table.unique(['post_type_slug', 'slug'])
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
