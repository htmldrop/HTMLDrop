<template>
  <div class="job-queue">
    <div v-if="jobs.length === 0" class="no-jobs">
      <p>No active jobs</p>
    </div>

    <TransitionGroup name="job-list" tag="div" class="jobs-list">
      <div
        v-for="job in jobs"
        :key="job.jobId"
        class="job-item"
        :class="[`job-${job.status}`, { 'job-completed': job.status === 'completed' }]"
      >
        <div class="job-icon" v-if="job.iconSvg" v-html="job.iconSvg"></div>
        <div class="job-icon-default" v-else>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>

        <div class="job-content">
          <div class="job-header">
            <h4 class="job-name">{{ job.name }}</h4>
            <span class="job-status-badge" :class="`status-${job.status}`">
              {{ formatStatus(job.status) }}
            </span>
          </div>

          <p v-if="job.description" class="job-description">{{ job.description }}</p>

          <div v-if="job.status === 'running'" class="job-progress">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: `${job.progress}%` }"></div>
            </div>
            <span class="progress-text">{{ job.progress }}%</span>
          </div>

          <div v-if="job.status === 'failed'" class="job-error">
            <p>{{ job.errorMessage }}</p>
          </div>
        </div>

        <button
          v-if="job.status === 'completed' || job.status === 'failed'"
          @click="removeJob(job.jobId)"
          class="job-remove"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue'

const jobs = ref([])
const apiBase = inject('apiBase')
const apiFetch = inject('apiFetch')

let ws = null
let reconnectTimeout = null

const formatStatus = (status) => {
  const statusMap = {
    pending: 'Pending',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled'
  }
  return statusMap[status] || status
}

const removeJob = (jobId) => {
  const index = jobs.value.findIndex(j => j.jobId === jobId)
  if (index !== -1) {
    jobs.value.splice(index, 1)
  }
}

const connectWebSocket = () => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

  // Get JWT token from localStorage
  const tokens = localStorage.getItem('tokens')
  const accessToken = tokens ? JSON.parse(tokens)?.accessToken : null

  // Include token in WebSocket connection
  const wsUrl = `${wsProtocol}//${window.location.host}${accessToken ? `?token=${accessToken}` : ''}`

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('WebSocket connected')
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      if (data.type === 'job_update') {
        // Skip if notification is disabled for this job
        if (data.job.showNotification === false) {
          return
        }

        const existingIndex = jobs.value.findIndex(j => j.jobId === data.job.jobId)

        if (existingIndex !== -1) {
          // Update existing job
          jobs.value[existingIndex] = data.job

          // Auto-remove completed jobs after 5 seconds
          if (data.job.status === 'completed') {
            setTimeout(() => {
              removeJob(data.job.jobId)
            }, 5000)
          }
        } else {
          // Add new job
          jobs.value.unshift(data.job)
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
  }

  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting in 3s...')
    reconnectTimeout = setTimeout(connectWebSocket, 3000)
  }
}

const fetchJobs = async () => {
  try {
    const response = await apiFetch(`${apiBase}/api/v1/jobs?status=pending&status=running`)
    const data = await response.json()

    if (data.success) {
      jobs.value = data.data
    }
  } catch (error) {
    console.error('Failed to fetch jobs:', error)
  }
}

onMounted(() => {
  fetchJobs()
  connectWebSocket()
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
  }
})
</script>

<style scoped>
.job-queue {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  z-index: 9999;
}

.no-jobs {
  display: none;
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.job-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  position: relative;
  animation: slideIn 0.3s ease-out;
}

.job-item.job-completed {
  animation: slideOut 0.3s ease-out forwards;
  animation-delay: 4.7s;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOut {
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

.job-icon,
.job-icon-default {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 8px;
  color: #666;
}

.job-content {
  flex: 1;
  min-width: 0;
}

.job-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding-right: 28px; /* Make room for X button */
}

.job-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-status-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-pending {
  background: #fef3c7;
  color: #92400e;
}

.status-running {
  background: #dbeafe;
  color: #1e40af;
}

.status-completed {
  background: #d1fae5;
  color: #065f46;
}

.status-failed {
  background: #fee2e2;
  color: #991b1b;
}

.status-cancelled {
  background: #f3f4f6;
  color: #374151;
}

.job-description {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #666;
}

.job-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  font-weight: 600;
  color: #3b82f6;
  min-width: 40px;
  text-align: right;
}

.job-error {
  margin-top: 8px;
  padding: 8px;
  background: #fee2e2;
  border-radius: 4px;
}

.job-error p {
  margin: 0;
  font-size: 12px;
  color: #991b1b;
}

.job-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s;
}

.job-remove:hover {
  color: #374151;
}

.job-list-enter-active,
.job-list-leave-active {
  transition: all 0.3s ease;
}

.job-list-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.job-list-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.job-list-move {
  transition: transform 0.3s ease;
}
</style>
