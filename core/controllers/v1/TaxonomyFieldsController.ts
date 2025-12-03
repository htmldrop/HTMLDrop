import type { Router, Request, Response } from 'express'
import express from 'express'

interface Taxonomy {
  id: number
  slug: string
  resolvedCapabilities?: string[]
  [key: string]: unknown
}

interface TaxonomyField {
  id: number
  slug: string
  name: string
  type?: string
  taxonomy_slug: string
  post_type_slug: string
  options?: unknown
  [key: string]: unknown
}

interface RequestWithGuardAndHooks extends Request {
  user?: { id: number }
  guard: {
    user: (options: { canOneOf?: string[] }) => Promise<boolean>
  }
  hooks: {
    getTaxonomy: (postType: string, taxonomySlug: string) => Promise<Taxonomy | null>
    getTaxonomyFields: (postType: string, taxonomy: string) => Promise<TaxonomyField[]>
  }
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

const parseRow = <T extends Record<string, unknown>>(row: T): T =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, parseJSON(v)])) as T

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  /**
   * Helper: check route capability
   */
  const checkCapability = async (
    req: RequestWithGuardAndHooks,
    postType: string,
    taxonomySlug: string,
    routeCaps: string[]
  ): Promise<Taxonomy | null> => {
    const { getTaxonomy } = req.hooks
    const taxonomy = await getTaxonomy(postType, taxonomySlug)

    if (!taxonomy?.resolvedCapabilities?.length) return null

    const validCaps = taxonomy.resolvedCapabilities.filter((c) => routeCaps.includes(c))
    if (!validCaps.length) return null

    const hasAccess = await req.guard.user({ canOneOf: validCaps })
    return hasAccess ? taxonomy : null
  }

  /**
   * @openapi
   * /post-types/{postType}/taxonomies/{taxonomy}/fields:
   *   get:
   *     tags:
   *       - Taxonomy Fields
   *     summary: Get all fields for a taxonomy
   *     description: Retrieve all custom fields configured for a specific taxonomy
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *         example: category
   *     responses:
   *       200:
   *         description: Taxonomy fields retrieved successfully
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
   *                   taxonomy_slug:
   *                     type: string
   *                   post_type_slug:
   *                     type: string
   *                   options:
   *                     type: object
   *       403:
   *         description: Permission denied or taxonomy not accessible
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/', async (req: Request, res: Response) => {
    const guardReq = req as RequestWithGuardAndHooks
    const { getTaxonomyFields } = guardReq.hooks
    const { postType, taxonomy } = req.params
    const canRead = await checkCapability(guardReq, postType, taxonomy, ['read', 'read_taxonomy', 'read_term'])
    if (!canRead) return res.status(403).json({ error: 'Permission denied or taxonomy not accessible' })

    const fields = await getTaxonomyFields(postType, taxonomy)
    res.json(fields)
  })

  /**
   * @openapi
   * /post-types/{postType}/taxonomies/{taxonomy}/fields:
   *   post:
   *     tags:
   *       - Taxonomy Fields
   *     summary: Create a new taxonomy field
   *     description: Add a custom field to a taxonomy
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *         example: category
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
   *                 example: Icon
   *               slug:
   *                 type: string
   *                 description: Field slug (auto-generated from name if not provided)
   *                 example: icon
   *               type:
   *                 type: string
   *                 description: Field control type
   *                 example: image
   *               options:
   *                 type: object
   *                 description: Field-specific options
   *               taxonomy_id:
   *                 type: integer
   *                 description: Taxonomy ID (optional, validated against route)
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
    const guardReq = req as RequestWithGuardAndHooks
    const { normalizeSlug, knex, table } = context
    const { postType, taxonomy } = req.params
    const canCreate = await checkCapability(guardReq, postType, taxonomy, ['edit', 'edit_taxonomies'])
    if (!canCreate) return res.status(403).json({ error: 'Permission denied or taxonomy not accessible' })

    const data: Record<string, unknown> = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [k, Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v])
    )

    // @todo - check if canCreate.id is correct & also in post fields controller
    if (data.taxonomy_id && Number(data.taxonomy_id) !== Number(canCreate.id)) {
      return res.status(403).json({ error: 'Taxonomy ID does not match registered taxonomy' })
    }

    if (!data.slug && !data.name) return res.status(403).json({ error: 'name or slug is required' })
    if (!taxonomy) return res.status(403).json({ error: 'taxonomy slug is required' })

    data.slug = normalizeSlug((data.slug as string) || (data.name as string))
    data.taxonomy_slug = normalizeSlug(taxonomy)
    data.post_type_slug = normalizeSlug(postType)

    const [id] = await knex(table('taxonomy_fields')).insert(data)
    const created = await knex(table('taxonomy_fields')).where('id', id).first() as TaxonomyField
    res.json(parseRow(created))
  })

  /**
   * @openapi
   * /post-types/{postType}/taxonomies/{taxonomy}/fields/{id}:
   *   get:
   *     tags:
   *       - Taxonomy Fields
   *     summary: Get a single taxonomy field
   *     description: Retrieve details of a specific taxonomy custom field
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *         example: category
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
   *                 taxonomy_slug:
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
    const guardReq = req as RequestWithGuardAndHooks
    const { knex, table } = context
    const { postType, taxonomy, id } = req.params
    const canRead = await checkCapability(guardReq, postType, taxonomy, ['read', 'read_taxonomy', 'read_term'])
    if (!canRead) return res.status(403).json({ error: 'Permission denied or taxonomy not accessible' })

    const field = await knex(table('taxonomy_fields')).where('id', id).first() as TaxonomyField | undefined
    if (!field) return res.status(404).json({ error: 'Taxonomy field not found' })

    res.json(parseRow(field))
  })

  /**
   * @openapi
   * /post-types/{postType}/taxonomies/{taxonomy}/fields/{id}:
   *   patch:
   *     tags:
   *       - Taxonomy Fields
   *     summary: Update a taxonomy field
   *     description: Update an existing taxonomy custom field's properties
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *         example: category
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
    const guardReq = req as RequestWithGuardAndHooks
    const { normalizeSlug, knex, table } = context
    const { postType, taxonomy, id } = req.params
    const canEdit = await checkCapability(guardReq, postType, taxonomy, ['edit', 'edit_taxonomies'])
    if (!canEdit) return res.status(403).json({ error: 'Permission denied or taxonomy not accessible' })

    const data: Record<string, unknown> = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [k, Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v])
    )

    // @todo - Check canEdit id also in post type fields
    if (data.taxonomy_id && Number(data.taxonomy_id) !== Number(canEdit.id)) {
      return res.status(403).json({ error: 'Taxonomy ID does not match registered taxonomy' })
    }
    if (data.taxonomy_slug && data.taxonomy_slug !== taxonomy) {
      return res.status(403).json({ error: 'Taxonomy slug mismatch' })
    }

    if (typeof data.slug !== 'undefined') data.slug = normalizeSlug(data.slug as string)

    await knex(table('taxonomy_fields')).where('id', id).update(data)
    const updated = await knex(table('taxonomy_fields')).where('id', id).first() as TaxonomyField | undefined
    if (!updated) return res.status(404).json({ error: 'Taxonomy field not found' })

    res.json(parseRow(updated))
  })

  /**
   * @openapi
   * /post-types/{postType}/taxonomies/{taxonomy}/fields/{id}:
   *   delete:
   *     tags:
   *       - Taxonomy Fields
   *     summary: Delete a taxonomy field
   *     description: Remove a custom field from a taxonomy
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *         example: category
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
    const guardReq = req as RequestWithGuardAndHooks
    const { knex, table } = context
    const { postType, taxonomy, id } = req.params
    const canDelete = await checkCapability(guardReq, postType, taxonomy, ['edit', 'edit_taxonomies'])
    if (!canDelete) return res.status(403).json({ error: 'Permission denied or taxonomy not accessible' })

    const field = await knex(table('taxonomy_fields')).where('id', id).first() as TaxonomyField | undefined
    if (!field) return res.status(404).json({ error: 'Taxonomy field not found' })

    await knex(table('taxonomy_fields')).where('id', id).delete()
    res.json(parseRow(field))
  })

  return router
}
