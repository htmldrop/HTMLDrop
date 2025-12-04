/**
 * Performance Tracer
 * Lightweight request-scoped tracing for detailed performance analysis
 */

import { randomUUID } from 'crypto'

export const TraceCategory = {
  CORE: 'core',
  DATABASE: 'database',
  PLUGIN: 'plugin',
  THEME: 'theme',
  HOOK: 'hook',
  HTTP: 'http',
  RENDER: 'render',
  WEB: 'web',
  HASH: 'hash',
  SSR: 'ssr',
  MIDDLEWARE: 'middleware',
  LIFECYCLE: 'lifecycle',
  EXTERNAL: 'external',
  IO: 'io',
  CACHE: 'cache'
} as const

export type TraceCategory = (typeof TraceCategory)[keyof typeof TraceCategory]

interface TracerOptions {
  traceId?: string
  enabled?: boolean
  sampleRate?: number
}

interface SpanOptions {
  category?: string
  tags?: Record<string, any>
  parentId?: string
}

interface LogEntry {
  message: string
  data?: Record<string, any>
  timestamp: number
}

interface MemoryInfo {
  heapUsed: number
  heapTotal: number
}

interface RequestInfo {
  method: string
  url: string
  path: string
  query: Record<string, any>
  userAgent: string | null
  ip: string | null
  userId: number | null
}

interface TracerMetadata {
  startTimestamp?: number
  endTimestamp?: number
  totalDuration?: number
}

interface WaterfallEntry {
  id: string
  name: string
  category: string
  relativeStart: number
  duration: number
  depth: number
  status: string
  error?: { message: string; code?: string }
}

interface TraceSummary {
  traceId: string
  spanCount: number
  errorCount: number
  totalDuration: number
  byCategory: Record<string, { count: number; totalDuration: number }>
  slowestSpans: Array<{ name: string; duration: number }>
}

export interface Span {
  id: string | null
  name: string
  category: string
  startTime: number
  endTime?: number
  duration?: number
  tags: Record<string, any>
  children: Span[]
  logs: LogEntry[]
  error?: { message: string; code?: string }
  status: string
  parentId?: string
  startMemory?: MemoryInfo
  endMemory?: MemoryInfo
  addTag(key: string, value: any): Span
  addTags(tags: Record<string, any>): Span
  log(message: string, data?: Record<string, any>): void
  startChild(name: string, options?: SpanOptions): Span
  traceChild<T>(name: string, fn: (span: Span) => Promise<T>, options?: SpanOptions): Promise<T>
  end(options?: { error?: Error | { message: string; code?: string } }): void
  toJSON(): Record<string, any>
}

export interface TraceData {
  traceId: string
  rootSpan: Span
  spans: Span[]
}

// No-op span for when tracing is disabled
function createNoOpSpan(): Span {
  const noOp: Span = {
    id: null,
    name: '',
    category: '',
    startTime: 0,
    tags: {},
    children: [],
    logs: [],
    status: 'disabled',
    addTag(_key: string, _value: any) { return noOp },
    addTags(_tags: Record<string, any>) { return noOp },
    log(_message: string, _data?: Record<string, any>) {},
    startChild(_name: string, _options?: SpanOptions) { return noOp },
    async traceChild<T>(_name: string, fn: (span: Span) => Promise<T>, _options?: SpanOptions): Promise<T> {
      return fn(noOp)
    },
    end(_options?: { error?: Error | { message: string; code?: string } }) {},
    toJSON() { return {} }
  }
  return noOp
}

export default class PerformanceTracer {
  public traceId: string
  public spans: Span[] = []
  public enabled: boolean
  public sampleRate: number
  public request: RequestInfo | null = null
  public metadata: TracerMetadata = {}

  private spanStack: Span[] = []
  private startTimestamp: number

  constructor(options: TracerOptions | boolean = {}) {
    // Handle legacy boolean parameter
    if (typeof options === 'boolean') {
      options = { enabled: options }
    }

    this.traceId = options.traceId || randomUUID()
    this.sampleRate = options.sampleRate ?? 1.0

    // Determine if enabled based on sample rate
    if (options.enabled === false) {
      this.enabled = false
    } else if (this.sampleRate < 1.0) {
      this.enabled = Math.random() < this.sampleRate
    } else {
      this.enabled = true
    }

    this.startTimestamp = performance.now()
    this.metadata.startTimestamp = Date.now()
  }

