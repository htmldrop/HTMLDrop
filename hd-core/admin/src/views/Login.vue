<template>
  <Wizard :steps="[]" maxWidth="400px">
    <h1>Login</h1>
    <input placeholder="Eamil" v-model="email"/>
    <input placeholder="Password" type="password" v-model="password"/>
    <button @click="submit">Login</button>
    <div v-if="error">
      Invalid credentials
    </div>
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
    error: false
  }),
  async created() {
    this.health = await this.getHealth()
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
