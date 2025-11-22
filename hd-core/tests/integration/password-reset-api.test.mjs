import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import knex from 'knex'
import express from 'express'
import request from 'supertest'
import AuthController from '../../controllers/v1/AuthController.mjs'
import bcrypt from 'bcrypt'

describe('Password Reset API Integration', () => {
  let db
  let app
  let context

  beforeAll(async () => {
    // Create in-memory database
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
      table.string('reset_token').nullable()
      table.datetime('reset_token_expires_at').nullable()
      table.datetime('created_at')
      table.datetime('updated_at')
      table.datetime('deleted_at').nullable()
    })

    await db.schema.createTable('test_options', (table) => {
      table.increments('id')
      table.string('name').unique()
      table.text('value')
      table.boolean('autoload').defaultTo(false)
      table.datetime('created_at')
      table.datetime('updated_at')
    })

    // Insert SMTP options
    await db('test_options').insert([
      { name: 'smtp_host', value: 'smtp.test.com' },
      { name: 'smtp_port', value: '587' },
      { name: 'smtp_secure', value: 'false' },
      { name: 'smtp_user', value: 'test@test.com' },
      { name: 'smtp_password', value: 'password123' },
      { name: 'smtp_from', value: 'noreply@test.com' },
      { name: 'smtp_from_name', value: 'Test Site' },
      { name: 'site_url', value: 'http://localhost:3000' },
      { name: 'site_name', value: 'Test Site' }
    ])

    // Create context
    context = {
      knex: db,
      table: (name) => `test_${name}`,
      formatDate: (date) => {
        const d = date || new Date()
        return d.toISOString().slice(0, 19).replace('T', ' ')
      }
    }

    // Setup Express app
    app = express()
    app.use(express.json())
    app.use('/api/v1/auth', AuthController(context))
  })

  afterAll(async () => {
    await db.destroy()
  })

  beforeEach(async () => {
    // Clear users before each test
    await db('test_users').del()

    // Insert test user
    await db('test_users').insert({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password: await bcrypt.hash('oldPassword123', 10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  })

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return 200 for existing user', async () => {
      const response = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'test@example.com'
      })

      expect(response.status).toBe(200)
      expect(response.body.message).toContain('If this email exists in our system')
    })

    it('should return 200 for non-existent user (security)', async () => {
      const response = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'nonexistent@example.com'
      })

      expect(response.status).toBe(200)
      expect(response.body.message).toContain('If this email exists in our system')
    })

    it('should create reset token in database for existing user', async () => {
      await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'test@example.com'
      })

      const user = await db('test_users').where('email', 'test@example.com').first()

      expect(user.reset_token).toBeDefined()
      expect(user.reset_token).not.toBeNull()
      expect(user.reset_token_expires_at).toBeDefined()
      expect(user.reset_token_expires_at).not.toBeNull()
    })

    it('should return 400 if email is missing', async () => {
      const response = await request(app).post('/api/v1/auth/forgot-password').send({})

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Email is required')
    })

    it('should return 400 for invalid email format', async () => {
      const response = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'invalid-email'
      })

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('email')
    })

    it('should not create token for deleted user', async () => {
      await db('test_users').where('email', 'test@example.com').update({
        deleted_at: new Date().toISOString()
      })

      const response = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'test@example.com'
      })

      expect(response.status).toBe(200)

      // Check that token was not created
      const user = await db('test_users').where('email', 'test@example.com').first()
      expect(user.reset_token).toBeNull()
    })

    it('should replace existing token if user requests again', async () => {
      // First request
      await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'test@example.com'
      })

      const user1 = await db('test_users').where('email', 'test@example.com').first()
      const firstToken = user1.reset_token

      // Wait a bit to ensure different token
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Second request
      await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'test@example.com'
      })

      const user2 = await db('test_users').where('email', 'test@example.com').first()
      const secondToken = user2.reset_token

      expect(secondToken).not.toBe(firstToken)
    })
  })

  describe('POST /api/v1/auth/validate-reset-token', () => {
    let validToken

    beforeEach(async () => {
      // Create a valid token
      const response = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'test@example.com'
      })

      // Get the token from database (in real scenario it would be from email)
      const user = await db('test_users').where('email', 'test@example.com').first()

      // We need to get the unhashed token
      // For testing purposes, we'll use a known token
      const crypto = await import('crypto')
      validToken = crypto.randomBytes(32).toString('hex')
      const hashedToken = await bcrypt.hash(validToken, 10)

      await db('test_users').where('email', 'test@example.com').update({
        reset_token: hashedToken,
        reset_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      })
    })

    it('should return valid: true for valid token', async () => {
      const response = await request(app).post('/api/v1/auth/validate-reset-token').send({
        token: validToken
      })

      expect(response.status).toBe(200)
      expect(response.body.valid).toBe(true)
    })

    it('should return valid: false for invalid token', async () => {
      const response = await request(app).post('/api/v1/auth/validate-reset-token').send({
        token: 'invalid-token'
      })

      expect(response.status).toBe(401)
      expect(response.body.valid).toBe(false)
    })

    it('should return valid: false for expired token', async () => {
      await db('test_users').where('email', 'test@example.com').update({
        reset_token_expires_at: new Date(Date.now() - 1000 * 60 * 60).toISOString()
      })

      const response = await request(app).post('/api/v1/auth/validate-reset-token').send({
        token: validToken
      })

      expect(response.status).toBe(401)
      expect(response.body.valid).toBe(false)
    })

    it('should return 401 if token is missing', async () => {
      const response = await request(app).post('/api/v1/auth/validate-reset-token').send({})

      expect(response.status).toBe(401)
      expect(response.body.valid).toBe(false)
    })
  })

  describe('POST /api/v1/auth/reset-password', () => {
    let validToken

    beforeEach(async () => {
      const crypto = await import('crypto')
      validToken = crypto.randomBytes(32).toString('hex')
      const hashedToken = await bcrypt.hash(validToken, 10)

      await db('test_users').where('email', 'test@example.com').update({
        reset_token: hashedToken,
        reset_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      })
    })

    it('should reset password with valid token', async () => {
      const response = await request(app).post('/api/v1/auth/reset-password').send({
        token: validToken,
        password: 'NewPassword123!'
      })

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Password has been reset successfully')

      // Verify password was changed
      const user = await db('test_users').where('email', 'test@example.com').first()
      const passwordMatches = await bcrypt.compare('NewPassword123!', user.password)
      expect(passwordMatches).toBe(true)
    })

    it('should clear reset token after successful password reset', async () => {
      await request(app).post('/api/v1/auth/reset-password').send({
        token: validToken,
        password: 'NewPassword123!'
      })

      const user = await db('test_users').where('email', 'test@example.com').first()

      expect(user.reset_token).toBeNull()
      expect(user.reset_token_expires_at).toBeNull()
    })

    it('should return 401 for invalid token', async () => {
      const response = await request(app).post('/api/v1/auth/reset-password').send({
        token: 'invalid-token',
        password: 'NewPassword123!'
      })

      expect(response.status).toBe(401)
      expect(response.body.message).toContain('Invalid or expired')
    })

    it('should return 401 for expired token', async () => {
      await db('test_users').where('email', 'test@example.com').update({
        reset_token_expires_at: new Date(Date.now() - 1000 * 60 * 60).toISOString()
      })

      const response = await request(app).post('/api/v1/auth/reset-password').send({
        token: validToken,
        password: 'NewPassword123!'
      })

      expect(response.status).toBe(401)
      expect(response.body.message).toContain('Invalid or expired')
    })

    it('should return 400 if token is missing', async () => {
      const response = await request(app).post('/api/v1/auth/reset-password').send({
        password: 'NewPassword123!'
      })

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Token and password are required')
    })

    it('should return 400 if password is missing', async () => {
      const response = await request(app).post('/api/v1/auth/reset-password').send({
        token: validToken
      })

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Token and password are required')
    })

    it('should return 400 for invalid password', async () => {
      const response = await request(app).post('/api/v1/auth/reset-password').send({
        token: validToken,
        password: '123' // Too short, missing requirements
      })

      expect(response.status).toBe(400)
      // Password validation returns specific messages
      expect(response.body.message).toMatch(/Password must/)
    })

    it('should not allow token reuse', async () => {
      // First reset
      await request(app).post('/api/v1/auth/reset-password').send({
        token: validToken,
        password: 'NewPassword123!'
      })

      // Try to use same token again
      const response = await request(app).post('/api/v1/auth/reset-password').send({
        token: validToken,
        password: 'AnotherPassword456!'
      })

      expect(response.status).toBe(401)
      expect(response.body.message).toContain('Invalid or expired')

      // Verify password wasn't changed
      const user = await db('test_users').where('email', 'test@example.com').first()
      const passwordMatches = await bcrypt.compare('NewPassword123!', user.password)
      expect(passwordMatches).toBe(true)
    })
  })

  describe('Full password reset flow', () => {
    it('should complete full password reset flow', async () => {
      // Step 1: Request password reset
      const forgotResponse = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'test@example.com'
      })

      expect(forgotResponse.status).toBe(200)

      // Get token from database (simulating email click)
      const crypto = await import('crypto')
      const resetToken = crypto.randomBytes(32).toString('hex')
      const hashedToken = await bcrypt.hash(resetToken, 10)

      await db('test_users').where('email', 'test@example.com').update({
        reset_token: hashedToken
      })

      // Step 2: Validate token
      const validateResponse = await request(app).post('/api/v1/auth/validate-reset-token').send({
        token: resetToken
      })

      expect(validateResponse.status).toBe(200)
      expect(validateResponse.body.valid).toBe(true)

      // Step 3: Reset password
      const resetResponse = await request(app).post('/api/v1/auth/reset-password').send({
        token: resetToken,
        password: 'BrandNewPassword123!'
      })

      expect(resetResponse.status).toBe(200)

      // Step 4: Verify password was changed
      const user = await db('test_users').where('email', 'test@example.com').first()
      const passwordMatches = await bcrypt.compare('BrandNewPassword123!', user.password)
      expect(passwordMatches).toBe(true)

      // Step 5: Verify token was cleared
      expect(user.reset_token).toBeNull()
      expect(user.reset_token_expires_at).toBeNull()
    })
  })
})
