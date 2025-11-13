import { describe, it, expect, beforeEach, vi } from 'vitest'
import UserService from './UserService.mjs'

describe('UserService', () => {
  let userService
  let mockContext

  beforeEach(() => {
    mockContext = {
      knex: vi.fn(),
      table: vi.fn((name) => `test_${name}`)
    }

    userService = new UserService(mockContext)
  })

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const bcrypt = await import('bcrypt')
      const hash = await bcrypt.hash('password123', 10)

      const result = await userService.verifyPassword('password123', hash)

      expect(result).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const bcrypt = await import('bcrypt')
      const hash = await bcrypt.hash('password123', 10)

      const result = await userService.verifyPassword('wrongpassword', hash)

      expect(result).toBe(false)
    })
  })
})
