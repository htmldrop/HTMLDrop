<template>
  <div class="drop-control-users">
    <div v-for="user in users" class="user" :title="user?.username || user?.email">
      {{ (user?.username || user?.email)?.[0] }}
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch'],
  props: ['modelValue', 'field', 'priority', 'source', 'item'],
  emits: ['update:modelValue'],
  data: () => ({
    users: []
  }),
  async created() {
    await this.getUsers()
  },
  watch: {
    async modelValue() {
      await this.getUsers()
    },
    async item() {
      await this.getUsers()
    },
    async field() {
      await this.getUsers()
    }
  },
  methods: {
    async getUsers() {
      if (!this.modelValue) return
      try {
        let ids = this.modelValue
        if (typeof ids === 'string') ids = JSON.parse(ids)
        const res = await this.apiFetch(`${this.apiBase}/api/v1/users?ids=${ids.join(',')}`)
        this.users = (await res.json())?.items
      } catch(e) {
        console.log(e)
      }
    }
  }

}
</script>

<style>
.drop-control-users {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.user {
  width: 24px;
  height: 24px;
  background-color: var(--color-bg);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--color);
  font-weight: 500;
  font-size: 20px;
  cursor: pointer;
}
</style>