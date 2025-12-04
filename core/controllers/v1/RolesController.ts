import type { Router, Response } from 'express'
import express from 'express'

interface RoleRequest extends HTMLDrop.ExtendedRequest {
  body: {
    name?: string
    slug?: string
    description?: string
    capability_ids?: number[]
  }
}

interface Role {
  id: number
  name: string
  slug: string
  description?: string
  created_at?: Date
  updated_at?: Date
}

interface Capability {
  id: number
  name: string
  slug: string
  role_id?: number
}

interface UserCount {
  role_id: number
  count: number
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /roles:
   *   get:
   *     tags:
   *       - Roles
   *     summary: List all roles
   *     description: Returns all roles with their capabilities and user counts
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of roles
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
   */
  router.get('/', async (req, res: Response) => {
    const typedReq = req as RoleRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles', 'read'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const roles = await db(table('roles')).select('*').orderBy('name') as Role[]

    // Get capabilities for each role
    const roleCapabilities = await db(table('role_capabilities'))
      .join(table('capabilities'), `${table('role_capabilities')}.capability_id`, '=', `${table('capabilities')}.id`)
      .select(
        `${table('role_capabilities')}.role_id`,
        `${table('capabilities')}.id`,
        `${table('capabilities')}.name`,
        `${table('capabilities')}.slug`
      ) as Capability[]

    // Get user counts for each role
    const userCounts = await db(table('user_roles'))
      .select('role_id')
      .count('* as count')
      .groupBy('role_id') as UserCount[]

    const userCountMap = userCounts.reduce<Record<number, number>>((acc, row) => {
      acc[row.role_id] = row.count
      return acc
    }, {})

    // Group capabilities by role
    const capMap = roleCapabilities.reduce<Record<number, Capability[]>>((acc, row) => {
      if (!acc[row.role_id!]) acc[row.role_id!] = []
      acc[row.role_id!].push({ id: row.id, name: row.name, slug: row.slug })
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
   *     description: Returns a single role with its capabilities and user count
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Role slug
   *         example: administrator
   *     responses:
   *       200:
   *         description: Role details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Role'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: Role not found
   */
  router.get('/:slug', async (req, res: Response) => {
    const typedReq = req as unknown as RoleRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { slug } = req.params

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles', 'read'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const role = await db(table('roles')).where('slug', slug).first() as Role | undefined
    if (!role) return res.status(404).json({ error: 'Role not found' })

    const capabilities = await db(table('role_capabilities'))
      .join(table('capabilities'), `${table('role_capabilities')}.capability_id`, '=', `${table('capabilities')}.id`)
      .where(`${table('role_capabilities')}.role_id`, role.id)
      .select(`${table('capabilities')}.id`, `${table('capabilities')}.name`, `${table('capabilities')}.slug`) as Capability[]

    const userCount = await db(table('user_roles'))
      .where('role_id', role.id)
      .count('* as count')
      .first() as { count: number } | undefined

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
   *     description: Creates a new role with the specified name and optional description
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
   *             properties:
   *               name:
   *                 type: string
   *                 description: Display name for the role
   *                 example: Editor
   *               slug:
   *                 type: string
   *                 description: URL-friendly identifier (auto-generated from name if not provided)
   *                 example: editor
   *               description:
   *                 type: string
   *                 description: Optional description of the role
   *                 example: Can edit and publish content
   *     responses:
   *       200:
   *         description: Role created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Role'
   *       400:
   *         description: Bad request - name required or slug already exists
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   */
  router.post('/', async (req, res: Response) => {
    const typedReq = req as RoleRequest
    const { knex, table, normalizeSlug } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { name, slug, description } = typedReq.body

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    if (!name) return res.status(400).json({ error: 'Name is required' })

    const roleSlug = normalizeSlug(slug || name)

    const existing = await db(table('roles')).where('slug', roleSlug).first()
    if (existing) return res.status(400).json({ error: 'Role with this slug already exists' })

    const [id] = await db(table('roles')).insert({
      name,
      slug: roleSlug,
      description: description || ''
    })

    const created = await db(table('roles')).where('id', id).first() as Role
    res.json({ ...created, capabilities: [], user_count: 0 })
  })

  /**
   * @openapi
   * /roles/{slug}:
   *   patch:
   *     tags:
   *       - Roles
   *     summary: Update a role
   *     description: Updates the name and/or description of an existing role
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Role slug
   *         example: editor
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *                 description: New display name for the role
   *                 example: Senior Editor
   *               description:
   *                 type: string
   *                 description: New description for the role
   *                 example: Can edit, publish, and manage other editors
   *     responses:
   *       200:
   *         description: Role updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Role'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: Role not found
   */
  router.patch('/:slug', async (req, res: Response) => {
    const typedReq = req as unknown as RoleRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { slug } = req.params
    const { name, description } = typedReq.body

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const role = await db(table('roles')).where('slug', slug).first() as Role | undefined
    if (!role) return res.status(404).json({ error: 'Role not found' })

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    updates.updated_at = knex.fn.now()

    await db(table('roles')).where('id', role.id).update(updates)

    const updated = await db(table('roles')).where('id', role.id).first() as Role

    const capabilities = await db(table('role_capabilities'))
      .join(table('capabilities'), `${table('role_capabilities')}.capability_id`, '=', `${table('capabilities')}.id`)
      .where(`${table('role_capabilities')}.role_id`, role.id)
      .select(`${table('capabilities')}.id`, `${table('capabilities')}.name`, `${table('capabilities')}.slug`) as Capability[]

    const userCount = await db(table('user_roles'))
      .where('role_id', role.id)
      .count('* as count')
      .first() as { count: number } | undefined

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
   *     description: Permanently deletes a role and removes it from all users. The administrator role cannot be deleted.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Role slug
   *         example: editor
   *     responses:
   *       200:
   *         description: Role deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 deleted:
   *                   $ref: '#/components/schemas/Role'
   *       400:
   *         description: Bad request - cannot delete administrator role
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: Role not found
   */
  router.delete('/:slug', async (req, res: Response) => {
    const typedReq = req as unknown as RoleRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { slug } = req.params

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    if (slug === 'administrator') {
      return res.status(400).json({ error: 'Cannot delete the administrator role' })
    }

    const role = await db(table('roles')).where('slug', slug).first() as Role | undefined
    if (!role) return res.status(404).json({ error: 'Role not found' })

    // Delete role capabilities first (cascade should handle this, but be explicit)
    await db(table('role_capabilities')).where('role_id', role.id).delete()

    // Delete user roles
    await db(table('user_roles')).where('role_id', role.id).delete()

    // Delete the role
    await db(table('roles')).where('id', role.id).delete()

    res.json({ success: true, deleted: role })
  })

  /**
   * @openapi
   * /roles/{slug}/capabilities:
   *   put:
   *     tags:
   *       - Roles
   *     summary: Set capabilities for a role
   *     description: Replaces all capabilities for a role with the provided list
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Role slug
   *         example: editor
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - capability_ids
   *             properties:
   *               capability_ids:
   *                 type: array
   *                 items:
   *                   type: integer
   *                 description: Array of capability IDs to assign to the role
   *                 example: [1, 2, 3, 5, 7]
   *     responses:
   *       200:
   *         description: Capabilities updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 capabilities:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Capability'
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - insufficient permissions
   *       404:
   *         description: Role not found
   */
  router.put('/:slug/capabilities', async (req, res: Response) => {
    const typedReq = req as unknown as RoleRequest
    const { knex, table } = context
    if (!knex) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }
    const db = knex
    const { slug } = req.params
    const { capability_ids } = typedReq.body

    const hasAccess = await typedReq.guard.user({ canOneOf: ['manage_roles'], userId: typedReq?.user?.id })
    if (!hasAccess) return res.status(403).json({ error: 'Permission denied' })

    const role = await db(table('roles')).where('slug', slug).first() as Role | undefined
    if (!role) return res.status(404).json({ error: 'Role not found' })

    // Delete existing capabilities
    await db(table('role_capabilities')).where('role_id', role.id).delete()

    // Insert new capabilities
    if (capability_ids && capability_ids.length > 0) {
      const inserts = capability_ids.map((capability_id: number) => ({
        role_id: role.id,
        capability_id
      }))
      await db(table('role_capabilities')).insert(inserts)
    }

    // Get updated capabilities
    const capabilities = await db(table('role_capabilities'))
      .join(table('capabilities'), `${table('role_capabilities')}.capability_id`, '=', `${table('capabilities')}.id`)
      .where(`${table('role_capabilities')}.role_id`, role.id)
      .select(`${table('capabilities')}.id`, `${table('capabilities')}.name`, `${table('capabilities')}.slug`) as Capability[]

    res.json({ success: true, capabilities })
  })

  return router
}
