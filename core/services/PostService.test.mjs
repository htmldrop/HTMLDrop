import { describe, it, expect, beforeEach, vi } from 'vitest'
import PostService from './PostService.ts'

describe('PostService', () => {
  let postService
  let mockContext

  beforeEach(() => {
    mockContext = {
      knex: vi.fn(),
      table: vi.fn((name) => `test_${name}`),
      normalizeSlug: vi.fn((text) => text.toLowerCase().replace(/\s+/g, '-'))
    }

    postService = new PostService(mockContext)
  })

  describe('parseJSON', () => {
    it('should parse valid JSON string', () => {
      const result = postService.parseJSON('{"key":"value"}')
      expect(result).toEqual({ key: 'value' })
    })

    it('should return original value if not valid JSON', () => {
      const result = postService.parseJSON('not-json')
      expect(result).toBe('not-json')
    })

    it('should return non-string values as-is', () => {
      expect(postService.parseJSON(123)).toBe(123)
      expect(postService.parseJSON(null)).toBe(null)
      expect(postService.parseJSON({ key: 'value' })).toEqual({ key: 'value' })
    })
  })

  describe('normalizeObject', () => {
    it('should sort object keys and stringify', () => {
      const obj = { c: 3, a: 1, b: 2 }
      const result = postService.normalizeObject(obj)
      expect(result).toBe('{"a":1,"b":2,"c":3}')
    })

    it('should handle nested objects', () => {
      const obj = { nested: { c: 3, a: 1 }, top: 'value' }
      const result = postService.normalizeObject(obj)
      expect(result).toBe('{"nested":{"a":1,"c":3},"top":"value"}')
    })

    it('should handle arrays', () => {
      const arr = [3, 1, 2]
      const result = postService.normalizeObject(arr)
      expect(result).toBe('[3,1,2]')
    })

    it('should return primitive values as-is', () => {
      expect(postService.normalizeObject('string')).toBe('string')
      expect(postService.normalizeObject(123)).toBe(123)
      expect(postService.normalizeObject(null)).toBe(null)
    })
  })

  describe('parseRow', () => {
    it('should parse all JSON fields in a row', () => {
      const row = {
        id: 1,
        data: '{"key":"value"}',
        plain: 'text'
      }

      const result = postService.parseRow(row)

      expect(result).toEqual({
        id: 1,
        data: { key: 'value' },
        plain: 'text'
      })
    })
  })

  describe('resolveTermIds', () => {
    it('should extract term IDs from object with arrays', async () => {
      const termsField = {
        category: [{ id: 1 }, { id: 2 }],
        tag: [3, 4]
      }

      const result = await postService.resolveTermIds(termsField)

      expect(result).toEqual(expect.arrayContaining([1, 2, 3, 4]))
      expect(result.length).toBe(4)
    })

    it('should handle single values', async () => {
      const termsField = {
        category: 1,
        tag: 2
      }

      const result = await postService.resolveTermIds(termsField)

      expect(result).toEqual(expect.arrayContaining([1, 2]))
    })

    it('should return empty array for undefined input', async () => {
      const result = await postService.resolveTermIds(undefined)

      expect(result).toEqual([])
    })
  })
})
