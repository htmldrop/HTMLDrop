import type { Router, Response } from 'express'
import express from 'express'

interface Job {
  id: number
  jobId: string
  name: string
  description?: string
  type: string
  status: string
  progress: number
  iconSvg?: string
  metadata?: Record<string, unknown>
  source: string
  createdAt: Date
}

export default (_context: HTMLDrop.Context): Router => {
  const router = express.Router()

  /**
   * Helper: check capability
   */
  const checkCapability = async (req: HTMLDrop.ExtendedRequest, routeCaps: string[]): Promise<boolean> => {
    const hasAccess = await req.guard.user({ canOneOf: routeCaps })
    return hasAccess
  }

  /**
   * @openapi
   * /jobs:
   *   get:
   *     tags:
   *       - Jobs
   *     summary: List all jobs
   *     description: Returns all background jobs with optional filters for status, type, and source
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, running, completed, failed]
   *         description: Filter by job status
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *         description: Filter by job type (e.g., import, export, backup)
   *       - in: query
   *         name: source
   *         schema:
   *           type: string
   *         description: Filter by source plugin or module
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *         description: Maximum number of jobs to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of jobs to skip for pagination
   *     responses:
   *       200:
   *         description: List of jobs
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Job'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_jobs or read_jobs capability
   *       500:
   *         description: Server error
   */
  router.get('/', async (req, res: Response) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    try {
      if (!(await checkCapability(typedReq, ['manage_jobs', 'read_jobs']))) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied. Requires manage_jobs or read_jobs capability.'
        })
      }

      const queryParams = typedReq.query as Record<string, string | undefined>
      const { status, type, source, limit = '100', offset = '0' } = queryParams

      const jobs = await typedReq.hooks.getJobs({
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
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

  /**
   * @openapi
   * /jobs/{jobId}:
   *   get:
   *     tags:
   *       - Jobs
   *     summary: Get a job by ID
   *     description: Returns a single job by its unique job ID
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *         description: Unique job identifier
   *         example: job_abc123
   *     responses:
   *       200:
   *         description: Job details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/Job'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_jobs or read_job capability
   *       404:
   *         description: Job not found
   *       500:
   *         description: Server error
   */
  router.get('/:jobId', async (req, res: Response) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    try {
      if (!(await checkCapability(typedReq, ['manage_jobs', 'read_job']))) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied. Requires manage_jobs or read_jobs capability.'
        })
      }

      const { jobId } = req.params

      const job = await typedReq.hooks.getJob(jobId)

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
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

  /**
   * @openapi
   * /jobs:
   *   post:
   *     tags:
   *       - Jobs
   *     summary: Create a new job
   *     description: Creates a new background job that can be processed asynchronously
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - type
   *             properties:
   *               name:
   *                 type: string
   *                 description: Display name for the job
   *                 example: Import Users
   *               description:
   *                 type: string
   *                 description: Detailed description of what the job does
   *                 example: Importing users from CSV file
   *               type:
   *                 type: string
   *                 description: Job type category
   *                 example: import
   *               iconSvg:
   *                 type: string
   *                 description: SVG icon markup for the job
   *               metadata:
   *                 type: object
   *                 description: Additional job-specific data
   *                 example: { items: 100, source_file: "users.csv" }
   *               source:
   *                 type: string
   *                 description: Source plugin or module that created the job
   *                 default: api
   *                 example: user-import-plugin
   *     responses:
   *       201:
   *         description: Job created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/Job'
   *       400:
   *         description: Bad request - name and type are required
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_jobs or create_jobs capability
   *       500:
   *         description: Server error
   */
  router.post('/', async (req, res: Response) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    try {
      if (!(await checkCapability(typedReq, ['manage_jobs', 'create_jobs']))) {
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

      const job = await typedReq.hooks.createJob({
        name,
        description,
        type,
        iconSvg,
        metadata,
        source: source || 'api',
        createdBy: typedReq.user?.id || null
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
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

  /**
   * @openapi
   * /jobs/cleanup:
   *   delete:
   *     tags:
   *       - Jobs
   *     summary: Cleanup old jobs
   *     description: Deletes old completed and failed jobs that are older than the specified number of days
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: daysOld
   *         schema:
   *           type: integer
   *           default: 30
   *         description: Delete jobs older than this many days
   *     responses:
   *       200:
   *         description: Jobs cleaned up successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Deleted 5 old jobs
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - requires manage_jobs or delete_jobs capability
   *       500:
   *         description: Server error
   */
  router.delete('/cleanup', async (req, res: Response) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    try {
      if (!(await checkCapability(typedReq, ['manage_jobs', 'delete_jobs']))) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied. Requires manage_jobs capability.'
        })
      }

      const queryParams = typedReq.query as Record<string, string | undefined>
      const { daysOld = '30' } = queryParams

      const deleted = await typedReq.hooks.cleanupOldJobs(parseInt(daysOld, 10))

      res.json({
        success: true,
        message: `Deleted ${deleted} old jobs`
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

  return router
}
