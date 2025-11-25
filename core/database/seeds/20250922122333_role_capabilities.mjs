export const seed = async (knex) => {
  const prefix = process.env.TABLE_PREFIX
  const tableName = `${prefix  }role_capabilities`
  const role = await knex(`${prefix  }roles`)
    .where('slug', 'administrator')
    .first()
  const capabilities = await knex(`${prefix  }capabilities`).select('id')

  for (const cap of capabilities) {
    const record = await knex(tableName).where({ role_id: role.id, capability_id: cap.id }).first()
    if (!record) {
      await knex(tableName).insert({
        role_id: role.id,
        capability_id: cap.id,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
    }
  }
}
