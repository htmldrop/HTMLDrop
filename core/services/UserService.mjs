/**
 * User Service
 *
 * Business logic for user operations
 */

import bcrypt from 'bcrypt'
import { BCRYPT_ROUNDS } from '../utils/constants.mjs'

class UserService {
  constructor(context) {
    this.context = context
    this.knex = context.knex
    this.table = context.table.bind(context)
  }

  /**
   * Get all users with pagination
   * @param {Object} options - Query options
   * @returns {Promise<Array<Object>>} Array of users
   */
  async getUsers(options = {}) {
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

    return query.limit(parseInt(limit)).offset(parseInt(offset)).orderBy('created_at', 'desc')
  }

  /**
   * Get user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserById(id) {
    return this.knex(this.table('users'))
      .where({ id })
      .select('id', 'username', 'email', 'first_name', 'last_name', 'created_at')
      .first()
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserByEmail(email) {
    return this.knex(this.table('users')).where({ email }).first()
  }

  /**
   * Get user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserByUsername(username) {
    return this.knex(this.table('users')).where({ username }).first()
  }

  /**
   * Create a new user
   * @param {Object} data - User data
   * @returns {Promise<number>} Created user ID
   */
  async createUser(data) {
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
   * @param {number} id - User ID
   * @param {Object} data - Update data
   * @returns {Promise<void>}
   */
  async updateUser(id, data) {
    const { username, email, first_name, last_name, password } = data

    const updateData = {}
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
   * @param {number} id - User ID
   * @returns {Promise<void>}
   */
  async deleteUser(id) {
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
   * @param {string} password - Plain password
   * @param {string} hash - Password hash
   * @returns {Promise<boolean>} True if valid
   */
  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash)
  }

  /**
   * Get user roles
   * @param {number} userId - User ID
   * @returns {Promise<Array<Object>>} Array of roles
   */
  async getUserRoles(userId) {
    return this.knex(this.table('roles'))
      .join(this.table('user_roles'), `${this.table('roles')}.id`, `${this.table('user_roles')}.role_id`)
      .where(`${this.table('user_roles')}.user_id`, userId)
      .select(`${this.table('roles')}.*`)
  }

  /**
   * Assign role to user
   * @param {number} userId - User ID
   * @param {number} roleId - Role ID
   * @returns {Promise<void>}
   */
  async assignRole(userId, roleId) {
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
   * @param {number} userId - User ID
   * @param {number} roleId - Role ID
   * @returns {Promise<void>}
   */
  async removeRole(userId, roleId) {
    await this.knex(this.table('user_roles')).where({ user_id: userId, role_id: roleId }).del()
  }

  /**
   * Get user meta
   * @param {number} userId - User ID
   * @param {string} key - Meta key
   * @returns {Promise<*>} Meta value
   */
  async getUserMeta(userId, key) {
    const meta = await this.knex(this.table('usermeta')).where({ user_id: userId, meta_key: key }).first()

    if (!meta) return null

    try {
      return JSON.parse(meta.meta_value)
    } catch {
      return meta.meta_value
    }
  }

  /**
   * Set user meta
   * @param {number} userId - User ID
   * @param {string} key - Meta key
   * @param {*} value - Meta value
   * @returns {Promise<void>}
   */
  async setUserMeta(userId, key, value) {
    const metaValue = typeof value === 'object' ? JSON.stringify(value) : value

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
   * @param {Object} options - Query options
   * @returns {Promise<number>} User count
   */
  async getUserCount(options = {}) {
    const { role } = options

    let query = this.knex(this.table('users')).count('id as count')

    if (role) {
      query = query
        .join(this.table('user_roles'), `${this.table('users')}.id`, `${this.table('user_roles')}.user_id`)
        .join(this.table('roles'), `${this.table('user_roles')}.role_id`, `${this.table('roles')}.id`)
        .where(`${this.table('roles')}.slug`, role)
    }

    const result = await query.first()
    return result?.count || 0
  }
}

export default UserService
