import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.ts'
const tableName = `${process.env.TABLE_PREFIX  }taxonomies`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table.string('slug').notNullable()
    table.string('post_type_slug').notNullable()
    table.string('name_singular')
    table.string('name_plural')
    table.string('description')
    table.boolean('show_in_menu').defaultTo(true)
    table.text('icon')
    table.integer('badge')
    table.integer('position')
    table.json('capabilities')
    table.integer('priority').defaultTo(5)
    table.integer('order')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.index('name_singular')
    table.index('name_plural')
    table.unique(['slug', 'post_type_slug'])
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
