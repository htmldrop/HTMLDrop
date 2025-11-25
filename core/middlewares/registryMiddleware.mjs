import Registry from '../registries/index.mjs'
import PerformanceTracer, { TraceCategory } from '../services/PerformanceTracer.mjs'

export default (context) => async (req, res, next) => {
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
