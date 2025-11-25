<template>
  <div style="padding: 20px 20px 50px">
    <h1 style="margin: 0 0 20px">{{ node?.page_title }}</h1>
    <div class="grid-dashboard">
      <div class="card">
        <div class="card-header">
          <h2>Hurtigkladd</h2>
        </div>
        <div class="card-content">
          <label>Tittel</label>
          <input/>
          <label>Innhold</label>
          <textarea placeholder="Hva tenker du på?"/>
          <button>
            Lagre kladd
          </button>
        </div>
        <div class="card-footer">
          <h3>Dine siste kladder</h3>
          <router-link to="">Kladd 1</router-link>
          <router-link to="">Kladd 2</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['apiFetch', 'apiBase', 'navTree'],
  props: ['sub', 'slug'],
  data: () => ({
  }),
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    }
  },
  methods: {
  }
}
</script>

<style scoped>
  h1 {
    font-size: 23px;
    font-weight: 500;
  }
  .grid-dashboard {
    display: flex;
  }
  .grid-dashboard .card {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-forms);
    border: 1px solid var(--color-border);
    width: 350px;
    max-width: 100%;
  }
  .grid-dashboard .card-header h2 {
    margin: 0;
    font-size: 15px
  }
  .grid-dashboard .card-header {
    display: flex;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
  }
  .grid-dashboard .card-content {
    display: flex;
    flex-direction: column;
    padding: 10px 10px 15px;
  }
  .grid-dashboard .card-content label {
    font-size: 14px;
    margin-bottom: 5px;
  }
  .grid-dashboard .card-footer h3 {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 500;
  }
  .grid-dashboard .card-footer {
    display: flex;
    flex-direction: column;
    padding: 10px;
    border-top: 1px solid var(--color-border);
    font-size: 14px
  }
  .grid-dashboard input, .grid-dashboard textarea {
    margin-bottom: 15px;
    padding: 5px 10px;
    box-sizing: border-box;
  }
  .grid-dashboard input {
    height: 30px;
  }
  .grid-dashboard textarea {
    height: 100px;
    padding: 10px;
  }
  .grid-dashboard button {
    position: relative;
    background: none;
    border: none;
    margin: 0;
    font: inherit;
    text-align: inherit;
    text-decoration: none;
    appearance: none;
    -webkit-appearance: none; /* Safari */
    -moz-appearance: none;    /* Firefox */
    cursor: pointer;
    padding: 0 5px;
    height: 32px;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    background-color: var(--color-primary);
    color: var(--color-bg);
    font-weight: 600;
    font-size: 14px;
    border-radius: 4px;
    flex-grow: 0;
  }
  .grid-dashboard button:hover {
    background-color: var(--color-primary-hover);
  }
  .grid-dashboard a {
    text-decoration: none;
    color: var(--color-primary);
    font-weight: 500;
  }
  .grid-dashboard a:hover {
    color: var(--color-primary-hover);
  }
</style>
