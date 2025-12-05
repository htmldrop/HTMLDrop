<template>
  <div id="oauth-manager" class="container">
    <div class="header-section">
      <h1>{{ translate('OAuth Providers') }}</h1>
      <button class="add-button" @click="addNewProvider">{{ translate('Add provider') }}</button>
    </div>

    <p class="description">
      {{ translate('Configure OAuth providers to allow users to sign in with external accounts. Environment variables must be set for client secrets.') }}
    </p>

    <div class="table-wrapper">
      <div class="table">
        <div class="header">
          <div class="field-name">{{ translate('Name') }}</div>
          <div class="field-slug">{{ translate('Slug') }}</div>
          <div class="field-text">{{ translate('Client ID (env var)') }}</div>
          <div class="field-text">{{ translate('Secret (env var)') }}</div>
          <div class="field-text">{{ translate('Scopes') }}</div>
          <div class="field-checkbox">{{ translate('Active') }}</div>
          <div class="actions-cell">{{ translate('Actions') }}</div>
        </div>

        <div class="body">
          <div v-for="(item, index) in providers" :key="item.id || 'new-' + index" class="row">
            <div class="field-name">
              <input
                type="text"
                v-model="item.name"
                :placeholder="translate('Provider name')"
              />
            </div>
            <div class="field-slug">
              <input
                type="text"
                v-model="item.slug"
                :readonly="!!item.id"
                :class="{ readonly: !!item.id }"
                :placeholder="translate('provider-slug')"
              />
            </div>
            <div class="field-text">
              <input
                type="text"
                v-model="item.client_id"
                :placeholder="translate('PROVIDER_CLIENT_ID')"
              />
            </div>
            <div class="field-text">
              <input
                type="text"
                v-model="item.secret_env_key"
                :placeholder="translate('PROVIDER_CLIENT_SECRET')"
              />
            </div>
            <div class="field-text">
              <input
                type="text"
                :value="Array.isArray(item.scope) ? item.scope.join(', ') : item.scope"
                @input="updateScope(item, $event.target.value)"
                :placeholder="translate('openid, profile, email')"
              />
            </div>
            <div class="field-checkbox">
              <input
                type="checkbox"
                v-model="item.active"
              />
            </div>
            <div class="actions-cell">
              <button
                class="button button-secondary"
                @click="editProvider(item)"
                :title="translate('Edit details')"
              >
                {{ translate('Edit') }}
              </button>
              <button
                class="button"
                :disabled="!hasChanges(item)"
                @click="save(item)"
              >
                {{ translate('Save') }}
              </button>
              <button
                class="button button-danger"
                @click="deleteProvider(item)"
              >
                {{ translate('Delete') }}
              </button>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="field-name">{{ translate('Name') }}</div>
          <div class="field-slug">{{ translate('Slug') }}</div>
          <div class="field-text">{{ translate('Client ID (env var)') }}</div>
          <div class="field-text">{{ translate('Secret (env var)') }}</div>
          <div class="field-text">{{ translate('Scopes') }}</div>
          <div class="field-checkbox">{{ translate('Active') }}</div>
          <div class="actions-cell">{{ translate('Actions') }}</div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editingProvider" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingProvider.id ? translate('Edit Provider') : translate('New Provider') }}: {{ editingProvider.name || translate('Untitled') }}</h2>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>{{ translate('Name') }}</label>
            <input type="text" v-model="editingProvider.name" :placeholder="translate('Google, GitHub, etc.')" />
          </div>
          <div class="form-group">
            <label>{{ translate('Slug') }}</label>
            <input type="text" v-model="editingProvider.slug" :readonly="!!editingProvider.id" :class="{ readonly: !!editingProvider.id }" :placeholder="translate('google, github, etc.')" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>{{ translate('Client ID (env var name)') }}</label>
              <input type="text" v-model="editingProvider.client_id" :placeholder="translate('GOOGLE_CLIENT_ID')" />
            </div>
            <div class="form-group">
              <label>{{ translate('Client Secret (env var name)') }}</label>
              <input type="text" v-model="editingProvider.secret_env_key" :placeholder="translate('GOOGLE_CLIENT_SECRET')" />
            </div>
          </div>
          <div class="form-group">
            <label>{{ translate('Scopes (comma-separated)') }}</label>
            <input
              type="text"
              :value="Array.isArray(editingProvider.scope) ? editingProvider.scope.join(', ') : editingProvider.scope"
              @input="updateScope(editingProvider, $event.target.value)"
              :placeholder="translate('openid, profile, email')"
            />
          </div>
          <div class="form-group">
            <label>{{ translate('Authorization URL') }}</label>
            <input type="text" v-model="editingProvider.auth_url" :placeholder="translate('https://provider.com/oauth/authorize')" />
          </div>
          <div class="form-group">
            <label>{{ translate('Token URL') }}</label>
            <input type="text" v-model="editingProvider.token_url" :placeholder="translate('https://provider.com/oauth/token')" />
          </div>
          <div class="form-group">
            <label>{{ translate('User Info URL') }}</label>
            <input type="text" v-model="editingProvider.user_info_url" :placeholder="translate('https://provider.com/userinfo')" />
          </div>
          <div class="form-group">
            <label>{{ translate('Redirect URI') }}</label>
            <input type="text" v-model="editingProvider.redirect_uri" :placeholder="redirectUriPlaceholder" />
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="editingProvider.active" />
              {{ translate('Active') }}
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="button button-secondary" @click="closeModal">{{ translate('Cancel') }}</button>
          <button class="button" @click="saveFromModal">{{ translate('Save') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch'],
  data: () => ({
    providers: [],
    providersOriginal: [],
    editingProvider: null
  }),
  computed: {
    redirectUriPlaceholder() {
      return `${this.apiBase}/api/v1/oauth/{slug}/callback`
    }
  },
  created() {
    this.init()
  },
  methods: {
    async init() {
      this.providers = []
      this.providersOriginal = []
      await this.getProviders()
    },
    async getProviders() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/auth-providers`)
      const providers = await result.json()
      this.providers = providers
      this.providersOriginal = JSON.parse(JSON.stringify(providers))
    },
    updateScope(item, value) {
      item.scope = value.split(',').map(s => s.trim()).filter(Boolean)
    },
    hasChanges(item) {
      const original = this.providersOriginal.find(p => p.id === item.id || p.slug === item.slug)
      if (!original) return true
      return JSON.stringify(item) !== JSON.stringify(original)
    },
    async save(item) {
      if (!item.id) {
        // Create new provider
        const payload = {
          name: item.name,
          slug: item.slug,
          client_id: item.client_id,
          secret_env_key: item.secret_env_key,
          scope: item.scope || [],
          auth_url: item.auth_url || '',
          token_url: item.token_url || '',
          user_info_url: item.user_info_url || '',
          redirect_uri: item.redirect_uri || `${this.apiBase}/api/v1/oauth/${item.slug}/callback`,
          active: item.active || false,
          response_params: item.response_params || {}
        }

        await this.apiFetch(`${this.apiBase}/api/v1/auth-providers`, {
          method: 'POST',
          body: JSON.stringify(payload)
        })

        await this.getProviders()
      } else {
        // Update existing provider
        const payload = {
          name: item.name,
          client_id: item.client_id,
          secret_env_key: item.secret_env_key,
          scope: item.scope,
          auth_url: item.auth_url,
          token_url: item.token_url,
          user_info_url: item.user_info_url,
          redirect_uri: item.redirect_uri,
          active: item.active,
          response_params: item.response_params
        }

        await this.apiFetch(`${this.apiBase}/api/v1/auth-providers/${item.slug}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        })

        await this.getProviders()
      }
    },
    async deleteProvider(item) {
      if (!item.id) {
        const index = this.providers.findIndex(p => p === item)
        if (index > -1) {
          this.providers.splice(index, 1)
        }
        return
      }

      if (!confirm(this.translate('Are you sure you want to delete this OAuth provider?'))) return

      await this.apiFetch(`${this.apiBase}/api/v1/auth-providers/${item.slug}`, {
        method: 'DELETE'
      })

      const index = this.providers.findIndex(p => p.id === item.id)
      if (index > -1) {
        this.providers.splice(index, 1)
      }
      const originalIndex = this.providersOriginal.findIndex(p => p.id === item.id)
      if (originalIndex > -1) {
        this.providersOriginal.splice(originalIndex, 1)
      }
    },
    addNewProvider() {
      const newProvider = {
        name: '',
        slug: '',
        client_id: '',
        secret_env_key: '',
        scope: [],
        auth_url: '',
        token_url: '',
        user_info_url: '',
        redirect_uri: '',
        active: false,
        response_params: {}
      }
      this.providers.push(newProvider)
      this.editingProvider = newProvider
    },
    editProvider(item) {
      this.editingProvider = item
    },
    closeModal() {
      this.editingProvider = null
    },
    async saveFromModal() {
      if (this.editingProvider) {
        await this.save(this.editingProvider)
        this.closeModal()
      }
    }
  }
}
</script>

