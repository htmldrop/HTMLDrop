import type { Router, Request, Response } from 'express'
import express from 'express'
import jwt from 'jsonwebtoken'
import { hash } from '../../utils/password.ts'
import { buildPayload } from '../../utils/payload.ts'
import crypto from 'crypto'

// OAuth state tokens expire after 10 minutes
const OAUTH_STATE_EXPIRY_MS = 10 * 60 * 1000

interface AuthProvider {
  id: number
  slug: string
  active: boolean
  client_id: string
  secret_env_key: string
  redirect_uri: string
  auth_url: string
  token_url: string
  user_info_url: string
  scope: string[]
  response_params?: Record<string, string>
}

interface UserProvider {
  id: number
  user_id: number
  slug: string
  sub: string
}

interface User {
  id: number
  email: string
  language?: string
}

interface Role {
  id: number
  slug: string
}

interface TokenData {
  access_token?: string
}

interface UserData {
  sub?: string
  id?: string
  email: string
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /oauth/providers:
   *   get:
   *     tags:
   *       - OAuth
   *     summary: List active OAuth providers
   *     description: Returns a list of active OAuth providers for display on the login page
   *     responses:
   *       200:
   *         description: List of active providers
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   name:
   *                     type: string
   *                   slug:
   *                     type: string
   */
  router.get('/providers', async (req: Request, res: Response) => {
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }

    const providers = await knex(table('auth_providers'))
      .where({ active: true })
      .select('name', 'slug')
      .orderBy('name', 'asc')

    res.json(providers)
  })

  /**
   * @openapi
   * /oauth/{provider}/login:
   *   get:
   *     tags:
   *       - OAuth
   *     summary: Initiate OAuth login flow
   *     description: Redirect user to OAuth provider's authorization page
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [google, github, microsoft]
   *         description: OAuth provider slug
   *         example: google
   *     responses:
   *       302:
   *         description: Redirect to OAuth provider
   *       400:
   *         description: Provider not supported or inactive
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Provider not supported or inactive
   */
  router.get('/:provider/login', async (req: Request, res: Response) => {
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const { provider } = req.params
    const config = await knex(table('auth_providers'))
      .where({ slug: provider, active: true })
      .first() as AuthProvider | undefined
    if (!config) return res.status(400).send('Provider not supported or inactive')

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex')
    const stateHash = crypto.createHash('sha256').update(state).digest('hex')
    const expiresAt = new Date(Date.now() + OAUTH_STATE_EXPIRY_MS)

    // Store hashed state in database
    await knex(table('oauth_states')).insert({
      state_hash: stateHash,
      provider: provider,
      expires_at: expiresAt
    })

    // Build query string from DB fields
    const query = new URLSearchParams({
      client_id: process.env[config.client_id] || '',
      redirect_uri: config.redirect_uri,
      response_type: 'code',
      scope: (config.scope || []).join(' '),
      state,
      ...config.response_params
    })

    res.redirect(`${config.auth_url}?${query.toString()}`)
  })

  /**
   * @openapi
   * /oauth/{provider}/callback:
   *   get:
   *     tags:
   *       - OAuth
   *     summary: OAuth callback handler
   *     description: Handle OAuth provider callback, exchange code for tokens, create or link user account, and issue JWT tokens
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *         description: OAuth provider slug
   *         example: google
   *       - in: query
   *         name: code
   *         required: true
   *         schema:
   *           type: string
   *         description: Authorization code from OAuth provider
   *     responses:
   *       200:
   *         description: Authentication successful
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
   *       400:
   *         description: Missing code or provider not supported
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Missing code
   *       401:
   *         description: Failed to get access token from provider
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Failed to get access token
   *   post:
   *     tags:
   *       - OAuth
   *     summary: OAuth callback handler (POST)
   *     description: Alternative POST endpoint for OAuth provider callback
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *         description: OAuth provider slug
   *     responses:
   *       200:
   *         description: Authentication successful
   *       400:
   *         description: Invalid request
   */
  router.all('/:provider/callback', async (req: Request, res: Response) => {
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const { provider } = req.params
    const { code, state } = req.query as { code?: string; state?: string }
    if (!code) return res.status(400).send('Missing code')
    if (!state) return res.status(400).send('Missing state parameter')

    // Validate CSRF state token
    const stateHash = crypto.createHash('sha256').update(state).digest('hex')
    const stateRecord = await knex(table('oauth_states'))
      .where({ state_hash: stateHash, provider })
      .where('expires_at', '>', new Date())
      .first()

    if (!stateRecord) {
      return res.status(400).send('Invalid or expired state parameter')
    }

    // Delete used state token (one-time use)
    await knex(table('oauth_states')).where({ state_hash: stateHash }).del()

    // Clean up expired state tokens asynchronously
    knex(table('oauth_states')).where('expires_at', '<', new Date()).del()

    const config = await knex(table('auth_providers'))
      .where({ slug: provider, active: true })
      .first() as AuthProvider | undefined
    if (!config) return res.status(400).send('Provider not supported or inactive')

    // Exchange code for access token
    const tokenRes = await fetch(config.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env[config.client_id] || '',
        client_secret: process.env[config.secret_env_key] || '',
        redirect_uri: config.redirect_uri,
        code,
        grant_type: 'authorization_code'
      })
    })

    const tokenData = await tokenRes.json() as TokenData
    const accessToken = tokenData.access_token
    if (!accessToken) return res.status(401).send('Failed to get access token')

    // Fetch user info
    const userInfoRes = await fetch(config.user_info_url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const userData = await userInfoRes.json() as UserData

    // Resolve user by provider sub first
    const userProvider = await knex(table('user_providers'))
      .where({ slug: provider, sub: userData.sub || userData.id })
      .first() as UserProvider | undefined

    let user: User | undefined
    if (userProvider) {
      // Get the associated user
      user = await knex(table('users')).where({ id: userProvider.user_id }).first() as User | undefined
    } else {
      // No provider row found, try to find by email
      user = await knex(table('users')).where({ email: userData.email }).first() as User | undefined

      // If user doesn't exist, create one
      if (!user) {
        // Check if registrations are allowed (prefer options over env)
        const allowRegistrations = context.options?.allow_registrations ?? (process.env.ALLOW_REGISTRATIONS === 'true')
        if (!allowRegistrations) {
          return res.status(400).send('Automatic registration of new users is disabled')
        }
        const [userId] = await knex(table('users')).insert({
          email: userData.email,
          password: await hash(crypto.randomBytes(16).toString('hex')),
          language: 'en'
        })
        user = { id: userId, email: userData.email, language: 'en' }
        try {
          const defaultRoles = (process.env.DEFAULT_ROLES || '').split(',').map((r) => r.toLowerCase().trim())
          for (const slug of defaultRoles) {
            const role = await knex(table('roles')).where({ slug }).first() as Role | undefined
            if (role) await knex(table('user_roles')).insert({ user_id: userId, role_id: role.id })
          }
        } catch (e) {
          console.error(e)
        }
      }

      // Create the user_provider row
      await knex(table('user_providers')).insert({
        user_id: user.id,
        slug: provider,
        sub: userData.sub || userData.id
      })
    }

    // Issue JWT + refresh token
    const payload = await buildPayload(context, user!)
    const accessExpiry = (process.env.JWT_EXPIRES_IN || '1h') as unknown as number
    const refreshExpiry = (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as unknown as number
    const appAccessToken = jwt.sign(payload, process.env.JWT_SECRET || '', { expiresIn: accessExpiry })
    const appRefreshToken = jwt.sign({ sub: user!.id }, process.env.JWT_REFRESH_SECRET || '', {
      expiresIn: refreshExpiry
    })

    await knex(table('refresh_tokens')).insert({
      user_id: user!.id,
      token: crypto.createHash('sha256').update(appRefreshToken).digest('hex'),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })

    // Remove expired tokens asynchronously
    knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
    knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

    res.status(200).json({ accessToken: appAccessToken, refreshToken: appRefreshToken })
  })

  return router
}
