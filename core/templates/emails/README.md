# Email Templates

This directory contains email templates for the HTMLDrop CMS.

## Available Templates

### Welcome Email (`welcome.mjs`)
Sent to new users when they register.

**Usage:**
```javascript
import EmailService from '../../services/EmailService.mjs'

const emailService = new EmailService(context)
await emailService.sendWelcomeEmail({
  username: 'johndoe',
  email: 'john@example.com'
})
```

### Password Reset Email (`password-reset.mjs`)
Sent when a user requests a password reset.

**Usage:**
```javascript
import EmailService from '../../services/EmailService.mjs'

const emailService = new EmailService(context)
await emailService.sendPasswordResetEmail(
  { username: 'johndoe', email: 'john@example.com' },
  'reset-token-here',
  60 // expiry in minutes
)
```

## Creating Custom Templates

1. Create a new file in this directory (e.g., `custom-email.mjs`)
2. Export a function that returns an object with `subject`, `html`, and `text` properties:

```javascript
export default function customEmail(data) {
  const { name, customField } = data

  return {
    subject: `Subject Line`,
    html: `<h1>HTML version</h1><p>Hello ${name}</p>`,
    text: `Plain text version\nHello ${name}`
  }
}
```

3. Add your template to the EmailService or use it directly:

```javascript
import customEmail from './templates/emails/custom-email.mjs'

const emailContent = customEmail({ name: 'John', customField: 'value' })

await emailService.sendEmail({
  to: 'recipient@example.com',
  subject: emailContent.subject,
  html: emailContent.html,
  text: emailContent.text
})
```

## Email Provider System

The email system uses a priority-based provider registry. Plugins can register custom email providers.

### Registering a Custom Email Provider

```javascript
// In your plugin's init function
hooks.registerEmailProvider({
  name: 'sendgrid',
  priority: 5, // Lower number = higher priority
  configure: async (context) => {
    // Return nodemailer transport config
    return {
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    }
  },
  isConfigured: async (context) => {
    // Return true if provider is configured
    return !!process.env.SENDGRID_API_KEY
  }
})
```

### Default SMTP Provider

The system includes a default SMTP provider (priority: 10) that uses settings from the options table:

- `smtp_host` - SMTP server hostname
- `smtp_port` - SMTP server port (default: 587)
- `smtp_secure` - Use TLS (true/false)
- `smtp_user` - SMTP username
- `smtp_password` - SMTP password
- `smtp_from` - From email address
- `smtp_from_name` - From name (default: HTMLDrop)

Configure these in the admin panel under Options, or seed them in the database.
