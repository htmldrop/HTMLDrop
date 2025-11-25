import path from 'path'
import fs from 'fs'

export default async ({ req, res, next }) => {
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
