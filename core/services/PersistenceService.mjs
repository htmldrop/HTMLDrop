/**
 * Persistence Service
 *
 * Handles preservation of files and directories during theme/plugin upgrades and downgrades.
 * Uses fast rename operations instead of copying files.
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
   * Uses rename for directories (instant) and copy only for individual files
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

    // Backup persistent directories using rename (instant, no file iteration)
    for (const dir of config.persistent_directories) {
      const sourcePath = path.join(directory, dir)
      const destPath = path.join(backupDir, dir)

      if (fs.existsSync(sourcePath)) {
        try {
          // Create parent directory if needed
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true })

          // Rename directory (instant operation, moves entire tree)
          await fs.promises.rename(sourcePath, destPath)
          backedUp.directories.push(dir)
          console.log(`[PersistenceService] Backed up directory: ${dir}`)
        } catch (error) {
          // If rename fails (cross-device), fall back to copy
          if (error.code === 'EXDEV') {
            console.log(`[PersistenceService] Cross-device move, falling back to copy for: ${dir}`)
            await this._copyDirectory(sourcePath, destPath)
            await fs.promises.rm(sourcePath, { recursive: true, force: true })
            backedUp.directories.push(dir)
          } else {
            console.error(`[PersistenceService] Failed to backup directory ${dir}:`, error.message)
          }
        }
      }
    }

    // Backup persistent files (copy, as they're typically few and small)
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

    console.log(`[PersistenceService] Backup complete: ${backedUp.files.length} files, ${backedUp.directories.length} directories`)
    return backedUp
  }

  /**
   * Restore persistent files and directories after upgrade/downgrade
   * Uses rename for directories (instant) and copy only for individual files
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

    // Get top-level items in backup directory
    const entries = await fs.promises.readdir(backupDir, { withFileTypes: true })

    for (const entry of entries) {
      const sourcePath = path.join(backupDir, entry.name)
      const destPath = path.join(directory, entry.name)

      try {
        if (entry.isDirectory()) {
          // Remove destination if it exists (new version may have created it)
          if (fs.existsSync(destPath)) {
            await fs.promises.rm(destPath, { recursive: true, force: true })
          }

          // Create parent directory if needed
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true })

          // Rename directory back (instant operation)
          await fs.promises.rename(sourcePath, destPath)
          restored.directories.push(entry.name)
          console.log(`[PersistenceService] Restored directory: ${entry.name}`)
        } else {
          // Create parent directory if needed
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true })

          // Copy file back
          await fs.promises.copyFile(sourcePath, destPath)
          restored.files.push(entry.name)
          console.log(`[PersistenceService] Restored file: ${entry.name}`)
        }
      } catch (error) {
        // If rename fails (cross-device), fall back to copy
        if (error.code === 'EXDEV' && entry.isDirectory()) {
          console.log(`[PersistenceService] Cross-device move, falling back to copy for: ${entry.name}`)
          await this._copyDirectory(sourcePath, destPath)
          restored.directories.push(entry.name)
        } else {
          console.error(`[PersistenceService] Failed to restore ${entry.name}:`, error.message)
        }
      }
    }

    console.log(`[PersistenceService] Restore complete: ${restored.files.length} files, ${restored.directories.length} directories`)
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
   * Recursively copy directory (fallback for cross-device moves)
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
}

export default PersistenceService
