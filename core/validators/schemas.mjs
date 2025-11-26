/**
 * Validation Schemas
 *
 * Zod schemas for request validation
 */

import { z } from 'zod'
import { POST_STATUS, VALID_POST_STATUSES, FIELD_TYPES, META_QUERY_OPERATORS } from '../utils/constants.mjs'

// ============================================================================
// Common Schemas
// ============================================================================

export const idSchema = z.number().int().positive()

export const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(200, 'Slug must be 200 characters or less')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')

export const emailSchema = z.string().email('Invalid email address').max(255, 'Email must be 255 characters or less')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or less')

export const urlSchema = z.string().url('Invalid URL').max(2048, 'URL must be 2048 characters or less')

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0)
})

export const sortSchema = z.object({
  orderBy: z.string().default('id'),
  sort: z.enum(['asc', 'desc']).default('desc')
})

// ============================================================================
// Authentication Schemas
// ============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required')
})

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: z.string().min(1, 'Username is required').max(255),
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional()
})

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required')
})

export const logoutSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required')
})

// ============================================================================
// Post Schemas
// ============================================================================

export const postStatusSchema = z.enum(VALID_POST_STATUSES)

export const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  slug: slugSchema.optional(),
  content: z.string().default(''),
  excerpt: z.string().max(1000).default(''),
  status: postStatusSchema.default(POST_STATUS.DRAFT),
  parent_id: z.number().int().positive().nullable().optional(),
  menu_order: z.number().int().min(0).default(0),
  meta: z.record(z.any()).optional(),
  taxonomies: z.record(z.union([z.array(z.number().int().positive()), z.array(z.string())])).optional()
})

export const updatePostSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  slug: slugSchema.optional(),
  content: z.string().optional(),
  excerpt: z.string().max(1000).optional(),
  status: postStatusSchema.optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  menu_order: z.number().int().min(0).optional(),
  meta: z.record(z.any()).optional(),
  taxonomies: z.record(z.union([z.array(z.number().int().positive()), z.array(z.string())])).optional()
})

export const metaQuerySchema = z.object({
  relation: z.enum(['AND', 'OR']).default('AND'),
  queries: z.array(
    z.object({
      key: z.string().min(1),
      value: z.any(),
      compare: z.enum(Object.values(META_QUERY_OPERATORS)).default('=')
    })
  )
})

export const taxonomyQuerySchema = z.object({
  relation: z.enum(['AND', 'OR']).default('AND'),
  queries: z.array(
    z.object({
      taxonomy: z.string().min(1),
      terms: z.array(z.union([z.number().int().positive(), z.string()])),
      operator: z.enum(['IN', 'NOT IN']).default('IN')
    })
  )
})

export const listPostsSchema = paginationSchema.merge(sortSchema).extend({
  status: postStatusSchema.optional(),
  search: z.string().max(500).optional(),
  searchable: z
    .string()
    .transform((val, ctx) => {
      try {
        return JSON.parse(val)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid JSON for searchable'
        })
        return z.NEVER
      }
    })
    .pipe(z.array(z.string()))
    .optional(),
  filters: z
    .string()
    .transform((val, ctx) => {
      try {
        return JSON.parse(val)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid JSON for filters'
        })
        return z.NEVER
      }
    })
    .pipe(z.record(z.any()))
    .optional(),
  meta_query: z
    .string()
    .transform((val, ctx) => {
      try {
        return JSON.parse(val)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid JSON for meta_query'
        })
        return z.NEVER
      }
    })
    .pipe(metaQuerySchema)
    .optional(),
  taxonomy_query: z
    .string()
    .transform((val, ctx) => {
      try {
        return JSON.parse(val)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid JSON for taxonomy_query'
        })
        return z.NEVER
      }
    })
    .pipe(taxonomyQuerySchema)
    .optional(),
  trashed: z.coerce.boolean().default(false)
})

// ============================================================================
// Post Type Schemas
// ============================================================================

export const createPostTypeSchema = z.object({
  slug: slugSchema,
  name_singular: z.string().min(1, 'Singular name is required').max(100),
  name_plural: z.string().min(1, 'Plural name is required').max(100),
  description: z.string().max(500).default(''),
  icon: z.string().max(5000).optional(),
  show_in_menu: z.boolean().default(true),
  capabilities: z.record(z.string()).optional()
})

export const updatePostTypeSchema = z.object({
  name_singular: z.string().min(1).max(100).optional(),
  name_plural: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(5000).optional(),
  show_in_menu: z.boolean().optional(),
  capabilities: z.record(z.string()).optional()
})

// ============================================================================
// Field Schemas
// ============================================================================

export const fieldTypeSchema = z.enum(Object.values(FIELD_TYPES))

export const createFieldSchema = z.object({
  slug: slugSchema,
  label: z.string().min(1, 'Label is required').max(100),
  type: fieldTypeSchema,
  description: z.string().max(500).default(''),
  default_value: z.any().optional(),
  required: z.boolean().default(false),
  options: z.record(z.any()).default({}),
  priority: z.number().int().min(0).default(10)
})

