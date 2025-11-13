/**
 * Plugin Lifecycle Service
 *
 * Manages plugin lifecycle events: install, activate, deactivate, uninstall, upgrade, downgrade
 */

import fs from 'fs'
import path from 'path'
import PluginMigrationService from './PluginMigrationService.mjs'

class PluginLifecycleService {
  constructor(context) {
    this.context = context
    this.PLUGINS_BASE = path.resolve('./hd-content/plugins')
    this.migrationService = new PluginMigrationService(context)
  }

  /**
   * Load a plugin's lifecycle hooks from its index.mjs
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Object|null>} The plugin module with lifecycle hooks
   */
  async loadPluginModule(pluginSlug) {
    try {
      const pluginPath = path.join(this.PLUGINS_BASE, pluginSlug, 'index.mjs')

      if (!fs.existsSync(pluginPath)) {
        return null
      }

      // Dynamic import with cache-busting
      const timestamp = Date.now()
      const module = await import(`${pluginPath}?t=${timestamp}`)

      return module.default
    } catch (error) {
      console.error(`Failed to load plugin module ${pluginSlug}:`, error)
      return null
    }
  }

  /**
   * Get plugin metadata from package.json
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Object>} Plugin metadata
   */
  async getPluginMetadata(pluginSlug) {
    const packageJsonPath = path.join(this.PLUGINS_BASE, pluginSlug, 'package.json')

    try {
      if (fs.existsSync(packageJsonPath)) {
        const content = await fs.promises.readFile(packageJsonPath, 'utf8')
        const packageJson = JSON.parse(content)

        return {
          name: packageJson.name || pluginSlug,
          version: packageJson.version || '1.0.0',
          description: packageJson.description || '',
          author: packageJson.author || '',
          htmldrop: packageJson.htmldrop || {},
          dependencies: packageJson.htmldrop?.dependencies || []
        }
      }
    } catch (error) {
      console.error(`Failed to read plugin metadata for ${pluginSlug}:`, error)
    }

    return {
      name: pluginSlug,
      version: '1.0.0',
      description: '',
      author: '',
      htmldrop: {},
      dependencies: []
    }
  }

  /**
   * Check if plugin dependencies are met
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Object>} Result with met status and missing dependencies
   */
  async checkDependencies(pluginSlug) {
    const metadata = await this.getPluginMetadata(pluginSlug)
    const dependencies = metadata.dependencies || []

    if (dependencies.length === 0) {
      return { met: true, missing: [] }
    }

    const { knex, table } = this.context
    const optionRow = await knex(table('options')).where({ name: 'active_plugins' }).first()

    const activePlugins = optionRow ? JSON.parse(optionRow.value) : []
    const missing = dependencies.filter((dep) => !activePlugins.includes(dep))

    return {
      met: missing.length === 0,
      missing
    }
  }

  /**
   * Get plugins that depend on this plugin
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Array>} Array of dependent plugin slugs
   */
  async getDependentPlugins(pluginSlug) {
    const folders = await fs.promises.readdir(this.PLUGINS_BASE, { withFileTypes: true })
    const dependents = []

    for (const folder of folders) {
      if (!folder.isDirectory() || folder.name.startsWith('.')) continue

      const metadata = await this.getPluginMetadata(folder.name)
      if (metadata.dependencies && metadata.dependencies.includes(pluginSlug)) {
        dependents.push(folder.name)
      }
    }

    return dependents
  }

