/**
 * Persistence Service
 *
 * Handles preservation of files and directories during theme/plugin upgrades and downgrades
 */

import fs from 'fs'
import path from 'path'

class PersistenceService {
  /**
   * Load persistence configuration from config.mjs
   * @param {string} directory - Theme or plugin directory path
   * @returns {Promise<Object>} Configuration object with persistent_directories and persistent_files
   */
  async loadConfig(directory) {
    const configPath = path.join(directory, 'config.mjs')

    if (!fs.existsSync(configPath)) {
      return { persistent_directories: [], persistent_files: [] }
    }

    try {
      // Dynamic import with cache-busting
      const configModule = await import(`${configPath}?t=${Date.now()}`)
      const config = configModule.default || {}

      return {
        persistent_directories: Array.isArray(config.persistent_directories) ? config.persistent_directories : [],
        persistent_files: Array.isArray(config.persistent_files) ? config.persistent_files : []
      }
    } catch (error) {
      console.warn(`[PersistenceService] Failed to load config from ${configPath}:`, error.message)
      return { persistent_directories: [], persistent_files: [] }
    }
  }

  /**
   * Backup persistent files and directories before upgrade/downgrade
   * @param {string} directory - Theme or plugin directory path
   * @param {string} backupDir - Temporary backup directory
   * @returns {Promise<Object>} Backup info
   */
  async backup(directory, backupDir) {
    console.log(`[PersistenceService] Creating backup from ${directory} to ${backupDir}`)

    const config = await this.loadConfig(directory)
    const backedUp = {
      files: [],
      directories: []
    }

    // Create backup directory
    await fs.promises.mkdir(backupDir, { recursive: true })

    // Backup persistent files
    for (const file of config.persistent_files) {
      const sourcePath = path.join(directory, file)
      const destPath = path.join(backupDir, file)

      if (fs.existsSync(sourcePath)) {
        try {
          // Create parent directory if needed
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true })

          // Copy file
          await fs.promises.copyFile(sourcePath, destPath)
          backedUp.files.push(file)
          console.log(`[PersistenceService] Backed up file: ${file}`)
        } catch (error) {
          console.error(`[PersistenceService] Failed to backup file ${file}:`, error.message)
        }
      }
    }

    // Backup persistent directories
    for (const dir of config.persistent_directories) {
      const sourcePath = path.join(directory, dir)
      const destPath = path.join(backupDir, dir)

      if (fs.existsSync(sourcePath) && (await fs.promises.stat(sourcePath)).isDirectory()) {
        try {
          // Recursively copy directory
          await this._copyDirectory(sourcePath, destPath)
          backedUp.directories.push(dir)
          console.log(`[PersistenceService] Backed up directory: ${dir}`)
        } catch (error) {
          console.error(`[PersistenceService] Failed to backup directory ${dir}:`, error.message)
        }
      }
    }

    console.log(`[PersistenceService] Backup complete: ${backedUp.files.length} files, ${backedUp.directories.length} directories`)
    return backedUp
  }

  /**
   * Restore persistent files and directories after upgrade/downgrade
   * @param {string} backupDir - Temporary backup directory
   * @param {string} directory - Theme or plugin directory path
   * @returns {Promise<Object>} Restore info
   */
  async restore(backupDir, directory) {
    console.log(`[PersistenceService] Restoring backup from ${backupDir} to ${directory}`)

    if (!fs.existsSync(backupDir)) {
      console.log('[PersistenceService] No backup directory found, skipping restore')
      return { files: [], directories: [] }
    }

    const restored = {
      files: [],
      directories: []
    }

    // Get all backed up items
    const items = await this._getAllItems(backupDir, backupDir)

    for (const item of items) {
      const sourcePath = path.join(backupDir, item)
      const destPath = path.join(directory, item)

      try {
        const stats = await fs.promises.stat(sourcePath)

        if (stats.isFile()) {
          // Create parent directory if needed
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true })

          // Copy file
          await fs.promises.copyFile(sourcePath, destPath)
          restored.files.push(item)
          console.log(`[PersistenceService] Restored file: ${item}`)
        } else if (stats.isDirectory()) {
          // Directory structure is already handled by recursive walk
          restored.directories.push(item)
        }
      } catch (error) {
        console.error(`[PersistenceService] Failed to restore ${item}:`, error.message)
      }
    }

    console.log(`[PersistenceService] Restore complete: ${restored.files.length} files restored`)
    return restored
  }

  /**
   * Clean up backup directory
   * @param {string} backupDir - Temporary backup directory
   */
  async cleanup(backupDir) {
    if (fs.existsSync(backupDir)) {
      try {
        await fs.promises.rm(backupDir, { recursive: true, force: true })
        console.log(`[PersistenceService] Cleaned up backup directory: ${backupDir}`)
      } catch (error) {
        console.error(`[PersistenceService] Failed to clean up backup:`, error.message)
      }
    }
  }

  /**
   * Recursively copy directory
   * @private
   */
  async _copyDirectory(source, dest) {
    await fs.promises.mkdir(dest, { recursive: true })

    const entries = await fs.promises.readdir(source, { withFileTypes: true })

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        await this._copyDirectory(sourcePath, destPath)
      } else {
        await fs.promises.copyFile(sourcePath, destPath)
      }
    }
  }

  /**
   * Get all items in a directory recursively
   * @private
   */
  async _getAllItems(directory, basePath) {
    const items = []

    const entries = await fs.promises.readdir(directory, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      const relativePath = path.relative(basePath, fullPath)

      items.push(relativePath)

      if (entry.isDirectory()) {
        const subItems = await this._getAllItems(fullPath, basePath)
        items.push(...subItems)
      }
    }

    return items
  }
}

export default PersistenceService
