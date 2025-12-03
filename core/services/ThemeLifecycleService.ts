/**
 * Theme Lifecycle Service
 *
 * Manages theme lifecycle events: install, activate, deactivate, uninstall, upgrade, downgrade
 */

import fs from 'fs'
import path from 'path'
import BadgeCountService from './BadgeCountService.mjs'
import { invalidateCache, requestWatcherTeardown } from './FolderHashCache.mjs'

// NPM logo SVG
const NPM_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 250"><path fill="#CB3837" d="M240,250h100v-50h100V0H240V250z M340,50h50v100h-50V50z M480,0v200h100V50h50v150h50V50h50v150h50V0H480z M0,200h100V50h50v150h50V0H0V200z"/></svg>'

interface ThemeMetadata {
  name: string
  version: string
  description: string
  author: string
  htmldrop: Record<string, unknown>
  dependencies: string[]
}

interface ThemeState {
  installed_at?: string
  activated_at?: string
  deactivated_at?: string
  upgraded_at?: string
  downgraded_at?: string
  status?: string
  version?: string
  previous_version?: string
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

class ThemeLifecycleService {
  private context: HTMLDrop.Context
  private THEMES_BASE: string

  constructor(context: HTMLDrop.Context) {
    this.context = context
    this.THEMES_BASE = path.resolve('./content/themes')
  }

  /**
   * Load a theme's lifecycle hooks from its index.mjs
   */
  async loadThemeModule(themeSlug: string): Promise<((...args: unknown[]) => unknown) | null> {
    try {
      const possibleFiles = ['index.mjs', 'index.js', 'index.ts']
      const themePath = possibleFiles
        .map(file => path.join(this.THEMES_BASE, themeSlug, file))
        .find(fullPath => fs.existsSync(fullPath))

      if (!themePath) {
        return null
      }

      // Dynamic import with cache-busting
      const timestamp = Date.now()
      const module = await import(`${themePath}?t=${timestamp}`)

      return module.default
    } catch (error) {
      console.error(`Failed to load theme module ${themeSlug}:`, error)
      return null
    }
  }

  /**
   * Get theme metadata from package.json
   */
  async getThemeMetadata(themeSlug: string): Promise<ThemeMetadata> {
    const packageJsonPath = path.join(this.THEMES_BASE, themeSlug, 'package.json')

    try {
      if (fs.existsSync(packageJsonPath)) {
        const content = await fs.promises.readFile(packageJsonPath, 'utf8')
        const packageJson = JSON.parse(content)

        return {
          name: packageJson.name || themeSlug,
          version: packageJson.version || '1.0.0',
          description: packageJson.description || '',
          author: packageJson.author || '',
          htmldrop: packageJson.htmldrop || {},
          dependencies: packageJson.htmldrop?.dependencies || []
        }
      }
    } catch (error) {
      console.error(`Failed to read theme metadata for ${themeSlug}:`, error)
    }

    return {
      name: themeSlug,
      version: '1.0.0',
      description: '',
      author: '',
      htmldrop: {},
      dependencies: []
    }
  }

  /**
   * Get the currently active theme
   */
  async getActiveTheme(): Promise<string | null> {
    const { knex, table } = this.context
    const optionRow = await knex(table('options')).where({ name: 'theme' }).first()

    return optionRow ? optionRow.value : null
  }

  /**
   * Set the active theme
   */
  async setActiveTheme(themeSlug: string): Promise<void> {
    const { knex, table } = this.context

    const existing = await knex(table('options')).where({ name: 'theme' }).first()

    if (existing) {
      await knex(table('options')).where({ name: 'theme' }).update({ value: themeSlug })
    } else {
      await knex(table('options')).insert({
        name: 'theme',
        value: themeSlug,
        autoload: true
      })
    }

    // Notify workers of theme change
    process.send?.({ type: 'options_updated' })
  }

  /**
   * Run npm install for a theme with job tracking
   */
  async runNpmInstall(themeSlug: string, action: string = 'install'): Promise<void> {
    const themePath = path.join(this.THEMES_BASE, themeSlug)
    const packageJsonPath = path.join(themePath, 'package.json')

    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`No package.json found for theme ${themeSlug}, skipping npm install`)
      return
    }

    // Check if there are dependencies to install
    try {
      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
      const hasDeps = packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0
      const hasDevDeps = packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0

      if (!hasDeps && !hasDevDeps) {
        console.log(`No dependencies found for theme ${themeSlug}, skipping npm install`)
        return
      }
    } catch (error) {
      console.error(`Failed to read package.json for ${themeSlug}:`, error)
      return
    }

    // Create a job for tracking
    const jobs = (this.context as HTMLDrop.Context & { registries?: { jobs?: { createJob: (config: HTMLDrop.JobConfig) => Promise<HTMLDrop.Job> } } }).registries?.jobs
    if (!jobs) {
      console.warn('Jobs registry not available, running npm install without tracking')
      await this._runNpmInstallDirect(themePath)
      return
    }

