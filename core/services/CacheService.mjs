/**
 * Cache Service
 *
 * Provides caching layer with Redis or in-memory fallback
 * Improves performance by caching frequently accessed data
 */

import { CACHE_TTL } from '../utils/constants.mjs'

class CacheService {
  constructor() {
    this.enabled = process.env.CACHE_ENABLED === 'true'
    this.redis = null
    this.inMemoryCache = new Map()
    this.inMemoryCacheTTL = new Map()
  }

  /**
   * Initialize cache service (connects to Redis if configured)
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.enabled) {
      console.log('Cache disabled')
      return
    }

    try {
      // Try to use Redis if available
      if (process.env.REDIS_URL) {
        const redis = await import('redis')
        this.redis = redis.createClient({
          url: process.env.REDIS_URL
        })

        this.redis.on('error', (err) => {
          console.error('Redis Client Error:', err)
          this.redis = null
        })

        await this.redis.connect()
        console.log('Redis cache connected')
      } else {
        console.log('Using in-memory cache (Redis not configured)')
      }
    } catch (error) {
      console.warn('Failed to initialize Redis, using in-memory cache:', error.message)
      this.redis = null
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<*>} Cached value or null
   */
  async get(key) {
    if (!this.enabled) return null

    try {
      if (this.redis) {
        const value = await this.redis.get(key)
        return value ? JSON.parse(value) : null
      }

      // Fallback to in-memory cache
      const ttl = this.inMemoryCacheTTL.get(key)
      if (ttl && ttl < Date.now()) {
        this.inMemoryCache.delete(key)
        this.inMemoryCacheTTL.delete(key)
        return null
      }

      return this.inMemoryCache.get(key) || null
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {Promise<void>}
   */
  async set(key, value, ttl = CACHE_TTL.DEFAULT) {
    if (!this.enabled) return

    try {
      if (this.redis) {
        await this.redis.setEx(key, ttl, JSON.stringify(value))
      } else {
        // Fallback to in-memory cache
        this.inMemoryCache.set(key, value)
        this.inMemoryCacheTTL.set(key, Date.now() + ttl * 1000)
      }
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async del(key) {
    if (!this.enabled) return

    try {
      if (this.redis) {
        await this.redis.del(key)
      } else {
        this.inMemoryCache.delete(key)
        this.inMemoryCacheTTL.delete(key)
      }
    } catch (error) {
      console.error('Cache delete error:', error)
    }
  }

  /**
   * Delete multiple keys by pattern
   * @param {string} pattern - Key pattern (e.g., 'posts:*')
   * @returns {Promise<void>}
   */
  async delPattern(pattern) {
    if (!this.enabled) return

    try {
      if (this.redis) {
        const keys = await this.redis.keys(pattern)
        if (keys.length > 0) {
          await this.redis.del(keys)
        }
      } else {
        // Simple pattern matching for in-memory cache
        const regex = new RegExp(pattern.replace('*', '.*'))
        for (const key of this.inMemoryCache.keys()) {
          if (regex.test(key)) {
            this.inMemoryCache.delete(key)
            this.inMemoryCacheTTL.delete(key)
          }
        }
      }
    } catch (error) {
      console.error('Cache delete pattern error:', error)
    }
  }

  /**
   * Clear all cache
   * @returns {Promise<void>}
   */
  async flush() {
    if (!this.enabled) return

    try {
      if (this.redis) {
        await this.redis.flushAll()
      } else {
        this.inMemoryCache.clear()
        this.inMemoryCacheTTL.clear()
      }
    } catch (error) {
      console.error('Cache flush error:', error)
    }
  }

  /**
   * Get or set cached value (retrieve from cache or compute and cache)
   * @param {string} key - Cache key
   * @param {Function} fn - Function to compute value if not cached
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<*>} Cached or computed value
   */
  async remember(key, fn, ttl = CACHE_TTL.DEFAULT) {
    if (!this.enabled) {
      return fn()
    }

    const cached = await this.get(key)
    if (cached !== null) {
      return cached
    }

    const value = await fn()
    await this.set(key, value, ttl)

    return value
  }

  /**
   * Increment a counter in cache
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment
   * @returns {Promise<number>} New value
   */
  async increment(key, amount = 1) {
    if (!this.enabled) return 0

    try {
      if (this.redis) {
        return await this.redis.incrBy(key, amount)
      }

      const current = this.inMemoryCache.get(key) || 0
      const newValue = current + amount
      this.inMemoryCache.set(key, newValue)
      return newValue
    } catch (error) {
      console.error('Cache increment error:', error)
      return 0
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if exists
   */
  async exists(key) {
    if (!this.enabled) return false

    try {
      if (this.redis) {
        return (await this.redis.exists(key)) === 1
      }

      return this.inMemoryCache.has(key)
    } catch (error) {
      console.error('Cache exists error:', error)
      return false
    }
  }

  /**
   * Close Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.redis) {
      await this.redis.quit()
    }
  }

  /**
   * Clean up expired in-memory cache entries
   * @returns {void}
   */
  cleanupExpired() {
    if (this.redis) return

    const now = Date.now()
    for (const [key, ttl] of this.inMemoryCacheTTL.entries()) {
      if (ttl < now) {
        this.inMemoryCache.delete(key)
        this.inMemoryCacheTTL.delete(key)
      }
    }
  }
}

// Singleton instance
const cacheService = new CacheService()

export default cacheService