<style>
#oauth-manager [disabled] {
  opacity: .5;
}

#oauth-manager.container {
  max-width: 100%;
  overflow-x: hidden;
  padding: 20px 20px 50px;
}

#oauth-manager .header-section {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

#oauth-manager h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

#oauth-manager .description {
  color: #666;
  margin-bottom: 20px;
}

#oauth-manager .add-button {
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

#oauth-manager .add-button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

#oauth-manager .table-wrapper {
  margin-top: 25px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow-x: auto;
  background: #f9f9f9;
  position: relative;
}

#oauth-manager .table {
  width: 100%;
  min-width: 100%;
}

#oauth-manager .header,
#oauth-manager .row,
#oauth-manager .footer {
  display: flex;
  align-items: stretch;
  min-width: 100%;
  border-bottom: 1px solid #eee;
}

#oauth-manager .header>div,
#oauth-manager .row>div,
#oauth-manager .footer>div {
  padding: 6px 12px;
  display: flex;
  align-items: center;
  border-right: 1px solid #eee;
  background: inherit;
  box-sizing: border-box;
}

#oauth-manager .header {
  background: #f9f9f9;
  font-weight: 600;
  font-size: 13px;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 50px;
}

#oauth-manager .header>div {
  padding: 12px;
}

#oauth-manager .body {
  background: white;
}

