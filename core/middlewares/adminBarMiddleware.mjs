import fs from 'fs/promises'
import path from 'path'

let adminBarHTML = null
let adminBarCSS = null
let adminBarJS = null

// Load admin bar assets
const loadAdminBarAssets = async () => {
  if (adminBarHTML && adminBarCSS && adminBarJS) return

  const basePath = path.resolve('./core/components/admin-bar')

  adminBarHTML = await fs.readFile(path.join(basePath, 'AdminBar.html'), 'utf-8')
  adminBarCSS = await fs.readFile(path.join(basePath, 'AdminBar.css'), 'utf-8')
  adminBarJS = await fs.readFile(path.join(basePath, 'AdminBar.js'), 'utf-8')
}

// Helper to inject admin bar into HTML
const injectAdminBar = (html, customButtons = [], customScripts = '') => {

  // Convert Buffer to string if needed
  let htmlString = html
  if (Buffer.isBuffer(html)) {
    htmlString = html.toString('utf-8')
  }

  // Only inject if it's a string with </head> tag
  if (typeof htmlString !== 'string' || !htmlString.includes('</head>')) {
    return html
  }

  // Serialize custom buttons as JSON (escape backticks and dollar signs for template literal safety)
  const buttonsJSON = JSON.stringify(customButtons)
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')

  const injection = `
<style>${adminBarCSS}</style>
<script type="module">
  ${adminBarJS}

  const html = \`${adminBarHTML}\`
  const customButtons = ${buttonsJSON}

  // Execute custom scripts from plugins/themes
  ${customScripts}

  init(html, customButtons)
</script>
</head>`

  const result = htmlString.replace('</head>', injection)

  // Return in the same format as input (Buffer or string)
  return Buffer.isBuffer(html) ? Buffer.from(result, 'utf-8') : result
}

// Helper to check if content is HTML
const isHtmlContent = (contentType, chunk) => {
  // Check Content-Type header
  if (contentType && contentType.includes('text/html')) {
    return true
  }

  // Check if content looks like HTML
  if (chunk) {
    const str = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk
    if (typeof str === 'string' && (str.includes('<!DOCTYPE html>') || str.includes('<body'))) {
      return true
    }
  }

  return false
}

// Middleware to inject admin bar into HTML responses
export default async (req, res, next) => {
  // Load assets on first request
  await loadAdminBarAssets()

  // Only intercept once per request
  if (res._adminBarIntercepted) {
    return next()
  }
  res._adminBarIntercepted = true

  // Track if we've already injected to prevent double injection
  let injected = false

  // Store original response methods
  const originalSend = res.send
  const originalEnd = res.end

  // Helper to perform injection
  const performInjection = (data) => {
    if (injected) return data

    try {
      const buttons = req.hooks?.adminBarButtons?.getButtons() || []
      const scripts = req.hooks?.adminBarButtons?.getCombinedScripts() || ''
      injected = true
      return injectAdminBar(data, buttons, scripts)
    } catch (e) {
      console.error('[AdminBar] Injection failed:', e)
      return data
    }
  }

  // Override res.send()
  res.send = function (data) {
    const contentType = res.get('Content-Type')
    if (isHtmlContent(contentType, data)) {
      data = performInjection(data)
    }
    return originalSend.call(this, data)
  }

  // Override res.end()
  res.end = function (chunk, encoding) {
    if (res.headersSent && arguments.length === 0) {
      return originalEnd.call(this)
    }

    const contentType = res.get('Content-Type')
    if (chunk && isHtmlContent(contentType, chunk)) {
      chunk = performInjection(chunk)
    }

    return originalEnd.call(this, chunk, encoding)
  }

  next()
}
