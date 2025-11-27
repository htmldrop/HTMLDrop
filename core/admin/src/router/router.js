import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Shell',
      component: () => import('@/components/Shell.vue'),
      children: [
        {
          path: '',
          name: 'Dashboard',
          redirect: '/dashboard'
        },
        {
          path: 'users',
          name: 'Users',
          component: () => import('@/views/Users.vue'),
          props: true,
          meta: { slug: 'users' }
        },
        {
          path: 'users/:sub',
          name: 'User',
          component: () => import('@/views/User.vue'),
          props: true,
          meta: { slug: 'users' }
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/Options.vue'),
          props: true,
          meta: { slug: 'settings' }
        },
        {
          path: 'settings/:sub',
          name: 'Setting',
          component: () => import('@/views/Option.vue'),
          props: true,
          meta: { slug: 'settings' }
        },
        {
          path: ':slug/terms/:taxonomy',
          name: 'Terms',
          component: () => import('@/views/Terms.vue'),
          props: true
        },
        {
          path: ':slug/terms/:taxonomy/:sub',
          name: 'Term',
          component: () => import('@/views/Term.vue'),
          props: true
        },
        {
          path: ':slug',
          name: 'Posts',
          component: () => import('@/views/Posts.vue'),
          props: true
        },
        {
          path: ':slug/:sub',
          name: 'Post',
          component: () => import('@/views/Post.vue'),
          props: true
        },
        {
          path: ':slug/fields/admin',
          name: 'PostFields',
          component: () => import('@/views/PostFields.vue'),
          props: true
        }
      ]
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Login.vue')
    },
    {
      path: '/reset-password',
      name: 'ResetPassword',
      component: () => import('@/views/ResetPassword.vue')
    },
    {
      path: '/setup',
      redirect: '/setup/database',
      children: [
        {
          path: 'database',
          name: 'SetupDatabase',
          component: () => import('@/views/setup/Database.vue')
        },
        {
          path: 'admin',
          name: 'SetupAdmin',
          component: () => import('@/views/setup/Admin.vue')
        },
        {
          path: 'server-error',
          name: 'ServerError',
          component: () => import('@/views/setup/Error.vue')
        },
        {
          path: ':catchall(.*)',
          redirect: '/setup'
        }
      ]
    },
    {
      path: '/:catchall(.*)',
      component: () => import('@/views/404.vue'),
      name: 'NotFound'
    }
  ]
})

// Only fetch health while not ok
let cachedHealth = null
const getHealth = async () => {
  const apiBase = import.meta.env.VITE_API_BASE
  if (
    cachedHealth &&
    cachedHealth.checks &&
    !cachedHealth.checks.some((h) => ['database', 'admin'].includes(h.slug) && !h.ok)
  ) {
    return cachedHealth
  }
  try {
    const res = await fetch(`${apiBase}/api/v1/health`)
    if (!res.ok) return cachedHealth
    cachedHealth = await res.json()
  } catch (e) {
    console.error(e.message)
  }
  return cachedHealth
}

router.beforeEach(async (to, from) => {
  const health = await getHealth()
  const tokens = localStorage.getItem('tokens')
  const hasDatabase = health?.checks?.some((h) => h.slug === 'database' && h.ok)
  const hasAdmin = health?.checks?.some((h) => h.slug === 'admin' && h.ok)
  const healthy = hasDatabase && hasAdmin

  // Redirect to error page if not connected to server
  if (!health && to.path !== '/setup/server-error') {
    return '/setup/server-error'
  }

  // Redirect to db setup if db config is missing
  if (health && !hasDatabase && to.path !== '/setup/database') {
    return '/setup/database'
  }

  // Redirect to admin setup if admin is missing
  if (hasDatabase && !hasAdmin && to.path !== '/setup/admin') {
    return '/setup/admin'
  }

  // Redirect away from setup if everything is ok
  if (healthy && to.path.startsWith('/setup')) {
    return '/'
  }

  // Redirect to login if not authenticated (except for reset-password)
  if (healthy && !tokens && !to.path.startsWith('/login') && !to.path.startsWith('/reset-password')) {
    return '/login'
  }

  // Redirect to dashboard if authenticated and trying to access login
  if (healthy && tokens && to.path.startsWith('/login')) {
    return '/'
  }
})

export default router
