import express from 'express'

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

  const withMetaMany = async (terms, req) => {
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

  // Helper: merge meta into a term object
  const withMeta = async (term, req) => {
    const [result] = await withMetaMany([term], req)
    return result
  }

  // ------------------------
  // Helper: check route capability
  // ------------------------
  const checkCapability = async (req, routeCaps, postType, taxonomySlug, termId) => {
    const { getTaxonomy } = req.hooks
    const taxonomy = await getTaxonomy(postType, taxonomySlug)
    if (!taxonomy?.resolvedCapabilities?.length) return null

    const validCaps = taxonomy.resolvedCapabilities.filter((c) => routeCaps.includes(c))
    if (!validCaps.length) return null

    const hasAccess = await req.guard.user({ canOneOf: validCaps, termId })
    return hasAccess ? taxonomy : null
  }

  /**
   * @openapi
   * /posts/{postType}/taxonomies/{taxonomy}/terms:
   *   get:
   *     tags:
   *       - Terms
   *     summary: List taxonomy terms
   *     description: Returns a paginated list of terms for a taxonomy with search, filtering, and metadata support
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *       - in: query
   *         name: parent_id
   *         schema:
   *           type: integer
   *         description: Filter by parent term ID
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *       - in: query
   *         name: orderBy
   *         schema:
   *           type: string
   *           default: id
   *       - in: query
   *         name: sort
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *           default: desc
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *       - in: query
   *         name: searchable
   *         schema:
   *           type: string
   *       - in: query
   *         name: filters
   *         schema:
   *           type: string
   *       - in: query
   *         name: meta_query
   *         schema:
   *           type: string
   *       - in: query
   *         name: trashed
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: Paginated list of terms
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 items:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Term'
   *                 total:
   *                   type: integer
   *                 total_current:
   *                   type: integer
   *                 limit:
   *                   type: integer
   *                 offset:
   *                   type: integer
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  router.get('/', async (req, res, next) => {
    const { knex, table } = context
    const { postType, taxonomy } = req.params

    const canReadTaxonomy = await checkCapability(req, ['read', 'read_term'], postType, taxonomy)

    if (!canReadTaxonomy && !req?.user?.id) {
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
      parent_id,
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
      'parent_id',
      'slug',
      'status',
      'taxonomy_slug',
      'taxonomy_id',
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

    let query = knex(table('terms')).where('taxonomy_slug', taxonomy).where('post_type_slug', postType)

    if (!canReadTaxonomy) {
      // user can only see terms where they are an author
      query = query.whereExists(function () {
        this.select('*')
          .from(table('term_authors'))
          .whereRaw(`${table('term_authors')}.term_id = ${table('terms')}.id`)
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
    // Apply term field filters
    // ------------------------
    if (status) query.andWhere('status', status)
    if (parent_id) query.andWhere('parent_id', parent_id)

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
              .from(table('term_meta'))
              .whereRaw(`${table('term_meta')}.term_id = ${table('terms')}.id`)
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
              .from(table('term_meta'))
              .whereRaw(`${table('term_meta')}.term_id = ${table('terms')}.id`)
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
      items: await withMetaMany(rows, req),
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
   * /posts/{postType}/taxonomies/{taxonomy}/terms/{idOrSlug}:
   *   get:
   *     tags:
   *       - Terms
   *     summary: Get single term
   *     description: Retrieves a single term by ID or slug with full metadata and post count
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Term ID or slug
   *     responses:
   *       200:
   *         description: Term details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Term'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks read_term capability
   *       404:
   *         description: Term not found
   */
  router.get('/:idOrSlug', async (req, res, next) => {
    const { knex, table } = context
    const { postType, idOrSlug, taxonomy } = req.params

    const term = await knex(table('terms'))
      .where('taxonomy_slug', taxonomy)
      .where('post_type_slug', postType)
      .andWhere((builder) => builder.where('id', idOrSlug).orWhere('slug', idOrSlug))
      .first()
    if (!term) return res.status(404).json({ error: 'Term not found' })

    const canReadTaxonomy = await checkCapability(req, ['read_term'], postType, term.taxonomy_slug, term.id)
    const isOwner =
      req?.user?.id && (await knex(table('term_authors')).where({ term_id: term.id, user_id: req.user.id }).first())
    if (!canReadTaxonomy && !isOwner) return res.status(403).json({ error: 'Permission denied' })

    const result = await withMeta(term, req)

    res.json(result)
  })

  /**
   * @openapi
   * /posts/{postType}/taxonomies/{taxonomy}/terms:
   *   post:
   *     tags:
   *       - Terms
   *     summary: Create new term
   *     description: Creates a new term in the specified taxonomy with metadata and automatic author assignment
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *                 description: Term title (used for slug generation if slug not provided)
   *                 example: Technology
   *               slug:
   *                 type: string
   *                 description: Term slug (auto-generated from title if not provided)
   *                 example: technology
   *               status:
   *                 type: string
   *                 enum: [draft, published]
   *                 default: draft
   *                 description: Publication status
   *               parent_id:
   *                 type: integer
   *                 description: Parent term ID for hierarchical taxonomies
   *                 example: 1
   *           example:
   *             title: Technology
   *             status: published
   *     responses:
   *       200:
   *         description: Term created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Term'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks create_terms capability
   */
  router.post('/', async (req, res, next) => {
    const { knex, table, normalizeSlug } = context
    const { getFields, applyFilters, doAction } = req.hooks
    const { parent_id, slug, status, title } = req.body
    const { postType, taxonomy } = req.params

    const canCreateTaxonomy = await checkCapability(req, ['create_terms'], postType, taxonomy)
    if (!canCreateTaxonomy) return res.status(403).json({ error: 'Cannot create term for this taxonomy' })

    let coreData = {
      parent_id,
      slug: normalizeSlug(slug || title),
      taxonomy_slug: taxonomy ? normalizeSlug(taxonomy) : null,
      post_type_slug: postType,
      taxonomy_id: canCreateTaxonomy.id ? Number(canCreateTaxonomy.id) : null,
      status: status || 'draft'
    }

    let metaData = { ...req.body }
    delete metaData.slug
    delete metaData.status

    const fields = await getFields(taxonomy)
    if (fields.some((field) => field.field.slug === 'authors')) {
      metaData.authors = [req.user.id]
    }

    if (!fields.some((field) => field.field.slug === 'slug') && !slug) {
      delete coreData.slug
    }

    const filtered = applyFilters('insert_term_data', { coreData, metaData }, taxonomy)

    coreData = filtered?.coreData || {}
    metaData = filtered?.metaData || {}

    const [id] = await knex(table('terms')).insert(coreData)

    const metaInserts = Object.entries(metaData).map(([field_slug, value]) => ({
      term_id: id,
      field_slug,
      value: normalizeObject(value)
    }))

    if (metaInserts.length > 0) {
      await knex(table('term_meta')).insert(metaInserts)
    }

    const created = await knex(table('terms')).where('id', id).first()
    const result = await withMeta(created, req)

    // insert authors
    if (req?.user?.id) {
      await knex(table('term_authors')).insert({ term_id: id, user_id: req.user.id })
    }

    doAction('save_term', { req, res, next, taxonomy, term: result })
    doAction('insert_term', { req, res, next, taxonomy, term: result })
    if (coreData?.status === 'published') {
      doAction('publish_term', { req, res, next, taxonomy, term: result })
    }
    res.json(result)
  })

  /**
   * @openapi
   * /posts/{postType}/taxonomies/{taxonomy}/terms/{idOrSlug}:
   *   patch:
   *     tags:
   *       - Terms
   *     summary: Update term
   *     description: Updates an existing term with support for revisions, status transitions, and metadata updates
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Term ID or slug to update
   *       - in: query
   *         name: comment
   *         schema:
   *           type: string
   *         description: Revision comment for tracking changes
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *                 description: Updated term title
   *                 example: Updated Technology
   *               slug:
   *                 type: string
   *                 description: Updated term slug
   *                 example: updated-technology
   *               status:
   *                 type: string
   *                 enum: [draft, published]
   *                 description: Updated publication status
   *               parent_id:
   *                 type: integer
   *                 description: Updated parent term ID
   *               deleted_at:
   *                 type: string
   *                 format: date-time
   *                 description: Set to restore trashed terms (set to null)
   *           example:
   *             title: Updated Technology
   *             status: published
   *     responses:
   *       200:
   *         description: Term updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Term'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks edit_terms capability
   *       404:
   *         description: Term not found
   */
  router.patch('/:idOrSlug', async (req, res, next) => {
    const { knex, table, normalizeSlug } = context
    const { getFields, doAction, applyFilters } = req.hooks
    const { postType, idOrSlug, taxonomy } = req.params
    const term = await knex(table('terms'))
      .where('taxonomy_slug', taxonomy)
      .andWhere((builder) => {
        builder.where('id', idOrSlug).orWhere('slug', idOrSlug)
      })
      .first()
    if (!term) return res.status(404).json({ error: 'Term not found' })

    const id = term.id

    const canEditTaxonomy = await checkCapability(req, ['edit', 'edit_terms'], postType, term.taxonomy_slug, id)
    const isOwner =
      req?.user?.id && (await knex(table('term_authors')).where({ term_id: id, user_id: req.user.id }).first())
    if (!canEditTaxonomy && !isOwner) return res.status(403).json({ error: 'Permission denied' })

    let coreUpdates = {}
    let metaUpdates = {}

    const fields = await getFields(taxonomy)
    if (fields.some((field) => field.field.slug === 'authors')) {
      const meta = await knex(table('term_meta')).where('term_id', id).where('field_slug', 'authors').first()
      if (Array.isArray(meta?.value)) metaUpdates.authors = meta.value
      else if (typeof meta?.value === 'string') metaUpdates.authors = JSON.parse(meta?.value || '[]')
      if (!Array.isArray(metaUpdates.authors)) metaUpdates.authors = []
      if (!metaUpdates.authors?.find((id) => id === req.user.id)) {
        metaUpdates.authors.push(req.user.id)
      }
    }

    for (let [key, val] of Object.entries(req.body)) {
      if (
        ['parent_id', 'slug', 'status', 'taxonomy_slug', 'post_type_slug', 'taxonomy_id', 'deleted_at'].includes(key)
      ) {
        if (['slug', 'taxonomy_slug'].includes(key)) {
          val = val ? normalizeSlug(val) : null
        }
        if (['taxonomy_id'].includes(key)) {
          val = val ? Number(val) : null
        }
        if (['post_type_slug'].includes(key)) {
          val = postType
        }
        coreUpdates[key] = val
      } else {
        metaUpdates[key] = val
      }
    }

    const preTerm = await withMeta(term, req)

    doAction('pre_term_update', {
      req,
      res,
      next,
      taxonomy,
      term: preTerm,
      coreData: coreUpdates,
      metaData: metaUpdates
    })

    const filtered = applyFilters(
      'insert_term_data',
      { coreData: coreUpdates, metaData: metaUpdates },
      taxonomy,
      preTerm
    )

    coreUpdates = filtered?.coreData || {}
    metaUpdates = filtered?.metaData || {}

    const hasCoreUpdates = Object.keys(coreUpdates).length > 0
    const hasMetaUpdates = Object.keys(metaUpdates).length > 0

    if (!hasCoreUpdates && hasMetaUpdates) {
      coreUpdates.updated_at = knex.fn.now()
    }

    if (hasCoreUpdates || hasMetaUpdates) {
      await knex(table('terms')).where('id', id).update(coreUpdates)
      if (req?.user?.id) {
        await knex(table('term_authors'))
          .insert({
            term_id: id,
            user_id: req.user.id,
            updated_at: knex.fn.now()
          })
          .onConflict(['term_id', 'user_id'])
          .merge({
            updated_at: knex.fn.now()
          })
      }
    }

    for (const [field_slug, value] of Object.entries(metaUpdates)) {
      const exists = await knex(table('term_meta')).where({ term_id: id, field_slug }).first()
      if (exists) {
        await knex(table('term_meta'))
          .where({ term_id: id, field_slug })
          .update({ value: normalizeObject(value) })
      } else {
        await knex(table('term_meta')).insert({ term_id: id, field_slug, value: normalizeObject(value) })
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
        const lastRevision = await knex(table('term_revisions'))
          .where({ term_id: id, field_slug: slug })
          .orderBy('id', 'desc')
          .first()

        const normalizedNewValue = normalizeObject(newValue)
        const lastValue = lastRevision ? lastRevision.value : null

        if (lastValue !== normalizedNewValue) {
          await knex(table('term_revisions')).insert({
            parent_id: id,
            term_id: id,
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

    const updated = await knex(table('terms')).where('id', id).first()
    const result = await withMeta(updated, req)
    doAction('edit_term', { req, res, next, taxonomy, term: result })
    doAction('save_term', { req, res, next, taxonomy, term: result })
    if (!result?.deleted_at && term?.deleted_at) {
      doAction('untrash_term', { req, res, next, taxonomy, term: result })
    }
    if (term?.status !== result?.status) {
      doAction('transition_term_status', { req, res, next, taxonomy, term: result })
      if (result?.status === 'published') {
        doAction('publish_term', { req, res, next, taxonomy, term: result })
      }
    }
    res.json(result)
  })

  /**
   * @openapi
   * /posts/{postType}/taxonomies/{taxonomy}/terms/{idOrSlug}:
   *   delete:
   *     tags:
   *       - Terms
   *     summary: Delete or trash term
   *     description: Soft deletes (trash) or permanently deletes a term. By default, terms are moved to trash and can be restored.
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
   *         name: taxonomy
   *         required: true
   *         schema:
   *           type: string
   *         description: Taxonomy slug
   *       - in: path
   *         name: idOrSlug
   *         required: true
   *         schema:
   *           type: string
   *         description: Term ID or slug to delete
   *       - in: query
   *         name: permanently
   *         schema:
   *           type: boolean
   *           default: false
   *         description: If true, permanently deletes the term. Otherwise, moves to trash.
   *     responses:
   *       200:
   *         description: Term deleted or trashed successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Term'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - user lacks delete_terms capability or deletion was aborted by filter
   *       404:
   *         description: Term not found
   */
  router.delete('/:idOrSlug', async (req, res, next) => {
    const { knex, table, formatDate } = context
    const { postType, idOrSlug, taxonomy } = req.params
    const { doAction, applyFilters } = req.hooks
    const term = await knex(table('terms'))
      .where('taxonomy_slug', taxonomy)
      .where('post_type_slug', postType)
      .andWhere((builder) => {
        builder.where('id', idOrSlug).orWhere('slug', idOrSlug)
      })
      .first()
    if (!term) return res.status(404).json({ error: 'Term not found' })

    const id = term.id

    const canDeleteTaxonomy = await checkCapability(req, ['delete_terms'], postType, term.taxonomy_slug, id)
    const isOwner =
      req?.user?.id && (await knex(table('term_authors')).where({ term_id: id, user_id: req.user.id }).first())
    if (!canDeleteTaxonomy && !isOwner) return res.status(403).json({ error: 'Permission denied' })

    const deleted = await withMeta(term, req)

    const keepDeleting = applyFilters('pre_delete_term', { coreData: {}, metaData: {} }, taxonomy, deleted)

    if (!keepDeleting) {
      return res.status(403).json({ error: 'Deletion aborted' })
    }

    if (req.query?.permanently) {
      doAction('before_delete_term', { req, res, next, taxonomy, term: deleted })
      await knex(table('terms')).where('id', id).delete()
    } else {
      await knex(table('terms'))
        .where('id', id)
        .update({ deleted_at: formatDate(new Date()) })
    }
    if (req.query?.permanently) {
      doAction('delete_term', { req, res, next, taxonomy, term: deleted })
    } else {
      doAction('trash_term', { req, res, next, taxonomy, term: deleted })
    }
    res.json(deleted)
  })

  return router
}
