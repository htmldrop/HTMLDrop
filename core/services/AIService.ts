import type { Knex } from 'knex'
import type { AICommand, AICommandResult, ExecutionContext } from '../registries/RegisterAICommands.ts'
import { encrypt, decrypt, maskApiKey } from '../utils/encryption.ts'

export interface AIProvider {
  id: number
  name: string
  slug: string
  api_key_env: string
  api_key_encrypted: string | null
  api_key_updated_at: Date | null
  base_url: string | null
  default_model: string | null
  active: boolean
  settings: Record<string, unknown> | null
}

export interface AISettings {
  id: number
  active_provider_slug: string | null
  active_model: string | null
  auto_approve_reads: boolean
  auto_approve_writes: boolean
  system_prompt: string | null
  max_commands_per_turn: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CommandSuggestion {
  slug: string
  name: string
  description: string
  parameters: Record<string, unknown>
  type: 'read' | 'write'
  autoApproved: boolean
}

export interface AIResponse {
  message: string
  commands: CommandSuggestion[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

interface AIServiceContext {
  knex: Knex
  table: (name: string) => string
}

// Provider-specific API configurations
const PROVIDER_CONFIGS: Record<string, { baseUrl: string; models: string[] }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo']
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']
  },
  ollama: {
    baseUrl: 'http://localhost:11434/api',
    models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'mixtral']
  }
}

export default class AIService {
  private context: AIServiceContext

  constructor(context: AIServiceContext) {
    this.context = context
  }

  /**
   * Get all AI providers from database
   */
  async getProviders(): Promise<AIProvider[]> {
    const { knex, table } = this.context
    return knex(table('ai_providers')).orderBy('name', 'asc')
  }

  /**
   * Get a single provider by slug
   */
  async getProvider(slug: string): Promise<AIProvider | null> {
    const { knex, table } = this.context
    return knex(table('ai_providers')).where('slug', slug).first() || null
  }

  /**
   * Get the active provider
   */
  async getActiveProvider(): Promise<AIProvider | null> {
    const settings = await this.getSettings()
    if (!settings?.active_provider_slug) return null
    return this.getProvider(settings.active_provider_slug)
  }

  /**
   * Create a new AI provider
   */
  async createProvider(data: Partial<AIProvider>): Promise<AIProvider> {
    const { knex, table } = this.context
    const [id] = await knex(table('ai_providers')).insert({
      name: data.name,
      slug: data.slug,
      api_key_env: data.api_key_env,
      base_url: data.base_url || null,
      default_model: data.default_model || null,
      active: data.active ? 1 : 0,
      settings: data.settings ? JSON.stringify(data.settings) : null,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    })
    return (await knex(table('ai_providers')).where('id', id).first()) as AIProvider
  }

  /**
   * Update an AI provider
   */
  async updateProvider(slug: string, data: Partial<AIProvider>): Promise<AIProvider | null> {
    const { knex, table } = this.context
    const updateData: Record<string, unknown> = { updated_at: knex.fn.now() }

    if (data.name !== undefined) updateData.name = data.name
    if (data.api_key_env !== undefined) updateData.api_key_env = data.api_key_env
    if (data.base_url !== undefined) updateData.base_url = data.base_url
    if (data.default_model !== undefined) updateData.default_model = data.default_model
    if (data.active !== undefined) updateData.active = data.active ? 1 : 0
    if (data.settings !== undefined) updateData.settings = JSON.stringify(data.settings)

    await knex(table('ai_providers')).where('slug', slug).update(updateData)
    return this.getProvider(slug)
  }

  /**
   * Delete an AI provider
   */
  async deleteProvider(slug: string): Promise<boolean> {
    const { knex, table } = this.context
    const deleted = await knex(table('ai_providers')).where('slug', slug).del()
    return deleted > 0
  }

