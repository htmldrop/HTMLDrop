import fs from 'fs'
import path from 'path'
import RegisterAdminMenu from './RegisterAdminMenu.ts'
import RegisterControls from './RegisterControls.ts'
import RegisterPostTypes from './RegisterPostTypes.ts'
import RegisterTaxonomies from './RegisterTaxonomies.ts'
import RegisterThemes from './RegisterThemes.ts'
import RegisterPlugins from './RegisterPlugins.ts'
import RegisterJobs from './RegisterJobs.ts'
import RegisterEmailProviders from './RegisterEmailProviders.ts'
import RegisterAdminBarButtons from './RegisterAdminBarButtons.ts'
import * as emailHelper from '../utils/email-helper.ts'
import { TraceCategory } from '../services/PerformanceTracer.ts'
import type { Request, Response, NextFunction } from 'express'
import type { Knex } from 'knex'

interface ExtendedRequest extends Request {
  hooks: any
  context: HTMLDrop.Context
  guard?: any
  user?: { locale?: string }
  tracer?: any
  protocol: string
}

interface ActionCallback {
  callback: (...args: any[]) => void
  priority: number
}

interface FilterCallback {
  callback: (value: any, ...args: any[]) => any
  priority: number
}

interface Registries {
  adminMenu: RegisterAdminMenu
  controls: RegisterControls
  postTypes: RegisterPostTypes
  themes: InstanceType<typeof RegisterThemes>
  taxonomies: RegisterTaxonomies
  plugins: InstanceType<typeof RegisterPlugins>
  jobs: RegisterJobs
  emailProviders: RegisterEmailProviders
  adminBarButtons: RegisterAdminBarButtons
  [key: string]: any
}

export default class Registry {
  private req: ExtendedRequest
  private res: Response
  private next: NextFunction
  private actions: Record<string, ActionCallback[]>
  private filters: Record<string, FilterCallback[]>
  public registries: Registries

  constructor(req: ExtendedRequest, res: Response, next: NextFunction) {
    this.req = req
    this.res = res
    this.next = next

    this.req.hooks = {}

    // Global actions/filters maps
    this.actions = {}
    this.filters = {}

    // Attach this registry's own global methods
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      if (key !== 'constructor' && typeof (this as any)[key] === 'function') {
        if (!this.req.hooks[key]) {
          this.req.hooks[key] = (this as any)[key].bind(this)
        }
      }
    }

    // Instantiate registries
    this.registries = {
      adminMenu: new RegisterAdminMenu(req as any, res, next),
      controls: new RegisterControls(req as any, res, next),
      postTypes: new RegisterPostTypes(req as any, res, next),
      themes: new RegisterThemes(req as any, res, next),
      taxonomies: new RegisterTaxonomies(req as any, res, next),
      plugins: new RegisterPlugins(req as any, res, next),
      jobs: new RegisterJobs(req.context as any),
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
        if (key !== 'constructor' && typeof (registry as any)[key] === 'function') {
          // Don't overwrite existing hooks
          if (!this.req.hooks[key]) {
            this.req.hooks[key] = (registry as any)[key].bind(registry)
          }
        }
      }
    }

    // Attach email helper functions
    this.req.hooks.sendEmail = (options: any) => emailHelper.sendEmail(this.req.context as any, options)
    this.req.hooks.sendWelcomeEmail = (user: any) => emailHelper.sendWelcomeEmail(this.req.context as any, user)
    this.req.hooks.sendPasswordResetEmail = (user: any, token: string, expiryMinutes: number) =>
      emailHelper.sendPasswordResetEmail(this.req.context as any, user, token, expiryMinutes)
    this.req.hooks.sendTemplateEmail = (to: string, templateFn: any, data: any) =>
      emailHelper.sendTemplateEmail(this.req.context as any, to, templateFn, data)
    this.req.hooks.verifyEmailConnection = () => emailHelper.verifyEmailConnection(this.req.context as any)
  }

  // ----------------------
  // Global actions/filters
  // ----------------------
  addAction(hookName: string, callback: (...args: any[]) => void, priority: number = 10): void {
    if (!this.actions[hookName]) this.actions[hookName] = []
    this.actions[hookName].push({ callback, priority })
    this.actions[hookName].sort((a, b) => a.priority - b.priority)
  }

  doAction(hookName: string, ...args: any[]): void {
    if (!this.actions[hookName]) return
    this.actions[hookName].forEach((action) => action.callback(...args))
  }

  addFilter(hookName: string, callback: (value: any, ...args: any[]) => any, priority: number = 10): void {
    if (!this.filters[hookName]) this.filters[hookName] = []
    this.filters[hookName].push({ callback, priority })
    this.filters[hookName].sort((a, b) => a.priority - b.priority)
  }

  applyFilters(hookName: string, value: any, ...args: any[]): any {
    if (!this.filters[hookName]) return value
    return this.filters[hookName].reduce((val, filter) => filter.callback(val, ...args), value)
  }

  // ----------------------
  // Global helper functions
  // ----------------------
  theExcerpt(post: { excerpt?: string; content?: string }, length: number = 55): string {
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

  getAttachmentUrl(attachmentIdorSlug: number | string): Promise<string | null> {
    const { knex, table } = this.req.context

    if (!knex) {
      throw new Error('getAttachmentUrl requires a database connection')
    }

    // Simple async helper since DB queries are async
    const getUrl = async (): Promise<string | null> => {
      const post = await knex(table('posts'))
        .where('post_type_slug', 'attachments')
        .andWhere((builder: Knex.QueryBuilder) => builder.where('id', attachmentIdorSlug).orWhere('slug', attachmentIdorSlug))
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
  async init(): Promise<void> {
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
        const possibleFiles = ['index.ts', 'index.mjs', 'index.js']
        const indexPath = possibleFiles
          .map(file => path.join(providersDir, folder, file))
          .find(fullPath => fs.existsSync(fullPath))
        if (indexPath) {
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
      if (typeof (this.registries as any)[key].init === 'function') {
        const regSpan = tracer?.startSpan(`registries.init.${key}`, {
          category: TraceCategory.CORE,
          tags: { registry: key }
        })
        await (this.registries as any)[key].init()
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
