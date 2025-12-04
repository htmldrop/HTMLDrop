/**
 * Tracing Controller
 *
 * API endpoints for viewing and analyzing performance traces.
 * These endpoints are protected and require admin/developer permissions.
 */

import type { Router, Response } from 'express'
import express from 'express'

const router: Router = express.Router()

interface TraceRequest {
  method: string
  url: string
  status?: number
}

interface TraceMetadata {
  [key: string]: unknown
}

interface TraceSummary {
  totalDuration: number
  spanCount: number
}

interface Trace {
  traceId: string
  request: TraceRequest
  metadata: TraceMetadata
  summary: TraceSummary
  storedAt: Date
  waterfall?: unknown[]
}

interface TraceStorage {
  get: (traceId: string) => Trace | Promise<Trace | null> | null
  getRecent: (options: {
    limit: number
    offset: number
    path?: string
    minDuration?: number
    errorsOnly?: boolean
  }) => Trace[] | Promise<Trace[]>
  getSlowest: (limit: number, hoursBack: number) => Trace[] | Promise<Trace[]>
  getErrors: (limit: number, hoursBack: number) => Trace[] | Promise<Trace[]>
  getStats: (options: { timeWindowMs: number }) => unknown | Promise<unknown>
  findBottlenecks?: (options: { limit: number; timeWindowMs: number }) => unknown[]
  clear: () => void | Promise<void>
  toJSON: () => string | Promise<string>
  count?: () => number | Promise<number>
  traces?: Trace[]
  recentTraces?: Trace[]
  maxTraces?: number
  memoryCacheSize?: number
  maxAgeMs?: number
  retentionDays?: number
  archiveAfterDays?: number
}

// Use HTMLDrop.ExtendedRequest directly and cast traceStorage when needed
type TracingRequest = HTMLDrop.ExtendedRequest

/**
 * GET /api/v1/tracing/traces
 * Get recent traces with optional filtering
 *
 * Query params:
 * - limit: number (default 20)
 * - offset: number (default 0)
 * - path: string (filter by path)
 * - minDuration: number (filter by min duration in ms)
 * - errorsOnly: boolean (only return traces with errors)
 */
