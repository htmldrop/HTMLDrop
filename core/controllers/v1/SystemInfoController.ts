import type { Router, Response } from 'express'
import express from 'express'
import os from 'os'
import cluster from 'cluster'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

interface DiskInfo {
  total: number
  used: number
  available: number
  percentage: number
  mount: string
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

const getDiskInfo = (): DiskInfo | null => {
  try {
    if (process.platform === 'win32') {
      // Windows - use wmic
      const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' })
      const lines = output.trim().split('\n').slice(1)
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 3 && parts[0].includes(':')) {
          const freeSpace = parseInt(parts[1], 10)
          const totalSize = parseInt(parts[2], 10)
          if (!isNaN(freeSpace) && !isNaN(totalSize)) {
            return {
              total: totalSize,
              available: freeSpace,
              used: totalSize - freeSpace,
              percentage: Math.round(((totalSize - freeSpace) / totalSize) * 100),
              mount: parts[0]
            }
          }
        }
      }
    } else {
      // Unix-like systems (Linux, macOS)
      const output = execSync("df -k / | tail -1", { encoding: 'utf8' })
      const parts = output.trim().split(/\s+/)
      if (parts.length >= 4) {
        const total = parseInt(parts[1], 10) * 1024
        const used = parseInt(parts[2], 10) * 1024
        const available = parseInt(parts[3], 10) * 1024
        return {
          total,
          used,
          available,
          percentage: Math.round((used / total) * 100),
          mount: parts[5] || '/'
        }
      }
    }
  } catch (e) {
    // Silently fail
  }
  return null
}

const getProcessMemory = () => {
  const used = process.memoryUsage()
  return {
    heapUsed: used.heapUsed,
    heapTotal: used.heapTotal,
    external: used.external,
    rss: used.rss,
    arrayBuffers: used.arrayBuffers || 0
  }
}

const getCpuUsage = (): number => {
  const cpus = os.cpus()
  let totalIdle = 0
  let totalTick = 0

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times]
    }
    totalIdle += cpu.times.idle
  }

  return Math.round((1 - totalIdle / totalTick) * 100)
}

const getUptime = () => {
  const systemUptime = os.uptime()
  const processUptime = process.uptime()

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
    return parts.join(' ')
  }

  return {
    system: systemUptime,
    systemFormatted: formatUptime(systemUptime),
    process: processUptime,
    processFormatted: formatUptime(processUptime)
  }
}

const getNetworkInterfaces = () => {
  const interfaces = os.networkInterfaces()
  const result: Array<{ name: string; address: string; family: string; internal: boolean }> = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (addrs) {
      for (const addr of addrs) {
        if (!addr.internal && addr.family === 'IPv4') {
          result.push({
            name,
            address: addr.address,
            family: addr.family,
            internal: addr.internal
          })
        }
      }
    }
  }

  return result
}

const getLoadAverage = () => {
  const load = os.loadavg()
  return {
    '1m': load[0].toFixed(2),
    '5m': load[1].toFixed(2),
    '15m': load[2].toFixed(2)
  }
}

const getPackageVersions = () => {
  const versions: Record<string, string> = {
    node: process.version,
    v8: process.versions.v8 || 'N/A',
    npm: 'N/A'
  }

  try {
    versions.npm = execSync('npm --version', { encoding: 'utf8' }).trim()
  } catch (e) {
    // npm not available
  }

  return versions
}

const getEnvInfo = () => {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    platform: process.platform,
    arch: process.arch,
    pid: process.pid
  }
}

