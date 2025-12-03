/**
 * Security Middleware
 *
 * Provides security headers and protection using Helmet.js
 */

import helmet from 'helmet'
import { Request, Response, NextFunction, RequestHandler } from 'express'

interface Session {
  id: string
}

interface RequestWithSession extends Request {
  session?: Session
  csrfToken?: () => string
}

interface ResponseWithLocals extends Response {
  locals: {
    csrfToken?: string
    [key: string]: unknown
  }
}

interface TokenData {
  token: string
  expiry: number
}

/**
 * Configure Helmet security middleware
 * @returns Express middleware
 */
export const securityHeaders: RequestHandler = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for Vue
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"], // Allow inline styles
      upgradeInsecureRequests: []
    }
  },

  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false
  },

  // X-Frame-Options
  frameguard: {
    action: 'sameorigin'
  },

  // Hide X-Powered-By
  hidePoweredBy: true,

  // Strict-Transport-Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },

  // IE No Open
  ieNoOpen: true,

  // X-Content-Type-Options
  noSniff: true,

  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none'
  },

  // Referrer-Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },

  // X-XSS-Protection
  xssFilter: true
})

/**
 * Custom security headers for specific needs
 */
export const customSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Additional custom headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Remove potentially sensitive headers
  res.removeHeader('X-Powered-By')
  res.removeHeader('Server')

  next()
}

/**
 * CSRF Protection Middleware
 * Simple token-based CSRF protection
 */
export class CSRFProtection {
  private tokens: Map<string, TokenData>
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    this.tokens = new Map()
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // Cleanup every minute
  }

  /**
   * Generate a CSRF token
   * @param sessionId - Session identifier
   * @returns CSRF token
   */
  generateToken(sessionId: string): string {
    const token = this.randomToken()
    const expiry = Date.now() + 60 * 60 * 1000 // 1 hour

    this.tokens.set(sessionId, { token, expiry })

    return token
  }

  /**
   * Validate a CSRF token
   * @param sessionId - Session identifier
   * @param token - Token to validate
   * @returns Whether token is valid
   */
  validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId)

    if (!stored) return false
    if (stored.expiry < Date.now()) {
      this.tokens.delete(sessionId)
      return false
    }

    return stored.token === token
  }

  /**
   * Generate a random token
   * @returns Random token
   */
  randomToken(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  }

  /**
   * Cleanup expired tokens
   */
  cleanup(): void {
    const now = Date.now()
    for (const [sessionId, data] of this.tokens.entries()) {
      if (data.expiry < now) {
        this.tokens.delete(sessionId)
      }
    }
  }

  /**
   * Express middleware to attach CSRF token to request
   */
  middleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      const reqWithSession = req as RequestWithSession
      const resWithLocals = res as ResponseWithLocals

      // Generate session ID if not exists
      if (!reqWithSession.session) {
        reqWithSession.session = {
          id: this.randomToken()
        }
      }

      // Generate and attach CSRF token
      const token = this.generateToken(reqWithSession.session.id)
      reqWithSession.csrfToken = () => token

      // Add token to response locals for templates
      resWithLocals.locals.csrfToken = token

      next()
    }
  }

  /**
   * Express middleware to validate CSRF token
   */
  validate(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      const reqWithSession = req as RequestWithSession

      // Skip for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next()
      }

      const sessionId = reqWithSession.session?.id
      const token = (req.headers['x-csrf-token'] as string) || (req.body?._csrf as string)

      if (!sessionId || !token || !this.validateToken(sessionId, token)) {
        return res.status(403).json({
          error: 'Invalid CSRF token',
          code: 'INVALID_CSRF_TOKEN'
        })
      }

      next()
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval)
  }
}

/**
 * Input Sanitization Helpers
 */
export const sanitization = {
  /**
   * Sanitize string input
   * @param input - Input to sanitize
   * @returns Sanitized input
   */
  sanitizeString(input: unknown): string {
    if (typeof input !== 'string') return ''

    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .slice(0, 10000) // Limit length
  },

  /**
   * Sanitize HTML input
   * @param html - HTML to sanitize
   * @returns Sanitized HTML
   */
  sanitizeHtml(html: unknown): string {
    if (typeof html !== 'string') return ''

    // Basic sanitization - in production, use a library like DOMPurify
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
  },

  /**
   * Sanitize email
   * @param email - Email to sanitize
   * @returns Sanitized email or null if invalid
   */
  sanitizeEmail(email: unknown): string | null {
    if (typeof email !== 'string') return null

    const sanitized = email.toLowerCase().trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    return emailRegex.test(sanitized) ? sanitized : null
  },

  /**
   * Sanitize URL
   * @param url - URL to sanitize
   * @returns Sanitized URL or null if invalid
   */
  sanitizeUrl(url: unknown): string | null {
    if (typeof url !== 'string') return null

    try {
      const parsed = new URL(url)
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null
      }
      return parsed.toString()
    } catch {
      return null
    }
  },

  /**
   * Sanitize filename
   * @param filename - Filename to sanitize
   * @returns Sanitized filename
   */
  sanitizeFilename(filename: unknown): string {
    if (typeof filename !== 'string') return 'unnamed'

    return filename
      .replace(/[^a-z0-9.-]/gi, '_') // Replace special chars
      .replace(/\.{2,}/g, '.') // Remove double dots
      .replace(/^\./, '') // Remove leading dot
      .slice(0, 255) // Limit length
  },

  /**
   * Sanitize slug
   * @param slug - Slug to sanitize
   * @returns Sanitized slug
   */
  sanitizeSlug(slug: unknown): string {
    if (typeof slug !== 'string') return ''

    return slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with dash
      .replace(/-+/g, '-') // Replace multiple dashes with single
      .replace(/^-|-$/g, '') // Remove leading/trailing dashes
      .slice(0, 200) // Limit length
  },

  /**
   * Sanitize integer
   * @param value - Value to sanitize
   * @param defaultValue - Default value if invalid
   * @returns Sanitized integer
   */
  sanitizeInt(value: unknown, defaultValue = 0): number {
    const parsed = parseInt(String(value), 10)
    return isNaN(parsed) ? defaultValue : parsed
  },

  /**
   * Sanitize float
   * @param value - Value to sanitize
   * @param defaultValue - Default value if invalid
   * @returns Sanitized float
   */
  sanitizeFloat(value: unknown, defaultValue = 0.0): number {
    const parsed = parseFloat(String(value))
    return isNaN(parsed) ? defaultValue : parsed
  },

  /**
   * Sanitize boolean
   * @param value - Value to sanitize
   * @returns Sanitized boolean
   */
  sanitizeBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
    }
    return Boolean(value)
  }
}

/**
 * SQL Injection Protection
 * Note: Knex provides parameterized queries by default,
 * but these helpers add extra protection
 */
export const sqlProtection = {
  /**
   * Validate table name
   * @param tableName - Table name to validate
   * @returns Whether table name is safe
   */
  isValidTableName(tableName: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)
  },

  /**
   * Validate column name
   * @param columnName - Column name to validate
   * @returns Whether column name is safe
   */
  isValidColumnName(columnName: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)
  },

  /**
   * Escape identifier (table or column name)
   * @param identifier - Identifier to escape
   * @returns Escaped identifier
   */
  escapeIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``
  }
}

export default {
  securityHeaders,
  customSecurityHeaders,
  CSRFProtection,
  sanitization,
  sqlProtection
}
