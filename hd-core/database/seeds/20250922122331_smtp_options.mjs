const tableName = `${process.env.TABLE_PREFIX}options`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const seed = async (knex) => {
  // Check if SMTP options already exist
  const existing = await knex(tableName).where('name', 'smtp_host').first()

  if (!existing) {
    await knex(tableName).insert([
      {
        name: 'smtp_host',
        value: '',
        autoload: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      },
      {
        name: 'smtp_port',
        value: '587',
        autoload: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      },
      {
        name: 'smtp_secure',
        value: 'false',
        autoload: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      },
      {
        name: 'smtp_user',
        value: '',
        autoload: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      },
      {
        name: 'smtp_password',
        value: '',
        autoload: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      },
      {
        name: 'smtp_from',
        value: '',
        autoload: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      },
      {
        name: 'smtp_from_name',
        value: 'HTMLDrop',
        autoload: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      }
    ])
  }
}
