/**
 * Password reset email template
 * @param {Object} data - Template data
 * @param {string} data.username - User's username
 * @param {string} data.email - User's email
 * @param {string} data.resetUrl - Password reset URL with token
 * @param {string} data.siteUrl - Site URL
 * @param {string} data.siteName - Site name
 * @param {number} data.expiryMinutes - Token expiry time in minutes
 * @returns {Object} Email configuration
 */
export default function passwordResetEmail(data) {
  const { username, email, resetUrl, siteUrl, siteName, expiryMinutes = 60 } = data

  const subject = `Reset Your Password - ${siteName}`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f4f4f4;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      margin-bottom: 30px;
    }
    .header h1 {
      color: #2c3e50;
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #2c3e50;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 500;
    }
    .button:hover {
      background-color: #34495e;
    }
    .warning {
      background-color: #f8f9fa;
      border-left: 3px solid #6c757d;
      padding: 16px;
      margin: 20px 0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e9ecef;
      color: #6c757d;
      font-size: 13px;
    }
    .link-text {
      word-break: break-all;
      color: #495057;
      font-size: 13px;
      background-color: #f8f9fa;
      padding: 8px 12px;
      border-radius: 4px;
      display: inline-block;
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reset Your Password</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${username}</strong>,</p>
      <p>We received a request to reset the password for your ${siteName} account associated with <strong>${email}</strong>.</p>
      <p>Click the button below to reset your password:</p>
      <p>
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <div class="link-text">${resetUrl}</div>
      <div class="warning">
        <p style="margin: 0 0 8px 0;"><strong>Security Notice</strong></p>
        <p style="margin: 0;">This password reset link will expire in <strong>${expiryMinutes} minutes</strong>. If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 8px 0;">If you're having trouble clicking the button, copy and paste the URL above into your web browser.</p>
      <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `

  const text = `
Reset Your Password - ${siteName}

Hello ${username},

We received a request to reset the password for your ${siteName} account associated with ${email}.

Click the link below to reset your password:
${resetUrl}

⚠️ Security Notice:
This password reset link will expire in ${expiryMinutes} minutes. If you didn't request this password reset, please ignore this email or contact support if you have concerns.

If you're having trouble clicking the link, copy and paste the URL above into your web browser.

© ${new Date().getFullYear()} ${siteName}. All rights reserved.
  `

  return {
    subject,
    html,
    text
  }
}
