import path from 'path'

/**
 * Badge Count Architecture:
 *
 * This provider runs on EVERY API request through registryMiddleware, so we ONLY read
 * from a lightweight database cache. The actual counting happens separately:
 *
 * 1. Badge counts are stored in the `options` table as JSON with timestamp
 * 2. All workers share the same database cache (no per-worker duplication)
 * 3. Actual counting happens via:
 *    - Scheduled task (every 2 minutes) for plugins/themes/cms updates
 *    - POST /api/v1/badge-counts/refresh (manual trigger)
 *    - Respects 2-minute cache TTL automatically
 *
 * This ensures minimal overhead on every request while keeping badge counts fresh.
 */

// Helper: Get badge counts from database cache (shared across workers)
const getBadgeCounts = async ({ knex, table }) => {
  try {
    // Try to get cached values from options table
    const [pluginCache, themeCache, cmsCache] = await Promise.all([
      knex(table('options')).where('name', 'badge_count_plugins_cache').first(),
      knex(table('options')).where('name', 'badge_count_themes_cache').first(),
      knex(table('options')).where('name', 'badge_count_cms_cache').first()
    ])

    let pluginsBadge = 0
    let themesBadge = 0
    let cmsBadge = 0

    // Use cached plugin count (show stale data rather than 0)
    if (pluginCache?.value) {
      try {
        const cached = JSON.parse(pluginCache.value)
        pluginsBadge = cached.count || 0
      } catch (err) {
        // Invalid cache, will use 0
      }
    }

    // Use cached theme count (show stale data rather than 0)
    if (themeCache?.value) {
      try {
        const cached = JSON.parse(themeCache.value)
        themesBadge = cached.count || 0
      } catch (err) {
        // Invalid cache, will use 0
      }
    }

    // Use cached CMS update status (show stale data rather than 0)
    if (cmsCache?.value) {
      try {
        const cached = JSON.parse(cmsCache.value)
        cmsBadge = cached.available ? 1 : 0
      } catch (err) {
        // Invalid cache, will use 0
      }
    }

    return { pluginsBadge, themesBadge, cmsBadge }
  } catch (error) {
    console.error('Failed to get badge counts from cache:', error)
    return { pluginsBadge: 0, themesBadge: 0, cmsBadge: 0 }
  }
}

