<template>
  <div id="job-history" class="container">
    <div class="header-section">
      <h1>{{ translate('Job History') }}</h1>
      <div class="header-actions">
        <select v-model="statusFilter" class="filter-select">
          <option value="">{{ translate('All statuses') }}</option>
          <option value="pending">{{ translate('Pending') }}</option>
          <option value="running">{{ translate('Running') }}</option>
          <option value="completed">{{ translate('Completed') }}</option>
          <option value="failed">{{ translate('Failed') }}</option>
          <option value="cancelled">{{ translate('Cancelled') }}</option>
        </select>
        <button class="refresh-button" @click="loadJobs" :disabled="loading">
          {{ loading ? translate('Loading...') : translate('Refresh') }}
        </button>
        <button class="cleanup-button" @click="cleanupOldJobs" :disabled="loading">
          {{ translate('Cleanup old jobs') }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div class="table-wrapper">
      <div class="table">
        <div class="header">
          <div class="field-status">{{ translate('Status') }}</div>
          <div class="field-name">{{ translate('Name') }}</div>
          <div class="field-type">{{ translate('Type') }}</div>
          <div class="field-source">{{ translate('Source') }}</div>
          <div class="field-progress">{{ translate('Progress') }}</div>
          <div class="field-created">{{ translate('Created') }}</div>
          <div class="field-updated">{{ translate('Updated') }}</div>
          <div class="actions-cell">{{ translate('Actions') }}</div>
        </div>

        <div class="body">
          <div v-if="loading && jobs.length === 0" class="loading-row">
            <div class="loading-cell">{{ translate('Loading jobs...') }}</div>
          </div>
          <div v-else-if="jobs.length === 0" class="empty-row">
            <div class="empty-cell">{{ translate('No jobs found') }}</div>
          </div>
          <div v-for="job in jobs" :key="job.id" class="row" :class="'status-' + job.status">
            <div class="field-status">
              <span class="status-badge" :class="'badge-' + job.status">
                {{ job.status }}
              </span>
            </div>
            <div class="field-name">
              <span class="job-name">{{ job.name }}</span>
              <span v-if="job.description" class="job-description">{{ job.description }}</span>
            </div>
            <div class="field-type">{{ job.type }}</div>
            <div class="field-source">{{ job.source || '-' }}</div>
            <div class="field-progress">
              <div v-if="job.status === 'running'" class="progress-bar">
                <div class="progress-fill" :style="{ width: (job.progress || 0) + '%' }"></div>
                <span class="progress-text">{{ job.progress || 0 }}%</span>
              </div>
              <span v-else-if="job.status === 'completed'" class="progress-complete">100%</span>
              <span v-else>-</span>
            </div>
            <div class="field-created">{{ formatDate(job.createdAt) }}</div>
            <div class="field-updated">{{ formatDate(job.updatedAt) }}</div>
            <div class="actions-cell">
              <button class="button button-small" @click="viewDetails(job)">
                {{ translate('Details') }}
              </button>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="pagination-info">
            {{ translate('Showing') }} {{ jobs.length }} {{ translate('of') }} {{ totalJobs }} {{ translate('jobs') }}
          </div>
          <div class="pagination-controls">
            <button
              class="button button-small"
              :disabled="offset === 0"
              @click="previousPage"
            >
              {{ translate('Previous') }}
            </button>
            <button
              class="button button-small"
              :disabled="jobs.length < limit"
              @click="nextPage"
            >
              {{ translate('Next') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Job Details Modal -->
    <div v-if="showDetailsModal" class="modal-overlay" @click.self="closeDetails">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ translate('Job Details') }}: {{ selectedJob?.name }}</h2>
          <button class="close-button" @click="closeDetails">&times;</button>
        </div>
        <div class="modal-body">
          <div class="details-grid">
            <div class="detail-item">
              <label>{{ translate('Job ID') }}</label>
              <span class="monospace">{{ selectedJob?.jobId }}</span>
            </div>
            <div class="detail-item">
              <label>{{ translate('Status') }}</label>
              <span class="status-badge" :class="'badge-' + selectedJob?.status">
                {{ selectedJob?.status }}
              </span>
            </div>
            <div class="detail-item">
              <label>{{ translate('Type') }}</label>
              <span>{{ selectedJob?.type }}</span>
            </div>
            <div class="detail-item">
              <label>{{ translate('Source') }}</label>
              <span>{{ selectedJob?.source || '-' }}</span>
            </div>
            <div class="detail-item">
              <label>{{ translate('Progress') }}</label>
              <span>{{ selectedJob?.progress || 0 }}%</span>
            </div>
            <div class="detail-item">
              <label>{{ translate('Created') }}</label>
              <span>{{ formatDateFull(selectedJob?.createdAt) }}</span>
            </div>
            <div class="detail-item">
              <label>{{ translate('Updated') }}</label>
              <span>{{ formatDateFull(selectedJob?.updatedAt) }}</span>
            </div>
            <div v-if="selectedJob?.description" class="detail-item full-width">
              <label>{{ translate('Description') }}</label>
              <span>{{ selectedJob.description }}</span>
            </div>
            <div v-if="selectedJob?.errorMessage" class="detail-item full-width">
              <label>{{ translate('Error') }}</label>
              <pre class="error-output">{{ selectedJob.errorMessage }}</pre>
            </div>
            <div v-if="selectedJob?.result" class="detail-item full-width">
              <label>{{ translate('Result') }}</label>
              <pre class="result-output">{{ formatJSON(selectedJob.result) }}</pre>
            </div>
            <div v-if="selectedJob?.metadata" class="detail-item full-width">
              <label>{{ translate('Metadata') }}</label>
              <pre class="metadata-output">{{ formatJSON(selectedJob.metadata) }}</pre>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="button button-secondary" @click="closeDetails">{{ translate('Close') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch'],
  data: () => ({
    jobs: [],
    totalJobs: 0,
    loading: false,
    error: null,
    statusFilter: '',
    limit: 50,
    offset: 0,
    showDetailsModal: false,
    selectedJob: null
  }),
  watch: {
    statusFilter() {
      this.offset = 0
      this.loadJobs()
    }
  },
  created() {
    this.loadJobs()
  },
  methods: {
    async loadJobs() {
      this.loading = true
      this.error = null
      try {
        const params = new URLSearchParams({
          limit: this.limit.toString(),
          offset: this.offset.toString()
        })
        if (this.statusFilter) {
          params.set('status', this.statusFilter)
        }

        const result = await this.apiFetch(`${this.apiBase}/api/v1/jobs?${params}`)
        const response = await result.json()

        if (response.success) {
          this.jobs = response.data || []
          this.totalJobs = response.total || this.jobs.length
        } else {
          this.error = response.message || 'Failed to load jobs'
        }
      } catch (err) {
        this.error = err.message || 'Failed to load jobs'
      } finally {
        this.loading = false
      }
    },
    async cleanupOldJobs() {
      if (!confirm(this.translate('This will delete completed and failed jobs older than 30 days. Continue?'))) {
        return
      }

      this.loading = true
      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/jobs/cleanup`, {
          method: 'DELETE'
        })
        const response = await result.json()

        if (response.success) {
          alert(response.message)
          await this.loadJobs()
        } else {
          this.error = response.message || 'Failed to cleanup jobs'
        }
      } catch (err) {
        this.error = err.message || 'Failed to cleanup jobs'
      } finally {
        this.loading = false
      }
    },
    viewDetails(job) {
      this.selectedJob = job
      this.showDetailsModal = true
    },
    closeDetails() {
      this.showDetailsModal = false
      this.selectedJob = null
    },
    previousPage() {
      if (this.offset >= this.limit) {
        this.offset -= this.limit
        this.loadJobs()
      }
    },
    nextPage() {
      this.offset += this.limit
      this.loadJobs()
    },
    formatDate(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${day}.${month}.${year} ${hours}:${minutes}`
    },
    formatDateFull(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`
    },
    formatJSON(data) {
      if (!data) return '-'
      if (typeof data === 'string') {
        try {
          return JSON.stringify(JSON.parse(data), null, 2)
        } catch {
          return data
        }
      }
      return JSON.stringify(data, null, 2)
    }
  }
}
</script>

<style>
#job-history [disabled] {
  opacity: .5;
}

#job-history.container {
  max-width: 100%;
  overflow: hidden;
  padding: 20px 20px 50px;
  box-sizing: border-box;
}

#job-history .header-section {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  justify-content: space-between;
}

#job-history .header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

#job-history h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

#job-history .filter-select {
  height: 32px;
  padding: 0 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  background: white;
  cursor: pointer;
}

#job-history .refresh-button,
#job-history .cleanup-button {
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

#job-history .cleanup-button {
  background-color: #6c757d;
}

#job-history .refresh-button:hover {
  background-color: var(--color-primary-hover);
}

#job-history .cleanup-button:hover {
  background-color: #5a6268;
}

#job-history .error-message {
  background: #fee;
  border: 1px solid #fcc;
  color: #c00;
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 20px;
}

#job-history .table-wrapper {
  margin-top: 25px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow-x: auto;
  background: #f9f9f9;
  position: relative;
  max-width: 100%;
}

#job-history .table {
  width: 100%;
  min-width: 900px;
}

#job-history .header,
#job-history .row,
#job-history .footer {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid #eee;
}

#job-history .header>div,
#job-history .row>div,
#job-history .footer>div {
  padding: 6px 12px;
  display: flex;
  align-items: center;
  border-right: 1px solid #eee;
  background: inherit;
  box-sizing: border-box;
}

#job-history .header {
  background: #f9f9f9;
  font-weight: 600;
  font-size: 13px;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 50px;
}

#job-history .header>div {
  padding: 12px;
}

#job-history .body {
  background: white;
}

#job-history .body .row {
  transition: background-color 0.15s;
  min-height: 56px;
}

#job-history .body .row:last-child {
  border-bottom: none;
}

#job-history .body .row:hover>div {
  background: #f2f7fc;
}

#job-history .body .row>div {
  background: white;
}

#job-history .loading-row,
#job-history .empty-row {
  display: flex;
  justify-content: center;
  padding: 40px 20px;
  color: #666;
  background: white;
}

#job-history .footer {
  background: #f9f9f9;
  border-bottom: none;
  font-size: 13px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#job-history .pagination-controls {
  display: flex;
  gap: 8px;
}

#job-history .field-status {
  flex: 0 0 110px;
  min-width: 110px;
  max-width: 110px;
  justify-content: center;
}

#job-history .field-name {
  flex: 2 2 200px;
  min-width: 200px;
  flex-direction: column;
  align-items: flex-start !important;
  justify-content: center;
  gap: 4px;
}

#job-history .job-name {
  font-weight: 500;
}

#job-history .job-description {
  font-size: 12px;
  color: #666;
}

#job-history .field-type {
  flex: 0 0 100px;
  min-width: 100px;
  max-width: 100px;
}

#job-history .field-source {
  flex: 0 0 220px;
  min-width: 220px;
  max-width: 220px;
}

#job-history .field-progress {
  flex: 0 0 100px;
  min-width: 100px;
  max-width: 100px;
  justify-content: center;
}

#job-history .field-created,
#job-history .field-updated {
  flex: 0 0 140px;
  min-width: 140px;
  max-width: 140px;
  font-size: 12px;
}

#job-history .actions-cell {
  flex: 0 0 100px;
  min-width: 100px;
  max-width: 100px;
  border-right: none !important;
  justify-content: center;
}

#job-history .status-badge {
  padding: 4px 10px;
  margin: 0 4px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
}

#job-history .badge-pending {
  background: #fff3cd;
  color: #856404;
}

#job-history .badge-running {
  background: #cce5ff;
  color: #004085;
}

#job-history .badge-completed {
  background: #d4edda;
  color: #155724;
}

#job-history .badge-failed {
  background: #f8d7da;
  color: #721c24;
}

#job-history .badge-cancelled {
  background: #e2e3e5;
  color: #383d41;
}

#job-history .progress-bar {
  width: 100%;
  height: 16px;
  background: #e9ecef;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

#job-history .progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 8px;
  transition: width 0.3s ease;
}

#job-history .progress-text {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: 600;
  color: #333;
}

#job-history .progress-complete {
  color: #155724;
  font-weight: 600;
}

#job-history button,
#job-history .button {
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

#job-history .button-small {
  height: 28px;
  font-size: 12px;
  padding: 0 8px;
}

#job-history button:hover,
#job-history .button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

#job-history button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#job-history .button-secondary {
  background-color: #6c757d;
}

#job-history .button-secondary:hover {
  background-color: #5a6268;
}

/* Modal styles */
#job-history .modal-overlay {
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

#job-history .modal {
  background: white;
  border-radius: 8px;
  max-width: 700px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

#job-history .modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

#job-history .modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

#job-history .close-button {
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

#job-history .close-button:hover {
  color: #333;
  background: #f0f0f0;
}

#job-history .modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

#job-history .details-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

#job-history .detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

#job-history .detail-item.full-width {
  grid-column: 1 / -1;
}

#job-history .detail-item label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
}

#job-history .detail-item .monospace {
  font-family: monospace;
  font-size: 13px;
}

#job-history .error-output,
#job-history .result-output,
#job-history .metadata-output {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

#job-history .error-output {
  background: #fee;
  color: #c00;
}

#job-history .modal-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
  justify-content: flex-end;
}
</style>
