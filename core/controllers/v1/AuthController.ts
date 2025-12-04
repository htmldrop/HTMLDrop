import type { Router, Request, Response } from 'express'
import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { hash, validate as validatePassword, verify } from '../../utils/password.ts'
import { validate as validateEmail } from '../../utils/email.ts'
import { buildPayload } from '../../utils/payload.ts'
import PasswordResetService from '../../services/PasswordResetService.ts'
import EmailService from '../../services/EmailService.mjs'

// JWT expiry values - cast to number to satisfy jsonwebtoken's StringValue type
// These are parsed by the ms library internally, so string values like '1h' work
const ACCESS_TOKEN_EXPIRY = (process.env.JWT_EXPIRES_IN || '1h') as unknown as number
const REFRESH_TOKEN_EXPIRY = (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as unknown as number

export default (context: HTMLDrop.Context): Router => {
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
  router.post('/login', async (req: Request, res: Response) => {
    const { knex, table, formatDate } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
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
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: ACCESS_TOKEN_EXPIRY })
      const decodedAccess = jwt.decode(accessToken) as HTMLDrop.JwtPayload | null
      const expA = decodedAccess?.exp ?? Math.floor(Date.now() / 1000) + 3600
      const expiresAt = new Date(expA * 1000)

      const now = new Date()
      const expiresIn = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)

      // Generate refresh token
      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: REFRESH_TOKEN_EXPIRY })
      const decodedRefresh = jwt.decode(refreshToken) as HTMLDrop.JwtPayload | null
      const exp = decodedRefresh?.exp ?? Math.floor(Date.now() / 1000) + 7 * 24 * 3600
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
  router.post('/logout', async (req: Request, res: Response) => {
    const { knex, table, formatDate } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    try {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) return res.status(400).send('No token provided')

      const payload = jwt.verify(token, process.env.JWT_SECRET!) as unknown as HTMLDrop.JwtPayload

      // Remove expired tokens asynchronously
      knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
      knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

      // Revoke current access token
      await knex(table('revoked_tokens')).insert({
        token: crypto.createHash('sha256').update(token).digest('hex'),
        revoked_at: formatDate(new Date()),
        expires_at: formatDate(new Date((payload.exp ?? Date.now() / 1000) * 1000))
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
  router.post('/refresh', async (req: Request, res: Response) => {
    const { knex, table, formatDate } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    try {
      const { refreshToken } = req.body
      if (!refreshToken) return res.status(400).send('Missing refresh token')

      // Remove expired tokens asynchronously
      knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
      knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

      // Verify refresh token exists in DB
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
      const tokenRecord = await knex(table('refresh_tokens')).where({ token: tokenHash }).first()
      if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
        return res.status(401).send('Invalid or expired refresh token')
      }

      // Verify token signature
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as unknown as HTMLDrop.JwtPayload

      // Revoke old refresh token
      await knex(table('refresh_tokens')).where({ token: tokenHash }).del()

      // Find user
      const user = await knex(table('users')).where({ id: payload.sub }).first()
      if (!user) return res.status(401).send('User not found')

      // Generate payload
      const newPayload = await buildPayload(context, user)

      // Issue new refresh token
      const newRefreshToken = jwt.sign(newPayload, process.env.JWT_REFRESH_SECRET!, { expiresIn: REFRESH_TOKEN_EXPIRY })
      const decodedRefresh = jwt.decode(newRefreshToken) as HTMLDrop.JwtPayload | null
      const exp = decodedRefresh?.exp ?? Math.floor(Date.now() / 1000) + 7 * 24 * 3600
      await knex(table('refresh_tokens')).insert({
        user_id: newPayload.sub,
        token: crypto.createHash('sha256').update(newRefreshToken).digest('hex'),
        expires_at: formatDate(new Date(exp * 1000))
      })

      // Issue new access token
      const accessToken = jwt.sign(newPayload, process.env.JWT_SECRET!, { expiresIn: ACCESS_TOKEN_EXPIRY })
      const decodedAccess = jwt.decode(accessToken) as HTMLDrop.JwtPayload | null
      const expA = decodedAccess?.exp ?? Math.floor(Date.now() / 1000) + 3600
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
  router.post('/register', async (req: Request, res: Response) => {
    const { knex, table, formatDate } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    try {
      const { email, password, locale } = req.body

      // Remove expired tokens asynchronously
      knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
      knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

      // Check if registrations are allowed (prefer options over env)
      const allowRegistrations = context.options?.allow_registrations ?? (process.env.ALLOW_REGISTRATIONS === 'true')
      if (!allowRegistrations) {
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
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: ACCESS_TOKEN_EXPIRY })
      const decodedAccess = jwt.decode(accessToken) as HTMLDrop.JwtPayload | null
      const expA = decodedAccess?.exp ?? Math.floor(Date.now() / 1000) + 3600
      const expiresAt = new Date(expA * 1000)

      const now = new Date()
      const expiresIn = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)

      // Generate refresh token
      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: REFRESH_TOKEN_EXPIRY })
      const decodedRefresh = jwt.decode(refreshToken) as HTMLDrop.JwtPayload | null
      const exp = decodedRefresh?.exp ?? Math.floor(Date.now() / 1000) + 7 * 24 * 3600
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

  /**
   * @openapi
   * /auth/forgot-password:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Request password reset
   *     description: Send a password reset email to the user's email address
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: user@example.com
   *     responses:
   *       200:
   *         description: Password reset email sent (always returns 200 for security)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *       400:
   *         description: Missing email
   *       500:
   *         description: Internal server error
   */
  router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body

      if (!email) {
        return res.status(400).json({ message: 'Email is required' })
      }

      const emailValidation = validateEmail(email)
      if (!emailValidation.valid) {
        return res.status(400).json({ message: emailValidation.message })
      }

      // Create services
      const passwordResetService = new PasswordResetService(context)
      const emailService = new EmailService({ ...context, req, res })

      try {
        // Generate reset token
        const result = await passwordResetService.createResetToken(email) as { user: { id: number; username: string; email: string }; token: string }
        const { user, token } = result

        // Get origin from request headers
        const referer = req.get('referer')
        const origin = req.get('origin') || (referer ? referer.split('/').slice(0, 3).join('/') : undefined)

        // Send password reset email with origin
        await emailService.sendPasswordResetEmail(user, token, 60, origin)
      } catch (error) {
        // Don't reveal if user exists or not
        console.error('Password reset error:', error)
      }

      // Always return success for security (don't reveal if email exists)
      res.status(200).json({
        message: 'If this email exists in our system, a password reset link will be sent.'
      })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Internal server error' })
    }
  })

  /**
   * @openapi
   * /auth/reset-password:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Reset password
   *     description: Reset user password using the token from email
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *               - password
   *             properties:
   *               token:
   *                 type: string
   *                 description: Password reset token from email
   *               password:
   *                 type: string
   *                 format: password
   *                 example: newSecurePassword123
   *     responses:
   *       200:
   *         description: Password reset successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *       400:
   *         description: Missing fields or invalid password
   *       401:
   *         description: Invalid or expired token
   *       500:
   *         description: Internal server error
   */
  router.post('/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body

      if (!token || !password) {
        return res.status(400).json({ message: 'Token and password are required' })
      }

      const passwordValidation = validatePassword(password)
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message })
      }

      const passwordResetService = new PasswordResetService(context)

      try {
        await passwordResetService.resetPassword(token, password)
        res.status(200).json({ message: 'Password has been reset successfully' })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Invalid or expired token'
        return res.status(401).json({ message: errorMessage })
      }
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Internal server error' })
    }
  })

  /**
   * @openapi
   * /auth/validate-reset-token:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Validate password reset token
   *     description: Check if a password reset token is valid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *             properties:
   *               token:
   *                 type: string
   *                 description: Password reset token to validate
   *     responses:
   *       200:
   *         description: Token is valid
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 valid:
   *                   type: boolean
   *       401:
   *         description: Invalid or expired token
   *       500:
   *         description: Internal server error
   */
  router.post('/validate-reset-token', async (req: Request, res: Response) => {
    try {
      const { token } = req.body

      if (!token) {
        return res.status(401).json({ valid: false, message: 'Token is required' })
      }

      const passwordResetService = new PasswordResetService(context)

      try {
        await passwordResetService.validateResetToken(token)
        res.status(200).json({ valid: true })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Invalid or expired token'
        return res.status(401).json({ valid: false, message: errorMessage })
      }
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Internal server error' })
    }
  })

  return router
}
