import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { hash, validate as validatePassword, verify } from '../../utils/password.mjs'
import { validate as validateEmail } from '../../utils/email.mjs'
import { buildPayload } from '../../utils/payload.mjs'

export default (context) => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /auth/login:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: User login
   *     description: Authenticate a user with email and password, returns JWT access and refresh tokens
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: admin@example.com
   *               password:
   *                 type: string
   *                 format: password
   *                 example: password123
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 accessToken:
   *                   type: string
   *                   description: JWT access token
   *                 refreshToken:
   *                   type: string
   *                   description: JWT refresh token
   *                 expiresIn:
   *                   type: integer
   *                   description: Access token expiration time in seconds
   *                 expiresAt:
   *                   type: string
   *                   format: date-time
   *                   description: Access token expiration timestamp
   *       401:
   *         description: Invalid credentials
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/login', async (req, res) => {
    const { knex, table, formatDate } = context
    try {
      const { email, password } = req.body

      // Remove expired tokens asynchronously
      knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
      knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

      // Find user
      const user = await knex(table('users')).where({ email }).first()
      if (!user) return res.status(401).send('Invalid credentials')

      // Verify password
      const isVerified = await verify(password, user.password)
      if (!isVerified) return res.status(401).send('Invalid credentials')

      // Generate payload
      const payload = await buildPayload(context, user)

      // Generate access token
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
      const { exp: expA } = jwt.decode(accessToken)
      const expiresAt = new Date(expA * 1000)

      const now = new Date()
      const expiresIn = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)

      // Generate refresh token
      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
      })
      const { exp } = jwt.decode(refreshToken)
      await knex(table('refresh_tokens')).insert({
        user_id: user.id,
        token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        expires_at: formatDate(new Date(exp * 1000))
      })

      res.status(200).json({ accessToken, refreshToken, expiresIn, expiresAt })
    } catch (error) {
      console.error(error)
      res.status(500).send('Internal server error')
    }
  })

  /**
   * @openapi
   * /auth/logout:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: User logout
   *     description: Revoke access token and delete all refresh tokens for the user
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Logged out successfully
   *       400:
   *         description: No token provided
   *       500:
   *         description: Internal server error
   */
  router.post('/logout', async (req, res) => {
    const { knex, table, formatDate } = context
    try {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) return res.status(400).send('No token provided')

      const payload = jwt.verify(token, process.env.JWT_SECRET)

      // Remove expired tokens asynchronously
      knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
      knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

      // Revoke current access token
      await knex(table('revoked_tokens')).insert({
        token: crypto.createHash('sha256').update(token).digest('hex'),
        revoked_at: formatDate(new Date()),
        expires_at: formatDate(new Date(payload.exp * 1000))
      })

      // Delete all refresh tokens for this user
      await knex(table('refresh_tokens')).where({ user_id: payload.sub }).del()

      res.status(200).send('Logged out successfully')
    } catch (err) {
      console.error(err)
      res.status(500).send('Internal server error')
    }
  })

  /**
   * @openapi
   * /auth/refresh:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Refresh access token
   *     description: Get a new access token using a valid refresh token
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *                 description: Valid refresh token
   *     responses:
   *       200:
   *         description: New access token generated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 accessToken:
   *                   type: string
   *                   description: New JWT access token
   *                 expiresIn:
   *                   type: integer
   *                   description: Token expiration time in seconds
   *                 expiresAt:
   *                   type: string
   *                   format: date-time
   *       400:
   *         description: Missing refresh token
   *       401:
   *         description: Invalid or expired refresh token
   */
  router.post('/refresh', async (req, res) => {
    const { knex, table, formatDate } = context
    try {
      const { refreshToken } = req.body
      if (!refreshToken) return res.status(400).send('Missing refresh token')

      // Remove expired tokens asynchronously
      knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
      knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

      // Verify refresh token exists in DB
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex')
      const tokenRecord = await knex(table('refresh_tokens')).where({ token: hash }).first()
      if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
        return res.status(401).send('Invalid or expired refresh token')
      }

      // Verify token signature
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)

      // Revoke old refresh token
      await knex(table('refresh_tokens')).where({ token: hash }).del()

      // Find user
      const user = await knex(table('users')).where({ id: payload.sub }).first()
      if (!user) return res.status(401).send('User not found')

      // Generate payload
      const newPayload = await buildPayload(context, user)

      // Issue new refresh token
      const newRefreshToken = jwt.sign(newPayload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
      })
      const { exp } = jwt.decode(newRefreshToken)
      await knex(table('refresh_tokens')).insert({
        user_id: newPayload.sub,
        token: crypto.createHash('sha256').update(newRefreshToken).digest('hex'),
        expires_at: formatDate(new Date(exp * 1000))
      })

      // Issue new access token
      const accessToken = jwt.sign(newPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
      const { exp: expA } = jwt.decode(accessToken)
      const expiresAt = new Date(expA * 1000)

      const now = new Date()
      const expiresIn = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)

      res.status(200).json({ accessToken, refreshToken: newRefreshToken, expiresIn, expiresAt })
    } catch (err) {
      console.error(err)
      res.status(401).send('Invalid refresh token')
    }
  })

  /**
   * @openapi
   * /auth/register:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Register new user
   *     description: Create a new user account with email and password. Requires ALLOW_REGISTRATIONS=true in environment.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: user@example.com
   *               password:
   *                 type: string
   *                 format: password
   *                 example: securePassword123
   *               locale:
   *                 type: string
   *                 example: en_US
   *                 description: User's preferred locale
   *     responses:
   *       201:
   *         description: User registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 accessToken:
   *                   type: string
   *                   description: JWT access token
   *                 refreshToken:
   *                   type: string
   *                   description: JWT refresh token
   *                 expiresIn:
   *                   type: integer
   *                   description: Access token expiration time in seconds
   *                 expiresAt:
   *                   type: string
   *                   format: date-time
   *                   description: Access token expiration timestamp
   *       400:
   *         description: Registration disabled, invalid email, or weak password
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       409:
   *         description: User already exists
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/register', async (req, res) => {
    const { knex, table, formatDate } = context
    try {
      const { email, password, locale } = req.body

      // Remove expired tokens asynchronously
      knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
      knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

      if (process.env.ALLOW_REGISTRATIONS !== 'true') {
        return res.status(400).send('Automatic registration of new users is disabled')
      }

      const emailValidation = validateEmail(email)
      const passwordValidation = validatePassword(password)

      if (!emailValidation.valid) {
        return res.status(400).send(emailValidation.message)
      }

      if (!passwordValidation.valid) {
        return res.status(400).send(passwordValidation.message)
      }

      // Check if user exists
      let user = await knex(table('users')).where({ email }).first()
      if (user) return res.status(409).send('User already exists')
      const [userId] = await knex(table('users')).insert({ email, password: await hash(password), locale })
      user = { id: userId, email, locale }

      // Generate payload
      const payload = await buildPayload(context, user)

      // Generate access token
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
      const { exp: expA } = jwt.decode(accessToken)
      const expiresAt = new Date(expA * 1000)

      const now = new Date()
      const expiresIn = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)

      // Generate refresh token
      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
      })
      const { exp } = jwt.decode(refreshToken)
      await knex('refresh_tokens').insert({
        user_id: user.id,
        token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        expires_at: formatDate(new Date(exp * 1000))
      })

      res.status(201).json({ accessToken, refreshToken, expiresIn, expiresAt })
    } catch (error) {
      console.error(error)
      res.status(500).send('Internal server error')
    }
  })

  return router
}
