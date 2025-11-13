export default (router) => {
  let refreshPromise = null

  const apiFetch = async (url, options = {}, retry = true) => {
    const tokens = JSON.parse(localStorage.getItem('tokens') || '{}')
    const headers = new Headers(options.headers || {})

    let expired = false
    if (tokens?.accessToken) {
      expired = new Date(tokens.expiresAt) <= new Date()
      headers.set('Authorization', `Bearer ${tokens.accessToken}`)
    }

    let response = await fetch(url, { ...options, headers })

    // Handle expired token
    if (!response.ok && (response.status === 401 || expired) && retry && tokens?.refreshToken) {
      // If a refresh is in progress, wait for it
      if (refreshPromise) {
        try {
          await refreshPromise
          return apiFetch(url, options, false)
        } catch (e) {
          // if refresh failed while we waited
          router.push('/login')
          throw e
        }
      }

      // Start a new refresh (atomic assignment before awaiting)
      refreshPromise = (async () => {
        try {
          const refreshResponse = await fetch(`${import.meta.env.VITE_API_BASE}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: tokens.refreshToken })
          })

          if (!refreshResponse.ok) {
            const status = refreshResponse.status
            const statusText = refreshResponse.statusText

            throw new Error(`Refresh failed: ${status} ${statusText}`)
          }

          const newTokens = await refreshResponse.json()
          localStorage.setItem('tokens', JSON.stringify(newTokens))
          return newTokens
        } finally {
          // delay clearing until all waiters resume
          setTimeout(() => {
            refreshPromise = null
          }, 0)
        }
      })()

      try {
        await refreshPromise
      } catch (e) {
        // Refresh failed
      } finally {
        // Retrying request in case tokens changed in storage
        try {
          response = await apiFetch(url, options, false)
        } catch (e) {
          localStorage.removeItem('tokens')
          router.push('/login')
        }
      }
    }

    return response
  }

  return apiFetch
}
