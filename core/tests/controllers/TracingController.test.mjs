import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import TracingController from '../../controllers/TracingController.ts'
import TraceStorage from '../../services/TraceStorage.mjs'

describe('TracingController', () => {
  let app
  let storage

  beforeEach(() => {
    storage = new TraceStorage({ maxTraces: 100 })

    // Store some test traces
    storage.store(createMockTrace('trace-1', { path: '/api/users', duration: 100 }))
    storage.store(createMockTrace('trace-2', { path: '/api/posts', duration: 200, hasError: true }))
    storage.store(createMockTrace('trace-3', { path: '/api/users', duration: 50 }))

    app = express()

    // Add context middleware
    app.use((req, res, next) => {
      req.context = { traceStorage: storage }
      next()
    })

    app.use('/api/v1/tracing', TracingController)
  })

  afterEach(() => {
    storage.destroy()
  })

  describe('GET /traces', () => {
    it('should return recent traces', async () => {
      const res = await request(app).get('/api/v1/tracing/traces')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(3)
      expect(res.body.pagination).toBeDefined()
    })

    it('should respect limit parameter', async () => {
      const res = await request(app).get('/api/v1/tracing/traces?limit=2')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.pagination.limit).toBe(2)
    })

    it('should respect offset parameter', async () => {
      const res = await request(app).get('/api/v1/tracing/traces?offset=1&limit=2')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.pagination.offset).toBe(1)
    })

    it('should filter by path', async () => {
      const res = await request(app).get('/api/v1/tracing/traces?path=users')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.data.every((t) => t.request.path.includes('users'))).toBe(true)
    })

    it('should filter by minDuration', async () => {
      const res = await request(app).get('/api/v1/tracing/traces?minDuration=100')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
    })

    it('should filter errorsOnly', async () => {
      const res = await request(app).get('/api/v1/tracing/traces?errorsOnly=true')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].traceId).toBe('trace-2')
    })

    it('should return 503 when traceStorage not configured', async () => {
      const noStorageApp = express()
      noStorageApp.use((req, res, next) => {
        req.context = {}
        next()
      })
      noStorageApp.use('/api/v1/tracing', TracingController)

      const res = await request(noStorageApp).get('/api/v1/tracing/traces')

      expect(res.status).toBe(503)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Trace storage not configured')
    })
  })

  describe('GET /traces/:traceId', () => {
    it('should return specific trace', async () => {
      const res = await request(app).get('/api/v1/tracing/traces/trace-1')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.traceId).toBe('trace-1')
    })

    it('should return 404 for non-existent trace', async () => {
      const res = await request(app).get('/api/v1/tracing/traces/non-existent')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Trace not found')
    })
  })

  describe('GET /slowest', () => {
    it('should return slowest traces', async () => {
      const res = await request(app).get('/api/v1/tracing/slowest')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data[0].traceId).toBe('trace-2') // 200ms
      expect(res.body.data[1].traceId).toBe('trace-1') // 100ms
    })

    it('should respect limit parameter', async () => {
      const res = await request(app).get('/api/v1/tracing/slowest?limit=1')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
    })
  })

  describe('GET /errors', () => {
    it('should return error traces', async () => {
      const res = await request(app).get('/api/v1/tracing/errors')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].traceId).toBe('trace-2')
    })

    it('should respect limit parameter', async () => {
      storage.store(createMockTrace('error-2', { hasError: true }))

      const res = await request(app).get('/api/v1/tracing/errors?limit=1')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
    })
  })

  describe('GET /stats', () => {
    it('should return aggregate statistics', async () => {
      const res = await request(app).get('/api/v1/tracing/stats')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.traceCount).toBeDefined()
      expect(res.body.data.avgDuration).toBeDefined()
    })

    it('should accept timeWindow parameter', async () => {
      const res = await request(app).get('/api/v1/tracing/stats?timeWindow=600000')

      expect(res.status).toBe(200)
      expect(res.body.data.timeWindow).toBe(600000)
    })
  })

  describe('GET /bottlenecks', () => {
    it('should return bottleneck analysis', async () => {
      const res = await request(app).get('/api/v1/tracing/bottlenecks')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should respect limit parameter', async () => {
      const res = await request(app).get('/api/v1/tracing/bottlenecks?limit=5')

      expect(res.status).toBe(200)
    })
  })

  describe('GET /waterfall/:traceId', () => {
    it('should return waterfall data', async () => {
      const res = await request(app).get('/api/v1/tracing/waterfall/trace-1')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.traceId).toBe('trace-1')
      expect(res.body.data.waterfall).toBeDefined()
    })

    it('should return 404 for non-existent trace', async () => {
      const res = await request(app).get('/api/v1/tracing/waterfall/non-existent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Trace not found')
    })
  })

  describe('DELETE /traces', () => {
    it('should clear all traces', async () => {
      const res = await request(app).delete('/api/v1/tracing/traces')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('All traces cleared')

      // Verify traces are cleared
      const getRes = await request(app).get('/api/v1/tracing/traces')
      expect(getRes.body.data).toHaveLength(0)
    })
  })

  describe('GET /export', () => {
    it('should export traces as JSON', async () => {
      const res = await request(app).get('/api/v1/tracing/export')

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('application/json')
      expect(res.headers['content-disposition']).toContain('attachment')

      const data = JSON.parse(res.text)
      expect(data.traces).toBeDefined()
      expect(data.exportedAt).toBeDefined()
    })
  })

  describe('GET /config', () => {
    it('should return tracing configuration', async () => {
      const res = await request(app).get('/api/v1/tracing/config')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.enabled).toBeDefined()
      expect(res.body.data.sampleRate).toBeDefined()
      expect(res.body.data.storage).toBeDefined()
    })

    it('should include storage type', async () => {
      const res = await request(app).get('/api/v1/tracing/config')

      expect(res.body.data.storage.type).toBe('TraceStorage')
    })
  })
})

