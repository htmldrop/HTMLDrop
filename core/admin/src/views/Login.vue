<template>
  <Wizard :steps="[]" maxWidth="400px">
    <template v-if="!showResetForm && !showResetPasswordForm">
      <h1>Login</h1>
      <input placeholder="Email" v-model="email"/>
      <input placeholder="Password" type="password" v-model="password"/>
      <button @click="submit">Login</button>
      <div v-if="error" class="error-message">
        Invalid credentials
      </div>
      <div class="forgot-password-link">
        <a href="#" @click.prevent="showResetForm = true">Forgot your password?</a>
      </div>
      <div v-if="oauthProviders.length > 0" class="oauth-section">
        <div class="oauth-divider">
          <span>or continue with</span>
        </div>
        <div class="oauth-buttons">
          <a
            v-for="provider in oauthProviders"
            :key="provider.slug"
            :href="`${apiBase}/api/v1/oauth/${provider.slug}/login`"
            class="oauth-button"
            :class="`oauth-${provider.slug}`"
          >
            <span class="oauth-icon" v-html="getProviderIcon(provider.slug)"></span>
            <span>{{ provider.name }}</span>
          </a>
        </div>
      </div>
    </template>

    <template v-if="showResetForm && !showResetPasswordForm">
      <h1>Reset Password</h1>
      <p class="reset-description">Enter your email address and we'll send you a link to reset your password.</p>
      <input placeholder="Email" v-model="resetEmail"/>
      <button @click="requestPasswordReset" :disabled="isLoading">
        {{ isLoading ? 'Sending...' : 'Send Reset Link' }}
      </button>
      <div v-if="resetMessage" :class="['message', resetMessageType]">
        {{ resetMessage }}
      </div>
      <div class="back-to-login">
        <a href="#" @click.prevent="resetResetForm">Back to login</a>
      </div>
    </template>

    <template v-if="showResetPasswordForm">
      <h1>Create New Password</h1>
      <p class="reset-description">Enter your new password below.</p>
      <input placeholder="New Password" type="password" v-model="newPassword"/>
      <input placeholder="Confirm Password" type="password" v-model="confirmPassword"/>
      <button @click="resetPassword" :disabled="isLoading">
        {{ isLoading ? 'Resetting...' : 'Reset Password' }}
      </button>
      <div v-if="resetMessage" :class="['message', resetMessageType]">
        {{ resetMessage }}
      </div>
      <div class="back-to-login">
        <a href="#" @click.prevent="backToLogin">Back to login</a>
      </div>
    </template>
  </Wizard>
</template>

