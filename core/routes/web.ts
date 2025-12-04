import type { Router, Request, Response, NextFunction } from 'express'
import express from 'express'
import path from 'path'
import fs from 'fs'
import adminBarMiddleware from '../middlewares/adminBarMiddleware.ts'
import registryMiddleware from '../middlewares/registryMiddleware.ts'
import { TraceCategory } from '../services/PerformanceTracer.ts'
import { getFolderHash } from '../services/FolderHashCache.ts'

interface ExtendedRequest extends Request {
  tracer?: {
    startSpan: (name: string, options?: { category?: string; tags?: Record<string, any> }) => {
      addTag: (key: string, value: any) => void
      end: (options?: { error?: any }) => void
    } | null
    getCurrentSpan: () => { addTag: (key: string, value: any) => void } | null
  }
  context: HTMLDrop.Context
}

interface ThemeInstance {
  init?: () => Promise<void>
  render?: () => Promise<string>
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router()
  const uploadsPath = path.resolve('./content/uploads')

  // Apply admin bar middleware to all web routes
  router.use(adminBarMiddleware)

  // Serve attachments (before registry middleware - static files don't need hooks)
  router.use('/uploads', express.static(uploadsPath))

  // Apply registry middleware to set up hooks (including tracer) for themes
  router.use(registryMiddleware(context))

  // Web routes - dynamic theme loading per request
  router.all(/.*/, async (req: Request, res: Response, next: NextFunction) => {
    const extReq = req as ExtendedRequest
    // Get tracer from request (may not exist for non-API routes without registry middleware)
    const tracer = extReq.tracer

    // Start WEB request span
    const webSpan = tracer?.startSpan('web.request', {
      category: TraceCategory.WEB,
      tags: { url: req.originalUrl, method: req.method }
    })

    try {
      const { options, knex } = extReq.context

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
      const possibleFiles = ['index.ts', 'index.mjs', 'index.js']
      const themeIndex = possibleFiles
        .map(file => path.join(themeFolder, file))
        .find(fullPath => fs.existsSync(fullPath))

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
      const themeInstance: ThemeInstance = await theme({ req, res, router: tempRouter })

      // Initialize theme (registers hooks, admin buttons, etc.)
      if (themeInstance?.init) {
        await themeInstance.init()
      }

      const html = themeInstance?.render ? await themeInstance.render() : null

      themeRenderSpan?.addTag('htmlLength', html?.length || 0)
      themeRenderSpan?.end()

      if (html) {
        webSpan?.addTag('responseSize', html.length)
        res.type('html').send(html)
      }

      webSpan?.end()

      // Pass control to theme
      if (!res.headersSent) {
        (tempRouter as any).handle(req, res, next)
      }
    } catch (err) {
      webSpan?.end({ error: err })
      console.error('Theme error:', err)
      res.type('html').send('<body>Theme not available</body>')
    }
  })

  return router
}
