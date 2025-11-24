<template>
  <div class="updates-page" style="padding: 20px 20px 50px">
    <h1 style="margin: 0 0 20px">{{ node?.page_title }}</h1>

    <!-- Loading State -->
    <div v-if="loading" class="loading-card">
      <div class="spinner"></div>
      <p>{{ translate('Checking for updates...') }}</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-card">
      <h3>{{ translate('Error') }}</h3>
      <p>{{ error }}</p>
      <button @click="checkForUpdates" class="retry-button">{{ translate('Retry') }}</button>
    </div>

    <!-- Update Available -->
    <div v-else-if="updateStatus?.available" class="update-card available">
      <div class="update-header">
        <svg class="update-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        <div>
          <h2>{{ translate('Update Available') }}</h2>
          <p class="version-info">
            {{ translate('Current') }}: <strong>v{{ updateStatus.current }}</strong>
            → {{ translate('Latest') }}: <strong>v{{ updateStatus.latest }}</strong>
          </p>
        </div>
      </div>

      <div v-if="updateStatus.info?.description" class="update-description">
        <h4>{{ translate('What\'s New') }}</h4>
        <p>{{ updateStatus.info.description }}</p>
      </div>

      <div v-if="updateStatus.info?.publishedAt" class="update-meta">
        <span>{{ translate('Released') }}: {{ formatDate(updateStatus.info.publishedAt) }}</span>
      </div>

      <button
        @click="performUpdate"
        :disabled="updating"
        class="update-button primary"
      >
        <span v-if="!updating">{{ translate('Update Now') }}</span>
        <span v-else>
          <div class="spinner-inline"></div>
          {{ translate('Updating...') }}
        </span>
      </button>

      <p class="warning-text">
        ⚠️ {{ translate('The system will automatically restart after the update completes.') }}
      </p>
    </div>

    <!-- Up to Date -->
    <div v-else class="update-card up-to-date">
      <div class="update-header">
        <svg class="update-icon success" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <div>
          <h2>{{ translate('You\'re Up to Date!') }}</h2>
          <p class="version-info">
            {{ translate('Current version') }}: <strong>v{{ updateStatus?.current }}</strong>
          </p>
        </div>
      </div>

      <p class="meta-text">
        {{ translate('Last checked') }}: {{ new Date().toLocaleString() }}
      </p>

      <button @click="checkForUpdates" class="update-button secondary">
        {{ translate('Check Again') }}
      </button>
    </div>

    <!-- Repository Info -->
    <div v-if="updateStatus?.info?.url" class="repo-card">
      <h3>{{ translate('Repository') }}</h3>
      <a :href="updateStatus.info.url" target="_blank" rel="noopener noreferrer" class="repo-link">
        {{ translate('View on GitHub') }} →
      </a>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['apiFetch', 'apiBase', 'navTree', 'translate', 'tokens'],
  props: ['sub', 'slug'],
  data: () => ({
    loading: true,
    updating: false,
    error: null,
    updateStatus: null
  }),
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    }
  },
  mounted() {
    this.checkForUpdates()
  },
  methods: {
    async checkForUpdates() {
      this.loading = true
      this.error = null

      try {
        const response = await this.apiFetch(`${this.apiBase}/api/v1/updates/status`, {
          headers: {
            'Authorization': `Bearer ${this.tokens.accessToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          throw new Error('Failed to check for updates')
        }

        const data = await response.json()
        this.updateStatus = data.data
      } catch (err) {
        console.error('Failed to check for updates:', err)
        this.error = err.message
      } finally {
        this.loading = false
      }
    },

    async performUpdate() {
      if (!confirm(this.translate('Are you sure you want to update? The system will restart after the update completes.'))) {
        return
      }

      this.updating = true
      this.error = null

      try {
        const response = await this.apiFetch(`${this.apiBase}/api/v1/updates/pull`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.tokens.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            branch: 'main'
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to update')
        }

        const data = await response.json()

        // Show success message
        alert(this.translate('Update started successfully! The system will restart in a few seconds...'))

        // Refresh after 5 seconds to show the restarting state
        setTimeout(() => {
          window.location.reload()
        }, 5000)
      } catch (err) {
        console.error('Failed to perform update:', err)
        this.error = err.message
        this.updating = false
      }
    },

    formatDate(dateString) {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    }
  }
}
</script>

<style scoped>
.updates-page {
  max-width: 800px;
}

.loading-card,
.error-card,
.update-card,
.repo-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-inline {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 0.5rem;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-card {
  border-left: 4px solid #ef4444;
}

.error-card h3 {
  color: #ef4444;
  margin: 0 0 0.5rem 0;
}

.update-card.available {
  border-left: 4px solid #3b82f6;
}

.update-card.up-to-date {
  border-left: 4px solid #10b981;
}

.update-header {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.update-icon {
  width: 48px;
  height: 48px;
  color: #3b82f6;
  flex-shrink: 0;
}

.update-icon.success {
  color: #10b981;
}

.update-header h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #1a202c;
}

.version-info {
  margin: 0;
  color: #64748b;
  font-size: 0.95rem;
}

.version-info strong {
  color: #1a202c;
  font-weight: 600;
}

.update-description {
  margin: 1.5rem 0;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 8px;
}

.update-description h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #1a202c;
}

.update-description p {
  margin: 0;
  color: #475569;
  line-height: 1.6;
  white-space: pre-line;
}

.update-meta,
.meta-text {
  color: #64748b;
  font-size: 0.875rem;
  margin: 1rem 0;
}

.update-button {
  width: 100%;
  padding: 0.875rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.update-button.primary {
  background: #3b82f6;
  color: white;
}

.update-button.primary:hover:not(:disabled) {
  background: #2563eb;
}

.update-button.secondary {
  background: #f1f5f9;
  color: #475569;
}

.update-button.secondary:hover:not(:disabled) {
  background: #e2e8f0;
}

.update-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.retry-button {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.retry-button:hover {
  background: #2563eb;
}

.warning-text {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #fef3c7;
  border-radius: 6px;
  color: #92400e;
  font-size: 0.875rem;
  text-align: center;
}

.repo-card h3 {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1a202c;
}

.repo-link {
  color: #3b82f6;
  text-decoration: none;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.repo-link:hover {
  text-decoration: underline;
}
</style>
