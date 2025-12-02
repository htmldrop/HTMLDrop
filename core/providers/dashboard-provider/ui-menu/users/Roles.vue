<template>
  <div id="roles-manager" class="container">
    <div class="header-section">
      <h1>{{ translate('Roles & Capabilities') }}</h1>
      <button class="add-button" @click="addNewRole">{{ translate('Add role') }}</button>
    </div>

    <div class="table-wrapper">
      <div class="table">
        <div class="header">
          <div class="field-name">{{ translate('Name') }}</div>
          <div class="field-slug">{{ translate('Slug') }}</div>
          <div class="field-description">{{ translate('Description') }}</div>
          <div class="field-capabilities">{{ translate('Capabilities') }}</div>
          <div class="field-users">{{ translate('Users') }}</div>
          <div class="actions-cell">{{ translate('Actions') }}</div>
        </div>

        <div class="body">
          <div v-for="(role, index) in roles" :key="role.id || 'new-' + index" class="row">
            <div class="field-name">
              <input
                type="text"
                v-model="role.name"
                :placeholder="translate('Role name')"
              />
            </div>
            <div class="field-slug">
              <input
                type="text"
                v-model="role.slug"
                :readonly="!!role.id"
                :class="{ readonly: !!role.id }"
                :placeholder="translate('role-slug')"
              />
            </div>
            <div class="field-description">
              <input
                type="text"
                v-model="role.description"
                :placeholder="translate('Description')"
              />
            </div>
            <div class="field-capabilities">
              <button class="button button-secondary" @click="openCapabilities(role)">
                {{ translate('Edit') }} ({{ role.capabilities?.length || 0 }})
              </button>
            </div>
            <div class="field-users">
              <span class="user-count">{{ role.user_count || 0 }}</span>
            </div>
            <div class="actions-cell">
              <button
                class="button"
                :disabled="!hasChanges(role)"
                @click="save(role)"
              >
                {{ translate('Save') }}
              </button>
              <button
                class="button button-danger"
                @click="deleteRole(role)"
                :disabled="role.slug === 'administrator'"
              >
                {{ translate('Delete') }}
              </button>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="field-name">{{ translate('Name') }}</div>
          <div class="field-slug">{{ translate('Slug') }}</div>
          <div class="field-description">{{ translate('Description') }}</div>
          <div class="field-capabilities">{{ translate('Capabilities') }}</div>
          <div class="field-users">{{ translate('Users') }}</div>
          <div class="actions-cell">{{ translate('Actions') }}</div>
        </div>
      </div>
    </div>

    <!-- Capabilities Modal -->
    <div v-if="showCapabilitiesModal" class="modal-overlay" @click.self="closeCapabilities">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ translate('Capabilities for') }}: {{ editingRole?.name }}</h2>
          <button class="close-button" @click="closeCapabilities">&times;</button>
        </div>
        <div class="modal-body">
          <div class="capabilities-grid">
            <label v-for="cap in allCapabilities" :key="cap.id" class="capability-item">
              <input
                type="checkbox"
                :checked="editingRole?.capabilities?.some(c => c.id === cap.id)"
                @change="toggleCapability(cap, $event.target.checked)"
              />
              <span class="cap-name">{{ cap.name }}</span>
              <span class="cap-slug">({{ cap.slug }})</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="button" @click="saveCapabilities">{{ translate('Save capabilities') }}</button>
          <button class="button button-secondary" @click="closeCapabilities">{{ translate('Cancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch'],
  data: () => ({
    roles: [],
    rolesOriginal: [],
    allCapabilities: [],
    showCapabilitiesModal: false,
    editingRole: null,
    editingCapabilities: []
  }),
  created() {
    this.init()
  },
  methods: {
    async init() {
      this.roles = []
      this.rolesOriginal = []
      await Promise.all([this.getRoles(), this.getCapabilities()])
    },
    async getRoles() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/roles`)
      const roles = await result.json()
      this.roles = roles
      this.rolesOriginal = JSON.parse(JSON.stringify(roles))
    },
    async getCapabilities() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/capabilities`)
      this.allCapabilities = await result.json()
    },
    hasChanges(role) {
      if (!role.id) return true
      const original = this.rolesOriginal.find(r => r.id === role.id)
      if (!original) return true
      return JSON.stringify({ name: role.name, description: role.description }) !==
             JSON.stringify({ name: original.name, description: original.description })
    },
    async save(role) {
      if (!role.id) {
        // Create new role
        const payload = {
          name: role.name,
          slug: role.slug,
          description: role.description || ''
        }

        await this.apiFetch(`${this.apiBase}/api/v1/roles`, {
          method: 'POST',
          body: JSON.stringify(payload)
        })

        await this.getRoles()
      } else {
        // Update existing role
        const payload = {
          name: role.name,
          description: role.description
        }

        await this.apiFetch(`${this.apiBase}/api/v1/roles/${role.slug}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        })

        await this.getRoles()
      }
    },
    async deleteRole(role) {
      if (!role.id) {
        const index = this.roles.findIndex(r => r === role)
        if (index > -1) {
          this.roles.splice(index, 1)
        }
        return
      }

      if (role.slug === 'administrator') {
        alert(this.translate('Cannot delete the administrator role'))
        return
      }

      if (!confirm(this.translate('Are you sure you want to delete this role?'))) return

      await this.apiFetch(`${this.apiBase}/api/v1/roles/${role.slug}`, {
        method: 'DELETE'
      })

      await this.getRoles()
    },
    addNewRole() {
      this.roles.push({
        name: '',
        slug: '',
        description: '',
        capabilities: [],
        user_count: 0
      })
    },
    openCapabilities(role) {
      this.editingRole = role
      this.editingCapabilities = [...(role.capabilities || [])]
      this.showCapabilitiesModal = true
    },
    closeCapabilities() {
      this.showCapabilitiesModal = false
      this.editingRole = null
      this.editingCapabilities = []
    },
    toggleCapability(cap, checked) {
      if (checked) {
        if (!this.editingCapabilities.some(c => c.id === cap.id)) {
          this.editingCapabilities.push(cap)
        }
      } else {
        this.editingCapabilities = this.editingCapabilities.filter(c => c.id !== cap.id)
      }
    },
    async saveCapabilities() {
      if (!this.editingRole?.id) {
        // For new roles, just update the local state
        this.editingRole.capabilities = [...this.editingCapabilities]
        this.closeCapabilities()
        return
      }

      const capabilityIds = this.editingCapabilities.map(c => c.id)

      await this.apiFetch(`${this.apiBase}/api/v1/roles/${this.editingRole.slug}/capabilities`, {
        method: 'PUT',
        body: JSON.stringify({ capability_ids: capabilityIds })
      })

      await this.getRoles()
      this.closeCapabilities()
    }
  }
}
</script>

<style>
#roles-manager [disabled] {
  opacity: .5;
}

#roles-manager.container {
  max-width: 100%;
  overflow-x: hidden;
  padding: 20px 20px 50px;
}

#roles-manager .header-section {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

#roles-manager h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

#roles-manager .add-button {
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

#roles-manager .add-button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

#roles-manager .table-wrapper {
  margin-top: 25px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow-x: auto;
  background: #f9f9f9;
  position: relative;
}

#roles-manager .table {
  width: 100%;
  min-width: 100%;
}

#roles-manager .header,
#roles-manager .row,
#roles-manager .footer {
  display: flex;
  align-items: stretch;
  min-width: 100%;
  border-bottom: 1px solid #eee;
}

#roles-manager .header>div,
#roles-manager .row>div,
#roles-manager .footer>div {
  padding: 6px 12px;
  display: flex;
  align-items: center;
  border-right: 1px solid #eee;
  background: inherit;
  box-sizing: border-box;
}

#roles-manager .header {
  background: #f9f9f9;
  font-weight: 600;
  font-size: 13px;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 50px;
}

#roles-manager .header>div {
  padding: 12px;
}

#roles-manager .body {
  background: white;
}

#roles-manager .body .row {
  transition: background-color 0.15s;
  min-height: 56px;
}

#roles-manager .body .row:last-child {
  border-bottom: none;
}

#roles-manager .body .row:hover>div {
  background: #f2f7fc;
}

#roles-manager .footer {
  background: #f9f9f9;
  border-bottom: none;
  font-weight: 600;
  font-size: 13px;
}

#roles-manager .body .row>div {
  background: white;
}

#roles-manager .field-name {
  flex: 1 1 150px;
  min-width: 150px;
}

#roles-manager .field-slug {
  flex: 1 1 150px;
  min-width: 150px;
}

#roles-manager .field-description {
  flex: 2 2 200px;
  min-width: 200px;
}

#roles-manager .field-capabilities {
  flex: 0 0 150px;
  min-width: 150px;
  max-width: 150px;
  justify-content: center;
}

#roles-manager .field-users {
  flex: 0 0 80px;
  min-width: 80px;
  max-width: 80px;
  justify-content: center;
}

#roles-manager .user-count {
  background: #e3f2fd;
  color: #1976d2;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 13px;
}

#roles-manager .actions-cell {
  flex: 0 0 180px;
  min-width: 180px;
  max-width: 180px;
  border-right: none !important;
  justify-content: flex-start;
  gap: 5px;
  box-sizing: border-box;
}

#roles-manager input[type="text"] {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 6px 10px;
  font-size: 14px;
  box-sizing: border-box;
  height: 32px;
  font-family: inherit;
}

#roles-manager input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

#roles-manager input.readonly {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.7;
}

#roles-manager button, #roles-manager .button {
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

#roles-manager button:hover, #roles-manager .button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

#roles-manager button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#roles-manager .button-secondary {
  background-color: #6c757d;
}

#roles-manager .button-secondary:hover {
  background-color: #5a6268;
}

#roles-manager .button-danger {
  background-color: #dc3545;
}

#roles-manager .button-danger:hover {
  background-color: #c82333;
}

/* Modal styles */
#roles-manager .modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

#roles-manager .modal {
  background: white;
  border-radius: 8px;
  max-width: 700px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

#roles-manager .modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

#roles-manager .modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

#roles-manager .close-button {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
}

#roles-manager .close-button:hover {
  color: #333;
  background: #f0f0f0;
}

#roles-manager .modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

#roles-manager .capabilities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
}

#roles-manager .capability-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

#roles-manager .capability-item:hover {
  background: #e9ecef;
}

#roles-manager .capability-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

#roles-manager .cap-name {
  font-weight: 500;
}

#roles-manager .cap-slug {
  color: #666;
  font-size: 12px;
}

#roles-manager .modal-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
  justify-content: flex-end;
}
</style>
