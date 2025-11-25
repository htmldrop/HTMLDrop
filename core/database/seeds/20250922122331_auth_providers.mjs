export const seed = async (knex) => {
  const prefix = process.env.TABLE_PREFIX
  const tableName = `${prefix  }auth_providers`
  const providers = [
    {
      name: 'Google',
      slug: 'google',
      client_id: 'GOOGLE_CLIENT_ID',
      secret_env_key: 'GOOGLE_CLIENT_SECRET',
      scope: JSON.stringify(['openid', 'profile', 'email']),
      auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      user_info_url: 'https://openidconnect.googleapis.com/v1/userinfo',
      redirect_uri: 'http://localhost:3000/api/v1/oauth/google/callback',
      active: false,
      response_params: JSON.stringify({})
    },
    {
      name: 'GitHub',
      slug: 'github',
      client_id: 'GITHUB_CLIENT_ID',
      secret_env_key: 'GITHUB_CLIENT_SECRET',
      scope: JSON.stringify(['read:user', 'user:email']),
      auth_url: 'https://github.com/login/oauth/authorize',
      token_url: 'https://github.com/login/oauth/access_token',
      user_info_url: 'https://api.github.com/user',
      redirect_uri: 'http://localhost:3000/api/v1/oauth/github/callback',
      active: false,
      response_params: JSON.stringify({ accept: 'json' })
    },
    {
      name: 'Facebook',
      slug: 'facebook',
      client_id: 'FACEBOOK_CLIENT_ID',
      secret_env_key: 'FACEBOOK_CLIENT_SECRET',
      scope: JSON.stringify(['public_profile', 'email']),
      auth_url: 'https://www.facebook.com/v12.0/dialog/oauth',
      token_url: 'https://graph.facebook.com/v12.0/oauth/access_token',
      user_info_url: 'https://graph.facebook.com/me?fields=id,name,email',
      redirect_uri: 'http://localhost:3000/api/v1/oauth/facebook/callback',
      active: false,
      response_params: JSON.stringify({})
    },
    {
      name: 'Microsoft',
      slug: 'microsoft',
      client_id: 'MICROSOFT_CLIENT_ID',
      secret_env_key: 'MICROSOFT_CLIENT_SECRET',
      scope: JSON.stringify(['openid', 'profile', 'email']),
      auth_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      user_info_url: 'https://graph.microsoft.com/oidc/userinfo',
      redirect_uri: 'http://localhost:3000/api/v1/oauth/microsoft/callback',
      active: false,
      response_params: JSON.stringify({})
    },
    {
      name: 'Twitter',
      slug: 'twitter',
      client_id: 'TWITTER_CLIENT_ID',
      secret_env_key: 'TWITTER_CLIENT_SECRET',
      scope: JSON.stringify(['tweet.read', 'users.read', 'offline.access']),
      auth_url: 'https://twitter.com/i/oauth2/authorize',
      token_url: 'https://api.twitter.com/2/oauth2/token',
      user_info_url: 'https://api.twitter.com/2/users/me',
      redirect_uri: 'http://localhost:3000/api/v1/oauth/twitter/callback',
      active: false,
      response_params: JSON.stringify({})
    },
    {
      name: 'LinkedIn',
      slug: 'linkedin',
      client_id: 'LINKEDIN_CLIENT_ID',
      secret_env_key: 'LINKEDIN_CLIENT_SECRET',
      scope: JSON.stringify(['r_liteprofile', 'r_emailaddress']),
      auth_url: 'https://www.linkedin.com/oauth/v2/authorization',
      token_url: 'https://www.linkedin.com/oauth/v2/accessToken',
      user_info_url: 'https://api.linkedin.com/v2/me',
      redirect_uri: 'http://localhost:3000/api/v1/oauth/linkedin/callback',
      active: false,
      response_params: JSON.stringify({})
    }
  ]

  for (const provider of providers) {
    const record = await knex(tableName).where({ slug: provider.slug }).first()
    if (!record) {
      await knex(tableName).insert({
        ...provider,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
    }
  }
}
