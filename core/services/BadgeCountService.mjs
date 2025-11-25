import path from 'path'
import fs from 'fs'
import UpdateService from './UpdateService.mjs'

const PLUGINS_BASE = path.resolve('./content/plugins')
const THEMES_BASE = path.resolve('./content/themes')
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes
const MAX_CONCURRENT_CHECKS = 30 // Max parallel npm registry requests

// Helper: Fetch version with timeout and error handling
const fetchPackageVersion = async (packageName, timeout = 5000) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      return data['dist-tags']?.latest
    }
    return null
  } catch (err) {
    clearTimeout(timeoutId)
    return null
  }
}

// Helper: Process items in batches to respect rate limits
const processBatch = async (items, batchSize) => {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch)
    results.push(...batchResults)
  }
  return results
}

// Helper: Count plugins with available updates
const countPluginUpdates = async () => {
  try {
    if (!fs.existsSync(PLUGINS_BASE)) {
      return 0
    }

    const pluginFolders = fs.readdirSync(PLUGINS_BASE).filter(name => {
      const pluginPath = path.join(PLUGINS_BASE, name)
      return fs.statSync(pluginPath).isDirectory() && !name.startsWith('.')
    })

    // Prepare check tasks
    const checkTasks = []
    const pluginNames = []
    for (const folder of pluginFolders) {
      const packageJsonPath = path.join(PLUGINS_BASE, folder, 'package.json')
      if (!fs.existsSync(packageJsonPath)) continue

      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        if (!packageJson.name || !packageJson.version) continue

        pluginNames.push({ name: packageJson.name, current: packageJson.version })
        checkTasks.push(
          fetchPackageVersion(packageJson.name).then(latestVersion => ({
            name: packageJson.name,
            current: packageJson.version,
            latest: latestVersion,
            hasUpdate: latestVersion && latestVersion !== packageJson.version
          }))
        )
      } catch (err) {
        // Skip invalid package.json
        continue
      }
    }

    // Process in batches to respect rate limits
    const results = await processBatch(checkTasks, MAX_CONCURRENT_CHECKS)
    const updatesAvailable = results.filter(r => r && r.hasUpdate)

    // Log updates found for debugging
    if (updatesAvailable.length > 0) {
      console.log('[BadgeCount] Plugin updates available:', updatesAvailable.map(u =>
        `${u.name} (${u.current} → ${u.latest})`
      ).join(', '))
    }

    return updatesAvailable.length
  } catch (error) {
    console.error('Failed to count plugin updates:', error)
    return 0
  }
}

// Helper: Count themes with available updates
const countThemeUpdates = async () => {
  try {
    if (!fs.existsSync(THEMES_BASE)) {
      return 0
    }

    const themeFolders = fs.readdirSync(THEMES_BASE).filter(name => {
      const themePath = path.join(THEMES_BASE, name)
      return fs.statSync(themePath).isDirectory() && !name.startsWith('.')
    })

    // Prepare check tasks
    const checkTasks = []
    for (const folder of themeFolders) {
      const packageJsonPath = path.join(THEMES_BASE, folder, 'package.json')
      if (!fs.existsSync(packageJsonPath)) continue

      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        if (!packageJson.name || !packageJson.version) continue

        checkTasks.push(
          fetchPackageVersion(packageJson.name).then(latestVersion => ({
            hasUpdate: latestVersion && latestVersion !== packageJson.version
          }))
        )
      } catch (err) {
        // Skip invalid package.json
        continue
      }
    }

    // Process in batches to respect rate limits
    const results = await processBatch(checkTasks, MAX_CONCURRENT_CHECKS)
    const updateCount = results.filter(r => r && r.hasUpdate).length

    return updateCount
  } catch (error) {
    console.error('Failed to count theme updates:', error)
    return 0
  }
}

export default class BadgeCountService {
  constructor(context) {
    this.context = context
    this.knex = context.knex
    this.table = context.table
  }

