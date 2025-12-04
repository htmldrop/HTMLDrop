import jwt from 'jsonwebtoken'
import { parse as parseUrl } from 'url'
import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import UserGuard from './UserGuard.ts'

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number
  authenticated?: boolean
  capabilities?: string[]
}

/**
 * WebSocket JWT Authentication Middleware
 * Authenticates WebSocket connections using JWT tokens
 */
export default function createWsAuthMiddleware(context: HTMLDrop.Context) {
  return async (ws: AuthenticatedWebSocket, req: IncomingMessage): Promise<boolean> => {
    try {
      // Parse query string to get token
      const { query } = parseUrl(req.url || '', true)
      let token = query.token as string | undefined

      // Also try to get token from upgrade headers
      if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7)
        }
      }

      if (!token) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Authentication required. Please provide a valid token.'
        }))
        ws.close(1008, 'Authentication required')
        return false
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as HTMLDrop.JwtPayload

      // Check if token is revoked
      const { knex, table } = context
      if (!knex) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Database not available'
        }))
        ws.close(1011, 'Database unavailable')
        return false
      }
      const isRevoked = await knex(table('revoked_tokens'))
        .where('token', token)
        .first()

      if (isRevoked) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Token has been revoked'
        }))
        ws.close(1008, 'Token revoked')
        return false
      }

      // Fetch user capabilities using UserGuard
      const userId = decoded.sub || decoded.id
      const guard = new UserGuard(context, userId)
      const capabilities = await guard.resolveUserCapabilities(userId!)
      const capabilitySlugs = Array.from(capabilities)

      // Attach user info and capabilities to WebSocket
      ws.userId = userId
      ws.authenticated = true
      ws.capabilities = capabilitySlugs

      return true
    } catch {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid or expired token'
      }))
      ws.close(1008, 'Invalid token')
      return false
    }
  }
}
