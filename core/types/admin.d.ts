/**
 * Admin Menu & Controls Types
 */

declare global {
  namespace HTMLDrop {
    interface MenuItem {
      id: string
      slug: string
      label: string
      path?: string
      icon?: string
      component?: string
      capability?: string
      parent?: string
      order?: number
      children?: MenuItem[]
    }

    interface MenuPageConfig {
      slug: string
      title: string
      component?: string
      icon?: string
      order?: number
      capability?: string
      parent?: string
    }

    interface SubMenuPageConfig extends MenuPageConfig {
      parent: string
    }

    interface Control {
      type: string
      label: string
      component?: string
      options?: Record<string, any>
    }
  }
}

export {}
