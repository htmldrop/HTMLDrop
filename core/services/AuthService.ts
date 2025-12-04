/**
 * Auth Service
 *
 * Business logic for authentication and authorization
 */

import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import crypto from 'crypto'
import type { Knex } from 'knex'
import { TOKEN_EXPIRY } from '../utils/constants.ts'

interface User {
  id: number
  email: string
  username: string
}

interface TokenPayload {
  id: number
  email?: string
  username?: string
  type?: string
  iat?: number
  exp?: number
}

interface RefreshTokenRecord {
  id: number
  user_id: number
  token: string
  expires_at: Date
}

interface ResetTokenData {
  token: string
  expires_at: string
}

class AuthService {
  private context: HTMLDrop.Context
  private knex: Knex
  private table: (name: string) => string
  private jwtSecret: string
  private refreshSecret: string

  constructor(context: HTMLDrop.Context) {
    this.context = context
    if (!context.knex) {
      throw new Error('AuthService requires a database connection')
    }
    this.knex = context.knex
    this.table = context.table.bind(context)
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key'
    this.refreshSecret = process.env.REFRESH_SECRET || 'your-refresh-secret'
  }

  /**
   * Generate access token
   */
  generateAccessToken(user: User): string {
    return jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      this.jwtSecret,
      { expiresIn: TOKEN_EXPIRY.ACCESS_TOKEN } as SignOptions
    )
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(user: User): string {
    return jwt.sign(
      { id: user.id, type: 'refresh' },
      this.refreshSecret,
      { expiresIn: TOKEN_EXPIRY.REFRESH_TOKEN } as SignOptions
    )
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as TokenPayload
    } catch {
      return null
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, this.refreshSecret) as TokenPayload
    } catch {
      return null
    }
  }

  /**
   * Store refresh token in database
   */
  async storeRefreshToken(userId: number, token: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await this.knex(this.table('refresh_tokens')).insert({
      user_id: userId,
      token,
      expires_at: expiresAt
    })
  }

  /**
   * Validate refresh token from database
   */
  async validateRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
    const record = await this.knex(this.table('refresh_tokens'))
      .where({ token })
      .where('expires_at', '>', new Date())
      .first()

    return record || null
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(token: string): Promise<void> {
    await this.knex(this.table('refresh_tokens')).where({ token }).del()
  }

  /**
   * Revoke all user tokens
   */
  async revokeAllUserTokens(userId: number): Promise<void> {
    await this.knex(this.table('refresh_tokens')).where({ user_id: userId }).del()
  }

  /**
   * Add token to revoked list
   */
  async revokeAccessToken(token: string, expiresAt: Date): Promise<void> {
    await this.knex(this.table('revoked_tokens')).insert({
      token,
      expires_at: expiresAt
    })
  }

  /**
   * Check if access token is revoked
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    const record = await this.knex(this.table('revoked_tokens')).where({ token }).first()

    return !!record
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date()

    await this.knex(this.table('refresh_tokens')).where('expires_at', '<', now).del()

    await this.knex(this.table('revoked_tokens')).where('expires_at', '<', now).del()
  }

  /**
   * Generate CSRF token
   */
  generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(token: string, sessionToken: string): boolean {
    return token === sessionToken
  }

  /**
   * Generate password reset token
   */
  async generatePasswordResetToken(userId: number): Promise<string> {
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
   */
  async validatePasswordResetToken(userId: number, token: string): Promise<boolean> {
    const meta = await this.knex(this.table('usermeta'))
      .where({ user_id: userId, meta_key: 'password_reset_token' })
      .first()

    if (!meta) return false

    try {
      const { token: storedToken, expires_at } = JSON.parse(meta.meta_value) as ResetTokenData

      if (storedToken !== token) return false
      if (new Date(expires_at) < new Date()) return false

      return true
    } catch {
      return false
    }
  }

  /**
   * Clear password reset token
   */
  async clearPasswordResetToken(userId: number): Promise<void> {
    await this.knex(this.table('usermeta')).where({ user_id: userId, meta_key: 'password_reset_token' }).del()
  }
}

export default AuthService
