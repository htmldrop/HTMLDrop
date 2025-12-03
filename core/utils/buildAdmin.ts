import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * Build the admin UI if it doesn't exist
 * @returns True if build was successful or already exists
 */
export async function buildAdminIfNeeded(force = false): Promise<boolean> {
  const adminDistPath = path.resolve('./core/admin/dist')
  const adminPath = path.resolve('./core/admin')

  console.log(`[BuildAdmin] Checking admin build (force: ${force})`)
  console.log(`[BuildAdmin] Admin path: ${adminPath}`)
  console.log(`[BuildAdmin] Dist path: ${adminDistPath}`)

  // Check if dist folder exists AND contains index.html (not just an empty folder)
  const indexHtmlPath = path.join(adminDistPath, 'index.html')
  const distExists = fs.existsSync(adminDistPath)
  const indexHtmlExists = fs.existsSync(indexHtmlPath)

  console.log(`[BuildAdmin] Dist exists: ${distExists}`)
  console.log(`[BuildAdmin] index.html exists: ${indexHtmlExists}`)

  if (!force && distExists && indexHtmlExists) {
    console.log('✓ Admin UI already built')
    return true
  }

  if (!force) {
    console.log('📦 Admin UI not found, building...')
  } else {
    console.log('📦 Admin UI updated, building...')
  }

  // Check if admin source exists
  if (!fs.existsSync(adminPath)) {
    console.warn('⚠️  Admin source directory not found, skipping build')
    return false
  }

  // Check if package.json exists
  const packageJsonPath = path.join(adminPath, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    console.warn('⚠️  Admin package.json not found, skipping build')
    return false
  }

  return new Promise((resolve) => {
    // Run npm install first if node_modules doesn't exist
    const needsInstall = true // !fs.existsSync(nodeModulesPath)

    const runBuild = (): void => {
      console.log('🔨 Building admin UI...')
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: adminPath,
        stdio: 'inherit',
        shell: true
      })

      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✓ Admin UI built successfully')
          resolve(true)
        } else {
          console.error(`✗ Admin UI build failed with code ${code}`)
          resolve(false)
        }
      })

      buildProcess.on('error', (err) => {
        console.error('✗ Failed to start admin build process:', err.message)
        resolve(false)
      })
    }

    if (needsInstall) {
      console.log('📥 Installing admin dependencies (including dev dependencies for build)...')
      const installProcess = spawn('npm', ['install', '--include=dev'], {
        cwd: adminPath,
        stdio: 'inherit',
        shell: true
      })

      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✓ Admin dependencies installed')
          runBuild()
        } else {
          console.error(`✗ Admin dependency installation failed with code ${code}`)
          resolve(false)
        }
      })

      installProcess.on('error', (err) => {
        console.error('✗ Failed to start admin install process:', err.message)
        resolve(false)
      })
    } else {
      runBuild()
    }
  })
}

export default buildAdminIfNeeded
