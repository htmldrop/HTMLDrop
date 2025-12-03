/**
 * Error Handler Middleware
 *
 * Centralized error handling with structured logging
 */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express'
import { HTTP_STATUS, ERROR_CODES, ERROR_MESSAGES, IS_PRODUCTION } from '../utils/constants.ts'

interface LogMeta {
  [key: string]: unknown
}

interface ErrorResponse {
  error: string
  code: string
  errors?: Array<{ field: string; message: string; code: string }>
  resource?: string | null
  stack?: string
}

interface RateLimitInfo {
  resetTime: Date
}

interface MulterError extends Error {
  code: string
}

interface RequestWithRateLimit extends Request {
  rateLimit: RateLimitInfo
  user?: { id: number }
}

/**
 * Custom Error Classes
 */

export class AppError extends Error {
  statusCode: number
  code: string
  isOperational: boolean

  constructor(message: string, statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR, code: string = ERROR_CODES.INTERNAL_ERROR) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  errors: Array<{ field: string; message: string; code: string }>

  constructor(
    message: string = ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR as keyof typeof ERROR_MESSAGES],
    errors: Array<{ field: string; message: string; code: string }> = []
  ) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR)
    this.errors = errors
  }
}

export class NotFoundError extends AppError {
  resource: string | null

  constructor(
    message: string = ERROR_MESSAGES[ERROR_CODES.NOT_FOUND as keyof typeof ERROR_MESSAGES],
    resource: string | null = null
  ) {
    super(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND)
    this.resource = resource
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED as keyof typeof ERROR_MESSAGES]) {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED)
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = ERROR_MESSAGES[ERROR_CODES.FORBIDDEN as keyof typeof ERROR_MESSAGES]) {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN)
  }
}

export class ConflictError extends AppError {
  constructor(message: string = ERROR_MESSAGES[ERROR_CODES.ALREADY_EXISTS as keyof typeof ERROR_MESSAGES]) {
    super(message, HTTP_STATUS.CONFLICT, ERROR_CODES.ALREADY_EXISTS)
  }
}

export class DatabaseError extends AppError {
  originalError: Error | null

  constructor(
    message: string = ERROR_MESSAGES[ERROR_CODES.DATABASE_ERROR as keyof typeof ERROR_MESSAGES],
    originalError: Error | null = null
  ) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.DATABASE_ERROR)
    this.originalError = originalError
  }
}

export class FileUploadError extends AppError {
  constructor(message: string = ERROR_MESSAGES[ERROR_CODES.UPLOAD_ERROR as keyof typeof ERROR_MESSAGES]) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.UPLOAD_ERROR)
  }
}

/**
 * Logger class for structured logging
 */
