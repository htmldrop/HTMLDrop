import type { Request, Response, NextFunction } from 'express'

interface ProviderRequest {
  req: Request & { hooks: any; context: any; user?: any; priority?: number }
  res: Response
  next: NextFunction
}

interface PostTypeCapabilities {
  edit_post: string
  read_post: string
  delete_post: string
  edit_posts: string
  edit_others_posts: string
  publish_posts: string
  read_private_posts: string
  delete_posts: string
  delete_private_posts: string
  delete_published_posts: string
  delete_others_posts: string
  edit_private_posts: string
  edit_published_posts: string
  create_posts: string
}

interface PostType {
  slug: string
  name_singular: string
  name_plural: string
  description: string
  show_in_menu: boolean
  icon: string
  badge: number
  position: number
  capabilities: PostTypeCapabilities
}

interface PostField {
  parent_slug: string
  name: string
  slug: string
  type: string
  revisions: boolean
  required: boolean
  priority: number
  order: number
  options?: { choices: string[] }
}

export default async ({ req, res, next }: ProviderRequest): Promise<void> => {
  const { registerPostType, registerPostField } = req.hooks
  const { translate } = req.context
  const locale = req?.user?.locale || 'en_US'

  const postType: PostType = {
    slug: 'quick_draft',
    name_singular: translate('Quick Draft', locale),
    name_plural: translate('Quick Drafts', locale),
    description: 'Quick draft notes for capturing ideas',
    show_in_menu: false, // Don't show in main menu, only accessible via dashboard widget
    icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/><path d="M8 15h8v2H8zm0-4h8v2H8zm0-4h5v2H8z"/></svg>',
    badge: 0,
    position: 9999, // Low priority since it's not in main menu
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
  }

  const postFields: PostField[] = [
    {
      parent_slug: 'quick_draft',
      name: translate('Title', locale),
      slug: 'title',
      type: 'text',
      revisions: false,
      required: true,
      priority: 10,
      order: 1000
    },
    {
      parent_slug: 'quick_draft',
      name: translate('Content', locale),
      slug: 'content',
      type: 'textarea',
      revisions: false,
      required: true,
      priority: 20,
      order: 1100
    },
    {
      parent_slug: 'quick_draft',
      name: translate('Status', locale),
      slug: 'status',
      type: 'select',
      revisions: false,
      options: { choices: ['draft', 'published', 'pending', 'private'] },
      required: true,
      priority: 30,
      order: 1200
    },
    {
      parent_slug: 'quick_draft',
      name: translate('Authors', locale),
      slug: 'authors',
      type: 'users',
      revisions: false,
      required: true,
      priority: 40,
      order: 1300
    }
  ]

  await registerPostType(postType, req.priority)

  for (const field of postFields) {
    await registerPostField(field, field.priority)
  }
}
