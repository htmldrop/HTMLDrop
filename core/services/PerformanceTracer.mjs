/**
 * Performance Tracer Service
 *
 * A comprehensive request tracing system that tracks the entire request-to-response
 * path with hierarchical spans. This is a core feature for identifying performance
 * bottlenecks in the CMS, themes, and plugins.
 *
 * Features:
 * - Unique trace ID per request
 * - Hierarchical spans (parent/child relationships)
 * - High-resolution timing (using process.hrtime.bigint())
 * - Memory usage tracking per span
 * - Metadata/tags support for each span
 * - Waterfall visualization data export
 * - Hooks API for themes/plugins
 *
 * Usage:
 *   const tracer = new PerformanceTracer()
 *   const span = tracer.startSpan('operation_name', { category: 'ssr' })
 *   // ... do work ...
 *   span.end()
 *
 *   // Or with automatic end:
 *   const result = await tracer.trace('operation_name', async (span) => {
 *     span.addTag('key', 'value')
 *     return await someAsyncWork()
 *   })
 */

import crypto from 'crypto'

/**
 * Individual trace span representing a timed operation
 */
export class TraceSpan {
  /**
   * @param {string} name - Name of the operation being traced
   * @param {PerformanceTracer} tracer - Parent tracer instance
   * @param {Object} options - Span options
   * @param {string} [options.parentId] - Parent span ID for hierarchy
   * @param {string} [options.category] - Category of operation (core, theme, plugin, database, etc.)
   * @param {Object} [options.tags] - Initial tags/metadata
   */
  constructor(name, tracer, options = {}) {
    this.id = crypto.randomUUID()
    this.name = name
    this.tracer = tracer
    this.parentId = options.parentId || null
    this.category = options.category || 'general'
    this.tags = { ...options.tags }

    // High-resolution timing
    this.startTime = process.hrtime.bigint()
    this.startTimestamp = Date.now()
    this.endTime = null
    this.endTimestamp = null
    this.duration = null

    // Memory tracking
    this.startMemory = process.memoryUsage()
    this.endMemory = null

    // Status
    this.status = 'running'
    this.error = null

    // Child spans
    this.children = []

    // Register with tracer
    tracer._registerSpan(this)
  }

  /**
   * Add a tag/metadata to this span
   * @param {string} key - Tag key
   * @param {*} value - Tag value
   * @returns {TraceSpan} - Returns this for chaining
   */
  addTag(key, value) {
    this.tags[key] = value
    return this
  }

  /**
   * Add multiple tags at once
   * @param {Object} tags - Object of key-value pairs
   * @returns {TraceSpan} - Returns this for chaining
   */
  addTags(tags) {
    Object.assign(this.tags, tags)
    return this
  }

  /**
   * Log an event within this span
   * @param {string} message - Event message
   * @param {Object} [data] - Additional event data
   * @returns {TraceSpan} - Returns this for chaining
   */
  log(message, data = {}) {
    if (!this.logs) this.logs = []
    this.logs.push({
      timestamp: Date.now(),
      elapsed: this._getElapsed(),
      message,
      data
    })
    return this
  }

  /**
   * Start a child span
   * @param {string} name - Name of the child operation
   * @param {Object} [options] - Span options (category, tags)
   * @returns {TraceSpan} - The new child span
   */
  startChild(name, options = {}) {
    const childSpan = new TraceSpan(name, this.tracer, {
      ...options,
      parentId: this.id
    })
    this.children.push(childSpan)
    return childSpan
  }

  /**
   * Trace an operation as a child span with automatic end
   * @param {string} name - Name of the operation
   * @param {Function} fn - Async function to trace
   * @param {Object} [options] - Span options
   * @returns {Promise<*>} - Result of the traced function
   */
  async traceChild(name, fn, options = {}) {
    const childSpan = this.startChild(name, options)
    try {
      const result = await fn(childSpan)
      childSpan.end()
      return result
    } catch (error) {
      childSpan.end({ error })
      throw error
    }
  }

  /**
   * End this span
   * @param {Object} [options] - End options
   * @param {Error} [options.error] - Error if operation failed
   * @returns {TraceSpan} - Returns this for chaining
   */
  end(options = {}) {
    if (this.status !== 'running') {
      return this // Already ended
    }

    this.endTime = process.hrtime.bigint()
    this.endTimestamp = Date.now()
    this.endMemory = process.memoryUsage()

    // Calculate duration in milliseconds with microsecond precision
    this.duration = Number(this.endTime - this.startTime) / 1_000_000

    if (options.error) {
      this.status = 'error'
      this.error = {
        message: options.error.message,
        stack: options.error.stack,
        code: options.error.code
      }
    } else {
      this.status = 'completed'
    }

    return this
  }

