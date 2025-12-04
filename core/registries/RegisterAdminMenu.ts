import type { Request, Response, NextFunction } from 'express'

interface Capabilities {
  [key: string]: string
}

interface MenuPage {
  slug: string
  page_title?: string
  menu_title?: string
  name_singular?: string
  name_plural?: string
  icon?: string
  callback?: () => Promise<string>
  position: number
  badge: number
  capabilities: Capabilities
}

interface SubMenuPage {
  parent_slug: string
  slug: string
  page_title?: string
  menu_title?: string
  name_singular?: string
  name_plural?: string
  callback?: () => Promise<string>
  position: number
  badge: number
  capabilities: Capabilities
}

interface MenuPageInput {
  slug: string
  page_title?: string
  menu_title?: string
  name_singular?: string
  name_plural?: string
  icon?: string
  callback?: () => Promise<string>
  position?: number
  badge?: number
  capabilities?: Capabilities
}

interface SubMenuPageInput {
  parent_slug: string
  slug: string
  page_title?: string
  menu_title?: string
  name_singular?: string
  name_plural?: string
  callback?: () => Promise<string>
  position?: number
  badge?: number
  capabilities?: Capabilities
}

interface MenuTreeItem extends MenuPage {
  vue_instance?: string
  children: (SubMenuPage & { vue_instance?: string })[]
}

export default class RegisterAdminMenu {
  private hooks: any
  private req: Request & { hooks: any; guard?: any }
  private res: Response
  private menus: MenuPage[]
  private submenus: SubMenuPage[]

  constructor(req: Request & { hooks: any; guard?: any }, res: Response, next: NextFunction) {
    this.hooks = req.hooks
    this.req = req
    this.res = res
    this.menus = []
    this.submenus = []
  }

  async addMenuPage({
    slug,
    page_title,
    menu_title,
    name_singular,
    name_plural,
    icon,
    callback,
    position = 0,
    badge = 0,
    capabilities = {}
  }: MenuPageInput): Promise<void> {
    if (!(await this.req.guard?.user({ canOneOf: capabilities }))) return

    this.menus.push({
      slug,
      page_title,
      menu_title,
      name_singular,
      name_plural,
      icon,
      callback,
      position,
      badge,
      capabilities
    })
    this.menus.sort((a, b) => a.position - b.position)

    this.hooks.doAction('menuPageAdded', { slug, page_title, menu_title, position })
  }

  async addSubMenuPage({
    parent_slug,
    slug,
    page_title,
    menu_title,
    name_singular,
    name_plural,
    callback,
    position = 0,
    badge = 0,
    capabilities = {}
  }: SubMenuPageInput): Promise<void> {
    if (!(await this.req.guard?.user({ canOneOf: capabilities }))) return

    this.submenus.push({
      parent_slug,
      slug,
      page_title,
      menu_title,
      name_singular,
      name_plural,
      callback,
      position,
      badge,
      capabilities
    })
    this.submenus.sort((a, b) => a.position - b.position)

    this.hooks.doAction('subMenuPageAdded', { parent_slug, slug, page_title, menu_title, position })
  }

  async getMenuTree(): Promise<MenuTreeItem[]> {
    return Promise.all(
      this.menus.map(async (menu) => {
        const children = await Promise.all(
          this.submenus
            .filter((sub) => sub.parent_slug === menu.slug)
            .sort((a, b) => a.position - b.position)
            .map(async (sub) => ({
              ...sub,
              vue_instance: sub.callback ? await sub.callback() : undefined
            }))
        )

        return {
          ...menu,
          vue_instance: menu.callback ? await menu.callback() : undefined,
          children
        }
      })
    )
  }
}
