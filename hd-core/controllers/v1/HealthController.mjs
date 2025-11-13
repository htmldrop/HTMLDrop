import express from 'express'
import MonitoringService from '../../services/MonitoringService.mjs'

export default (context) => {
  const router = express.Router({ mergeParams: true })
  const monitoring = new MonitoringService(context)

  /**
   * @openapi
   * /health:
   *   get:
   *     tags:
   *       - Health
   *     summary: Get system health status
   *     description: Returns the current health status of the system including database, admin user, memory usage, and error rates
   *     responses:
   *       200:
   *         description: System health information
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Health'
   *             example:
   *               status: healthy
   *               uptime: 123456
   *               timestamp: "2025-01-12T10:00:00.000Z"
   *               checks:
   *                 - name: database
   *                   slug: database
   *                   status: pass
   *                   message: "Database connection successful"
   *                   ok: true
   *                 - name: admin
   *                   slug: admin
   *                   status: pass
   *                   message: "Admin user exists"
   *                   ok: true
   */
  router.get('/', async (req, res) => {
    const health = await monitoring.getHealth()

    // Always return 200 OK - let clients interpret the health status
    // This allows the setup wizard to load when database isn't configured
    res.status(200).json(health)
  })

  /**
   * @openapi
   * /health/metrics:
   *   get:
   *     tags:
   *       - Health
   *     summary: Get detailed system metrics
   *     description: Returns detailed metrics including memory usage, request counts, and error rates
   *     responses:
   *       200:
   *         description: Detailed system metrics
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  router.get('/metrics', (req, res) => {
    const metrics = monitoring.getMetrics()
    res.json(metrics)
  })

  /**
   * @openapi
   * /health/stats/requests:
   *   get:
   *     tags:
   *       - Health
   *     summary: Get request statistics
   *     description: Returns request statistics for a given time window
   *     parameters:
   *       - in: query
   *         name: window
   *         schema:
   *           type: integer
   *           default: 60000
   *         description: Time window in milliseconds
   *     responses:
   *       200:
   *         description: Request statistics
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  router.get('/stats/requests', (req, res) => {
    const timeWindow = parseInt(req.query.window) || 60000
    const stats = monitoring.getRequestStats(timeWindow)
    res.json(stats)
  })

  /**
   * @openapi
   * /health/stats/errors:
   *   get:
   *     tags:
   *       - Health
   *     summary: Get error statistics
   *     description: Returns error statistics for a given time window
   *     parameters:
   *       - in: query
   *         name: window
   *         schema:
   *           type: integer
   *           default: 60000
   *         description: Time window in milliseconds
   *     responses:
   *       200:
   *         description: Error statistics
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  router.get('/stats/errors', (req, res) => {
    const timeWindow = parseInt(req.query.window) || 60000
    const stats = monitoring.getErrorStats(timeWindow)
    res.json(stats)
  })

  // Legacy endpoint for backward compatibility
  router.get('/legacy', async (req, res) => {
    const { knex, table } = context
    const database = { name: 'Database', slug: 'database', status: 'not-connected', message: '', ok: false }
    const admin = { name: 'Admin User', slug: 'admin', status: 'not-found', message: '', ok: false }

    if (knex) {
      try {
        await knex.raw('SELECT 1+1 AS result')
        database.status = 'connected'
        database.ok = true
      } catch (err) {
        database.message = err.message
      }
    }

    if (database.ok) {
      try {
        const adminUserRole = await knex(table('roles'))
          .join(table('user_roles'), `${table('roles')  }.id`, '=', `${table('user_roles')  }.role_id`)
          .where(`${table('roles')  }.slug`, 'administrator')
          .first()

        if (adminUserRole) {
          admin.status = 'exists'
          admin.ok = true
        }
      } catch (err) {
        admin.message = err.message
      }
    }
    res.json([database, admin])
  })

  // Store monitoring instance for use in middleware
  context.monitoring = monitoring

  return router
}
