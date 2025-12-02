import express from 'express'
import path from 'path'
import adminBarMiddleware from '../middlewares/adminBarMiddleware.mjs'
import registryMiddleware from '../middlewares/registryMiddleware.mjs'
import { TraceCategory } from '../services/PerformanceTracer.mjs'
import { getFolderHash } from '../services/FolderHashCache.mjs'

export default (context) => {
  const router = express.Router()
  const uploadsPath = path.resolve('./content/uploads')

  // Apply admin bar middleware to all web routes
  router.use(adminBarMiddleware)

  // Serve attachments (before registry middleware - static files don't need hooks)
  router.use('/uploads', express.static(uploadsPath))

  // Apply registry middleware to set up hooks (including tracer) for themes
  router.use(registryMiddleware(context))

  // Web routes - dynamic theme loading per request
  router.all(/.*/, async (req, res, next) => {
    // Get tracer from request (may not exist for non-API routes without registry middleware)
    const tracer = req.tracer

    // Start WEB request span
    const webSpan = tracer?.startSpan('web.request', {
      category: TraceCategory.WEB,
      tags: { url: req.originalUrl, method: req.method }
    })

    try {
      const { options, knex } = req.context

      // If database not configured, redirect to admin setup
      if (!knex || !options || !options.theme) {
        webSpan?.end()
        return res.redirect('/admin')
      }

      const themeSlug = options.theme

      // Trace folder hash
      const folderHashSpan = tracer?.startSpan('theme.hash', {
        category: TraceCategory.HASH,
        tags: { theme: themeSlug }
      })

      // Trace folder hash computation
      const themeFolder = path.resolve(`./content/themes/${themeSlug}`)
      const themeIndex = path.join(themeFolder, 'index.mjs')

      // Use file-watcher-based cached hash (only recomputes when files actually change)
      const { hash: folderHash, cached: hashWasCached } = await getFolderHash(themeFolder)

      // Only trace if we actually computed the hash (not from cache)
      if (!hashWasCached && tracer) {
        tracer.getCurrentSpan()?.addTag('hashComputed', true)
      }

      folderHashSpan?.end()

      // Trace theme import
      const themeImportSpan = tracer?.startSpan('theme.import', {
        category: TraceCategory.THEME,
        tags: { theme: themeSlug, hash: folderHash }
      })

      const { default: theme } = await import(`${themeIndex}?t=${folderHash}`)

      themeImportSpan?.end()

      if (typeof theme !== 'function') {
        throw new Error(`Theme at ${themeIndex} must export a default async function`)
      }

      // Temporary router for this request
      const tempRouter = express.Router()

      // Trace theme initialization and render
      const themeRenderSpan = tracer?.startSpan('theme.render', {
        category: TraceCategory.RENDER,
        tags: { theme: themeSlug }
      })

      // Call theme with context + request router
      const themeInstance = await theme({ req, res, router: tempRouter })

      // Initialize theme (registers hooks, admin buttons, etc.)
      if (themeInstance?.init) {
        await themeInstance.init()
      }

      const html = await themeInstance?.render()

      themeRenderSpan?.addTag('htmlLength', html?.length || 0)
      themeRenderSpan?.end()

      if (html) {
        webSpan?.addTag('responseSize', html.length)
        res.type('html').send(html)
      }

      webSpan?.end()

      // Pass control to theme
      if (!res.headersSent) {
        tempRouter.handle(req, res, next)
      }
    } catch (err) {
      webSpan?.end({ error: err })
      console.error('Theme error:', err)
      res.type('html').send('<body>Theme not available</body>')
    }
  })

  return router
}
