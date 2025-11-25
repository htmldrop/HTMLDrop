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
const injectAdminBar = (html) => {
  // Convert Buffer to string if needed
  let htmlString = html
  if (Buffer.isBuffer(html)) {
    htmlString = html.toString('utf-8')
  }

  // Only inject if it's a string with </head> tag
  if (typeof htmlString !== 'string' || !htmlString.includes('</head>')) {
    return html
  }

  const injection = `
<style>${adminBarCSS}</style>
<script type="module">
  ${adminBarJS}

  const html = \`${adminBarHTML}\`

  init(html)
</script>
</head>`

  const result = htmlString.replace('</head>', injection)

  // Return in the same format as input (Buffer or string)
  return Buffer.isBuffer(html) ? Buffer.from(result, 'utf-8') : result
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

  // Store original response methods
  const originalSend = res.send
  const originalEnd = res.end

  // Override res.send()
  res.send = function (data) {
    // Only inject into HTML responses
    const contentType = res.get('Content-Type')
    if (contentType && contentType.includes('text/html')) {
      data = injectAdminBar(data)
    }
    return originalSend.call(this, data)
  }

  // Override res.end()
  res.end = function (chunk, encoding) {
    // Skip if already sent
    if (res.headersSent && arguments.length === 0) {
      return originalEnd.call(this)
    }

    // Check if it's an HTML response
    const contentType = res.get('Content-Type')
    const isHtml = contentType && contentType.includes('text/html')

    // Also check if chunk looks like HTML (has <!DOCTYPE html> or <body> tag)
    let chunkString = chunk
    if (Buffer.isBuffer(chunk)) {
      chunkString = chunk.toString('utf-8')
    }

    const looksLikeHtml =
      typeof chunkString === 'string' && (chunkString.includes('<!DOCTYPE html>') || chunkString.includes('<body'))

    // Inject if content-type is HTML OR if it looks like HTML
    if (chunk && (isHtml || looksLikeHtml)) {
      chunk = injectAdminBar(chunk)
    }

    return originalEnd.call(this, chunk, encoding)
  }

  next()
}
