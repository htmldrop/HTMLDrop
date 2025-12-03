import type { Request, Response, NextFunction } from 'express'
import type { JwtPayload } from 'jsonwebtoken'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import type { Knex } from 'knex'
import UserGuard from '../utils/UserGuard.ts'

interface Context {
  knex?: Knex
  table: (name: string) => string
}

interface RequestWithUser extends Request {
  payload?: JwtPayload
  user?: {
    id: number
    [key: string]: unknown
  }
  guard?: InstanceType<typeof UserGuard>
}

export default (context: Context) =>
  async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const { knex, table } = context
      const authHeader = req.headers.authorization
      if (!authHeader) return next()

      const token = authHeader.split(' ')?.[1]
      if (!token) return next()

      // Check if token is revoked
      const revoked = await knex!(table('revoked_tokens'))
        .where({ token: crypto.createHash('sha256').update(token).digest('hex') })
        .first()

      if (revoked) {
        // Remove expired tokens asynchronously
        knex!(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
        knex!(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

        return res.status(401).send('Token revoked')
      }

      // Verify JWT
      const payload = jwt.verify(token, process.env.JWT_SECRET || '') as JwtPayload

      // Attach payload
      req.payload = payload
      req.user = JSON.parse(JSON.stringify(payload))
      req.user!.id = req.user!.sub as number
      delete req.user!.sub

      // Attach user guard - UserGuard only takes context and userId
      req.guard = new UserGuard(context as HTMLDrop.Context, req.payload?.sub as number | undefined)

      next()
    } catch (err) {
      console.error(err)
      return res.status(401).send('Invalid token')
    }
  }
