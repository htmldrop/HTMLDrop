/**
 * Trace Storage Service
 *
 * Stores and retrieves performance traces for analysis.
 * Supports in-memory storage with configurable limits and optional
 * persistence to database.
 *
 * This service is designed to be lightweight and not impact performance
 * while providing valuable debugging data when needed.
 */

/**
 * In-memory trace storage with circular buffer behavior
 */
export default class TraceStorage {
  /**
   * @param {Object} options - Storage options
   * @param {number} [options.maxTraces=100] - Maximum number of traces to store
   * @param {number} [options.maxAgeMs=3600000] - Maximum age of traces (default 1 hour)
   * @param {Object} [options.context] - Application context for database access
   */
  constructor(options = {}) {
    this.maxTraces = options.maxTraces || 100
    this.maxAgeMs = options.maxAgeMs || 60 * 60 * 1000 // 1 hour default
    this.context = options.context || null

    // Circular buffer for traces
    this.traces = []
    this.traceMap = new Map() // Quick lookup by traceId

    // Statistics
    this.stats = {
      totalStored: 0,
      totalEvicted: 0,
      oldestTrace: null,
      newestTrace: null
    }

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // Every minute
  }

  /**
   * Store a trace
   * @param {Object} trace - Trace data from PerformanceTracer.toJSON()
   */
  store(trace) {
    if (!trace || !trace.traceId) return

    // Add storage timestamp
    const storedTrace = {
      ...trace,
      storedAt: Date.now()
    }

    // Check if we need to evict old traces
    if (this.traces.length >= this.maxTraces) {
      const evicted = this.traces.shift()
      if (evicted) {
        this.traceMap.delete(evicted.traceId)
        this.stats.totalEvicted++
      }
    }

    // Store the trace
    this.traces.push(storedTrace)
    this.traceMap.set(trace.traceId, storedTrace)

    // Update stats
    this.stats.totalStored++
    this.stats.newestTrace = storedTrace.storedAt

    if (!this.stats.oldestTrace || this.traces.length === 1) {
      this.stats.oldestTrace = this.traces[0]?.storedAt
    }
  }

  /**
   * Get a trace by ID
   * @param {string} traceId - Trace ID
   * @returns {Object|null} - Trace data or null
   */
  get(traceId) {
    return this.traceMap.get(traceId) || null
  }

  /**
   * Get recent traces
   * @param {Object} options - Query options
   * @param {number} [options.limit=20] - Maximum traces to return
   * @param {number} [options.offset=0] - Offset for pagination
   * @param {string} [options.path] - Filter by request path
   * @param {number} [options.minDuration] - Filter by minimum duration
   * @param {boolean} [options.errorsOnly] - Only return traces with errors
   * @returns {Object[]} - Array of traces
   */
  getRecent(options = {}) {
    const { limit = 20, offset = 0, path, minDuration, errorsOnly } = options

    let filtered = [...this.traces].reverse() // Newest first

    // Apply filters
    if (path) {
      filtered = filtered.filter((t) => t.request?.path?.includes(path))
    }

    if (minDuration) {
      filtered = filtered.filter((t) => t.metadata?.totalDuration >= minDuration)
    }

    if (errorsOnly) {
      filtered = filtered.filter((t) => t.summary?.errorCount > 0)
    }

    // Apply pagination
    return filtered.slice(offset, offset + limit)
  }

  /**
   * Get slowest traces
   * @param {number} limit - Number of traces to return
   * @returns {Object[]} - Array of slowest traces
   */
  getSlowest(limit = 10) {
    return [...this.traces].sort((a, b) => (b.metadata?.totalDuration || 0) - (a.metadata?.totalDuration || 0)).slice(0, limit)
  }

  /**
   * Get traces with errors
   * @param {number} limit - Number of traces to return
   * @returns {Object[]} - Array of traces with errors
   */
  getErrors(limit = 20) {
    return [...this.traces]
      .filter((t) => t.summary?.errorCount > 0)
      .reverse()
      .slice(0, limit)
  }

