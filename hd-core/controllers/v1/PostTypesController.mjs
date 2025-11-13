import express from 'express'

export default (context) => {
  const router = express.Router({ mergeParams: true })

  const parseJSON = (value) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }
    return value
  }

  const parseRow = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, parseJSON(v)]))

  // ------------------------
  // Helper: check route capability
  // ------------------------
  const checkCapability = async (req, routeCaps) => {
    const hasAccess = await req.guard.user({ canOneOf: routeCaps })
    return hasAccess
  }

  /**
   * @openapi
   * /post-types:
   *   get:
   *     tags:
   *       - Post Types
   *     summary: List all post types
   *     description: Returns all registered post types (both database and code-registered)
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of post types
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/PostType'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  router.get('/', async (req, res) => {
    const { getAllPostTypes } = req.hooks
    if (!(await checkCapability(req, ['read', 'read_post_type']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const postTypes = await getAllPostTypes()
    res.json(postTypes)
  })

  /**
   * @openapi
   * /post-types:
   *   post:
   *     tags:
   *       - Post Types
   *     summary: Create a new post type
   *     description: Creates a new custom post type
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               slug:
   *                 type: string
   *                 example: products
   *               name_plural:
   *                 type: string
   *                 example: Products
   *               name_singular:
   *                 type: string
   *                 example: Product
   *               description:
   *                 type: string
   *               icon:
   *                 type: string
   *                 example: shopping-bag
   *               capabilities:
   *                 type: object
   *     responses:
   *       200:
   *         description: Post type created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/PostType'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden or missing required fields
   */
  router.post('/', async (req, res) => {
    const { normalizeSlug, knex, table } = context
    if (!(await checkCapability(req, ['create', 'create_post_types']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const data = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [k, Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v])
    )

    if (!data.slug && !data.name_plural) return res.status(403).json({ error: 'name_plural or slug is required' })

    data.slug = normalizeSlug(data.slug || data.name_plural)

    const [id] = await knex(table('post_types')).insert(data)
    const created = await knex(table('post_types')).where('id', id).first()
    res.json(parseRow(created))
  })

  /**
   * @openapi
   * /post-types/{idOrSlug}:
   *   get:
   *     tags:
   *       - Post Types
   *     summary: Get a post type by ID or slug
   *     description: Returns a single post type
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type ID or slug
   *     responses:
   *       200:
   *         description: Post type details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/PostType'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Post type not found
   */
  router.get('/:idOrSlug', async (req, res) => {
    const { knex, table } = context
    const { getPostType } = req.hooks
    if (!(await checkCapability(req, ['read', 'read_post_type']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { idOrSlug } = req.params
    const query = knex(table('post_types'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    let entity = await query.first()
    if (!entity) entity = await getPostType(idOrSlug)
    if (!entity) return res.status(404).json({ error: 'Post type not found' })

    res.json(parseRow(entity))
  })

  /**
   * @openapi
   * /post-types/{idOrSlug}:
   *   patch:
   *     tags:
   *       - Post Types
   *     summary: Update a post type
   *     description: Updates post type configuration
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type ID or slug
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               slug:
   *                 type: string
   *               name_plural:
   *                 type: string
   *               name_singular:
   *                 type: string
   *               description:
   *                 type: string
   *               icon:
   *                 type: string
   *               capabilities:
   *                 type: object
   *     responses:
   *       200:
   *         description: Post type updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/PostType'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Post type not found
   */
  router.patch('/:idOrSlug', async (req, res) => {
    const { normalizeSlug, knex, table } = context
    if (!(await checkCapability(req, ['edit', 'edit_post_types']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { idOrSlug } = req.params
    const data = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [k, Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v])
    )

    const query = knex(table('post_types'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    if (typeof data.slug !== 'undefined') data.slug = normalizeSlug(data.slug)

    await query.clone().update(data)
    const updated = await query.first()
    if (!updated) return res.status(404).json({ error: 'Post type not found' })

    res.json(parseRow(updated))
  })

  /**
   * @openapi
   * /post-types/{idOrSlug}:
   *   delete:
   *     tags:
   *       - Post Types
   *     summary: Delete a post type
   *     description: Permanently deletes a post type
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type ID or slug
   *     responses:
   *       200:
   *         description: Post type deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/PostType'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Post type not found
   */
  router.delete('/:idOrSlug', async (req, res) => {
    const { knex, table } = context
    if (!(await checkCapability(req, ['delete', 'delete_post_types']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { idOrSlug } = req.params
    const query = knex(table('post_types'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    const entity = await query.clone().first()
    if (!entity) return res.status(404).json({ error: 'Post type not found' })

    await query.delete()
    res.json(parseRow(entity))
  })

  return router
}
