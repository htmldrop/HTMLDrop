import type { Router, Response } from 'express'
import express from 'express'

interface AuthProvider {
  id: number
  name: string
  slug: string
  client_id: string
  secret_env_key: string
  scope: string | string[]
  auth_url: string
  token_url: string
  user_info_url: string
  redirect_uri: string
  active: boolean | number
  response_params: string | Record<string, unknown>
  created_at?: string
  updated_at?: string
}

const parseJSON = (value: unknown): unknown => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

const parseRow = (row: AuthProvider): AuthProvider => {
  return {
    ...row,
    scope: parseJSON(row.scope) as string[],
    response_params: parseJSON(row.response_params) as Record<string, unknown>,
    active: Boolean(row.active)
  }
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  const checkCapability = async (req: HTMLDrop.ExtendedRequest, routeCaps: string[]): Promise<boolean> => {
    const hasAccess = await req.guard.user({ canOneOf: routeCaps })
    return !!hasAccess
  }

  /**
   * @openapi
   * /auth-providers:
   *   get:
   *     tags:
   *       - Auth Providers
   *     summary: List all OAuth providers
   *     description: Returns all configured OAuth providers
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of OAuth providers
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  router.get('/', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const providers = await knex(table('auth_providers')).select('*').orderBy('name', 'asc')
    res.json(providers.map(parseRow))
  })

  /**
   * @openapi
   * /auth-providers/{idOrSlug}:
   *   get:
   *     tags:
   *       - Auth Providers
   *     summary: Get an OAuth provider by ID or slug
   *     description: Returns a single OAuth provider
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Provider ID or slug
   *     responses:
   *       200:
   *         description: OAuth provider details
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Provider not found
   */
  router.get('/:idOrSlug', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { idOrSlug } = req.params
    const query = knex(table('auth_providers'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    const provider = (await query.first()) as AuthProvider | undefined
    if (!provider) return res.status(404).json({ error: 'Provider not found' })

    res.json(parseRow(provider))
  })

  /**
   * @openapi
   * /auth-providers:
   *   post:
   *     tags:
   *       - Auth Providers
   *     summary: Create a new OAuth provider
   *     description: Creates a new OAuth provider configuration
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - slug
   *               - client_id
   *               - secret_env_key
   *               - auth_url
   *               - token_url
   *               - user_info_url
   *               - redirect_uri
   *             properties:
   *               name:
   *                 type: string
   *               slug:
   *                 type: string
   *               client_id:
   *                 type: string
   *               secret_env_key:
   *                 type: string
   *               scope:
   *                 type: array
   *                 items:
   *                   type: string
   *               auth_url:
   *                 type: string
   *               token_url:
   *                 type: string
   *               user_info_url:
   *                 type: string
   *               redirect_uri:
   *                 type: string
   *               active:
   *                 type: boolean
   *               response_params:
   *                 type: object
   *     responses:
   *       200:
   *         description: Provider created successfully
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  router.post('/', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table, normalizeSlug } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { name, slug, client_id, secret_env_key, scope, auth_url, token_url, user_info_url, redirect_uri, active, response_params } = req.body

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' })
    }

    const normalizedSlug = normalizeSlug(slug)

    const existing = await knex(table('auth_providers')).where('slug', normalizedSlug).first()
    if (existing) {
      return res.status(409).json({ error: 'Provider with this slug already exists' })
    }

    const data = {
      name,
      slug: normalizedSlug,
      client_id: client_id || '',
      secret_env_key: secret_env_key || '',
      scope: JSON.stringify(scope || []),
      auth_url: auth_url || '',
      token_url: token_url || '',
      user_info_url: user_info_url || '',
      redirect_uri: redirect_uri || `${process.env.SITE_URL || 'http://localhost:3000'}/api/v1/oauth/${normalizedSlug}/callback`,
      active: active ? 1 : 0,
      response_params: JSON.stringify(response_params || {}),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }

    const [id] = await knex(table('auth_providers')).insert(data)
    const created = (await knex(table('auth_providers')).where('id', id).first()) as AuthProvider
    res.json(parseRow(created))
  })

  /**
   * @openapi
   * /auth-providers/{idOrSlug}:
   *   patch:
   *     tags:
   *       - Auth Providers
   *     summary: Update an OAuth provider
   *     description: Updates OAuth provider configuration
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Provider ID or slug
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               client_id:
   *                 type: string
   *               secret_env_key:
   *                 type: string
   *               scope:
   *                 type: array
   *                 items:
   *                   type: string
   *               auth_url:
   *                 type: string
   *               token_url:
   *                 type: string
   *               user_info_url:
   *                 type: string
   *               redirect_uri:
   *                 type: string
   *               active:
   *                 type: boolean
   *               response_params:
   *                 type: object
   *     responses:
   *       200:
   *         description: Provider updated successfully
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Provider not found
   */
  router.patch('/:idOrSlug', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { idOrSlug } = req.params
    const query = knex(table('auth_providers'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    const existing = (await query.clone().first()) as AuthProvider | undefined
    if (!existing) return res.status(404).json({ error: 'Provider not found' })

    const updateData: Record<string, unknown> = { updated_at: knex.fn.now() }

    const allowedFields = ['name', 'client_id', 'secret_env_key', 'auth_url', 'token_url', 'user_info_url', 'redirect_uri']
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field]
      }
    }

    if (req.body.scope !== undefined) {
      updateData.scope = JSON.stringify(req.body.scope)
    }
    if (req.body.response_params !== undefined) {
      updateData.response_params = JSON.stringify(req.body.response_params)
    }
    if (req.body.active !== undefined) {
      updateData.active = req.body.active ? 1 : 0
    }

    await query.clone().update(updateData)

    const updated = (await query.first()) as AuthProvider
    res.json(parseRow(updated))
  })

  /**
   * @openapi
   * /auth-providers/{idOrSlug}:
   *   delete:
   *     tags:
   *       - Auth Providers
   *     summary: Delete an OAuth provider
   *     description: Permanently deletes an OAuth provider
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Provider ID or slug
   *     responses:
   *       200:
   *         description: Provider deleted successfully
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Provider not found
   */
  router.delete('/:idOrSlug', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { idOrSlug } = req.params
    const query = knex(table('auth_providers'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    const provider = (await query.clone().first()) as AuthProvider | undefined
    if (!provider) return res.status(404).json({ error: 'Provider not found' })

    await query.delete()
    res.json(parseRow(provider))
  })

  return router
}
