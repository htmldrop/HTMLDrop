import { randomUUID } from 'crypto'
import type { Knex } from 'knex'
import type { WebSocket, WebSocketServer } from 'ws'

interface JobsContext {
  knex: Knex
  table: (name: string) => string
  formatDate: (date?: Date) => string
  wss: WebSocketServer & {
    clients: Set<WebSocket & { authenticated?: boolean; capabilities?: string[] }>
  }
}

interface JobConfig {
  name: string
  description?: string | null
  type: string
  iconSvg?: string | null
  metadata?: Record<string, any>
  source?: string
  createdBy?: number | null
  showNotification?: boolean
  timeout?: number
}

interface JobData {
  id: number
  jobId: string
  name: string
  description?: string
  type: string
  status: string
  progress: number
  iconSvg?: string
  metadata: Record<string, any>
  errorMessage?: string
  result?: any
  source: string
  showNotification: boolean
  timeout: number
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  createdBy?: number
}

interface JobInstance extends JobData {
  start: () => Promise<JobInstance>
  updateProgress: (progress: number, metadata?: Record<string, any> | null) => Promise<JobInstance>
  complete: (result?: any) => Promise<JobInstance>
  fail: (errorMessage: string) => Promise<JobInstance>
  cancel: () => Promise<JobInstance>
}

interface GetJobsOptions {
  status?: string | null
  type?: string | null
  source?: string | null
  limit?: number
  offset?: number
}

/**
 * Job Queue Registry
 * Manages background jobs using the jobs post type
 */
export default class RegisterJobs {
  private context: JobsContext
  private activeJobs: Map<string, JobInstance>

  constructor(context: JobsContext) {
    this.context = context
    this.activeJobs = new Map()
  }

  /**
   * Creates a new job and stores it as a post
   */
  async createJob({
    name,
    description = null,
    type,
    iconSvg = null,
    metadata = {},
    source = 'system',
    createdBy = null,
    showNotification = false,
    timeout = 300000
  }: JobConfig): Promise<JobInstance> {
    const jobId = randomUUID()
    const { knex, table } = this.context

    // Create job as a post
    const [result] = await knex(table('posts'))
      .insert({
        post_type_slug: 'jobs',
        slug: jobId,
        status: 'publish',
        created_at: this.context.formatDate(),
        updated_at: this.context.formatDate()
      })
      .returning('id')

    // Handle different return formats (PostgreSQL/MySQL vs SQLite)
    const postId = typeof result === 'object' ? (result as { id: number }).id : result

    // Insert job metadata
    const fields = [
      { slug: 'job_id', value: jobId },
      { slug: 'name', value: name },
      { slug: 'description', value: description || '' },
      { slug: 'type', value: type },
      { slug: 'status', value: 'pending' },
      { slug: 'progress', value: '0' },
      { slug: 'icon_svg', value: iconSvg || '' },
      { slug: 'metadata', value: JSON.stringify(metadata) },
      { slug: 'source', value: source },
      { slug: 'error_message', value: '' },
      { slug: 'result', value: '' },
      { slug: 'show_notification', value: String(showNotification) },
      { slug: 'timeout', value: String(timeout) }
    ]

    for (const field of fields) {
      await knex(table('post_meta')).insert({
        post_id: postId,
        field_slug: field.slug,
        value: field.value
      })
    }

    // Add author if provided
    if (createdBy) {
      await knex(table('post_authors')).insert({
        post_id: postId,
        user_id: createdBy,
        created_at: this.context.formatDate()
      })
    }

    // Fetch the complete job
    const job = await this._getJobByPostId(postId)

    // Create job instance
    const jobInstance = this._createJobInstance(job!)

    // Add to active jobs
    this.activeJobs.set(jobId, jobInstance)

    // Broadcast job creation
    this._broadcastJobUpdate(jobInstance)

    return jobInstance
  }

  /**
   * Gets a job by post ID
   */
  private async _getJobByPostId(postId: number): Promise<JobData | null> {
    const { knex, table } = this.context

    const post = await knex(table('posts')).where('id', postId).first()
    if (!post) return null

    const meta = await knex(table('post_meta')).where('post_id', postId)

    const metaObj: Record<string, string> = {}
    for (const m of meta) {
      metaObj[m.field_slug] = m.value
    }

    return {
      id: post.id,
      jobId: metaObj.job_id || post.slug,
      name: metaObj.name,
      description: metaObj.description,
      type: metaObj.type,
      status: metaObj.status || 'pending',
      progress: parseInt(metaObj.progress || '0', 10),
      iconSvg: metaObj.icon_svg,
      metadata: metaObj.metadata ? JSON.parse(metaObj.metadata) : {},
      errorMessage: metaObj.error_message,
      result: metaObj.result ? JSON.parse(metaObj.result) : null,
      source: metaObj.source || 'system',
      showNotification: metaObj.show_notification === 'true',
      timeout: parseInt(metaObj.timeout || '300000', 10),
      startedAt: metaObj.started_at,
      completedAt: metaObj.completed_at,
      createdAt: post.created_at,
      updatedAt: post.updated_at
    }
  }

