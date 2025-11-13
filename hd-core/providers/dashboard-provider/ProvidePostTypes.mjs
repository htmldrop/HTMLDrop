export default async ({ req, res, next }) => {
  const { registerPostType, registerPostField } = req.hooks
  const { translate } = req.context
  const locale = req?.user?.locale || 'en_US'

  const postTypes = [
    {
      slug: 'posts',
      name_singular: translate('Post', locale),
      name_plural: translate('Posts', locale),
      description: 'A blog post type',
      show_in_menu: true,
      icon: '<svg fill="currentColor" viewBox="0 0 24 24" version="1.2" baseProfile="tiny" xmlns="http://www.w3.org/2000/svg"><path d="M16.729 4.271a1 1 0 0 0-1.414-.004 1 1 0 0 0-.225.355c-.832 1.736-1.748 2.715-2.904 3.293C10.889 8.555 9.4 9 7 9a1.01 1.01 0 0 0-.923.617 1 1 0 0 0 .217 1.09l3.243 3.243L5 20l6.05-4.537 3.242 3.242a1 1 0 0 0 .326.217q.185.077.382.078c.197.001.26-.027.382-.078A1 1 0 0 0 16 18c0-2.4.444-3.889 1.083-5.166.577-1.156 1.556-2.072 3.293-2.904a1 1 0 0 0 .354-.225 1 1 0 0 0-.004-1.414z"/></svg>',
      badge: 1,
      position: 1100,
      capabilities: {
        edit_post: 'edit_post',
        read_post: 'read_post',
        delete_post: 'delete_post',
        edit_posts: 'edit_posts',
        edit_others_posts: 'edit_others_posts',
        publish_posts: 'publish_posts',
        read_private_posts: 'read_private_posts',
        delete_posts: 'delete_posts',
        delete_private_posts: 'delete_private_posts',
        delete_published_posts: 'delete_published_posts',
        delete_others_posts: 'delete_others_posts',
        edit_private_posts: 'edit_private_posts',
        edit_published_posts: 'edit_published_posts',
        create_posts: 'create_posts'
      }
    },
    {
      slug: 'pages',
      name_singular: translate('Page', locale),
      name_plural: translate('Pages', locale),
      description: 'A static page type',
      show_in_menu: true,
      icon: '<svg style="max-width:16px;" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="37" height="37" viewBox="0 0 37 37" xml:space="preserve"><path d="M36.75 8.5V35a2 2 0 0 1-2 2H8.25a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h26.5a2 2 0 0 1 2 2m-6-6.5a2 2 0 0 0-2-2H2.25a2 2 0 0 0-2 2v26.5a2 2 0 0 0 4 0V4h24.5a2 2 0 0 0 2-2"/></svg>',
      badge: 0,
      position: 1200,
      capabilities: {
        edit_post: 'edit_page',
        read_post: 'read_page',
        delete_post: 'delete_page',
        edit_posts: 'edit_pages',
        edit_others_posts: 'edit_others_pages',
        publish_posts: 'publish_pages',
        read_private_posts: 'read_private_pages',
        delete_posts: 'delete_pages',
        delete_private_posts: 'delete_private_pages',
        delete_published_posts: 'delete_published_pages',
        delete_others_posts: 'delete_others_pages',
        edit_private_posts: 'edit_private_pages',
        edit_published_posts: 'edit_published_pages',
        create_posts: 'create_pages'
      }
    },
    {
      slug: 'attachments',
      name_singular: translate('Media', locale),
      name_plural: translate('Media', locale),
      description: 'Media files',
      show_in_menu: true,
      icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 100 100" xml:space="preserve"><path d="M36 31h28c.8 0 1.3-.9.8-1.5l-3.3-5.1c-1-2-3.1-3.3-5.4-3.3H43.9c-2.3 0-4.4 1.3-5.4 3.3l-3.3 5.1c-.5.6 0 1.5.8 1.5m14 18c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8"/><path d="M74 37H26c-3.3 0-6 2.7-6 6v28c0 3.3 2.7 6 6 6h48c3.3 0 6-2.7 6-6V43c0-3.3-2.7-6-6-6M50 71c-7.7 0-14-6.3-14-14s6.3-14 14-14 14 6.3 14 14-6.3 14-14 14"/></svg>',
      badge: 20,
      position: 1300,
      capabilities: {
        edit_post: 'edit_attachment',
        read_post: 'read_attachment',
        delete_post: 'delete_attachment',
        edit_posts: 'edit_attachments',
        edit_others_posts: 'edit_others_attachments',
        publish_posts: 'publish_attachments',
        read_private_posts: 'read_private_attachments',
        delete_posts: 'delete_attachments',
        delete_private_posts: 'delete_private_attachments',
        delete_published_posts: 'delete_published_attachments',
        delete_others_posts: 'delete_others_attachments',
        edit_private_posts: 'edit_private_attachments',
        edit_published_posts: 'edit_published_attachments',
        create_posts: 'create_attachments'
      }
    },
    {
      slug: 'comments',
      name_singular: translate('Comment', locale),
      name_plural: translate('Comments', locale),
      description: 'Post comments',
      show_in_menu: true,
      icon: '<svg style="max-width:17px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><path fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 4H5a2 2 0 0 0-2 2v15l3.467-2.6a2 2 0 0 1 1.2-.4H19a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/></svg>',
      position: 1400,
      badge: 0,
      capabilities: {
        edit_post: 'edit_comment',
        read_post: 'read_comment',
        delete_post: 'delete_comment',
        edit_posts: 'edit_comments',
        edit_others_posts: 'edit_others_comments',
        publish_posts: 'publish_comments',
        read_private_posts: 'read_private_comments',
        delete_posts: 'delete_comments',
        delete_private_posts: 'delete_private_comments',
        delete_published_posts: 'delete_published_comments',
        delete_others_posts: 'delete_others_comments',
        edit_private_posts: 'edit_private_comments',
        edit_published_posts: 'edit_published_comments',
        create_posts: 'create_comments'
      }
    },
    {
      slug: 'nav_menu_item',
      name_singular: translate('Menu item', locale),
      name_plural: translate('Menu items', locale),
      description: '',
      show_in_menu: false,
      icon: '<svg style="max-width:17px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><path fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 4H5a2 2 0 0 0-2 2v15l3.467-2.6a2 2 0 0 1 1.2-.4H19a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/></svg>',
      position: 1400,
      badge: 0,
      capabilities: {
        edit_post: 'edit_menu',
        read_post: 'read_menu',
        delete_post: 'delete_menu',
        edit_posts: 'edit_menus',
        edit_others_posts: 'edit_others_menus',
        publish_posts: 'publish_menus',
        read_private_posts: 'read_private_menus',
        delete_posts: 'delete_menus',
        delete_private_posts: 'delete_private_menus',
        delete_published_posts: 'delete_published_menus',
        delete_others_posts: 'delete_others_menus',
        edit_private_posts: 'edit_private_menus',
        edit_published_posts: 'edit_published_menus',
        create_posts: 'create_menus'
      }
    }
  ]

  const postFields = [
    // Post fields
    {
      parent_slug: 'posts',
      name: translate('Title', locale),
      slug: 'title',
      type: 'text',
      revisions: false,
      required: true,
      priority: 10,
      order: 1000
    },
    {
      parent_slug: 'posts',
      name: translate('Slug', locale),
      slug: 'slug',
      type: 'text',
      revisions: false,
      required: true,
      priority: 40,
      order: 1100
    },
    {
      parent_slug: 'posts',
      name: translate('Excerpt', locale),
      slug: 'excerpt',
      type: 'textarea',
      revisions: true,
      required: false,
      priority: 30,
      order: 1200
    },
    {
      parent_slug: 'posts',
      name: translate('Content', locale),
      slug: 'content',
      type: 'editor',
      revisions: true,
      required: true,
      priority: 20,
      order: 1300
    },
    {
      parent_slug: 'posts',
      name: translate('Status', locale),
      slug: 'status',
      type: 'select',
      revisions: false,
      options: { choices: ['draft', 'published', 'pending', 'private'] },
      required: true,
      priority: 70,
      order: 1400
    },
    {
      parent_slug: 'posts',
      name: translate('Featured image', locale),
      slug: 'featured_image',
      revisions: false,
      type: 'media',
      required: false,
      priority: 60,
      order: 1500
    },
    {
      parent_slug: 'posts',
      name: translate('Gallery', locale),
      slug: 'gallery',
      revisions: false,
      type: 'multimedia',
      required: false,
      priority: 60,
      order: 1500
    },
    {
      parent_slug: 'posts',
      name: translate('Authors', locale),
      slug: 'authors',
      type: 'users',
      revisions: false,
      required: true,
      priority: 50,
      order: 1600
    },

    // Page fields
    {
      parent_slug: 'pages',
      name: translate('Title', locale),
      slug: 'title',
      type: 'text',
      revisions: false,
      required: true,
      priority: 10,
      order: 1000
    },
    {
      parent_slug: 'pages',
      name: translate('Slug', locale),
      slug: 'slug',
      type: 'text',
      revisions: false,
      required: true,
      priority: 30,
      order: 1100
    },
    {
      parent_slug: 'pages',
      name: translate('Parent slug', locale),
      slug: 'parent_slug',
      type: 'text',
      revisions: false,
      required: false,
      priority: 10,
      order: 1200
    },
    {
      parent_slug: 'pages',
      name: translate('Content', locale),
      slug: 'content',
      type: 'editor',
      revisions: false,
      required: true,
      priority: 20,
      order: 1300
    },
    {
      parent_slug: 'pages',
      name: translate('Status', locale),
      slug: 'status',
      type: 'select',
      revisions: false,
      options: { choices: ['draft', 'published', 'pending', 'private'] },
      required: true,
      priority: 50,
      order: 1400
    },
    {
      parent_slug: 'pages',
      name: translate('Authors', locale),
      slug: 'authors',
      type: 'users',
      revisions: false,
      required: true,
      priority: 40,
      order: 1500
    },

    // Attachment fields
    {
      parent_slug: 'attachments',
      name: translate('Test', locale),
      slug: 'test',
      type: 'boolean',
      revisions: false,
      required: true,
      priority: 10,
      order: 1000
    },
    {
      parent_slug: 'attachments',
      name: translate('Title', locale),
      slug: 'title',
      type: 'text',
      revisions: false,
      required: true,
      priority: 10,
      order: 1100
    },
    {
      parent_slug: 'attachments',
      name: translate('File', locale),
      slug: 'file',
      type: 'file',
      revisions: false,
      required: true,
      priority: 20,
      order: 1200
    },
    {
      parent_slug: 'attachments',
      name: translate('Alt text', locale),
      slug: 'alt_text',
      type: 'text',
      revisions: false,
      required: true,
      priority: 30,
      order: 1300
    },
    {
      parent_slug: 'attachments',
      name: translate('Caption', locale),
      slug: 'caption',
      type: 'text',
      revisions: false,
      required: true,
      priority: 30,
      order: 1400
    },
    {
      parent_slug: 'attachments',
      name: translate('Description', locale),
      slug: 'description',
      type: 'text',
      revisions: false,
      required: true,
      priority: 30,
      order: 1500
    },
    {
      parent_slug: 'attachments',
      name: translate('Status', locale),
      slug: 'status',
      type: 'select',
      revisions: false,
      options: { choices: ['inherit', 'private'] },
      required: true,
      priority: 40,
      order: 1600
    },
    {
      parent_slug: 'attachments',
      name: translate('Authors', locale),
      slug: 'authors',
      type: 'users',
      revisions: false,
      required: true,
      priority: 30,
      order: 1700
    },

    // Comment fields
    {
      parent_slug: 'comments',
      name: translate('Content', locale),
      slug: 'content',
      type: 'textarea',
      revisions: false,
      required: true,
      priority: 10,
      order: 1000
    },
    {
      parent_slug: 'comments',
      name: translate('Status', locale),
      slug: 'status',
      type: 'select',
      revisions: false,
      options: { choices: ['approved', 'pending', 'spam', 'trash'] },
      required: true,
      priority: 30,
      order: 1100
    },
    {
      parent_slug: 'comments',
      name: translate('Authors', locale),
      slug: 'authors',
      type: 'users',
      revisions: false,
      required: true,
      priority: 20,
      order: 1200
    },

    // Menu fields
    {
      parent_slug: 'nav_menu_item',
      name: translate('Title', locale),
      slug: 'title',
      type: 'text',
      revisions: false,
      required: false,
      priority: 20,
      order: 1000
    },
    {
      parent_slug: 'nav_menu_item',
      name: translate('Parent', locale),
      slug: 'parent_slug',
      type: 'text',
      revisions: false,
      required: false,
      priority: 20,
      order: 1100
    },
    {
      parent_slug: 'nav_menu_item',
      name: translate('Order', locale),
      slug: 'order',
      type: 'number',
      revisions: false,
      required: false,
      priority: 20,
      order: 1200
    },
    {
      parent_slug: 'nav_menu_item',
      name: translate('Link', locale),
      slug: 'link',
      type: 'text',
      revisions: false,
      required: false,
      priority: 20,
      order: 1300
    },
    {
      parent_slug: 'nav_menu_item',
      name: translate('External', locale),
      slug: 'external',
      type: 'boolean',
      revisions: false,
      required: false,
      priority: 20,
      order: 1400
    },
    {
      parent_slug: 'nav_menu_item',
      name: translate('Target', locale),
      slug: 'target',
      type: 'text',
      revisions: false,
      required: false,
      priority: 20,
      order: 1500
    },
    {
      parent_slug: 'nav_menu_item',
      name: translate('Classes', locale),
      slug: 'classes',
      type: 'text',
      revisions: false,
      required: false,
      priority: 20,
      order: 1600
    }
  ]

  for (const type of postTypes) {
    await registerPostType(type, req.priority)
  }

  for (const field of postFields) {
    await registerPostField(field, field.priority)
  }
}
