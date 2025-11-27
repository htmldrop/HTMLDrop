<template>
  <div class="container">
    <div class="header-section">
      <h1>{{ translate('Fields') }} - {{ postType?.name_plural }}</h1>
      <button class="add-button" @click="addNewField">{{ translate('Add field') }}</button>
    </div>

    <div class="table-wrapper">
      <div class="table">
        <div class="header">
          <div class="field-name">{{ translate('Name') }}</div>
          <div class="field-slug">{{ translate('Slug') }}</div>
          <div class="field-type">{{ translate('Type') }}</div>
          <div class="field-checkbox">{{ translate('Required') }}</div>
          <div class="field-checkbox">{{ translate('Revisions') }}</div>
          <div class="field-number">{{ translate('Priority') }}</div>
          <div class="field-number">{{ translate('Order') }}</div>
          <div class="field-source">{{ translate('Source') }}</div>
          <div class="actions-cell">{{ translate('Actions') }}</div>
        </div>

        <div class="body">
          <div v-for="(item, index) in fields" :key="item.field?.id || 'new-' + index" class="row">
            <div class="field-name">
              <input
                type="text"
                v-model="item.field.name"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-slug">
              <input
                type="text"
                v-model="item.field.slug"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-type">
              <select
                v-if="item.source === 'db'"
                v-model="item.field.type"
              >
                <option value="text">text</option>
                <option value="textarea">textarea</option>
                <option value="editor">editor</option>
                <option value="number">number</option>
                <option value="select">select</option>
                <option value="boolean">boolean</option>
                <option value="media">media</option>
                <option value="multimedia">multimedia</option>
                <option value="file">file</option>
                <option value="users">users</option>
              </select>
              <input
                v-else
                type="text"
                v-model="item.field.type"
                readonly
                class="readonly"
              />
            </div>
            <div class="field-checkbox">
              <input
                type="checkbox"
                v-model="item.field.required"
                :disabled="item.source !== 'db'"
              />
            </div>
            <div class="field-checkbox">
              <input
                type="checkbox"
                v-model="item.field.revisions"
                :disabled="item.source !== 'db'"
              />
            </div>
            <div class="field-number">
              <input
                type="number"
                v-model.number="item.field.priority"
                :readonly="item.source !== 'db'"
                :class="{ readonly: item.source !== 'db' }"
              />
            </div>
            <div class="field-number">
              <input
                type="number"
                v-model.number="item.field.order"
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
                @click="deleteField(item)"
              >
                {{ translate('Trash') }}
              </button>
              <span v-else class="readonly-label">{{ translate('Read only') }}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="field-name">{{ translate('Name') }}</div>
          <div class="field-slug">{{ translate('Slug') }}</div>
          <div class="field-type">{{ translate('Type') }}</div>
          <div class="field-checkbox">{{ translate('Required') }}</div>
          <div class="field-checkbox">{{ translate('Revisions') }}</div>
          <div class="field-number">{{ translate('Priority') }}</div>
          <div class="field-number">{{ translate('Order') }}</div>
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
  props: ['slug'],
  data: () => ({
    postType: null,
    fields: [],
    fieldsOriginal: []
  }),
  created() {
    this.init()
  },
  watch: {
    slug() {
      this.init()
    }
  },
  methods: {
    async init() {
      this.postType = null
      this.fields = []
      this.fieldsOriginal = []
      await Promise.all([this.getPostType(), this.getFields()])
    },
    async getPostType() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/post-types/${this.slug}`)
      this.postType = await result.json()
    },
    async getFields() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/fields`)
      const fields = await result.json()
      this.fields = fields.map(f => ({ ...f }))
      this.fieldsOriginal = JSON.parse(JSON.stringify(fields))
    },
    hasChanges(item) {
      const original = this.fieldsOriginal.find(f => f.field?.id === item.field?.id)
      if (!original) return true
      return JSON.stringify(item.field) !== JSON.stringify(original.field)
    },
    async save(item) {
      if (!item.field?.id) {
        // Create new field
        const payload = {
          name: item.field.name,
          slug: item.field.slug,
          type: item.field.type || 'text',
          required: item.field.required || false,
          revisions: item.field.revisions || false,
          priority: item.field.priority || 5,
          order: item.field.order || 1000
        }

        await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/fields`, {
          method: 'POST',
          body: JSON.stringify(payload)
        })

        // Refresh the entire fields list to get proper structure with source
        await this.getFields()
      } else {
        // Update existing field
        const payload = {
          name: item.field.name,
          slug: item.field.slug,
          type: item.field.type,
          required: item.field.required,
          revisions: item.field.revisions,
          priority: item.field.priority,
          order: item.field.order
        }

        await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/fields/${item.field.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        })

        // Refresh the entire fields list to get proper order
        await this.getFields()
      }
    },
    async deleteField(item) {
      if (!item.field?.id) {
        // Remove from local array only
        const index = this.fields.findIndex(f => f === item)
        if (index > -1) {
          this.fields.splice(index, 1)
        }
        return
      }

      if (!confirm(this.translate('Are you sure you want to delete this field?'))) return

      await this.apiFetch(`${this.apiBase}/api/v1/${this.slug}/fields/${item.field.id}`, {
        method: 'DELETE'
      })

      // Remove from both arrays
      const index = this.fields.findIndex(f => f.field?.id === item.field?.id)
      if (index > -1) {
        this.fields.splice(index, 1)
      }
      const originalIndex = this.fieldsOriginal.findIndex(f => f.field?.id === item.field?.id)
      if (originalIndex > -1) {
        this.fieldsOriginal.splice(originalIndex, 1)
      }
    },
    addNewField() {
      this.fields.push({
        field: {
          name: '',
          slug: '',
          type: 'text',
          required: false,
          revisions: false,
          priority: 5,
          order: 1000
        },
        priority: 5,
        source: 'db'
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
  padding: 6px 12px;
  display: flex;
  align-items: center;
  border-right: 1px solid #eee;
  background: inherit;
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
  min-height: 50px;
}

.header>div {
  padding: 12px;
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

.body .row:hover>div {
  background: #f2f7fc;
}

.footer {
  background: #f9f9f9;
  border-bottom: none;
  font-weight: 600;
  font-size: 13px;
}

.body .row {
  min-height: 56px;
}

.body .row>div {
  background: white;
}

.field-name {
  flex: 2 2 200px;
  min-width: 200px;
}

.field-slug {
  flex: 2 2 200px;
  min-width: 200px;
}

.field-type {
  flex: 1 1 120px;
  min-width: 120px;
}

.field-checkbox {
  flex: 0 0 80px;
  min-width: 80px;
  max-width: 80px;
  justify-content: center;
}

.field-number {
  flex: 0 0 100px;
  min-width: 100px;
  max-width: 100px;
}

.field-source {
  flex: 0 0 120px;
  min-width: 120px;
  max-width: 120px;
}

.actions-cell {
  flex: 0 0 200px;
  min-width: 200px;
  max-width: 200px;
  border-right: none !important;
  justify-content: flex-start;
  gap: 5px;
  box-sizing: border-box;
}

input[type="text"],
input[type="number"],
select {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 6px 10px;
  font-size: 14px;
  box-sizing: border-box;
  height: 32px;
  font-family: inherit;
}

select {
  cursor: pointer;
  background-color: white;
}

input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

input:focus,
select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

input.readonly,
input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.7;
}

.badge {
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 600;
  display: inline-block;
  white-space: nowrap;
}

.badge-db {
  background-color: #e3f2fd;
  color: #1976d2;
}

.badge-runtime {
  background-color: #fff3e0;
  color: #f57c00;
}

.readonly-label {
  font-size: 13px;
  color: #999;
  font-style: italic;
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
  white-space: nowrap;
}

button:hover, .button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-danger {
  background-color: #dc3545;
}

.button-danger:hover {
  background-color: #c82333;
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .container {
    padding: 15px 10px 40px;
  }

  h1 {
    font-size: 20px;
  }

  .header>div,
  .row>div,
  .footer>div {
    padding: 8px 6px;
    font-size: 12px;
  }

  .field-name,
  .field-slug {
    min-width: 120px;
  }

  .field-type {
    min-width: 80px;
  }

  .field-checkbox {
    min-width: 60px;
  }

  .field-number {
    min-width: 80px;
  }

  .field-source {
    min-width: 100px;
  }

  .actions-cell {
    min-width: 150px;
  }

  button {
    font-size: 12px;
    padding: 0 8px;
    height: 28px;
  }
}

@media (max-width: 480px) {
  h1 {
    font-size: 18px;
  }

  .header>div,
  .row>div,
  .footer>div {
    padding: 6px 4px;
    font-size: 11px;
  }

  button {
    font-size: 11px;
    height: 26px;
    padding: 0 6px;
  }
}
</style>
