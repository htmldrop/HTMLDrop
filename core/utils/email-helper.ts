// EmailService is untyped JavaScript - will be converted to TypeScript later
import EmailServiceImport from '../services/EmailService.mjs'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EmailService = EmailServiceImport as any

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

interface TemplateResult {
  subject: string
  html: string
  text?: string
}

type TemplateFn<T> = (data: T) => TemplateResult

/**
 * Email helper functions for plugins and themes
 * These functions are exposed via req.hooks
 */

/**
 * Send an email using the configured email provider
 */
export async function sendEmail(context: HTMLDrop.Context, options: EmailOptions): Promise<unknown> {
  const emailService = new EmailService(context)
  return await emailService.sendEmail(options)
}

/**
 * Send a welcome email to a user
 */
export async function sendWelcomeEmail(context: HTMLDrop.Context, user: User): Promise<unknown> {
  const emailService = new EmailService(context)
  return await emailService.sendWelcomeEmail(user)
}

/**
 * Send a password reset email to a user
 */
export async function sendPasswordResetEmail(
  context: HTMLDrop.Context,
  user: User,
  resetToken: string,
  expiryMinutes: number = 60
): Promise<unknown> {
  const emailService = new EmailService(context)
  return await emailService.sendPasswordResetEmail(user, resetToken, expiryMinutes)
}

/**
 * Send a custom email using a template function
 */
export async function sendTemplateEmail<T>(
  context: HTMLDrop.Context,
  to: string | string[],
  templateFn: TemplateFn<T>,
  templateData: T
): Promise<unknown> {
  const emailService = new EmailService(context)
  const template = templateFn(templateData)

  return await emailService.sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text
  })
}

/**
 * Verify email service connection
 */
export async function verifyEmailConnection(context: HTMLDrop.Context): Promise<boolean> {
  const emailService = new EmailService(context)
  return await emailService.verifyConnection()
}
