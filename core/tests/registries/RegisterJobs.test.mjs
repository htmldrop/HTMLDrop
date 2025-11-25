import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import RegisterJobs from '../../registries/RegisterJobs.mjs'
import knex from 'knex'

describe('RegisterJobs', () => {
  let db
  let context
  let registerJobs
  let mockWss

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    db = knex({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })

    // Create necessary tables
    await db.schema.createTable('test_posts', (table) => {
      table.increments('id')
      table.string('post_type_slug')
      table.string('slug')
      table.string('status')
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })

    await db.schema.createTable('test_post_meta', (table) => {
      table.increments('id')
      table.integer('post_id')
      table.string('field_slug')
      table.text('value')
    })

    await db.schema.createTable('test_post_authors', (table) => {
      table.increments('id')
      table.integer('post_id')
      table.integer('user_id')
      table.timestamp('created_at')
    })

    // Mock WebSocket server
    mockWss = {
      clients: new Set(),
      broadcast: vi.fn()
    }

    // Create context
    context = {
      knex: db,
      table: (name) => `test_${name}`,
      formatDate: (date) => {
        const d = date || new Date()
        return d.toISOString().slice(0, 19).replace('T', ' ')
      },
      wss: mockWss
    }

    // Mock process.send for cluster testing
    process.send = vi.fn()

    registerJobs = new RegisterJobs(context)
  })

  afterEach(async () => {
    await db.destroy()
    delete process.send
  })

  describe('createJob', () => {
    it('should create a job with required fields', async () => {
      const job = await registerJobs.createJob({
        name: 'Test Job',
        type: 'import',
        source: 'test-plugin'
      })

      expect(job).toBeDefined()
      expect(job.name).toBe('Test Job')
      expect(job.type).toBe('import')
      expect(job.source).toBe('test-plugin')
      expect(job.status).toBe('pending')
      expect(job.progress).toBe(0)
      expect(job.jobId).toBeDefined()
    })

    it('should create a job with all optional fields', async () => {
      const job = await registerJobs.createJob({
        name: 'Full Job',
        description: 'A complete job',
        type: 'export',
        iconSvg: '<svg></svg>',
        metadata: { custom: 'data' },
        source: 'test-plugin',
        createdBy: 1
      })

      expect(job.description).toBe('A complete job')
      expect(job.iconSvg).toBe('<svg></svg>')
      expect(job.metadata).toEqual({ custom: 'data' })

      // Verify author was created
      const authors = await db('test_post_authors').where('post_id', job.id)
      expect(authors).toHaveLength(1)
      expect(authors[0].user_id).toBe(1)
    })

    it('should store job as a post in database', async () => {
      const job = await registerJobs.createJob({
        name: 'DB Test Job',
        type: 'backup',
        source: 'test'
      })

      const post = await db('test_posts').where('id', job.id).first()
      expect(post).toBeDefined()
      expect(post.post_type_slug).toBe('jobs')
      expect(post.slug).toBe(job.jobId)
      expect(post.status).toBe('publish')

      // Verify name is stored in post_meta
      const nameMeta = await db('test_post_meta')
        .where('post_id', job.id)
        .where('field_slug', 'name')
        .first()
      expect(nameMeta).toBeDefined()
      expect(nameMeta.value).toBe('DB Test Job')
    })

    it('should store job metadata in post_meta', async () => {
      const job = await registerJobs.createJob({
        name: 'Meta Test',
        type: 'sync',
        source: 'test',
        metadata: { foo: 'bar' }
      })

      const meta = await db('test_post_meta').where('post_id', job.id)
      expect(meta.length).toBeGreaterThan(0)

      const metaObj = {}
      meta.forEach((m) => {
        metaObj[m.field_slug] = m.value
      })

      expect(metaObj.job_id).toBe(job.jobId)
      expect(metaObj.type).toBe('sync')
      expect(metaObj.status).toBe('pending')
      expect(metaObj.progress).toBe('0')
      expect(JSON.parse(metaObj.metadata)).toEqual({ foo: 'bar' })
    })

    it('should add job to activeJobs map', async () => {
      const job = await registerJobs.createJob({
        name: 'Active Job',
        type: 'import',
        source: 'test'
      })

      expect(registerJobs.activeJobs.has(job.jobId)).toBe(true)
    })

    it('should broadcast job creation via WebSocket', async () => {
      const mockClient = {
        readyState: 1,
        authenticated: true,
        capabilities: ['manage_jobs'],
        send: vi.fn()
      }
      mockWss.clients.add(mockClient)

      await registerJobs.createJob({
        name: 'Broadcast Test',
        type: 'import',
        source: 'test'
      })

      expect(mockClient.send).toHaveBeenCalled()
      const message = JSON.parse(mockClient.send.mock.calls[0][0])
      expect(message.type).toBe('job_update')
      expect(message.job.name).toBe('Broadcast Test')
    })

    it('should send cluster broadcast message', async () => {
      await registerJobs.createJob({
        name: 'Cluster Test',
        type: 'import',
        source: 'test'
      })

      expect(process.send).toHaveBeenCalled()
      const message = process.send.mock.calls[0][0]
      expect(message.type).toBe('job_broadcast')
      expect(message.jobData.name).toBe('Cluster Test')
    })
  })

  describe('job instance methods', () => {
    let job

    beforeEach(async () => {
      job = await registerJobs.createJob({
        name: 'Instance Test',
        type: 'import',
        source: 'test'
      })
    })

    describe('start()', () => {
      it('should mark job as running', async () => {
        await job.start()

        expect(job.status).toBe('running')
        expect(job.startedAt).toBeDefined()

        const meta = await db('test_post_meta')
          .where('post_id', job.id)
          .where('field_slug', 'status')
          .first()
        expect(meta.value).toBe('running')
      })
    })

    describe('updateProgress()', () => {
      it('should update job progress', async () => {
        await job.start()
        await job.updateProgress(50)

        expect(job.progress).toBe(50)

        const meta = await db('test_post_meta')
          .where('post_id', job.id)
          .where('field_slug', 'progress')
          .first()
        expect(meta.value).toBe('50')
      })

      it('should clamp progress between 0 and 100', async () => {
        await job.updateProgress(-10)
        expect(job.progress).toBe(0)

        await job.updateProgress(150)
        expect(job.progress).toBe(100)
      })

      it('should merge metadata when provided', async () => {
        await job.updateProgress(25, { itemsProcessed: 25, currentItem: 'item-25' })

        expect(job.metadata.itemsProcessed).toBe(25)
        expect(job.metadata.currentItem).toBe('item-25')

        const meta = await db('test_post_meta')
          .where('post_id', job.id)
          .where('field_slug', 'metadata')
          .first()
        const metadata = JSON.parse(meta.value)
        expect(metadata.itemsProcessed).toBe(25)
      })
    })

    describe('complete()', () => {
      it('should mark job as completed', async () => {
        await job.start()
        await job.complete({ itemsImported: 100 })

        expect(job.status).toBe('completed')
        expect(job.progress).toBe(100)
        expect(job.completedAt).toBeDefined()

        const statusMeta = await db('test_post_meta')
          .where('post_id', job.id)
          .where('field_slug', 'status')
          .first()
        expect(statusMeta.value).toBe('completed')
      })

      it('should remove job from activeJobs', async () => {
        await job.complete()

        expect(registerJobs.activeJobs.has(job.jobId)).toBe(false)
      })

      it('should store result data', async () => {
        const result = { success: true, count: 42 }
        await job.complete(result)

        const resultMeta = await db('test_post_meta')
          .where('post_id', job.id)
          .where('field_slug', 'result')
          .first()
        expect(JSON.parse(resultMeta.value)).toEqual(result)
      })
    })

    describe('fail()', () => {
      it('should mark job as failed with error message', async () => {
        await job.start()
        await job.fail('Connection timeout')

        expect(job.status).toBe('failed')
        expect(job.completedAt).toBeDefined()

        const errorMeta = await db('test_post_meta')
          .where('post_id', job.id)
          .where('field_slug', 'error_message')
          .first()
        expect(errorMeta.value).toBe('Connection timeout')
      })

      it('should remove job from activeJobs', async () => {
        await job.fail('Test error')

        expect(registerJobs.activeJobs.has(job.jobId)).toBe(false)
      })
    })

    describe('cancel()', () => {
      it('should mark job as cancelled', async () => {
        await job.start()
        await job.cancel()

        expect(job.status).toBe('cancelled')
        expect(job.completedAt).toBeDefined()

        const statusMeta = await db('test_post_meta')
          .where('post_id', job.id)
          .where('field_slug', 'status')
          .first()
        expect(statusMeta.value).toBe('cancelled')
      })

      it('should remove job from activeJobs', async () => {
        await job.cancel()

        expect(registerJobs.activeJobs.has(job.jobId)).toBe(false)
      })
    })
  })

  describe('getJobs', () => {
    beforeEach(async () => {
      // Create multiple jobs with different statuses and types
      const job1 = await registerJobs.createJob({ name: 'Job 1', type: 'import', source: 'plugin-a' })
      await job1.start()

      const job2 = await registerJobs.createJob({ name: 'Job 2', type: 'export', source: 'plugin-b' })
      await job2.start()
      await job2.complete()

      const job3 = await registerJobs.createJob({ name: 'Job 3', type: 'import', source: 'plugin-a' })
      await job3.start()
      await job3.fail('Error')

      await registerJobs.createJob({ name: 'Job 4', type: 'backup', source: 'plugin-c' })
    })

    it('should get all jobs', async () => {
      const jobs = await registerJobs.getJobs()

      expect(jobs).toHaveLength(4)
    })

    it('should filter jobs by status', async () => {
      const completedJobs = await registerJobs.getJobs({ status: 'completed' })
      expect(completedJobs).toHaveLength(1)
      expect(completedJobs[0].name).toBe('Job 2')

      const failedJobs = await registerJobs.getJobs({ status: 'failed' })
      expect(failedJobs).toHaveLength(1)
      expect(failedJobs[0].name).toBe('Job 3')
    })

    it('should filter jobs by type', async () => {
      const importJobs = await registerJobs.getJobs({ type: 'import' })
      expect(importJobs).toHaveLength(2)

      const backupJobs = await registerJobs.getJobs({ type: 'backup' })
      expect(backupJobs).toHaveLength(1)
    })

    it('should filter jobs by source', async () => {
      const pluginAJobs = await registerJobs.getJobs({ source: 'plugin-a' })
      expect(pluginAJobs).toHaveLength(2)
    })

    it('should limit and offset results', async () => {
      const firstTwo = await registerJobs.getJobs({ limit: 2 })
      expect(firstTwo).toHaveLength(2)

      const nextTwo = await registerJobs.getJobs({ limit: 2, offset: 2 })
      expect(nextTwo).toHaveLength(2)
    })
  })

  describe('getJob', () => {
    it('should get a specific job by jobId', async () => {
      const created = await registerJobs.createJob({
        name: 'Specific Job',
        type: 'import',
        source: 'test'
      })

      const retrieved = await registerJobs.getJob(created.jobId)

      expect(retrieved).toBeDefined()
      expect(retrieved.jobId).toBe(created.jobId)
      expect(retrieved.name).toBe('Specific Job')
    })

    it('should return null for non-existent job', async () => {
      const job = await registerJobs.getJob('non-existent-uuid')

      expect(job).toBeNull()
    })
  })

  describe('cleanupOldJobs', () => {
    it('should delete old completed jobs', async () => {
      // Create old completed job
      const oldJob = await registerJobs.createJob({
        name: 'Old Job',
        type: 'import',
        source: 'test'
      })
      await oldJob.complete()

      // Set created_at to 31 days ago
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)
      await db('test_posts')
        .where('id', oldJob.id)
        .update({ created_at: context.formatDate(oldDate) })

      const deleted = await registerJobs.cleanupOldJobs(30)

      expect(deleted).toBe(1)

      const jobs = await registerJobs.getJobs()
      expect(jobs).toHaveLength(0)
    })

    it('should not delete old running jobs', async () => {
      const oldJob = await registerJobs.createJob({
        name: 'Old Running Job',
        type: 'import',
        source: 'test'
      })
      await oldJob.start()

      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)
      await db('test_posts')
        .where('id', oldJob.id)
        .update({ created_at: context.formatDate(oldDate) })

      const deleted = await registerJobs.cleanupOldJobs(30)

      expect(deleted).toBe(0)

      const jobs = await registerJobs.getJobs()
      expect(jobs).toHaveLength(1)
    })

    it('should not delete recent jobs', async () => {
      const recentJob = await registerJobs.createJob({
        name: 'Recent Job',
        type: 'import',
        source: 'test'
      })
      await recentJob.complete()

      const deleted = await registerJobs.cleanupOldJobs(30)

      expect(deleted).toBe(0)

      const jobs = await registerJobs.getJobs()
      expect(jobs).toHaveLength(1)
    })
  })

  describe('WebSocket capabilities filtering', () => {
    it('should only send to clients with manage_jobs capability', async () => {
      const authorizedClient = {
        readyState: 1,
        authenticated: true,
        capabilities: ['manage_jobs'],
        send: vi.fn()
      }

      const unauthorizedClient = {
        readyState: 1,
        authenticated: true,
        capabilities: ['read_post'],
        send: vi.fn()
      }

      mockWss.clients.add(authorizedClient)
      mockWss.clients.add(unauthorizedClient)

      await registerJobs.createJob({
        name: 'Capability Test',
        type: 'import',
        source: 'test'
      })

      expect(authorizedClient.send).toHaveBeenCalled()
      expect(unauthorizedClient.send).not.toHaveBeenCalled()
    })

    it('should send to clients with read_job capability', async () => {
      const readClient = {
        readyState: 1,
        authenticated: true,
        capabilities: ['read_job'],
        send: vi.fn()
      }

      mockWss.clients.add(readClient)

      await registerJobs.createJob({
        name: 'Read Capability Test',
        type: 'import',
        source: 'test'
      })

      expect(readClient.send).toHaveBeenCalled()
    })

    it('should not send to unauthenticated clients', async () => {
      const unauthenticatedClient = {
        readyState: 1,
        authenticated: false,
        capabilities: ['manage_jobs'],
        send: vi.fn()
      }

      mockWss.clients.add(unauthenticatedClient)

      await registerJobs.createJob({
        name: 'Auth Test',
        type: 'import',
        source: 'test'
      })

      expect(unauthenticatedClient.send).not.toHaveBeenCalled()
    })
  })
})
