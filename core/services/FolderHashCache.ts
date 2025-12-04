/**
 * FolderHashCache - Efficient folder hash caching with file watching
 *
 * Instead of polling with TTL, this service watches directories for changes
 * and only recomputes hashes when files actually change.
 *
 * File watchers only run on the primary worker to save resources.
 * Workers receive invalidation notifications via IPC.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import cluster from 'cluster'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'

interface CacheEntry {
  hash: string | null
  watcher: FSWatcher | null
  ignorePatterns: (string | RegExp)[]
}

interface CacheStats {
  entries: number
  folders: Array<{
    path: string
    hasHash: boolean
    hasWatcher: boolean
  }>
}

// Global cache shared across all instances
const cache = new Map<string, CacheEntry>()

// Track if we're the primary process (runs watchers) or a worker (receives IPC)
const isPrimary = cluster.isPrimary || (cluster as any).isMaster

// Set up IPC listener for workers to receive cache invalidation from primary
if (!isPrimary && process.send) {
  process.on('message', (msg: { type?: string; folderPath?: string }) => {
    if (msg?.type === 'folder_hash_invalidate' && msg.folderPath) {
      const cached = cache.get(msg.folderPath)
      if (cached) {
        cached.hash = null // Mark as invalid
      }
    }
  })
}

// Set up IPC listener for primary to receive watcher setup/teardown requests
if (isPrimary) {
  import('cluster').then((clusterModule) => {
    clusterModule.default.on('message', async (worker, msg: { type?: string; folderPath?: string; ignorePatterns?: (string | RegExp)[] }) => {
      if (msg?.type === 'setup_watcher' && msg.folderPath) {
        console.log(`[FolderHashCache] Primary received setup_watcher request for: ${msg.folderPath}`)

        // Set up watcher directly (don't go through getFolderHash)
        let cached = cache.get(msg.folderPath)

        // Create cache entry if it doesn't exist
        if (!cached) {
          cache.set(msg.folderPath, { hash: null, watcher: null, ignorePatterns: msg.ignorePatterns || [] })
          cached = cache.get(msg.folderPath)!
        }

        // Set up watcher if we don't have one yet
        if (!cached.watcher) {
          const watcher = setupWatcher(msg.folderPath, msg.ignorePatterns || [])
          cached.watcher = watcher
          cached.ignorePatterns = msg.ignorePatterns || []
        }
      } else if (msg?.type === 'close_watcher' && msg.folderPath) {
        console.log(`[FolderHashCache] Primary received close_watcher request for: ${msg.folderPath}`)
        closeWatcher(msg.folderPath)
      }
    })
  })
}

/**
 * Compute folder hash by collecting mtimes of all files (ignores node_modules contents)
 */
async function computeFolderHash(folderPath: string): Promise<string> {
  const mtimes: string[] = []

  // Check if node_modules exists (include in hash without scanning contents)
  const nodeModulesPath = path.join(folderPath, 'node_modules')
  const hasNodeModules = fs.existsSync(nodeModulesPath)
  mtimes.push(`node_modules:${hasNodeModules}`)

  async function traverse(dir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      // Skip node_modules and hidden folders
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue

      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await traverse(fullPath)
      } else {
        const stats = await fs.promises.stat(fullPath)
        mtimes.push(`${fullPath}:${stats.mtimeMs}`)
      }
    }
  }

  await traverse(folderPath)

  // Sort for consistent hash regardless of read order
  mtimes.sort()

  return crypto.createHash('md5').update(mtimes.join('|')).digest('hex')
}

/**
 * Broadcast cache invalidation to all workers
 */
function broadcastInvalidation(folderPath: string): void {
  if (isPrimary && cluster.workers) {
    for (const id in cluster.workers) {
      const worker = cluster.workers[id]
      if (worker && worker.isConnected()) {
        worker.send({ type: 'folder_hash_invalidate', folderPath })
      }
    }
  }
}

/**
 * Set up a file watcher for a folder (only on primary process)
 * When any file changes, invalidate the cache entry and notify workers
 */
