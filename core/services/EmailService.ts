import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type { Knex } from 'knex'
// Email templates are JavaScript - cast to typed functions
import welcomeEmailImport from '../templates/emails/welcome.mjs'
import passwordResetEmailImport from '../templates/emails/password-reset.mjs'

interface EmailTemplateResult {
  subject: string
  html: string
  text: string
}

interface WelcomeEmailData {
  username: string
  email: string
  siteUrl: string
  siteName: string
}

interface PasswordResetEmailData {
  username: string
  email: string
  resetUrl: string
  siteUrl: string
  siteName: string
  expiryMinutes: number
}

const welcomeEmail = welcomeEmailImport as (data: WelcomeEmailData) => EmailTemplateResult
const passwordResetEmail = passwordResetEmailImport as (data: PasswordResetEmailData) => EmailTemplateResult

interface Context {
  knex: Knex
  table: (name: string) => string
  req?: {
    hooks?: {
      emailProviders?: EmailProvidersRegistry
    }
  }
  hooks?: {
    emailProviders?: EmailProvidersRegistry
  }
  registries?: {
    emailProviders?: EmailProvidersRegistry
  }
  emailProviders?: EmailProvidersRegistry
}

interface EmailProvidersRegistry {
  getActiveProvider: () => Promise<EmailProvider | null>
}

interface EmailProvider {
  configure: (context: Context) => Promise<nodemailer.TransportOptions>
}

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
}

interface User {
  username: string
  email: string
}

interface SendResult {
  messageId: string
  accepted: string[]
  rejected: string[]
  response: string
}

export default class EmailService {
  private context: Context
  private transporter: Transporter | null

  constructor(context: Context) {
    this.context = context
    this.transporter = null
  }

  /**
   * Initialize email transporter using registered email providers
   */
  async initTransporter(): Promise<Transporter> {
    // Get the email providers registry from the request context
    // This will be available through the hooks system
    const emailProviders =
      this.context.req?.hooks?.emailProviders ||
      this.context.hooks?.emailProviders ||
      this.context.registries?.emailProviders ||
      this.context.emailProviders

    if (!emailProviders) {
      throw new Error('Email providers registry not available. Please ensure the registry system is initialized.')
    }

    const activeProvider = await emailProviders.getActiveProvider()

    if (!activeProvider) {
      throw new Error('No email provider is configured. Please configure SMTP settings (smtp_host, smtp_user, smtp_password) in your database options table.')
    }

    const config = await activeProvider.configure(this.context)

    this.transporter = nodemailer.createTransport(config)

    return this.transporter
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<SendResult> {
    if (!this.transporter) {
      await this.initTransporter()
    }

    const { knex, table } = this.context
    const fromName = await knex(table('options')).where('name', 'smtp_from_name').first()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transporterOptions = this.transporter!.options as any
    const authUser = transporterOptions?.auth?.user || 'noreply@example.com'

    const mailOptions = {
      from: options.from || `"${fromName?.value || 'HTMLDrop'}" <${authUser}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    }

    return await this.transporter!.sendMail(mailOptions) as SendResult
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(user: User): Promise<SendResult> {
    const { knex, table } = this.context
    const siteUrl = await knex(table('options')).where('name', 'site_url').first()
    const siteName = await knex(table('options')).where('name', 'site_name').first()

    const emailContent = welcomeEmail({
      username: user.username,
      email: user.email,
      siteUrl: siteUrl?.value || 'http://localhost:3000',
      siteName: siteName?.value || 'HTMLDrop'
    })

    return await this.sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    })
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    user: User,
    resetToken: string,
    expiryMinutes: number = 60,
    origin: string | null = null
  ): Promise<SendResult> {
    const { knex, table } = this.context
    const siteUrl = await knex(table('options')).where('name', 'site_url').first()
    const siteName = await knex(table('options')).where('name', 'site_name').first()

    // Priority: 1) origin from request, 2) site_url from options, 3) localhost fallback
    const baseUrl = origin || siteUrl?.value || 'http://localhost:3000'
    const resetUrl = `${baseUrl}/admin/reset-password?token=${resetToken}`

    const emailContent = passwordResetEmail({
      username: user.username,
      email: user.email,
      resetUrl,
      siteUrl: baseUrl,
      siteName: siteName?.value || 'HTMLDrop',
      expiryMinutes
    })

    return await this.sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    })
  }

  /**
   * Verify email transporter configuration
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      await this.initTransporter()
    }

    return await this.transporter!.verify()
  }
}