#oauth-manager .body .row {
  transition: background-color 0.15s;
  min-height: 56px;
}

#oauth-manager .body .row:last-child {
  border-bottom: none;
}

#oauth-manager .body .row:hover>div {
  background: #f2f7fc;
}

#oauth-manager .footer {
  background: #f9f9f9;
  border-bottom: none;
  font-weight: 600;
  font-size: 13px;
}

#oauth-manager .body .row>div {
  background: white;
}

#oauth-manager .field-name {
  flex: 1 1 150px;
  min-width: 150px;
}

#oauth-manager .field-slug {
  flex: 1 1 120px;
  min-width: 120px;
}

#oauth-manager .field-text {
  flex: 1 1 180px;
  min-width: 180px;
}

#oauth-manager .field-checkbox {
  flex: 0 0 80px;
  min-width: 80px;
  max-width: 80px;
  justify-content: center;
}

#oauth-manager .actions-cell {
  flex: 0 0 240px;
  min-width: 240px;
  max-width: 240px;
  border-right: none !important;
  justify-content: flex-start;
  gap: 5px;
  box-sizing: border-box;
}

#oauth-manager input[type="text"] {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 6px 10px;
  font-size: 14px;
  box-sizing: border-box;
  height: 32px;
  font-family: inherit;
}

#oauth-manager input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

#oauth-manager input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

#oauth-manager input.readonly,
#oauth-manager input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.7;
}

#oauth-manager button, #oauth-manager .button {
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

#oauth-manager button:hover, #oauth-manager .button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

#oauth-manager button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#oauth-manager .button-secondary {
  background-color: #6c757d;
}

#oauth-manager .button-secondary:hover {
  background-color: #5a6268;
}

#oauth-manager .button-danger {
  background-color: #dc3545;
}

#oauth-manager .button-danger:hover {
  background-color: #c82333;
}

/* Modal styles */
#oauth-manager .modal-overlay {
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

#oauth-manager .modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

#oauth-manager .modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

#oauth-manager .modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

#oauth-manager .modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

#oauth-manager .modal-close:hover {
  color: #333;
  background: #f0f0f0;
}

#oauth-manager .modal-body {
  padding: 20px;
}

#oauth-manager .modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
}

#oauth-manager .form-group {
  margin-bottom: 16px;
}

#oauth-manager .form-group label {
  display: block;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
  color: #333;
}

#oauth-manager .form-group input[type="text"] {
  width: 100%;
}

#oauth-manager .form-row {
  display: flex;
  gap: 16px;
}

#oauth-manager .form-row .form-group {
  flex: 1;
}

#oauth-manager .checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

#oauth-manager .checkbox-label input {
  margin: 0;
}
</style>
