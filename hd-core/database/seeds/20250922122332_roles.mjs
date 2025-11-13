export const seed = async (knex) => {
  const prefix = process.env.TABLE_PREFIX
  const tableName = `${prefix  }roles`
  const seeds = [
    { name: 'Administrator', slug: 'administrator' },
    { name: 'User', slug: 'user' },
    { name: 'Guest', slug: 'guest' }
  ]

  for (const seed of seeds) {
    const record = await knex(tableName).where({ slug: seed.slug }).first()
    if (!record) {
      await knex(tableName).insert({ ...seed, created_at: knex.fn.now(), updated_at: knex.fn.now() })
    }
  }
}
