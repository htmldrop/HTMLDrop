/**
 * Plugin Lifecycle Service
 *
 * Manages plugin lifecycle events: install, activate, deactivate, uninstall, upgrade, downgrade
 */

import fs from 'fs'
import path from 'path'
import PluginMigrationService from './PluginMigrationService.ts'
import BadgeCountService from './BadgeCountService.ts'
import { invalidateCache, requestWatcherTeardown } from './FolderHashCache.ts'

// NPM logo SVG
const NPM_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 250"><path fill="#CB3837" d="M240,250h100v-50h100V0H240V250z M340,50h50v100h-50V50z M480,0v200h100V50h50v150h50V50h50v150h50V0H480z M0,200h100V50h50v150h50V0H0V200z"/></svg>'

interface PluginMetadata {
  name: string
  version: string
  description: string
  author: string
  htmldrop: Record<string, unknown>
  dependencies: string[]
}

interface DependencyCheck {
  met: boolean
  missing: string[]
}

interface PluginState {
  installed_at?: string
  activated_at?: string
  deactivated_at?: string
  upgraded_at?: string
  downgraded_at?: string
  status?: string
  version?: string
  previous_version?: string
  backup_path?: string
}

class PluginLifecycleService {
  private context: HTMLDrop.Context
  private PLUGINS_BASE: string
  private migrationService: InstanceType<typeof PluginMigrationService>

  constructor(context: HTMLDrop.Context) {
    if (!context.knex) {
      throw new Error('PluginLifecycleService requires a database connection')
    }
    this.context = context
    this.PLUGINS_BASE = path.resolve('./content/plugins')
    this.migrationService = new PluginMigrationService({ knex: context.knex, table: context.table })
  }

