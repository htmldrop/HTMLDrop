<template>
  <template v-if="node?.vue_instance">
    <component :slug="slug" :sub="sub" v-if="sub && navTree" :is="'drop-' + slug + '-' + sub" />
    <component :slug="slug" :sub="sub" v-else-if="navTree" :is="'drop-' + slug" />
  </template>
  <div style="padding: 20px 20px 50px" v-else>
    <h1 style="margin: 0 0 20px">{{isCreating ? translate('New') : translate('Update')}} {{ node?.name_singular }}</h1>
    <div class="wrapper">
      <div class="content">
        <div class="title" v-if="taxonomyFields?.find(f => f.field.slug === 'title')">
          <input :placeholder="translate('Title')" v-model="title" />
        </div>
        <div class="slug" v-if="taxonomyFields?.find(f => f.field.slug === 'slug')">
          <input :placeholder="translate('Slug')" v-model="newSlug" />
        </div>
        <div class="permalink">
          {{ translate('Permalink') }}: <a :href="'https://'" target="_blank">https://</a>
        </div>
        <div>
          <router-link class="button" :to="'/' + slug + '/terms/' + taxonomy">
            <svg style="width: 15px; margin-right: 5px" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 52 52" xml:space="preserve"><path d="M48.6 23H15.4c-.9 0-1.3-1.1-.7-1.7l9.6-9.6c.6-.6.6-1.5 0-2.1l-2.2-2.2c-.6-.6-1.5-.6-2.1 0L2.5 25c-.6.6-.6 1.5 0 2.1L20 44.6c.6.6 1.5.6 2.1 0l2.1-2.1c.6-.6.6-1.5 0-2.1l-9.6-9.6c-.6-.7-.2-1.8.7-1.8h33.2c.8 0 1.5-.6 1.5-1.4v-3c0-.8-.6-1.6-1.4-1.6"/></svg>
            {{ translate('Go back to') }} {{ translate(node?.name_plural) }}
          </router-link>
        </div>
        <div class="grid">
          <card>
            <template #header>
              <h2>{{ translate('Fields') }}</h2>
            </template>
            <div class="fields">
              <div v-for="{ field, priority, source } in taxonomyFields?.filter(f => !['slug', 'title', 'featured_image', 'status'].includes(f.field.slug))" class="field">
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
              <option :value="choice" v-for="choice in taxonomyFields?.find(f => f.field.slug === 'status')?.field?.options?.choices || []">
                {{ choice }}
              </option>
            </select>
          </div>
          <div class="publish-row">
            <div class="icon">
              <svg width="15px" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 338.784 338.784" xml:space="preserve"><path d="M18.93 168.462C18.93 85.497 86.427 18 169.392 18c41.483 0 80.871 17.046 109.254 47.017h-7.688a9 9 0 0 0-9 9 9 9 0 0 0 9 9h30.522a9 9 0 0 0 9-9V43.494c0-4.971-4.029-9-9-9s-9 4.029-9 9v9.971C260.649 19.401 216.217 0 169.392 0 76.502 0 .93 75.572.93 168.462c0 40.967 14.882 80.454 41.903 111.188a8.98 8.98 0 0 0 6.763 3.057 8.97 8.97 0 0 0 5.938-2.241 9 9 0 0 0 .816-12.702c-24.13-27.446-37.42-62.712-37.42-99.302m308.191-59.294a9 9 0 1 0-16.848 6.336c6.357 16.905 9.581 34.723 9.581 52.958 0 82.965-67.497 150.461-150.462 150.461-24.007 0-47.843-5.792-69.014-16.738l8.134-2.88a9 9 0 0 0-6.009-16.967l-28.771 10.189a9 9 0 0 0-5.479 11.488l10.189 28.771a9 9 0 0 0 8.483 5.998 9 9 0 0 0 8.484-12.007l-2.993-8.45c23.641 12.16 50.217 18.596 76.976 18.596 92.891 0 168.462-75.571 168.462-168.461 0-20.406-3.611-40.356-10.733-59.294"/><path d="M169.392 56.371c-61.132 0-110.866 49.734-110.866 110.866s49.734 110.866 110.866 110.866 110.866-49.734 110.866-110.866c.001-61.132-49.734-110.866-110.866-110.866m85.112 119.866h7.317c-4.255 44.037-39.392 79.174-83.429 83.429v-7.317a9 9 0 0 0-9-9 9 9 0 0 0-9 9v7.317c-44.037-4.255-79.174-39.392-83.429-83.428h7.317c4.971 0 9-4.029 9-9s-4.029-9-9-9h-7.317c4.255-44.037 39.392-79.174 83.429-83.429v7.317a9 9 0 0 0 9 9 9 9 0 0 0 9-9v-7.317c44.037 4.255 79.174 39.392 83.429 83.428h-7.317a9 9 0 0 0-9 9 9 9 0 0 0 9 9"/><path d="M209.864 167.286h-31.472v-48.79a9 9 0 0 0-9-9 9 9 0 0 0-9 9v57.79a9 9 0 0 0 9 9h40.472c4.971 0 9-4.029 9-9s-4.029-9-9-9"/></svg>
            </div>
            <label>{{ translate('Revisions') }}:</label>
            <button :disabled="isCreating">{{ translate('Browse') }}</button>
          </div>
          <template #footer>
            <button :disabled="isCreating" @click="status='trashed', save()">{{ translate('Move to trash') }}</button>
            <button @click="save" v-if="isCreating">{{ translate('Create') }}</button>
            <button @click="save" v-else>{{ translate('Update') }}</button>
          </template>
        </card>

        <card v-if="featuredImage">
          <template #header>
            <h2>{{ translate('Featured image') }}</h2>
          </template>

          <component :large="true" :is="getControl('media')" v-model="obj['featured_image']" :postType="slug" :field="featuredImage.field" :priority="featuredImage.priority" :source="featuredImage.source" :item="obj"/>
          
          <template #footer>
          </template>
        </card>
      </div>
    </div>
    <teleport to="body">
      <component
        v-if="fileupload"
        :is="getControl('mediaselector')"
        :postType="'attachments'"
        :field="field"
        :priority="priority"
        :source="source"
        :item="item"
        :multi="false"
        @close="fileupload=false"
      />
    </teleport>
  </div>
