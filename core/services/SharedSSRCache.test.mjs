import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * SharedSSRCache tests
 *
 * Note: The SharedSSRCache module uses Node.js cluster IPC which is difficult
 * to test directly. These tests mock the cluster module to test the logic
 * in isolation for both primary and worker scenarios.
 */

// Mock cluster module before importing SharedSSRCache
vi.mock('cluster', () => {
  return {
    default: {
      isPrimary: true,
      isWorker: false,
      workers: {},
      on: vi.fn()
    }
  }
})

// Import after mocking
import cluster from 'cluster'

describe('SharedSSRCache', () => {
  let SharedSSRCache
  let mockProcessSend
  let mockProcessOn
  let processMessageHandlers

  beforeEach(async () => {
    // Reset mocks
    vi.resetModules()
    processMessageHandlers = []

    // Mock process.send and process.on
    mockProcessSend = vi.fn()
    mockProcessOn = vi.fn((event, handler) => {
      if (event === 'message') {
        processMessageHandlers.push(handler)
      }
    })

    // Store original process methods
    const originalSend = process.send
    const originalOn = process.on.bind(process)

    process.send = mockProcessSend
    process.on = mockProcessOn

    // Re-import module to get fresh state
    SharedSSRCache = await import('./SharedSSRCache.mjs')

    // Restore after import (we'll use mocks in tests)
    process.send = originalSend
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Primary Process', () => {
    beforeEach(async () => {
      vi.resetModules()

      // Configure as primary
      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {
            1: { send: vi.fn() },
            2: { send: vi.fn() }
          },
          on: vi.fn()
        }
      }))

      SharedSSRCache = await import('./SharedSSRCache.mjs')
    })

    it('should export init function', () => {
      expect(SharedSSRCache.initSharedSSRCache).toBeDefined()
      expect(typeof SharedSSRCache.initSharedSSRCache).toBe('function')
    })

    it('should export get function', () => {
      expect(SharedSSRCache.getCachedSSR).toBeDefined()
      expect(typeof SharedSSRCache.getCachedSSR).toBe('function')
    })

    it('should export set function', () => {
      expect(SharedSSRCache.setCachedSSR).toBeDefined()
      expect(typeof SharedSSRCache.setCachedSSR).toBe('function')
    })

    it('should export invalidate function', () => {
      expect(SharedSSRCache.invalidateSSRCache).toBeDefined()
      expect(typeof SharedSSRCache.invalidateSSRCache).toBe('function')
    })

    it('should export stats function', () => {
      expect(SharedSSRCache.getSSRCacheStats).toBeDefined()
      expect(typeof SharedSSRCache.getSSRCacheStats).toBe('function')
    })

    it('should export default object with all methods', () => {
      const defaultExport = SharedSSRCache.default
      expect(defaultExport.init).toBe(SharedSSRCache.initSharedSSRCache)
      expect(defaultExport.get).toBe(SharedSSRCache.getCachedSSR)
      expect(defaultExport.set).toBe(SharedSSRCache.setCachedSSR)
      expect(defaultExport.invalidate).toBe(SharedSSRCache.invalidateSSRCache)
      expect(defaultExport.stats).toBe(SharedSSRCache.getSSRCacheStats)
    })
  })

  describe('Worker Process', () => {
    let workerModule
    let clusterMock

    beforeEach(async () => {
      vi.resetModules()

      clusterMock = {
        isPrimary: false,
        isWorker: true,
        workers: {},
        on: vi.fn()
      }

      vi.doMock('cluster', () => ({
        default: clusterMock
      }))

      workerModule = await import('./SharedSSRCache.mjs')
    })

    it('should return null for cache miss when not initialized', async () => {
      // Mock process.send for worker
      const originalSend = process.send
      process.send = vi.fn()

      // Without initialization, local cache is empty
      const result = await workerModule.getCachedSSR('/test', 5000)

      // Should attempt IPC but timeout
      expect(result).toBeNull()

      process.send = originalSend
    })
  })

  describe('Local Cache Operations (Unit Tests)', () => {
    // These tests verify the cache logic without IPC

    it('getSSRCacheStats should return cache statistics', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')
      const stats = module.getSSRCacheStats()

      expect(stats).toHaveProperty('localSize')
      expect(stats).toHaveProperty('localKeys')
      expect(typeof stats.localSize).toBe('number')
      expect(Array.isArray(stats.localKeys)).toBe(true)
    })

    it('setCachedSSR should store in local cache', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      // Store a value
      module.setCachedSSR('/test-page', '<html>test</html>')

      // Check stats
      const stats = module.getSSRCacheStats()
      expect(stats.localSize).toBe(1)
      expect(stats.localKeys).toContain('/test-page')
    })

    it('invalidateSSRCache should clear specific key', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      // Store values
      module.setCachedSSR('/page1', '<html>page1</html>')
      module.setCachedSSR('/page2', '<html>page2</html>')

      // Invalidate one
      module.invalidateSSRCache('/page1')

      const stats = module.getSSRCacheStats()
      expect(stats.localSize).toBe(1)
      expect(stats.localKeys).not.toContain('/page1')
      expect(stats.localKeys).toContain('/page2')
    })

    it('invalidateSSRCache without key should clear all', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      // Store values
      module.setCachedSSR('/page1', '<html>page1</html>')
      module.setCachedSSR('/page2', '<html>page2</html>')

      // Invalidate all
      module.invalidateSSRCache()

      const stats = module.getSSRCacheStats()
      expect(stats.localSize).toBe(0)
    })
  })

  describe('Cache TTL Behavior', () => {
    it('getCachedSSR should respect maxAgeMs parameter', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      // Store a value
      module.setCachedSSR('/test', '<html>test</html>')

      // Should find it immediately
      const result1 = await module.getCachedSSR('/test', 5000)
      expect(result1).not.toBeNull()
      expect(result1.html).toBe('<html>test</html>')
      expect(result1.source).toBe('local')

      // With 0 maxAge, should not find it (expired)
      const result2 = await module.getCachedSSR('/test', 0)
      expect(result2).toBeNull()
    })

    it('getCachedSSR should include timestamp and source', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')
      const beforeStore = Date.now()

      module.setCachedSSR('/test', '<html>test</html>')

      const result = await module.getCachedSSR('/test', 5000)
      expect(result.timestamp).toBeGreaterThanOrEqual(beforeStore)
      expect(result.timestamp).toBeLessThanOrEqual(Date.now())
      expect(result.source).toBe('local')
    })
  })

  describe('IPC Message Handling', () => {
    it('should handle ssr_cache_update message in worker', async () => {
      vi.resetModules()

      let messageHandler = null

      // Mock process.on to capture handler
      const originalOn = process.on
      process.on = vi.fn((event, handler) => {
        if (event === 'message') {
          messageHandler = handler
        }
        return originalOn.call(process, event, handler)
      })

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: false,
          isWorker: true,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      // Initialize to set up message handlers
      module.initSharedSSRCache()

      // Simulate receiving cache update from primary
      if (messageHandler) {
        messageHandler({
          type: 'ssr_cache_update',
          key: '/shared-page',
          html: '<html>shared</html>',
          timestamp: Date.now()
        })

        // Check that local cache was updated
        const stats = module.getSSRCacheStats()
        expect(stats.localKeys).toContain('/shared-page')
      }

      process.on = originalOn
    })

    it('should handle ssr_cache_invalidated message in worker', async () => {
      vi.resetModules()

      let messageHandler = null

      const originalOn = process.on
      process.on = vi.fn((event, handler) => {
        if (event === 'message') {
          messageHandler = handler
        }
        return originalOn.call(process, event, handler)
      })

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: false,
          isWorker: true,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')
      module.initSharedSSRCache()

      // First add some data
      if (messageHandler) {
        messageHandler({
          type: 'ssr_cache_update',
          key: '/to-invalidate',
          html: '<html>test</html>',
          timestamp: Date.now()
        })

        // Verify it's there
        let stats = module.getSSRCacheStats()
        expect(stats.localKeys).toContain('/to-invalidate')

        // Now invalidate
        messageHandler({
          type: 'ssr_cache_invalidated',
          key: '/to-invalidate'
        })

        // Verify it's gone
        stats = module.getSSRCacheStats()
        expect(stats.localKeys).not.toContain('/to-invalidate')
      }

      process.on = originalOn
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty cache key', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      module.setCachedSSR('', '<html>empty key</html>')
      const result = await module.getCachedSSR('', 5000)

      expect(result).not.toBeNull()
      expect(result.html).toBe('<html>empty key</html>')
    })

    it('should handle special characters in cache key', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      const specialKey = '/page?foo=bar&baz=qux#section'
      module.setCachedSSR(specialKey, '<html>special</html>')
      const result = await module.getCachedSSR(specialKey, 5000)

      expect(result).not.toBeNull()
      expect(result.html).toBe('<html>special</html>')
    })

    it('should handle large HTML content', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      // Create 1MB of content
      const largeHtml = `<html>${  'x'.repeat(1024 * 1024)  }</html>`
      module.setCachedSSR('/large', largeHtml)
      const result = await module.getCachedSSR('/large', 5000)

      expect(result).not.toBeNull()
      expect(result.html.length).toBe(largeHtml.length)
    })

    it('should handle concurrent cache operations', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      // Simulate concurrent sets
      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            module.setCachedSSR(`/page${i}`, `<html>page${i}</html>`)
          })
        )
      }

      await Promise.all(promises)

      const stats = module.getSSRCacheStats()
      expect(stats.localSize).toBe(100)
    })

    it('should handle non-string html values gracefully', async () => {
      vi.resetModules()

      vi.doMock('cluster', () => ({
        default: {
          isPrimary: true,
          isWorker: false,
          workers: {},
          on: vi.fn()
        }
      }))

      const module = await import('./SharedSSRCache.mjs')

      // These shouldn't throw
      module.setCachedSSR('/null', null)
      module.setCachedSSR('/undefined', undefined)
      module.setCachedSSR('/number', 123)

      // Should still be stored (as-is)
      const stats = module.getSSRCacheStats()
      expect(stats.localSize).toBe(3)
    })
  })
})
