import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.mjs'

const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix  }post_permissions`

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
      .references('id')
      .inTable(`${prefix  }users`)
      .onDelete('SET NULL')
    table
      .integer('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable(`${prefix  }posts`)
      .onDelete('CASCADE')
    table.json('capabilities')
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
    table.unique(['user_id', 'post_id'])
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
