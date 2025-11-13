/**
 * Test setup file
 * Runs before all tests
 */

import { beforeAll, afterAll } from 'vitest'

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test'
  process.env.TABLE_PREFIX = 'test_'
  process.env.JWT_SECRET = 'test-secret'
  process.env.REFRESH_SECRET = 'test-refresh-secret'
})

afterAll(async () => {
  // Cleanup
})
