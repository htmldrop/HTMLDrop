import fs from 'fs'
import path from 'path'
import RegisterAdminMenu from './RegisterAdminMenu.mjs'
import RegisterControls from './RegisterControls.mjs'
import RegisterPostTypes from './RegisterPostTypes.mjs'
import RegisterTaxonomies from './RegisterTaxonomies.mjs'
import RegisterThemes from './RegisterThemes.mjs'
import RegisterPlugins from './RegisterPlugins.mjs'

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
      plugins: new RegisterPlugins(req, res, next)
    }

    // Attach registry methods
    for (const registry of Object.values(this.registries)) {
      for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(registry))) {
        if (key !== 'constructor' && typeof registry[key] === 'function') {
          // Don’t overwrite existing hooks
          if (!this.req.hooks[key]) {
            this.req.hooks[key] = registry[key].bind(registry)
          }
        }
      }
    }
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
    // Dynamically load provider modules
    const providersDir = path.resolve('./hd-core/providers')
    if (fs.existsSync(providersDir)) {
      const folders = fs
        .readdirSync(providersDir, { withFileTypes: true })
        .filter((f) => f.isDirectory())
        .map((f) => f.name)

      for (const folder of folders) {
        const indexPath = path.join(providersDir, folder, 'index.mjs')
        if (fs.existsSync(indexPath)) {
          try {
            const mod = await import(indexPath)
            if (typeof mod.default === 'function') {
              await mod.default.call(
                { req: this.req, res: this.res, next: this.next },
                { req: this.req, res: this.res, next: this.next }
              )
            }
          } catch (err) {
            console.error(`Failed to load provider ${folder}:`, err)
          }
        }
      }
    }

    for (const key of Object.keys(this.registries)) {
      if (typeof this.registries[key].init === 'function') {
        await this.registries[key].init()
      }
    }

    // 🔥 fire the init action so plugins can hook in
    this.doAction('init', this)
  }
}