export default async ({ req, res, next }) => {
  const { addMenuPage, addSubMenuPage } = req.hooks
  const { translate, parseVue, knex, table } = req.context
  const locale = req?.user?.locale || 'en_US'

  // Get badge counts from shared database cache (lightweight, shared across workers)
  let updatesBadge = 0
  let pluginsBadge = 0
  let themesBadge = 0
  let cmsBadge = 0
  let totalUpdatesBadge = 0

  try {
    const badges = await getBadgeCounts({ knex, table })
    pluginsBadge = badges.pluginsBadge
    themesBadge = badges.themesBadge
    cmsBadge = badges.cmsBadge
    updatesBadge = cmsBadge // CMS updates only for Updates submenu

    // Total badge for Dashboard parent (sum of all updates)
    totalUpdatesBadge = pluginsBadge + themesBadge + cmsBadge
  } catch (error) {
    console.error('Failed to get badge counts:', error)
  }

  const adminPages = [
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: totalUpdatesBadge,
      position: 1000,
      file: 'Dashboard.vue',
      slug: 'dashboard',
      page_title: translate('Dashboard', locale),
      menu_title: translate('Dashboard', locale),
      icon: '<svg fill="currentColor" width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M26 16a9.9 9.9 0 0 0-1.14-4.618l-1.495 1.496A7.95 7.95 0 0 1 24 16Zm-2.586-6L22 8.586 17.285 13.3A3 3 0 0 0 16 13a3 3 0 1 0 3 3 3 3 0 0 0-.3-1.285ZM16 17a1 1 0 1 1 1-1 1 1 0 0 1-1 1m0-9a8 8 0 0 1 3.122.635l1.496-1.496A9.986 9.986 0 0 0 6 16h2a8.01 8.01 0 0 1 8-8"/><path d="M16 30a14 14 0 1 1 14-14 14.016 14.016 0 0 1-14 14m0-26a12 12 0 1 0 12 12A12.014 12.014 0 0 0 16 4"/><path data-name="&lt;Transparent Rectangle&gt;" style="fill:none" d="M0 0h32v32H0z"/></svg>'
    },
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: themesBadge,
      position: 7200,
      file: 'Themes.vue',
      slug: 'appearance',
      page_title: translate('Themes', locale),
      menu_title: translate('Appearance', locale),
      icon: '<svg fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="none" d="M0 0h20v20H0z"/><path d="M14.48 11.06 7.41 3.99l1.5-1.5c.5-.56 2.3-.47 3.51.32 1.21.8 1.43 1.28 2.91 2.1 1.18.64 2.45 1.26 4.45.85zm-.71.71L6.7 4.7 4.93 6.47a.996.996 0 0 0 0 1.41l1.06 1.06c.39.39.39 1.03 0 1.42-.6.6-1.43 1.11-2.21 1.69-.35.26-.7.53-1.01.84C1.43 14.23.4 16.08 1.4 17.07c.99 1 2.84-.03 4.18-1.36.31-.31.58-.66.85-1.02.57-.78 1.08-1.61 1.69-2.21a.996.996 0 0 1 1.41 0l1.06 1.06c.39.39 1.02.39 1.41 0z"/></svg>'
    },
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: pluginsBadge,
      position: 7300,
      file: 'Plugins.vue',
      slug: 'plugins',
      page_title: translate('Plugins', locale),
      menu_title: translate('Plugins', locale),
      icon: '<svg fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="none" d="M0 0h20v20H0z"/><path d="M13.11 4.36 9.87 7.6 8 5.73l3.24-3.24c.35-.34 1.05-.2 1.56.32.52.51.66 1.21.31 1.55m-8 1.77.91-1.12 9.01 9.01-1.19.84c-.71.71-2.63 1.16-3.82 1.16H6.14L4.9 17.26c-.59.59-1.54.59-2.12 0a1.49 1.49 0 0 1 0-2.12l1.24-1.24v-3.88c0-1.13.4-3.19 1.09-3.89m7.26 3.97 3.24-3.24c.34-.35 1.04-.21 1.55.31.52.51.66 1.21.31 1.55l-3.24 3.25z"/></svg>'
    },
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: 0,
      position: 7400,
      file: '',
      slug: 'users',
      name_singular: translate('user', locale),
      name_plural: translate('users', locale),
      page_title: translate('Users', locale),
      menu_title: translate('Users', locale),
      icon: '<svg fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="none" d="M0 0h20v20H0z"/><path d="M10 9.25c-2.27 0-2.73-3.44-2.73-3.44C7 4.02 7.82 2 9.97 2c2.16 0 2.98 2.02 2.71 3.81 0 0-.41 3.44-2.68 3.44m0 2.57L12.72 10c2.39 0 4.52 2.33 4.52 4.53v2.49s-3.65 1.13-7.24 1.13c-3.65 0-7.24-1.13-7.24-1.13v-2.49c0-2.25 1.94-4.48 4.47-4.48z"/></svg>'
    },
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: 0,
      position: 7500,
      file: 'Dashboard.vue',
      slug: 'tools',
      page_title: translate('Tools', locale),
      menu_title: translate('Tools', locale),
      icon: '<svg fill="currentColor" viewBox="0 -8 72 72" id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg"><defs><style>.cls-1{fill:currentColor}</style></defs><path class="cls-1" d="M13.32 44.31a4.5 4.5 0 0 0 6.36 6.36l14.76-14.76-6.36-6.36ZM50.2 16.96l6.43-3.33L60 7.13l-3.14-3.14-6.5 3.37-3.33 6.42-7.82 7.83 3.17 3.18z"/><path class="cls-1" d="M51.61 34H51a8.9 8.9 0 0 0-3.11.58L29.45 16.09A8.9 8.9 0 0 0 30 13l-.06-.6a8.9 8.9 0 0 0-12.75-7.51l6 6a3 3 0 0 1 .68 1.08A3 3 0 0 1 21 16a2.9 2.9 0 0 1-1-.21 3.15 3.15 0 0 1-1.08-.67l-6-6a8.9 8.9 0 0 0 7.49 12.78l.59.1a8.9 8.9 0 0 0 3.11-.58L42.6 39.84A8.9 8.9 0 0 0 42 43l.06.6A9 9 0 0 0 51 51.94a8.7 8.7 0 0 0 3.85-.9l-6-6a3.1 3.1 0 0 1-.64-1.04A3 3 0 0 1 51 40a2.9 2.9 0 0 1 1 .21 2.7 2.7 0 0 1 1.08.67l6 6A8.9 8.9 0 0 0 51.61 34"/></svg>'
    },
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: 0,
      position: 7600,
      file: '',
      slug: 'settings',
      name_singular: translate('setting', locale),
      name_plural: translate('settings', locale),
      page_title: translate('Settings', locale),
      menu_title: translate('Settings', locale),
      icon: '<svg fill="currentColor" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.5 2h-1v5h1zm6.1 5H6.4L6 6.45v-1L6.4 5h3.2l.4.5v1zm-5 3H1.4L1 9.5v-1l.4-.5h3.2l.4.5v1zm3.9-8h-1v2h1zm-1 6h1v6h-1zm-4 3h-1v3h1zm7.9 0h3.19l.4-.5v-.95l-.4-.5H11.4l-.4.5v.95zm2.1-9h-1v6h1zm-1 10h1v2h-1z"/></svg>'
    }
  ]

  const adminSubPages = [
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: 0,
      position: 1000,
      file: 'Dashboard.vue',
      parent_slug: 'dashboard',
      slug: '',
      page_title: translate('Home', locale),
      menu_title: translate('Home', locale)
    },
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: totalUpdatesBadge,
      position: 1100,
      file: 'Updates.vue',
      parent_slug: 'dashboard',
      slug: 'updates',
      page_title: translate('Updates', locale),
      menu_title: translate('Updates', locale)
    },
    {
      capabilities: { manage_dashboard: 'manage_users' },
      badge: 0,
      position: 1000,
      file: '',
      parent_slug: 'users',
      slug: '',
      name_singular: translate('user', locale),
      name_plural: translate('users', locale),
      page_title: translate('Home', locale),
      menu_title: translate('Home', locale)
    },
    {
      capabilities: { manage_roles: 'manage_roles' },
      badge: 0,
      position: 1100,
      file: 'Roles.vue',
      parent_slug: 'users',
      slug: 'roles',
      page_title: translate('Roles & Capabilities', locale),
      menu_title: translate('Roles', locale)
    },
    {
      capabilities: { manage_dashboard: 'manage_options' },
      badge: 0,
      position: 1000,
      file: '',
      parent_slug: 'settings',
      name_singular: translate('setting', locale),
      name_plural: translate('settings', locale),
      slug: '',
      page_title: translate('Home', locale),
      menu_title: translate('Home', locale)
    },
    {
      capabilities: { manage_plugins: 'manage_plugins' },
      badge: 0,
      position: 1000,
      file: 'Plugins.vue',
      parent_slug: 'plugins',
      slug: '',
      page_title: translate('Installed plugins', locale),
      menu_title: translate('Installed plugins', locale)
    },
    {
      capabilities: { manage_plugins: 'manage_plugins' },
      badge: 0,
      position: 1100,
      file: 'InstallPlugins.vue',
      parent_slug: 'plugins',
      slug: 'install',
      page_title: translate('Install plugins', locale),
      menu_title: translate('Install plugins', locale)
    },
    {
      capabilities: { manage_themes: 'manage_themes' },
      badge: 0,
      position: 1000,
      file: 'Themes.vue',
      parent_slug: 'appearance',
      slug: '',
      page_title: translate('Installed themes', locale),
      menu_title: translate('Themes', locale)
    },
    {
      capabilities: { manage_themes: 'manage_themes' },
      badge: 0,
      position: 1100,
      file: 'InstallThemes.vue',
      parent_slug: 'appearance',
      slug: 'install',
      page_title: translate('Install themes', locale),
      menu_title: translate('Install themes', locale)
    },
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: 0,
      position: 1200,
      file: 'Menus.vue',
      parent_slug: 'appearance',
      slug: 'menus',
      page_title: translate('Menus', locale),
      menu_title: translate('Menus', locale)
    },
    {
      capabilities: { manage_dashboard: 'manage_dashboard' },
      badge: 0,
      position: 1100,
      file: 'PostTypes.vue',
      parent_slug: 'settings',
      slug: 'post-types',
      page_title: translate('Post Types', locale),
      menu_title: translate('Post Types', locale)
    }
  ]

  for (const { name_singular, name_plural, badge, capabilities, position, file, slug, page_title, menu_title, icon } of adminPages) {
    await addMenuPage({
      badge,
      capabilities,
      slug,
      page_title,
      menu_title,
      name_singular,
      name_plural,
      position,
      icon,
      callback: async () => {
        if (!file) return ''
        const filePath = path.resolve(`./core/providers/dashboard-provider/ui-menu/${slug}/${file}`)
        return parseVue(filePath)
      }
    })
  }
  for (const { name_singular, name_plural, badge, capabilities, position, file, parent_slug, slug, page_title, menu_title } of adminSubPages) {
    await addSubMenuPage({
      badge,
      capabilities,
      parent_slug,
      slug,
      page_title,
      menu_title,
      name_singular,
      name_plural,
      position,
      callback: async () => {
        if (!file) return ''
        const filePath = path.resolve(`./core/providers/dashboard-provider/ui-menu/${parent_slug}/${file}`)
        return parseVue(filePath)
      }
    })
  }
}
