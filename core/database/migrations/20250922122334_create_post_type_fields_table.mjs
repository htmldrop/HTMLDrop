import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.ts'
const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }post_type_fields`

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
    table.string('name')
    table.string('slug').notNullable()
    table.string('type').defaultTo('text')
    table.json('options')
    table.json('conditions')
    table.boolean('required')
    table.boolean('revisions').defaultTo(false)
    table.integer('priority').defaultTo(5)
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.index('name')
    table.index('post_type_id')
    table.index('post_type_slug')
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
