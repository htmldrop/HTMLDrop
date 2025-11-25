/**
 * Plugin Template with Full Type Support
 *
 * Copy this template when creating a new plugin.
 *
 * APPROACH 1 (Recommended): Using helper functions for automatic type inference
 */
import { createContext } from '../../types/context.mjs'

/**
 * @param {HTMLDrop.PluginRequest} params - Plugin initialization parameters
 * @returns {Promise<HTMLDrop.PluginInstance>} Plugin instance with lifecycle methods
 */
export default async ({ req, res, next, router }) => {
  // Get context, hooks, and guard with automatic type inference
  const { context, hooks, guard } = createContext(req)

  // Now you get full autocomplete when typing:
  // - context.
  // - hooks.
  // - guard.

  /*
   * APPROACH 2 (Alternative): Using JSDoc type annotations
   *
   * If you prefer not to import, you can use JSDoc annotations instead:
   *
   * /** @type {HTMLDrop.Context} *\/
   * const context = req.context
   *
   * /** @type {HTMLDrop.Hooks} *\/
   * const hooks = req.hooks
   *
   * /** @type {HTMLDrop.Guard} *\/
   * const guard = req.guard
   */

  return {
    /**
     * Initialize plugin - runs when plugin is loaded
     */
    async init() {
      // Register action hooks
      hooks.addAction('init', async () => {
        console.log('Plugin initialized!')
      })

      // Register filter hooks
      hooks.addFilter('the_content', (content, post) => {
        return `<div class="plugin-wrapper">${content}</div>`
      })

      // Register custom post type
      await hooks.registerPostType({
        slug: 'products',
        name_singular: 'Product',
        name_plural: 'Products',
        description: 'Product catalog',
        icon: 'shopping-cart',
        show_in_menu: true
      })

      // Register custom fields
      await hooks.registerPostField({
        post_type_slug: 'products',
        slug: 'price',
        label: 'Price',
        type: 'number',
        required: true
      })

      // Database queries with full IntelliSense
      const posts = await context.knex(context.table('posts'))
        .where('status', 'published')
        .limit(10)

      // Add REST API endpoint
      router.get('/api/my-plugin/data', async (req, res) => {
        try {
          // Check permissions
          const hasAccess = await guard.user({
            userId: req.user?.id,
            canOneOf: ['read', 'read_posts']
          })

          if (!hasAccess) {
            return res.status(403).json({ error: 'Permission denied' })
          }

          res.json({ message: 'Success', data: [] })
        } catch (error) {
          res.status(500).json({ error: error.message })
        }
      })
    },

    /**
     * Runs when plugin is installed
     * @param {HTMLDrop.LifecycleArgs} args
     */
    async onInstall(args) {
      console.log('Plugin installed:', args.pluginSlug)

      // Create database tables, add default options, etc.
      await context.knex.schema.createTableIfNotExists(context.table('plugin_data'), (table) => {
        table.increments('id')
        table.string('key').unique()
        table.text('value')
        table.timestamps(true, true)
      })
    },

    /**
     * Runs when plugin is activated
     * @param {HTMLDrop.LifecycleArgs} args
     */
    async onActivate(args) {
      console.log('Plugin activated:', args.pluginSlug)
    },

    /**
     * Runs when plugin is deactivated
     * @param {HTMLDrop.LifecycleArgs} args
     */
    async onDeactivate(args) {
      console.log('Plugin deactivated:', args.pluginSlug)
    },

    /**
     * Runs when plugin is uninstalled
     * @param {HTMLDrop.LifecycleArgs} args
     */
    async onUninstall(args) {
      console.log('Plugin uninstalled:', args.pluginSlug)

      // Clean up database tables, remove options, etc.
      await context.knex.schema.dropTableIfExists(context.table('plugin_data'))
    },

    /**
     * Runs when plugin is upgraded to a new version
     * @param {HTMLDrop.UpgradeArgs} args
     */
    async onUpgrade(args) {
      console.log(`Upgrading from ${args.oldVersion} to ${args.newVersion}`)

      // Run migrations, update database schema, etc.
    },

    /**
     * Runs when plugin is downgraded to an older version
     * @param {HTMLDrop.UpgradeArgs} args
     */
    async onDowngrade(args) {
      console.log(`Downgrading from ${args.oldVersion} to ${args.newVersion}`)
    }
  }
}
