<template>
  <div class="plugins-page-container">
    <div class="header-section">
      <h1>{{ node?.page_title }}</h1>
      <div class="header-buttons">
        <router-link class="add-button secondary" :to="'/' + slug + '/install'">{{ translate('Install plugins') }}</router-link>
        <input
          ref="fileInput"
          type="file"
          accept=".zip"
          @change="handleFileSelect"
          style="display: none"
        />
        <button class="add-button" @click="triggerFileInput">{{ translate('Upload plugins') }}</button>
      </div>
    </div>

    <!-- Filter tabs -->
    <div class="tabs">
      <button @click="filter = 'all'" :class="{ active: filter === 'all' }" class="tab-button">
        {{ translate('All') }} ({{ plugins.length }})
      </button>
      <button @click="filter = 'active'" :class="{ active: filter === 'active' }" class="tab-button">
        {{ translate('Active') }} ({{ activePlugins.length }})
      </button>
      <button @click="filter = 'inactive'" :class="{ active: filter === 'inactive' }" class="tab-button">
        {{ translate('Inactive') }} ({{ inactivePlugins.length }})
      </button>
    </div>

    <!-- Filter -->
    <div class="search-box">
      <input v-model="search" :placeholder="translate('Filter plugins') + '...'" />
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="loading">{{ translate('Loading') }}...</div>

    <!-- Plugin list -->
    <div v-else-if="filteredPlugins.length > 0" class="plugins-list">
      <div v-for="plugin in filteredPlugins" :key="plugin.slug" class="plugin-card" :class="{ active: plugin.active }">
        <div class="plugin-header">
          <h2>{{ plugin.name }}</h2>
          <span v-if="plugin.active" class="badge active-badge">{{ translate('Active') }}</span>
          <span v-else class="badge inactive-badge">{{ translate('Inactive') }}</span>
        </div>
        <div class="plugin-body">
          <p v-if="plugin.description" class="plugin-description">{{ plugin.description }}</p>
          <p v-else class="plugin-description muted">{{ translate('No description available') }}</p>
          <div class="plugin-meta">
            <span v-if="plugin.version">{{ translate('Version') }} {{ plugin.version }}</span>
            <span v-if="plugin.author">{{ translate('By') }} {{ plugin.author }}</span>
          </div>
        </div>
        <div class="plugin-actions">
          <!-- Upgrade Section (always visible if newer versions exist) -->
          <div v-if="plugin.npmPackage && getVersions(plugin) && hasNewerVersions(plugin)" class="version-controls">
            <div class="version-group">
              <label class="version-label">{{ translate('Upgrade to') }}:</label>
              <select
                @change="changeVersion(plugin, $event.target.value)"
                :disabled="changingVersion === plugin.slug"
                class="version-select"
              >
                <option value="">{{ translate('Select version') }}...</option>
                <option
                  v-for="version in getVersions(plugin).newerVersions"
                  :key="version"
                  :value="version"
                >
                  {{ version }}
                </option>
              </select>
              <button
                v-if="getNextVersion(plugin)"
                @click="quickUpdateToNext(plugin)"
                :disabled="changingVersion === plugin.slug"
                class="quick-btn next-btn"
                :title="translate('Next version') + ': ' + getNextVersion(plugin)"
              >
                ↑ {{ translate('Next') }}
              </button>
              <button
                @click="quickUpdateToLatest(plugin)"
                :disabled="changingVersion === plugin.slug"
                class="quick-btn latest-btn"
                :title="translate('Latest version') + ': ' + getVersions(plugin).latestVersion"
              >
                ⇈ {{ translate('Latest') }}
              </button>
            </div>
          </div>

          <!-- Rollback Section (only visible when toggled) -->
          <div v-if="showRollbackFor === plugin.slug && plugin.npmPackage && getVersions(plugin) && hasOlderVersions(plugin)" class="version-controls rollback-section">
            <div class="version-group">
              <label class="version-label">{{ translate('Rollback to') }}:</label>
              <select
                @change="changeVersion(plugin, $event.target.value)"
                :disabled="changingVersion === plugin.slug"
                class="version-select"
              >
                <option value="">{{ translate('Select version') }}...</option>
                <option
                  v-for="version in getVersions(plugin).olderVersions"
                  :key="version"
                  :value="version"
                >
                  {{ version }}
                </option>
              </select>
              <button
                v-if="getPreviousVersion(plugin)"
                @click="quickRollbackToPrevious(plugin)"
                :disabled="changingVersion === plugin.slug"
                class="quick-btn prev-btn"
                :title="translate('Previous version') + ': ' + getPreviousVersion(plugin)"
              >
                ↓ {{ translate('Previous') }}
              </button>
            </div>
          </div>

          <!-- Standard Actions -->
          <div class="standard-actions">
            <button v-if="!plugin.active" @click="activatePlugin(plugin)" class="action-link activate">
              {{ translate('Activate') }}
            </button>
            <button v-if="plugin.active" @click="deactivatePlugin(plugin)" class="action-link deactivate">
              {{ translate('Deactivate') }}
            </button>
            <button
              v-if="plugin.npmPackage && getVersions(plugin) && hasOlderVersions(plugin)"
              @click="toggleRollback(plugin)"
              class="action-link rollback"
            >
              {{ showRollbackFor === plugin.slug ? translate('Hide rollback') : translate('Rollback') }}
            </button>
            <button v-if="!plugin.active" @click="deletePlugin(plugin)" class="action-link delete">
              {{ translate('Delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <p>{{ translate('No plugins found') }}</p>
    </div>

    <!-- Uploading overlay -->
    <div v-if="uploadingFile" class="upload-overlay">
      <div class="upload-message">
        <p>{{ translate('Uploading') }}...</p>
        <p class="filename">{{ uploadingFile.name }}</p>
      </div>
    </div>

  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiFetch', 'apiBase', 'navTree', 'updateNavTree'],
  props: ['sub', 'slug'],
  data: () => ({
    plugins: [],
    loading: true,
    filter: 'all',
    search: '',
    uploadingFile: null,
    pluginVersions: {}, // Store available versions for each plugin
    loadingVersions: false,
    changingVersion: null,
    showRollbackFor: null // Track which plugin's rollback menu is open
  }),
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    },
    activePlugins() {
      return this.plugins.filter(p => p.active)
    },
    inactivePlugins() {
      return this.plugins.filter(p => !p.active)
    },
    filteredPlugins() {
      let filtered = this.plugins

      // Apply filter
      if (this.filter === 'active') {
        filtered = filtered.filter(p => p.active)
      } else if (this.filter === 'inactive') {
        filtered = filtered.filter(p => !p.active)
      }

      // Apply search
      if (this.search) {
        const searchLower = this.search.toLowerCase()
        filtered = filtered.filter(p =>
          p.name.toLowerCase().includes(searchLower) ||
          (p.description && p.description.toLowerCase().includes(searchLower)) ||
          (p.author && p.author.toLowerCase().includes(searchLower))
        )
      }

      return filtered
    }
  },
  async mounted() {
    await this.fetchPlugins()
    this.loadAllVersions()
  },
  methods: {
    async fetchPlugins() {
      this.loading = true
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/plugins`)
        this.plugins = await result.json()
      } catch (err) {
        console.error('Failed to fetch plugins:', err)
        alert(this.translate('Failed to load plugins'))
      } finally {
        this.loading = false
      }
    },
    async activatePlugin(plugin) {
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/plugins/${plugin.slug}/activate`, {
          method: 'POST'
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Activation failed')
        }

        if (data.success) {
          plugin.active = true
          await this.getTree()
          alert(this.translate('Plugin activated successfully'))
        }
      } catch (err) {
        console.error('Failed to activate plugin:', err)
        alert(err.message || this.translate('Failed to activate plugin'))
      }
    },
    async deactivatePlugin(plugin) {
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/plugins/${plugin.slug}/deactivate`, {
          method: 'POST'
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Deactivation failed')
        }

        if (data.success) {
          plugin.active = false
          await this.getTree()
          alert(this.translate('Plugin deactivated successfully'))
        }
      } catch (err) {
        console.error('Failed to deactivate plugin:', err)
        alert(err.message || this.translate('Failed to deactivate plugin'))
      }
    },
    async deletePlugin(plugin) {
      const confirmMessage = `${this.translate('Are you sure you want to delete')} "${plugin.name}"? ${this.translate('This action cannot be undone')}.`

      if (!confirm(confirmMessage)) {
        return
      }

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/plugins/${plugin.slug}`, {
          method: 'DELETE'
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Delete failed')
        }

        if (data.success) {
          this.plugins = this.plugins.filter(p => p.slug !== plugin.slug)
          alert(this.translate('Plugin deleted successfully'))
        }
      } catch (err) {
        console.error('Failed to delete plugin:', err)
        alert(err.message || this.translate('Failed to delete plugin'))
      }
    },
    triggerFileInput() {
      this.$refs.fileInput.click()
    },
    handleFileSelect(event) {
      const file = event.target.files[0]
      if (file) {
        if (file.name.endsWith('.zip')) {
          this.uploadFile(file)
        } else {
          alert(this.translate('Only .zip files are accepted'))
        }
      }
      // Reset input so same file can be selected again
      event.target.value = ''
    },
    async uploadFile(file) {
      this.uploadingFile = file

      const formData = new FormData()
      formData.append('file', file)

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/plugins/upload`, {
          method: 'POST',
          body: formData
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Upload failed')
        }

        if (data.success) {
          await this.fetchPlugins()
          this.uploadingFile = null
          alert(this.translate('Plugin uploaded successfully'))
        } else {
          throw new Error(data.error || 'Upload failed')
        }
      } catch (err) {
        console.error('Failed to upload plugin:', err)
        alert(err.message || this.translate('Failed to upload plugin'))
        this.uploadingFile = null
      }
    },
    async loadAllVersions() {
      this.loadingVersions = true
      try {
        // Load versions for each plugin that has an npm package
        for (const plugin of this.plugins) {
          if (plugin.npmPackage) {
            try {
              const result = await this.apiFetch(`${this.apiBase}/api/v1/plugins/${plugin.slug}/versions`)
              if (result.ok) {
                const data = await result.json()
                this.pluginVersions[plugin.slug] = data
              }
            } catch (err) {
              console.error(`Failed to load versions for ${plugin.slug}:`, err)
            }
          }
        }
      } catch (err) {
        console.error('Failed to load versions:', err)
      } finally {
        this.loadingVersions = false
      }
    },
    getVersions(plugin) {
      return this.pluginVersions[plugin.slug] || null
    },
    hasNewerVersions(plugin) {
      const versions = this.getVersions(plugin)
      return versions && versions.newerVersions && versions.newerVersions.length > 0
    },
    hasOlderVersions(plugin) {
      const versions = this.getVersions(plugin)
      return versions && versions.olderVersions && versions.olderVersions.length > 0
    },
    getNextVersion(plugin) {
      const versions = this.getVersions(plugin)
      return versions?.newerVersions?.[versions.newerVersions.length - 1] || null
    },
    getPreviousVersion(plugin) {
      const versions = this.getVersions(plugin)
      return versions?.olderVersions?.[0] || null
    },
    async changeVersion(plugin, version) {
      if (this.changingVersion) return

      if (!confirm(this.translate('Are you sure you want to change') + ` "${plugin.name}" ` + this.translate('to version') + ` ${version}?`)) {
        return
      }

      this.changingVersion = plugin.slug

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/plugins/${plugin.slug}/change-version`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ version })
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Version change failed')
        }

        if (data.success) {
          // Update the plugin in the list
          const index = this.plugins.findIndex(p => p.slug === plugin.slug)
          if (index !== -1) {
            this.plugins[index] = { ...this.plugins[index], ...data.plugin }
          }
          await this.getTree()
          // Reload versions
          await this.loadAllVersions()
          alert(this.translate('Plugin version changed successfully'))
        }
      } catch (err) {
        console.error('Failed to change version:', err)
        alert(err.message || this.translate('Failed to change version'))
      } finally {
        this.changingVersion = null
      }
    },
    async quickUpdateToLatest(plugin) {
      const versions = this.getVersions(plugin)
      if (versions?.latestVersion) {
        await this.changeVersion(plugin, versions.latestVersion)
      }
    },
    async quickUpdateToNext(plugin) {
      const nextVersion = this.getNextVersion(plugin)
      if (nextVersion) {
        await this.changeVersion(plugin, nextVersion)
      }
    },
    async quickRollbackToPrevious(plugin) {
      const prevVersion = this.getPreviousVersion(plugin)
      if (prevVersion) {
        await this.changeVersion(plugin, prevVersion)
      }
    },
    toggleRollback(plugin) {
      if (this.showRollbackFor === plugin.slug) {
        this.showRollbackFor = null
      } else {
        this.showRollbackFor = plugin.slug
      }
    },
    async getTree() {
      try {
        const res = await this.apiFetch(`${this.apiBase}/api/v1/dashboard/menu`)
        this.updateNavTree(await res.json())
      } catch(e) {
        console.log(e)
      }
    }
  }
}
</script>

