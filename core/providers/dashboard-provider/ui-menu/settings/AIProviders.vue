<template>
  <div id="ai-providers" class="container">
    <div class="header-section">
      <h1>{{ translate('AI Providers') }}</h1>
      <button class="add-button" @click="addNewProvider">{{ translate('Add Provider') }}</button>
    </div>

    <p class="description">
      {{ translate('Configure AI providers for the AI Command Center. API keys are encrypted and stored securely.') }}
    </p>

    <!-- Settings Section -->
    <div class="settings-section">
      <h2>{{ translate('Global Settings') }}</h2>
      <div class="settings-grid">
        <div class="setting-group">
          <label>{{ translate('Active Provider') }}</label>
          <select v-model="settings.active_provider_slug" @change="saveSettings">
            <option value="">{{ translate('None selected') }}</option>
            <option v-for="p in providers" :key="p.slug" :value="p.slug">{{ p.name }}</option>
          </select>
        </div>
        <div class="setting-group">
          <label>{{ translate('Active Model') }}</label>
          <select v-model="settings.active_model" @change="saveSettings" :disabled="!settings.active_provider_slug">
            <option value="">{{ translate('Default') }}</option>
            <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
          </select>
        </div>
        <div class="setting-group">
          <label>{{ translate('Max Commands Per Turn') }}</label>
          <input type="number" v-model.number="settings.max_commands_per_turn" @change="saveSettings" min="1" max="20" />
        </div>
        <div class="setting-group checkbox-group">
          <label>
            <input type="checkbox" v-model="settings.auto_approve_reads" @change="saveSettings" />
            {{ translate('Auto-approve read commands') }}
          </label>
        </div>
        <div class="setting-group checkbox-group">
          <label>
            <input type="checkbox" v-model="settings.auto_approve_writes" @change="saveSettings" />
            {{ translate('Auto-approve write commands (dangerous!)') }}
          </label>
        </div>
      </div>
      <div class="setting-group wide">
        <label>{{ translate('Custom System Prompt') }}</label>
        <textarea v-model="settings.system_prompt" @change="saveSettings" rows="3" :placeholder="translate('Additional instructions for the AI...')"></textarea>
      </div>
    </div>

    <!-- Providers Cards -->
    <div class="providers-section">
      <h2>{{ translate('Configured Providers') }}</h2>

      <div v-if="providers.length === 0" class="empty-state">
        {{ translate('No AI providers configured. Add one to get started.') }}
      </div>

      <div class="providers-grid">
        <div v-for="provider in providers" :key="provider.id" class="provider-card" :class="{ active: settings.active_provider_slug === provider.slug }">
          <div class="provider-header">
            <div class="provider-info">
              <span class="provider-icon" v-html="getProviderIcon(provider.slug)"></span>
              <div>
                <h3>{{ provider.name }}</h3>
                <span class="provider-slug">{{ provider.slug }}</span>
              </div>
            </div>
            <div class="provider-actions">
              <button class="icon-btn" @click="editProvider(provider)" :title="translate('Edit')">
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
              <button class="icon-btn danger" @click="deleteProvider(provider)" :title="translate('Delete')">
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
          </div>

          <div class="provider-details">
            <div class="detail-row">
              <span class="label">{{ translate('Model') }}:</span>
              <span class="value">{{ provider.default_model || translate('Default') }}</span>
            </div>
            <div class="detail-row">
              <span class="label">{{ translate('Status') }}:</span>
              <span class="status-badge" :class="{ active: provider.active }">
                {{ provider.active ? translate('Active') : translate('Inactive') }}
              </span>
            </div>
          </div>

          <!-- API Key Section -->
          <div class="api-key-section">
            <div class="api-key-header">
              <span class="label">{{ translate('API Key') }}</span>
              <span v-if="apiKeyStatus[provider.slug]?.hasKey" class="key-source" :class="apiKeyStatus[provider.slug]?.source">
                {{ apiKeyStatus[provider.slug]?.source === 'database' ? translate('Stored') : translate('From ENV') }}
              </span>
            </div>

            <div v-if="apiKeyStatus[provider.slug]?.hasKey" class="api-key-display">
              <code class="masked-key">{{ apiKeyStatus[provider.slug]?.maskedKey }}</code>
              <div class="key-actions">
                <button class="btn-sm" @click="openUpdateKeyModal(provider)">{{ translate('Update') }}</button>
                <button v-if="apiKeyStatus[provider.slug]?.source === 'database'" class="btn-sm danger" @click="removeApiKey(provider)">{{ translate('Remove') }}</button>
              </div>
            </div>
            <div v-else class="api-key-missing">
              <span class="warning-icon">⚠️</span>
              <span>{{ translate('No API key configured') }}</span>
              <button class="btn-sm primary" @click="openUpdateKeyModal(provider)">{{ translate('Add Key') }}</button>
            </div>
          </div>

          <!-- Connection Test -->
          <div class="connection-test">
            <button
              class="test-btn"
              @click="testConnection(provider)"
              :disabled="!apiKeyStatus[provider.slug]?.hasKey || testingProvider === provider.slug"
            >
              <span v-if="testingProvider === provider.slug" class="spinner"></span>
              <span v-else>{{ translate('Test Connection') }}</span>
            </button>
            <div v-if="testResults[provider.slug]" class="test-result" :class="{ success: testResults[provider.slug].success, error: !testResults[provider.slug].success }">
              <span class="result-icon">{{ testResults[provider.slug].success ? '✓' : '✗' }}</span>
              <span class="result-message">{{ testResults[provider.slug].message }}</span>
              <span v-if="testResults[provider.slug].latencyMs" class="result-latency">{{ testResults[provider.slug].latencyMs }}ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Preset Providers -->
    <div class="presets-section">
      <h2>{{ translate('Quick Setup') }}</h2>
      <p class="description">{{ translate('Click a provider to add it with preset configuration:') }}</p>
      <div class="preset-buttons">
        <button v-for="preset in presets" :key="preset.slug" class="preset-button" @click="addPreset(preset)" :disabled="hasProvider(preset.slug)">
          <span class="preset-icon" v-html="preset.icon"></span>
          <span>{{ preset.name }}</span>
        </button>
      </div>
    </div>

    <!-- Edit Provider Modal -->
    <div v-if="editingProvider" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingProvider.id ? translate('Edit Provider') : translate('New Provider') }}</h2>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>{{ translate('Name') }} *</label>
              <input type="text" v-model="editingProvider.name" :placeholder="translate('OpenAI, Anthropic, etc.')" />
            </div>
            <div class="form-group">
              <label>{{ translate('Slug') }} *</label>
              <input type="text" v-model="editingProvider.slug" :readonly="!!editingProvider.id" :class="{ readonly: !!editingProvider.id }" :placeholder="translate('openai, anthropic, etc.')" />
            </div>
          </div>
          <div class="form-group">
            <label>{{ translate('API Key Environment Variable') }}</label>
            <input type="text" v-model="editingProvider.api_key_env" :placeholder="translate('OPENAI_API_KEY')" />
            <small>{{ translate('Optional fallback: environment variable name if no key stored in database') }}</small>
          </div>
          <div class="form-group">
            <label>{{ translate('Base URL') }}</label>
            <input type="text" v-model="editingProvider.base_url" :placeholder="translate('https://api.openai.com/v1')" />
            <small>{{ translate('Leave empty to use default URL for known providers') }}</small>
          </div>
          <div class="form-group">
            <label>{{ translate('Default Model') }}</label>
            <input type="text" v-model="editingProvider.default_model" :placeholder="translate('gpt-5.1, gpt-4o, claude-sonnet-4-20250514, etc.')" />
          </div>
          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" v-model="editingProvider.active" />
              {{ translate('Provider is active') }}
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="button button-secondary" @click="closeModal">{{ translate('Cancel') }}</button>
          <button class="button" @click="saveProvider" :disabled="!canSaveProvider">{{ translate('Save') }}</button>
        </div>
      </div>
    </div>

    <!-- Update API Key Modal -->
    <div v-if="updatingKeyProvider" class="modal-overlay" @click.self="closeKeyModal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2>{{ apiKeyStatus[updatingKeyProvider.slug]?.hasKey ? translate('Update API Key') : translate('Add API Key') }}</h2>
          <button class="modal-close" @click="closeKeyModal">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-description">
            {{ translate('Enter the API key for') }} <strong>{{ updatingKeyProvider.name }}</strong>.
            {{ translate('The key will be encrypted before storage.') }}
          </p>
          <div class="form-group">
            <label>{{ translate('API Key') }} *</label>
            <div class="password-input">
              <input
                :type="showApiKey ? 'text' : 'password'"
                v-model="newApiKey"
                :placeholder="translate('sk-...')"
                autocomplete="off"
              />
              <button class="toggle-visibility" @click="showApiKey = !showApiKey" type="button">
                <svg v-if="showApiKey" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                <svg v-else viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="button button-secondary" @click="closeKeyModal">{{ translate('Cancel') }}</button>
          <button class="button" @click="saveApiKey" :disabled="!newApiKey || savingKey">
            {{ savingKey ? translate('Saving...') : translate('Save Key') }}
          </button>
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
    settings: {
      active_provider_slug: '',
      active_model: '',
      auto_approve_reads: true,
      auto_approve_writes: false,
      system_prompt: '',
      max_commands_per_turn: 5
    },
    availableModels: [],
    editingProvider: null,
    updatingKeyProvider: null,
    newApiKey: '',
    showApiKey: false,
    savingKey: false,
    apiKeyStatus: {},
    testResults: {},
    testingProvider: null,
    presets: [
      {
        name: 'OpenAI',
        slug: 'openai',
        api_key_env: 'OPENAI_API_KEY',
        default_model: 'gpt-51',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>'
      },
      {
        name: 'Anthropic',
        slug: 'anthropic',
        api_key_env: 'ANTHROPIC_API_KEY',
        default_model: 'claude-sonnet-4-20250514',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17.304 3.541l-5.357 16.918H8.478L13.835 3.54h3.469zM6.696 3.541l5.357 16.918h3.469L10.165 3.54H6.696z"/></svg>'
      },
      {
        name: 'Google',
        slug: 'google',
        api_key_env: 'GOOGLE_API_KEY',
        default_model: 'gemini-1.5-pro',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>'
      },
      {
        name: 'Ollama (Local)',
        slug: 'ollama',
        api_key_env: 'OLLAMA_API_KEY',
        base_url: 'http://localhost:11434/api',
        default_model: 'llama3.2',
        icon: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>'
      }
    ]
  }),
  computed: {
    canSaveProvider() {
      return this.editingProvider?.name && this.editingProvider?.slug
    }
  },
  watch: {
    'settings.active_provider_slug': {
      handler(slug) {
        this.loadModelsForProvider(slug)
      }
    }
  },
  created() {
    this.loadProviders()
    this.loadSettings()
  },
  methods: {
    async loadProviders() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/providers`)
      if (result.ok) {
        this.providers = await result.json()
        // Load API key status for each provider
        for (const p of this.providers) {
          this.loadApiKeyStatus(p.slug)
        }
      }
    },
    async loadApiKeyStatus(slug) {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/providers/${slug}/api-key`)
      if (result.ok) {
        const status = await result.json()
        this.apiKeyStatus = { ...this.apiKeyStatus, [slug]: status }
      }
    },
    async loadSettings() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/settings`)
      if (result.ok) {
        this.settings = await result.json()
        if (this.settings.active_provider_slug) {
          this.loadModelsForProvider(this.settings.active_provider_slug)
        }
      }
    },
    async loadModelsForProvider(slug) {
      if (!slug) {
        this.availableModels = []
        return
      }
      const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/providers/${slug}/models`)
      if (result.ok) {
        this.availableModels = await result.json()
      }
    },
    async saveSettings() {
      await this.apiFetch(`${this.apiBase}/api/v1/ai/settings`, {
        method: 'PATCH',
        body: JSON.stringify(this.settings)
      })
    },
    hasProvider(slug) {
      return this.providers.some(p => p.slug === slug)
    },
    getProviderIcon(slug) {
      const preset = this.presets.find(p => p.slug === slug)
      return preset?.icon || '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
    },
    addNewProvider() {
      this.editingProvider = {
        name: '',
        slug: '',
        api_key_env: '',
        base_url: '',
        default_model: '',
        active: true
      }
    },
    editProvider(provider) {
      this.editingProvider = { ...provider }
    },
    closeModal() {
      this.editingProvider = null
    },
    async saveProvider() {
      if (!this.canSaveProvider) return

      if (this.editingProvider.id) {
        await this.apiFetch(`${this.apiBase}/api/v1/ai/providers/${this.editingProvider.slug}`, {
          method: 'PATCH',
          body: JSON.stringify(this.editingProvider)
        })
      } else {
        await this.apiFetch(`${this.apiBase}/api/v1/ai/providers`, {
          method: 'POST',
          body: JSON.stringify(this.editingProvider)
        })
      }

      await this.loadProviders()
      this.closeModal()
    },
    async deleteProvider(provider) {
      if (!confirm(this.translate('Are you sure you want to delete this AI provider?'))) return

      await this.apiFetch(`${this.apiBase}/api/v1/ai/providers/${provider.slug}`, {
        method: 'DELETE'
      })

      await this.loadProviders()
    },
    addPreset(preset) {
      this.editingProvider = {
        name: preset.name,
        slug: preset.slug,
        api_key_env: preset.api_key_env,
        base_url: preset.base_url || '',
        default_model: preset.default_model,
        active: true
      }
    },
    openUpdateKeyModal(provider) {
      this.updatingKeyProvider = provider
      this.newApiKey = ''
      this.showApiKey = false
    },
    closeKeyModal() {
      this.updatingKeyProvider = null
      this.newApiKey = ''
      this.showApiKey = false
    },
    async saveApiKey() {
      if (!this.newApiKey || !this.updatingKeyProvider) return
      this.savingKey = true

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/providers/${this.updatingKeyProvider.slug}/api-key`, {
          method: 'PUT',
          body: JSON.stringify({ api_key: this.newApiKey })
        })

        if (result.ok) {
          await this.loadApiKeyStatus(this.updatingKeyProvider.slug)
          this.closeKeyModal()
        }
      } finally {
        this.savingKey = false
      }
    },
    async removeApiKey(provider) {
      if (!confirm(this.translate('Remove the stored API key? The provider will fall back to the environment variable if set.'))) return

      await this.apiFetch(`${this.apiBase}/api/v1/ai/providers/${provider.slug}/api-key`, {
        method: 'DELETE'
      })

      await this.loadApiKeyStatus(provider.slug)
    },
    async testConnection(provider) {
      this.testingProvider = provider.slug
      this.testResults = { ...this.testResults, [provider.slug]: null }

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/providers/${provider.slug}/test`, {
          method: 'POST'
        })

        if (result.ok) {
          const data = await result.json()
          this.testResults = { ...this.testResults, [provider.slug]: data }
        } else {
          this.testResults = { ...this.testResults, [provider.slug]: { success: false, message: 'Request failed' } }
        }
      } catch (err) {
        this.testResults = { ...this.testResults, [provider.slug]: { success: false, message: err.message } }
      } finally {
        this.testingProvider = null
      }
    }
  }
}
</script>

