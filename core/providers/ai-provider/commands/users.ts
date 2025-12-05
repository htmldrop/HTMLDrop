import type { AICommand, AICommandResult } from '../../../registries/RegisterAICommands.ts'

type RegisterFn = (command: AICommand, priority?: number) => void

export default function registerUserCommands(register: RegisterFn, context: HTMLDrop.Context): void {
  const { knex, table } = context

  register({
    slug: 'users.list',
    name: 'List Users',
    description: 'List all users with pagination',
    category: 'users',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_user', 'manage_users'],
    parameters: [
      { name: 'limit', type: 'number', required: false, description: 'Number of users to return (default: 20)' },
      { name: 'offset', type: 'number', required: false, description: 'Number of users to skip (default: 0)' },
      { name: 'status', type: 'string', required: false, description: 'Filter by status', enum: ['active', 'inactive', 'trashed'] }
    ],
    contextProviders: ['users'],
    execute: async (params): Promise<AICommandResult> => {
      const { limit = 20, offset = 0, status } = params as { limit?: number; offset?: number; status?: string }

      let query = knex!(table('users'))
        .select('id', 'username', 'email', 'first_name', 'last_name', 'status', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)

      if (status) {
        query = query.where('status', status)
      }

      const users = await query
      const totalResult = await knex!(table('users')).count('id as count').first()
      const total = totalResult?.count || 0

      return {
        success: true,
        message: `Found ${users.length} users (${total} total)`,
        data: { users, total, limit, offset }
      }
    }
  })

  register({
    slug: 'users.get',
    name: 'Get User',
    description: 'Get detailed information about a specific user',
    category: 'users',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_user', 'manage_users'],
    parameters: [
      { name: 'identifier', type: 'string', required: true, description: 'User ID or username' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { identifier } = params as { identifier: string }

      const user = await knex!(table('users'))
        .where('id', identifier)
        .orWhere('username', identifier)
        .first()

      if (!user) {
        return { success: false, message: `User not found: ${identifier}`, error: 'NOT_FOUND' }
      }

      // Get user roles
      const roles = await knex!(table('user_roles'))
        .join(table('roles'), `${table('user_roles')}.role_id`, '=', `${table('roles')}.id`)
        .where(`${table('user_roles')}.user_id`, user.id)
        .select(`${table('roles')}.name`, `${table('roles')}.slug`)

      // Remove sensitive data
      const { password, ...safeUser } = user

      return {
        success: true,
        message: `User details for ${user.username}`,
        data: { ...safeUser, roles }
      }
    }
  })

  register({
    slug: 'users.create',
    name: 'Create User',
    description: 'Create a new user account',
    category: 'users',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['create_users'],
    parameters: [
      { name: 'username', type: 'string', required: true, description: 'Username (must be unique)' },
      { name: 'email', type: 'string', required: true, description: 'Email address (must be unique)' },
      { name: 'password', type: 'string', required: true, description: 'Password' },
      { name: 'first_name', type: 'string', required: false, description: 'First name' },
      { name: 'last_name', type: 'string', required: false, description: 'Last name' },
      { name: 'role_slug', type: 'string', required: false, description: 'Role slug to assign' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { username, email, password, first_name, last_name, role_slug } = params as {
        username: string
        email: string
        password: string
        first_name?: string
        last_name?: string
        role_slug?: string
      }

      // Check for existing user
      const existing = await knex!(table('users'))
        .where('username', username)
        .orWhere('email', email)
        .first()

      if (existing) {
        return {
          success: false,
          message: 'A user with this username or email already exists',
          error: 'USER_EXISTS'
        }
      }

      // Hash password
      const bcrypt = await import('bcrypt')
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10)
      const hashedPassword = await bcrypt.hash(password, saltRounds)

      // Create user
      const [userId] = await knex!(table('users')).insert({
        username,
        email,
        password: hashedPassword,
        first_name: first_name || '',
        last_name: last_name || '',
        status: 'active',
        created_at: knex!.fn.now(),
        updated_at: knex!.fn.now()
      })

      // Assign role if provided
      if (role_slug) {
        const role = await knex!(table('roles')).where('slug', role_slug).first()
        if (role) {
          await knex!(table('user_roles')).insert({
            user_id: userId,
            role_id: role.id
          })
        }
      }

      return {
        success: true,
        message: `User ${username} created successfully`,
        data: { id: userId, username, email }
      }
    }
  })

  register({
    slug: 'users.update',
    name: 'Update User',
    description: 'Update an existing user account',
    category: 'users',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['edit_users'],
    parameters: [
      { name: 'identifier', type: 'string', required: true, description: 'User ID or username' },
      { name: 'email', type: 'string', required: false, description: 'New email address' },
      { name: 'first_name', type: 'string', required: false, description: 'First name' },
      { name: 'last_name', type: 'string', required: false, description: 'Last name' },
      { name: 'status', type: 'string', required: false, description: 'Account status', enum: ['active', 'inactive'] }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { identifier, ...updates } = params as {
        identifier: string
        email?: string
        first_name?: string
        last_name?: string
        status?: string
      }

      const user = await knex!(table('users'))
        .where('id', identifier)
        .orWhere('username', identifier)
        .first()

      if (!user) {
        return { success: false, message: `User not found: ${identifier}`, error: 'NOT_FOUND' }
      }

      // Check for email conflict
      if (updates.email && updates.email !== user.email) {
        const emailExists = await knex!(table('users'))
          .where('email', updates.email)
          .whereNot('id', user.id)
          .first()
        if (emailExists) {
          return { success: false, message: 'Email already in use', error: 'EMAIL_EXISTS' }
        }
      }

      const updateData: Record<string, unknown> = { updated_at: knex!.fn.now() }
      if (updates.email) updateData.email = updates.email
      if (updates.first_name !== undefined) updateData.first_name = updates.first_name
      if (updates.last_name !== undefined) updateData.last_name = updates.last_name
      if (updates.status) updateData.status = updates.status

      await knex!(table('users')).where('id', user.id).update(updateData)

      return {
        success: true,
        message: `User ${user.username} updated successfully`
      }
    }
  })

  register({
    slug: 'users.delete',
    name: 'Delete User',
    description: 'Delete a user account (soft delete by default)',
    category: 'users',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['delete_users'],
    parameters: [
      { name: 'identifier', type: 'string', required: true, description: 'User ID or username' },
      { name: 'permanently', type: 'boolean', required: false, description: 'Permanently delete (true) or trash (false)' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { identifier, permanently = false } = params as { identifier: string; permanently?: boolean }

      const user = await knex!(table('users'))
        .where('id', identifier)
        .orWhere('username', identifier)
        .first()

      if (!user) {
        return { success: false, message: `User not found: ${identifier}`, error: 'NOT_FOUND' }
      }

      if (permanently) {
        await knex!(table('users')).where('id', user.id).del()
        return {
          success: true,
          message: `User ${user.username} permanently deleted`
        }
      } else {
        await knex!(table('users')).where('id', user.id).update({
          status: 'trashed',
          updated_at: knex!.fn.now()
        })
        return {
          success: true,
          message: `User ${user.username} moved to trash`
        }
      }
    }
  })

  register({
    slug: 'users.count',
    name: 'Count Users',
    description: 'Get user counts by status',
    category: 'users',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_user', 'manage_users'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      const total = await knex!(table('users')).count('id as count').first()
      const active = await knex!(table('users')).where('status', 'active').count('id as count').first()
      const inactive = await knex!(table('users')).where('status', 'inactive').count('id as count').first()
      const trashed = await knex!(table('users')).where('status', 'trashed').count('id as count').first()

      return {
        success: true,
        message: 'User counts retrieved',
        data: {
          total: total?.count || 0,
          active: active?.count || 0,
          inactive: inactive?.count || 0,
          trashed: trashed?.count || 0
        }
      }
    }
  })
}