  /**
   * Set/update the encrypted API key for a provider
   */
  async setApiKey(slug: string, apiKey: string): Promise<boolean> {
    const { knex, table } = this.context
    const encrypted = encrypt(apiKey)
    const updated = await knex(table('ai_providers'))
      .where('slug', slug)
      .update({
        api_key_encrypted: encrypted,
        api_key_updated_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
    return updated > 0
  }

  /**
   * Remove the encrypted API key for a provider
   */
  async removeApiKey(slug: string): Promise<boolean> {
    const { knex, table } = this.context
    const updated = await knex(table('ai_providers'))
      .where('slug', slug)
      .update({
        api_key_encrypted: null,
        api_key_updated_at: null,
        updated_at: knex.fn.now()
      })
    return updated > 0
  }

  /**
   * Get the API key for a provider (decrypted)
   * Falls back to environment variable if no encrypted key is stored
   */
  getApiKey(provider: AIProvider): string | null {
    // First try encrypted key from database
    if (provider.api_key_encrypted) {
      try {
        return decrypt(provider.api_key_encrypted)
      } catch (err) {
        console.error('Failed to decrypt API key:', err)
      }
    }
    // Fall back to environment variable
    return process.env[provider.api_key_env] || null
  }

  /**
   * Check if a provider has an API key configured (either encrypted or via env)
   */
  hasApiKey(provider: AIProvider): { hasKey: boolean; source: 'database' | 'environment' | null; maskedKey?: string } {
    if (provider.api_key_encrypted) {
      try {
        const decrypted = decrypt(provider.api_key_encrypted)
        return { hasKey: true, source: 'database', maskedKey: maskApiKey(decrypted) }
      } catch {
        // Invalid encryption, treat as no key
      }
    }
    const envKey = process.env[provider.api_key_env]
    if (envKey) {
      return { hasKey: true, source: 'environment', maskedKey: maskApiKey(envKey) }
    }
    return { hasKey: false, source: null }
  }

  /**
   * Test connection to an AI provider
   */
  async testConnection(slug: string): Promise<{ success: boolean; message: string; model?: string; latencyMs?: number }> {
    const provider = await this.getProvider(slug)
    if (!provider) {
      return { success: false, message: 'Provider not found' }
    }

    const apiKey = this.getApiKey(provider)
    if (!apiKey) {
      return { success: false, message: 'No API key configured' }
    }

    const model = provider.default_model || PROVIDER_CONFIGS[slug]?.models?.[0]
    if (!model) {
      return { success: false, message: 'No model configured' }
    }

    const startTime = Date.now()

    try {
      switch (slug) {
        case 'openai':
          return await this.testOpenAI(provider, apiKey, model, startTime)
        case 'anthropic':
          return await this.testAnthropic(provider, apiKey, model, startTime)
        case 'google':
          return await this.testGoogle(provider, apiKey, model, startTime)
        case 'ollama':
          return await this.testOllama(provider, model, startTime)
        default:
          // Try OpenAI-compatible API
          return await this.testOpenAI(provider, apiKey, model, startTime)
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Connection failed'
      }
    }
  }

  private async testOpenAI(
    provider: AIProvider,
    apiKey: string,
    model: string,
    startTime: number
  ): Promise<{ success: boolean; message: string; model?: string; latencyMs?: number }> {
    const baseUrl = provider.base_url || PROVIDER_CONFIGS.openai.baseUrl
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, message: `API error: ${response.status} - ${errorText.slice(0, 100)}` }
    }

    return {
      success: true,
      message: 'Connection successful',
      model,
      latencyMs: Date.now() - startTime
    }
  }