<style scoped>
#ai-providers {
  padding: 20px 20px 50px;
  max-width: 1200px;
}

#ai-providers .header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

#ai-providers h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

#ai-providers h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 15px 0;
}

#ai-providers .description {
  color: #666;
  margin-bottom: 25px;
}

#ai-providers .add-button {
  background: #3498db;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

#ai-providers .add-button:hover {
  background: #2980b9;
}

/* Settings Section */
#ai-providers .settings-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
}

#ai-providers .settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 15px;
}

#ai-providers .setting-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 5px;
  font-size: 14px;
}

#ai-providers .setting-group select,
#ai-providers .setting-group input[type="number"],
#ai-providers .setting-group input[type="text"],
#ai-providers .setting-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

#ai-providers .setting-group.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

#ai-providers .setting-group.wide {
  grid-column: 1 / -1;
}

#ai-providers .setting-group textarea {
  resize: vertical;
}

/* Providers Grid */
#ai-providers .providers-section {
  margin-bottom: 30px;
}

#ai-providers .providers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

#ai-providers .provider-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  transition: box-shadow 0.2s;
}

#ai-providers .provider-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

#ai-providers .provider-card.active {
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

#ai-providers .provider-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

#ai-providers .provider-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

#ai-providers .provider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: #f5f5f5;
  border-radius: 8px;
}

