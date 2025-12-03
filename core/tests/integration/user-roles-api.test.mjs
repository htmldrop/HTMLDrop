import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import knex from 'knex'
import express from 'express'
import request from 'supertest'
import UsersController from '../../controllers/v1/UsersController.ts'

describe('User Roles API Integration', () => {
  let db
  let app
  let context
  let adminToken
  let viewerToken

  beforeAll(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })

    // Create tables
    await db.schema.createTable('test_users', (table) => {
      table.increments('id')
      table.string('username').unique()
      table.string('email').unique()
      table.string('password')
      table.string('first_name')
      table.string('last_name')
      table.string('status').defaultTo('active')
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.timestamp('deleted_at')
    })

    await db.schema.createTable('test_roles', (table) => {
      table.increments('id')
      table.string('name')
      table.string('slug').unique()
      table.string('description')
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })

    await db.schema.createTable('test_user_roles', (table) => {
      table.increments('id')
      table.integer('user_id')
      table.integer('role_id')
    })

    await db.schema.createTable('test_capabilities', (table) => {
      table.increments('id')
      table.string('name')
      table.string('slug').unique()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })

    await db.schema.createTable('test_user_capabilities', (table) => {
      table.increments('id')
      table.integer('user_id')
      table.integer('capability_id')
    })

    await db.schema.createTable('test_user_meta', (table) => {
      table.increments('id')
      table.integer('user_id')
      table.string('field_slug')
      table.text('value')
    })

    await db.schema.createTable('test_user_fields', (table) => {
      table.increments('id')
      table.string('slug')
      table.string('type')
      table.text('config')
    })

    // Insert test capabilities
    await db('test_capabilities').insert([
      { id: 1, slug: 'manage_roles', name: 'Manage roles' },
      { id: 2, slug: 'read_user', name: 'Read user' },
      { id: 3, slug: 'manage_users', name: 'Manage users' }
    ])

    // Insert test roles
    await db('test_roles').insert([
      { id: 1, name: 'Administrator', slug: 'administrator', description: 'Full access' },
      { id: 2, name: 'Editor', slug: 'editor', description: 'Can edit content' },
      { id: 3, name: 'Author', slug: 'author', description: 'Can create content' }
    ])

    // Insert test users
    await db('test_users').insert([
      { id: 1, username: 'admin', email: 'admin@test.com', password: 'hashed', first_name: 'Admin', last_name: 'User', status: 'active' },
      { id: 2, username: 'viewer', email: 'viewer@test.com', password: 'hashed', first_name: 'Viewer', last_name: 'User', status: 'active' },
      { id: 3, username: 'testuser', email: 'test@test.com', password: 'hashed', first_name: 'Test', last_name: 'User', status: 'active' }
    ])

    // Assign roles to users
    await db('test_user_roles').insert([
      { user_id: 1, role_id: 1 }, // admin has administrator role
      { user_id: 3, role_id: 2 }  // testuser has editor role
    ])

    // Admin has manage_roles and read_user capabilities
    await db('test_user_capabilities').insert([
      { user_id: 1, capability_id: 1 },
      { user_id: 1, capability_id: 2 },
      { user_id: 1, capability_id: 3 }
    ])

    // Viewer only has read_user capability
    await db('test_user_capabilities').insert([
      { user_id: 2, capability_id: 2 }
    ])

    adminToken = 'admin-token'
    viewerToken = 'viewer-token'

    context = {
      knex: db,
      table: (name) => `test_${name}`,
      normalizeSlug: (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      formatDate: (date) => {
        const d = date || new Date()
        return d.toISOString().slice(0, 19).replace('T', ' ')
      },
      doAction: () => {},
      applyFilters: (name, value) => value
    }

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

      req.guard = {
        user: async ({ canOneOf, userId }) => {
          if (!req.user) return false

          const userCaps = await db('test_user_capabilities')
            .join('test_capabilities', 'test_capabilities.id', '=', 'test_user_capabilities.capability_id')
            .where('test_user_capabilities.user_id', req.user.id)
            .pluck('test_capabilities.slug')

          return canOneOf.some((cap) => userCaps.includes(cap))
        }
      }

      next()
    })

    app.use('/api/v1/users', UsersController(context))
  })

  afterAll(async () => {
    await db.destroy()
  })

  describe('GET /api/v1/users/:idOrUsername/roles', () => {
    it('should get roles for a user by username with admin token', async () => {
      const response = await request(app)
        .get('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
      expect(response.body.length).toBe(1)
      expect(response.body[0].slug).toBe('editor')
    })

    it('should get roles for a user by ID', async () => {
      const response = await request(app)
        .get('/api/v1/users/3/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
      expect(response.body.length).toBe(1)
      expect(response.body[0].slug).toBe('editor')
    })

    it('should return empty array for user with no roles', async () => {
      const response = await request(app)
        .get('/api/v1/users/viewer/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
      expect(response.body.length).toBe(0)
    })

    it('should allow viewer to read roles (has read_user capability)', async () => {
      const response = await request(app)
        .get('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
    })

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/users/nonexistent/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)

      expect(response.body.error).toContain('not found')
    })
  })

  describe('PUT /api/v1/users/:idOrUsername/roles', () => {
    beforeEach(async () => {
      // Reset testuser roles
      await db('test_user_roles').where('user_id', 3).delete()
      await db('test_user_roles').insert({ user_id: 3, role_id: 2 })
    })

    it('should set roles for a user by username', async () => {
      const response = await request(app)
        .put('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role_ids: [2, 3]
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.roles).toHaveLength(2)
      expect(response.body.roles.map(r => r.slug)).toContain('editor')
      expect(response.body.roles.map(r => r.slug)).toContain('author')
    })

    it('should set roles for a user by ID', async () => {
      const response = await request(app)
        .put('/api/v1/users/3/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role_ids: [1]
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.roles).toHaveLength(1)
      expect(response.body.roles[0].slug).toBe('administrator')
    })

    it('should replace existing roles', async () => {
      // First verify user has editor role
      const before = await request(app)
        .get('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(before.body.map(r => r.slug)).toContain('editor')

      // Replace with author role
      const response = await request(app)
        .put('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role_ids: [3]
        })
        .expect(200)

      expect(response.body.roles).toHaveLength(1)
      expect(response.body.roles[0].slug).toBe('author')
      expect(response.body.roles.map(r => r.slug)).not.toContain('editor')
    })

    it('should clear all roles when empty array provided', async () => {
      const response = await request(app)
        .put('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role_ids: []
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.roles).toHaveLength(0)

      // Verify in database
      const roles = await db('test_user_roles').where('user_id', 3)
      expect(roles).toHaveLength(0)
    })

    it('should reject role update with viewer token (no manage_roles capability)', async () => {
      await request(app)
        .put('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          role_ids: [1]
        })
        .expect(403)
    })

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/v1/users/nonexistent/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role_ids: [1]
        })
        .expect(404)

      expect(response.body.error).toContain('not found')
    })

    it('should reject without authentication', async () => {
      await request(app)
        .put('/api/v1/users/testuser/roles')
        .send({
          role_ids: [1]
        })
        .expect(403)
    })
  })

  describe('User roles workflow', () => {
    beforeEach(async () => {
      // Reset testuser roles
      await db('test_user_roles').where('user_id', 3).delete()
    })

    it('should assign multiple roles and verify them', async () => {
      // Assign editor and author roles
      const setResponse = await request(app)
        .put('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role_ids: [2, 3]
        })
        .expect(200)

      expect(setResponse.body.roles).toHaveLength(2)

      // Get roles and verify
      const getResponse = await request(app)
        .get('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(getResponse.body).toHaveLength(2)
      expect(getResponse.body.map(r => r.slug).sort()).toEqual(['author', 'editor'])
    })

    it('should remove a role and keep others', async () => {
      // First assign multiple roles
      await request(app)
        .put('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role_ids: [1, 2, 3]
        })
        .expect(200)

      // Now update to only keep editor
      const response = await request(app)
        .put('/api/v1/users/testuser/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role_ids: [2]
        })
        .expect(200)

      expect(response.body.roles).toHaveLength(1)
      expect(response.body.roles[0].slug).toBe('editor')
    })
  })
})
