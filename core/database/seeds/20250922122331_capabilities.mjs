export const seed = async (knex) => {
  const prefix = process.env.TABLE_PREFIX
  const tableName = `${prefix  }capabilities`
  const seeds = [
    // Global capabilities
    { id: 1, name: 'Read', slug: 'read' },
    { id: 2, name: 'Create', slug: 'create' },
    { id: 3, name: 'Update', slug: 'update' },
    { id: 4, name: 'Delete', slug: 'delete' },

    // Grouped capabilities
    { id: 5, name: 'Manage dashboard', slug: 'manage_dashboard' },
    { id: 6, name: 'Manage post types', slug: 'manage_post_types' },
    { id: 7, name: 'Manage posts', slug: 'manage_posts' },
    { id: 8, name: 'Manage pages', slug: 'manage_pages' },
    { id: 9, name: 'Manage media', slug: 'manage_media' },
    { id: 10, name: 'Manage comments', slug: 'manage_comments' },
    { id: 11, name: 'Manage options', slug: 'manage_options' },
    { id: 12, name: 'Manage users', slug: 'manage_users' },
    { id: 13, name: 'Manage taxonomies', slug: 'manage_taxonomies' },
    { id: 14, name: 'Manage terms', slug: 'manage_terms' },
    { id: 15, name: 'Manage menus', slug: 'manage_menus' },
    { id: 16, name: 'Manage plugins', slug: 'manage_plugins' },
    { id: 17, name: 'Manage themes', slug: 'manage_themes' },
    { id: 18, name: 'Manage jobs', slug: 'manage_jobs' },
    { id: 19, name: 'Manage roles', slug: 'manage_roles' },

    // Post types
    { id: 20, name: 'Read post type', slug: 'read_post_type' },
    { id: 21, name: 'Create post types', slug: 'create_post_types' },
    { id: 22, name: 'Edit post type', slug: 'edit_post_type' },
    { id: 23, name: 'Edit post types', slug: 'edit_post_types' },
    { id: 24, name: 'Delete post types', slug: 'delete_post_types' },

    // Posts
    { id: 25, name: 'Read post', slug: 'read_post' },
    { id: 26, name: 'Create posts', slug: 'create_posts' },
    { id: 27, name: 'Edit post', slug: 'edit_post' },
    { id: 28, name: 'Edit posts', slug: 'edit_posts' },
    { id: 29, name: 'Delete posts', slug: 'delete_posts' },

    // Pages
    { id: 30, name: 'Read page', slug: 'read_page' },
    { id: 31, name: 'Create pages', slug: 'create_pages' },
    { id: 32, name: 'Edit page', slug: 'edit_page' },
    { id: 33, name: 'Edit pages', slug: 'edit_pages' },
    { id: 34, name: 'Delete pages', slug: 'delete_pages' },

    // Attachment
    { id: 35, name: 'Read attachment', slug: 'read_attachment' },
    { id: 36, name: 'Create attachment', slug: 'create_attachments' },
    { id: 37, name: 'Edit attachment', slug: 'edit_attachment' },
    { id: 38, name: 'Edit attachments', slug: 'edit_attachments' },
    { id: 39, name: 'Delete attachment', slug: 'delete_attachments' },

    // Comments
    { id: 40, name: 'Read comment', slug: 'read_comment' },
    { id: 41, name: 'Create comments', slug: 'create_comments' },
    { id: 42, name: 'Edit comment', slug: 'edit_comment' },
    { id: 43, name: 'Edit comments', slug: 'edit_comments' },
    { id: 44, name: 'Delete comments', slug: 'delete_comments' },

    // Options
    { id: 45, name: 'Read option', slug: 'read_option' },
    { id: 46, name: 'Create options', slug: 'create_options' },
    { id: 47, name: 'Edit option', slug: 'edit_option' },
    { id: 48, name: 'Edit options', slug: 'edit_options' },
    { id: 49, name: 'Delete options', slug: 'delete_options' },

    // Users
    { id: 50, name: 'Read user', slug: 'read_user' },
    { id: 51, name: 'Create users', slug: 'create_users' },
    { id: 52, name: 'Edit user', slug: 'edit_user' },
    { id: 53, name: 'Edit users', slug: 'edit_users' },
    { id: 54, name: 'Delete users', slug: 'delete_users' },

    // Taxonomies
    { id: 55, name: 'Read taxonomy', slug: 'read_taxonomy' },
    { id: 56, name: 'Create taxonomies', slug: 'create_taxonomies' },
    { id: 57, name: 'Edit taxonomy', slug: 'edit_taxonomy' },
    { id: 58, name: 'Edit taxonomies', slug: 'edit_taxonomies' },
    { id: 59, name: 'Delete taxonomies', slug: 'delete_taxonomies' },

    // Terms
    { id: 60, name: 'Read term', slug: 'read_term' },
    { id: 61, name: 'Create terms', slug: 'create_terms' },
    { id: 62, name: 'Edit term', slug: 'edit_term' },
    { id: 63, name: 'Edit terms', slug: 'edit_terms' },
    { id: 64, name: 'Delete terms', slug: 'delete_terms' },

    // Menus
    { id: 65, name: 'Read menu', slug: 'read_menu' },
    { id: 66, name: 'Create menus', slug: 'create_menus' },
    { id: 67, name: 'Edit menu', slug: 'edit_menu' },
    { id: 68, name: 'Edit menus', slug: 'edit_menus' },
    { id: 69, name: 'Delete menus', slug: 'delete_menus' },

    // Plugins
    { id: 70, name: 'Read plugin', slug: 'read_plugin' },
    { id: 71, name: 'Upload plugins', slug: 'upload_plugins' },
    { id: 72, name: 'Activate plugins', slug: 'activate_plugins' },
    { id: 73, name: 'Deactivate plugins', slug: 'deactivate_plugins' },
    { id: 74, name: 'Delete plugins', slug: 'delete_plugins' },

    // Themes
    { id: 75, name: 'Read theme', slug: 'read_theme' },
    { id: 76, name: 'Upload themes', slug: 'upload_themes' },
    { id: 77, name: 'Activate themes', slug: 'activate_themes' },
    { id: 78, name: 'Deactivate themes', slug: 'deactivate_themes' },
    { id: 79, name: 'Delete themes', slug: 'delete_themes' },

    // Jobs
    { id: 80, name: 'Read job', slug: 'read_job' },
    { id: 81, name: 'Create jobs', slug: 'create_jobs' },
    { id: 82, name: 'Edit job', slug: 'edit_job' },
    { id: 83, name: 'Edit jobs', slug: 'edit_jobs' },
    { id: 84, name: 'Delete jobs', slug: 'delete_jobs' },
  ]

  for (const seed of seeds) {
    const record = await knex(tableName).where({ slug: seed.slug }).first()
    if (!record) {
      await knex(tableName).insert({ ...seed, created_at: knex.fn.now(), updated_at: knex.fn.now() })
    }
  }
}
