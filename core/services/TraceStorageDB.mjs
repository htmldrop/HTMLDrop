/**
 * Database-backed Trace Storage Service
 *
 * Persistent trace storage with:
 * - Database storage for querying and analysis
 * - Configurable retention (default 30 days)
 * - Automatic cleanup of old traces
 * - Optional file archiving before deletion
 * - In-memory cache for recent traces
 */

import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'

export default class TraceStorageDB {
  /**
   * @param {Object} options - Storage options
   * @param {Object} options.context - Application context with knex
   * @param {number} [options.retentionDays=30] - Days to keep traces in DB
   * @param {number} [options.archiveAfterDays=7] - Archive traces older than this (0 to disable)
   * @param {string} [options.archivePath] - Path for archive files (default: ./content/traces)
   * @param {number} [options.memoryCacheSize=100] - Number of recent traces to keep in memory
   * @param {number} [options.cleanupIntervalMs=3600000] - Cleanup interval (default: 1 hour)
   */
  constructor(options = {}) {
    this.context = options.context
    this.retentionDays = options.retentionDays ?? 30
    this.archiveAfterDays = options.archiveAfterDays ?? 7
    this.archivePath = options.archivePath ?? path.resolve('./content/traces')
    this.memoryCacheSize = options.memoryCacheSize ?? 100
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 60 * 60 * 1000

    // In-memory cache for recent traces (fast access)
    this.recentTraces = []
    this.traceMap = new Map()

    // Statistics
    this.stats = {
      totalStored: 0,
      totalArchived: 0,
      totalDeleted: 0,
      lastCleanup: null
    }

    // Start cleanup interval
    this.cleanupInterval = null
    this.initialized = false
  }

