<template>
  <template v-if="node?.vue_instance">
    <component :slug="slug" :sub="sub" v-if="sub && navTree" :is="'drop-' + slug + '-' + sub" />
    <component :slug="slug" :sub="sub" v-else-if="navTree" :is="'drop-' + slug" />
  </template>
  <div style="padding: 20px 20px 50px" v-else>
    <h1 style="margin: 0 0 20px">{{isCreating ? translate('New') : translate('Update')}} {{ translate('setting') }}</h1>
    <div class="wrapper">
      <div class="content">
        <div class="title" v-if="postTypeFields?.find(f => f.field.slug === 'title')">
          <input :placeholder="translate('Title')" v-model="title" />
        </div>
        <div class="slug" v-if="postTypeFields?.find(f => f.field.slug === 'slug')">
          <input :placeholder="translate('Slug')" v-model="newSlug" />
        </div>
        <div class="permalink">
          {{ translate('Permalink') }}: <a :href="'https://'" target="_blank">https://</a>
        </div>
        <div>
          <router-link class="button" :to="'/settings'">
            <svg style="width: 15px; margin-right: 5px" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 52 52" xml:space="preserve"><path d="M48.6 23H15.4c-.9 0-1.3-1.1-.7-1.7l9.6-9.6c.6-.6.6-1.5 0-2.1l-2.2-2.2c-.6-.6-1.5-.6-2.1 0L2.5 25c-.6.6-.6 1.5 0 2.1L20 44.6c.6.6 1.5.6 2.1 0l2.1-2.1c.6-.6.6-1.5 0-2.1l-9.6-9.6c-.6-.7-.2-1.8.7-1.8h33.2c.8 0 1.5-.6 1.5-1.4v-3c0-.8-.6-1.6-1.4-1.6"/></svg>
            {{ translate('Go back to') }} {{ translate('Settings')?.toLowerCase() }}
          </router-link>
        </div>
        <div class="grid">
          <card>
            <template #header>
              <h2>{{ translate('Fields') }}</h2>
            </template>
            <div class="fields">
              <div v-for="{ field, priority, source } in postTypeFields?.filter(f => !['slug', 'title', 'status'].includes(f.field.slug))" class="field">
                <label>{{ translate(field.name) }} {{ field.required ? '*' : '' }}</label>
                <input v-if="field.type === 'text'" v-model="obj[field.slug]"/>
                <input v-else-if="field.type === 'number'" type="number" v-model="obj[field.slug]"/>
                <textarea v-else-if="field.type === 'editor'" v-model="obj[field.slug]"/>
                <textarea v-else-if="field.type === 'textarea'" v-model="obj[field.slug]"/>
                <select v-else-if="field.type === 'select'" v-model="obj[field.slug]">
                  <option v-for="choice in field.options?.choices" :value="choice">
                    {{ choice }}
                  </option>
                </select>
                <component :large="true" v-else-if="controls?.find(c => c.slug === field.type)" :postType="slug" :is="getControl(field.type)" v-model="obj[field.slug]" :field="field" :priority="priority" :source="source" :item="obj"/>
                <div v-else>Unsupported field: {{ field }}</div>
              </div>
            </div>
            <template #footer>
              <!-- {{ obj }} -->
            </template>
          </card>
        </div>
      </div>
      <div class="grid">
        <card>
          <template #header>
            <h2>{{ translate('Publish') }}</h2>
          </template>
          <div class="publish-row">
            <div class="icon">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 6a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3h0a3 3 0 0 1-3 3h0a3 3 0 0 1-3-3m3 3v12" style="fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2"/></svg>
            </div>
            <label>{{ translate('Status') }}:</label>
            <select v-model="status">
              <option :value="choice" v-for="choice in postTypeFields?.find(f => f.field.slug === 'status')?.field?.options?.choices || []">
                {{ choice }}
              </option>
            </select>
          </div>
          <template #footer>
            <button :disabled="isCreating" @click="status='trashed', save()">{{ translate('Move to trash') }}</button>
            <button @click="save" v-if="isCreating">{{ translate('Create') }}</button>
            <button @click="save" v-else>{{ translate('Update') }}</button>
          </template>
        </card>

        <card>
          <template #header>
            <h2>{{ translate('Categories') }}</h2>
          </template>
          
          <template #footer>
          </template>
        </card>

      </div>
    </div>
  </div>
</template>

