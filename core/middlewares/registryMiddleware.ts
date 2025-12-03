import type { Request, Response, NextFunction } from 'express'
import type { Knex } from 'knex'
import Registry from '../registries/index.mjs'
import RegisterJobs from '../registries/RegisterJobs.mjs'
import PerformanceTracer, { TraceCategory } from '../services/PerformanceTracer.mjs'
import fs from 'fs'
import path from 'path'

interface Options {
  theme?: string
  active_plugins?: string[]
  skip_registry_paths?: string[]
  tracing?: {
    enabled?: boolean
    sampleRate?: number
    verbose?: boolean
  }
}

interface ContextWithOptions {
  knex?: Knex
  table: (name: string) => string
  options?: Options
  traceStorage?: {
    store: (data: unknown) => void
  }
  tracer?: PerformanceTracer
  hooks?: Record<string, unknown>
  registries?: unknown
}

interface RequestWithContext extends Request {
  skipRegistry?: boolean
  context: ContextWithOptions
  tracer: PerformanceTracer
  hooks: Record<string, unknown>
  guard?: {
    user: () => Promise<null>
  }
}

interface Post {
  excerpt?: string
  content?: string
}

// Cache for skip paths (refreshed when theme/plugins change or configs are modified)
let cachedSkipPaths: string[] = []
let cachedThemeSlug: string | null = null
let cachedPluginSlugs: string | null = null
let cachedConfigMtimes: string | null = null // JSON string of {path: mtime} to detect config file changes

/**
 * Get modification times for all config files
 */
const getConfigMtimes = async (themeSlug: string | undefined, activePlugins: string[]): Promise<string> => {
  const mtimes: Record<string, number> = {}

  if (themeSlug) {
    const configPath = path.resolve(`./content/themes/${themeSlug}/config.mjs`)
    if (fs.existsSync(configPath)) {
      try {
        const stat = await fs.promises.stat(configPath)
        mtimes[configPath] = stat.mtimeMs
      } catch {
        // Ignore stat errors
      }
    }
  }

  for (const pluginSlug of activePlugins || []) {
    const configPath = path.resolve(`./content/plugins/${pluginSlug}/config.mjs`)
    if (fs.existsSync(configPath)) {
      try {
        const stat = await fs.promises.stat(configPath)
        mtimes[configPath] = stat.mtimeMs
      } catch {
        // Ignore stat errors
      }
    }
  }

  return JSON.stringify(mtimes)
}

/**
 * Load skip_registry_paths from a config.mjs file
 */
const loadConfigSkipPaths = async (configPath: string): Promise<string[]> => {
  if (!fs.existsSync(configPath)) return []

  try {
    const configModule = await import(`${configPath}?t=${Date.now()}`)
    const config = configModule.default || {}
    return Array.isArray(config.skip_registry_paths) ? config.skip_registry_paths : []
  } catch {
    return []
  }
}

/**
 * Get all skip_registry_paths from active theme and plugins
 */
const getSkipPaths = async (options: Options | undefined): Promise<string[]> => {
  const themeSlug = options?.theme
  const activePlugins = options?.active_plugins || []
  const pluginSlugsKey = activePlugins.sort().join(',')

  // Check if config files have been modified (handles theme/plugin upgrades)
  const currentMtimes = await getConfigMtimes(themeSlug, activePlugins)

  // Return cached if nothing changed (same slugs AND same file mtimes)
  if (
    cachedThemeSlug === themeSlug &&
    cachedPluginSlugs === pluginSlugsKey &&
    cachedConfigMtimes === currentMtimes &&
    cachedSkipPaths.length > 0
  ) {
    return cachedSkipPaths
  }

  const allPaths: string[] = []

  // Load from theme
  if (themeSlug) {
    const themePaths = await loadConfigSkipPaths(path.resolve(`./content/themes/${themeSlug}/config.mjs`))
    allPaths.push(...themePaths)
  }

  // Load from active plugins
  for (const pluginSlug of activePlugins) {
    const pluginPaths = await loadConfigSkipPaths(path.resolve(`./content/plugins/${pluginSlug}/config.mjs`))
    allPaths.push(...pluginPaths)
  }

  // Update cache
  cachedThemeSlug = themeSlug || null
  cachedPluginSlugs = pluginSlugsKey
  cachedConfigMtimes = currentMtimes
  cachedSkipPaths = allPaths

  return allPaths
}

