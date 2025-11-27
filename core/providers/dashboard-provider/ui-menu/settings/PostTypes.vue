<template>
  <div id="post-types-manager" class="container">
    <div class="header-section">
      <h1>{{ translate('Post Types') }}</h1>
      <button class="add-button" @click="addNewPostType">{{ translate('Add post type') }}</button>
    </div>

    <div class="table-wrapper">
      <div class="table">
        <div class="header">
          <div class="field-name">{{ translate('Name (singular)') }}</div>
          <div class="field-name">{{ translate('Name (plural)') }}</div>
          <div class="field-slug">{{ translate('Slug') }}</div>
          <div class="field-text">{{ translate('Description') }}</div>
          <div class="field-text">{{ translate('Icon') }}</div>
          <div class="field-text">{{ translate('Capabilities') }}</div>
          <div class="field-number">{{ translate('Badge') }}</div>
          <div class="field-checkbox">{{ translate('Show in menu') }}</div>
          <div class="field-number">{{ translate('Position') }}</div>
          <div class="field-number">{{ translate('Priority') }}</div>
          <div class="field-source">{{ translate('Source') }}</div>
          <div class="actions-cell">{{ translate('Actions') }}</div>
        </div>

        <div class="body">
          <div v-for="(item, index) in postTypes" :key="item.id || 'new-' + index" class="row">
            <div class="field-name">
              <input
                type="text"
                v-model="item.name_singular"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-name">
              <input
                type="text"
                v-model="item.name_plural"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-slug">
              <input
                type="text"
                v-model="item.slug"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-text">
              <input
                type="text"
                v-model="item.description"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-text">
              <input
                type="text"
                v-model="item.icon"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-text">
              <input
                type="text"
                :value="item.capabilities ? JSON.stringify(item.capabilities) : '{}'"
                @input="updateCapabilities(item, $event.target.value)"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
                placeholder="{}"
              />
            </div>
            <div class="field-number">
              <input
                type="number"
                v-model.number="item.badge"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-checkbox">
              <input
                type="checkbox"
                v-model="item.show_in_menu"
                :disabled="item.source !== 'db'"
              />
            </div>
            <div class="field-number">
              <input
                type="number"
                v-model.number="item.position"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-number">
              <input
                type="number"
                v-model.number="item.priority"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-source">
              <span class="badge" :class="'badge-' + item.source">
                {{ item.source === 'db' ? translate('Database') : translate('Runtime') }}
              </span>
            </div>
            <div class="actions-cell">
              <button
                v-if="item.source === 'db'"
                class="button"
                :disabled="!hasChanges(item)"
                @click="save(item)"
              >
                {{ translate('Save') }}
              </button>
              <button
                v-if="item.source === 'db'"
                class="button button-danger"
                @click="deletePostType(item)"
              >
                {{ translate('Delete') }}
              </button>
              <span v-else class="readonly-label">{{ translate('Read only') }}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="field-name">{{ translate('Name (singular)') }}</div>
          <div class="field-name">{{ translate('Name (plural)') }}</div>
          <div class="field-slug">{{ translate('Slug') }}</div>
          <div class="field-text">{{ translate('Description') }}</div>
          <div class="field-text">{{ translate('Icon') }}</div>
          <div class="field-text">{{ translate('Capabilities') }}</div>
          <div class="field-number">{{ translate('Badge') }}</div>
          <div class="field-checkbox">{{ translate('Show in menu') }}</div>
          <div class="field-number">{{ translate('Position') }}</div>
          <div class="field-number">{{ translate('Priority') }}</div>
          <div class="field-source">{{ translate('Source') }}</div>
          <div class="actions-cell">{{ translate('Actions') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch'],
  data: () => ({
    postTypes: [],
    postTypesOriginal: []
  }),
  created() {
    this.init()
  },
  methods: {
    async init() {
      this.postTypes = []
      this.postTypesOriginal = []
      await this.getPostTypes()
    },
    async getPostTypes() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/post-types`)
      const postTypes = await result.json()

      // Transform to include source
      this.postTypes = postTypes.map(pt => ({
        ...pt,
        source: pt.id ? 'db' : 'runtime'
      }))
      this.postTypesOriginal = JSON.parse(JSON.stringify(this.postTypes))
    },
    updateCapabilities(item, value) {
      try {
        item.capabilities = value ? JSON.parse(value) : {}
      } catch (e) {
        // Invalid JSON, keep current value
      }
    },
    hasChanges(item) {
      const original = this.postTypesOriginal.find(pt => pt.id === item.id || pt.slug === item.slug)
      if (!original) return true

      // Compare without source property
      const { source: _s1, ...itemData } = item
      const { source: _s2, ...originalData } = original

      return JSON.stringify(itemData) !== JSON.stringify(originalData)
    },
    async save(item) {
      if (!item.id) {
        // Create new post type
        const payload = {
          name_singular: item.name_singular,
          name_plural: item.name_plural,
          slug: item.slug,
          description: item.description || '',
          icon: item.icon || '',
          capabilities: item.capabilities || {},
          badge: item.badge || 0,
          show_in_menu: item.show_in_menu || false,
          position: item.position || 5000,
          priority: item.priority || 5
        }

        await this.apiFetch(`${this.apiBase}/api/v1/post-types`, {
          method: 'POST',
          body: JSON.stringify(payload)
        })

        // Refresh the entire list
        await this.getPostTypes()
      } else {
        // Update existing post type
        const payload = {
          name_singular: item.name_singular,
          name_plural: item.name_plural,
          slug: item.slug,
          description: item.description,
          icon: item.icon,
          capabilities: item.capabilities,
          badge: item.badge,
          show_in_menu: item.show_in_menu,
          position: item.position,
          priority: item.priority
        }

        await this.apiFetch(`${this.apiBase}/api/v1/post-types/${item.slug}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        })

        // Refresh the entire list
        await this.getPostTypes()
      }
    },
    async deletePostType(item) {
      if (!item.id) {
        // Remove from local array only
        const index = this.postTypes.findIndex(pt => pt === item)
        if (index > -1) {
          this.postTypes.splice(index, 1)
        }
        return
      }

      if (!confirm(this.translate('Are you sure you want to delete this post type?'))) return

      await this.apiFetch(`${this.apiBase}/api/v1/post-types/${item.slug}`, {
        method: 'DELETE'
      })

      // Remove from both arrays
      const index = this.postTypes.findIndex(pt => pt.id === item.id)
      if (index > -1) {
        this.postTypes.splice(index, 1)
      }
      const originalIndex = this.postTypesOriginal.findIndex(pt => pt.id === item.id)
      if (originalIndex > -1) {
        this.postTypesOriginal.splice(originalIndex, 1)
      }
    },
    addNewPostType() {
      this.postTypes.push({
        name_singular: '',
        name_plural: '',
        slug: '',
        description: '',
        icon: '',
        capabilities: {},
        badge: 0,
        show_in_menu: true,
        position: 5000,
        priority: 5,
        source: 'db'
      })
    }
  }
}
</script>

