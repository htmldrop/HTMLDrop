import type { AICommand, AICommandResult } from '../../../registries/RegisterAICommands.ts'

type RegisterFn = (command: AICommand, priority?: number) => void

export default function registerPostCommands(register: RegisterFn, context: HTMLDrop.Context): void {
  const { knex, table } = context

  register({
    slug: 'posts.types',
    name: 'List Post Types',
    description: 'List all registered post types',
    category: 'posts',
    type: 'read',
    permission: 'auto',
    capabilities: ['manage_dashboard'],
    parameters: [],
    contextProviders: ['posts'],
    execute: async (): Promise<AICommandResult> => {
      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const postTypes = await knex(table('post_types'))
        .select('slug', 'name_singular', 'name_plural', 'show_in_menu')
        .orderBy('name_singular', 'asc')

      // Get counts for each type
      const typesWithCounts = await Promise.all(
        postTypes.map(async (pt: { slug: string; name_singular: string; name_plural: string; show_in_menu: number }) => {
          const countResult = await knex(table('posts'))
            .where('post_type_slug', pt.slug)
            .count('id as count')
            .first()

          return {
            ...pt,
            show_in_menu: Boolean(pt.show_in_menu),
            count: countResult?.count || 0
          }
        })
      )

      return {
        success: true,
        message: `Found ${typesWithCounts.length} post types`,
        data: { postTypes: typesWithCounts }
      }
    }
  })

  register({
    slug: 'posts.list',
    name: 'List Posts',
    description: 'List posts of a specific type',
    category: 'posts',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_post'],
    parameters: [
      { name: 'postType', type: 'string', required: true, description: 'Post type slug' },
      { name: 'status', type: 'string', required: false, description: 'Filter by status', enum: ['draft', 'publish', 'private', 'trash'] },
      { name: 'limit', type: 'number', required: false, description: 'Number of posts to return (default: 20)' },
      { name: 'offset', type: 'number', required: false, description: 'Number of posts to skip' },
      { name: 'search', type: 'string', required: false, description: 'Search in title and content' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { postType, status, limit = 20, offset = 0, search } = params as {
        postType: string
        status?: string
        limit?: number
        offset?: number
        search?: string
      }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      // Verify post type exists
      const typeExists = await knex(table('post_types')).where('slug', postType).first()
      if (!typeExists) {
        return { success: false, message: `Post type not found: ${postType}`, error: 'INVALID_POST_TYPE' }
      }

      let query = knex(table('posts'))
        .where('post_type_slug', postType)
        .select('id', 'title', 'slug', 'status', 'author_id', 'created_at', 'updated_at')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)

      if (status) {
        query = query.where('status', status)
      }

      if (search) {
        query = query.where((builder) => {
          builder.where('title', 'like', `%${search}%`)
            .orWhere('content', 'like', `%${search}%`)
        })
      }

      const posts = await query

      // Get total count
      let countQuery = knex(table('posts')).where('post_type_slug', postType)
      if (status) countQuery = countQuery.where('status', status)
      if (search) {
        countQuery = countQuery.where((builder) => {
          builder.where('title', 'like', `%${search}%`)
            .orWhere('content', 'like', `%${search}%`)
        })
      }
      const totalResult = await countQuery.count('id as count').first()

      return {
        success: true,
        message: `Found ${posts.length} ${postType} posts`,
        data: {
          posts,
          total: totalResult?.count || 0,
          limit,
          offset
        }
      }
    }
  })

  register({
    slug: 'posts.get',
    name: 'Get Post',
    description: 'Get a specific post with all its metadata',
    category: 'posts',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_post'],
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Post ID' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { id } = params as { id: number }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const post = await knex(table('posts')).where('id', id).first()

      if (!post) {
        return { success: false, message: `Post not found: ${id}`, error: 'NOT_FOUND' }
      }

      // Get all metadata
      const meta = await knex(table('post_meta'))
        .where('post_id', id)
        .select('field_slug', 'value')

      const metadata: Record<string, unknown> = {}
      for (const m of meta) {
        try {
          metadata[m.field_slug] = JSON.parse(m.value)
        } catch {
          metadata[m.field_slug] = m.value
        }
      }

      // Get author info
      const author = await knex(table('users'))
        .where('id', post.author_id)
        .select('id', 'username', 'first_name', 'last_name')
        .first()

      return {
        success: true,
        message: `Post details for ID ${id}`,
        data: {
          ...post,
          meta: metadata,
          author
        }
      }
    }
  })

  register({
    slug: 'posts.create',
    name: 'Create Post',
    description: 'Create a new post',
    category: 'posts',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['create_posts'],
    parameters: [
      { name: 'postType', type: 'string', required: true, description: 'Post type slug' },
      { name: 'title', type: 'string', required: true, description: 'Post title' },
      { name: 'content', type: 'string', required: false, description: 'Post content' },
      { name: 'status', type: 'string', required: false, description: 'Post status', enum: ['draft', 'publish', 'private'] },
      { name: 'slug', type: 'string', required: false, description: 'URL slug (auto-generated if not provided)' }
    ],
    execute: async (params, executionContext): Promise<AICommandResult> => {
      const { postType, title, content = '', status = 'draft', slug } = params as {
        postType: string
        title: string
        content?: string
        status?: string
        slug?: string
      }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      // Verify post type exists
      const typeExists = await knex(table('post_types')).where('slug', postType).first()
      if (!typeExists) {
        return { success: false, message: `Post type not found: ${postType}`, error: 'INVALID_POST_TYPE' }
      }

      // Generate slug if not provided
      let postSlug = slug
      if (!postSlug) {
        postSlug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      }

      // Ensure unique slug
      let finalSlug = postSlug
      let counter = 1
      while (true) {
        const existing = await knex(table('posts'))
          .where('post_type_slug', postType)
          .where('slug', finalSlug)
          .first()
        if (!existing) break
        finalSlug = `${postSlug}-${counter}`
        counter++
      }

      const [postId] = await knex(table('posts')).insert({
        post_type_slug: postType,
        title,
        slug: finalSlug,
        content,
        excerpt: '',
        status,
        author_id: executionContext.userId,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })

      return {
        success: true,
        message: `Created ${postType} post: ${title}`,
        data: { id: postId, slug: finalSlug }
      }
    }
  })

  register({
    slug: 'posts.update',
    name: 'Update Post',
    description: 'Update an existing post',
    category: 'posts',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['edit_posts'],
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Post ID' },
      { name: 'title', type: 'string', required: false, description: 'New title' },
      { name: 'content', type: 'string', required: false, description: 'New content' },
      { name: 'status', type: 'string', required: false, description: 'New status', enum: ['draft', 'publish', 'private', 'trash'] }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { id, title, content, status } = params as {
        id: number
        title?: string
        content?: string
        status?: string
      }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const post = await knex(table('posts')).where('id', id).first()
      if (!post) {
        return { success: false, message: `Post not found: ${id}`, error: 'NOT_FOUND' }
      }

      const updateData: Record<string, unknown> = { updated_at: knex.fn.now() }
      if (title !== undefined) updateData.title = title
      if (content !== undefined) updateData.content = content
      if (status !== undefined) updateData.status = status

      await knex(table('posts')).where('id', id).update(updateData)

      return {
        success: true,
        message: `Updated post ${id}: ${post.title}`
      }
    }
  })

  register({
    slug: 'posts.delete',
    name: 'Delete Post',
    description: 'Delete a post (moves to trash by default)',
    category: 'posts',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['delete_posts'],
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Post ID' },
      { name: 'permanently', type: 'boolean', required: false, description: 'Permanently delete (true) or trash (false)' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { id, permanently = false } = params as { id: number; permanently?: boolean }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const post = await knex(table('posts')).where('id', id).first()
      if (!post) {
        return { success: false, message: `Post not found: ${id}`, error: 'NOT_FOUND' }
      }

      if (permanently) {
        // Delete metadata first
        await knex(table('post_meta')).where('post_id', id).del()
        // Delete the post
        await knex(table('posts')).where('id', id).del()

        return {
          success: true,
          message: `Permanently deleted post: ${post.title}`
        }
      } else {
        await knex(table('posts')).where('id', id).update({
          status: 'trash',
          updated_at: knex.fn.now()
        })

        return {
          success: true,
          message: `Moved post to trash: ${post.title}`
        }
      }
    }
  })

  register({
    slug: 'posts.count',
    name: 'Count Posts',
    description: 'Get post counts by status for a post type',
    category: 'posts',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_post'],
    parameters: [
      { name: 'postType', type: 'string', required: true, description: 'Post type slug' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { postType } = params as { postType: string }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const stats = await knex(table('posts'))
        .where('post_type_slug', postType)
        .select('status')
        .count('id as count')
        .groupBy('status')

      const byStatus: Record<string, number> = {}
      let total = 0

      for (const stat of stats) {
        byStatus[stat.status] = stat.count as number
        total += stat.count as number
      }

      return {
        success: true,
        message: `Post counts for ${postType}`,
        data: { postType, total, byStatus }
      }
    }
  })
}
