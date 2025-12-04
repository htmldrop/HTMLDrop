import type { Router, Response } from 'express'
import express from 'express'

interface Capability {
  id: number
  name: string
  slug: string
  description?: string
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /capabilities:
   *   get:
   *     tags:
   *       - Capabilities
   *     summary: List all capabilities
   *     description: Returns all available capabilities that can be assigned to roles
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of capabilities
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Capability'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   */
  router.get('/', async (req, res: Response) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles', 'read'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const capabilities = await knex(table('capabilities')).select('*').orderBy('name') as Capability[]

    res.json(capabilities)
  })

  /**
   * @openapi
   * /capabilities/{slug}:
   *   get:
   *     tags:
   *       - Capabilities
   *     summary: Get a capability by slug
   *     description: Returns a single capability by its slug
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Capability slug
   *         example: manage_posts
   *     responses:
   *       200:
   *         description: Capability details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Capability'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: Capability not found
   */
  router.get('/:slug', async (req, res: Response) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const { slug } = req.params

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles', 'read'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const capability = await knex(table('capabilities')).where('slug', slug).first() as Capability | undefined
    if (!capability) return res.status(404).json({ error: 'Capability not found' })

    res.json(capability)
  })

  return router
}