<style>
#post-types-manager [disabled] {
  opacity: .5;
}

#post-types-manager.container {
  max-width: 100%;
  overflow-x: hidden;
  padding: 20px 20px 50px;
}

#post-types-manager .header-section {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

#post-types-manager h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

#post-types-manager .add-button {
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

#post-types-manager .add-button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

#post-types-manager .table-wrapper {
  margin-top: 25px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow-x: auto;
  background: #f9f9f9;
  position: relative;
}

#post-types-manager .table {
  width: 100%;
  min-width: 100%;
}

#post-types-manager .header,
#post-types-manager .row,
#post-types-manager .footer {
  display: flex;
  align-items: stretch;
  min-width: 100%;
  border-bottom: 1px solid #eee;
}

#post-types-manager .header>div,
#post-types-manager .row>div,
#post-types-manager .footer>div {
  padding: 6px 12px;
  display: flex;
  align-items: center;
  border-right: 1px solid #eee;
  background: inherit;
  box-sizing: border-box;
}

#post-types-manager .header {
  background: #f9f9f9;
  font-weight: 600;
  font-size: 13px;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 50px;
}

#post-types-manager .header>div {
  padding: 12px;
}

#post-types-manager .body {
  background: white;
}

#post-types-manager .body .row {
  transition: background-color 0.15s;
  min-height: 56px;
}

#post-types-manager .body .row:last-child {
  border-bottom: none;
}

#post-types-manager .body .row:hover>div {
  background: #f2f7fc;
}

#post-types-manager .footer {
  background: #f9f9f9;
  border-bottom: none;
  font-weight: 600;
  font-size: 13px;
}

#post-types-manager .body .row>div {
  background: white;
}

#post-types-manager .field-name {
  flex: 2 2 200px;
  min-width: 200px;
}

#post-types-manager .field-slug {
  flex: 2 2 200px;
  min-width: 200px;
}

#post-types-manager .field-text {
  flex: 2 2 200px;
  min-width: 200px;
}

#post-types-manager .field-checkbox {
  flex: 0 0 100px;
  min-width: 100px;
  max-width: 100px;
  justify-content: center;
}

#post-types-manager .field-number {
  flex: 0 0 100px;
  min-width: 100px;
  max-width: 100px;
}

#post-types-manager .field-source {
  flex: 0 0 120px;
  min-width: 120px;
  max-width: 120px;
}

#post-types-manager .actions-cell {
  flex: 0 0 200px;
  min-width: 200px;
  max-width: 200px;
  border-right: none !important;
  justify-content: flex-start;
  gap: 5px;
  box-sizing: border-box;
}

#post-types-manager input[type="text"],
#post-types-manager input[type="number"] {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 6px 10px;
  font-size: 14px;
  box-sizing: border-box;
  height: 32px;
  font-family: inherit;
}

#post-types-manager input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

#post-types-manager input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

#post-types-manager input.readonly,
#post-types-manager input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.7;
}

#post-types-manager .badge {
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 600;
  display: inline-block;
  white-space: nowrap;
}

#post-types-manager .badge-db {
  background-color: #e3f2fd;
  color: #1976d2;
}

#post-types-manager .badge-runtime {
  background-color: #fff3e0;
  color: #f57c00;
}

#post-types-manager .readonly-label {
  font-size: 13px;
  color: #999;
  font-style: italic;
}

#post-types-manager button, #post-types-manager .button {
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
  white-space: nowrap;
}

#post-types-manager button:hover, #post-types-manager .button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

#post-types-manager button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#post-types-manager .button-danger {
  background-color: #dc3545;
}

#post-types-manager .button-danger:hover {
  background-color: #c82333;
}
</style>
