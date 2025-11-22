/**
 * Automatic token refresh utility
 * Refreshes access token 10 minutes before expiration
 */
export default function createTokenRefreshManager(callback) {
  let timeoutId = null
  let isRefreshing = false
  let storageListener = null
  let originalSetItem = null

  const REFRESH_BUFFER_MS = 10 * 60 * 1000 // 10 minutes in milliseconds

  /**
   * Gets the tokens from localStorage
   */
  const getTokens = () => {
    try {
      const tokens = localStorage.getItem('tokens')
      return tokens ? JSON.parse(tokens) : null
    } catch (e) {
      console.error('Failed to parse tokens from localStorage:', e)
      return null
    }
  }

  /**
   * Refreshes the access token using the refresh token
   */
  const refreshToken = async () => {
    if (isRefreshing) {
      return
    }

    isRefreshing = true

    try {
      const tokens = getTokens()
      if (!tokens?.refreshToken) {
        console.warn('No refresh token available')
        return
      }

      const refreshResponse = await fetch(`${import.meta.env.VITE_API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken })
      })

      if (!refreshResponse.ok) {
        throw new Error(`Refresh failed: ${refreshResponse.status} ${refreshResponse.statusText}`)
      }

      const newTokens = await refreshResponse.json()
      localStorage.setItem('tokens', JSON.stringify(newTokens))

      // Call the callback with new tokens
      if (callback) {
        callback(newTokens)
      }

      // Schedule next refresh
      scheduleRefresh()
    } catch (e) {
      console.error('Token refresh failed:', e)
      // Clear tokens on failure
      localStorage.removeItem('tokens')
    } finally {
      isRefreshing = false
    }
  }

  /**
   * Calculates when the token should be refreshed (10 minutes before expiration)
   */
  const getRefreshTimeout = () => {
    const tokens = getTokens()
    if (!tokens?.expiresAt) {
      return null
    }

    const expiresAt = new Date(tokens.expiresAt).getTime()
    const now = Date.now()
    const timeUntilExpiry = expiresAt - now
    const timeUntilRefresh = timeUntilExpiry - REFRESH_BUFFER_MS

    // If already expired or about to expire, refresh immediately
    if (timeUntilRefresh <= 0) {
      return 0
    }

    return timeUntilRefresh
  }

  /**
   * Schedules the next token refresh
   */
  const scheduleRefresh = () => {
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    const timeout = getRefreshTimeout()
    if (timeout === null) {
      return
    }

    timeoutId = setTimeout(() => {
      refreshToken()
    }, timeout)
  }

  /**
   * Resets the refresh timer (call this when token is updated externally)
   */
  const resetTimer = () => {
    scheduleRefresh()
  }

  /**
   * Sets up localStorage monitoring for token updates
   */
  const setupStorageMonitoring = () => {
    // Listen for cross-tab storage changes
    storageListener = (e) => {
      if (e.key === 'tokens') {
        if (callback) {
          callback(getTokens())
        }
        resetTimer()
      }
    }
    window.addEventListener('storage', storageListener)

    // Intercept localStorage.setItem for same-window updates
    originalSetItem = localStorage.setItem
    localStorage.setItem = function(key, value) {
      const oldValue = localStorage.getItem(key)
      originalSetItem.apply(this, arguments)

      if (key === 'tokens' && value !== oldValue) {
        if (callback) {
          callback(getTokens())
        }
        resetTimer()
      }
    }
  }

  /**
   * Removes localStorage monitoring
   */
  const cleanupStorageMonitoring = () => {
    if (storageListener) {
      window.removeEventListener('storage', storageListener)
      storageListener = null
    }

    if (originalSetItem) {
      localStorage.setItem = originalSetItem
      originalSetItem = null
    }
  }

  /**
   * Stops the automatic refresh and cleans up
   */
  const stop = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    cleanupStorageMonitoring()
  }

  /**
   * Starts the automatic refresh and monitoring
   */
  const start = () => {
    setupStorageMonitoring()
    scheduleRefresh()
  }

  // Start on creation
  start()

  return {
    start,
    stop,
    resetTimer,
    refreshToken
  }
}
