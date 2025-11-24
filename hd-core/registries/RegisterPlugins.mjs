import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import express from 'express'
import PluginLifecycleService from '../services/PluginLifecycleService.mjs'

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

// Worker-level cache for initialized plugins
const pluginCache = new Map()
let lastActivePlugins = null
let isFirstLoad = true

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
    const activePlugins = options.active_plugins || []
    const activePluginsKey = JSON.stringify(activePlugins)

    // If active plugins haven't changed and we have cached plugins, skip re-initialization
    if (lastActivePlugins === activePluginsKey && pluginCache.size > 0) {
      return
    }

    // Clear cache if active plugins changed
    if (lastActivePlugins !== activePluginsKey) {
      pluginCache.clear()
    }

    lastActivePlugins = activePluginsKey
    const loadedPlugins = []
    const failedPlugins = []

    for (const pluginSlug of activePlugins) {
      // Skip if already cached
      if (pluginCache.has(pluginSlug)) {
        continue
      }

      try {
        const pluginFolder = path.resolve(`./hd-content/plugins/${pluginSlug}`)
        const pluginIndex = path.join(pluginFolder, 'index.mjs')

        // Skip if plugin folder doesn't exist (renamed or deleted)
        if (!fs.existsSync(pluginFolder) || !fs.existsSync(pluginIndex)) {
          failedPlugins.push(pluginSlug)
          continue
        }

        // Compute folder hash for cache-busting
        const folderHash = await getFolderHash(pluginFolder)

        // Dynamically import plugin
        const mod = await import(`${pluginIndex}?t=${folderHash}`)
        if (typeof mod.default === 'function') {
          const router = express.Router()

          // Suppress console.log during plugin initialization to prevent duplicate logs
          const originalLog = console.log
          console.log = () => {}

          try {
            const plugin = await mod.default({ req: this.req, res: this.res, next: this.next, router })
            if (plugin && typeof plugin.init === 'function') {
              await plugin.init()
            }
          } finally {
            console.log = originalLog
          }

          pluginCache.set(pluginSlug, true)
          loadedPlugins.push(pluginSlug)
        }
      } catch (err) {
        console.error(`Worker ${process.pid} failed to load plugin "${pluginSlug}":`, err)
        failedPlugins.push(pluginSlug)
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
          try {
            // Call onActivate to trigger lifecycle hooks
            await lifecycleService.callLifecycleHook(pluginSlug, 'onActivate', {
              pluginSlug,
              timestamp: new Date().toISOString(),
              isStartup: true
            })
          } catch (err) {
            // Don't fail server startup if lifecycle hook fails
            console.warn(`Failed to call onActivate for plugin "${pluginSlug}" on startup:`, err.message)
          }
        }
      }

      // Notify scheduler that plugins are initialized (all workers)
      if (this.context.onPluginsInitialized) {
        this.context.onPluginsInitialized()
      }
    }

    // Report back to primary process on first load
    if (isFirstLoad && process.send && (loadedPlugins.length > 0 || failedPlugins.length > 0)) {
      isFirstLoad = false
      process.send({
        type: 'plugins_loaded',
        loaded: loadedPlugins,
        failed: failedPlugins
      })
    }
  }
}
