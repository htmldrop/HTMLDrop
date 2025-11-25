<template>
  <Wizard :steps="['Lost Connection']">
    <h1>Lost connection with server</h1>
    <h2>Will automatically try to reconnect every second</h2>
  </Wizard>
</template>

<script>
import Wizard from '../../components/wizard.vue'
export default {
  inject: ['apiBase'],
  components: { Wizard },
  data: () => ({
    interval: null
  }),
  async created() {
    this.interval = setInterval(async () => {
      try {
        const res = await fetch(`${this.apiBase}/api/v1/health`)
        if (res.ok) this.$router.push('/setup')
      } catch(e) {
        // console.error(e)
      }
    }, 1000)
  },
  beforeUnmount() {
    clearInterval(this.interval)
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
