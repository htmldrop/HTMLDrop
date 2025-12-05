<template>
  <div id="system-info" class="container">
    <div class="header-section">
      <h1>{{ translate('System Information') }}</h1>
      <button class="refresh-button" @click="refresh" :disabled="loading">
        {{ loading ? translate('Loading...') : translate('Refresh') }}
      </button>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>

    <div v-if="info" class="dashboard-grid">
      <!-- Cluster Status Card -->
      <div class="card" v-if="info.cluster">
        <div class="card-header">
          <h3>{{ translate('Cluster Status') }}</h3>
          <span class="badge" :class="info.cluster.enabled ? 'badge-success' : 'badge-info'">
            {{ info.cluster.enabled ? translate('Clustered') : translate('Single Process') }}
          </span>
        </div>
        <div class="card-body">
          <div class="cluster-visual" v-if="info.cluster.enabled">
            <div class="cluster-primary">
              <div class="cluster-node primary">
                <span class="node-icon">👑</span>
                <span class="node-label">{{ translate('Primary') }}</span>
              </div>
            </div>
            <div class="cluster-workers" v-if="info.cluster.workerCount > 0">
              <div
                v-for="worker in info.cluster.workers"
                :key="worker.id"
                class="cluster-node worker"
              >
                <span class="node-icon">⚙️</span>
                <span class="node-label">{{ translate('Worker') }} #{{ worker.id }}</span>
                <span class="node-pid">PID {{ worker.pid }}</span>
              </div>
            </div>
          </div>
          <div class="info-list" v-else>
            <div class="info-row">
              <span class="label">{{ translate('Mode') }}</span>
              <span class="value">{{ info.cluster.isWorker ? translate('Worker Process') : translate('Single Process') }}</span>
            </div>
            <div class="info-row" v-if="info.cluster.isWorker">
              <span class="label">{{ translate('Worker ID') }}</span>
              <span class="value">{{ info.cluster.workerId }}</span>
            </div>
          </div>
          <div class="info-grid" style="margin-top: 15px;">
            <div class="info-item">
              <span class="label">{{ translate('Workers') }}</span>
              <span class="value">{{ info.cluster.workerCount || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('This Process') }}</span>
              <span class="value">{{ info.cluster.isPrimary ? translate('Primary') : translate('Worker') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- CPU Usage Card -->
      <div class="card">
        <div class="card-header">
          <h3>{{ translate('CPU Usage') }}</h3>
          <span class="badge" :class="getCpuBadgeClass">{{ info.cpu.usage }}%</span>
        </div>
        <div class="card-body">
          <div class="progress-ring-container">
            <svg class="progress-ring" viewBox="0 0 120 120">
              <circle class="progress-ring-bg" cx="60" cy="60" r="50" />
              <circle
                class="progress-ring-fill cpu"
                cx="60" cy="60" r="50"
                :style="{ strokeDashoffset: getCircleOffset(info.cpu.usage) }"
              />
            </svg>
            <div class="progress-ring-text">{{ info.cpu.usage }}%</div>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">{{ translate('Model') }}</span>
              <span class="value small">{{ info.cpu.model }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Cores') }}</span>
              <span class="value">{{ info.cpu.cores }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Speed') }}</span>
              <span class="value">{{ info.cpu.speed }} MHz</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Load Avg') }}</span>
              <span class="value">{{ info.cpu.loadAverage['1m'] }} / {{ info.cpu.loadAverage['5m'] }} / {{ info.cpu.loadAverage['15m'] }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- CPU Per Core Card -->
      <div class="card" v-if="info.cpu.perCore && info.cpu.perCore.length > 1">
        <div class="card-header">
          <h3>{{ translate('CPU Cores') }}</h3>
        </div>
        <div class="card-body">
          <div class="core-bars">
            <div v-for="core in info.cpu.perCore" :key="core.core" class="core-bar-container">
              <div class="core-bar-label">
                <span>{{ translate('Core') }} {{ core.core }}</span>
                <span>{{ core.usage }}%</span>
              </div>
              <div class="core-bar">
                <div
                  class="core-bar-fill"
                  :style="{ width: core.usage + '%', background: getCoreBarColor(core.usage) }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Memory Usage Card -->
      <div class="card">
        <div class="card-header">
          <h3>{{ translate('Memory Usage') }}</h3>
          <span class="badge" :class="getMemoryBadgeClass">{{ info.memory.percentage }}%</span>
        </div>
        <div class="card-body">
          <div class="progress-ring-container">
            <svg class="progress-ring" viewBox="0 0 120 120">
              <circle class="progress-ring-bg" cx="60" cy="60" r="50" />
              <circle
                class="progress-ring-fill memory"
                cx="60" cy="60" r="50"
                :style="{ strokeDashoffset: getCircleOffset(info.memory.percentage) }"
              />
            </svg>
            <div class="progress-ring-text">{{ info.memory.percentage }}%</div>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">{{ translate('Total') }}</span>
              <span class="value">{{ info.memory.totalFormatted }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Used') }}</span>
              <span class="value">{{ info.memory.usedFormatted }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Free') }}</span>
              <span class="value">{{ info.memory.freeFormatted }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Disk Usage Card -->
      <div class="card" v-if="info.disk">
        <div class="card-header">
          <h3>{{ translate('Disk Usage') }}</h3>
          <span class="badge" :class="getDiskBadgeClass">{{ info.disk.percentage }}%</span>
        </div>
        <div class="card-body">
          <div class="progress-ring-container">
            <svg class="progress-ring" viewBox="0 0 120 120">
              <circle class="progress-ring-bg" cx="60" cy="60" r="50" />
              <circle
                class="progress-ring-fill disk"
                cx="60" cy="60" r="50"
                :style="{ strokeDashoffset: getCircleOffset(info.disk.percentage) }"
              />
            </svg>
            <div class="progress-ring-text">{{ info.disk.percentage }}%</div>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">{{ translate('Total') }}</span>
              <span class="value">{{ info.disk.totalFormatted }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Used') }}</span>
              <span class="value">{{ info.disk.usedFormatted }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Available') }}</span>
              <span class="value">{{ info.disk.availableFormatted }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Mount') }}</span>
              <span class="value">{{ info.disk.mount }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Process Memory Card -->
      <div class="card">
        <div class="card-header">
          <h3>{{ translate('Node.js Process') }}</h3>
          <span class="badge badge-info">PID {{ info.process.pid }}</span>
        </div>
        <div class="card-body">
          <div class="memory-breakdown">
            <div class="memory-bar-section">
              <div class="memory-bar-header">
                <span>{{ translate('Heap') }}</span>
                <span>{{ info.process.memory.heapUsedFormatted }} / {{ info.process.memory.heapTotalFormatted }}</span>
              </div>
              <div class="stacked-bar">
                <div class="stacked-bar-fill heap" :style="{ width: getHeapPercentage + '%' }"></div>
              </div>
            </div>
            <div class="memory-bar-section">
              <div class="memory-bar-header">
                <span>{{ translate('RSS (Resident Set Size)') }}</span>
                <span>{{ info.process.memory.rssFormatted }}</span>
              </div>
              <div class="stacked-bar">
                <div class="stacked-bar-fill rss" :style="{ width: getRssPercentage + '%' }"></div>
              </div>
            </div>
          </div>
          <div class="info-grid" style="margin-top: 15px;">
            <div class="info-item">
              <span class="label">{{ translate('External') }}</span>
              <span class="value">{{ info.process.memory.externalFormatted }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Array Buffers') }}</span>
              <span class="value">{{ info.process.memory.arrayBuffersFormatted }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Event Loop Lag') }}</span>
              <span class="value" :class="{ 'text-warning': info.process.eventLoopLag > 10, 'text-danger': info.process.eventLoopLag > 50 }">
                {{ info.process.eventLoopLag }} ms
              </span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Uptime') }}</span>
              <span class="value">{{ info.process.uptimeFormatted }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Open Handles') }}</span>
              <span class="value">{{ info.process.openHandles.handles }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ translate('Active Requests') }}</span>
              <span class="value">{{ info.process.openHandles.requests }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Database Info Card -->
      <div class="card" v-if="info.database">
        <div class="card-header">
          <h3>{{ translate('Database') }}</h3>
          <span class="badge badge-info">{{ info.database.client }}</span>
        </div>
        <div class="card-body">
          <div class="database-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <ellipse cx="12" cy="5" rx="9" ry="3" opacity="0.3"/>
              <path d="M12 8c4.97 0 9-1.34 9-3V5c0 1.66-4.03 3-9 3S3 6.66 3 5v0c0 1.66 4.03 3 9 3z"/>
              <path d="M12 13c4.97 0 9-1.34 9-3v-0c0 1.66-4.03 3-9 3s-9-1.34-9-3v0c0 1.66 4.03 3 9 3z"/>
              <path d="M12 18c4.97 0 9-1.34 9-3v-0c0 1.66-4.03 3-9 3s-9-1.34-9-3v0c0 1.66 4.03 3 9 3z"/>
              <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" fill="none" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </div>
          <div class="info-list">
            <div class="info-row">
              <span class="label">{{ translate('Engine') }}</span>
              <span class="value">{{ info.database.client }}</span>
            </div>
            <div class="info-row">
              <span class="label">{{ translate('Version') }}</span>
              <span class="value version-badge">{{ info.database.version }}</span>
            </div>
            <div class="info-row" v-if="info.database.sizeFormatted">
              <span class="label">{{ translate('Size') }}</span>
              <span class="value">{{ info.database.sizeFormatted }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- System Info Card -->
      <div class="card">
        <div class="card-header">
          <h3>{{ translate('System') }}</h3>
        </div>
        <div class="card-body">
          <div class="info-list">
            <div class="info-row">
              <span class="label">{{ translate('Hostname') }}</span>
              <span class="value">{{ info.system.hostname }}</span>
            </div>
            <div class="info-row">
              <span class="label">{{ translate('Platform') }}</span>
              <span class="value">{{ getPlatformIcon(info.system.platform) }} {{ info.system.platform }} ({{ info.system.arch }})</span>
            </div>
            <div class="info-row">
              <span class="label">{{ translate('OS Type') }}</span>
              <span class="value">{{ info.system.type }}</span>
            </div>
            <div class="info-row">
              <span class="label">{{ translate('Release') }}</span>
              <span class="value">{{ info.system.release }}</span>
            </div>
            <div class="info-row">
              <span class="label">{{ translate('System Uptime') }}</span>
              <span class="value">{{ info.uptime.systemFormatted }}</span>
            </div>
            <div class="info-row">
              <span class="label">{{ translate('Temp Directory') }}</span>
              <span class="value small monospace">{{ info.system.tmpdir }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Versions Card -->
      <div class="card">
        <div class="card-header">
          <h3>{{ translate('Versions') }}</h3>
        </div>
        <div class="card-body">
          <div class="version-grid">
            <div class="version-item">
              <div class="version-icon node">
                <svg viewBox="0 0 24 24" width="32" height="32">
                  <path fill="#339933" d="M12 1.85c-.27 0-.55.07-.78.2l-7.44 4.3c-.48.28-.78.8-.78 1.36v8.58c0 .56.3 1.08.78 1.36l1.95 1.12c.95.46 1.27.46 1.71.46 1.4 0 2.21-.85 2.21-2.33V8.44c0-.12-.1-.22-.22-.22H8.5c-.13 0-.23.1-.23.22v8.47c0 .66-.68 1.31-1.77.76L4.45 16.5a.26.26 0 0 1-.12-.22V7.72c0-.09.05-.17.12-.21l7.44-4.3c.09-.05.2-.05.29 0l7.43 4.3c.08.04.13.12.13.21v8.56c0 .09-.05.18-.13.22l-7.43 4.3c-.08.05-.19.05-.28 0l-1.86-1.1c-.08-.05-.18-.05-.27-.01-.53.3-.62.34-1.12.51-.12.04-.3.11.07.32l2.43 1.44c.24.14.5.21.78.21.27 0 .54-.07.78-.21l7.43-4.3c.48-.28.78-.8.78-1.36V7.71c0-.56-.3-1.08-.78-1.36l-7.43-4.3c-.23-.13-.5-.2-.78-.2"/>
                </svg>
              </div>
              <div class="version-details">
                <span class="version-name">Node.js</span>
                <span class="version-number">{{ info.versions.node }}</span>
              </div>
            </div>
            <div class="version-item">
              <div class="version-icon v8">
                <svg viewBox="0 0 24 24" width="32" height="32">
                  <path fill="#4285F4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
              </div>
              <div class="version-details">
                <span class="version-name">V8 Engine</span>
                <span class="version-number">{{ info.versions.v8 }}</span>
              </div>
            </div>
            <div class="version-item">
              <div class="version-icon npm">
                <svg viewBox="0 0 24 24" width="32" height="32">
                  <path fill="#CB3837" d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z"/>
                </svg>
              </div>
              <div class="version-details">
                <span class="version-name">npm</span>
                <span class="version-number">{{ info.versions.npm }}</span>
              </div>
            </div>
          </div>
          <div class="info-row" style="margin-top: 15px;">
            <span class="label">{{ translate('Environment') }}</span>
            <span class="value">
              <span class="env-badge" :class="'env-' + info.environment.nodeEnv">
                {{ info.environment.nodeEnv }}
              </span>
            </span>
          </div>
        </div>
      </div>

      <!-- Network Card -->
      <div class="card" v-if="info.network && info.network.length > 0">
        <div class="card-header">
          <h3>{{ translate('Network Interfaces') }}</h3>
        </div>
        <div class="card-body">
          <div class="network-list">
            <div class="network-item" v-for="iface in info.network" :key="iface.name + iface.address">
              <div class="network-icon">🌐</div>
              <div class="network-details">
                <span class="network-name">{{ iface.name }}</span>
                <span class="network-address monospace">{{ iface.address }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Docker Info Card -->
      <div class="card" v-if="info.docker">
        <div class="card-header">
          <h3>{{ translate('Docker Container') }}</h3>
          <span class="badge badge-docker">
            <svg class="docker-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.186m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.119a.185.185 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-.037 2.715h2.118a.186.186 0 00.186-.185v-1.888a.185.185 0 00-.186-.186H2.166a.186.186 0 00-.186.186v1.888c0 .102.084.185.186.185m18.04-5.378c-.405-.203-.983-.345-1.719-.345-.536 0-.98.072-1.318.198-.346.13-.618.316-.82.554a1.9 1.9 0 00-.375.728c-.068.254-.102.534-.102.842 0 .35.055.666.165.95.11.283.277.524.501.722.224.198.504.35.84.457.336.107.726.16 1.17.16.493 0 .923-.07 1.288-.21.365-.14.67-.333.914-.58.244-.246.426-.536.546-.87.12-.332.18-.694.18-1.084 0-.408-.069-.78-.207-1.115a2.304 2.304 0 00-.596-.87 2.713 2.713 0 00-.934-.583l-.012-.004-.012-.004-.009-.004z"/>
            </svg>
            {{ translate('Container') }}
          </span>
        </div>
        <div class="card-body">
          <div class="docker-visual">
            <div class="docker-container-icon">
              <svg viewBox="0 0 24 24" width="64" height="64">
                <rect x="2" y="6" width="20" height="14" rx="2" fill="#0db7ed" opacity="0.2"/>
                <rect x="2" y="6" width="20" height="14" rx="2" fill="none" stroke="#0db7ed" stroke-width="1.5"/>
                <rect x="5" y="9" width="3" height="2" fill="#0db7ed"/>
                <rect x="9" y="9" width="3" height="2" fill="#0db7ed"/>
                <rect x="13" y="9" width="3" height="2" fill="#0db7ed"/>
                <rect x="5" y="12" width="3" height="2" fill="#0db7ed"/>
                <rect x="9" y="12" width="3" height="2" fill="#0db7ed"/>
                <rect x="13" y="12" width="3" height="2" fill="#0db7ed"/>
                <rect x="5" y="15" width="3" height="2" fill="#0db7ed"/>
                <rect x="9" y="15" width="3" height="2" fill="#0db7ed"/>
              </svg>
            </div>
          </div>
          <div class="info-list">
            <div class="info-row" v-if="info.docker.containerId">
              <span class="label">{{ translate('Container ID') }}</span>
              <span class="value monospace">{{ info.docker.containerId }}</span>
            </div>
            <div class="info-row">
              <span class="label">{{ translate('Hostname') }}</span>
              <span class="value monospace">{{ info.docker.hostname }}</span>
            </div>
            <div class="info-row" v-if="info.docker.image">
              <span class="label">{{ translate('Image') }}</span>
              <span class="value">{{ info.docker.image }}</span>
            </div>
            <div class="info-row" v-if="info.docker.memoryLimitFormatted">
              <span class="label">{{ translate('Memory Limit') }}</span>
              <span class="value">{{ info.docker.memoryLimitFormatted }}</span>
            </div>
            <div class="info-row" v-if="info.docker.effectiveCpus">
              <span class="label">{{ translate('CPU Limit') }}</span>
              <span class="value">{{ info.docker.effectiveCpus }} {{ translate('cores') }}</span>
            </div>
            <div class="info-row" v-if="info.docker.cpuShares && info.docker.cpuShares !== 1024">
              <span class="label">{{ translate('CPU Shares') }}</span>
              <span class="value">{{ info.docker.cpuShares }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Real-time Metrics Card -->
      <div class="card card-wide">
        <div class="card-header">
          <h3>{{ translate('Real-time Metrics') }}</h3>
          <div class="realtime-status">
            <span class="pulse-dot"></span>
            <span>{{ translate('Live') }} (2s)</span>
          </div>
        </div>
        <div class="card-body">
          <div class="metrics-grid">
            <div class="metric-chart">
              <div class="metric-header">
                <span class="metric-label">{{ translate('CPU Usage') }}</span>
                <span class="metric-value cpu">{{ latestMetrics.cpu || 0 }}%</span>
              </div>
              <div class="sparkline-container">
                <svg class="sparkline" viewBox="0 0 200 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#3498db" stop-opacity="0.3"/>
                      <stop offset="100%" stop-color="#3498db" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <path :d="getAreaPath(metricsHistory.cpu)" fill="url(#cpuGradient)" />
                  <polyline :points="getSparklinePoints(metricsHistory.cpu)" fill="none" stroke="#3498db" stroke-width="2" />
                </svg>
              </div>
            </div>
            <div class="metric-chart">
              <div class="metric-header">
                <span class="metric-label">{{ translate('Memory') }}</span>
                <span class="metric-value memory">{{ latestMetrics.memory || 0 }}%</span>
              </div>
              <div class="sparkline-container">
                <svg class="sparkline" viewBox="0 0 200 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#9b59b6" stop-opacity="0.3"/>
                      <stop offset="100%" stop-color="#9b59b6" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <path :d="getAreaPath(metricsHistory.memory)" fill="url(#memGradient)" />
                  <polyline :points="getSparklinePoints(metricsHistory.memory)" fill="none" stroke="#9b59b6" stroke-width="2" />
                </svg>
              </div>
            </div>
            <div class="metric-chart">
              <div class="metric-header">
                <span class="metric-label">{{ translate('Heap Used') }}</span>
                <span class="metric-value heap">{{ latestMetrics.heapUsed || 0 }}%</span>
              </div>
              <div class="sparkline-container">
                <svg class="sparkline" viewBox="0 0 200 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="heapGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#27ae60" stop-opacity="0.3"/>
                      <stop offset="100%" stop-color="#27ae60" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <path :d="getAreaPath(metricsHistory.heap)" fill="url(#heapGradient)" />
                  <polyline :points="getSparklinePoints(metricsHistory.heap)" fill="none" stroke="#27ae60" stroke-width="2" />
                </svg>
              </div>
            </div>
            <div class="metric-chart">
              <div class="metric-header">
                <span class="metric-label">{{ translate('Event Loop Lag') }}</span>
                <span class="metric-value lag" :class="{ 'text-warning': latestMetrics.eventLoopLag > 10, 'text-danger': latestMetrics.eventLoopLag > 50 }">
                  {{ latestMetrics.eventLoopLag?.toFixed(2) || 0 }} ms
                </span>
              </div>
              <div class="sparkline-container">
                <svg class="sparkline" viewBox="0 0 200 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lagGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#e67e22" stop-opacity="0.3"/>
                      <stop offset="100%" stop-color="#e67e22" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <path :d="getAreaPath(metricsHistory.lag, 100)" fill="url(#lagGradient)" />
                  <polyline :points="getSparklinePoints(metricsHistory.lag, 100)" fill="none" stroke="#e67e22" stroke-width="2" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Load Average Chart -->
          <div class="load-average-section" v-if="metricsHistory.loadAvg.length > 0">
            <h4>{{ translate('Load Average') }}</h4>
            <div class="load-values">
              <div class="load-value">
                <span class="load-period">1m</span>
                <span class="load-number">{{ latestMetrics.loadAvg?.[0]?.toFixed(2) || '0.00' }}</span>
              </div>
              <div class="load-value">
                <span class="load-period">5m</span>
                <span class="load-number">{{ latestMetrics.loadAvg?.[1]?.toFixed(2) || '0.00' }}</span>
              </div>
              <div class="load-value">
                <span class="load-period">15m</span>
                <span class="load-number">{{ latestMetrics.loadAvg?.[2]?.toFixed(2) || '0.00' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Resource Usage Card -->
      <div class="card" v-if="info.process.resourceUsage">
        <div class="card-header">
          <h3>{{ translate('Resource Usage') }}</h3>
        </div>
        <div class="card-body">
          <div class="resource-grid">
            <div class="resource-item">
              <span class="resource-label">{{ translate('User CPU Time') }}</span>
              <span class="resource-value">{{ formatMicroseconds(info.process.resourceUsage.userCPUTime) }}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">{{ translate('System CPU Time') }}</span>
              <span class="resource-value">{{ formatMicroseconds(info.process.resourceUsage.systemCPUTime) }}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">{{ translate('FS Reads') }}</span>
              <span class="resource-value">{{ info.process.resourceUsage.fsRead }}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">{{ translate('FS Writes') }}</span>
              <span class="resource-value">{{ info.process.resourceUsage.fsWrite }}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">{{ translate('IPC Sent') }}</span>
              <span class="resource-value">{{ info.process.resourceUsage.ipcSent }}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">{{ translate('IPC Received') }}</span>
              <span class="resource-value">{{ info.process.resourceUsage.ipcReceived }}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">{{ translate('Context Switches (V)') }}</span>
              <span class="resource-value">{{ info.process.resourceUsage.voluntaryContextSwitches }}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">{{ translate('Context Switches (I)') }}</span>
              <span class="resource-value">{{ info.process.resourceUsage.involuntaryContextSwitches }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!info && !loading && !error" class="empty-state">
      {{ translate('Click refresh to load system information') }}
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch'],
  data: () => ({
    info: null,
    loading: false,
    error: null,
    realtimeInterval: null,
    metricsHistory: {
      cpu: [],
      memory: [],
      heap: [],
      lag: [],
      loadAvg: []
    },
    latestMetrics: {},
    maxHistoryLength: 60
  }),
  computed: {
    getCpuBadgeClass() {
      if (!this.info) return ''
      if (this.info.cpu.usage > 80) return 'badge-danger'
      if (this.info.cpu.usage > 60) return 'badge-warning'
      return 'badge-success'
    },
    getMemoryBadgeClass() {
      if (!this.info) return ''
      if (this.info.memory.percentage > 85) return 'badge-danger'
      if (this.info.memory.percentage > 70) return 'badge-warning'
      return 'badge-success'
    },
    getDiskBadgeClass() {
      if (!this.info?.disk) return ''
      if (this.info.disk.percentage > 90) return 'badge-danger'
      if (this.info.disk.percentage > 75) return 'badge-warning'
      return 'badge-success'
    },
    getHeapPercentage() {
      if (!this.info) return 0
      return Math.round((this.info.process.memory.heapUsed / this.info.process.memory.heapTotal) * 100)
    },
    getRssPercentage() {
      if (!this.info) return 0
      const maxRss = this.info.memory.total * 0.5 // Assume 50% of total memory as max for visualization
      return Math.min(100, Math.round((this.info.process.memory.rss / maxRss) * 100))
    }
  },
  created() {
    this.refresh()
    this.startRealtime()
  },
  beforeUnmount() {
    this.stopRealtime()
  },
  methods: {
    async refresh() {
      this.loading = true
      this.error = null
      try {
        const res = await this.apiFetch(`${this.apiBase}/api/v1/system-info`)
        if (!res.ok) throw new Error('Failed to fetch system info')
        this.info = await res.json()
      } catch (e) {
        this.error = e.message || 'Failed to load system information'
      } finally {
        this.loading = false
      }
    },
    async fetchMetrics() {
      try {
        const res = await this.apiFetch(`${this.apiBase}/api/v1/system-info/metrics`)
        if (!res.ok) return
        const metrics = await res.json()
        this.latestMetrics = metrics

        this.metricsHistory.cpu.push(metrics.cpu)
        this.metricsHistory.memory.push(metrics.memory)
        this.metricsHistory.heap.push(metrics.heapUsed)
        this.metricsHistory.lag.push(metrics.eventLoopLag)
        this.metricsHistory.loadAvg.push(metrics.loadAvg)

        const keys = ['cpu', 'memory', 'heap', 'lag', 'loadAvg']
        for (const key of keys) {
          if (this.metricsHistory[key].length > this.maxHistoryLength) {
            this.metricsHistory[key].shift()
          }
        }
      } catch (e) {
        // Silently fail
      }
    },
    startRealtime() {
      this.fetchMetrics()
      this.realtimeInterval = setInterval(() => {
        this.fetchMetrics()
      }, 2000)
    },
    stopRealtime() {
      if (this.realtimeInterval) {
        clearInterval(this.realtimeInterval)
        this.realtimeInterval = null
      }
    },
    getCircleOffset(percentage) {
      const circumference = 2 * Math.PI * 50
      return circumference - (percentage / 100) * circumference
    },
    getSparklinePoints(data, maxValue = 100) {
      if (!data || data.length === 0) return '0,50 200,50'
      const points = data.map((value, index) => {
        const x = (index / (this.maxHistoryLength - 1)) * 200
        const y = 50 - (Math.min(value, maxValue) / maxValue) * 45
        return `${x},${y}`
      })
      return points.join(' ')
    },
    getAreaPath(data, maxValue = 100) {
      if (!data || data.length === 0) return 'M0,50 L200,50 L200,50 L0,50 Z'
      const points = data.map((value, index) => {
        const x = (index / (this.maxHistoryLength - 1)) * 200
        const y = 50 - (Math.min(value, maxValue) / maxValue) * 45
        return `${x},${y}`
      })
      const lastX = ((data.length - 1) / (this.maxHistoryLength - 1)) * 200
      return `M0,50 L${points.join(' L')} L${lastX},50 Z`
    },
    getCoreBarColor(usage) {
      if (usage > 80) return '#e74c3c'
      if (usage > 60) return '#f39c12'
      return '#27ae60'
    },
    getPlatformIcon(platform) {
      const icons = {
        darwin: '🍎',
        linux: '🐧',
        win32: '🪟',
        freebsd: '😈',
        android: '🤖'
      }
      return icons[platform] || '💻'
    },
    formatMicroseconds(us) {
      if (us < 1000) return `${us} µs`
      if (us < 1000000) return `${(us / 1000).toFixed(2)} ms`
      return `${(us / 1000000).toFixed(2)} s`
    }
  }
}
</script>

<style>
#system-info.container {
  max-width: 100%;
  padding: 20px 20px 50px;
}

#system-info .header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

#system-info h1 {
  font-size: 23px;
  font-weight: 500;
  margin: 0;
}

#system-info .refresh-button {
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

#system-info .refresh-button:hover {
  background-color: var(--color-primary-hover);
}

#system-info .refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#system-info .error-message {
  color: #e74c3c;
  padding: 15px;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 6px;
  margin-bottom: 20px;
}

#system-info .dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
}

#system-info .card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

#system-info .card-wide {
  grid-column: 1 / -1;
}

#system-info .card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
}

#system-info .card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

#system-info .card-body {
  padding: 20px;
}

#system-info .badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

#system-info .badge-success { background: #d4edda; color: #155724; }
#system-info .badge-warning { background: #fff3cd; color: #856404; }
#system-info .badge-danger { background: #f8d7da; color: #721c24; }
#system-info .badge-info { background: #d1ecf1; color: #0c5460; }

#system-info .text-warning { color: #f39c12 !important; }
#system-info .text-danger { color: #e74c3c !important; }

/* Cluster Visual */
#system-info .cluster-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

#system-info .cluster-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  border-radius: 8px;
  background: #f8f9fa;
  border: 2px solid #e0e0e0;
}

#system-info .cluster-node.primary {
  border-color: #f39c12;
  background: #fef9e7;
}

#system-info .cluster-node.worker {
  border-color: #3498db;
  background: #ebf5fb;
}

#system-info .cluster-workers {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

#system-info .node-icon { font-size: 24px; }
#system-info .node-label { font-weight: 600; font-size: 14px; margin-top: 5px; }
#system-info .node-pid { font-size: 12px; color: #666; }

/* Progress Ring */
#system-info .progress-ring-container {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 20px;
}

#system-info .progress-ring {
  transform: rotate(-90deg);
  width: 100%;
  height: 100%;
}

#system-info .progress-ring-bg {
  fill: none;
  stroke: #e9ecef;
  stroke-width: 10;
}

#system-info .progress-ring-fill {
  fill: none;
  stroke-width: 10;
  stroke-linecap: round;
  stroke-dasharray: 314.159;
  transition: stroke-dashoffset 0.5s ease;
}

#system-info .progress-ring-fill.cpu { stroke: #3498db; }
#system-info .progress-ring-fill.memory { stroke: #9b59b6; }
#system-info .progress-ring-fill.disk { stroke: #e67e22; }

#system-info .progress-ring-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 24px;
  font-weight: 700;
  color: #333;
}

/* Info Grid */
#system-info .info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

#system-info .info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

#system-info .info-item .label,
#system-info .info-row .label {
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
}

#system-info .info-item .value,
#system-info .info-row .value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

#system-info .info-item .value.small {
  font-size: 12px;
  font-weight: 500;
  word-break: break-word;
}

#system-info .info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#system-info .info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

#system-info .info-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

/* Core Bars */
#system-info .core-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#system-info .core-bar-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

#system-info .core-bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
}

#system-info .core-bar {
  height: 8px;
  background: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
}

#system-info .core-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* Memory Breakdown */
#system-info .memory-breakdown {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

#system-info .memory-bar-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

#system-info .memory-bar-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #666;
}

