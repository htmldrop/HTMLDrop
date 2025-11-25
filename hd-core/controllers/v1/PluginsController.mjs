import fs from 'fs'
import path from 'path'
import multer from 'multer'
import express from 'express'
import AdmZip from 'adm-zip'
import { spawn } from 'child_process'
import { validatePackageName, validateVersion, buildNpmInstallArgs } from '../../utils/npmValidator.mjs'
import PluginLifecycleService from '../../services/PluginLifecycleService.mjs'
import PersistenceService from '../../services/PersistenceService.mjs'

const PLUGINS_BASE = path.resolve('./hd-content/plugins')
if (!fs.existsSync(PLUGINS_BASE)) fs.mkdirSync(PLUGINS_BASE, { recursive: true })

/**
 * Safely executes npm install using spawn to prevent command injection
 */
const safeNpmInstall = (packageName, version, options) => {
  return new Promise((resolve, reject) => {
    try {
      // Validate inputs
      validatePackageName(packageName)
      if (version) validateVersion(version)

      const args = buildNpmInstallArgs(packageName, version, options)

      const npmProcess = spawn('npm', args, {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false // CRITICAL: Don't use shell to prevent injection
      })

      let stdout = ''
      let stderr = ''

      npmProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      npmProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      npmProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`npm install failed with code ${code}: ${stderr}`))
        }
      })

      npmProcess.on('error', (err) => {
        reject(err)
      })
    } catch (err) {
      reject(err)
    }
  })
}

// Multer config for plugin ZIP uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(PLUGINS_BASE, '.temp')
    fs.mkdirSync(tempDir, { recursive: true })
    cb(null, tempDir)
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_')
    const uniqueName = `${Date.now()}-${safeName}`
    cb(null, uniqueName)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.zip') {
      return cb(new Error('Only .zip files are allowed'))
    }
    cb(null, true)
  }
})

