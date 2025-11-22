import { randomUUID } from 'crypto'

/**
 * Job Queue Registry
 * Manages background jobs using the jobs post type
 */
export default class RegisterJobs {
  constructor(context) {
    this.context = context
    this.activeJobs = new Map() // In-memory active jobs
  }

  /**
   * Creates a new job and stores it as a post
   * @param {Object} jobConfig - Job configuration
   * @param {string} jobConfig.name - Job display name
   * @param {string} jobConfig.description - Job description
   * @param {string} jobConfig.type - Job type (e.g., 'import', 'export', 'backup')
   * @param {string} jobConfig.iconSvg - SVG icon for the job
   * @param {Object} jobConfig.metadata - Additional metadata
   * @param {string} jobConfig.source - Source of the job (plugin/theme name)
   * @param {number} jobConfig.createdBy - User ID who created the job
   * @param {boolean} jobConfig.showNotification - Whether to show popup notification (default: false)
   * @returns {Promise<Object>} Job instance with control methods
   */
  async createJob({
    name,
    description = null,
    type,
    iconSvg = null,
    metadata = {},
    source = 'system',
    createdBy = null,
    showNotification = false
  }) {
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
    const postId = typeof result === 'object' ? result.id : result

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
      { slug: 'show_notification', value: String(showNotification) }
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
    const jobInstance = this._createJobInstance(job)

    // Add to active jobs
    this.activeJobs.set(jobId, jobInstance)

    // Broadcast job creation
    this._broadcastJobUpdate(jobInstance)

    return jobInstance
  }

  /**
   * Gets a job by post ID
   */
  async _getJobByPostId(postId) {
    const { knex, table } = this.context

    const post = await knex(table('posts')).where('id', postId).first()
    if (!post) return null

    const meta = await knex(table('post_meta')).where('post_id', postId)

    const metaObj = {}
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
      startedAt: metaObj.started_at,
      completedAt: metaObj.completed_at,
      createdAt: post.created_at,
      updatedAt: post.updated_at
    }
  }

  /**
   * Updates a job meta field
   */
  async _updateJobMeta(postId, fieldSlug, value) {
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
  _createJobInstance(jobData) {
    const { knex, table } = this.context
    const self = this

    return {
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
      createdBy: jobData.createdBy,
      startedAt: jobData.startedAt,
      completedAt: jobData.completedAt,
      createdAt: jobData.createdAt,
      updatedAt: jobData.updatedAt,

      /**
       * Starts the job
       */
      async start() {
        this.status = 'running'
        this.startedAt = self.context.formatDate()

        await self._updateJobMeta(this.id, 'status', 'running')
        await self._updateJobMeta(this.id, 'started_at', this.startedAt)

        self._broadcastJobUpdate(this)
        return this
      },

      /**
       * Updates job progress
       * @param {number} progress - Progress percentage (0-100)
       * @param {Object} metadata - Optional metadata to merge
       */
      async updateProgress(progress, metadata = null) {
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
       * @param {Object} result - Result data
       */
      async complete(result = null) {
        this.status = 'completed'
        this.progress = 100
        this.completedAt = self.context.formatDate()

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
       * @param {string} errorMessage - Error message
       */
      async fail(errorMessage) {
        this.status = 'failed'
        this.completedAt = self.context.formatDate()

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
      async cancel() {
        this.status = 'cancelled'
        this.completedAt = self.context.formatDate()

        await self._updateJobMeta(this.id, 'status', 'cancelled')
        await self._updateJobMeta(this.id, 'completed_at', this.completedAt)

        self._broadcastJobUpdate(this)
        self.activeJobs.delete(this.jobId)
        return this
      }
    }
  }

  /**
   * Broadcasts job updates via WebSocket
   * Handles cluster synchronization by notifying all workers
   */
  _broadcastJobUpdate(job) {
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
    wss.clients.forEach((client) => {
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
  async getJobs({ status = null, type = null, source = null, limit = 100, offset = 0 } = {}) {
    const { knex, table } = this.context

    // Get all job posts
    let query = knex(table('posts'))
      .where('post_type_slug', 'jobs')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)

    const posts = await query

    // Get all metadata for these posts
    const postIds = posts.map((p) => p.id)
    if (postIds.length === 0) return []

    const allMeta = await knex(table('post_meta')).whereIn('post_id', postIds)

    // Group metadata by post ID
    const metaByPost = {}
    for (const meta of allMeta) {
      if (!metaByPost[meta.post_id]) metaByPost[meta.post_id] = {}
      metaByPost[meta.post_id][meta.field_slug] = meta.value
    }

    // Build job objects
    let jobs = posts.map((post) => {
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
  async getJob(jobId) {
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
   * @param {number} daysOld - Delete jobs older than this many days
   */
  async cleanupOldJobs(daysOld = 30) {
    const { knex, table } = this.context

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    // Get old job post IDs
    const oldPosts = await knex(table('posts'))
      .where('post_type_slug', 'jobs')
      .where('created_at', '<', this.context.formatDate(cutoffDate))
      .select('id')

    const postIds = oldPosts.map((p) => p.id)

    if (postIds.length === 0) return 0

    // Get their metadata to check status
    const meta = await knex(table('post_meta'))
      .whereIn('post_id', postIds)
      .where('field_slug', 'status')

    const completedPostIds = meta
      .filter((m) => ['completed', 'failed', 'cancelled'].includes(m.value))
      .map((m) => m.post_id)

    if (completedPostIds.length === 0) return 0

    // Delete metadata
    await knex(table('post_meta')).whereIn('post_id', completedPostIds).delete()

    // Delete posts
    await knex(table('posts')).whereIn('id', completedPostIds).delete()

    return completedPostIds.length
  }
}
