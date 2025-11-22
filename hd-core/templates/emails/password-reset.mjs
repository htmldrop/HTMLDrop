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
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #2c3e50;
      margin: 0;
      font-size: 28px;
    }
    .content {
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #e74c3c;
      color: #ffffff;
      text-decoration: none;
      border-radius: 4px;
      margin: 20px 0;
    }
    .warning {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 12px;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #777;
      font-size: 14px;
    }
    .link-text {
      word-break: break-all;
      color: #3498db;
      font-size: 12px;
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
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p class="link-text">${resetUrl}</p>
      <div class="warning">
        <p style="margin: 0;"><strong>⚠️ Security Notice:</strong></p>
        <p style="margin: 5px 0 0 0;">This password reset link will expire in <strong>${expiryMinutes} minutes</strong>. If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
      </div>
    </div>
    <div class="footer">
      <p>If you're having trouble clicking the button, copy and paste the URL above into your web browser.</p>
      <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
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
