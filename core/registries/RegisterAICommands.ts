import type { Knex } from 'knex'

export interface AICommandParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  description: string
  enum?: string[]
}

export interface AICommandResult {
  success: boolean
  message: string
  data?: unknown
  error?: string
}

export interface ExecutionContext {
  knex: Knex
  table: (name: string) => string
  userId: number
  userCapabilities: string[]
}

export interface AICommand {
  slug: string
  name: string
  description: string
  category: 'plugins' | 'themes' | 'users' | 'posts' | 'options' | 'system' | 'database' | 'jobs' | 'taxonomies' | 'roles'
  type: 'read' | 'write'
  permission: 'auto' | 'require_approval'
  capabilities: string[]
  parameters: AICommandParameter[]
  contextProviders?: string[]
  execute: (params: Record<string, unknown>, context: ExecutionContext) => Promise<AICommandResult>
}

interface RegisteredCommand {
  command: AICommand
  priority: number
}

interface AICommandContext {
  knex?: Knex | null
  table: (name: string) => string
}

export default class RegisterAICommands {
  private context: AICommandContext
  private commands: Map<string, RegisteredCommand>

  constructor(context: AICommandContext) {
    this.context = context
    this.commands = new Map()
  }

  /**
   * Register an AI command with optional priority
   */
  registerAICommand(command: AICommand, priority: number = 10): void {
    if (!command.slug || !command.name || !command.execute) {
      throw new Error('AI command must have slug, name, and execute properties')
    }

    const existing = this.commands.get(command.slug)

    // Only replace if new priority >= existing priority
    if (existing && priority < existing.priority) {
      return
    }

    this.commands.set(command.slug, {
      command,
      priority
    })
  }

  /**
   * Get a single AI command by slug
   */
  getAICommand(slug: string): AICommand | null {
    const registered = this.commands.get(slug)
    return registered?.command || null
  }

  /**
   * Get all registered AI commands
   */
  getAllAICommands(): AICommand[] {
    return Array.from(this.commands.values())
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.command)
  }

  /**
   * Get AI commands by category
   */
  getAICommandsByCategory(category: string): AICommand[] {
    return this.getAllAICommands().filter((cmd) => cmd.category === category)
  }

  /**
   * Get all read-only commands
   */
  getReadCommands(): AICommand[] {
    return this.getAllAICommands().filter((cmd) => cmd.type === 'read')
  }

  /**
   * Get all write commands
   */
  getWriteCommands(): AICommand[] {
    return this.getAllAICommands().filter((cmd) => cmd.type === 'write')
  }

  /**
   * Get commands that can be auto-approved
   */
  getAutoApprovedCommands(): AICommand[] {
    return this.getAllAICommands().filter((cmd) => cmd.permission === 'auto')
  }

  /**
   * Get commands that require user approval
   */
  getRequireApprovalCommands(): AICommand[] {
    return this.getAllAICommands().filter((cmd) => cmd.permission === 'require_approval')
  }

  /**
   * Get commands filtered by user capabilities
   */
  getCommandsForCapabilities(capabilities: string[]): AICommand[] {
    return this.getAllAICommands().filter((cmd) => {
      // If command has no capability requirements, allow it
      if (!cmd.capabilities || cmd.capabilities.length === 0) {
        return true
      }
      // User must have at least one of the required capabilities
      return cmd.capabilities.some((cap) => capabilities.includes(cap))
    })
  }

  /**
   * Get all unique categories
   */
  getCategories(): string[] {
    const categories = new Set<string>()
    for (const { command } of this.commands.values()) {
      categories.add(command.category)
    }
    return Array.from(categories).sort()
  }

  /**
   * Execute a command with validation
   */
  async executeCommand(
    slug: string,
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<AICommandResult> {
    const command = this.getAICommand(slug)

    if (!command) {
      return {
        success: false,
        message: `Command not found: ${slug}`,
        error: 'COMMAND_NOT_FOUND'
      }
    }

    // Check capabilities
    if (command.capabilities && command.capabilities.length > 0) {
      const hasCapability = command.capabilities.some((cap) =>
        context.userCapabilities.includes(cap)
      )
      if (!hasCapability) {
        return {
          success: false,
          message: `Permission denied for command: ${slug}`,
          error: 'PERMISSION_DENIED'
        }
      }
    }

    // Validate required parameters
    for (const param of command.parameters) {
      if (param.required && (params[param.name] === undefined || params[param.name] === null)) {
        return {
          success: false,
          message: `Missing required parameter: ${param.name}`,
          error: 'MISSING_PARAMETER'
        }
      }

      // Validate enum values
      if (param.enum && params[param.name] !== undefined) {
        if (!param.enum.includes(String(params[param.name]))) {
          return {
            success: false,
            message: `Invalid value for parameter ${param.name}. Allowed values: ${param.enum.join(', ')}`,
            error: 'INVALID_PARAMETER_VALUE'
          }
        }
      }
    }

    try {
      return await command.execute(params, context)
    } catch (error) {
      return {
        success: false,
        message: `Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: 'EXECUTION_ERROR'
      }
    }
  }

  /**
   * Get command documentation for AI system prompt
   */
  getCommandDocumentation(): string {
    const commands = this.getAllAICommands()
    const lines: string[] = ['Available Commands:', '']

    const byCategory = new Map<string, AICommand[]>()
    for (const cmd of commands) {
      const list = byCategory.get(cmd.category) || []
      list.push(cmd)
      byCategory.set(cmd.category, list)
    }

    for (const [category, cmds] of byCategory) {
      lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`)
      lines.push('')

      for (const cmd of cmds) {
        lines.push(`### ${cmd.slug}`)
        lines.push(`- **Name**: ${cmd.name}`)
        lines.push(`- **Description**: ${cmd.description}`)
        lines.push(`- **Type**: ${cmd.type}`)
        lines.push(`- **Permission**: ${cmd.permission === 'auto' ? 'Auto-approved' : 'Requires approval'}`)

        if (cmd.parameters.length > 0) {
          lines.push('- **Parameters**:')
          for (const param of cmd.parameters) {
            const req = param.required ? '(required)' : '(optional)'
            const enumStr = param.enum ? ` [${param.enum.join('|')}]` : ''
            lines.push(`  - \`${param.name}\` (${param.type}${enumStr}) ${req}: ${param.description}`)
          }
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  /**
   * Initialize - no default commands here, they're registered by providers
   */
  async init(): Promise<void> {
    // Commands are registered by ai-provider
  }
}
