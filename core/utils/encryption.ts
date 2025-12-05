import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Get encryption key from environment or generate one
 * Uses JWT_SECRET as the base and derives a proper 32-byte key
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'default-secret-key-change-me'
  // Derive a 32-byte key using SHA-256
  return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encrypt a string value
 * Returns base64 encoded string containing IV + ciphertext + auth tag
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Combine IV + encrypted data + auth tag, encode as base64
  const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex'), authTag])
  return combined.toString('base64')
}

/**
 * Decrypt a string value
 * Expects base64 encoded string containing IV + ciphertext + auth tag
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey()

  // Decode from base64
  const combined = Buffer.from(encryptedText, 'base64')

  // Extract IV, encrypted data, and auth tag
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Check if a value is encrypted (basic check)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  // Encrypted values are base64 and should be at least IV + auth tag length
  try {
    const decoded = Buffer.from(value, 'base64')
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH
  } catch {
    return false
  }
}

/**
 * Mask an API key for display (show first 4 and last 4 chars)
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 12) return '••••••••'
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`
}