<style>
.plugins-page-container {
  max-width: 100%;
  padding: 20px 20px 50px;
}

.plugins-page-container .header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 10px;
  flex-wrap: wrap;
}

.plugins-page-container h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

.plugins-page-container .header-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.plugins-page-container .add-button {
  all: unset;
  display: flex;
  align-items: center;
  background-color: var(--color-primary);
  color: var(--color-bg);
  border: none;
  padding: 0 16px;
  height: 32px;
  font-weight: 600;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
}

.plugins-page-container .add-button:hover {
  background-color: var(--color-primary-hover);
}

.plugins-page-container .add-button.secondary {
  background-color: var(--color-bg);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.plugins-page-container .add-button.secondary:hover {
  background-color: var(--color-bg-navigation);
}

.plugins-page-container .tabs {
  display: flex;
  gap: 5px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}

.plugins-page-container .tab-button {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color);
  padding: 0 12px;
  height: 32px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
}

.plugins-page-container .tab-button:hover {
  background: var(--color-bg-navigation);
}

.plugins-page-container .tab-button.active {
  background: var(--color-primary);
  color: var(--color-bg);
  border-color: var(--color-primary);
}

.plugins-page-container .search-box {
  margin-bottom: 20px;
}

.plugins-page-container .search-box input {
  width: 100%;
  max-width: 400px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 14px;
}

