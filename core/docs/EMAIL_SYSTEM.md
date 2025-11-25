# Email System Documentation

## Overview

The HTMLDrop email system provides a flexible, plugin-extensible email infrastructure with:

- **Priority-based provider registry** - Plugins can register custom email providers (SMTP, SendGrid, Mailgun, etc.)
- **Template system** - HTML and plain text email templates
- **Password reset flow** - Complete password recovery implementation
- **Plugin/Theme integration** - Email functions exposed via hooks

## Architecture

### Components

1. **[RegisterEmailProviders](../registries/RegisterEmailProviders.mjs)** - Registry for email providers with priority system
2. **[EmailService](../services/EmailService.mjs)** - Core email sending service
3. **[PasswordResetService](../services/PasswordResetService.mjs)** - Password reset token management
4. **[Email Templates](../templates/emails/)** - Reusable email templates
5. **[Email Helpers](../utils/email-helper.mjs)** - Convenience functions for plugins

### Database

**Migration**: [20251122224234_add_password_reset_to_users.mjs](../database/migrations/20251122224234_add_password_reset_to_users.mjs)

Adds to `users` table:
- `reset_token` - Hashed password reset token
- `reset_token_expires_at` - Token expiration datetime

**Seeder**: [20250922122331_smtp_options.mjs](../database/seeds/20250922122331_smtp_options.mjs)

Creates options:
- `smtp_host` - SMTP server hostname
- `smtp_port` - SMTP server port (default: 587)
- `smtp_secure` - Use TLS (true/false)
- `smtp_user` - SMTP username
- `smtp_password` - SMTP password
- `smtp_from` - From email address
- `smtp_from_name` - From name (default: HTMLDrop)

## Email Provider System

### Priority System

Providers are selected based on priority (lower number = higher priority). The first configured provider is used.

**Default Provider**: SMTP (priority: 10)

### Registering Custom Providers

Plugins can register email providers in their `index.mjs`:

```javascript
export default async function myPlugin({ req, res, next }) {
  // Register SendGrid provider with higher priority than SMTP
  req.hooks.registerEmailProvider({
    name: 'sendgrid',
    priority: 5, // Higher priority than SMTP (10)
    configure: async (context) => {
      const { knex, table } = context
      const apiKey = await knex(table('options')).where('name', 'sendgrid_api_key').first()

      return {
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: apiKey?.value
        }
      }
    },
    isConfigured: async (context) => {
      const { knex, table } = context
      const apiKey = await knex(table('options')).where('name', 'sendgrid_api_key').first()
      return !!apiKey?.value
    }
  })
}
```

### Available Hooks

Plugins and themes have access to these email hooks via `req.hooks`:

#### `sendEmail(options)`
Send a custom email.

```javascript
await req.hooks.sendEmail({
  to: 'user@example.com',
  subject: 'Custom Email',
  html: '<p>HTML content</p>',
  text: 'Plain text content',
  from: 'custom@example.com' // Optional
})
```

#### `sendWelcomeEmail(user)`
Send welcome email to new user.

```javascript
await req.hooks.sendWelcomeEmail({
  username: 'johndoe',
  email: 'john@example.com'
})
```

#### `sendPasswordResetEmail(user, token, expiryMinutes)`
Send password reset email.

```javascript
await req.hooks.sendPasswordResetEmail(
  { username: 'johndoe', email: 'john@example.com' },
  'reset-token-xyz',
  60 // expires in 60 minutes
)
```

#### `sendTemplateEmail(to, templateFn, data)`
Send email using a custom template function.

```javascript
const myTemplate = (data) => ({
  subject: `Welcome ${data.name}`,
  html: `<h1>Hello ${data.name}</h1>`,
  text: `Hello ${data.name}`
})

await req.hooks.sendTemplateEmail(
  'user@example.com',
  myTemplate,
  { name: 'John' }
)
```

#### `verifyEmailConnection()`
Verify email configuration is working.

```javascript
const isValid = await req.hooks.verifyEmailConnection()
```

## Email Templates

Templates are located in [core/templates/emails/](../templates/emails/).

### Creating Templates

Create a new file (e.g., `custom-template.mjs`):

```javascript
export default function customEmail(data) {
  const { name, customField } = data

  return {
    subject: `Subject Line`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${subject}</title>
        </head>
        <body>
          <h1>Hello ${name}</h1>
          <p>${customField}</p>
        </body>
      </html>
    `,
    text: `
      Hello ${name}

      ${customField}
    `
  }
}
```

### Using Custom Templates

```javascript
import customEmail from './templates/emails/custom-template.mjs'

const emailContent = customEmail({ name: 'John', customField: 'Hello!' })

await req.hooks.sendEmail({
  to: 'user@example.com',
  subject: emailContent.subject,
  html: emailContent.html,
  text: emailContent.text
})
```

## Password Reset Flow

### API Endpoints

#### Request Password Reset
```
POST /api/v1/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

