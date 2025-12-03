import type { Router, Response, NextFunction } from 'express'
import express from 'express'

interface Option {
  id: number
  name: string
  value: string
  autoload: boolean | number
  created_at: Date
  updated_at: Date
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /options:
   *   get:
   *     tags:
   *       - Options
   *     summary: List all options
   *     description: Returns a paginated list of site options with search capability
   *     security:
   *       - bearerAuth: []
   *     parameters:
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
   *           description: JSON array of fields to search
   *     responses:
   *       200:
   *         description: Paginated list of options
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 items:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Option'
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
  router.get('/', async (req, res: Response, _next: NextFunction) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    const { knex, table } = context

    const hasAccess = await typedReq.guard.user({ canOneOf: ['read', 'read_option'], userId: typedReq?.user?.id })

    const {
      limit = '10',
      offset = '0',
      orderBy = 'id',
      sort = 'desc',
      search,
      searchable = JSON.stringify(['name', 'value'])
    } = typedReq.query as Record<string, string>
    const coreFields = ['id', 'name', 'value', 'autoload', 'created_at', 'updated_at']

    let searchFields: string[] = []
    try {
      searchFields = JSON.parse(searchable)
    } catch (e) {}

    const searchableCore = searchFields?.filter((field) => coreFields.includes(field)) || []

    let query = knex(table('options'))

    if (!hasAccess) {
      return res.json({
        items: [],
        total: 0,
        limit: 0,
        offset: 0
      })
    }

    // Count total (without pagination)
    const totals = await query
      .clone()
      .select(
        knex.raw(`
          COUNT(*) as total
        `)
      )
      .first() as { total: number }

    const total = totals.total

    if (search) {
      query = query.andWhere((qb) => {
        // search in options table fields
        searchableCore.forEach((col, i) => {
          const clause = `%${search}%`
          if (i === 0) {
            qb.where(col, 'like', clause)
          } else {
            qb.orWhere(col, 'like', clause)
          }
        })
      })
    }

    const totalCurrentResult = await query.clone().count('* as count').first() as { count: number } | undefined
    const totalCurrent = totalCurrentResult ? Number(totalCurrentResult.count) : 0

    // Apply pagination
    const rows = await query.clone().orderBy(orderBy, sort).limit(Number(limit)).offset(Number(offset)).select('*') as Option[]

    res.json({
      items: rows.map((row) => {
        row.autoload = row.autoload ? true : false
        return row
      }),
      total,
      total_current: totalCurrent,
      limit: Number(limit),
      offset: Number(offset)
    })
  })

  /**
   * @openapi
   * /options/{idOrName}:
   *   get:
   *     tags:
   *       - Options
   *     summary: Get an option by ID or name
   *     description: Returns a single option
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrName
   *         required: true
   *         schema:
   *           type: string
   *         description: Option ID or name
   *     responses:
   *       200:
   *         description: Option details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Option'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Option not found
   */
  router.get('/:idOrName', async (req, res: Response, _next: NextFunction) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    const { idOrName } = req.params

    const option = await knex(table('options'))
      .where((builder) => builder.where('id', idOrName).orWhere('name', idOrName))
      .first() as Option | undefined
    if (!option) return res.status(404).json({ error: 'Option not found' })

    const hasAccess = await typedReq.guard.user({ canOneOf: ['read', 'read_option'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    res.json(option)
  })

  /**
   * @openapi
   * /options:
   *   post:
   *     tags:
   *       - Options
   *     summary: Create a new option
   *     description: Creates a new site option
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - value
   *             properties:
   *               name:
   *                 type: string
   *                 example: site_title
   *               value:
   *                 type: string
   *                 example: My Website
   *               autoload:
   *                 type: boolean
   *                 default: true
   *     responses:
   *       200:
   *         description: Option created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Option'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  router.post('/', async (req, res: Response, next: NextFunction) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    const { knex, table, normalizeSlug } = context
    const { applyFilters, doAction } = typedReq.hooks
    const { name, value, autoload } = req.body

    const hasAccess = await typedReq.guard.user({ canOneOf: ['create', 'create_options'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    let coreData: Record<string, unknown> = {
      name: normalizeSlug(name || ''),
      value,
      autoload
    }

    const filtered = applyFilters('insert_option_data', { coreData })

    coreData = (filtered as { coreData: Record<string, unknown> })?.coreData || {}

    const [id] = await knex(table('options')).insert(coreData)

    const created = await knex(table('options')).where('id', id).first() as Option
    doAction('save_option', { req, res, next, option: created })
    doAction('insert_option', { req, res, next, option: created })

    process.send?.({ type: 'options_updated' })

    res.json(created)
  })

  /**
   * @openapi
   * /options/{idOrName}:
   *   patch:
   *     tags:
   *       - Options
   *     summary: Update an option
   *     description: Updates an option's value or autoload setting
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrName
   *         required: true
   *         schema:
   *           type: string
   *         description: Option ID or name
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               value:
   *                 type: string
   *               autoload:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Option updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Option'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Option not found
   */
  router.patch('/:idOrName', async (req, res: Response, next: NextFunction) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    const { doAction, applyFilters } = typedReq.hooks
    const { idOrName } = req.params
    const option = await knex(table('options')).where('id', idOrName).orWhere('name', idOrName).first() as Option | undefined
    if (!option) return res.status(404).json({ error: 'Option not found' })

    const id = option.id

    const hasAccess = await typedReq.guard.user({ canOneOf: ['edit', 'edit_options'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    let coreUpdates: Record<string, unknown> = {}

    for (const [key, val] of Object.entries(req.body)) {
      if (['id', 'name', 'created_at', 'updated_at'].includes(key)) continue
      if (['value', 'autoload'].includes(key)) {
        coreUpdates[key] = val
      }
    }

    doAction('pre_option_update', { req, res, next, option, coreData: coreUpdates })

    const filtered = applyFilters('insert_option_data', { coreData: coreUpdates }, option)

    coreUpdates = (filtered as { coreData: Record<string, unknown> })?.coreData || {}

    const hasCoreUpdates = Object.keys(coreUpdates).length > 0

    if (hasCoreUpdates) {
      await knex(table('options')).where('id', id).update(coreUpdates)
    }

    const updated = await knex(table('options')).where('id', id).first() as Option
    doAction('edit_option', { req, res, next, option: updated })
    doAction('save_option', { req, res, next, option: updated })

    process.send?.({ type: 'options_updated' })

    res.json(updated)
  })

  /**
   * @openapi
   * /options/{idOrName}:
   *   delete:
   *     tags:
   *       - Options
   *     summary: Delete an option
   *     description: Permanently deletes an option
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrName
   *         required: true
   *         schema:
   *           type: string
   *         description: Option ID or name
   *     responses:
   *       200:
   *         description: Option deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Option'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden or deletion aborted
   *       404:
   *         description: Option not found
   */
  router.delete('/:idOrName', async (req, res: Response, next: NextFunction) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    const { idOrName } = req.params
    const { doAction, applyFilters } = typedReq.hooks
    const option = await knex(table('options')).where('id', idOrName).orWhere('name', idOrName).first() as Option | undefined
    if (!option) return res.status(404).json({ error: 'Option not found' })

    const id = option.id

    const hasAccess = await typedReq.guard.user({ canOneOf: ['delete', 'delete_options'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const keepDeleting = applyFilters('pre_delete_option', { coreData: {} }, option)

    if (!keepDeleting) {
      return res.status(403).json({ error: 'Deletion aborted' })
    }

    doAction('before_delete_option', { req, res, next, option })
    await knex(table('options')).where('id', id).delete()
    doAction('delete_option', { req, res, next, option })

    process.send?.({ type: 'options_updated' })

    res.json(option)
  })

  return router
}
