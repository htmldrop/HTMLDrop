import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import express from 'express'
import ThemeLifecycleService from '../services/ThemeLifecycleService.mjs'

// Helper: compute folder hash (ignores node_modules)
const getFolderHash = async (folderPath) => {
  const files = await fs.promises.readdir(folderPath, { withFileTypes: true })
  const mtimes = []

  for (const file of files) {
    if (file.name === 'node_modules') continue
    const fullPath = path.join(folderPath, file.name)
    if (file.isDirectory()) {
      mtimes.push(await getFolderHash(fullPath))
    } else {
      const stats = await fs.promises.stat(fullPath)
      mtimes.push(stats.mtimeMs.toString())
    }
  }

  return crypto.createHash('md5').update(mtimes.join('|')).digest('hex')
}

// Worker-level cache for imported theme module
const themeModuleCache = new Map()
let lastActiveTheme = null
let themeActivationCalled = false

export default class RegisterThemes {
  constructor(req, res, next) {
    this.req = req
    this.res = res
    this.next = next
    this.context = req.context
    this.hooks = req.hooks
  }

  async init() {
    // Dynamically load provider modules from active theme
    const { options } = this.context

    try {
      const themeSlug = options.theme
      if (!themeSlug) return

      const themeFolder = path.resolve(`./hd-content/themes/${themeSlug}`)
      const themeIndex = path.join(themeFolder, 'index.mjs')

      // Skip if theme folder doesn't exist
      if (!fs.existsSync(themeFolder) || !fs.existsSync(themeIndex)) {
        console.warn(`Theme "${themeSlug}" not found`)
        return
      }

      // Clear module cache if active theme changed
      if (lastActiveTheme !== themeSlug) {
        themeModuleCache.clear()
        lastActiveTheme = themeSlug
        themeActivationCalled = false // Reset activation flag when theme changes
      }

      // Check if we need to import/re-import the module
      let themeModule = themeModuleCache.get(themeSlug)
      let needsImport = !themeModule

      if (themeModule) {
        // Check if theme folder changed (for hot reload)
        const currentHash = await getFolderHash(themeFolder)
        if (currentHash !== themeModule.hash) {
          needsImport = true
          // Clear the cache entry to force reimport
          themeModuleCache.delete(themeSlug)
        }
      }

      // Import or re-import module if needed
      if (needsImport) {
        const folderHash = await getFolderHash(themeFolder)
        const mod = await import(`${themeIndex}?t=${folderHash}`)

        if (typeof mod.default === 'function') {
          themeModuleCache.set(themeSlug, { module: mod.default, hash: folderHash })
          themeModule = themeModuleCache.get(themeSlug)
        } else {
          console.error(`Theme "${themeSlug}" does not export a default function`)
          return
        }
      }

      // ALWAYS call theme.init() on every request (to register routes, hooks, etc.)
      if (themeModule?.module) {
        const router = express.Router()

        try {
          const theme = await themeModule.module.call(
            { req: this.req, res: this.res, next: this.next, router },
            { req: this.req, res: this.res, next: this.next, router }
          )

          if (theme && typeof theme.init === 'function') {
            await theme.init()
          }
        } catch (err) {
          console.error(`Failed to initialize theme "${themeSlug}":`, err)
        }
      }

      // Call activation lifecycle hooks on first load (triggers badge counts, scheduled tasks, etc.)
      // Only execute on worker 1 to avoid duplicate lifecycle hook calls across workers
      if (!themeActivationCalled && themeSlug) {
        const cluster = await import('cluster')
        const isWorker1 = cluster.default.worker?.id === 1

        if (isWorker1) {
          const lifecycleService = new ThemeLifecycleService(this.context)

          try {
            // Call onActivate to trigger lifecycle hooks
            await lifecycleService.callLifecycleHook(themeSlug, 'onActivate', {
              themeSlug,
              timestamp: new Date().toISOString(),
              isStartup: true
            })
            // Only set flag after successful activation
            themeActivationCalled = true
          } catch (err) {
            // Don't fail server startup if lifecycle hook fails
            console.warn(`Failed to call onActivate for theme "${themeSlug}" on startup:`, err.message)
            // Set flag even on error to prevent repeated attempts on every request
            themeActivationCalled = true
          }
        }
      }
    } catch (e) {
      console.error('Theme could not load:', e)
    }
  }
}
