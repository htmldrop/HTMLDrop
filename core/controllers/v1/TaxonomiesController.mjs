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
   * /posts/{postType}/taxonomies:
   *   get:
   *     tags:
   *       - Taxonomies
   *     summary: List all taxonomies for a post type
   *     description: Returns all registered taxonomies for a specific post type
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *     responses:
   *       200:
   *         description: List of taxonomies
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Taxonomy'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  router.get('/', async (req, res) => {
    const { postType } = req.params
    const { getAllTaxonomies } = req.hooks
    if (!(await checkCapability(req, ['read', 'read_taxonomy']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const taxonomies = await getAllTaxonomies(postType)
    res.json(taxonomies)
  })

  /**
   * @openapi
   * /posts/{postType}/taxonomies:
   *   post:
   *     tags:
   *       - Taxonomies
   *     summary: Create a new taxonomy
   *     description: Creates a new taxonomy for a post type
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               slug:
   *                 type: string
   *                 example: categories
   *               name_plural:
   *                 type: string
   *                 example: Categories
   *               name_singular:
   *                 type: string
   *                 example: Category
   *               description:
   *                 type: string
   *               hierarchical:
   *                 type: boolean
   *                 default: false
   *     responses:
   *       200:
   *         description: Taxonomy created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Taxonomy'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden or missing required fields
   *       404:
   *         description: Post type not found
   */
  router.post('/', async (req, res) => {
    const { normalizeSlug, knex, table } = context
    if (!(await checkCapability(req, ['create', 'create_taxonomies']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { postType } = req.params
    const { getPostType } = req.hooks

    const type = await getPostType(postType)

    if (!type) {
      return res.status(404).json({ error: 'Post type not found' })
    }

    const data = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [k, Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v])
    )

    if (!data.slug && !data.name_plural) return res.status(403).json({ error: 'name_plural or slug is required' })

    data.slug = normalizeSlug(data.slug || data.name_plural)
    data.post_type_slug = normalizeSlug(postType)

    const [id] = await knex(table('taxonomies')).insert(data)
    const created = await knex(table('taxonomies')).where('id', id).first()
    res.json(parseRow(created))
  })

  /**
   * @openapi
   * /posts/{postType}/taxonomies/{idOrSlug}:
   *   get:
   *     tags:
   *       - Taxonomies
   *     summary: Get a taxonomy by ID or slug
   *     description: Returns a single taxonomy
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy ID or slug
   *     responses:
   *       200:
   *         description: Taxonomy details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Taxonomy'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Taxonomy not found
   */
  router.get('/:idOrSlug', async (req, res) => {
    const { knex, table } = context
    const { getTaxonomy } = req.hooks
    if (!(await checkCapability(req, ['read', 'read_taxonomy']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { postType, idOrSlug } = req.params
    const query = knex(table('taxonomies'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    query.where('post_type_slug', postType)

    let entity = await query.first()
    if (!entity) entity = await getTaxonomy(postType, idOrSlug)
    if (!entity) return res.status(404).json({ error: 'Taxonomy not found' })

    res.json(parseRow(entity))
  })

  /**
   * @openapi
   * /posts/{postType}/taxonomies/{idOrSlug}:
   *   patch:
   *     tags:
   *       - Taxonomies
   *     summary: Update a taxonomy
   *     description: Updates taxonomy configuration
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy ID or slug
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
   *               hierarchical:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Taxonomy updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Taxonomy'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Taxonomy not found
   */
  router.patch('/:idOrSlug', async (req, res) => {
    const { normalizeSlug, knex, table } = context
    if (!(await checkCapability(req, ['edit', 'edit_taxonomies']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { postType, idOrSlug } = req.params
    const data = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [k, Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v])
    )

    const query = knex(table('taxonomies'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    query.where('post_type_slug', postType)

    if (typeof data.slug !== 'undefined') data.slug = normalizeSlug(data.slug)
    if (typeof data.post_type_slug !== 'undefined') data.post_type_slug = normalizeSlug(postType)

    const entity = await query.clone().update(data)
    const updated = await knex(table('taxonomies')).where('id', entity.id).first()
    if (!updated) return res.status(404).json({ error: 'Taxonomy not found' })

    res.json(parseRow(updated))
  })

  /**
   * @openapi
   * /posts/{postType}/taxonomies/{idOrSlug}:
   *   delete:
   *     tags:
   *       - Taxonomies
   *     summary: Delete a taxonomy
   *     description: Permanently deletes a taxonomy
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy ID or slug
   *     responses:
   *       200:
   *         description: Taxonomy deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Taxonomy'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Taxonomy not found
   */
  router.delete('/:idOrSlug', async (req, res) => {
    const { knex, table } = context
    if (!(await checkCapability(req, ['delete', 'delete_taxonomies']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { postType, idOrSlug } = req.params
    const query = knex(table('taxonomies'))
    if (/^\d+$/.test(idOrSlug)) query.where('id', idOrSlug)
    else query.where('slug', idOrSlug)

    query.where('post_type_slug', postType)

    const entity = await query.clone().first()
    if (!entity) return res.status(404).json({ error: 'Taxonomy not found' })

    await query.delete()
    res.json(parseRow(entity))
  })

  return router
}
