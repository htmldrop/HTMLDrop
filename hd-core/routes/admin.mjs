import path from 'path'
import express from 'express'

export default (context) => {
  const router = express.Router()
  const adminPath = path.resolve('./hd-core/admin/dist')

  // Admin routes
  router.use('/', express.static(adminPath))

  // History mode support: return index.html for non-static routes
  router.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(adminPath, 'index.html'))
  })

  return router
}
