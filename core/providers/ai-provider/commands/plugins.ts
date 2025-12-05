import type { AICommand, ExecutionContext, AICommandResult } from '../../../registries/RegisterAICommands.ts'
import fs from 'fs'
import path from 'path'

type RegisterFn = (command: AICommand, priority?: number) => void

export default function registerPluginCommands(register: RegisterFn, context: HTMLDrop.Context): void {
  const { knex, table } = context

  register({
    slug: 'plugins.list',
    name: 'List Plugins',
    description: 'List all installed plugins with their status',
    category: 'plugins',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_plugins', 'activate_plugins'],
    parameters: [],
    contextProviders: ['plugins'],
    execute: async (): Promise<AICommandResult> => {
      const pluginsDir = path.resolve('./content/plugins')
      const plugins: Array<{ slug: string; name: string; version: string; active: boolean }> = []

      if (!fs.existsSync(pluginsDir)) {
        return { success: true, message: 'No plugins installed', data: { plugins: [], total: 0 } }
      }

      const active = await knex!(table('options')).where('name', 'active_plugins').first()
      const activePlugins = active?.value ? JSON.parse(active.value) : []

      const folders = fs.readdirSync(pluginsDir, { withFileTypes: true })
        .filter((f) => f.isDirectory())
        .map((f) => f.name)

      for (const folder of folders) {
        const configPath = path.join(pluginsDir, folder, 'config.mjs')
        if (fs.existsSync(configPath)) {
          try {
            const mod = await import(configPath)
            plugins.push({
              slug: folder,
              name: mod.default?.name || folder,
              version: mod.default?.version || 'unknown',
              active: activePlugins.includes(folder)
            })
          } catch {
            plugins.push({
              slug: folder,
              name: folder,
              version: 'unknown',
              active: activePlugins.includes(folder)
            })
          }
        }
      }

      return {
        success: true,
        message: `Found ${plugins.length} plugins (${plugins.filter(p => p.active).length} active)`,
        data: { plugins, total: plugins.length }
      }
    }
  })

  register({
    slug: 'plugins.get',
    name: 'Get Plugin Details',
    description: 'Get detailed information about a specific plugin',
    category: 'plugins',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_plugins', 'activate_plugins'],
    parameters: [
      { name: 'slug', type: 'string', required: true, description: 'The plugin slug' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { slug } = params as { slug: string }
      const pluginDir = path.resolve(`./content/plugins/${slug}`)

      if (!fs.existsSync(pluginDir)) {
        return { success: false, message: `Plugin not found: ${slug}`, error: 'NOT_FOUND' }
      }

      const configPath = path.join(pluginDir, 'config.mjs')
      let config: Record<string, unknown> = {}

      if (fs.existsSync(configPath)) {
        try {
          const mod = await import(configPath)
          config = mod.default || {}
        } catch {
          // Ignore config parse errors
        }
      }

      const active = await knex!(table('options')).where('name', 'active_plugins').first()
      const activePlugins = active?.value ? JSON.parse(active.value) : []

      return {
        success: true,
        message: `Plugin details for ${slug}`,
        data: {
          slug,
          name: config.name || slug,
          version: config.version || 'unknown',
          description: config.description || '',
          author: config.author || '',
          active: activePlugins.includes(slug),
          config
        }
      }
    }
  })

  register({
    slug: 'plugins.activate',
    name: 'Activate Plugin',
    description: 'Activate an installed plugin',
    category: 'plugins',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['activate_plugins'],
    parameters: [
      { name: 'slug', type: 'string', required: true, description: 'The plugin slug to activate' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { slug } = params as { slug: string }
      const pluginDir = path.resolve(`./content/plugins/${slug}`)

      if (!fs.existsSync(pluginDir)) {
        return { success: false, message: `Plugin not found: ${slug}`, error: 'NOT_FOUND' }
      }

      const active = await knex!(table('options')).where('name', 'active_plugins').first()
      const activePlugins = active?.value ? JSON.parse(active.value) : []

      if (activePlugins.includes(slug)) {
        return { success: true, message: `Plugin ${slug} is already active` }
      }

      activePlugins.push(slug)
      await knex!(table('options'))
        .where('name', 'active_plugins')
        .update({ value: JSON.stringify(activePlugins) })

      return {
        success: true,
        message: `Plugin ${slug} has been activated. Note: A server restart may be required for full effect.`
      }
    }
  })

  register({
    slug: 'plugins.deactivate',
    name: 'Deactivate Plugin',
    description: 'Deactivate an active plugin',
    category: 'plugins',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['deactivate_plugins'],
    parameters: [
      { name: 'slug', type: 'string', required: true, description: 'The plugin slug to deactivate' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { slug } = params as { slug: string }

      const active = await knex!(table('options')).where('name', 'active_plugins').first()
      const activePlugins = active?.value ? JSON.parse(active.value) : []

      if (!activePlugins.includes(slug)) {
        return { success: true, message: `Plugin ${slug} is not active` }
      }

      const newActive = activePlugins.filter((p: string) => p !== slug)
      await knex!(table('options'))
        .where('name', 'active_plugins')
        .update({ value: JSON.stringify(newActive) })

      return {
        success: true,
        message: `Plugin ${slug} has been deactivated`
      }
    }
  })

  register({
    slug: 'plugins.search',
    name: 'Search NPM for Plugins',
    description: 'Search the NPM registry for HTMLDrop plugins',
    category: 'plugins',
    type: 'read',
    permission: 'auto',
    capabilities: ['upload_plugins'],
    parameters: [
      { name: 'query', type: 'string', required: false, description: 'Search query (optional)' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { query } = params as { query?: string }
      const searchQuery = query ? `hd-plugin ${query}` : 'hd-plugin'

      try {
        const response = await fetch(
          `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchQuery)}&size=20`
        )
        const data = await response.json()

        const packages = data.objects?.map((obj: any) => ({
          name: obj.package.name,
          version: obj.package.version,
          description: obj.package.description,
          author: obj.package.author?.name || obj.package.publisher?.username,
          downloads: obj.downloads?.weekly || 0
        })) || []

        return {
          success: true,
          message: `Found ${packages.length} plugins on NPM`,
          data: { packages }
        }
      } catch (error) {
        return {
          success: false,
          message: 'Failed to search NPM registry',
          error: 'NPM_SEARCH_FAILED'
        }
      }
    }
  })

  register({
    slug: 'plugins.delete',
    name: 'Delete Plugin',
    description: 'Permanently delete an installed plugin',
    category: 'plugins',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['delete_plugins'],
    parameters: [
      { name: 'slug', type: 'string', required: true, description: 'The plugin slug to delete' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { slug } = params as { slug: string }
      const pluginDir = path.resolve(`./content/plugins/${slug}`)

      if (!fs.existsSync(pluginDir)) {
        return { success: false, message: `Plugin not found: ${slug}`, error: 'NOT_FOUND' }
      }

      // Check if plugin is active
      const active = await knex!(table('options')).where('name', 'active_plugins').first()
      const activePlugins = active?.value ? JSON.parse(active.value) : []

      if (activePlugins.includes(slug)) {
        return {
          success: false,
          message: `Cannot delete active plugin ${slug}. Please deactivate it first.`,
          error: 'PLUGIN_ACTIVE'
        }
      }

      // Delete the plugin directory
      fs.rmSync(pluginDir, { recursive: true, force: true })

      return {
        success: true,
        message: `Plugin ${slug} has been deleted`
      }
    }
  })
}
