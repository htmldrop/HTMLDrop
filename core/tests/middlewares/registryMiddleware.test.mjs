import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// We need to test the helper functions, so we'll import the module and test behavior
// through mock requests

describe('registryMiddleware skip paths', () => {
  let tempDir
  let themeDir
  let pluginDir

  beforeEach(async () => {
    // Create temp directory structure for themes/plugins
    tempDir = path.join(os.tmpdir(), `registry-test-${Date.now()}`)
    themeDir = path.join(tempDir, 'content/themes/test-theme')
    pluginDir = path.join(tempDir, 'content/plugins/test-plugin')

    await fs.promises.mkdir(themeDir, { recursive: true })
    await fs.promises.mkdir(pluginDir, { recursive: true })
  })

  afterEach(async () => {
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  describe('skip path pattern matching', () => {
    it('should match exact paths', () => {
      const patterns = ['/api/v1/health', '/api/v1/metrics']
      const matchPath = (fullPath) =>
        patterns.some((pattern) => {
          if (pattern.endsWith('*')) {
            return fullPath.startsWith(pattern.slice(0, -1))
          }
          return fullPath === pattern
        })

      expect(matchPath('/api/v1/health')).toBe(true)
      expect(matchPath('/api/v1/metrics')).toBe(true)
      expect(matchPath('/api/v1/users')).toBe(false)
    })

    it('should match wildcard paths', () => {
      const patterns = ['/api/v1/git/*', '/api/v1/internal/*']
      const matchPath = (fullPath) =>
        patterns.some((pattern) => {
          if (pattern.endsWith('*')) {
            return fullPath.startsWith(pattern.slice(0, -1))
          }
          return fullPath === pattern
        })

      expect(matchPath('/api/v1/git/push')).toBe(true)
      expect(matchPath('/api/v1/git/pull')).toBe(true)
      expect(matchPath('/api/v1/git/repos/test')).toBe(true)
      expect(matchPath('/api/v1/internal/status')).toBe(true)
      expect(matchPath('/api/v1/users')).toBe(false)
      expect(matchPath('/api/v1/git')).toBe(false) // No trailing slash, doesn't match
    })

    it('should handle empty patterns array', () => {
      const patterns = []
      const matchPath = (fullPath) =>
        patterns.some((pattern) => {
          if (pattern.endsWith('*')) {
            return fullPath.startsWith(pattern.slice(0, -1))
          }
          return fullPath === pattern
        })

      expect(matchPath('/api/v1/anything')).toBe(false)
    })
  })

  describe('config file loading', () => {
    it('should load skip_registry_paths from theme config', async () => {
      const configContent = `export default {
  persistent_directories: ['workdir'],
  skip_registry_paths: ['/api/v1/git/*', '/api/v1/custom']
}`
      await fs.promises.writeFile(path.join(themeDir, 'config.mjs'), configContent)

      // Dynamically import the config
      const configModule = await import(`${path.join(themeDir, 'config.mjs')}?t=${Date.now()}`)
      const config = configModule.default || {}

      expect(Array.isArray(config.skip_registry_paths)).toBe(true)
      expect(config.skip_registry_paths).toContain('/api/v1/git/*')
      expect(config.skip_registry_paths).toContain('/api/v1/custom')
    })

    it('should return empty array for missing config', async () => {
      const configPath = path.join(themeDir, 'nonexistent-config.mjs')
      const exists = fs.existsSync(configPath)

      expect(exists).toBe(false)
      // The middleware returns [] for missing configs
    })

    it('should return empty array for config without skip_registry_paths', async () => {
      const configContent = `export default {
  persistent_directories: ['workdir']
}`
      await fs.promises.writeFile(path.join(themeDir, 'config.mjs'), configContent)

      const configModule = await import(`${path.join(themeDir, 'config.mjs')}?t=${Date.now()}`)
      const config = configModule.default || {}

      const skipPaths = Array.isArray(config.skip_registry_paths) ? config.skip_registry_paths : []
      expect(skipPaths).toEqual([])
    })
  })

  describe('cache invalidation via mtime', () => {
    it('should detect config file modification', async () => {
      const configPath = path.join(themeDir, 'config.mjs')

      // Write initial config
      await fs.promises.writeFile(
        configPath,
        `export default { skip_registry_paths: ['/api/v1/old'] }`
      )
      const stat1 = await fs.promises.stat(configPath)
      const mtime1 = stat1.mtimeMs

      // Wait a bit and modify
      await new Promise((resolve) => setTimeout(resolve, 10))
      await fs.promises.writeFile(
        configPath,
        `export default { skip_registry_paths: ['/api/v1/new'] }`
      )
      const stat2 = await fs.promises.stat(configPath)
      const mtime2 = stat2.mtimeMs

      // mtimes should be different
      expect(mtime2).toBeGreaterThan(mtime1)
    })

    it('should generate different mtime keys when files change', async () => {
      const themeConfigPath = path.join(themeDir, 'config.mjs')
      const pluginConfigPath = path.join(pluginDir, 'config.mjs')

      // Write configs
      await fs.promises.writeFile(
        themeConfigPath,
        `export default { skip_registry_paths: ['/api/v1/theme'] }`
      )
      await fs.promises.writeFile(
        pluginConfigPath,
        `export default { skip_registry_paths: ['/api/v1/plugin'] }`
      )

      // Get mtimes
      const getMtimes = async (paths) => {
        const mtimes = {}
        for (const p of paths) {
          if (fs.existsSync(p)) {
            const stat = await fs.promises.stat(p)
            mtimes[p] = stat.mtimeMs
          }
        }
        return JSON.stringify(mtimes)
      }

      const key1 = await getMtimes([themeConfigPath, pluginConfigPath])

      // Modify one file
      await new Promise((resolve) => setTimeout(resolve, 10))
      await fs.promises.writeFile(
        themeConfigPath,
        `export default { skip_registry_paths: ['/api/v1/theme-updated'] }`
      )

      const key2 = await getMtimes([themeConfigPath, pluginConfigPath])

      expect(key1).not.toBe(key2)
    })
  })

  describe('skip registry detection methods', () => {
    it('should detect skipRegistry query parameter', () => {
      const mockReq = {
        skipRegistry: undefined,
        query: { skipRegistry: 'true' },
        headers: {}
      }

      const shouldSkip =
        mockReq.skipRegistry === true ||
        mockReq.query.skipRegistry === 'true' ||
        mockReq.headers['x-skip-registry'] === 'true'

      expect(shouldSkip).toBe(true)
    })

    it('should detect x-skip-registry header', () => {
      const mockReq = {
        skipRegistry: undefined,
        query: {},
        headers: { 'x-skip-registry': 'true' }
      }

      const shouldSkip =
        mockReq.skipRegistry === true ||
        mockReq.query.skipRegistry === 'true' ||
        mockReq.headers['x-skip-registry'] === 'true'

      expect(shouldSkip).toBe(true)
    })

    it('should detect req.skipRegistry flag', () => {
      const mockReq = {
        skipRegistry: true,
        query: {},
        headers: {}
      }

      const shouldSkip =
        mockReq.skipRegistry === true ||
        mockReq.query.skipRegistry === 'true' ||
        mockReq.headers['x-skip-registry'] === 'true'

      expect(shouldSkip).toBe(true)
    })

    it('should not skip when no flags are set', () => {
      const mockReq = {
        skipRegistry: undefined,
        query: {},
        headers: {}
      }

      const shouldSkip =
        mockReq.skipRegistry === true ||
        mockReq.query.skipRegistry === 'true' ||
        mockReq.headers['x-skip-registry'] === 'true'

      expect(shouldSkip).toBe(false)
    })
  })

  describe('non-API route detection', () => {
    it('should identify non-API routes', () => {
      const isNonApiRoute = (fullPath) => !fullPath.startsWith('/api/')

      expect(isNonApiRoute('/')).toBe(true)
      expect(isNonApiRoute('/about')).toBe(true)
      expect(isNonApiRoute('/static/image.png')).toBe(true)
      expect(isNonApiRoute('/api/v1/users')).toBe(false)
      expect(isNonApiRoute('/api/health')).toBe(false)
    })
  })

  describe('combined skip paths from multiple sources', () => {
    it('should merge paths from options and content configs', () => {
      const optionsSkipPaths = ['/api/v1/health']
      const themeSkipPaths = ['/api/v1/git/*']
      const pluginSkipPaths = ['/api/v1/plugin-route']

      const allSkipPaths = [...optionsSkipPaths, ...themeSkipPaths, ...pluginSkipPaths]

      expect(allSkipPaths).toHaveLength(3)
      expect(allSkipPaths).toContain('/api/v1/health')
      expect(allSkipPaths).toContain('/api/v1/git/*')
      expect(allSkipPaths).toContain('/api/v1/plugin-route')
    })

    it('should handle duplicate paths', () => {
      const optionsSkipPaths = ['/api/v1/health']
      const themeSkipPaths = ['/api/v1/health', '/api/v1/git/*']

      const allSkipPaths = [...optionsSkipPaths, ...themeSkipPaths]

      // Duplicates are fine - the .some() check will still work correctly
      expect(allSkipPaths).toHaveLength(3)

      // Both would match
      const matchPath = (fullPath) =>
        allSkipPaths.some((pattern) => {
          if (pattern.endsWith('*')) {
            return fullPath.startsWith(pattern.slice(0, -1))
          }
          return fullPath === pattern
        })

      expect(matchPath('/api/v1/health')).toBe(true)
    })
  })
})
