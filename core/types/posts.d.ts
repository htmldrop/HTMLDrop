/**
 * Post System Types
 */

declare global {
  namespace HTMLDrop {
    /**
     * Post instance with merged metadata fields
     *
     * The base post fields come from the posts table.
     * Additional fields (title, content, excerpt, etc.) are stored in post_meta
     * and merged onto the post object when retrieved.
     */
    interface Post {
      id: number
      post_type_id?: number
      post_type_slug: string
      slug: string
      status: string
      created_at: string
      updated_at: string
      deleted_at?: string
      // Common meta fields (stored in post_meta, merged at query time)
      title?: string
      content?: string
      excerpt?: string
      featured_image?: string
      // Relationships
      terms?: Record<string, Term[]>
      // Additional custom fields from post_meta
      [key: string]: any
    }

    interface PostTypeConfig {
      slug: string
      name_singular: string
      name_plural: string
      description?: string
      icon?: string
      show_in_menu?: boolean
      capabilities?: Record<string, string>
      badge?: number
      position?: number
      priority?: number
      order?: number
    }

    interface PostType extends PostTypeConfig {
      id: number
      created_at: string
      updated_at?: string
      fields?: Field[]
      taxonomies?: Taxonomy[]
      resolvedCapabilities?: string[]
    }

    interface FieldConfig {
      post_type_slug: string
      slug: string
      name?: string
      type?: FieldType
      options?: Record<string, any>
      conditions?: Record<string, any>
      required?: boolean
      revisions?: boolean
      priority?: number
    }

    interface Field extends FieldConfig {
      id: number
      post_type_id?: number
      created_at?: string
      updated_at?: string
    }

    type FieldType =
      | 'text'
      | 'textarea'
      | 'rich_text'
      | 'number'
      | 'checkbox'
      | 'select'
      | 'radio'
      | 'image'
      | 'file'
      | 'date'
      | 'datetime'
      | 'repeater'
      | 'relationship'

    interface PostQueryParams {
      status?: string
      limit?: number
      offset?: number
      orderBy?: string
      sort?: 'asc' | 'desc'
      search?: string
      searchable?: string[]
      filters?: Record<string, any>
      meta_query?: MetaQuery
      taxonomy_query?: TaxonomyQuery
      trashed?: boolean
    }

    interface MetaQuery {
      relation?: 'AND' | 'OR'
      queries: MetaQueryCondition[]
    }

    interface MetaQueryCondition {
      key: string
      value: any
      compare?: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN'
    }
  }
}

export {}