  /**
   * Call a lifecycle hook on a plugin
   * @param {string} pluginSlug - The plugin slug
   * @param {string} hookName - The lifecycle hook name (onInstall, onActivate, etc.)
   * @param {Object} args - Additional arguments to pass to the hook
   * @returns {Promise<any>} Result from the hook
   */
  async callLifecycleHook(pluginSlug, hookName, args = {}) {
    try {
      const pluginModule = await this.loadPluginModule(pluginSlug)

      if (!pluginModule) {
        console.warn(`Plugin module not found: ${pluginSlug}`)
        return null
      }

      // Create a mock request object with context
      const mockReq = {
        context: this.context,
        hooks: this.context.hooks || {},
        guard: this.context.guard || {}
      }

      const mockRes = {}
      const mockNext = () => {}
      const mockRouter = {
        get: () => {},
        post: () => {},
        put: () => {},
        patch: () => {},
        delete: () => {}
      }

      // Call the plugin module to get the plugin instance
      const pluginInstance = await pluginModule({
        req: mockReq,
        res: mockRes,
        next: mockNext,
        router: mockRouter
      })

      // Check if the lifecycle hook exists
      if (pluginInstance && typeof pluginInstance[hookName] === 'function') {
        console.log(`Calling ${hookName} for plugin: ${pluginSlug}`)
        const result = await pluginInstance[hookName](args)
        return result
      } else {
        console.log(`No ${hookName} hook found for plugin: ${pluginSlug}`)
        return null
      }
    } catch (error) {
      console.error(`Error calling ${hookName} for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onInstall lifecycle hook
   * Called after plugin ZIP is extracted or NPM package is installed
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<void>}
   */
  async onInstall(pluginSlug) {
    console.log(`Running onInstall for plugin: ${pluginSlug}`)

    try {
      // Run plugin migrations first
      const hasMigrations = await this.migrationService.hasPluginMigrations(pluginSlug)
      if (hasMigrations) {
        console.log(`Running migrations for plugin: ${pluginSlug}`)
        const result = await this.migrationService.runPluginMigrations(pluginSlug)
        console.log(`Ran ${result.count} migrations`)
      }

      // Call plugin's onInstall hook
      await this.callLifecycleHook(pluginSlug, 'onInstall', {
        pluginSlug,
        timestamp: new Date().toISOString()
      })

      // Store installation timestamp
      await this.storePluginState(pluginSlug, {
        installed_at: new Date().toISOString(),
        status: 'installed'
      })

      console.log(`Plugin ${pluginSlug} installed successfully`)
    } catch (error) {
      console.error(`Installation failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onActivate lifecycle hook
   * Called when plugin is activated
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<void>}
   */
  async onActivate(pluginSlug) {
    console.log(`Running onActivate for plugin: ${pluginSlug}`)

    // Check dependencies
    const depsCheck = await this.checkDependencies(pluginSlug)
    if (!depsCheck.met) {
      throw new Error(`Missing dependencies: ${depsCheck.missing.join(', ')}`)
    }

    try {
      await this.callLifecycleHook(pluginSlug, 'onActivate', {
        pluginSlug,
        timestamp: new Date().toISOString()
      })

      // Update plugin state
      await this.storePluginState(pluginSlug, {
        activated_at: new Date().toISOString(),
        status: 'active'
      })

      console.log(`Plugin ${pluginSlug} activated successfully`)
    } catch (error) {
      console.error(`Activation failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onDeactivate lifecycle hook
   * Called when plugin is deactivated
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<void>}
   */
  async onDeactivate(pluginSlug) {
    console.log(`Running onDeactivate for plugin: ${pluginSlug}`)

    // Check if any plugins depend on this one
    const dependents = await this.getDependentPlugins(pluginSlug)

    const { knex, table } = this.context
    const optionRow = await knex(table('options')).where({ name: 'active_plugins' }).first()
    const activePlugins = optionRow ? JSON.parse(optionRow.value) : []

    const activeDependents = dependents.filter((dep) => activePlugins.includes(dep))

    if (activeDependents.length > 0) {
      throw new Error(`Cannot deactivate. The following plugins depend on it: ${activeDependents.join(', ')}`)
    }

    try {
      await this.callLifecycleHook(pluginSlug, 'onDeactivate', {
        pluginSlug,
        timestamp: new Date().toISOString()
      })

      // Update plugin state
      await this.storePluginState(pluginSlug, {
        deactivated_at: new Date().toISOString(),
        status: 'inactive'
      })

      console.log(`Plugin ${pluginSlug} deactivated successfully`)
    } catch (error) {
      console.error(`Deactivation failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onUninstall lifecycle hook
   * Called before plugin is deleted
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<void>}
   */
  async onUninstall(pluginSlug) {
    console.log(`Running onUninstall for plugin: ${pluginSlug}`)

    // Check if plugin is active
    const { knex, table } = this.context
    const optionRow = await knex(table('options')).where({ name: 'active_plugins' }).first()
    const activePlugins = optionRow ? JSON.parse(optionRow.value) : []

    if (activePlugins.includes(pluginSlug)) {
      throw new Error('Cannot uninstall an active plugin. Please deactivate it first.')
    }

    try {
      // Call plugin's onUninstall hook first
      await this.callLifecycleHook(pluginSlug, 'onUninstall', {
        pluginSlug,
        timestamp: new Date().toISOString()
      })

      // Rollback all plugin migrations
      const hasMigrations = await this.migrationService.hasPluginMigrations(pluginSlug)
      if (hasMigrations) {
        console.log(`Rolling back migrations for plugin: ${pluginSlug}`)
        await this.migrationService.resetPluginMigrations(pluginSlug)
        console.log('All migrations rolled back')
      }

      // Remove plugin state
      await this.removePluginState(pluginSlug)

      console.log(`Plugin ${pluginSlug} uninstalled successfully`)
    } catch (error) {
      console.error(`Uninstallation failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onUpgrade lifecycle hook
   * Called when plugin is upgraded to a new version
   * @param {string} pluginSlug - The plugin slug
   * @param {string} oldVersion - The old version
   * @param {string} newVersion - The new version
   * @returns {Promise<void>}
   */
  async onUpgrade(pluginSlug, oldVersion, newVersion) {
    console.log(`Running onUpgrade for plugin: ${pluginSlug} (${oldVersion} -> ${newVersion})`)

    try {
      // Create backup before upgrade
      const backupPath = await this.createBackup(pluginSlug)

      try {
        // Run any new migrations
        const hasMigrations = await this.migrationService.hasPluginMigrations(pluginSlug)
        if (hasMigrations) {
          const pendingMigrations = await this.migrationService.getPendingMigrations(pluginSlug)
          if (pendingMigrations.length > 0) {
            console.log(`Running ${pendingMigrations.length} new migrations for plugin: ${pluginSlug}`)
            const result = await this.migrationService.runPluginMigrations(pluginSlug)
            console.log(`Ran ${result.count} migrations`)
          }
        }

        // Call plugin's onUpgrade hook
        await this.callLifecycleHook(pluginSlug, 'onUpgrade', {
          pluginSlug,
          oldVersion,
          newVersion,
          timestamp: new Date().toISOString()
        })

        // Update plugin state
        await this.storePluginState(pluginSlug, {
          upgraded_at: new Date().toISOString(),
          version: newVersion,
          previous_version: oldVersion,
          backup_path: backupPath
        })

        // Cleanup old backups
        await this.cleanupBackups(pluginSlug)

        console.log(`Plugin ${pluginSlug} upgraded successfully`)
      } catch (error) {
        // Restore from backup on failure
        console.error('Upgrade failed, restoring from backup...')
        await this.restoreBackup(pluginSlug, backupPath)
        throw error
      }
    } catch (error) {
      console.error(`Upgrade failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onDowngrade lifecycle hook
   * Called when plugin is downgraded to a previous version
   * @param {string} pluginSlug - The plugin slug
   * @param {string} oldVersion - The old version
   * @param {string} newVersion - The new version
   * @returns {Promise<void>}
   */
  async onDowngrade(pluginSlug, oldVersion, newVersion) {
    console.log(`Running onDowngrade for plugin: ${pluginSlug} (${oldVersion} -> ${newVersion})`)

    try {
      await this.callLifecycleHook(pluginSlug, 'onDowngrade', {
        pluginSlug,
        oldVersion,
        newVersion,
        timestamp: new Date().toISOString()
      })

      // Update plugin state
      await this.storePluginState(pluginSlug, {
        downgraded_at: new Date().toISOString(),
        version: newVersion,
        previous_version: oldVersion
      })

      console.log(`Plugin ${pluginSlug} downgraded successfully`)
    } catch (error) {
      console.error(`Downgrade failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Store plugin state in database
   * @param {string} pluginSlug - The plugin slug
   * @param {Object} state - The state data to store
   * @returns {Promise<void>}
   */
  async storePluginState(pluginSlug, state) {
    const { knex, table } = this.context
    const optionName = `plugin_state_${pluginSlug}`

    // Get existing state
    const existing = await knex(table('options')).where({ name: optionName }).first()

    const currentState = existing ? JSON.parse(existing.value) : {}
    const newState = { ...currentState, ...state }

    if (existing) {
      await knex(table('options'))
        .where({ name: optionName })
        .update({ value: JSON.stringify(newState) })
    } else {
      await knex(table('options')).insert({
        name: optionName,
        value: JSON.stringify(newState),
        autoload: false
      })
    }
  }

  /**
   * Get plugin state from database
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<Object>} The plugin state
   */
  async getPluginState(pluginSlug) {
    const { knex, table } = this.context
    const optionName = `plugin_state_${pluginSlug}`

    const existing = await knex(table('options')).where({ name: optionName }).first()

    return existing ? JSON.parse(existing.value) : {}
  }

  /**
   * Remove plugin state from database
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<void>}
   */
  async removePluginState(pluginSlug) {
    const { knex, table } = this.context
    const optionName = `plugin_state_${pluginSlug}`

    await knex(table('options')).where({ name: optionName }).del()
  }

  /**
   * Create a backup of plugin before upgrade/downgrade
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<string>} Path to backup
   */
  async createBackup(pluginSlug) {
    const pluginPath = path.join(this.PLUGINS_BASE, pluginSlug)
    const backupPath = path.join(this.PLUGINS_BASE, '.backups', `${pluginSlug}_${Date.now()}`)

    await fs.promises.mkdir(path.dirname(backupPath), { recursive: true })
    await fs.promises.cp(pluginPath, backupPath, { recursive: true })

    console.log(`Created backup for plugin ${pluginSlug} at ${backupPath}`)
    return backupPath
  }

  /**
   * Restore plugin from backup
   * @param {string} pluginSlug - The plugin slug
   * @param {string} backupPath - Path to backup
   * @returns {Promise<void>}
   */
  async restoreBackup(pluginSlug, backupPath) {
    const pluginPath = path.join(this.PLUGINS_BASE, pluginSlug)

    // Remove current version
    if (fs.existsSync(pluginPath)) {
      await fs.promises.rm(pluginPath, { recursive: true, force: true })
    }

    // Restore backup
    await fs.promises.cp(backupPath, pluginPath, { recursive: true })

    console.log(`Restored plugin ${pluginSlug} from backup`)
  }

  /**
   * Clean up old backups (keep last 5)
   * @param {string} pluginSlug - The plugin slug
   * @returns {Promise<void>}
   */
  async cleanupBackups(pluginSlug) {
    const backupsDir = path.join(this.PLUGINS_BASE, '.backups')

    if (!fs.existsSync(backupsDir)) return

    const files = await fs.promises.readdir(backupsDir, { withFileTypes: true })
    const pluginBackups = files
      .filter((f) => f.isDirectory() && f.name.startsWith(`${pluginSlug}_`))
      .map((f) => ({
        name: f.name,
        path: path.join(backupsDir, f.name),
        timestamp: parseInt(f.name.split('_').pop())
      }))
      .sort((a, b) => b.timestamp - a.timestamp)

    // Keep only last 5 backups
    const toDelete = pluginBackups.slice(5)

    for (const backup of toDelete) {
      await fs.promises.rm(backup.path, { recursive: true, force: true })
      console.log(`Deleted old backup: ${backup.name}`)
    }
  }
}

export default PluginLifecycleService