</template>

<script>
import Card from '@/components/Card.vue'
export default {
  components: { Card },
  inject: ['translate', 'apiBase', 'apiFetch', 'navTree', 'controls', 'getControl'],
  props: ['slug', 'taxonomy', 'sub'],
  data: () => ({
    fileupload: false,
    postType: null,
    postTypeFields: [],
    taxonomyItem: null,
    taxonomyFields: [],
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
      const childnode = node?.children?.find(n => n.slug === `terms/${this.taxonomy}`)
      if (!this.sub) return childnode
      return childnode?.children?.find(n => n.slug === this.sub) || childnode
    },
    isCreating() {
      return this.sub === 'new'
    },
    featuredImage() {
      return this.taxonomyFields?.find(f => f.field.slug === 'featured_image' && f.field.type === 'media')
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
      this.postType = null
      this.postTypeFields = []
      this.taxonomyItem = null
      this.taxonomyFields = []
      this.title = ''
      this.newSlug = ''
      this.status = 'draft'
      this.obj = {}
      await Promise.all([this.getPostType(), this.getPostTypeFields(), this.getTaxonomy(), this.getTaxonomyFields(), this.getTerm()])
      if (this.isCreating) this.newSlug = ''
    },
    async getPostType() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/post-types/${this.slug}`)
      this.postType = await result.json()
    },
    async getPostTypeFields() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/fields`)
      this.postTypeFields = await result.json()
      if (typeof this.postTypeFields?.sort === 'function') {
        this.postTypeFields = this.postTypeFields.sort((a, b) => a.field.order - b.field.order)
      }
    },
    async getTaxonomy() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/taxonomies/${this.taxonomy}`)
      this.taxonomyItem = await result.json()
    },
    async getTaxonomyFields() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/taxonomies/${this.taxonomy}/fields`)
      this.taxonomyFields = await result.json()
      if (typeof this.taxonomyFields?.sort === 'function') {
        this.taxonomyFields = this.taxonomyFields.sort((a, b) => a.field.order - b.field.order)
      }
    },
    async getTerm() {
      if (!this.slug || this.isCreating) return
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/terms/${this.taxonomy}/${this.sub}`)
      this.asign(await result.json())
    },
    async save() {
      try {
        if (this.obj?.id) {
          const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/terms/${this.taxonomy}/${this.obj.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              ...this.obj,
              title: this.title,
              slug: this.newSlug
            })
          })
          this.asign(await result.json())
          if (this.obj.slug && this.obj.slug !== this.slug) {
            this.$router.push('/' + this.slug + '/terms/' + this.taxonomy + '/' + this.obj.slug)
          } else if (!this.obj.slug && this.obj.id !== this.slug) {
            this.$router.push('/' + this.slug + '/terms/' + this.taxonomy + '/' + this.obj.id)
          }
          //alert('Saved!')
        } else {
          const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/terms/${this.taxonomy}`, {
            method: 'POST',
            body: JSON.stringify({
              title: this.title,
              slug: this.newSlug,
              ...this.obj
            })
          })
          this.asign(await result.json())
          this.$router.push('/' + this.slug + '/terms/' + this.taxonomy + '/' + (this.obj.slug || this.obj.id))
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
