/**
 * Rate Limiter Middleware
 *
 * Protects API endpoints from abuse by limiting the number of requests
 */

import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'
import { RATE_LIMITS, HTTP_STATUS, ERROR_CODES } from '../utils/constants.ts'

interface RateLimitInfo {
  resetTime: Date
}

interface RequestWithRateLimit extends Request {
  rateLimit: RateLimitInfo
}

/**
 * Default rate limiter for general API endpoints
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MS,
  limit: RATE_LIMITS.MAX_REQUESTS,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    const reqWithRateLimit = req as RequestWithRateLimit
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Too many requests from this IP, please try again later.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfter: reqWithRateLimit.rateLimit?.resetTime
    })
  }
})

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH.WINDOW_MS,
  limit: RATE_LIMITS.AUTH.MAX_REQUESTS,
  skipSuccessfulRequests: true, // Don't count successful login attempts
  message: {
    error: 'Too many authentication attempts, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const reqWithRateLimit = req as RequestWithRateLimit
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Too many authentication attempts, please try again later.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfter: reqWithRateLimit.rateLimit?.resetTime
    })
  }
})

/**
 * Rate limiter for file uploads
 * 20 uploads per 15 minutes per IP
 */
export const uploadLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MS,
  limit: 20,
  message: {
    error: 'Too many upload attempts, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const reqWithRateLimit = req as RequestWithRateLimit
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Too many upload attempts, please try again later.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfter: reqWithRateLimit.rateLimit?.resetTime
    })
  }
})

/**
 * Lenient rate limiter for read-only operations
 * 200 requests per 15 minutes per IP
 */
export const readLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MS,
  limit: 200,
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
  limit: 3,
  message: {
    error: 'Too many requests, please try again later.',
    code: ERROR_CODES.SERVICE_UNAVAILABLE
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const reqWithRateLimit = req as RequestWithRateLimit
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Too many requests for this sensitive operation, please try again later.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfter: reqWithRateLimit.rateLimit?.resetTime
    })
  }
})

/**
 * Create a custom rate limiter with specific options
 * @param options - Rate limit options
 * @returns Express middleware
 */
export const createRateLimiter = (options: {
  windowMs?: number
  limit?: number
  message?: string
  standardHeaders?: boolean
  legacyHeaders?: boolean
  skipSuccessfulRequests?: boolean
} = {}) => {
  return rateLimit({
    windowMs: options.windowMs ?? RATE_LIMITS.WINDOW_MS,
    limit: options.limit ?? RATE_LIMITS.MAX_REQUESTS,
    standardHeaders: options.standardHeaders ?? true,
    legacyHeaders: options.legacyHeaders ?? false,
    handler: (req: Request, res: Response) => {
      const reqWithRateLimit = req as RequestWithRateLimit
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: options.message || 'Too many requests, please try again later.',
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        retryAfter: reqWithRateLimit.rateLimit?.resetTime
      })
    },
    ...(options.skipSuccessfulRequests !== undefined && { skipSuccessfulRequests: options.skipSuccessfulRequests })
  })
}

export default {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  readLimiter,
  strictLimiter,
  createRateLimiter
}
