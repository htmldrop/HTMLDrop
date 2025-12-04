import type { Request, Response, NextFunction } from 'express'

interface Capabilities {
  [key: string]: string
}

interface PostTypeData {
  id?: number
  slug: string
  name_singular?: string
  name_plural?: string
  description?: string
  icon?: string
  show_in_menu?: boolean
  badge?: number
  position?: number
  capabilities?: Capabilities
  resolvedCapabilities?: Capabilities
  priority?: number
}

interface PostFieldData {
  id?: number
  slug: string
  name?: string
  type?: string
  parent_slug?: string
  post_type_slug?: string
  post_type_id?: number
  order?: number
  priority?: number
  required?: boolean
  revisions?: boolean
  options?: any
}

interface PostTypeEntry {
  data: PostTypeData
  priority: number
  source: 'db' | 'runtime'
}

interface PostFieldEntry {
  field: PostFieldData
  priority: number
  source: 'db' | 'runtime'
}

export default class RegisterPostTypes {
  private req: Request & { hooks: any; guard?: any; context: HTMLDrop.Context; user?: { locale?: string } }
  private hooks: any
  private context: HTMLDrop.Context
  private translate: (str: string, locale?: string) => string
  private postTypes: Map<string, PostTypeEntry>
  private fields: Map<string, PostFieldEntry[]>
  private loaded: boolean

  constructor(req: Request & { hooks: any; guard?: any; context: HTMLDrop.Context; user?: { locale?: string } }, res: Response, next: NextFunction) {
    if (!req.context.knex) {
      throw new Error('RegisterPostTypes requires a database connection')
    }
    this.req = req
    this.hooks = req.hooks
    this.context = req.context
    this.translate = (str: string, locale?: string) => req.context.translate(str, locale || 'en_US')
    this.postTypes = new Map()
    this.fields = new Map()
    this.loaded = false
  }

  // ----------------------
  // DB Loading
  // ----------------------
  async load(): Promise<void> {
    if (this.loaded) return

    const { table, knex } = this.context
    if (!knex) {
      this.loaded = true
      return
    }
    // Temporary map: id -> slug
    const idToSlug = new Map<number, string>()

    // Load post types from DB
    const dbPostTypes = await knex(table('post_types')).select('*')

    // Parse and check capabilities in parallel
    await Promise.all(
      dbPostTypes.map(async (type: any) => {
        if (typeof type.capabilities === 'string') {
          type.capabilities = JSON.parse(type.capabilities || '{}')
        }

        // Convert boolean fields from integers to booleans
        if (typeof type.show_in_menu !== 'undefined') {
          type.show_in_menu = Boolean(type.show_in_menu)
        }

        // Skip if user can't access
        if (type.capabilities && Object.keys(type.capabilities).length) {
          const resolved = await this.req.guard?.user({ canOneOf: type.capabilities })
          if (!resolved) return
          type.resolvedCapabilities = resolved // store canonical caps the user has
        }

        const priority = type.priority ?? 5
        this.postTypes.set(type.slug, { data: { ...type }, priority, source: 'db' })
        idToSlug.set(type.id, type.slug)

        // Register menu for database post types that should show in menu
        const locale = this.req?.user?.locale
        if (type.show_in_menu) {
          const capabilities = type.capabilities || {}
          await this.hooks.addMenuPage({
            slug: type.slug,
            page_title: type.name_plural,
            menu_title: type.name_plural,
            name_plural: type.name_plural,
            name_singular: type.name_singular,
            icon: type.icon,
            badge: type.badge,
            position: type.position,
            capabilities
          })
          await this.hooks.addSubMenuPage({
            slug: '',
            parent_slug: type.slug,
            page_title: this.translate('Home', locale),
            menu_title: this.translate('Home', locale),
            name_plural: this.translate('Home', locale),
            name_singular: this.translate('Home', locale),
            badge: 0,
            position: 100,
            capabilities
          })
          await this.hooks.addSubMenuPage({
            slug: 'fields/admin',
            parent_slug: type.slug,
            page_title: this.translate('Fields', locale),
            menu_title: this.translate('Fields', locale),
            name_plural: this.translate('Fields', locale),
            name_singular: this.translate('Field', locale),
            badge: 0,
            position: 10000,
            capabilities
          })
        }
      })
    )

    // Load fields from DB, ordered by 'order' column
    const dbFields = await knex(table('post_type_fields')).select('*').orderBy('order', 'asc')

    // Process fields in parallel
    await Promise.all(
      dbFields.map(async (field: any) => {
        // Convert boolean fields from integers to booleans
        if (typeof field.required !== 'undefined') {
          field.required = Boolean(field.required)
        }
        if (typeof field.revisions !== 'undefined') {
          field.revisions = Boolean(field.revisions)
        }

        const priority = field.priority ?? 5
        // Try to get slug from post_type_id first, then fall back to post_type_slug
        let slug = idToSlug.get(field.post_type_id)
        if (!slug && field.post_type_slug) {
          slug = field.post_type_slug
        }
        if (!slug) return

        if (!this.fields.has(slug)) this.fields.set(slug, [])
        this.fields.get(slug)!.push({ field: { ...field }, priority, source: 'db' })
      })
    )

    this.loaded = true
  }

