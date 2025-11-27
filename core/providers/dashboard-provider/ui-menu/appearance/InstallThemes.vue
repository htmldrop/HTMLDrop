<template>
  <div class="install-themes-container">
    <div class="header-section">
      <h1>{{ translate('Install Themes') }}</h1>
      <div class="header-buttons">
        <router-link class="add-button secondary" :to="'/' + slug">{{ translate('Show installed themes') }}</router-link>
      </div>
    </div>

    <!-- Search box -->
    <div class="search-section">
      <input
        v-model="npmSearch"
        @input="debounceNpmSearch"
        :placeholder="translate('Search themes') + '...'"
        class="search-input"
      />
    </div>

    <!-- Loading state -->
    <div v-if="npmLoading" class="loading">{{ translate('Searching') }}...</div>

    <!-- Search results grid -->
    <div v-else-if="npmResults.length > 0" class="theme-grid">
      <div v-for="pkg in npmResults" :key="pkg.package.name" class="theme-card">
        <div class="theme-image">
          <img
            :src="getThemeThumbnail(pkg.package.name)"
            @error="handleImageError"
            alt="Theme thumbnail"
          />
        </div>
        <div class="theme-content">
          <h3 class="theme-title">{{ pkg.package.name }}</h3>
          <p class="theme-description">{{ pkg.package.description || translate('No description available') }}</p>
          <div class="theme-meta">
            <span class="theme-downloads">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              {{ formatDownloads(pkg.downloads?.weekly) }}
            </span>
            <span class="theme-version">v{{ pkg.package.version }}</span>
          </div>
          <button
            v-if="!getThemeStatus(pkg.package.name).installed"
            @click="installNpmTheme(pkg.package)"
            :disabled="installingTheme === pkg.package.name"
            class="install-btn"
          >
            {{ installingTheme === pkg.package.name ? translate('Installing') + '...' : translate('Install') }}
          </button>
          <button
            v-else-if="!getThemeStatus(pkg.package.name).active"
            @click="activateTheme(pkg.package)"
            :disabled="installingTheme === pkg.package.name"
            class="install-btn activate-btn"
          >
            {{ installingTheme === pkg.package.name ? translate('Activating') + '...' : translate('Activate') }}
          </button>
          <button
            v-else
            @click="deactivateTheme(pkg.package)"
            :disabled="installingTheme === pkg.package.name"
            class="install-btn deactivate-btn"
          >
            {{ installingTheme === pkg.package.name ? translate('Deactivating') + '...' : translate('Deactivate') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="npmSearched" class="empty-state">
      <p>{{ translate('No themes found') }}</p>
    </div>

    <!-- Initial state -->
    <div v-else class="empty-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="9" x2="15" y2="9"></line>
        <line x1="9" y1="15" x2="15" y2="15"></line>
      </svg>
      <p>{{ translate('Search for themes in the NPM registry') }}</p>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiFetch', 'apiBase', 'navTree', 'updateNavTree'],
  props: ['sub', 'slug'],
  data: () => ({
    npmSearch: '',
    npmResults: [],
    npmLoading: false,
    npmSearched: false,
    npmDebounceTimer: null,
    installingTheme: null,
    installedThemes: []
  }),
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    }
  },
  async mounted() {
    // Load installed themes first
    await this.loadInstalledThemes()
    // Load all themes sorted by popularity on mount
    this.searchNpmThemes()
  },
  methods: {
    async loadInstalledThemes() {
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes`)
        const themes = await result.json()
        this.installedThemes = themes || []
      } catch (err) {
        console.error('Failed to load installed themes:', err)
      }
    },
    getThemeStatus(packageName) {
      // Extract slug from package name (e.g., @htmldrop/hello-world -> hello-world)
      const slug = packageName.replace(/^@.*?\//, '').replace(/[^a-z0-9-]/gi, '-')
      const installed = this.installedThemes.find(p => p.slug === slug)

      if (!installed) return { installed: false, active: false }
      return { installed: true, active: installed.active }
    },
    debounceNpmSearch() {
      clearTimeout(this.npmDebounceTimer)
      this.npmDebounceTimer = setTimeout(() => {
        this.searchNpmThemes()
      }, 500)
    },
    async searchNpmThemes() {
      this.npmLoading = true
      this.npmSearched = true

      try {
        const query = encodeURIComponent(this.npmSearch)
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/search/npm?q=${query}&size=20`)
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Failed to search themes')
        }

        this.npmResults = data.objects || []
      } catch (err) {
        console.error('Failed to search NPM:', err)
        alert(err.message || this.translate('Failed to search themes'))
        this.npmResults = []
      } finally {
        this.npmLoading = false
      }
    },
    getThemeThumbnail(packageName) {
      // Try to load thumbnail from jsDelivr
      // Expected path: package-root/.hd/thumbnail.png
      return `https://cdn.jsdelivr.net/npm/${packageName}@latest/.hd/thumbnail.png`
    },
    handleImageError(event) {
      // Fallback to a default placeholder
      event.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150"%3E%3Crect fill="%23f0f0f0" width="200" height="150"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-family="sans-serif" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E'
    },
    formatDownloads(count) {
      if (!count) return '0'
      if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M'
      if (count >= 1000) return (count / 1000).toFixed(1) + 'K'
      return count.toString()
    },
    async installNpmTheme(pkg) {
      if (this.installingTheme) return

      this.installingTheme = pkg.name

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/install/npm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            packageName: pkg.name,
            version: pkg.version
          })
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Installation failed')
        }

        if (data.success) {
          alert(this.translate('Theme installed successfully'))
          // Reload installed themes list
          await this.loadInstalledThemes()
        } else {
          throw new Error(data.error || 'Installation failed')
        }
      } catch (err) {
        console.error('Failed to install theme:', err)
        alert(err.message || this.translate('Failed to install theme'))
      } finally {
        this.installingTheme = null
      }
    },
    async activateTheme(pkg) {
      if (this.installingTheme) return

      this.installingTheme = pkg.name

      try {
        const slug = pkg.name.replace(/^@.*?\//, '').replace(/[^a-z0-9-]/gi, '-')
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/${slug}/activate`, {
          method: 'POST'
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Activation failed')
        }

        if (data.success) {
          alert(this.translate('Theme activated successfully'))
          // Reload installed themes list
          await this.loadInstalledThemes()
        } else {
          throw new Error(data.error || 'Activation failed')
        }
      } catch (err) {
        console.error('Failed to activate theme:', err)
        alert(err.message || this.translate('Failed to activate theme'))
      } finally {
        await this.getTree()
        this.installingTheme = null
      }
    },
    async deactivateTheme(pkg) {
      if (this.installingTheme) return

      this.installingTheme = pkg.name

      try {
        const slug = pkg.name.replace(/^@.*?\//, '').replace(/[^a-z0-9-]/gi, '-')
        const result = await this.apiFetch(`${this.apiBase}/api/v1/themes/deactivate`, {
          method: 'POST'
        })
        const data = await result.json()

        if (!result.ok) {
          throw new Error(data.error || 'Deactivation failed')
        }

        if (data.success) {
          alert(this.translate('Theme deactivated successfully'))
          // Reload installed themes list
          await this.loadInstalledThemes()
        } else {
          throw new Error(data.error || 'Deactivation failed')
        }
      } catch (err) {
        console.error('Failed to deactivate theme:', err)
        alert(err.message || this.translate('Failed to deactivate theme'))
      } finally {
        await this.getTree()
        this.installingTheme = null
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
.install-themes-container {
  max-width: 100%;
  padding: 20px 20px 50px;
}

.install-themes-container .header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 10px;
  flex-wrap: wrap;
}

.install-themes-container h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

.install-themes-container .search-section {
  margin-bottom: 30px;
}

.install-themes-container .search-input {
  width: 100%;
  max-width: 600px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 15px;
  background: var(--color-bg-forms);
  color: var(--color);
}

.install-themes-container .loading {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
  font-size: 16px;
}

.install-themes-container .empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--color-text-muted);
}

.install-themes-container .empty-state svg {
  margin-bottom: 20px;
  opacity: 0.5;
}

.install-themes-container .empty-state p {
  margin: 0;
  font-size: 16px;
}

/* WordPress-style Theme Grid */
.install-themes-container .theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.install-themes-container .theme-card {
  background: var(--color-bg-forms);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
}

.install-themes-container .theme-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.install-themes-container .theme-image {
  width: 100%;
  height: 150px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.install-themes-container .theme-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.install-themes-container .theme-content {
  padding: 15px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.install-themes-container .theme-title {
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.install-themes-container .theme-description {
  margin: 0 0 12px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-muted);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  flex: 1;
}

.install-themes-container .theme-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.install-themes-container .theme-downloads {
  display: flex;
  align-items: center;
  gap: 4px;
}

.install-themes-container .theme-downloads svg {
  width: 14px;
  height: 14px;
}

.install-themes-container .theme-version {
  font-weight: 500;
}

.install-themes-container .install-btn {
  width: 100%;
  background-color: var(--color-primary);
  color: var(--color-bg);
  border: none;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.install-themes-container .install-btn:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

.install-themes-container .install-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.install-themes-container .activate-btn {
  background-color: #28a745;
}

.install-themes-container .activate-btn:hover:not(:disabled) {
  background-color: #218838;
}

.install-themes-container .deactivate-btn {
  background-color: #6c757d;
}

.install-themes-container .deactivate-btn:hover:not(:disabled) {
  background-color: #5a6268;
}

.install-themes-container .header-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.install-themes-container .add-button {
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

.install-themes-container .add-button:hover {
  background-color: var(--color-primary-hover);
}

.install-themes-container .add-button.secondary {
  background-color: var(--color-bg);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.install-themes-container .add-button.secondary:hover {
  background-color: var(--color-bg-navigation);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .install-themes-container .theme-grid {
    grid-template-columns: 1fr;
  }
}
</style>
