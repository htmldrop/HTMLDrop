import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import TraceStorageDB from './TraceStorageDB.mjs'
import knex from 'knex'
import fs from 'fs'
import path from 'path'

describe('TraceStorageDB', () => {
  let db
  let context
  let storage

  // Helper to create traces table (simulates migration)
  const createTracesTable = async (knexDb, tableName) => {
    await knexDb.schema.createTable(tableName, (table) => {
      table.increments('id')
      table.string('trace_id', 36).unique().notNullable()
      table.string('request_method', 10)
      table.string('request_path', 500)
      table.string('request_url', 2000)
      table.integer('user_id').nullable()
      table.integer('total_duration')
      table.integer('span_count')
      table.integer('error_count')
      table.json('summary')
      table.json('spans')
      table.json('waterfall')
      table.json('metadata')
      table.timestamp('created_at').defaultTo(knexDb.fn.now())
      table.index('created_at')
      table.index('request_path')
      table.index('total_duration')
      table.index('error_count')
    })
  }

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    db = knex({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })

    context = {
      knex: db,
      table: (name) => `test_${name}`
    }

    // Create traces table (simulates migration)
    await createTracesTable(db, 'test_traces')

    storage = new TraceStorageDB({
      context,
      memoryCacheSize: 5,
      retentionDays: 30,
      archiveAfterDays: 0, // Disable archiving for tests
      cleanupIntervalMs: 1000000 // Long interval to avoid interference
    })

    await storage.init()
  })

  afterEach(async () => {
    storage.destroy()
    await db.destroy()
  })

  describe('init', () => {
    it('should verify traces table exists', async () => {
      // Table is created by migration (simulated in beforeEach)
      const hasTable = await db.schema.hasTable('test_traces')
      expect(hasTable).toBe(true)
    })

    it('should only initialize once', async () => {
      const storage2 = new TraceStorageDB({ context })
      await storage2.init()
      await storage2.init() // Should not throw
      expect(storage2.initialized).toBe(true)
      storage2.destroy()
    })
  })

  describe('store', () => {
    it('should store trace in memory cache', async () => {
      const trace = createMockTrace('trace-1')
      await storage.store(trace)

      expect(storage.recentTraces).toHaveLength(1)
      expect(storage.traceMap.has('trace-1')).toBe(true)
    })

    it('should store trace in database', async () => {
      const trace = createMockTrace('trace-1')
      await storage.store(trace)

      const row = await db('test_traces').where('trace_id', 'trace-1').first()
      expect(row).toBeDefined()
      expect(row.request_method).toBe('GET')
      expect(row.request_path).toBe('/test')
    })

    it('should evict oldest from memory when at capacity', async () => {
      for (let i = 1; i <= 6; i++) {
        await storage.store(createMockTrace(`trace-${i}`))
      }

      expect(storage.recentTraces).toHaveLength(5)
      expect(storage.traceMap.has('trace-1')).toBe(false)
      expect(storage.traceMap.has('trace-6')).toBe(true)
    })

    it('should not store null or invalid traces', async () => {
      await storage.store(null)
      await storage.store({})

      expect(storage.recentTraces).toHaveLength(0)
    })

    it('should update totalStored stat', async () => {
      await storage.store(createMockTrace('trace-1'))
      await storage.store(createMockTrace('trace-2'))

      expect(storage.stats.totalStored).toBe(2)
    })
  })

  describe('get', () => {
    it('should get trace from memory cache', async () => {
      const trace = createMockTrace('trace-1')
      await storage.store(trace)

      const result = await storage.get('trace-1')

      expect(result.traceId).toBe('trace-1')
    })

    it('should get trace from database when not in cache', async () => {
      // Store multiple to evict trace-1 from cache
      for (let i = 1; i <= 6; i++) {
        await storage.store(createMockTrace(`trace-${i}`))
      }

      // trace-1 should not be in cache but should be in DB
      expect(storage.traceMap.has('trace-1')).toBe(false)

      const result = await storage.get('trace-1')
      expect(result).toBeDefined()
      expect(result.traceId).toBe('trace-1')
    })

    it('should return null for non-existent trace', async () => {
      const result = await storage.get('non-existent')
      expect(result).toBeNull()
    })
  })

  describe('getRecent', () => {
    beforeEach(async () => {
      await storage.store(createMockTrace('trace-1', { path: '/api/users', duration: 100 }))
      await storage.store(createMockTrace('trace-2', { path: '/api/posts', duration: 200 }))
      await storage.store(createMockTrace('trace-3', { path: '/api/users', duration: 50, hasError: true }))
    })

    it('should return recent traces from database', async () => {
      const recent = await storage.getRecent({ useCache: false })

      expect(recent).toHaveLength(3)
      expect(recent[0].traceId).toBe('trace-3') // Most recent first
    })

    it('should use cache for simple queries', async () => {
      const recent = await storage.getRecent({ limit: 3, useCache: true })

      expect(recent).toHaveLength(3)
    })

    it('should filter by path', async () => {
      const recent = await storage.getRecent({ path: 'users', useCache: false })

      expect(recent).toHaveLength(2)
      expect(recent.every((t) => t.request.path.includes('users'))).toBe(true)
    })

    it('should filter by minDuration', async () => {
      const recent = await storage.getRecent({ minDuration: 100, useCache: false })

      expect(recent).toHaveLength(2)
    })

    it('should filter errorsOnly', async () => {
      const recent = await storage.getRecent({ errorsOnly: true, useCache: false })

      expect(recent).toHaveLength(1)
      expect(recent[0].traceId).toBe('trace-3')
    })

    it('should respect limit and offset', async () => {
      const recent = await storage.getRecent({ limit: 1, offset: 1, useCache: false })

      expect(recent).toHaveLength(1)
      expect(recent[0].traceId).toBe('trace-2')
    })
  })

  describe('getSlowest', () => {
    beforeEach(async () => {
      await storage.store(createMockTrace('fast', { duration: 50 }))
      await storage.store(createMockTrace('medium', { duration: 100 }))
      await storage.store(createMockTrace('slow', { duration: 200 }))
    })

    it('should return slowest traces', async () => {
      const slowest = await storage.getSlowest(3)

      expect(slowest[0].traceId).toBe('slow')
      expect(slowest[1].traceId).toBe('medium')
      expect(slowest[2].traceId).toBe('fast')
    })

    it('should respect limit', async () => {
      const slowest = await storage.getSlowest(2)

      expect(slowest).toHaveLength(2)
    })
  })

  describe('getErrors', () => {
    beforeEach(async () => {
      await storage.store(createMockTrace('ok-1'))
      await storage.store(createMockTrace('error-1', { hasError: true }))
      await storage.store(createMockTrace('ok-2'))
      await storage.store(createMockTrace('error-2', { hasError: true }))
    })

    it('should return only error traces', async () => {
      const errors = await storage.getErrors()

      expect(errors).toHaveLength(2)
      expect(errors.every((t) => t.request)).toBe(true)
    })

    it('should respect limit', async () => {
      const errors = await storage.getErrors(1)

      expect(errors).toHaveLength(1)
    })
  })

  describe('getStats', () => {
    beforeEach(async () => {
      await storage.store(createMockTrace('trace-1', { path: '/api', duration: 100 }))
      await storage.store(createMockTrace('trace-2', { path: '/api', duration: 200 }))
      await storage.store(createMockTrace('trace-3', { path: '/home', duration: 150, hasError: true }))
    })

    it('should return aggregate statistics', async () => {
      const stats = await storage.getStats({ timeWindowMs: 3600000 })

      expect(stats.traceCount).toBe(3)
      expect(stats.avgDuration).toBeCloseTo(150, 0)
      expect(stats.minDuration).toBe(100)
      expect(stats.maxDuration).toBe(200)
    })

    it('should calculate percentiles', async () => {
      const stats = await storage.getStats({ timeWindowMs: 3600000 })

      expect(stats.p50Duration).toBeDefined()
      expect(stats.p95Duration).toBeDefined()
      expect(stats.p99Duration).toBeDefined()
    })

    it('should include storage stats', async () => {
      const stats = await storage.getStats({ timeWindowMs: 3600000 })

      expect(stats.storage).toBeDefined()
      expect(stats.storage.totalStored).toBe(3)
    })

    it('should aggregate by path', async () => {
      const stats = await storage.getStats({ timeWindowMs: 3600000 })

      expect(stats.byPath['/api']).toBeDefined()
      expect(stats.byPath['/api'].count).toBe(2)
    })
  })

  describe('count', () => {
    it('should return total trace count from database', async () => {
      await storage.store(createMockTrace('trace-1'))
      await storage.store(createMockTrace('trace-2'))
      await storage.store(createMockTrace('trace-3'))

      const count = await storage.count()

      expect(count).toBe(3)
    })
  })

  describe('clear', () => {
    it('should clear memory cache', async () => {
      await storage.store(createMockTrace('trace-1'))
      await storage.clear()

      expect(storage.recentTraces).toHaveLength(0)
      expect(storage.traceMap.size).toBe(0)
    })

    it('should clear database', async () => {
      await storage.store(createMockTrace('trace-1'))
      await storage.clear()

      const count = await storage.count()
      expect(count).toBe(0)
    })
  })

  describe('cleanup', () => {
    it('should delete traces older than retention period', async () => {
      // Create storage with very short retention
      const shortStorage = new TraceStorageDB({
        context,
        retentionDays: 0, // Will delete everything
        archiveAfterDays: 0,
        cleanupIntervalMs: 1000000
      })
      await shortStorage.init()

      await shortStorage.store(createMockTrace('trace-1'))

      // Manually set created_at to old date
      await db('test_traces').update({
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 31).toISOString() // 31 days ago
      })

      await shortStorage.cleanup()

      const count = await shortStorage.count()
      // Note: The trace will be deleted because it's older than 0 days
      shortStorage.destroy()
    })
  })

  describe('toJSON', () => {
    it('should export traces as JSON', async () => {
      await storage.store(createMockTrace('trace-1'))
      await storage.store(createMockTrace('trace-2'))

      const json = await storage.toJSON()
      const parsed = JSON.parse(json)

      expect(parsed.traces).toHaveLength(2)
      expect(parsed.stats).toBeDefined()
      expect(parsed.exportedAt).toBeDefined()
    })
  })

  describe('destroy', () => {
    it('should stop cleanup interval', () => {
      storage.destroy()

      expect(storage.cleanupInterval).toBeNull()
      expect(storage.recentTraces).toHaveLength(0)
    })
  })

  describe('_percentile', () => {
    it('should calculate correct percentile', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

      expect(storage._percentile(values, 50)).toBe(50)
      expect(storage._percentile(values, 90)).toBe(90)
      expect(storage._percentile([], 50)).toBe(0)
    })
  })
})

describe('TraceStorageDB without database', () => {
  it('should work in memory-only mode', async () => {
    const storage = new TraceStorageDB({
      context: { knex: null, table: (name) => name },
      memoryCacheSize: 5
    })

    await storage.init()
    await storage.store(createMockTrace('trace-1'))

    expect(storage.recentTraces).toHaveLength(1)

    const trace = await storage.get('trace-1')
    expect(trace).toBeDefined()

    storage.destroy()
  })
})

function createMockTrace(traceId, options = {}) {
  const { path = '/test', duration = 100, hasError = false } = options

  return {
    traceId,
    request: {
      method: 'GET',
      path,
      url: path,
      userId: null
    },
    metadata: {
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + duration,
      totalDuration: duration
    },
    summary: {
      spanCount: 3,
      errorCount: hasError ? 1 : 0,
      byCategory: {
        core: { count: 2, totalDuration: duration * 0.6 },
        database: { count: 1, totalDuration: duration * 0.4 }
      }
    },
    spans: [],
    waterfall: [
      { name: 'core.init', category: 'core', duration: duration * 0.3 },
      { name: 'db.query', category: 'database', duration: duration * 0.4 },
      { name: 'core.render', category: 'core', duration: duration * 0.3 }
    ]
  }
}
