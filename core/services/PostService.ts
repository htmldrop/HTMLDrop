/**
 * Post Service
 *
 * Business logic for post operations
 * Extracted from PostsController to separate concerns
 */

import type { Knex } from 'knex'

interface PostServiceContext {
  knex: Knex
  table: (name: string) => string
  normalizeSlug: (value: string) => string
}

interface Post {
  id: number
  title?: string
  slug?: string
  content?: string
  excerpt?: string
  status?: string
  post_type?: string
  post_type_slug?: string
  taxonomies?: Record<string, Term[]>
  [key: string]: any
}

interface Term {
  id: number
  taxonomy?: string
  [key: string]: any
}

interface MetaQuery {
  relation?: 'AND' | 'OR'
  queries?: Array<{
    key: string
    value: any
    compare?: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'NOT LIKE' | 'IN' | 'NOT IN' | 'EXISTS' | 'NOT EXISTS'
  }>
}

interface GetPostsOptions {
  post_type?: string
  status?: string
  limit?: number | string
  offset?: number | string
  orderby?: string
  order?: 'asc' | 'desc'
  meta_query?: MetaQuery
}

class PostService {
  private context: PostServiceContext
  private knex: Knex
  private table: (name: string) => string

  constructor(context: PostServiceContext) {
    this.context = context
    this.knex = context.knex
    this.table = context.table.bind(context)
  }

