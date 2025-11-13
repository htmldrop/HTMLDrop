<template>
  <template v-if="node?.vue_instance">
    <component :slug="slug" :sub="sub" v-if="sub && navTree" :is="'drop-' + slug + '-' + sub" />
    <component :slug="slug" :sub="sub" v-else-if="navTree" :is="'drop-' + slug" />
  </template>
  <div class="container" v-else>
    <div class="header-section">
      <h1>{{ node?.page_title }}</h1>
      <router-link v-if="postType?.slug !== 'attachments'" class="add-button" :to="'/' + slug + '/new'">{{ translate('Add') }} {{ translate(postType?.name_singular)?.toLowerCase() }}</router-link>
      <button v-if="postType?.slug === 'attachments'" class="add-button" @click="mediaUploader=true">{{ translate('Upload media') }}</button>
      <teleport to="body">
        <component
          v-if="mediaUploader"
          :is="getControl('mediaselector')"
          :multi="false"
          :hideSelect="true"
          postType="attachments"
          @close="mediaUploader=false; getItems()"
        />
      </teleport>
    </div>
    <div class="tabs-and-search">
      <div class="tabs">
        <button @click="tab = 'all'" :class="{ active: tab === 'all' }" class="tab-button">{{ translate('All') }} ({{ response?.total || 0 }})</button>
        <button @click="tab = 'published'" :class="{ active: tab === 'published' }" class="tab-button">{{ translate('Published') }} ({{ response?.total_published  || 0}})</button>
        <button @click="tab = 'drafts'" :class="{ active: tab === 'drafts' }" class="tab-button">{{ translate('Drafts') }} ({{ response?.total_drafts  || 0}})</button>
        <button @click="tab = 'trashed'" :class="{ active: tab === 'trashed' }" class="tab-button">{{ translate('Trashed') }} ({{ response?.total_trashed  || 0}})</button>
      </div>
      <div class="search">
        <input v-model="search" @keypress.enter="offset = 0; getItems()"/>
        <button @click="offset = 0; getItems()" class="search-button">{{ translate('Search in') }} {{ translate(postType?.name_plural)?.toLowerCase() }}</button>
      </div>
    </div>
    <div class="filters-and-navigation">
      <div class="filters">
        <div class="filters-section">
          <select v-model="action">
            <option>{{ translate('Bulk actions') }}</option>
            <option v-if="tab !== 'trashed'" value="trash">{{ translate('Move to trash') }}</option>
            <option v-if="tab === 'trashed'" value="restore">{{ translate('Restore') }}</option>
            <option v-if="tab === 'trashed'" value="delete">{{ translate('Permanently delete') }}</option>
            <option value="duplicate">{{ translate('Duplicate') }}</option>
            <option value="save">{{ translate('Save') }}</option>
          </select>
          <button :disabled="!action" @click="runBulk(action)">{{ translate('Apply') }}</button>
        </div>
        <div class="filters-section">
          <select>
            <option>{{ translate('All dates') }}</option>
          </select>
          <select>
            <option>{{ translate('All categories') }}</option>
          </select>
          <button>{{ translate('Filter') }}</button>
        </div>
      </div>
      <div class="navigation">
        <span class="nav-text">{{ response?.items?.length || 0 }} {{ translate('items') }}</span>
        <button :disabled="offset <= 0" @click="offset = 0; getItems()">&laquo;</button>
        <button :disabled="offset <= 0" @click="offset -= response?.limit; getItems()">&lsaquo;</button>
        <span class="page-info">{{ Math.floor(response?.offset / response?.limit) + 1 || 0 }} {{ translate('of') }} {{ Math.ceil(response?.total_current / response?.limit) || 0 }}</span>
        <button :disabled="offset + response?.limit >= response?.total_current" @click="offset += response?.limit; getItems()">&rsaquo;</button>
        <button :disabled="offset + response?.limit >= response?.total_current" @click="offset = (Math.ceil(response?.total_current / response?.limit) - 1) * response?.limit; getItems()">&raquo;</button>
      </div>
    </div>
    <div class="table-wrapper">
      <div class="table">
        <div class="header">
          <div @click="toggleAll" class="checkbox-cell sticky-left"><input @click.stop type="checkbox" :checked="allSelected" @change="toggleAll" /></div>
          <div class="actions-cell sticky-left">
            {{ translate('Actions') }}
          </div>
          <div v-for="{ field, priority, source } in postTypeFields || []" :key="field.slug" class="field">
            {{ translate(field.name) }}
          </div>
          <div v-for="{ slug, post_type_slug, name_plural } in postTypeTaxonomies || []" :key="post_type_slug + '_' + slug" class="field">
            {{ translate(name_plural) }}
          </div>
          <div class="field">{{ translate('Created at') }}</div>
          <div class="field">{{ translate('Updated at') }}</div>
          <div class="field" v-if="tab === 'trashed'">{{ translate('Deleted at') }}</div>
          <div @click="toggleAll" class="checkbox-cell sticky-right"><input @click.stop type="checkbox" :checked="allSelected" @change="toggleAll" /></div>
        </div>

        <div class="body">
          <div v-for="item in response?.items || []" :key="item.id" class="row">
            <div @click="toggleItem(item.id)" class="checkbox-cell sticky-left"><input @click.stop type="checkbox" :checked="isSelected(item.id)" @change="toggleItem(item.id)" /></div>
            <div class="actions-cell sticky-left">
              <router-link class="button" :to="'/' + slug + '/' + (postTypeFields?.some(f => f.field?.slug === 'slug') ? item.slug : item.id)">{{ translate('Open') }}</router-link>
              <button v-if="tab === 'trashed'" class="button" @click="restore(item)">{{ translate('Restore') }}</button>
              <button v-if="tab !== 'trashed'" class="button" @click="trash(item)">{{ translate('Trash') }}</button>
              <button v-else class="button" @click="trash(item, true)">{{ translate('Delete') }}</button>
              <button class="button" :disabled="!hasChanges(item)" @click="save(item)">{{ translate('Save') }}</button>
            </div>
            <div v-for="{ field, priority, source } in postTypeFields || []" :key="field.slug" class="field">
              <select v-if="field.type === 'select'" v-model="item[field.slug]">
                <option v-for="option in field.options?.choices" :value="option">
                  {{ option }}
                </option>
              </select>
              <input v-else-if="field.type === 'text'" v-model="item[field.slug]" />
              <input v-else-if="field.type === 'number'" type="number" v-model="item[field.slug]" />
              <textarea v-else-if="field.type === 'textarea'" v-model="item[field.slug]" />
              <textarea v-else-if="field.type === 'editor'" v-model="item[field.slug]" />
              <component v-else-if="controls?.find(c => c.slug === field.type)" :postType="slug" :is="getControl(field.type)" v-model="item[field.slug]" :field="field" :priority="priority" :source="source" :item="item"/>
              <div v-else>Unsupported field: {{ field }}</div>
            </div>
            <div v-for="{ slug } in postTypeTaxonomies || []" :key="'taxonomy_' + slug" class="field">
              <!-- Search input for this taxonomy -->
              <input
                type="text"
                :value="termSearch[item.id]?.[slug] || ''"
                @input="e => {
                  getTermState(item.id, slug)
                  termSearch[item.id][slug] = e.target.value
                  searchTermsDebounced(item.id, slug, e.target.value)
                }"
                :placeholder="'Search for ' + slug"
              />

              <!-- Multi-select with filtered terms -->
              <select multiple v-model="item.terms[slug]">
                <option
                  v-for="term in termResults[item.id]?.[slug] || []"
                  :key="term.id"
                  :value="term"
                >
                  {{ term.title || term.slug }}
                </option>
              </select>
            </div>
            <div class="field">
              <input readonly :value="item?.created_at" />
            </div>
            <div class="field">
              <input readonly :value="item?.updated_at" />
            </div>
            <div class="field" v-if="tab === 'trashed'">
              <input readonly :value="item?.deleted_at" />
            </div>
            <div @click="toggleItem(item.id)" class="checkbox-cell sticky-right"><input @click.stop type="checkbox" :checked="isSelected(item.id)" @change="toggleItem(item.id)" /></div>
          </div>
        </div>

        <div class="footer">
          <div @click="toggleAll" class="checkbox-cell sticky-left"><input @click.stop type="checkbox" :checked="allSelected" @change="toggleAll" /></div>
          <div class="actions-cell sticky-left">
            {{ translate('Actions') }}
          </div>
          <div v-for="{ field, priority, source } in postTypeFields || []" :key="field.slug" class="field">
            {{ translate(field.name) }}
          </div>
          <div v-for="{ slug, post_type_slug, name_plural } in postTypeTaxonomies || []" :key="post_type_slug + '_' + slug" class="field">
            {{ translate(name_plural) }}
          </div>
          <div class="field">{{ translate('Created at') }}</div>
          <div class="field">{{ translate('Updated at') }}</div>
          <div class="field" v-if="tab === 'trashed'">{{ translate('Deleted at') }}</div>
          <div @click="toggleAll" class="checkbox-cell sticky-right"><input @click.stop type="checkbox" :checked="allSelected" @change="toggleAll" /></div>
        </div>
      </div>
    </div>
    <div class="filters-and-navigation bottom-nav">
      <div class="filters">
        <div class="filters-section">
          <select v-model="action">
            <option>{{ translate('Bulk actions') }}</option>
            <option v-if="tab !== 'trashed'" value="trash">{{ translate('Move to trash') }}</option>
            <option v-if="tab === 'trashed'" value="restore">{{ translate('Restore') }}</option>
            <option v-if="tab === 'trashed'" value="delete">{{ translate('Permanently delete') }}</option>
            <option value="duplicate">{{ translate('Duplicate') }}</option>
            <option value="save">{{ translate('Save') }}</option>
          </select>
          <button :disabled="!action" @click="runBulk(action)">{{ translate('Apply') }}</button>
        </div>
        <div class="filters-section">
          <select>
            <option>{{ translate('All dates') }}</option>
          </select>
          <select>
            <option>{{ translate('All categories') }}</option>
          </select>
          <button>{{ translate('Filter') }}</button>
        </div>
      </div>
      <div class="navigation">
        <span class="nav-text">{{ response?.items?.length || 0 }} {{ translate('items') }}</span>
        <button :disabled="offset <= 0" @click="offset = 0; getItems()">&laquo;</button>
        <button :disabled="offset <= 0" @click="offset -= response?.limit; getItems()">&lsaquo;</button>
        <span class="page-info">{{ Math.floor(response?.offset / response?.limit) + 1 || 0 }} {{ translate('of') }} {{ Math.ceil(response?.total_current / response?.limit) || 0 }}</span>
        <button :disabled="offset + response?.limit >= response?.total_current" @click="offset += response?.limit; getItems()">&rsaquo;</button>
        <button :disabled="offset + response?.limit >= response?.total_current" @click="offset = (Math.ceil(response?.total_current / response?.limit) - 1) * response?.limit; getItems()">&raquo;</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch', 'navTree', 'controls', 'getControl'],
  props: ['slug', 'sub'],
  data: () => ({
    action: '',
    postType: null,
    postTypeFields: [],
    postTypeTaxonomies: [],
    response: {},
    responseOriginal: {},
    allSelected: false,
    selectedItems: [],
    tab: 'all',
    offset: 0,
    limit: 10,
    search: '',
    searchable: ['slug', 'title'],
    orderBy: '',
    sort: '',
    mediaUploader: false,
    termSearch: {},
    termResults: {},
    searchTermsDebounced: null
  }),
  created() {
    this.searchTermsDebounced = this.debounce(this.searchTerms, 300)
    if (this.navTree && !this.node?.vue_instance) {
      this.init()
    }
  },
  mounted() {
    this.syncActionCellWidths()
    window.addEventListener('resize', this.syncActionCellWidths)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.syncActionCellWidths)
  },
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    }
  },
  watch: {
    navTree(newVal) {
      if (newVal && !this.node?.vue_instance && !this.postType) {
        this.init()
      }
    },
    slug() {
      this.tab = 'all'
      if (this.navTree && !this.node?.vue_instance) {
        this.init()
      }
    },
    sub() {
      if (this.navTree && !this.node?.vue_instance) {
        this.init()
      }
    },
    response(res) {
      this.$nextTick(() => this.syncActionCellWidths())
    },
    tab() {
      if (this.navTree && !this.node?.vue_instance) {
        this.init()
      }
    }
  },
  methods: {
    getTermState(itemId, slug) {
      if (!this.termSearch[itemId]) this.termSearch[itemId] = {}
      if (!this.termResults[itemId]) this.termResults[itemId] = {}
    },
    debounce(func, wait = 300) {
      let timeout
      return (...args) => {
        clearTimeout(timeout)
        timeout = setTimeout(() => func.apply(this, args), wait)
      }
    },
    async searchTerms(itemId, slug, query) {
      this.getTermState(itemId, slug)

      const currentTerms = itemId
        ? this.response?.items?.find(i => i.id === itemId)?.terms?.[slug] || []
        : []

      if (!query) {
        // Only show currently attached terms
        this.termResults[itemId][slug] = [...currentTerms]
        return
      }

      const result = await this.apiFetch(
        `${this.apiBase}/api/v1/${this.slug}/terms/${slug}?search=${encodeURIComponent(query)}`
      )
      const searchTerms = (await result.json())?.items || []

      // Merge active and searched terms (no duplicates)
      const merged = [...currentTerms]
      for (const term of searchTerms) {
        if (!merged.find(t => t.id === term.id)) merged.push(term)
      }

      this.termResults[itemId][slug] = merged
    },
    hasChanges(item) {
      const originalItem = this.responseOriginal?.items.find(itm => itm.id === item.id)
      return JSON.stringify(item) !== JSON.stringify(originalItem)
    },
    getChanges(item) {
      const obj = {}
      const originalItem = this.responseOriginal?.items.find(itm => itm.id === item.id)
      for (const key of Object.keys(item)) {
        if (originalItem?.[key] !== item[key]) {
          obj[key] = item[key]
        }
      }
      return obj
    },
    async runBulk(action) {
      const items = this.response.items.filter(item => this.selectedItems.includes(item.id))
      if (action === 'trash') {
        for (const item of items) {
          this.trash(item)
        }
      } else if (action === 'delete') {
        if (!confirm('Permanently delete all selected?')) return
        for (const item of items) {
          this.trash(item, true, true)
        }
      } else if (action === 'restore') {
        for (const item of items) {
          this.restore(item)
        }
      } else if (action === 'save') {
        for (const item of items) {
          this.save(item)
        }
      } else if (action === 'duplicate') {
        const promises = []
        for (const item of items) {
          const itm = JSON.parse(JSON.stringify(item))
          if (itm.slug) itm.slug += '-' + Date.now()
          delete itm.id
          delete itm.created_at
          delete itm.updated_at
          promises.push(this.create(itm))
        }
        await Promise.all(promises)
        this.getItems()
      }
    },
    async create(item) {
      await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}`, {
        method: 'POST',
        body: JSON.stringify(item)
      })
    },
    async save(item) {
      const originalItem = this.responseOriginal?.items.find(itm => itm.id === item.id)
      const status = originalItem.status
      const changes = this.getChanges(item)
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes)
      })
      const res = await result.json()
      for (const key of Object.keys(res)) {
        item[key] = res[key]
        if (typeof res[key] === 'object') {
          originalItem[key] = JSON.parse(JSON.stringify(res[key]))
        } else {
          originalItem[key] = res[key]
        }
      }

      // Re-initialize term arrays after update from API
      if (!item.terms) item.terms = {}
      if (!originalItem.terms) originalItem.terms = {}
      for (const { slug } of this.postTypeTaxonomies || []) {
        if (!item.terms[slug]) item.terms[slug] = []
        if (!originalItem.terms[slug]) originalItem.terms[slug] = []
      }

      if (item.status !== status) {
        if (item.status === 'draft') this.response.total_drafts++
        if (item.status === 'published') this.response.total_published++
        if (status === 'draft') this.response.total_drafts--
        if (status === 'published') this.response.total_published--
      }
      for (const slug of Object.keys(item.terms)) {
        const value = this.termSearch[item.id]?.[slug] || ''
        this.getTermState(item.id, slug)
        this.termSearch[item.id][slug] = ''
        await this.searchTerms(item.id, slug, '')
        if (!value) continue
        this.$nextTick(() => {
          this.termSearch[item.id][slug] = value
          this.getTermState(item.id, slug)
          this.termSearch[item.id][slug] = value
          this.searchTerms(item.id, slug, value)
        })
      }
      // alert('Saved!')
    },
    async trash(item, permanently = false, quiet = false) {
      const originalItem = this.responseOriginal?.items.find(itm => itm.id === item.id)
      const status = originalItem.status
      if (!quiet && permanently && !confirm(`Delete permanently?`)) return
      await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/${item.id}${permanently ? '?permanently=true' : ''}`, {
        method: 'DELETE'
      })
      this.responseOriginal.items = this.responseOriginal.items.filter(itm => itm.id !== item.id)
      this.response.items = this.response.items.filter(itm => itm.id !== item.id)
      if (!item.deleted_at) {
        if (status === 'draft') this.response.total_drafts--
        if (status === 'published') this.response.total_published--
        this.response.total_trashed++
        this.response.total--
      } else if (permanently) {
        if (status === 'draft') this.response.total_drafts++
        if (status === 'published') this.response.total_published++
        //this.response.total_trashed-=2
        this.response.total++
      }
      
    },
    async restore(item) {
      const originalItem = this.responseOriginal?.items.find(itm => itm.id === item.id)
      const status = originalItem.status
      await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ deleted_at: null })
      })
      this.responseOriginal.items = this.responseOriginal.items.filter(itm => itm.id !== item.id)
      this.response.items = this.response.items.filter(itm => itm.id !== item.id)
      this.response.total_trashed--
      this.response.total++
      if (status === 'draft') this.response.total_drafts++
      if (status === 'published') this.response.total_published++
    },
    async init() {
      this.postType = null
      this.postTypeFields = []
      this.postTypeTaxonomies = []
      this.search = ''
      this.response = {}
      this.responseOriginal = {}
      this.allSelected = false
      this.selectedItems = []
      await Promise.all([this.getPostType(), this.getPostTypeFields(), this.getPostTypeTaxonomies()])
      await this.getItems()
      this.selectedItems = []
      this.allSelected = false
    },
    async getPostType() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/post-types/${this.slug}`)
      this.postType = await result.json()
    },
    async getPostTypeFields() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/fields`)
      const postTypeFields = await result.json()
      if (typeof postTypeFields?.sort === 'function') {
        this.postTypeFields = postTypeFields.sort((a, b) => a.field.order - b.field.order)
      }
    },
    async getPostTypeTaxonomies() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/taxonomies`)
      this.postTypeTaxonomies = await result.json()
    },
    async getItems() {
      const params = new URLSearchParams()

      if (this.offset < 0) this.offset = 0

      if (this.tab === 'trashed') params.set('trashed', 'true')
      if (this.limit) params.set('limit', this.limit)
      if (this.offset) params.set('offset', this.offset)
      if (this.search) params.set('search', this.search)
      if (this.searchable) params.set('searchable', JSON.stringify(this.searchable))
      if (this.orderBy) params.set('orderBy', this.orderBy)
      if (this.sort) params.set('sort', this.sort)
      if (this.tab === 'published') params.set('status', 'published')
      if (this.tab === 'drafts') params.set('status', 'draft')

      const url = `${this.apiBase}/api/v1/${this.slug}${params.toString() ? '?' + params.toString() : ''}`

      const result = await this.apiFetch(url)
      this.response = await result.json()

      // Initialize terms for all items BEFORE creating the deep copy
      for (const item of this.response?.items || []) {
        if (!item.terms) item.terms = {}
        // Initialize missing taxonomies as empty arrays
        for (const { slug } of this.postTypeTaxonomies || []) {
          if (!item.terms[slug]) item.terms[slug] = []
        }
      }

      this.responseOriginal = JSON.parse(JSON.stringify(this.response))

      for (const item of this.response?.items) {
        for (const slug of Object.keys(item.terms)) {
          this.getTermState(item.id, slug)
          this.termResults[item.id][slug] = [...item.terms[slug]] // only active terms
        }
      }
    },
    toggleAll() {
      this.allSelected = !this.allSelected
      if (this.allSelected) {
        this.selectedItems = this.response?.items?.map(item => item.id) || []
      } else {
        this.selectedItems = []
      }
    },
    toggleItem(id) {
      const index = this.selectedItems.indexOf(id)
      if (index > -1) {
        this.selectedItems.splice(index, 1)
      } else {
        this.selectedItems.push(id)
      }
      this.allSelected = this.selectedItems.length === (this.response?.items?.length || 0)
    },
    isSelected(id) {
      return this.selectedItems.includes(id)
    },
    syncActionCellWidths() {
      this.$nextTick(() => {
        if (typeof this.$el?.querySelector !== 'function') return
        const bodyCell = this.$el.querySelector('.body .row .actions-cell')
        const headerCell = this.$el.querySelector('.header .actions-cell')
        const footerCell = this.$el.querySelector('.footer .actions-cell')

        if (bodyCell && headerCell && footerCell) {
          const width = bodyCell.offsetWidth + 'px'
          headerCell.style.width = width
          footerCell.style.width = width
        }
      })
    }
  }
}
</script>

<style scoped>
[disabled] {
  opacity: .5;
}
.container {
  max-width: 100%;
  overflow-x: hidden;
  padding: 20px 20px 50px;
}

.header-section {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

.add-button {
  position: relative;
  background-color: var(--color-primary);
  color: var(--color-bg);
  border: none;
  margin: 0;
  font: inherit;
  cursor: pointer;
  padding: 0 16px;
  height: 32px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  border-radius: 4px;
  white-space: nowrap;
}

.add-button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

.tabs-and-search {
  display: flex;
  gap: 15px;
  align-items: stretch;
  flex-wrap: wrap;
  margin-bottom: 15px;
}

.tabs {
  display: flex;
  gap: 5px;
  flex: 1;
  min-width: 200px;
  flex-wrap: wrap;
}

.tab-button.active, .tab-button.active:hover {
  background: var(--color-primary);
  color: var(--color-bg);
}

.tab-button {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color);
  padding: 0 12px;
  height: 32px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 4px;
  white-space: nowrap;
}

.tab-button:hover {
  background: var(--color-bg-navigation);
  border-color: var(--color-border-navigation);
  color: var(--color);
}

.search {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.search input {
  min-width: 150px;
  flex: 1;
}

.search-button {
  white-space: nowrap;
}

.filters-and-navigation {
  display: flex;
  gap: 15px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 20px;
}

.bottom-nav {
  margin-top: 15px;
}

.filters {
  display: flex;
  gap: 15px;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
}

.filters-section {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.navigation {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
}

.nav-text {
  font-size: 14px;
  white-space: nowrap;
}

.page-info {
  font-size: 14px;
  white-space: nowrap;
}

.table-wrapper {
  margin-top: 25px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow-x: auto;
  background: #f9f9f9;
  position: relative;
}

.table {
  width: 100%;
  min-width: 100%;
}

.header,
.row,
.footer {
  display: flex;
  align-items: stretch;
  min-width: 100%;
  border-bottom: 1px solid #eee;
}

.header>div,
.row>div,
.footer>div {
  padding: 0 12px;
  display: flex;
  align-items: center;
  border-right: 1px solid #eee;
  min-height: 44px;
  background: inherit;
}

.checkbox-cell {
  width: 50px;
  flex-shrink: 0;
  justify-content: center;
}

.actions-cell {
  flex-shrink: 0;
  flex-grow: 0;
  border-right: none !important;
  justify-content: left;
  gap: 5px;
  box-sizing: border-box;
}

.header {
  background: #f9f9f9;
  font-weight: 600;
  font-size: 13px;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 20;
}

.body {
  background: white;
}

.body .row {
  transition: background-color 0.15s;
}

.body .row:last-child {
  border-bottom: none;
}

.body .row:hover .field {
  background: #f2f7fc;
}

.body .row .sticky-left,
.body .row .sticky-right {
  background: #f8f9fa;
}

.footer {
  background: #f9f9f9;
  border-bottom: none;
  font-weight: 600;
  font-size: 13px;
}

.body .field {
  background: white;
}

.field {
  flex: 1;
  min-width: 180px;
}

.field input, .field select, .field textarea {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 6px 10px;
  font-size: 14px;
}

.field input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

/* Sticky columns on desktop */
@media (min-width: 769px) {
  .sticky-left {
    position: sticky;
    left: 0;
    z-index: 15;
    box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);
  }

  .header .sticky-left {
    z-index: 25;
  }

  .sticky-right {
    position: sticky;
    right: 0;
    z-index: 15;
    box-shadow: -2px 0 4px rgba(0, 0, 0, 0.05);
  }

  .header .sticky-right {
    z-index: 25;
  }
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .container {
    padding: 15px 10px 40px;
  }

  h1 {
    font-size: 20px;
  }

  .tabs-and-search {
    flex-direction: column;
    align-items: stretch;
  }

  .tabs {
    width: 100%;
  }

  .tab-button {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    padding: 0 8px;
    height: 30px;
  }

  .search {
    width: 100%;
  }

  .search input {
    width: 100%;
  }

  .search-button {
    font-size: 12px;
    padding: 0 10px;
    height: 30px;
  }

  .filters-and-navigation {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    margin-top: 15px;
  }

  .filters {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .filters-section {
    align-items: center;
    width: 100%;
  }

  .filters-section select {
    flex: 1;
  }

  .navigation {
    justify-content: center;
    font-size: 13px;
  }

  .header>div,
  .row>div,
  .footer>div {
    padding: 8px 6px;
    font-size: 12px;
  }

  .checkbox-cell {
    width: 40px;
  }

  .actions-cell button {
    font-size: 12px;
    padding: 0 8px;
    height: 28px;
  }

  .field {
    min-width: 120px;
  }

  .field input {
    font-size: 13px;
    padding: 5px 8px;
  }

  .nav-text,
  .page-info {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  h1 {
    font-size: 18px;
  }

  .tab-button {
    font-size: 11px;
    padding: 0 6px;
  }

  .header>div,
  .row>div,
  .footer>div {
    padding: 6px 4px;
    font-size: 11px;
  }

  .checkbox-cell {
    width: 35px;
  }

  .actions-cell {
    width: 70px;
  }

  .field {
    min-width: 100px;
  }

  button {
    font-size: 12px;
    height: 28px;
    padding: 0 8px;
  }
}

/* General button and input styling */
input,
textarea {
  padding: 5px 10px;
  box-sizing: border-box;
}

input,
button,
select {
  height: 30px;
}

textarea {
  height: 30px;
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
  -moz-appearance: none;
  cursor: pointer;
  padding: 0 10px;
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
</style>