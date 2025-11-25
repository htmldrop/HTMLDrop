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
    resetToken: ''
  }),
  async created() {
    this.health = await this.getHealth()

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
</style>
