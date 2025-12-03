import dotenv from 'dotenv'
import express, { Request, Response, NextFunction } from 'express'
import Knex from 'knex'
import type { Knex as KnexType } from 'knex'
import { WebSocketServer, WebSocket } from 'ws'
import webRoutes from './routes/web.mjs'
import adminRoutes from './routes/admin.mjs'
import apiRoutes from './routes/api.mjs'
import { cpus } from 'os'
import cluster, { Worker } from 'cluster'
import cors from 'cors'
import { createServer } from 'http'
import path from 'path'
import net from 'net'
import parseVue from './utils/parseVue.ts'
import UserGuard from './utils/UserGuard.ts'
import translate from './utils/translation.ts'
import createWsAuthMiddleware from './utils/wsAuthMiddleware.ts'
import { initSecrets, ensureSecrets } from './utils/secrets.ts'
import SchedulerService from './services/SchedulerService.mjs'
import BadgeCountService from './services/BadgeCountService.mjs'
import TraceStorage from './services/TraceStorage.mjs'
import TraceStorageDB from './services/TraceStorageDB.mjs'
import { initSharedSSRCache } from './services/SharedSSRCache.mjs'

// Extended WebSocket with auth properties
interface AuthenticatedWebSocket extends WebSocket {
  authenticated?: boolean
  capabilities?: string[]
  uploadId?: string
}

// Options type
interface SiteOptions {
  theme?: string
  active_plugins?: string[]
  tracing?: {
    persist?: boolean
    maxTraces?: number
    maxAgeMs?: number
    retentionDays?: number
    archiveAfterDays?: number
    archivePath?: string
    cleanupIntervalMs?: number
  }
  [key: string]: unknown
}

// Worker message types
interface WorkerMessage {
  type?: string
  action?: string
  workerId?: number
  canExecute?: boolean
  loaded?: string[]
  failed?: string[]
  jobData?: Record<string, unknown>
  error?: string
}

// Load .env from custom path if ENV_FILE_PATH is set, otherwise use default location
const envPath = process.env.ENV_FILE_PATH || '.env'
dotenv.config({ path: envPath, quiet: !cluster.isPrimary })

// Initialize secrets (primary process generates and saves to .env)
if (cluster.isPrimary) {
  initSecrets()
} else {
  ensureSecrets()
}

// --- Knex initialization function ---
const initializeKnex = async () => {
  const client = process.env.DB_CLIENT
  const dbConnection = process.env.DB_CONNECTION
  if (!client || !dbConnection) return null

  try {
    const connection = JSON.parse(dbConnection)
    if (connection.filename) connection.filename = path.resolve(connection.filename)
    const knex = Knex({
      client,
      connection,
      useNullAsDefault: true,
      migrations: {
        directory: path.resolve('./core/database/migrations'),
        loadExtensions: ['.mjs'],
        tableName: `${process.env.TABLE_PREFIX}migrations`,
        // lockTableName is a valid Knex option but not in the type definitions
        ...({ lockTableName: `${process.env.TABLE_PREFIX}migrations_lock` } as Record<string, string>)
      },
      seeds: {
        directory: path.resolve('./core/database/seeds'),
        loadExtensions: ['.mjs']
      }
    })
    await knex.raw('SELECT 1+1 AS result')
    return knex
  } catch (error) {
    console.error('Knex init error:', error)
    return null
  }
}

const initializeOptions = async (knex: KnexType | null, table: (name: string) => string): Promise<SiteOptions | undefined> => {
  if (!knex) return
  const options = await knex(table('options')).where('autoload', true)
  const obj: SiteOptions = {}
  for (const opt of options || []) {
    try {
      obj[opt.name as string] = JSON.parse(opt.value)
    } catch (e) {
      obj[opt.name as string] = opt.value
    }
  }
  return obj
}

// --- Cluster setup ---
const numCPUs = cpus().length
const port = process.env.PORT || 3001