class Logger {
  log(level: string, message: string, meta: LogMeta = {}): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    }

    if (IS_PRODUCTION) {
      // In production, log as JSON for log aggregation tools
      console.log(JSON.stringify(logEntry))
    } else {
      // In development, log with colors and formatting
      const colors: Record<string, string> = {
        error: '\x1b[31m',
        warn: '\x1b[33m',
        info: '\x1b[36m',
        debug: '\x1b[90m',
        reset: '\x1b[0m'
      }

      const color = colors[level] || colors.reset
      console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`, meta)
    }
  }

  error(message: string, meta: LogMeta = {}): void {
    this.log('error', message, meta)
  }

  warn(message: string, meta: LogMeta = {}): void {
    this.log('warn', message, meta)
  }

  info(message: string, meta: LogMeta = {}): void {
    this.log('info', message, meta)
  }

  debug(message: string, meta: LogMeta = {}): void {
    this.log('debug', message, meta)
  }
}

export const logger = new Logger()

/**
 * Error response formatter
 */
const formatErrorResponse = (
  error: AppError & { errors?: Array<{ field: string; message: string; code: string }>; resource?: string | null },
  includeStack = false
): ErrorResponse => {
  const response: ErrorResponse = {
    error: error.message || 'An error occurred',
    code: error.code || ERROR_CODES.INTERNAL_ERROR
  }

  // Add validation errors if present
  if (error.errors && Array.isArray(error.errors)) {
    response.errors = error.errors
  }

  // Add resource info if present
  if (error.resource) {
    response.resource = error.resource
  }

  // Include stack trace in development
  if (includeStack && error.stack) {
    response.stack = error.stack
  }

  return response
}

/**
 * Main error handler middleware
 */
export const errorHandler = (
  err: AppError & {
    errors?: Array<{ field: string; message: string; code: string }>
    resource?: string | null
    code?: string
  },
  req: Request & { user?: { id: number } },
  res: Response,
  next: NextFunction
): void | Response => {
  // Log error
  logger.error('Error occurred', {
    error: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    method: req.method,
    url: req.url,
    userId: req.user?.id,
    ip: req.ip
  })

  // Determine status code
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR

  // Check if headers already sent
  if (res.headersSent) {
    return next(err)
  }

  // Handle specific error types
  if (err.name === 'UnauthorizedError') {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Invalid or expired token',
      code: ERROR_CODES.TOKEN_INVALID
    })
    return
  }

  if (err.name === 'ValidationError') {
    res.status(HTTP_STATUS.BAD_REQUEST).json(formatErrorResponse(err))
    return
  }

  // Database errors
  if (err.code === 'ER_DUP_ENTRY' || err.code === 'SQLITE_CONSTRAINT') {
    res.status(HTTP_STATUS.CONFLICT).json({
      error: 'Duplicate entry',
      code: ERROR_CODES.DUPLICATE_ENTRY
    })
    return
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    const multerErr = err as unknown as MulterError
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES[ERROR_CODES.FILE_TOO_LARGE as keyof typeof ERROR_MESSAGES],
        code: ERROR_CODES.FILE_TOO_LARGE
      })
      return
    }
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: err.message || 'File upload error',
      code: ERROR_CODES.UPLOAD_ERROR
    })
    return
  }

  // Operational errors (safe to expose)
  if (err.isOperational) {
    res.status(statusCode).json(formatErrorResponse(err, !IS_PRODUCTION))
    return
  }

  // Programming errors (don't expose details in production)
  if (IS_PRODUCTION) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'An internal error occurred',
      code: ERROR_CODES.INTERNAL_ERROR
    })
  } else {
    res.status(statusCode).json(formatErrorResponse(err, true))
  }
}

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route not found: ${req.method} ${req.url}`)
  next(error)
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 */
export const asyncHandler = <T extends (req: Request, res: Response, next: NextFunction) => Promise<void | Response>>(
  fn: T
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Try-catch wrapper for easier error handling
 */
export const tryCatch = <T extends (req: Request, res: Response, next: NextFunction) => Promise<void | Response>>(
  fn: T
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await fn(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Validation error helper
 */
export const throwValidationError = (
  message: string,
  errors: Array<{ field: string; message: string; code: string }> = []
): never => {
  throw new ValidationError(message, errors)
}

/**
 * Not found error helper
 */
export const throwNotFoundError = (resource: string | null = null, message: string | null = null): never => {
  throw new NotFoundError(message || `${resource ? `${resource} ` : ''}not found`, resource)
}

/**
 * Unauthorized error helper
 */
export const throwUnauthorizedError = (message: string | null = null): never => {
  throw new UnauthorizedError(message || undefined)
}

/**
 * Forbidden error helper
 */
export const throwForbiddenError = (message: string | null = null): never => {
  throw new ForbiddenError(message || undefined)
}

/**
 * Conflict error helper
 */
export const throwConflictError = (message: string | null = null): never => {
  throw new ConflictError(message || undefined)
}

/**
 * Database error helper
 */
export const throwDatabaseError = (originalError: Error | null = null, message: string | null = null): never => {
  throw new DatabaseError(message || undefined, originalError)
}

/**
 * Process-level error handlers
 */
export const setupProcessErrorHandlers = (): void => {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack
    })

    // Exit gracefully
    process.exit(1)
  })

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.error('Unhandled Rejection', {
      reason,
      promise
    })

    // Exit gracefully
    process.exit(1)
  })

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...')
    // Perform cleanup here
    process.exit(0)
  })

  // Handle SIGINT
  process.on('SIGINT', () => {
    logger.info('SIGINT received. Shutting down gracefully...')
    // Perform cleanup here
    process.exit(0)
  })
}

export default {
  // Error classes
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
  FileUploadError,

  // Middleware
  errorHandler,
  notFoundHandler,
  asyncHandler,
  tryCatch,

  // Helpers
  throwValidationError,
  throwNotFoundError,
  throwUnauthorizedError,
  throwForbiddenError,
  throwConflictError,
  throwDatabaseError,

  // Logger
  logger,

  // Setup
  setupProcessErrorHandlers
}