.plugins-page-container .loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted);
}

.plugins-page-container .plugins-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.plugins-page-container .plugin-card {
  background: var(--color-bg-forms);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 15px;
  transition: border-color 0.2s;
}

.plugins-page-container .plugin-card.active {
  border-left: 3px solid var(--color-primary);
}

.plugins-page-container .plugin-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.plugins-page-container .plugin-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.plugins-page-container .badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
}

.plugins-page-container .active-badge {
  background: #d4edda;
  color: #155724;
}

.plugins-page-container .inactive-badge {
  background: #e2e3e5;
  color: #383d41;
}

.plugins-page-container .plugin-body {
  margin-bottom: 12px;
}

.plugins-page-container .plugin-description {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--color);
}

.plugins-page-container .plugin-description.muted {
  color: var(--color-text-muted);
  font-style: italic;
}

.plugins-page-container .plugin-meta {
  display: flex;
  gap: 15px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.plugins-page-container .plugin-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plugins-page-container .version-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.plugins-page-container .version-controls.rollback-section {
  font-weight: normal;
  border-color: var(--color-warning);
  background: rgba(255, 152, 0, 0.05);
}

.plugins-page-container .version-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.plugins-page-container .version-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-muted);
  min-width: 80px;
}

.plugins-page-container .version-select {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  font-size: 13px;
  background: var(--color-bg-forms);
  color: var(--color);
  cursor: pointer;
  min-width: 120px;
}

