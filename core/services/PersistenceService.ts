import fs from 'fs'
import path from 'path'

const PERSISTENCE_DIR = path.resolve('./content/data')

/**
 * PersistenceService - Simple file-based persistence for system data
 *
 * Used for data that needs to survive app restarts but doesn't need
 * to be in the database (e.g., scheduler task history, system state)
 */

interface PersistenceOptions {
  maxItems?: number
  ttlMs?: number
}

class PersistenceService {
  private basePath: string

  constructor(namespace = 'system') {
    this.basePath = path.join(PERSISTENCE_DIR, namespace)
    this._ensureDir()
  }

  /**
   * Ensure the persistence directory exists
   */
  private _ensureDir(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true })
    }
  }

  /**
   * Get the file path for a key
   */
  private _getPath(key: string): string {
    // Sanitize key to be filesystem-safe
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(this.basePath, `${safeKey}.json`)
  }

  /**
   * Save data to persistence
   */
  save<T>(key: string, data: T, options: PersistenceOptions = {}): boolean {
    try {
      const filePath = this._getPath(key)

      const wrapper = {
        key,
        data,
        savedAt: Date.now(),
        ttlMs: options.ttlMs || null
      }

      fs.writeFileSync(filePath, JSON.stringify(wrapper, null, 2), 'utf8')
      return true
    } catch (error) {
      console.error(`[PersistenceService] Failed to save ${key}:`, error)
      return false
    }
  }

  /**
   * Load data from persistence
   */
  load<T>(key: string, defaultValue: T | null = null): T | null {
    try {
      const filePath = this._getPath(key)

      if (!fs.existsSync(filePath)) {
        return defaultValue
      }

      const content = fs.readFileSync(filePath, 'utf8')
      const wrapper = JSON.parse(content) as { data: T; savedAt: number; ttlMs: number | null }

      // Check TTL if set
      if (wrapper.ttlMs && Date.now() - wrapper.savedAt > wrapper.ttlMs) {
        // Data expired, remove it
        this.remove(key)
        return defaultValue
      }

      return wrapper.data
    } catch (error) {
      console.error(`[PersistenceService] Failed to load ${key}:`, error)
      return defaultValue
    }
  }

  /**
   * Append to an array in persistence
   */
  append<T>(key: string, item: T, options: PersistenceOptions = {}): boolean {
    try {
      const existing = this.load<T[]>(key) || []
      existing.push(item)

      // Apply max items limit
      const maxItems = options.maxItems || 1000
      while (existing.length > maxItems) {
        existing.shift()
      }

      return this.save(key, existing, options)
    } catch (error) {
      console.error(`[PersistenceService] Failed to append to ${key}:`, error)
      return false
    }
  }

  /**
   * Remove data from persistence
   */
  remove(key: string): boolean {
    try {
      const filePath = this._getPath(key)

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }

      return true
    } catch (error) {
      console.error(`[PersistenceService] Failed to remove ${key}:`, error)
      return false
    }
  }

  /**
   * Check if a key exists
   */
  exists(key: string): boolean {
    const filePath = this._getPath(key)
    return fs.existsSync(filePath)
  }

  /**
   * List all keys
   */
  listKeys(): string[] {
    try {
      if (!fs.existsSync(this.basePath)) {
        return []
      }

      return fs
        .readdirSync(this.basePath)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
    } catch (error) {
      console.error('[PersistenceService] Failed to list keys:', error)
      return []
    }
  }

  /**
   * Clear all data in namespace
   */
  clear(): boolean {
    try {
      const keys = this.listKeys()
      for (const key of keys) {
        this.remove(key)
      }
      return true
    } catch (error) {
      console.error('[PersistenceService] Failed to clear:', error)
      return false
    }
  }

  /**
   * Backup files and directories from source to backup directory
   * Returns info about what was backed up
   */
  async backup(source: string, backupDir: string): Promise<{ files: string[]; directories: string[] }> {
    const files: string[] = []
    const directories: string[] = []

    try {
      // Create backup directory
      await fs.promises.mkdir(backupDir, { recursive: true })

      if (!fs.existsSync(source)) {
        return { files, directories }
      }

      // Recursively copy the source to backup
      const copyRecursive = async (src: string, dest: string): Promise<void> => {
        const stat = await fs.promises.stat(src)

        if (stat.isDirectory()) {
          await fs.promises.mkdir(dest, { recursive: true })
          directories.push(path.relative(source, src) || '.')
          const entries = await fs.promises.readdir(src)
          for (const entry of entries) {
            await copyRecursive(path.join(src, entry), path.join(dest, entry))
          }
        } else {
          await fs.promises.copyFile(src, dest)
          files.push(path.relative(source, src))
        }
      }

      await copyRecursive(source, backupDir)
      return { files, directories }
    } catch (error) {
      console.error('[PersistenceService] Failed to backup:', error)
      return { files, directories }
    }
  }

  /**
   * Restore files and directories from backup to destination
   */
  async restore(
    backupDir: string,
    destination: string,
    backupInfo: { files: string[]; directories: string[] }
  ): Promise<{ files: string[]; directories: string[] }> {
    const restoredFiles: string[] = []
    const restoredDirs: string[] = []

    try {
      if (!fs.existsSync(backupDir)) {
        return { files: restoredFiles, directories: restoredDirs }
      }

      // Create destination if it doesn't exist
      await fs.promises.mkdir(destination, { recursive: true })

      // Restore directories first
      for (const dir of backupInfo.directories) {
        if (dir === '.') continue
        const destDir = path.join(destination, dir)
        await fs.promises.mkdir(destDir, { recursive: true })
        restoredDirs.push(dir)
      }

      // Restore files
      for (const file of backupInfo.files) {
        const srcFile = path.join(backupDir, file)
        const destFile = path.join(destination, file)

        if (fs.existsSync(srcFile)) {
          // Ensure parent directory exists
          await fs.promises.mkdir(path.dirname(destFile), { recursive: true })
          await fs.promises.copyFile(srcFile, destFile)
          restoredFiles.push(file)
        }
      }

      return { files: restoredFiles, directories: restoredDirs }
    } catch (error) {
      console.error('[PersistenceService] Failed to restore:', error)
      return { files: restoredFiles, directories: restoredDirs }
    }
  }

  /**
   * Clean up (remove) a directory
   */
  async cleanup(dirPath: string): Promise<boolean> {
    try {
      if (fs.existsSync(dirPath)) {
        await fs.promises.rm(dirPath, { recursive: true, force: true })
      }
      return true
    } catch (error) {
      console.error('[PersistenceService] Failed to cleanup:', error)
      return false
    }
  }
}

export default PersistenceService
export { PersistenceService }