  /**
   * Set request information
   */
  setRequest(req: {
    method: string
    originalUrl?: string
    url?: string
    path: string
    query: Record<string, any>
    get: (header: string) => string | null
    ip?: string | null
    user?: { id: number } | null
  }): void {
    this.request = {
      method: req.method,
      url: req.originalUrl || req.url || req.path,
      path: req.path,
      query: req.query,
      userAgent: req.get('user-agent'),
      ip: req.ip || null,
      userId: req.user?.id || null
    }
  }

  /**
   * Start a new span
   */
  startSpan(name: string, options: SpanOptions = {}): Span {
    if (!this.enabled) return createNoOpSpan()

    const self = this
    const memUsage = process.memoryUsage()

    // Determine parent - only from explicitly specified parent or from spans still on the stack
    // that are not yet ended (a span with endTime set is considered ended)
    let parentId = options.parentId
    if (!parentId) {
      // Find the most recent span on the stack that is not ended
      for (let i = this.spanStack.length - 1; i >= 0; i--) {
        const candidate = this.spanStack[i]
        if (candidate.endTime === undefined) {
          parentId = candidate.id || undefined
          break
        }
      }
    }

    const span: Span = {
      id: randomUUID(),
      name,
      category: options.category || TraceCategory.CORE,
      startTime: performance.now(),
      tags: options.tags || {},
      children: [],
      logs: [],
      status: 'pending',
      parentId,
      startMemory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      addTag(key: string, value: any): Span {
        this.tags[key] = value
        return this
      },
      addTags(tags: Record<string, any>): Span {
        Object.assign(this.tags, tags)
        return this
      },
      log(message: string, data?: Record<string, any>) {
        this.logs.push({
          message,
          data,
          timestamp: performance.now()
        })
      },
      startChild(childName: string, childOptions: SpanOptions = {}): Span {
        const childSpan = self.startSpan(childName, {
          ...childOptions,
          parentId: this.id || undefined
        })
        this.children.push(childSpan)
        return childSpan
      },
      async traceChild<T>(childName: string, fn: (span: Span) => Promise<T>, childOptions: SpanOptions = {}): Promise<T> {
        const childSpan = this.startChild(childName, childOptions)
        try {
          const result = await fn(childSpan)
          childSpan.end()
          return result
        } catch (error) {
          childSpan.end({ error: error as Error })
          throw error
        }
      },
      end: (opts?: { error?: Error | { message: string; code?: string } }) => {
        if (span.endTime !== undefined) {
          return
        }
        span.endTime = performance.now()
        span.duration = span.endTime - span.startTime
        const endMemUsage = process.memoryUsage()
        span.endMemory = {
          heapUsed: endMemUsage.heapUsed,
          heapTotal: endMemUsage.heapTotal
        }
        if (opts?.error) {
          const err = opts.error
          span.error = {
            message: err instanceof Error ? err.message : err.message,
            code: err instanceof Error && 'code' in err ? (err as any).code : (err as any).code
          }
          span.status = 'error'
        } else {
          span.status = 'completed'
        }
        // Remove this span and all its descendants from the stack
        // This prevents child spans from becoming parents after their ancestor is ended
        const isDescendant = (s: Span, ancestorId: string): boolean => {
          if (s.parentId === ancestorId) return true
          if (!s.parentId) return false
          const parent = self.spans.find(p => p.id === s.parentId)
          return parent ? isDescendant(parent, ancestorId) : false
        }
        self.spanStack = self.spanStack.filter(s => {
          if (s === span) return false
          if (span.id && isDescendant(s, span.id)) return false
          return true
        })
      },
      toJSON() {
        return {
          id: this.id,
          name: this.name,
          category: this.category,
          parentId: this.parentId,
          startTime: this.startTime,
          endTime: this.endTime,
          duration: this.duration,
          tags: this.tags,
          logs: this.logs,
          children: this.children.map(c => c.toJSON()),
          error: this.error,
          status: this.status,
          memory: {
            start: this.startMemory,
            end: this.endMemory,
            delta: this.startMemory && this.endMemory ? {
              heapUsed: this.endMemory.heapUsed - this.startMemory.heapUsed,
              heapTotal: this.endMemory.heapTotal - this.startMemory.heapTotal
            } : undefined
          }
        }
      }
    }

    this.spans.push(span)
    this.spanStack.push(span)

    return span
  }

  /**
   * Trace an async operation
   */
  async trace<T>(name: string, fn: (span: Span) => Promise<T>, options: SpanOptions = {}): Promise<T> {
    if (!this.enabled) {
      return fn(createNoOpSpan())
    }

    const span = this.startSpan(name, options)
    try {
      const result = await fn(span)
      span.end()
      return result
    } catch (error) {
      span.end({ error: error as Error })
      throw error
    }
  }

