import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.ts'
const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }terms`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table
      .integer('parent_id')
      .unsigned()
      .references('id')
      .inTable(`${prefix  }terms`)
      .onDelete('SET NULL')
    table
      .integer('taxonomy_id')
      .unsigned()
      .references('id')
      .inTable(`${prefix  }taxonomies`)
      .onDelete('SET NULL')
    table.string('taxonomy_slug').notNullable()
    table.string('post_type_slug').notNullable()
    table.string('slug')
    table.string('status').defaultTo('draft')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.datetime('deleted_at').defaultTo(null)
    table.index('status')
    table.index('taxonomy_id')
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
