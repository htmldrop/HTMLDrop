import fs from 'fs'
import path from 'path'
import multer from 'multer'
import express from 'express'
import { UPLOAD_LIMITS, getAllowedFileExtensions } from '../../utils/constants.mjs'

const UPLOAD_BASE = path.resolve('./content/uploads')
if (!fs.existsSync(UPLOAD_BASE)) fs.mkdirSync(UPLOAD_BASE, { recursive: true })

const decodeFilename = (name) => {
  try {
    return Buffer.from(name, 'latin1').toString('utf8')
  } catch {
    return name
  }
}

// Multer config: store files in year/month folders (like WordPress)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const dir = path.join(UPLOAD_BASE, year.toString(), month)
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_')
    const uniqueName = `${Date.now()}-${safeName}`
    cb(null, uniqueName)
  }
})

// File filter: validate file extensions if configured
const fileFilter = (req, file, cb) => {
  const allowedExtensions = getAllowedFileExtensions()

  // If no restrictions configured, allow all files
  if (!allowedExtensions) {
    return cb(null, true)
  }

  // Extract file extension
  const ext = path.extname(file.originalname).toLowerCase().slice(1)

  // Check if extension is allowed
  if (allowedExtensions.includes(ext)) {
    cb(null, true)
  } else {
    cb(new Error(`File type .${ext} is not allowed. Allowed types: ${allowedExtensions.join(', ')}`), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_LIMITS.MAX_FILE_SIZE
  }
})