const getClusterInfo = () => {
  const isPrimary = cluster.isPrimary !== undefined ? cluster.isPrimary : (cluster as unknown as { isMaster: boolean }).isMaster

  // On worker processes, cluster.workers is undefined
  // We can infer worker count from CPU count since the app forks numCPUs workers
  const numCPUs = os.cpus().length

  // If we're on the primary, we can get actual worker count
  // If we're on a worker, we know there are numCPUs workers (based on core/index.ts cluster setup)
  let workerCount = 0
  const workerDetails: Array<{ id: number; pid: number | undefined }> = []

  if (cluster.workers) {
    // We're on primary - can enumerate workers
    for (const [id, worker] of Object.entries(cluster.workers)) {
      if (worker) {
        workerDetails.push({
          id: parseInt(id, 10),
          pid: worker.process?.pid
        })
      }
    }
    workerCount = workerDetails.length
  } else if (cluster.isWorker) {
    // We're on a worker - infer total worker count from CPU cores
    workerCount = numCPUs
  }

  return {
    enabled: cluster.isWorker || workerCount > 0,
    isPrimary,
    isWorker: cluster.isWorker,
    workerId: cluster.isWorker ? cluster.worker?.id : null,
    workerCount,
    workers: workerDetails,
    currentWorkerPid: cluster.isWorker ? process.pid : null
  }
}

const getCpuPerCore = () => {
  const cpus = os.cpus()
  return cpus.map((cpu, index) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
    const idle = cpu.times.idle
    const usage = Math.round((1 - idle / total) * 100)
    return {
      core: index,
      model: cpu.model,
      speed: cpu.speed,
      usage,
      times: cpu.times
    }
  })
}

const getEventLoopLag = (): Promise<number> => {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint()
    setImmediate(() => {
      const end = process.hrtime.bigint()
      const lagNs = Number(end - start)
      const lagMs = lagNs / 1_000_000
      resolve(Math.round(lagMs * 100) / 100)
    })
  })
}

const getOpenHandles = () => {
  // Get active handles count
  const handles = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.()?.length || 0
  const requests = (process as NodeJS.Process & { _getActiveRequests?: () => unknown[] })._getActiveRequests?.()?.length || 0
  return { handles, requests }
}

const getDatabaseInfo = async (context: HTMLDrop.Context) => {
  const { knex } = context
  if (!knex) return null

  try {
    const client = knex.client.config.client
    let version = 'Unknown'
    let size = null

    if (client === 'better-sqlite3' || client === 'sqlite3') {
      // Get SQLite version
      const result = await knex.raw('SELECT sqlite_version() as version')
      version = result[0]?.version || 'Unknown'

      // Try to get database file size
      const connection = knex.client.config.connection
      if (typeof connection === 'object' && 'filename' in connection && connection.filename !== ':memory:') {
        try {
          const stats = fs.statSync(connection.filename as string)
          size = stats.size
        } catch {
          // File not accessible
        }
      }
    } else if (client === 'mysql' || client === 'mysql2') {
      const result = await knex.raw('SELECT VERSION() as version')
      version = result[0]?.[0]?.version || 'Unknown'
    } else if (client === 'pg') {
      const result = await knex.raw('SELECT version()')
      version = result.rows?.[0]?.version?.split(' ')[1] || 'Unknown'
    }

    return {
      client,
      version,
      size,
      sizeFormatted: size ? formatBytes(size) : null
    }
  } catch {
    return null
  }
}

const getGCStats = () => {
  // Check if GC stats are available (requires --expose-gc flag)
  const gc = (global as unknown as { gc?: () => void }).gc
  return {
    available: typeof gc === 'function',
    // v8 heap statistics
    heapStatistics: typeof process.memoryUsage === 'function' ? {
      ...process.memoryUsage(),
      // Additional v8 stats if available
    } : null
  }
}

const getResourceUsage = () => {
  if (typeof process.resourceUsage === 'function') {
    const usage = process.resourceUsage()
    return {
      userCPUTime: usage.userCPUTime,
      systemCPUTime: usage.systemCPUTime,
      maxRSS: usage.maxRSS,
      sharedMemorySize: usage.sharedMemorySize,
      unsharedDataSize: usage.unsharedDataSize,
      unsharedStackSize: usage.unsharedStackSize,
      minorPageFault: usage.minorPageFault,
      majorPageFault: usage.majorPageFault,
      swappedOut: usage.swappedOut,
      fsRead: usage.fsRead,
      fsWrite: usage.fsWrite,
      ipcSent: usage.ipcSent,
      ipcReceived: usage.ipcReceived,
      signalsCount: usage.signalsCount,
      voluntaryContextSwitches: usage.voluntaryContextSwitches,
      involuntaryContextSwitches: usage.involuntaryContextSwitches
    }
  }
  return null
}

