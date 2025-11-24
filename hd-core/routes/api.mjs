import express from 'express'
import IndexController from '../controllers/v1/IndexController.mjs'
import HealthController from '../controllers/v1/HealthController.mjs'
import SetupDatabaseController from '../controllers/v1/SetupDatabaseController.mjs'
import SetupAdminController from '../controllers/v1/SetupAdminController.mjs'
import PostTypesController from '../controllers/v1/PostTypesController.mjs'
import PostTypeFieldsController from '../controllers/v1/PostTypeFieldsController.mjs'
import PostsController from '../controllers/v1/PostsController.mjs'
import TaxonomiesController from '../controllers/v1/TaxonomiesController.mjs'
import TaxonomyFieldsController from '../controllers/v1/TaxonomyFieldsController.mjs'
import TermsController from '../controllers/v1/TermsController.mjs'
import UsersController from '../controllers/v1/UsersController.mjs'
import OptionsController from '../controllers/v1/OptionsController.mjs'
import AuthController from '../controllers/v1/AuthController.mjs'
import OAuthController from '../controllers/v1/OAuthController.mjs'
import TranslateController from '../controllers/v1/TranslateController.mjs'
import DashboardController from '../controllers/v1/DashboardController.mjs'
import PluginsController from '../controllers/v1/PluginsController.mjs'
import ThemesController from '../controllers/v1/ThemesController.mjs'
import JobsController from '../controllers/v1/JobsController.mjs'
import UpdateController from '../controllers/v1/UpdateController.mjs'
import BadgeCountController from '../controllers/v1/BadgeCountController.mjs'
import dbCheckMiddleware from '../middlewares/dbCheckMiddleware.mjs'
import dbRequiredMiddleware from '../middlewares/dbRequiredMiddleware.mjs'
import adminCheckMiddleware from '../middlewares/adminCheckMiddleware.mjs'
import jwtMiddleware from '../middlewares/jwtMiddleware.mjs'
import registryMiddleware from '../middlewares/registryMiddleware.mjs'

export default (context) => {
  const router = express.Router()

  // Apply both body parsers to the router
  router.use(
    express.json({
      type: (req) => {
        
        const contentType = req.headers['content-type'] || ''
        return contentType === '' || contentType.includes('json') || contentType.includes('text/plain')
      }
    })
  )
  router.use(express.urlencoded({ extended: true }))

  // Redirect api to v1
  router.get('/', (req, res) => {
    res.redirect('/api/v1')
  })

  // API index
  router.use('/v1', IndexController(context))
  router.use('/v1/health', HealthController(context))

  // Installation routes
  router.use('/v1/setup/database', dbCheckMiddleware(context), SetupDatabaseController(context))
  router.use(
    '/v1/setup/admin',
    dbRequiredMiddleware(context),
    adminCheckMiddleware(context),
    SetupAdminController(context)
  )

  // Unprotected routes (no JWT, but need registries for email, etc.)
  router.use('/v1/auth', registryMiddleware(context), AuthController(context))
  router.use('/v1/oauth', registryMiddleware(context), OAuthController(context))
  router.use('/v1/translations', TranslateController(context))

  // Protected routes
  router.use('/v1/users', jwtMiddleware(context), registryMiddleware(context), UsersController(context))
  router.use('/v1/options', jwtMiddleware(context), registryMiddleware(context), OptionsController(context))
  router.use('/v1/dashboard', jwtMiddleware(context), registryMiddleware(context), DashboardController(context))
  router.use('/v1/plugins', jwtMiddleware(context), registryMiddleware(context), PluginsController(context))
  router.use('/v1/themes', jwtMiddleware(context), registryMiddleware(context), ThemesController(context))
  router.use('/v1/jobs', jwtMiddleware(context), registryMiddleware(context), JobsController(context))
  router.use('/v1/updates', jwtMiddleware(context), registryMiddleware(context), UpdateController(context))
  router.use('/v1/badge-counts', jwtMiddleware(context), registryMiddleware(context), BadgeCountController(context))
  router.use('/v1/post-types', jwtMiddleware(context), registryMiddleware(context), PostTypesController(context))
  router.use(
    '/v1/:postType/taxonomies',
    jwtMiddleware(context),
    registryMiddleware(context),
    TaxonomiesController(context)
  )
  router.use(
    '/v1/:postType/taxonomies/:taxonomy/fields',
    jwtMiddleware(context),
    registryMiddleware(context),
    TaxonomyFieldsController(context)
  )
  router.use(
    '/v1/:postType/terms/:taxonomy',
    jwtMiddleware(context),
    registryMiddleware(context),
    TermsController(context)
  )
  router.use(
    '/v1/:postType/fields',
    jwtMiddleware(context),
    registryMiddleware(context),
    PostTypeFieldsController(context)
  )
  router.use('/v1/:postType', jwtMiddleware(context), registryMiddleware(context), PostsController(context))

  return router
}
