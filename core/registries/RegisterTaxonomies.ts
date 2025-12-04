import type { Request, Response, NextFunction } from 'express'

interface Capabilities {
  [key: string]: string
}

interface TaxonomyData {
  id?: number
  slug: string
  post_type_slug: string
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

interface TaxonomyFieldData {
  id?: number
  slug: string
  name?: string
  type?: string
  parent_slug?: string
  post_type_slug?: string
  taxonomy_id?: number
  order?: number
  priority?: number
  required?: boolean
  revisions?: boolean
}

interface TaxonomyEntry {
  data: TaxonomyData
  priority: number
  source: 'db' | 'runtime'
}

interface TaxonomyFieldEntry {
  field: TaxonomyFieldData
  priority: number
  source: 'db' | 'runtime'
}

export default class RegisterTaxonomies {
  private req: Request & { hooks: any; guard?: any; context: HTMLDrop.Context; user?: { locale?: string } }
  private hooks: any
  private context: HTMLDrop.Context
  private translate: (str: string, locale?: string) => string
  private taxonomies: Map<string, TaxonomyEntry>
  private taxonomiesByPostType: Map<string, string[]>
  private fields: Map<string, TaxonomyFieldEntry[]>
  private loaded: boolean

  constructor(req: Request & { hooks: any; guard?: any; context: HTMLDrop.Context; user?: { locale?: string } }, res: Response, next: NextFunction) {
    if (!req.context.knex) {
      throw new Error('RegisterTaxonomies requires a database connection')
    }
    this.req = req
    this.hooks = req.hooks
    this.context = req.context
    this.translate = (str: string, locale?: string) => req.context.translate(str, locale || 'en_US')
    this.taxonomies = new Map()
    this.taxonomiesByPostType = new Map()
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
    const idToKey = new Map<number, string>()

    // Load taxonomies from DB
    const dbTaxonomies = await knex(table('taxonomies')).select('*')

    await Promise.all(
      dbTaxonomies.map(async (taxonomy: any) => {
        if (typeof taxonomy.capabilities === 'string') {
          taxonomy.capabilities = JSON.parse(taxonomy.capabilities || '{}')
        }

        if (taxonomy.capabilities && Object.keys(taxonomy.capabilities).length) {
          const resolved = await this.req.guard?.user({ canOneOf: taxonomy.capabilities })
          if (!resolved) return
          taxonomy.resolvedCapabilities = resolved
        }

        const priority = taxonomy.priority ?? 5
        const key = `${taxonomy.post_type_slug}:${taxonomy.slug}`

        this.taxonomies.set(key, { data: { ...taxonomy }, priority, source: 'db' })
        idToKey.set(taxonomy.id, key)

        // Index by post type
        if (!this.taxonomiesByPostType.has(taxonomy.post_type_slug)) {
          this.taxonomiesByPostType.set(taxonomy.post_type_slug, [])
        }
        this.taxonomiesByPostType.get(taxonomy.post_type_slug)!.push(key)
      })
    )

    // Load taxonomy fields
    const dbFields = await knex(table('taxonomy_fields')).select('*')

    await Promise.all(
      dbFields.map(async (field: any) => {
        const priority = field.priority ?? 5
        const key = idToKey.get(field.taxonomy_id)
        if (!key) return

        if (!this.fields.has(key)) this.fields.set(key, [])
        this.fields.get(key)!.push({ field: { ...field }, priority, source: 'db' })
      })
    )

    this.loaded = true
  }

