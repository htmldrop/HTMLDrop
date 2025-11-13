export default class RegisterControls {
  constructor(req, res, next) {
    this.hooks = req.hooks
    this.controls = []
  }

  async addControl({ slug, callback }) {
    this.controls.push({ slug, callback })
    this.hooks.doAction('controlAdded', { slug })
  }

  async getControls() {
    return Promise.all(
      this.controls.map(async (control) => {
        return {
          slug: control.slug,
          vue_instance: await control.callback()
        }
      })
    )
  }
}
