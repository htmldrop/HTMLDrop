import crypto from 'crypto'
export const buildPayload = async (context, user) => {
  const { knex, table } = context
  const roles = await knex(table('user_roles'))
    .join(table('roles'), `${table('user_roles')  }.role_id`, `${table('roles')  }.id`)
    .where(`${table('user_roles')  }.user_id`, user.id)
    .pluck(`${table('roles')  }.slug`)
  const capabilities = await knex(table('user_capabilities'))
    .join(table('capabilities'), `${table('user_capabilities')  }.capability_id`, `${table('capabilities')  }.id`)
    .where(`${table('user_capabilities')  }.user_id`, user.id)
    .pluck(`${table('capabilities')  }.slug`)
  return { sub: user.id, email: user.email, locale: user.locale, roles, capabilities, jti: crypto.randomUUID() }
}