  /**
   * Updates a job meta field
   */
  private async _updateJobMeta(postId: number, fieldSlug: string, value: string): Promise<void> {
    const { knex, table } = this.context

    const existing = await knex(table('post_meta'))
      .where({ post_id: postId, field_slug: fieldSlug })
      .first()

    if (existing) {
      await knex(table('post_meta'))
        .where({ post_id: postId, field_slug: fieldSlug })
        .update({ value })
    } else {
      await knex(table('post_meta')).insert({
        post_id: postId,
        field_slug: fieldSlug,
        value
      })
    }

    // Update post updated_at
    await knex(table('posts'))
      .where('id', postId)
      .update({ updated_at: this.context.formatDate() })
  }

  /**
   * Creates a job instance with control methods
   */
  private _createJobInstance(jobData: JobData): JobInstance {
    const self = this
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    const instance: JobInstance = {
      id: jobData.id,
      jobId: jobData.jobId,
      name: jobData.name,
      description: jobData.description,
      type: jobData.type,
      status: jobData.status,
      progress: jobData.progress,
      iconSvg: jobData.iconSvg,
      metadata: jobData.metadata,
      source: jobData.source,
      showNotification: jobData.showNotification,
      timeout: jobData.timeout,
      createdBy: jobData.createdBy,
      startedAt: jobData.startedAt,
      completedAt: jobData.completedAt,
      createdAt: jobData.createdAt,
      updatedAt: jobData.updatedAt,

      /**
       * Starts the job
       */
      async start(): Promise<JobInstance> {
        this.status = 'running'
        this.startedAt = self.context.formatDate()

        await self._updateJobMeta(this.id, 'status', 'running')
        await self._updateJobMeta(this.id, 'started_at', this.startedAt)

        // Set up timeout if configured (timeout > 0)
        if (this.timeout > 0) {
          timeoutHandle = setTimeout(async () => {
            // Only fail if job is still running
            if (this.status === 'running') {
              console.warn(`Job ${this.jobId} timed out after ${this.timeout}ms`)
              await this.fail(`Job timed out after ${this.timeout / 1000} seconds`)
            }
          }, this.timeout)
        }

        self._broadcastJobUpdate(this)
        return this
      },

      /**
       * Updates job progress
       */
      async updateProgress(progress: number, metadata: Record<string, any> | null = null): Promise<JobInstance> {
        this.progress = Math.min(100, Math.max(0, progress))
        this.updatedAt = self.context.formatDate()

        await self._updateJobMeta(this.id, 'progress', String(this.progress))

        if (metadata) {
          this.metadata = { ...this.metadata, ...metadata }
          await self._updateJobMeta(this.id, 'metadata', JSON.stringify(this.metadata))
        }

        self._broadcastJobUpdate(this)
        return this
      },

      /**
       * Marks the job as completed
       */
      async complete(result: any = null): Promise<JobInstance> {
        this.status = 'completed'
        this.progress = 100
        this.completedAt = self.context.formatDate()

        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
          timeoutHandle = null
        }

        await self._updateJobMeta(this.id, 'status', 'completed')
        await self._updateJobMeta(this.id, 'progress', '100')
        await self._updateJobMeta(this.id, 'completed_at', this.completedAt)

        if (result) {
          await self._updateJobMeta(this.id, 'result', JSON.stringify(result))
        }

        self._broadcastJobUpdate(this)
        self.activeJobs.delete(this.jobId)
        return this
      },

      /**
       * Marks the job as failed
       */
      async fail(errorMessage: string): Promise<JobInstance> {
        this.status = 'failed'
        this.completedAt = self.context.formatDate()

        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
          timeoutHandle = null
        }

        await self._updateJobMeta(this.id, 'status', 'failed')
        await self._updateJobMeta(this.id, 'error_message', errorMessage)
        await self._updateJobMeta(this.id, 'completed_at', this.completedAt)

        self._broadcastJobUpdate(this)
        self.activeJobs.delete(this.jobId)
        return this
      },

      /**
       * Cancels the job
       */
      async cancel(): Promise<JobInstance> {
        this.status = 'cancelled'
        this.completedAt = self.context.formatDate()

        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
          timeoutHandle = null
        }

        await self._updateJobMeta(this.id, 'status', 'cancelled')
        await self._updateJobMeta(this.id, 'completed_at', this.completedAt)