  // ----------------------
  // Runtime registration
  // ----------------------
  async registerTaxonomy(taxonomy: TaxonomyData, priority: number = 10): Promise<void> {
    await this.load()

    if (!taxonomy.slug || !taxonomy.post_type_slug) {
      throw new Error('slug and post_type_slug are required')
    }

    if (taxonomy.capabilities && Object.keys(taxonomy.capabilities).length) {
      const resolved = await this.req.guard?.user({ canOneOf: taxonomy.capabilities })
      if (!resolved) return
      taxonomy.resolvedCapabilities = resolved
    }

    const key = `${taxonomy.post_type_slug}:${taxonomy.slug}`
    const existing = this.taxonomies.get(key)
    if (existing && priority < existing.priority) return

    this.taxonomies.set(key, { data: { ...taxonomy }, priority, source: 'runtime' })

    // Index by post type
    if (!this.taxonomiesByPostType.has(taxonomy.post_type_slug)) {
      this.taxonomiesByPostType.set(taxonomy.post_type_slug, [])
    }
    if (!this.taxonomiesByPostType.get(taxonomy.post_type_slug)!.includes(key)) {
      this.taxonomiesByPostType.get(taxonomy.post_type_slug)!.push(key)
    }

    this.hooks.doAction('taxonomyRegistered', taxonomy)

    const locale = this.req?.user?.locale
    if (taxonomy.show_in_menu) {
      await this.hooks.addSubMenuPage({
        slug: `terms/${taxonomy.slug}`,
        parent_slug: taxonomy.post_type_slug,
        page_title: taxonomy.name_plural,
        menu_title: taxonomy.name_plural,
        name_plural: taxonomy.name_plural,
        name_singular: taxonomy.name_singular,
        icon: taxonomy.icon,
        badge: taxonomy.badge,
        position: taxonomy.position,
        capabilities: taxonomy.capabilities
      })
    }
  }

  async registerTermField(field: TaxonomyFieldData, priority: number = 10): Promise<void> {
    const postType = field.post_type_slug!
    const slug = field.parent_slug!
    await this.load()
    const key = `${postType}:${slug}`
    const taxonomyEntry = this.getTaxonomyEntry(key)
    if (!taxonomyEntry) return

    if (!this.fields.has(key)) this.fields.set(key, [])
    const existingIndex = this.fields.get(key)!.findIndex((f) => f.field.slug === field.slug)

    if (existingIndex === -1) {
      this.fields.get(key)!.push({ field: { ...field }, priority, source: 'runtime' })
    } else if (priority >= this.fields.get(key)![existingIndex].priority) {
      this.fields.get(key)![existingIndex] = { field: { ...field }, priority, source: 'runtime' }
    }

    this.hooks.doAction('taxonomyFieldRegistered', key, field)
  }

  // ----------------------
  // Helpers
  // ----------------------
  getTaxonomyEntry(key: string): TaxonomyEntry | undefined {
    return this.taxonomies.get(key)
  }

  // ----------------------
  // Getters with filters
  // ----------------------
  async getTaxonomy(postType: string, slug: string): Promise<TaxonomyData | null> {
    await this.load()
    const key = `${postType}:${slug}`
    const entry = this.getTaxonomyEntry(key)
    if (!entry) return null

    const taxonomy = { ...entry.data }
    if (taxonomy.capabilities && Object.keys(taxonomy.capabilities).length) {
      const resolved = await this.req.guard?.user({ canOneOf: taxonomy.capabilities })
      if (!resolved) return null
      taxonomy.resolvedCapabilities = resolved
    }

    return this.hooks.applyFilters('taxonomy', taxonomy)
  }

  async getTaxonomyFields(postType: string, slug: string): Promise<TaxonomyFieldEntry[]> {
    await this.load()
    const key = `${postType}:${slug}`
    const fields = this.fields.get(key) || []
    return this.hooks.applyFilters('taxonomyFields', fields, key)
  }

  async getAllTaxonomies(postType: string): Promise<TaxonomyData[]> {
    await this.load()
    const keys = this.taxonomiesByPostType.get(postType) || []
    const all: TaxonomyData[] = []

    for (const key of keys) {
      const entry = this.taxonomies.get(key)
      if (!entry) continue
      const taxonomy = { ...entry.data }

      if (taxonomy.capabilities && Object.keys(taxonomy.capabilities).length) {
        const resolved = await this.req.guard?.user({ canOneOf: taxonomy.capabilities })
        if (!resolved) continue
        taxonomy.resolvedCapabilities = resolved
      }

      all.push(taxonomy)
    }

    return this.hooks.applyFilters('allTaxonomies', all, postType)
  }
}
