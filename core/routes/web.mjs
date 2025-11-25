import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import adminBarMiddleware from '../middlewares/adminBarMiddleware.mjs'
import registryMiddleware from '../middlewares/registryMiddleware.mjs'
import { TraceCategory } from '../services/PerformanceTracer.mjs'

export default (context) => {
  const router = express.Router()
  const uploadsPath = path.resolve('./content/uploads')

  // Apply admin bar middleware to all web routes
  router.use(adminBarMiddleware)

  // Serve attachments (before registry middleware - static files don't need hooks)
  router.use('/uploads', express.static(uploadsPath))

  // Apply registry middleware to set up hooks (including tracer) for themes
  router.use(registryMiddleware(context))

  // Helper: compute folder hash (ignores node_modules)
  const getFolderHash = async (folderPath) => {
    const files = await fs.readdir(folderPath, { withFileTypes: true })
    const mtimes = []

    for (const file of files) {
      if (file.name === 'node_modules') continue
      const fullPath = path.join(folderPath, file.name)
      if (file.isDirectory()) {
        mtimes.push(await getFolderHash(fullPath))
      } else {
        const stats = await fs.stat(fullPath)
        mtimes.push(stats.mtimeMs.toString())
      }
    }

    return crypto.createHash('md5').update(mtimes.join('|')).digest('hex')
  }

  // Web routes - dynamic theme loading per request
  router.all(/.*/, async (req, res, next) => {
    // Get tracer from request (may not exist for non-API routes without registry middleware)
    const tracer = req.tracer

    // Start SSR request span
    const ssrSpan = tracer?.startSpan('ssr.request', {
      category: TraceCategory.SSR,
      tags: { url: req.originalUrl, method: req.method }
    })

    try {
      const { options, knex } = req.context

      // If database not configured, redirect to admin setup
      if (!knex || !options || !options.theme) {
        ssrSpan?.end()
        return res.redirect('/admin')
      }

      const themeSlug = options.theme

      // Trace folder hash computation
      const themeFolder = path.resolve(`./content/themes/${themeSlug}`)
      const themeIndex = path.join(themeFolder, 'index.mjs')

      const folderHash = await tracer?.trace(
        'theme.computeHash',
        async () => getFolderHash(themeFolder),
        { category: TraceCategory.IO, tags: { theme: themeSlug } }
      ) || await getFolderHash(themeFolder)

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
      const html = await themeInstance?.render()

      themeRenderSpan?.addTag('htmlLength', html?.length || 0)
      themeRenderSpan?.end()

      if (html) {
        ssrSpan?.addTag('responseSize', html.length)
        res.type('html').send(html)
      }

      ssrSpan?.end()

      // Pass control to theme
      if (!res.headersSent) {
        tempRouter.handle(req, res, next)
      }
    } catch (err) {
      ssrSpan?.end({ error: err })
      console.error('Theme error:', err)
      res.type('html').send('<body>Theme not available</body>')
    }
  })

  return router
}
