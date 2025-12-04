import type { Router, Response, NextFunction } from 'express'
import express from 'express'
import type { Knex } from 'knex'
import { validate as validateEmail } from '../../utils/email.ts'
import { hash, validate as validatePassword, verify } from '../../utils/password.ts'

interface User {
  id: number
  username?: string
  email: string
  password?: string
  first_name?: string
  middle_name?: string
  last_name?: string
  picture?: string
  locale?: string
  phone?: string
  status?: string
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

interface UserMeta {
  user_id: number
  field_slug: string
  value: string
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  const parseJSON = (value: unknown): unknown => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }
    return value
  }

  const parseRow = (row: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, parseJSON(v)]))

  // Helper: merge meta into a user object
  const withMeta = async (user: User | null): Promise<Record<string, unknown> | null> => {
    const { knex, table } = context
    if (!knex) return user as Record<string, unknown> | null
    if (!user) return null
    const meta = (await knex(table('usermeta')).where('user_id', user.id)) as UserMeta[]
    return {
      ...parseRow(user as Record<string, unknown>),
      ...meta.reduce(
        (acc, row) => {
          acc[row.field_slug] = parseJSON(row.value)
          return acc
        },
        {} as Record<string, unknown>
      )
    }
  }

  const withMetaMany = async (users: User[], req: HTMLDrop.ExtendedRequest): Promise<Record<string, unknown>[]> => {
    const { knex, table } = context
    if (!knex) return users.map(u => parseRow(u as Record<string, unknown>))
    const { applyFilters } = req.hooks
    const ids = users.map((p) => p.id)
    const metas = (await knex(table('usermeta')).whereIn('user_id', ids)) as UserMeta[]
    const metaMap: Record<number, Record<string, unknown>> = {}
    for (const row of metas) {
      if (!metaMap[row.user_id]) metaMap[row.user_id] = {}
      metaMap[row.user_id][row.field_slug] = parseJSON(row.value)
    }

    return users.map((p) => {
      const userWithMeta = { ...parseRow(p as Record<string, unknown>), ...(metaMap[p.id] || {}) }
      // Apply content & title filters
      if (userWithMeta.username) {
        userWithMeta.username = applyFilters('the_username', userWithMeta.username as string, userWithMeta)
      }
      if (userWithMeta.picture) {
        userWithMeta.picture = applyFilters('the_picture', userWithMeta.picture as string, userWithMeta)
      }
      delete userWithMeta.password
      return userWithMeta
    })
  }

  /**
   * @openapi
   * /users:
   *   get:
   *     tags:
   *       - Users
   *     summary: List all users
   *     description: Returns a paginated list of users with search, filtering, and sorting capabilities
   *     security:
   *       - bearerAuth: []
   */
  router.get('/', async (req, res: Response, _next: NextFunction) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex

    const hasAccess = await typedReq.guard.user({ canOneOf: ['read', 'read_user'], userId: typedReq?.user?.id })

    const queryParams = typedReq.query as Record<string, string | undefined>
    const {
      ids = '',
      status,
      limit = '10',
      offset = '0',
      orderBy = 'id',
      sort = 'desc',
      search,
      searchable = JSON.stringify([
        'username',
        'email',
        'phone',
        'first_name',
        'last_name',
        'middle_name',
        'status',
        'picture',
        'locale',
        'created_at',
        'updated_at',
        'deleted_at',
        'email_verified_at',
        'phone_verified_at'
      ])
    } = queryParams
    const coreFields = [
      'id',
      'username',
      'first_name',
      'middle_name',
      'last_name',
      'picture',
      'locale',
      'email',
      'phone',
      'email_verified_at',
      'phone_verified_at',
      'created_at',
      'updated_at',
      'deleted_at'
    ]

    let searchFields: string[] = []
    try {
      searchFields = JSON.parse(searchable || '[]')
    } catch {
      // ignore parse errors
    }

    const searchableCore = searchFields?.filter((field) => coreFields.includes(field)) || []
    const searchableMeta = searchFields?.filter((field) => !coreFields.includes(field)) || []

    let query = db(table('users'))

    if (!hasAccess && !typedReq?.user?.id) {
      return res.json({
        items: [],
        total: 0,
        limit: 0,
        offset: 0
      })
    } else if (!hasAccess) {
      query.where('id', typedReq.user!.id)
    }

    if (ids) {
      query.whereIn(
        'id',
        ids.split(',').map((id) => id.trim())
      )
    }

    // Count total (without pagination)
    const totals = (await query
      .clone()
      .select(
        knex.raw(`
          SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as total,
          SUM(CASE WHEN status = 'inactive' AND deleted_at IS NULL THEN 1 ELSE 0 END) as total_inactive,
          SUM(CASE WHEN status = 'active' AND deleted_at IS NULL THEN 1 ELSE 0 END) as total_active,
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as total_trashed
        `)
      )
      .first()) as { total: number; total_inactive: number; total_active: number; total_trashed: number }

    const total = totals.total
    const totalInactive = totals.total_inactive
    const totalActive = totals.total_active
    const totalTrashed = totals.total_trashed

    if (status) query = query.andWhere('status', status)

    if (search) {
      query = query.andWhere((qb) => {
        searchableCore.forEach((col, i) => {
          const clause = `%${search}%`
          if (i === 0) {
            qb.where(col, 'like', clause)
          } else {
            qb.orWhere(col, 'like', clause)
          }
        })

        if (searchableMeta.length > 0) {
          qb.orWhereExists(function (this: Knex.QueryBuilder) {
            this.select('*')
              .from(table('usermeta'))
              .whereRaw(`${table('usermeta')}.user_id = ${table('users')}.id`)
              .andWhere((builder) => {
                searchableMeta.forEach((col, i) => {
                  const clause = `%${search}%`
                  if (i === 0) {
                    builder.where('field_slug', col).andWhere('value', 'like', clause)
                  } else {
                    builder.orWhere((q2) => {
                      q2.where('field_slug', col).andWhere('value', 'like', clause)
                    })
                  }
                })
              })
          })
        }
      })
    }

    if (queryParams?.trashed) {
      query.whereNotNull('deleted_at')
    } else {
      query.whereNull('deleted_at')
    }

    const totalCurrentResult = (await query.clone().count('* as count').first()) as { count: number } | undefined
    const totalCurrent = totalCurrentResult ? Number(totalCurrentResult.count) : 0

    const rows = (await query
      .clone()
      .orderBy(orderBy, sort)
      .limit(Number(limit))
      .offset(Number(offset))
      .select('*')) as User[]

    res.json({
      items: await withMetaMany(rows, typedReq),
      total,
      total_current: totalCurrent,
      total_inactive: totalInactive,
      total_active: totalActive,
      total_trashed: totalTrashed,
      limit: Number(limit),
      offset: Number(offset)
    })
  })

  /**
   * @openapi
   * /users/{idOrUsername}:
   *   get:
   *     tags:
   *       - Users
   *     summary: Get a user by ID or username
   */
  router.get('/:idOrUsername', async (req, res: Response, _next: NextFunction) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { idOrUsername } = req.params
    const { applyFilters } = typedReq.hooks

    const user = (await db(table('users'))
      .where((builder) => builder.where('id', idOrUsername).orWhere('username', idOrUsername))
      .first()) as User | undefined
    if (!user) return res.status(404).json({ error: 'User not found' })

    const hasAccess = await typedReq.guard.user({ canOneOf: ['read', 'read_user'], userId: typedReq?.user?.id })
    if (!hasAccess && user.id !== typedReq.user?.id) return res.status(403).json({ error: 'Permission denied' })

    const result = await withMeta(user)
    if (!result) return res.status(404).json({ error: 'User not found' })

    if (result.username) {
      result.username = applyFilters('the_username', result.username as string, result)
    }
    if (result.picture) {
      result.picture = applyFilters('the_picture', result.picture as string, result)
    }

    delete result.password
    res.json(result)
  })

  /**
   * @openapi
   * /users:
   *   post:
   *     tags:
   *       - Users
   *     summary: Create a new user
   */
  router.post('/', async (req, res: Response, next: NextFunction) => {
    const typedReq = req as HTMLDrop.ExtendedRequest
    const { knex, table, normalizeSlug } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { applyFilters, doAction } = typedReq.hooks
    let { username, status, first_name, middle_name, last_name, picture, locale, email, phone, password, ...metaData } =
      req.body

    const hasAccess = await typedReq.guard.user({ canOneOf: ['create', 'create_users'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const emailValidation = validateEmail(email)
    const passwordValidation = validatePassword(password)

    if (!emailValidation.valid) {
      return res.status(400).send(emailValidation.message)
    }

    if (!passwordValidation.valid) {
      return res.status(400).send(passwordValidation.message)
    }

    let coreData: Record<string, unknown> = {
      username: normalizeSlug(username) || normalizeSlug(email),
      first_name,
      middle_name,
      last_name,
      picture,
      locale,
      email,
      phone,
      password: await hash(password),
      status: status || 'active'
    }

    const filtered = applyFilters('insert_user_data', { coreData, metaData }, null)

    coreData = filtered?.coreData || {}
    metaData = filtered?.metaData || {}

    const [id] = await db(table('users')).insert(coreData)

    const metaInserts = Object.entries(metaData).map(([field_slug, value]) => ({
      user_id: id,
      field_slug,
      value: JSON.stringify(value)
    }))

    if (metaInserts.length > 0) {
      await db(table('usermeta')).insert(metaInserts)
    }

    const created = (await db(table('users')).where('id', id).first()) as User
    const result = await withMeta(created)
    doAction('save_user', { req, res, next, user: result })
    doAction('insert_user', { req, res, next, user: result })
    if (coreData?.status === 'active') {
      doAction('activate_user', { req, res, next, user: result })
    }
    if (result) delete result.password
    res.json(result)
  })

  /**
   * @openapi
   * /users/{idOrUsername}:
   *   patch:
   *     tags:
   *       - Users
   *     summary: Update a user
   */
  router.patch('/:idOrUsername', async (req, res: Response, next: NextFunction) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table, normalizeSlug } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { doAction, applyFilters } = typedReq.hooks
    const { idOrUsername } = req.params
    const user = (await db(table('users'))
      .where('id', idOrUsername)
      .orWhere('username', idOrUsername)
      .first()) as User | undefined
    if (!user) return res.status(404).json({ error: 'User not found' })

    const id = user.id

    const hasAccess = await typedReq.guard.user({ canOneOf: ['edit', 'edit_users'], userId: typedReq?.user?.id })
    if (!hasAccess && id !== typedReq?.user?.id) return res.status(403).json({ error: 'Permission denied' })

    if (typeof req.body.email !== 'undefined') {
      const emailValidation = validateEmail(req.body.email)
      if (!emailValidation.valid) {
        return res.status(400).send(emailValidation.message)
      }
    }

    if (typeof req.body.password !== 'undefined') {
      if (!hasAccess && !req.body.password_current) {
        return res.status(400).send({ error: 'password_current required to change password' })
      }
      let isVerified = false
      try {
        isVerified = await verify(req.body.password_current, user.password || '')
      } catch {
        // ignore
      }
      if (!hasAccess && !isVerified) return res.status(401).send('Invalid credentials')
      const passwordValidation = validatePassword(req.body.password)
      if (!passwordValidation.valid) {
        return res.status(400).send(passwordValidation.message)
      }
    }

    let coreUpdates: Record<string, unknown> = {}
    let metaUpdates: Record<string, unknown> = {}

    for (let [key, val] of Object.entries(req.body)) {
      if (['id', 'email_verified_at', 'phone_verified_at', 'created_at', 'updated_at'].includes(key)) continue
      if (
        [
          'username',
          'status',
          'first_name',
          'middle_name',
          'last_name',
          'picture',
          'locale',
          'email',
          'phone',
          'password',
          'deleted_at'
        ].includes(key)
      ) {
        if (['username'].includes(key)) {
          val = val ? normalizeSlug(val as string) : null
        }
        if (['password'].includes(key)) {
          val = await hash(val as string)
        }
        coreUpdates[key] = val
      } else {
        metaUpdates[key] = val
      }
    }

    const preUser = await withMeta(user)

    doAction('pre_user_update', { req, res, next, user: preUser, coreData: coreUpdates, metaData: metaUpdates })

    const filtered = applyFilters('insert_user_data', { coreData: coreUpdates, metaData: metaUpdates }, preUser)

    coreUpdates = filtered?.coreData || {}
    metaUpdates = filtered?.metaData || {}

    const hasCoreUpdates = Object.keys(coreUpdates).length > 0
    const hasMetaUpdates = Object.keys(metaUpdates).length > 0

    if (!hasCoreUpdates && hasMetaUpdates) {
      coreUpdates.updated_at = knex.fn.now()
    }

    if (hasCoreUpdates || hasMetaUpdates) {
      await db(table('users')).where('id', id).update(coreUpdates)
    }

    for (const [field_slug, value] of Object.entries(metaUpdates)) {
      const exists = await db(table('usermeta')).where({ user_id: id, field_slug }).first()
      if (exists) {
        await db(table('usermeta'))
          .where({ user_id: id, field_slug })
          .update({ value: JSON.stringify(value) })
      } else {
        await db(table('usermeta')).insert({ user_id: id, field_slug, value: JSON.stringify(value) })
      }
    }

    const updated = (await db(table('users')).where('id', id).first()) as User
    const result = await withMeta(updated)
    doAction('edit_user', { req, res, next, user: result })
    doAction('save_user', { req, res, next, user: result })
    if (!result?.deleted_at && user?.deleted_at) {
      doAction('untrash_user', { req, res, next, user: result })
    }
    if (user?.status !== result?.status) {
      doAction('transition_user_status', { req, res, next, user: result })
      if (result?.status === 'active') {
        doAction('activate_user', { req, res, next, user: result })
      }
    }
    if (result) delete result.password
    res.json(result)
  })

  /**
   * @openapi
   * /users/{idOrUsername}:
   *   delete:
   *     tags:
   *       - Users
   *     summary: Delete a user
   */
  router.delete('/:idOrUsername', async (req, res: Response, next: NextFunction) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table, formatDate } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { idOrUsername } = req.params
    const { doAction, applyFilters } = typedReq.hooks
    const user = (await db(table('users'))
      .where('id', idOrUsername)
      .orWhere('username', idOrUsername)
      .first()) as User | undefined
    if (!user) return res.status(404).json({ error: 'User not found' })

    const id = user.id

    const hasAccess = await typedReq.guard.user({ canOneOf: ['delete', 'delete_users'], userId: typedReq?.user?.id })
    if (!hasAccess && id !== typedReq?.user?.id) return res.status(403).json({ error: 'Permission denied' })

    const deleted = await withMeta(user)

    const keepDeleting = applyFilters('pre_delete_user', { coreData: {}, metaData: {} }, deleted)

    if (!keepDeleting) {
      return res.status(403).json({ error: 'Deletion aborted' })
    }

    if (typedReq.query?.permanently) {
      doAction('before_delete_user', { req, res, next, user: deleted })
      await db(table('users')).where('id', id).delete()
    } else {
      await db(table('users'))
        .where('id', id)
        .update({ deleted_at: formatDate(new Date()) })
    }
    if (typedReq.query?.permanently) {
      doAction('delete_user', { req, res, next, user: deleted })
    } else {
      doAction('trash_user', { req, res, next, user: deleted })
    }
    if (deleted) delete deleted.password
    res.json(deleted)
  })

  /**
   * @openapi
   * /users/{idOrUsername}/roles:
   *   get:
   *     tags:
   *       - Users
   *     summary: Get roles for a user
   */
  router.get('/:idOrUsername/roles', async (req, res: Response) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { idOrUsername } = req.params

    const user = (await db(table('users'))
      .where((builder) => builder.where('id', idOrUsername).orWhere('username', idOrUsername))
      .first()) as User | undefined
    if (!user) return res.status(404).json({ error: 'User not found' })

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles', 'read_user'], userId: typedReq?.user?.id })
    if (!hasAccess && user.id !== typedReq.user?.id) return res.status(403).json({ error: 'Permission denied' })

    const roles = await db(table('user_roles'))
      .join(table('roles'), `${table('user_roles')}.role_id`, '=', `${table('roles')}.id`)
      .where(`${table('user_roles')}.user_id`, user.id)
      .select(`${table('roles')}.id`, `${table('roles')}.name`, `${table('roles')}.slug`)

    res.json(roles)
  })

  /**
   * @openapi
   * /users/{idOrUsername}/roles:
   *   put:
   *     tags:
   *       - Users
   *     summary: Set roles for a user
   */
  router.put('/:idOrUsername/roles', async (req, res: Response) => {
    const typedReq = req as unknown as HTMLDrop.ExtendedRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { idOrUsername } = req.params
    const { role_ids } = req.body

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const user = (await db(table('users'))
      .where((builder) => builder.where('id', idOrUsername).orWhere('username', idOrUsername))
      .first()) as User | undefined
    if (!user) return res.status(404).json({ error: 'User not found' })

    await db(table('user_roles')).where('user_id', user.id).delete()

    if (role_ids && role_ids.length > 0) {
      const inserts = role_ids.map((role_id: number) => ({
        user_id: user.id,
        role_id
      }))
      await db(table('user_roles')).insert(inserts)
    }

    const roles = await db(table('user_roles'))
      .join(table('roles'), `${table('user_roles')}.role_id`, '=', `${table('roles')}.id`)
      .where(`${table('user_roles')}.user_id`, user.id)
      .select(`${table('roles')}.id`, `${table('roles')}.name`, `${table('roles')}.slug`)

    res.json({ success: true, roles })
  })

  return router
}
