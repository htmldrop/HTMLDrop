const prefix = process.env.TABLE_PREFIX

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // AI Providers table
  await knex.schema.createTable(`${prefix}ai_providers`, (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('slug').notNullable().unique()
    table.string('api_key_env').notNullable() // Environment variable name for API key
    table.string('base_url').nullable()
    table.string('default_model').nullable()
    table.boolean('active').defaultTo(false)
    table.json('settings').nullable() // Provider-specific settings
    table.timestamps(true, true)
  })

  // AI Settings table (singleton - only one row)
  await knex.schema.createTable(`${prefix}ai_settings`, (table) => {
    table.increments('id').primary()
    table.string('active_provider_slug').nullable()
    table.string('active_model').nullable()
    table.boolean('auto_approve_reads').defaultTo(true)
    table.boolean('auto_approve_writes').defaultTo(false)
    table.text('system_prompt').nullable() // Custom system prompt additions
    table.integer('max_commands_per_turn').defaultTo(5)
    table.timestamps(true, true)
  })

  // AI Conversations table
  await knex.schema.createTable(`${prefix}ai_conversations`, (table) => {
    table.increments('id').primary()
    table.integer('user_id').unsigned().notNullable()
    table.string('title').nullable()
    table.timestamps(true, true)

    table.foreign('user_id').references('id').inTable(`${prefix}users`).onDelete('CASCADE')
  })

  // AI Messages table
  await knex.schema.createTable(`${prefix}ai_messages`, (table) => {
    table.increments('id').primary()
    table.integer('conversation_id').unsigned().notNullable()
    table.string('role').notNullable() // 'user', 'assistant', 'system'
    table.text('content').notNullable()
    table.json('commands_suggested').nullable() // Array of command suggestions
    table.json('commands_executed').nullable() // Array of executed commands with results
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.foreign('conversation_id').references('id').inTable(`${prefix}ai_conversations`).onDelete('CASCADE')
  })

  // AI Command Logs table (for audit trail)
  await knex.schema.createTable(`${prefix}ai_command_logs`, (table) => {
    table.increments('id').primary()
    table.integer('user_id').unsigned().notNullable()
    table.integer('conversation_id').unsigned().nullable()
    table.string('command_slug').notNullable()
    table.json('parameters').nullable()
    table.boolean('success').notNullable()
    table.text('result').nullable()
    table.text('error').nullable()
    table.timestamp('executed_at').defaultTo(knex.fn.now())

    table.foreign('user_id').references('id').inTable(`${prefix}users`).onDelete('CASCADE')
    table.foreign('conversation_id').references('id').inTable(`${prefix}ai_conversations`).onDelete('SET NULL')
  })

  // Insert default AI settings row
  await knex(`${prefix}ai_settings`).insert({
    auto_approve_reads: true,
    auto_approve_writes: false,
    max_commands_per_turn: 5
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists(`${prefix}ai_command_logs`)
  await knex.schema.dropTableIfExists(`${prefix}ai_messages`)
  await knex.schema.dropTableIfExists(`${prefix}ai_conversations`)
  await knex.schema.dropTableIfExists(`${prefix}ai_settings`)
  await knex.schema.dropTableIfExists(`${prefix}ai_providers`)
}
