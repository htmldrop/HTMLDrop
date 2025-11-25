import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import knex from 'knex'
import express from 'express'
import request from 'supertest'
import JobsController from '../../controllers/v1/JobsController.mjs'
import RegisterJobs from '../../registries/RegisterJobs.mjs'

describe('Jobs API Integration', () => {
  let db
  let app
  let context
  let adminToken
  let viewerToken

  beforeAll(async () => {
    // Disable process.send for tests (to prevent cluster IPC interference)
    delete process.send

    // Create in-memory database
    db = knex({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })

    // Create tables
    await db.schema.createTable('test_posts', (table) => {
      table.increments('id')
      table.string('post_type_slug')
      table.string('slug').unique()
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

    await db.schema.createTable('test_users', (table) => {
      table.increments('id')
      table.string('username')
      table.string('email')
    })

    await db.schema.createTable('test_user_capabilities', (table) => {
      table.increments('id')
      table.integer('user_id')
      table.integer('capability_id')
    })

    await db.schema.createTable('test_capabilities', (table) => {
      table.increments('id')
      table.string('slug')
      table.string('name')
    })

    // Insert test capabilities
    await db('test_capabilities').insert([
      { id: 1, slug: 'manage_jobs', name: 'Manage jobs' },
      { id: 2, slug: 'read_job', name: 'Read job' },
      { id: 3, slug: 'read_jobs', name: 'Read jobs' },
      { id: 4, slug: 'create_jobs', name: 'Create jobs' },
      { id: 5, slug: 'delete_jobs', name: 'Delete jobs' }
    ])

    // Insert test users
    await db('test_users').insert([
      { id: 1, username: 'admin', email: 'admin@test.com' },
      { id: 2, username: 'viewer', email: 'viewer@test.com' }
    ])

    // Admin has all job capabilities
    await db('test_user_capabilities').insert([
      { user_id: 1, capability_id: 1 },
      { user_id: 1, capability_id: 2 },
      { user_id: 1, capability_id: 3 },
      { user_id: 1, capability_id: 4 },
      { user_id: 1, capability_id: 5 }
    ])

    // Viewer only has read capabilities
    await db('test_user_capabilities').insert([
      { user_id: 2, capability_id: 2 },
      { user_id: 2, capability_id: 3 }
    ])

    // Mock tokens (in real app these would be JWT)
    adminToken = 'admin-token'
    viewerToken = 'viewer-token'

    // Create context
    const mockWss = {
      clients: new Set()
    }

    context = {
      knex: db,
      table: (name) => `test_${name}`,
      formatDate: (date) => {
        const d = date || new Date()
        return d.toISOString().slice(0, 19).replace('T', ' ')
      },
      wss: mockWss
    }

    // Create Express app
    app = express()
    app.use(express.json())

    // Mock authentication and guard middleware
    app.use((req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '')

      if (token === adminToken) {
        req.user = { id: 1, username: 'admin' }
      } else if (token === viewerToken) {
        req.user = { id: 2, username: 'viewer' }
      }

      // Mock guard
      req.guard = {
        user: async ({ canOneOf }) => {
          if (!req.user) return false

          const userCaps = await db('test_user_capabilities')
            .join('test_capabilities', 'test_capabilities.id', '=', 'test_user_capabilities.capability_id')
            .where('test_user_capabilities.user_id', req.user.id)
            .pluck('test_capabilities.slug')

          return canOneOf.some((cap) => userCaps.includes(cap))
        }
      }

      // Mock hooks
      const registerJobs = new RegisterJobs(context)
      req.hooks = {
        createJob: registerJobs.createJob.bind(registerJobs),
        getJobs: registerJobs.getJobs.bind(registerJobs),
        getJob: registerJobs.getJob.bind(registerJobs),
        cleanupOldJobs: registerJobs.cleanupOldJobs.bind(registerJobs)
      }

      next()
    })

    // Mount Jobs controller
    app.use('/api/v1/jobs', JobsController(context))
  })

  afterAll(async () => {
    await db.destroy()
  })

  beforeEach(async () => {
    // Clear jobs before each test
    await db('test_post_meta').del()
    await db('test_post_authors').del()
    await db('test_posts').del()
  })

  describe('POST /api/v1/jobs', () => {
    it('should create a job with admin token', async () => {
      const response = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Job',
          description: 'A test job',
          type: 'import',
          source: 'test-plugin'
        })
        .expect(201)

      expect(response.body.success).toBe(true)
      expect(response.body.data.name).toBe('Test Job')
      expect(response.body.data.type).toBe('import')
      expect(response.body.data.status).toBe('pending')
      expect(response.body.data.jobId).toBeDefined()
    })

    it('should reject job creation without proper capability', async () => {
      const response = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Test Job',
          type: 'import',
          source: 'test'
        })
        .expect(403)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('Permission denied')
    })

    it('should reject job creation without name', async () => {
      const response = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'import'
        })
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('required')
    })
  })

  describe('GET /api/v1/jobs', () => {
    beforeEach(async () => {
      // Create some test jobs
      const registerJobs = new RegisterJobs(context)

      await registerJobs.createJob({
        name: 'Job 1',
        type: 'import',
        source: 'plugin-a'
      })

      const job2 = await registerJobs.createJob({
        name: 'Job 2',
        type: 'export',
        source: 'plugin-b'
      })
      await job2.start()
      await job2.complete()

      await registerJobs.createJob({
        name: 'Job 3',
        type: 'import',
        source: 'plugin-a'
      })
    })

    it('should get all jobs with admin token', async () => {
      const response = await request(app)
        .get('/api/v1/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(3)
    })

    it('should get all jobs with viewer token', async () => {
      const response = await request(app)
        .get('/api/v1/jobs')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(3)
    })

    it('should filter jobs by status', async () => {
      const response = await request(app)
        .get('/api/v1/jobs?status=completed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.data).toHaveLength(1)
      expect(response.body.data[0].name).toBe('Job 2')
    })

    it('should filter jobs by type', async () => {
      const response = await request(app)
        .get('/api/v1/jobs?type=import')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.data).toHaveLength(2)
    })

    it('should filter jobs by source', async () => {
      const response = await request(app)
        .get('/api/v1/jobs?source=plugin-a')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.data).toHaveLength(2)
    })

    it('should limit results', async () => {
      const response = await request(app)
        .get('/api/v1/jobs?limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.data).toHaveLength(2)
    })
  })

  describe('GET /api/v1/jobs/:jobId', () => {
    let testJobId

    beforeEach(async () => {
      const registerJobs = new RegisterJobs(context)
      const job = await registerJobs.createJob({
        name: 'Specific Job',
        type: 'backup',
        source: 'test'
      })
      testJobId = job.jobId
    })

    it('should get a specific job', async () => {
      const response = await request(app)
        .get(`/api/v1/jobs/${testJobId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.jobId).toBe(testJobId)
      expect(response.body.data.name).toBe('Specific Job')
    })

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .get('/api/v1/jobs/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('not found')
    })

    it('should allow viewer to read job', async () => {
      const response = await request(app)
        .get(`/api/v1/jobs/${testJobId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
    })
  })

  describe('DELETE /api/v1/jobs/cleanup', () => {
    beforeEach(async () => {
      const registerJobs = new RegisterJobs(context)

      // Create old completed job
      const oldJob = await registerJobs.createJob({
        name: 'Old Job',
        type: 'import',
        source: 'test'
      })
      await oldJob.complete()

      // Set to 31 days ago
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)
      await db('test_posts')
        .where('id', oldJob.id)
        .update({ created_at: context.formatDate(oldDate) })

      // Create recent job
      const recentJob = await registerJobs.createJob({
        name: 'Recent Job',
        type: 'import',
        source: 'test'
      })
      await recentJob.complete()
    })

    it('should cleanup old jobs with admin token', async () => {
      const response = await request(app)
        .delete('/api/v1/jobs/cleanup?daysOld=30')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain('Deleted 1 old jobs')

      // Verify only one job remains
      const remaining = await db('test_posts').where('post_type_slug', 'jobs')
      expect(remaining).toHaveLength(1)

      // Verify it's the recent job by checking post_meta for name
      const nameMeta = await db('test_post_meta')
        .where('post_id', remaining[0].id)
        .where('field_slug', 'name')
        .first()
      expect(nameMeta.value).toBe('Recent Job')
    })

    it('should reject cleanup without proper capability', async () => {
      const response = await request(app)
        .delete('/api/v1/jobs/cleanup')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403)

      expect(response.body.success).toBe(false)
    })
  })

  describe('Job lifecycle workflow', () => {
    it('should create job and retrieve it via API', async () => {
      // Create job
      const createRes = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Workflow Test',
          description: 'Test workflow job',
          type: 'import',
          source: 'test-api',
          iconSvg: '<svg></svg>',
          metadata: { items: 100 }
        })
        .expect(201)

      const jobId = createRes.body.data.jobId

      // Verify job is created with correct initial state
      expect(createRes.body.data.name).toBe('Workflow Test')
      expect(createRes.body.data.description).toBe('Test workflow job')
      expect(createRes.body.data.type).toBe('import')
      expect(createRes.body.data.status).toBe('pending')
      expect(createRes.body.data.progress).toBe(0)
      expect(createRes.body.data.metadata.items).toBe(100)

      // Retrieve job via API
      const getRes = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(getRes.body.success).toBe(true)
      expect(getRes.body.data.jobId).toBe(jobId)
      expect(getRes.body.data.name).toBe('Workflow Test')
      expect(getRes.body.data.status).toBe('pending')
      expect(getRes.body.data.metadata.items).toBe(100)

      // Verify job appears in list
      const listRes = await request(app)
        .get('/api/v1/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      const createdJob = listRes.body.data.find((j) => j.jobId === jobId)
      expect(createdJob).toBeDefined()
      expect(createdJob.name).toBe('Workflow Test')
    })
  })
})