.plugins-page-container .version-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plugins-page-container .quick-btn {
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.plugins-page-container .quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plugins-page-container .next-btn {
  background: var(--color-accent);
  color: white;
  opacity: .8;
}

.plugins-page-container .next-btn:hover:not(:disabled) {
  opacity: 1;
}

.plugins-page-container .latest-btn {
  background: var(--color-primary);
  color: white;
  opacity: .8;
}

.plugins-page-container .latest-btn:hover:not(:disabled) {
  opacity: 1;
}

.plugins-page-container .prev-btn {
  background: var(--color-danger);
  color: white;
  opacity: .8;
}

.plugins-page-container .prev-btn:hover:not(:disabled) {
  opacity: 1;
}

.plugins-page-container .standard-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.plugins-page-container .action-link {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  font-size: 14px;
}

.plugins-page-container .action-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.plugins-page-container .action-link.delete {
  color: #dc3545;
}

.plugins-page-container .action-link.delete:hover {
  color: #c82333;
}

.plugins-page-container .action-link.rollback {
  color: var(--color-warning);
  font-weight: normal;
  opacity: .8;
}

.plugins-page-container .action-link.rollback:hover {
  opacity: 1;
}

.plugins-page-container .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
}

.plugins-page-container .empty-state p {
  margin: 0;
  font-size: 16px;
}

/* Upload Overlay */
.plugins-page-container .upload-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.plugins-page-container .upload-message {
  background: var(--color-bg);
  padding: 30px 50px;
  border-radius: 8px;
  text-align: center;
}

.plugins-page-container .upload-message p {
  margin: 0 0 10px 0;
  font-size: 16px;
  font-weight: 500;
}

.plugins-page-container .upload-message .filename {
  color: var(--color-primary);
  font-weight: 600;
}

</style>
