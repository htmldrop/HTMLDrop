/**
 * Monitoring Service
 *
 * Provides system monitoring, metrics collection, and health checks
 */

import os from 'os'
import process from 'process'

interface RequestData {
  method?: string
  status?: number
  duration?: number
  timestamp: number
}

interface ErrorData {
  message: string
  stack?: string
  code?: string
  timestamp: number
}

interface PerformanceData {
  name: string
  value: number
  unit: string
  timestamp: number
}

interface HealthCheck {
  name: string
  slug?: string
  status: 'pass' | 'fail' | 'warn'
  message?: string
  latency?: number
  usage?: string
  rate?: string
  ok?: boolean
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  uptime: number
  timestamp: string
  checks: HealthCheck[]
}

class MonitoringService {
  private context: HTMLDrop.Context
  private startTime: number
  private requestCount: number
  private errorCount: number
  private metrics: {
    requests: RequestData[]
    errors: ErrorData[]
    performance: PerformanceData[]
  }

  constructor(context: HTMLDrop.Context) {
    this.context = context
    this.startTime = Date.now()
    this.requestCount = 0
    this.errorCount = 0
    this.metrics = {
      requests: [],
      errors: [],
      performance: []
    }
  }

  /**
   * Record a request
   */
  recordRequest(data: Omit<RequestData, 'timestamp'>): void {
    this.requestCount++
    this.metrics.requests.push({
      ...data,
      timestamp: Date.now()
    })

    // Keep only last 1000 requests
    if (this.metrics.requests.length > 1000) {
      this.metrics.requests.shift()
    }
  }

