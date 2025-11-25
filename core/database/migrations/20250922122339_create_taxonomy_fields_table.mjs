import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.mjs'

const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }taxonomy_fields`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table
      .integer('taxonomy_id')
      .unsigned()
      .references('id')
      .inTable(`${prefix  }taxonomies`)
      .onDelete('SET NULL')
    table.string('name')
    table.string('slug').notNullable()
    table.string('taxonomy_slug').notNullable()
    table.string('post_type_slug').notNullable()
    table.string('type').defaultTo('text')
    table.json('options')
    table.json('conditions')
    table.boolean('required')
    table.boolean('revisions').defaultTo(false)
    table.integer('priority').defaultTo(5)
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.index('name')
    table.index('taxonomy_id')
    table.index('taxonomy_slug')
    table.unique(['slug', 'taxonomy_slug', 'post_type_slug'])
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
