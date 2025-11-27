import path from 'path'
import fs from 'fs'
import express from 'express'
import PluginLifecycleService from '../services/PluginLifecycleService.mjs'
import { TraceCategory } from '../services/PerformanceTracer.mjs'
import { getFolderHash, invalidateCache, requestWatcherSetup, requestWatcherTeardown } from '../services/FolderHashCache.mjs'

// Worker-level cache for imported plugin modules
const pluginModuleCache = new Map()
let lastActivePlugins = null
let isFirstLoad = true
let watchedPlugins = new Set() // Track which plugins have watchers

export default class RegisterPlugins {
  constructor(req, res, next) {
    this.req = req
    this.res = res
    this.next = next
    this.context = req.context
    this.hooks = req.hooks
  }

  async init() {
    const { options } = this.context
    const tracer = this.req.tracer
    const activePlugins = options.active_plugins || []
    const activePluginsKey = JSON.stringify(activePlugins)

    // Start plugins init span
    const pluginsSpan = tracer?.startSpan('plugins.init', {
      category: TraceCategory.PLUGIN,
      tags: { pluginCount: activePlugins.length }
    })

    // Clear module cache if active plugins changed
    if (lastActivePlugins !== activePluginsKey) {
      pluginModuleCache.clear()
      lastActivePlugins = activePluginsKey
      pluginsSpan?.addTag('cacheCleared', true)

      // Tear down watchers for plugins that are no longer active
      const activePluginsSet = new Set(activePlugins)
      for (const watchedPlugin of watchedPlugins) {
        if (!activePluginsSet.has(watchedPlugin)) {
          const pluginFolder = path.resolve(`./content/plugins/${watchedPlugin}`)
          requestWatcherTeardown(pluginFolder)
          watchedPlugins.delete(watchedPlugin)
        }
      }
    }

    const loadedPlugins = []
    const failedPlugins = []

    for (const pluginSlug of activePlugins) {
      const pluginSpan = tracer?.startSpan(`plugins.load.${pluginSlug}`, {
        category: TraceCategory.PLUGIN,
        tags: { plugin: pluginSlug }
      })

      try {
        const pluginFolder = path.resolve(`./content/plugins/${pluginSlug}`)
        const pluginIndex = path.join(pluginFolder, 'index.mjs')

        // Skip if plugin folder doesn't exist (renamed or deleted)
        if (!fs.existsSync(pluginFolder) || !fs.existsSync(pluginIndex)) {
          failedPlugins.push(pluginSlug)
          pluginSpan?.addTag('skipped', 'not found')
          pluginSpan?.end()
          // Remove from watched plugins if it was previously watched
          if (watchedPlugins.has(pluginSlug)) {
            requestWatcherTeardown(pluginFolder)
            watchedPlugins.delete(pluginSlug)
          }
          continue
        }

        // Set up watcher for this active plugin (only once, after validation)
        if (!watchedPlugins.has(pluginSlug)) {
          console.log(`[RegisterPlugins] Setting up watcher for plugin: ${pluginSlug}`)
          requestWatcherSetup(pluginFolder)
          watchedPlugins.add(pluginSlug)
        }

        // Check if we need to import/re-import the module
        let pluginModule = pluginModuleCache.get(pluginSlug)
        let needsImport = !pluginModule

        if (pluginModule) {
          // Check if plugin folder changed (for hot reload) using file-watcher-based cache
          const { hash: currentHash, cached: hashWasCached } = await getFolderHash(pluginFolder)

          // Only log hash check if we actually computed it
          if (!hashWasCached) {
            const hashSpan = tracer?.startSpan(`plugins.checkHash.${pluginSlug}`, {
              category: TraceCategory.IO,
              tags: { plugin: pluginSlug, computed: true }
            })
            hashSpan?.end()
          }

          if (currentHash !== pluginModule.hash) {
            needsImport = true
            pluginSpan?.addTag('reimport', 'hash changed')
            // Invalidate folder hash cache to ensure fresh hash on import
            invalidateCache(pluginFolder)
          }
        }

        // Import or re-import module if needed
        if (needsImport) {
          const importSpan = tracer?.startSpan(`plugins.import.${pluginSlug}`, {
            category: TraceCategory.PLUGIN,
            tags: { plugin: pluginSlug }
          })

          // Get hash (may be cached if we just checked it above)
          const { hash: folderHash } = await getFolderHash(pluginFolder)
          const mod = await import(`${pluginIndex}?t=${folderHash}`)

          importSpan?.addTag('hash', folderHash)
          importSpan?.end()

          if (typeof mod.default === 'function') {
            pluginModuleCache.set(pluginSlug, { module: mod.default, hash: folderHash })
            pluginModule = pluginModuleCache.get(pluginSlug)
            loadedPlugins.push(pluginSlug)
            pluginSpan?.addTag('imported', true)
          } else {
            failedPlugins.push(pluginSlug)
            pluginSpan?.end({ error: new Error('Plugin does not export default function') })
            continue
          }
        } else {
          pluginSpan?.addTag('cached', true)
        }

        // ALWAYS call plugin.init() on every request (to register routes, hooks, etc.)
        if (pluginModule?.module) {
          const router = express.Router()

          // Suppress console.log during plugin initialization to prevent duplicate logs
          const originalLog = console.log
          console.log = () => {}

          try {
            const initSpan = tracer?.startSpan(`plugins.init.${pluginSlug}`, {
              category: TraceCategory.LIFECYCLE,
              tags: { plugin: pluginSlug }
            })

            const plugin = await pluginModule.module({ req: this.req, res: this.res, next: this.next, router })
            if (plugin && typeof plugin.init === 'function') {
              await plugin.init()
            }

            initSpan?.end()
          } finally {
            console.log = originalLog
          }
        }

        pluginSpan?.end()
      } catch (err) {
        console.error(`Worker ${process.pid} failed to load plugin "${pluginSlug}":`, err)
        failedPlugins.push(pluginSlug)
        pluginSpan?.end({ error: err })
      }
    }

    // Call activation lifecycle hooks on first load (triggers badge counts, scheduled tasks, etc.)
    // Only execute on worker 1 to avoid duplicate lifecycle hook calls across workers
    if (isFirstLoad && loadedPlugins.length > 0) {
      const cluster = await import('cluster')
      const isWorker1 = cluster.default.worker?.id === 1

      if (isWorker1) {
        const lifecycleService = new PluginLifecycleService(this.context)

        for (const pluginSlug of loadedPlugins) {
          const lifecycleSpan = tracer?.startSpan(`plugins.lifecycle.onActivate.${pluginSlug}`, {
            category: TraceCategory.LIFECYCLE,
            tags: { plugin: pluginSlug, isStartup: true }
          })

          try {
            // Call onActivate to trigger lifecycle hooks
            await lifecycleService.callLifecycleHook(pluginSlug, 'onActivate', {
              pluginSlug,
              timestamp: new Date().toISOString(),
              isStartup: true
            })
            lifecycleSpan?.end()
          } catch (err) {
            // Don't fail server startup if lifecycle hook fails
            console.warn(`Failed to call onActivate for plugin "${pluginSlug}" on startup:`, err.message)
            lifecycleSpan?.end({ error: err })
          }
        }
      }

      // Notify scheduler that plugins are initialized (all workers)
      if (this.context.onPluginsInitialized) {
        this.context.onPluginsInitialized()
      }
    }

    // Reset isFirstLoad flag after activation hooks have been called
    if (isFirstLoad && loadedPlugins.length > 0) {
      isFirstLoad = false
    }

    pluginsSpan?.addTags({
      loaded: loadedPlugins.length,
      failed: failedPlugins.length,
      loadedPlugins: loadedPlugins.join(','),
      failedPlugins: failedPlugins.join(',')
    })
    pluginsSpan?.end()

    // Report back to primary process on first load
    if (process.send && (loadedPlugins.length > 0 || failedPlugins.length > 0)) {
      process.send({
        type: 'plugins_loaded',
        loaded: loadedPlugins,
        failed: failedPlugins
      })
    }
  }
}
