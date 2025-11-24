/**
 * Update Service
 *
 * Handles CMS version checking and updates via isomorphic-git
 */

import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import fs from 'fs'
import path from 'path'
import semver from 'semver'

// Static cache for update checks (shared across all instances)
const updateCache = {
  data: null,
  timestamp: null,
  ttl: 5 * 60 * 1000 // 5 minutes in milliseconds
}

class UpdateService {
  constructor(context) {
    this.context = context
    this.REPO_DIR = path.resolve('.')
    this.GITHUB_API = 'https://api.github.com'
  }

  /**
   * Get GitHub token from options table or environment
   * @returns {string|null} GitHub token
   */
  getGitHubToken() {
    // Priority 1: Check options table (database)
    if (this.context.options?.github_token) {
      return this.context.options.github_token
    }

    // Priority 2: Check environment variable
    if (process.env.GITHUB_TOKEN) {
      return process.env.GITHUB_TOKEN
    }

    return null
  }

  /**
   * Get GitHub API headers with optional authentication
   * @returns {Object} Headers object
   */
  getGitHubHeaders() {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'HTMLDrop-CMS'
    }

    // Add GitHub token if available (increases rate limit from 60 to 5000/hour)
    const token = this.getGitHubToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return headers
  }

  /**
   * Get current local version from package.json
   * @returns {Promise<string>} Current version
   */
  async getCurrentVersion() {
    try {
      const packageJsonPath = path.join(this.REPO_DIR, 'package.json')
      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))
      return packageJson.version || '0.0.0'
    } catch (error) {
      console.error('Failed to read current version:', error)
      return '0.0.0'
    }
  }

  /**
   * Get repository information from package.json
   * @returns {Promise<Object>} Repository info {owner, repo}
   */
  async getRepositoryInfo() {
    try {
      const packageJsonPath = path.join(this.REPO_DIR, 'package.json')
      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'))

      if (!packageJson.repository || !packageJson.repository.url) {
        throw new Error('No repository URL found in package.json')
      }

      // Parse GitHub URL: https://github.com/owner/repo.git
      const url = packageJson.repository.url
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/)

      if (!match) {
        throw new Error('Invalid GitHub repository URL')
      }

      return {
        owner: match[1],
        repo: match[2]
      }
    } catch (error) {
      console.error('Failed to get repository info:', error)
      throw error
    }
  }

  /**
   * Get latest version from GitHub releases
   * @returns {Promise<Object>} Latest release info {version, url, publishedAt}
   */
  async getLatestVersion() {
    try {
      const { owner, repo } = await this.getRepositoryInfo()
      const url = `${this.GITHUB_API}/repos/${owner}/${repo}/releases/latest`

      const response = await fetch(url, {
        headers: this.getGitHubHeaders()
      })

      if (!response.ok) {
        // If no releases, try to get latest commit
        return await this.getLatestCommit()
      }

      const release = await response.json()

      return {
        version: release.tag_name.replace(/^v/, ''),
        url: release.html_url,
        publishedAt: release.published_at,
        description: release.body || ''
      }
    } catch (error) {
      console.error('Failed to get latest version:', error.message)
      // Fallback to commit check
      return await this.getLatestCommit()
    }
  }

  /**
   * Get latest commit from GitHub (fallback when no releases)
   * @returns {Promise<Object>} Latest commit info
   */
  async getLatestCommit() {
    try {
      const { owner, repo } = await this.getRepositoryInfo()
      const url = `${this.GITHUB_API}/repos/${owner}/${repo}/commits/main`

      const response = await fetch(url, {
        headers: this.getGitHubHeaders()
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Repository ${owner}/${repo} not found on GitHub. Please check the repository URL in package.json.`)
        }
        const errorText = await response.text()
        throw new Error(`GitHub API returned ${response.status}: ${errorText}`)
      }

      const commit = await response.json()

      return {
        version: 'latest',
        sha: commit.sha,
        url: commit.html_url,
        publishedAt: commit.commit.author.date,
        description: commit.commit.message
      }
    } catch (error) {
      console.error('Failed to get latest commit:', error.message)
      throw error
    }
  }

  /**
   * Check if an update is available
   * @returns {Promise<Object>} Update status {available, current, latest, info}
   */
  async checkForUpdates() {
    // Check if we have cached data that's still valid
    const now = Date.now()
    if (updateCache.data && updateCache.timestamp && (now - updateCache.timestamp) < updateCache.ttl) {
      return updateCache.data
    }

    try {
      const currentVersion = await this.getCurrentVersion()
      const latestInfo = await this.getLatestVersion()

      let available = false

      if (latestInfo.version === 'latest') {
        // Compare commit SHA
        const localCommit = await this.getLocalCommitSHA()
        available = localCommit !== latestInfo.sha
      } else {
        // Compare semantic versions
        available = semver.gt(latestInfo.version, currentVersion)
      }

      const result = {
        available,
        current: currentVersion,
        latest: latestInfo.version,
        info: latestInfo
      }

      // Cache the result
      updateCache.data = result
      updateCache.timestamp = now

      return result
    } catch (error) {
      console.error('Failed to check for updates:', error.message)
      try {
        const result = {
          available: false,
          current: await this.getCurrentVersion(),
          latest: 'unknown',
          error: error.message
        }

        // Cache the error result too (but for a shorter time)
        updateCache.data = result
        updateCache.timestamp = now

        return result
      } catch (versionError) {
        const result = {
          available: false,
          current: '0.0.0',
          latest: 'unknown',
          error: error.message
        }

        // Cache the error result
        updateCache.data = result
        updateCache.timestamp = now

        return result
      }
    }
  }

  /**
   * Get local commit SHA
   * @returns {Promise<string>} Local commit SHA
   */
  async getLocalCommitSHA() {
    try {
      const commits = await git.log({
        fs,
        dir: this.REPO_DIR,
        depth: 1
      })
      return commits[0]?.oid || 'unknown'
    } catch (error) {
      console.error('Failed to get local commit SHA:', error)
      return 'unknown'
    }
  }

  /**
   * Pull latest changes from GitHub with job tracking
   * @param {Object} options - Pull options
   * @returns {Promise<Object>} Pull result
   */
  async pullUpdate(options = {}) {
    const { branch = 'main' } = options

    // Create a job for tracking
    const jobs = this.context.registries?.jobs
    if (!jobs) {
      throw new Error('Jobs registry not available')
    }

    const job = await jobs.createJob({
      name: 'Updating CMS',
      description: `Pulling latest changes from GitHub (branch: ${branch})`,
      type: 'cms_update',
      iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#181717" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
      metadata: {
        branch,
        type: 'cms_update'
      },
      source: 'system',
      showNotification: true
    })

    try {
      await job.start()
      await job.updateProgress(10, { status: 'Checking repository status...' })

      // Check if git repository exists
      try {
        await git.status({ fs, dir: this.REPO_DIR, filepath: 'package.json' })
      } catch (error) {
        throw new Error('Not a git repository. Please clone from GitHub to enable updates.')
      }

      await job.updateProgress(20, { status: 'Fetching latest changes...' })

      // Fetch from remote
      const { owner, repo } = await this.getRepositoryInfo()
      const remoteUrl = `https://github.com/${owner}/${repo}.git`

      await git.fetch({
        fs,
        http,
        dir: this.REPO_DIR,
        url: remoteUrl,
        ref: branch,
        singleBranch: true,
        depth: 1,
        onProgress: (progress) => {
          const percentage = Math.floor((progress.loaded / progress.total) * 30) + 20
          job.updateProgress(percentage, { status: `Fetching: ${progress.phase}...` }).catch(() => {})
        }
      })

      await job.updateProgress(50, { status: 'Checking for conflicts...' })

      // Check for local changes
      const status = await git.statusMatrix({ fs, dir: this.REPO_DIR })
      const hasChanges = status.some(([, head, workdir, stage]) =>
        head !== workdir || head !== stage
      )

      if (hasChanges) {
        throw new Error('Local changes detected. Please commit or stash your changes before updating.')
      }

      await job.updateProgress(60, { status: 'Merging changes...' })

      // Pull (merge)
      await git.merge({
        fs,
        dir: this.REPO_DIR,
        ours: branch,
        theirs: `origin/${branch}`,
        author: {
          name: 'HTMLDrop System',
          email: 'system@htmldrop.com'
        }
      })

      await job.updateProgress(70, { status: 'Installing dependencies...' })

      // Run npm install
      await this._runCommand('npm', ['install'], 'npm install failed')

      await job.updateProgress(85, { status: 'Running database migrations...' })

      // Run migrations
      await this._runCommand('npm', ['run', 'migrate'], 'Database migration failed')

      await job.updateProgress(95, { status: 'Running database seeds...' })

      // Run seeds
      await this._runCommand('npm', ['run', 'seed'], 'Database seeding failed')

      await job.updateProgress(100, { status: 'Update complete!' })

      const newVersion = await this.getCurrentVersion()

      await job.complete({
        success: true,
        message: `CMS updated successfully to version ${newVersion}`,
        version: newVersion
      })

      return {
        success: true,
        version: newVersion,
        message: 'Update completed successfully. Server will restart...'
      }
    } catch (error) {
      await job.fail(error.message)
      throw error
    }
  }

  /**
   * Run a command with promise wrapper
   * @private
   * @param {string} command - Command to run
   * @param {string[]} args - Command arguments
   * @param {string} errorMessage - Error message to throw on failure
   * @returns {Promise<void>}
   */
  async _runCommand(command, args, errorMessage) {
    const { spawn } = await import('child_process')

    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        cwd: this.REPO_DIR,
        env: { ...process.env },
        shell: true
      })

      let stdout = ''
      let stderr = ''

      process.stdout.on('data', (data) => {
        stdout += data.toString()
        console.log(data.toString())
      })

      process.stderr.on('data', (data) => {
        stderr += data.toString()
        console.error(data.toString())
      })

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`${errorMessage}: ${stderr || stdout}`))
        } else {
          resolve()
        }
      })

      process.on('error', (error) => {
        reject(new Error(`${errorMessage}: ${error.message}`))
      })
    })
  }

  /**
   * Restart the server
   * @returns {Promise<void>}
   */
  async restartServer() {
    console.log('Restarting server...')

    // Notify all workers to gracefully shutdown
    if (process.send) {
      process.send({ type: 'restart_server' })
    }

    // Give workers time to shutdown gracefully
    setTimeout(() => {
      process.exit(0)
    }, 2000)
  }
}

export default UpdateService
