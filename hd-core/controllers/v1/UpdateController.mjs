/**
 * Update Controller
 *
 * Handles CMS update checking and execution
 */

import express from 'express'
import UpdateService from '../../services/UpdateService.mjs'

export default (context) => {
  const router = express.Router()
  const updateService = new UpdateService(context)

  /**
   * GET /api/v1/updates/check
   * Check for available updates
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
   * GET /api/v1/updates/current
   * Get current version
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
   * POST /api/v1/updates/pull
   * Pull latest changes from GitHub
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

      // Schedule server restart after response is sent
      res.json({
        success: true,
        data: result
      })

      // Restart server after 3 seconds
      setTimeout(async () => {
        await updateService.restartServer()
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
   * GET /api/v1/updates/status
   * Get update status (combines check and current)
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