#ai-providers .provider-info h3 {
  margin: 0 0 2px 0;
  font-size: 16px;
  font-weight: 600;
}

#ai-providers .provider-slug {
  font-size: 12px;
  color: #888;
  font-family: monospace;
}

#ai-providers .provider-actions {
  display: flex;
  gap: 8px;
}

#ai-providers .icon-btn {
  background: none;
  border: none;
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  color: #666;
}

#ai-providers .icon-btn:hover {
  background: #f0f0f0;
}

#ai-providers .icon-btn.danger:hover {
  background: #fee;
  color: #e74c3c;
}

#ai-providers .provider-details {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

#ai-providers .detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

#ai-providers .detail-row:last-child {
  margin-bottom: 0;
}

#ai-providers .detail-row .label {
  font-size: 13px;
  color: #666;
}

#ai-providers .detail-row .value {
  font-size: 13px;
  font-weight: 500;
}

#ai-providers .status-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  background: #f8d7da;
  color: #721c24;
}

#ai-providers .status-badge.active {
  background: #d4edda;
  color: #155724;
}

/* API Key Section */
#ai-providers .api-key-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
}

#ai-providers .api-key-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

#ai-providers .api-key-header .label {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

#ai-providers .key-source {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: #e8f5e9;
  color: #2e7d32;
}

