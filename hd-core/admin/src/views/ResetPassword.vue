<template>
  <div class="reset-password-container">
    <div class="reset-password-box">
      <h1>Reset Password</h1>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <div v-if="success" class="success-message">
        <p>{{ successMessage }}</p>
        <router-link to="/login" class="login-link">Go to Login</router-link>
      </div>

      <form v-if="!success" @submit.prevent="handleSubmit" class="reset-form">
        <div class="form-group">
          <label for="password">New Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="Enter your new password"
            required
            minlength="8"
            :disabled="loading"
          />
        </div>

        <div class="form-group">
          <label for="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            type="password"
            placeholder="Confirm your new password"
            required
            minlength="8"
            :disabled="loading"
          />
        </div>

        <button type="submit" :disabled="loading" class="submit-btn">
          {{ loading ? 'Resetting...' : 'Reset Password' }}
        </button>
      </form>

      <div class="back-to-login">
        <router-link to="/login">Back to Login</router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export default {
  name: 'ResetPassword',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const password = ref('')
    const confirmPassword = ref('')
    const error = ref('')
    const success = ref(false)
    const successMessage = ref('')
    const loading = ref(false)
    const token = ref('')

    onMounted(() => {
      token.value = route.query.token
      if (!token.value) {
        error.value = 'Invalid or missing reset token'
      }
    })

    const handleSubmit = async () => {
      error.value = ''

      if (!token.value) {
        error.value = 'Invalid or missing reset token'
        return
      }

      if (password.value !== confirmPassword.value) {
        error.value = 'Passwords do not match'
        return
      }

      if (password.value.length < 8) {
        error.value = 'Password must be at least 8 characters long'
        return
      }

      loading.value = true

      try {
        const apiBase = import.meta.env.VITE_API_BASE
        const response = await fetch(`${apiBase}/api/v1/auth/reset-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token: token.value,
            password: password.value
          })
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'Failed to reset password')
        }

        success.value = true
        successMessage.value = 'Password has been reset successfully! You can now log in with your new password.'

        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login')
        }, 3000)
      } catch (err) {
        error.value = err.message
      } finally {
        loading.value = false
      }
    }

    return {
      password,
      confirmPassword,
      error,
      success,
      successMessage,
      loading,
      handleSubmit
    }
  }
}
</script>

<style scoped>
.reset-password-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.reset-password-box {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  padding: 40px;
  width: 100%;
  max-width: 450px;
}

h1 {
  margin: 0 0 30px 0;
  color: #2d3748;
  font-size: 28px;
  text-align: center;
}

.error-message {
  background-color: #fee;
  border: 1px solid #fcc;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 20px;
  color: #c33;
  font-size: 14px;
}

.success-message {
  background-color: #efe;
  border: 1px solid #cfc;
  border-radius: 6px;
  padding: 20px;
  margin-bottom: 20px;
  color: #363;
  text-align: center;
}

.success-message p {
  margin: 0 0 15px 0;
}

.login-link {
  display: inline-block;
  color: #667eea;
  text-decoration: none;
  font-weight: 600;
}

.login-link:hover {
  text-decoration: underline;
}

.reset-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  color: #4a5568;
  font-size: 14px;
  font-weight: 600;
}

.form-group input {
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 16px;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.form-group input:disabled {
  background-color: #f7fafc;
  cursor: not-allowed;
}

.submit-btn {
  padding: 14px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.back-to-login {
  margin-top: 20px;
  text-align: center;
}

.back-to-login a {
  color: #667eea;
  text-decoration: none;
  font-size: 14px;
}

.back-to-login a:hover {
  text-decoration: underline;
}
</style>
