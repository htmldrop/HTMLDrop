export default class RegisterAdminMenu {
  constructor(req, res, next) {
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
  }) {
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
  }) {
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

  async getMenuTree() {
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
