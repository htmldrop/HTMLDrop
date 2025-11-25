import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import cacheService from './CacheService.mjs'

describe('CacheService', () => {
  beforeEach(async () => {
    cacheService.enabled = true
    await cacheService.initialize()
  })

  afterEach(async () => {
    await cacheService.flush()
  })

  describe('get and set', () => {
    it('should store and retrieve values', async () => {
      await cacheService.set('test-key', { foo: 'bar' })

      const result = await cacheService.get('test-key')

      expect(result).toEqual({ foo: 'bar' })
    })

    it('should return null for non-existent keys', async () => {
      const result = await cacheService.get('non-existent')

      expect(result).toBe(null)
    })

    it('should handle primitive values', async () => {
      await cacheService.set('string', 'value')
      await cacheService.set('number', 123)
      await cacheService.set('boolean', true)

      expect(await cacheService.get('string')).toBe('value')
      expect(await cacheService.get('number')).toBe(123)
      expect(await cacheService.get('boolean')).toBe(true)
    })
  })

  describe('del', () => {
    it('should delete cached values', async () => {
      await cacheService.set('test-key', 'value')
      await cacheService.del('test-key')

      const result = await cacheService.get('test-key')

      expect(result).toBe(null)
    })
  })

  describe('remember', () => {
    it('should cache function result', async () => {
      let callCount = 0
      const fn = async () => {
        callCount++
        return { data: 'value' }
      }

      const result1 = await cacheService.remember('test-remember', fn)
      const result2 = await cacheService.remember('test-remember', fn)

      expect(result1).toEqual({ data: 'value' })
      expect(result2).toEqual({ data: 'value' })
      expect(callCount).toBe(1) // Function called only once
    })
  })

  describe('increment', () => {
    it('should increment counter', async () => {
      const result1 = await cacheService.increment('test-counter')
      const result2 = await cacheService.increment('test-counter')
      const result3 = await cacheService.increment('test-counter', 5)

      expect(result1).toBe(1)
      expect(result2).toBe(2)
      expect(result3).toBe(7)
    })
  })

  describe('exists', () => {
    it('should check if key exists', async () => {
      await cacheService.set('test-exists', 'value')

      expect(await cacheService.exists('test-exists')).toBe(true)
      expect(await cacheService.exists('non-existent-key')).toBe(false)
    })
  })

  describe('flush', () => {
    it('should clear all cache', async () => {
      await cacheService.set('key1', 'value1')
      await cacheService.set('key2', 'value2')

      await cacheService.flush()

      expect(await cacheService.get('key1')).toBe(null)
      expect(await cacheService.get('key2')).toBe(null)
    })
  })
})
