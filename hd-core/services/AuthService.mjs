/**
 * Auth Service
 *
 * Business logic for authentication and authorization
 */

import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { TOKEN_EXPIRY } from '../utils/constants.mjs'

class AuthService {
  constructor(context) {
    this.context = context
    this.knex = context.knex
    this.table = context.table.bind(context)
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key'
    this.refreshSecret = process.env.REFRESH_SECRET || 'your-refresh-secret'
  }

  /**
   * Generate access token
   * @param {Object} user - User object
   * @returns {string} JWT access token
   */
  generateAccessToken(user) {
    return jwt.sign({ id: user.id, email: user.email, username: user.username }, this.jwtSecret, {
      expiresIn: TOKEN_EXPIRY.ACCESS_TOKEN
    })
  }

  /**
   * Generate refresh token
   * @param {Object} user - User object
   * @returns {string} JWT refresh token
   */
  generateRefreshToken(user) {
    return jwt.sign({ id: user.id, type: 'refresh' }, this.refreshSecret, {
      expiresIn: TOKEN_EXPIRY.REFRESH_TOKEN
    })
  }

  /**
   * Verify access token
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded token or null
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret)
    } catch (error) {
      return null
    }
  }

  /**
   * Verify refresh token
   * @param {string} token - Refresh token
   * @returns {Object|null} Decoded token or null
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.refreshSecret)
    } catch (error) {
      return null
    }
  }

  /**
   * Store refresh token in database
   * @param {number} userId - User ID
   * @param {string} token - Refresh token
   * @returns {Promise<void>}
   */
  async storeRefreshToken(userId, token) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await this.knex(this.table('refresh_tokens')).insert({
      user_id: userId,
      token,
      expires_at: expiresAt
    })
  }

  /**
   * Validate refresh token from database
   * @param {string} token - Refresh token
   * @returns {Promise<Object|null>} Token record or null
   */
  async validateRefreshToken(token) {
    const record = await this.knex(this.table('refresh_tokens'))
      .where({ token })
      .where('expires_at', '>', new Date())
      .first()

    return record || null
  }

  /**
   * Revoke refresh token
   * @param {string} token - Refresh token
   * @returns {Promise<void>}
   */
  async revokeRefreshToken(token) {
    await this.knex(this.table('refresh_tokens')).where({ token }).del()
  }

  /**
   * Revoke all user tokens
   * @param {number} userId - User ID
   * @returns {Promise<void>}
   */
  async revokeAllUserTokens(userId) {
    await this.knex(this.table('refresh_tokens')).where({ user_id: userId }).del()
  }

  /**
   * Add token to revoked list
   * @param {string} token - Access token to revoke
   * @param {Date} expiresAt - Token expiration date
   * @returns {Promise<void>}
   */
  async revokeAccessToken(token, expiresAt) {
    await this.knex(this.table('revoked_tokens')).insert({
      token,
      expires_at: expiresAt
    })
  }

  /**
   * Check if access token is revoked
   * @param {string} token - Access token
   * @returns {Promise<boolean>} True if revoked
   */
  async isTokenRevoked(token) {
    const record = await this.knex(this.table('revoked_tokens')).where({ token }).first()

    return !!record
  }

  /**
   * Clean up expired tokens
   * @returns {Promise<void>}
   */
  async cleanupExpiredTokens() {
    const now = new Date()

    await this.knex(this.table('refresh_tokens')).where('expires_at', '<', now).del()

    await this.knex(this.table('revoked_tokens')).where('expires_at', '<', now).del()
  }

  /**
   * Generate CSRF token
   * @returns {string} CSRF token
   */
  generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Validate CSRF token
   * @param {string} token - CSRF token
   * @param {string} sessionToken - Session CSRF token
   * @returns {boolean} True if valid
   */
  validateCSRFToken(token, sessionToken) {
    return token === sessionToken
  }

  /**
   * Generate password reset token
   * @param {number} userId - User ID
   * @returns {Promise<string>} Reset token
   */
  async generatePasswordResetToken(userId) {
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await this.knex(this.table('usermeta')).insert({
      user_id: userId,
      meta_key: 'password_reset_token',
      meta_value: JSON.stringify({ token, expires_at: expiresAt })
    })

    return token
  }

  /**
   * Validate password reset token
   * @param {number} userId - User ID
   * @param {string} token - Reset token
   * @returns {Promise<boolean>} True if valid
   */
  async validatePasswordResetToken(userId, token) {
    const meta = await this.knex(this.table('usermeta'))
      .where({ user_id: userId, meta_key: 'password_reset_token' })
      .first()

    if (!meta) return false

    try {
      const { token: storedToken, expires_at } = JSON.parse(meta.meta_value)

      if (storedToken !== token) return false
      if (new Date(expires_at) < new Date()) return false

      return true
    } catch {
      return false
    }
  }

  /**
   * Clear password reset token
   * @param {number} userId - User ID
   * @returns {Promise<void>}
   */
  async clearPasswordResetToken(userId) {
    await this.knex(this.table('usermeta')).where({ user_id: userId, meta_key: 'password_reset_token' }).del()
  }
}

export default AuthService
