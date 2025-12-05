import type { AICommand, AICommandResult } from '../../../registries/RegisterAICommands.ts'
import fs from 'fs'
import path from 'path'

type RegisterFn = (command: AICommand, priority?: number) => void

export default function registerThemeCommands(register: RegisterFn, context: HTMLDrop.Context): void {
  const { knex, table } = context

  register({
    slug: 'themes.list',
    name: 'List Themes',
    description: 'List all installed themes with their status',
    category: 'themes',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_themes', 'activate_themes'],
    parameters: [],
    contextProviders: ['themes'],
    execute: async (): Promise<AICommandResult> => {
      const themesDir = path.resolve('./content/themes')
      const themes: Array<{ slug: string; name: string; version: string; active: boolean }> = []

      if (!fs.existsSync(themesDir)) {
        return { success: true, message: 'No themes installed', data: { themes: [], total: 0 } }
      }

      const active = await knex!(table('options')).where('name', 'active_theme').first()
      const activeTheme = active?.value || null

      const folders = fs.readdirSync(themesDir, { withFileTypes: true })
        .filter((f) => f.isDirectory())
        .map((f) => f.name)

      for (const folder of folders) {
        const configPath = path.join(themesDir, folder, 'config.mjs')
        if (fs.existsSync(configPath)) {
          try {
            const mod = await import(configPath)
            themes.push({
              slug: folder,
              name: mod.default?.name || folder,
              version: mod.default?.version || 'unknown',
              active: folder === activeTheme
            })
          } catch {
            themes.push({
              slug: folder,
              name: folder,
              version: 'unknown',
              active: folder === activeTheme
            })
          }
        }
      }

      return {
        success: true,
        message: `Found ${themes.length} themes`,
        data: { themes, total: themes.length, activeTheme }
      }
    }
  })

  register({
    slug: 'themes.get',
    name: 'Get Theme Details',
    description: 'Get detailed information about a specific theme',
    category: 'themes',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_themes', 'activate_themes'],
    parameters: [
      { name: 'slug', type: 'string', required: true, description: 'The theme slug' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { slug } = params as { slug: string }
      const themeDir = path.resolve(`./content/themes/${slug}`)

      if (!fs.existsSync(themeDir)) {
        return { success: false, message: `Theme not found: ${slug}`, error: 'NOT_FOUND' }
      }

      const configPath = path.join(themeDir, 'config.mjs')
      let config: Record<string, unknown> = {}

      if (fs.existsSync(configPath)) {
        try {
          const mod = await import(configPath)
          config = mod.default || {}
        } catch {
          // Ignore config parse errors
        }
      }

      const active = await knex!(table('options')).where('name', 'active_theme').first()
      const activeTheme = active?.value || null

      return {
        success: true,
        message: `Theme details for ${slug}`,
        data: {
          slug,
          name: config.name || slug,
          version: config.version || 'unknown',
          description: config.description || '',
          author: config.author || '',
          active: slug === activeTheme,
          config
        }
      }
    }
  })

  register({
    slug: 'themes.activate',
    name: 'Activate Theme',
    description: 'Activate an installed theme (only one theme can be active at a time)',
    category: 'themes',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['activate_themes'],
    parameters: [
      { name: 'slug', type: 'string', required: true, description: 'The theme slug to activate' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { slug } = params as { slug: string }
      const themeDir = path.resolve(`./content/themes/${slug}`)

      if (!fs.existsSync(themeDir)) {
        return { success: false, message: `Theme not found: ${slug}`, error: 'NOT_FOUND' }
      }

      const active = await knex!(table('options')).where('name', 'active_theme').first()

      if (active?.value === slug) {
        return { success: true, message: `Theme ${slug} is already active` }
      }

      if (active) {
        await knex!(table('options'))
          .where('name', 'active_theme')
          .update({ value: slug })
      } else {
        await knex!(table('options')).insert({
          name: 'active_theme',
          value: slug,
          autoload: 1
        })
      }

      return {
        success: true,
        message: `Theme ${slug} has been activated. Note: A server restart may be required for full effect.`
      }
    }
  })

  register({
    slug: 'themes.deactivate',
    name: 'Deactivate Theme',
    description: 'Deactivate the currently active theme',
    category: 'themes',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['activate_themes'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      const active = await knex!(table('options')).where('name', 'active_theme').first()

      if (!active?.value) {
        return { success: true, message: 'No theme is currently active' }
      }

      const previousTheme = active.value
      await knex!(table('options'))
        .where('name', 'active_theme')
        .update({ value: '' })

      return {
        success: true,
        message: `Theme ${previousTheme} has been deactivated`
      }
    }
  })

  register({
    slug: 'themes.search',
    name: 'Search NPM for Themes',
    description: 'Search the NPM registry for HTMLDrop themes',
    category: 'themes',
    type: 'read',
    permission: 'auto',
    capabilities: ['upload_themes'],
    parameters: [
      { name: 'query', type: 'string', required: false, description: 'Search query (optional)' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { query } = params as { query?: string }
      const searchQuery = query ? `hd-theme ${query}` : 'hd-theme'

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
          message: `Found ${packages.length} themes on NPM`,
          data: { packages }
        }
      } catch {
        return {
          success: false,
          message: 'Failed to search NPM registry',
          error: 'NPM_SEARCH_FAILED'
        }
      }
    }
  })

  register({
    slug: 'themes.delete',
    name: 'Delete Theme',
    description: 'Permanently delete an installed theme',
    category: 'themes',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['delete_themes'],
    parameters: [
      { name: 'slug', type: 'string', required: true, description: 'The theme slug to delete' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { slug } = params as { slug: string }
      const themeDir = path.resolve(`./content/themes/${slug}`)

      if (!fs.existsSync(themeDir)) {
        return { success: false, message: `Theme not found: ${slug}`, error: 'NOT_FOUND' }
      }

      // Check if theme is active
      const active = await knex!(table('options')).where('name', 'active_theme').first()

      if (active?.value === slug) {
        return {
          success: false,
          message: `Cannot delete active theme ${slug}. Please deactivate it first.`,
          error: 'THEME_ACTIVE'
        }
      }

      // Delete the theme directory
      fs.rmSync(themeDir, { recursive: true, force: true })

      return {
        success: true,
        message: `Theme ${slug} has been deleted`
      }
    }
  })
}