  /**
   * Initialize the storage (start cleanup interval)
   * Note: The traces table is created via migration (20251126120000_create_traces_table.mjs)
   */
  async init() {
    if (this.initialized) return

    const { knex } = this.context
    if (!knex) {
      console.warn('[TraceStorageDB] No database connection, falling back to memory-only mode')
      return
    }

    // Create archive directory if archiving is enabled
    if (this.archiveAfterDays > 0 && !fs.existsSync(this.archivePath)) {
      fs.mkdirSync(this.archivePath, { recursive: true })
    }

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), this.cleanupIntervalMs)

    // Run initial cleanup
    await this.cleanup()

    this.initialized = true
  }

  /**
   * Store a trace
   * @param {Object} trace - Trace data from PerformanceTracer.toJSON()
   */
  async store(trace) {
    if (!trace || !trace.traceId) return

    // Add to memory cache
    this._addToMemoryCache(trace)

    // Store to database if available
    const { knex, table } = this.context
    if (!knex) return

    try {
      await knex(table('traces')).insert({
        trace_id: trace.traceId,
        request_method: trace.request?.method || null,
        request_path: trace.request?.path || null,
        request_url: trace.request?.url || null,
        user_id: trace.request?.userId || null,
        total_duration: Math.round(trace.metadata?.totalDuration || 0),
        span_count: trace.summary?.spanCount || 0,
        error_count: trace.summary?.errorCount || 0,
        summary: JSON.stringify(trace.summary),
        spans: JSON.stringify(trace.spans),
        waterfall: JSON.stringify(trace.waterfall),
        metadata: JSON.stringify(trace.metadata)
      })

      this.stats.totalStored++
    } catch (err) {
      // Ignore duplicate key errors (trace already exists)
      if (!err.message?.includes('UNIQUE') && !err.message?.includes('duplicate')) {
        console.error('[TraceStorageDB] Failed to store trace:', err.message)
      }
    }
  }

  /**
   * Add trace to memory cache
   * @param {Object} trace - Trace data
   * @private
   */
  _addToMemoryCache(trace) {
    const storedTrace = {
      ...trace,
      storedAt: Date.now()
    }

    // Remove oldest if at capacity
    if (this.recentTraces.length >= this.memoryCacheSize) {
      const evicted = this.recentTraces.shift()
      if (evicted) {
        this.traceMap.delete(evicted.traceId)
      }
    }

    this.recentTraces.push(storedTrace)
    this.traceMap.set(trace.traceId, storedTrace)
  }

  /**
   * Get a trace by ID (checks memory first, then DB)
   * @param {string} traceId - Trace ID
   * @returns {Promise<Object|null>} - Trace data or null
   */
  async get(traceId) {
    // Check memory cache first
    const cached = this.traceMap.get(traceId)
    if (cached) return cached

    // Check database
    const { knex, table } = this.context
    if (!knex) return null

    try {
      const row = await knex(table('traces')).where('trace_id', traceId).first()
      if (!row) return null

      return this._rowToTrace(row)
    } catch (err) {
      console.error('[TraceStorageDB] Failed to get trace:', err.message)
      return null
    }
  }

  /**
   * Convert database row to trace object
   * @param {Object} row - Database row
   * @returns {Object} - Trace object
   * @private
   */
  _rowToTrace(row) {
    return {
      traceId: row.trace_id,
      request: {
        method: row.request_method,
        path: row.request_path,
        url: row.request_url,
        userId: row.user_id
      },
      metadata: JSON.parse(row.metadata || '{}'),
      summary: JSON.parse(row.summary || '{}'),
      spans: JSON.parse(row.spans || '[]'),
      waterfall: JSON.parse(row.waterfall || '[]'),
      storedAt: new Date(row.created_at).getTime()
    }
  }

  /**
   * Get recent traces with optional filtering
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>} - Array of traces
   */
  async getRecent(options = {}) {
    const { limit = 20, offset = 0, path: pathFilter, minDuration, errorsOnly, useCache = true } = options

    // For small queries without filters, use memory cache
    if (useCache && !pathFilter && !minDuration && !errorsOnly && offset === 0 && limit <= this.memoryCacheSize) {
      return [...this.recentTraces].reverse().slice(0, limit)
    }

    // Query database
    const { knex, table } = this.context
    if (!knex) {
      return [...this.recentTraces].reverse().slice(offset, offset + limit)
    }

    try {
      let query = knex(table('traces')).orderBy('created_at', 'desc').limit(limit).offset(offset)

      if (pathFilter) {
        query = query.where('request_path', 'like', `%${pathFilter}%`)
      }
      if (minDuration) {
        query = query.where('total_duration', '>=', minDuration)
      }
      if (errorsOnly) {
        query = query.where('error_count', '>', 0)
      }

      const rows = await query
      return rows.map((row) => this._rowToTrace(row))
    } catch (err) {
      console.error('[TraceStorageDB] Failed to get recent traces:', err.message)
      return []
    }
  }

  /**
   * Get slowest traces
   * @param {number} limit - Number of traces to return
   * @param {number} [hoursBack=24] - Time window in hours
   * @returns {Promise<Object[]>} - Array of slowest traces
   */
  async getSlowest(limit = 10, hoursBack = 24) {
    const { knex, table } = this.context
    if (!knex) {
      return [...this.recentTraces].sort((a, b) => (b.metadata?.totalDuration || 0) - (a.metadata?.totalDuration || 0)).slice(0, limit)
    }

    try {
      const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
      const rows = await knex(table('traces'))
        .where('created_at', '>=', cutoff)
        .orderBy('total_duration', 'desc')
        .limit(limit)

      return rows.map((row) => this._rowToTrace(row))
    } catch (err) {
      console.error('[TraceStorageDB] Failed to get slowest traces:', err.message)
      return []
    }
  }

  /**
   * Get traces with errors
   * @param {number} limit - Number of traces to return
   * @param {number} [hoursBack=24] - Time window in hours
   * @returns {Promise<Object[]>} - Array of traces with errors
   */
  async getErrors(limit = 20, hoursBack = 24) {
    const { knex, table } = this.context
    if (!knex) {
      return [...this.recentTraces]
        .filter((t) => t.summary?.errorCount > 0)
        .reverse()
        .slice(0, limit)
    }

    try {
      const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
      const rows = await knex(table('traces'))
        .where('created_at', '>=', cutoff)
        .where('error_count', '>', 0)
        .orderBy('created_at', 'desc')
        .limit(limit)

      return rows.map((row) => this._rowToTrace(row))
    } catch (err) {
      console.error('[TraceStorageDB] Failed to get error traces:', err.message)
      return []
    }
  }

  /**
   * Get aggregate statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Aggregate statistics
   */
  async getStats(options = {}) {
    const { timeWindowMs = 300000 } = options
    const { knex, table } = this.context

    if (!knex) {
      // Fall back to memory stats
      return this._getMemoryStats(timeWindowMs)
    }

    try {
      const cutoff = new Date(Date.now() - timeWindowMs)

      // Get basic stats
      const statsResult = await knex(table('traces'))
        .where('created_at', '>=', cutoff)
        .select(
          knex.raw('COUNT(*) as trace_count'),
          knex.raw('AVG(total_duration) as avg_duration'),
          knex.raw('MIN(total_duration) as min_duration'),
          knex.raw('MAX(total_duration) as max_duration'),
          knex.raw('SUM(CASE WHEN error_count > 0 THEN 1 ELSE 0 END) as error_trace_count')
        )
        .first()

      // Get percentiles (approximate for SQLite)
      const durations = await knex(table('traces'))
        .where('created_at', '>=', cutoff)
        .select('total_duration')
        .orderBy('total_duration', 'asc')

      const durationValues = durations.map((d) => d.total_duration)
      const p50 = this._percentile(durationValues, 50)
      const p95 = this._percentile(durationValues, 95)
      const p99 = this._percentile(durationValues, 99)

      // Get by path
      const byPath = await knex(table('traces'))
        .where('created_at', '>=', cutoff)
        .select('request_path')
        .count('* as count')
        .sum('total_duration as total_duration')
        .groupBy('request_path')
        .orderBy('count', 'desc')
        .limit(20)

      const byPathMap = {}
      for (const row of byPath) {
        byPathMap[row.request_path || 'unknown'] = {
          count: row.count,
          totalDuration: row.total_duration,
          avgDuration: row.total_duration / row.count
        }
      }

      return {
        timeWindow: timeWindowMs,
        traceCount: parseInt(statsResult.trace_count) || 0,
        avgDuration: parseFloat(statsResult.avg_duration) || 0,
        minDuration: parseInt(statsResult.min_duration) || 0,
        maxDuration: parseInt(statsResult.max_duration) || 0,
        p50Duration: p50,
        p95Duration: p95,
        p99Duration: p99,
        errorRate: statsResult.trace_count > 0 ? `${((statsResult.error_trace_count / statsResult.trace_count) * 100).toFixed(2)  }%` : '0%',
        byPath: byPathMap,
        storage: {
          totalStored: this.stats.totalStored,
          totalArchived: this.stats.totalArchived,
          totalDeleted: this.stats.totalDeleted,
          lastCleanup: this.stats.lastCleanup,
          memoryCacheSize: this.recentTraces.length
        }
      }
    } catch (err) {
      console.error('[TraceStorageDB] Failed to get stats:', err.message)
      return this._getMemoryStats(timeWindowMs)
    }
  }

  /**
   * Calculate percentile from sorted array
   * @param {number[]} arr - Sorted array of values
   * @param {number} p - Percentile (0-100)
   * @returns {number} - Percentile value
   * @private
   */
  _percentile(arr, p) {
    if (arr.length === 0) return 0
    const index = Math.ceil((p / 100) * arr.length) - 1
    return arr[Math.max(0, index)] || 0
  }

  /**
   * Get stats from memory cache only
   * @param {number} timeWindowMs - Time window in ms
   * @returns {Object} - Memory-based stats
   * @private
   */
  _getMemoryStats(timeWindowMs) {
    const now = Date.now()
    const cutoff = now - timeWindowMs
    const recent = this.recentTraces.filter((t) => t.storedAt >= cutoff)

    if (recent.length === 0) {
      return {
        timeWindow: timeWindowMs,
        traceCount: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorRate: '0%',
        byPath: {},
        storage: {
          memoryCacheSize: this.recentTraces.length
        }
      }
    }

    const durations = recent.map((t) => t.metadata?.totalDuration || 0).sort((a, b) => a - b)
    const sum = durations.reduce((a, b) => a + b, 0)

    return {
      timeWindow: timeWindowMs,
      traceCount: recent.length,
      avgDuration: sum / recent.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p50Duration: this._percentile(durations, 50),
      p95Duration: this._percentile(durations, 95),
      p99Duration: this._percentile(durations, 99),
      errorRate: `${((recent.filter((t) => t.summary?.errorCount > 0).length / recent.length) * 100).toFixed(2)  }%`,
      byPath: {},
      storage: {
        memoryCacheSize: this.recentTraces.length
      }
    }
  }

  /**
   * Cleanup old traces (archive and delete)
   */
  async cleanup() {
    const { knex, table } = this.context
    if (!knex) return

    try {
      const now = new Date()

      // Archive traces older than archiveAfterDays (if enabled)
      if (this.archiveAfterDays > 0) {
        const archiveCutoff = new Date(now.getTime() - this.archiveAfterDays * 24 * 60 * 60 * 1000)
        await this._archiveTraces(archiveCutoff)
      }

      // Delete traces older than retentionDays
      const deleteCutoff = new Date(now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000)
      const deleteResult = await knex(table('traces')).where('created_at', '<', deleteCutoff).del()

      if (deleteResult > 0) {
        this.stats.totalDeleted += deleteResult
        console.log(`[TraceStorageDB] Deleted ${deleteResult} traces older than ${this.retentionDays} days`)
      }

      this.stats.lastCleanup = now.toISOString()
    } catch (err) {
      console.error('[TraceStorageDB] Cleanup failed:', err.message)
    }
  }

  /**
   * Archive traces to compressed files
   * @param {Date} cutoff - Archive traces created before this date
   * @private
   */
  async _archiveTraces(cutoff) {
    const { knex, table } = this.context
    if (!knex) return

    try {
      // Check if there are traces to archive that haven't been archived yet
      // We use a flag or just archive by date ranges
      const dateStr = cutoff.toISOString().split('T')[0]
      const archiveFile = path.join(this.archivePath, `traces-${dateStr}.json.gz`)

      // Skip if archive already exists for this date
      if (fs.existsSync(archiveFile)) return

      // Get traces for that day
      const dayStart = new Date(dateStr)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

      const traces = await knex(table('traces'))
        .where('created_at', '>=', dayStart)
        .where('created_at', '<', dayEnd)
        .where('created_at', '<', cutoff)

      if (traces.length === 0) return

      // Write compressed archive
      const tracesJson = JSON.stringify(traces.map((row) => this._rowToTrace(row)), null, 2)
      const tempFile = `${archiveFile  }.tmp`

      await pipeline(
        Readable.from([tracesJson]),
        createGzip(),
        fs.createWriteStream(tempFile)
      )

      // Rename temp file to final (atomic operation)
      fs.renameSync(tempFile, archiveFile)

      this.stats.totalArchived += traces.length
      console.log(`[TraceStorageDB] Archived ${traces.length} traces to ${archiveFile}`)
    } catch (err) {
      console.error('[TraceStorageDB] Archive failed:', err.message)
    }
  }

  /**
   * Get list of archive files
   * @returns {string[]} - Array of archive file paths
   */
  getArchiveFiles() {
    if (!fs.existsSync(this.archivePath)) return []

    return fs
      .readdirSync(this.archivePath)
      .filter((f) => f.endsWith('.json.gz'))
      .map((f) => path.join(this.archivePath, f))
      .sort()
      .reverse()
  }

  /**
   * Count total traces in database
   * @returns {Promise<number>} - Total trace count
   */
  async count() {
    const { knex, table } = this.context
    if (!knex) return this.recentTraces.length

    try {
      const result = await knex(table('traces')).count('* as count').first()
      return parseInt(result.count) || 0
    } catch (err) {
      return this.recentTraces.length
    }
  }

  /**
   * Clear all traces (memory and database)
   */
  async clear() {
    this.recentTraces = []
    this.traceMap.clear()

    const { knex, table } = this.context
    if (knex) {
      try {
        await knex(table('traces')).del()
      } catch (err) {
        console.error('[TraceStorageDB] Failed to clear traces:', err.message)
      }
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
    this.recentTraces = []
    this.traceMap.clear()
  }

  /**
   * Export recent traces to JSON
   * @param {number} [limit=1000] - Max traces to export
   * @returns {Promise<string>} - JSON string
   */
  async toJSON(limit = 1000) {
    const traces = await this.getRecent({ limit, useCache: false })
    return JSON.stringify({
      traces,
      stats: this.stats,
      exportedAt: new Date().toISOString()
    })
  }
}