        self._broadcastJobUpdate(this)
        self.activeJobs.delete(this.jobId)
        return this
      }
    }

    return instance
  }

  /**
   * Broadcasts job updates via WebSocket
   * Handles cluster synchronization by notifying all workers
   */
  private _broadcastJobUpdate(job: JobInstance): void {
    const { wss } = this.context

    const jobData = {
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
      showNotification: job.showNotification,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    }

    const message = JSON.stringify({
      type: 'job_update',
      job: jobData
    })

    // Broadcast to all WebSocket clients on this worker
    wss.clients.forEach((client: WebSocket & { authenticated?: boolean; capabilities?: string[] }) => {
      if (client.readyState === 1 && client.authenticated) {
        // Only send to authenticated clients with appropriate capabilities
        const hasCapability = client.capabilities &&
          (client.capabilities.includes('manage_jobs') ||
           client.capabilities.includes('read_job') ||
           client.capabilities.includes('read_jobs'))

        if (hasCapability) {
          client.send(message)
        }
      }
    })

    // Notify other cluster workers to broadcast to their clients
    if (process.send) {
      process.send({
        type: 'job_broadcast',
        jobData
      })
    }
  }

  /**
   * Gets all jobs (with optional filters)
   */
  async getJobs({ status = null, type = null, source = null, limit = 100, offset = 0 }: GetJobsOptions = {}): Promise<JobData[]> {
    const { knex, table } = this.context

    // Get all job posts
    const query = knex(table('posts'))
      .where('post_type_slug', 'jobs')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)

    const posts = await query

    // Get all metadata for these posts
    const postIds = posts.map((p: { id: number }) => p.id)
    if (postIds.length === 0) return []

    const allMeta = await knex(table('post_meta')).whereIn('post_id', postIds)

    // Group metadata by post ID
    const metaByPost: Record<number, Record<string, string>> = {}
    for (const meta of allMeta) {
      if (!metaByPost[meta.post_id]) metaByPost[meta.post_id] = {}
      metaByPost[meta.post_id][meta.field_slug] = meta.value
    }

    // Build job objects
    let jobs: JobData[] = posts.map((post: any) => {
      const meta = metaByPost[post.id] || {}
      return {
        id: post.id,
        jobId: meta.job_id || post.slug,
        name: meta.name,
        description: meta.description,
        type: meta.type,
        status: meta.status || 'pending',
        progress: parseInt(meta.progress || '0', 10),
        iconSvg: meta.icon_svg,
        metadata: meta.metadata ? JSON.parse(meta.metadata) : {},
        errorMessage: meta.error_message,
        result: meta.result ? JSON.parse(meta.result) : null,
        source: meta.source || 'system',
        showNotification: meta.show_notification === 'true',
        timeout: parseInt(meta.timeout || '300000', 10),
        startedAt: meta.started_at,
        completedAt: meta.completed_at,
        createdAt: post.created_at,
        updatedAt: post.updated_at
      }
    })

    // Apply filters
    if (status) {
      jobs = jobs.filter((j) => j.status === status)
    }
    if (type) {
      jobs = jobs.filter((j) => j.type === type)
    }
    if (source) {
      jobs = jobs.filter((j) => j.source === source)
    }

    return jobs
  }

  /**
   * Gets a specific job by ID
   */
  async getJob(jobId: string): Promise<JobData | null> {
    const { knex, table } = this.context

    const post = await knex(table('posts'))
      .where('post_type_slug', 'jobs')
      .where('slug', jobId)
      .first()

    if (!post) return null

    return await this._getJobByPostId(post.id)
  }

  /**
   * Deletes old completed/failed jobs
   */
  async cleanupOldJobs(daysOld: number = 30): Promise<number> {
    const { knex, table } = this.context

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    // Get old job post IDs
    const oldPosts = await knex(table('posts'))
      .where('post_type_slug', 'jobs')
      .where('created_at', '<', this.context.formatDate(cutoffDate))
      .select('id')

    const postIds = oldPosts.map((p: { id: number }) => p.id)

    if (postIds.length === 0) return 0

    // Get their metadata to check status
    const meta = await knex(table('post_meta'))
      .whereIn('post_id', postIds)
      .where('field_slug', 'status')

    const completedPostIds = meta
      .filter((m: { value: string }) => ['completed', 'failed', 'cancelled'].includes(m.value))
      .map((m: { post_id: number }) => m.post_id)

    if (completedPostIds.length === 0) return 0

    // Delete metadata
    await knex(table('post_meta')).whereIn('post_id', completedPostIds).delete()

    // Delete posts
    await knex(table('posts')).whereIn('id', completedPostIds).delete()

    return completedPostIds.length
  }
}
