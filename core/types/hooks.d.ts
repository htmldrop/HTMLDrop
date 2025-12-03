/**
 * Hooks & Filters Types
 */

declare global {
  namespace HTMLDrop {
    interface Hooks {
      // ========================================================================
      // Core Actions & Filters
      // ========================================================================

      /**
       * Register an action hook that runs at a specific point in execution
       */
      addAction(name: string, callback: HookCallback, priority?: number): void

      /**
       * Trigger all callbacks registered for an action hook
       */
      doAction(name: string, ...args: any[]): Promise<void>

      /**
       * Register a filter hook that modifies a value
       */
      addFilter(name: string, callback: FilterCallback, priority?: number): void

      /**
       * Apply all registered filters to a value
       */
      applyFilters(name: string, value: any, ...args: any[]): any

      // ========================================================================
      // Post Types
      // ========================================================================

      /**
       * Register a custom post type
       */
      registerPostType(config: PostTypeConfig, priority?: number): Promise<void>

      /**
       * Register a custom field for a post type
       */
      registerPostField(config: FieldConfig, priority?: number): Promise<void>

      /**
       * Get a post type by slug
       */
      getPostType(slug: string): Promise<PostType | null>

      /**
       * Get all registered post types
       */
      getAllPostTypes(): Promise<PostType[]>

      /**
       * Get all custom fields for a post type
       */
      getFields(postTypeSlug: string): Promise<Field[]>

      // ========================================================================
      // Taxonomies
      // ========================================================================

      /**
       * Register a taxonomy for a post type
       */
      registerTaxonomy(config: TaxonomyConfig, priority?: number): Promise<void>

      /**
       * Register a custom field for a taxonomy
       */
      registerTermField(config: FieldConfig, priority?: number): Promise<void>

      /**
       * Get a taxonomy by post type and slug
       */
      getTaxonomy(postType: string, slug: string): Promise<Taxonomy | null>

      /**
       * Get all taxonomies for a post type
       */
      getAllTaxonomies(postType: string): Promise<Taxonomy[]>

      /**
       * Get all fields for a taxonomy
       */
      getTaxonomyFields(postType: string, taxonomySlug: string): Promise<Field[]>

      // ========================================================================
      // Admin Menu
      // ========================================================================

      /**
       * Add a top-level menu page to the admin dashboard
       */
      addMenuPage(config: MenuPageConfig): Promise<void>

      /**
       * Add a submenu page under an existing menu
       */
      addSubMenuPage(config: SubMenuPageConfig): Promise<void>

      /**
       * Get the admin menu tree structure
       */
      getMenuTree(): Promise<MenuItem[]>

      // ========================================================================
      // Controls
      // ========================================================================

      /**
       * Add a custom field control type
       */
      addControl(config: { slug: string; callback: () => any }): Promise<void>

      /**
       * Get available field control types
       */
      getControls(): Promise<Control[]>

      // ========================================================================
      // Jobs
      // ========================================================================

      /**
       * Create a new background job
       */
      createJob(config: JobConfig): Promise<Job>

      /**
       * Get jobs with optional filtering
       */
      getJobs(options?: JobQueryOptions): Promise<Job[]>

      /**
       * Get a single job by jobId (slug)
       */
      getJob(jobId: string): Promise<Job | null>

      /**
       * Cleanup old completed/failed jobs
       */
      cleanupOldJobs(daysOld?: number): Promise<number>

      // ========================================================================
      // Content Helpers
      // ========================================================================

      /**
       * Get the URL for an attachment by ID or slug
       */
      getAttachmentUrl(idOrSlug: string | number): Promise<string | null>

      /**
       * Generate an excerpt from post content
       */
      theExcerpt(post: Post, length?: number): string

      // ========================================================================
      // Email
      // ========================================================================

      /**
       * Send an email
       */
      sendEmail(options: EmailOptions): Promise<void>

      /**
       * Send a welcome email to a new user
       */
      sendWelcomeEmail(user: User): Promise<void>

      /**
       * Send a password reset email
       */
      sendPasswordResetEmail(user: User, token: string, expiry: Date): Promise<void>

      /**
       * Send an email using a template function
       */
      sendTemplateEmail(to: string, templateFn: (data: any) => string, data: any): Promise<void>

      /**
       * Verify email connection is working
       */
      verifyEmailConnection(): Promise<boolean>

      // ========================================================================
      // Performance Tracing
      // ========================================================================

      /**
       * Performance tracer instance (if tracing is enabled)
       */
      tracer: PerformanceTracer | null

      /**
       * Start a new trace span
       */
      startSpan(name: string, options?: { category?: string; tags?: Record<string, any> }): TraceSpan

      /**
       * Execute a function within a trace span
       */
      trace<T>(name: string, fn: (span: TraceSpan) => Promise<T>, options?: { category?: string }): Promise<T>

      /**
       * Get the currently active span
       */
      getCurrentSpan(): TraceSpan | null

      // ========================================================================
      // Registry Access (for advanced use)
      // ========================================================================

      /** Admin menu registry */
      adminMenu: any

      /** Controls registry */
      controls: any

      /** Post types registry */
      postTypes: any

      /** Taxonomies registry */
      taxonomies: any

      /** Themes registry */
      themes: any

      /** Plugins registry */
      plugins: any

      /** Jobs registry */
      jobs: any

      /** Email providers registry */
      emailProviders: any
    }

    /**
     * Callback function for action hooks
     */
    type HookCallback = (...args: any[]) => Promise<void> | void

    /**
     * Callback function for filter hooks
     */
    type FilterCallback = (value: any, ...args: any[]) => any
  }
}

export {}
