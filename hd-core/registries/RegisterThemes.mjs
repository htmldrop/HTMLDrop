import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import express from 'express'

// Helper: compute folder hash (ignores node_modules)
const getFolderHash = async (folderPath) => {
  const files = await fs.promises.readdir(folderPath, { withFileTypes: true })
  const mtimes = []

  for (const file of files) {
    if (file.name === 'node_modules') continue
    const fullPath = path.join(folderPath, file.name)
    if (file.isDirectory()) {
      mtimes.push(await getFolderHash(fullPath))
    } else {
      const stats = await fs.promises.stat(fullPath)
      mtimes.push(stats.mtimeMs.toString())
    }
  }

  return crypto.createHash('md5').update(mtimes.join('|')).digest('hex')
}

export default class RegisterThemes {
  constructor(req, res, next) {
    this.req = req
    this.res = res
    this.next = next
    this.context = req.context
    this.hooks = req.hooks
  }

  async init() {
    // Dynamically load provider modules from active theme @todo - load theme dynamically
    const { options } = this.context

    try {
      const themeFolder = path.resolve(`./hd-content/themes/${options.theme}`)
      const themeIndex = path.join(themeFolder, 'index.mjs')

      // Compute folder hash dynamically
      const folderHash = await getFolderHash(themeFolder)

      if (fs.existsSync(themeFolder)) {
        try {
          const mod = await import(`${themeIndex}?t=${folderHash}`)
          if (typeof mod.default === 'function') {
            const router = express.Router()
            await (
              await mod.default.call(
                { req: this.req, res: this.res, next: this.next, router },
                { req: this.req, res: this.res, next: this.next, router }
              )
            )?.init()
          }
        } catch (err) {
          console.error(`Failed to load provider ${themeIndex}:`, err)
        }
      }
    } catch (e) {
      console.log('Theme could not load', options)
    }
  }
}
