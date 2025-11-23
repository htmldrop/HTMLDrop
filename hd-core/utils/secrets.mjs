import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

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
  const envPath = path.resolve('.env')
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
    console.log('✅ Secrets saved to .env file')
    console.log('⚠️  NOTE: Secrets will persist across restarts. Workers will inherit these from primary process.')
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
