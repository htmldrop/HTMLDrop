import type { Request, Response, NextFunction } from 'express'

interface Control {
  slug: string
  callback: () => Promise<string>
}

interface ControlOutput {
  slug: string
  vue_instance: string
}

export default class RegisterControls {
  private hooks: any
  private controls: Control[]

  constructor(req: Request & { hooks: any }, res: Response, next: NextFunction) {
    this.hooks = req.hooks
    this.controls = []
  }

  async addControl({ slug, callback }: Control): Promise<void> {
    this.controls.push({ slug, callback })
    this.hooks.doAction('controlAdded', { slug })
  }

  async getControls(): Promise<ControlOutput[]> {
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
