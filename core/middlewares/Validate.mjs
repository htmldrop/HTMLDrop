/**
 * Validation Middleware
 *
 * Validates request data using Zod schemas
 */

import { HTTP_STATUS, ERROR_CODES } from '../utils/constants.ts'

/**
 * Create a validation middleware for a given schema
 * @param {Object} schema - Zod schema to validate against
 * @param {string} source - Where to get data from: 'body', 'query', 'params'
 * @returns {Function} Express middleware
 */
export const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      // Get data from the specified source
      const data = req[source]

      // Validate data against schema
      const validatedData = await schema.parseAsync(data)

      // Replace request data with validated data
      req[source] = validatedData

      next()
    } catch (error) {
      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))

        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation failed',
          code: ERROR_CODES.VALIDATION_ERROR,
          errors
        })
      }

      // Handle other errors
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Validation error',
        code: ERROR_CODES.INTERNAL_ERROR
      })
    }
  }
}

/**
 * Validate request body
 * @param {Object} schema - Zod schema
 * @returns {Function} Express middleware
 */
export const validateBody = (schema) => validate(schema, 'body')

/**
 * Validate query parameters
 * @param {Object} schema - Zod schema
 * @returns {Function} Express middleware
 */
export const validateQuery = (schema) => validate(schema, 'query')

/**
 * Validate URL parameters
 * @param {Object} schema - Zod schema
 * @returns {Function} Express middleware
 */
export const validateParams = (schema) => validate(schema, 'params')

/**
 * Validate multiple sources at once
 * @param {Object} schemas - Object with schemas for body, query, and/or params
 * @returns {Function} Express middleware
 */
export const validateMultiple = (schemas) => {
  return async (req, res, next) => {
    try {
      const errors = []

      // Validate body if schema provided
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body)
        } catch (error) {
          if (error.name === 'ZodError') {
            errors.push(
              ...error.errors.map((err) => ({
                source: 'body',
                field: err.path.join('.'),
                message: err.message,
                code: err.code
              }))
            )
          }
        }
      }

      // Validate query if schema provided
      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query)
        } catch (error) {
          if (error.name === 'ZodError') {
            errors.push(
              ...error.errors.map((err) => ({
                source: 'query',
                field: err.path.join('.'),
                message: err.message,
                code: err.code
              }))
            )
          }
        }
      }

      // Validate params if schema provided
      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params)
        } catch (error) {
          if (error.name === 'ZodError') {
            errors.push(
              ...error.errors.map((err) => ({
                source: 'params',
                field: err.path.join('.'),
                message: err.message,
                code: err.code
              }))
            )
          }
        }
      }

      // If there are validation errors, return them
      if (errors.length > 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation failed',
          code: ERROR_CODES.VALIDATION_ERROR,
          errors
        })
      }

      next()
    } catch (error) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Validation error',
        code: ERROR_CODES.INTERNAL_ERROR
      })
    }
  }
}

/**
 * Optional validation - allows undefined/null values
 * @param {Object} schema - Zod schema
 * @param {string} source - Where to get data from
 * @returns {Function} Express middleware
 */
export const validateOptional = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const data = req[source]

      // Skip validation if no data provided
      if (!data || Object.keys(data).length === 0) {
        return next()
      }

      const validatedData = await schema.parseAsync(data)
      req[source] = validatedData

      next()
    } catch (error) {
      if (error.name === 'ZodError') {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))

        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation failed',
          code: ERROR_CODES.VALIDATION_ERROR,
          errors
        })
      }

      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Validation error',
        code: ERROR_CODES.INTERNAL_ERROR
      })
    }
  }
}

/**
 * Sanitize and validate at the same time
 * Useful when you want to clean data before validation
 * @param {Function} sanitizer - Function to sanitize data
 * @param {Object} schema - Zod schema
 * @param {string} source - Where to get data from
 * @returns {Function} Express middleware
 */
export const sanitizeAndValidate = (sanitizer, schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      // Sanitize data first
      let data = req[source]
      data = sanitizer(data)

      // Then validate
      const validatedData = await schema.parseAsync(data)
      req[source] = validatedData

      next()
    } catch (error) {
      if (error.name === 'ZodError') {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))

        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation failed',
          code: ERROR_CODES.VALIDATION_ERROR,
          errors
        })
      }

      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Validation error',
        code: ERROR_CODES.INTERNAL_ERROR
      })
    }
  }
}

export default {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateMultiple,
  validateOptional,
  sanitizeAndValidate
}
