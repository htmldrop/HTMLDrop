import { up as knexUp, down as knexDown } from '../../utils/knexCreateMigration.mjs'

const tableName = `${process.env.TABLE_PREFIX}traces`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable(tableName, (table) => {
    table.increments('id')
    table.string('trace_id', 36).primary()
    table.string('request_method', 10)
    table.string('request_path', 500)
    table.string('request_url', 2000)
    table.integer('user_id').nullable()
    table.integer('total_duration')
    table.integer('span_count')
    table.integer('error_count')
    table.json('summary')
    table.json('spans')
    table.json('waterfall')
    table.json('metadata')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index('created_at')
    table.index('request_path')
    table.index('total_duration')
    table.index('error_count')
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