  // ----------------------
  // Runtime registration
  // ----------------------
  async registerPostType(type: PostTypeData, priority: number = 10): Promise<void> {
    await this.load()

    // Resolve caps if provided
    if (type.capabilities && Object.keys(type.capabilities).length) {
      const resolved = await this.req.guard?.user({ canOneOf: type.capabilities })
      if (!resolved) return // user has no access at all
      type.resolvedCapabilities = resolved
    }

    const slug = type.slug
    const existing = this.postTypes.get(slug)

    if (existing && priority < existing.priority) return

    this.postTypes.set(slug, { data: { ...type }, priority, source: 'runtime' })
    this.hooks.doAction('postTypeRegistered', type)

    const locale = this.req?.user?.locale

    if (type.show_in_menu) {
      await this.hooks.addMenuPage({
        slug: type.slug,
        page_title: type.name_plural,
        menu_title: type.name_plural,
        name_plural: type.name_plural,
        name_singular: type.name_singular,
        icon: type.icon,
        badge: type.badge,
        position: type.position,
        capabilities: type.capabilities
      })
      await this.hooks.addSubMenuPage({
        slug: '',
        parent_slug: type.slug,
        page_title: this.translate('Home', locale),
        menu_title: this.translate('Home', locale),
        name_plural: this.translate('Home', locale),
        name_singular: this.translate('Home', locale),
        badge: 0,
        position: 100,
        capabilities: type.capabilities
      })
      await this.hooks.addSubMenuPage({
        slug: 'fields/admin',
        parent_slug: type.slug,
        page_title: this.translate('Fields', locale),
        menu_title: this.translate('Fields', locale),
        name_plural: this.translate('Fields', locale),
        name_singular: this.translate('Field', locale),
        badge: 0,
        position: 10000,
        capabilities: type.capabilities
      })
    }
  }

  async registerPostField(field: PostFieldData, priority: number = 10): Promise<void> {
    const postTypeSlug = field.parent_slug!
    await this.load()
    const postTypeEntry = this.getPostTypeEntry(postTypeSlug)
    if (!postTypeEntry) return

    if (!this.fields.has(postTypeSlug)) this.fields.set(postTypeSlug, [])
    const existingIndex = this.fields.get(postTypeSlug)!.findIndex((f) => f.field.slug === field.slug)

    if (existingIndex === -1) {
      this.fields.get(postTypeSlug)!.push({ field: { ...field }, priority, source: 'runtime' })
    } else if (priority >= this.fields.get(postTypeSlug)![existingIndex].priority) {
      this.fields.get(postTypeSlug)![existingIndex] = { field: { ...field }, priority, source: 'runtime' }
    }

    this.hooks.doAction('postFieldRegistered', postTypeSlug, field)
  }

  // ----------------------
  // Helpers
  // ----------------------
  getPostTypeEntry(slug: string): PostTypeEntry | undefined {
    return this.postTypes.get(slug)
  }

  // ----------------------
  // Getters with filters
  // ----------------------
  async getPostType(slug: string): Promise<PostTypeData | null> {
    await this.load()
    const entry = this.getPostTypeEntry(slug)
    if (!entry) return null

    const type = { ...entry.data } // clone

    if (type.capabilities && Object.keys(type.capabilities).length) {
      const resolved = await this.req.guard?.user({ canOneOf: type.capabilities })
      if (!resolved) return null
      type.resolvedCapabilities = resolved
    }

    return this.hooks.applyFilters('postType', type)
  }

  async getFields(slug: string): Promise<PostFieldEntry[]> {
    await this.load()
    const fields = this.fields.get(slug) || []
    // Sort fields by order, then by priority
    const sorted = fields.sort((a, b) => {
      const orderA = a.field.order ?? 1000
      const orderB = b.field.order ?? 1000
      if (orderA !== orderB) return orderA - orderB
      return (a.priority ?? 5) - (b.priority ?? 5)
    })
    return this.hooks.applyFilters('postTypeFields', sorted, slug)
  }

  async getAllPostTypes(): Promise<PostTypeData[]> {
    await this.load()
    const all: PostTypeData[] = []

    for (const entry of this.postTypes.values()) {
      const type = { ...entry.data }

      if (type.capabilities && Object.keys(type.capabilities).length) {
        const resolved = await this.req.guard?.user({ canOneOf: type.capabilities })
        if (!resolved) continue
        type.resolvedCapabilities = resolved
      }

      all.push(type)
    }

    return this.hooks.applyFilters('allPostTypes', all)
  }
}
