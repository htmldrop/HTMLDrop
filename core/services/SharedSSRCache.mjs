import cluster from 'cluster'

/**
 * SharedSSRCache - Cross-worker SSR HTML cache using IPC
 *
 * In clustered Node.js, each worker has its own memory space.
 * This service uses IPC to synchronize cache entries across workers
 * via the primary process.
 *
 * Architecture:
 * - Primary process holds the authoritative cache (Map)
 * - Workers send cache operations (get/set) via IPC
 * - Primary broadcasts cache updates to all workers
 * - Workers maintain a local copy for fast reads
 */

// Primary process cache (only used in primary)
const primaryCache = new Map()
const PRIMARY_MAX_ENTRIES = 100
const PRIMARY_MAX_AGE_MS = 30000 // 30 seconds max age

// Worker local cache (copy of primary cache for fast reads)
const localCache = new Map()

/**
 * Initialize the shared cache system
 * Must be called once in both primary and worker processes
 */
export function initSharedSSRCache() {
  if (cluster.isPrimary) {
    // Primary process: handle cache messages from workers
    cluster.on('message', (worker, message) => {
      if (message?.type === 'ssr_cache_get') {
        const { key, requestId } = message
        const entry = primaryCache.get(key)

        // Check if entry is still valid
        if (entry && (Date.now() - entry.timestamp) < PRIMARY_MAX_AGE_MS) {
          worker.send({
            type: 'ssr_cache_response',
            requestId,
            key,
            html: entry.html,
            timestamp: entry.timestamp,
            hit: true
          })
        } else {
          // Entry doesn't exist or expired
          if (entry) primaryCache.delete(key)
          worker.send({
            type: 'ssr_cache_response',
            requestId,
            key,
            hit: false
          })
        }
      } else if (message?.type === 'ssr_cache_set') {
        const { key, html, timestamp } = message

        // Store in primary cache
        primaryCache.set(key, { html, timestamp })

        // Enforce max entries (LRU-style: delete oldest)
        if (primaryCache.size > PRIMARY_MAX_ENTRIES) {
          const oldestKey = primaryCache.keys().next().value
          primaryCache.delete(oldestKey)
        }

        // Broadcast to all workers so they update their local cache
        for (const id in cluster.workers) {
          cluster.workers[id].send({
            type: 'ssr_cache_update',
            key,
            html,
            timestamp
          })
        }
      } else if (message?.type === 'ssr_cache_invalidate') {
        const { key } = message

        if (key) {
          primaryCache.delete(key)
        } else {
          // Clear all cache
          primaryCache.clear()
        }

        // Broadcast invalidation to all workers
        for (const id in cluster.workers) {
          cluster.workers[id].send({
            type: 'ssr_cache_invalidated',
            key
          })
        }
      }
    })

    // Periodic cleanup of expired entries
    setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of primaryCache.entries()) {
        if (now - entry.timestamp > PRIMARY_MAX_AGE_MS) {
          primaryCache.delete(key)
        }
      }
    }, 10000) // Every 10 seconds

  } else {
    // Worker process: handle cache updates from primary
    process.on('message', (message) => {
      if (message?.type === 'ssr_cache_update') {
        const { key, html, timestamp } = message
        localCache.set(key, { html, timestamp })

        // Also enforce local cache size
        if (localCache.size > PRIMARY_MAX_ENTRIES) {
          const oldestKey = localCache.keys().next().value
          localCache.delete(oldestKey)
        }
      } else if (message?.type === 'ssr_cache_invalidated') {
        const { key } = message
        if (key) {
          localCache.delete(key)
        } else {
          localCache.clear()
        }
      }
    })
  }
}

// Request ID counter for correlating async IPC responses
let requestIdCounter = 0
const pendingRequests = new Map()

/**
 * Get cached HTML for a URL (async - may need to query primary)
 * @param {string} key - Cache key (usually URL path)
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @returns {Promise<{html: string, timestamp: number} | null>}
 */
export async function getCachedSSR(key, maxAgeMs = 5000) {
  // First check local cache for fast path
  const local = localCache.get(key)
  if (local && (Date.now() - local.timestamp) < maxAgeMs) {
    return { html: local.html, timestamp: local.timestamp, source: 'local' }
  }

  // If not in local cache or expired, query primary
  if (!cluster.isWorker) {
    // In primary process (shouldn't happen in normal use)
    const entry = primaryCache.get(key)
    if (entry && (Date.now() - entry.timestamp) < maxAgeMs) {
      return { html: entry.html, timestamp: entry.timestamp, source: 'primary' }
    }
    return null
  }

  // Worker: send request to primary and wait for response
  return new Promise((resolve) => {
    const requestId = ++requestIdCounter

    // Set up response handler
    const handler = (message) => {
      if (message?.type === 'ssr_cache_response' && message.requestId === requestId) {
        process.removeListener('message', handler)
        pendingRequests.delete(requestId)

        if (message.hit && (Date.now() - message.timestamp) < maxAgeMs) {
          // Update local cache
          localCache.set(key, { html: message.html, timestamp: message.timestamp })
          resolve({ html: message.html, timestamp: message.timestamp, source: 'shared' })
        } else {
          resolve(null)
        }
      }
    }

    // Store pending request with timeout
    pendingRequests.set(requestId, { resolve, handler })
    process.on('message', handler)

    // Send request to primary
    process.send({ type: 'ssr_cache_get', key, requestId })

    // Timeout after 100ms (cache lookup shouldn't take long)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        process.removeListener('message', handler)
        pendingRequests.delete(requestId)
        resolve(null) // Treat timeout as cache miss
      }
    }, 100)
  })
}

/**
 * Store HTML in the shared cache
 * @param {string} key - Cache key (usually URL path)
 * @param {string} html - Rendered HTML to cache
 */
export function setCachedSSR(key, html) {
  const timestamp = Date.now()

  // Update local cache immediately
  localCache.set(key, { html, timestamp })

  // Send to primary for distribution to other workers
  if (cluster.isWorker) {
    process.send({ type: 'ssr_cache_set', key, html, timestamp })
  } else {
    // In primary process
    primaryCache.set(key, { html, timestamp })
  }
}

/**
 * Invalidate cache entry or all entries
 * @param {string} [key] - Specific key to invalidate, or undefined to clear all
 */
export function invalidateSSRCache(key) {
  if (key) {
    localCache.delete(key)
  } else {
    localCache.clear()
  }

  if (cluster.isWorker) {
    process.send({ type: 'ssr_cache_invalidate', key })
  } else {
    if (key) {
      primaryCache.delete(key)
    } else {
      primaryCache.clear()
    }
  }
}

/**
 * Get cache statistics
 * @returns {{ localSize: number, localKeys: string[] }}
 */
export function getSSRCacheStats() {
  return {
    localSize: localCache.size,
    localKeys: Array.from(localCache.keys())
  }
}

export default {
  init: initSharedSSRCache,
  get: getCachedSSR,
  set: setCachedSSR,
  invalidate: invalidateSSRCache,
  stats: getSSRCacheStats
}