export default (context) => {
  const router = express.Router({ mergeParams: true })

  // Helper: Read plugin metadata from index.mjs and package.json
  const getPluginMetadata = async (pluginSlug) => {
    const pluginFolder = path.join(PLUGINS_BASE, pluginSlug)
    const pluginIndex = path.join(pluginFolder, 'index.mjs')

    if (!fs.existsSync(pluginIndex)) {
      return null
    }

    try {
      // Read package.json if exists
      const packageJsonPath = path.join(pluginFolder, 'package.json')
      let packageJson = null

      if (fs.existsSync(packageJsonPath)) {
        const packageContent = await fs.promises.readFile(packageJsonPath, 'utf8')
        packageJson = JSON.parse(packageContent)
      }

      // Basic metadata extraction
      const metadata = {
        slug: pluginSlug,
        name: packageJson?.name || pluginSlug.charAt(0).toUpperCase() + pluginSlug.slice(1),
        description: packageJson?.description || '',
        version: packageJson?.version || '1.0.0',
        author: packageJson?.author || '',
        npmPackage: packageJson?.name || null
      }

      return metadata
    } catch (err) {
      return {
        slug: pluginSlug,
        name: pluginSlug,
        description: '',
        version: '1.0.0',
        author: '',
        npmPackage: null
      }
    }
  }

  // Helper: Get active plugins from options
  const getActivePlugins = async () => {
    const { knex, table } = context
    const optionRow = await knex(table('options')).where({ name: 'active_plugins' }).first()

    if (!optionRow) return []

    try {
      return JSON.parse(optionRow.value)
    } catch {
      return []
    }
  }

  // Helper: Update active plugins in options
  const updateActivePlugins = async (plugins) => {
    const { knex, table } = context
    await knex(table('options'))
      .where({ name: 'active_plugins' })
      .update({ value: JSON.stringify(plugins) })
    process.send({ type: 'options_updated' })
  }

  /**
   * @openapi
   * /plugins:
   *   get:
   *     tags:
   *       - Plugins
   *     summary: List all plugins
   *     description: Returns a list of all installed plugins with metadata and activation status
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of plugins
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   slug:
   *                     type: string
   *                     example: custom-plugin
   *                   name:
   *                     type: string
   *                     example: Custom Plugin
   *                   description:
   *                     type: string
   *                     example: A custom plugin for extended functionality
   *                   version:
   *                     type: string
   *                     example: 1.0.0
   *                   author:
   *                     type: string
   *                     example: Jane Smith
   *                   npmPackage:
   *                     type: string
   *                     nullable: true
   *                     example: "@myorg/custom-plugin"
   *                   active:
   *                     type: boolean
   *                     example: true
   *       401:
   *         description: Unauthorized
   */
  router.get('/', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_plugin'], userId: req?.user?.id })

      if (!hasAccess) {
        return res.json([])
      }

      const folders = await fs.promises.readdir(PLUGINS_BASE, { withFileTypes: true })
      const activePlugins = await getActivePlugins()
      const plugins = []

      for (const folder of folders) {
        if (!folder.isDirectory() || folder.name.startsWith('.')) continue

        const metadata = await getPluginMetadata(folder.name)
        if (!metadata) continue

        plugins.push({
          ...metadata,
          active: activePlugins.includes(folder.name)
        })
      }

      res.json(plugins)
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /plugins/{slug}:
   *   get:
   *     tags:
   *       - Plugins
   *     summary: Get single plugin
   *     description: Retrieves detailed information about a specific plugin
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Plugin slug
   *         example: custom-plugin
   *     responses:
   *       200:
   *         description: Plugin details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 slug:
   *                   type: string
   *                 name:
   *                   type: string
   *                 description:
   *                   type: string
   *                 version:
   *                   type: string
   *                 author:
   *                   type: string
   *                 npmPackage:
   *                   type: string
   *                   nullable: true
   *                 active:
   *                   type: boolean
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Plugin not found
   */
  router.get('/:slug', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_plugin'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const metadata = await getPluginMetadata(slug)

      if (!metadata) {
        return res.status(404).json({ error: 'Plugin not found' })
      }

      const activePlugins = await getActivePlugins()

      res.json({
        ...metadata,
        active: activePlugins.includes(slug)
      })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /plugins/{slug}/activate:
   *   post:
   *     tags:
   *       - Plugins
   *     summary: Activate plugin
   *     description: Activates a plugin, adding it to the list of active plugins
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Plugin slug to activate
   *         example: custom-plugin
   *     responses:
   *       200:
   *         description: Plugin activated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Plugin activated
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks activate_plugins capability
   *       404:
   *         description: Plugin not found
   */
  router.post('/:slug/activate', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['update', 'activate_plugins'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const pluginFolder = path.join(PLUGINS_BASE, slug)

      if (!fs.existsSync(pluginFolder)) {
        return res.status(404).json({ error: 'Plugin not found' })
      }

      const activePlugins = await getActivePlugins()

      if (!activePlugins.includes(slug)) {
        activePlugins.push(slug)
        await updateActivePlugins(activePlugins)

        // Call lifecycle hook and refresh badge counts
        const lifecycleService = new PluginLifecycleService(req.context)
        await lifecycleService.onActivate(slug)
      }

      res.json({ success: true, message: 'Plugin activated' })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /plugins/{slug}/deactivate:
   *   post:
   *     tags:
   *       - Plugins
   *     summary: Deactivate plugin
   *     description: Deactivates a plugin, removing it from the list of active plugins
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Plugin slug to deactivate
   *         example: custom-plugin
   *     responses:
   *       200:
   *         description: Plugin deactivated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Plugin deactivated
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks deactivate_plugins capability
   */
  router.post('/:slug/deactivate', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['update', 'deactivate_plugins'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const activePlugins = await getActivePlugins()

      if (activePlugins.includes(slug)) {
        const filtered = activePlugins.filter((p) => p !== slug)
        await updateActivePlugins(filtered)

        // Call lifecycle hook and refresh badge counts
        const lifecycleService = new PluginLifecycleService(req.context)
        await lifecycleService.onDeactivate(slug)
      }

      res.json({ success: true, message: 'Plugin deactivated' })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /plugins/{slug}:
   *   delete:
   *     tags:
   *       - Plugins
   *     summary: Delete plugin
   *     description: Permanently deletes a plugin. The plugin will be deactivated first if currently active.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Plugin slug to delete
   *         example: old-plugin
   *     responses:
   *       200:
   *         description: Plugin deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Plugin deleted
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks delete_plugins capability
   *       404:
   *         description: Plugin not found
   */
  router.delete('/:slug', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['delete', 'delete_plugins'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const pluginFolder = path.join(PLUGINS_BASE, slug)

      if (!fs.existsSync(pluginFolder)) {
        return res.status(404).json({ error: 'Plugin not found' })
      }

      // Deactivate first
      const activePlugins = await getActivePlugins()
      const filtered = activePlugins.filter((p) => p !== slug)
      await updateActivePlugins(filtered)

      // Delete folder
      await fs.promises.rm(pluginFolder, { recursive: true, force: true })

      res.json({ success: true, message: 'Plugin deleted' })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /plugins/upload:
   *   post:
   *     tags:
   *       - Plugins
   *     summary: Upload and install plugin
   *     description: Uploads a plugin ZIP file and installs it. The ZIP must contain an index.mjs file in the root folder.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - file
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: Plugin ZIP file
   *     responses:
   *       200:
   *         description: Plugin uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Plugin uploaded successfully
   *                 plugin:
   *                   type: object
   *                   properties:
   *                     slug:
   *                       type: string
   *                     name:
   *                       type: string
   *                     version:
   *                       type: string
   *       400:
   *         description: Invalid plugin structure or no file uploaded
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks upload_plugins capability
   *       409:
   *         description: Plugin already exists
   */
  router.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['create', 'upload_plugins'], userId: req?.user?.id })
      if (!hasAccess) {
        // Clean up uploaded file if permission denied
        if (req.file) {
          try {
            await fs.promises.unlink(req.file.path)
          } catch {}
        }
        return res.status(403).json({ error: 'Permission denied' })
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
      }

      const zipPath = req.file.path
      const zip = new AdmZip(zipPath)
      const zipEntries = zip.getEntries()

      // Find the root folder in zip (should contain index.mjs)
      let rootFolder = null
      let pluginSlug = null

      for (const entry of zipEntries) {
        if (entry.entryName.endsWith('/index.mjs')) {
          const parts = entry.entryName.split('/')
          rootFolder = parts[0]
          pluginSlug = rootFolder
          break
        }
      }

      if (!rootFolder || !pluginSlug) {
        await fs.promises.unlink(zipPath)
        return res.status(400).json({ error: 'Invalid plugin structure. Must contain index.mjs in root folder.' })
      }

      // Extract to plugins directory
      const targetPath = path.join(PLUGINS_BASE, pluginSlug)

      // Check if already exists
      if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(zipPath)
        return res.status(409).json({ error: 'Plugin already exists' })
      }

      // Validate all zip entries to prevent path traversal (Zip Slip)
      const resolvedBase = path.resolve(PLUGINS_BASE)
      for (const entry of zipEntries) {
        const entryPath = path.normalize(entry.entryName)
        const fullPath = path.resolve(PLUGINS_BASE, entryPath)

        // Ensure path stays within PLUGINS_BASE
        if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
          await fs.promises.unlink(zipPath)
          return res.status(400).json({ error: 'Invalid zip file: path traversal detected' })
        }
      }

      // Extract
      zip.extractAllTo(PLUGINS_BASE, true)

      // Clean up temp file
      await fs.promises.unlink(zipPath)

      // Get metadata
      const metadata = await getPluginMetadata(pluginSlug)

      res.json({
        success: true,
        message: 'Plugin uploaded successfully',
        plugin: metadata
      })
    } catch (err) {
      // Clean up on error
      if (req.file) {
        try {
          await fs.promises.unlink(req.file.path)
        } catch {}
      }
      next(err)
    }
  })

  /**
   * @openapi
   * /plugins/search/npm:
   *   get:
   *     tags:
   *       - Plugins
   *     summary: Search NPM registry for plugins
   *     description: Searches the NPM registry for packages tagged with 'hd-plugin' keyword
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *         description: Search query
   *         example: custom
   *       - in: query
   *         name: size
   *         schema:
   *           type: integer
   *           default: 20
   *         description: Number of results to return
   *       - in: query
   *         name: from
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Offset for pagination
   *     responses:
   *       200:
   *         description: Search results from NPM registry
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 objects:
   *                   type: array
   *                   items:
   *                     type: object
   *                 total:
   *                   type: integer
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  router.get('/search/npm', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_plugin'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { q = '', size = 20, from = 0 } = req.query

      // Search NPM registry for packages with 'hd-plugin' keyword
      const baseKeyword = 'keywords:hd-plugin'
      const searchQuery = q ? `${encodeURIComponent(q)}+${baseKeyword}` : baseKeyword

      const quality = q ? '1.0' : '0.0'
      const popularity = q ? '0.0' : '1.0'
      const maintenance = '0.0'

      const npmApiUrl = `https://registry.npmjs.com/-/v1/search?text=${searchQuery}&size=${size}&from=${from}&quality=${quality}&popularity=${popularity}&maintenance=${maintenance}`

      const response = await fetch(npmApiUrl)
      const data = await response.json()

      if (data.objects) {
        data.objects = data.objects.filter((obj) => {
          const pkg = obj.package
          if (!pkg.keywords || !pkg.keywords.includes('hd-plugin')) return false

          if (!q) return true // when no search term, just show hd-plugin packages

          const term = q.toLowerCase()
          return (
            pkg.name.toLowerCase().includes(term) ||
            (pkg.description && pkg.description.toLowerCase().includes(term)) ||
            pkg.keywords.some((k) => k.toLowerCase().includes(term))
          )
        })

        data.total = data.objects.length
      }

      res.json(data)
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /plugins/{slug}/versions:
   *   get:
   *     tags:
   *       - Plugins
   *     summary: Get all available NPM versions
   *     description: Retrieves all available versions of a plugin from NPM registry, including current and available versions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Plugin slug
   *         example: custom-plugin
   *     responses:
   *       200:
   *         description: Version information
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 currentVersion:
   *                   type: string
   *                   example: 1.0.0
   *                 latestVersion:
   *                   type: string
   *                   example: 1.2.0
   *                 allVersions:
   *                   type: array
   *                   items:
   *                     type: string
   *                   example: ["1.2.0", "1.1.0", "1.0.0"]
   *                 newerVersions:
   *                   type: array
   *                   items:
   *                     type: string
   *                 olderVersions:
   *                   type: array
   *                   items:
   *                     type: string
   *       400:
   *         description: Plugin does not have package.json or missing name field
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Plugin not found or package not found on NPM
   */
  router.get('/:slug/versions', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_plugin'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const pluginFolder = path.join(PLUGINS_BASE, slug)

      if (!fs.existsSync(pluginFolder)) {
        return res.status(404).json({ error: 'Plugin not found' })
      }

      // Read package.json to get npm package name
      const packageJsonPath = path.join(pluginFolder, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        return res.status(400).json({ error: 'Plugin does not have package.json' })
      }

      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
      const packageName = packageJson.name
      const currentVersion = packageJson.version

      if (!packageName) {
        return res.status(400).json({ error: 'Plugin package.json is missing name field' })
      }

      // Fetch all versions from NPM registry
      const response = await fetch(`https://registry.npmjs.org/${packageName}`)
      const data = await response.json()

      if (!data.versions) {
        return res.status(404).json({ error: 'Package not found on NPM' })
      }

      // Get all versions and sort by semver (newest first)
      const versions = Object.keys(data.versions).sort((a, b) => {
        const aParts = a.split('.').map(Number)
        const bParts = b.split('.').map(Number)

        for (let i = 0; i < 3; i++) {
          if (bParts[i] > aParts[i]) return 1
          if (bParts[i] < aParts[i]) return -1
        }
        return 0
      })

      const currentIndex = versions.indexOf(currentVersion)

      res.json({
        currentVersion,
        latestVersion: versions[0],
        allVersions: versions,
        newerVersions: currentIndex > 0 ? versions.slice(0, currentIndex) : [],
        olderVersions: currentIndex >= 0 ? versions.slice(currentIndex + 1) : versions
      })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /plugins/{slug}/change-version:
   *   post:
   *     tags:
   *       - Plugins
   *     summary: Change plugin version
   *     description: Changes a plugin to a specific NPM version. The plugin will be deactivated, updated, and reactivated if it was previously active.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Plugin slug
   *         example: custom-plugin
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - version
   *             properties:
   *               version:
   *                 type: string
   *                 description: Target version to change to
   *                 example: 1.2.0
   *     responses:
   *       200:
   *         description: Plugin version changed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Plugin version changed successfully
   *                 plugin:
   *                   type: object
   *                 previousVersion:
   *                   type: string
   *                   example: 1.0.0
   *                 newVersion:
   *                   type: string
   *                   example: 1.2.0
   *       400:
   *         description: Version is required, already on this version, or invalid plugin structure
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks upload_plugins capability
   *       404:
   *         description: Plugin not found
   *       500:
   *         description: Version change failed
   */
  router.post('/:slug/change-version', async (req, res) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['update', 'upload_plugins'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const { version } = req.body
      const pluginFolder = path.join(PLUGINS_BASE, slug)

      if (!version) {
        return res.status(400).json({ error: 'Version is required' })
      }

      if (!fs.existsSync(pluginFolder)) {
        return res.status(404).json({ error: 'Plugin not found' })
      }

      // Read package.json to get npm package name
      const packageJsonPath = path.join(pluginFolder, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        return res.status(400).json({ error: 'Plugin does not have package.json - cannot change version' })
      }

      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
      const packageName = packageJson.name
      const currentVersion = packageJson.version

      if (!packageName) {
        return res.status(400).json({ error: 'Plugin package.json is missing name field' })
      }

      if (version === currentVersion) {
        return res.status(400).json({ error: 'Already on this version' })
      }

      // Deactivate plugin if active before updating
      const activePlugins = await getActivePlugins()
      const wasActive = activePlugins.includes(slug)

      if (wasActive) {
        const filtered = activePlugins.filter((p) => p !== slug)
        await updateActivePlugins(filtered)
      }

      const tempDir = path.join(PLUGINS_BASE, '.temp-update')
      const backupDir = path.join(PLUGINS_BASE, `.backup-${slug}-${Date.now()}`)

      // Create temp directory
      await fs.promises.mkdir(tempDir, { recursive: true })

      try {
        // Backup persistent files and directories before upgrade/downgrade
        const persistenceService = new PersistenceService()
        const backupInfo = await persistenceService.backup(pluginFolder, backupDir)
        console.log(`[PluginsController] Backed up ${backupInfo.files.length} files and ${backupInfo.directories.length} directories`)

        // Install specific version to temp directory using safe method
        await safeNpmInstall(packageName, version, {
          prefix: tempDir,
          noSave: true,
          noPackageLock: true
        })

        // Find the installed package
        const nodeModulesPath = path.join(tempDir, 'node_modules', packageName)

        if (!fs.existsSync(nodeModulesPath)) {
          await persistenceService.cleanup(backupDir)
          await fs.promises.rm(tempDir, { recursive: true, force: true })
          return res.status(400).json({ error: 'Package installation failed' })
        }

        // Check for index.mjs
        const indexPath = path.join(nodeModulesPath, 'index.mjs')
        if (!fs.existsSync(indexPath)) {
          await persistenceService.cleanup(backupDir)
          await fs.promises.rm(tempDir, { recursive: true, force: true })
          return res.status(400).json({ error: 'Invalid plugin structure: missing index.mjs' })
        }

        // Remove old plugin folder
        await fs.promises.rm(pluginFolder, { recursive: true, force: true })

        // Move new version to plugins directory
        await fs.promises.rename(nodeModulesPath, pluginFolder)

        // Restore persistent files and directories
        const restoreInfo = await persistenceService.restore(backupDir, pluginFolder)
        console.log(`[PluginsController] Restored ${restoreInfo.files.length} files`)

        // Clean up backup
        await persistenceService.cleanup(backupDir)

        // Clean up temp directory
        await fs.promises.rm(tempDir, { recursive: true, force: true })

        // Call lifecycle hook for version change
        const lifecycleService = new PluginLifecycleService(req.context)
        const isUpgrade = version > currentVersion

        if (isUpgrade) {
          await lifecycleService.onUpgrade(slug, currentVersion, version)
        } else {
          await lifecycleService.onDowngrade(slug, currentVersion, version)
        }

        // Reactivate if it was active
        if (wasActive) {
          activePlugins.push(slug)
          await updateActivePlugins(activePlugins)
        }

        // Get updated metadata
        const metadata = await getPluginMetadata(slug)

        res.json({
          success: true,
          message: 'Plugin version changed successfully',
          plugin: metadata,
          previousVersion: currentVersion,
          newVersion: version
        })
      } catch (updateErr) {
        // Clean up on error
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        return res.status(500).json({ error: updateErr.message || 'Version change failed' })
      }
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Internal server error' })
    }
  })

  /**
   * @openapi
   * /plugins/install/npm:
   *   post:
   *     tags:
   *       - Plugins
   *     summary: Install plugin from NPM
   *     description: Installs a plugin directly from NPM registry by package name
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - packageName
   *             properties:
   *               packageName:
   *                 type: string
   *                 description: NPM package name
   *                 example: "@myorg/custom-plugin"
   *               version:
   *                 type: string
   *                 description: Specific version to install (optional, defaults to latest)
   *                 example: 1.0.0
   *     responses:
   *       200:
   *         description: Plugin installed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Plugin installed successfully
   *                 plugin:
   *                   type: object
   *                   properties:
   *                     slug:
   *                       type: string
   *                     name:
   *                       type: string
   *                     version:
   *                       type: string
   *       400:
   *         description: Package name is required or invalid plugin structure
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks upload_plugins capability
   *       409:
   *         description: Plugin already exists
   *       500:
   *         description: Installation failed
   */
  router.post('/install/npm', async (req, res) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['create', 'upload_plugins'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { packageName, version } = req.body

      if (!packageName) {
        return res.status(400).json({ error: 'Package name is required' })
      }

      const tempDir = path.join(PLUGINS_BASE, '.temp-install')

      // Create temp directory
      await fs.promises.mkdir(tempDir, { recursive: true })

      try {
        // Install package to temp directory using safe method
        await safeNpmInstall(packageName, version, {
          prefix: tempDir,
          noSave: true,
          noPackageLock: true
        })

        // Find the installed package
        const nodeModulesPath = path.join(tempDir, 'node_modules', packageName)

        if (!fs.existsSync(nodeModulesPath)) {
          await fs.promises.rm(tempDir, { recursive: true, force: true })
          return res.status(400).json({ error: 'Package installation failed' })
        }

        // Check for index.mjs
        const indexPath = path.join(nodeModulesPath, 'index.mjs')
        if (!fs.existsSync(indexPath)) {
          await fs.promises.rm(tempDir, { recursive: true, force: true })
          return res.status(400).json({ error: 'Invalid plugin structure: missing index.mjs' })
        }

        // Read package.json for plugin slug
        const packageJsonPath = path.join(nodeModulesPath, 'package.json')
        const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
        const pluginSlug = packageJson.name.replace(/^@.*?\//, '').replace(/[^a-z0-9-]/gi, '-')

        // Move to plugins directory
        const targetPath = path.join(PLUGINS_BASE, pluginSlug)

        if (fs.existsSync(targetPath)) {
          await fs.promises.rm(tempDir, { recursive: true, force: true })
          return res.status(409).json({ error: 'Plugin already exists' })
        }

        await fs.promises.rename(nodeModulesPath, targetPath)

        // Clean up temp directory
        await fs.promises.rm(tempDir, { recursive: true, force: true })

        // Get metadata
        const metadata = await getPluginMetadata(pluginSlug)

        res.json({
          success: true,
          message: 'Plugin installed successfully',
          plugin: metadata
        })
      } catch (installErr) {
        // Clean up on error
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        return res.status(500).json({ error: installErr.message || 'Installation failed' })
      }
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Internal server error' })
    }
  })

  return router
}
