/**
 * Update Controller
 *
 * Handles CMS update checking and execution
 */

import express from 'express'
import UpdateService from '../../services/UpdateService.mjs'
import BadgeCountService from '../../services/BadgeCountService.mjs'

export default (context) => {
  const router = express.Router()
  const updateService = new UpdateService(context)

  /**
   * @openapi
   * /updates/check:
   *   get:
   *     tags:
   *       - Updates
   *     summary: Check for updates
   *     description: Checks if a newer version of the CMS is available on GitHub
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Update check completed
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     hasUpdate:
   *                       type: boolean
   *                       description: Whether an update is available
   *                     currentVersion:
   *                       type: string
   *                       example: "1.0.35"
   *                     latestVersion:
   *                       type: string
   *                       example: "1.0.36"
   *                     releaseNotes:
   *                       type: string
   *                       description: Release notes for the latest version
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_dashboard capability
   *       500:
   *         description: Server error
   */
  router.get('/check', async (req, res) => {
    try {
      // Check if user has permission
      if (!(await req.guard?.user({ canOneOf: { manage_dashboard: 'manage_dashboard' } }))) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        })
      }

      const updateStatus = await updateService.checkForUpdates()

      // Clear badge count cache to ensure it refreshes with latest update status
      try {
        const badgeCountService = new BadgeCountService(req.context)
        await badgeCountService.clearCache('cms')
      } catch (error) {
        console.warn('Failed to clear CMS badge cache:', error)
      }

      res.json({
        success: true,
        data: updateStatus
      })
    } catch (error) {
      console.error('Failed to check for updates:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to check for updates',
        error: error.message
      })
    }
  })

  /**
   * @openapi
   * /updates/current:
   *   get:
   *     tags:
   *       - Updates
   *     summary: Get current version
   *     description: Returns the current installed version and commit SHA of the CMS
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Current version info
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     version:
   *                       type: string
   *                       example: "1.0.35"
   *                     commit:
   *                       type: string
   *                       description: Git commit SHA
   *                       example: "a1b2c3d4e5f6"
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_dashboard capability
   *       500:
   *         description: Server error
   */
  router.get('/current', async (req, res) => {
    try {
      // Check if user has permission
      if (!(await req.guard?.user({ canOneOf: { manage_dashboard: 'manage_dashboard' } }))) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        })
      }

      const currentVersion = await updateService.getCurrentVersion()
      const commitSHA = await updateService.getLocalCommitSHA()

      res.json({
        success: true,
        data: {
          version: currentVersion,
          commit: commitSHA
        }
      })
    } catch (error) {
      console.error('Failed to get current version:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get current version',
        error: error.message
      })
    }
  })

  /**
   * @openapi
   * /updates/pull:
   *   post:
   *     tags:
   *       - Updates
   *     summary: Pull latest update
   *     description: Pulls the latest changes from GitHub and restarts the server. The server will restart automatically after a successful pull.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               branch:
   *                 type: string
   *                 default: main
   *                 description: Git branch to pull from
   *                 example: main
   *     responses:
   *       200:
   *         description: Update pulled successfully. Server will restart.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     message:
   *                       type: string
   *                       example: "Update pulled successfully"
   *                     previousVersion:
   *                       type: string
   *                       example: "1.0.35"
   *                     newVersion:
   *                       type: string
   *                       example: "1.0.36"
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_dashboard capability
   *       500:
   *         description: Server error
   */
  router.post('/pull', async (req, res) => {
    try {
      // Check if user has permission (manage_dashboard capability)
      if (!(await req.guard?.user({ canOneOf: { manage_dashboard: 'manage_dashboard' } }))) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        })
      }

      const { branch = 'main' } = req.body

      const result = await updateService.pullUpdate({ branch })

      // Refresh badge counts after successful update (force update to clear CMS badge)
      try {
        const badgeCountService = new BadgeCountService(req.context)
        await badgeCountService.updateBadgeCounts(true)
        console.log('Badge counts refreshed after CMS update')
      } catch (error) {
        console.error('Failed to refresh badge counts after CMS update:', error)
      }

      // Schedule server restart after response is sent
      res.json({
        success: true,
        data: result
      })

      // Full restart after 3 seconds (includes primary process since core code may have changed)
      setTimeout(async () => {
        await updateService.restartServer({ fullRestart: true })
      }, 3000)
    } catch (error) {
      console.error('Failed to pull update:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to pull update',
        error: error.message
      })
    }
  })

  /**
   * @openapi
   * /updates/status:
   *   get:
   *     tags:
   *       - Updates
   *     summary: Get full update status
   *     description: Returns combined update check and current version information in a single request
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Full update status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     hasUpdate:
   *                       type: boolean
   *                       description: Whether an update is available
   *                     currentVersion:
   *                       type: string
   *                       example: "1.0.35"
   *                     latestVersion:
   *                       type: string
   *                       example: "1.0.36"
   *                     releaseNotes:
   *                       type: string
   *                     commit:
   *                       type: string
   *                       description: Current git commit SHA
   *                       example: "a1b2c3d4e5f6"
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_dashboard capability
   *       500:
   *         description: Server error
   */
  router.get('/status', async (req, res) => {
    try {
      // Check if user has permission
      if (!(await req.guard?.user({ canOneOf: { manage_dashboard: 'manage_dashboard' } }))) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        })
      }

      const [updateStatus, commitSHA] = await Promise.all([
        updateService.checkForUpdates(),
        updateService.getLocalCommitSHA()
      ])

      // Clear badge count cache to ensure it refreshes with latest update status
      try {
        const badgeCountService = new BadgeCountService(req.context)
        await badgeCountService.clearCache('cms')
      } catch (error) {
        console.warn('Failed to clear CMS badge cache:', error)
      }

      res.json({
        success: true,
        data: {
          ...updateStatus,
          commit: commitSHA
        }
      })
    } catch (error) {
      console.error('Failed to get update status:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get update status',
        error: error.message
      })
    }
  })

  return router
}
