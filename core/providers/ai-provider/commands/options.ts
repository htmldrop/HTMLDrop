import type { AICommand, AICommandResult } from '../../../registries/RegisterAICommands.ts'

type RegisterFn = (command: AICommand, priority?: number) => void

export default function registerOptionCommands(register: RegisterFn, context: HTMLDrop.Context): void {
  const { knex, table } = context

  register({
    slug: 'options.list',
    name: 'List Options',
    description: 'List all site options',
    category: 'options',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_option', 'manage_options'],
    parameters: [
      { name: 'search', type: 'string', required: false, description: 'Search by option name' },
      { name: 'limit', type: 'number', required: false, description: 'Number of options to return' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { search, limit = 50 } = params as { search?: string; limit?: number }

      let query = knex!(table('options'))
        .select('id', 'name', 'value', 'autoload')
        .orderBy('name', 'asc')
        .limit(limit)

      if (search) {
        query = query.where('name', 'like', `%${search}%`)
      }

      const options = await query

      // Parse JSON values
      const parsed = options.map((opt: { id: number; name: string; value: string; autoload: number }) => {
        let value = opt.value
        try {
          value = JSON.parse(opt.value)
        } catch {
          // Keep as string
        }
        return { ...opt, value, autoload: Boolean(opt.autoload) }
      })

      return {
        success: true,
        message: `Found ${parsed.length} options`,
        data: { options: parsed }
      }
    }
  })

  register({
    slug: 'options.get',
    name: 'Get Option',
    description: 'Get a specific option value',
    category: 'options',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_option', 'manage_options'],
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Option name' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { name } = params as { name: string }

      const option = await knex!(table('options')).where('name', name).first()

      if (!option) {
        return { success: false, message: `Option not found: ${name}`, error: 'NOT_FOUND' }
      }

      let value = option.value
      try {
        value = JSON.parse(option.value)
      } catch {
        // Keep as string
      }

      return {
        success: true,
        message: `Option value for ${name}`,
        data: { name, value, autoload: Boolean(option.autoload) }
      }
    }
  })

  register({
    slug: 'options.set',
    name: 'Set Option',
    description: 'Set or update an option value',
    category: 'options',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['edit_options', 'create_options'],
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Option name' },
      { name: 'value', type: 'string', required: true, description: 'Option value (can be JSON string)' },
      { name: 'autoload', type: 'boolean', required: false, description: 'Whether to autoload this option' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { name, value, autoload } = params as { name: string; value: string; autoload?: boolean }

      // Serialize value if it's an object
      const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value)

      const existing = await knex!(table('options')).where('name', name).first()

      if (existing) {
        const updateData: Record<string, unknown> = { value: serializedValue }
        if (autoload !== undefined) {
          updateData.autoload = autoload ? 1 : 0
        }
        await knex!(table('options')).where('name', name).update(updateData)
        return {
          success: true,
          message: `Option ${name} updated`
        }
      } else {
        await knex!(table('options')).insert({
          name,
          value: serializedValue,
          autoload: autoload ? 1 : 0
        })
        return {
          success: true,
          message: `Option ${name} created`
        }
      }
    }
  })

  register({
    slug: 'options.delete',
    name: 'Delete Option',
    description: 'Delete an option',
    category: 'options',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['delete_options'],
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Option name to delete' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { name } = params as { name: string }

      const existing = await knex!(table('options')).where('name', name).first()

      if (!existing) {
        return { success: false, message: `Option not found: ${name}`, error: 'NOT_FOUND' }
      }

      // Prevent deleting critical options
      const protectedOptions = ['active_plugins', 'active_theme', 'site_url', 'site_name']
      if (protectedOptions.includes(name)) {
        return {
          success: false,
          message: `Cannot delete protected option: ${name}`,
          error: 'PROTECTED_OPTION'
        }
      }

      await knex!(table('options')).where('name', name).del()

      return {
        success: true,
        message: `Option ${name} deleted`
      }
    }
  })

  register({
    slug: 'options.search',
    name: 'Search Options',
    description: 'Search options by name pattern',
    category: 'options',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_option', 'manage_options'],
    parameters: [
      { name: 'pattern', type: 'string', required: true, description: 'Search pattern (supports % wildcards)' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { pattern } = params as { pattern: string }

      const options = await knex!(table('options'))
        .where('name', 'like', pattern)
        .select('name', 'value', 'autoload')
        .orderBy('name', 'asc')

      const parsed = options.map((opt: { name: string; value: string; autoload: number }) => {
        let value = opt.value
        try {
          value = JSON.parse(opt.value)
        } catch {
          // Keep as string
        }
        return { ...opt, value, autoload: Boolean(opt.autoload) }
      })

      return {
        success: true,
        message: `Found ${parsed.length} options matching "${pattern}"`,
        data: { options: parsed }
      }
    }
  })
}
