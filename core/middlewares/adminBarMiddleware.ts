import fs from 'fs/promises'
import path from 'path'
import type { Request, Response, NextFunction } from 'express'

interface AdminBarButton {
  id: string
  label: string
  icon?: string
  href?: string
  onClick?: string
  [key: string]: unknown
}

interface AdminBarButtonsRegistry {
  getButtons: () => AdminBarButton[]
  getCombinedScripts: () => string
}

interface RequestWithHooks extends Request {
  hooks?: {
    adminBarButtons?: AdminBarButtonsRegistry
    [key: string]: unknown
  }
}

interface ResponseWithAdminBar extends Response {
  _adminBarIntercepted?: boolean
}

let adminBarHTML: string | null = null
let adminBarCSS: string | null = null
let adminBarJS: string | null = null

// Load admin bar assets
const loadAdminBarAssets = async (): Promise<void> => {
  if (adminBarHTML && adminBarCSS && adminBarJS) return

  const basePath = path.resolve('./core/components/admin-bar')

  adminBarHTML = await fs.readFile(path.join(basePath, 'AdminBar.html'), 'utf-8')
  adminBarCSS = await fs.readFile(path.join(basePath, 'AdminBar.css'), 'utf-8')
  adminBarJS = await fs.readFile(path.join(basePath, 'AdminBar.js'), 'utf-8')
}

// Helper to inject admin bar into HTML
const injectAdminBar = (
  html: string | Buffer,
  customButtons: AdminBarButton[] = [],
  customScripts = ''
): string | Buffer => {
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
  const buttonsJSON = JSON.stringify(customButtons).replace(/`/g, '\\`').replace(/\$/g, '\\$')

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
const isHtmlContent = (contentType: string | undefined, chunk: unknown): boolean => {
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
export default async (req: RequestWithHooks, res: ResponseWithAdminBar, next: NextFunction): Promise<void> => {
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
  const performInjection = (data: string | Buffer): string | Buffer => {
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
  res.send = function (this: Response, data: unknown): Response {
    const contentType = res.get('Content-Type')
    let processedData = data
    if (isHtmlContent(contentType, data)) {
      processedData = performInjection(data as string | Buffer)
    }
    return originalSend.call(this, processedData)
  }

  // Override res.end() - use type assertion for complex overloaded signature
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(res as any).end = function (this: Response, ...args: any[]): Response {
    if (res.headersSent && args.length === 0) {
      return (originalEnd as any).call(this)
    }

    const [chunk, encodingOrCallback, callback] = args
    const contentType = res.get('Content-Type')
    let processedChunk = chunk
    if (chunk && isHtmlContent(contentType, chunk)) {
      processedChunk = performInjection(chunk as string | Buffer)
    }

    if (typeof encodingOrCallback === 'function') {
      return (originalEnd as any).call(this, processedChunk, encodingOrCallback)
    }

    return (originalEnd as any).call(this, processedChunk, encodingOrCallback, callback)
  }

  next()
}
