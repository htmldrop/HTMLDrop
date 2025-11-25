/**
 * Security Middleware
 *
 * Provides security headers and protection using Helmet.js
 */

import helmet from 'helmet'

/**
 * Configure Helmet security middleware
 * @returns {Function} Express middleware
 */
export const securityHeaders = helmet({
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

  // Expect-CT
  expectCt: {
    maxAge: 86400,
    enforce: true
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
export const customSecurityHeaders = (req, res, next) => {
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
  constructor() {
    this.tokens = new Map()
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // Cleanup every minute
  }

  /**
   * Generate a CSRF token
   * @param {string} sessionId - Session identifier
   * @returns {string} CSRF token
   */
  generateToken(sessionId) {
    const token = this.randomToken()
    const expiry = Date.now() + 60 * 60 * 1000 // 1 hour

    this.tokens.set(sessionId, { token, expiry })

    return token
  }

  /**
   * Validate a CSRF token
   * @param {string} sessionId - Session identifier
   * @param {string} token - Token to validate
   * @returns {boolean} Whether token is valid
   */
  validateToken(sessionId, token) {
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
   * @returns {string} Random token
   */
  randomToken() {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  }

  /**
   * Cleanup expired tokens
   */
  cleanup() {
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
  middleware() {
    return (req, res, next) => {
      // Generate session ID if not exists
      if (!req.session) {
        req.session = {
          id: this.randomToken()
        }
      }

      // Generate and attach CSRF token
      const token = this.generateToken(req.session.id)
      req.csrfToken = () => token

      // Add token to response locals for templates
      res.locals.csrfToken = token

      next()
    }
  }

  /**
   * Express middleware to validate CSRF token
   */
  validate() {
    return (req, res, next) => {
      // Skip for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next()
      }

      const sessionId = req.session?.id
      const token = req.headers['x-csrf-token'] || req.body?._csrf

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
  destroy() {
    clearInterval(this.cleanupInterval)
  }
}

/**
 * Input Sanitization Helpers
 */
export const sanitization = {
  /**
   * Sanitize string input
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  sanitizeString(input) {
    if (typeof input !== 'string') return ''

    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .slice(0, 10000) // Limit length
  },

  /**
   * Sanitize HTML input
   * @param {string} html - HTML to sanitize
   * @returns {string} Sanitized HTML
   */
  sanitizeHtml(html) {
    if (typeof html !== 'string') return ''

    // Basic sanitization - in production, use a library like DOMPurify
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
  },

  /**
   * Sanitize email
   * @param {string} email - Email to sanitize
   * @returns {string|null} Sanitized email or null if invalid
   */
  sanitizeEmail(email) {
    if (typeof email !== 'string') return null

    const sanitized = email.toLowerCase().trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    return emailRegex.test(sanitized) ? sanitized : null
  },

  /**
   * Sanitize URL
   * @param {string} url - URL to sanitize
   * @returns {string|null} Sanitized URL or null if invalid
   */
  sanitizeUrl(url) {
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
   * @param {string} filename - Filename to sanitize
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(filename) {
    if (typeof filename !== 'string') return 'unnamed'

    return filename
      .replace(/[^a-z0-9.-]/gi, '_') // Replace special chars
      .replace(/\.{2,}/g, '.') // Remove double dots
      .replace(/^\./, '') // Remove leading dot
      .slice(0, 255) // Limit length
  },

  /**
   * Sanitize slug
   * @param {string} slug - Slug to sanitize
   * @returns {string} Sanitized slug
   */
  sanitizeSlug(slug) {
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
   * @param {any} value - Value to sanitize
   * @param {number} defaultValue - Default value if invalid
   * @returns {number} Sanitized integer
   */
  sanitizeInt(value, defaultValue = 0) {
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? defaultValue : parsed
  },

  /**
   * Sanitize float
   * @param {any} value - Value to sanitize
   * @param {number} defaultValue - Default value if invalid
   * @returns {number} Sanitized float
   */
  sanitizeFloat(value, defaultValue = 0.0) {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? defaultValue : parsed
  },

  /**
   * Sanitize boolean
   * @param {any} value - Value to sanitize
   * @returns {boolean} Sanitized boolean
   */
  sanitizeBoolean(value) {
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
   * @param {string} tableName - Table name to validate
   * @returns {boolean} Whether table name is safe
   */
  isValidTableName(tableName) {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)
  },

  /**
   * Validate column name
   * @param {string} columnName - Column name to validate
   * @returns {boolean} Whether column name is safe
   */
  isValidColumnName(columnName) {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)
  },

  /**
   * Escape identifier (table or column name)
   * @param {string} identifier - Identifier to escape
   * @returns {string} Escaped identifier
   */
  escapeIdentifier(identifier) {
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
