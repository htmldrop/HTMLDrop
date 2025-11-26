/**
 * Taxonomy System Types
 */

declare global {
  namespace HTMLDrop {
    /**
     * Term instance with merged metadata fields
     *
     * Similar to Posts, terms store their data (name, description, etc.)
     * in term_meta and it gets merged at query time.
     */
    interface Term {
      id: number
      parent_id?: number
      taxonomy_id?: number
      taxonomy_slug: string
      post_type_slug: string
      slug: string
      status?: string
      created_at: string
      updated_at?: string
      deleted_at?: string
      // Common meta fields (stored in term_meta, merged at query time)
      name?: string
      description?: string
      // Post count (computed at query time)
      post_count?: number
      // Additional custom fields from term_meta
      [key: string]: any
    }

    interface TaxonomyConfig {
      post_type_slug: string
      slug: string
      name_singular?: string
      name_plural?: string
      description?: string
      show_in_menu?: boolean
      icon?: string
      badge?: number
      position?: number
      capabilities?: Record<string, string>
      priority?: number
      order?: number
    }

    interface Taxonomy extends TaxonomyConfig {
      id: number
      created_at?: string
      updated_at?: string
      fields?: Field[]
      resolvedCapabilities?: string[]
    }

    interface TaxonomyQuery {
      relation?: 'AND' | 'OR'
      queries: TaxonomyQueryCondition[]
    }

    interface TaxonomyQueryCondition {
      taxonomy: string
      terms: number[] | string[]
      operator?: 'IN' | 'NOT IN'
    }
  }
}

export {}
