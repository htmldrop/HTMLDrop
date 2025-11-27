import express from 'express'
import jwt from 'jsonwebtoken'
import { hash } from '../../utils/password.mjs'
import { buildPayload } from '../../utils/payload.mjs'
import crypto from 'crypto'

export default (context) => {
  const router = express.Router({ mergeParams: true })

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
  router.get('/:provider/login', async (req, res) => {
    const { knex, table } = context
    const { provider } = req.params
    const config = await knex(table('auth_providers')).where({ slug: provider, active: true }).first()
    if (!config) return res.status(400).send('Provider not supported or inactive')

    // Build query string from DB fields
    const query = new URLSearchParams({
      client_id: process.env[config.client_id],
      redirect_uri: config.redirect_uri,
      response_type: 'code',
      scope: (config.scope || []).join(' '),
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
  router.all('/:provider/callback', async (req, res) => {
    const { knex, table } = context
    const { provider } = req.params
    const { code } = req.query
    if (!code) return res.status(400).send('Missing code')

    const config = await knex(table('auth_providers')).where({ slug: provider, active: true }).first()
    if (!config) return res.status(400).send('Provider not supported or inactive')

    // Exchange code for access token
    const tokenRes = await fetch(config.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env[config.client_id],
        client_secret: process.env[config.secret_env_key],
        redirect_uri: config.redirect_uri,
        code,
        grant_type: 'authorization_code'
      })
    })

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token
    if (!accessToken) return res.status(401).send('Failed to get access token')

    // Fetch user info
    const userInfoRes = await fetch(config.user_info_url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const userData = await userInfoRes.json()

    // Resolve user by provider sub first
    const userProvider = await knex(table('user_providers'))
      .where({ slug: provider, sub: userData.sub || userData.id })
      .first()

    let user
    if (userProvider) {
      // Get the associated user
      user = await knex(table('users')).where({ id: userProvider.user_id }).first()
    } else {
      // No provider row found, try to find by email
      user = await knex(table('users')).where({ email: userData.email }).first()

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
          const defaultRoles = process.env.DEFAULT_ROLES.split(',').map((r) => r.toLowerCase().trim())
          for (const slug of defaultRoles) {
            const role = await knex(table('roles')).where({ slug }).first()
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
    const payload = await buildPayload(context, user)
    const appAccessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
    const appRefreshToken = jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
    })

    await knex(table('refresh_tokens')).insert({
      user_id: user.id,
      token: appRefreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })

    // Remove expired tokens asynchronously
    knex(table('revoked_tokens')).where('expires_at', '<', new Date()).del()
    knex(table('refresh_tokens')).where('expires_at', '<', new Date()).del()

    res.status(200).json({ accessToken: appAccessToken, refreshToken: appRefreshToken })
  })

  return router
}
