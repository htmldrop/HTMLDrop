import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PerformanceTracer, { TraceSpan, TraceCategory } from './PerformanceTracer.ts'

describe('PerformanceTracer', () => {
  let tracer

  beforeEach(() => {
    tracer = new PerformanceTracer()
  })

  describe('constructor', () => {
    it('should create a tracer with default options', () => {
      expect(tracer.traceId).toBeDefined()
      expect(tracer.traceId).toMatch(/^[a-f0-9-]{36}$/)
      expect(tracer.enabled).toBe(true)
      expect(tracer.sampleRate).toBe(1.0)
      expect(tracer.spans).toEqual([])
    })

    it('should accept custom traceId', () => {
      const customTracer = new PerformanceTracer({ traceId: 'custom-trace-id' })
      expect(customTracer.traceId).toBe('custom-trace-id')
    })

    it('should respect enabled option', () => {
      const disabledTracer = new PerformanceTracer({ enabled: false })
      expect(disabledTracer.enabled).toBe(false)
    })

    it('should disable tracing when sample rate fails', () => {
      // Mock Math.random to return a high value
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9)

      const sampledTracer = new PerformanceTracer({ sampleRate: 0.5 })
      expect(sampledTracer.enabled).toBe(false)

      mockRandom.mockRestore()
    })

    it('should enable tracing when sample rate passes', () => {
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.3)

      const sampledTracer = new PerformanceTracer({ sampleRate: 0.5 })
      expect(sampledTracer.enabled).toBe(true)

      mockRandom.mockRestore()
    })
  })

  describe('setRequest', () => {
    it('should set request information', () => {
      const mockReq = {
        method: 'GET',
        originalUrl: '/test/path?foo=bar',
        path: '/test/path',
        query: { foo: 'bar' },
        get: (header) => (header === 'user-agent' ? 'Test Agent' : null),
        ip: '127.0.0.1',
        user: { id: 123 }
      }

      tracer.setRequest(mockReq)

      expect(tracer.request).toEqual({
        method: 'GET',
        url: '/test/path?foo=bar',
        path: '/test/path',
        query: { foo: 'bar' },
        userAgent: 'Test Agent',
        ip: '127.0.0.1',
        userId: 123
      })
    })

    it('should handle missing user', () => {
      const mockReq = {
        method: 'POST',
        url: '/api/test',
        path: '/api/test',
        query: {},
        get: () => null,
        ip: null
      }

      tracer.setRequest(mockReq)

      expect(tracer.request.userId).toBeNull()
    })
  })

  describe('startSpan', () => {
    it('should create a span with name', () => {
      const span = tracer.startSpan('test.operation')

      expect(span.name).toBe('test.operation')
      expect(span.id).toBeDefined()
      expect(tracer.spans).toHaveLength(1)
    })

    it('should create span with category and tags', () => {
      const span = tracer.startSpan('db.query', {
        category: 'database',
        tags: { table: 'users' }
      })

      expect(span.category).toBe('database')
      expect(span.tags.table).toBe('users')
    })

    it('should auto-detect parent span from stack', () => {
      const parent = tracer.startSpan('parent')
      const child = tracer.startSpan('child')

      expect(child.parentId).toBe(parent.id)
    })

    it('should return no-op span when disabled', () => {
      const disabledTracer = new PerformanceTracer({ enabled: false })
      const span = disabledTracer.startSpan('test')

      expect(span.id).toBeNull()
      expect(span.addTag('key', 'value')).toBe(span) // Should return self for chaining
      expect(disabledTracer.spans).toHaveLength(0)
    })

    it('should allow custom parent via options', () => {
      const parent = tracer.startSpan('parent')
      parent.end()

      const child = tracer.startSpan('child', { parentId: parent.id })

      expect(child.parentId).toBe(parent.id)
    })
  })

  describe('trace', () => {
    it('should wrap async function and track time', async () => {
      const result = await tracer.trace(
        'async.operation',
        async (span) => {
          span.addTag('step', 'processing')
          await new Promise((resolve) => setTimeout(resolve, 10))
          return 'success'
        },
        { category: 'test' }
      )

      expect(result).toBe('success')
      expect(tracer.spans).toHaveLength(1)
      expect(tracer.spans[0].status).toBe('completed')
      expect(tracer.spans[0].duration).toBeGreaterThanOrEqual(10)
    })

    it('should capture errors and rethrow', async () => {
      const testError = new Error('Test error')

      await expect(
        tracer.trace('failing.operation', async () => {
          throw testError
        })
      ).rejects.toThrow('Test error')

      expect(tracer.spans).toHaveLength(1)
      expect(tracer.spans[0].status).toBe('error')
      expect(tracer.spans[0].error.message).toBe('Test error')
    })

    it('should work when disabled', async () => {
      const disabledTracer = new PerformanceTracer({ enabled: false })

      const result = await disabledTracer.trace('test', async () => 'value')

      expect(result).toBe('value')
      expect(disabledTracer.spans).toHaveLength(0)
    })
  })

  describe('getCurrentSpan', () => {
    it('should return current span from stack', () => {
      const span = tracer.startSpan('current')
      expect(tracer.getCurrentSpan()).toBe(span)
    })

    it('should return null when no spans', () => {
      expect(tracer.getCurrentSpan()).toBeNull()
    })

    it('should return innermost span', () => {
      tracer.startSpan('outer')
      const inner = tracer.startSpan('inner')

      expect(tracer.getCurrentSpan()).toBe(inner)
    })
  })

  describe('end', () => {
    it('should end the trace and set metadata', () => {
      tracer.end()

      expect(tracer.metadata.endTimestamp).toBeDefined()
      expect(tracer.metadata.totalDuration).toBeDefined()
    })

    it('should end all running spans', () => {
      tracer.startSpan('span1')
      tracer.startSpan('span2')
      tracer.end()

      expect(tracer.spans[0].status).toBe('completed')
      expect(tracer.spans[1].status).toBe('completed')
    })
  })

  describe('getRootSpans', () => {
    it('should return only root level spans', () => {
      const root1 = tracer.startSpan('root1')
      const child1 = root1.startChild('child1')
      root1.end()

      const root2 = tracer.startSpan('root2')
      root2.end()

      const rootSpans = tracer.getRootSpans()

      expect(rootSpans).toHaveLength(2)
      expect(rootSpans.map((s) => s.name)).toContain('root1')
      expect(rootSpans.map((s) => s.name)).toContain('root2')
      expect(rootSpans.map((s) => s.name)).not.toContain('child1')
    })
  })

  describe('getWaterfallData', () => {
    it('should return flat list with timing info', async () => {
      const span1 = tracer.startSpan('operation1')
      await new Promise((resolve) => setTimeout(resolve, 10))
      span1.end()

      const span2 = tracer.startSpan('operation2')
      span2.end()

      tracer.end()
      const waterfall = tracer.getWaterfallData()

      expect(waterfall).toHaveLength(2)
      expect(waterfall[0].relativeStart).toBeDefined()
      // Allow some timing variance (should be ~10ms but allow 5ms minimum due to system overhead)
      expect(waterfall[0].duration).toBeGreaterThanOrEqual(5)
      expect(waterfall[1].relativeStart).toBeGreaterThanOrEqual(waterfall[0].relativeStart)
    })

    it('should include depth for hierarchy', () => {
      const parent = tracer.startSpan('parent')
      const child = parent.startChild('child')
      const grandchild = child.startChild('grandchild')
      grandchild.end()
      child.end()
      parent.end()

      const waterfall = tracer.getWaterfallData()

      expect(waterfall.find((s) => s.name === 'parent').depth).toBe(0)
      expect(waterfall.find((s) => s.name === 'child').depth).toBe(1)
      expect(waterfall.find((s) => s.name === 'grandchild').depth).toBe(2)
    })
  })

  describe('getSummary', () => {
    it('should aggregate statistics', () => {
      const db = tracer.startSpan('db.query', { category: 'database' })
      db.end()

      const render = tracer.startSpan('render', { category: 'render' })
      render.end()

      tracer.end()
      const summary = tracer.getSummary()

      expect(summary.traceId).toBe(tracer.traceId)
      expect(summary.spanCount).toBe(2)
      expect(summary.byCategory.database).toBeDefined()
      expect(summary.byCategory.render).toBeDefined()
    })

    it('should track error count', () => {
      const span = tracer.startSpan('failing')
      span.end({ error: new Error('Failed') })

      const summary = tracer.getSummary()
      expect(summary.errorCount).toBe(1)
    })

    it('should identify slowest spans', async () => {
      const fast = tracer.startSpan('fast')
      fast.end()

      const slow = tracer.startSpan('slow')
      await new Promise((resolve) => setTimeout(resolve, 20))
      slow.end()

      const summary = tracer.getSummary()
      expect(summary.slowestSpans[0].name).toBe('slow')
    })
  })

  describe('toJSON', () => {
    it('should return complete trace data', () => {
      tracer.setRequest({
        method: 'GET',
        url: '/test',
        path: '/test',
        query: {},
        get: () => null
      })

      const span = tracer.startSpan('test', { category: 'core' })
      span.addTag('foo', 'bar')
      span.end()

      tracer.end()
      const json = tracer.toJSON()

      expect(json.traceId).toBe(tracer.traceId)
      expect(json.metadata).toBeDefined()
      expect(json.request).toBeDefined()
      expect(json.spans).toHaveLength(1)
      expect(json.waterfall).toHaveLength(1)
      expect(json.summary).toBeDefined()
    })
  })

  describe('toString', () => {
    it('should return human readable summary', () => {
      tracer.setRequest({
        method: 'GET',
        url: '/test',
        path: '/test',
        query: {},
        get: () => null
      })

      const span = tracer.startSpan('test.operation', { category: 'core' })
      span.end()

      tracer.end()
      const output = tracer.toString()

      expect(output).toContain('Trace')
      expect(output).toContain('GET /test')
      expect(output).toContain('test.operation')
    })
  })
})

