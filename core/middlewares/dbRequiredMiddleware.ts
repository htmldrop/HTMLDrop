import type { Request, Response, NextFunction } from 'express'
import type { Knex } from 'knex'

interface Context {
  knex?: Knex
}

export default (context: Context) =>
  (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!context.knex) {
      return res.redirect('/api/v1/setup/database')
    }
    next()
  }
