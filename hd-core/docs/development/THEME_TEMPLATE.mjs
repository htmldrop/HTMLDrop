/**
 * Theme Template with Full Type Support
 *
 * Copy this template when creating a new theme.
 *
 * APPROACH 1 (Recommended): Using helper functions for automatic type inference
 */
import { createContext } from '../../types/context.mjs'

/**
 * @param {HTMLDrop.ThemeRequest} params - Theme initialization parameters
 * @returns {Promise<HTMLDrop.ThemeInstance>} Theme instance with lifecycle methods
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
     * Initialize theme - runs when theme is loaded
     */
    async init() {
      // Register action hooks
      hooks.addAction('init', async () => {
        console.log('Theme initialized!')
      })

      // Register filter hooks to modify content
      hooks.addFilter('the_content', (content, post) => {
        // Add custom wrapper or formatting
        return content
      })

      hooks.addFilter('the_title', (title, post) => {
        // Modify titles if needed
        return title
      })

      // Add admin menu pages for theme settings
      hooks.addMenuPage({
        slug: 'theme-settings',
        title: 'Theme Settings',
        icon: 'palette',
        component: '/path/to/settings-component.vue',
        capability: 'manage_options'
      })

      // Database queries with full IntelliSense
      const options = await context.knex(context.table('options'))
        .where('name', 'like', 'theme_%')

      console.log('Theme options loaded:', options.length)
    },

    /**
     * Render theme - handles SSR and routing
     * This is where you implement your frontend rendering logic
     */
    async render() {
      // Serve static assets
      // router.use(express.static('client'))

      // Handle SSR routes
      router.get('*', async (req, res) => {
        try {
          // Your SSR rendering logic here
          // Example: const html = await renderToString(app)
          // res.send(html)

          res.send('<h1>Theme Render</h1>')
        } catch (error) {
          console.error('Theme render error:', error)
          res.status(500).send('Server Error')
        }
      })
    },

    /**
     * Runs when theme is installed
     * @param {HTMLDrop.LifecycleArgs} args
     */
    async onInstall(args) {
      console.log('Theme installed:', args.themeSlug)

      // Set default theme options
      await context.knex(context.table('options')).insert({
        name: 'theme_color_scheme',
        value: 'light',
        autoload: true
      })
    },

    /**
     * Runs when theme is activated
     * @param {HTMLDrop.LifecycleArgs} args
     */
    async onActivate(args) {
      console.log('Theme activated:', args.themeSlug)

      // Register custom post types specific to this theme
      await hooks.registerPostType({
        slug: 'portfolio',
        name_singular: 'Portfolio Item',
        name_plural: 'Portfolio',
        description: 'Portfolio showcase',
        icon: 'briefcase',
        show_in_menu: true
      })
    },

    /**
     * Runs when theme is deactivated
     * @param {HTMLDrop.LifecycleArgs} args
     */
    async onDeactivate(args) {
      console.log('Theme deactivated:', args.themeSlug)
    },

    /**
     * Runs when theme is uninstalled
     * @param {HTMLDrop.LifecycleArgs} args
     */
    async onUninstall(args) {
      console.log('Theme uninstalled:', args.themeSlug)

      // Clean up theme-specific options
      await context.knex(context.table('options'))
        .where('name', 'like', 'theme_%')
        .delete()
    },

    /**
     * Runs when theme is upgraded to a new version
     * @param {HTMLDrop.UpgradeArgs} args
     */
    async onUpgrade(args) {
      console.log(`Theme upgrading from ${args.oldVersion} to ${args.newVersion}`)

      // Handle theme migrations, update options format, etc.
    },

    /**
     * Runs when theme is downgraded to an older version
     * @param {HTMLDrop.UpgradeArgs} args
     */
    async onDowngrade(args) {
      console.log(`Theme downgrading from ${args.oldVersion} to ${args.newVersion}`)
    }
  }
}
