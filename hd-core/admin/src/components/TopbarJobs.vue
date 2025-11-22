<template>
  <div v-if="displayJobs.length > 0" class="topbar-jobs">
    <div
      v-for="job in displayJobs"
      :key="job.jobId"
      class="job-indicator"
      :title="`${job.name} - ${job.progress}% complete`"
    >
      <!-- Progress background -->
      <div class="job-progress-bg" :style="{ width: `${job.progress}%` }"></div>

      <!-- Job icon -->
      <div class="job-icon" v-if="job.iconSvg" v-html="job.iconSvg"></div>
      <div class="job-icon-default" v-else>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'

const jobs = ref([])
const apiBase = inject('apiBase')
const apiFetch = inject('apiFetch')

// Get max display count from env or default to 3
const maxDisplayJobs = parseInt(import.meta.env.VITE_TOPBAR_MAX_JOBS || '3', 10)

let ws = null
let reconnectTimeout = null

// Filter and sort jobs: only pending/running, sorted by progress descending, limit to max
const displayJobs = computed(() => {
  return jobs.value
    .filter(job => job.status === 'pending' || job.status === 'running')
    .sort((a, b) => b.progress - a.progress)
    .slice(0, maxDisplayJobs)
})

const connectWebSocket = () => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

  // Get JWT token from localStorage
  const tokens = localStorage.getItem('tokens')
  const accessToken = tokens ? JSON.parse(tokens)?.accessToken : null

  // Include token in WebSocket connection
  const wsUrl = `${wsProtocol}//${window.location.host}${accessToken ? `?token=${accessToken}` : ''}`

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    // WebSocket connected
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      if (data.type === 'job_update') {
        const existingIndex = jobs.value.findIndex(j => j.jobId === data.job.jobId)

        if (existingIndex !== -1) {
          // Update existing job
          jobs.value[existingIndex] = data.job

          // Remove completed/failed/cancelled jobs
          if (['completed', 'failed', 'cancelled'].includes(data.job.status)) {
            setTimeout(() => {
              const idx = jobs.value.findIndex(j => j.jobId === data.job.jobId)
              if (idx !== -1) {
                jobs.value.splice(idx, 1)
              }
            }, 2000) // Brief delay so user sees completion
          }
        } else {
          // Add new job (only if pending or running)
          if (data.job.status === 'pending' || data.job.status === 'running') {
            jobs.value.push(data.job)
          }
        }
      }
    } catch (error) {
      console.error('[TopbarJobs] Failed to parse WebSocket message:', error)
    }
  }

  ws.onerror = (error) => {
    console.error('[TopbarJobs] WebSocket error:', error)
  }

  ws.onclose = () => {
    reconnectTimeout = setTimeout(connectWebSocket, 3000)
  }
}

const fetchJobs = async () => {
  try {
    const response = await apiFetch(`${apiBase}/api/v1/jobs?limit=20`)

    if (!response.ok) {
      return
    }

    const data = await response.json()

    if (data.success && data.data) {
      // Filter to only pending/running jobs client-side
      jobs.value = data.data.filter(job =>
        job.status === 'pending' || job.status === 'running'
      )
    }
  } catch (error) {
    console.error('[TopbarJobs] Failed to fetch jobs:', error)
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
.topbar-jobs {
  display: flex;
  gap: 4px;
  align-items: center;
  height: 100%;
  margin-left: 12px;
}

.job-indicator {
  position: relative;
  width: 24px;
  height: 24px;
  background-color: rgba(255, 255, 255, 0.08);
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
}

.job-indicator:hover {
  transform: translateY(-1px);
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.job-progress-bg {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(37, 99, 235, 0.35));
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.job-icon,
.job-icon-default {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px; /* Even spacing on all sides */
}

.job-icon :deep(svg),
.job-icon-default svg {
  width: 100%;
  height: 100%;
  max-width: 16px;
  max-height: 16px;
  color: rgba(255, 255, 255, 0.75);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
  transition: color 0.2s ease;
  display: block;
  margin: auto;
}

.job-indicator:hover .job-icon :deep(svg),
.job-indicator:hover .job-icon-default svg {
  color: rgba(255, 255, 255, 0.95);
}

/* Animation for new jobs */
@keyframes jobAppear {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.job-indicator {
  animation: jobAppear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Pulse animation for active jobs */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.job-indicator {
  animation: jobAppear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), pulse 2s ease-in-out infinite;
}
</style>