export default (context) => {
  const router = express.Router({ mergeParams: true })

  const parseJSON = (value) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }
    return value
  }

  const parseRow = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, parseJSON(v)]))

  const normalizeObject = (val, root = true) => {
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        const normalizedArray = val.map((v) => normalizeObject(v, false))
        return root ? JSON.stringify(normalizedArray) : normalizedArray
      }

      const sorted = Object.keys(val)
        .sort()
        .reduce((acc, key) => {
          acc[key] = normalizeObject(val[key], false)
          return acc
        }, {})

      return root ? JSON.stringify(sorted) : sorted
    }

    return val
  }

  const resolveTermIds = async (termsField) => {
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

  const withTaxonomiesMany = async (posts, req) => {
    const { knex, table } = context
    const ids = posts.map((p) => p.id)

    const relationshipsRaw = await knex(table('term_relationships'))
      .whereIn('post_id', ids)
      .join(table('terms'), `${table('term_relationships')}.term_id`, '=', `${table('terms')}.id`)
      .select(`${table('term_relationships')}.post_id`, `${table('terms')}.*`)

    const relationships = await withTaxonomiesMetaMany(relationshipsRaw || [], req)

    // group terms by post_id and taxonomy_slug
    const termMap = {}
    for (const rel of relationships) {
      const postId = rel.post_id
      const taxonomy = rel.taxonomy_slug

      if (!termMap[postId]) termMap[postId] = {}
      if (!termMap[postId][taxonomy]) termMap[postId][taxonomy] = []

      termMap[postId][taxonomy].push(rel)
    }

    // attach grouped terms to posts
    return posts.map((p) => ({
      ...p,
      terms: termMap[p.id] || {}
    }))
  }

  const withMetaMany = async (posts, req) => {
    const { knex, table } = context
    const { applyFilters } = req.hooks
    const ids = posts.map((p) => p.id)
    const metas = await knex(table('post_meta')).whereIn('post_id', ids)
    const metaMap = {}
    for (const row of metas) {
      if (!metaMap[row.post_id]) metaMap[row.post_id] = {}
      metaMap[row.post_id][row.field_slug] = parseJSON(row.value)
    }

    return posts.map((p) => {
      const postWithMeta = { ...parseRow(p), ...(metaMap[p.id] || {}) }
      // Apply content & title filters
      // @todo - apply filters should only show when frontend context
      if (postWithMeta.content) {
        postWithMeta.content = applyFilters('the_content', postWithMeta.content, postWithMeta)
      }
      if (postWithMeta.title) {
        postWithMeta.title = applyFilters('the_title', postWithMeta.title, postWithMeta)
      }
      return postWithMeta
    })
  }

  const withTaxonomiesMetaMany = async (terms, req) => {
    const { knex, table } = context
    const { applyFilters } = req.hooks
    const ids = terms.map((p) => p.id)

    if (!ids.length) return []

    // Fetch meta
    const metas = await knex(table('term_meta')).whereIn('term_id', ids)
    const metaMap = {}
    for (const row of metas) {
      if (!metaMap[row.term_id]) metaMap[row.term_id] = {}
      metaMap[row.term_id][row.field_slug] = parseJSON(row.value)
    }

    // Fetch post counts
    const counts = await knex(table('term_relationships'))
      .whereIn('term_id', ids)
      .groupBy('term_id')
      .select('term_id')
      .countDistinct('post_id as post_count')

    const countMap = Object.fromEntries(counts.map((c) => [c.term_id, Number(c.post_count)]))

    return terms.map((p) => {
      const termWithMeta = { ...parseRow(p), ...(metaMap[p.id] || {}) }
      termWithMeta.post_count = countMap[p.id] || 0
      // Apply content & title filters
      // @todo - apply filters should only show when frontend context
      if (termWithMeta.title) {
        termWithMeta.title = applyFilters('the_title', termWithMeta.title, termWithMeta)
      }
      return termWithMeta
    })
  }

  const withMetaAndTaxonomiesMany = async (posts, req) => {
    const postsWithMeta = await withMetaMany(posts, req)
    return await withTaxonomiesMany(postsWithMeta, req)
  }

  const withMetaAndTaxonomies = async (post, req) => {
    const [result] = await withMetaAndTaxonomiesMany([post], req)
    return result
  }

  // ------------------------
  // Helper: check route capability
  // ------------------------
  const checkCapability = async (req, routeCaps, postTypeSlug, postId) => {
    const { getPostType } = req.hooks
    const type = await getPostType(postTypeSlug)
    if (!type?.resolvedCapabilities?.length) return null

    const validCaps = type.resolvedCapabilities.filter((c) => routeCaps.includes(c))
    if (!validCaps.length) return null

    const hasAccess = await req.guard.user({ canOneOf: validCaps, postId })
    return hasAccess ? type : null
  }

  /**
   * @openapi
   * /posts/{postType}:
   *   get:
   *     tags:
   *       - Posts
   *     summary: List posts by type
   *     description: |
   *       Returns a paginated list of posts with flexible search, filtering, metadata queries, and taxonomy support.
   *
   *       **Response Structure:**
   *       - Each post includes all custom metadata fields merged at the root level
   *       - Posts include a `terms` object with taxonomy relationships grouped by taxonomy slug
   *       - Each term includes its metadata and post count
   *       - Content and title fields are filtered through hooks (e.g., `the_content`, `the_title`)
   *
   *       ## Query Examples
   *
   *       **Basic filtering:**
   *       ```
   *       GET /posts/articles?status=published&limit=20
   *       ```
   *
   *       **Using filters parameter:**
   *       Filter by core post fields using JSON object.
   *       ```
   *       GET /posts/articles?filters={"author_id": 5}
   *       GET /posts/products?filters={"status": "published", "category": "technology"}
   *       ```
   *
   *       **Using meta_query parameter:**
   *       Query posts by custom metadata fields with comparison operators.
   *       ```
   *       # Find posts with price > 100
   *       GET /posts/products?meta_query={"price": {"value": 100, "compare": ">"}}
   *
   *       # Find posts with color in specific values
   *       GET /posts/products?meta_query={"color": {"value": ["red", "blue"], "compare": "IN"}}
   *
   *       # Find featured posts
   *       GET /posts/articles?meta_query={"featured": {"value": true}}
   *
   *       # Complex metadata query with multiple conditions
   *       GET /posts/events?meta_query={"date": {"value": "2025-01-01", "compare": ">="}, "capacity": {"value": 50, "compare": "<"}}
   *       ```
   *
   *       **Combining filters and meta_query:**
   *       ```
   *       GET /posts/products?filters={"status": "published"}&meta_query={"views": {"value": 1000, "compare": ">="}}
   *       ```
   *
   *       **Supported comparison operators for meta_query:**
   *       - `=` - Equals (default)
   *       - `!=` - Not equals
   *       - `>` - Greater than
   *       - `>=` - Greater than or equal
   *       - `<` - Less than
   *       - `<=` - Less than or equal
   *       - `LIKE` - SQL LIKE pattern matching
   *       - `NOT LIKE` - SQL NOT LIKE pattern matching
   *       - `IN` - Value in array
   *       - `NOT IN` - Value not in array
   *       - `BETWEEN` - Value between two values (provide array with two values)
   *       - `NOT BETWEEN` - Value not between two values
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug (e.g., "posts", "pages", "products")
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [draft, published, archived]
   *         description: Filter by post status
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *         description: Number of items per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of items to skip
   *       - in: query
   *         name: orderBy
   *         schema:
   *           type: string
   *           default: id
   *         description: Field to sort by
   *       - in: query
   *         name: sort
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *           default: desc
   *         description: Sort direction
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search term to filter posts
   *       - in: query
   *         name: searchable
   *         schema:
   *           type: string
   *         description: JSON array of fields to search in (e.g., ["slug", "title", "content"])
   *       - in: query
   *         name: filters
   *         schema:
   *           type: string
   *         description: |
   *           JSON object with field filters for core post fields.
   *           Example: `{"author_id": 5, "status": "published"}`
   *       - in: query
   *         name: meta_query
   *         schema:
   *           type: string
   *         description: |
   *           JSON object for complex metadata queries. Each key is a metadata field name, and the value is an object with:
   *           - `value`: The value to compare (required)
   *           - `compare`: Comparison operator (optional, default: "=")
   *
   *           Example: `{"price": {"value": 100, "compare": ">"}, "featured": {"value": true}}`
   *       - in: query
   *         name: trashed
   *         schema:
   *           type: boolean
   *         description: Include only trashed posts
   *     responses:
   *       200:
   *         description: Paginated list of posts
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 items:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Post'
   *                 total:
   *                   type: integer
   *                 total_current:
   *                   type: integer
   *                 total_drafts:
   *                   type: integer
   *                 total_published:
   *                   type: integer
   *                 total_trashed:
   *                   type: integer
   *                 limit:
   *                   type: integer
   *                 offset:
   *                   type: integer
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   */
  router.get('/', async (req, res, next) => {
    const { knex, table } = context
    const { postType } = req.params

    const type = await checkCapability(req, ['read', 'read_post'], postType)

    if (!type && !req?.user?.id) {
      return res.json({
        items: [],
        total: 0,
        total_current: 0,
        total_drafts: 0,
        total_published: 0,
        total_trashed: 0,
        limit: 0,
        offset: 0
      })
    }

    const {
      status,
      limit = 10,
      offset = 0,
      orderBy = 'id',
      sort = 'desc',
      search,
      searchable = JSON.stringify(['slug']),
      filters = '{}',
      meta_query = '{}',
      trashed
    } = req.query

    const coreFields = [
      'id',
      'slug',
      'status',
      'post_type_slug',
      'post_type_id',
      'created_at',
      'updated_at',
      'deleted_at'
    ]

    let searchFields = []
    try {
      searchFields = JSON.parse(searchable)
    } catch (e) {}

    let parsedFilters = {}
    let parsedMetaQuery = {}
    try {
      parsedFilters = JSON.parse(filters)
    } catch (e) {}
    try {
      parsedMetaQuery = JSON.parse(meta_query)
    } catch (e) {}

    const searchableCore = searchFields?.filter((field) => coreFields.includes(field)) || []
    const searchableMeta = searchFields?.filter((field) => !coreFields.includes(field)) || []

    let query = knex(table('posts')).where('post_type_slug', postType)

    if (!type) {
      // user can only see posts where they are an author
      query = query.whereExists(function () {
        this.select('*')
          .from(table('post_authors'))
          .whereRaw(`${table('post_authors')}.post_id = ${table('posts')}.id`)
          .andWhere('user_id', req.user.id)
      })
    }

    // ------------------------
    // Totals (without pagination)
    // ------------------------
    const totals = await query
      .clone()
      .select(
        knex.raw(`
          SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as total,
          SUM(CASE WHEN status = 'draft' AND deleted_at IS NULL THEN 1 ELSE 0 END) as total_drafts,
          SUM(CASE WHEN status = 'published' AND deleted_at IS NULL THEN 1 ELSE 0 END) as total_published,
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as total_trashed
        `)
      )
      .first()

    const total = totals.total
    const totalDrafts = totals.total_drafts
    const totalPublished = totals.total_published
    const totalTrashed = totals.total_trashed

    // ------------------------
    // Apply post field filters
    // ------------------------
    if (status) query.andWhere('status', status)

    Object.entries(parsedFilters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        query.andWhere((builder) => builder.whereIn(key, value))
      } else if (value !== undefined && value !== null && value !== '') {
        query.andWhere(key, value)
      }
    })

    // ------------------------
    // Apply meta_query filters
    // ------------------------
    if (parsedMetaQuery && (parsedMetaQuery.queries || Object.keys(parsedMetaQuery).length > 0)) {
      const relation = (parsedMetaQuery.relation || 'AND').toUpperCase()
      const queries = parsedMetaQuery.queries || []

      query.andWhere((qb) => {
        queries.forEach((metaCond, i) => {
          const { key, value, compare = '=', relation: subRel } = metaCond

          const subQuery = function () {
            this.select('*')
              .from(table('post_meta'))
              .whereRaw(`${table('post_meta')}.post_id = ${table('posts')}.id`)
              .andWhere('field_slug', key)
              .andWhere((builder) => {
                switch (compare.toUpperCase()) {
                case 'IN':
                  builder.whereIn('value', Array.isArray(value) ? value : [value])
                  break
                case 'NOT IN':
                  builder.whereNotIn('value', Array.isArray(value) ? value : [value])
                  break
                case 'LIKE':
                  builder.where('value', 'like', `%${value}%`)
                  break
                case '!=':
                case '<>':
                  builder.where('value', '<>', value)
                  break
                default:
                  builder.where('value', compare, value)
                }
              })
          }

          if (i === 0) {
            qb.whereExists(subQuery)
          } else {
            if (relation === 'OR' || subRel === 'OR') qb.orWhereExists(subQuery)
            else qb.andWhereExists(subQuery)
          }
        })
      })
    }

    // ------------------------
    // Apply taxonomy filters
    // ------------------------

    const taxonomyQuery = req.query.taxonomy_query ? JSON.parse(req.query.taxonomy_query) : null

    if (taxonomyQuery) {
      const { taxonomy, term } = taxonomyQuery

      query.whereExists(function () {
        this.select('*')
          .from(table('term_relationships'))
          .join(table('terms'), `${table('term_relationships')}.term_id`, '=', `${table('terms')}.id`)
          .whereRaw(`${table('term_relationships')}.post_id = ${table('posts')}.id`)
          .andWhere(`${table('terms')}.taxonomy_slug`, taxonomy)
          .andWhere(`${table('terms')}.id`, term)
      })
    }

    // ------------------------
    // Apply search
    // ------------------------
    if (search) {
      query.andWhere((qb) => {
        // Search in core fields
        searchableCore.forEach((col, i) => {
          const clause = `%${search}%`
          if (i === 0) qb.where(col, 'like', clause)
          else qb.orWhere(col, 'like', clause)
        })

        // Search in meta fields
        if (searchableMeta.length > 0) {
          qb.orWhereExists(function () {
            this.select('*')
              .from(table('post_meta'))
              .whereRaw(`${table('post_meta')}.post_id = ${table('posts')}.id`)
              .andWhere((builder) => {
                searchableMeta.forEach((col, i) => {
                  const clause = `%${search}%`
                  if (i === 0) {
                    builder.where('field_slug', col).andWhere('value', 'like', clause)
                  } else {
                    builder.orWhere((q2) => q2.where('field_slug', col).andWhere('value', 'like', clause))
                  }
                })
              })
          })
        }
      })
    }

    // ------------------------
    // Handle trashed filter
    // ------------------------
    if (trashed) query.whereNotNull('deleted_at')
    else query.whereNull('deleted_at')

    // ------------------------
    // Total current result (after filters)
    // ------------------------
    const totalCurrentResult = await query.clone().count('* as count').first()
    const totalCurrent = totalCurrentResult ? Number(totalCurrentResult.count) : 0

    // ------------------------
    // Fetch rows
    // ------------------------
    const rows = await query.clone().orderBy(orderBy, sort).limit(Number(limit)).offset(Number(offset)).select('*')

    res.json({
      items: await withMetaAndTaxonomiesMany(rows, req),
      total,
      total_current: totalCurrent,
      total_drafts: totalDrafts,
      total_published: totalPublished,
      total_trashed: totalTrashed,
      limit: Number(limit),
      offset: Number(offset)
    })
  })

  /**
   * @openapi
   * /posts/{postType}/{idOrSlug}:
   *   get:
   *     tags:
   *       - Posts
   *     summary: Get a post by ID or slug
   *     description: |
   *       Returns a single post with all custom metadata fields and taxonomy relationships.
   *
   *       **Response Structure:**
   *       - All custom metadata fields are merged at the root level of the post object
   *       - Includes a `terms` object with taxonomy relationships grouped by taxonomy slug
   *       - Each term includes its metadata fields and post count
   *       - Content and title fields are filtered through hooks (e.g., `the_content`, `the_title`)
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Post ID or slug
   *     responses:
   *       200:
   *         description: Post details with metadata and taxonomy relationships
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Post'
   *             example:
   *               id: 42
   *               post_type_slug: articles
   *               post_type_id: 1
   *               slug: getting-started-with-nodejs
   *               status: published
   *               created_at: "2025-01-15T10:30:00Z"
   *               updated_at: "2025-01-15T14:20:00Z"
   *               deleted_at: null
   *               title: Getting Started with Node.js
   *               content: "<p>Node.js is a powerful JavaScript runtime...</p>"
   *               excerpt: A beginner's guide to Node.js
   *               featured_image: https://example.com/images/nodejs.jpg
   *               author: John Doe
   *               views: 1523
   *               terms:
   *                 categories:
   *                   - id: 5
   *                     taxonomy_slug: categories
   *                     slug: tutorials
   *                     name: Tutorials
   *                     post_count: 42
   *                 tags:
   *                   - id: 12
   *                     taxonomy_slug: tags
   *                     slug: nodejs
   *                     name: Node.js
   *                     post_count: 28
   *                   - id: 15
   *                     taxonomy_slug: tags
   *                     slug: javascript
   *                     name: JavaScript
   *                     post_count: 67
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: Post not found
   */
  router.get('/:idOrSlug', async (req, res, next) => {
    const { knex, table } = context
    const { idOrSlug, postType } = req.params

    const post = await knex(table('posts'))
      .where('post_type_slug', postType)
      .andWhere((builder) => builder.where('id', idOrSlug).orWhere('slug', idOrSlug))
      .first()
    if (!post) return res.status(404).json({ error: 'Post not found' })

    const type = await checkCapability(req, ['read_post'], post.post_type_slug, post.id)
    const isOwner =
      req?.user?.id && (await knex(table('post_authors')).where({ post_id: post.id, user_id: req.user.id }).first())
    if (!type && !isOwner) return res.status(403).json({ error: 'Permission denied' })

    const result = await withMetaAndTaxonomies(post, req)

    res.json(result)
  })

  /**
   * @openapi
   * /posts/{postType}:
   *   post:
   *     tags:
   *       - Posts
   *     summary: Create a new post
   *     description: Creates a new post with metadata and taxonomy relationships
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - title
   *             properties:
   *               slug:
   *                 type: string
   *                 example: my-post-slug
   *               title:
   *                 type: string
   *                 example: My Post Title
   *               status:
   *                 type: string
   *                 enum: [draft, published, archived]
   *                 default: draft
   *               content:
   *                 type: string
   *                 example: Post content goes here
   *               terms:
   *                 type: object
   *                 description: Taxonomy relationships (e.g., {"categories":[1,2]})
   *     responses:
   *       200:
   *         description: Post created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Post'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   */
  router.post('/', async (req, res, next) => {
    const { knex, table, normalizeSlug } = context
    const { getFields, applyFilters, doAction } = req.hooks
    const { slug, status, title } = req.body
    const { postType } = req.params

    const type = await checkCapability(req, ['create_posts'], postType)
    if (!type) return res.status(403).json({ error: 'Cannot create post for this type' })

    let coreData = {
      slug: normalizeSlug(slug || title),
      post_type_slug: postType ? normalizeSlug(postType) : null,
      post_type_id: type.id ? Number(type.id) : null,
      status: status || 'draft'
    }

    let metaData = { ...req.body }
    delete metaData.slug
    delete metaData.status

    const fields = await getFields(postType)
    if (fields.some((field) => field.field.slug === 'authors')) {
      metaData.authors = [req.user.id]
    }

    if (!fields.some((field) => field.field.slug === 'slug') && !slug) {
      delete coreData.slug
    }

    const filtered = applyFilters('insert_post_data', { coreData, metaData }, postType)

    coreData = filtered?.coreData || {}
    metaData = filtered?.metaData || {}

    const [id] = await knex(table('posts')).insert(coreData)

    const metaInserts = Object.entries(metaData).map(([field_slug, value]) => ({
      post_id: id,
      field_slug,
      value: normalizeObject(value)
    }))

    if (metaInserts.length > 0) {
      await knex(table('post_meta')).insert(metaInserts)
    }

    if (typeof req.body.terms !== 'undefined') {
      const termIds = await resolveTermIds(req.body.terms)
      if (termIds.length > 0) {
        const relInserts = termIds.map((term_id) => ({ term_id, post_id: id }))
        await knex(table('term_relationships')).insert(relInserts)
      }
    }

    const created = await knex(table('posts')).where('id', id).first()
    const result = await withMetaAndTaxonomies(created, req)

    // insert authors
    if (req?.user?.id) {
      await knex(table('post_authors')).insert({ post_id: id, user_id: req.user.id })
    }

    doAction('save_post', { req, res, next, postType, post: result })
    doAction('insert_post', { req, res, next, postType, post: result })
    if (coreData?.status === 'published') {
      doAction('publish_post', { req, res, next, postType, post: result })
    }
    res.json(result)
  })

  /**
   * @openapi
   * /posts/{postType}/{idOrSlug}:
   *   patch:
   *     tags:
   *       - Posts
   *     summary: Update a post
   *     description: Updates post fields, metadata, and taxonomy relationships. Supports revisions for tracked fields.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Post ID or slug
   *       - in: query
   *         name: comment
   *         schema:
   *           type: string
   *         description: Comment for revision history
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               slug:
   *                 type: string
   *               title:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [draft, published, archived]
   *               content:
   *                 type: string
   *               terms:
   *                 type: object
   *                 description: Taxonomy relationships to update
   *               deleted_at:
   *                 type: string
   *                 format: date-time
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Post updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Post'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: Post not found
   */
  router.patch('/:idOrSlug', async (req, res, next) => {
    const { knex, table, normalizeSlug } = context
    const { getFields, doAction, applyFilters } = req.hooks
    const { idOrSlug, postType } = req.params
    const post = await knex(table('posts'))
      .where('post_type_slug', postType)
      .andWhere((builder) => {
        builder.where('id', idOrSlug).orWhere('slug', idOrSlug)
      })
      .first()
    if (!post) return res.status(404).json({ error: 'Post not found' })

    const id = post.id

    const type = await checkCapability(req, ['edit', 'edit_posts'], post.post_type_slug, id)
    const isOwner =
      req?.user?.id && (await knex(table('post_authors')).where({ post_id: id, user_id: req.user.id }).first())
    if (!type && !isOwner) return res.status(403).json({ error: 'Permission denied' })

    let coreUpdates = {}
    let metaUpdates = {}

    const fields = await getFields(postType)
    if (fields.some((field) => field.field.slug === 'authors')) {
      const meta = await knex(table('post_meta')).where('post_id', id).where('field_slug', 'authors').first()
      if (Array.isArray(meta?.value)) metaUpdates.authors = meta.value
      else if (typeof meta?.value === 'string') metaUpdates.authors = JSON.parse(meta?.value || '[]')
      if (!Array.isArray(metaUpdates.authors)) metaUpdates.authors = []
      if (!metaUpdates.authors?.find((id) => id === req.user.id)) {
        metaUpdates.authors.push(req.user.id)
      }
    }

    for (let [key, val] of Object.entries(req.body)) {
      if (['slug', 'status', 'post_type_slug', 'post_type_id', 'deleted_at'].includes(key)) {
        if (['slug', 'post_type_slug'].includes(key)) {
          val = val ? normalizeSlug(val) : null
        }
        if (['post_type_id'].includes(key)) {
          val = val ? Number(val) : null
        }
        coreUpdates[key] = val
      } else {
        metaUpdates[key] = val
      }
    }

    const prePost = await withMetaAndTaxonomies(post, req)

    doAction('pre_post_update', {
      req,
      res,
      next,
      postType,
      post: prePost,
      coreData: coreUpdates,
      metaData: metaUpdates
    })

    const filtered = applyFilters(
      'insert_post_data',
      { coreData: coreUpdates, metaData: metaUpdates },
      postType,
      prePost
    )

    coreUpdates = filtered?.coreData || {}
    metaUpdates = filtered?.metaData || {}

    const hasCoreUpdates = Object.keys(coreUpdates).length > 0
    const hasMetaUpdates = Object.keys(metaUpdates).length > 0

    if (!hasCoreUpdates && hasMetaUpdates) {
      coreUpdates.updated_at = knex.fn.now()
    }

    if (hasCoreUpdates || hasMetaUpdates) {
      await knex(table('posts')).where('id', id).update(coreUpdates)
      if (req?.user?.id) {
        await knex(table('post_authors'))
          .insert({
            post_id: id,
            user_id: req.user.id,
            updated_at: knex.fn.now()
          })
          .onConflict(['post_id', 'user_id'])
          .merge({
            updated_at: knex.fn.now()
          })
      }
    }

    for (const [field_slug, value] of Object.entries(metaUpdates)) {
      const exists = await knex(table('post_meta')).where({ post_id: id, field_slug }).first()
      if (exists) {
        await knex(table('post_meta'))
          .where({ post_id: id, field_slug })
          .update({ value: normalizeObject(value) })
      } else {
        await knex(table('post_meta')).insert({ post_id: id, field_slug, value: normalizeObject(value) })
      }
    }
    if (typeof req.body.terms !== 'undefined') {
      const termIds = await resolveTermIds(req.body.terms)

      // Replace existing relationships
      await knex(table('term_relationships')).where('post_id', id).delete()

      if (termIds.length > 0) {
        const relInserts = termIds.map((term_id) => ({ term_id, post_id: id }))
        await knex(table('term_relationships')).insert(relInserts)
      }
    }

    const revisionPromises = []

    for (const { field } of fields.filter((f) => f.field.revisions)) {
      const slug = field.slug
      const newCoreValue = coreUpdates[slug]
      const newMetaValue = metaUpdates[slug]

      const storeRevisionIfChanged = async (newValue) => {
        if (typeof newValue === 'undefined') return

        // fetch the last revision
        const lastRevision = await knex(table('post_revisions'))
          .where({ post_id: id, field_slug: slug })
          .orderBy('id', 'desc')
          .first()

        const normalizedNewValue = normalizeObject(newValue)
        const lastValue = lastRevision ? lastRevision.value : null

        if (lastValue !== normalizedNewValue) {
          await knex(table('post_revisions')).insert({
            post_id: id,
            field_slug: slug,
            value: JSON.stringify(newValue),
            author_id: req.user.id,
            comment: req.query?.comment || null
          })
        }
      }

      // push promises to array
      revisionPromises.push(storeRevisionIfChanged(newCoreValue))
      revisionPromises.push(storeRevisionIfChanged(newMetaValue))
    }

    // run all in parallel
    await Promise.all(revisionPromises)

    const updated = await knex(table('posts')).where('id', id).first()
    const result = await withMetaAndTaxonomies(updated, req)
    doAction('edit_post', { req, res, next, postType, post: result })
    doAction('save_post', { req, res, next, postType, post: result })
    if (!result?.deleted_at && post?.deleted_at) {
      doAction('untrash_post', { req, res, next, postType, post: result })
    }
    if (post?.status !== result?.status) {
      doAction('transition_post_status', { req, res, next, postType, post: result })
      if (result?.status === 'published') {
        doAction('publish_post', { req, res, next, postType, post: result })
      }
    }
    res.json(result)
  })

  /**
   * @openapi
   * /posts/{postType}/{idOrSlug}:
   *   delete:
   *     tags:
   *       - Posts
   *     summary: Delete a post
   *     description: Soft deletes a post (moves to trash) or permanently deletes if permanently=true query param is provided
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: postType
   *         required: true
   *         schema:
   *           type: string
   *         description: Post type slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Post ID or slug
   *       - in: query
   *         name: permanently
   *         schema:
   *           type: boolean
   *         description: If true, permanently delete the post
   *     responses:
   *       200:
   *         description: Post deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Post'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions or deletion aborted
   *       404:
   *         description: Post not found
   */
  router.delete('/:idOrSlug', async (req, res, next) => {
    const { knex, table, formatDate } = context
    const { idOrSlug, postType } = req.params
    const { doAction, applyFilters } = req.hooks
    const post = await knex(table('posts'))
      .where('post_type_slug', postType)
      .andWhere((builder) => {
        builder.where('id', idOrSlug).orWhere('slug', idOrSlug)
      })
      .first()
    if (!post) return res.status(404).json({ error: 'Post not found' })

    const id = post.id

    const type = await checkCapability(req, ['delete_posts'], post.post_type_slug, id)
    const isOwner =
      req?.user?.id && (await knex(table('post_authors')).where({ post_id: id, user_id: req.user.id }).first())
    if (!type && !isOwner) return res.status(403).json({ error: 'Permission denied' })

    const deleted = await withMetaAndTaxonomies(post, req)

    const keepDeleting = applyFilters('pre_delete_post', { coreData: {}, metaData: {} }, postType, deleted)

    if (!keepDeleting) {
      return res.status(403).json({ error: 'Deletion aborted' })
    }

    if (req.query?.permanently) {
      doAction('before_delete_post', { req, res, next, postType, post: deleted })

      if (post.post_type_slug === 'attachments') {
        try {
          const fileMeta = deleted?.file
          if (fileMeta?.path) {
            // Validate path to prevent path traversal attacks
            const normalizedPath = path.normalize(fileMeta.path)
            const filePath = path.join(UPLOAD_BASE, normalizedPath)
            const resolvedBase = path.resolve(UPLOAD_BASE)
            const resolvedPath = path.resolve(filePath)

            // Ensure path stays within UPLOAD_BASE
            if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
              console.error('Invalid file path: path traversal attempt detected')
              throw new Error('Invalid file path')
            }

            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath)
            }
          }
        } catch (err) {
          console.error('Failed to delete attachment file:', err)
        }
      }

      await knex(table('posts')).where('id', id).delete()
    } else {
      await knex(table('posts'))
        .where('id', id)
        .update({ deleted_at: formatDate(new Date()) })
    }
    if (req.query?.permanently) {
      doAction('delete_post', { req, res, next, postType, post: deleted })
    } else {
      doAction('trash_post', { req, res, next, postType, post: deleted })
    }
    res.json(deleted)
  })

  /**
   * @openapi
   * /posts/upload:
   *   post:
   *     tags:
   *       - Posts
   *     summary: Upload files
   *     description: Upload one or multiple files and create attachment posts. Supports progress tracking via WebSocket.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *     responses:
   *       200:
   *         description: Files uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 attachments:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       attachment_id:
   *                         type: integer
   *                       filename:
   *                         type: string
   *                       original_name:
   *                         type: string
   *                       mime_type:
   *                         type: string
   *                       size:
   *                         type: integer
   *                       path:
   *                         type: string
   *       400:
   *         description: No files provided or upload aborted
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   * /posts/upload/{idOrSlug}/{fieldSlug}:
   *   post:
   *     tags:
   *       - Posts
   *     summary: Upload files and attach to post field
   *     description: Upload files and attach them to a specific field on a post
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Post ID or slug
   *       - in: path
   *         name: fieldSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Field slug to attach files to
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *     responses:
   *       200:
   *         description: Files uploaded and attached successfully
   *       400:
   *         description: No files provided
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   */
  const uploadHandler = async (req, res, next) => {
    const { knex, table, normalizeSlug, wss } = context
    try {
      const { postType, idOrSlug, fieldSlug } = req.params
      const { applyFilters, doAction } = req.hooks

      // Capability check
      if (!(await checkCapability(req, ['create', 'create_posts'], 'attachments'))) {
        return res.status(403).json({ error: 'Permission denied' })
      }

      let post = null
      if (idOrSlug && fieldSlug) {
        if (!(await checkCapability(req, ['edit', 'edit_posts'], postType))) {
          return res.status(403).json({ error: 'Permission denied' })
        }
        post = await knex(table('posts'))
          .where('post_type_slug', postType)
          .andWhere((builder) => builder.where('id', idOrSlug).orWhere('slug', idOrSlug))
          .first()
      }

      // Pre-upload action
      const abort = applyFilters('pre_upload', req.files || [], req)
      if (abort === false) return res.status(400).json({ error: 'Upload aborted by filter' })

      const totalSize = parseInt(req.headers['content-length'] || 0, 10)
      const uploadId = req.headers['x-upload-id']
      let uploaded = 0

      // WebSocket for progress
      let ws
      if (uploadId && wss?.clients) {
        ws = [...wss.clients].find((c) => c.readyState === 1 && c.uploadId === uploadId)
      }

      // Track total upload progress
      req.on('data', (chunk) => {
        uploaded += chunk.length
        if (ws) ws.send(JSON.stringify({ progress: ((uploaded / totalSize) * 100).toFixed(2) }))
      })

      upload.array('files')(req, res, async (err) => {
        if (err) return next(err)
        if (!req.files?.length) return res.status(400).json({ error: 'No files provided' })

        const attachments = []

        for (const file of req.files) {
          // Filter filename
          const originalname = applyFilters('sanitize_file_name', decodeFilename(file.originalname))

          // Get relative path (like "2025/10/filename.png")
          const relativePath = path.relative(UPLOAD_BASE, file.path)
          let fileMeta = {
            filename: file.filename,
            original_name: originalname,
            mime_type: file.mimetype,
            size: file.size,
            path: relativePath
          }

          // Filter metadata
          fileMeta = applyFilters('attachment_metadata', fileMeta, req)

          // Insert attachment post
          const [attachmentId] = await knex(table('posts')).insert({
            slug: normalizeSlug(`${file.originalname.replace(/\s+/g, '_')  }-${  Date.now()}`),
            post_type_slug: 'attachments',
            post_type_id: null,
            status: 'inherit'
          })

          if (req?.user?.id) {
            await knex(table('post_authors')).insert({ post_id: attachmentId, user_id: req.user.id })
          }

          // Insert metadata for the attachment
          const metaInserts = [
            { post_id: attachmentId, field_slug: 'title', value: JSON.stringify(decodeFilename(file.originalname)) },
            { post_id: attachmentId, field_slug: 'file', value: JSON.stringify(fileMeta) },
            { post_id: attachmentId, field_slug: 'authors', value: JSON.stringify([req.user.id]) }
          ]
          await knex(table('post_meta')).insert(metaInserts)

          attachments.push({ attachment_id: attachmentId, ...fileMeta })
        }

        // Update post field if given
        if (post) {
          const value = JSON.stringify(attachments)
          const exists = await knex(table('post_meta')).where({ post_id: post.id, field_slug: fieldSlug }).first()
          if (exists)
            await knex(table('post_meta')).where({ post_id: post.id, field_slug: fieldSlug }).update({ value })
          else await knex(table('post_meta')).insert({ post_id: post.id, field_slug: fieldSlug, value })
        }

        // After upload action
        doAction('after_upload', { req, attachments, post })

        if (ws) ws.send(JSON.stringify({ progress: 100, done: true, files: attachments }))
        res.json({ success: true, attachments })
      })
    } catch (err) {
      next(err)
    }
  }

  router.post('/upload/:idOrSlug/:fieldSlug', uploadHandler)
  router.post('/upload', uploadHandler)

  return router
}
