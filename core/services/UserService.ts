/**
 * User Service
 *
 * Business logic for user operations
 */

import bcrypt from 'bcrypt'
import type { Knex } from 'knex'
import { BCRYPT_ROUNDS } from '../utils/constants.ts'

interface User {
  id: number
  username: string
  email: string
  password?: string
  first_name: string
  last_name: string
  created_at: Date
}

interface Role {
  id: number
  name: string
  slug: string
  description?: string
}

interface UserMeta {
  id: number
  user_id: number
  meta_key: string
  meta_value: string
}

interface GetUsersOptions {
  limit?: number | string
  offset?: number | string
  role?: string
  search?: string
}

interface CreateUserData {
  username: string
  email: string
  password: string
  first_name?: string
  last_name?: string
}

interface UpdateUserData {
  username?: string
  email?: string
  password?: string
  first_name?: string
  last_name?: string
}

class UserService {
  private context: HTMLDrop.Context
  private knex: Knex
  private table: (name: string) => string

  constructor(context: HTMLDrop.Context) {
    if (!context.knex) {
      throw new Error('UserService requires a database connection')
    }
    this.context = context
    this.knex = context.knex
    this.table = context.table.bind(context)
  }

  /**
   * Get all users with pagination
   */
  async getUsers(options: GetUsersOptions = {}): Promise<Partial<User>[]> {
    const { limit = 10, offset = 0, role, search } = options

    let query = this.knex(this.table('users')).select('id', 'username', 'email', 'first_name', 'last_name', 'created_at')

    if (role) {
      query = query
        .join(this.table('user_roles'), `${this.table('users')}.id`, `${this.table('user_roles')}.user_id`)
        .join(this.table('roles'), `${this.table('user_roles')}.role_id`, `${this.table('roles')}.id`)
        .where(`${this.table('roles')}.slug`, role)
    }

    if (search) {
      query = query.where((builder) => {
        builder
          .where('username', 'like', `%${search}%`)
          .orWhere('email', 'like', `%${search}%`)
          .orWhere('first_name', 'like', `%${search}%`)
          .orWhere('last_name', 'like', `%${search}%`)
      })
    }

    return query.limit(parseInt(String(limit))).offset(parseInt(String(offset))).orderBy('created_at', 'desc')
  }

  /**
   * Get user by ID
   */
  async getUserById(id: number): Promise<Partial<User> | undefined> {
    return this.knex(this.table('users'))
      .where({ id })
      .select('id', 'username', 'email', 'first_name', 'last_name', 'created_at')
      .first()
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.knex(this.table('users')).where({ email }).first()
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.knex(this.table('users')).where({ username }).first()
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<number> {
    const { username, email, password, first_name, last_name } = data

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

    const [userId] = await this.knex(this.table('users')).insert({
      username,
      email,
      password: hashedPassword,
      first_name: first_name || username,
      last_name: last_name || ''
    })

    // Assign default role (subscriber)
    const subscriberRole = await this.knex(this.table('roles')).where({ slug: 'subscriber' }).first()

    if (subscriberRole) {
      await this.knex(this.table('user_roles')).insert({
        user_id: userId,
        role_id: subscriberRole.id
      })
    }

    return userId
  }

  /**
   * Update user
   */
  async updateUser(id: number, data: UpdateUserData): Promise<void> {
    const { username, email, first_name, last_name, password } = data

    const updateData: Record<string, string> = {}
    if (username !== undefined) updateData.username = username
    if (email !== undefined) updateData.email = email
    if (first_name !== undefined) updateData.first_name = first_name
    if (last_name !== undefined) updateData.last_name = last_name

    if (password) {
      updateData.password = await bcrypt.hash(password, BCRYPT_ROUNDS)
    }

    if (Object.keys(updateData).length > 0) {
      await this.knex(this.table('users')).where({ id }).update(updateData)
    }
  }

  /**
   * Delete user
   */
  async deleteUser(id: number): Promise<void> {
    // Delete user relationships
    await this.knex(this.table('user_roles')).where({ user_id: id }).del()
    await this.knex(this.table('user_capabilities')).where({ user_id: id }).del()
    await this.knex(this.table('usermeta')).where({ user_id: id }).del()
    await this.knex(this.table('refresh_tokens')).where({ user_id: id }).del()

    // Delete user
    await this.knex(this.table('users')).where({ id }).del()
  }

  /**
   * Verify user password
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: number): Promise<Role[]> {
    return this.knex(this.table('roles'))
      .join(this.table('user_roles'), `${this.table('roles')}.id`, `${this.table('user_roles')}.role_id`)
      .where(`${this.table('user_roles')}.user_id`, userId)
      .select(`${this.table('roles')}.*`)
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: number, roleId: number): Promise<void> {
    const existing = await this.knex(this.table('user_roles')).where({ user_id: userId, role_id: roleId }).first()

    if (!existing) {
      await this.knex(this.table('user_roles')).insert({
        user_id: userId,
        role_id: roleId
      })
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: number, roleId: number): Promise<void> {
    await this.knex(this.table('user_roles')).where({ user_id: userId, role_id: roleId }).del()
  }

  /**
   * Get user meta
   */
  async getUserMeta(userId: number, key: string): Promise<unknown> {
    const meta = await this.knex(this.table('usermeta')).where({ user_id: userId, meta_key: key }).first() as UserMeta | undefined

    if (!meta) return null

    try {
      return JSON.parse(meta.meta_value)
    } catch {
      return meta.meta_value
    }
  }

  /**
   * Set user meta
   */
  async setUserMeta(userId: number, key: string, value: unknown): Promise<void> {
    const metaValue = typeof value === 'object' ? JSON.stringify(value) : String(value)

    const existing = await this.knex(this.table('usermeta')).where({ user_id: userId, meta_key: key }).first()

    if (existing) {
      await this.knex(this.table('usermeta'))
        .where({ user_id: userId, meta_key: key })
        .update({ meta_value: metaValue })
    } else {
      await this.knex(this.table('usermeta')).insert({
        user_id: userId,
        meta_key: key,
        meta_value: metaValue
      })
    }
  }

  /**
   * Get user count
   */
  async getUserCount(options: { role?: string } = {}): Promise<number> {
    const { role } = options

    let query = this.knex(this.table('users')).count('id as count')

    if (role) {
      query = query
        .join(this.table('user_roles'), `${this.table('users')}.id`, `${this.table('user_roles')}.user_id`)
        .join(this.table('roles'), `${this.table('user_roles')}.role_id`, `${this.table('roles')}.id`)
        .where(`${this.table('roles')}.slug`, role)
    }

    const result = await query.first() as { count: number } | undefined
    return result?.count || 0
  }
}

export default UserService