    const job = await jobs.createJob({
      name: `Installing dependencies for ${themeSlug}`,
      description: `Running npm install for theme ${themeSlug} (${action})`,
      type: 'npm_install',
      iconSvg: NPM_LOGO_SVG,
      metadata: {
        themeSlug,
        action,
        type: 'theme'
      },
      source: themeSlug,
      showNotification: true
    })

    try {
      await job.start()
      await job.updateProgress(10, { status: 'Starting installation...' })

      // Run npm install with job progress tracking
      await this._runNpmInstallDirect(themePath, job)

      await job.updateProgress(100, { status: 'Installation complete!' })
      await job.complete({
        success: true,
        message: `Dependencies installed successfully for ${themeSlug}`
      })

      // Invalidate folder hash cache to trigger theme reload
      invalidateCache(themePath)
      console.log(`Invalidated cache for ${themePath} after npm install`)
    } catch (error) {
      await job.fail(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Run npm install directly (without job tracking)
   */
  async _runNpmInstallDirect(themePath: string, job: HTMLDrop.Job | null = null): Promise<void> {
    console.log(`Running npm install in ${themePath}`)

    try {
      const { spawn } = await import('child_process')

      await new Promise((resolve, reject) => {
        const npmProcess = spawn('npm', ['install', '--production'], {
          cwd: themePath,
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
            console.log(`npm install completed for ${themePath}`)
            resolve(undefined)
          }
        })

        npmProcess.on('error', (error) => {
          console.error('npm install process error:', error)
          reject(new Error(`Failed to start npm install: ${error.message}`))
        })
      })

      // Invalidate folder hash cache after successful npm install
      invalidateCache(themePath)
      console.log(`Invalidated cache for ${themePath} after npm install`)
    } catch (error) {
      console.error(`npm install failed for ${themePath}:`, error)
      throw new Error(`Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Load theme config.mjs and extract watch_ignore patterns
   */
  async getWatchIgnorePatterns(themeSlug: string): Promise<Array<string | RegExp>> {
    try {
      const configPath = path.join(this.THEMES_BASE, themeSlug, 'config.mjs')

      if (!fs.existsSync(configPath)) {
        return []
      }

      // Dynamic import with cache-busting
      const timestamp = Date.now()
      const config = await import(`${configPath}?t=${timestamp}`)
      const watchIgnore = config.default?.watch_ignore || []

      // Convert string patterns to regex patterns for chokidar
      return watchIgnore.map((pattern: string) => {
        // If pattern starts with /, treat as path from theme root
        if (pattern.startsWith('/')) {
          const themePath = path.join(this.THEMES_BASE, themeSlug)
          return new RegExp(path.join(themePath, pattern.slice(1)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        }
        // Otherwise treat as glob pattern
        return pattern
      })
    } catch (error) {
      console.warn(`Could not load watch_ignore config for theme ${themeSlug}:`, error instanceof Error ? error.message : String(error))
      return []
    }
  }

  /**
   * Call a lifecycle hook on a theme
   */
  async callLifecycleHook(themeSlug: string, hookName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    try {
      const themeModule = await this.loadThemeModule(themeSlug)

      if (!themeModule) {
        console.warn(`Theme module not found: ${themeSlug}`)
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

      // Call the theme module to get the theme instance
      const themeInstance = await themeModule({
        req: mockReq,
        res: mockRes,
        next: mockNext,
        router: mockRouter
      }) as Record<string, unknown>

      // Check if the lifecycle hook exists
      if (themeInstance && typeof themeInstance[hookName] === 'function') {
        console.log(`Calling ${hookName} for theme: ${themeSlug}`)
        const hookFn = themeInstance[hookName] as (args: Record<string, unknown>) => Promise<unknown>
        const result = await hookFn(args)
        return result
      } else {
        console.log(`No ${hookName} hook found for theme: ${themeSlug}`)
        return null
      }
    } catch (error) {
      console.error(`Error calling ${hookName} for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onInstall lifecycle hook
   * Called after theme ZIP is extracted or NPM package is installed
   */
  async onInstall(themeSlug: string): Promise<void> {
    console.log(`Running onInstall for theme: ${themeSlug}`)

    try {
      // Run npm install first to ensure dependencies are available
      await this.runNpmInstall(themeSlug, 'install')

      await this.callLifecycleHook(themeSlug, 'onInstall', {
        themeSlug,
        timestamp: new Date().toISOString()
      })

      // Store installation timestamp
      await this.storeThemeState(themeSlug, {
        installed_at: new Date().toISOString(),
        status: 'installed'
      })

      // Note: Watcher setup is handled by RegisterThemes for active theme only

      console.log(`Theme ${themeSlug} installed successfully`)
    } catch (error) {
      console.error(`Installation failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onActivate lifecycle hook
   * Called when theme is activated
   */
  async onActivate(themeSlug: string): Promise<void> {
    console.log(`Running onActivate for theme: ${themeSlug}`)

    try {
      // Get the currently active theme
      const currentTheme = await this.getActiveTheme()

      // Deactivate current theme if exists
      if (currentTheme && currentTheme !== themeSlug) {
        await this.onDeactivate(currentTheme)
      }

      // Run npm install to ensure dependencies are available
      await this.runNpmInstall(themeSlug, 'activate')

      // Activate new theme
      await this.callLifecycleHook(themeSlug, 'onActivate', {
        themeSlug,
        previousTheme: currentTheme,
        timestamp: new Date().toISOString()
      })

      // Set as active theme
      await this.setActiveTheme(themeSlug)

      // Update theme state
      await this.storeThemeState(themeSlug, {
        activated_at: new Date().toISOString(),
        status: 'active'
      })

      // Note: Watcher setup is handled by RegisterThemes for active theme only

      // Refresh badge counts (theme updates may have changed)
      await this.refreshBadgeCounts()

      console.log(`Theme ${themeSlug} activated successfully`)
    } catch (error) {
      console.error(`Activation failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onDeactivate lifecycle hook
   * Called when theme is deactivated
   */
  async onDeactivate(themeSlug: string): Promise<void> {
    console.log(`Running onDeactivate for theme: ${themeSlug}`)

    try {
      await this.callLifecycleHook(themeSlug, 'onDeactivate', {
        themeSlug,
        timestamp: new Date().toISOString()
      })

      // Update theme state
      await this.storeThemeState(themeSlug, {
        deactivated_at: new Date().toISOString(),
        status: 'inactive'
      })

      // Request watcher teardown for this theme
      const themePath = path.join(this.THEMES_BASE, themeSlug)
      requestWatcherTeardown(themePath)

      // Refresh badge counts (theme updates may have changed)
      await this.refreshBadgeCounts()

      console.log(`Theme ${themeSlug} deactivated successfully`)
    } catch (error) {
      console.error(`Deactivation failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onUninstall lifecycle hook
   * Called before theme is deleted
   */
  async onUninstall(themeSlug: string): Promise<void> {
    console.log(`Running onUninstall for theme: ${themeSlug}`)

    // Check if theme is active
    const activeTheme = await this.getActiveTheme()

    if (activeTheme === themeSlug) {
      throw new Error('Cannot uninstall the active theme. Please activate a different theme first.')
    }

    try {
      await this.callLifecycleHook(themeSlug, 'onUninstall', {
        themeSlug,
        timestamp: new Date().toISOString()
      })

      // Remove theme state
      await this.removeThemeState(themeSlug)

      console.log(`Theme ${themeSlug} uninstalled successfully`)
    } catch (error) {
      console.error(`Uninstallation failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onUpgrade lifecycle hook
   * Called when theme is upgraded to a new version
   */
  async onUpgrade(themeSlug: string, oldVersion: string, newVersion: string): Promise<void> {
    console.log(`Running onUpgrade for theme: ${themeSlug} (${oldVersion} -> ${newVersion})`)

    try {
      // Run npm install to update dependencies
      await this.runNpmInstall(themeSlug, 'upgrade')

      await this.callLifecycleHook(themeSlug, 'onUpgrade', {
        themeSlug,
        oldVersion,
        newVersion,
        timestamp: new Date().toISOString()
      })

      // Update theme state
      await this.storeThemeState(themeSlug, {
        upgraded_at: new Date().toISOString(),
        version: newVersion,
        previous_version: oldVersion
      })

      // Refresh badge counts (upgrade completed, may reduce update count)
      await this.refreshBadgeCounts()

      console.log(`Theme ${themeSlug} upgraded successfully`)
    } catch (error) {
      console.error(`Upgrade failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onDowngrade lifecycle hook
   * Called when theme is downgraded to a previous version
   */
  async onDowngrade(themeSlug: string, oldVersion: string, newVersion: string): Promise<void> {
    console.log(`Running onDowngrade for theme: ${themeSlug} (${oldVersion} -> ${newVersion})`)

    try {
      // Run npm install to restore previous dependencies
      await this.runNpmInstall(themeSlug, 'downgrade')

      await this.callLifecycleHook(themeSlug, 'onDowngrade', {
        themeSlug,
        oldVersion,
        newVersion,
        timestamp: new Date().toISOString()
      })

      // Update theme state
      await this.storeThemeState(themeSlug, {
        downgraded_at: new Date().toISOString(),
        version: newVersion,
        previous_version: oldVersion
      })

      // Refresh badge counts (downgrade completed, may affect update count)
      await this.refreshBadgeCounts()

      console.log(`Theme ${themeSlug} downgraded successfully`)
    } catch (error) {
      console.error(`Downgrade failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Store theme state in database
   */
  async storeThemeState(themeSlug: string, state: Partial<ThemeState>): Promise<void> {
    const { knex, table } = this.context
    const optionName = `theme_state_${themeSlug}`

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
   * Get theme state from database
   */
  async getThemeState(themeSlug: string): Promise<ThemeState> {
    const { knex, table } = this.context
    const optionName = `theme_state_${themeSlug}`

    const existing = await knex(table('options')).where({ name: optionName }).first()

    return existing ? JSON.parse(existing.value) : {}
  }

  /**
   * Remove theme state from database
   */
  async removeThemeState(themeSlug: string): Promise<void> {
    const { knex, table } = this.context
    const optionName = `theme_state_${themeSlug}`

    await knex(table('options')).where({ name: optionName }).del()
  }

  /**
   * Create a backup of theme before upgrade/downgrade
   */
  async createBackup(themeSlug: string): Promise<string> {
    const themePath = path.join(this.THEMES_BASE, themeSlug)
    const backupPath = path.join(this.THEMES_BASE, '.backups', `${themeSlug}_${Date.now()}`)

    await fs.promises.mkdir(path.dirname(backupPath), { recursive: true })
    await fs.promises.cp(themePath, backupPath, { recursive: true })

    console.log(`Created backup for theme ${themeSlug} at ${backupPath}`)
    return backupPath
  }

  /**
   * Restore theme from backup
   */
  async restoreBackup(themeSlug: string, backupPath: string): Promise<void> {
    const themePath = path.join(this.THEMES_BASE, themeSlug)

    // Remove current version
    if (fs.existsSync(themePath)) {
      await fs.promises.rm(themePath, { recursive: true, force: true })
    }

    // Restore backup
    await fs.promises.cp(backupPath, themePath, { recursive: true })

    console.log(`Restored theme ${themeSlug} from backup`)
  }

  /**
   * Clean up old backups (keep last 5)
   */
  async cleanupBackups(themeSlug: string): Promise<void> {
    const backupsDir = path.join(this.THEMES_BASE, '.backups')

    if (!fs.existsSync(backupsDir)) return

    const files = await fs.promises.readdir(backupsDir, { withFileTypes: true })
    const themeBackups = files
      .filter((f) => f.isDirectory() && f.name.startsWith(`${themeSlug}_`))
      .map((f) => ({
        name: f.name,
        path: path.join(backupsDir, f.name),
        timestamp: parseInt(f.name.split('_').pop() || '0')
      }))
      .sort((a, b) => b.timestamp - a.timestamp)

    // Keep only last 5 backups
    const toDelete = themeBackups.slice(5)

    for (const backup of toDelete) {
      await fs.promises.rm(backup.path, { recursive: true, force: true })
      console.log(`Deleted old backup: ${backup.name}`)
    }
  }

  /**
   * Validate theme structure
   */
  async validateTheme(themeSlug: string): Promise<ValidationResult> {
    const themePath = path.join(this.THEMES_BASE, themeSlug)
    const errors: string[] = []
    const warnings: string[] = []

    // Check if theme directory exists
    if (!fs.existsSync(themePath)) {
      errors.push('Theme directory does not exist')
      return { valid: false, errors, warnings }
    }

    // Check for index.mjs
    const possibleFiles = ['index.mjs', 'index.js', 'index.ts']
    const indexPath = possibleFiles
      .map(file => path.join(themePath, file))
      .find(fullPath => fs.existsSync(fullPath))
    if (!indexPath) {
      errors.push('Missing index file')
    }

    // Check for package.json
    const packageJsonPath = path.join(themePath, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      warnings.push('Missing package.json file')
    } else {
      try {
        const content = await fs.promises.readFile(packageJsonPath, 'utf8')
        const packageJson = JSON.parse(content)

        if (!packageJson.name) {
          warnings.push('package.json missing name field')
        }
        if (!packageJson.version) {
          warnings.push('package.json missing version field')
        }
      } catch (error) {
        errors.push('Invalid package.json format')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Refresh badge counts after theme lifecycle changes
   * This triggers a background update of the badge counts cache
   */
  async refreshBadgeCounts(): Promise<void> {
    try {
      const badgeCountService = new BadgeCountService(this.context)
      // Force update to bypass cache TTL check
      await badgeCountService.updateBadgeCounts(true)
      console.log('Badge counts refreshed after theme lifecycle event')
    } catch (error) {
      // Don't fail the lifecycle event if badge count refresh fails
      console.error('Failed to refresh badge counts:', error)
    }
  }
}

export default ThemeLifecycleService
