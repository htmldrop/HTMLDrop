/**
 * Post Service
 *
 * Business logic for post operations
 * Extracted from PostsController to separate concerns
 */

class PostService {
  constructor(context) {
    this.context = context
    this.knex = context.knex
    this.table = context.table.bind(context)
  }

  /**
   * Parse JSON strings in database rows
   * @param {string|*} value - Value to parse
   * @returns {*} Parsed value
   */
  parseJSON(value) {
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
   * @param {Object} row - Database row
   * @returns {Object} Row with parsed JSON fields
   */
  parseRow(row) {
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, this.parseJSON(v)]))
  }

  /**
   * Normalize object for comparison (sorts keys, stringifies)
   * @param {*} val - Value to normalize
   * @param {boolean} root - Whether this is the root call
   * @returns {*} Normalized value
   */
  normalizeObject(val, root = true) {
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        const normalizedArray = val.map((v) => this.normalizeObject(v, false))
        return root ? JSON.stringify(normalizedArray) : normalizedArray
      }

      const sorted = Object.keys(val)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this.normalizeObject(val[key], false)
          return acc
        }, {})

      return root ? JSON.stringify(sorted) : sorted
    }

    return val
  }

  /**
   * Resolve term IDs from taxonomies field
   * @param {Object|Array} termsField - Terms field from request
   * @returns {Promise<Array<number>>} Array of term IDs
   */
  async resolveTermIds(termsField) {
    const ids = new Set()

    if (typeof termsField === 'object' && Array.isArray(termsField)) {
      for (const taxonomySlug of termsField) {
        const terms = termsField[taxonomySlug]
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
   * @param {Array<Object>} posts - Array of posts
   * @param {Object} req - Request object with context
   * @returns {Promise<Array<Object>>} Posts with taxonomies attached
   */
  async withTaxonomiesMany(posts, req) {
    if (!posts || posts.length === 0) return posts

    const postIds = posts.map((p) => p.id)
    const relationships = await this.knex(this.table('term_relationships'))
      .whereIn('post_id', postIds)
      .select('post_id', 'term_id')

    const termIds = [...new Set(relationships.map((r) => r.term_id))]
    if (termIds.length === 0) {
      return posts.map((p) => ({ ...p, taxonomies: {} }))
    }

    const terms = await this.knex(this.table('terms')).whereIn('id', termIds).select('*')

    const termMap = new Map(terms.map((t) => [t.id, t]))
    const postTermMap = new Map()

    for (const rel of relationships) {
      if (!postTermMap.has(rel.post_id)) {
        postTermMap.set(rel.post_id, [])
      }
      const term = termMap.get(rel.term_id)
      if (term) {
        postTermMap.get(rel.post_id).push(term)
      }
    }

    return posts.map((post) => {
      const postTerms = postTermMap.get(post.id) || []
      const taxonomies = {}

      for (const term of postTerms) {
        if (!taxonomies[term.taxonomy]) {
          taxonomies[term.taxonomy] = []
        }
        taxonomies[term.taxonomy].push(term)
      }

      return { ...post, taxonomies }
    })
  }

  /**
   * Attach taxonomies to a single post
   * @param {Object} post - Post object
   * @param {Object} req - Request object with context
   * @returns {Promise<Object>} Post with taxonomies attached
   */
  async withTaxonomies(post, req) {
    if (!post) return post

    const results = await this.withTaxonomiesMany([post], req)
    return results[0]
  }

  /**
   * Get all posts with filters and pagination
   * @param {Object} options - Query options
   * @param {string} options.post_type - Post type slug
   * @param {string} options.status - Post status
   * @param {number} options.limit - Results limit
   * @param {number} options.offset - Results offset
   * @param {string} options.orderby - Order by field
   * @param {string} options.order - Order direction
   * @param {Object} options.meta_query - Meta query object
   * @param {Object} req - Request object
   * @returns {Promise<Array<Object>>} Array of posts
   */
  async getPosts(options, req) {
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
      .limit(parseInt(limit))
      .offset(parseInt(offset))
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
   * @param {number} id - Post ID
   * @param {Object} req - Request object
   * @returns {Promise<Object|null>} Post object or null
   */
  async getPostById(id, req) {
    const post = await this.knex(this.table('posts')).where({ id }).first()

    if (!post) return null

    return this.withTaxonomies(post, req)
  }

  /**
   * Get a single post by slug
   * @param {string} slug - Post slug
   * @param {string} post_type - Post type
   * @param {Object} req - Request object
   * @returns {Promise<Object|null>} Post object or null
   */
  async getPostBySlug(slug, post_type, req) {
    const post = await this.knex(this.table('posts')).where({ slug, post_type }).first()

    if (!post) return null

    return this.withTaxonomies(post, req)
  }

  /**
   * Create a new post
   * @param {Object} data - Post data
   * @param {number} userId - User ID
   * @returns {Promise<number>} Created post ID
   */
  async createPost(data, userId) {
    const { title, slug, content, excerpt, status, post_type, meta, taxonomies } = data

    // Insert post
    const [postId] = await this.knex(this.table('posts')).insert({
      title,
      slug: slug || this.context.normalizeSlug(title),
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
   * @param {number} id - Post ID
   * @param {Object} data - Update data
   * @returns {Promise<void>}
   */
  async updatePost(id, data) {
    const { title, slug, content, excerpt, status, meta, taxonomies } = data

    const updateData = {}
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
   * @param {number} id - Post ID
   * @returns {Promise<void>}
   */
  async deletePost(id) {
    await this.knex(this.table('term_relationships')).where({ post_id: id }).del()
    await this.knex(this.table('post_meta')).where({ post_id: id }).del()
    await this.knex(this.table('post_authors')).where({ post_id: id }).del()
    await this.knex(this.table('posts')).where({ id }).del()
  }

  /**
   * Update post meta fields
   * @param {number} postId - Post ID
   * @param {Object} meta - Meta fields object
   * @returns {Promise<void>}
   */
  async updatePostMeta(postId, meta) {
    const existingMeta = await this.knex(this.table('post_meta'))
      .where({ post_id: postId })
      .select('meta_key', 'meta_value')

    const existingMap = new Map(existingMeta.map((m) => [m.meta_key, m.meta_value]))

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
   * @param {number} postId - Post ID
   * @param {Object} taxonomies - Taxonomies object
   * @returns {Promise<void>}
   */
  async attachTaxonomies(postId, taxonomies) {
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
   * @param {Object} query - Knex query builder
   * @param {Object} metaQuery - Meta query object
   * @param {string} type - Type (post, term, user)
   * @returns {Promise<Object>} Modified query builder
   */
  async applyMetaQuery(query, metaQuery, type = 'post') {
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
   * @param {Object} options - Query options
   * @returns {Promise<number>} Post count
   */
  async getPostCount(options) {
    const { post_type = 'post', status = 'published', meta_query } = options

    let query = this.knex(this.table('posts')).where({ post_type, status }).count('id as count')

    if (meta_query) {
      query = await this.applyMetaQuery(query, meta_query, 'post')
    }

    const result = await query.first()
    return result?.count || 0
  }
}

export default PostService
