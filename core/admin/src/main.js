import { createApp, ref, computed } from 'vue'
import App from './App.vue'
import router from './router/router.js'
import apiFetch from './utils/apiFetch.js'
import createTokenRefreshManager from './utils/tokenRefresh.js'

const getUser = () => {
  try {
    const userTokens = localStorage.getItem('tokens')
    tokens.value = JSON.parse(userTokens)
    const token = tokens.value?.accessToken
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${  (`00${  c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    )
    const obj = JSON.parse(jsonPayload)
    obj.id = obj.sub
    delete obj.sub
    return obj
  } catch (e) {
    return null
  }
}

const tokensJSON = localStorage.getItem('tokens')
const tokens = ref(tokensJSON ? JSON.parse(tokensJSON) : {})
const app = createApp(App)
const navTree = ref([])
const controls = ref()
const user = ref(getUser())

// Set up automatic token refresh (refreshes 10 minutes before expiration)
const tokenRefreshManager = createTokenRefreshManager(() => {
  user.value = getUser()
})

app.use(router)

app.provide('apiFetch', apiFetch(router))
app.provide('apiBase', import.meta.env.VITE_API_BASE)
app.provide(
  'user',
  computed(() => user.value)
)
app.provide('reloadUser', () => {
  user.value = getUser()
  tokenRefreshManager.resetTimer()
})

app.provide('navTree', computed(() => navTree.value))
app.provide('tokens', computed(() => tokens.value))
app.provide('updateNavTree', async (tree) => {
  for (const branch of (tree?.filter((b) => !navTree.value.some((bb) => b.slug === bb.slug)) || [])) {
    const blob = new Blob([branch.vue_instance], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const mod = await import(url)
    if (mod.default) {
      app.component(`drop-${branch.slug}`, mod.default)
    }
    for (const child of branch.children || []) {
      const blobChild = new Blob([child.vue_instance], { type: 'application/javascript' })
      const childUrl = URL.createObjectURL(blobChild)
      const childMod = await import(childUrl)
      if (childMod.default) {
        app.component(`drop-${branch.slug}-${child.slug || 'index'}`, childMod.default)
      }
    }
  }
  navTree.value = tree
})
app.provide(
  'controls',
  computed(() => controls.value)
)
app.provide('updateControls', async (ctrls) => {
  for (const control of ctrls) {
    const blob = new Blob([control.vue_instance], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const mod = await import(url)
    if (mod.default) {
      app.component(`drop-control-${control.slug}`, mod.default)
    }
  }
  controls.value = ctrls
})
app.provide('getControl', (type) => {
  type = type.replaceAll('_', '').toLowerCase().trim()
  const control = controls.value?.find((c) => c.slug === type)
  if (!control) return 'textarea'
  return `drop-control-${  control.slug}`
})

app.mount('#app')
