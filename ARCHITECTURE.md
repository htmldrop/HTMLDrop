# HTMLDrop CMS Architecture

A modern, extensible headless CMS built with Node.js, featuring a WordPress-style hook system, plugin architecture, and Vue-based admin dashboard.

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Core Concepts](#core-concepts)
- [Request Flow](#request-flow)
- [Database Layer](#database-layer)
- [Hooks & Filters](#hooks--filters)
- [Plugins & Themes](#plugins--themes)
- [Services](#services)
- [Admin Dashboard](#admin-dashboard)
- [API Structure](#api-structure)
- [TypeScript Support](#typescript-support)
- [Performance](#performance)

---

## Overview

HTMLDrop is a headless CMS that combines:
- **Express.js** REST API with versioned endpoints (`/api/v1/`)
- **Knex.js** query builder with multi-database support (SQLite, MySQL, PostgreSQL)
- **WordPress-style hooks** for extensibility (actions and filters)
- **Plugin system** with lifecycle management and migrations
- **Theme system** for server-side rendering
- **Vue 3** admin dashboard with dynamic menus and controls
- **WebSocket** support for real-time features
- **Process supervisor** for zero-downtime restarts

---

## Directory Structure

```
htmldrop/
├── core/                          # Main application code
│   ├── index.mjs                  # Entry point (Express + Knex + WebSocket)
│   ├── supervisor.mjs             # Process supervisor for graceful restarts
│   ├── knexfile.mjs               # Database configuration
│   │
│   ├── controllers/v1/            # REST API controllers (24 controllers)
│   │   ├── AuthController.mjs     # Authentication (login, register, refresh)
│   │   ├── PostsController.mjs    # Post CRUD operations
│   │   ├── UsersController.mjs    # User management
│   │   ├── RolesController.mjs    # Role management
│   │   └── ...
│   │
│   ├── services/                  # Business logic (14 services)
│   │   ├── AuthService.mjs        # JWT authentication
│   │   ├── PluginLifecycleService.mjs
│   │   ├── ThemeLifecycleService.mjs
│   │   ├── SchedulerService.mjs   # Cron job scheduler
│   │   └── ...
│   │
│   ├── middlewares/               # Express middlewares
│   │   ├── registryMiddleware.mjs # Initialize hooks/context per request
│   │   ├── jwtMiddleware.mjs      # JWT authentication
│   │   └── ...
│   │
│   ├── registries/                # Registry system (10 registries)
│   │   ├── index.mjs              # Main Registry class
│   │   ├── RegisterAdminMenu.mjs  # Admin sidebar menu
│   │   ├── RegisterPostTypes.mjs  # Custom post types
│   │   ├── RegisterControls.mjs   # Field control types
│   │   └── ...
│   │
│   ├── providers/                 # Data providers for admin UI
│   │   ├── dashboard-provider/    # Admin menu, post types, controls
│   │   ├── jobs-provider/         # Background job management
│   │   └── quick-draft-provider/
│   │
│   ├── routes/                    # Route handlers
│   │   ├── web.mjs                # Frontend (theme rendering)
│   │   ├── admin.mjs              # Admin dashboard (Vue SPA)
│   │   └── api.mjs                # REST API (/api/v1/)
│   │
│   ├── database/
│   │   ├── migrations/            # Knex migrations (33 migrations)
│   │   └── seeds/                 # Database seeds (9 seeds)
│   │
│   ├── types/                     # TypeScript definitions (16 files)
│   │   ├── index.d.ts             # Main entry point
│   │   ├── context.d.ts           # Context object types
│   │   ├── hooks.d.ts             # Hook/filter types
│   │   └── ...
│   │
│   ├── admin/                     # Vue 3 admin dashboard
│   │   ├── src/
│   │   │   ├── views/             # Page components
│   │   │   ├── components/        # Reusable components
│   │   │   └── utils/             # API helpers
│   │   └── dist/                  # Built output
│   │
│   ├── utils/                     # Utility functions
│   ├── validators/                # Input validation
│   ├── translations/              # i18n translations
│   └── config/                    # ESLint, Prettier, Vitest configs
│
├── content/                       # User-managed content
│   ├── plugins/                   # Installed plugins
│   ├── themes/                    # Installed themes
│   ├── uploads/                   # Media uploads
│   └── config/                    # Site configuration
│
├── tsconfig.json                  # TypeScript configuration
├── package.json                   # NPM dependencies and scripts
└── docker-compose.yml             # Docker deployment
```

---

## Core Concepts

### Context Object

The `context` object is the central state container, available throughout the application:

```javascript
// Available via req.context in controllers/middlewares
// Passed to plugins and themes

context = {
  app,                    // Express application
  knex,                   // Knex database instance
  options,                // Site options from database
  postTypes,              // Registered post types
  taxonomies,             // Registered taxonomies
  hooks,                  // Hooks system
  guard,                  // Authorization helper
  scheduler,              // Cron job scheduler

  // Helper methods
  table(name),            // Get prefixed table name
  formatDate(date),       // Format dates
  normalizeSlug(value),   // Create URL-safe slugs
  translate(key, locale), // i18n translation
}
```

### Guard (Authorization)

Capability-based authorization:

```javascript
// Check if user has permission
const canManage = await req.guard.user({
  canOneOf: ['manage_posts', 'edit_posts'],
  userId: req.user?.id
})

// In controllers
if (!canManage) {
  return res.status(403).json({ success: false, message: 'Permission denied' })
}
```

---

## Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HTTP Request                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Express Middleware Stack                          │
│  1. Body parsing (json, urlencoded)                                 │
│  2. Security (helmet, cors, rate limiting)                          │
│  3. dbCheckMiddleware - Verify DB configured                        │
│  4. jwtMiddleware - Authenticate JWT token → req.user               │
│  5. registryMiddleware - Initialize context/hooks → req.context     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
              ┌─────────┐  ┌───────────┐  ┌──────────┐
              │ /admin  │  │ /api/v1/  │  │    /*    │
              │  (Vue)  │  │  (REST)   │  │  (Theme) │
              └─────────┘  └───────────┘  └──────────┘
                    │             │             │
                    ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Controllers/Handlers                         │
│  - Access req.context, req.hooks, req.guard                         │
│  - Use services for business logic                                  │
│  - Return JSON responses (API) or HTML (themes)                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Layer

### Configuration

Database is configured via environment variables:

```bash
DB_CLIENT=better-sqlite3    # or mysql2, pg
DB_CONNECTION='{"filename":"./content/database.sqlite"}'
TABLE_PREFIX=hd_            # Prefix for all tables
```

### Using Knex

```javascript
// In controllers/services
const { knex, table } = req.context

// Query with prefixed table
const posts = await knex(table('posts'))
  .where('status', 'published')
  .orderBy('created_at', 'desc')
  .limit(10)

// Join example
const postsWithAuthors = await knex(table('posts'))
  .join(table('users'), `${table('posts')}.author_id`, `${table('users')}.id`)
  .select(`${table('posts')}.*`, `${table('users')}.username`)
```

### Migrations

```bash
# Create migration
npm run make:migration -- create_my_table

# Run migrations
npm run migrate

# Run seeds
npm run seed

# Rollback
npm run rollback
```

### Core Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts |
| `posts` | Content posts (all post types) |
| `terms` | Taxonomy terms |
| `options` | Site settings |
| `roles` | User roles |
| `capabilities` | Permissions |
| `post_types` | Registered post types |
| `taxonomies` | Registered taxonomies |
| `post_meta`, `usermeta`, `term_meta` | Metadata storage |

---

## Hooks & Filters

WordPress-style hook system for extensibility.

### Actions (Events)

Actions are fired at specific points and don't return values:

```javascript
// Register an action
req.hooks.addAction('save_post', async (post) => {
  console.log('Post saved:', post.id)
  // Send notification, update cache, etc.
}, 10) // priority (lower = earlier)

// Fire an action
await req.hooks.doAction('save_post', post)
```

### Filters (Data Transformation)

Filters modify and return values:

```javascript
// Register a filter
req.hooks.addFilter('the_content', (content, post) => {
  // Add "Read more" link
  return content + `<a href="/posts/${post.slug}">Read more</a>`
}, 10)

// Apply filters
const content = await req.hooks.applyFilters('the_content', post.content, post)
```

### Built-in Hooks

**Actions:**
- `init` - After registry initialization
- `save_post`, `create_post`, `delete_post` - Post lifecycle
- `save_term`, `delete_term` - Term lifecycle

**Filters:**
- `the_content`, `the_title`, `the_excerpt` - Content transformation
- `registerPostType` - Modify post type registration
- `registerTaxonomy` - Modify taxonomy registration

**Admin Menu:**
- `addMenuPage(options)` - Add top-level menu item
- `addSubMenuPage(options)` - Add submenu item
- `getMenuTree()` - Get menu structure

---

## Plugins & Themes

### Plugin Structure

```
content/plugins/my-plugin/
├── package.json              # NPM metadata + htmldrop config
├── index.mjs                 # Main plugin file
├── config.mjs                # Optional configuration
└── migrations/               # Optional database migrations
    └── 001_create_table.mjs
```

**package.json:**
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "htmldrop": {
    "name": "My Plugin",
    "description": "Plugin description",
    "requires": "1.0.0"
  },
  "keywords": [
    "hd-plugin"
  ]
}
```

Adding "hd-plugin" as keyword makes plugin installable from plugins dashboard

**index.mjs:**
```javascript
export default async function (context) {
  const { hooks, knex, table } = context

  // Register hooks
  hooks.addFilter('the_content', (content) => {
    return content.replace(/foo/g, 'bar')
  })

  // Add admin menu
  hooks.addMenuPage({
    slug: 'my-plugin',
    label: 'My Plugin',
    icon: '<svg>...</svg>',
    position: 50,
    capability: 'manage_options'
  })

  return {
    // Optional lifecycle hooks
    async init() { /* Called on activation */ },
    async deactivate() { /* Called on deactivation */ }
  }
}
```

### Theme Structure

```
content/themes/my-theme/
├── package.json
├── index.mjs                 # Main theme file
├── config.mjs
├── client/                   # Frontend assets
├── server/                   # Server-side rendering
└── includes/                 # Shared utilities
```

**index.mjs:**
```javascript
export default async function (context) {
  const { hooks, knex, table } = context

  return {
    async init() {
      // Theme initialization
    },

    async render(req, res) {
      // Server-side rendering
      const posts = await knex(table('posts')).limit(10)
      res.send(`<html>...</html>`)
    }
  }
}
```

### Plugin Lifecycle

1. **Install** - Copy files, run migrations
2. **Activate** - Load index.mjs, call `init()`
3. **Deactivate** - Call `deactivate()`, disable
4. **Uninstall** - Rollback migrations, remove files

Adding "hd-theme" as keyword in package.json makes theme installable from themes dashboard

---

## Services

### AuthService

JWT-based authentication:

```javascript
import AuthService from '../../services/AuthService.mjs'

const authService = new AuthService(context)
const tokens = await authService.login(email, password)
// { access_token, refresh_token, user }
```

### SchedulerService

Laravel-style cron scheduler:

```javascript
// In plugin or provider
context.scheduler.schedule('0 * * * *', async () => {
  // Runs every hour
  await cleanupOldPosts()
})
```

### PluginLifecycleService / ThemeLifecycleService

Manage plugin/theme installation and activation:

```javascript
const pluginService = new PluginLifecycleService(context)
await pluginService.install('my-plugin')
await pluginService.activate('my-plugin')
```

---

## Admin Dashboard

Vue 3 SPA served from `/admin`:

### Key Components

- **Shell.vue** - Main layout with sidebar
- **Navigator.vue** - Dynamic sidebar menu from hooks
- **Posts.vue / Post.vue** - Post listing and editing
- **Users.vue / User.vue** - User management
- **Options.vue** - Site settings

### API Communication

```javascript
// src/utils/apiFetch.js
import { apiFetch } from '@/utils/apiFetch'

const posts = await apiFetch('/posts', { method: 'GET' })
// Automatically handles JWT tokens and refresh
```

### Dynamic Controls

Field controls are loaded dynamically from hooks:

```javascript
// In plugin
hooks.addControl({
  type: 'color-picker',
  component: ColorPickerComponent, // Vue component
  props: ['modelValue', 'field']
})
```

---

## API Structure

### Versioned Endpoints (`/api/v1/`)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `POST /auth/login` | User login |
| `POST /auth/register` | User registration |
| `GET /posts` | List posts |
| `POST /posts` | Create post |
| `GET /posts/:slug` | Get post |
| `PUT /posts/:slug` | Update post |
| `DELETE /posts/:slug` | Delete post |
| `GET /users` | List users |
| `GET /roles` | List roles |
| `GET /options` | Get options |
| `PUT /options` | Update options |

### Response Format

```javascript
// Success
{
  success: true,
  data: { ... }
}

// Error
{
  success: false,
  message: "Error description",
  error: "Detailed error"
}

// Paginated
{
  success: true,
  data: [...],
  pagination: {
    page: 1,
    per_page: 20,
    total: 100,
    total_pages: 5
  }
}
```

### OpenAPI Documentation

Interactive API docs available at `/api/v1/docs` (Swagger UI) and `/api/v1/redoc` (ReDoc).

---

## TypeScript Support

### Configuration

TypeScript is configured for gradual adoption:

```json
// tsconfig.json
{
  "compilerOptions": {
    "allowJs": true,          // Allow .js/.mjs files
    "checkJs": false,         // Don't check JS by default
    "strict": true,
    "noEmit": true            // Type checking only
  }
}
```

### Using Types

Types are available in the `HTMLDrop` namespace:

```typescript
// In .ts files or with @ts-check in .js files
declare const context: HTMLDrop.Context
declare const req: HTMLDrop.ExtendedRequest

// Access typed properties
const posts: HTMLDrop.Post[] = await context.knex(context.table('posts'))
```

### Adding Types to JS Files

Add `// @ts-check` at the top of JS files for type checking:

```javascript
// @ts-check

/** @type {HTMLDrop.Context} */
const context = req.context

// Now you get autocomplete and type checking
```

### Type Definition Files

| File | Description |
|------|-------------|
| `types/context.d.ts` | Context, Request, Guard types |
| `types/hooks.d.ts` | Hook/filter types |
| `types/posts.d.ts` | Post, PostType, Field types |
| `types/users.d.ts` | User, Role, Capability types |
| `types/plugins.d.ts` | Plugin types |
| `types/themes.d.ts` | Theme types |

---

## Performance

### Caching

- **FolderHashCache** - File change detection with watchers
- **SharedSSRCache** - Cross-process SSR cache via IPC
- **CacheService** - In-memory caching

### Clustering

- Primary process spawns workers (one per CPU)
- Zero-downtime reloads via graceful shutdown
- Supervisor handles process lifecycle

### Performance Tracing

```javascript
// Enable tracing
HD_TRACING_ENABLED=true

// Access traces
const traces = await knex(table('traces'))
  .where('request_id', requestId)
```

Trace categories: `CORE`, `WEB`, `THEME`, `RENDER`, `HOOK`, `HASH`, `DATABASE`

---

## Development

### Scripts

```bash
npm run dev          # Development with nodemon
npm run dev:ts       # Development with tsx (TypeScript)
npm run build        # Build TypeScript + admin
npm run build:ts     # Build TypeScript only
npm run typecheck    # Type check without emit
npm run lint         # Run ESLint
npm run test         # Run tests
npm run test:watch   # Watch mode
```

### Environment Variables

```bash
# Required
DB_CLIENT=better-sqlite3
DB_CONNECTION='{"filename":"./content/database.sqlite"}'

# Optional
PORT=3001
TABLE_PREFIX=hd_
JWT_SECRET=your-secret
JWT_EXPIRES_IN=1h
CORS_ORIGIN=*
NODE_ENV=development

# Tracing
HD_TRACING_ENABLED=true
HD_TRACING_VERBOSE=false
```

---

## For AI Assistants

When working with this codebase:

1. **Context is key** - Most operations need `req.context` for database and hooks
2. **Use table()** - Always use `table('posts')` instead of raw table names
3. **Check types** - Type definitions in `core/types/` document the API
4. **Follow patterns** - Controllers return `{ success, data }` format
5. **Hooks are powerful** - Use `addFilter`/`addAction` for extensibility
6. **Services for logic** - Business logic goes in services, not controllers
7. **Middleware order matters** - registryMiddleware initializes context

### Key Files to Understand

- `core/index.mjs` - Application bootstrap
- `core/registries/index.mjs` - Hook system implementation
- `core/middlewares/registryMiddleware.mjs` - Context initialization
- `core/types/context.d.ts` - Main type definitions
