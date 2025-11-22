import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import RegisterEmailProviders from '../../registries/RegisterEmailProviders.mjs'
import knex from 'knex'

describe('RegisterEmailProviders', () => {
  let db
  let context
  let registerEmailProviders

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    db = knex({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })

    // Create options table
    await db.schema.createTable('test_options', (table) => {
      table.increments('id')
      table.string('name').unique()
      table.text('value')
      table.boolean('autoload').defaultTo(false)
      table.datetime('created_at')
      table.datetime('updated_at')
    })

    // Seed SMTP options
    await db('test_options').insert([
      { name: 'smtp_host', value: 'smtp.test.com' },
      { name: 'smtp_port', value: '587' },
      { name: 'smtp_secure', value: 'false' },
      { name: 'smtp_user', value: 'test@test.com' },
      { name: 'smtp_password', value: 'password123' },
      { name: 'smtp_from', value: 'noreply@test.com' }
    ])

    // Create context
    context = {
      knex: db,
      table: (name) => `test_${name}`
    }

    registerEmailProviders = new RegisterEmailProviders(context)
  })

  afterEach(async () => {
    await db.destroy()
  })

  describe('registerEmailProvider', () => {
    it('should register a new email provider', () => {
      registerEmailProviders.registerEmailProvider({
        name: 'sendgrid',
        priority: 5,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      const providers = registerEmailProviders.getProviders()

      expect(providers).toHaveLength(1)
      expect(providers[0].name).toBe('sendgrid')
      expect(providers[0].priority).toBe(5)
    })

    it('should use default priority of 10 if not specified', () => {
      registerEmailProviders.registerEmailProvider({
        name: 'mailgun',
        configure: async () => ({}),
        isConfigured: async () => true
      })

      const provider = registerEmailProviders.getProvider('mailgun')

      expect(provider.priority).toBe(10)
    })

    it('should throw error if required fields are missing', () => {
      expect(() => {
        registerEmailProviders.registerEmailProvider({
          name: 'invalid'
          // missing configure and isConfigured
        })
      }).toThrow('Email provider must have name, configure, and isConfigured properties')
    })

    it('should sort providers by priority', () => {
      registerEmailProviders.registerEmailProvider({
        name: 'provider1',
        priority: 20,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      registerEmailProviders.registerEmailProvider({
        name: 'provider2',
        priority: 5,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      registerEmailProviders.registerEmailProvider({
        name: 'provider3',
        priority: 10,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      const providers = registerEmailProviders.getProviders()

      expect(providers[0].name).toBe('provider2') // priority 5
      expect(providers[1].name).toBe('provider3') // priority 10
      expect(providers[2].name).toBe('provider1') // priority 20
    })
  })

  describe('getActiveProvider', () => {
    it('should return the highest priority configured provider', async () => {
      registerEmailProviders.registerEmailProvider({
        name: 'low-priority',
        priority: 20,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      registerEmailProviders.registerEmailProvider({
        name: 'high-priority',
        priority: 5,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      const activeProvider = await registerEmailProviders.getActiveProvider()

      expect(activeProvider).toBeDefined()
      expect(activeProvider.name).toBe('high-priority')
    })

    it('should skip unconfigured providers', async () => {
      registerEmailProviders.registerEmailProvider({
        name: 'unconfigured',
        priority: 1,
        configure: async () => ({}),
        isConfigured: async () => false
      })

      registerEmailProviders.registerEmailProvider({
        name: 'configured',
        priority: 10,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      const activeProvider = await registerEmailProviders.getActiveProvider()

      expect(activeProvider).toBeDefined()
      expect(activeProvider.name).toBe('configured')
    })

    it('should return null if no providers are configured', async () => {
      registerEmailProviders.registerEmailProvider({
        name: 'unconfigured1',
        priority: 5,
        configure: async () => ({}),
        isConfigured: async () => false
      })

      registerEmailProviders.registerEmailProvider({
        name: 'unconfigured2',
        priority: 10,
        configure: async () => ({}),
        isConfigured: async () => false
      })

      const activeProvider = await registerEmailProviders.getActiveProvider()

      expect(activeProvider).toBeNull()
    })

    it('should return null if no providers are registered', async () => {
      const activeProvider = await registerEmailProviders.getActiveProvider()

      expect(activeProvider).toBeNull()
    })
  })

  describe('getProvider', () => {
    it('should get a provider by name', () => {
      registerEmailProviders.registerEmailProvider({
        name: 'sendgrid',
        priority: 5,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      const provider = registerEmailProviders.getProvider('sendgrid')

      expect(provider).toBeDefined()
      expect(provider.name).toBe('sendgrid')
    })

    it('should return null for non-existent provider', () => {
      const provider = registerEmailProviders.getProvider('non-existent')

      expect(provider).toBeNull()
    })
  })

  describe('getProviders', () => {
    it('should return all registered providers', () => {
      registerEmailProviders.registerEmailProvider({
        name: 'provider1',
        priority: 10,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      registerEmailProviders.registerEmailProvider({
        name: 'provider2',
        priority: 20,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      const providers = registerEmailProviders.getProviders()

      expect(providers).toHaveLength(2)
    })

    it('should return a copy of the providers array', () => {
      registerEmailProviders.registerEmailProvider({
        name: 'provider1',
        priority: 10,
        configure: async () => ({}),
        isConfigured: async () => true
      })

      const providers1 = registerEmailProviders.getProviders()
      const providers2 = registerEmailProviders.getProviders()

      expect(providers1).not.toBe(providers2) // Different array references
      expect(providers1).toEqual(providers2) // But same content
    })
  })

  describe('init - Default SMTP Provider', () => {
    it('should register default SMTP provider on init', async () => {
      await registerEmailProviders.init()

      const provider = registerEmailProviders.getProvider('smtp')

      expect(provider).toBeDefined()
      expect(provider.name).toBe('smtp')
      expect(provider.priority).toBe(10)
    })

    it('should configure SMTP provider with options from database', async () => {
      await registerEmailProviders.init()

      const provider = registerEmailProviders.getProvider('smtp')
      const config = await provider.configure(context)

      expect(config.host).toBe('smtp.test.com')
      expect(config.port).toBe(587)
      expect(config.secure).toBe(false)
      expect(config.auth.user).toBe('test@test.com')
      expect(config.auth.pass).toBe('password123')
      expect(config.from).toBe('noreply@test.com')
    })

    it('should use smtp_user as from address if smtp_from is not set', async () => {
      await db('test_options').where('name', 'smtp_from').del()

      await registerEmailProviders.init()

      const provider = registerEmailProviders.getProvider('smtp')
      const config = await provider.configure(context)

      expect(config.from).toBe('test@test.com')
    })

    it('should report as configured when SMTP settings are complete', async () => {
      await registerEmailProviders.init()

      const provider = registerEmailProviders.getProvider('smtp')
      const isConfigured = await provider.isConfigured(context)

      expect(isConfigured).toBe(true)
    })

    it('should report as not configured when SMTP settings are incomplete', async () => {
      await db('test_options').where('name', 'smtp_host').update({ value: '' })

      await registerEmailProviders.init()

      const provider = registerEmailProviders.getProvider('smtp')
      const isConfigured = await provider.isConfigured(context)

      expect(isConfigured).toBe(false)
    })

    it('should require host, user, and password to be configured', async () => {
      await registerEmailProviders.init()
      const provider = registerEmailProviders.getProvider('smtp')

      // Test with all settings
      expect(await provider.isConfigured(context)).toBe(true)

      // Test without host
      await db('test_options').where('name', 'smtp_host').update({ value: '' })
      expect(await provider.isConfigured(context)).toBe(false)

      // Restore host, remove user
      await db('test_options').where('name', 'smtp_host').update({ value: 'smtp.test.com' })
      await db('test_options').where('name', 'smtp_user').update({ value: '' })
      expect(await provider.isConfigured(context)).toBe(false)

      // Restore user, remove password
      await db('test_options').where('name', 'smtp_user').update({ value: 'test@test.com' })
      await db('test_options').where('name', 'smtp_password').update({ value: '' })
      expect(await provider.isConfigured(context)).toBe(false)
    })
  })

  describe('Priority System Integration', () => {
    it('should select highest priority provider when multiple are configured', async () => {
      await registerEmailProviders.init() // Registers SMTP with priority 10

      // Register a higher priority provider
      registerEmailProviders.registerEmailProvider({
        name: 'sendgrid',
        priority: 5,
        configure: async () => ({
          host: 'smtp.sendgrid.net',
          port: 587,
          auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY }
        }),
        isConfigured: async () => !!process.env.SENDGRID_API_KEY
      })

      // Set SendGrid API key
      process.env.SENDGRID_API_KEY = 'test-key'

      const activeProvider = await registerEmailProviders.getActiveProvider()

      expect(activeProvider.name).toBe('sendgrid')

      delete process.env.SENDGRID_API_KEY
    })

    it('should fallback to lower priority provider if higher priority is not configured', async () => {
      await registerEmailProviders.init() // Registers SMTP with priority 10

      // Register higher priority provider that's not configured
      registerEmailProviders.registerEmailProvider({
        name: 'sendgrid',
        priority: 5,
        configure: async () => ({}),
        isConfigured: async () => false // Not configured
      })

      const activeProvider = await registerEmailProviders.getActiveProvider()

      expect(activeProvider.name).toBe('smtp')
    })
  })
})