  /**
   * Get current active span
   */
  getCurrentSpan(): Span | null {
    return this.spanStack.length > 0 ? this.spanStack[this.spanStack.length - 1] : null
  }

  /**
   * Get trace ID
   */
  getTraceId(): string {
    return this.traceId
  }

  /**
   * End the trace
   */
  end(): void {
    // End all running spans
    for (const span of this.spanStack.slice().reverse()) {
      span.end()
    }

    this.metadata.endTimestamp = Date.now()
    this.metadata.totalDuration = performance.now() - this.startTimestamp
  }

  /**
   * Get root level spans (spans without parents)
   */
  getRootSpans(): Span[] {
    return this.spans.filter(span => !span.parentId)
  }

  /**
   * Get waterfall data for visualization
   */
  getWaterfallData(): WaterfallEntry[] {
    const result: WaterfallEntry[] = []

    const processSpan = (span: Span, depth: number) => {
      result.push({
        id: span.id || '',
        name: span.name,
        category: span.category,
        relativeStart: span.startTime - this.startTimestamp,
        duration: span.duration || 0,
        depth,
        status: span.status,
        error: span.error
      })

      for (const child of span.children) {
        processSpan(child, depth + 1)
      }
    }

    for (const span of this.getRootSpans()) {
      processSpan(span, 0)
    }

    return result
  }

  /**
   * Get summary statistics
   */
  getSummary(): TraceSummary {
    const byCategory: Record<string, { count: number; totalDuration: number }> = {}
    let errorCount = 0

    for (const span of this.spans) {
      const cat = span.category
      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, totalDuration: 0 }
      }
      byCategory[cat].count++
      byCategory[cat].totalDuration += span.duration || 0

      if (span.status === 'error') {
        errorCount++
      }
    }

    const slowestSpans = [...this.spans]
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 5)
      .map(s => ({ name: s.name, duration: s.duration || 0 }))

    return {
      traceId: this.traceId,
      spanCount: this.spans.length,
      errorCount,
      totalDuration: this.metadata.totalDuration || 0,
      byCategory,
      slowestSpans
    }
  }

  /**
   * Get all trace data
   */
  getTraceData(): TraceData | null {
    if (!this.enabled || this.spans.length === 0) return null

    const rootSpans = this.getRootSpans()
    return {
      traceId: this.traceId,
      rootSpan: rootSpans[0],
      spans: this.spans
    }
  }

  /**
   * Get flattened span list for storage
   */
  getFlatSpans(): Array<{
    id: string
    name: string
    category: string
    startTime: number
    endTime?: number
    duration?: number
    tags: Record<string, any>
    parentId?: string
    error?: string
  }> {
    if (!this.enabled) return []

    return this.spans.map(span => ({
      id: span.id || '',
      name: span.name,
      category: span.category,
      startTime: span.startTime,
      endTime: span.endTime,
      duration: span.duration,
      tags: span.tags,
      parentId: span.parentId,
      error: span.error?.message
    }))
  }

  /**
   * Get total duration
   */
  getTotalDuration(): number {
    return this.metadata.totalDuration || performance.now() - this.startTimestamp
  }

  /**
   * Check if tracing is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, any> {
    return {
      traceId: this.traceId,
      metadata: this.metadata,
      request: this.request,
      spans: this.spans.map(s => s.toJSON()),
      waterfall: this.getWaterfallData(),
      summary: this.getSummary()
    }
  }

  /**
   * Convert to human-readable string
   */
  toString(): string {
    const lines: string[] = []
    const method = this.request?.method || 'UNKNOWN'
    const url = this.request?.url || '/'
    const duration = this.getTotalDuration().toFixed(2)

    lines.push(`Trace ${this.traceId}`)
    lines.push(`${method} ${url} (${duration}ms)`)
    lines.push('')

    for (const span of this.getRootSpans()) {
      this._formatSpan(span, 0, lines)
    }

    return lines.join('\n')
  }

  private _formatSpan(span: Span, depth: number, lines: string[]): void {
    const indent = '  '.repeat(depth)
    const duration = (span.duration || 0).toFixed(2)
    const status = span.status === 'error' ? ' [ERROR]' : ''
    lines.push(`${indent}${span.name} (${duration}ms)${status}`)

    for (const child of span.children) {
      this._formatSpan(child, depth + 1, lines)
    }
  }
}

export { PerformanceTracer }
export type { Span as TraceSpan }
