import EmailService from '../services/EmailService.mjs'

/**
 * Email helper functions for plugins and themes
 * These functions are exposed via req.hooks
 */

/**
 * Send an email using the configured email provider
 * @param {Object} context - Request context
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content
 * @param {string} options.from - Sender email (optional)
 * @returns {Promise<Object>} Send result
 */
export async function sendEmail(context, options) {
  const emailService = new EmailService(context)
  return await emailService.sendEmail(options)
}

/**
 * Send a welcome email to a user
 * @param {Object} context - Request context
 * @param {Object} user - User object with username and email
 * @returns {Promise<Object>} Send result
 */
export async function sendWelcomeEmail(context, user) {
  const emailService = new EmailService(context)
  return await emailService.sendWelcomeEmail(user)
}

/**
 * Send a password reset email to a user
 * @param {Object} context - Request context
 * @param {Object} user - User object with username and email
 * @param {string} resetToken - Password reset token
 * @param {number} expiryMinutes - Token expiry time in minutes
 * @returns {Promise<Object>} Send result
 */
export async function sendPasswordResetEmail(context, user, resetToken, expiryMinutes = 60) {
  const emailService = new EmailService(context)
  return await emailService.sendPasswordResetEmail(user, resetToken, expiryMinutes)
}

/**
 * Send a custom email using a template function
 * @param {Object} context - Request context
 * @param {string|string[]} to - Recipient email(s)
 * @param {Function} templateFn - Template function that returns {subject, html, text}
 * @param {Object} templateData - Data to pass to the template function
 * @returns {Promise<Object>} Send result
 */
export async function sendTemplateEmail(context, to, templateFn, templateData) {
  const emailService = new EmailService(context)
  const { subject, html, text } = templateFn(templateData)

  return await emailService.sendEmail({
    to,
    subject,
    html,
    text
  })
}

/**
 * Verify email service connection
 * @param {Object} context - Request context
 * @returns {Promise<boolean>} True if connection is valid
 */
export async function verifyEmailConnection(context) {
  const emailService = new EmailService(context)
  return await emailService.verifyConnection()
}