  /**
   * Record an error
   */
  recordError(error: Error & { code?: string }): void {
    this.errorCount++
    this.metrics.errors.push({
      message: error.message,
      stack: error.stack,
      code: error.code,
      timestamp: Date.now()
    })

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift()
    }
  }

  /**
   * Record performance metric
   */
  recordPerformance(name: string, value: number, unit = 'ms'): void {
    this.metrics.performance.push({
      name,
      value,
      unit,
      timestamp: Date.now()
    })

    // Keep only last 1000 metrics
    if (this.metrics.performance.length > 1000) {
      this.metrics.performance.shift()
    }
  }

  /**
   * Get system health
   */
  async getHealth(): Promise<HealthStatus> {
    const uptime = Date.now() - this.startTime
    const memoryUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()

    // Check database
    let databaseHealthy = false
    let databaseLatency = 0

    if (this.context.knex) {
      try {
        const start = Date.now()
        await this.context.knex.raw('SELECT 1')
        databaseLatency = Date.now() - start
        databaseHealthy = true
      } catch (error) {
        console.error('Database health check failed:', error)
      }
    }

    // Calculate error rate
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    const checks: HealthCheck[] = []

    // Database check
    if (!databaseHealthy) {
      status = 'unhealthy'
      checks.push({
        name: 'database',
        slug: 'database',
        status: 'fail',
        message: 'Database connection failed',
        ok: false
      })
    } else if (databaseLatency > 1000) {
      status = 'degraded'
      checks.push({
        name: 'database',
        slug: 'database',
        status: 'warn',
        message: `High database latency: ${databaseLatency}ms`,
        latency: databaseLatency,
        ok: true
      })
    } else {
      checks.push({ name: 'database', slug: 'database', status: 'pass', latency: databaseLatency, ok: true })
    }

    // Admin user check
    let adminExists = false
    if (databaseHealthy) {
      try {
        const admin = await this.context
          .knex!(this.context.table('users'))
          .join(
            this.context.table('user_roles'),
            `${this.context.table('users')}.id`,
            `${this.context.table('user_roles')}.user_id`
          )
          .join(
            this.context.table('roles'),
            `${this.context.table('user_roles')}.role_id`,
            `${this.context.table('roles')}.id`
          )
          .where(`${this.context.table('roles')}.slug`, 'administrator')
          .first()
        adminExists = !!admin
        checks.push({
          name: 'admin',
          slug: 'admin',
          status: adminExists ? 'pass' : 'fail',
          message: adminExists ? 'Admin user exists' : 'No admin user found',
          ok: adminExists
        })
      } catch (error) {
        checks.push({ name: 'admin', slug: 'admin', status: 'fail', message: 'Could not check admin user', ok: false })
      }
    } else {
      checks.push({ name: 'admin', slug: 'admin', status: 'fail', message: 'Database not available', ok: false })
    }

    // Memory check
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
    if (memoryUsagePercent > 90) {
      status = status === 'healthy' ? 'degraded' : status
      checks.push({ name: 'memory', status: 'warn', message: `High memory usage: ${memoryUsagePercent.toFixed(2)}%` })
    } else {
      checks.push({ name: 'memory', status: 'pass', usage: `${memoryUsagePercent.toFixed(2)}%` })
    }

    // Error rate check
    if (errorRate > 10) {
      status = 'degraded'
      checks.push({ name: 'error_rate', status: 'warn', message: `High error rate: ${errorRate.toFixed(2)}%` })
    } else {
      checks.push({ name: 'error_rate', status: 'pass', rate: `${errorRate.toFixed(2)}%` })
    }

    return {
      status,
      uptime,
      timestamp: new Date().toISOString(),
      checks
    }
  }

  /**
   * Get system metrics
   */
  getMetrics() {
    const uptime = Date.now() - this.startTime
    const memoryUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()

    return {
      uptime: {
        milliseconds: uptime,
        seconds: Math.floor(uptime / 1000),
        formatted: this.formatUptime(uptime)
      },
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: {
        total: memoryUsage.heapTotal,
        used: memoryUsage.heapUsed,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        usage: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2)}%`
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime()
      },
      requests: {
        total: this.requestCount,
        errors: this.errorCount,
        errorRate: this.requestCount > 0 ? `${((this.errorCount / this.requestCount) * 100).toFixed(2)}%` : '0%'
      }
    }
  }

  /**
   * Get request statistics
   */
  getRequestStats(timeWindow = 60000) {
    const now = Date.now()
    const recentRequests = this.metrics.requests.filter((r) => now - r.timestamp < timeWindow)

    const byMethod: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    let totalDuration = 0

    for (const req of recentRequests) {
      // By method
      if (req.method) {
        byMethod[req.method] = (byMethod[req.method] || 0) + 1
      }

      // By status
      if (req.status) {
        const statusRange = `${Math.floor(req.status / 100)}xx`
        byStatus[statusRange] = (byStatus[statusRange] || 0) + 1
      }

      // Duration
      if (req.duration) {
        totalDuration += req.duration
      }
    }

    return {
      timeWindow,
      totalRequests: recentRequests.length,
      requestsPerMinute: (recentRequests.length / (timeWindow / 60000)).toFixed(2),
      averageDuration: recentRequests.length > 0 ? (totalDuration / recentRequests.length).toFixed(2) : 0,
      byMethod,
      byStatus
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(timeWindow = 60000) {
    const now = Date.now()
    const recentErrors = this.metrics.errors.filter((e) => now - e.timestamp < timeWindow)

    const byCode: Record<string, number> = {}
    for (const error of recentErrors) {
      byCode[error.code || 'UNKNOWN'] = (byCode[error.code || 'UNKNOWN'] || 0) + 1
    }

    return {
      timeWindow,
      totalErrors: recentErrors.length,
      errorsPerMinute: (recentErrors.length / (timeWindow / 60000)).toFixed(2),
      byCode,
      recent: recentErrors.slice(-10).map((e) => ({
        message: e.message,
        code: e.code,
        timestamp: new Date(e.timestamp).toISOString()
      }))
    }
  }

  /**
   * Format uptime in human-readable format
   */
  formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.requestCount = 0
    this.errorCount = 0
    this.metrics = {
      requests: [],
      errors: [],
      performance: []
    }
  }
}

export default MonitoringService
