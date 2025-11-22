import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PasswordResetService from '../../services/PasswordResetService.mjs'
import bcrypt from 'bcrypt'
import knex from 'knex'

describe('PasswordResetService', () => {
  let db
  let context
  let passwordResetService

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    db = knex({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })

    // Create users table
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

    // Create test user
    await db('test_users').insert({
      username: 'testuser',
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    // Create context
    context = {
      knex: db,
      table: (name) => `test_${name}`
    }

    passwordResetService = new PasswordResetService(context)
  })

  afterEach(async () => {
    await db.destroy()
  })

  describe('generateToken', () => {
    it('should generate a random token', () => {
      const token1 = passwordResetService.generateToken()
      const token2 = passwordResetService.generateToken()

      expect(token1).toBeDefined()
      expect(token1).toHaveLength(64) // 32 bytes * 2 (hex)
      expect(token1).not.toBe(token2)
    })
  })

  describe('createResetToken', () => {
    it('should create reset token for existing user', async () => {
      const result = await passwordResetService.createResetToken('test@example.com')

      expect(result).toBeDefined()
      expect(result.user).toBeDefined()
      expect(result.user.email).toBe('test@example.com')
      expect(result.user.username).toBe('testuser')
      expect(result.token).toBeDefined()
      expect(result.token).toHaveLength(64)
      expect(result.expiresAt).toBeInstanceOf(Date)
    })

    it('should store hashed token in database', async () => {
      const result = await passwordResetService.createResetToken('test@example.com')

      const user = await db('test_users').where('email', 'test@example.com').first()

      expect(user.reset_token).toBeDefined()
      expect(user.reset_token).not.toBe(result.token) // Should be hashed
      expect(user.reset_token_expires_at).toBeDefined()

      // Verify the hash matches the original token
      const isValid = await bcrypt.compare(result.token, user.reset_token)
      expect(isValid).toBe(true)
    })

    it('should set expiry time to 60 minutes by default', async () => {
      const beforeCreate = new Date()
      const result = await passwordResetService.createResetToken('test@example.com')
      const afterCreate = new Date()

      const expectedExpiry = new Date(beforeCreate.getTime() + 60 * 60 * 1000)

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry.getTime())
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(new Date(afterCreate.getTime() + 60 * 60 * 1000).getTime())
    })

    it('should throw error for non-existent user', async () => {
      await expect(passwordResetService.createResetToken('nonexistent@example.com')).rejects.toThrow(
        'If this email exists in our system, a password reset link will be sent.'
      )
    })

    it('should not create token for deleted user', async () => {
      await db('test_users').where('email', 'test@example.com').update({
        deleted_at: new Date().toISOString()
      })

      await expect(passwordResetService.createResetToken('test@example.com')).rejects.toThrow()
    })

    it('should replace existing token if one exists', async () => {
      // Create first token
      const firstResult = await passwordResetService.createResetToken('test@example.com')

      // Create second token
      const secondResult = await passwordResetService.createResetToken('test@example.com')

      expect(secondResult.token).not.toBe(firstResult.token)

      // Verify only the second token is valid
      const user = await db('test_users').where('email', 'test@example.com').first()
      const firstValid = await bcrypt.compare(firstResult.token, user.reset_token)
      const secondValid = await bcrypt.compare(secondResult.token, user.reset_token)

      expect(firstValid).toBe(false)
      expect(secondValid).toBe(true)
    })
  })

  describe('validateResetToken', () => {
    it('should validate a valid token', async () => {
      const { token } = await passwordResetService.createResetToken('test@example.com')

      const user = await passwordResetService.validateResetToken(token)

      expect(user).toBeDefined()
      expect(user.email).toBe('test@example.com')
      expect(user.username).toBe('testuser')
    })

    it('should throw error for invalid token', async () => {
      await expect(passwordResetService.validateResetToken('invalid-token')).rejects.toThrow(
        'Invalid or expired reset token'
      )
    })

    it('should throw error for null/undefined token', async () => {
      await expect(passwordResetService.validateResetToken(null)).rejects.toThrow('Invalid or expired reset token')
      await expect(passwordResetService.validateResetToken(undefined)).rejects.toThrow('Invalid or expired reset token')
    })

    it('should throw error for expired token', async () => {
      const { token } = await passwordResetService.createResetToken('test@example.com')

      // Set expiry time to past
      const pastDate = new Date()
      pastDate.setHours(pastDate.getHours() - 2)

      await db('test_users').where('email', 'test@example.com').update({
        reset_token_expires_at: pastDate.toISOString()
      })

      await expect(passwordResetService.validateResetToken(token)).rejects.toThrow('Invalid or expired reset token')
    })

    it('should not validate token for deleted user', async () => {
      const { token } = await passwordResetService.createResetToken('test@example.com')

      await db('test_users').where('email', 'test@example.com').update({
        deleted_at: new Date().toISOString()
      })

      await expect(passwordResetService.validateResetToken(token)).rejects.toThrow('Invalid or expired reset token')
    })
  })

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      const { token } = await passwordResetService.createResetToken('test@example.com')

      const result = await passwordResetService.resetPassword(token, 'newPassword123')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Password has been reset successfully')

      // Verify password was changed
      const user = await db('test_users').where('email', 'test@example.com').first()
      const passwordMatches = await bcrypt.compare('newPassword123', user.password)
      expect(passwordMatches).toBe(true)
    })

    it('should clear reset token after successful password reset', async () => {
      const { token } = await passwordResetService.createResetToken('test@example.com')

      await passwordResetService.resetPassword(token, 'newPassword123')

      const user = await db('test_users').where('email', 'test@example.com').first()

      expect(user.reset_token).toBeNull()
      expect(user.reset_token_expires_at).toBeNull()
    })

    it('should throw error for invalid token', async () => {
      await expect(passwordResetService.resetPassword('invalid-token', 'newPassword123')).rejects.toThrow(
        'Invalid or expired reset token'
      )
    })

    it('should throw error for expired token', async () => {
      const { token } = await passwordResetService.createResetToken('test@example.com')

      // Expire the token
      const pastDate = new Date()
      pastDate.setHours(pastDate.getHours() - 2)

      await db('test_users').where('email', 'test@example.com').update({
        reset_token_expires_at: pastDate.toISOString()
      })

      await expect(passwordResetService.resetPassword(token, 'newPassword123')).rejects.toThrow(
        'Invalid or expired reset token'
      )
    })

    it('should hash the new password', async () => {
      const { token } = await passwordResetService.createResetToken('test@example.com')

      await passwordResetService.resetPassword(token, 'newPassword123')

      const user = await db('test_users').where('email', 'test@example.com').first()

      // Password should not be stored in plain text
      expect(user.password).not.toBe('newPassword123')
      // But should match when compared with bcrypt
      const passwordMatches = await bcrypt.compare('newPassword123', user.password)
      expect(passwordMatches).toBe(true)
    })
  })

  describe('clearExpiredTokens', () => {
    it('should clear expired tokens', async () => {
      // Create user with expired token
      await db('test_users').insert({
        username: 'user2',
        email: 'user2@example.com',
        password: await bcrypt.hash('password', 10),
        reset_token: await bcrypt.hash('expired-token', 10),
        reset_token_expires_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      const cleared = await passwordResetService.clearExpiredTokens()

      expect(cleared).toBe(1)

      const user = await db('test_users').where('email', 'user2@example.com').first()
      expect(user.reset_token).toBeNull()
      expect(user.reset_token_expires_at).toBeNull()
    })

    it('should not clear valid tokens', async () => {
      const { token } = await passwordResetService.createResetToken('test@example.com')

      const cleared = await passwordResetService.clearExpiredTokens()

      expect(cleared).toBe(0)

      const user = await db('test_users').where('email', 'test@example.com').first()
      expect(user.reset_token).not.toBeNull()
      const isValid = await bcrypt.compare(token, user.reset_token)
      expect(isValid).toBe(true)
    })

    it('should return count of cleared tokens', async () => {
      // Create multiple users with expired tokens
      for (let i = 1; i <= 3; i++) {
        await db('test_users').insert({
          username: `user${i}`,
          email: `user${i}@example.com`,
          password: await bcrypt.hash('password', 10),
          reset_token: await bcrypt.hash(`token-${i}`, 10),
          reset_token_expires_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }

      const cleared = await passwordResetService.clearExpiredTokens()

      expect(cleared).toBe(3)
    })
  })
})