Response (always 200 for security):
```json
{
  "message": "If this email exists in our system, a password reset link will be sent."
}
```

#### Validate Reset Token
```
POST /api/v1/auth/validate-reset-token
Content-Type: application/json

{
  "token": "reset-token-from-email"
}
```

Response:
```json
{
  "valid": true
}
```

#### Reset Password
```
POST /api/v1/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-from-email",
  "password": "newSecurePassword123"
}
```

Response:
```json
{
  "message": "Password has been reset successfully"
}
```

### Admin UI

The password reset flow is integrated into the [admin login screen](../admin/src/views/Login.vue):

1. Click "Forgot your password?"
2. Enter email address
3. Check email for reset link
4. Click link (redirects to `/admin?token=xxx`)
5. Enter new password
6. Submit to reset password

### Security Features

- Tokens are hashed using bcrypt before storage
- Tokens expire after 60 minutes
- Email lookup doesn't reveal if user exists
- Tokens are single-use (cleared after password reset)
- Deleted users cannot reset passwords

## Configuration

### SMTP Setup

1. Navigate to **Admin → Options**
2. Set the following options:
   - `smtp_host` - e.g., `smtp.gmail.com`
   - `smtp_port` - e.g., `587`
   - `smtp_secure` - `true` for port 465, `false` for 587
   - `smtp_user` - Your SMTP username/email
   - `smtp_password` - Your SMTP password
   - `smtp_from` - From email address
   - `smtp_from_name` - Display name

### Testing Email Configuration

```javascript
// In a plugin or controller
const emailService = new EmailService(context)
try {
  await emailService.verifyConnection()
  console.log('Email configuration is valid')
} catch (error) {
  console.error('Email configuration error:', error)
}
```

## Testing

Comprehensive tests are available:

- **[EmailService.test.mjs](../tests/services/EmailService.test.mjs)** - Email service tests
- **[PasswordResetService.test.mjs](../tests/services/PasswordResetService.test.mjs)** - Password reset tests
- **[RegisterEmailProviders.test.mjs](../tests/registries/RegisterEmailProviders.test.mjs)** - Provider registry tests
- **[password-reset-api.test.mjs](../tests/integration/password-reset-api.test.mjs)** - API integration tests

Run tests:
```bash
npm run test -- core/tests/services/EmailService.test.mjs
npm run test -- core/tests/services/PasswordResetService.test.mjs
npm run test -- core/tests/registries/RegisterEmailProviders.test.mjs
```

## Example Plugin

Complete example of a plugin using the email system:

```javascript
export default async function notificationPlugin({ req, res, next }) {
  // Register custom email provider
  req.hooks.registerEmailProvider({
    name: 'mailgun',
    priority: 7,
    configure: async (context) => ({
      host: 'smtp.mailgun.org',
      port: 587,
      auth: {
        user: process.env.MAILGUN_USER,
        pass: process.env.MAILGUN_PASSWORD
      }
    }),
    isConfigured: async () => !!(process.env.MAILGUN_USER && process.env.MAILGUN_PASSWORD)
  })

  // Hook into user creation to send welcome email
  req.hooks.addAction('user_created', async (user) => {
    try {
      await req.hooks.sendWelcomeEmail(user)
      console.log(`Welcome email sent to ${user.email}`)
    } catch (error) {
      console.error('Failed to send welcome email:', error)
    }
  })

  // Send custom notification emails
  req.hooks.addAction('post_published', async (post) => {
    const template = (data) => ({
      subject: `New Post Published: ${data.title}`,
      html: `<h1>${data.title}</h1><p>${data.excerpt}</p>`,
      text: `${data.title}\n\n${data.excerpt}`
    })

    await req.hooks.sendTemplateEmail(
      'admin@example.com',
      template,
      { title: post.title, excerpt: post.excerpt }
    )
  })
}
```

## Troubleshooting

### Email not sending

1. Check SMTP configuration in options table
2. Verify credentials are correct
3. Check SMTP server allows connections
4. Test with `verifyEmailConnection()`

### Password reset link expired

- Tokens expire after 60 minutes
- Request a new password reset link

### Reset email not received

- Check spam folder
- Verify email address is correct
- Check SMTP configuration
- Check server logs for errors

## Related Files

- **Services**: [EmailService.mjs](../services/EmailService.mjs), [PasswordResetService.mjs](../services/PasswordResetService.mjs)
- **Registries**: [RegisterEmailProviders.mjs](../registries/RegisterEmailProviders.mjs)
- **Templates**: [templates/emails/](../templates/emails/)
- **Helpers**: [email-helper.mjs](../utils/email-helper.mjs)
- **Controllers**: [AuthController.mjs](../controllers/v1/AuthController.mjs)
- **Admin UI**: [Login.vue](../admin/src/views/Login.vue)
