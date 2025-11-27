const prefix = process.env.TABLE_PREFIX
const tableName = `${prefix}post_type_fields`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.table(tableName, (table) => {
    table.integer('order').defaultTo(1000)
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.table(tableName, (table) => {
    table.dropColumn('order')
  })
}
