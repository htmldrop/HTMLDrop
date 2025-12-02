import express from 'express'

export default (context) => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /capabilities:
   *   get:
   *     tags:
   *       - Capabilities
   *     summary: List all capabilities
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of all capabilities
   */
  router.get('/', async (req, res) => {
    const { knex, table } = context

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles', 'read'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const capabilities = await knex(table('capabilities')).select('*').orderBy('name')

    res.json(capabilities)
  })

  /**
   * @openapi
   * /capabilities/{slug}:
   *   get:
   *     tags:
   *       - Capabilities
   *     summary: Get a capability by slug
   *     security:
   *       - bearerAuth: []
   */
  router.get('/:slug', async (req, res) => {
    const { knex, table } = context
    const { slug } = req.params

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles', 'read'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const capability = await knex(table('capabilities')).where('slug', slug).first()
    if (!capability) return res.status(404).json({ error: 'Capability not found' })

    res.json(capability)
  })

  return router
}
