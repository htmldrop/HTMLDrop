import type { Knex } from 'knex'

interface EmailProviderContext {
  knex?: Knex | null
  table: (name: string) => string
}

interface TransportConfig {
  host?: string
  port?: number
  secure?: boolean
  auth?: {
    user?: string
    pass?: string
  }
  from?: string
}

interface EmailProvider {
  name: string
  priority?: number
  configure: (context: EmailProviderContext) => Promise<TransportConfig>
  isConfigured: (context: EmailProviderContext) => Promise<boolean>
}

interface RegisteredProvider {
  name: string
  priority: number
  configure: (context: EmailProviderContext) => Promise<TransportConfig>
  isConfigured: (context: EmailProviderContext) => Promise<boolean>
}

export default class RegisterEmailProviders {
  private context: EmailProviderContext
  private providers: RegisteredProvider[]

  constructor(context: EmailProviderContext) {
    this.context = context
    this.providers = []
  }

  /**
   * Register an email provider with priority
   */
  registerEmailProvider(provider: EmailProvider): void {
    if (!provider.name || !provider.configure || !provider.isConfigured) {
      throw new Error('Email provider must have name, configure, and isConfigured properties')
    }

    const priority = provider.priority || 10

    this.providers.push({
      name: provider.name,
      priority,
      configure: provider.configure,
      isConfigured: provider.isConfigured
    })

    // Sort by priority (lower number = higher priority)
    this.providers.sort((a, b) => a.priority - b.priority)
  }

  /**
   * Get the active email provider (highest priority that is configured)
   */
  async getActiveProvider(): Promise<RegisteredProvider | null> {
    for (const provider of this.providers) {
      const isConfigured = await provider.isConfigured(this.context)
      if (isConfigured) {
        return provider
      }
    }
    return null
  }

  /**
   * Get all registered providers
   */
  getProviders(): RegisteredProvider[] {
    return [...this.providers]
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): RegisteredProvider | null {
    return this.providers.find((p) => p.name === name) || null
  }

  /**
   * Initialize default SMTP provider
   */
  async init(): Promise<void> {
    // Register default SMTP provider
    this.registerEmailProvider({
      name: 'smtp',
      priority: 10,
      configure: async (context: EmailProviderContext): Promise<TransportConfig> => {
        const { knex, table } = context
        if (!knex) throw new Error('Database not available')

        const smtpHost = await knex(table('options')).where('name', 'smtp_host').first()
        const smtpPort = await knex(table('options')).where('name', 'smtp_port').first()
        const smtpSecure = await knex(table('options')).where('name', 'smtp_secure').first()
        const smtpUser = await knex(table('options')).where('name', 'smtp_user').first()
        const smtpPassword = await knex(table('options')).where('name', 'smtp_password').first()
        const smtpFrom = await knex(table('options')).where('name', 'smtp_from').first()

        return {
          host: smtpHost?.value,
          port: parseInt(smtpPort?.value || '587', 10),
          secure: smtpSecure?.value === 'true',
          auth: {
            user: smtpUser?.value,
            pass: smtpPassword?.value
          },
          from: smtpFrom?.value || smtpUser?.value
        }
      },
      isConfigured: async (context: EmailProviderContext): Promise<boolean> => {
        const { knex, table } = context
        if (!knex) return false

        const smtpHost = await knex(table('options')).where('name', 'smtp_host').first()
        const smtpUser = await knex(table('options')).where('name', 'smtp_user').first()
        const smtpPassword = await knex(table('options')).where('name', 'smtp_password').first()

        return !!(smtpHost?.value && smtpUser?.value && smtpPassword?.value)
      }
    })
  }
}
