import type { AICommand, AICommandResult } from '../../../registries/RegisterAICommands.ts'
import os from 'os'

type RegisterFn = (command: AICommand, priority?: number) => void

export default function registerSystemCommands(register: RegisterFn, _context: HTMLDrop.Context): void {
  register({
    slug: 'system.info',
    name: 'Get System Info',
    description: 'Get comprehensive system information',
    category: 'system',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_options', 'manage_dashboard'],
    parameters: [],
    contextProviders: ['system'],
    execute: async (): Promise<AICommandResult> => {
      const cpus = os.cpus()
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedMem = totalMem - freeMem

      return {
        success: true,
        message: 'System information retrieved',
        data: {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          nodeVersion: process.version,
          cpu: {
            model: cpus[0]?.model || 'Unknown',
            cores: cpus.length,
            speed: cpus[0]?.speed || 0
          },
          memory: {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usagePercent: Math.round((usedMem / totalMem) * 100)
          },
          uptime: {
            system: os.uptime(),
            process: process.uptime()
          },
          loadAverage: os.loadavg()
        }
      }
    }
  })

  register({
    slug: 'system.metrics',
    name: 'Get Real-time Metrics',
    description: 'Get current system metrics (CPU, memory, etc.)',
    category: 'system',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_options', 'manage_dashboard'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const processMemory = process.memoryUsage()

      return {
        success: true,
        message: 'Current metrics',
        data: {
          timestamp: Date.now(),
          memory: {
            systemUsagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
            heapUsed: processMemory.heapUsed,
            heapTotal: processMemory.heapTotal,
            rss: processMemory.rss,
            external: processMemory.external
          },
          loadAverage: os.loadavg(),
          uptime: process.uptime()
        }
      }
    }
  })

  register({
    slug: 'system.env',
    name: 'Get Environment Variables',
    description: 'List safe environment variables (excludes secrets)',
    category: 'system',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_options'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      // Only expose safe env vars
      const safeVars = {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        TABLE_PREFIX: process.env.TABLE_PREFIX,
        SITE_URL: process.env.SITE_URL
      }

      return {
        success: true,
        message: 'Environment variables (safe subset)',
        data: safeVars
      }
    }
  })

  register({
    slug: 'system.health',
    name: 'Health Check',
    description: 'Check system health status',
    category: 'system',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_dashboard'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const memUsage = (totalMem - freeMem) / totalMem
      const loadAvg = os.loadavg()[0]
      const cpuCount = os.cpus().length

      const issues: string[] = []

      // Check memory (warn if > 90%)
      if (memUsage > 0.9) {
        issues.push('High memory usage (>90%)')
      }

      // Check CPU load (warn if > 2x cores)
      if (loadAvg > cpuCount * 2) {
        issues.push('High CPU load')
      }

      // Check heap (warn if > 1.5GB)
      const heapUsed = process.memoryUsage().heapUsed
      if (heapUsed > 1.5 * 1024 * 1024 * 1024) {
        issues.push('High heap memory usage (>1.5GB)')
      }

      const status = issues.length === 0 ? 'healthy' : 'warning'

      return {
        success: true,
        message: `System is ${status}`,
        data: {
          status,
          issues,
          metrics: {
            memoryUsagePercent: Math.round(memUsage * 100),
            loadAverage: loadAvg,
            heapUsedMB: Math.round(heapUsed / 1024 / 1024)
          }
        }
      }
    }
  })

  register({
    slug: 'system.restart',
    name: 'Request Server Restart',
    description: 'Request a graceful server restart (requires manual confirmation)',
    category: 'system',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['manage_options'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      // Note: This doesn't actually restart the server
      // It's a placeholder that would need to be implemented
      // based on the deployment environment (PM2, Docker, etc.)
      return {
        success: true,
        message: 'Server restart requested. Please restart the server manually or via your deployment tool (PM2, Docker, etc.)'
      }
    }
  })

  register({
    slug: 'system.update',
    name: 'Check for Updates',
    description: 'Check if there are CMS updates available',
    category: 'system',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_dashboard'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      try {
        const { execSync } = await import('child_process')

        // Get current version from package.json
        const fs = await import('fs')
        const packagePath = './package.json'
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
        const currentVersion = pkg.version || 'unknown'

        // Get current git SHA
        let currentSha = 'unknown'
        try {
          currentSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().slice(0, 7)
        } catch {
          // Not a git repo
        }

        // Fetch latest from remote
        try {
          execSync('git fetch origin main --quiet', { encoding: 'utf8' })
        } catch {
          // Fetch failed
        }

        // Check if we're behind
        let behind = 0
        try {
          const result = execSync('git rev-list HEAD..origin/main --count', { encoding: 'utf8' })
          behind = parseInt(result.trim(), 10) || 0
        } catch {
          // Compare failed
        }

        return {
          success: true,
          message: behind > 0 ? `${behind} updates available` : 'System is up to date',
          data: {
            currentVersion,
            currentSha,
            hasUpdates: behind > 0,
            commitsBehing: behind
          }
        }
      } catch (error) {
        return {
          success: false,
          message: 'Failed to check for updates',
          error: 'UPDATE_CHECK_FAILED'
        }
      }
    }
  })
}
