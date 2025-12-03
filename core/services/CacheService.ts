/**
 * Cache Service
 *
 * Provides caching layer with Redis or in-memory fallback
 * Improves performance by caching frequently accessed data
 */

import { CACHE_TTL } from '../utils/constants.ts'

interface RedisClient {
  get: (key: string) => Promise<string | null>
  setEx: (key: string, ttl: number, value: string) => Promise<unknown>
  del: (key: string | string[]) => Promise<unknown>
  keys: (pattern: string) => Promise<string[]>
  flushAll: () => Promise<unknown>
  incrBy: (key: string, amount: number) => Promise<number>
  exists: (key: string) => Promise<number>
  quit: () => Promise<unknown>
  on: (event: string, callback: (err: Error) => void) => void
  connect: () => Promise<void>
}

class CacheService {
  private enabled: boolean
  private redis: RedisClient | null
  private inMemoryCache: Map<string, unknown>
  private inMemoryCacheTTL: Map<string, number>

  constructor() {
    this.enabled = process.env.CACHE_ENABLED === 'true'
    this.redis = null
    this.inMemoryCache = new Map()
    this.inMemoryCacheTTL = new Map()
  }

  /**
   * Initialize cache service (connects to Redis if configured)
   */
  async initialize(): Promise<void> {
    if (!this.enabled) {
      console.log('Cache disabled')
      return
    }

    try {
      // Try to use Redis if available
      if (process.env.REDIS_URL) {
        // Dynamic import - redis types are optional
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const redis = await import('redis' as any) as any
        this.redis = redis.createClient({
          url: process.env.REDIS_URL
        }) as unknown as RedisClient

        this.redis.on('error', (err: Error) => {
          console.error('Redis Client Error:', err)
          this.redis = null
        })

        await this.redis.connect()
        console.log('Redis cache connected')
      } else {
        console.log('Using in-memory cache (Redis not configured)')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn('Failed to initialize Redis, using in-memory cache:', errorMessage)
      this.redis = null
    }
  }

  /**
   * Get value from cache
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.enabled) return null

    try {
      if (this.redis) {
        const value = await this.redis.get(key)
        return value ? JSON.parse(value) as T : null
      }

      // Fallback to in-memory cache
      const ttl = this.inMemoryCacheTTL.get(key)
      if (ttl && ttl < Date.now()) {
        this.inMemoryCache.delete(key)
        this.inMemoryCacheTTL.delete(key)
        return null
      }

      return (this.inMemoryCache.get(key) as T) || null
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: unknown, ttl: number = CACHE_TTL.DEFAULT): Promise<void> {
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
   */
  async del(key: string): Promise<void> {
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
   */
  async delPattern(pattern: string): Promise<void> {
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
   */
  async flush(): Promise<void> {
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
   */
  async remember<T>(key: string, fn: () => T | Promise<T>, ttl: number = CACHE_TTL.DEFAULT): Promise<T> {
    if (!this.enabled) {
      return fn()
    }

    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const value = await fn()
    await this.set(key, value, ttl)

    return value
  }

  /**
   * Increment a counter in cache
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    if (!this.enabled) return 0

    try {
      if (this.redis) {
        return await this.redis.incrBy(key, amount)
      }

      const current = (this.inMemoryCache.get(key) as number) || 0
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
   */
  async exists(key: string): Promise<boolean> {
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
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit()
    }
  }

  /**
   * Clean up expired in-memory cache entries
   */
  cleanupExpired(): void {
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
