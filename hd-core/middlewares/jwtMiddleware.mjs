import jwt from 'jsonwebtoken'
import UserGuard from '../utils/UserGuard.mjs'
import crypto from 'crypto'

export default (context) => async (req, res, next) => {
  try {
    const { knex, table } = context
    const authHeader = req.headers.authorization
    if (!authHeader) return next()

    const token = authHeader.split(' ')[1]
    if (!token) return next()

    // Check if token is revoked
    const revoked = await knex(table('revoked_tokens'))
      .where({ token: crypto.createHash('sha256').update(token).digest('hex') })
      .first()

    if (revoked) {
      // Remove expired tokens asynchronously
      knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
      knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

      return res.status(401).send('Token revoked')
    }

    // Verify JWT
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    // Attach payload
    req.payload = payload
    req.user = JSON.parse(JSON.stringify(payload))
    req.user.id = req.user.sub
    delete req.user.sub

    // Attach user guard
    req.guard = new UserGuard(context, req.payload?.sub, req, res, next)

    next()
  } catch (err) {
    console.error(err)
    return res.status(401).send('Invalid token')
  }
}
