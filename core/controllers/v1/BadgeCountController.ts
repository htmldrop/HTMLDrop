import type { Router, Response } from 'express'
import express from 'express'
import BadgeCountService from '../../services/BadgeCountService.ts'

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router()

  /**
   * @openapi
   * /badge-counts/refresh:
   *   post:
   *     tags:
   *       - Dashboard
   *     summary: Refresh badge counts
   *     description: Triggers a refresh of badge counts, forcing an immediate update and bypassing the cache TTL
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Badge counts refreshed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 counts:
   *                   type: object
   *                   description: Badge count values keyed by menu slug
   *                   additionalProperties:
   *                     type: integer
   *                   example:
   *                     posts: 5
   *                     comments: 12
   *                     users: 3
   *                 updated_at:
   *                   type: string
   *                   format: date-time
   *                   description: Timestamp when counts were last updated
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_dashboard capability
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   */
  router.post('/refresh', async (req, res: Response) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    try {
      // Check capability
      const hasCapability = await typedReq.guard.user({ canOneOf: ['manage_dashboard'], userId: typedReq?.user?.id })
      if (!hasCapability) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions. Required capability: manage_dashboard'
        })
      }

      const badgeCountService = new BadgeCountService(context)
      // Force update to bypass cache TTL when manually refreshing
      const result = await badgeCountService.updateBadgeCounts(true)

      res.json({
        success: true,
        ...result
      })
    } catch (error) {
      console.error('Failed to refresh badge counts:', error)
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

  /**
   * @openapi
   * /badge-counts:
   *   get:
   *     tags:
   *       - Dashboard
   *     summary: Get badge counts
   *     description: Returns current badge counts from cache. Badge counts are used to display notification badges in the admin menu.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Badge counts retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 counts:
   *                   type: object
   *                   description: Badge count values keyed by menu slug
   *                   additionalProperties:
   *                     type: integer
   *                   example:
   *                     posts: 5
   *                     comments: 12
   *                     users: 3
   *                 updated_at:
   *                   type: string
   *                   format: date-time
   *                   description: Timestamp when counts were last updated
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_dashboard capability
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   */
  router.get('/', async (req, res: Response) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    try {
      // Check capability
      const hasCapability = await typedReq.guard.user({ canOneOf: ['manage_dashboard'], userId: typedReq?.user?.id })
      if (!hasCapability) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions. Required capability: manage_dashboard'
        })
      }

      const badgeCountService = new BadgeCountService(context)
      const counts = await badgeCountService.getBadgeCounts()

      res.json({
        success: true,
        ...counts
      })
    } catch (error) {
      console.error('Failed to get badge counts:', error)
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

  return router
}