#system-info .stacked-bar {
  height: 10px;
  background: #e9ecef;
  border-radius: 5px;
  overflow: hidden;
}

#system-info .stacked-bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.3s ease;
}

#system-info .stacked-bar-fill.heap {
  background: linear-gradient(90deg, #27ae60, #2ecc71);
}

#system-info .stacked-bar-fill.rss {
  background: linear-gradient(90deg, #3498db, #5dade2);
}

/* Database */
#system-info .database-icon {
  text-align: center;
  color: #3498db;
  margin-bottom: 15px;
}

/* Versions */
#system-info .version-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 15px;
}

#system-info .version-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

#system-info .version-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

#system-info .version-details {
  display: flex;
  flex-direction: column;
}

#system-info .version-name {
  font-size: 12px;
  color: #666;
}

#system-info .version-number {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  font-family: monospace;
}

#system-info .version-badge {
  background: #e9ecef;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
}

#system-info .env-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

#system-info .env-development { background: #fff3cd; color: #856404; }
#system-info .env-production { background: #d4edda; color: #155724; }
#system-info .env-test { background: #d1ecf1; color: #0c5460; }

#system-info .monospace { font-family: monospace; }

/* Network */
#system-info .network-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#system-info .network-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
}

#system-info .network-icon { font-size: 20px; }