  /**
   * Load a plugin's lifecycle hooks from its index.mjs
   */
  async loadPluginModule(pluginSlug: string): Promise<((...args: unknown[]) => unknown) | null> {
    try {
      const possibleFiles = ['index.mjs', 'index.js', 'index.ts']
      const pluginPath = possibleFiles
        .map(file => path.join(this.PLUGINS_BASE, pluginSlug, file))
        .find(fullPath => fs.existsSync(fullPath))

      if (!pluginPath) {
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
   */
  async getPluginMetadata(pluginSlug: string): Promise<PluginMetadata> {
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
   */
  async checkDependencies(pluginSlug: string): Promise<DependencyCheck> {
    const metadata = await this.getPluginMetadata(pluginSlug)
    const dependencies = metadata.dependencies || []

    if (dependencies.length === 0) {
      return { met: true, missing: [] }
    }

    const { knex, table } = this.context
    if (!knex) throw new Error('Database not available')
    const optionRow = await knex(table('options')).where({ name: 'active_plugins' }).first()

    const activePlugins: string[] = optionRow ? JSON.parse(optionRow.value) : []
    const missing = dependencies.filter((dep: string) => !activePlugins.includes(dep))

    return {
      met: missing.length === 0,
      missing
    }
  }

  /**
   * Get plugins that depend on this plugin
   */
  async getDependentPlugins(pluginSlug: string): Promise<string[]> {
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
   * Run npm install for a plugin with job tracking
   */
  async runNpmInstall(pluginSlug: string, action: string = 'install'): Promise<void> {
    const pluginPath = path.join(this.PLUGINS_BASE, pluginSlug)
    const packageJsonPath = path.join(pluginPath, 'package.json')

    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`No package.json found for plugin ${pluginSlug}, skipping npm install`)
      return
    }

    // Check if there are dependencies to install
    try {
      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
      const hasDeps = packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0
      const hasDevDeps = packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0

      if (!hasDeps && !hasDevDeps) {
        console.log(`No dependencies found for plugin ${pluginSlug}, skipping npm install`)
        return
      }
    } catch (error) {
      console.error(`Failed to read package.json for ${pluginSlug}:`, error)
      return
    }

    // Create a job for tracking
    const jobs = (this.context as HTMLDrop.Context & { registries?: { jobs?: { createJob: (config: HTMLDrop.JobConfig) => Promise<HTMLDrop.Job> } } }).registries?.jobs
    if (!jobs) {
      console.warn('Jobs registry not available, running npm install without tracking')
      await this._runNpmInstallDirect(pluginPath)
      return
    }

    const job = await jobs.createJob({
      name: `Installing dependencies for ${pluginSlug}`,
      description: `Running npm install for plugin ${pluginSlug} (${action})`,
      type: 'npm_install',
      iconSvg: NPM_LOGO_SVG,
      metadata: {
        pluginSlug,
        action,
        type: 'plugin'
      },
      source: pluginSlug,
      showNotification: true
    })

    try {
      await job.start()
      await job.updateProgress(10, { status: 'Starting installation...' })

      // Run npm install with job progress tracking
      await this._runNpmInstallDirect(pluginPath, job)

      await job.updateProgress(100, { status: 'Installation complete!' })
      await job.complete({
        success: true,
        message: `Dependencies installed successfully for ${pluginSlug}`
      })

      // Invalidate folder hash cache to trigger plugin reload
      invalidateCache(pluginPath)
      console.log(`Invalidated cache for ${pluginPath} after npm install`)
    } catch (error) {
      await job.fail(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Run npm install directly (without job tracking)
   */
  async _runNpmInstallDirect(pluginPath: string, job: HTMLDrop.Job | null = null): Promise<void> {
    console.log(`Running npm install in ${pluginPath}`)

    try {
      const { spawn } = await import('child_process')

      await new Promise((resolve, reject) => {
        const npmProcess = spawn('npm', ['install', '--production'], {
          cwd: pluginPath,
          env: { ...process.env },
          shell: true
        })

        let stdout = ''
        let stderr = ''
        let currentStep = 'Initializing...'
        let progress = 10

        npmProcess.stdout.on('data', async (data) => {
          const output = data.toString()
          stdout += output
          console.log(output)

          // Parse npm output for progress
          if (output.includes('npm WARN') || output.includes('npm notice')) {
            // Warnings don't count as progress
            return
          }

          if (output.includes('idealTree') || output.includes('Resolving')) {
            currentStep = 'Resolving dependencies...'
            progress = 25
          } else if (output.includes('reify') || output.includes('Downloading')) {
            currentStep = 'Downloading packages...'
            progress = 40
          } else if (output.includes('extract') || output.includes('Extracting')) {
            currentStep = 'Extracting packages...'
            progress = 60
          } else if (output.includes('build') || output.includes('Building')) {
            currentStep = 'Building dependencies...'
            progress = 75
          } else if (output.includes('added') || output.includes('packages')) {
            currentStep = 'Finalizing installation...'
            progress = 90
          }

          if (job && currentStep) {
            await job.updateProgress(progress, { status: currentStep }).catch(() => {})
          }
        })

        npmProcess.stderr.on('data', (data) => {
          const output = data.toString()
          stderr += output
          // npm outputs progress to stderr, so we still parse it
          if (!output.includes('npm ERR!')) {
            console.error(output)
          }
        })

        npmProcess.on('close', (code) => {
          if (code !== 0) {
            const errorMsg = stderr || stdout || 'npm install failed'
            console.error(`npm install failed with code ${code}: ${errorMsg}`)
            reject(new Error(`Failed to install dependencies: ${errorMsg}`))
          } else {
            console.log(`npm install completed for ${pluginPath}`)
            resolve(undefined)
          }
        })

        npmProcess.on('error', (error) => {
          console.error('npm install process error:', error)
          reject(new Error(`Failed to start npm install: ${error.message}`))
        })
      })

      // Invalidate folder hash cache after successful npm install
      invalidateCache(pluginPath)
      console.log(`Invalidated cache for ${pluginPath} after npm install`)
    } catch (error) {
      console.error(`npm install failed for ${pluginPath}:`, error)
      throw new Error(`Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Load plugin config.mjs and extract watch_ignore patterns
   */
  async getWatchIgnorePatterns(pluginSlug: string): Promise<Array<string | RegExp>> {
    try {
      const configPath = path.join(this.PLUGINS_BASE, pluginSlug, 'config.mjs')

      if (!fs.existsSync(configPath)) {
        return []
      }

      // Dynamic import with cache-busting
      const timestamp = Date.now()
      const config = await import(`${configPath}?t=${timestamp}`)
      const watchIgnore = config.default?.watch_ignore || []

      // Convert string patterns to regex patterns for chokidar
      return watchIgnore.map((pattern: string) => {
        // If pattern starts with /, treat as path from plugin root
        if (pattern.startsWith('/')) {
          const pluginPath = path.join(this.PLUGINS_BASE, pluginSlug)
          return new RegExp(path.join(pluginPath, pattern.slice(1)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        }
        // Otherwise treat as glob pattern
        return pattern
      })
    } catch (error) {
      console.warn(`Could not load watch_ignore config for plugin ${pluginSlug}:`, error instanceof Error ? error.message : String(error))
      return []
    }
  }

  /**
   * Call a lifecycle hook on a plugin
   */
  async callLifecycleHook(pluginSlug: string, hookName: string, args: Record<string, unknown> = {}): Promise<unknown> {
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
      }) as Record<string, unknown>

      // Check if the lifecycle hook exists
      if (pluginInstance && typeof pluginInstance[hookName] === 'function') {
        console.log(`Calling ${hookName} for plugin: ${pluginSlug}`)
        const hookFn = pluginInstance[hookName] as (args: Record<string, unknown>) => Promise<unknown>
        const result = await hookFn(args)
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
   */
  async onInstall(pluginSlug: string): Promise<void> {
    console.log(`Running onInstall for plugin: ${pluginSlug}`)

    try {
      // Run npm install first to ensure dependencies are available
      await this.runNpmInstall(pluginSlug, 'install')

      // Run plugin migrations
      const hasMigrations = await this.migrationService.hasPluginMigrations(pluginSlug)
      if (hasMigrations) {
        console.log(`Running migrations for plugin: ${pluginSlug}`)
        const result = await this.migrationService.runPluginMigrations(pluginSlug)
        console.log(`Ran ${result.migrations.length} migrations`)
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

      // Note: Watcher setup is handled by RegisterPlugins for active plugins only

      console.log(`Plugin ${pluginSlug} installed successfully`)
    } catch (error) {
      console.error(`Installation failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onActivate lifecycle hook
   * Called when plugin is activated
   */
  async onActivate(pluginSlug: string): Promise<void> {
    console.log(`Running onActivate for plugin: ${pluginSlug}`)

    // Check dependencies
    const depsCheck = await this.checkDependencies(pluginSlug)
    if (!depsCheck.met) {
      throw new Error(`Missing dependencies: ${depsCheck.missing.join(', ')}`)
    }

    try {
      // Run npm install to ensure dependencies are available
      await this.runNpmInstall(pluginSlug, 'activate')

      await this.callLifecycleHook(pluginSlug, 'onActivate', {
        pluginSlug,
        timestamp: new Date().toISOString()
      })

      // Update plugin state
      await this.storePluginState(pluginSlug, {
        activated_at: new Date().toISOString(),
        status: 'active'
      })

      // Note: Watcher setup is handled by RegisterPlugins for active plugins only

      // Refresh badge counts (plugin updates may have changed)
      await this.refreshBadgeCounts()

      console.log(`Plugin ${pluginSlug} activated successfully`)
    } catch (error) {
      console.error(`Activation failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onDeactivate lifecycle hook
   * Called when plugin is deactivated
   */
  async onDeactivate(pluginSlug: string): Promise<void> {
    console.log(`Running onDeactivate for plugin: ${pluginSlug}`)

    // Check if any plugins depend on this one
    const dependents = await this.getDependentPlugins(pluginSlug)

    const { knex, table } = this.context
    if (!knex) throw new Error('Database not available')
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

      // Request watcher teardown for this plugin
      const pluginPath = path.join(this.PLUGINS_BASE, pluginSlug)
      requestWatcherTeardown(pluginPath)

      // Refresh badge counts (plugin updates may have changed)
      await this.refreshBadgeCounts()

      console.log(`Plugin ${pluginSlug} deactivated successfully`)
    } catch (error) {
      console.error(`Deactivation failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onUninstall lifecycle hook
   * Called before plugin is deleted
   */
  async onUninstall(pluginSlug: string): Promise<void> {
    console.log(`Running onUninstall for plugin: ${pluginSlug}`)

    // Check if plugin is active
    const { knex, table } = this.context
    if (!knex) throw new Error('Database not available')
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
   */
  async onUpgrade(pluginSlug: string, oldVersion: string, newVersion: string): Promise<void> {
    console.log(`Running onUpgrade for plugin: ${pluginSlug} (${oldVersion} -> ${newVersion})`)

    try {
      // Create backup before upgrade
      const backupPath = await this.createBackup(pluginSlug)

      try {
        // Run npm install to update dependencies
        await this.runNpmInstall(pluginSlug, 'upgrade')

        // Run any new migrations
        const hasMigrations = await this.migrationService.hasPluginMigrations(pluginSlug)
        if (hasMigrations) {
          const pendingMigrations = await this.migrationService.getPendingMigrations(pluginSlug)
          if (pendingMigrations.length > 0) {
            console.log(`Running ${pendingMigrations.length} new migrations for plugin: ${pluginSlug}`)
            const result = await this.migrationService.runPluginMigrations(pluginSlug)
            console.log(`Ran ${result.migrations.length} migrations`)
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

        // Refresh badge counts (upgrade completed, may reduce update count)
        await this.refreshBadgeCounts()

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
   */
  async onDowngrade(pluginSlug: string, oldVersion: string, newVersion: string): Promise<void> {
    console.log(`Running onDowngrade for plugin: ${pluginSlug} (${oldVersion} -> ${newVersion})`)

    try {
      // Run npm install to restore previous dependencies
      await this.runNpmInstall(pluginSlug, 'downgrade')

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

      // Refresh badge counts (downgrade completed, may affect update count)
      await this.refreshBadgeCounts()

      console.log(`Plugin ${pluginSlug} downgraded successfully`)
    } catch (error) {
      console.error(`Downgrade failed for plugin ${pluginSlug}:`, error)
      throw error
    }
  }

  /**
   * Store plugin state in database
   */
  async storePluginState(pluginSlug: string, state: Partial<PluginState>): Promise<void> {
    const { knex, table } = this.context
    if (!knex) throw new Error('Database not available')
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
   */
  async getPluginState(pluginSlug: string): Promise<PluginState> {
    const { knex, table } = this.context
    if (!knex) throw new Error('Database not available')
    const optionName = `plugin_state_${pluginSlug}`

    const existing = await knex(table('options')).where({ name: optionName }).first()

    return existing ? JSON.parse(existing.value) : {}
  }

  /**
   * Remove plugin state from database
   */
  async removePluginState(pluginSlug: string): Promise<void> {
    const { knex, table } = this.context
    if (!knex) throw new Error('Database not available')
    const optionName = `plugin_state_${pluginSlug}`

    await knex(table('options')).where({ name: optionName }).del()
  }

  /**
   * Create a backup of plugin before upgrade/downgrade
   */
  async createBackup(pluginSlug: string): Promise<string> {
    const pluginPath = path.join(this.PLUGINS_BASE, pluginSlug)
    const backupPath = path.join(this.PLUGINS_BASE, '.backups', `${pluginSlug}_${Date.now()}`)

    await fs.promises.mkdir(path.dirname(backupPath), { recursive: true })
    await fs.promises.cp(pluginPath, backupPath, { recursive: true })

    console.log(`Created backup for plugin ${pluginSlug} at ${backupPath}`)
    return backupPath
  }

  /**
   * Restore plugin from backup
   */
  async restoreBackup(pluginSlug: string, backupPath: string): Promise<void> {
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
   */
  async cleanupBackups(pluginSlug: string): Promise<void> {
    const backupsDir = path.join(this.PLUGINS_BASE, '.backups')

    if (!fs.existsSync(backupsDir)) return

    const files = await fs.promises.readdir(backupsDir, { withFileTypes: true })
    const pluginBackups = files
      .filter((f) => f.isDirectory() && f.name.startsWith(`${pluginSlug}_`))
      .map((f) => ({
        name: f.name,
        path: path.join(backupsDir, f.name),
        timestamp: parseInt(f.name.split('_').pop() || '0')
      }))
      .sort((a, b) => b.timestamp - a.timestamp)

    // Keep only last 5 backups
    const toDelete = pluginBackups.slice(5)

    for (const backup of toDelete) {
      await fs.promises.rm(backup.path, { recursive: true, force: true })
      console.log(`Deleted old backup: ${backup.name}`)
    }
  }

  /**
   * Refresh badge counts after plugin lifecycle changes
   * This triggers a background update of the badge counts cache
   */
  async refreshBadgeCounts(): Promise<void> {
    try {
      const badgeCountService = new BadgeCountService(this.context)
      // Force update to bypass cache TTL check
      await badgeCountService.updateBadgeCounts(true)
      console.log('Badge counts refreshed after plugin lifecycle event')
    } catch (error) {
      // Don't fail the lifecycle event if badge count refresh fails
      console.error('Failed to refresh badge counts:', error)
    }
  }
}

export default PluginLifecycleService
