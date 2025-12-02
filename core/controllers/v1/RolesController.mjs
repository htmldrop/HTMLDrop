import express from 'express'

export default (context) => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /roles:
   *   get:
   *     tags:
   *       - Roles
   *     summary: List all roles
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of roles with capabilities and user counts
   */
  router.get('/', async (req, res) => {
    const { knex, table } = context

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles', 'read'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const roles = await knex(table('roles')).select('*').orderBy('name')

    // Get capabilities for each role
    const roleCapabilities = await knex(table('role_capabilities'))
      .join(table('capabilities'), `${table('role_capabilities')}.capability_id`, '=', `${table('capabilities')}.id`)
      .select(
        `${table('role_capabilities')}.role_id`,
        `${table('capabilities')}.id`,
        `${table('capabilities')}.name`,
        `${table('capabilities')}.slug`
      )

    // Get user counts for each role
    const userCounts = await knex(table('user_roles'))
      .select('role_id')
      .count('* as count')
      .groupBy('role_id')

    const userCountMap = userCounts.reduce((acc, row) => {
      acc[row.role_id] = row.count
      return acc
    }, {})

    // Group capabilities by role
    const capMap = roleCapabilities.reduce((acc, row) => {
      if (!acc[row.role_id]) acc[row.role_id] = []
      acc[row.role_id].push({ id: row.id, name: row.name, slug: row.slug })
      return acc
    }, {})

    const result = roles.map(role => ({
      ...role,
      capabilities: capMap[role.id] || [],
      user_count: userCountMap[role.id] || 0
    }))

    res.json(result)
  })

  /**
   * @openapi
   * /roles/{slug}:
   *   get:
   *     tags:
   *       - Roles
   *     summary: Get a role by slug
   *     security:
   *       - bearerAuth: []
   */
  router.get('/:slug', async (req, res) => {
    const { knex, table } = context
    const { slug } = req.params

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles', 'read'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const role = await knex(table('roles')).where('slug', slug).first()
    if (!role) return res.status(404).json({ error: 'Role not found' })

    const capabilities = await knex(table('role_capabilities'))
      .join(table('capabilities'), `${table('role_capabilities')}.capability_id`, '=', `${table('capabilities')}.id`)
      .where(`${table('role_capabilities')}.role_id`, role.id)
      .select(`${table('capabilities')}.id`, `${table('capabilities')}.name`, `${table('capabilities')}.slug`)

    const userCount = await knex(table('user_roles'))
      .where('role_id', role.id)
      .count('* as count')
      .first()

    res.json({
      ...role,
      capabilities,
      user_count: userCount?.count || 0
    })
  })

  /**
   * @openapi
   * /roles:
   *   post:
   *     tags:
   *       - Roles
   *     summary: Create a new role
   *     security:
   *       - bearerAuth: []
   */
  router.post('/', async (req, res) => {
    const { knex, table, normalizeSlug } = context
    const { name, slug, description } = req.body

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    if (!name) return res.status(400).json({ error: 'Name is required' })

    const roleSlug = normalizeSlug(slug || name)

    const existing = await knex(table('roles')).where('slug', roleSlug).first()
    if (existing) return res.status(400).json({ error: 'Role with this slug already exists' })

    const [id] = await knex(table('roles')).insert({
      name,
      slug: roleSlug,
      description: description || ''
    })

    const created = await knex(table('roles')).where('id', id).first()
    res.json({ ...created, capabilities: [], user_count: 0 })
  })

  /**
   * @openapi
   * /roles/{slug}:
   *   patch:
   *     tags:
   *       - Roles
   *     summary: Update a role
   *     security:
   *       - bearerAuth: []
   */
  router.patch('/:slug', async (req, res) => {
    const { knex, table } = context
    const { slug } = req.params
    const { name, description } = req.body

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const role = await knex(table('roles')).where('slug', slug).first()
    if (!role) return res.status(404).json({ error: 'Role not found' })

    const updates = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    updates.updated_at = knex.fn.now()

    await knex(table('roles')).where('id', role.id).update(updates)

    const updated = await knex(table('roles')).where('id', role.id).first()

    const capabilities = await knex(table('role_capabilities'))
      .join(table('capabilities'), `${table('role_capabilities')}.capability_id`, '=', `${table('capabilities')}.id`)
      .where(`${table('role_capabilities')}.role_id`, role.id)
      .select(`${table('capabilities')}.id`, `${table('capabilities')}.name`, `${table('capabilities')}.slug`)

    const userCount = await knex(table('user_roles'))
      .where('role_id', role.id)
      .count('* as count')
      .first()

    res.json({
      ...updated,
      capabilities,
      user_count: userCount?.count || 0
    })
  })

  /**
   * @openapi
   * /roles/{slug}:
   *   delete:
   *     tags:
   *       - Roles
   *     summary: Delete a role
   *     security:
   *       - bearerAuth: []
   */
  router.delete('/:slug', async (req, res) => {
    const { knex, table } = context
    const { slug } = req.params

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    if (slug === 'administrator') {
      return res.status(400).json({ error: 'Cannot delete the administrator role' })
    }

    const role = await knex(table('roles')).where('slug', slug).first()
    if (!role) return res.status(404).json({ error: 'Role not found' })

    // Delete role capabilities first (cascade should handle this, but be explicit)
    await knex(table('role_capabilities')).where('role_id', role.id).delete()

    // Delete user roles
    await knex(table('user_roles')).where('role_id', role.id).delete()

    // Delete the role
    await knex(table('roles')).where('id', role.id).delete()

    res.json({ success: true, deleted: role })
  })

  /**
   * @openapi
   * /roles/{slug}/capabilities:
   *   put:
   *     tags:
   *       - Roles
   *     summary: Set capabilities for a role (replaces all)
   *     security:
   *       - bearerAuth: []
   */
  router.put('/:slug/capabilities', async (req, res) => {
    const { knex, table } = context
    const { slug } = req.params
    const { capability_ids } = req.body

    const hasAccess = await req.guard.user({ canOneOf: ['manage_roles'], userId: req?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const role = await knex(table('roles')).where('slug', slug).first()
    if (!role) return res.status(404).json({ error: 'Role not found' })

    // Delete existing capabilities
    await knex(table('role_capabilities')).where('role_id', role.id).delete()

    // Insert new capabilities
    if (capability_ids && capability_ids.length > 0) {
      const inserts = capability_ids.map(capability_id => ({
        role_id: role.id,
        capability_id
      }))
      await knex(table('role_capabilities')).insert(inserts)
    }

    // Get updated capabilities
    const capabilities = await knex(table('role_capabilities'))
      .join(table('capabilities'), `${table('role_capabilities')}.capability_id`, '=', `${table('capabilities')}.id`)
      .where(`${table('role_capabilities')}.role_id`, role.id)
      .select(`${table('capabilities')}.id`, `${table('capabilities')}.name`, `${table('capabilities')}.slug`)

    res.json({ success: true, capabilities })
  })

  return router
}
