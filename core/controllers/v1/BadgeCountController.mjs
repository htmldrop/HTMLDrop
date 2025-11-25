import express from 'express'
import BadgeCountService from '../../services/BadgeCountService.mjs'

export default (context) => {
  const router = express.Router()

  /**
   * POST /api/v1/badge-counts/refresh
   * Triggers a refresh of badge counts (respects cache TTL)
   * Requires: manage_dashboard capability
   */
  router.post('/refresh', async (req, res) => {
    try {
      // Check capability
      const hasCapability = await req.guard.user({ canOneOf: ['manage_dashboard'], userId: req?.user?.id })
      if (!hasCapability) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions. Required capability: manage_dashboard'
        })
      }

      const badgeCountService = new BadgeCountService(context)
      const result = await badgeCountService.updateBadgeCounts()

      res.json({
        success: true,
        ...result
      })
    } catch (error) {
      console.error('Failed to refresh badge counts:', error)
      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  })

  /**
   * GET /api/v1/badge-counts
   * Get current badge counts from cache
   * Requires: manage_dashboard capability
   */
  router.get('/', async (req, res) => {
    try {
      // Check capability
      const hasCapability = await req.guard.user({ canOneOf: ['manage_dashboard'], userId: req?.user?.id })
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
        message: error.message
      })
    }
  })

  return router
}
