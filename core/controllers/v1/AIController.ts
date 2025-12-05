import type { Router, Response } from 'express'
import express from 'express'
import AIService from '../../services/AIService.ts'
import type { AICommandResult, ExecutionContext } from '../../registries/RegisterAICommands.ts'

const parseJSON = (value: unknown): unknown => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  const checkCapability = async (req: HTMLDrop.ExtendedRequest, routeCaps: string[]): Promise<boolean> => {
    const hasAccess = await req.guard.user({ canOneOf: routeCaps })
    return !!hasAccess
  }

  const getAIService = (): AIService => {
    if (!context.knex) throw new Error('Database not available')
    return new AIService({ knex: context.knex, table: context.table })
  }

  // ==================== PROVIDERS ====================

  /**
   * @openapi
   * /ai/providers:
   *   get:
   *     tags:
   *       - AI
   *     summary: List all AI providers
   *     security:
   *       - bearerAuth: []
   */
  router.get('/providers', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const providers = await service.getProviders()
    res.json(providers.map((p) => ({
      ...p,
      settings: parseJSON(p.settings),
      active: Boolean(p.active)
    })))
  })

  /**
   * @openapi
   * /ai/providers/{slug}:
   *   get:
   *     tags:
   *       - AI
   *     summary: Get an AI provider by slug
   *     security:
   *       - bearerAuth: []
   */
  router.get('/providers/:slug', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const provider = await service.getProvider(req.params.slug)
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' })
    }
    res.json({
      ...provider,
      settings: parseJSON(provider.settings),
      active: Boolean(provider.active)
    })
  })

  /**
   * @openapi
   * /ai/providers:
   *   post:
   *     tags:
   *       - AI
   *     summary: Create a new AI provider
   *     security:
   *       - bearerAuth: []
   */
  router.post('/providers', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { name, slug, api_key_env, base_url, default_model, active, settings } = req.body

    if (!name || !slug || !api_key_env) {
      return res.status(400).json({ error: 'name, slug, and api_key_env are required' })
    }

    const service = getAIService()

    // Check if slug already exists
    const existing = await service.getProvider(slug)
    if (existing) {
      return res.status(409).json({ error: 'Provider with this slug already exists' })
    }

    const provider = await service.createProvider({
      name,
      slug,
      api_key_env,
      base_url: base_url || service.getDefaultBaseUrl(slug),
      default_model,
      active: active || false,
      settings
    })

    res.status(201).json({
      ...provider,
      settings: parseJSON(provider.settings),
      active: Boolean(provider.active)
    })
  })

  /**
   * @openapi
   * /ai/providers/{slug}:
   *   patch:
   *     tags:
   *       - AI
   *     summary: Update an AI provider
   *     security:
   *       - bearerAuth: []
   */
  router.patch('/providers/:slug', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const provider = await service.updateProvider(req.params.slug, req.body)
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' })
    }
    res.json({
      ...provider,
      settings: parseJSON(provider.settings),
      active: Boolean(provider.active)
    })
  })

  /**
   * @openapi
   * /ai/providers/{slug}:
   *   delete:
   *     tags:
   *       - AI
   *     summary: Delete an AI provider
   *     security:
   *       - bearerAuth: []
   */
  router.delete('/providers/:slug', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const deleted = await service.deleteProvider(req.params.slug)
    if (!deleted) {
      return res.status(404).json({ error: 'Provider not found' })
    }
    res.json({ success: true })
  })

  /**
   * @openapi
   * /ai/providers/{slug}/models:
   *   get:
   *     tags:
   *       - AI
   *     summary: Get available models for a provider
   *     security:
   *       - bearerAuth: []
   */
  router.get('/providers/:slug/models', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!(await checkCapability(guardReq, ['manage_options', 'manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const models = service.getModelsForProvider(req.params.slug)
    res.json(models)
  })

  /**
   * @openapi
   * /ai/providers/{slug}/api-key:
   *   get:
   *     tags:
   *       - AI
   *     summary: Get API key status for a provider
   *     security:
   *       - bearerAuth: []
   */
  router.get('/providers/:slug/api-key', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const provider = await service.getProvider(req.params.slug)
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' })
    }

    const keyStatus = service.hasApiKey(provider)
    res.json({
      hasKey: keyStatus.hasKey,
      source: keyStatus.source,
      maskedKey: keyStatus.maskedKey,
      updatedAt: provider.api_key_updated_at
    })
  })

  /**
   * @openapi
   * /ai/providers/{slug}/api-key:
   *   put:
   *     tags:
   *       - AI
   *     summary: Set API key for a provider (encrypted storage)
   *     security:
   *       - bearerAuth: []
   */
  router.put('/providers/:slug/api-key', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { api_key } = req.body
    if (!api_key || typeof api_key !== 'string') {
      return res.status(400).json({ error: 'api_key is required' })
    }

    const service = getAIService()
    const provider = await service.getProvider(req.params.slug)
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' })
    }

    await service.setApiKey(req.params.slug, api_key)
    const keyStatus = service.hasApiKey({ ...provider, api_key_encrypted: 'set', api_key_updated_at: new Date() })

    res.json({
      success: true,
      hasKey: true,
      source: 'database',
      maskedKey: keyStatus.maskedKey
    })
  })

  /**
   * @openapi
   * /ai/providers/{slug}/api-key:
   *   delete:
   *     tags:
   *       - AI
   *     summary: Remove API key from database (will fall back to env var)
   *     security:
   *       - bearerAuth: []
   */
  router.delete('/providers/:slug/api-key', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const provider = await service.getProvider(req.params.slug)
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' })
    }

    await service.removeApiKey(req.params.slug)

    // Check if there's still an env var fallback
    const updatedProvider = await service.getProvider(req.params.slug)
    const keyStatus = updatedProvider ? service.hasApiKey(updatedProvider) : { hasKey: false, source: null }

    res.json({
      success: true,
      hasKey: keyStatus.hasKey,
      source: keyStatus.source,
      maskedKey: keyStatus.maskedKey
    })
  })

  /**
   * @openapi
   * /ai/providers/{slug}/test:
   *   post:
   *     tags:
   *       - AI
   *     summary: Test connection to an AI provider
   *     security:
   *       - bearerAuth: []
   */
  router.post('/providers/:slug/test', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const result = await service.testConnection(req.params.slug)
    res.json(result)
  })

  // ==================== SETTINGS ====================

  /**
   * @openapi
   * /ai/settings:
   *   get:
   *     tags:
   *       - AI
   *     summary: Get AI settings
   *     security:
   *       - bearerAuth: []
   */
  router.get('/settings', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options', 'manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const settings = await service.getSettings()
    res.json({
      ...settings,
      auto_approve_reads: Boolean(settings?.auto_approve_reads),
      auto_approve_writes: Boolean(settings?.auto_approve_writes)
    })
  })

  /**
   * @openapi
   * /ai/settings:
   *   patch:
   *     tags:
   *       - AI
   *     summary: Update AI settings
   *     security:
   *       - bearerAuth: []
   */
  router.patch('/settings', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const service = getAIService()
    const settings = await service.updateSettings(req.body)
    res.json({
      ...settings,
      auto_approve_reads: Boolean(settings?.auto_approve_reads),
      auto_approve_writes: Boolean(settings?.auto_approve_writes)
    })
  })

  // ==================== COMMANDS ====================

  /**
   * @openapi
   * /ai/commands:
   *   get:
   *     tags:
   *       - AI
   *     summary: List available AI commands
   *     security:
   *       - bearerAuth: []
   */
  router.get('/commands', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { category, type } = req.query
    const aiCommands = guardReq.hooks?.aiCommands

    if (!aiCommands) {
      return res.json([])
    }

    let commands = aiCommands.getAllAICommands()

    if (category) {
      commands = commands.filter((c: { category: string }) => c.category === category)
    }

    if (type) {
      commands = commands.filter((c: { type: string }) => c.type === type)
    }

    // Return commands without the execute function
    res.json(
      commands.map((c: {
        slug: string
        name: string
        description: string
        category: string
        type: string
        permission: string
        capabilities: string[]
        parameters: unknown[]
        contextProviders?: string[]
      }) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        category: c.category,
        type: c.type,
        permission: c.permission,
        capabilities: c.capabilities,
        parameters: c.parameters,
        contextProviders: c.contextProviders
      }))
    )
  })

  /**
   * @openapi
   * /ai/commands/categories:
   *   get:
   *     tags:
   *       - AI
   *     summary: List command categories
   *     security:
   *       - bearerAuth: []
   */
  router.get('/commands/categories', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const aiCommands = guardReq.hooks?.aiCommands

    if (!aiCommands) {
      return res.json([])
    }

    res.json(aiCommands.getCategories())
  })

  // ==================== CONVERSATIONS ====================

  /**
   * @openapi
   * /ai/conversations:
   *   get:
   *     tags:
   *       - AI
   *     summary: List user's conversations
   *     security:
   *       - bearerAuth: []
   */
  router.get('/conversations', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const userId = guardReq?.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const service = getAIService()
    const conversations = await service.getConversations(userId)
    res.json(conversations)
  })

  /**
   * @openapi
   * /ai/conversations:
   *   post:
   *     tags:
   *       - AI
   *     summary: Create a new conversation
   *     security:
   *       - bearerAuth: []
   */
  router.post('/conversations', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const userId = guardReq?.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const service = getAIService()
    const conversation = await service.createConversation(userId, req.body.title)
    res.status(201).json(conversation)
  })

  /**
   * @openapi
   * /ai/conversations/{id}:
   *   get:
   *     tags:
   *       - AI
   *     summary: Get a conversation with messages
   *     security:
   *       - bearerAuth: []
   */
  router.get('/conversations/:id', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const userId = guardReq?.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const service = getAIService()
    const data = await service.getConversation(parseInt(req.params.id, 10), userId)
    if (!data) {
      return res.status(404).json({ error: 'Conversation not found' })
    }
    res.json(data)
  })

  /**
   * @openapi
   * /ai/conversations/{id}:
   *   delete:
   *     tags:
   *       - AI
   *     summary: Delete a conversation
   *     security:
   *       - bearerAuth: []
   */
  router.delete('/conversations/:id', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const userId = guardReq?.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const service = getAIService()
    const deleted = await service.deleteConversation(parseInt(req.params.id, 10), userId)
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' })
    }
    res.json({ success: true })
  })

  // ==================== CHAT ====================

  /**
   * @openapi
   * /ai/chat:
   *   post:
   *     tags:
   *       - AI
   *     summary: Send a message to the AI
   *     security:
   *       - bearerAuth: []
   */
  router.post('/chat', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const userId = guardReq?.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const { message, conversationId } = req.body

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    const service = getAIService()
    const settings = await service.getSettings()

    if (!settings?.active_provider_slug) {
      return res.status(400).json({ error: 'No AI provider configured. Please configure an AI provider in settings.' })
    }

    // Get or create conversation
    let convId = conversationId
    if (!convId) {
      const conv = await service.createConversation(userId)
      convId = conv.id
    }

    // Get conversation history
    const convData = await service.getConversation(convId, userId)
    if (!convData) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    // Build message history
    const messages = convData.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }))
    messages.push({ role: 'user', content: message })

    // Save user message
    await service.addMessage(convId, 'user', message)

    // Get available commands for this user
    const aiCommands = guardReq.hooks?.aiCommands
    const userCapabilities = await getUserCapabilities(guardReq)
    const commands = aiCommands?.getCommandsForCapabilities(userCapabilities) || []

    try {
      // Send to AI
      const response = await service.chat(messages, commands, settings)

      // Determine which commands are auto-approved
      const commandsWithApproval = response.commands.map((cmd) => {
        const commandDef = aiCommands?.getAICommand(cmd.slug)
        const isAutoApproved =
          commandDef?.permission === 'auto' &&
          ((commandDef.type === 'read' && settings.auto_approve_reads) ||
            (commandDef.type === 'write' && settings.auto_approve_writes))

        return {
          ...cmd,
          name: commandDef?.name || cmd.slug,
          description: commandDef?.description || '',
          type: commandDef?.type || 'read',
          autoApproved: isAutoApproved
        }
      })

      // Save assistant message
      await service.addMessage(convId, 'assistant', response.message, commandsWithApproval)

      res.json({
        conversationId: convId,
        message: response.message,
        commands: commandsWithApproval,
        usage: response.usage
      })
    } catch (error) {
      console.error('AI chat error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      res.status(500).json({ error: `AI request failed: ${errorMessage}` })
    }
  })

  // ==================== EXECUTE ====================

  /**
   * @openapi
   * /ai/execute:
   *   post:
   *     tags:
   *       - AI
   *     summary: Execute approved AI commands
   *     security:
   *       - bearerAuth: []
   */
  router.post('/execute', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const userId = guardReq?.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const { commands, conversationId } = req.body

    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      return res.status(400).json({ error: 'commands array is required' })
    }

    const service = getAIService()
    const settings = await service.getSettings()
    const aiCommands = guardReq.hooks?.aiCommands
    const userCapabilities = await getUserCapabilities(guardReq)

    // Check max commands per turn
    if (commands.length > (settings?.max_commands_per_turn || 5)) {
      return res.status(400).json({
        error: `Maximum ${settings?.max_commands_per_turn || 5} commands per request`
      })
    }

    const results: Array<{ slug: string; result: AICommandResult }> = []

    for (const cmd of commands) {
      const { slug, parameters } = cmd

      if (!slug) {
        results.push({
          slug: 'unknown',
          result: { success: false, message: 'Missing command slug', error: 'MISSING_SLUG' }
        })
        continue
      }

      const executionContext: ExecutionContext = {
        knex: context.knex,
        table: context.table,
        userId,
        userCapabilities
      }

      // Execute through registry
      const result = await aiCommands.executeCommand(slug, parameters || {}, executionContext)

      // Log the execution
      await context.knex(context.table('ai_command_logs')).insert({
        user_id: userId,
        conversation_id: conversationId || null,
        command_slug: slug,
        parameters: JSON.stringify(parameters || {}),
        success: result.success ? 1 : 0,
        result: result.data ? JSON.stringify(result.data) : null,
        error: result.error || null,
        executed_at: context.knex.fn.now()
      })

      results.push({ slug, result })
    }

    // Update conversation with executed commands if provided
    if (conversationId) {
      await service.addMessage(conversationId, 'system', 'Commands executed', undefined, results)
    }

    res.json({ results })
  })

  // ==================== CONTEXT ====================

  /**
   * @openapi
   * /ai/context/{category}:
   *   get:
   *     tags:
   *       - AI
   *     summary: Get context data for a category
   *     security:
   *       - bearerAuth: []
   */
  router.get('/context/:category', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_dashboard']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { category } = req.params
    const { knex, table } = context

    try {
      switch (category) {
        case 'plugins': {
          const plugins = await getPluginsContext(knex, table)
          return res.json(plugins)
        }
        case 'themes': {
          const themes = await getThemesContext(knex, table)
          return res.json(themes)
        }
        case 'system': {
          const system = await getSystemContext()
          return res.json(system)
        }
        case 'users': {
          const users = await getUsersContext(knex, table)
          return res.json(users)
        }
        case 'database': {
          const database = await getDatabaseContext(knex)
          return res.json(database)
        }
        case 'posts': {
          const posts = await getPostsContext(knex, table)
          return res.json(posts)
        }
        default:
          return res.status(404).json({ error: `Unknown context category: ${category}` })
      }
    } catch (error) {
      console.error('Context fetch error:', error)
      res.status(500).json({ error: 'Failed to fetch context' })
    }
  })

  // ==================== LOGS ====================

  /**
   * @openapi
   * /ai/logs:
   *   get:
   *     tags:
   *       - AI
   *     summary: Get command execution logs
   *     security:
   *       - bearerAuth: []
   */
  router.get('/logs', async (req, res: Response) => {
    const guardReq = req as unknown as HTMLDrop.ExtendedRequest
    if (!context.knex) {
      return res.status(503).json({ error: 'Database not available' })
    }
    if (!(await checkCapability(guardReq, ['manage_options']))) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const userId = guardReq?.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const service = getAIService()
    const logs = await service.getCommandLogs(userId, {
      limit: parseInt(req.query.limit as string, 10) || 50,
      offset: parseInt(req.query.offset as string, 10) || 0,
      conversationId: req.query.conversationId
        ? parseInt(req.query.conversationId as string, 10)
        : undefined
    })

    res.json(logs)
  })

  return router
}