<script>
import Card from '@/components/Card.vue'
export default {
  components: { Card },
  inject: ['translate', 'apiBase', 'apiFetch', 'navTree', 'controls', 'getControl'],
  props: ['sub'],
  data: () => ({
    slug: 'options',
    postTypeFields: [],
    title: '',
    newSlug: '',
    status: 'draft',
    obj: {}
  }),
  created() {
    this.init()
  },
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    },
    isCreating() {
      return this.sub === 'new'
    }
  },
  watch: {
    slug() {
      this.init()
    },
    sub() {
      this.init()
    }
  },
  methods: {
    async init() {
      this.postTypeFields = [
        {
          field: {
            parent_slug: this.slug,
            name: 'Name',
            slug: 'name',
            type: 'text',
            revisions: false,
            required: true,
            priority: 10,
            order: 1000
          },
          priority: 10,
          source: 'runtime'
        },
        {
          field: {
            parent_slug: this.slug,
            name: 'Value',
            slug: 'value',
            type: 'text',
            revisions: false,
            required: false,
            priority: 10,
            order: 1100
          },
          priority: 10,
          source: 'runtime'
        },
        {
          field: {
            parent_slug: this.slug,
            name: 'Auto load',
            slug: 'autoload',
            type: 'boolean',
            revisions: false,
            required: false,
            priority: 10,
            order: 1200
          },
          priority: 10,
          source: 'runtime'
        }
      ]
      this.title = ''
      this.newSlug = ''
      this.status = 'draft'
      this.obj = {}
      await Promise.all([this.getPost()])
      if (this.isCreating) this.newSlug = ''
    },
    async getPost() {
      if (!this.slug || this.isCreating) return
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/${this.sub}`)
      this.asign(await result.json())
    },
    async save() {
      try {
        if (this.obj?.id) {
          const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/${this.obj.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              ...this.obj,
              title: this.title,
              slug: this.newSlug
            })
          })
          this.asign(await result.json())
          if (this.obj.slug && this.obj.slug !== this.slug) {
            this.$router.push('/settings/' + this.obj.slug)
          } else if (!this.obj.slug && this.obj.id !== this.slug) {
            this.$router.push('/settings/' + this.obj.id)
          }
          //alert('Saved!')
        } else {
          const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}`, {
            method: 'POST',
            body: JSON.stringify({
              title: this.title,
              slug: this.newSlug,
              ...this.obj
            })
          })
          this.asign(await result.json())
          this.$router.push('/settings/' + (this.obj.slug || this.obj.id))
          //alert('Saved!')
        }
      } catch(e) {
        console.error(e)
        alert(`Something went wrong: ${e.message}`)
      }
    },
    asign(obj) {
      this.newSlug = obj.slug
      this.title = obj.title
      this.obj = Object.fromEntries(Object.entries(obj))
    }
  }
}
</script>

<style scoped>
[disabled] {
  opacity: 50%;
}
h1 {
  font-size: 23px;
  font-weight: 500;
}

.field label {
  margin: 5px 0;
  font-size: 16px!important;
}
.field {
  display: flex;
  flex-direction: column;
  padding-bottom: 25px;
}

input,
textarea {
  padding: 5px 10px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
}

input, select {
  height: 30px;
}

textarea {
  height: 100px;
  padding: 10px;
}

button, .button {
  position: relative;
  background: none;
  border: none;
  margin: 0;
  font: inherit;
  text-align: inherit;
  text-decoration: none;
  appearance: none;
  -webkit-appearance: none;
  /* Safari */
  -moz-appearance: none;
  /* Firefox */
  cursor: pointer;
  padding: 0 10px!important;
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

button:hover, .button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

a {
  text-decoration: none;
  color: var(--color-primary);
  font-weight: 500;
}

a:hover {
  color: var(--color-primary-hover);
}

.wrapper {
  display: flex;
  width: 100%;
  gap: 25px;
}

.content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 20px;
}

.title,
.slug {
  width: 100%;
}

.title input,
.slug input {
  width: 100%;
  height: 40px;
}

.publish-row {
  display: flex;
  align-items: center;
  height: 40px;
}

.publish-row label {
  display: flex;
  flex-grow: 1;
  align-items: center;
}

.publish-row .icon {
  display: flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
}

.publish-row select {
  min-width: 120px;
  height: 30px;
}

.publish-row .icon svg {
  max-width: 100%;
  max-height: 100%;
}

.grid {
  min-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.grid input,
.grid textarea {
  margin-bottom: 15px;
  padding: 5px 10px;
  box-sizing: border-box;
}

.grid input {
  height: 30px;
}

.grid textarea {
  height: 100px;
  padding: 10px;
}

.grid button {
  position: relative;
  background: none;
  border: none;
  margin: 0;
  font: inherit;
  text-align: inherit;
  text-decoration: none;
  appearance: none;
  -webkit-appearance: none;
  /* Safari */
  -moz-appearance: none;
  /* Firefox */
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

.grid button:hover {
  background-color: var(--color-primary-hover);
}

.grid a {
  text-decoration: none;
  color: var(--color-primary);
  font-weight: 500;
}

.grid a:hover {
  color: var(--color-primary-hover);
}

@media (max-width: 768px) {
  .wrapper {
    flex-direction: column;
  }
}
</style>
