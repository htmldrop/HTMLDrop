import crypto from 'crypto'
import bcrypt from 'bcrypt'

interface User {
  id: number
  username: string
  email: string
  reset_token?: string
  reset_token_expires_at?: string
}

export default class PasswordResetService {
  private context: HTMLDrop.Context
  private tokenExpiryMinutes: number

  constructor(context: HTMLDrop.Context) {
    if (!context.knex) {
      throw new Error('PasswordResetService requires a database connection')
    }
    this.context = context
    this.tokenExpiryMinutes = 60 // 1 hour
  }

  /**
   * Generate a secure random token
   */
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Create a password reset token for a user
   */
  async createResetToken(email: string): Promise<{
    user: { id: number; username: string; email: string }
    token: string
    expiresAt: Date
  }> {
    const { knex, table } = this.context
    if (!knex) {
      throw new Error('Database not available')
    }

    // Find user by email
    const user = await knex(table('users')).where('email', email).whereNull('deleted_at').first() as User | undefined

    if (!user) {
      // Don't reveal if user exists or not for security
      throw new Error('If this email exists in our system, a password reset link will be sent.')
    }

    // Generate token
    const token = this.generateToken()
    const hashedToken = await bcrypt.hash(token, 10)

    // Calculate expiry time
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + this.tokenExpiryMinutes)

    // Store hashed token in database
    await knex(table('users'))
      .where('id', user.id)
      .update({
        reset_token: hashedToken,
        reset_token_expires_at: this.context.formatDate(expiresAt),
        updated_at: this.context.formatDate()
      })

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token, // Return unhashed token to send via email
      expiresAt
    }
  }

  /**
   * Validate a password reset token
   */
  async validateResetToken(token: string): Promise<User> {
    const { knex, table } = this.context
    if (!knex) {
      throw new Error('Database not available')
    }

    if (!token) {
      throw new Error('Invalid or expired reset token')
    }

    // Get all users with reset tokens (we'll check expiry after bcrypt compare)
    const users = await knex(table('users'))
      .whereNotNull('reset_token')
      .whereNull('deleted_at') as User[]

    // Check each user's hashed token
    for (const user of users) {
      if (!user.reset_token) continue

      const isValid = await bcrypt.compare(token, user.reset_token)
      if (isValid) {
        // Check if token has expired (handle both ISO and formatted dates)
        // The stored date might be in format "YYYY-MM-DD HH:MM:SS.mmm" (no timezone)
        // or ISO format with Z. We need to parse it correctly.
        let expiresAt: Date
        const storedDate = user.reset_token_expires_at

        if (!storedDate) {
          throw new Error('Invalid or expired reset token')
        }

        if (typeof storedDate === 'string' && !storedDate.includes('T') && !storedDate.includes('Z')) {
          // Format is "YYYY-MM-DD HH:MM:SS.mmm" - add 'Z' to parse as UTC
          expiresAt = new Date(`${storedDate.replace(' ', 'T')}Z`)
        } else {
          // ISO format or already has timezone info
          expiresAt = new Date(storedDate)
        }

        const now = new Date()

        //  Check if date parsing failed
        if (isNaN(expiresAt.getTime())) {
          throw new Error('Invalid or expired reset token')
        }

        if (expiresAt < now) {
          throw new Error('Invalid or expired reset token')
        }

        return user
      }
    }

    throw new Error('Invalid or expired reset token')
  }

  /**
   * Reset user password using token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const { knex, table } = this.context
    if (!knex) {
      throw new Error('Database not available')
    }

    // Validate token
    const user = await this.validateResetToken(token)

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update password and clear reset token
    await knex(table('users'))
      .where('id', user.id)
      .update({
        password: hashedPassword,
        reset_token: null,
        reset_token_expires_at: null,
        updated_at: this.context.formatDate()
      })

    return {
      success: true,
      message: 'Password has been reset successfully'
    }
  }

  /**
   * Clear expired reset tokens (cleanup task)
   */
  async clearExpiredTokens(): Promise<number> {
    const { knex, table } = this.context
    if (!knex) {
      throw new Error('Database not available')
    }

    // Get all users with reset tokens
    const users = await knex(table('users')).whereNotNull('reset_token') as User[]

    const now = new Date()
    let clearedCount = 0

    // Check each user's expiry and clear if expired
    for (const user of users) {
      // Parse date correctly (handle both ISO and formatted dates)
      let expiresAt: Date
      const storedDate = user.reset_token_expires_at

      if (!storedDate) continue

      if (typeof storedDate === 'string' && !storedDate.includes('T') && !storedDate.includes('Z')) {
        // Format is "YYYY-MM-DD HH:MM:SS.mmm" - add 'Z' to parse as UTC
        expiresAt = new Date(`${storedDate.replace(' ', 'T')}Z`)
      } else {
        // ISO format or already has timezone info
        expiresAt = new Date(storedDate)
      }

      // Skip if date parsing failed
      if (isNaN(expiresAt.getTime())) {
        continue
      }

      // Clear if expired
      if (expiresAt < now) {
        await knex(table('users'))
          .where('id', user.id)
          .update({
            reset_token: null,
            reset_token_expires_at: null,
            updated_at: this.context.formatDate()
          })
        clearedCount++
      }
    }

    return clearedCount
  }
}
