import path from 'path'
import fs from 'fs'
import type { Request, Response, NextFunction } from 'express'

interface ProviderRequest {
  req: Request & { hooks: any; context: any }
  res: Response
  next: NextFunction
}

export default async ({ req, res, next }: ProviderRequest): Promise<void> => {
  const { addControl } = req.hooks
  const { parseVue } = req.context

  const dir = path.resolve('./core/providers/dashboard-provider/ui-controls')
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.vue'))

  for (const filename of files) {
    await addControl({
      slug: filename.replace('.vue', '').toLowerCase(),
      callback: async () => {
        const filePath = path.resolve(`${dir}/${filename}`)
        return parseVue(filePath)
      }
    })
  }
}
