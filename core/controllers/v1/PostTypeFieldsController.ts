import type { Router, Request, Response } from 'express'
import express from 'express'
import type {} from '../../types/index.js'

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

const parseRow = <T extends object>(row: T): T => {
  const parsed = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, parseJSON(v)])) as T
  // Convert known boolean fields from integers to booleans
  if ('required' in parsed) (parsed as Record<string, unknown>).required = Boolean(parsed.required)
  if ('revisions' in parsed) (parsed as Record<string, unknown>).revisions = Boolean(parsed.revisions)
  return parsed
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  /**
   * Helper: check route capability
   */
  const checkCapability = async (
    req: HTMLDrop.ExtendedRequest,
    postTypeSlug: string,
    routeCaps: string[]
  ): Promise<HTMLDrop.PostType | null> => {
    const { getPostType } = req.hooks
    const type = await getPostType(postTypeSlug)

    if (!type?.resolvedCapabilities?.length) return null

    const resolvedCapabilities = [
      ...type.resolvedCapabilities,
      'edit_post_type',
      'read_post_type',
      'edit_post_types',
      'delete_post_types',
      'create_post_types'
    ]

    const validCaps = resolvedCapabilities.filter((c) => routeCaps.includes(c))
    if (!validCaps.length) return null

    const hasAccess = await req.guard.user({ canOneOf: validCaps })
    return hasAccess ? type : null
  }

  /**
   * @openapi
   * /post-types/{postType}/fields:
   *   get:
   *     tags:
   *       - Post Type Fields
   *     summary: Get all fields for a post type
   *     description: Retrieve all custom fields configured for a specific post type
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *         example: post
   *     responses:
   *       200:
   *         description: Post type fields retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   id:
   *                     type: integer
   *                   slug:
   *                     type: string
   *                   name:
   *                     type: string
   *                   type:
   *                     type: string
   *                   post_type_slug:
   *                     type: string
   *                   options:
   *                     type: object
   *       403:
   *         description: Permission denied or post type not accessible
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/', async (req: Request, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { getFields } = guardReq.hooks
    const { postType } = req.params
    const type = await checkCapability(guardReq, postType, ['read', 'read_post_type', 'read_post'])
    if (!type) return res.status(403).json({ error: 'Permission denied or post type not accessible' })

    const fields = await getFields(postType)
    res.json(fields)
  })

  /**
   * @openapi
   * /post-types/{postType}/fields:
   *   post:
   *     tags:
   *       - Post Type Fields
   *     summary: Create a new post type field
   *     description: Add a custom field to a post type
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *         example: post
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *             properties:
   *               name:
   *                 type: string
   *                 description: Field name
   *                 example: Featured Image
   *               slug:
   *                 type: string
   *                 description: Field slug (auto-generated from name if not provided)
   *                 example: featured_image
   *               type:
   *                 type: string
   *                 description: Field control type
   *                 example: image
   *               options:
   *                 type: object
   *                 description: Field-specific options
   *               post_type_id:
   *                 type: integer
   *                 description: Post type ID (optional, validated against route)
   *     responses:
   *       200:
   *         description: Field created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: integer
   *                 slug:
   *                   type: string
   *                 name:
   *                   type: string
   *                 type:
   *                   type: string
   *       403:
   *         description: Permission denied or validation failed
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/', async (req: Request, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { normalizeSlug, knex, table } = context
    const { postType } = req.params
    const type = await checkCapability(guardReq, postType, ['edit', 'edit_post_types'])
    if (!type) return res.status(403).json({ error: 'Permission denied or post type not accessible' })

    const data: Record<string, unknown> = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [
        k,
        typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v
      ])
    )

    if (data.post_type_id && Number(data.post_type_id) !== Number(type.id)) {
      return res.status(403).json({ error: 'Post type ID does not match registered post type' })
    }

    if (!data.slug && !data.name) return res.status(403).json({ error: 'name or slug is required' })
    if (!postType) return res.status(403).json({ error: 'post_type_slug slug is required' })

    data.slug = normalizeSlug((data.slug as string) || (data.name as string))
    data.post_type_slug = normalizeSlug(postType)

    // Only set post_type_id if the post type has an ID (database-registered types)
    if (type.id) {
      data.post_type_id = type.id
    }

    const [id] = await knex(table('post_type_fields')).insert(data)
    const created = await knex(table('post_type_fields')).where('id', id).first() as HTMLDrop.Field
    res.json(parseRow(created))
  })

  /**
   * @openapi
   * /post-types/{postType}/fields/{id}:
   *   get:
   *     tags:
   *       - Post Type Fields
   *     summary: Get a single post type field
   *     description: Retrieve details of a specific custom field
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *         example: post
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Field ID
   *         example: 1
   *     responses:
   *       200:
   *         description: Field retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: integer
   *                 slug:
   *                   type: string
   *                 name:
   *                   type: string
   *                 type:
   *                   type: string
   *                 post_type_slug:
   *                   type: string
   *                 options:
   *                   type: object
   *       403:
   *         description: Permission denied
   *       404:
   *         description: Field not found
   */
  router.get('/:id', async (req: Request, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    const { postType, id } = req.params
    const type = await checkCapability(guardReq, postType, ['read', 'read_post_type', 'read_post'])
    if (!type) return res.status(403).json({ error: 'Permission denied or post type not accessible' })

    const field = await knex(table('post_type_fields')).where('id', id).first() as HTMLDrop.Field | undefined
    if (!field) return res.status(404).json({ error: 'Post type field not found' })

    res.json(parseRow(field))
  })

  /**
   * @openapi
   * /post-types/{postType}/fields/{id}:
   *   patch:
   *     tags:
   *       - Post Type Fields
   *     summary: Update a post type field
   *     description: Update an existing custom field's properties
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *         example: post
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Field ID
   *         example: 1
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               slug:
   *                 type: string
   *               type:
   *                 type: string
   *               options:
   *                 type: object
   *     responses:
   *       200:
   *         description: Field updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       403:
   *         description: Permission denied
   *       404:
   *         description: Field not found
   */
  router.patch('/:id', async (req: Request, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { normalizeSlug, knex, table } = context
    const { postType, id } = req.params
    const type = await checkCapability(guardReq, postType, ['edit', 'edit_post_types'])
    if (!type) return res.status(403).json({ error: 'Permission denied or post type not accessible' })

    const data: Record<string, unknown> = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [
        k,
        typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v
      ])
    )

    if (data.post_type_id && Number(data.post_type_id) !== Number(type.id)) {
      return res.status(403).json({ error: 'Post type ID does not match registered post type' })
    }
    if (data.post_type_slug && data.post_type_slug !== postType) {
      return res.status(403).json({ error: 'Post type slug mismatch' })
    }

    if (typeof data.slug !== 'undefined') data.slug = normalizeSlug(data.slug as string)

    await knex(table('post_type_fields')).where('id', id).update(data)
    const updated = await knex(table('post_type_fields')).where('id', id).first() as HTMLDrop.Field | undefined
    if (!updated) return res.status(404).json({ error: 'Post type field not found' })

    res.json(parseRow(updated))
  })

  /**
   * @openapi
   * /post-types/{postType}/fields/{id}:
   *   delete:
   *     tags:
   *       - Post Type Fields
   *     summary: Delete a post type field
   *     description: Remove a custom field from a post type
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *         example: post
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Field ID
   *         example: 1
   *     responses:
   *       200:
   *         description: Field deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Deleted field data
   *       403:
   *         description: Permission denied
   *       404:
   *         description: Field not found
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    const { postType, id } = req.params
    const type = await checkCapability(guardReq, postType, ['edit', 'edit_post_types'])
    if (!type) return res.status(403).json({ error: 'Permission denied or post type not accessible' })

    const field = await knex(table('post_type_fields')).where('id', id).first() as HTMLDrop.Field | undefined
    if (!field) return res.status(404).json({ error: 'Post type field not found' })

    await knex(table('post_type_fields')).where('id', id).delete()
    res.json(parseRow(field))
  })

  return router
}
