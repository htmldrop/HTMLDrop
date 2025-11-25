<template>
  <Wizard :step="1">
    <h1>You are nearly there!</h1>
    <h2>Provide administrator credentials</h2>
    <input placeholder="Email" v-model="email"/>
    <input placeholder="Password" type="password" v-model="password"/>
    <select v-model="locale">
      <option :value="loc.key" v-for="loc in locales">
        {{ loc.value }}
      </option>
    </select>
    <button @click="register">Submit</button>
    <div v-if="error">
      {{ error }}
    </div>
  </Wizard>
</template>

<script>
import Wizard from '../../components/wizard.vue'
import locales from '@/assets/language-codes.mjs'
export default {
  inject: ['apiBase'],
  components: { Wizard },
  data: () => ({
    health: {},
    email: '',
    password: '',
    locale: 'en_US',
    locales,
    error: ''
  }),
  async created() {
    localStorage.removeItem('tokens')
    this.health = await this.getHealth()
  },
  watch: {
    health(health) {
      if (health?.checks?.find(h => h.slug === 'admin')?.ok) {
        this.$router.push('/')
      }
    }
  },
  methods: {
    async getHealth() {
      const res = await fetch(`${this.apiBase}/api/v1/health`)
      return res.json()
    },
    async register() {
      const res = await fetch(`${this.apiBase}/api/v1/setup/admin`, {
        method: 'POST',
        body: JSON.stringify({
          email: this.email,
          password: this.password,
          locale: this.locale
        })
      })
      this.health = await this.getHealth()
      try { this.error = await res.text() } catch(e) {}
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
  cursor: default;
}
</style>
