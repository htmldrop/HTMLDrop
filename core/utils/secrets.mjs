import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

/**
 * Generate a random secret
 * @returns {string} A random 64-character hex string
 */
const generateSecret = () => crypto.randomBytes(32).toString('hex')

/**
 * Initialize secrets for the application
 * Generates and persists secrets to .env file if they don't exist
 * Should only be called from the primary cluster process
 */
export const initSecrets = () => {
  // Use ENV_FILE_PATH if set (for Docker with persistent volume), otherwise use .env in current directory
  const envPath = process.env.ENV_FILE_PATH ? path.resolve(process.env.ENV_FILE_PATH) : path.resolve('.env')

  // Ensure directory exists for custom path
  if (process.env.ENV_FILE_PATH) {
    const dir = path.dirname(envPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  let envContent = ''
  let modified = false

  // Read existing .env file if it exists
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8')
  }

  const secrets = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    SESSION_SECRET: process.env.SESSION_SECRET
  }

  // Generate missing secrets
  for (const [key, value] of Object.entries(secrets)) {
    if (!value || value.trim() === '') {
      const newSecret = generateSecret()
      process.env[key] = newSecret
      secrets[key] = newSecret
      modified = true

      // Add or update in .env content
      const regex = new RegExp(`^${key}=.*$`, 'm')
      if (envContent.match(regex)) {
        envContent = envContent.replace(regex, `${key}=${newSecret}`)
      } else {
        envContent += `${envContent && !envContent.endsWith('\n') ? '\n' : ''}${key}=${newSecret}\n`
      }

      console.log(`✅ Generated ${key}`)
    }
  }

  // Write back to .env file if modified
  if (modified) {
    fs.writeFileSync(envPath, envContent)
    console.log(`✅ Secrets saved to ${envPath}`)

    // Reload the .env file to load the newly generated secrets into process.env
    dotenv.config({ path: envPath, override: true })
    console.log('✅ Secrets loaded into environment')

    if (process.env.ENV_FILE_PATH) {
      console.log('✅ Using persistent volume for secrets (Docker mode)')
    }
  }
}

/**
 * Ensure secrets are available in worker processes
 * Workers inherit environment from primary, but we validate they exist
 */
export const ensureSecrets = () => {
  // Workers inherit environment variables from primary process
  // Just validate that secrets are present
  const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET']

  for (const secret of requiredSecrets) {
    if (!process.env[secret] || process.env[secret].trim() === '') {
      console.error(`❌ ${secret} is not set in worker process`)
      throw new Error(
        `${secret} is not available in worker process. This indicates the primary process failed to initialize secrets.`
      )
    }
  }
}
