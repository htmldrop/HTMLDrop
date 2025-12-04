import path from 'path'
import fs from 'fs'
import type { Response, NextFunction } from 'express'
import express from 'express'
import ThemeLifecycleService from '../services/ThemeLifecycleService.ts'
import { TraceCategory } from '../services/PerformanceTracer.ts'
import { getFolderHash, invalidateCache, requestWatcherSetup, requestWatcherTeardown } from '../services/FolderHashCache.ts'

interface ThemeModule {
  module: (args: { req: HTMLDrop.ExtendedRequest; res: Response; next: NextFunction; router: ReturnType<typeof express.Router> }) => Promise<{ init?: () => Promise<void> }>
  hash: string
}

// Worker-level cache for imported theme module
const themeModuleCache = new Map<string, ThemeModule>()
let lastActiveTheme: string | null = null
let themeActivationCalled = false
let watchedTheme: string | null = null // Track which theme has a watcher

export default class RegisterThemes {
  private req: HTMLDrop.ExtendedRequest
  private res: Response
  private next: NextFunction
  private context: HTMLDrop.Context
  private hooks: HTMLDrop.Hooks

  constructor(req: HTMLDrop.ExtendedRequest, res: Response, next: NextFunction) {
    this.req = req
    this.res = res
    this.next = next
    this.context = req.context
    this.hooks = req.hooks
  }

  async init() {
    // Dynamically load provider modules from active theme
    const { options } = this.context
    if (!options) {
      console.warn('[RegisterThemes] No options available, skipping theme initialization')
      return
    }
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
      const possibleFiles = ['index.mjs', 'index.js', 'index.ts']
      const themeIndex = possibleFiles
        .map(file => path.join(themeFolder, file))
        .find(fullPath => fs.existsSync(fullPath))

      // Skip if theme folder doesn't exist
      if (!fs.existsSync(themeFolder) || !themeIndex) {
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

        // Tear down watcher for old theme if it exists
        if (watchedTheme && watchedTheme !== themeSlug) {
          const oldThemeFolder = path.resolve(`./content/themes/${watchedTheme}`)
          requestWatcherTeardown(oldThemeFolder)
          watchedTheme = null
        }
      }

      // Set up watcher for this active theme (only once)
      if (watchedTheme !== themeSlug) {
        console.log(`[RegisterThemes] Setting up watcher for theme: ${themeSlug}`)
        requestWatcherSetup(themeFolder)
        watchedTheme = themeSlug
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
          themeRegistrySpan?.addTag('initError', err instanceof Error ? err.message : String(err))
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
            console.warn(`Failed to call onActivate for theme "${themeSlug}" on startup:`, err instanceof Error ? err.message : String(err))
            // Set flag even on error to prevent repeated attempts on every request
            themeActivationCalled = true
            lifecycleSpan?.end({ error: err instanceof Error ? err : new Error(String(err)) })
          }
        }
      }

      themeRegistrySpan?.end()
    } catch (e) {
      console.error('Theme could not load:', e)
      themeRegistrySpan?.end({ error: e instanceof Error ? e : new Error(String(e)) })
    }
  }
}
