/**
 * Validation Middleware
 *
 * Validates request data using Zod schemas
 */

import type { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError, ZodIssue } from 'zod'
import { HTTP_STATUS, ERROR_CODES } from '../utils/constants.ts'

interface ValidationError {
  field: string
  message: string
  code: string
}

interface ValidationErrorWithSource extends ValidationError {
  source: string
}

interface Schemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}

/**
 * Create a validation middleware for a given schema
 * @param schema - Zod schema to validate against
 * @param source - Where to get data from: 'body', 'query', 'params'
 * @returns Express middleware
 */
export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      // Get data from the specified source
      const data = req[source]

      // Validate data against schema
      const validatedData = await schema.parseAsync(data)

      // Replace request data with validated data
      ;(req as unknown as Record<string, unknown>)[source] = validatedData

      next()
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const zodError = error as ZodError
        const errors: ValidationError[] = zodError.issues.map((err: ZodIssue) => ({
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
 * @param schema - Zod schema
 * @returns Express middleware
 */
export const validateBody = (schema: ZodSchema) => validate(schema, 'body')

/**
 * Validate query parameters
 * @param schema - Zod schema
 * @returns Express middleware
 */
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query')

/**
 * Validate URL parameters
 * @param schema - Zod schema
 * @returns Express middleware
 */
export const validateParams = (schema: ZodSchema) => validate(schema, 'params')

/**
 * Validate multiple sources at once
 * @param schemas - Object with schemas for body, query, and/or params
 * @returns Express middleware
 */
export const validateMultiple = (schemas: Schemas) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const errors: ValidationErrorWithSource[] = []

      // Validate body if schema provided
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body)
        } catch (error) {
          if (error instanceof ZodError) {
            const zodError = error as ZodError
            errors.push(
              ...zodError.issues.map((err: ZodIssue) => ({
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
          ;(req as unknown as { query: unknown }).query = await schemas.query.parseAsync(req.query)
        } catch (error) {
          if (error instanceof ZodError) {
            const zodError = error as ZodError
            errors.push(
              ...zodError.issues.map((err: ZodIssue) => ({
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
          req.params = (await schemas.params.parseAsync(req.params)) as Record<string, string>
        } catch (error) {
          if (error instanceof ZodError) {
            const zodError = error as ZodError
            errors.push(
              ...zodError.issues.map((err: ZodIssue) => ({
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
    } catch {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Validation error',
        code: ERROR_CODES.INTERNAL_ERROR
      })
    }
  }
}

/**
 * Optional validation - allows undefined/null values
 * @param schema - Zod schema
 * @param source - Where to get data from
 * @returns Express middleware
 */
export const validateOptional = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const data = req[source] as Record<string, unknown>

      // Skip validation if no data provided
      if (!data || Object.keys(data).length === 0) {
        return next()
      }

      const validatedData = await schema.parseAsync(data)
      ;(req as unknown as Record<string, unknown>)[source] = validatedData

      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const zodError = error as ZodError
        const errors: ValidationError[] = zodError.issues.map((err: ZodIssue) => ({
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
 * @param sanitizer - Function to sanitize data
 * @param schema - Zod schema
 * @param source - Where to get data from
 * @returns Express middleware
 */
export const sanitizeAndValidate = <T>(
  sanitizer: (data: T) => T,
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      // Sanitize data first
      let data = req[source] as T
      data = sanitizer(data)

      // Then validate
      const validatedData = await schema.parseAsync(data)
      ;(req as unknown as Record<string, unknown>)[source] = validatedData

      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const zodError = error as ZodError
        const errors: ValidationError[] = zodError.issues.map((err: ZodIssue) => ({
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
