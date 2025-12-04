/**
 * Core Context Types
 */
import type { Application } from 'express'
import type { Knex } from 'knex'
import { Request, Response, NextFunction, Router } from 'express'
import { WebSocketServer } from 'ws'
import { Server } from 'http'
import parseVue from '../utils/parseVue.ts'
import translate from '../utils/translation.ts'
import TraceStorage from '../services/TraceStorage.ts'
import TraceStorageDB from '../services/TraceStorageDB.ts'

declare global {
  namespace HTMLDrop {
    /**
     * Main context object available in plugins, themes, and throughout the application
     */
    interface Context {
      /** Express application instance */
      app: Application

      /** Server port */
      port: string | number

      /** HTTP server instance */
      server: Server

      /** WebSocket server for real-time communication */
      wss?: WebSocketServer

      /** Knex database instance for running queries */
      knex?: Knex | null

      /** Site options loaded from the database */
      options?: Record<string, any> | null

      /** Vue parser for SSR (Server-Side Rendering) */
      parseVue?: typeof parseVue

      /** Task scheduler for running scheduled jobs (Laravel-style) */
      scheduler?: SchedulerService | null

      /** Trace storage for performance tracing */
      traceStorage?: InstanceType<typeof TraceStorage> | InstanceType<typeof TraceStorageDB> | null

      /** Registered post types */
      postTypes?: PostType[]

      /** Registered taxonomies */
      taxonomies?: Taxonomy[]

      /** Hooks system for actions and filters */
      hooks?: Hooks

      /** Authorization guard for capability checks */
      guard?: Guard

      /** Registries for post types, taxonomies, etc. */
      registries?: Record<string, any>

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
      translate: typeof translate

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

      onPluginsInitialized?: () => void

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
