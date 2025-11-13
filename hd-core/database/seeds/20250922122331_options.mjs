export const seed = async (knex) => {
  const prefix = process.env.TABLE_PREFIX
  const tableName = `${prefix  }options`
  const seeds = [
    { name: 'theme', value: 'hello-coral', autoload: true },
    {
      name: 'active_plugins',
      value: JSON.stringify(['coralpen']),
      autoload: true
    },
    { name: '2fa', value: 'false', autoload: true }
  ]

  for (const seed of seeds) {
    const record = await knex(tableName).where({ name: seed.name }).first()
    if (!record) {
      await knex(tableName).insert({ ...seed, created_at: knex.fn.now(), updated_at: knex.fn.now() })
    }
  }
}
