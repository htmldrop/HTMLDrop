/**
 * Theme Lifecycle Service
 *
 * Manages theme lifecycle events: install, activate, deactivate, uninstall, upgrade, downgrade
 */

import fs from 'fs'
import path from 'path'

class ThemeLifecycleService {
  constructor(context) {
    this.context = context
    this.THEMES_BASE = path.resolve('./hd-content/themes')
  }

  /**
   * Load a theme's lifecycle hooks from its index.mjs
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<Object|null>} The theme module with lifecycle hooks
   */
  async loadThemeModule(themeSlug) {
    try {
      const themePath = path.join(this.THEMES_BASE, themeSlug, 'index.mjs')

      if (!fs.existsSync(themePath)) {
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
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<Object>} Theme metadata
   */
  async getThemeMetadata(themeSlug) {
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
   * @returns {Promise<string|null>} Active theme slug
   */
  async getActiveTheme() {
    const { knex, table } = this.context
    const optionRow = await knex(table('options')).where({ name: 'theme' }).first()

    return optionRow ? optionRow.value : null
  }

  /**
   * Set the active theme
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<void>}
   */
  async setActiveTheme(themeSlug) {
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
    process.send({ type: 'options_updated' })
  }

  /**
   * Call a lifecycle hook on a theme
   * @param {string} themeSlug - The theme slug
   * @param {string} hookName - The lifecycle hook name (onInstall, onActivate, etc.)
   * @param {Object} args - Additional arguments to pass to the hook
   * @returns {Promise<any>} Result from the hook
   */
  async callLifecycleHook(themeSlug, hookName, args = {}) {
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
      })

      // Check if the lifecycle hook exists
      if (themeInstance && typeof themeInstance[hookName] === 'function') {
        console.log(`Calling ${hookName} for theme: ${themeSlug}`)
        const result = await themeInstance[hookName](args)
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
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<void>}
   */
  async onInstall(themeSlug) {
    console.log(`Running onInstall for theme: ${themeSlug}`)

    try {
      await this.callLifecycleHook(themeSlug, 'onInstall', {
        themeSlug,
        timestamp: new Date().toISOString()
      })

      // Store installation timestamp
      await this.storeThemeState(themeSlug, {
        installed_at: new Date().toISOString(),
        status: 'installed'
      })

      console.log(`Theme ${themeSlug} installed successfully`)
    } catch (error) {
      console.error(`Installation failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onActivate lifecycle hook
   * Called when theme is activated
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<void>}
   */
  async onActivate(themeSlug) {
    console.log(`Running onActivate for theme: ${themeSlug}`)

    try {
      // Get the currently active theme
      const currentTheme = await this.getActiveTheme()

      // Deactivate current theme if exists
      if (currentTheme && currentTheme !== themeSlug) {
        await this.onDeactivate(currentTheme)
      }

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

      console.log(`Theme ${themeSlug} activated successfully`)
    } catch (error) {
      console.error(`Activation failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onDeactivate lifecycle hook
   * Called when theme is deactivated
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<void>}
   */
  async onDeactivate(themeSlug) {
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

      console.log(`Theme ${themeSlug} deactivated successfully`)
    } catch (error) {
      console.error(`Deactivation failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onUninstall lifecycle hook
   * Called before theme is deleted
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<void>}
   */
  async onUninstall(themeSlug) {
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
   * @param {string} themeSlug - The theme slug
   * @param {string} oldVersion - The old version
   * @param {string} newVersion - The new version
   * @returns {Promise<void>}
   */
  async onUpgrade(themeSlug, oldVersion, newVersion) {
    console.log(`Running onUpgrade for theme: ${themeSlug} (${oldVersion} -> ${newVersion})`)

    try {
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

      console.log(`Theme ${themeSlug} upgraded successfully`)
    } catch (error) {
      console.error(`Upgrade failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Execute onDowngrade lifecycle hook
   * Called when theme is downgraded to a previous version
   * @param {string} themeSlug - The theme slug
   * @param {string} oldVersion - The old version
   * @param {string} newVersion - The new version
   * @returns {Promise<void>}
   */
  async onDowngrade(themeSlug, oldVersion, newVersion) {
    console.log(`Running onDowngrade for theme: ${themeSlug} (${oldVersion} -> ${newVersion})`)

    try {
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

      console.log(`Theme ${themeSlug} downgraded successfully`)
    } catch (error) {
      console.error(`Downgrade failed for theme ${themeSlug}:`, error)
      throw error
    }
  }

  /**
   * Store theme state in database
   * @param {string} themeSlug - The theme slug
   * @param {Object} state - The state data to store
   * @returns {Promise<void>}
   */
  async storeThemeState(themeSlug, state) {
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
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<Object>} The theme state
   */
  async getThemeState(themeSlug) {
    const { knex, table } = this.context
    const optionName = `theme_state_${themeSlug}`

    const existing = await knex(table('options')).where({ name: optionName }).first()

    return existing ? JSON.parse(existing.value) : {}
  }

  /**
   * Remove theme state from database
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<void>}
   */
  async removeThemeState(themeSlug) {
    const { knex, table } = this.context
    const optionName = `theme_state_${themeSlug}`

    await knex(table('options')).where({ name: optionName }).del()
  }

  /**
   * Create a backup of theme before upgrade/downgrade
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<string>} Path to backup
   */
  async createBackup(themeSlug) {
    const themePath = path.join(this.THEMES_BASE, themeSlug)
    const backupPath = path.join(this.THEMES_BASE, '.backups', `${themeSlug}_${Date.now()}`)

    await fs.promises.mkdir(path.dirname(backupPath), { recursive: true })
    await fs.promises.cp(themePath, backupPath, { recursive: true })

    console.log(`Created backup for theme ${themeSlug} at ${backupPath}`)
    return backupPath
  }

  /**
   * Restore theme from backup
   * @param {string} themeSlug - The theme slug
   * @param {string} backupPath - Path to backup
   * @returns {Promise<void>}
   */
  async restoreBackup(themeSlug, backupPath) {
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
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<void>}
   */
  async cleanupBackups(themeSlug) {
    const backupsDir = path.join(this.THEMES_BASE, '.backups')

    if (!fs.existsSync(backupsDir)) return

    const files = await fs.promises.readdir(backupsDir, { withFileTypes: true })
    const themeBackups = files
      .filter((f) => f.isDirectory() && f.name.startsWith(`${themeSlug}_`))
      .map((f) => ({
        name: f.name,
        path: path.join(backupsDir, f.name),
        timestamp: parseInt(f.name.split('_').pop())
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
   * @param {string} themeSlug - The theme slug
   * @returns {Promise<Object>} Validation result
   */
  async validateTheme(themeSlug) {
    const themePath = path.join(this.THEMES_BASE, themeSlug)
    const errors = []
    const warnings = []

    // Check if theme directory exists
    if (!fs.existsSync(themePath)) {
      errors.push('Theme directory does not exist')
      return { valid: false, errors, warnings }
    }

    // Check for index.mjs
    const indexPath = path.join(themePath, 'index.mjs')
    if (!fs.existsSync(indexPath)) {
      errors.push('Missing index.mjs file')
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
}

export default ThemeLifecycleService
