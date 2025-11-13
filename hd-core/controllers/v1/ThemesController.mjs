import fs from 'fs'
import path from 'path'
import multer from 'multer'
import express from 'express'
import AdmZip from 'adm-zip'
import { spawn } from 'child_process'
import { validatePackageName, validateVersion, buildNpmInstallArgs } from '../../utils/npmValidator.mjs'

const THEMES_BASE = path.resolve('./hd-content/themes')
if (!fs.existsSync(THEMES_BASE)) fs.mkdirSync(THEMES_BASE, { recursive: true })

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

// Multer config for theme ZIP uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(THEMES_BASE, '.temp')
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

  // Helper: Read theme metadata from index.mjs and package.json
  const getThemeMetadata = async (themeSlug) => {
    const themeFolder = path.join(THEMES_BASE, themeSlug)
    const themeIndex = path.join(themeFolder, 'index.mjs')

    if (!fs.existsSync(themeIndex)) {
      return null
    }

    try {
      // Read package.json if exists
      const packageJsonPath = path.join(themeFolder, 'package.json')
      let packageJson = null

      if (fs.existsSync(packageJsonPath)) {
        const packageContent = await fs.promises.readFile(packageJsonPath, 'utf8')
        packageJson = JSON.parse(packageContent)
      }

      // Basic metadata extraction
      const metadata = {
        slug: themeSlug,
        name: packageJson?.name || themeSlug.charAt(0).toUpperCase() + themeSlug.slice(1),
        description: packageJson?.description || '',
        version: packageJson?.version || '1.0.0',
        author: packageJson?.author || '',
        npmPackage: packageJson?.name || null
      }

      return metadata
    } catch (err) {
      return {
        slug: themeSlug,
        name: themeSlug,
        description: '',
        version: '1.0.0',
        author: '',
        npmPackage: null
      }
    }
  }

  // Helper: Get active theme from options
  const getActiveTheme = async () => {
    const { knex, table } = context
    const optionRow = await knex(table('options')).where({ name: 'theme' }).first()

    return optionRow ? optionRow.value : null
  }

  // Helper: Update active theme in options
  const updateActiveTheme = async (themeSlug) => {
    const { knex, table } = context
    await knex(table('options')).where({ name: 'theme' }).update({ value: themeSlug })
    process.send({ type: 'options_updated' })
  }

  /**
   * @openapi
   * /themes:
   *   get:
   *     tags:
   *       - Themes
   *     summary: List all themes
   *     description: Returns a list of all installed themes with metadata and activation status
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of themes
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   slug:
   *                     type: string
   *                     example: modern-theme
   *                   name:
   *                     type: string
   *                     example: Modern Theme
   *                   description:
   *                     type: string
   *                     example: A modern and responsive theme
   *                   version:
   *                     type: string
   *                     example: 1.0.0
   *                   author:
   *                     type: string
   *                     example: John Doe
   *                   npmPackage:
   *                     type: string
   *                     nullable: true
   *                     example: '@myorg/modern-theme'
   *                   active:
   *                     type: boolean
   *                     example: true
   *       401:
   *         description: Unauthorized
   */
  router.get('/', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_theme'], userId: req?.user?.id })

      if (!hasAccess) {
        return res.json([])
      }

      const folders = await fs.promises.readdir(THEMES_BASE, { withFileTypes: true })
      const activeTheme = await getActiveTheme()
      const themes = []

      for (const folder of folders) {
        if (!folder.isDirectory() || folder.name.startsWith('.')) continue

        const metadata = await getThemeMetadata(folder.name)
        if (!metadata) continue

        themes.push({
          ...metadata,
          active: folder.name === activeTheme
        })
      }

      res.json(themes)
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /themes/{slug}:
   *   get:
   *     tags:
   *       - Themes
   *     summary: Get single theme
   *     description: Retrieves detailed information about a specific theme
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Theme slug
   *         example: modern-theme
   *     responses:
   *       200:
   *         description: Theme details
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
   *         description: Theme not found
   */
  router.get('/:slug', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_theme'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const metadata = await getThemeMetadata(slug)

      if (!metadata) {
        return res.status(404).json({ error: 'Theme not found' })
      }

      const activeTheme = await getActiveTheme()

      res.json({
        ...metadata,
        active: slug === activeTheme
      })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /themes/{slug}/activate:
   *   post:
   *     tags:
   *       - Themes
   *     summary: Activate theme
   *     description: Activates a theme, making it the active theme for the site
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Theme slug to activate
   *         example: modern-theme
   *     responses:
   *       200:
   *         description: Theme activated successfully
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
   *                   example: Theme activated
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks activate_themes capability
   *       404:
   *         description: Theme not found
   */
  router.post('/:slug/activate', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['update', 'activate_themes'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const themeFolder = path.join(THEMES_BASE, slug)

      if (!fs.existsSync(themeFolder)) {
        return res.status(404).json({ error: 'Theme not found' })
      }

      await updateActiveTheme(slug)

      res.json({ success: true, message: 'Theme activated' })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /themes/deactivate:
   *   post:
   *     tags:
   *       - Themes
   *     summary: Deactivate current theme
   *     description: Deactivates the currently active theme by setting it to empty
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Theme deactivated successfully
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
   *                   example: Theme deactivated
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks activate_themes capability
   */
  router.post('/deactivate', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['update', 'activate_themes'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      // Set theme to empty/null to deactivate
      await updateActiveTheme('')

      res.json({ success: true, message: 'Theme deactivated' })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /themes/{slug}:
   *   delete:
   *     tags:
   *       - Themes
   *     summary: Delete theme
   *     description: Permanently deletes a theme. Cannot delete the currently active theme.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Theme slug to delete
   *         example: old-theme
   *     responses:
   *       200:
   *         description: Theme deleted successfully
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
   *                   example: Theme deleted
   *       400:
   *         description: Cannot delete active theme
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks delete_themes capability
   *       404:
   *         description: Theme not found
   */
  router.delete('/:slug', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['delete', 'delete_themes'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const themeFolder = path.join(THEMES_BASE, slug)

      if (!fs.existsSync(themeFolder)) {
        return res.status(404).json({ error: 'Theme not found' })
      }

      // Check if theme is active
      const activeTheme = await getActiveTheme()
      if (slug === activeTheme) {
        return res.status(400).json({ error: 'Cannot delete active theme' })
      }

      // Delete folder
      await fs.promises.rm(themeFolder, { recursive: true, force: true })

      res.json({ success: true, message: 'Theme deleted' })
    } catch (err) {
      next(err)
    }
  })

  /**
   * @openapi
   * /themes/upload:
   *   post:
   *     tags:
   *       - Themes
   *     summary: Upload and install theme
   *     description: Uploads a theme ZIP file and installs it. The ZIP must contain an index.mjs file in the root folder.
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
   *                 description: Theme ZIP file
   *     responses:
   *       200:
   *         description: Theme uploaded successfully
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
   *                   example: Theme uploaded successfully
   *                 theme:
   *                   type: object
   *                   properties:
   *                     slug:
   *                       type: string
   *                     name:
   *                       type: string
   *                     version:
   *                       type: string
   *       400:
   *         description: Invalid theme structure or no file uploaded
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks upload_themes capability
   *       409:
   *         description: Theme already exists
   */
  router.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['create', 'upload_themes'], userId: req?.user?.id })
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
      let themeSlug = null

      for (const entry of zipEntries) {
        if (entry.entryName.endsWith('/index.mjs')) {
          const parts = entry.entryName.split('/')
          rootFolder = parts[0]
          themeSlug = rootFolder
          break
        }
      }

      if (!rootFolder || !themeSlug) {
        await fs.promises.unlink(zipPath)
        return res.status(400).json({ error: 'Invalid theme structure. Must contain index.mjs in root folder.' })
      }

      // Extract to themes directory
      const targetPath = path.join(THEMES_BASE, themeSlug)

      // Check if already exists
      if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(zipPath)
        return res.status(409).json({ error: 'Theme already exists' })
      }

      // Validate all zip entries to prevent path traversal (Zip Slip)
      const resolvedBase = path.resolve(THEMES_BASE)
      for (const entry of zipEntries) {
        const entryPath = path.normalize(entry.entryName)
        const fullPath = path.resolve(THEMES_BASE, entryPath)

        // Ensure path stays within THEMES_BASE
        if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
          await fs.promises.unlink(zipPath)
          return res.status(400).json({ error: 'Invalid zip file: path traversal detected' })
        }
      }

      // Extract
      zip.extractAllTo(THEMES_BASE, true)

      // Clean up temp file
      await fs.promises.unlink(zipPath)

      // Get metadata
      const metadata = await getThemeMetadata(themeSlug)

      res.json({
        success: true,
        message: 'Theme uploaded successfully',
        theme: metadata
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
   * /themes/search/npm:
   *   get:
   *     tags:
   *       - Themes
   *     summary: Search NPM registry for themes
   *     description: Searches the NPM registry for packages tagged with 'hd-theme' keyword
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *         description: Search query
   *         example: modern
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
      const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_theme'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { q = '', size = 20, from = 0 } = req.query

      // Search NPM registry for packages with 'hd-theme' keyword
      const baseKeyword = 'keywords:hd-theme'
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
          if (!pkg.keywords || !pkg.keywords.includes('hd-theme')) return false

          if (!q) return true // when no search term, just show hd-theme packages

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
   * /themes/{slug}/versions:
   *   get:
   *     tags:
   *       - Themes
   *     summary: Get all available NPM versions
   *     description: Retrieves all available versions of a theme from NPM registry, including current and available versions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Theme slug
   *         example: modern-theme
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
   *         description: Theme does not have package.json or missing name field
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Theme not found or package not found on NPM
   */
  router.get('/:slug/versions', async (req, res, next) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_theme'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const themeFolder = path.join(THEMES_BASE, slug)

      if (!fs.existsSync(themeFolder)) {
        return res.status(404).json({ error: 'Theme not found' })
      }

      // Read package.json to get npm package name
      const packageJsonPath = path.join(themeFolder, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        return res.status(400).json({ error: 'Theme does not have package.json' })
      }

      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
      const packageName = packageJson.name
      const currentVersion = packageJson.version

      if (!packageName) {
        return res.status(400).json({ error: 'Theme package.json is missing name field' })
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
   * /themes/{slug}/change-version:
   *   post:
   *     tags:
   *       - Themes
   *     summary: Change theme version
   *     description: Changes a theme to a specific NPM version. The theme will be replaced with the specified version.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Theme slug
   *         example: modern-theme
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
   *         description: Theme version changed successfully
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
   *                   example: Theme version changed successfully
   *                 theme:
   *                   type: object
   *                 previousVersion:
   *                   type: string
   *                   example: 1.0.0
   *                 newVersion:
   *                   type: string
   *                   example: 1.2.0
   *       400:
   *         description: Version is required, already on this version, or invalid theme structure
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks upload_themes capability
   *       404:
   *         description: Theme not found
   *       500:
   *         description: Version change failed
   */
  router.post('/:slug/change-version', async (req, res) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['update', 'upload_themes'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { slug } = req.params
      const { version } = req.body
      const themeFolder = path.join(THEMES_BASE, slug)

      if (!version) {
        return res.status(400).json({ error: 'Version is required' })
      }

      if (!fs.existsSync(themeFolder)) {
        return res.status(404).json({ error: 'Theme not found' })
      }

      // Read package.json to get npm package name
      const packageJsonPath = path.join(themeFolder, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        return res.status(400).json({ error: 'Theme does not have package.json - cannot change version' })
      }

      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
      const packageName = packageJson.name
      const currentVersion = packageJson.version

      if (!packageName) {
        return res.status(400).json({ error: 'Theme package.json is missing name field' })
      }

      if (version === currentVersion) {
        return res.status(400).json({ error: 'Already on this version' })
      }

      // Check if theme is active
      const activeTheme = await getActiveTheme()
      const wasActive = slug === activeTheme

      const tempDir = path.join(THEMES_BASE, '.temp-update')

      // Create temp directory
      await fs.promises.mkdir(tempDir, { recursive: true })

      try {
        // Install specific version to temp directory using safe method
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
          return res.status(400).json({ error: 'Invalid theme structure: missing index.mjs' })
        }

        // Remove old theme folder
        await fs.promises.rm(themeFolder, { recursive: true, force: true })

        // Move new version to themes directory
        await fs.promises.rename(nodeModulesPath, themeFolder)

        // Clean up temp directory
        await fs.promises.rm(tempDir, { recursive: true, force: true })

        // Reactivate if it was active
        if (wasActive) {
          await updateActiveTheme(slug)
        }

        // Get updated metadata
        const metadata = await getThemeMetadata(slug)

        res.json({
          success: true,
          message: 'Theme version changed successfully',
          theme: metadata,
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
   * /themes/install/npm:
   *   post:
   *     tags:
   *       - Themes
   *     summary: Install theme from NPM
   *     description: Installs a theme directly from NPM registry by package name
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
   *                 example: "@myorg/modern-theme"
   *               version:
   *                 type: string
   *                 description: Specific version to install (optional, defaults to latest)
   *                 example: 1.0.0
   *     responses:
   *       200:
   *         description: Theme installed successfully
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
   *                   example: Theme installed successfully
   *                 theme:
   *                   type: object
   *                   properties:
   *                     slug:
   *                       type: string
   *                     name:
   *                       type: string
   *                     version:
   *                       type: string
   *       400:
   *         description: Package name is required or invalid theme structure
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks upload_themes capability
   *       409:
   *         description: Theme already exists
   *       500:
   *         description: Installation failed
   */
  router.post('/install/npm', async (req, res) => {
    try {
      const hasAccess = await req.guard.user({ canOneOf: ['create', 'upload_themes'], userId: req?.user?.id })
      if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

      const { packageName, version } = req.body

      if (!packageName) {
        return res.status(400).json({ error: 'Package name is required' })
      }

      const tempDir = path.join(THEMES_BASE, '.temp-install')

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
          return res.status(400).json({ error: 'Invalid theme structure: missing index.mjs' })
        }

        // Read package.json for theme slug
        const packageJsonPath = path.join(nodeModulesPath, 'package.json')
        const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
        const themeSlug = packageJson.name.replace(/^@.*?\//, '').replace(/[^a-z0-9-]/gi, '-')

        // Move to themes directory
        const targetPath = path.join(THEMES_BASE, themeSlug)

        if (fs.existsSync(targetPath)) {
          await fs.promises.rm(tempDir, { recursive: true, force: true })
          return res.status(409).json({ error: 'Theme already exists' })
        }

        await fs.promises.rename(nodeModulesPath, targetPath)

        // Clean up temp directory
        await fs.promises.rm(tempDir, { recursive: true, force: true })

        // Get metadata
        const metadata = await getThemeMetadata(themeSlug)

        res.json({
          success: true,
          message: 'Theme installed successfully',
          theme: metadata
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
