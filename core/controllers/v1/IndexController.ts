import type { Router, Request, Response } from 'express'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { createRequire } from 'module'
import swaggerSpec from '../../config/swagger.mjs'

const require = createRequire(import.meta.url)
const { default: redoc } = require('redoc-express')

export default (_context: HTMLDrop.Context): Router => {
  const router = express.Router({ mergeParams: true })

  // Serve Redoc (primary documentation - better theme)
  router.get(
    '/docs',
    redoc({
      title: 'CoralPen API Documentation',
      specUrl: '/api/v1/openapi.json',
      redocOptions: {
        theme: {
          colors: {
            primary: {
              main: '#2563eb'
            }
          },
          typography: {
            fontSize: '15px',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            headings: {
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }
          },
          sidebar: {
            backgroundColor: '#fafafa',
            textColor: '#333'
          }
        },
        hideDownloadButton: false,
        disableSearch: false,
        hideHostname: false,
        expandResponses: '200,201',
        jsonSampleExpandLevel: 2,
        sortPropsAlphabetically: true,
        menuToggle: true,
        nativeScrollbars: false
      },
      customCss: `
        .api-info p:last-child,
        .menu-content p:last-child,
        [role="contentinfo"] {
          display: none !important;
        }
      `
    })
  )

  // Alternative: Serve Swagger UI at /docs/swagger
  router.use('/docs/swagger', swaggerUi.serve)
  router.get('/docs/swagger', swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'CoralPen API Documentation - Swagger UI',
    customfavIcon: '/favicon.ico'
  }))

  // OpenAPI JSON spec
  router.get('/openapi.json', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })

  // API root - redirect to docs
  router.get('/', async (req: Request, res: Response) => {
    res.redirect('/api/v1/docs')
  })

  return router
}
