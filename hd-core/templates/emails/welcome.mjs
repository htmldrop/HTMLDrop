/**
 * Welcome email template
 * @param {Object} data - Template data
 * @param {string} data.username - User's username
 * @param {string} data.email - User's email
 * @param {string} data.siteUrl - Site URL
 * @param {string} data.siteName - Site name
 * @returns {Object} Email configuration
 */
export default function welcomeEmail(data) {
  const { username, email, siteUrl, siteName } = data

  const subject = `Welcome to ${siteName}!`

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
      background-color: #3498db;
      color: #ffffff;
      text-decoration: none;
      border-radius: 4px;
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ${siteName}!</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${username}</strong>,</p>
      <p>Thank you for registering with ${siteName}. We're excited to have you on board!</p>
      <p>Your account has been successfully created with the email address: <strong>${email}</strong></p>
      <p>You can now log in and start exploring:</p>
      <p style="text-align: center;">
        <a href="${siteUrl}/admin" class="button">Go to Admin Panel</a>
      </p>
    </div>
    <div class="footer">
      <p>If you have any questions, feel free to reach out to our support team.</p>
      <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `

  const text = `
Welcome to ${siteName}!

Hello ${username},

Thank you for registering with ${siteName}. We're excited to have you on board!

Your account has been successfully created with the email address: ${email}

You can now log in and start exploring at: ${siteUrl}/admin

If you have any questions, feel free to reach out to our support team.

© ${new Date().getFullYear()} ${siteName}. All rights reserved.
  `

  return {
    subject,
    html,
    text
  }
}