  /**
   * Update badge counts and store in database cache (shared across workers)
   * This should be called periodically or triggered by specific events
   * @param {boolean} force - If true, bypass cache TTL and force update
   */
  async updateBadgeCounts(force = false) {
    try {
      const now = Date.now()

      // Check if we need to update (respect cache TTL)
      const [pluginCache, themeCache, cmsCache] = await Promise.all([
        this.knex(this.table('options')).where('name', 'badge_count_plugins_cache').first(),
        this.knex(this.table('options')).where('name', 'badge_count_themes_cache').first(),
        this.knex(this.table('options')).where('name', 'badge_count_cms_cache').first()
      ])

      let shouldUpdatePlugins = true
      let shouldUpdateThemes = true
      let shouldUpdateCms = true

      // Only check cache TTL if not forced
      if (!force) {
        // Check if plugin cache is still valid
        if (pluginCache?.value) {
          try {
            const cached = JSON.parse(pluginCache.value)
            if (cached.timestamp && now - cached.timestamp < CACHE_TTL) {
              shouldUpdatePlugins = false
            }
          } catch (err) {
            // Invalid cache, will update
          }
        }

        // Check if theme cache is still valid
        if (themeCache?.value) {
          try {
            const cached = JSON.parse(themeCache.value)
            if (cached.timestamp && now - cached.timestamp < CACHE_TTL) {
              shouldUpdateThemes = false
            }
          } catch (err) {
            // Invalid cache, will update
          }
        }

        // Check if CMS cache is still valid
        if (cmsCache?.value) {
          try {
            const cached = JSON.parse(cmsCache.value)
            if (cached.timestamp && now - cached.timestamp < CACHE_TTL) {
              shouldUpdateCms = false
            }
          } catch (err) {
            // Invalid cache, will update
          }
        }

        // If all caches are valid, no need to update
        if (!shouldUpdatePlugins && !shouldUpdateThemes && !shouldUpdateCms) {
          return {
            updated: false,
            message: 'Cache still valid'
          }
        }
      }

      console.log('[BadgeCount] Updating badge counts... (plugins:', shouldUpdatePlugins, 'themes:', shouldUpdateThemes, 'cms:', shouldUpdateCms, ')')

      // Count updates in parallel
      const [pluginCount, themeCount, cmsUpdate] = await Promise.all([
        shouldUpdatePlugins ? countPluginUpdates() : Promise.resolve(JSON.parse(pluginCache.value).count),
        shouldUpdateThemes ? countThemeUpdates() : Promise.resolve(JSON.parse(themeCache.value).count),
        shouldUpdateCms ? this._checkCmsUpdate() : Promise.resolve(JSON.parse(cmsCache.value).available ? 1 : 0)
      ])

      console.log('[BadgeCount] Update complete - Plugins:', pluginCount, 'Themes:', themeCount, 'CMS:', cmsUpdate)

      // Store in database (upsert)
      if (shouldUpdatePlugins) {
        const pluginCacheData = JSON.stringify({ count: pluginCount, timestamp: now })
        const exists = await this.knex(this.table('options')).where('name', 'badge_count_plugins_cache').first()
        if (exists) {
          await this.knex(this.table('options'))
            .where('name', 'badge_count_plugins_cache')
            .update({ value: pluginCacheData, updated_at: this.knex.fn.now() })
        } else {
          await this.knex(this.table('options')).insert({
            name: 'badge_count_plugins_cache',
            value: pluginCacheData
          })
        }
      }

      if (shouldUpdateThemes) {
        const themeCacheData = JSON.stringify({ count: themeCount, timestamp: now })
        const exists = await this.knex(this.table('options')).where('name', 'badge_count_themes_cache').first()
        if (exists) {
          await this.knex(this.table('options'))
            .where('name', 'badge_count_themes_cache')
            .update({ value: themeCacheData, updated_at: this.knex.fn.now() })
        } else {
          await this.knex(this.table('options')).insert({
            name: 'badge_count_themes_cache',
            value: themeCacheData
          })
        }
      }

      if (shouldUpdateCms) {
        const cmsCacheData = JSON.stringify({ available: cmsUpdate === 1, timestamp: now })
        const exists = await this.knex(this.table('options')).where('name', 'badge_count_cms_cache').first()
        if (exists) {
          await this.knex(this.table('options'))
            .where('name', 'badge_count_cms_cache')
            .update({ value: cmsCacheData, updated_at: this.knex.fn.now() })
        } else {
          await this.knex(this.table('options')).insert({
            name: 'badge_count_cms_cache',
            value: cmsCacheData
          })
        }
      }

      return {
        updated: true,
        pluginCount,
        themeCount,
        cmsUpdate,
        timestamp: now
      }
    } catch (error) {
      console.error('Failed to update badge counts:', error)
      throw error
    }
  }

  /**
   * Get current badge counts from cache
   */
  async getBadgeCounts() {
    try {
      const [pluginCache, themeCache, cmsCache] = await Promise.all([
        this.knex(this.table('options')).where('name', 'badge_count_plugins_cache').first(),
        this.knex(this.table('options')).where('name', 'badge_count_themes_cache').first(),
        this.knex(this.table('options')).where('name', 'badge_count_cms_cache').first()
      ])

      const pluginCount = pluginCache?.value ? JSON.parse(pluginCache.value).count : 0
      const themeCount = themeCache?.value ? JSON.parse(themeCache.value).count : 0
      const cmsAvailable = cmsCache?.value ? JSON.parse(cmsCache.value).available : false

      return {
        plugins: pluginCount,
        themes: themeCount,
        cms: cmsAvailable ? 1 : 0
      }
    } catch (error) {
      console.error('Failed to get badge counts:', error)
      return { plugins: 0, themes: 0, cms: 0 }
    }
  }

  /**
   * Check if CMS update is available
   */
  async _checkCmsUpdate() {
    try {
      const updateService = new UpdateService(this.context)
      const updateStatus = await updateService.checkForUpdates()
      return updateStatus.available ? 1 : 0
    } catch (error) {
      console.error('Failed to check CMS updates:', error)
      return 0
    }
  }

  /**
   * Clear all badge count caches (forces refresh on next check)
   * Useful after CMS updates or plugin/theme changes
   */
  async clearCaches() {
    try {
      await Promise.all([
        this.knex(this.table('options')).where('name', 'badge_count_plugins_cache').del(),
        this.knex(this.table('options')).where('name', 'badge_count_themes_cache').del(),
        this.knex(this.table('options')).where('name', 'badge_count_cms_cache').del()
      ])
      console.log('[BadgeCount] All caches cleared')
    } catch (error) {
      console.error('Failed to clear badge count caches:', error)
    }
  }

  /**
   * Clear specific badge count cache
   * @param {string} type - Cache type: 'plugins', 'themes', or 'cms'
   */
  async clearCache(type) {
    try {
      const cacheName = `badge_count_${type}_cache`
      await this.knex(this.table('options')).where('name', cacheName).del()
      console.log(`[BadgeCount] ${type} cache cleared`)
    } catch (error) {
      console.error(`Failed to clear ${type} badge count cache:`, error)
    }
  }
}