  /**
   * Get elapsed time since span started (for in-progress spans)
   * @returns {number} - Elapsed time in milliseconds
   */
  _getElapsed() {
    const now = process.hrtime.bigint()
    return Number(now - this.startTime) / 1_000_000
  }

  /**
   * Convert span to JSON-serializable object
   * @returns {Object} - Span data
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      parentId: this.parentId,
      category: this.category,
      tags: this.tags,
      logs: this.logs || [],
      startTimestamp: this.startTimestamp,
      endTimestamp: this.endTimestamp,
      duration: this.duration,
      status: this.status,
      error: this.error,
      memory: {
        start: {
          heapUsed: this.startMemory.heapUsed,
          heapTotal: this.startMemory.heapTotal,
          rss: this.startMemory.rss
        },
        end: this.endMemory
          ? {
              heapUsed: this.endMemory.heapUsed,
              heapTotal: this.endMemory.heapTotal,
              rss: this.endMemory.rss
            }
          : null,
        delta: this.endMemory
          ? {
              heapUsed: this.endMemory.heapUsed - this.startMemory.heapUsed,
              rss: this.endMemory.rss - this.startMemory.rss
            }
          : null
      },
      children: this.children.map((c) => c.toJSON())
    }
  }
}

/**
 * Main Performance Tracer class
 * One instance is created per request
 */
export default class PerformanceTracer {
  /**
   * @param {Object} options - Tracer options
   * @param {string} [options.traceId] - Custom trace ID (auto-generated if not provided)
   * @param {boolean} [options.enabled=true] - Whether tracing is enabled
   * @param {number} [options.sampleRate=1.0] - Sampling rate (0.0 to 1.0)
   */
  constructor(options = {}) {
    this.traceId = options.traceId || crypto.randomUUID()
    this.enabled = options.enabled !== false
    this.sampleRate = options.sampleRate ?? 1.0

    // Check if this trace should be sampled
    if (this.sampleRate < 1.0 && Math.random() > this.sampleRate) {
      this.enabled = false
    }

    // All spans in this trace
    this.spans = []
    this.spanMap = new Map()

    // Root span stack for tracking current context
    this.spanStack = []

    // Request metadata
    this.metadata = {
      startTimestamp: Date.now(),
      endTimestamp: null
    }

    // Request info (set later)
    this.request = null
  }

  /**
   * Set request information for this trace
   * @param {Object} req - Express request object
   */
  setRequest(req) {
    this.request = {
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      query: req.query,
      userAgent: req.get('user-agent'),
      ip: req.ip || req.connection?.remoteAddress,
      userId: req.user?.id || null
    }
  }

  /**
   * Register a span with this tracer
   * @param {TraceSpan} span - The span to register
   * @private
   */
  _registerSpan(span) {
    if (!this.enabled) return
    this.spans.push(span)
    this.spanMap.set(span.id, span)
  }

  /**
   * Start a new span
   * @param {string} name - Name of the operation
   * @param {Object} [options] - Span options
   * @param {string} [options.category] - Category of operation
   * @param {Object} [options.tags] - Initial tags
   * @param {string} [options.parentId] - Parent span ID (auto-detected if not provided)
   * @returns {TraceSpan} - The new span
   */
  startSpan(name, options = {}) {
    if (!this.enabled) {
      // Return a no-op span that does nothing
      return this._createNoOpSpan(name)
    }

    // Auto-detect parent from span stack if not provided
    const parentId = options.parentId ?? this.spanStack[this.spanStack.length - 1]?.id ?? null

    const span = new TraceSpan(name, this, {
      ...options,
      parentId
    })

    this.spanStack.push(span)

    // Return a wrapper that removes from stack on end
    const originalEnd = span.end.bind(span)
    span.end = (opts) => {
      const result = originalEnd(opts)
      const idx = this.spanStack.indexOf(span)
      if (idx !== -1) {
        this.spanStack.splice(idx, 1)
      }
      return result
    }

    return span
  }

  /**
   * Create a no-op span for when tracing is disabled
   * @param {string} name - Span name
   * @returns {Object} - No-op span object
   * @private
   */
  _createNoOpSpan(name) {
    const noOp = {
      id: null,
      name,
      addTag: () => noOp,
      addTags: () => noOp,
      log: () => noOp,
      startChild: (childName) => this._createNoOpSpan(childName),
      traceChild: async (_, fn) => fn(noOp),
      end: () => noOp,
      toJSON: () => ({})
    }
    return noOp
  }

  /**
   * Trace an operation with automatic span management
   * @param {string} name - Name of the operation
   * @param {Function} fn - Async function to trace (receives span as argument)
   * @param {Object} [options] - Span options
   * @returns {Promise<*>} - Result of the traced function
   */
  async trace(name, fn, options = {}) {
    const span = this.startSpan(name, options)
    try {
      const result = await fn(span)
      span.end()
      return result
    } catch (error) {
      span.end({ error })
      throw error
    }
  }