export const updateFieldSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  type: fieldTypeSchema.optional(),
  description: z.string().max(500).optional(),
  default_value: z.any().optional(),
  required: z.boolean().optional(),
  options: z.record(z.any()).optional(),
  priority: z.number().int().min(0).optional()
})

// ============================================================================
// Taxonomy Schemas
// ============================================================================

export const createTaxonomySchema = z.object({
  slug: slugSchema,
  name_singular: z.string().min(1, 'Singular name is required').max(100),
  name_plural: z.string().min(1, 'Plural name is required').max(100),
  description: z.string().max(500).default(''),
  hierarchical: z.boolean().default(false),
  show_in_menu: z.boolean().default(true)
})

export const updateTaxonomySchema = z.object({
  name_singular: z.string().min(1).max(100).optional(),
  name_plural: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  hierarchical: z.boolean().optional(),
  show_in_menu: z.boolean().optional()
})

// ============================================================================
// Term Schemas
// ============================================================================

export const createTermSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: slugSchema.optional(),
  description: z.string().max(1000).default(''),
  parent_id: z.number().int().positive().nullable().optional(),
  meta: z.record(z.any()).optional()
})

export const updateTermSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(1000).optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  meta: z.record(z.any()).optional()
})

export const listTermsSchema = paginationSchema.merge(sortSchema).extend({
  search: z.string().max(500).optional()
})

// ============================================================================
// User Schemas
// ============================================================================

export const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(255),
  email: emailSchema,
  password: passwordSchema,
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  roles: z.array(z.string()).default([]),
  meta: z.record(z.any()).optional()
})

export const updateUserSchema = z.object({
  username: z.string().min(1).max(255).optional(),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  roles: z.array(z.string()).optional(),
  meta: z.record(z.any()).optional()
})

export const listUsersSchema = paginationSchema.merge(sortSchema).extend({
  search: z.string().max(500).optional()
})

// ============================================================================
// Plugin Schemas
// ============================================================================

export const uploadPluginSchema = z.object({
  // File validation handled by multer
})

export const installNpmPluginSchema = z.object({
  package: z
    .string()
    .min(1, 'Package name is required')
    .max(214, 'Package name too long')
    .regex(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, 'Invalid package name'),
  version: z
    .string()
    .regex(
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
      'Invalid semver version'
    )
    .optional()
})

export const changePluginVersionSchema = z.object({
  version: z
    .string()
    .min(1, 'Version is required')
    .regex(
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
      'Invalid semver version'
    )
})

export const searchNpmSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200)
})

// ============================================================================
// Theme Schemas
// ============================================================================

export const uploadThemeSchema = z.object({
  // File validation handled by multer
})

export const installNpmThemeSchema = z.object({
  package: z
    .string()
    .min(1, 'Package name is required')
    .max(214, 'Package name too long')
    .regex(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, 'Invalid package name'),
  version: z
    .string()
    .regex(
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
      'Invalid semver version'
    )
    .optional()
})

export const changeThemeVersionSchema = z.object({
  version: z
    .string()
    .min(1, 'Version is required')
    .regex(
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
      'Invalid semver version'
    )
})

// ============================================================================
// Option Schemas
// ============================================================================

export const setOptionSchema = z.object({
  value: z.any(),
  autoload: z.boolean().default(true)
})

// ============================================================================
// Upload Schemas
// ============================================================================

export const uploadFileSchema = z.object({
  post_id: z.coerce.number().int().positive().optional(),
  title: z.string().max(255).optional(),
  alt: z.string().max(500).optional()
})

// ============================================================================
// Export all schemas
// ============================================================================

export default {
  // Common
  idSchema,
  slugSchema,
  emailSchema,
  passwordSchema,
  urlSchema,
  paginationSchema,
  sortSchema,

  // Auth
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  logoutSchema,

  // Posts
  postStatusSchema,
  createPostSchema,
  updatePostSchema,
  metaQuerySchema,
  taxonomyQuerySchema,
  listPostsSchema,

  // Post Types
  createPostTypeSchema,
  updatePostTypeSchema,

  // Fields
  fieldTypeSchema,
  createFieldSchema,
  updateFieldSchema,

  // Taxonomies
  createTaxonomySchema,
  updateTaxonomySchema,

  // Terms
  createTermSchema,
  updateTermSchema,
  listTermsSchema,

  // Users
  createUserSchema,
  updateUserSchema,
  listUsersSchema,

  // Plugins
  uploadPluginSchema,
  installNpmPluginSchema,
  changePluginVersionSchema,
  searchNpmSchema,

  // Themes
  uploadThemeSchema,
  installNpmThemeSchema,
  changeThemeVersionSchema,

  // Options
  setOptionSchema,

  // Upload
  uploadFileSchema
}
