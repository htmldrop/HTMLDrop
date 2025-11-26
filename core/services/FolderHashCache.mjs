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

// Global cache shared across all instances
// { folderPath: { hash, watcher } }
const cache = new Map()

// Track if we're the primary process (runs watchers) or a worker (receives IPC)
const isPrimary = cluster.isPrimary || cluster.isMaster

// Set up IPC listener for workers to receive cache invalidation from primary
if (!isPrimary && process.send) {
  process.on('message', (msg) => {
    if (msg?.type === 'folder_hash_invalidate' && msg.folderPath) {
      const cached = cache.get(msg.folderPath)
      if (cached) {
        cached.hash = null // Mark as invalid
      }
    }
  })
}

/**
 * Compute folder hash by collecting mtimes of all files (ignores node_modules)
 */
async function computeFolderHash(folderPath) {
  const mtimes = []

  async function traverse(dir) {
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
function broadcastInvalidation(folderPath) {
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
function setupWatcher(folderPath) {
  // Only set up watchers on primary process to save resources
  if (!isPrimary) {
    return null
  }

  try {
    const watcher = chokidar.watch(folderPath, {
      ignored: /(^|[\/\\])(\.|node_modules)/,
      persistent: true,
      ignoreInitial: true
    })

    const invalidate = () => {
      const cached = cache.get(folderPath)
      if (cached) {
        cached.hash = null
      }
      broadcastInvalidation(folderPath)
    }

    watcher.on('add', invalidate)
    watcher.on('change', invalidate)
    watcher.on('unlink', invalidate)

    watcher.on('error', (err) => {
      console.warn(`[FolderHashCache] Watcher error for ${folderPath}:`, err.message)
      const cached = cache.get(folderPath)
      if (cached?.watcher) {
        cached.watcher.close()
        cached.watcher = null
      }
    })

    return watcher
  } catch (err) {
    console.warn(`[FolderHashCache] Could not set up watcher for ${folderPath}:`, err.message)
    return null
  }
}

/**
 * Get the hash for a folder, using cache with file watching
 *
 * @param {string} folderPath - Absolute path to the folder
 * @returns {Promise<{hash: string, cached: boolean}>}
 */
export async function getFolderHash(folderPath) {
  let cached = cache.get(folderPath)

  // First time seeing this folder - compute hash and set up watcher
  if (!cached) {
    const hash = await computeFolderHash(folderPath)
    const watcher = setupWatcher(folderPath)

    cache.set(folderPath, { hash, watcher })
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
 *
 * @param {string} folderPath - Absolute path to the folder
 */
export function invalidateCache(folderPath) {
  const cached = cache.get(folderPath)
  if (cached) {
    cached.hash = null
  }
}

/**
 * Clear all cache entries and close watchers
 * Call this on shutdown
 */
export function clearAllCache() {
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
export function getCacheStats() {
  const stats = {
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
  clearAllCache,
  getCacheStats
}