router.get('/traces', async (req, res: Response) => {
  const contextReq = req as TracingRequest
  try {
    const queryParams = req.query as Record<string, string | undefined>
    const { limit = '20', offset = '0', path, minDuration, errorsOnly } = queryParams
    // Cast to local TraceStorage interface which has all expected properties
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    // Support both sync (TraceStorage) and async (TraceStorageDB) methods
    const traces = await Promise.resolve(
      traceStorage.getRecent({
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        path,
        minDuration: minDuration ? parseFloat(minDuration) : undefined,
        errorsOnly: errorsOnly === 'true'
      })
    )

    // Get total count (async for DB storage)
    const total = traceStorage.count ? await Promise.resolve(traceStorage.count()) : traceStorage.traces?.length || 0

    res.json({
      success: true,
      data: traces.map((t) => ({
        traceId: t.traceId,
        request: t.request,
        metadata: t.metadata,
        summary: t.summary,
        storedAt: t.storedAt
      })),
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        total
      }
    })
  } catch (err) {
    console.error('Error fetching traces:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/v1/tracing/traces/:traceId
 * Get a specific trace by ID with full details
 */
router.get('/traces/:traceId', async (req, res: Response) => {
  const contextReq = req as unknown as TracingRequest
  try {
    const { traceId } = req.params
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    const trace = await Promise.resolve(traceStorage.get(traceId))

    if (!trace) {
      return res.status(404).json({
        success: false,
        error: 'Trace not found'
      })
    }

    res.json({
      success: true,
      data: trace
    })
  } catch (err) {
    console.error('Error fetching trace:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/v1/tracing/slowest
 * Get the slowest traces
 *
 * Query params:
 * - limit: number (default 10)
 * - hoursBack: number (default 24) - time window in hours
 */
router.get('/slowest', async (req, res: Response) => {
  const contextReq = req as TracingRequest
  try {
    const queryParams = req.query as Record<string, string | undefined>
    const { limit = '10', hoursBack = '24' } = queryParams
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    const traces = await Promise.resolve(traceStorage.getSlowest(parseInt(limit, 10), parseInt(hoursBack, 10)))

    res.json({
      success: true,
      data: traces.map((t) => ({
        traceId: t.traceId,
        request: t.request,
        metadata: t.metadata,
        summary: t.summary,
        storedAt: t.storedAt
      }))
    })
  } catch (err) {
    console.error('Error fetching slowest traces:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/v1/tracing/errors
 * Get traces with errors
 *
 * Query params:
 * - limit: number (default 20)
 * - hoursBack: number (default 24) - time window in hours
 */
router.get('/errors', async (req, res: Response) => {
  const contextReq = req as TracingRequest
  try {
    const queryParams = req.query as Record<string, string | undefined>
    const { limit = '20', hoursBack = '24' } = queryParams
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    const traces = await Promise.resolve(traceStorage.getErrors(parseInt(limit, 10), parseInt(hoursBack, 10)))

    res.json({
      success: true,
      data: traces.map((t) => ({
        traceId: t.traceId,
        request: t.request,
        metadata: t.metadata,
        summary: t.summary,
        storedAt: t.storedAt
      }))
    })
  } catch (err) {
    console.error('Error fetching error traces:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/v1/tracing/stats
 * Get aggregate statistics
 *
 * Query params:
 * - timeWindow: number (default 300000 = 5 min)
 */
router.get('/stats', async (req, res: Response) => {
  const contextReq = req as TracingRequest
  try {
    const queryParams = req.query as Record<string, string | undefined>
    const { timeWindow = '300000' } = queryParams
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    const stats = await Promise.resolve(
      traceStorage.getStats({
        timeWindowMs: parseInt(timeWindow, 10)
      })
    )

    res.json({
      success: true,
      data: stats
    })
  } catch (err) {
    console.error('Error fetching trace stats:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/v1/tracing/bottlenecks
 * Find performance bottlenecks across traces
 *
 * Query params:
 * - limit: number (default 10)
 * - timeWindow: number (default 300000 = 5 min)
 */
router.get('/bottlenecks', async (req, res: Response) => {
  const contextReq = req as TracingRequest
  try {
    const queryParams = req.query as Record<string, string | undefined>
    const { limit = '10', timeWindow = '300000' } = queryParams
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    // findBottlenecks only exists on memory storage, for DB we'd need different logic
    if (typeof traceStorage.findBottlenecks === 'function') {
      const bottlenecks = traceStorage.findBottlenecks({
        limit: parseInt(limit, 10),
        timeWindowMs: parseInt(timeWindow, 10)
      })

      res.json({
        success: true,
        data: bottlenecks
      })
    } else {
      res.json({
        success: true,
        data: [],
        message: 'Bottleneck analysis not available with DB storage'
      })
    }
  } catch (err) {
    console.error('Error finding bottlenecks:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/v1/tracing/waterfall/:traceId
 * Get waterfall visualization data for a specific trace
 */
router.get('/waterfall/:traceId', async (req, res: Response) => {
  const contextReq = req as unknown as TracingRequest
  try {
    const { traceId } = req.params
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    // Support both sync (TraceStorage) and async (TraceStorageDB) methods
    const trace = await Promise.resolve(traceStorage.get(traceId))

    if (!trace) {
      return res.status(404).json({
        success: false,
        error: 'Trace not found'
      })
    }

    res.json({
      success: true,
      data: {
        traceId: trace.traceId,
        request: trace.request,
        metadata: trace.metadata,
        waterfall: trace.waterfall
      }
    })
  } catch (err) {
    console.error('Error fetching waterfall:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * DELETE /api/v1/tracing/traces
 * Clear all stored traces
 */
router.delete('/traces', async (req, res: Response) => {
  const contextReq = req as TracingRequest
  try {
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    // Support both sync (TraceStorage) and async (TraceStorageDB) methods
    await Promise.resolve(traceStorage.clear())

    res.json({
      success: true,
      message: 'All traces cleared'
    })
  } catch (err) {
    console.error('Error clearing traces:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/v1/tracing/export
 * Export all traces as JSON
 */
router.get('/export', async (req, res: Response) => {
  const contextReq = req as TracingRequest
  try {
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    if (!traceStorage) {
      return res.status(503).json({
        success: false,
        error: 'Trace storage not configured'
      })
    }

    // Support both sync (TraceStorage) and async (TraceStorageDB) methods
    const jsonData = await Promise.resolve(traceStorage.toJSON())

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename=traces-${Date.now()}.json`)
    res.send(jsonData)
  } catch (err) {
    console.error('Error exporting traces:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * GET /api/v1/tracing/config
 * Get current tracing configuration
 */
router.get('/config', async (req, res: Response) => {
  const contextReq = req as TracingRequest
  try {
    const traceStorage = contextReq.context.traceStorage as TraceStorage | null | undefined

    // Get current count - support both sync and async storage
    let currentCount = 0
    if (traceStorage) {
      if (typeof traceStorage.count === 'function') {
        currentCount = await Promise.resolve(traceStorage.count())
      } else {
        currentCount = traceStorage.traces?.length || traceStorage.recentTraces?.length || 0
      }
    }

    const config = {
      enabled: process.env.HD_TRACING_ENABLED !== 'false',
      sampleRate: parseFloat(process.env.HD_TRACING_SAMPLE_RATE || '1.0'),
      verbose: process.env.HD_TRACING_VERBOSE === 'true',
      persist: process.env.HD_TRACING_PERSIST === 'true',
      storage: {
        type: traceStorage?.constructor?.name || 'none',
        maxTraces: traceStorage?.maxTraces || traceStorage?.memoryCacheSize || 100,
        maxAgeMs: traceStorage?.maxAgeMs || null,
        retentionDays: traceStorage?.retentionDays || null,
        archiveAfterDays: traceStorage?.archiveAfterDays || null,
        currentCount
      }
    }

    res.json({
      success: true,
      data: config
    })
  } catch (err) {
    console.error('Error fetching tracing config:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
