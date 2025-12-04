import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import EmailService from '../../services/EmailService.mjs'
import RegisterEmailProviders from '../../registries/RegisterEmailProviders.ts'
import knex from 'knex'

describe('EmailService', () => {
  let db
  let context
  let emailService
  let emailProviders

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
      { name: 'smtp_from', value: 'noreply@test.com' },
      { name: 'smtp_from_name', value: 'Test Site' },
      { name: 'site_url', value: 'http://localhost:3000' },
      { name: 'site_name', value: 'Test Site' }
    ])

    // Create context
    context = {
      knex: db,
      table: (name) => `test_${name}`,
      req: {
        hooks: {}
      }
    }

    // Initialize email providers registry
    emailProviders = new RegisterEmailProviders(context)
    await emailProviders.init()

    // Add to context
    context.emailProviders = emailProviders
    context.req.hooks.emailProviders = emailProviders

    emailService = new EmailService(context)
  })

  afterEach(async () => {
    await db.destroy()
  })

  describe('initTransporter', () => {
    it('should initialize transporter with SMTP configuration', async () => {
      const transporter = await emailService.initTransporter()

      expect(transporter).toBeDefined()
      expect(transporter.options.host).toBe('smtp.test.com')
      expect(transporter.options.port).toBe(587)
      expect(transporter.options.secure).toBe(false)
      expect(transporter.options.auth.user).toBe('test@test.com')
      expect(transporter.options.auth.pass).toBe('password123')
    })

    it('should throw error if no provider is configured', async () => {
      // Clear SMTP configuration
      await db('test_options').where('name', 'smtp_host').update({ value: '' })
      await db('test_options').where('name', 'smtp_user').update({ value: '' })
      await db('test_options').where('name', 'smtp_password').update({ value: '' })

      // Reinitialize provider
      emailProviders = new RegisterEmailProviders(context)
      await emailProviders.init()
      context.emailProviders = emailProviders

      const newEmailService = new EmailService(context)

      await expect(newEmailService.initTransporter()).rejects.toThrow('No email provider is configured')
    })

    it('should throw error if email providers registry is not available', async () => {
      const invalidContext = {
        knex: db,
        table: (name) => `test_${name}`
      }

      const invalidEmailService = new EmailService(invalidContext)

      await expect(invalidEmailService.initTransporter()).rejects.toThrow(
        'Email providers registry not available'
      )
    })
  })

  describe('sendEmail', () => {
    it('should send email with required fields', async () => {
      // Mock the transporter
      const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
      emailService.transporter = {
        sendMail: mockSendMail,
        options: {
          auth: {
            user: 'test@test.com'
          }
        }
      }

      const result = await emailService.sendEmail({
        to: 'recipient@test.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        text: 'Test content'
      })

      expect(result.messageId).toBe('test-id')
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'recipient@test.com',
          subject: 'Test Email',
          html: '<p>Test content</p>',
          text: 'Test content'
        })
      )
    })

    it('should use default from address from options', async () => {
      const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
      emailService.transporter = {
        sendMail: mockSendMail,
        options: {
          auth: {
            user: 'test@test.com'
          }
        }
      }

      await emailService.sendEmail({
        to: 'recipient@test.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test'
      })

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Test Site" <test@test.com>'
        })
      )
    })

    it('should use custom from address if provided', async () => {
      const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
      emailService.transporter = {
        sendMail: mockSendMail,
        options: {
          auth: {
            user: 'test@test.com'
          }
        }
      }

      await emailService.sendEmail({
        to: 'recipient@test.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
        from: 'custom@test.com'
      })

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'custom@test.com'
        })
      )
    })

    it('should initialize transporter if not already initialized', async () => {
      // Don't set transporter
      emailService.transporter = null

      // Mock nodemailer
      const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
      const mockTransporter = {
        sendMail: mockSendMail,
        options: {
          auth: {
            user: 'test@test.com'
          }
        }
      }

      const initTransporterSpy = vi.spyOn(emailService, 'initTransporter').mockImplementation(async () => {
        emailService.transporter = mockTransporter
        return mockTransporter
      })

      await emailService.sendEmail({
        to: 'recipient@test.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test'
      })

      expect(initTransporterSpy).toHaveBeenCalled()
      expect(mockSendMail).toHaveBeenCalled()
    })
  })

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with user data', async () => {
      const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
      emailService.transporter = {
        sendMail: mockSendMail,
        options: {
          auth: {
            user: 'test@test.com'
          }
        }
      }

      const user = {
        username: 'johndoe',
        email: 'john@example.com'
      }

      await emailService.sendWelcomeEmail(user)

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'john@example.com',
          subject: 'Welcome to Test Site!'
        })
      )

      // Verify HTML content contains user data
      const callArgs = mockSendMail.mock.calls[0][0]
      expect(callArgs.html).toContain('johndoe')
      expect(callArgs.html).toContain('john@example.com')
      expect(callArgs.html).toContain('Test Site')
    })
  })

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with token', async () => {
      const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
      emailService.transporter = {
        sendMail: mockSendMail,
        options: {
          auth: {
            user: 'test@test.com'
          }
        }
      }

      const user = {
        username: 'johndoe',
        email: 'john@example.com'
      }

      const resetToken = 'test-reset-token-123'

      await emailService.sendPasswordResetEmail(user, resetToken, 60)

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'john@example.com',
          subject: 'Reset Your Password - Test Site'
        })
      )

      // Verify HTML content contains token and user data
      const callArgs = mockSendMail.mock.calls[0][0]
      expect(callArgs.html).toContain('johndoe')
      expect(callArgs.html).toContain('john@example.com')
      expect(callArgs.html).toContain(resetToken)
      expect(callArgs.html).toContain('60 minutes')
      expect(callArgs.html).toContain(`http://localhost:3000/admin/reset-password?token=${resetToken}`)
    })

    it('should use default expiry of 60 minutes if not specified', async () => {
      const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
      emailService.transporter = {
        sendMail: mockSendMail,
        options: {
          auth: {
            user: 'test@test.com'
          }
        }
      }

      const user = {
        username: 'johndoe',
        email: 'john@example.com'
      }

      await emailService.sendPasswordResetEmail(user, 'token')

      const callArgs = mockSendMail.mock.calls[0][0]
      expect(callArgs.html).toContain('60 minutes')
    })
  })

  describe('verifyConnection', () => {
    it('should verify transporter connection', async () => {
      const mockVerify = vi.fn().mockResolvedValue(true)
      emailService.transporter = {
        verify: mockVerify
      }

      const result = await emailService.verifyConnection()

      expect(result).toBe(true)
      expect(mockVerify).toHaveBeenCalled()
    })

    it('should initialize transporter before verifying if not initialized', async () => {
      emailService.transporter = null

      const mockVerify = vi.fn().mockResolvedValue(true)
      const mockTransporter = {
        verify: mockVerify
      }

      const initTransporterSpy = vi.spyOn(emailService, 'initTransporter').mockImplementation(async () => {
        emailService.transporter = mockTransporter
        return mockTransporter
      })

      const result = await emailService.verifyConnection()

      expect(initTransporterSpy).toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })
})
