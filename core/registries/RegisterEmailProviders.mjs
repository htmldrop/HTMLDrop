export default class RegisterEmailProviders {
  constructor(context) {
    this.context = context
    this.providers = []
  }

  /**
   * Register an email provider with priority
   * @param {Object} provider - Email provider configuration
   * @param {string} provider.name - Provider name (e.g., 'smtp', 'sendgrid', 'mailgun')
   * @param {number} provider.priority - Priority (lower number = higher priority)
   * @param {Function} provider.configure - Function to configure nodemailer transport
   * @param {Function} provider.isConfigured - Function to check if provider is configured
   */
  registerEmailProvider(provider) {
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
   * @returns {Object|null} Active provider configuration or null
   */
  async getActiveProvider() {
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
   * @returns {Array} List of all providers
   */
  getProviders() {
    return [...this.providers]
  }

  /**
   * Get provider by name
   * @param {string} name - Provider name
   * @returns {Object|null} Provider configuration or null
   */
  getProvider(name) {
    return this.providers.find((p) => p.name === name) || null
  }

  /**
   * Initialize default SMTP provider
   */
  async init() {
    // Register default SMTP provider
    this.registerEmailProvider({
      name: 'smtp',
      priority: 10,
      configure: async (context) => {
        const { knex, table } = context

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
      isConfigured: async (context) => {
        const { knex, table } = context

        const smtpHost = await knex(table('options')).where('name', 'smtp_host').first()
        const smtpUser = await knex(table('options')).where('name', 'smtp_user').first()
        const smtpPassword = await knex(table('options')).where('name', 'smtp_password').first()

        return !!(smtpHost?.value && smtpUser?.value && smtpPassword?.value)
      }
    })
  }
}
