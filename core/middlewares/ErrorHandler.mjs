/**
 * Error Handler Middleware
 *
 * Centralized error handling with structured logging
 */

import { HTTP_STATUS, ERROR_CODES, ERROR_MESSAGES, IS_PRODUCTION } from '../utils/constants.mjs'

/**
 * Custom Error Classes
 */

export class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, code = ERROR_CODES.INTERNAL_ERROR) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR], errors = []) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR)
    this.errors = errors
  }
}

export class NotFoundError extends AppError {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.NOT_FOUND], resource = null) {
    super(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND)
    this.resource = resource
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED]) {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.FORBIDDEN]) {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN)
  }
}

export class ConflictError extends AppError {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.ALREADY_EXISTS]) {
    super(message, HTTP_STATUS.CONFLICT, ERROR_CODES.ALREADY_EXISTS)
  }
}

export class DatabaseError extends AppError {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.DATABASE_ERROR], originalError = null) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.DATABASE_ERROR)
    this.originalError = originalError
  }
}

export class FileUploadError extends AppError {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.UPLOAD_ERROR]) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.UPLOAD_ERROR)
  }
}

/**
 * Logger class for structured logging
 */
class Logger {
  log(level, message, meta = {}) {
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
      const colors = {
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

  error(message, meta = {}) {
    this.log('error', message, meta)
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta)
  }

  info(message, meta = {}) {
    this.log('info', message, meta)
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta)
  }
}

export const logger = new Logger()

/**
 * Error response formatter
 */
const formatErrorResponse = (error, includeStack = false) => {
  const response = {
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
export const errorHandler = (err, req, res, next) => {
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
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Invalid or expired token',
      code: ERROR_CODES.TOKEN_INVALID
    })
  }

  if (err.name === 'ValidationError') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(formatErrorResponse(err))
  }

  // Database errors
  if (err.code === 'ER_DUP_ENTRY' || err.code === 'SQLITE_CONSTRAINT') {
    return res.status(HTTP_STATUS.CONFLICT).json({
      error: 'Duplicate entry',
      code: ERROR_CODES.DUPLICATE_ENTRY
    })
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES[ERROR_CODES.FILE_TOO_LARGE],
        code: ERROR_CODES.FILE_TOO_LARGE
      })
    }
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: err.message || 'File upload error',
      code: ERROR_CODES.UPLOAD_ERROR
    })
  }

  // Operational errors (safe to expose)
  if (err.isOperational) {
    return res.status(statusCode).json(formatErrorResponse(err, !IS_PRODUCTION))
  }

  // Programming errors (don't expose details in production)
  if (IS_PRODUCTION) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'An internal error occurred',
      code: ERROR_CODES.INTERNAL_ERROR
    })
  } else {
    return res.status(statusCode).json(formatErrorResponse(err, true))
  }
}

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route not found: ${req.method} ${req.url}`)
  next(error)
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Try-catch wrapper for easier error handling
 */
export const tryCatch = (fn) => {
  return async (req, res, next) => {
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
export const throwValidationError = (message, errors = []) => {
  throw new ValidationError(message, errors)
}

/**
 * Not found error helper
 */
export const throwNotFoundError = (resource = null, message = null) => {
  throw new NotFoundError(message || `${resource ? `${resource  } ` : ''}not found`, resource)
}

/**
 * Unauthorized error helper
 */
export const throwUnauthorizedError = (message = null) => {
  throw new UnauthorizedError(message)
}

/**
 * Forbidden error helper
 */
export const throwForbiddenError = (message = null) => {
  throw new ForbiddenError(message)
}

/**
 * Conflict error helper
 */
export const throwConflictError = (message = null) => {
  throw new ConflictError(message)
}

/**
 * Database error helper
 */
export const throwDatabaseError = (originalError = null, message = null) => {
  throw new DatabaseError(message, originalError)
}

/**
 * Process-level error handlers
 */
export const setupProcessErrorHandlers = () => {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack
    })

    // Exit gracefully
    process.exit(1)
  })

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
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