<script>
import Wizard from '../components/wizard.vue'
export default {
  inject: ['apiBase', 'apiFetch', 'reloadUser'],
  components: { Wizard },
  data: () => ({
    email: '',
    password: '',
    health: {},
    error: false,
    showResetForm: false,
    showResetPasswordForm: false,
    resetEmail: '',
    resetMessage: '',
    resetMessageType: '',
    isLoading: false,
    newPassword: '',
    confirmPassword: '',
    resetToken: '',
    oauthProviders: []
  }),
  async created() {
    this.health = await this.getHealth()
    await this.getOAuthProviders()

    // Check if there's a token in the URL
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')

    if (token) {
      this.resetToken = token
      await this.validateResetToken(token)
    }
  },
  methods: {
    async getHealth() {
      const res = await fetch(`${this.apiBase}/api/v1/health`)
      return res.json()
    },
    async getOAuthProviders() {
      try {
        const res = await fetch(`${this.apiBase}/api/v1/oauth/providers`)
        if (res.ok) {
          this.oauthProviders = await res.json()
        }
      } catch (e) {
        // Silently fail - OAuth providers are optional
      }
    },
    getProviderIcon(slug) {
      const icons = {
        google: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>',
        github: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
        facebook: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
        microsoft: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>',
        twitter: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
        linkedin: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>'
      }
      return icons[slug] || '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M12 6v6l4 2"/></svg>'
    },
    async submit() {
      const res = await fetch(`${this.apiBase}/api/v1/auth/login`, {
        method: 'POST',
        body: JSON.stringify({
          email: this.email,
          password: this.password
        })
      })
      if (res.ok) {
        const tokens = await res.json()
        localStorage.setItem('tokens', JSON.stringify(tokens))
        this.reloadUser()
        this.$router.push('/')
      } else {
        this.error = true
      }
    },
    async requestPasswordReset() {
      if (!this.resetEmail) {
        this.resetMessage = 'Please enter your email address'
        this.resetMessageType = 'error'
        return
      }

      this.isLoading = true
      this.resetMessage = ''

      try {
        const res = await fetch(`${this.apiBase}/api/v1/auth/forgot-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: this.resetEmail
          })
        })

        const data = await res.json()

        if (res.ok) {
          this.resetMessage = data.message || 'Password reset link sent! Check your email.'
          this.resetMessageType = 'success'
        } else {
          this.resetMessage = data.message || 'Failed to send reset link'
          this.resetMessageType = 'error'
        }
      } catch (error) {
        this.resetMessage = 'An error occurred. Please try again.'
        this.resetMessageType = 'error'
      } finally {
        this.isLoading = false
      }
    },
    async validateResetToken(token) {
      try {
        const res = await fetch(`${this.apiBase}/api/v1/auth/validate-reset-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ token })
        })

        const data = await res.json()

        if (data.valid) {
          this.showResetPasswordForm = true
          this.showResetForm = false
        } else {
          this.resetMessage = 'This password reset link is invalid or has expired.'
          this.resetMessageType = 'error'
          this.showResetForm = true
        }
      } catch (error) {
        this.resetMessage = 'Invalid or expired reset link'
        this.resetMessageType = 'error'
        this.showResetForm = true
      }
    },
    async resetPassword() {
      if (!this.newPassword || !this.confirmPassword) {
        this.resetMessage = 'Please fill in all fields'
        this.resetMessageType = 'error'
        return
      }

      if (this.newPassword !== this.confirmPassword) {
        this.resetMessage = 'Passwords do not match'
        this.resetMessageType = 'error'
        return
      }

      this.isLoading = true
      this.resetMessage = ''

      try {
        const res = await fetch(`${this.apiBase}/api/v1/auth/reset-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token: this.resetToken,
            password: this.newPassword
          })
        })

        const data = await res.json()

        if (res.ok) {
          this.resetMessage = 'Password reset successfully! Redirecting to login...'
          this.resetMessageType = 'success'

          setTimeout(() => {
            this.backToLogin()
          }, 2000)
        } else {
          this.resetMessage = data.message || 'Failed to reset password'
          this.resetMessageType = 'error'
        }
      } catch (error) {
        this.resetMessage = 'An error occurred. Please try again.'
        this.resetMessageType = 'error'
      } finally {
        this.isLoading = false
      }
    },
    resetResetForm() {
      this.showResetForm = false
      this.resetEmail = ''
      this.resetMessage = ''
      this.resetMessageType = ''
    },
    backToLogin() {
      this.showResetForm = false
      this.showResetPasswordForm = false
      this.resetEmail = ''
      this.newPassword = ''
      this.confirmPassword = ''
      this.resetMessage = ''
      this.resetMessageType = ''
      this.resetToken = ''

      // Clear the token from URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }
}
</script>

<style scoped>
h1 {
  color: var(--color-header);
  border-bottom: 3px solid var(--color-text-muted);
  font-weight: 500;
}
h2 {
  color: var(--color-text);
  font-weight: 500;
}
.form {
  display: flex;
  flex-direction: column;
}
input, select, button {
  height: 40px;
  margin-bottom: 15px;
  border: solid 1px var(--color-text-muted);
  border-radius: 4px;
  padding-left: 10px;
  padding-right: 10px;
}
button {
  cursor: pointer;
  background-color: var(--color-primary);
  color: var(--color-bg);
  font-size: 16px;
  font-weight: 600;
}
button:hover {
  background-color: var(--color-primary-hover);
}
button[disabled] {
  opacity: .5;
  cursor: not-allowed;
}
.error-message {
  color: #e74c3c;
  margin-top: 10px;
  padding: 10px;
  background-color: rgba(231, 76, 60, 0.1);
  border-radius: 4px;
  border-left: 4px solid #e74c3c;
}
.forgot-password-link {
  margin-top: 15px;
  text-align: center;
}
.forgot-password-link a {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 14px;
}
.forgot-password-link a:hover {
  text-decoration: underline;
}
.reset-description {
  color: var(--color-text);
  margin-bottom: 20px;
  font-size: 14px;
}
.back-to-login {
  margin-top: 15px;
  text-align: center;
}
.back-to-login a {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 14px;
}
.back-to-login a:hover {
  text-decoration: underline;
}
.message {
  margin-top: 10px;
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
}
.message.success {
  color: #27ae60;
  background-color: rgba(39, 174, 96, 0.1);
  border-left: 4px solid #27ae60;
}
.message.error {
  color: #e74c3c;
  background-color: rgba(231, 76, 60, 0.1);
  border-left: 4px solid #e74c3c;
}
.oauth-section {
  margin-top: 20px;
}
.oauth-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin-bottom: 20px;
}
.oauth-divider::before,
.oauth-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--color-text-muted);
}
.oauth-divider span {
  padding: 0 15px;
  color: var(--color-text-muted);
  font-size: 14px;
}
.oauth-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.oauth-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 40px;
  border: 1px solid var(--color-text-muted);
  border-radius: 4px;
  background-color: var(--color-bg);
  color: var(--color-text);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s, border-color 0.2s;
}
.oauth-button:hover {
  background-color: var(--color-bg-hover, #f5f5f5);
  border-color: var(--color-text);
}
.oauth-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
.oauth-google:hover {
  border-color: #4285F4;
}
.oauth-github:hover {
  border-color: #333;
}
.oauth-facebook:hover {
  border-color: #1877F2;
}
.oauth-microsoft:hover {
  border-color: #00A4EF;
}
.oauth-twitter:hover {
  border-color: #1DA1F2;
}
.oauth-linkedin:hover {
  border-color: #0A66C2;
}
</style>