describe('TraceSpan', () => {
  let tracer
  let span

  beforeEach(() => {
    tracer = new PerformanceTracer()
    span = tracer.startSpan('test.span', { category: 'test' })
  })

  describe('addTag', () => {
    it('should add a tag', () => {
      span.addTag('key', 'value')
      expect(span.tags.key).toBe('value')
    })

    it('should return self for chaining', () => {
      const result = span.addTag('a', 1).addTag('b', 2)
      expect(result).toBe(span)
      expect(span.tags.a).toBe(1)
      expect(span.tags.b).toBe(2)
    })
  })

  describe('addTags', () => {
    it('should add multiple tags', () => {
      span.addTags({ foo: 'bar', num: 123 })
      expect(span.tags.foo).toBe('bar')
      expect(span.tags.num).toBe(123)
    })
  })

  describe('log', () => {
    it('should add a log entry', () => {
      span.log('Processing started', { count: 10 })

      expect(span.logs).toHaveLength(1)
      expect(span.logs[0].message).toBe('Processing started')
      expect(span.logs[0].data.count).toBe(10)
      expect(span.logs[0].timestamp).toBeDefined()
    })
  })

  describe('startChild', () => {
    it('should create child span with parent reference', () => {
      const child = span.startChild('child.span')

      expect(child.parentId).toBe(span.id)
      expect(span.children).toContain(child)
    })
  })

  describe('traceChild', () => {
    it('should trace child operation with automatic management', async () => {
      const result = await span.traceChild(
        'child.op',
        async (childSpan) => {
          childSpan.addTag('step', 'working')
          return 'done'
        },
        { category: 'work' }
      )

      expect(result).toBe('done')
      expect(span.children).toHaveLength(1)
      expect(span.children[0].status).toBe('completed')
    })

    it('should capture errors in child span', async () => {
      await expect(
        span.traceChild('failing.child', async () => {
          throw new Error('Child failed')
        })
      ).rejects.toThrow('Child failed')

      expect(span.children[0].status).toBe('error')
      expect(span.children[0].error.message).toBe('Child failed')
    })
  })

  describe('end', () => {
    it('should mark span as completed', () => {
      span.end()

      expect(span.status).toBe('completed')
      expect(span.endTime).toBeDefined()
      expect(span.duration).toBeDefined()
      expect(span.duration).toBeGreaterThanOrEqual(0)
    })

    it('should track memory usage', () => {
      span.end()

      expect(span.endMemory).toBeDefined()
      expect(span.endMemory.heapUsed).toBeDefined()
    })

    it('should mark span as error when error provided', () => {
      const error = new Error('Something went wrong')
      error.code = 'ERR_TEST'

      span.end({ error })

      expect(span.status).toBe('error')
      expect(span.error.message).toBe('Something went wrong')
      expect(span.error.code).toBe('ERR_TEST')
    })

    it('should not end twice', () => {
      span.end()
      const firstDuration = span.duration

      span.end()
      expect(span.duration).toBe(firstDuration)
    })
  })

  describe('toJSON', () => {
    it('should serialize span data', () => {
      span.addTag('key', 'value')
      span.log('event', { data: 1 })
      span.end()

      const json = span.toJSON()

      expect(json.id).toBe(span.id)
      expect(json.name).toBe('test.span')
      expect(json.category).toBe('test')
      expect(json.tags.key).toBe('value')
      expect(json.logs).toHaveLength(1)
      expect(json.status).toBe('completed')
      expect(json.memory.start).toBeDefined()
      expect(json.memory.end).toBeDefined()
      expect(json.memory.delta).toBeDefined()
    })

    it('should serialize children', () => {
      const child = span.startChild('child')
      child.end()
      span.end()

      const json = span.toJSON()

      expect(json.children).toHaveLength(1)
      expect(json.children[0].name).toBe('child')
    })
  })
})

describe('TraceCategory', () => {
  it('should export category constants', () => {
    expect(TraceCategory.CORE).toBe('core')
    expect(TraceCategory.THEME).toBe('theme')
    expect(TraceCategory.PLUGIN).toBe('plugin')
    expect(TraceCategory.DATABASE).toBe('database')
    expect(TraceCategory.SSR).toBe('ssr')
    expect(TraceCategory.RENDER).toBe('render')
    expect(TraceCategory.MIDDLEWARE).toBe('middleware')
    expect(TraceCategory.LIFECYCLE).toBe('lifecycle')
    expect(TraceCategory.HOOK).toBe('hook')
    expect(TraceCategory.EXTERNAL).toBe('external')
    expect(TraceCategory.IO).toBe('io')
    expect(TraceCategory.CACHE).toBe('cache')
  })
})
