import Registry from '../registries/index.mjs'

export default (context) => async (req, res, next) => {
  // Create a request-level context that inherits from global context
  req.context = context

  // Initialize a new Registry (per request)
  const registry = new Registry(req, res, next)

  // Example hooks
  registry.addAction('postTypeRegistered', (type) => {
    // console.log('New post type registered:', type.slug)
  })

  registry.addAction('init', () => {
    // console.log('All registries and providers are ready!')
  })

  // Initialize all providers
  await registry.init()

  // Attach hooks to context for plugin access
  req.context.hooks = req.hooks

  next()
}