  private async testAnthropic(
    provider: AIProvider,
    apiKey: string,
    model: string,
    startTime: number
  ): Promise<{ success: boolean; message: string; model?: string; latencyMs?: number }> {
    const baseUrl = provider.base_url || PROVIDER_CONFIGS.anthropic.baseUrl
    // Anthropic doesn't have a models endpoint, so we do a minimal chat request
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, message: `API error: ${response.status} - ${errorText.slice(0, 100)}` }
    }

    return {
      success: true,
      message: 'Connection successful',
      model,
      latencyMs: Date.now() - startTime
    }
  }

  private async testGoogle(
    provider: AIProvider,
    apiKey: string,
    model: string,
    startTime: number
  ): Promise<{ success: boolean; message: string; model?: string; latencyMs?: number }> {
    const baseUrl = provider.base_url || PROVIDER_CONFIGS.google.baseUrl
    const response = await fetch(`${baseUrl}/models?key=${apiKey}`)

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, message: `API error: ${response.status} - ${errorText.slice(0, 100)}` }
    }

    return {
      success: true,
      message: 'Connection successful',
      model,
      latencyMs: Date.now() - startTime
    }
  }

  private async testOllama(
    provider: AIProvider,
    model: string,
    startTime: number
  ): Promise<{ success: boolean; message: string; model?: string; latencyMs?: number }> {
    const baseUrl = provider.base_url || PROVIDER_CONFIGS.ollama.baseUrl
    // Ollama has a tags endpoint to list models
    const response = await fetch(`${baseUrl.replace('/api', '')}/api/tags`)

    if (!response.ok) {
      return { success: false, message: 'Cannot connect to Ollama. Is it running?' }
    }

    return {
      success: true,
      message: 'Connection successful',
      model,
      latencyMs: Date.now() - startTime
    }
  }

  /**
   * Get AI settings
   */
  async getSettings(): Promise<AISettings | null> {
    const { knex, table } = this.context
    return knex(table('ai_settings')).first() || null
  }

  /**
   * Update AI settings
   */
  async updateSettings(data: Partial<AISettings>): Promise<AISettings | null> {
    const { knex, table } = this.context
    const updateData: Record<string, unknown> = { updated_at: knex.fn.now() }

    if (data.active_provider_slug !== undefined) updateData.active_provider_slug = data.active_provider_slug
    if (data.active_model !== undefined) updateData.active_model = data.active_model
    if (data.auto_approve_reads !== undefined) updateData.auto_approve_reads = data.auto_approve_reads ? 1 : 0
    if (data.auto_approve_writes !== undefined) updateData.auto_approve_writes = data.auto_approve_writes ? 1 : 0
    if (data.system_prompt !== undefined) updateData.system_prompt = data.system_prompt
    if (data.max_commands_per_turn !== undefined) updateData.max_commands_per_turn = data.max_commands_per_turn

    await knex(table('ai_settings')).update(updateData)
    return this.getSettings()
  }

  /**
   * Get available models for a provider slug
   */
  getModelsForProvider(slug: string): string[] {
    return PROVIDER_CONFIGS[slug]?.models || []
  }

  /**
   * Get default base URL for a provider
   */
  getDefaultBaseUrl(slug: string): string | null {
    return PROVIDER_CONFIGS[slug]?.baseUrl || null
  }

  /**
   * Build system prompt with available commands
   */
  buildSystemPrompt(commands: AICommand[], customPrompt?: string): string {
    const lines: string[] = [
      'You are an AI assistant for the HTMLDrop CMS. You can help users manage their CMS by executing commands.',
      '',
      'When you need to perform an action, respond with a JSON block containing the commands to execute.',
      'Format your response as normal text, but include command suggestions in a special JSON block:',
      '',
      '```commands',
      '[',
      '  { "slug": "command.slug", "parameters": { "param1": "value1" } }',
      ']',
      '```',
      '',
      'Important rules:',
      '- Only suggest commands that are available in the list below',
      '- Provide clear explanations of what each command will do',
      '- For write commands, always explain the consequences before suggesting them',
      '- You can suggest multiple commands in a single response',
      '- Read commands marked as auto-approved will execute automatically',
      '- Write commands require user approval before execution',
      ''
    ]

    if (customPrompt) {
      lines.push('Additional Instructions:', customPrompt, '')
    }

    // Add command documentation
    lines.push('Available Commands:')
    lines.push('')

    const byCategory = new Map<string, AICommand[]>()
    for (const cmd of commands) {
      const list = byCategory.get(cmd.category) || []
      list.push(cmd)
      byCategory.set(cmd.category, list)
    }

    for (const [category, cmds] of byCategory) {
      lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`)

      for (const cmd of cmds) {
        lines.push(`- **${cmd.slug}**: ${cmd.description}`)
        if (cmd.parameters.length > 0) {
          lines.push(`  Parameters:`)
          for (const param of cmd.parameters) {
            const req = param.required ? 'required' : 'optional'
            lines.push(`    - ${param.name} (${param.type}, ${req}): ${param.description}`)
          }
        }
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Send chat message to AI provider
   */
  async chat(
    messages: ChatMessage[],
    commands: AICommand[],
    settings: AISettings
  ): Promise<AIResponse> {
    const provider = await this.getActiveProvider()
    if (!provider) {
      throw new Error('No active AI provider configured')
    }

    const apiKey = this.getApiKey(provider)
    if (!apiKey) {
      throw new Error(`No API key configured for ${provider.name}. Add one in Settings → AI Providers.`)
    }

    const model = settings.active_model || provider.default_model
    if (!model) {
      throw new Error('No model configured')
    }

    const systemPrompt = this.buildSystemPrompt(commands, settings.system_prompt || undefined)
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    // Route to provider-specific implementation
    switch (provider.slug) {
      case 'openai':
        return this.chatOpenAI(provider, apiKey, model, fullMessages)
      case 'anthropic':
        return this.chatAnthropic(provider, apiKey, model, fullMessages)
      case 'google':
        return this.chatGoogle(provider, apiKey, model, fullMessages)
      case 'ollama':
        return this.chatOllama(provider, model, fullMessages)
      default:
        // Try OpenAI-compatible API
        return this.chatOpenAI(provider, apiKey, model, fullMessages)
    }
  }

  /**
   * OpenAI chat implementation
   */
  private async chatOpenAI(
    provider: AIProvider,
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): Promise<AIResponse> {
    const baseUrl = provider.base_url || PROVIDER_CONFIGS.openai.baseUrl

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content }))
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${error}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    return {
      message: content,
      commands: this.parseCommands(content),
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens
          }
        : undefined
    }
  }

  /**
   * Anthropic (Claude) chat implementation
   */
  private async chatAnthropic(
    provider: AIProvider,
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): Promise<AIResponse> {
    const baseUrl = provider.base_url || PROVIDER_CONFIGS.anthropic.baseUrl

    // Separate system message for Anthropic
    const systemMessage = messages.find((m) => m.role === 'system')?.content || ''
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemMessage,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content }))
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${error}`)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    return {
      message: content,
      commands: this.parseCommands(content),
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens
          }
        : undefined
    }
  }

  /**
   * Google (Gemini) chat implementation
   */
  private async chatGoogle(
    provider: AIProvider,
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): Promise<AIResponse> {
    const baseUrl = provider.base_url || PROVIDER_CONFIGS.google.baseUrl

    // Convert messages to Gemini format
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))

    // Add system instruction
    const systemInstruction = messages.find((m) => m.role === 'system')?.content

    const response = await fetch(
      `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
        })
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Google API error: ${error}`)
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    return {
      message: content,
      commands: this.parseCommands(content),
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount || 0,
            completionTokens: data.usageMetadata.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata.totalTokenCount || 0
          }
        : undefined
    }
  }

  /**
   * Ollama (local) chat implementation
   */
  private async chatOllama(
    provider: AIProvider,
    model: string,
    messages: ChatMessage[]
  ): Promise<AIResponse> {
    const baseUrl = provider.base_url || PROVIDER_CONFIGS.ollama.baseUrl

    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Ollama API error: ${error}`)
    }

    const data = await response.json()
    const content = data.message?.content || ''

    return {
      message: content,
      commands: this.parseCommands(content),
      usage: data.eval_count
        ? {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count || 0,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
          }
        : undefined
    }
  }

  /**
   * Parse command suggestions from AI response
   */
  private parseCommands(content: string): CommandSuggestion[] {
    const commands: CommandSuggestion[] = []

    // Look for ```commands ... ``` blocks
    const commandBlockRegex = /```commands\s*([\s\S]*?)```/g
    let match

    while ((match = commandBlockRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim())
        if (Array.isArray(parsed)) {
          for (const cmd of parsed) {
            if (cmd.slug) {
              commands.push({
                slug: cmd.slug,
                name: cmd.name || cmd.slug,
                description: cmd.description || '',
                parameters: cmd.parameters || {},
                type: cmd.type || 'read',
                autoApproved: false // Will be determined by settings
              })
            }
          }
        }
      } catch {
        // Invalid JSON, skip this block
      }
    }

    return commands
  }

  /**
   * Execute a command and log it
   */
  async executeCommand(
    slug: string,
    params: Record<string, unknown>,
    executionContext: ExecutionContext,
    conversationId?: number
  ): Promise<AICommandResult> {
    const { knex, table } = this.context

    // This would normally be delegated to the registry
    // For now, we'll just log the attempt
    const result: AICommandResult = {
      success: false,
      message: 'Command execution not implemented in service - use registry',
      error: 'NOT_IMPLEMENTED'
    }

    // Log the command execution
    await knex(table('ai_command_logs')).insert({
      user_id: executionContext.userId,
      conversation_id: conversationId || null,
      command_slug: slug,
      parameters: JSON.stringify(params),
      success: result.success ? 1 : 0,
      result: result.data ? JSON.stringify(result.data) : null,
      error: result.error || null,
      executed_at: knex.fn.now()
    })

    return result
  }

  /**
   * Get conversation history for a user
   */
  async getConversations(userId: number): Promise<Array<{ id: number; title: string; created_at: Date }>> {
    const { knex, table } = this.context
    return knex(table('ai_conversations'))
      .where('user_id', userId)
      .orderBy('updated_at', 'desc')
      .select('id', 'title', 'created_at', 'updated_at')
  }

  /**
   * Get a single conversation with messages
   */
  async getConversation(id: number, userId: number): Promise<{
    conversation: { id: number; title: string; created_at: Date }
    messages: Array<{
      id: number
      role: string
      content: string
      commands_suggested: unknown
      commands_executed: unknown
      created_at: Date
    }>
  } | null> {
    const { knex, table } = this.context

    const conversation = await knex(table('ai_conversations'))
      .where('id', id)
      .andWhere('user_id', userId)
      .first()

    if (!conversation) return null

    const messages = await knex(table('ai_messages'))
      .where('conversation_id', id)
      .orderBy('created_at', 'asc')

    return {
      conversation,
      messages: messages.map((m: Record<string, unknown>) => ({
        id: m.id as number,
        role: m.role as string,
        content: m.content as string,
        commands_suggested: m.commands_suggested ? JSON.parse(m.commands_suggested as string) : null,
        commands_executed: m.commands_executed ? JSON.parse(m.commands_executed as string) : null,
        created_at: m.created_at as Date
      }))
    }
  }

  /**
   * Create a new conversation
   */
  async createConversation(userId: number, title?: string): Promise<{ id: number; title: string }> {
    const { knex, table } = this.context
    const [id] = await knex(table('ai_conversations')).insert({
      user_id: userId,
      title: title || 'New Conversation',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    })
    return { id, title: title || 'New Conversation' }
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: number,
    role: 'user' | 'assistant' | 'system',
    content: string,
    commandsSuggested?: CommandSuggestion[],
    commandsExecuted?: Array<{ slug: string; result: AICommandResult }>
  ): Promise<{ id: number }> {
    const { knex, table } = this.context

    const [id] = await knex(table('ai_messages')).insert({
      conversation_id: conversationId,
      role,
      content,
      commands_suggested: commandsSuggested ? JSON.stringify(commandsSuggested) : null,
      commands_executed: commandsExecuted ? JSON.stringify(commandsExecuted) : null,
      created_at: knex.fn.now()
    })

    // Update conversation timestamp
    await knex(table('ai_conversations'))
      .where('id', conversationId)
      .update({ updated_at: knex.fn.now() })

    // Auto-generate title from first user message if not set
    const conversation = await knex(table('ai_conversations')).where('id', conversationId).first()
    if (conversation?.title === 'New Conversation' && role === 'user') {
      const title = content.length > 50 ? content.substring(0, 47) + '...' : content
      await knex(table('ai_conversations'))
        .where('id', conversationId)
        .update({ title })
    }

    return { id }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(id: number, userId: number): Promise<boolean> {
    const { knex, table } = this.context
    const deleted = await knex(table('ai_conversations'))
      .where('id', id)
      .andWhere('user_id', userId)
      .del()
    return deleted > 0
  }

  /**
   * Get command execution logs
   */
  async getCommandLogs(
    userId: number,
    options: { limit?: number; offset?: number; conversationId?: number } = {}
  ): Promise<Array<{
    id: number
    command_slug: string
    parameters: unknown
    success: boolean
    result: unknown
    error: string | null
    executed_at: Date
  }>> {
    const { knex, table } = this.context
    const { limit = 50, offset = 0, conversationId } = options

    let query = knex(table('ai_command_logs'))
      .where('user_id', userId)
      .orderBy('executed_at', 'desc')
      .limit(limit)
      .offset(offset)

    if (conversationId) {
      query = query.andWhere('conversation_id', conversationId)
    }

    const logs = await query

    return logs.map((log: Record<string, unknown>) => ({
      id: log.id as number,
      command_slug: log.command_slug as string,
      parameters: log.parameters ? JSON.parse(log.parameters as string) : null,
      success: !!log.success,
      result: log.result ? JSON.parse(log.result as string) : null,
      error: log.error as string | null,
      executed_at: log.executed_at as Date
    }))
  }
}