describe('TracingController with async storage', () => {
  let app
  let asyncStorage

  beforeEach(() => {
    // Mock async storage
    asyncStorage = {
      getRecent: vi.fn().mockResolvedValue([createMockTrace('async-1')]),
      get: vi.fn().mockResolvedValue(createMockTrace('async-1')),
      getSlowest: vi.fn().mockResolvedValue([createMockTrace('async-1')]),
      getErrors: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({
        traceCount: 1,
        avgDuration: 100,
        minDuration: 100,
        maxDuration: 100,
        p50Duration: 100,
        p95Duration: 100,
        p99Duration: 100,
        errorRate: '0%',
        byPath: {},
        storage: {}
      }),
      clear: vi.fn().mockResolvedValue(undefined),
      toJSON: vi.fn().mockResolvedValue(JSON.stringify({ traces: [], stats: {}, exportedAt: new Date().toISOString() })),
      count: vi.fn().mockResolvedValue(1),
      constructor: { name: 'TraceStorageDB' },
      memoryCacheSize: 100,
      retentionDays: 30,
      archiveAfterDays: 7
    }

    app = express()
    app.use((req, res, next) => {
      req.context = { traceStorage: asyncStorage }
      next()
    })
    app.use('/api/v1/tracing', TracingController)
  })

  it('should handle async getRecent', async () => {
    const res = await request(app).get('/api/v1/tracing/traces')

    expect(res.status).toBe(200)
    expect(asyncStorage.getRecent).toHaveBeenCalled()
  })

  it('should handle async get', async () => {
    const res = await request(app).get('/api/v1/tracing/traces/async-1')

    expect(res.status).toBe(200)
    expect(asyncStorage.get).toHaveBeenCalledWith('async-1')
  })

  it('should handle async clear', async () => {
    const res = await request(app).delete('/api/v1/tracing/traces')

    expect(res.status).toBe(200)
    expect(asyncStorage.clear).toHaveBeenCalled()
  })

  it('should handle async toJSON', async () => {
    const res = await request(app).get('/api/v1/tracing/export')

    expect(res.status).toBe(200)
    expect(asyncStorage.toJSON).toHaveBeenCalled()
  })

  it('should handle async count in config', async () => {
    const res = await request(app).get('/api/v1/tracing/config')

    expect(res.status).toBe(200)
    expect(asyncStorage.count).toHaveBeenCalled()
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
    ],
    storedAt: Date.now()
  }
}
