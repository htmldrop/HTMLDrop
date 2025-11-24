import nodemailer from 'nodemailer'
import welcomeEmail from '../templates/emails/welcome.mjs'
import passwordResetEmail from '../templates/emails/password-reset.mjs'

export default class EmailService {
  constructor(context) {
    this.context = context
    this.transporter = null
  }

  /**
   * Initialize email transporter using registered email providers
   */
  async initTransporter() {
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
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} options.text - Plain text content
   * @param {string} options.from - Sender email (optional, uses default from provider)
   * @returns {Promise<Object>} Send result
   */
  async sendEmail(options) {
    if (!this.transporter) {
      await this.initTransporter()
    }

    const { knex, table } = this.context
    const fromName = await knex(table('options')).where('name', 'smtp_from_name').first()

    const mailOptions = {
      from: options.from || `"${fromName?.value || 'HTMLDrop'}" <${this.transporter.options.auth.user}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    }

    return await this.transporter.sendMail(mailOptions)
  }

  /**
   * Send welcome email to new user
   * @param {Object} user - User object
   * @param {string} user.username - Username
   * @param {string} user.email - User email
   * @returns {Promise<Object>} Send result
   */
  async sendWelcomeEmail(user) {
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
   * @param {Object} user - User object
   * @param {string} user.username - Username
   * @param {string} user.email - User email
   * @param {string} resetToken - Password reset token
   * @param {number} expiryMinutes - Token expiry time in minutes
   * @param {string} origin - Optional origin URL from request
   * @returns {Promise<Object>} Send result
   */
  async sendPasswordResetEmail(user, resetToken, expiryMinutes = 60, origin = null) {
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
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async verifyConnection() {
    if (!this.transporter) {
      await this.initTransporter()
    }

    return await this.transporter.verify()
  }
}
