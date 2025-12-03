import type { Router, Request, Response } from 'express'
import express from 'express'
import { hash, validate as validatePassword } from '../../utils/password.ts'
import { validate as validateEmail } from '../../utils/email.ts'

interface SetupRequest extends Request {
  body: {
    email?: string
    password?: string
    locale?: string
  }
}

interface Role {
  id: number
  slug: string
}

export default (context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /setup/admin:
   *   post:
   *     tags:
   *       - Setup
   *     summary: Create administrator account
   *     description: Create the initial administrator user account during setup. Validates email and password strength.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 description: Administrator email address
   *                 example: admin@example.com
   *               password:
   *                 type: string
   *                 format: password
   *                 description: Administrator password (must meet strength requirements)
   *                 example: SecurePassword123!
   *               locale:
   *                 type: string
   *                 description: Administrator's preferred locale
   *                 default: en_US
   *                 example: en_US
   *     responses:
   *       200:
   *         description: Administrator account created successfully
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Database configured successfully. Updating all workers...
   *       400:
   *         description: Validation failed or invalid input
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Password must be at least 8 characters long
   *       500:
   *         description: Administrator role not found or database error
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Administrator role not found. Database may not be properly seeded.
   */
  router.post('/', express.json(), async (req: Request, res: Response) => {
    const setupReq = req as SetupRequest
    const { knex, table } = context
    try {
      const username = setupReq.body.email?.split('@')[0]?.trim()
      const email = setupReq.body.email?.trim()
      const password = setupReq.body.password?.trim()
      const locale = setupReq.body.locale?.trim() || 'en_US'

      const emailValidation = validateEmail(email || '')
      const passwordValidation = validatePassword(password || '')

      if (!emailValidation.valid) {
        return res.status(400).send(emailValidation.message)
      }

      if (!passwordValidation.valid) {
        return res.status(400).send(passwordValidation.message)
      }

      const role = await knex(table('roles')).where('slug', 'administrator').first() as Role | undefined

      if (!role) {
        return res.status(500).send('Administrator role not found. Database may not be properly seeded.')
      }

      const [userId] = await knex(table('users')).insert({
        username,
        email,
        password: await hash(password || ''),
        locale
      })

      await knex(table('user_roles')).insert({ user_id: userId, role_id: role.id })

      res.status(200).send('Database configured successfully. Updating all workers...')
    } catch (error) {
      console.log(error)
      res.status(500).send('Failed to write to .env file.')
    }
  })

  return router
}
