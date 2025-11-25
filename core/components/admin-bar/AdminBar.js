// Refresh token if needed
async function refreshTokenIfNeeded() {
  try {
    const tokensRaw = localStorage.getItem('tokens')
    if (!tokensRaw) return false

    const tokens = JSON.parse(tokensRaw)
    const { accessToken, refreshToken } = tokens

    if (!accessToken || !refreshToken) return false

    // Parse JWT to check expiration
    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    const now = Math.floor(Date.now() / 1000)

    // If token is still valid, return true
    if (payload.exp > now) {
      return true
    }

    // Token expired, try to refresh
    const refreshResponse = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })

    if (!refreshResponse.ok) {
      // Refresh failed, clear tokens
      localStorage.removeItem('tokens')
      return false
    }

    const newTokens = await refreshResponse.json()
    localStorage.setItem('tokens', JSON.stringify(newTokens))
    return true
  } catch (e) {
    localStorage.removeItem('tokens')
    return false
  }
}

// Check if user is logged in by checking localStorage
function isLoggedIn() {
  try {
    const tokensRaw = localStorage.getItem('tokens')
    const tokens = JSON.parse(tokensRaw)
    const { accessToken } = tokens
    if (!accessToken) return false

    // Parse JWT to check expiration
    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    const now = Math.floor(Date.now() / 1000)

    // Check if token is expired
    return payload.exp > now
  } catch (e) {
    return false
  }
}

// Get user info from token
function getUserInfo() {
  try {
    const tokensRaw = localStorage.getItem('tokens')
    const tokens = JSON.parse(tokensRaw)
    const { accessToken } = tokens
    if (!accessToken) return null

    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    return {
      email: payload.email || 'User',
      id: payload.sub,
      locale: payload.locale || 'en_US'
    }
  } catch (e) {
    return null
  }
}

// Translation system
let translations = {}
const fallbackLoc = 'en_US'

async function getTranslations(locale) {
  try {
    const response = await fetch(`/api/v1/translations/${locale || fallbackLoc}`)
    translations = await response.json()
  } catch (e) {
    console.error('Failed to load translations:', e)
    translations = {}
  }
}

function translate(str, locale) {
  if (translations?.[locale]?.[str]) {
    return translations[locale][str]
  } else if (translations?.[fallbackLoc]?.[str]) {
    return translations[fallbackLoc][str]
  }
  return str
}

function applyTranslations(locale) {
  const elements = document.querySelectorAll('[data-i18n]')
  for (const element of elements) {
    const key = element.getAttribute('data-i18n')
    element.textContent = translate(key, locale)
  }
}

// Show admin bar
async function showAdminBar() {
  const adminBar = document.getElementById('htmldrop-admin-bar')
  if (!adminBar) return

  const userInfo = getUserInfo()
  if (!userInfo) return

  // Load translations
  await getTranslations(userInfo.locale)
  applyTranslations(userInfo.locale)

  const userElements = document.querySelectorAll('.user-email')
  for (const userElement of [...userElements]) {
    if (userElement) {
      userElement.textContent = userInfo.email
    }
  }
  const userLinks = document.querySelectorAll('.user-link')
  for (const userlink of [...userLinks]) {
    if (userlink) {
      userlink.setAttribute('href', `/admin/users/${  userInfo.id}`)
    }
  }

  adminBar.style.display = 'flex'
  document.documentElement.classList.add('htmldrop-admin-bar-visible')
  document.body.classList.add('htmldrop-admin-bar-visible')
}

// Handle logout
async function handleLogout(e) {
  e.preventDefault()

  try {
    const tokensRaw = localStorage.getItem('tokens')
    const tokens = JSON.parse(tokensRaw)
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    })
  } catch (e) {
    console.error(e)
  }
  localStorage.removeItem('tokens')

  // Reload the page to hide admin bar
  window.location.reload()
}

// Initialize admin bar
async function init(html = '') {
  document.body.insertAdjacentHTML('beforeend', html)

  // Try to refresh token if expired
  const authenticated = await refreshTokenIfNeeded()

  if (authenticated) {
    requestAnimationFrame(async () => {
      await showAdminBar()

      // Add logout handler
      const logoutButton = document.getElementById('logout-button')
      if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout)
      }
    })
  }
}
