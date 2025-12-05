const prefix = process.env.TABLE_PREFIX

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.alterTable(`${prefix}ai_providers`, (table) => {
    // Add encrypted API key column (stores the actual key encrypted)
    table.text('api_key_encrypted').nullable()
    // Track when the key was last updated
    table.timestamp('api_key_updated_at').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.alterTable(`${prefix}ai_providers`, (table) => {
    table.dropColumn('api_key_encrypted')
    table.dropColumn('api_key_updated_at')
  })
}
