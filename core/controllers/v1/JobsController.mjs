import express from 'express'

export default (context) => {
  const router = express.Router()

  /**
   * Helper: check capability
   */
  const checkCapability = async (req, routeCaps) => {
    const hasAccess = await req.guard.user({ canOneOf: routeCaps })
    return hasAccess
  }

  /**
   * GET /api/v1/jobs
   * Get all jobs with optional filters
   * Requires: manage_jobs or read_jobs capability
   */
  router.get('/', async (req, res) => {
    try {
      if (!(await checkCapability(req, ['manage_jobs', 'read_jobs']))) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied. Requires manage_jobs or read_jobs capability.'
        })
      }

      const { status, type, source, limit = 100, offset = 0 } = req.query

      const jobs = await req.hooks.getJobs({
        status,
        type,
        source,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      })

      res.json({
        success: true,
        data: jobs
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  })

  /**
   * GET /api/v1/jobs/:jobId
   * Get a specific job by ID
   * Requires: manage_jobs or read_jobs capability
   */
  router.get('/:jobId', async (req, res) => {
    try {
      if (!(await checkCapability(req, ['manage_jobs', 'read_job']))) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied. Requires manage_jobs or read_jobs capability.'
        })
      }

      const { jobId } = req.params

      const job = await req.hooks.getJob(jobId)

      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        })
      }

      res.json({
        success: true,
        data: job
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  })

  /**
   * POST /api/v1/jobs
   * Create a new job
   * Requires: manage_jobs capability
   */
  router.post('/', async (req, res) => {
    try {
      if (!(await checkCapability(req, ['manage_jobs', 'create_jobs']))) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied. Requires manage_jobs capability.'
        })
      }

      const { name, description, type, iconSvg, metadata, source } = req.body

      if (!name || !type) {
        return res.status(400).json({
          success: false,
          message: 'Name and type are required'
        })
      }

      const job = await req.hooks.createJob({
        name,
        description,
        type,
        iconSvg,
        metadata,
        source: source || 'api',
        createdBy: req.user?.id || null
      })

      res.status(201).json({
        success: true,
        data: {
          id: job.id,
          jobId: job.jobId,
          name: job.name,
          description: job.description,
          type: job.type,
          status: job.status,
          progress: job.progress,
          iconSvg: job.iconSvg,
          metadata: job.metadata,
          source: job.source,
          createdAt: job.createdAt
        }
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  })

  /**
   * DELETE /api/v1/jobs/cleanup
   * Cleanup old completed/failed jobs
   * Requires: manage_jobs capability
   */
  router.delete('/cleanup', async (req, res) => {
    try {
      if (!(await checkCapability(req, ['manage_jobs', 'delete_jobs']))) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied. Requires manage_jobs capability.'
        })
      }

      const { daysOld = 30 } = req.query

      const deleted = await req.hooks.cleanupOldJobs(parseInt(daysOld, 10))

      res.json({
        success: true,
        message: `Deleted ${deleted} old jobs`
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  })

  return router
}