// Helper functions for context providers

async function getUserCapabilities(req: HTMLDrop.ExtendedRequest): Promise<string[]> {
  // Get user id from request
  const userId = (req as unknown as { user?: { id?: number } }).user?.id
  if (!userId || !req.guard) return []

  // Call the guard to resolve capabilities - this populates the internal resolvedCapabilities set
  await req.guard.user({ canOneOf: ['manage_dashboard'] })

  // Access the resolved capabilities from the guard instance
  // The guard stores them after resolving, we need to cast to access private property
  const guard = req.guard as unknown as { resolvedCapabilities?: Set<string> }
  if (guard.resolvedCapabilities) {
    return Array.from(guard.resolvedCapabilities)
  }

  return []
}

async function getPluginsContext(knex: import('knex').Knex, table: (name: string) => string) {
  const fs = await import('fs')
  const path = await import('path')

  const pluginsDir = path.resolve('./content/plugins')
  const plugins: Array<{
    slug: string
    name: string
    version: string
    active: boolean
  }> = []

  if (fs.existsSync(pluginsDir)) {
    const active = await knex(table('options')).where('name', 'active_plugins').first()
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
  }

  return { plugins, total: plugins.length, active: plugins.filter((p) => p.active).length }
}

async function getThemesContext(knex: import('knex').Knex, table: (name: string) => string) {
  const fs = await import('fs')
  const path = await import('path')

  const themesDir = path.resolve('./content/themes')
  const themes: Array<{
    slug: string
    name: string
    version: string
    active: boolean
  }> = []

  if (fs.existsSync(themesDir)) {
    const active = await knex(table('options')).where('name', 'active_theme').first()
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
  }

  return { themes, total: themes.length, activeTheme: themes.find((t) => t.active)?.slug || null }
}

