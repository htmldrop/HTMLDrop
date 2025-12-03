import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.ts'
const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }term_authors`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table
      .integer('term_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable(`${prefix  }terms`)
      .onDelete('CASCADE')
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable(`${prefix  }users`)
      .onDelete('CASCADE')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.unique(['term_id', 'user_id'])
    table.index('term_id')
    table.index('user_id')
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
