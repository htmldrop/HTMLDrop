import type { Request, Response, NextFunction } from 'express'
import type { Knex } from 'knex'

interface Context {
  knex?: Knex
  table: (name: string) => string
}

export default (context: Context) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const { knex, table } = context
      const adminUserRole = await knex!(table('roles'))
        .join(table('user_roles'), `${table('roles')}.id`, '=', `${table('user_roles')}.role_id`)
        .where(`${table('roles')}.slug`, 'admin')
        .first()

      if (adminUserRole) {
        return res.redirect('/')
      }
    } catch {
      next()
    }
    next()
  }