#ai-providers .key-source.environment {
  background: #e3f2fd;
  color: #1565c0;
}

#ai-providers .api-key-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

#ai-providers .masked-key {
  font-family: monospace;
  font-size: 13px;
  background: #fff;
  padding: 6px 10px;
  border-radius: 4px;
  flex: 1;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#ai-providers .key-actions {
  display: flex;
  gap: 6px;
}

#ai-providers .btn-sm {
  padding: 5px 10px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #e0e0e0;
  color: #333;
}

#ai-providers .btn-sm:hover {
  background: #d0d0d0;
}

#ai-providers .btn-sm.primary {
  background: #3498db;
  color: white;
}

#ai-providers .btn-sm.primary:hover {
  background: #2980b9;
}

#ai-providers .btn-sm.danger {
  background: #fee;
  color: #e74c3c;
}

#ai-providers .btn-sm.danger:hover {
  background: #fcc;
}

#ai-providers .api-key-missing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e65100;
  font-size: 13px;
}

#ai-providers .api-key-missing .btn-sm {
  margin-left: auto;
}

/* Connection Test */
#ai-providers .connection-test {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#ai-providers .test-btn {
  width: 100%;
  padding: 10px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

#ai-providers .test-btn:hover:not(:disabled) {
  background: #eee;
}