  /**
   * Parse JSON strings in database rows
   */
  parseJSON(value: any): any {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }
    return value
  }

  /**
   * Parse all JSON fields in a row
   */
  parseRow<T extends Record<string, any>>(row: T): T {
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, this.parseJSON(v)])) as T
  }

  /**
   * Normalize object for comparison (sorts keys, stringifies)
   */
  normalizeObject(val: any, root = true): any {
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        const normalizedArray = val.map((v) => this.normalizeObject(v, false))
        return root ? JSON.stringify(normalizedArray) : normalizedArray
      }

      const sorted = Object.keys(val)
        .sort()
        .reduce((acc: Record<string, any>, key) => {
          acc[key] = this.normalizeObject(val[key], false)
          return acc
        }, {})

      return root ? JSON.stringify(sorted) : sorted
    }

    return val
  }

  /**
   * Resolve term IDs from taxonomies field
   */
  async resolveTermIds(termsField: any): Promise<number[]> {
    const ids = new Set<number>()

    if (typeof termsField === 'object' && Array.isArray(termsField)) {
      for (const taxonomySlug of termsField) {
        const terms = (termsField as any)[taxonomySlug]
        if (!Array.isArray(terms)) {
          ids.add(terms)
          continue
        }
        for (const term of terms) {
          ids.add(term?.id || term)
        }
      }
    } else if (typeof termsField === 'object') {
      for (const taxonomySlug of Object.keys(termsField)) {
        const terms = termsField[taxonomySlug]
        if (!Array.isArray(terms)) {
          ids.add(terms)
          continue
        }
        for (const term of terms) {
          ids.add(term?.id || term)
        }
      }
    }

    return Array.from(ids)
  }

  /**
   * Attach taxonomies to multiple posts
   */
  async withTaxonomiesMany(posts: Post[], req: any): Promise<Post[]> {
    if (!posts || posts.length === 0) return posts

    const postIds = posts.map((p) => p.id)
    const relationships = await this.knex(this.table('term_relationships'))
      .whereIn('post_id', postIds)
      .select('post_id', 'term_id')

    const termIds = [...new Set(relationships.map((r: { term_id: number }) => r.term_id))]
    if (termIds.length === 0) {
      return posts.map((p) => ({ ...p, taxonomies: {} }))
    }

    const terms = await this.knex(this.table('terms')).whereIn('id', termIds).select('*')

    const termMap = new Map<number, Term>(terms.map((t: Term) => [t.id, t]))
    const postTermMap = new Map<number, Term[]>()

    for (const rel of relationships) {
      if (!postTermMap.has(rel.post_id)) {
        postTermMap.set(rel.post_id, [])
      }
      const term = termMap.get(rel.term_id)
      if (term) {
        postTermMap.get(rel.post_id)!.push(term)
      }
    }

    return posts.map((post) => {
      const postTerms = postTermMap.get(post.id) || []
      const taxonomies: Record<string, Term[]> = {}

      for (const term of postTerms) {
        if (term.taxonomy) {
          if (!taxonomies[term.taxonomy]) {
            taxonomies[term.taxonomy] = []
          }
          taxonomies[term.taxonomy].push(term)
        }
      }

      return { ...post, taxonomies }
    })
  }

  /**
   * Attach taxonomies to a single post
   */
  async withTaxonomies(post: Post | null, req: any): Promise<Post | null> {
    if (!post) return post

    const results = await this.withTaxonomiesMany([post], req)
    return results[0]
  }

  /**
   * Get all posts with filters and pagination
   */
  async getPosts(options: GetPostsOptions, req: any): Promise<Post[]> {
    const {
      post_type = 'post',
      status = 'published',
      limit = 10,
      offset = 0,
      orderby = 'created_at',
      order = 'desc',
      meta_query
    } = options

    let query = this.knex(this.table('posts'))
      .where({ post_type, status })
      .limit(parseInt(String(limit)))
      .offset(parseInt(String(offset)))
      .orderBy(orderby, order)

    // Apply meta_query if provided
    if (meta_query) {
      query = await this.applyMetaQuery(query, meta_query, 'post')
    }

    const posts = await query
    return this.withTaxonomiesMany(posts, req)
  }

  /**
   * Get a single post by ID
   */
  async getPostById(id: number, req: any): Promise<Post | null> {
    const post = await this.knex(this.table('posts')).where({ id }).first()

    if (!post) return null

    return this.withTaxonomies(post, req)
  }

  /**
   * Get a single post by slug
   */
  async getPostBySlug(slug: string, post_type: string, req: any): Promise<Post | null> {
    const post = await this.knex(this.table('posts')).where({ slug, post_type }).first()

    if (!post) return null

    return this.withTaxonomies(post, req)
  }

  /**
   * Create a new post
   */
  async createPost(data: {
    title?: string
    slug?: string
    content?: string
    excerpt?: string
    status?: string
    post_type?: string
    meta?: Record<string, any>
    taxonomies?: any
  }, userId: number): Promise<number> {
    const { title, slug, content, excerpt, status, post_type, meta, taxonomies } = data

    // Insert post
    const [postId] = await this.knex(this.table('posts')).insert({
      title,
      slug: slug || this.context.normalizeSlug(title || ''),
      content: content || '',
      excerpt: excerpt || '',
      status: status || 'draft',
      post_type: post_type || 'post'
    })

    // Add author
    await this.knex(this.table('post_authors')).insert({
      post_id: postId,
      user_id: userId
    })

    // Add meta fields
    if (meta && typeof meta === 'object') {
      const metaEntries = Object.entries(meta).map(([key, value]) => ({
        post_id: postId,
        meta_key: key,
        meta_value: this.normalizeObject(value)
      }))

      if (metaEntries.length > 0) {
        await this.knex(this.table('post_meta')).insert(metaEntries)
      }
    }

    // Add taxonomies
    if (taxonomies) {
      await this.attachTaxonomies(postId, taxonomies)
    }

    return postId
  }

  /**
   * Update a post
   */
  async updatePost(id: number, data: {
    title?: string
    slug?: string
    content?: string
    excerpt?: string
    status?: string
    meta?: Record<string, any>
    taxonomies?: any
  }): Promise<void> {
    const { title, slug, content, excerpt, status, meta, taxonomies } = data

    const updateData: Record<string, any> = {}
    if (title !== undefined) updateData.title = title
    if (slug !== undefined) updateData.slug = slug
    if (content !== undefined) updateData.content = content
    if (excerpt !== undefined) updateData.excerpt = excerpt
    if (status !== undefined) updateData.status = status

    if (Object.keys(updateData).length > 0) {
      await this.knex(this.table('posts')).where({ id }).update(updateData)
    }

    // Update meta fields
    if (meta && typeof meta === 'object') {
      await this.updatePostMeta(id, meta)
    }

    // Update taxonomies
    if (taxonomies) {
      await this.knex(this.table('term_relationships')).where({ post_id: id }).del()
      await this.attachTaxonomies(id, taxonomies)
    }
  }

  /**
   * Delete a post
   */
  async deletePost(id: number): Promise<void> {
    await this.knex(this.table('term_relationships')).where({ post_id: id }).del()
    await this.knex(this.table('post_meta')).where({ post_id: id }).del()
    await this.knex(this.table('post_authors')).where({ post_id: id }).del()
    await this.knex(this.table('posts')).where({ id }).del()
  }

  /**
   * Update post meta fields
   */
  async updatePostMeta(postId: number, meta: Record<string, any>): Promise<void> {
    const existingMeta = await this.knex(this.table('post_meta'))
      .where({ post_id: postId })
      .select('meta_key', 'meta_value')

    const existingMap = new Map<string, string>(existingMeta.map((m: { meta_key: string; meta_value: string }) => [m.meta_key, m.meta_value]))

    for (const [key, value] of Object.entries(meta)) {
      const normalized = this.normalizeObject(value)
      const existing = existingMap.get(key)

      if (existing === undefined) {
        await this.knex(this.table('post_meta')).insert({
          post_id: postId,
          meta_key: key,
          meta_value: normalized
        })
      } else if (existing !== normalized) {
        await this.knex(this.table('post_meta'))
          .where({ post_id: postId, meta_key: key })
          .update({ meta_value: normalized })
      }
    }
  }

  /**
   * Attach taxonomies to a post
   */
  async attachTaxonomies(postId: number, taxonomies: any): Promise<void> {
    const termIds = await this.resolveTermIds(taxonomies)

    if (termIds.length > 0) {
      const entries = termIds.map((termId) => ({
        post_id: postId,
        term_id: termId
      }))

      await this.knex(this.table('term_relationships')).insert(entries)
    }
  }

  /**
   * Apply meta query filters to a query builder
   */
  async applyMetaQuery(query: Knex.QueryBuilder, metaQuery: MetaQuery, type = 'post'): Promise<Knex.QueryBuilder> {
    const { relation = 'AND', queries = [] } = metaQuery

    if (queries.length === 0) return query

    const metaTable = this.table(`${type}_meta`)
    const primaryKey = `${type}_id`

    for (const q of queries) {
      const { key, value, compare = '=' } = q

      const subQuery = this.knex(metaTable).select(primaryKey).where({ meta_key: key })

      switch (compare) {
      case '=':
        subQuery.where({ meta_value: this.normalizeObject(value) })
        break
      case '!=':
        subQuery.whereNot({ meta_value: this.normalizeObject(value) })
        break
      case '>':
      case '>=':
      case '<':
      case '<=':
        subQuery.where('meta_value', compare, value)
        break
      case 'LIKE':
        subQuery.where('meta_value', 'like', `%${value}%`)
        break
      case 'NOT LIKE':
        subQuery.whereNot('meta_value', 'like', `%${value}%`)
        break
      case 'IN':
        if (Array.isArray(value)) {
          subQuery.whereIn(
            'meta_value',
            value.map((v) => this.normalizeObject(v))
          )
        }
        break
      case 'NOT IN':
        if (Array.isArray(value)) {
          subQuery.whereNotIn(
            'meta_value',
            value.map((v) => this.normalizeObject(v))
          )
        }
        break
      case 'EXISTS':
        // Just check if key exists
        break
      case 'NOT EXISTS':
        query.whereNotIn('id', subQuery)
        continue
      }

      if (relation === 'AND') {
        query.whereIn('id', subQuery)
      } else {
        query.orWhereIn('id', subQuery)
      }
    }

    return query
  }

  /**
   * Get post count
   */
  async getPostCount(options: { post_type?: string; status?: string; meta_query?: MetaQuery }): Promise<number> {
    const { post_type = 'post', status = 'published', meta_query } = options

    let query = this.knex(this.table('posts')).where({ post_type, status }).count('id as count')

    if (meta_query) {
      query = await this.applyMetaQuery(query, meta_query, 'post')
    }

    const result = await query.first() as { count: number } | undefined
    return result?.count || 0
  }
}

export default PostService
