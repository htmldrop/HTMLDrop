import express from 'express'
import { validate as validateEmail } from '../../utils/email.mjs'
import { hash, validate as validatePassword, verify } from '../../utils/password.mjs'

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

  // Helper: merge meta into a user object
  const withMeta = async (user) => {
    const { knex, table } = context
    if (!user) return null
    const meta = await knex(table('usermeta')).where('user_id', user.id)
    return {
      ...parseRow(user),
      ...meta.reduce((acc, row) => {
        acc[row.field_slug] = parseJSON(row.value)
        return acc
      }, {})
    }
  }

  const withMetaMany = async (users, req) => {
    const { knex, table } = context
    const { applyFilters } = req.hooks
    const ids = users.map((p) => p.id)
    const metas = await knex(table('usermeta')).whereIn('user_id', ids)
    const metaMap = {}
    for (const row of metas) {
      if (!metaMap[row.user_id]) metaMap[row.user_id] = {}
      metaMap[row.user_id][row.field_slug] = parseJSON(row.value)
    }

    return users.map((p) => {
      const userWithMeta = { ...parseRow(p), ...(metaMap[p.id] || {}) }
      // Apply content & title filters
      if (userWithMeta.username) {
        userWithMeta.username = applyFilters('the_username', userWithMeta.username, userWithMeta)
      }
      if (userWithMeta.picture) {
        userWithMeta.picture = applyFilters('the_picture', userWithMeta.picture, userWithMeta)
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
   *     parameters:
   *       - in: query
   *         name: ids
   *         schema:
   *           type: string
   *         description: Comma-separated user IDs to filter
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [active, inactive]
   *         description: Filter by user status
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
   *         description: Search term to filter users
   *       - in: query
   *         name: searchable
   *         schema:
   *           type: string
   *         description: JSON array of fields to search in
   *       - in: query
   *         name: trashed
   *         schema:
   *           type: boolean
   *         description: Include only trashed users
   *     responses:
   *       200:
   *         description: Paginated list of users
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 items:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/User'
   *                 total:
   *                   type: integer
   *                 total_current:
   *                   type: integer
   *                 total_inactive:
   *                   type: integer
   *                 total_active:
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

    const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_user'], userId: req?.user?.id })

    const {
      ids = '',
      status,
      limit = 10,
      offset = 0,
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
    } = req.query
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
      // 'password',
      'email_verified_at',
      'phone_verified_at',
      'created_at',
      'updated_at',
      'deleted_at'
    ]

    let searchFields = []
    try {
      searchFields = JSON.parse(searchable)
    } catch (e) {}

    const searchableCore = searchFields?.filter((field) => coreFields.includes(field)) || []
    const searchableMeta = searchFields?.filter((field) => !coreFields.includes(field)) || []

    let query = knex(table('users'))

    if (!hasAccess && !req?.user?.id) {
      return res.json({
        items: [],
        total: 0,
        limit: 0,
        offset: 0
      })
    } else if (!hasAccess) {
      query.where('id', req.user.id)
    }

    if (ids) {
      query.whereIn(
        'id',
        ids.split(',').map((id) => id.trim())
      )
    }

    // Count total (without pagination)
    const totals = await query
      .clone()
      .select(
        knex.raw(`
          SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as total,
          SUM(CASE WHEN status = 'inactive' AND deleted_at IS NULL THEN 1 ELSE 0 END) as total_inactive,
          SUM(CASE WHEN status = 'active' AND deleted_at IS NULL THEN 1 ELSE 0 END) as total_active,
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as total_trashed
        `)
      )
      .first()

    const total = totals.total
    const totalInactive = totals.total_inactive
    const totalActive = totals.total_active
    const totalTrashed = totals.total_trashed

    if (status) query = query.andWhere('status', status)

    if (search) {
      query = query.andWhere((qb) => {
        // search in users table fields
        searchableCore.forEach((col, i) => {
          const clause = `%${search}%`
          if (i === 0) {
            qb.where(col, 'like', clause)
          } else {
            qb.orWhere(col, 'like', clause)
          }
        })

        // search in meta table fields
        if (searchableMeta.length > 0) {
          qb.orWhereExists(function () {
            this.select('*')
              .from(table('usermeta'))
              .whereRaw(`${table('usermeta')  }.user_id = ${  table('users')  }.id`)
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

    if (req.query?.trashed) {
      query.whereNotNull('deleted_at')
    } else {
      query.whereNull('deleted_at')
    }

    const totalCurrentResult = await query.clone().count('* as count').first()
    const totalCurrent = totalCurrentResult ? Number(totalCurrentResult.count) : 0

    // Apply pagination
    const rows = await query.clone().orderBy(orderBy, sort).limit(Number(limit)).offset(Number(offset)).select('*')

    res.json({
      items: await withMetaMany(rows, req),
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
   *     description: Returns a single user with all metadata
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrUsername
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID or username
   *     responses:
   *       200:
   *         description: User details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: User not found
   */
  router.get('/:idOrUsername', async (req, res, next) => {
    const { knex, table } = context
    const { idOrUsername } = req.params
    const { applyFilters } = req.hooks

    const user = await knex(table('users'))
      .where((builder) => builder.where('id', idOrUsername).orWhere('username', idOrUsername))
      .first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const hasAccess = await req.guard.user({ canOneOf: ['read', 'read_user'], userId: req?.user?.id })
    if (!hasAccess && user.id !== req.user?.id) return res.status(403).json({ error: 'Permission denied' })

    const result = await withMeta(user)

    // Apply username & picture filter
    if (result.username) {
      result.username = applyFilters('the_username', result.username, result)
    }
    if (result.picture) {
      result.picture = applyFilters('the_picture', result.picture, result)
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
   *     description: Creates a new user with core fields and optional metadata
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               username:
   *                 type: string
   *                 example: johndoe
   *               email:
   *                 type: string
   *                 format: email
   *                 example: john@example.com
   *               password:
   *                 type: string
   *                 format: password
   *                 example: securePassword123
   *               first_name:
   *                 type: string
   *                 example: John
   *               middle_name:
   *                 type: string
   *                 example: M
   *               last_name:
   *                 type: string
   *                 example: Doe
   *               picture:
   *                 type: string
   *                 example: https://example.com/avatar.jpg
   *               locale:
   *                 type: string
   *                 example: en_US
   *               phone:
   *                 type: string
   *                 example: +1234567890
   *               status:
   *                 type: string
   *                 enum: [active, inactive]
   *                 default: active
   *     responses:
   *       200:
   *         description: User created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       400:
   *         description: Invalid email or password
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   */
  router.post('/', async (req, res, next) => {
    const { knex, table, normalizeSlug } = context
    const { applyFilters, doAction } = req.hooks
    let { username, status, first_name, middle_name, last_name, picture, locale, email, phone, password, ...metaData } =
      req.body

    const hasAccess = await req.guard.user({ canOneOf: ['create', 'create_users'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const emailValidation = validateEmail(email)
    const passwordValidation = validatePassword(password)

    if (!emailValidation.valid) {
      return res.status(400).send(emailValidation.message)
    }

    if (!passwordValidation.valid) {
      return res.status(400).send(passwordValidation.message)
    }

    let coreData = {
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

    const filtered = applyFilters('insert_user_data', { coreData, metaData })

    coreData = filtered?.coreData || {}
    metaData = filtered?.metaData || {}

    const [id] = await knex(table('users')).insert(coreData)

    const metaInserts = Object.entries(metaData).map(([field_slug, value]) => ({
      user_id: id,
      field_slug,
      value: JSON.stringify(value)
    }))

    if (metaInserts.length > 0) {
      await knex(table('usermeta')).insert(metaInserts)
    }

    const created = await knex(table('users')).where('id', id).first()
    const result = await withMeta(created)
    doAction('save_user', { req, res, next, user: result })
    doAction('insert_user', { req, res, next, user: result })
    if (coreData?.status === 'active') {
      doAction('activate_user', { req, res, next, user: result })
    }
    delete result.password
    res.json(result)
  })

  /**
   * @openapi
   * /users/{idOrUsername}:
   *   patch:
   *     tags:
   *       - Users
   *     summary: Update a user
   *     description: Updates user fields and metadata. Users can update their own profile or admins can update any user.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrUsername
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID or username
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               username:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *                 format: password
   *                 description: New password
   *               password_current:
   *                 type: string
   *                 format: password
   *                 description: Current password (required when changing password without admin access)
   *               first_name:
   *                 type: string
   *               middle_name:
   *                 type: string
   *               last_name:
   *                 type: string
   *               picture:
   *                 type: string
   *               locale:
   *                 type: string
   *               phone:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [active, inactive]
   *               deleted_at:
   *                 type: string
   *                 format: date-time
   *                 nullable: true
   *     responses:
   *       200:
   *         description: User updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       400:
   *         description: Invalid input or password validation failed
   *       401:
   *         description: Unauthorized or invalid credentials
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: User not found
   */
  router.patch('/:idOrUsername', async (req, res, next) => {
    const { knex, table, normalizeSlug } = context
    const { doAction, applyFilters } = req.hooks
    const { idOrUsername } = req.params
    const user = await knex(table('users')).where('id', idOrUsername).orWhere('username', idOrUsername).first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const id = user.id

    const hasAccess = await req.guard.user({ canOneOf: ['edit', 'edit_users'], userId: req?.user?.id })
    if (!hasAccess && id !== req?.user?.id) return res.status(403).json({ error: 'Permission denied' })

    if (typeof req.body.email !== 'undefined') {
      const emailValidation = validateEmail(req.body.email)
      if (!emailValidation.valid) {
        return res.status(400).send(emailValidation.message)
      }
    }

    if (typeof req.body.password !== 'undefined') {
      // @notice - If has write access, current password is not required to make a new one
      // Verify that current password also is passed
      if (!hasAccess && !req.body.password_current) {
        return res.status(400).send({ error: 'password_current required to change password' })
      }
      // Verify password
      let isVerified = false
      try {
        isVerified = await verify(req.body.password_current, user.password)
      } catch (e) {}
      if (!hasAccess && !isVerified) return res.status(401).send('Invalid credentials')
      // Validate new password
      const passwordValidation = validatePassword(req.body.password)
      if (!passwordValidation.valid) {
        return res.status(400).send(passwordValidation.message)
      }
    }

    let coreUpdates = {}
    let metaUpdates = {}

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
          val = val ? normalizeSlug(val) : null
        }
        if (['password'].includes(key)) {
          val = await hash(val)
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
      await knex(table('users')).where('id', id).update(coreUpdates)
    }

    for (const [field_slug, value] of Object.entries(metaUpdates)) {
      const exists = await knex(table('usermeta')).where({ user_id: id, field_slug }).first()
      if (exists) {
        await knex(table('usermeta'))
          .where({ user_id: id, field_slug })
          .update({ value: JSON.stringify(value) })
      } else {
        await knex(table('usermeta')).insert({ user_id: id, field_slug, value: JSON.stringify(value) })
      }
    }

    const updated = await knex(table('users')).where('id', id).first()
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
    delete result.password
    res.json(result)
  })

  /**
   * @openapi
   * /users/{idOrUsername}:
   *   delete:
   *     tags:
   *       - Users
   *     summary: Delete a user
   *     description: Soft deletes a user (moves to trash) or permanently deletes if permanently=true query param is provided
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrUsername
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID or username
   *       - in: query
   *         name: permanently
   *         schema:
   *           type: boolean
   *         description: If true, permanently delete the user
   *     responses:
   *       200:
   *         description: User deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions or deletion aborted
   *       404:
   *         description: User not found
   */
  router.delete('/:idOrUsername', async (req, res, next) => {
    const { knex, table, formatDate } = context
    const { idOrUsername } = req.params
    const { doAction, applyFilters } = req.hooks
    const user = await knex(table('users')).where('id', idOrUsername).orWhere('username', idOrUsername).first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const id = user.id

    const hasAccess = await req.guard.user({ canOneOf: ['delete', 'delete_users'], userId: req?.user?.id })
    if (!hasAccess && id !== req?.user?.id) return res.status(403).json({ error: 'Permission denied' })

    const deleted = await withMeta(user)

    const keepDeleting = applyFilters('pre_delete_user', { coreData: {}, metaData: {} }, deleted)

    if (!keepDeleting) {
      return res.status(403).json({ error: 'Deletion aborted' })
    }

    if (req.query?.permanently) {
      doAction('before_delete_user', { req, res, next, user: deleted })
      await knex(table('users')).where('id', id).delete()
    } else {
      await knex(table('users'))
        .where('id', id)
        .update({ deleted_at: formatDate(new Date()) })
    }
    if (req.query?.permanently) {
      doAction('delete_user', { req, res, next, user: deleted })
    } else {
      doAction('trash_user', { req, res, next, user: deleted })
    }
    delete deleted.password
    res.json(deleted)
  })

  /**
   * @openapi
   * /users/{idOrUsername}/roles:
   *   get:
   *     tags:
   *       - Users
   *     summary: Get roles for a user
   *     description: Returns all roles assigned to a specific user
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrUsername
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID or username
   *         example: johndoe
   *     responses:
   *       200:
   *         description: List of roles assigned to the user
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Role'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: User not found
   */
  router.get('/:idOrUsername/roles', async (req, res) => {
    const { knex, table } = context
    const { idOrUsername } = req.params

    const user = await knex(table('users'))
      .where((builder) => builder.where('id', idOrUsername).orWhere('username', idOrUsername))
      .first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles', 'read_user'], userId: req?.user?.id })
    if (!hasAccess && user.id !== req.user?.id) return res.status(403).json({ error: 'Permission denied' })

    const roles = await knex(table('user_roles'))
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
   *     description: Replaces all roles for a user with the provided list of role IDs
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: idOrUsername
   *         required: true
   *         schema:
   *           type: string
   *         description: User ID or username
   *         example: johndoe
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - role_ids
   *             properties:
   *               role_ids:
   *                 type: array
   *                 items:
   *                   type: integer
   *                 description: Array of role IDs to assign to the user
   *                 example: [1, 2]
   *     responses:
   *       200:
   *         description: Roles updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 roles:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Role'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: User not found
   */
  router.put('/:idOrUsername/roles', async (req, res) => {
    const { knex, table } = context
    const { idOrUsername } = req.params
    const { role_ids } = req.body

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const user = await knex(table('users'))
      .where((builder) => builder.where('id', idOrUsername).orWhere('username', idOrUsername))
      .first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    // Delete existing roles
    await knex(table('user_roles')).where('user_id', user.id).delete()

    // Insert new roles
    if (role_ids && role_ids.length > 0) {
      const inserts = role_ids.map(role_id => ({
        user_id: user.id,
        role_id
      }))
      await knex(table('user_roles')).insert(inserts)
    }

    // Get updated roles
    const roles = await knex(table('user_roles'))
      .join(table('roles'), `${table('user_roles')}.role_id`, '=', `${table('roles')}.id`)
      .where(`${table('user_roles')}.user_id`, user.id)
      .select(`${table('roles')}.id`, `${table('roles')}.name`, `${table('roles')}.slug`)

    res.json({ success: true, roles })
  })

  return router
}