const getDockerInfo = () => {
  // Check if running inside Docker
  const isDocker = fs.existsSync('/.dockerenv') ||
    (fs.existsSync('/proc/1/cgroup') && fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'))

  if (!isDocker) return null

  const info: {
    isDocker: boolean
    containerId: string | null
    image: string | null
    hostname: string
    memoryLimit: number | null
    memoryLimitFormatted: string | null
    cpuShares: number | null
    cpuQuota: number | null
    cpuPeriod: number | null
    effectiveCpus: number | null
  } = {
    isDocker: true,
    containerId: null,
    image: null,
    hostname: os.hostname(),
    memoryLimit: null,
    memoryLimitFormatted: null,
    cpuShares: null,
    cpuQuota: null,
    cpuPeriod: null,
    effectiveCpus: null
  }

  // Try to get container ID from cgroup
  try {
    if (fs.existsSync('/proc/self/cgroup')) {
      const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8')
      const match = cgroup.match(/docker[/-]([a-f0-9]{64})/i) ||
                    cgroup.match(/\/([a-f0-9]{64})/)
      if (match) {
        info.containerId = match[1].substring(0, 12)
      }
    }
  } catch {
    // Ignore errors
  }

  // Try to get memory limit from cgroup v2 or v1
  try {
    // cgroup v2
    if (fs.existsSync('/sys/fs/cgroup/memory.max')) {
      const memMax = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim()
      if (memMax !== 'max') {
        info.memoryLimit = parseInt(memMax, 10)
        info.memoryLimitFormatted = formatBytes(info.memoryLimit)
      }
    }
    // cgroup v1
    else if (fs.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
      const memLimit = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim(), 10)
      // If limit is very high (close to max), it's effectively unlimited
      if (memLimit < 9223372036854771712) {
        info.memoryLimit = memLimit
        info.memoryLimitFormatted = formatBytes(info.memoryLimit)
      }
    }
  } catch {
    // Ignore errors
  }

  // Try to get CPU limits
  try {
    // cgroup v2
    if (fs.existsSync('/sys/fs/cgroup/cpu.max')) {
      const cpuMax = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim()
      const [quota, period] = cpuMax.split(' ')
      if (quota !== 'max') {
        info.cpuQuota = parseInt(quota, 10)
        info.cpuPeriod = parseInt(period, 10)
        info.effectiveCpus = parseFloat((info.cpuQuota / info.cpuPeriod).toFixed(2))
      }
    }
    // cgroup v1
    else {
      if (fs.existsSync('/sys/fs/cgroup/cpu/cpu.cfs_quota_us')) {
        info.cpuQuota = parseInt(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', 'utf8').trim(), 10)
      }
      if (fs.existsSync('/sys/fs/cgroup/cpu/cpu.cfs_period_us')) {
        info.cpuPeriod = parseInt(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_period_us', 'utf8').trim(), 10)
      }
      if (info.cpuQuota && info.cpuQuota > 0 && info.cpuPeriod) {
        info.effectiveCpus = parseFloat((info.cpuQuota / info.cpuPeriod).toFixed(2))
      }
      if (fs.existsSync('/sys/fs/cgroup/cpu/cpu.shares')) {
        info.cpuShares = parseInt(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.shares', 'utf8').trim(), 10)
      }
    }
  } catch {
    // Ignore errors
  }

  // Try to get image from environment (often set in Dockerfiles)
  info.image = process.env.DOCKER_IMAGE || process.env.IMAGE_NAME || null

  return info
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  const checkCapability = async (req: HTMLDrop.ExtendedRequest, routeCaps: string[]): Promise<boolean> => {
    const hasAccess = await req.guard.user({ canOneOf: routeCaps })
    return !!hasAccess
  }

  /**
   * @openapi
   * /system-info:
   *   get:
   *     tags:
   *       - System
   *     summary: Get system information
   *     description: Returns comprehensive system information including CPU, memory, disk, and Node.js details
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: System information
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  router.get('/', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!(await checkCapability(guardReq, ['manage_options', 'manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem

    const cpus = os.cpus()
    const disk = getDiskInfo()
    const processMemory = getProcessMemory()
    const uptime = getUptime()
    const network = getNetworkInterfaces()
    const loadAvg = getLoadAverage()
    const versions = getPackageVersions()
    const envInfo = getEnvInfo()
    const clusterInfo = getClusterInfo()
    const cpuPerCore = getCpuPerCore()
    const eventLoopLag = await getEventLoopLag()
    const openHandles = getOpenHandles()
    const database = await getDatabaseInfo(context)
    const resourceUsage = getResourceUsage()
    const dockerInfo = getDockerInfo()

    res.json({
      timestamp: new Date().toISOString(),
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        type: os.type(),
        endianness: os.endianness(),
        tmpdir: os.tmpdir(),
        homedir: os.homedir()
      },
      cpu: {
        model: cpus[0]?.model || 'Unknown',
        cores: cpus.length,
        speed: cpus[0]?.speed || 0,
        usage: getCpuUsage(),
        loadAverage: loadAvg,
        perCore: cpuPerCore
      },
      memory: {
        total: totalMem,
        totalFormatted: formatBytes(totalMem),
        used: usedMem,
        usedFormatted: formatBytes(usedMem),
        free: freeMem,
        freeFormatted: formatBytes(freeMem),
        percentage: Math.round((usedMem / totalMem) * 100)
      },
      disk: disk ? {
        total: disk.total,
        totalFormatted: formatBytes(disk.total),
        used: disk.used,
        usedFormatted: formatBytes(disk.used),
        available: disk.available,
        availableFormatted: formatBytes(disk.available),
        percentage: disk.percentage,
        mount: disk.mount
      } : null,
      process: {
        pid: process.pid,
        ppid: process.ppid,
        title: process.title,
        execPath: process.execPath,
        cwd: process.cwd(),
        uptime: uptime.process,
        uptimeFormatted: uptime.processFormatted,
        memory: {
          heapUsed: processMemory.heapUsed,
          heapUsedFormatted: formatBytes(processMemory.heapUsed),
          heapTotal: processMemory.heapTotal,
          heapTotalFormatted: formatBytes(processMemory.heapTotal),
          rss: processMemory.rss,
          rssFormatted: formatBytes(processMemory.rss),
          external: processMemory.external,
          externalFormatted: formatBytes(processMemory.external),
          arrayBuffers: processMemory.arrayBuffers,
          arrayBuffersFormatted: formatBytes(processMemory.arrayBuffers)
        },
        eventLoopLag,
        openHandles,
        resourceUsage
      },
      cluster: clusterInfo,
      uptime: {
        system: uptime.system,
        systemFormatted: uptime.systemFormatted,
        process: uptime.process,
        processFormatted: uptime.processFormatted
      },
      versions,
      environment: envInfo,
      network,
      database,
      docker: dockerInfo
    })
  })

  /**
   * @openapi
   * /system-info/metrics:
   *   get:
   *     tags:
   *       - System
   *     summary: Get real-time metrics for graphs
   *     description: Returns lightweight metrics suitable for real-time graphing
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Real-time metrics
   */
  router.get('/metrics', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!(await checkCapability(guardReq, ['manage_options', 'manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const processMemory = process.memoryUsage()
    const eventLoopLag = await getEventLoopLag()
    const cpuPerCore = getCpuPerCore()

    res.json({
      timestamp: Date.now(),
      cpu: getCpuUsage(),
      cpuPerCore: cpuPerCore.map(c => c.usage),
      memory: Math.round(((totalMem - freeMem) / totalMem) * 100),
      heapUsed: Math.round((processMemory.heapUsed / processMemory.heapTotal) * 100),
      heapTotal: processMemory.heapTotal,
      heapUsedBytes: processMemory.heapUsed,
      rss: processMemory.rss,
      external: processMemory.external,
      loadAvg: os.loadavg(),
      eventLoopLag
    })
  })

  return router
}
