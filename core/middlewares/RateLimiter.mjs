/**
 * Rate Limiter Middleware
 *
 * Protects API endpoints from abuse by limiting the number of requests
 */

import rateLimit from 'express-rate-limit'
import { RATE_LIMITS, HTTP_STATUS, ERROR_CODES } from '../utils/constants.ts'

/**
 * Default rate limiter for general API endpoints
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MS,
  max: RATE_LIMITS.MAX_REQUESTS,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Too many requests from this IP, please try again later.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfter: req.rateLimit.resetTime
    })
  }
})

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH.WINDOW_MS,
  max: RATE_LIMITS.AUTH.MAX_REQUESTS,
  skipSuccessfulRequests: true, // Don't count successful login attempts
  message: {
    error: 'Too many authentication attempts, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Too many authentication attempts, please try again later.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfter: req.rateLimit.resetTime
    })
  }
})

/**
 * Rate limiter for file uploads
 * 20 uploads per 15 minutes per IP
 */
export const uploadLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MS,
  max: 20,
  message: {
    error: 'Too many upload attempts, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Too many upload attempts, please try again later.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfter: req.rateLimit.resetTime
    })
  }
})

/**
 * Lenient rate limiter for read-only operations
 * 200 requests per 15 minutes per IP
 */
export const readLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MS,
  max: 200,
  message: {
    error: 'Too many requests, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * Very strict rate limiter for sensitive operations
 * 3 requests per 15 minutes per IP
 */
export const strictLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MS,
  max: 3,
  message: {
    error: 'Too many requests, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Too many requests for this sensitive operation, please try again later.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfter: req.rateLimit.resetTime
    })
  }
})

/**
 * Create a custom rate limiter with specific options
 * @param {Object} options - Rate limit options
 * @returns {Function} Express middleware
 */
export const createRateLimiter = (options = {}) => {
  const defaults = {
    windowMs: RATE_LIMITS.WINDOW_MS,
    max: RATE_LIMITS.MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: options.message || 'Too many requests, please try again later.',
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        retryAfter: req.rateLimit.resetTime
      })
    }
  }

  return rateLimit({ ...defaults, ...options })
}

export default {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  readLimiter,
  strictLimiter,
  createRateLimiter
}
