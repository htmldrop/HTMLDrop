import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import knex from 'knex'
import express from 'express'
import request from 'supertest'
import RolesController from '../../controllers/v1/RolesController.ts'
import CapabilitiesController from '../../controllers/v1/CapabilitiesController.ts'

describe('Roles & Capabilities API Integration', () => {
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
    await db.schema.createTable('test_roles', (table) => {
      table.increments('id')
      table.string('name')
      table.string('slug').unique()
      table.string('description')
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })

    await db.schema.createTable('test_capabilities', (table) => {
      table.increments('id')
      table.string('name')
      table.string('slug').unique()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })

    await db.schema.createTable('test_role_capabilities', (table) => {
      table.increments('id')
      table.integer('role_id')
      table.integer('capability_id')
    })

    await db.schema.createTable('test_user_roles', (table) => {
      table.increments('id')
      table.integer('user_id')
      table.integer('role_id')
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

    // Insert test capabilities
    await db('test_capabilities').insert([
      { id: 1, slug: 'manage_roles', name: 'Manage roles' },
      { id: 2, slug: 'read', name: 'Read' },
      { id: 3, slug: 'create', name: 'Create' },
      { id: 4, slug: 'update', name: 'Update' },
      { id: 5, slug: 'delete', name: 'Delete' },
      { id: 6, slug: 'manage_posts', name: 'Manage posts' },
      { id: 7, slug: 'manage_users', name: 'Manage users' }
    ])

    // Insert test roles
    await db('test_roles').insert([
      { id: 1, name: 'Administrator', slug: 'administrator', description: 'Full access' },
      { id: 2, name: 'Editor', slug: 'editor', description: 'Can edit content' }
    ])

    // Assign capabilities to administrator role
    await db('test_role_capabilities').insert([
      { role_id: 1, capability_id: 1 },
      { role_id: 1, capability_id: 2 },
      { role_id: 1, capability_id: 3 },
      { role_id: 1, capability_id: 4 },
      { role_id: 1, capability_id: 5 }
    ])

    // Assign capabilities to editor role
    await db('test_role_capabilities').insert([
      { role_id: 2, capability_id: 2 },
      { role_id: 2, capability_id: 6 }
    ])

    // Insert test users
    await db('test_users').insert([
      { id: 1, username: 'admin', email: 'admin@test.com' },
      { id: 2, username: 'viewer', email: 'viewer@test.com' }
    ])

    // Assign roles to users
    await db('test_user_roles').insert([
      { user_id: 1, role_id: 1 }
    ])

    // Admin has manage_roles capability directly
    await db('test_user_capabilities').insert([
      { user_id: 1, capability_id: 1 },
      { user_id: 1, capability_id: 2 }
    ])

    // Viewer only has read capability
    await db('test_user_capabilities').insert([
      { user_id: 2, capability_id: 2 }
    ])

    adminToken = 'admin-token'
    viewerToken = 'viewer-token'

    context = {
      knex: db,
      table: (name) => `test_${name}`,
      normalizeSlug: (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
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
        user: async ({ canOneOf }) => {
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

    app.use('/api/v1/roles', RolesController(context))
    app.use('/api/v1/capabilities', CapabilitiesController(context))
  })

  afterAll(async () => {
    await db.destroy()
  })

  describe('GET /api/v1/capabilities', () => {
    it('should list all capabilities with admin token', async () => {
      const response = await request(app)
        .get('/api/v1/capabilities')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
      expect(response.body.length).toBe(7)
      expect(response.body[0]).toHaveProperty('slug')
      expect(response.body[0]).toHaveProperty('name')
    })

    it('should list capabilities with viewer token (has read capability)', async () => {
      const response = await request(app)
        .get('/api/v1/capabilities')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
    })

    it('should reject without authentication', async () => {
      await request(app)
        .get('/api/v1/capabilities')
        .expect(403)
    })
  })

  describe('GET /api/v1/capabilities/:slug', () => {
    it('should get a capability by slug', async () => {
      const response = await request(app)
        .get('/api/v1/capabilities/manage_posts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.slug).toBe('manage_posts')
      expect(response.body.name).toBe('Manage posts')
    })

    it('should return 404 for non-existent capability', async () => {
      const response = await request(app)
        .get('/api/v1/capabilities/non_existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)

      expect(response.body.error).toContain('not found')
    })
  })

  describe('GET /api/v1/roles', () => {
    it('should list all roles with capabilities and user counts', async () => {
      const response = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
      expect(response.body.length).toBe(2)

      const adminRole = response.body.find(r => r.slug === 'administrator')
      expect(adminRole).toBeDefined()
      expect(adminRole.capabilities).toBeInstanceOf(Array)
      expect(adminRole.capabilities.length).toBe(5)
      expect(adminRole.user_count).toBe(1)

      const editorRole = response.body.find(r => r.slug === 'editor')
      expect(editorRole).toBeDefined()
      expect(editorRole.capabilities.length).toBe(2)
      expect(editorRole.user_count).toBe(0)
    })

    it('should list roles with viewer token (has read capability)', async () => {
      const response = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
    })

    it('should reject without authentication', async () => {
      await request(app)
        .get('/api/v1/roles')
        .expect(403)
    })
  })

  describe('GET /api/v1/roles/:slug', () => {
    it('should get a role by slug with capabilities', async () => {
      const response = await request(app)
        .get('/api/v1/roles/administrator')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.slug).toBe('administrator')
      expect(response.body.name).toBe('Administrator')
      expect(response.body.capabilities).toBeInstanceOf(Array)
      expect(response.body.user_count).toBe(1)
    })

    it('should return 404 for non-existent role', async () => {
      const response = await request(app)
        .get('/api/v1/roles/non_existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)

      expect(response.body.error).toContain('not found')
    })
  })

  describe('POST /api/v1/roles', () => {
    it('should create a new role with admin token', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Author',
          description: 'Can create content'
        })
        .expect(200)

      expect(response.body.name).toBe('Author')
      expect(response.body.slug).toBe('author')
      expect(response.body.description).toBe('Can create content')
      expect(response.body.capabilities).toEqual([])
      expect(response.body.user_count).toBe(0)

      // Cleanup
      await db('test_roles').where('slug', 'author').delete()
    })

    it('should create a role with custom slug', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Content Manager',
          slug: 'content_mgr'
        })
        .expect(200)

      expect(response.body.slug).toBe('content_mgr')

      // Cleanup
      await db('test_roles').where('slug', 'content_mgr').delete()
    })

    it('should reject role creation without name', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'No name provided'
        })
        .expect(400)

      expect(response.body.error).toContain('required')
    })

    it('should reject duplicate slug', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Administrator'
        })
        .expect(400)

      expect(response.body.error).toContain('already exists')
    })

    it('should reject role creation with viewer token', async () => {
      await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'New Role'
        })
        .expect(403)
    })
  })

  describe('PATCH /api/v1/roles/:slug', () => {
    beforeEach(async () => {
      await db('test_roles').insert({
        id: 100,
        name: 'Test Role',
        slug: 'test_role',
        description: 'For testing'
      })
    })

    afterEach(async () => {
      await db('test_roles').where('slug', 'test_role').delete()
    })

    it('should update role name and description', async () => {
      const response = await request(app)
        .patch('/api/v1/roles/test_role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Role',
          description: 'Updated description'
        })
        .expect(200)

      expect(response.body.name).toBe('Updated Role')
      expect(response.body.description).toBe('Updated description')
      expect(response.body.slug).toBe('test_role') // Slug should not change
    })

    it('should return 404 for non-existent role', async () => {
      await request(app)
        .patch('/api/v1/roles/non_existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' })
        .expect(404)
    })

    it('should reject update with viewer token', async () => {
      await request(app)
        .patch('/api/v1/roles/test_role')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'New Name' })
        .expect(403)
    })
  })

  describe('DELETE /api/v1/roles/:slug', () => {
    beforeEach(async () => {
      await db('test_roles').insert({
        id: 101,
        name: 'Deletable Role',
        slug: 'deletable_role',
        description: 'Will be deleted'
      })
    })

    afterEach(async () => {
      await db('test_roles').where('slug', 'deletable_role').delete()
    })

    it('should delete a role', async () => {
      const response = await request(app)
        .delete('/api/v1/roles/deletable_role')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.deleted.slug).toBe('deletable_role')

      // Verify role is deleted
      const role = await db('test_roles').where('slug', 'deletable_role').first()
      expect(role).toBeUndefined()
    })

    it('should not allow deleting administrator role', async () => {
      const response = await request(app)
        .delete('/api/v1/roles/administrator')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400)

      expect(response.body.error).toContain('Cannot delete')
    })

    it('should return 404 for non-existent role', async () => {
      await request(app)
        .delete('/api/v1/roles/non_existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
    })

    it('should reject deletion with viewer token', async () => {
      await request(app)
        .delete('/api/v1/roles/deletable_role')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403)
    })
  })

  describe('PUT /api/v1/roles/:slug/capabilities', () => {
    beforeEach(async () => {
      await db('test_roles').insert({
        id: 102,
        name: 'Capability Test Role',
        slug: 'cap_test_role',
        description: 'For testing capabilities'
      })
    })

    afterEach(async () => {
      await db('test_role_capabilities').where('role_id', 102).delete()
      await db('test_roles').where('slug', 'cap_test_role').delete()
    })

    it('should set capabilities for a role', async () => {
      const response = await request(app)
        .put('/api/v1/roles/cap_test_role/capabilities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          capability_ids: [2, 3, 6]
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.capabilities).toHaveLength(3)
      expect(response.body.capabilities.map(c => c.id)).toContain(2)
      expect(response.body.capabilities.map(c => c.id)).toContain(3)
      expect(response.body.capabilities.map(c => c.id)).toContain(6)
    })

    it('should replace existing capabilities', async () => {
      // First set some capabilities
      await request(app)
        .put('/api/v1/roles/cap_test_role/capabilities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capability_ids: [2, 3] })
        .expect(200)

      // Now replace with different capabilities
      const response = await request(app)
        .put('/api/v1/roles/cap_test_role/capabilities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capability_ids: [6, 7] })
        .expect(200)

      expect(response.body.capabilities).toHaveLength(2)
      expect(response.body.capabilities.map(c => c.id)).toContain(6)
      expect(response.body.capabilities.map(c => c.id)).toContain(7)
      expect(response.body.capabilities.map(c => c.id)).not.toContain(2)
    })

    it('should clear capabilities when empty array provided', async () => {
      // First set some capabilities
      await request(app)
        .put('/api/v1/roles/cap_test_role/capabilities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capability_ids: [2, 3] })
        .expect(200)

      // Clear all
      const response = await request(app)
        .put('/api/v1/roles/cap_test_role/capabilities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capability_ids: [] })
        .expect(200)

      expect(response.body.capabilities).toHaveLength(0)
    })

    it('should return 404 for non-existent role', async () => {
      await request(app)
        .put('/api/v1/roles/non_existent/capabilities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capability_ids: [1] })
        .expect(404)
    })

    it('should reject with viewer token', async () => {
      await request(app)
        .put('/api/v1/roles/cap_test_role/capabilities')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ capability_ids: [1] })
        .expect(403)
    })
  })

  describe('Role lifecycle workflow', () => {
    it('should create, update, set capabilities, and delete a role', async () => {
      // Create role
      const createRes = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Workflow Test Role',
          description: 'Testing workflow'
        })
        .expect(200)

      const roleSlug = createRes.body.slug
      expect(roleSlug).toBe('workflow_test_role')

      // Update role
      const updateRes = await request(app)
        .patch(`/api/v1/roles/${roleSlug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated workflow description'
        })
        .expect(200)

      expect(updateRes.body.description).toBe('Updated workflow description')

      // Set capabilities
      const capRes = await request(app)
        .put(`/api/v1/roles/${roleSlug}/capabilities`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          capability_ids: [2, 3, 4]
        })
        .expect(200)

      expect(capRes.body.capabilities).toHaveLength(3)

      // Verify role in list
      const listRes = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      const createdRole = listRes.body.find(r => r.slug === roleSlug)
      expect(createdRole).toBeDefined()
      expect(createdRole.capabilities).toHaveLength(3)

      // Delete role
      const deleteRes = await request(app)
        .delete(`/api/v1/roles/${roleSlug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(deleteRes.body.success).toBe(true)

      // Verify role is gone
      await request(app)
        .get(`/api/v1/roles/${roleSlug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
    })
  })
})
