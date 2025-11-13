/**
 * TypeScript definitions for HTMLDrop CMS
 *
 * Provides type definitions for better IDE support and type safety
 */

import { Knex } from 'knex'
import { Request, Response, NextFunction, Router } from 'express'

declare global {
  namespace HTMLDrop {
    // ========================================================================
    // Core Context
    // ========================================================================

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
    }

    // ========================================================================
    // Request/Response
    // ========================================================================

    interface ExtendedRequest extends Request {
      context: Context
      user?: User
      hooks: Hooks
      guard: Guard
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

    // ========================================================================
    // Hooks & Filters
    // ========================================================================

    interface Hooks {
      /**
       * Register an action hook that runs at a specific point in execution
       * @param name - The hook name (e.g., 'init', 'save_post', 'delete_user')
       * @param callback - Function to execute when the hook fires
       * @param priority - Execution priority (default: 10, lower = earlier)
       * @example
       * addAction('save_post', async ({ post }) => {
       *   console.log('Post saved:', post.id)
       * }, 10)
       */
      addAction(name: string, callback: HookCallback, priority?: number): void

      /**
       * Trigger all callbacks registered for an action hook
       * @param name - The hook name to trigger
       * @param args - Arguments to pass to registered callbacks
       * @example
       * await doAction('save_post', { post, req, res })
       */
      doAction(name: string, ...args: any[]): Promise<void>

      /**
       * Register a filter hook that modifies a value
       * @param name - The filter name (e.g., 'the_content', 'the_title')
       * @param callback - Function that receives and returns the filtered value
       * @param priority - Execution priority (default: 10, lower = earlier)
       * @example
       * addFilter('the_content', (content, post) => {
       *   return content.toUpperCase()
       * }, 10)
       */
      addFilter(name: string, callback: FilterCallback, priority?: number): void

      /**
       * Apply all registered filters to a value
       * @param name - The filter name to apply
       * @param value - The value to filter
       * @param args - Additional arguments to pass to filter callbacks
       * @returns The filtered value
       * @example
       * const title = applyFilters('the_title', post.title, post)
       */
      applyFilters(name: string, value: any, ...args: any[]): any

      /**
       * Register a custom post type
       * @param config - Post type configuration
       * @param priority - Registration priority (default: 10)
       * @example
       * await registerPostType({
       *   slug: 'books',
       *   name_singular: 'Book',
       *   name_plural: 'Books',
       *   description: 'Library books',
       *   icon: 'book',
       *   show_in_menu: true
       * })
       */
      registerPostType(config: PostTypeConfig, priority?: number): Promise<void>

      /**
       * Register a custom field for a post type
       * @param config - Field configuration
       * @param priority - Registration priority (default: 10)
       * @example
       * await registerPostField({
       *   post_type_slug: 'books',
       *   slug: 'isbn',
       *   label: 'ISBN',
       *   type: 'text',
       *   required: true
       * })
       */
      registerPostField(config: FieldConfig, priority?: number): Promise<void>

      /**
       * Register a taxonomy for a post type
       * @param config - Taxonomy configuration
       * @param priority - Registration priority (default: 10)
       * @example
       * await registerTaxonomy({
       *   post_type_slug: 'books',
       *   slug: 'genres',
       *   name_singular: 'Genre',
       *   name_plural: 'Genres',
       *   hierarchical: false
       * })
       */
      registerTaxonomy(config: TaxonomyConfig, priority?: number): Promise<void>

      /**
       * Register a custom field for a taxonomy
       * @param config - Field configuration with taxonomy_slug instead of post_type_slug
       * @param priority - Registration priority (default: 10)
       * @example
       * await registerTermField({
       *   taxonomy_slug: 'genres',
       *   slug: 'color',
       *   label: 'Color',
       *   type: 'text'
       * })
       */
      registerTermField(config: FieldConfig, priority?: number): Promise<void>

      /**
       * Add a top-level menu page to the admin dashboard
       * @param config - Menu page configuration
       * @example
       * addMenuPage({
       *   slug: 'my-plugin',
       *   title: 'My Plugin',
       *   icon: 'settings',
       *   component: '/path/to/component.vue',
       *   capability: 'manage_options'
       * })
       */
      addMenuPage(config: MenuPageConfig): void

      /**
       * Add a submenu page under an existing menu
       * @param config - Submenu page configuration (includes parent slug)
       * @example
       * addSubMenuPage({
       *   parent: 'my-plugin',
       *   slug: 'settings',
       *   title: 'Settings',
       *   component: '/path/to/settings.vue'
       * })
       */
      addSubMenuPage(config: SubMenuPageConfig): void

      /**
       * Get a post type by slug
       * @param slug - Post type slug
       * @returns Post type object or null
       * @example
       * const postType = getPostType('books')
       */
      getPostType(slug: string): PostType | null

      /**
       * Get all registered post types
       * @returns Array of post type objects
       * @example
       * const allPostTypes = getAllPostTypes()
       */
      getAllPostTypes(): PostType[]

      /**
       * Get all custom fields for a post type
       * @param postTypeSlug - Post type slug
       * @returns Array of field definitions
       * @example
       * const fields = getFields('books')
       */
      getFields(postTypeSlug: string): Field[]

      /**
       * Get a taxonomy by post type and slug
       * @param postType - Post type slug
       * @param slug - Taxonomy slug
       * @returns Taxonomy object or null
       * @example
       * const taxonomy = getTaxonomy('books', 'genres')
       */
      getTaxonomy(postType: string, slug: string): Taxonomy | null

      /**
       * Get the URL for an attachment by ID or slug
       * @param idOrSlug - Attachment ID or slug
       * @returns URL string or null
       * @example
       * const url = await getAttachmentUrl(123)
       */
      getAttachmentUrl(idOrSlug: string | number): Promise<string | null>

      /**
       * Generate an excerpt from post content
       * @param post - Post object
       * @param length - Maximum length in characters (default: 150)
       * @returns Excerpt string
       * @example
       * const excerpt = theExcerpt(post, 200)
       */
      theExcerpt(post: Post, length?: number): string
    }

    /**
     * Callback function for action hooks
     * @param args - Arguments passed from doAction
     */
    type HookCallback = (...args: any[]) => Promise<void> | void

    /**
     * Callback function for filter hooks
     * @param value - The value being filtered
     * @param args - Additional arguments from applyFilters
     * @returns The filtered value
     */
    type FilterCallback = (value: any, ...args: any[]) => any

    // ========================================================================
    // Authorization
    // ========================================================================

    interface Guard {
      user(options: GuardOptions): Promise<string[] | null>
    }

    interface GuardOptions {
      userId: number
      canOneOf?: string[]
      canAllOf?: string[]
      postId?: number
      termId?: number
    }

    // ========================================================================
    // Post System
    // ========================================================================

    interface Post {
      id: number
      post_type: string
      slug: string
      title: string
      content: string
      excerpt: string
      status: 'draft' | 'published' | 'pending' | 'private' | 'trash'
      parent_id?: number
      menu_order: number
      created_at: string
      updated_at: string
      deleted_at?: string
      meta?: Record<string, any>
      authors?: User[]
      taxonomies?: Record<string, Term[]>
    }

    interface PostTypeConfig {
      slug: string
      name_singular: string
      name_plural: string
      description?: string
      icon?: string
      show_in_menu?: boolean
      capabilities?: Record<string, string>
      supports?: string[]
    }

    interface PostType extends PostTypeConfig {
      id: number
      created_at: string
      fields?: Field[]
      taxonomies?: Taxonomy[]
    }

    interface FieldConfig {
      post_type_slug: string
      slug: string
      label: string
      type: FieldType
      description?: string
      default_value?: any
      required?: boolean
      options?: Record<string, any>
      priority?: number
    }

    interface Field extends FieldConfig {
      id: number
    }

    type FieldType =
      | 'text'
      | 'textarea'
      | 'rich_text'
      | 'number'
      | 'checkbox'
      | 'select'
      | 'radio'
      | 'image'
      | 'file'
      | 'date'
      | 'datetime'
      | 'repeater'
      | 'relationship'

    // ========================================================================
    // Taxonomy System
    // ========================================================================

    interface Term {
      id: number
      taxonomy_slug: string
      slug: string
      name: string
      description: string
      parent_id?: number
      created_at: string
      meta?: Record<string, any>
    }

    interface TaxonomyConfig {
      post_type_slug: string
      slug: string
      name_singular: string
      name_plural: string
      description?: string
      hierarchical?: boolean
      show_in_menu?: boolean
    }

    interface Taxonomy extends TaxonomyConfig {
      id: number
      fields?: Field[]
    }

    // ========================================================================
    // User System
    // ========================================================================

    interface User {
      id: number
      email: string
      display_name: string
      created_at: string
      updated_at: string
      meta?: Record<string, any>
      roles?: Role[]
      capabilities?: string[]
    }

    interface Role {
      id: number
      slug: string
      name: string
      description: string
      capabilities?: Capability[]
    }

    interface Capability {
      id: number
      slug: string
      name: string
      description: string
    }

    // ========================================================================
    // Plugin System
    // ========================================================================

    interface Plugin {
      default(request: PluginRequest): Promise<PluginInstance>
    }

    interface PluginInstance {
      init?(): Promise<void>
      onInstall?(args: LifecycleArgs): Promise<void>
      onActivate?(args: LifecycleArgs): Promise<void>
      onDeactivate?(args: LifecycleArgs): Promise<void>
      onUninstall?(args: LifecycleArgs): Promise<void>
      onUpgrade?(args: UpgradeArgs): Promise<void>
      onDowngrade?(args: UpgradeArgs): Promise<void>
    }

    interface PluginMetadata {
      slug: string
      name: string
      version: string
      description: string
      author: string
      npmPackage?: string
      active: boolean
      htmldrop?: {
        version?: string
        requires?: string
        dependencies?: string[]
      }
    }

    // ========================================================================
    // Theme System
    // ========================================================================

    interface Theme {
      default(request: ThemeRequest): Promise<ThemeInstance>
    }

    interface ThemeInstance {
      init?(): Promise<void>
      render?(): Promise<string>
      onInstall?(args: LifecycleArgs): Promise<void>
      onActivate?(args: LifecycleArgs): Promise<void>
      onDeactivate?(args: LifecycleArgs): Promise<void>
      onUninstall?(args: LifecycleArgs): Promise<void>
      onUpgrade?(args: UpgradeArgs): Promise<void>
      onDowngrade?(args: UpgradeArgs): Promise<void>
    }

    interface ThemeMetadata {
      slug: string
      name: string
      version: string
      description: string
      author: string
      npmPackage?: string
      active: boolean
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    interface LifecycleArgs {
      pluginSlug?: string
      themeSlug?: string
      timestamp: string
    }

    interface UpgradeArgs extends LifecycleArgs {
      oldVersion: string
      newVersion: string
    }

    // ========================================================================
    // Menu System
    // ========================================================================

    interface MenuPageConfig {
      slug: string
      title: string
      component?: string
      icon?: string
      order?: number
      capability?: string
      parent?: string
    }

    interface SubMenuPageConfig extends MenuPageConfig {
      parent: string
    }

    // ========================================================================
    // Query Parameters
    // ========================================================================

    interface PostQueryParams {
      status?: 'draft' | 'published' | 'pending' | 'private' | 'trash'
      limit?: number
      offset?: number
      orderBy?: string
      sort?: 'asc' | 'desc'
      search?: string
      searchable?: string[]
      filters?: Record<string, any>
      meta_query?: MetaQuery
      taxonomy_query?: TaxonomyQuery
      trashed?: boolean
    }

    interface MetaQuery {
      relation?: 'AND' | 'OR'
      queries: MetaQueryCondition[]
    }

    interface MetaQueryCondition {
      key: string
      value: any
      compare?: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN'
    }

    interface TaxonomyQuery {
      relation?: 'AND' | 'OR'
      queries: TaxonomyQueryCondition[]
    }

    interface TaxonomyQueryCondition {
      taxonomy: string
      terms: number[] | string[]
      operator?: 'IN' | 'NOT IN'
    }

    // ========================================================================
    // API Responses
    // ========================================================================

    interface ListResponse<T> {
      items: T[]
      total: number
      total_current?: number
      total_drafts?: number
      total_published?: number
      total_trashed?: number
      limit: number
      offset: number
    }

    interface ErrorResponse {
      error: string
      code?: string
      details?: any
    }

    interface SuccessResponse {
      message: string
      data?: any
    }

    // ========================================================================
    // Authentication
    // ========================================================================

    interface LoginResponse {
      access_token: string
      refresh_token: string
      user: User
    }

    interface TokenPayload {
      id: number
      email: string
      iat: number
      exp: number
    }

    // ========================================================================
    // Upload
    // ========================================================================

    interface UploadedFile {
      fieldname: string
      originalname: string
      encoding: string
      mimetype: string
      destination: string
      filename: string
      path: string
      size: number
    }

    interface AttachmentMeta {
      width?: number
      height?: number
      alt?: string
      caption?: string
      thumbnails?: Record<string, string>
    }

    // ========================================================================
    // Options
    // ========================================================================

    interface Option {
      id: number
      name: string
      value: any
      autoload: boolean
    }

    // ========================================================================
    // Cache
    // ========================================================================

    interface CacheService {
      get<T = any>(key: string): Promise<T | null>
      set(key: string, value: any, ttl?: number): Promise<void>
      del(key: string): Promise<void>
      flush(): Promise<void>
      has(key: string): Promise<boolean>
    }

    // ========================================================================
    // Lifecycle Services
    // ========================================================================

    interface PluginLifecycleService {
      onInstall(pluginSlug: string): Promise<void>
      onActivate(pluginSlug: string): Promise<void>
      onDeactivate(pluginSlug: string): Promise<void>
      onUninstall(pluginSlug: string): Promise<void>
      onUpgrade(pluginSlug: string, oldVersion: string, newVersion: string): Promise<void>
      onDowngrade(pluginSlug: string, oldVersion: string, newVersion: string): Promise<void>
      checkDependencies(pluginSlug: string): Promise<{ met: boolean; missing: string[] }>
      getDependentPlugins(pluginSlug: string): Promise<string[]>
      createBackup(pluginSlug: string): Promise<string>
      restoreBackup(pluginSlug: string, backupPath: string): Promise<void>
    }

    interface ThemeLifecycleService {
      onInstall(themeSlug: string): Promise<void>
      onActivate(themeSlug: string): Promise<void>
      onDeactivate(themeSlug: string): Promise<void>
      onUninstall(themeSlug: string): Promise<void>
      onUpgrade(themeSlug: string, oldVersion: string, newVersion: string): Promise<void>
      onDowngrade(themeSlug: string, oldVersion: string, newVersion: string): Promise<void>
      getActiveTheme(): Promise<string | null>
      setActiveTheme(themeSlug: string): Promise<void>
      createBackup(themeSlug: string): Promise<string>
      restoreBackup(themeSlug: string, backupPath: string): Promise<void>
    }

    // ========================================================================
    // Constants
    // ========================================================================

    interface Constants {
      HTTP_STATUS: Record<string, number>
      POST_STATUS: Record<string, string>
      USER_ROLES: Record<string, string>
      CAPABILITIES: Record<string, string>
      UPLOAD_LIMITS: Record<string, number>
      ALLOWED_FILE_EXTENSIONS: Record<string, string[]>
      getAllowedFileExtensions: () => string[] | null
      MIME_TYPES: Record<string, string>
      TOKEN_EXPIRY: Record<string, string>
      RATE_LIMITS: Record<string, number | Record<string, number>>
      PAGINATION: Record<string, number>
      CACHE_TTL: Record<string, number>
      ERROR_CODES: Record<string, string>
      ERROR_MESSAGES: Record<string, string>
    }
  }
}

export = HTMLDrop
export as namespace HTMLDrop
