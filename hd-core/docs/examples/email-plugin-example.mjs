/**
 * Example Plugin: Custom Notification System
 *
 * This plugin demonstrates how to:
 * 1. Register a custom email provider (Mailgun)
 * 2. Send emails using built-in templates
 * 3. Send custom emails
 * 4. Hook into system events to send notifications
 */

export default async function notificationPlugin({ req, res, next }) {
  // ============================================
  // 1. Register Custom Email Provider (Mailgun)
  // ============================================

  req.hooks.registerEmailProvider({
    name: 'mailgun',
    priority: 7, // Higher priority than SMTP (10), but lower than potential SendGrid (5)

    configure: async (context) => {
      const { knex, table } = context

      // Get Mailgun credentials from options table
      const mailgunUser = await knex(table('options')).where('name', 'mailgun_user').first()
      const mailgunPassword = await knex(table('options')).where('name', 'mailgun_password').first()
      const mailgunDomain = await knex(table('options')).where('name', 'mailgun_domain').first()

      return {
        host: 'smtp.mailgun.org',
        port: 587,
        secure: false,
        auth: {
          user: mailgunUser?.value,
          pass: mailgunPassword?.value
        },
        from: `noreply@${mailgunDomain?.value}`
      }
    },

    isConfigured: async (context) => {
      const { knex, table } = context

      const mailgunUser = await knex(table('options')).where('name', 'mailgun_user').first()
      const mailgunPassword = await knex(table('options')).where('name', 'mailgun_password').first()

      // Provider is configured if both user and password exist
      return !!(mailgunUser?.value && mailgunPassword?.value)
    }
  })

  // ============================================
  // 2. Send Welcome Email on User Registration
  // ============================================

  req.hooks.addAction('user_registered', async (user) => {
    try {
      await req.hooks.sendWelcomeEmail({
        username: user.username,
        email: user.email
      })
      console.log(`✅ Welcome email sent to ${user.email}`)
    } catch (error) {
      console.error(`❌ Failed to send welcome email to ${user.email}:`, error.message)
    }
  })

  // ============================================
  // 3. Send Custom Email on Post Published
  // ============================================

  req.hooks.addAction('post_published', async (post) => {
    const { knex, table } = req.context

    try {
      // Get post author
      const authorRel = await knex(table('post_authors'))
        .where('post_id', post.id)
        .first()

      if (!authorRel) return

      const author = await knex(table('users'))
        .where('id', authorRel.user_id)
        .first()

      if (!author) return

      // Send notification
      await req.hooks.sendEmail({
        to: author.email,
        subject: `Your post "${post.title}" has been published!`,
        html: `
          <h1>Congratulations!</h1>
          <p>Your post <strong>${post.title}</strong> has been published and is now live.</p>
          <p><a href="${req.protocol}://${req.get('host')}/posts/${post.slug}">View your post</a></p>
        `,
        text: `
          Congratulations!

          Your post "${post.title}" has been published and is now live.

          View your post: ${req.protocol}://${req.get('host')}/posts/${post.slug}
        `
      })

      console.log(`✅ Publication notification sent to ${author.email}`)
    } catch (error) {
      console.error('❌ Failed to send publication notification:', error.message)
    }
  })

  // ============================================
  // 4. Send Custom Template Email
  // ============================================

  req.hooks.addAction('comment_received', async (comment, post) => {
    const { knex, table } = req.context

    try {
      // Get post author
      const authorRel = await knex(table('post_authors'))
        .where('post_id', post.id)
        .first()

      if (!authorRel) return

      const author = await knex(table('users'))
        .where('id', authorRel.user_id)
        .first()

      if (!author) return

      // Custom template function
      const commentNotificationTemplate = (data) => ({
        subject: `New comment on "${data.postTitle}"`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .comment { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #007bff; }
                .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>New Comment</h1>
                </div>
                <div class="content">
                  <p>Hi ${data.authorName},</p>
                  <p>You received a new comment on your post <strong>"${data.postTitle}"</strong>:</p>
                  <div class="comment">
                    <p><strong>${data.commenterName}</strong> said:</p>
                    <p>${data.commentText}</p>
                  </div>
                  <p style="text-align: center;">
                    <a href="${data.postUrl}" class="button">View Comment</a>
                  </p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `
          Hi ${data.authorName},

          You received a new comment on your post "${data.postTitle}":

          ${data.commenterName} said:
          ${data.commentText}

          View comment: ${data.postUrl}
        `
      })

      // Send email using template
      await req.hooks.sendTemplateEmail(
        author.email,
        commentNotificationTemplate,
        {
          authorName: author.username,
          postTitle: post.title,
          commenterName: comment.author_name,
          commentText: comment.content,
          postUrl: `${req.protocol}://${req.get('host')}/posts/${post.slug}#comment-${comment.id}`
        }
      )

      console.log(`✅ Comment notification sent to ${author.email}`)
    } catch (error) {
      console.error('❌ Failed to send comment notification:', error.message)
    }
  })

  // ============================================
  // 5. Verify Email Configuration on Init
  // ============================================

  req.hooks.addAction('init', async () => {
    try {
      const isValid = await req.hooks.verifyEmailConnection()
      if (isValid) {
        console.log('✅ Email configuration verified')
      }
    } catch (error) {
      console.warn('⚠️  Email configuration may not be valid:', error.message)
      console.warn('   Emails will not be sent until SMTP settings are configured.')
    }
  })

  // ============================================
  // 6. Example: Send Weekly Digest
  // ============================================

  // You could combine this with the job queue system
  req.hooks.addAction('cron_weekly_digest', async () => {
    const { knex, table } = req.context

    try {
      // Get all active users
      const users = await knex(table('users'))
        .whereNull('deleted_at')
        .select('id', 'username', 'email')

      for (const user of users) {
        // Get user's posts from the last week
        const oneWeekAgo = new Date()
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

        const recentPosts = await knex(table('posts'))
          .join(table('post_authors'), `${table('posts')}.id`, '=', `${table('post_authors')}.post_id`)
          .where(`${table('post_authors')}.user_id`, user.id)
          .where(`${table('posts')}.created_at`, '>', oneWeekAgo.toISOString())
          .select(`${table('posts')}.*`)

        if (recentPosts.length === 0) continue

        // Create digest email
        const digestHtml = `
          <h1>Your Weekly Digest</h1>
          <p>Hi ${user.username}, here's what happened this week:</p>
          <ul>
            ${recentPosts.map(post => `
              <li>
                <strong>${post.title}</strong><br>
                Published: ${new Date(post.created_at).toLocaleDateString()}
              </li>
            `).join('')}
          </ul>
        `

        const digestText = `
          Your Weekly Digest

          Hi ${user.username}, here's what happened this week:

          ${recentPosts.map(post => `- ${post.title} (Published: ${new Date(post.created_at).toLocaleDateString()})`).join('\n')}
        `

        await req.hooks.sendEmail({
          to: user.email,
          subject: 'Your Weekly Digest',
          html: digestHtml,
          text: digestText
        })

        console.log(`✅ Weekly digest sent to ${user.email}`)
      }
    } catch (error) {
      console.error('❌ Failed to send weekly digest:', error.message)
    }
  })
}