async function getSystemContext() {
  const os = await import('os')

  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    cpuCores: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    hostname: os.hostname()
  }
}

async function getUsersContext(knex: import('knex').Knex, table: (name: string) => string) {
  const total = await knex(table('users')).count('id as count').first()
  const active = await knex(table('users')).where('status', 'active').count('id as count').first()
  const roles = await knex(table('roles')).select('name', 'slug')

  return {
    totalUsers: total?.count || 0,
    activeUsers: active?.count || 0,
    roles: roles.map((r) => ({ name: r.name, slug: r.slug }))
  }
}

async function getDatabaseContext(knex: import('knex').Knex) {
  const client = knex.client.config.client
  let version = 'unknown'

  try {
    if (client === 'better-sqlite3' || client === 'sqlite3') {
      const result = await knex.raw('SELECT sqlite_version() as version')
      version = result[0]?.version || 'unknown'
    } else if (client === 'mysql' || client === 'mysql2') {
      const result = await knex.raw('SELECT VERSION() as version')
      version = result[0]?.[0]?.version || 'unknown'
    } else if (client === 'pg') {
      const result = await knex.raw('SELECT version()')
      version = result.rows?.[0]?.version?.split(' ')[1] || 'unknown'
    }
  } catch {
    // Ignore version fetch errors
  }

  return {
    client,
    version
  }
}

async function getPostsContext(knex: import('knex').Knex, table: (name: string) => string) {
  const postTypes = await knex(table('post_types')).select('slug', 'name_singular', 'name_plural')

  const counts: Record<string, number> = {}
  for (const pt of postTypes) {
    const count = await knex(table('posts'))
      .where('post_type_slug', pt.slug)
      .count('id as count')
      .first()
    counts[pt.slug] = (count?.count as number) || 0
  }

  return {
    postTypes: postTypes.map((pt) => ({
      slug: pt.slug,
      name: pt.name_singular,
      namePlural: pt.name_plural,
      count: counts[pt.slug] || 0
    })),
    totalPostTypes: postTypes.length
  }
}
