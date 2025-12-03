#!/usr/bin/env node
/**
 * Process Supervisor
 *
 * Lightweight supervisor that manages the main application process.
 * Handles graceful restarts when core code changes without downtime.
 * Similar to PM2 but built-in and minimal.
 */

import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_PATH = path.join(__dirname, 'index.ts')

let child = null
let isRestarting = false

/**
 * Start the application process
 */
function startApp() {
  console.log('[Supervisor] Starting application...')

  child = spawn('node', [APP_PATH], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: process.env
  })

  child.on('message', (message) => {
    // Listen for restart requests from the app
    if (message.type === 'request_supervisor_restart') {
      console.log('[Supervisor] Restart requested by application')
      gracefulRestart()
    }
  })

  child.on('exit', (code, signal) => {
    if (isRestarting) {
      console.log('[Supervisor] Old process exited, starting new process...')
      isRestarting = false
      startApp()
    } else {
      console.log(`[Supervisor] Application exited with code ${code} and signal ${signal}`)

      // Auto-restart on crash (unless it's a clean exit)
      if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
        console.log('[Supervisor] Restarting application after crash...')
        setTimeout(startApp, 1000)
      } else {
        console.log('[Supervisor] Clean exit, shutting down supervisor')
        process.exit(code || 0)
      }
    }
  })

  console.log(`[Supervisor] Application started with PID ${child.pid}`)
}

/**
 * Gracefully restart the application
 */
function gracefulRestart() {
  if (isRestarting) {
    console.log('[Supervisor] Restart already in progress')
    return
  }

  console.log('[Supervisor] Initiating graceful restart...')
  isRestarting = true

  // Send restart signal to the app (will trigger zero-downtime worker reload)
  if (child && child.connected) {
    child.send({ type: 'restart_workers' })
  }

  // Give app time to reload workers, then restart the primary process
  setTimeout(() => {
    console.log('[Supervisor] Restarting primary process...')

    if (child && !child.killed) {
      // Send SIGTERM for graceful shutdown
      child.kill('SIGTERM')

      // Force kill after 5 seconds if not exited
      setTimeout(() => {
        if (child && !child.killed) {
          console.log('[Supervisor] Force killing unresponsive process')
          child.kill('SIGKILL')
        }
      }, 5000)
    }
  }, 2000)
}

/**
 * Handle supervisor shutdown
 */
function shutdown() {
  console.log('[Supervisor] Shutting down...')

  if (child && !child.killed) {
    child.kill('SIGTERM')

    setTimeout(() => {
      if (child && !child.killed) {
        child.kill('SIGKILL')
      }
      process.exit(0)
    }, 5000)
  } else {
    process.exit(0)
  }
}

// Handle supervisor signals
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// Start the application
console.log('[Supervisor] HTMLDrop Process Supervisor starting...')
startApp()