  /**
   * Get the current active span (top of stack)
   * @returns {TraceSpan|null} - Current span or null
   */
  getCurrentSpan() {
    return this.spanStack[this.spanStack.length - 1] || null
  }

  /**
   * End the trace and finalize all data
   */
  end() {
    this.metadata.endTimestamp = Date.now()
    this.metadata.totalDuration = this.metadata.endTimestamp - this.metadata.startTimestamp

    // End any still-running spans
    for (const span of this.spans) {
      if (span.status === 'running') {
        span.end()
      }
    }
  }

  /**
   * Get root spans (spans without parents)
   * @returns {TraceSpan[]} - Array of root spans
   */
  getRootSpans() {
    return this.spans.filter((s) => !s.parentId)
  }

  /**
   * Build a hierarchical tree of spans
   * @returns {Object[]} - Tree structure of spans
   */
  getSpanTree() {
    const rootSpans = this.getRootSpans()
    return rootSpans.map((span) => span.toJSON())
  }

  /**
   * Get flat list of all spans with timing info for waterfall view
   * @returns {Object[]} - Flat array of span data with relative timings
   */
  getWaterfallData() {
    const traceStart = this.metadata.startTimestamp

    return this.spans.map((span) => ({
      id: span.id,
      name: span.name,
      parentId: span.parentId,
      category: span.category,
      tags: span.tags,
      relativeStart: span.startTimestamp - traceStart,
      duration: span.duration || 0,
      status: span.status,
      depth: this._getSpanDepth(span)
    }))
  }

  /**
   * Calculate the depth of a span in the hierarchy
   * @param {TraceSpan} span - The span to calculate depth for
   * @returns {number} - Depth level (0 for root)
   * @private
   */
  _getSpanDepth(span) {
    let depth = 0
    let current = span
    while (current.parentId) {
      depth++
      current = this.spanMap.get(current.parentId)
      if (!current) break
    }
    return depth
  }

  /**
   * Get summary statistics for this trace
   * @returns {Object} - Summary statistics
   */
  getSummary() {
    const byCategory = {}
    let totalTime = 0
    let errorCount = 0

    for (const span of this.spans) {
      const cat = span.category
      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, totalDuration: 0, spans: [] }
      }
      byCategory[cat].count++
      byCategory[cat].totalDuration += span.duration || 0
      byCategory[cat].spans.push(span.name)

      if (!span.parentId) {
        totalTime += span.duration || 0
      }
      if (span.status === 'error') {
        errorCount++
      }
    }

    // Find slowest spans
    const sortedByDuration = [...this.spans].sort((a, b) => (b.duration || 0) - (a.duration || 0))

    return {
      traceId: this.traceId,
      totalDuration: this.metadata.totalDuration,
      spanCount: this.spans.length,
      errorCount,
      byCategory,
      slowestSpans: sortedByDuration.slice(0, 5).map((s) => ({
        name: s.name,
        category: s.category,
        duration: s.duration
      })),
      request: this.request
    }
  }

  /**
   * Convert entire trace to JSON
   * @returns {Object} - Complete trace data
   */
  toJSON() {
    return {
      traceId: this.traceId,
      metadata: this.metadata,
      request: this.request,
      spans: this.getSpanTree(),
      waterfall: this.getWaterfallData(),
      summary: this.getSummary()
    }
  }

  /**
   * Create a simple string representation for logging
   * @returns {string} - Human-readable trace summary
   */
  toString() {
    const summary = this.getSummary()
    let output = `\n=== Trace ${this.traceId} ===\n`
    output += `Request: ${this.request?.method} ${this.request?.url}\n`
    output += `Total Duration: ${summary.totalDuration}ms\n`
    output += `Spans: ${summary.spanCount} (${summary.errorCount} errors)\n`
    output += `\nSlowest Operations:\n`

    for (const span of summary.slowestSpans) {
      output += `  - ${span.name} (${span.category}): ${span.duration?.toFixed(2)}ms\n`
    }

    output += `\nBy Category:\n`
    for (const [cat, data] of Object.entries(summary.byCategory)) {
      output += `  ${cat}: ${data.count} spans, ${data.totalDuration.toFixed(2)}ms total\n`
    }

    return output
  }
}

/**
 * Category constants for consistent categorization
 */
export const TraceCategory = {
  CORE: 'core',
  THEME: 'theme',
  PLUGIN: 'plugin',
  DATABASE: 'database',
  SSR: 'ssr',
  RENDER: 'render',
  MIDDLEWARE: 'middleware',
  LIFECYCLE: 'lifecycle',
  HOOK: 'hook',
  EXTERNAL: 'external',
  IO: 'io',
  CACHE: 'cache'
}
