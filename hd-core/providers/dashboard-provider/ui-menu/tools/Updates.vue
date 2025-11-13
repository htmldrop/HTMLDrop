<template>
  <div style="padding: 20px 20px 50px">
    <h1 style="margin: 0 0 20px">{{ node?.page_title }}</h1>
    Take your hands up in the air, {{ message }}
  </div>
</template>
<script>
export default {
  inject: ['apiFetch', 'apiBase', 'navTree'],
  props: ['sub', 'slug'],
  data: () => ({
    message: 'yes take your hands up, in the air!'
  }),
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    }
  }
}
</script>

<style>
  div {
  }
</style>