#system-info .network-details {
  display: flex;
  flex-direction: column;
}

#system-info .network-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

#system-info .network-address {
  font-size: 13px;
  color: #666;
}

/* Docker */
#system-info .badge-docker {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #e3f2fd;
  color: #0d47a1;
}

#system-info .docker-icon {
  display: block;
}

#system-info .docker-visual {
  display: flex;
  justify-content: center;
  margin-bottom: 15px;
}

#system-info .docker-container-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Realtime Metrics */
#system-info .realtime-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #27ae60;
  font-weight: 500;
}

#system-info .pulse-dot {
  width: 10px;
  height: 10px;
  background: #27ae60;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.6);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(39, 174, 96, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(39, 174, 96, 0);
  }
}

#system-info .metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

#system-info .metric-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

#system-info .metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#system-info .metric-label {
  font-size: 14px;
  font-weight: 600;
  color: #666;
}

#system-info .metric-value {
  font-size: 18px;
  font-weight: 700;
}

#system-info .metric-value.cpu { color: #3498db; }
#system-info .metric-value.memory { color: #9b59b6; }
#system-info .metric-value.heap { color: #27ae60; }
#system-info .metric-value.lag { color: #e67e22; }

#system-info .sparkline-container {
  height: 50px;
  background: #f8f9fa;
  border-radius: 4px;
  overflow: hidden;
}

#system-info .sparkline {
  width: 100%;
  height: 100%;
}

/* Load Average */
#system-info .load-average-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}

#system-info .load-average-section h4 {
  margin: 0 0 15px 0;
  font-size: 14px;
  font-weight: 600;
  color: #666;
}

#system-info .load-values {
  display: flex;
  gap: 30px;
}

#system-info .load-value {
  display: flex;
  flex-direction: column;
  align-items: center;
}

#system-info .load-period {
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
}

#system-info .load-number {
  font-size: 20px;
  font-weight: 700;
  color: #333;
}

/* Resource Grid */
#system-info .resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

#system-info .resource-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
}

#system-info .resource-label {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
}

#system-info .resource-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  font-family: monospace;
}

#system-info .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
  font-size: 16px;
}
</style>
