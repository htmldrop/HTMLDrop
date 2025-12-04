<template>
  <div class="themes-page-container">
    <div class="header-section">
      <h1>{{ node?.page_title }}</h1>
      <div class="header-buttons">
        <router-link class="add-button secondary" :to="'/' + slug + '/install'">{{ translate('Install themes') }}</router-link>
        <input
          ref="fileInput"
          type="file"
          accept=".zip"
          @change="handleFileSelect"
          style="display: none"
        />
        <button class="add-button" @click="triggerFileInput">{{ translate('Upload themes') }}</button>
      </div>
    </div>

    <!-- Filter tabs -->
    <div class="tabs">
      <button @click="filter = 'all'" :class="{ active: filter === 'all' }" class="tab-button">
        {{ translate('All') }} ({{ themes.length }})
      </button>
      <button @click="filter = 'active'" :class="{ active: filter === 'active' }" class="tab-button">
        {{ translate('Active') }} ({{ activeThemes.length }})
      </button>
      <button @click="filter = 'inactive'" :class="{ active: filter === 'inactive' }" class="tab-button">
        {{ translate('Inactive') }} ({{ inactiveThemes.length }})
      </button>
    </div>

    <!-- Filter -->
    <div class="search-box">
      <input v-model="search" :placeholder="translate('Filter themes') + '...'" />
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="loading">{{ translate('Loading') }}...</div>

    <!-- Theme list -->
    <div v-else-if="filteredThemes.length > 0" class="themes-list">
      <div v-for="theme in filteredThemes" :key="theme.slug" class="theme-card" :class="{ active: theme.active }">
        <div class="theme-header">
          <h2>{{ theme.name }}</h2>
          <span v-if="theme.active" class="badge active-badge">{{ translate('Active') }}</span>
          <span v-else class="badge inactive-badge">{{ translate('Inactive') }}</span>
        </div>
        <div class="theme-body">
          <p v-if="theme.description" class="theme-description">{{ theme.description }}</p>
          <p v-else class="theme-description muted">{{ translate('No description available') }}</p>
          <div class="theme-meta">
            <span v-if="theme.version">{{ translate('Version') }} {{ theme.version }}</span>
            <span v-if="theme.author">{{ translate('By') }} {{ theme.author }}</span>
          </div>
        </div>
        <div class="theme-actions">
          <!-- Upgrade Section (always visible if newer versions exist) -->
          <div v-if="theme.npmPackage && getVersions(theme) && hasNewerVersions(theme)" class="version-controls">
            <div class="version-group">
              <label class="version-label">{{ translate('Upgrade to') }}:</label>
              <select
                @change="changeVersion(theme, $event.target.value)"
                :disabled="changingVersion === theme.slug"
                class="version-select"
              >
                <option value="">{{ translate('Select version') }}...</option>
                <option
                  v-for="version in getVersions(theme).newerVersions"
                  :key="version"
                  :value="version"
                >
                  {{ version }}
                </option>
              </select>
              <button
                v-if="getNextVersion(theme)"
                @click="quickUpdateToNext(theme)"
                :disabled="changingVersion === theme.slug"
                class="quick-btn next-btn"
                :title="translate('Next version') + ': ' + getNextVersion(theme)"
              >
                ↑ {{ translate('Next') }}
              </button>
              <button
                @click="quickUpdateToLatest(theme)"
                :disabled="changingVersion === theme.slug"
                class="quick-btn latest-btn"
                :title="translate('Latest version') + ': ' + getVersions(theme).latestVersion"
              >
                ⇈ {{ translate('Latest') }}
              </button>
            </div>
          </div>

          <!-- Rollback Section (only visible when toggled) -->
          <div v-if="showRollbackFor === theme.slug && theme.npmPackage && getVersions(theme) && hasOlderVersions(theme)" class="version-controls rollback-section">
            <div class="version-group">
              <label class="version-label">{{ translate('Rollback to') }}:</label>
              <select
                @change="changeVersion(theme, $event.target.value)"
                :disabled="changingVersion === theme.slug"
                class="version-select"
              >
                <option value="">{{ translate('Select version') }}...</option>
                <option
                  v-for="version in getVersions(theme).olderVersions"
                  :key="version"
                  :value="version"
                >
                  {{ version }}
                </option>
              </select>
              <button
                v-if="getPreviousVersion(theme)"
                @click="quickRollbackToPrevious(theme)"
                :disabled="changingVersion === theme.slug"
                class="quick-btn prev-btn"
                :title="translate('Previous version') + ': ' + getPreviousVersion(theme)"
              >
                ↓ {{ translate('Previous') }}
              </button>
            </div>
          </div>

          <!-- Standard Actions -->
          <div class="standard-actions">
            <button v-if="!theme.active" @click="activateTheme(theme)" class="action-link activate">
              {{ translate('Activate') }}
            </button>
            <span v-if="theme.active" class="active-indicator">{{ translate('Active') }}</span>
            <button v-if="theme.active" @click="deactivateTheme(theme)" class="action-link deactivate">
              {{ translate('Deactivate') }}
            </button>
            <button
              v-if="theme.npmPackage && getVersions(theme) && hasOlderVersions(theme)"
              @click="toggleRollback(theme)"
              class="action-link rollback"
            >
              {{ showRollbackFor === theme.slug ? translate('Hide rollback') : translate('Rollback') }}
            </button>
            <button @click="downloadTheme(theme)" class="action-link download">
              {{ translate('Download') }}
            </button>
            <button v-if="!theme.active" @click="deleteTheme(theme)" class="action-link delete">
              {{ translate('Delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <p>{{ translate('No themes found') }}</p>
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
    themes: [],
    loading: true,
    filter: 'all',
    search: '',
    uploadingFile: null,
    themeVersions: {}, // Store available versions for each theme
    loadingVersions: false,
    changingVersion: null,
    showRollbackFor: null // Track which theme's rollback menu is open
  }),
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    },
    activeThemes() {
      return this.themes.filter(p => p.active)
    },
    inactiveThemes() {
      return this.themes.filter(p => !p.active)
    },
    filteredThemes() {
      let filtered = this.themes

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
    await this.fetchThemes()
    this.loadAllVersions()
  },
  methods: {
    async fetchThemes() {
      this.loading = true
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes`)
        this.themes = await result.json()
      } catch (err) {
        console.error('Failed to fetch themes:', err)
        alert(this.translate('Failed to load themes'))
      } finally {
        this.loading = false
      }
    },
    async activateTheme(theme) {
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/${theme.slug}/activate`, {
          method: 'POST'
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Activation failed')
        }

        if (data.success) {
          // Deactivate all other themes
          this.themes.forEach(t => t.active = false)
          // Activate this theme
          theme.active = true
          await this.getTree()
          alert(this.translate('Theme activated successfully'))
        }
      } catch (err) {
        console.error('Failed to activate theme:', err)
        alert(err.message || this.translate('Failed to activate theme'))
      }
    },
    async deactivateTheme(theme) {
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/deactivate`, {
          method: 'POST'
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Deactivation failed')
        }

        if (data.success) {
          theme.active = false
          await this.getTree()
          alert(this.translate('Theme deactivated successfully'))
        }
      } catch (err) {
        console.error('Failed to deactivate theme:', err)
        alert(err.message || this.translate('Failed to deactivate theme'))
      }
    },
    async deleteTheme(theme) {
      const confirmMessage = `${this.translate('Are you sure you want to delete')} "${theme.name}"? ${this.translate('This action cannot be undone')}.`

      if (!confirm(confirmMessage)) {
        return
      }

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/${theme.slug}`, {
          method: 'DELETE'
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Delete failed')
        }

        if (data.success) {
          this.themes = this.themes.filter(p => p.slug !== theme.slug)
          alert(this.translate('Theme deleted successfully'))
        }
      } catch (err) {
        console.error('Failed to delete theme:', err)
        alert(err.message || this.translate('Failed to delete theme'))
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
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/upload`, {
          method: 'POST',
          body: formData
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Upload failed')
        }

        if (data.success) {
          await this.fetchThemes()
          this.uploadingFile = null
          alert(this.translate('Theme uploaded successfully'))
        } else {
          throw new Error(data.error || 'Upload failed')
        }
      } catch (err) {
        console.error('Failed to upload theme:', err)
        alert(err.message || this.translate('Failed to upload theme'))
        this.uploadingFile = null
      }
    },
    async loadAllVersions() {
      this.loadingVersions = true
      try {
        // Load versions for each theme that has an npm package
        for (const theme of this.themes) {
          if (theme.npmPackage) {
            try {
              const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/${theme.slug}/versions`)
              if (result.ok) {
                const data = await result.json()
                this.themeVersions[theme.slug] = data
              }
            } catch (err) {
              console.error(`Failed to load versions for ${theme.slug}:`, err)
            }
          }
        }
      } catch (err) {
        console.error('Failed to load versions:', err)
      } finally {
        this.loadingVersions = false
      }
    },
    getVersions(theme) {
      return this.themeVersions[theme.slug] || null
    },
    hasNewerVersions(theme) {
      const versions = this.getVersions(theme)
      return versions && versions.newerVersions && versions.newerVersions.length > 0
    },
    hasOlderVersions(theme) {
      const versions = this.getVersions(theme)
      return versions && versions.olderVersions && versions.olderVersions.length > 0
    },
    getNextVersion(theme) {
      const versions = this.getVersions(theme)
      return versions?.newerVersions?.[versions.newerVersions.length - 1] || null
    },
    getPreviousVersion(theme) {
      const versions = this.getVersions(theme)
      return versions?.olderVersions?.[0] || null
    },
    async changeVersion(theme, version) {
      if (this.changingVersion) return

      if (!confirm(this.translate('Are you sure you want to change') + ` "${theme.name}" ` + this.translate('to version') + ` ${version}?`)) {
        return
      }

      this.changingVersion = theme.slug

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/${theme.slug}/change-version`, {
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
          // Update the theme in the list
          const index = this.themes.findIndex(p => p.slug === theme.slug)
          if (index !== -1) {
            this.themes[index] = { ...this.themes[index], ...data.theme }
          }
          await this.getTree()
          // Reload versions
          await this.loadAllVersions()
          alert(this.translate('Theme version changed successfully'))
        }
      } catch (err) {
        console.error('Failed to change version:', err)
        alert(err.message || this.translate('Failed to change version'))
      } finally {
        this.changingVersion = null
      }
    },
    async quickUpdateToLatest(theme) {
      const versions = this.getVersions(theme)
      if (versions?.latestVersion) {
        await this.changeVersion(theme, versions.latestVersion)
      }
    },
    async quickUpdateToNext(theme) {
      const nextVersion = this.getNextVersion(theme)
      if (nextVersion) {
        await this.changeVersion(theme, nextVersion)
      }
    },
    async quickRollbackToPrevious(theme) {
      const prevVersion = this.getPreviousVersion(theme)
      if (prevVersion) {
        await this.changeVersion(theme, prevVersion)
      }
    },
    toggleRollback(theme) {
      if (this.showRollbackFor === theme.slug) {
        this.showRollbackFor = null
      } else {
        this.showRollbackFor = theme.slug
      }
    },
    async downloadTheme(theme) {
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/${theme.slug}/download`)

        if (!result.ok) {
          const data = await result.json()
          throw new Error(data.error || 'Download failed')
        }

        // Get the blob and trigger download
        const blob = await result.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${theme.slug}-${theme.version || '1.0.0'}.zip`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        a.remove()
      } catch (err) {
        console.error('Failed to download theme:', err)
        alert(err.message || this.translate('Failed to download theme'))
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
.themes-page-container {
  max-width: 100%;
  padding: 20px 20px 50px;
}

.themes-page-container .header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 10px;
  flex-wrap: wrap;
}

.themes-page-container h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

.themes-page-container .header-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.themes-page-container .add-button {
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

.themes-page-container .add-button:hover {
  background-color: var(--color-primary-hover);
}

.themes-page-container .add-button.secondary {
  background-color: var(--color-bg);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.themes-page-container .add-button.secondary:hover {
  background-color: var(--color-bg-navigation);
}

.themes-page-container .tabs {
  display: flex;
  gap: 5px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}

.themes-page-container .tab-button {
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

.themes-page-container .tab-button:hover {
  background: var(--color-bg-navigation);
}

.themes-page-container .tab-button.active {
  background: var(--color-primary);
  color: var(--color-bg);
  border-color: var(--color-primary);
}

.themes-page-container .search-box {
  margin-bottom: 20px;
}

.themes-page-container .search-box input {
  width: 100%;
  max-width: 400px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 14px;
}

.themes-page-container .loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted);
}

.themes-page-container .themes-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.themes-page-container .theme-card {
  background: var(--color-bg-forms);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 15px;
  transition: border-color 0.2s;
}

.themes-page-container .theme-card.active {
  border-left: 3px solid var(--color-primary);
}

.themes-page-container .theme-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.themes-page-container .theme-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.themes-page-container .badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
}

.themes-page-container .active-badge {
  background: #d4edda;
  color: #155724;
}

.themes-page-container .inactive-badge {
  background: #e2e3e5;
  color: #383d41;
}

.themes-page-container .theme-body {
  margin-bottom: 12px;
}

.themes-page-container .theme-description {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--color);
}

.themes-page-container .theme-description.muted {
  color: var(--color-text-muted);
  font-style: italic;
}

.themes-page-container .theme-meta {
  display: flex;
  gap: 15px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.themes-page-container .theme-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.themes-page-container .version-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.themes-page-container .version-controls.rollback-section {
  font-weight: normal;
  border-color: var(--color-warning);
  background: rgba(255, 152, 0, 0.05);
}

.themes-page-container .version-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.themes-page-container .version-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-muted);
  min-width: 80px;
}

.themes-page-container .version-select {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  font-size: 13px;
  background: var(--color-bg-forms);
  color: var(--color);
  cursor: pointer;
  min-width: 120px;
}

.themes-page-container .version-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.themes-page-container .quick-btn {
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.themes-page-container .quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.themes-page-container .next-btn {
  background: var(--color-accent);
  color: white;
  opacity: .8;
}

.themes-page-container .next-btn:hover:not(:disabled) {
  opacity: 1;
}

.themes-page-container .latest-btn {
  background: var(--color-primary);
  color: white;
  opacity: .8;
}

.themes-page-container .latest-btn:hover:not(:disabled) {
  opacity: 1;
}

.themes-page-container .prev-btn {
  background: var(--color-danger);
  color: white;
  opacity: .8;
}

.themes-page-container .prev-btn:hover:not(:disabled) {
  opacity: 1;
}

.themes-page-container .standard-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.themes-page-container .active-indicator {
  padding: 4px 12px;
  background: #28a745;
  color: white;
  border-radius: 3px;
  font-size: 13px;
  font-weight: 600;
}

.themes-page-container .action-link {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  font-size: 14px;
}

.themes-page-container .action-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.themes-page-container .action-link.deactivate {
  color: #6c757d;
}

.themes-page-container .action-link.deactivate:hover {
  color: #5a6268;
}

.themes-page-container .action-link.delete {
  color: #dc3545;
}

.themes-page-container .action-link.delete:hover {
  color: #c82333;
}

.themes-page-container .action-link.rollback {
  color: var(--color-warning);
  font-weight: normal;
  opacity: .8;
}

.themes-page-container .action-link.rollback:hover {
  opacity: 1;
}

.themes-page-container .action-link.download {
  color: #17a2b8;
}

.themes-page-container .action-link.download:hover {
  color: #138496;
}

.themes-page-container .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
}

.themes-page-container .empty-state p {
  margin: 0;
  font-size: 16px;
}

/* Upload Overlay */
.themes-page-container .upload-overlay {
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

.themes-page-container .upload-message {
  background: var(--color-bg);
  padding: 30px 50px;
  border-radius: 8px;
  text-align: center;
}

.themes-page-container .upload-message p {
  margin: 0 0 10px 0;
  font-size: 16px;
  font-weight: 500;
}

.themes-page-container .upload-message .filename {
  color: var(--color-primary);
  font-weight: 600;
}

</style>
