import type { Request, Response, NextFunction } from 'express'

interface ProviderRequest {
  req: Request & { hooks: any; context: any; user?: any; priority?: number }
  res: Response
  next: NextFunction
}

interface TaxonomyCapabilities {
  edit_term: string
  read_term: string
  delete_term: string
  edit_terms: string
  edit_others_terms: string
  publish_terms: string
  read_private_terms: string
  delete_terms: string
  delete_private_terms: string
  delete_published_terms: string
  delete_others_terms: string
  edit_private_terms: string
  edit_published_terms: string
  create_terms: string
}

interface Taxonomy {
  slug: string
  post_type_slug: string
  name_singular: string
  name_plural: string
  description: string
  show_in_menu: boolean
  icon: string
  badge: number
  position: number
  capabilities: TaxonomyCapabilities
}

interface TermField {
  parent_slug: string
  post_type_slug: string
  name: string
  slug: string
  type: string
  revisions: boolean
  required: boolean
  priority: number
  order: number
}

export default async ({ req, res, next }: ProviderRequest): Promise<void> => {
  const { registerTaxonomy, registerTermField } = req.hooks
  const { translate } = req.context
  const locale = req?.user?.locale || 'en_US'

  const taxonomies: Taxonomy[] = [
    {
      slug: 'categories',
      post_type_slug: 'posts',
      name_singular: translate('Category', locale),
      name_plural: translate('Categories', locale),
      description: '',
      show_in_menu: true,
      icon: '<svg fill="currentColor" viewBox="0 0 24 24" version="1.2" baseProfile="tiny" xmlns="http://www.w3.org/2000/svg"><path d="M16.729 4.271a1 1 0 0 0-1.414-.004 1 1 0 0 0-.225.355c-.832 1.736-1.748 2.715-2.904 3.293C10.889 8.555 9.4 9 7 9a1.01 1.01 0 0 0-.923.617 1 1 0 0 0 .217 1.09l3.243 3.243L5 20l6.05-4.537 3.242 3.242a1 1 0 0 0 .326.217q.185.077.382.078c.197.001.26-.027.382-.078A1 1 0 0 0 16 18c0-2.4.444-3.889 1.083-5.166.577-1.156 1.556-2.072 3.293-2.904a1 1 0 0 0 .354-.225 1 1 0 0 0-.004-1.414z"/></svg>',
      badge: 0,
      position: 1100,
      capabilities: {
        edit_term: 'edit_post',
        read_term: 'read_post',
        delete_term: 'delete_post',
        edit_terms: 'edit_posts',
        edit_others_terms: 'edit_others_posts',
        publish_terms: 'publish_posts',
        read_private_terms: 'read_private_posts',
        delete_terms: 'delete_posts',
        delete_private_terms: 'delete_private_posts',
        delete_published_terms: 'delete_published_posts',
        delete_others_terms: 'delete_others_posts',
        edit_private_terms: 'edit_private_posts',
        edit_published_terms: 'edit_published_posts',
        create_terms: 'create_posts'
      }
    },
    {
      slug: 'tags',
      post_type_slug: 'posts',
      name_singular: translate('Tag', locale),
      name_plural: translate('Tags', locale),
      description: '',
      show_in_menu: true,
      icon: '<svg fill="currentColor" viewBox="0 0 24 24" version="1.2" baseProfile="tiny" xmlns="http://www.w3.org/2000/svg"><path d="M16.729 4.271a1 1 0 0 0-1.414-.004 1 1 0 0 0-.225.355c-.832 1.736-1.748 2.715-2.904 3.293C10.889 8.555 9.4 9 7 9a1.01 1.01 0 0 0-.923.617 1 1 0 0 0 .217 1.09l3.243 3.243L5 20l6.05-4.537 3.242 3.242a1 1 0 0 0 .326.217q.185.077.382.078c.197.001.26-.027.382-.078A1 1 0 0 0 16 18c0-2.4.444-3.889 1.083-5.166.577-1.156 1.556-2.072 3.293-2.904a1 1 0 0 0 .354-.225 1 1 0 0 0-.004-1.414z"/></svg>',
      badge: 0,
      position: 1100,
      capabilities: {
        edit_term: 'edit_post',
        read_term: 'read_post',
        delete_term: 'delete_post',
        edit_terms: 'edit_posts',
        edit_others_terms: 'edit_others_posts',
        publish_terms: 'publish_posts',
        read_private_terms: 'read_private_posts',
        delete_terms: 'delete_posts',
        delete_private_terms: 'delete_private_posts',
        delete_published_terms: 'delete_published_posts',
        delete_others_terms: 'delete_others_posts',
        edit_private_terms: 'edit_private_posts',
        edit_published_terms: 'edit_published_posts',
        create_terms: 'create_posts'
      }
    },
    {
      slug: 'nav-menu',
      post_type_slug: 'nav_menu_item',
      name_singular: translate('Menu', locale),
      name_plural: translate('Menus', locale),
      description: '',
      show_in_menu: false,
      icon: '<svg fill="currentColor" viewBox="0 0 24 24" version="1.2" baseProfile="tiny" xmlns="http://www.w3.org/2000/svg"><path d="M16.729 4.271a1 1 0 0 0-1.414-.004 1 1 0 0 0-.225.355c-.832 1.736-1.748 2.715-2.904 3.293C10.889 8.555 9.4 9 7 9a1.01 1.01 0 0 0-.923.617 1 1 0 0 0 .217 1.09l3.243 3.243L5 20l6.05-4.537 3.242 3.242a1 1 0 0 0 .326.217q.185.077.382.078c.197.001.26-.027.382-.078A1 1 0 0 0 16 18c0-2.4.444-3.889 1.083-5.166.577-1.156 1.556-2.072 3.293-2.904a1 1 0 0 0 .354-.225 1 1 0 0 0-.004-1.414z"/></svg>',
      badge: 0,
      position: 1100,
      capabilities: {
        edit_term: 'edit_post',
        read_term: 'read_post',
        delete_term: 'delete_post',
        edit_terms: 'edit_posts',
        edit_others_terms: 'edit_others_posts',
        publish_terms: 'publish_posts',
        read_private_terms: 'read_private_posts',
        delete_terms: 'delete_posts',
        delete_private_terms: 'delete_private_posts',
        delete_published_terms: 'delete_published_posts',
        delete_others_terms: 'delete_others_posts',
        edit_private_terms: 'edit_private_posts',
        edit_published_terms: 'edit_published_posts',
        create_terms: 'create_posts'
      }
    }
  ]

  const termFields: TermField[] = [
    // Post category fields
    {
      parent_slug: 'categories',
      post_type_slug: 'posts',
      name: translate('Title', locale),
      slug: 'title',
      type: 'text',
      revisions: false,
      required: false,
      priority: 10,
      order: 1000
    },
    {
      parent_slug: 'categories',
      post_type_slug: 'posts',
      name: translate('Slug', locale),
      slug: 'slug',
      type: 'text',
      revisions: false,
      required: false,
      priority: 40,
      order: 1100
    },
    {
      parent_slug: 'categories',
      post_type_slug: 'posts',
      name: translate('Parent slug', locale),
      slug: 'parent_slug',
      type: 'text',
      revisions: false,
      required: false,
      priority: 10,
      order: 1200
    },
    {
      parent_slug: 'categories',
      post_type_slug: 'posts',
      name: translate('Description', locale),
      slug: 'description',
      type: 'textarea',
      revisions: true,
      required: false,
      priority: 40,
      order: 1300
    },
    {
      parent_slug: 'categories',
      post_type_slug: 'posts',
      name: translate('Featured image', locale),
      slug: 'featured_image',
      revisions: false,
      type: 'media',
      required: false,
      priority: 60,
      order: 1400
    },
    // Post tag fields
    {
      parent_slug: 'tags',
      post_type_slug: 'posts',
      name: translate('Title', locale),
      slug: 'title',
      type: 'text',
      revisions: false,
      required: false,
      priority: 10,
      order: 1000
    },
    {
      parent_slug: 'tags',
      post_type_slug: 'posts',
      name: translate('Slug', locale),
      slug: 'slug',
      type: 'text',
      revisions: false,
      required: false,
      priority: 40,
      order: 1100
    },
    {
      parent_slug: 'tags',
      post_type_slug: 'posts',
      name: translate('Description', locale),
      slug: 'description',
      type: 'textarea',
      revisions: true,
      required: false,
      priority: 40,
      order: 1200
    },
    {
      parent_slug: 'tags',
      post_type_slug: 'posts',
      name: translate('Featured image', locale),
      slug: 'featured_image',
      revisions: false,
      type: 'media',
      required: false,
      priority: 60,
      order: 1300
    },
    // Nav menu fields
    {
      parent_slug: 'nav-menu',
      post_type_slug: 'nav_menu_item',
      name: translate('Title', locale),
      slug: 'title',
      type: 'text',
      revisions: false,
      required: false,
      priority: 10,
      order: 1000
    },
    {
      parent_slug: 'nav-menu',
      post_type_slug: 'nav_menu_item',
      name: translate('Slug', locale),
      slug: 'slug',
      type: 'text',
      revisions: false,
      required: false,
      priority: 40,
      order: 1100
    },
    {
      parent_slug: 'nav-menu',
      post_type_slug: 'nav_menu_item',
      name: translate('Description', locale),
      slug: 'description',
      type: 'textarea',
      revisions: true,
      required: false,
      priority: 40,
      order: 1200
    },
    {
      parent_slug: 'nav-menu',
      post_type_slug: 'nav_menu_item',
      name: translate('Featured image', locale),
      slug: 'featured_image',
      revisions: false,
      type: 'media',
      required: false,
      priority: 60,
      order: 1300
    }
  ]

  for (const taxonomy of taxonomies) {
    await registerTaxonomy(taxonomy, req.priority)
  }

  for (const field of termFields) {
    await registerTermField(field, field.priority)
  }
}