#ai-providers .test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#ai-providers .spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

#ai-providers .test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

#ai-providers .test-result.success {
  background: #d4edda;
  color: #155724;
}

#ai-providers .test-result.error {
  background: #f8d7da;
  color: #721c24;
}

#ai-providers .result-icon {
  font-weight: bold;
}

#ai-providers .result-message {
  flex: 1;
}

#ai-providers .result-latency {
  font-size: 12px;
  opacity: 0.8;
}

/* Presets */
#ai-providers .presets-section {
  margin-bottom: 30px;
}

#ai-providers .preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

#ai-providers .preset-button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

#ai-providers .preset-button:hover:not(:disabled) {
  border-color: #3498db;
  background: #f8f9fa;
}

#ai-providers .preset-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#ai-providers .preset-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

#ai-providers .empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #666;
  background: #f8f9fa;
  border-radius: 8px;
}

/* Modal */
#ai-providers .modal-overlay {
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

#ai-providers .modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

#ai-providers .modal.modal-sm {
  max-width: 450px;
}

#ai-providers .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}

#ai-providers .modal-header h2 {
  margin: 0;
}

#ai-providers .modal-close {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #666;
  line-height: 1;
}

#ai-providers .modal-body {
  padding: 20px;
}

#ai-providers .modal-description {
  margin: 0 0 20px 0;
  color: #666;
  font-size: 14px;
}

#ai-providers .form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

#ai-providers .form-group {
  margin-bottom: 15px;
}

#ai-providers .form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 5px;
  font-size: 14px;
}

#ai-providers .form-group input[type="text"],
#ai-providers .form-group input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

#ai-providers .form-group input.readonly {
  background: #f5f5f5;
  color: #666;
}

#ai-providers .form-group small {
  display: block;
  margin-top: 5px;
  color: #888;
  font-size: 12px;
}

#ai-providers .password-input {
  position: relative;
  display: flex;
}

#ai-providers .password-input input {
  flex: 1;
  padding-right: 40px;
}

#ai-providers .toggle-visibility {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  padding: 4px;
}

#ai-providers .toggle-visibility:hover {
  color: #333;
}

#ai-providers .modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 15px 20px;
  border-top: 1px solid #eee;
}

#ai-providers .button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  background: #3498db;
  color: white;
}

#ai-providers .button:hover:not(:disabled) {
  background: #2980b9;
}

#ai-providers .button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#ai-providers .button-secondary {
  background: #6c757d;
}

#ai-providers .button-secondary:hover:not(:disabled) {
  background: #5a6268;
}
</style>