/**
 * Registry Middleware
 *
 * Only API routes (/api/*) go through the full registry initialization flow.
 * This includes:
 * - Performance tracing setup
 * - Hook system initialization
 * - Provider and plugin loading
 *
 * All other routes (static assets, SSR pages, etc.) skip this middleware
 * for better performance. Themes handle their own routing for SSR.
 */
export default (context: ContextWithOptions) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reqWithContext = req as RequestWithContext

    // Check if route should skip registry initialization
    // 1. Explicit flag on request
    // 2. Query parameter
    // 3. Header
    // 4. Path matches configured skip patterns (from options or theme config)
    const fullPath = req.baseUrl + req.path

    // Get skip paths from options, active theme, and active plugins
    const optionsSkipPaths = context.options?.skip_registry_paths || []
    const contentSkipPaths = await getSkipPaths(context.options)
    const skip_registry_paths = [...optionsSkipPaths, ...contentSkipPaths]

    const pathMatchesSkipPattern = skip_registry_paths.some((pattern) => {
      if (pattern.endsWith('*')) {
        return fullPath.startsWith(pattern.slice(0, -1))
      }
      return fullPath === pattern
    })

    const shouldSkipRegistry =
      reqWithContext.skipRegistry === true ||
      req.query.skipRegistry === 'true' ||
      req.headers['x-skip-registry'] === 'true' ||
      pathMatchesSkipPattern

    // Create a request-level context that inherits from global context
    reqWithContext.context = context

    // Initialize performance tracer for this request
    // Check if tracing is enabled via environment or options
    const tracingEnabled =
      process.env.HD_TRACING_ENABLED !== 'false' && context.options?.tracing?.enabled !== false
    const sampleRate =
      parseFloat(process.env.HD_TRACING_SAMPLE_RATE || '') || context.options?.tracing?.sampleRate || 1.0

    const tracer = new PerformanceTracer({
      enabled: tracingEnabled,
      sampleRate
    })

    // Set request info on tracer
    tracer.setRequest(req)

    // Attach tracer to request for access throughout the request lifecycle
    reqWithContext.tracer = tracer
    reqWithContext.context.tracer = tracer

    // Skip full registry initialization for:
    // 1. Non-API routes (static assets, SSR pages)
    // 2. Routes explicitly marked to skip via query param, header, or middleware
    const isNonApiRoute = !fullPath.startsWith('/api/')

    if (isNonApiRoute || shouldSkipRegistry) {
      // Initialize jobs registry for SSR routes (lightweight, only needs context)
      const jobsRegistry = new RegisterJobs(context)

      // Provide minimal hooks for themes that use createContext()
      // These are lightweight stubs - the full registry is not initialized
      reqWithContext.hooks = reqWithContext.hooks || {}
      Object.assign(reqWithContext.hooks, {
        // Core hook methods (no-op for SSR)
        addAction: () => {},
        addFilter: () => {},
        doAction: async () => {},
        applyFilters: async (_: unknown, value: unknown) => value,

        // Post type/field registration (no-op for SSR)
        registerPostType: async () => {},
        registerPostField: async () => {},
        registerTaxonomy: async () => {},
        registerTermField: async () => {},

        // Menu registration (no-op for SSR)
        addMenuPage: () => {},
        addSubMenuPage: () => {},

        // Getters return empty/null for SSR
        getPostType: async () => null,
        getAllPostTypes: async () => [],
        getFields: async () => [],
        getTaxonomy: async () => null,
        getAllTaxonomies: async () => [],
        getTaxonomyFields: async () => [],
        getAttachmentUrl: async () => null,
        theExcerpt: (post: Post, length = 150) => (post?.excerpt || post?.content || '').slice(0, length),

        // Dashboard/admin functions (return empty for SSR)
        getMenuTree: async () => [],
        getControls: async () => [],
        addControl: async () => {},

        // Job functions (functional - uses RegisterJobs)
        createJob: jobsRegistry.createJob.bind(jobsRegistry),
        getJobs: jobsRegistry.getJobs.bind(jobsRegistry),
        getJob: jobsRegistry.getJob.bind(jobsRegistry),
        cleanupOldJobs: jobsRegistry.cleanupOldJobs.bind(jobsRegistry),

        // Email functions (no-op for SSR)
        sendEmail: async () => {},
        sendWelcomeEmail: async () => {},
        sendPasswordResetEmail: async () => {},
        sendTemplateEmail: async () => {},
        verifyEmailConnection: async () => false,

        // Tracer helpers - themes can use these for SSR tracing
        tracer,
        startSpan: tracer.startSpan.bind(tracer),
        trace: tracer.trace.bind(tracer),
        getCurrentSpan: tracer.getCurrentSpan.bind(tracer)
      })

      // Admin bar buttons registry - functional on SSR routes (appears on all pages)
      const RegisterAdminBarButtons = (await import('../registries/RegisterAdminBarButtons.mjs')).default
      const adminBarButtons = new RegisterAdminBarButtons(req, res, next)
      reqWithContext.hooks.adminBarButtons = adminBarButtons
      reqWithContext.hooks.registerButton = adminBarButtons.registerButton.bind(adminBarButtons)
      reqWithContext.hooks.unregisterButton = adminBarButtons.unregisterButton.bind(adminBarButtons)

      // Guard stub - SSR pages are typically public
      reqWithContext.guard = reqWithContext.guard || {
        user: async () => null
      }

      // Store trace on response finish (same as API routes)
      res.on('finish', () => {
        tracer.end()

        if (process.env.HD_TRACING_VERBOSE === 'true' || context.options?.tracing?.verbose) {
          console.log(tracer.toString())
        }

        if (context.traceStorage) {
          context.traceStorage.store(tracer.toJSON())
        }
      })

      return next()
    }

    // Start the main registry initialization span
    const registrySpan = tracer.startSpan('registry.init', {
      category: TraceCategory.CORE,
      tags: { path: req.path, method: req.method }
    })

    // Initialize a new Registry (per request)
    const registry = new Registry(req, res, next)

    // Attach tracer helper methods to hooks BEFORE registry.init()
    // so themes/plugins can use them during initialization
    reqWithContext.hooks.tracer = tracer
    reqWithContext.hooks.startSpan = tracer.startSpan.bind(tracer)
    reqWithContext.hooks.trace = tracer.trace.bind(tracer)
    reqWithContext.hooks.getCurrentSpan = tracer.getCurrentSpan.bind(tracer)

    // Example hooks
    registry.addAction('postTypeRegistered', (_type: unknown) => {
      // console.log('New post type registered:', type.slug)
    })

    registry.addAction('init', () => {
      // console.log('All registries and providers are ready!')
    })

    // Initialize all providers
    await registry.init()

    registrySpan.end()

    // Attach hooks and registries to context for plugin access
    reqWithContext.context.hooks = reqWithContext.hooks
    reqWithContext.context.registries = registry.registries

    // Add response finish handler to finalize trace
    res.on('finish', () => {
      tracer.end()

      // Log trace if verbose mode is enabled
      if (process.env.HD_TRACING_VERBOSE === 'true' || context.options?.tracing?.verbose) {
        console.log(tracer.toString())
      }

      // Store trace if storage is configured
      if (context.traceStorage) {
        context.traceStorage.store(tracer.toJSON())
      }
    })

    next()
  }