function setupWatcher(folderPath: string, customIgnorePatterns: (string | RegExp)[] = []): FSWatcher | null {
  // Only set up watchers on primary process to save resources
  if (!isPrimary) {
    return null
  }

  // Don't set up watchers for hidden folders (starting with .)
  const folderName = path.basename(folderPath)
  if (folderName.startsWith('.')) {
    return null
  }

  try {
    // Build ignore patterns array
    const ignorePatterns: (string | RegExp)[] = [
      /(^|[/\\])(\.|node_modules)/, // Default: hidden files and node_modules
      ...customIgnorePatterns
    ]

    const watcher = chokidar.watch(folderPath, {
      ignored: ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      depth: 99 // Watch all subdirectories
    })

    const invalidate = (changedPath: string): void => {
      console.log(`[FolderHashCache] File changed: ${changedPath}`)
      const cached = cache.get(folderPath)
      if (cached) {
        cached.hash = null
      }
      broadcastInvalidation(folderPath)
    }

    watcher.on('add', invalidate)
    watcher.on('change', invalidate)
    watcher.on('unlink', invalidate)
    watcher.on('addDir', invalidate)
    watcher.on('unlinkDir', invalidate)
    watcher.on('ready', () => {
      console.log(`[FolderHashCache] Watcher ready for: ${folderPath}`)
    })

    watcher.on('error', (err: unknown) => {
      console.warn(`[FolderHashCache] Watcher error for ${folderPath}:`, err instanceof Error ? err.message : String(err))
      const cached = cache.get(folderPath)
      if (cached?.watcher) {
        cached.watcher.close()
        cached.watcher = null
      }
    })

    return watcher
  } catch (err: any) {
    console.warn(`[FolderHashCache] Could not set up watcher for ${folderPath}:`, err.message)
    return null
  }
}

/**
 * Get the hash for a folder, using cache with file watching
 */
export async function getFolderHash(folderPath: string, ignorePatterns: (string | RegExp)[] = []): Promise<{ hash: string; cached: boolean }> {
  let cached = cache.get(folderPath)

  // First time seeing this folder - compute hash but DON'T set up watcher
  // Watchers should be explicitly set up via requestWatcherSetup()
  if (!cached) {
    const hash = await computeFolderHash(folderPath)
    cache.set(folderPath, { hash, watcher: null, ignorePatterns })
    return { hash, cached: false }
  }

  // Cache exists but was invalidated by watcher
  if (cached.hash === null) {
    const hash = await computeFolderHash(folderPath)
    cached.hash = hash
    return { hash, cached: false }
  }

  // Cache hit
  return { hash: cached.hash, cached: true }
}

/**
 * Invalidate cache for a specific folder
 * Useful when you know a folder has changed (e.g., after theme/plugin install)
 */
export function invalidateCache(folderPath: string): void {
  const cached = cache.get(folderPath)
  if (cached) {
    cached.hash = null
  }
}

/**
 * Request watcher setup from primary process (call from worker)
 */
export function requestWatcherSetup(folderPath: string, ignorePatterns: (string | RegExp)[] = []): void {
  // Don't set up watchers for hidden folders (starting with .)
  const folderName = path.basename(folderPath)
  if (folderName.startsWith('.')) {
    return
  }

  if (!isPrimary && process.send) {
    console.log(`[FolderHashCache] Worker requesting watcher setup for: ${folderPath}`)
    process.send({ type: 'setup_watcher', folderPath, ignorePatterns })
  } else if (isPrimary) {
    // If called from primary, set up watcher directly
    let cached = cache.get(folderPath)

    // Create cache entry if it doesn't exist
    if (!cached) {
      cache.set(folderPath, { hash: null, watcher: null, ignorePatterns })
      cached = cache.get(folderPath)!
    }

    // Set up watcher if we don't have one yet
    if (!cached.watcher) {
      const watcher = setupWatcher(folderPath, ignorePatterns)
      cached.watcher = watcher
      cached.ignorePatterns = ignorePatterns
    }
  }
}

/**
 * Request watcher teardown from primary process (call from worker)
 */
export function requestWatcherTeardown(folderPath: string): void {
  if (!isPrimary && process.send) {
    console.log(`[FolderHashCache] Worker requesting watcher teardown for: ${folderPath}`)
    process.send({ type: 'close_watcher', folderPath })
  } else if (isPrimary) {
    // If called from primary, close directly
    closeWatcher(folderPath)
  }
}

/**
 * Close watcher for a specific folder
 */
function closeWatcher(folderPath: string): void {
  const cached = cache.get(folderPath)
  if (cached?.watcher) {
    console.log(`[FolderHashCache] Closing watcher for: ${folderPath}`)
    cached.watcher.close()
    cached.watcher = null
  }
}

/**
 * Clear all cache entries and close watchers
 * Call this on shutdown
 */
export function clearAllCache(): void {
  for (const [folderPath, cached] of cache.entries()) {
    if (cached.watcher) {
      cached.watcher.close()
    }
  }
  cache.clear()
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): CacheStats {
  const stats: CacheStats = {
    entries: cache.size,
    folders: []
  }

  for (const [folderPath, cached] of cache.entries()) {
    stats.folders.push({
      path: folderPath,
      hasHash: cached.hash !== null,
      hasWatcher: cached.watcher !== null
    })
  }

  return stats
}

export default {
  getFolderHash,
  invalidateCache,
  requestWatcherSetup,
  requestWatcherTeardown,
  clearAllCache,
  getCacheStats
}
