import path from 'path'
import type { Router, Request, Response } from 'express'
import express from 'express'

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router()
  const adminPath = path.resolve('./core/admin/dist')

  // Admin routes
  router.use('/', express.static(adminPath))

  // History mode support: return index.html for non-static routes
  router.get(/(.*)/, (req: Request, res: Response) => {
    res.sendFile(path.join(adminPath, 'index.html'))
  })

  return router
}
