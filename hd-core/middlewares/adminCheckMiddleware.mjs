export default (context) => async (req, res, next) => {
  try {
    const { knex, table } = context
    const adminUserRole = await knex(table('roles'))
      .join(table('user_roles'), `${table('roles')  }.id`, '=', `${table('user_roles')  }.role_id`)
      .where(`${table('roles')  }.slug`, 'admin')
      .first()

    if (adminUserRole) {
      return res.redirect('/')
    }
  } catch (e) {
    next()
  }
  next()
}
