import express from 'express'

export default (context) => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /dashboard/menu:
   *   get:
   *     tags:
   *       - Dashboard
   *     summary: Get admin menu tree
   *     description: Retrieve the complete admin menu tree structure with navigation items
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Admin menu tree retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   id:
   *                     type: string
   *                     description: Unique menu item identifier
   *                   label:
   *                     type: string
   *                     description: Display label for the menu item
   *                   path:
   *                     type: string
   *                     description: Navigation path
   *                   icon:
   *                     type: string
   *                     description: Icon identifier
   *                   children:
   *                     type: array
   *                     description: Nested menu items
   *       401:
   *         description: Unauthorized - Invalid or missing token
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/menu', async (req, res) => {
    const { getMenuTree } = req.hooks
    res.json(await getMenuTree())
  })

  /**
   * @openapi
   * /dashboard/controls:
   *   get:
   *     tags:
   *       - Dashboard
   *     summary: Get field controls
   *     description: Retrieve available field control types for custom fields (text, textarea, select, etc.)
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Field controls retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   type:
   *                     type: string
   *                     description: Control type identifier
   *                     example: text
   *                   label:
   *                     type: string
   *                     description: Display label
   *                     example: Text Input
   *                   component:
   *                     type: string
   *                     description: Frontend component name
   *                   options:
   *                     type: object
   *                     description: Control-specific options
   *       401:
   *         description: Unauthorized - Invalid or missing token
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/controls', async (req, res) => {
    const { getControls } = req.hooks
    res.json(await getControls())
  })

  return router
}
