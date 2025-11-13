/**
 * Type-safe context exports for plugins and themes
 *
 * Import from this module to get automatic IntelliSense without JSDoc annotations:
 *
 * @example
 * import { createContext } from '../../../types/context.mjs'
 *
 * export default async ({ req, res, next, router }) => {
 *   const { context, hooks, guard } = createContext(req)
 *
 *   // Now context, hooks, and guard have full IntelliSense!
 *   context.table('posts')
 *   hooks.addAction('init', ...)
 * }
 */

/**
 * Create typed context, hooks, and guard from request
 * @param {HTMLDrop.ExtendedRequest} req - Extended request object
 * @returns {{ context: HTMLDrop.Context, hooks: HTMLDrop.Hooks, guard: HTMLDrop.Guard }}
 */
export function createContext(req) {
  return {
    context: req.context,
    hooks: req.hooks,
    guard: req.guard
  }
}

/**
 * Extract context with full type information
 * @param {HTMLDrop.ExtendedRequest} req
 * @returns {HTMLDrop.Context}
 */
export function getContext(req) {
  return req.context
}

/**
 * Extract hooks with full type information
 * @param {HTMLDrop.ExtendedRequest} req
 * @returns {HTMLDrop.Hooks}
 */
export function getHooks(req) {
  return req.hooks
}

/**
 * Extract guard with full type information
 * @param {HTMLDrop.ExtendedRequest} req
 * @returns {HTMLDrop.Guard}
 */
export function getGuard(req) {
  return req.guard
}