if (cluster.isPrimary) {
  console.log(`Primary process running with ${numCPUs} workers`)

  // Initialize shared SSR cache IPC handlers on primary
  initSharedSSRCache()

  // Build admin UI if it doesn't exist
  try {
    const { buildAdminIfNeeded } = await import('./utils/buildAdmin.ts')
    const buildResult = await buildAdminIfNeeded()
    console.log(`[Startup] Admin build result: ${buildResult}`)
  } catch (error) {
    console.error('[Startup] Failed to build admin UI:', error instanceof Error ? error.message : String(error))
    console.error('[Startup] Error stack:', error instanceof Error ? error.stack : '')
  }

  // Fail all running jobs on server restart
  const knex = await initializeKnex()
  if (knex) {
    const table = (name: string) => `${process.env.TABLE_PREFIX || ''}${name}`

    try {
      // Find all running jobs
      const runningJobPosts = await knex(table('posts'))
        .where('post_type_slug', 'jobs')
        .select('id')

      const runningJobIds = runningJobPosts.map(p => p.id)

      if (runningJobIds.length > 0) {
        const runningJobs = await knex(table('post_meta'))
          .whereIn('post_id', runningJobIds)
          .where('field_slug', 'status')
          .whereIn('value', ['running', 'pending'])

        const jobsToFail = runningJobs.map(m => m.post_id)

        if (jobsToFail.length > 0) {
          // Update status to failed
          await knex(table('post_meta'))
            .whereIn('post_id', jobsToFail)
            .where('field_slug', 'status')
            .update({ value: 'failed' })

          // Add error message
          const now = new Date().toISOString()
          for (const jobId of jobsToFail) {
            // Update or insert error_message
            const existingError = await knex(table('post_meta'))
              .where({ post_id: jobId, field_slug: 'error_message' })
              .first()

            if (existingError) {
              await knex(table('post_meta'))
                .where({ post_id: jobId, field_slug: 'error_message' })
                .update({ value: 'Job interrupted by server restart' })
            } else {
              await knex(table('post_meta')).insert({
                post_id: jobId,
                field_slug: 'error_message',
                value: 'Job interrupted by server restart'
              })
            }

            // Update or insert completed_at
            const existingCompleted = await knex(table('post_meta'))
              .where({ post_id: jobId, field_slug: 'completed_at' })
              .first()

            if (existingCompleted) {
              await knex(table('post_meta'))
                .where({ post_id: jobId, field_slug: 'completed_at' })
                .update({ value: now })
            } else {
              await knex(table('post_meta')).insert({
                post_id: jobId,
                field_slug: 'completed_at',
                value: now
              })
            }
          }

          console.log(`✓ Marked ${jobsToFail.length} running jobs as failed due to server restart`)
        }
      }
    } catch (error) {
      console.error('Failed to cleanup running jobs on restart:', error instanceof Error ? error.message : String(error))
    }
  }

  // Set up file watchers for active themes and plugins only on primary process
  // Watchers for active plugins/themes are managed by RegisterPlugins/RegisterThemes
  // This block sets them up eagerly on startup instead of waiting for first request
  const { requestWatcherSetup } = await import('./services/FolderHashCache.mjs')
  const fs = await import('fs')
  const options = await initializeOptions(knex, (name: string) => `${process.env.TABLE_PREFIX || ''}${name}`)

  // Helper to load watch_ignore patterns from config.mjs
  const loadWatchIgnorePatterns = async (folderPath: string): Promise<string[]> => {
    try {
      const configPath = path.join(folderPath, 'config.mjs')
      if (!fs.existsSync(configPath)) return []

      const config = await import(`${configPath}?t=${Date.now()}`)
      const watchIgnore: string[] = config.default?.watch_ignore || []

      // Convert relative paths to absolute paths
      return watchIgnore.map((pattern: string) => {
        if (pattern.startsWith('/')) {
          return path.join(folderPath, pattern.slice(1))
        }
        return pattern
      })
    } catch (error) {
      return []
    }
  }

  // Set up watcher for active theme only
  if (options?.theme) {
    const themePath = path.resolve(`./content/themes/${options.theme}`)
    if (fs.existsSync(themePath)) {
      const ignorePatterns = await loadWatchIgnorePatterns(themePath)
      requestWatcherSetup(themePath, ignorePatterns)
    }
  }

  // Set up watchers for active plugins only
  if (options?.active_plugins && Array.isArray(options.active_plugins)) {
    for (const pluginSlug of options.active_plugins) {
      const pluginPath = path.resolve(`./content/plugins/${pluginSlug}`)
      if (fs.existsSync(pluginPath)) {
        const ignorePatterns = await loadWatchIgnorePatterns(pluginPath)
        requestWatcherSetup(pluginPath, ignorePatterns)
      }
    }
  }

  // Fork workers
  const workers: Worker[] = []
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork()
    workers.push(worker)
  }

  // Reusable function for zero-downtime worker reload
  const reloadWorkers = () => {
    console.log('🔄 Zero-downtime reload requested, replacing workers one by one...')

    // Get current workers as array
    const currentWorkers = Object.values(cluster.workers || {}).filter((w): w is Worker => w !== undefined)
    let replacedCount = 0

    // Replace workers one at a time (PM2-style reload)
    const replaceNextWorker = () => {
      if (replacedCount >= currentWorkers.length) {
        console.log('✓ All workers reloaded successfully')
        return
      }

      const oldWorker = currentWorkers[replacedCount]
      if (!oldWorker) {
        replacedCount++
        replaceNextWorker()
        return
      }

      console.log(`  Replacing worker ${oldWorker.process.pid}...`)

      // Fork new worker
      const newWorker = cluster.fork()

      // Wait for new worker to be ready (listening event)
      newWorker.once('listening', () => {
        console.log(`  ✓ New worker ${newWorker.process.pid} ready, disconnecting old worker ${oldWorker.process.pid}`)

        // Update workers array
        const oldIndex = workers.indexOf(oldWorker)
        if (oldIndex !== -1) {
          workers[oldIndex] = newWorker
        }

        // Gracefully disconnect old worker
        oldWorker.disconnect()

        // Wait a bit for old worker connections to drain, then move to next
        setTimeout(() => {
          replacedCount++
          replaceNextWorker()
        }, 500)
      })

      // Handle case where new worker fails to start
      newWorker.once('exit', (code, signal) => {
        if (!newWorker.isConnected()) {
          console.error(`  ✗ New worker ${newWorker.process.pid} failed to start (code: ${code}, signal: ${signal})`)
          // Don't kill old worker if new one failed
          replacedCount++
          replaceNextWorker()
        }
      })
    }

    // Start the replacement process
    replaceNextWorker()
  }

  // Listen for restart requests from supervisor
  if (process.send) {
    process.on('message', (message: WorkerMessage) => {
      if (message.type === 'restart_workers') {
        console.log('[Primary] Supervisor requested worker reload')
        reloadWorkers()
      }
    })
  }

  // Simple IP-based sticky session
  const server = net.createServer({ pauseOnConnect: true }, (socket) => {
    const workerIndex = socket.remoteAddress
      ? socket.remoteAddress.charCodeAt(socket.remoteAddress.length - 1) % numCPUs
      : Math.floor(Math.random() * numCPUs)
    const worker = workers[workerIndex]
    worker.send('sticky-session:connection', socket)
  })

  server.listen(port, () => {
    console.log(`Sticky cluster listening on http://localhost:${port}`)
  })

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`)
    const newWorker = cluster.fork()
    workers[workers.indexOf(worker)] = newWorker
  })

  // Track worker responses for consolidated logging
  const workerResponses = new Map<number, WorkerMessage>()
  const pluginLoadResponses = new Map<number, WorkerMessage>()
  const schedulerInitResponses = new Map<number, WorkerMessage>()

  cluster.on('message', async (worker: Worker, message: WorkerMessage) => {
    if (message.type === 'scheduler_initialized') {
      // Collect scheduler initialization responses
      schedulerInitResponses.set(worker.id, message)

      // When all workers have reported, log consolidated result
      if (schedulerInitResponses.size === Object.keys(cluster.workers || {}).length) {
        const executionWorker = Array.from(schedulerInitResponses.values()).find(m => m.canExecute)

        if (executionWorker) {
          console.log(`✓ Scheduler initialized on ${schedulerInitResponses.size} worker node${schedulerInitResponses.size > 1 ? 's' : ''} (execution on worker ${executionWorker.workerId})`)
        }

        schedulerInitResponses.clear()
      }
    } else if (message.type === 'db_config_updated') {
      dotenv.config({ quiet: true, override: true })
      const knex = await initializeKnex()
      if (!knex) return

      knex.migrate
        .latest()
        .then(() => knex.seed.run())
        .then(() => {
          console.log('Migrations + seeds complete, reinitializing workers...')
          workerResponses.clear()
          for (const id in cluster.workers) cluster.workers[id]?.send({ type: 'reinitialize_knex' })
        })
        .catch(console.error)
    } else if (message.type === 'options_updated') {
      console.log('Options updated, reinitializing workers...')
      workerResponses.clear()
      for (const id in cluster.workers) cluster.workers[id]?.send({ type: 'reinitialize_options' })
    } else if (message.type === 'plugins_loaded') {
      // Collect plugin load responses from all workers
      pluginLoadResponses.set(worker.id, message)

      // When all workers have reported, log consolidated result
      if (pluginLoadResponses.size === Object.keys(cluster.workers || {}).length) {
        const allLoaded = new Set<string>()
        const allFailed = new Set<string>()

        for (const response of pluginLoadResponses.values()) {
          response.loaded?.forEach((p: string) => allLoaded.add(p))
          response.failed?.forEach((p: string) => allFailed.add(p))
        }

        if (allLoaded.size > 0) {
          const pluginList = Array.from(allLoaded).map((p: string) => `"${p}"`).join(', ')
          console.log(`✓ Loaded ${allLoaded.size} plugin${allLoaded.size > 1 ? 's' : ''} on ${pluginLoadResponses.size} worker node${pluginLoadResponses.size > 1 ? 's' : ''}: ${pluginList}`)
        }

        if (allFailed.size > 0) {
          const failedList = Array.from(allFailed).map((p: string) => `"${p}"`).join(', ')
          console.log(`✗ Failed to load plugin${allFailed.size > 1 ? 's' : ''}: ${failedList}`)
        }

        pluginLoadResponses.clear()
      }
    } else if (message.type === 'worker_ready' || message.type === 'worker_error') {
      // Collect worker responses
      workerResponses.set(worker.id, message)

      // When all workers have responded, log consolidated result
      if (workerResponses.size === Object.keys(cluster.workers || {}).length) {
        const succeeded: number[] = []
        const failed: number[] = []

        for (const [workerId, response] of workerResponses.entries()) {
          if (response.type === 'worker_ready') {
            succeeded.push(workerId)
          } else {
            failed.push(workerId)
          }
        }

        if (failed.length === 0) {
          console.log(`✓ ${message.action || 'Operation'} successful on ${succeeded.length} worker node${succeeded.length > 1 ? 's' : ''}`)
        } else {
          if (succeeded.length > 0) {
            console.log(`✓ ${message.action || 'Operation'} successful on worker nodes: ${succeeded.join(', ')}`)
          }
          console.log(`✗ ${message.action || 'Operation'} failed on worker nodes: ${failed.join(', ')}`)
        }

        workerResponses.clear()
      }
    } else if (message.type === 'job_broadcast') {
      // Forward job broadcast to all other workers
      for (const id in cluster.workers) {
        const targetWorker = cluster.workers[id]
        if (targetWorker && targetWorker.id !== worker.id) {
          targetWorker.send(message)
        }
      }
    } else if (message.type === 'restart_server') {
      // Worker requested zero-downtime reload
      reloadWorkers()
    } else if (message.type === 'full_restart') {
      console.log('🔄 Full restart requested with primary process reload...')

      // If we have a supervisor, request supervisor-managed restart
      if (process.send) {
        console.log('[Primary] Requesting supervisor to restart entire process...')
        process.send({ type: 'request_supervisor_restart' })
      } else {
        // No supervisor - fall back to direct restart (Docker will restart)
        console.log('[Primary] No supervisor detected, performing direct restart...')

        // Disconnect all workers gracefully
        for (const id in cluster.workers) {
          cluster.workers[id]?.disconnect()
        }

        // Give workers time to finish, then exit primary process
        setTimeout(() => {
          console.log('Primary process exiting for full restart...')
          process.exit(0)
        }, 3000)
      }
    }
  })
} else {
  // --- Worker process ---
  const app = express()
  const server = createServer(app)
  const wss = new WebSocketServer({ server })

  // Initialize shared SSR cache IPC handlers on worker
  initSharedSSRCache()

  // Trace storage will be initialized after options are loaded
  let traceStorage: InstanceType<typeof TraceStorage> | InstanceType<typeof TraceStorageDB> | null = null

  // Worker context type - extends the core HTMLDrop.Context
  interface WorkerContext {
    app: ReturnType<typeof express>
    port: string | number
    server: ReturnType<typeof createServer>
    wss: WebSocketServer
    knex: KnexType | null
    options: SiteOptions | null
    parseVue: typeof parseVue
    scheduler: HTMLDrop.SchedulerService | null
    traceStorage: InstanceType<typeof TraceStorage> | InstanceType<typeof TraceStorageDB> | null
    formatDate(date?: Date): string
    table(name: string): string
    normalizeSlug(val: string): string
    translate: typeof translate
    onPluginsInitialized?: () => void
  }

  const context: WorkerContext = {
    app,
    port,
    server,
    wss,
    knex: null,
    options: null,
    parseVue,
    scheduler: null, // Will be initialized after knex
    traceStorage: null, // Will be initialized after options are loaded
    formatDate(date = new Date()) {
      return date.toISOString().replace('Z', '').replace('T', ' ')
    },
    table(name: string) {
      return process.env.TABLE_PREFIX + name
    },
    normalizeSlug(val: string) {
      if (!val) return ''
      return String(val)
        .toLowerCase()
        .trim()
        .replace(/[\s]+/g, '-') // replace spaces with dashes
        .replace(/[^a-z0-9-_]/g, '') // allow letters, numbers, dashes, and underscores
        .replace(/--+/g, '-') // collapse multiple dashes
        .replace(/^-+|-+$/g, '') // trim dashes from start and end
    },
    translate
  }

  // Track if scheduler has been started (once per worker)
  let schedulerStarted = false
  let pluginsInitialized = false

  // Initialize knex and attach dynamically
  initializeKnex().then(async (knex) => {
    context.knex = knex
    context.options = await initializeOptions(context.knex, context.table) ?? null

    // Initialize trace storage for performance tracing
    // Use options if available, otherwise fall back to environment variables
    const tracingConfig = context.options?.tracing || {}
    const useDBStorage = tracingConfig.persist ?? (process.env.HD_TRACING_PERSIST === 'true')
    const maxTraces = tracingConfig.maxTraces ?? (parseInt(process.env.HD_TRACING_MAX_TRACES || '100'))
    const maxAgeMs = tracingConfig.maxAgeMs ?? (parseInt(process.env.HD_TRACING_MAX_AGE_MS || '3600000'))

    if (useDBStorage) {
      // DB-backed storage with retention and archiving
      traceStorage = new TraceStorageDB({
        context,
        retentionDays: tracingConfig.retentionDays ?? (parseInt(process.env.HD_TRACING_RETENTION_DAYS || '30')),
        archiveAfterDays: tracingConfig.archiveAfterDays ?? (parseInt(process.env.HD_TRACING_ARCHIVE_AFTER_DAYS || '7')),
        archivePath: tracingConfig.archivePath ?? (process.env.HD_TRACING_ARCHIVE_PATH || './content/traces'),
        memoryCacheSize: maxTraces,
        cleanupIntervalMs: tracingConfig.cleanupIntervalMs ?? (parseInt(process.env.HD_TRACING_CLEANUP_INTERVAL_MS || '3600000'))
      })
    } else {
      // Memory-only storage (faster, but lost on restart)
      traceStorage = new TraceStorage({
        maxTraces,
        maxAgeMs
      })
    }

    // Update context with traceStorage
    context.traceStorage = traceStorage

    // Initialize DB-backed trace storage if enabled (needs context with knex)
    if (traceStorage && 'init' in traceStorage && typeof traceStorage.init === 'function') {
      await traceStorage.init()
    }

    // Initialize scheduler on all workers, but only worker 1 will execute tasks
    const workerId = cluster.worker?.id ?? 1
    context.scheduler = new SchedulerService(context as unknown as HTMLDrop.Context, workerId === 1) as unknown as HTMLDrop.SchedulerService

    // Register core scheduled tasks (only once at startup)
    context.scheduler
      .call(async () => {
        const badgeCountService = new BadgeCountService(context)
        await badgeCountService.updateBadgeCounts()
      }, 'refresh_badge_counts')
      .everyMinute()

    // Run initial badge count update on worker 1 (after startup delay)
    if (workerId === 1) {
      setTimeout(async () => {
        try {
          const badgeCountService = new BadgeCountService(context)
          // Force update to bypass cache and fetch fresh data
          await badgeCountService.updateBadgeCounts(true)
          console.log('[Startup] Initial badge count update complete (forced)')
        } catch (error) {
          console.error('[Startup] Failed to update badge counts:', error)
        }
      }, 5000) // Wait 5 seconds for server to fully stabilize
    }

    // Helper to mark plugins as initialized and start scheduler if not already started
    context.onPluginsInitialized = () => {
      pluginsInitialized = true
      if (!schedulerStarted && context.scheduler) {
        context.scheduler.startAll()
        schedulerStarted = true
      }
    }

    // If no plugins need to be loaded, start scheduler immediately after a short delay
    // This ensures scheduler starts even if no API requests are made
    setTimeout(() => {
      if (!pluginsInitialized && !schedulerStarted && context.scheduler) {
        context.scheduler.startAll()
        schedulerStarted = true
      }
    }, 2000)

    // Send scheduler initialization message to primary for consolidated logging
    process.send?.({
      type: 'scheduler_initialized',
      workerId: workerId,
      canExecute: workerId === 1
    })
  })

  // WebSocket authentication and connection handling
  const wsAuth = createWsAuthMiddleware(context as unknown as HTMLDrop.Context)

  wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
    // Authenticate WebSocket connection
    const authenticated = await wsAuth(ws, req)

    if (!authenticated) {
      return // Connection will be closed by wsAuth
    }

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Welcome to HTMLDrop WebSocket!',
      authenticated: true
    }))

    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString())

        // Handle ping/pong for keepalive
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
        }
      } catch (error) {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      // Cleanup on disconnect
    })
  })

  app.set('json spaces', 2)
  app.use((req: Request & { context?: WorkerContext }, res: Response, next: NextFunction) => {
    req.context = context
    if (req.method) req.method = req.method.toUpperCase()
    next()
  })
  app.use(
    cors({
      origin: (origin, callback) => {
        const corsOrigin = process.env.CORS_ORIGIN

        // If no CORS_ORIGIN is set, allow all origins (useful for initial setup)
        if (!corsOrigin) {
          return callback(null, true)
        }

        // Parse allowed origins (comma-separated list)
        const allowedOrigins = corsOrigin
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)

        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) {
          return callback(null, true)
        }

        // Check if the origin is in the allowlist
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    })
  )

  app.use(async (req: Request & { guard?: InstanceType<typeof UserGuard> }, res: Response, next: NextFunction) => {
    req.guard = new UserGuard(context as unknown as HTMLDrop.Context, null)
    next()
  })

  app.use('/api', apiRoutes(context))
  app.use('/admin', adminRoutes(context))
  app.use('/', webRoutes(context))

  // Receive sockets from the master
  process.on('message', async (msg: string | WorkerMessage, socket: net.Socket | undefined) => {
    if (msg === 'sticky-session:connection' && socket) {
      server.emit('connection', socket)
      socket.resume()
      return
    }

    const typedMsg = msg as WorkerMessage
    if (typedMsg?.type === 'reinitialize_knex') {
      try {
        dotenv.config({ quiet: true, override: true })
        context.knex = await initializeKnex()
        context.options = await initializeOptions(context.knex, context.table) ?? null
        process.send?.({ type: 'worker_ready', action: 'Knex reinitialization' })
      } catch (error) {
        console.error(`Worker ${process.pid} failed to reinitialize Knex:`, error)
        process.send?.({ type: 'worker_error', action: 'Knex reinitialization', error: error instanceof Error ? error.message : String(error) })
      }
    }

    if (typedMsg?.type === 'reinitialize_options') {
      try {
        context.options = await initializeOptions(context.knex, context.table) ?? null
        process.send?.({ type: 'worker_ready', action: 'Options reinitialization' })
      } catch (error) {
        console.error(`Worker ${process.pid} failed to reinitialize options:`, error)
        process.send?.({ type: 'worker_error', action: 'Options reinitialization', error: error instanceof Error ? error.message : String(error) })
      }
    }

    // Handle job broadcast messages from other workers
    if (typedMsg?.type === 'job_broadcast') {
      const jobData = typedMsg.jobData
      const message = JSON.stringify({
        type: 'job_update',
        job: jobData
      })

      // Broadcast to all WebSocket clients on this worker
      wss.clients.forEach((client) => {
        const authClient = client as AuthenticatedWebSocket
        if (authClient.readyState === 1 && authClient.authenticated) {
          // Only send to clients with appropriate capabilities
          const hasCapability = authClient.capabilities &&
            (authClient.capabilities.includes('manage_jobs') ||
             authClient.capabilities.includes('read_job') ||
             authClient.capabilities.includes('read_jobs'))

          if (hasCapability) {
            authClient.send(message)
          }
        }
      })
    }
  })
}
