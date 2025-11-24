import dotenv from 'dotenv'
import express from 'express'
import Knex from 'knex'
import { WebSocketServer } from 'ws'
import webRoutes from './routes/web.mjs'
import adminRoutes from './routes/admin.mjs'
import apiRoutes from './routes/api.mjs'
import { cpus } from 'os'
import cluster from 'cluster'
import cors from 'cors'
import { createServer } from 'http'
import path from 'path'
import net from 'net'
import parseVue from './utils/parseVue.mjs'
import UserGuard from './utils/UserGuard.mjs'
import translate from './utils/translation.mjs'
import createWsAuthMiddleware from './utils/wsAuthMiddleware.mjs'
import { initSecrets, ensureSecrets } from './utils/secrets.mjs'
import SchedulerService from './services/SchedulerService.mjs'

dotenv.config({ quiet: !cluster.isPrimary })

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
        directory: path.resolve('./hd-core/database/migrations'),
        loadExtensions: ['.mjs'],
        tableName: `${process.env.TABLE_PREFIX  }migrations`,
        lockTableName: `${process.env.TABLE_PREFIX  }migrations_lock`
      },
      seeds: {
        directory: path.resolve('./hd-core/database/seeds'),
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

const initializeOptions = async (knex, table) => {
  if (!knex) return
  const options = await knex(table('options')).where('autoload', true)
  const obj = {}
  for (const opt of options || []) {
    try {
      obj[opt.name] = JSON.parse(opt.value)
    } catch (e) {
      obj[opt.name] = opt.value
    }
  }
  return obj
}

// --- Cluster setup ---
const numCPUs = cpus().length
const port = process.env.PORT || 3001

if (cluster.isPrimary) {
  console.log(`Primary process running with ${numCPUs} workers`)

  // Fork workers
  const workers = []
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork()
    workers.push(worker)
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
  const workerResponses = new Map()
  const pluginLoadResponses = new Map()
  const schedulerInitResponses = new Map()

  cluster.on('message', async (worker, message) => {
    if (message.type === 'scheduler_initialized') {
      // Collect scheduler initialization responses
      schedulerInitResponses.set(worker.id, message)

      // When all workers have reported, log consolidated result
      if (schedulerInitResponses.size === Object.keys(cluster.workers).length) {
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
          for (const id in cluster.workers) cluster.workers[id].send({ type: 'reinitialize_knex' })
        })
        .catch(console.error)
    } else if (message.type === 'options_updated') {
      console.log('Options updated, reinitializing workers...')
      workerResponses.clear()
      for (const id in cluster.workers) cluster.workers[id].send({ type: 'reinitialize_options' })
    } else if (message.type === 'plugins_loaded') {
      // Collect plugin load responses from all workers
      pluginLoadResponses.set(worker.id, message)

      // When all workers have reported, log consolidated result
      if (pluginLoadResponses.size === Object.keys(cluster.workers).length) {
        const allLoaded = new Set()
        const allFailed = new Set()

        for (const response of pluginLoadResponses.values()) {
          response.loaded?.forEach(p => allLoaded.add(p))
          response.failed?.forEach(p => allFailed.add(p))
        }

        if (allLoaded.size > 0) {
          const pluginList = Array.from(allLoaded).map(p => `"${p}"`).join(', ')
          console.log(`✓ Loaded ${allLoaded.size} plugin${allLoaded.size > 1 ? 's' : ''} on ${pluginLoadResponses.size} worker node${pluginLoadResponses.size > 1 ? 's' : ''}: ${pluginList}`)
        }

        if (allFailed.size > 0) {
          const failedList = Array.from(allFailed).map(p => `"${p}"`).join(', ')
          console.log(`✗ Failed to load plugin${allFailed.size > 1 ? 's' : ''}: ${failedList}`)
        }

        pluginLoadResponses.clear()
      }
    } else if (message.type === 'worker_ready' || message.type === 'worker_error') {
      // Collect worker responses
      workerResponses.set(worker.id, message)

      // When all workers have responded, log consolidated result
      if (workerResponses.size === Object.keys(cluster.workers).length) {
        const succeeded = []
        const failed = []

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
        if (cluster.workers[id].id !== worker.id) {
          cluster.workers[id].send(message)
        }
      }
    } else if (message.type === 'restart_server') {
      console.log('Restart requested by worker, shutting down all workers...')

      // Disconnect all workers gracefully
      for (const id in cluster.workers) {
        cluster.workers[id].disconnect()
      }

      // Give workers time to finish, then exit primary process
      setTimeout(() => {
        console.log('Primary process exiting for restart...')
        process.exit(0)
      }, 3000)
    }
  })
} else {
  // --- Worker process ---
  const app = express()
  const server = createServer(app)
  const wss = new WebSocketServer({ server })

  const context = {
    app,
    port,
    server,
    wss,
    knex: null,
    options: null,
    parseVue,
    scheduler: null, // Will be initialized after knex
    formatDate(date = new Date()) {
      return date.toISOString().replace('Z', '').replace('T', ' ')
    },
    table(name) {
      return process.env.TABLE_PREFIX + name
    },
    normalizeSlug(val) {
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

  // Initialize knex and attach dynamically
  initializeKnex().then(async (knex) => {
    context.knex = knex
    context.options = await initializeOptions(context.knex, context.table)

    // Initialize scheduler on all workers, but only worker 1 will execute tasks
    context.scheduler = new SchedulerService(context, cluster.worker.id === 1)

    // Send scheduler initialization message to primary for consolidated logging
    process.send({
      type: 'scheduler_initialized',
      workerId: cluster.worker.id,
      canExecute: cluster.worker.id === 1
    })
  })

  // WebSocket authentication and connection handling
  const wsAuth = createWsAuthMiddleware(context)

  wss.on('connection', async (ws, req) => {
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
        const data = JSON.parse(message)

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
  app.use((req, res, next) => {
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

  app.use(async (req, res, next) => {
    req.guard = new UserGuard(context, null, req, res, next)
    next()
  })

  app.use('/api', apiRoutes(context))
  app.use('/admin', adminRoutes(context))
  app.use('/', webRoutes(context))

  // Receive sockets from the master
  process.on('message', async (msg, socket) => {
    if (msg === 'sticky-session:connection' && socket) {
      server.emit('connection', socket)
      socket.resume()
      return
    }

    if (msg?.type === 'reinitialize_knex') {
      try {
        dotenv.config({ quiet: true, override: true })
        context.knex = await initializeKnex()
        context.options = await initializeOptions(context.knex, context.table)
        process.send({ type: 'worker_ready', action: 'Knex reinitialization' })
      } catch (error) {
        console.error(`Worker ${process.pid} failed to reinitialize Knex:`, error)
        process.send({ type: 'worker_error', action: 'Knex reinitialization', error: error.message })
      }
    }

    if (msg?.type === 'reinitialize_options') {
      try {
        context.options = await initializeOptions(context.knex, context.table)
        process.send({ type: 'worker_ready', action: 'Options reinitialization' })
      } catch (error) {
        console.error(`Worker ${process.pid} failed to reinitialize options:`, error)
        process.send({ type: 'worker_error', action: 'Options reinitialization', error: error.message })
      }
    }

    // Handle job broadcast messages from other workers
    if (msg?.type === 'job_broadcast') {
      const { jobData } = msg
      const message = JSON.stringify({
        type: 'job_update',
        job: jobData
      })

      // Broadcast to all WebSocket clients on this worker
      wss.clients.forEach((client) => {
        if (client.readyState === 1 && client.authenticated) {
          // Only send to clients with appropriate capabilities
          const hasCapability = client.capabilities &&
            (client.capabilities.includes('manage_jobs') ||
             client.capabilities.includes('read_job') ||
             client.capabilities.includes('read_jobs'))

          if (hasCapability) {
            client.send(message)
          }
        }
      })
    }
  })
}
