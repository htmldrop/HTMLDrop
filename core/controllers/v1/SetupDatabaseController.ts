import type { Router, Request, Response } from 'express'
import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import Knex from 'knex'

interface SetupRequest extends Request {
  body: {
    client?: string
    connection?: Record<string, unknown>
    prefix?: string
  }
}

interface ManualUpdates {
  PORT: string | number
  CORS_ORIGIN: string
  SALT_ROUNDS: string | number
  JWT_SECRET: string
  JWT_REFRESH_SECRET: string
  JWT_EXPIRES_IN: string
  JWT_REFRESH_EXPIRES_IN: string
  ALLOW_REGISTRATIONS: string
  DEFAULT_ROLES: string
  TABLE_PREFIX: string
  HD_TRACING_ENABLED: string
  HD_TRACING_SAMPLE_RATE: string
  HD_TRACING_VERBOSE: string
  HD_TRACING_PERSIST: string
  HD_TRACING_MAX_TRACES: string
}

export default (_context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /setup/database:
   *   post:
   *     tags:
   *       - Setup
   *     summary: Configure database connection
   *     description: Set up database connection settings and write to .env file. Tests connection before saving. Generates JWT secrets if not provided.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - client
   *               - connection
   *             properties:
   *               client:
   *                 type: string
   *                 enum: [mysql, mysql2, pg, sqlite3, better-sqlite3]
   *                 description: Database client type
   *                 example: mysql2
   *               connection:
   *                 type: object
   *                 description: Database connection parameters (varies by client)
   *                 properties:
   *                   host:
   *                     type: string
   *                     example: localhost
   *                   port:
   *                     type: integer
   *                     example: 3306
   *                   user:
   *                     type: string
   *                     example: root
   *                   password:
   *                     type: string
   *                     example: password
   *                   database:
   *                     type: string
   *                     example: htmldrop
   *               prefix:
   *                 type: string
   *                 description: Table prefix
   *                 example: hd_
   *                 default: hd_
   *             example:
   *               client: mysql2
   *               connection:
   *                 host: localhost
   *                 port: 3306
   *                 user: root
   *                 password: password
   *                 database: htmldrop
   *               prefix: hd_
   *     responses:
   *       200:
   *         description: Database configured successfully
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Configuration updated successfully. Updating all workers...
   *       400:
   *         description: Invalid configuration or connection failed
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Database client and connection are required.
   *       500:
   *         description: Failed to write configuration
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: Failed to write to .env file.
   */
  router.post('/', express.json(), async (req: Request, res: Response) => {
    const setupReq = req as SetupRequest
    // Define default env values.
    const manualUpdates: ManualUpdates = {
      PORT: process.env.PORT || 3001,
      CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
      SALT_ROUNDS: process.env.SALT_ROUNDS || 12,
      JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
      JWT_REFRESH_SECRET: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
      JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      ALLOW_REGISTRATIONS: process.env.ALLOW_REGISTRATIONS || 'false',
      DEFAULT_ROLES: process.env.DEFAULT_ROLES || 'user',
      TABLE_PREFIX: 'hd_',
      // Performance Tracing defaults
      HD_TRACING_ENABLED: process.env.HD_TRACING_ENABLED || 'true',
      HD_TRACING_SAMPLE_RATE: process.env.HD_TRACING_SAMPLE_RATE || '1.0',
      HD_TRACING_VERBOSE: process.env.HD_TRACING_VERBOSE || 'false',
      HD_TRACING_PERSIST: process.env.HD_TRACING_PERSIST || 'false',
      HD_TRACING_MAX_TRACES: process.env.HD_TRACING_MAX_TRACES || '100'
    }

    // Define the mapping for updates coming from the request body.
    const inputVarMapping: Record<string, string> = {
      client: 'DB_CLIENT',
      connection: 'DB_CONNECTION'
    }

    const updates = setupReq.body

    if (!updates.client || !updates.connection) {
      return res.status(400).send('Database client and connection are required.')
    }

    manualUpdates.TABLE_PREFIX = updates.prefix || 'hd_'

    // Verify that db connection works
    const knex = Knex({
      client: updates.client,
      connection: { ...updates.connection },
      useNullAsDefault: true
    })

    try {
      await knex.raw('SELECT 1+1 AS result')
    } catch (error) {
      console.error(error)
      return res.status(400).send(error instanceof Error ? error.message : String(error))
    } finally {
      await knex.destroy()
    }

    // Update env
    const envPath = path.resolve('.env')
    let envContent = ''

    try {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8')
      }

      const lines = envContent.split('\n')
      const newLines: string[] = []
      const updatedKeys = new Set<string>()

      // Phase 1: Process and add manual updates first.
      for (const manKey in manualUpdates) {
        const value = manualUpdates[manKey as keyof ManualUpdates]
        newLines.push(`${manKey}=${value}`)
        updatedKeys.add(manKey)
      }

      // Phase 2: Process updates from the existing file and user input.
      for (const line of lines) {
        const [key] = line.split('=')

        // Skip lines that were manually updated.
        if (updatedKeys.has(key)) {
          continue
        }

        let isUpdated = false

        // Check for updates from the request body.
        for (const reqKey in inputVarMapping) {
          if (Object.prototype.hasOwnProperty.call(updates, reqKey) && key === inputVarMapping[reqKey]) {
            let newValue: string | unknown = updates[reqKey as keyof typeof updates]
            if (typeof newValue === 'object') {
              newValue = JSON.stringify(newValue)
            }
            newLines.push(`${key}=${newValue}`)
            updatedKeys.add(key)
            isUpdated = true
            break
          }
        }

        // If the line was not updated, add the original line back.
        if (!isUpdated && line.trim() !== '') {
          newLines.push(line)
        }
      }

      // Phase 3: Add new input variables that weren't in the original file.
      for (const reqKey in inputVarMapping) {
        const envKey = inputVarMapping[reqKey]
        if (Object.prototype.hasOwnProperty.call(updates, reqKey) && !updatedKeys.has(envKey)) {
          let newValue: string | unknown = updates[reqKey as keyof typeof updates]
          if (typeof newValue === 'object') {
            newValue = JSON.stringify(newValue)
          }
          newLines.push(`${envKey}=${newValue}`)
        }
      }

      const updatedEnvContent = newLines.join('\n').trim()
      fs.writeFileSync(envPath, updatedEnvContent)

      process.send?.({ type: 'db_config_updated' })

      res.status(200).send('Configuration updated successfully. Updating all workers...')
    } catch (error) {
      console.error('Failed to update .env file:', error)
      res.status(500).send('Failed to write to .env file.')
    }
  })

  return router
}
