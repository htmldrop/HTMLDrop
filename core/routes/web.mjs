import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import adminBarMiddleware from '../middlewares/adminBarMiddleware.mjs'

export default (context) => {
  const router = express.Router()
  const uploadsPath = path.resolve('./content/uploads')

  // Apply admin bar middleware to all web routes
  router.use(adminBarMiddleware)

  // Serve attachments
  router.use('/uploads', express.static(uploadsPath))

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
    try {
      const { options, knex } = req.context

      // If database not configured, redirect to admin setup
      if (!knex || !options || !options.theme) {
        return res.redirect('/admin')
      }

      // Determine which theme to use (DB, hostname, etc.)
      const themeFolder = path.resolve(`./content/themes/${options.theme}`)
      const themeIndex = path.join(themeFolder, 'index.mjs')

      // Compute folder hash dynamically
      const folderHash = await getFolderHash(themeFolder)

      // Dynamically import theme, cache-bust by folder hash
      const { default: theme } = await import(`${themeIndex}?t=${folderHash}`)

      if (typeof theme !== 'function') {
        throw new Error(`Theme at ${themeIndex} must export a default async function`)
      }

      // Temporary router for this request
      const tempRouter = express.Router()

      // Call theme with context + request router
      const html = await (await theme({ req, res, router: tempRouter }))?.render()

      if (html) res.type('html').send(html)

      // Pass control to theme
      if (!res.headersSent) {
        tempRouter.handle(req, res, next)
      }
    } catch (err) {
      console.error('Theme error:', err)
      res.type('html').send('<body>Theme not available</body>')
    }
  })

  return router
}
