/**
 * Core Context Types
 */

import type { Knex } from 'knex'
import { Request, Response, NextFunction, Router } from 'express'

declare global {
  namespace HTMLDrop {
    /**
     * Main context object available in plugins, themes, and throughout the application
     */
    interface Context {
      /** Express application instance */
      app: any

      /** Knex database instance for running queries */
      knex: Knex

      /** Site options loaded from the database */
      options: Record<string, any>

      /** Registered post types */
      postTypes: PostType[]

      /** Registered taxonomies */
      taxonomies: Taxonomy[]

      /** Hooks system for actions and filters */
      hooks: Hooks

      /** Authorization guard for capability checks */
      guard: Guard

      /** Task scheduler for running scheduled jobs (Laravel-style) */
      scheduler: SchedulerService

      /**
       * Get prefixed table name for database queries
       * @param name - Table name (e.g., 'posts', 'users')
       * @returns Prefixed table name
       * @example
       * const tableName = table('posts') // Returns 'wp_posts' if prefix is 'wp_'
       */
      table(name: string): string

      /**
       * Format a date to a specific format
       * @param date - Date object or string
       * @param format - Format string (optional)
       * @returns Formatted date string
       * @example
       * const formatted = formatDate(new Date(), 'YYYY-MM-DD')
       */
      formatDate(date?: Date | string, format?: string): string

      /**
       * Normalize a string to a URL-safe slug
       * @param value - String to normalize
       * @returns Normalized slug
       * @example
       * const slug = normalizeSlug('Hello World!') // Returns 'hello-world'
       */
      normalizeSlug(value: string): string

      /**
       * Translate a key to the current or specified locale
       * @param key - Translation key
       * @param locale - Locale code (optional, defaults to current locale)
       * @returns Translated string
       * @example
       * const text = translate('welcome_message', 'en_US')
       */
      translate(key: string, locale?: string): string

      /** Vue parser for SSR (Server-Side Rendering) */
      parseVue?: any

      /**
       * Get a post type by slug
       * @param slug - Post type slug
       * @returns Post type object or null
       */
      getPostType?(slug: string): PostType | null

      /**
       * Get all registered post types
       * @returns Array of post type objects
       */
      getAllPostTypes?(): PostType[]

      /**
       * Get all custom fields for a post type
       * @param postTypeSlug - Post type slug
       * @returns Array of field definitions
       */
      getFields?(postTypeSlug: string): Field[]

      /**
       * Get a taxonomy by post type and slug
       * @param postType - Post type slug
       * @param slug - Taxonomy slug
       * @returns Taxonomy object or null
       */
      getTaxonomy?(postType: string, slug: string): Taxonomy | null

      /**
       * Get the URL for an attachment by ID or slug
       * @param idOrSlug - Attachment ID or slug
       * @returns URL string or null
       */
      getAttachmentUrl?(idOrSlug: string | number): Promise<string | null>

      /**
       * Generate an excerpt from post content
       * @param post - Post object
       * @param length - Maximum length in characters (default: 150)
       * @returns Excerpt string
       */
      theExcerpt?(post: Post, length?: number): string

      /** Monitoring service instance (set by HealthController) */
      monitoring?: any

      /** WebSocket server for upload progress */
      wss?: {
        clients: Set<{
          readyState: number
          uploadId?: string
          send: (data: string) => void
        }>
      }
    }

    interface ExtendedRequest extends Request {
      context: Context
      user?: User
      hooks: Hooks
      guard: Guard
      tracer?: PerformanceTracer
      csrfToken?: () => string
      session?: {
        id: string
        [key: string]: any
      }
    }

    interface PluginRequest {
      req: ExtendedRequest
      res: Response
      next: NextFunction
      router: Router
    }

    interface ThemeRequest {
      req: ExtendedRequest
      res: Response
      next: NextFunction
      router: Router
    }
  }
}

export {}
