import path from 'path'
import fs from 'fs'
import express from 'express'
import ThemeLifecycleService from '../services/ThemeLifecycleService.mjs'
import { TraceCategory } from '../services/PerformanceTracer.mjs'
import { getFolderHash, invalidateCache } from '../services/FolderHashCache.mjs'

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
    const tracer = this.req.tracer

    // Start theme registry init span
    const themeRegistrySpan = tracer?.startSpan('themes.init', {
      category: TraceCategory.THEME
    })

    try {
      const themeSlug = options.theme
      if (!themeSlug) {
        themeRegistrySpan?.addTag('skipped', 'no theme configured')
        themeRegistrySpan?.end()
        return
      }

      themeRegistrySpan?.addTag('theme', themeSlug)

      const themeFolder = path.resolve(`./content/themes/${themeSlug}`)
      const themeIndex = path.join(themeFolder, 'index.mjs')

      // Skip if theme folder doesn't exist
      if (!fs.existsSync(themeFolder) || !fs.existsSync(themeIndex)) {
        console.warn(`Theme "${themeSlug}" not found`)
        themeRegistrySpan?.addTag('skipped', 'theme not found')
        themeRegistrySpan?.end()
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
        // Check if theme folder changed (for hot reload) using file-watcher-based cache
        const { hash: currentHash, cached: hashWasCached } = await getFolderHash(themeFolder)

        // Only log hash check if we actually computed it
        if (!hashWasCached) {
          const hashSpan = tracer?.startSpan('themes.checkHash', {
            category: TraceCategory.IO,
            tags: { theme: themeSlug, computed: true }
          })
          hashSpan?.end()
        }

        if (currentHash !== themeModule.hash) {
          needsImport = true
          themeRegistrySpan?.addTag('reimport', 'hash changed')
          // Clear the cache entry to force reimport
          themeModuleCache.delete(themeSlug)
          // Also invalidate folder hash cache to ensure fresh hash on import
          invalidateCache(themeFolder)
        }
      }

      // Import or re-import module if needed
      if (needsImport) {
        const importSpan = tracer?.startSpan('themes.import', {
          category: TraceCategory.THEME,
          tags: { theme: themeSlug }
        })

        // Get hash (may be cached if we just checked it above)
        const { hash: folderHash } = await getFolderHash(themeFolder)
        const mod = await import(`${themeIndex}?t=${folderHash}`)

        importSpan?.addTag('hash', folderHash)
        importSpan?.end()

        if (typeof mod.default === 'function') {
          themeModuleCache.set(themeSlug, { module: mod.default, hash: folderHash })
          themeModule = themeModuleCache.get(themeSlug)
          themeRegistrySpan?.addTag('imported', true)
        } else {
          console.error(`Theme "${themeSlug}" does not export a default function`)
          themeRegistrySpan?.end({ error: new Error('Theme does not export default function') })
          return
        }
      } else {
        themeRegistrySpan?.addTag('cached', true)
      }

      // ALWAYS call theme.init() on every request (to register routes, hooks, etc.)
      if (themeModule?.module) {
        const router = express.Router()

        try {
          const themeInitSpan = tracer?.startSpan('themes.instance', {
            category: TraceCategory.THEME,
            tags: { theme: themeSlug }
          })

          const theme = await themeModule.module.call(
            { req: this.req, res: this.res, next: this.next, router },
            { req: this.req, res: this.res, next: this.next, router }
          )

          themeInitSpan?.end()

          if (theme && typeof theme.init === 'function') {
            const initSpan = tracer?.startSpan('themes.init.hook', {
              category: TraceCategory.LIFECYCLE,
              tags: { theme: themeSlug }
            })
            await theme.init()
            initSpan?.end()
          }
        } catch (err) {
          console.error(`Failed to initialize theme "${themeSlug}":`, err)
          themeRegistrySpan?.addTag('initError', err.message)
        }
      }

      // Call activation lifecycle hooks on first load (triggers badge counts, scheduled tasks, etc.)
      // Only execute on worker 1 to avoid duplicate lifecycle hook calls across workers
      if (!themeActivationCalled && themeSlug) {
        const cluster = await import('cluster')
        const isWorker1 = cluster.default.worker?.id === 1

        if (isWorker1) {
          const lifecycleSpan = tracer?.startSpan('themes.lifecycle.onActivate', {
            category: TraceCategory.LIFECYCLE,
            tags: { theme: themeSlug, isStartup: true }
          })

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
            lifecycleSpan?.end()
          } catch (err) {
            // Don't fail server startup if lifecycle hook fails
            console.warn(`Failed to call onActivate for theme "${themeSlug}" on startup:`, err.message)
            // Set flag even on error to prevent repeated attempts on every request
            themeActivationCalled = true
            lifecycleSpan?.end({ error: err })
          }
        }
      }

      themeRegistrySpan?.end()
    } catch (e) {
      console.error('Theme could not load:', e)
      themeRegistrySpan?.end({ error: e })
    }
  }
}
