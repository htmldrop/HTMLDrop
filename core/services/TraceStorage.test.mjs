import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import TraceStorage from './TraceStorage.ts'

describe('TraceStorage', () => {
  let storage

  beforeEach(() => {
    storage = new TraceStorage({
      maxTraces: 5,
      maxAgeMs: 60000 // 1 minute for tests
    })
  })

  afterEach(() => {
    storage.destroy()
  })

  describe('constructor', () => {
    it('should create storage with default options', () => {
      const defaultStorage = new TraceStorage()
      expect(defaultStorage.maxTraces).toBe(100)
      expect(defaultStorage.maxAgeMs).toBe(3600000) // 1 hour
      defaultStorage.destroy()
    })

    it('should accept custom options', () => {
      expect(storage.maxTraces).toBe(5)
      expect(storage.maxAgeMs).toBe(60000)
    })
  })

  describe('store', () => {
    it('should store a trace', () => {
      const trace = createMockTrace('trace-1')

      storage.store(trace)

      expect(storage.traces).toHaveLength(1)
      expect(storage.get('trace-1')).toBeDefined()
    })

    it('should add storedAt timestamp', () => {
      const trace = createMockTrace('trace-1')

      storage.store(trace)

      expect(storage.get('trace-1').storedAt).toBeDefined()
    })

    it('should not store null or traces without traceId', () => {
      storage.store(null)
      storage.store({})
      storage.store({ foo: 'bar' })

      expect(storage.traces).toHaveLength(0)
    })

    it('should evict oldest trace when at capacity', () => {
      for (let i = 1; i <= 6; i++) {
        storage.store(createMockTrace(`trace-${i}`))
      }

      expect(storage.traces).toHaveLength(5)
      expect(storage.get('trace-1')).toBeNull()
      expect(storage.get('trace-6')).toBeDefined()
    })

    it('should update statistics', () => {
      storage.store(createMockTrace('trace-1'))
      storage.store(createMockTrace('trace-2'))

      expect(storage.stats.totalStored).toBe(2)
    })

    it('should track evictions', () => {
      for (let i = 1; i <= 6; i++) {
        storage.store(createMockTrace(`trace-${i}`))
      }

      expect(storage.stats.totalEvicted).toBe(1)
    })
  })

  describe('get', () => {
    it('should return trace by ID', () => {
      const trace = createMockTrace('trace-1')
      storage.store(trace)

      const result = storage.get('trace-1')

      expect(result.traceId).toBe('trace-1')
    })

    it('should return null for non-existent ID', () => {
      expect(storage.get('non-existent')).toBeNull()
    })
  })

  describe('getRecent', () => {
    beforeEach(() => {
      storage.store(createMockTrace('trace-1', { path: '/api/users', duration: 100 }))
      storage.store(createMockTrace('trace-2', { path: '/api/posts', duration: 200 }))
      storage.store(createMockTrace('trace-3', { path: '/api/users', duration: 50, hasError: true }))
    })

    it('should return traces in reverse order (newest first)', () => {
      const recent = storage.getRecent()

      expect(recent[0].traceId).toBe('trace-3')
      expect(recent[1].traceId).toBe('trace-2')
      expect(recent[2].traceId).toBe('trace-1')
    })

    it('should respect limit option', () => {
      const recent = storage.getRecent({ limit: 2 })

      expect(recent).toHaveLength(2)
    })

    it('should respect offset option', () => {
      const recent = storage.getRecent({ offset: 1, limit: 2 })

      expect(recent).toHaveLength(2)
      expect(recent[0].traceId).toBe('trace-2')
    })

    it('should filter by path', () => {
      const recent = storage.getRecent({ path: 'users' })

      expect(recent).toHaveLength(2)
      expect(recent.every((t) => t.request.path.includes('users'))).toBe(true)
    })

    it('should filter by minDuration', () => {
      const recent = storage.getRecent({ minDuration: 100 })

      expect(recent).toHaveLength(2)
      expect(recent.every((t) => t.metadata.totalDuration >= 100)).toBe(true)
    })

    it('should filter errorsOnly', () => {
      const recent = storage.getRecent({ errorsOnly: true })

      expect(recent).toHaveLength(1)
      expect(recent[0].traceId).toBe('trace-3')
    })
  })

  describe('getSlowest', () => {
    beforeEach(() => {
      storage.store(createMockTrace('fast', { duration: 50 }))
      storage.store(createMockTrace('medium', { duration: 100 }))
      storage.store(createMockTrace('slow', { duration: 200 }))
    })

    it('should return traces sorted by duration descending', () => {
      const slowest = storage.getSlowest(3)

      expect(slowest[0].traceId).toBe('slow')
      expect(slowest[1].traceId).toBe('medium')
      expect(slowest[2].traceId).toBe('fast')
    })

    it('should respect limit', () => {
      const slowest = storage.getSlowest(2)

      expect(slowest).toHaveLength(2)
    })
  })

  describe('getErrors', () => {
    beforeEach(() => {
      storage.store(createMockTrace('ok-1'))
      storage.store(createMockTrace('error-1', { hasError: true }))
      storage.store(createMockTrace('ok-2'))
      storage.store(createMockTrace('error-2', { hasError: true }))
    })

    it('should return only traces with errors', () => {
      const errors = storage.getErrors()

      expect(errors).toHaveLength(2)
      expect(errors.every((t) => t.summary.errorCount > 0)).toBe(true)
    })

    it('should return in reverse order', () => {
      const errors = storage.getErrors()

      expect(errors[0].traceId).toBe('error-2')
      expect(errors[1].traceId).toBe('error-1')
    })

    it('should respect limit', () => {
      const errors = storage.getErrors(1)

      expect(errors).toHaveLength(1)
    })
  })

  describe('getStats', () => {
    beforeEach(() => {
      storage.store(createMockTrace('trace-1', { path: '/api', duration: 100 }))
      storage.store(createMockTrace('trace-2', { path: '/api', duration: 200 }))
      storage.store(createMockTrace('trace-3', { path: '/home', duration: 150, hasError: true }))
    })

    it('should return aggregate statistics', () => {
      const stats = storage.getStats({ timeWindowMs: 60000 })

      expect(stats.traceCount).toBe(3)
      expect(stats.avgDuration).toBe(150)
      expect(stats.minDuration).toBe(100)
      expect(stats.maxDuration).toBe(200)
    })

    it('should calculate percentiles', () => {
      const stats = storage.getStats({ timeWindowMs: 60000 })

      expect(stats.p50Duration).toBeDefined()
      expect(stats.p95Duration).toBeDefined()
      expect(stats.p99Duration).toBeDefined()
    })

    it('should calculate error rate', () => {
      const stats = storage.getStats({ timeWindowMs: 60000 })

      expect(stats.errorRate).toBe('33.33%')
    })

    it('should aggregate by path', () => {
      const stats = storage.getStats({ timeWindowMs: 60000 })

      expect(stats.byPath['/api']).toBeDefined()
      expect(stats.byPath['/api'].count).toBe(2)
      expect(stats.byPath['/home']).toBeDefined()
      expect(stats.byPath['/home'].count).toBe(1)
    })

    it('should return empty stats for no traces in time window', () => {
      const emptyStorage = new TraceStorage()
      const stats = emptyStorage.getStats()

      expect(stats.traceCount).toBe(0)
      expect(stats.avgDuration).toBe(0)
      emptyStorage.destroy()
    })
  })

  describe('findBottlenecks', () => {
    beforeEach(() => {
      storage.store({
        traceId: 'trace-1',
        waterfall: [
          { name: 'db.query', category: 'database', duration: 50 },
          { name: 'render', category: 'render', duration: 30 },
          { name: 'db.query', category: 'database', duration: 60 }
        ],
        storedAt: Date.now()
      })
      storage.store({
        traceId: 'trace-2',
        waterfall: [
          { name: 'db.query', category: 'database', duration: 55 },
          { name: 'render', category: 'render', duration: 25 }
        ],
        storedAt: Date.now()
      })
    })

    it('should identify bottlenecks across traces', () => {
      const bottlenecks = storage.findBottlenecks({ timeWindowMs: 60000 })

      expect(bottlenecks.length).toBeGreaterThan(0)
      expect(bottlenecks[0].name).toBe('db.query')
      expect(bottlenecks[0].count).toBe(3)
    })

    it('should calculate statistics per operation', () => {
      const bottlenecks = storage.findBottlenecks({ timeWindowMs: 60000 })
      const dbQuery = bottlenecks.find((b) => b.name === 'db.query')

      expect(dbQuery.avgDuration).toBeDefined()
      expect(dbQuery.maxDuration).toBeDefined()
      expect(dbQuery.totalImpact).toBeDefined()
      expect(dbQuery.stdDev).toBeDefined()
    })

    it('should respect limit', () => {
      const bottlenecks = storage.findBottlenecks({ limit: 1 })

      expect(bottlenecks).toHaveLength(1)
    })
  })

  describe('cleanup', () => {
    it('should remove traces older than maxAgeMs', async () => {
      const oldStorage = new TraceStorage({ maxAgeMs: 50 })

      oldStorage.store(createMockTrace('old'))

      // Wait for trace to expire
      await new Promise((resolve) => setTimeout(resolve, 100))

      oldStorage.cleanup()

      expect(oldStorage.traces).toHaveLength(0)
      oldStorage.destroy()
    })

    it('should update eviction stats', async () => {
      const oldStorage = new TraceStorage({ maxAgeMs: 50 })

      oldStorage.store(createMockTrace('old'))
      await new Promise((resolve) => setTimeout(resolve, 100))
      oldStorage.cleanup()

      expect(oldStorage.stats.totalEvicted).toBe(1)
      oldStorage.destroy()
    })
  })

  describe('clear', () => {
    it('should remove all traces', () => {
      storage.store(createMockTrace('trace-1'))
      storage.store(createMockTrace('trace-2'))

      storage.clear()

      expect(storage.traces).toHaveLength(0)
      expect(storage.get('trace-1')).toBeNull()
    })

    it('should preserve cumulative stats', () => {
      storage.store(createMockTrace('trace-1'))
      storage.store(createMockTrace('trace-2'))
      const storedBefore = storage.stats.totalStored

      storage.clear()

      expect(storage.stats.totalStored).toBe(storedBefore)
    })
  })

  describe('destroy', () => {
    it('should stop cleanup interval and clear data', () => {
      storage.store(createMockTrace('trace-1'))

      storage.destroy()

      expect(storage.cleanupInterval).toBeNull()
      expect(storage.traces).toHaveLength(0)
    })
  })

  describe('toJSON', () => {
    it('should export traces as JSON string', () => {
      storage.store(createMockTrace('trace-1'))
      storage.store(createMockTrace('trace-2'))

      const json = storage.toJSON()
      const parsed = JSON.parse(json)

      expect(parsed.traces).toHaveLength(2)
      expect(parsed.stats).toBeDefined()
      expect(parsed.exportedAt).toBeDefined()
    })
  })
})

function createMockTrace(traceId, options = {}) {
  const { path = '/test', duration = 100, hasError = false } = options

  return {
    traceId,
    request: {
      method: 'GET',
      path,
      url: path
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
