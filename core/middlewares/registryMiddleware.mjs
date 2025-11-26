import Registry from '../registries/index.mjs'
import PerformanceTracer, { TraceCategory } from '../services/PerformanceTracer.mjs'
import fs from 'fs'
import path from 'path'

// Cache for skip paths (refreshed when theme/plugins change or configs are modified)
let cachedSkipPaths = []
let cachedThemeSlug = null
let cachedPluginSlugs = null
let cachedConfigMtimes = null // JSON string of {path: mtime} to detect config file changes

/**
 * Get modification times for all config files
 */
const getConfigMtimes = async (themeSlug, activePlugins) => {
  const mtimes = {}

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
const loadConfigSkipPaths = async (configPath) => {
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
const getSkipPaths = async (options) => {
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

  const allPaths = []

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
  cachedThemeSlug = themeSlug
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
export default (context) => async (req, res, next) => {
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
    req.skipRegistry === true ||
    req.query.skipRegistry === 'true' ||
    req.headers['x-skip-registry'] === 'true' ||
    pathMatchesSkipPattern

  // Create a request-level context that inherits from global context
  req.context = context

  // Initialize performance tracer for this request
  // Check if tracing is enabled via environment or options
  const tracingEnabled = process.env.HD_TRACING_ENABLED !== 'false' && context.options?.tracing?.enabled !== false
  const sampleRate = parseFloat(process.env.HD_TRACING_SAMPLE_RATE) || context.options?.tracing?.sampleRate || 1.0

  const tracer = new PerformanceTracer({
    enabled: tracingEnabled,
    sampleRate
  })

  // Set request info on tracer
  tracer.setRequest(req)

  // Attach tracer to request for access throughout the request lifecycle
  req.tracer = tracer
  req.context.tracer = tracer

  // Skip full registry initialization for:
  // 1. Non-API routes (static assets, SSR pages)
  // 2. Routes explicitly marked to skip via query param, header, or middleware
  const isNonApiRoute = !fullPath.startsWith('/api/')

  if (isNonApiRoute || shouldSkipRegistry) {
    
    // Provide minimal hooks for themes that use createContext()
    // These are lightweight stubs - the full registry is not initialized
    req.hooks = req.hooks || {
      // Core hook methods (no-op for SSR)
      addAction: () => {},
      addFilter: () => {},
      doAction: async () => {},
      applyFilters: async (_, value) => value,

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
      theExcerpt: (post, length = 150) => (post?.excerpt || post?.content || '').slice(0, length),

      // Dashboard/admin functions (return empty for SSR)
      getMenuTree: async () => [],
      getControls: async () => [],
      addControl: async () => {},

      // Job functions (no-op for SSR)
      createJob: async () => null,
      getJobs: async () => [],
      getJob: async () => null,
      cleanupOldJobs: async () => 0,

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
    }

    // Guard stub - SSR pages are typically public
    req.guard = req.guard || {
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
  req.hooks.tracer = tracer
  req.hooks.startSpan = tracer.startSpan.bind(tracer)
  req.hooks.trace = tracer.trace.bind(tracer)
  req.hooks.getCurrentSpan = tracer.getCurrentSpan.bind(tracer)

  // Example hooks
  registry.addAction('postTypeRegistered', (type) => {
    // console.log('New post type registered:', type.slug)
  })

  registry.addAction('init', () => {
    // console.log('All registries and providers are ready!')
  })

  // Initialize all providers
  await registry.init()

  registrySpan.end()

  // Attach hooks and registries to context for plugin access
  req.context.hooks = req.hooks
  req.context.registries = registry.registries

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
