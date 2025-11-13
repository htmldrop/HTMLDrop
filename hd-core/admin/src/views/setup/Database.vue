<template>
  <Wizard :step="0">
    <h1>Get Started Quickly with HTMLDrop</h1>
    <h2>Select database driver</h2>
    <select v-model="driver">
      <option value="mysql2">MySQL</option>
      <option value="pg">PostgreSQL</option>
      <option value="better-sqlite3">SQLite</option>
    </select>
    <div v-if="driver !== 'better-sqlite3'" class="form">
      <input placeholder="Host" v-model="host"/>
      <input :placeholder="'Port ' + (driver === 'pg' ? 5432 : 3306)" v-model="port"/>
      <input placeholder="Database" v-model="database"/>
      <input placeholder="User" v-model="user"/>
      <input placeholder="Password" type="password" v-model="password"/>
    </div>
    <input placeholder="Table prefix" v-model="prefix"/>
    <button @click="submit" :disabled="timeout">Submit</button>
    <div v-if="timeout">
      Trying to setup database - {{ maxAttempts - attempts }} ...
    </div>
    <div v-else-if="hasFailed">
      Could not connect to database, please verify your input & try again.
    </div>
  </Wizard>
</template>

<script>
import Wizard from '../../components/wizard.vue'
export default {
  inject: ['apiBase'],
  components: { Wizard },
  data: () => ({
    health: {},
    driver: 'mysql2',
    host: '',
    database: '',
    user: '',
    password: '',
    prefix: 'hd_',
    timeout: null,
    port: '',
    attempts: 0,
    maxAttempts: 20,
    hasFailed: false
  }),
  async created() {
    localStorage.removeItem('tokens')
    this.health = await this.getHealth()
  },
  computed: {
    connection() {
      if (this.driver === 'better-sqlite3') {
        return { filename: './hd-content/config/htmldrop.db' }
      }
      return {
        port: this.port || (this.driver === 'pg' ? 5432 : 3306),
        host: this.host,
        database: this.database,
        user: this.user,
        password: this.password
      }
    }
  },
  watch: {
    health(health) {
      if (health?.checks?.find(h => h.slug === 'database')?.ok) {
        this.$router.push('/setup/admin')
      }
    }
  },
  beforeUnmount() {
    if (this.timeout) clearTimeout(this.timeout)
  },
  methods: {
    async getHealth() {
      const res = await fetch(`${this.apiBase}/api/v1/health`)
      return res.json()
    },
    async submit() {
      try {
        await fetch(`${this.apiBase}/api/v1/setup/database`, {
          method: 'POST',
          body: JSON.stringify({
            client: this.driver,
            connection: this.connection,
            prefix: this.prefix
          })
        })
        this.checkHealth()
      } catch(e) {
        console.error(e)
        alert(e.message)
      }
    },
    async checkHealth(reset = true) {
      if (this.timeout) {
        clearTimeout(this.timeout)
        if (reset) this.attempts = 0
      }
      this.health = await this.getHealth()
      if (this.health?.checks?.some(h => h.slug === 'database' && h.ok)) {
        this.$router.push('/setup/admin')
      } else if (this.attempts < this.maxAttempts) {
        this.attempts++
        this.timeout = setTimeout(() => this.checkHealth(false), 1000)
      } else {
        this.attempts = 0
        this.timeout = null
        this.hasFailed = true
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
