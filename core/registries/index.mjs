import fs from 'fs'
import path from 'path'
import RegisterAdminMenu from './RegisterAdminMenu.mjs'
import RegisterControls from './RegisterControls.mjs'
import RegisterPostTypes from './RegisterPostTypes.mjs'
import RegisterTaxonomies from './RegisterTaxonomies.mjs'
import RegisterThemes from './RegisterThemes.mjs'
import RegisterPlugins from './RegisterPlugins.mjs'
import RegisterJobs from './RegisterJobs.mjs'
import RegisterEmailProviders from './RegisterEmailProviders.mjs'
import RegisterAdminBarButtons from './RegisterAdminBarButtons.mjs'
import * as emailHelper from '../utils/email-helper.ts'
import { TraceCategory } from '../services/PerformanceTracer.mjs'

export default class Registry {
  constructor(req, res, next) {
    this.req = req
    this.res = res
    this.next = next

    this.req.hooks = {}

    // Global actions/filters maps
    this.actions = {}
    this.filters = {}

    // Attach this registry’s own global methods
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      if (key !== 'constructor' && typeof this[key] === 'function') {
        if (!this.req.hooks[key]) {
          this.req.hooks[key] = this[key].bind(this)
        }
      }
    }

    // Instantiate registries
    this.registries = {
      adminMenu: new RegisterAdminMenu(req, res, next),
      controls: new RegisterControls(req, res, next),
      postTypes: new RegisterPostTypes(req, res, next),
      themes: new RegisterThemes(req, res, next),
      taxonomies: new RegisterTaxonomies(req, res, next),
      plugins: new RegisterPlugins(req, res, next),
      jobs: new RegisterJobs(req.context),
      emailProviders: new RegisterEmailProviders(req.context),
      adminBarButtons: new RegisterAdminBarButtons(req, res, next)
    }

    // Attach registry objects for direct access
    for (const [name, registry] of Object.entries(this.registries)) {
      this.req.hooks[name] = registry
    }

    // Attach registry methods
    for (const [name, registry] of Object.entries(this.registries)) {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(registry))
      for (const key of methods) {
        if (key !== 'constructor' && typeof registry[key] === 'function') {
          // Don't overwrite existing hooks
          if (!this.req.hooks[key]) {
            this.req.hooks[key] = registry[key].bind(registry)
          }
        }
      }
    }

    // Attach email helper functions
    this.req.hooks.sendEmail = (options) => emailHelper.sendEmail(this.req.context, options)
    this.req.hooks.sendWelcomeEmail = (user) => emailHelper.sendWelcomeEmail(this.req.context, user)
    this.req.hooks.sendPasswordResetEmail = (user, token, expiry) =>
      emailHelper.sendPasswordResetEmail(this.req.context, user, token, expiry)
    this.req.hooks.sendTemplateEmail = (to, templateFn, data) =>
      emailHelper.sendTemplateEmail(this.req.context, to, templateFn, data)
    this.req.hooks.verifyEmailConnection = () => emailHelper.verifyEmailConnection(this.req.context)
  }

  // ----------------------
  // Global actions/filters
  // ----------------------
  addAction(hookName, callback, priority = 10) {
    if (!this.actions[hookName]) this.actions[hookName] = []
    this.actions[hookName].push({ callback, priority })
    this.actions[hookName].sort((a, b) => a.priority - b.priority)
  }

  doAction(hookName, ...args) {
    if (!this.actions[hookName]) return
    this.actions[hookName].forEach((action) => action.callback(...args))
  }

  addFilter(hookName, callback, priority = 10) {
    if (!this.filters[hookName]) this.filters[hookName] = []
    this.filters[hookName].push({ callback, priority })
    this.filters[hookName].sort((a, b) => a.priority - b.priority)
  }

  applyFilters(hookName, value, ...args) {
    if (!this.filters[hookName]) return value
    return this.filters[hookName].reduce((val, filter) => filter.callback(val, ...args), value)
  }

  // ----------------------
  // Global helper functions
  // ----------------------
  theExcerpt(post, length = 55) {
    let excerpt = post.excerpt || ''

    if (!excerpt && post.content) {
      const stripped = post.content
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const words = stripped.split(' ').slice(0, length)
      excerpt = words.join(' ')
      if (words.length === length) excerpt += '…'
    }

    return this.applyFilters('the_excerpt', excerpt, post)
  }

  getAttachmentUrl(attachmentIdorSlug) {
    const { knex, table } = this.req.context

    // Simple async helper since DB queries are async
    const getUrl = async () => {
      const post = await knex(table('posts'))
        .where('post_type_slug', 'attachments')
        .andWhere((builder) => builder.where('id', attachmentIdorSlug).orWhere('slug', attachmentIdorSlug))
        .first()
      if (!post) return null

      const meta = await knex(table('post_meta')).where('post_id', post.id).andWhere('field_slug', 'file').first()

      if (!meta) return null

      const fileData = JSON.parse(meta.value)
      if (!fileData?.path) return null

      // Return a relative URL (or full URL if you have a base)
      // Example: "/uploads/2025/10/myfile.png"
      const origin = `${this.req.protocol}://${this.req.get('host')}`
      return `${origin}/uploads/${fileData.path.replace(/\\/g, '/')}`
    }

    return getUrl()
  }

  // ----------------------
  // Init providers
  // ----------------------
  async init() {
    const tracer = this.req.tracer

    // Trace providers loading
    const providersSpan = tracer?.startSpan('providers.init', {
      category: TraceCategory.CORE
    })

    // Dynamically load provider modules
    const providersDir = path.resolve('./core/providers')
    if (fs.existsSync(providersDir)) {
      const folders = fs
        .readdirSync(providersDir, { withFileTypes: true })
        .filter((f) => f.isDirectory())
        .map((f) => f.name)

      providersSpan?.addTag('providerCount', folders.length)

      for (const folder of folders) {
        const indexPath = path.join(providersDir, folder, 'index.mjs')
        if (fs.existsSync(indexPath)) {
          const providerSpan = tracer?.startSpan(`providers.load.${folder}`, {
            category: TraceCategory.CORE,
            tags: { provider: folder }
          })

          try {
            const mod = await import(indexPath)
            if (typeof mod.default === 'function') {
              await mod.default.call(
                { req: this.req, res: this.res, next: this.next },
                { req: this.req, res: this.res, next: this.next }
              )
            }
            providerSpan?.end()
          } catch (err) {
            console.error(`Failed to load provider ${folder}:`, err)
            providerSpan?.end({ error: err })
          }
        }
      }
    }

    providersSpan?.end()

    // Trace registries initialization
    const registriesSpan = tracer?.startSpan('registries.init', {
      category: TraceCategory.CORE,
      tags: { registryCount: Object.keys(this.registries).length }
    })

    for (const key of Object.keys(this.registries)) {
      if (typeof this.registries[key].init === 'function') {
        const regSpan = tracer?.startSpan(`registries.init.${key}`, {
          category: TraceCategory.CORE,
          tags: { registry: key }
        })
        await this.registries[key].init()
        regSpan?.end()
      }
    }

    registriesSpan?.end()

    // Mark plugins as initialized and start scheduler (only once per worker)
    if (this.req.context.onPluginsInitialized) {
      this.req.context.onPluginsInitialized()
    }

    // 🔥 fire the init action so plugins can hook in
    const hookSpan = tracer?.startSpan('hooks.init', {
      category: TraceCategory.HOOK
    })
    this.doAction('init', this)
    hookSpan?.end()
  }
}
