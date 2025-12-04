import type { Request, Response, NextFunction } from 'express'

export default (context: HTMLDrop.Context) =>
  (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!context.knex) {
      return res.redirect('/api/v1/setup/database')
    }
    next()
  }
