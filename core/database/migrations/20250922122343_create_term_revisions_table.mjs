import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.ts'
const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }term_revisions`

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
      .notNullable()
      .references('id')
      .inTable(`${prefix  }terms`)
      .onDelete('CASCADE')
    table
      .integer('term_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable(`${prefix  }terms`)
      .onDelete('CASCADE')
    table
      .integer('author_id')
      .unsigned()
      .references('id')
      .inTable(`${prefix  }users`)
      .onDelete('SET NULL')
    table.string('field_slug')
    table.text('value')
    table.string('comment')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
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