  /**
   * Get aggregate statistics
   * @param {Object} options - Query options
   * @param {number} [options.timeWindowMs=300000] - Time window for stats (default 5 min)
   * @returns {Object} - Aggregate statistics
   */
  getStats(options = {}) {
    const { timeWindowMs = 300000 } = options
    const now = Date.now()
    const cutoff = now - timeWindowMs

    const recentTraces = this.traces.filter((t) => t.storedAt >= cutoff)

    if (recentTraces.length === 0) {
      return {
        timeWindow: timeWindowMs,
        traceCount: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorRate: 0,
        byCategory: {},
        byPath: {}
      }
    }

    // Calculate duration stats
    const durations = recentTraces.map((t) => t.metadata?.totalDuration || 0).sort((a, b) => a - b)

    const sum = durations.reduce((a, b) => a + b, 0)
    const avg = sum / durations.length

    const p50Index = Math.floor(durations.length * 0.5)
    const p95Index = Math.floor(durations.length * 0.95)
    const p99Index = Math.floor(durations.length * 0.99)

    // Aggregate by category
    const byCategory = {}
    for (const trace of recentTraces) {
      const categories = trace.summary?.byCategory || {}
      for (const [cat, data] of Object.entries(categories)) {
        if (!byCategory[cat]) {
          byCategory[cat] = { count: 0, totalDuration: 0 }
        }
        byCategory[cat].count += data.count || 0
        byCategory[cat].totalDuration += data.totalDuration || 0
      }
    }

    // Aggregate by path
    const byPath = {}
    for (const trace of recentTraces) {
      const path = trace.request?.path || 'unknown'
      if (!byPath[path]) {
        byPath[path] = { count: 0, totalDuration: 0, avgDuration: 0 }
      }
      byPath[path].count++
      byPath[path].totalDuration += trace.metadata?.totalDuration || 0
    }
    // Calculate averages
    for (const path of Object.keys(byPath)) {
      byPath[path].avgDuration = byPath[path].totalDuration / byPath[path].count
    }

    // Error rate
    const errorCount = recentTraces.filter((t) => t.summary?.errorCount > 0).length
    const errorRate = (errorCount / recentTraces.length) * 100

    return {
      timeWindow: timeWindowMs,
      traceCount: recentTraces.length,
      avgDuration: avg,
      minDuration: durations[0] || 0,
      maxDuration: durations[durations.length - 1] || 0,
      p50Duration: durations[p50Index] || 0,
      p95Duration: durations[p95Index] || 0,
      p99Duration: durations[p99Index] || 0,
      errorRate: errorRate.toFixed(2) + '%',
      byCategory,
      byPath,
      storage: {
        totalStored: this.stats.totalStored,
        totalEvicted: this.stats.totalEvicted,
        currentCount: this.traces.length,
        maxTraces: this.maxTraces
      }
    }
  }

  /**
   * Find bottlenecks across traces
   * @param {Object} options - Query options
   * @param {number} [options.limit=10] - Number of bottlenecks to return
   * @param {number} [options.timeWindowMs=300000] - Time window for analysis
   * @returns {Object[]} - Array of identified bottlenecks
   */
  findBottlenecks(options = {}) {
    const { limit = 10, timeWindowMs = 300000 } = options
    const now = Date.now()
    const cutoff = now - timeWindowMs

    const recentTraces = this.traces.filter((t) => t.storedAt >= cutoff)

    // Aggregate span data across all traces
    const spanStats = new Map()

    for (const trace of recentTraces) {
      const waterfall = trace.waterfall || []
      for (const span of waterfall) {
        const key = span.name
        if (!spanStats.has(key)) {
          spanStats.set(key, {
            name: key,
            category: span.category,
            count: 0,
            totalDuration: 0,
            maxDuration: 0,
            occurrences: []
          })
        }
        const stat = spanStats.get(key)
        stat.count++
        stat.totalDuration += span.duration || 0
        stat.maxDuration = Math.max(stat.maxDuration, span.duration || 0)
        stat.occurrences.push(span.duration || 0)
      }
    }

    // Calculate averages and sort by impact
    const bottlenecks = []
    for (const [, stat] of spanStats) {
      const avgDuration = stat.totalDuration / stat.count
      const impact = stat.totalDuration // Total time spent on this operation

      // Calculate standard deviation
      const variance = stat.occurrences.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / stat.count
      const stdDev = Math.sqrt(variance)

      bottlenecks.push({
        name: stat.name,
        category: stat.category,
        count: stat.count,
        avgDuration: avgDuration.toFixed(2),
        maxDuration: stat.maxDuration.toFixed(2),
        totalImpact: stat.totalDuration.toFixed(2),
        stdDev: stdDev.toFixed(2),
        consistency: stdDev < avgDuration * 0.2 ? 'consistent' : 'variable'
      })
    }

    // Sort by total impact (time spent)
    return bottlenecks.sort((a, b) => parseFloat(b.totalImpact) - parseFloat(a.totalImpact)).slice(0, limit)
  }

  /**
   * Cleanup old traces
   */
  cleanup() {
    const now = Date.now()
    const cutoff = now - this.maxAgeMs

    // Remove traces older than maxAgeMs
    while (this.traces.length > 0 && this.traces[0].storedAt < cutoff) {
      const evicted = this.traces.shift()
      if (evicted) {
        this.traceMap.delete(evicted.traceId)
        this.stats.totalEvicted++
      }
    }

    // Update oldest trace stat
    this.stats.oldestTrace = this.traces[0]?.storedAt || null
  }

  /**
   * Clear all traces
   */
  clear() {
    this.traces = []
    this.traceMap.clear()
    this.stats = {
      totalStored: this.stats.totalStored,
      totalEvicted: this.stats.totalEvicted,
      oldestTrace: null,
      newestTrace: null
    }
  }

  /**
   * Destroy the storage and cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.clear()
  }

  /**
   * Export traces to JSON
   * @returns {string} - JSON string of all traces
   */
  toJSON() {
    return JSON.stringify({
      traces: this.traces,
      stats: this.stats,
      exportedAt: new Date().toISOString()
    })
  }
}
