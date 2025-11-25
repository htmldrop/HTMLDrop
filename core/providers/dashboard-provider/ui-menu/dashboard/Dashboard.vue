<template>
  <div style="padding: 20px 20px 50px">
    <h1 style="margin: 0 0 20px">{{ node?.page_title }}</h1>
    <div class="grid-dashboard">
      <div class="card">
        <div class="card-header">
          <h2>{{ translate('Quick Draft') }}</h2>
        </div>
        <div class="card-content">
          <label>{{ translate('Title') }}</label>
          <input v-model="title" :disabled="saving || deleting" @keydown.enter="saveDraft"/>
          <label>{{ translate('Content') }}</label>
          <textarea v-model="content" :placeholder="translate('What are you thinking about?')" :disabled="saving || deleting"/>
          <div class="button-group">
            <div class="button-group-left">
              <button
                @click="saveDraft"
                :disabled="saving || deleting || !title.trim() || !content.trim()"
                class="button-primary"
              >
                {{ saving ? translate('Saving...') : (currentDraftId ? translate('Update') : translate('Save')) }}
              </button>
              <button
                v-if="currentDraftId"
                @click="createNew"
                :disabled="saving || deleting"
                class="button-secondary"
              >
                {{ translate('New') }}
              </button>
            </div>
            <button
              v-if="currentDraftId"
              @click="deleteDraft"
              :disabled="saving || deleting"
              class="button-danger"
            >
              {{ deleting ? translate('Deleting...') : translate('Trash') }}
            </button>
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
          <div v-if="successMessage" class="success-message">{{ successMessage }}</div>
        </div>
        <div class="card-footer">
          <h3>{{ translate('Your recent drafts') }}</h3>
          <div v-if="loading" style="color: #999; font-size: 13px;">{{ translate('Loading...') }}</div>
          <template v-else-if="recentDrafts.length > 0">
            <a
              v-for="draft in recentDrafts"
              :key="draft.id"
              href="#"
              @click.prevent="loadDraft(draft)"
              :class="{ active: currentDraftId === draft.id }"
              :title="formatFullDate(draft.updated_at)"
              class="draft-item"
            >
              <span class="draft-title">{{ draft.title }}</span>
              <span class="draft-date">{{ formatDate(draft.updated_at) }}</span>
            </a>
            <div v-if="totalPages > 1" class="pagination">
              <button
                @click="previousPage"
                :disabled="!hasPreviousPage"
                class="pagination-btn"
              >
                ‹
              </button>
              <span class="pagination-info">{{ currentPage }} / {{ totalPages }}</span>
              <button
                @click="nextPage"
                :disabled="!hasNextPage"
                class="pagination-btn"
              >
                ›
              </button>
            </div>
          </template>
          <div v-else style="color: #999; font-size: 13px;">{{ translate('No drafts yet') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['apiFetch', 'apiBase', 'navTree', 'tokens', 'translate'],
  props: ['sub', 'slug'],
  data: () => ({
    title: '',
    content: '',
    saving: false,
    deleting: false,
    loading: true,
    error: null,
    successMessage: null,
    recentDrafts: [],
    currentDraftId: null,
    currentDraftSlug: null,
    currentPage: 1,
    perPage: 5,
    totalDrafts: 0
  }),
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    },
    totalPages() {
      return Math.ceil(this.totalDrafts / this.perPage)
    },
    hasPreviousPage() {
      return this.currentPage > 1
    },
    hasNextPage() {
      return this.currentPage < this.totalPages
    }
  },
  mounted() {
    this.loadRecentDrafts()
  },
  methods: {
    parseDate(dateString) {
      if (!dateString) return null

      // If it's already a Date object, return it
      if (dateString instanceof Date) return dateString

      // Check if it's a MySQL datetime string (YYYY-MM-DD HH:MM:SS)
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
        // MySQL datetime is in UTC, so append 'Z' or parse it explicitly as UTC
        return new Date(dateString.replace(' ', 'T') + 'Z')
      }

      // Check if it's an ISO string
      if (typeof dateString === 'string' && dateString.includes('T')) {
        return new Date(dateString)
      }

      // Check if it's a Unix timestamp (number or numeric string)
      if (typeof dateString === 'number' || /^\d+$/.test(dateString)) {
        const timestamp = Number(dateString)
        // Check if it's in seconds (< 10 billion) or milliseconds
        return new Date(timestamp > 10000000000 ? timestamp : timestamp * 1000)
      }

      // Fallback to default Date parsing
      return new Date(dateString)
    },

    formatDate(dateString) {
      const date = this.parseDate(dateString)
      if (!date) return ''

      const now = new Date()
      const diffSeconds = Math.floor((now - date) / 1000)
      const diffMins = Math.floor(diffSeconds / 60)
      const diffHours = Math.floor(diffSeconds / 3600)
      const diffDays = Math.floor(diffSeconds / 86400)

      if (diffSeconds < 60) return this.translate('Just now')
      if (diffMins < 60) return `${diffMins}${this.translate('m ago')}`
      if (diffHours < 24) return `${diffHours}${this.translate('h ago')}`
      if (diffDays < 7) return `${diffDays}${this.translate('d ago')}`

      return date.toLocaleDateString()
    },

    formatFullDate(dateString) {
      const date = this.parseDate(dateString)
      if (!date) return ''
      return date.toLocaleString()
    },

    async loadRecentDrafts() {
      this.loading = true
      this.error = null

      try {
        const offset = (this.currentPage - 1) * this.perPage
        const response = await this.apiFetch(`${this.apiBase}/api/v1/quick_draft?per_page=${this.perPage}&offset=${offset}&order=desc&orderBy=updated_at`, {
          headers: {
            'Authorization': `Bearer ${this.tokens.accessToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          throw new Error('Failed to load drafts')
        }

        const data = await response.json()
        this.recentDrafts = data.items || []
        this.totalDrafts = data.total_current || 0
      } catch (err) {
        console.error('Failed to load recent drafts:', err)
      } finally {
        this.loading = false
      }
    },

    nextPage() {
      if (this.hasNextPage) {
        this.currentPage++
        this.loadRecentDrafts()
      }
    },

    previousPage() {
      if (this.hasPreviousPage) {
        this.currentPage--
        this.loadRecentDrafts()
      }
    },

    loadDraft(draft) {
      this.currentDraftId = draft.id
      this.currentDraftSlug = draft.slug
      this.title = draft.title
      this.content = draft.content
      this.error = null
      this.successMessage = null
    },

    createNew() {
      this.currentDraftId = null
      this.currentDraftSlug = null
      this.title = ''
      this.content = ''
      this.error = null
      this.successMessage = null
    },

    async saveDraft() {
      if (!this.title.trim() || !this.content.trim()) return

      this.saving = true
      this.error = null
      this.successMessage = null

      try {
        const isUpdate = !!this.currentDraftId
        const url = isUpdate
          ? `${this.apiBase}/api/v1/quick_draft/${this.currentDraftId}`
          : `${this.apiBase}/api/v1/quick_draft`

        const response = await this.apiFetch(url, {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            'Authorization': `Bearer ${this.tokens.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: this.title,
            content: this.content,
            status: 'draft'
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to save draft')
        }

        const data = await response.json()

        // Update the current draft info with the response data
        if (!isUpdate) {
          this.currentDraftId = data.id
          this.currentDraftSlug = data.slug
        }

        this.successMessage = isUpdate
          ? this.translate('Draft updated!')
          : this.translate('Draft saved!')

        // Refresh the recent drafts list
        await this.loadRecentDrafts()

        // Clear success message after 3 seconds
        setTimeout(() => {
          this.successMessage = null
        }, 3000)
      } catch (err) {
        console.error('Failed to save draft:', err)
        this.error = err.message
      } finally {
        this.saving = false
      }
    },

    async deleteDraft() {
      if (!this.currentDraftId) return

      if (!confirm(this.translate('Are you sure you want to delete this draft?'))) {
        return
      }

      this.deleting = true
      this.error = null
      this.successMessage = null

      try {
        const response = await this.apiFetch(`${this.apiBase}/api/v1/quick_draft/${this.currentDraftId}?permanently=true`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.tokens.accessToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to delete draft')
        }

        this.successMessage = this.translate('Draft deleted!')
        this.createNew()

        // Refresh the recent drafts list
        await this.loadRecentDrafts()

        // Clear success message after 3 seconds
        setTimeout(() => {
          this.successMessage = null
        }, 3000)
      } catch (err) {
        console.error('Failed to delete draft:', err)
        this.error = err.message
      } finally {
        this.deleting = false
      }
    }
  }
}
</script>

<style scoped>
  h1 {
    font-size: 23px;
    font-weight: 500;
  }
  .grid-dashboard {
    display: flex;
  }
  .grid-dashboard .card {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-forms);
    border: 1px solid var(--color-border);
    width: 350px;
    max-width: 100%;
  }
  .grid-dashboard .card-header h2 {
    margin: 0;
    font-size: 15px
  }
  .grid-dashboard .card-header {
    display: flex;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
  }
  .grid-dashboard .card-content {
    display: flex;
    flex-direction: column;
    padding: 10px 10px 15px;
  }
  .grid-dashboard .card-content label {
    font-size: 14px;
    margin-bottom: 5px;
  }
  .grid-dashboard .card-footer h3 {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 500;
  }
  .grid-dashboard .card-footer {
    display: flex;
    flex-direction: column;
    padding: 10px;
    border-top: 1px solid var(--color-border);
    font-size: 14px
  }
  .grid-dashboard input, .grid-dashboard textarea {
    margin-bottom: 15px;
    padding: 5px 10px;
    box-sizing: border-box;
  }
  .grid-dashboard input {
    height: 30px;
  }
  .grid-dashboard textarea {
    height: 100px;
    padding: 10px;
  }
  .button-group {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .button-group-left {
    display: flex;
    gap: 8px;
  }
  .grid-dashboard button {
    position: relative;
    background: none;
    border: none;
    margin: 0;
    font: inherit;
    text-align: inherit;
    text-decoration: none;
    appearance: none;
    -webkit-appearance: none; /* Safari */
    -moz-appearance: none;    /* Firefox */
    cursor: pointer;
    padding: 0 24px;
    height: 32px;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    font-weight: 600;
    font-size: 14px;
    border-radius: 4px;
    flex-grow: 0;
  }
  .grid-dashboard .button-primary {
    background-color: var(--color-primary);
    color: var(--color-bg);
  }
  .grid-dashboard .button-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }
  .grid-dashboard .button-secondary {
    background-color: var(--color-primary);
    color: var(--color-bg);
  }
  .grid-dashboard .button-secondary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }
  .grid-dashboard .button-danger {
    background-color: var(--color-danger);
    color: var(--color-bg);
  }
  .grid-dashboard .button-danger:hover:not(:disabled) {
    background-color: #c82333;
  }
  .grid-dashboard button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .grid-dashboard a {
    text-decoration: none;
    color: var(--color-primary);
    font-weight: 500;
  }
  .grid-dashboard a:hover {
    color: var(--color-primary-hover);
  }
  .grid-dashboard a.active {
    font-weight: 700;
    color: var(--color-primary-hover);
  }
  .draft-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 0;
  }
  .draft-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .draft-date {
    color: #999;
    font-size: 12px;
    flex-shrink: 0;
    text-align: right;
  }
  .draft-item.active .draft-date {
    color: var(--color-primary-hover);
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
  }
  .pagination-btn {
    background: none;
    border: 1px solid var(--color-border);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 18px;
    color: var(--color-primary);
    border-radius: 4px;
    padding: 0;
    transition: all 0.2s;
  }
  .pagination-btn:hover:not(:disabled) {
    background-color: var(--color-primary);
    color: var(--color-bg);
  }
  .pagination-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .pagination-info {
    font-size: 13px;
    color: #666;
    min-width: 50px;
    text-align: center;
  }
  .error-message {
    margin-top: 10px;
    padding: 8px 12px;
    background-color: #fee;
    border: 1px solid #fcc;
    border-radius: 4px;
    color: #c33;
    font-size: 13px;
  }
  .success-message {
    margin-top: 10px;
    padding: 8px 12px;
    background-color: #efe;
    border: 1px solid #cfc;
    border-radius: 4px;
    color: #363;
    font-size: 13px;
  }
</style>
