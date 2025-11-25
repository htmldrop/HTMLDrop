# HTMLDrop CMS - Architecture Overview

Complete system architecture documentation for HTMLDrop CMS.

## Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Core Components](#core-components)
- [Database Schema](#database-schema)
- [Plugin System](#plugin-system)
- [Theme System](#theme-system)
- [Authentication & Authorization](#authentication--authorization)
- [Request Lifecycle](#request-lifecycle)
- [Clustering](#clustering)
- [Performance Considerations](#performance-considerations)

---

## System Overview

HTMLDrop CMS is a modern, Node.js-based content management system inspired by WordPress, designed to be fast, extensible, and developer-friendly.

### Key Features

- **WordPress-inspired Architecture** - Familiar concepts (posts, pages, taxonomies, plugins, themes)
- **Multi-database Support** - SQLite, MySQL, PostgreSQL
- **Extensible Plugin System** - NPM-based plugins with hooks and filters
- **Vue 3 SSR Themes** - Server-side rendering for SEO
- **Capability-based Permissions** - Fine-grained access control
- **Clustering Support** - Multi-core scalability out of the box
- **RESTful API** - Complete REST API for headless CMS usage
- **Real-time Features** - WebSocket support

### Architecture Pattern

HTMLDrop follows a **modular monolithic architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────┐
│              Load Balancer (Optional)                │
└───────────────────┬─────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────┐
│              Primary Process (Cluster)               │
│  - Worker management                                 │
│  - Inter-process communication                       │
└───┬────────────┬────────────┬────────────┬──────────┘
    │            │            │            │
┌───▼───┐    ┌──▼───┐    ┌──▼───┐    ┌──▼───┐
│Worker1│    │Worker2│   │Worker3│   │Worker4│
│(Core) │    │(Core)│    │(Core)│    │(Core)│
└───┬───┘    └──┬───┘    └──┬───┘    └──┬───┘
    │           │            │            │
    └───────────┴────────────┴────────────┘
                    │
    ┌───────────────▼────────────────┐
    │  Database (SQLite/MySQL/PG)    │
    │  - Posts, Users, Options       │
    │  - Meta tables, Taxonomies     │
    └────────────────────────────────┘
```

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | >=20.0.0 | JavaScript runtime |
| Express | 5.1.0 | Web framework |
| Knex.js | 3.1.0 | Query builder & migrations |
| better-sqlite3 | - | SQLite driver |
| mysql2 | - | MySQL driver |
| pg | - | PostgreSQL driver |
| jsonwebtoken | - | JWT authentication |
| bcrypt | - | Password hashing |
| ws | - | WebSocket server |

### Frontend (Admin Panel)

| Technology | Version | Purpose |
|------------|---------|---------|
| Vue 3 | 3.5.18 | Progressive framework |
| Vue Router | 4.5.1 | SPA routing |
| Vite | 7.1.7 | Build tool & dev server |
| DOMPurify | - | XSS protection |

### SSR & Themes

| Technology | Purpose |
|------------|---------|
| @vue/server-renderer | Vue SSR |
| @vue/compiler-sfc | Vue component compilation |
| @unhead/vue | Meta tags management |

### Utilities

| Technology | Purpose |
|------------|---------|
| multer | File uploads |
| adm-zip | ZIP file handling |
| cors | CORS middleware |
| esbuild | Fast bundling |

---

## Project Structure

```
htmldrop/
├── core/                    # Core application
│   ├── index.mjs               # Entry point with clustering
│   ├── admin/                  # Vue 3 admin panel (SPA)
│   │   ├── src/
│   │   │   ├── components/     # Vue components
│   │   │   ├── views/          # Page components
│   │   │   ├── router/         # Vue Router config
│   │   │   ├── stores/         # State management
│   │   │   └── utils/          # Frontend utilities
│   │   ├── index.html          # Admin HTML entry
│   │   └── vite.config.js      # Vite configuration
│   │
│   ├── routes/                 # Express route definitions
│   │   ├── admin.mjs           # Admin panel routes
│   │   ├── api.mjs             # API routes (v1)
│   │   ├── install.mjs         # Setup routes
│   │   └── web.mjs             # Public web routes (themes)
│   │
│   ├── controllers/            # Request handlers (business logic)
│   │   ├── v1/
│   │   │   ├── AuthController.mjs
│   │   │   ├── PostsController.mjs
│   │   │   ├── PostTypesController.mjs
│   │   │   ├── TaxonomiesController.mjs
│   │   │   ├── TermsController.mjs
│   │   │   ├── UsersController.mjs
│   │   │   ├── PluginsController.mjs
│   │   │   ├── ThemesController.mjs
│   │   │   └── OptionsController.mjs
│   │
│   ├── middlewares/            # Express middlewares
│   │   ├── Authenticate.mjs    # JWT authentication
│   │   ├── Guard.mjs           # Capability-based authorization
│   │   ├── Context.mjs         # Request context setup
│   │   ├── Registries.mjs      # Load plugins/themes/post-types
│   │   └── Cors.mjs            # CORS configuration
│   │
│   ├── registries/             # Dynamic registration systems
│   │   ├── PluginsRegistry.mjs # Plugin loader
│   │   ├── ThemesRegistry.mjs  # Theme loader
│   │   ├── PostTypesRegistry.mjs
│   │   ├── TaxonomiesRegistry.mjs
│   │   └── HooksRegistry.mjs   # Hooks & filters system
│   │
│   ├── utils/                  # Shared utilities
│   │   ├── UserGuard.mjs       # Permission checker
│   │   ├── FolderHash.mjs      # Cache-busting hashes
│   │   ├── PostMeta.mjs        # Post meta helpers
│   │   ├── TermMeta.mjs        # Term meta helpers
│   │   └── Translate.mjs       # i18n utilities
│   │
│   ├── database/               # Database management
│   │   ├── migrations/         # Knex migrations
│   │   └── seeds/              # Seed data
│   │
│   ├── providers/              # Core functionality providers
│   │   ├── dashboard-provider/ # Dashboard setup
│   │   │   ├── index.mjs
│   │   │   ├── post-types.mjs  # Register core post types
│   │   │   ├── taxonomies.mjs  # Register core taxonomies
│   │   │   └── ui-menu/        # Admin menu structure
│   │
│   └── translations/           # i18n translation files
│       ├── en.json
│       └── nb.json
│
├── content/                 # User content (WordPress-like)
│   ├── plugins/                # Installed plugins
│   │   ├── example-plugin/
│   │   │   ├── index.mjs       # Plugin entry point
│   │   │   └── package.json    # Plugin metadata
│   │
│   ├── themes/                 # Installed themes
│   │   ├── default-theme/
│   │   │   ├── index.mjs       # Theme entry point
│   │   │   ├── components/     # Vue components
│   │   │   └── public/         # Static assets
│   │
│   ├── config/                 # Configuration files
│   │   └── database.sqlite     # SQLite database (default)
│   │
│   └── uploads/                # Media uploads
│       └── YYYY/MM/            # Year/month structure
│
│   ├── docs/                  # Documentation
│   │   ├── api/               # API reference
│   │   ├── architecture/      # System architecture
│   │   ├── themes/            # Theme development
│   │   ├── hooks/             # Hooks & filters
│   │   └── deployment/        # Deployment guides
│   │
│   ├── types/                 # TypeScript definitions
│   │   ├── index.d.ts         # Main type definitions
│   │   └── context.mjs        # Type helper functions
│   │
│   ├── tests/                 # Test files
│   │   └── setup.mjs          # Test setup
│   │
│   └── coverage/              # Test coverage reports
│
├── .env                        # Environment variables
├── package.json                # Project dependencies
└── jsconfig.json               # VS Code configuration
```

---

## Core Components

### 1. Clustering System

**File:** [core/index.mjs](../../core/index.mjs)

HTMLDrop uses Node.js cluster module for multi-core utilization:

```javascript
if (cluster.isPrimary) {
  // Primary process - spawn workers
  const numWorkers = os.cpus().length
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork()
  }

  // Broadcast messages to all workers
  process.on('message', (msg) => {
    Object.values(cluster.workers).forEach(worker => {
      worker.send(msg)
    })
  })
} else {
  // Worker process - run Express app
  startServer()
}
```

**Benefits:**
- Utilizes all CPU cores
- Better performance under load
- Zero-downtime reloads (via graceful restart)

**Communication:**
- Workers receive broadcasts from primary process
- Used for option updates, plugin activation, etc.

---

### 2. Context System

**File:** [core/middlewares/Context.mjs](../../core/middlewares/Context.mjs)

Creates a global context object on every request:

```javascript
req.context = {
  app,           // Express app instance
  knex,          // Database instance
  options,       // Autoloaded options
  table(name),   // Prefixed table names
  formatDate(),  // Date formatter
  normalizeSlug(), // Slug normalizer
  translate(),   // i18n function
  parseVue(),    // Vue component parser
  // ... more utilities
}
```

**Purpose:**
- Provide common utilities to all plugins/themes
- Access database, options, translations
- Consistent API across the system

---

### 3. Registry System

Dynamic registration for plugins, themes, post types, and taxonomies.

#### Post Types Registry

**File:** [core/registries/PostTypesRegistry.mjs](../../core/registries/PostTypesRegistry.mjs)

**Flow:**
1. Load post types from database
2. Apply filters via hooks system
3. Allow plugins to register additional post types
4. Store in `req.context.postTypes`

**Priority System:**
- Lower priority = earlier execution
- Database registrations: stored priority
- Runtime registrations: default priority 10

#### Plugins Registry

**File:** [core/registries/PluginsRegistry.mjs](../../core/registries/PluginsRegistry.mjs)

**Flow:**
1. Read `active_plugins` from options
2. For each plugin:
   - Generate folder hash for cache-busting
   - Dynamic import: `await import(plugin-path?hash=...)`
   - Call exported default function with context
   - Execute `init()` method
3. Plugin registers hooks, filters, menu pages

**Cache-busting:**
- Hash entire plugin folder recursively
- Append hash to import URL
- Forces re-import when code changes

---

### 4. Hooks & Filters System

**File:** [core/registries/HooksRegistry.mjs](../../core/registries/HooksRegistry.mjs)

WordPress-inspired event system:

**Actions** (side effects):
```javascript
// Register action
req.hooks.addAction('save_post', async (post) => {
  console.log('Post saved:', post.id)
}, 10)

// Trigger action
await req.hooks.doAction('save_post', post)
```

**Filters** (value transformation):
```javascript
// Register filter
req.hooks.addFilter('the_content', (content) => {
  return content.replace(/foo/g, 'bar')
}, 10)

// Apply filters
const content = req.hooks.applyFilters('the_content', post.content)
```

**Core Hooks:**
- `init` - System initialization
- `save_post` - After post save
- `create_post` - After post creation
- `delete_post` - After post deletion
- `pre_upload` - Before file upload
- `after_upload` - After file upload

**Core Filters:**
- `the_content` - Post content
- `the_title` - Post title
- `the_excerpt` - Post excerpt

---

### 5. Authentication System

**JWT-based Authentication:**

**Files:**
- [core/controllers/v1/AuthController.mjs](../../core/controllers/v1/AuthController.mjs)
- [core/middlewares/Authenticate.mjs](../../core/middlewares/Authenticate.mjs)

**Token Types:**

1. **Access Token**
   - Short-lived (1 hour default)
   - Used for API authentication
   - Included in `Authorization: Bearer <token>` header

2. **Refresh Token**
   - Long-lived (7 days default)
   - Used to get new access tokens
   - Stored securely (HTTP-only cookies recommended)

**Flow:**
```
1. User logs in → Receive access + refresh tokens
2. Use access token for API calls
3. Access token expires → Use refresh token to get new one
4. Refresh token expires → Re-authenticate
```

**Token Revocation:**
- Revoked tokens stored in `revoked_tokens` table (hashed)
- Checked on every authentication
- Cleanup task removes expired revoked tokens

---

### 6. Authorization System (Capabilities)

**File:** [core/utils/UserGuard.mjs](../../core/utils/UserGuard.mjs)

**Capability-based Permissions:**

**Tables:**
- `capabilities` - All available permissions
- `roles` - User roles (admin, editor, author, etc.)
- `role_capabilities` - Role → Capability mapping
- `user_roles` - User → Role assignment
- `user_capabilities` - Direct user → Capability assignment
- `capability_inheritance` - Hierarchical permissions

**Inheritance System:**

Capabilities can inherit from other capabilities using BFS (breadth-first search):

```
manage_options
    ↓
manage_posts
    ↓
edit_posts → edit_others_posts
    ↓
create_posts
```

If user has `manage_options`, they automatically have all child capabilities.

**UserGuard Class:**

```javascript
const guard = new UserGuard({ knex, table })

// Check if user has capability
const result = await guard.user({
  userId: 1,
  canOneOf: ['edit_posts', 'edit_pages'],
  canAllOf: ['read_posts'],
  postId: 5,     // Check post-level permissions
  termId: 10     // Check term-level permissions
})

if (result) {
  // User has permission
  // result = ['edit_posts'] (matched capabilities)
}
```

**Permission Levels:**

1. **Role-based** - Via role assignment
2. **Direct** - Via `user_capabilities` table
3. **Inherited** - Via `capability_inheritance` tree
4. **Post-level** - Via `post_permissions` table
5. **Term-level** - Via `term_permissions` table

---

### 7. Meta System (EAV Pattern)

**Files:**
- [core/utils/PostMeta.mjs](../../core/utils/PostMeta.mjs)
- [core/utils/TermMeta.mjs](../../core/utils/TermMeta.mjs)

**Entity-Attribute-Value (EAV) Pattern** for flexible schemas:

**Tables:**
- `post_meta` - Custom fields for posts
- `term_meta` - Custom fields for terms

**Structure:**
```sql
post_meta (
  id,
  post_id,      -- Foreign key to posts
  meta_key,     -- Field name
  meta_value    -- JSON value
)
```

**Usage:**

```javascript
// Save meta
await withMeta(knex, table, postId, {
  custom_field: 'value',
  another_field: 123
})

// Load meta for single post
const post = await withMetaSingle(knex, table, postId, postData)
// post.meta = { custom_field: 'value', ... }

// Load meta for multiple posts (batch query)
const posts = await withMetaMany(knex, table, postsArray)
```

**Benefits:**
- Dynamic fields without schema changes
- Easy plugin extensibility
- Efficient bulk loading

---

### 8. Task Scheduler (Laravel-style)

**File:** [core/services/SchedulerService.mjs](../../services/SchedulerService.mjs)

**Laravel-inspired task scheduler** for running scheduled jobs:

**Features:**
- Fluent API for scheduling (`.everyMinute()`, `.daily()`, `.weekly()`, etc.)
- Database locking for single-worker execution
- Automatic lifecycle management for plugins/themes
- Cross-worker synchronization
- Immutable ownership tracking

**Usage:**

```javascript
// In a plugin or theme
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context

  return {
    async init() {
      // Schedule a task
      scheduler
        .call(async () => {
          console.log('Running scheduled task')
        }, 'my_plugin_task')
        .everyFiveMinutes()

      // Daily task at specific time
      scheduler
        .call(async () => {
          // Cleanup logic
        }, 'my_plugin_cleanup')
        .dailyAt('02:00')
    }
  }
}
```

**Scheduling Methods:**
- `.everyMinute()`, `.everyTwoMinutes()`, `.everyFiveMinutes()`
- `.everyTenMinutes()`, `.everyFifteenMinutes()`, `.everyThirtyMinutes()`
- `.hourly()`, `.hourlyAt(minute)`
- `.daily()`, `.dailyAt('HH:MM')`
- `.weekly()`, `.monthly()`
- `.cron('* * * * *')` - Custom cron expression

**Lifecycle Management:**
- Tasks are automatically assigned an **immutable owner** (plugin/theme slug)
- When a plugin/theme is deactivated, all its tasks are automatically stopped and removed
- No manual cleanup needed in `onDeactivate()` or `onUninstall()` hooks

**Worker Execution:**
- Tasks are registered on **all workers** (for metadata sync)
- Tasks are **executed only on worker 1** (prevents duplication)
- Database locking prevents overlapping executions

**Storage:**
- Task metadata stored in `options` table (key: `scheduler_task_{name}`)
- Lock state stored in `options` table (key: `scheduler_lock_{name}`)

See the [Scheduler Documentation](../development/SCHEDULER.md) for complete guide.

---

## Database Schema

### Core Tables

#### Users & Authentication

```sql
users (
  id SERIAL PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password VARCHAR NOT NULL,
  display_name VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

usermeta (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  meta_key VARCHAR,
  meta_value TEXT
)

refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token VARCHAR,
  expires_at TIMESTAMP
)

revoked_tokens (
  id SERIAL PRIMARY KEY,
  token_hash VARCHAR UNIQUE,
  revoked_at TIMESTAMP,
  expires_at TIMESTAMP
)
```

#### Authorization

```sql
roles (
  id SERIAL PRIMARY KEY,
  slug VARCHAR UNIQUE,
  name VARCHAR,
  description TEXT
)

capabilities (
  id SERIAL PRIMARY KEY,
  slug VARCHAR UNIQUE,
  name VARCHAR,
  description TEXT
)

role_capabilities (
  role_id INTEGER REFERENCES roles(id),
  capability_id INTEGER REFERENCES capabilities(id),
  PRIMARY KEY (role_id, capability_id)
)

user_roles (
  user_id INTEGER REFERENCES users(id),
  role_id INTEGER REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
)

user_capabilities (
  user_id INTEGER REFERENCES users(id),
  capability_id INTEGER REFERENCES capabilities(id),
  PRIMARY KEY (user_id, capability_id)
)

capability_inheritance (
  parent_capability_id INTEGER REFERENCES capabilities(id),
  child_capability_id INTEGER REFERENCES capabilities(id),
  PRIMARY KEY (parent_capability_id, child_capability_id)
)
```

#### Content

```sql
posts (
  id SERIAL PRIMARY KEY,
  post_type VARCHAR NOT NULL,
  slug VARCHAR UNIQUE,
  title TEXT,
  content TEXT,
  excerpt TEXT,
  status VARCHAR DEFAULT 'draft',
  parent_id INTEGER REFERENCES posts(id),
  menu_order INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP NULL
)

post_meta (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  meta_key VARCHAR,
  meta_value TEXT  -- JSON
)

post_types (
  id SERIAL PRIMARY KEY,
  slug VARCHAR UNIQUE,
  name_singular VARCHAR,
  name_plural VARCHAR,
  description TEXT,
  icon TEXT,
  show_in_menu BOOLEAN,
  capabilities TEXT,  -- JSON
  created_at TIMESTAMP
)

post_type_fields (
  id SERIAL PRIMARY KEY,
  post_type_slug VARCHAR REFERENCES post_types(slug),
  slug VARCHAR,
  label VARCHAR,
  type VARCHAR,
  description TEXT,
  default_value TEXT,
  required BOOLEAN,
  options TEXT,  -- JSON
  priority INTEGER,
  UNIQUE(post_type_slug, slug)
)

post_authors (
  post_id INTEGER REFERENCES posts(id),
  user_id INTEGER REFERENCES users(id),
  PRIMARY KEY (post_id, user_id)
)

post_permissions (
  post_id INTEGER REFERENCES posts(id),
  user_id INTEGER REFERENCES users(id),
  capability_id INTEGER REFERENCES capabilities(id),
  PRIMARY KEY (post_id, user_id, capability_id)
)

post_revisions (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  title TEXT,
  content TEXT,
  created_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
)
```

#### Taxonomies

```sql
taxonomies (
  id SERIAL PRIMARY KEY,
  post_type_slug VARCHAR REFERENCES post_types(slug),
  slug VARCHAR,
  name_singular VARCHAR,
  name_plural VARCHAR,
  description TEXT,
  hierarchical BOOLEAN,
  show_in_menu BOOLEAN,
  UNIQUE(post_type_slug, slug)
)

taxonomy_fields (
  id SERIAL PRIMARY KEY,
  taxonomy_slug VARCHAR,
  slug VARCHAR,
  label VARCHAR,
  type VARCHAR,
  description TEXT,
  default_value TEXT,
  required BOOLEAN,
  options TEXT,  -- JSON
  priority INTEGER
)

terms (
  id SERIAL PRIMARY KEY,
  taxonomy_slug VARCHAR,
  slug VARCHAR,
  name VARCHAR,
  description TEXT,
  parent_id INTEGER REFERENCES terms(id),
  created_at TIMESTAMP,
  UNIQUE(taxonomy_slug, slug)
)

term_meta (
  id SERIAL PRIMARY KEY,
  term_id INTEGER REFERENCES terms(id),
  meta_key VARCHAR,
  meta_value TEXT  -- JSON
)

term_relationships (
  post_id INTEGER REFERENCES posts(id),
  term_id INTEGER REFERENCES terms(id),
  PRIMARY KEY (post_id, term_id)
)

term_authors (
  term_id INTEGER REFERENCES terms(id),
  user_id INTEGER REFERENCES users(id),
  PRIMARY KEY (term_id, user_id)
)

term_permissions (
  term_id INTEGER REFERENCES terms(id),
  user_id INTEGER REFERENCES users(id),
  capability_id INTEGER REFERENCES capabilities(id),
  PRIMARY KEY (term_id, user_id, capability_id)
)

term_revisions (
  id SERIAL PRIMARY KEY,
  term_id INTEGER REFERENCES terms(id),
  name VARCHAR,
  description TEXT,
  created_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
)
```

#### OAuth

```sql
auth_providers (
  id SERIAL PRIMARY KEY,
  name VARCHAR UNIQUE,
  client_id VARCHAR,
  client_secret VARCHAR,
  authorize_url VARCHAR,
  token_url VARCHAR,
  user_info_url VARCHAR
)

user_providers (
  user_id INTEGER REFERENCES users(id),
  provider_id INTEGER REFERENCES auth_providers(id),
  provider_user_id VARCHAR,
  PRIMARY KEY (user_id, provider_id)
)
```

#### System

```sql
options (
  id SERIAL PRIMARY KEY,
  option_name VARCHAR UNIQUE,
  option_value TEXT,  -- JSON
  autoload BOOLEAN DEFAULT true
)
```

### Indexes

Key indexes for performance:

```sql
CREATE INDEX idx_posts_type ON posts(post_type);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_parent ON posts(parent_id);
CREATE INDEX idx_post_meta_post ON post_meta(post_id);
CREATE INDEX idx_post_meta_key ON post_meta(meta_key);
CREATE INDEX idx_term_relationships_post ON term_relationships(post_id);
CREATE INDEX idx_term_relationships_term ON term_relationships(term_id);
CREATE INDEX idx_terms_taxonomy ON terms(taxonomy_slug);
CREATE INDEX idx_terms_parent ON terms(parent_id);
```

---

## Plugin System

### Plugin Structure

```
my-plugin/
├── index.mjs          # Entry point (required)
├── package.json       # Metadata
├── components/        # Vue components (optional)
├── public/            # Static assets (optional)
└── README.md          # Documentation
```

### Entry Point

**index.mjs:**

```javascript
export default async ({ req, res, next, router }) => {
  return {
    async init() {
      const { addAction, addFilter, addMenuPage, registerPostType } = req.hooks

      // Register hooks
      addAction('init', async () => {
        console.log('Plugin initialized')
      })

      // Register filters
      addFilter('the_content', (content) => {
        return content + ' [Modified by plugin]'
      })

      // Add admin menu page
      addMenuPage({
        slug: 'my-plugin',
        title: 'My Plugin',
        component: './components/AdminPage.vue'
      })

      // Register custom post type
      await registerPostType({
        slug: 'products',
        name_singular: 'Product',
        name_plural: 'Products'
      })

      // Add custom routes
      router.get('/my-plugin/api', (req, res) => {
        res.json({ message: 'Hello from plugin' })
      })
    }
  }
}
```

### Package.json

```json
{
  "name": "@htmldrop/my-plugin",
  "version": "1.0.0",
  "description": "My awesome plugin",
  "main": "index.mjs",
  "type": "module",
  "keywords": ["hd-plugin"],
  "author": "Your Name",
  "htmldrop": {
    "version": "1.0.0",
    "requires": ">=1.0.0",
    "dependencies": ["other-plugin"]
  }
}
```

### Plugin Lifecycle

```
1. ZIP upload or NPM install
     ↓
2. Extract to /content/plugins/{slug}/
     ↓
3. Validate structure (check index.mjs exists)
     ↓
4. Add to database (plugins list)
     ↓
5. User activates plugin
     ↓
6. Add slug to active_plugins option
     ↓
7. Broadcast to all workers
     ↓
8. Workers reload options
     ↓
9. Next request: Plugin loaded and init() called
```

---

## Theme System

### Theme Structure

```
my-theme/
├── index.mjs          # Entry point (required)
├── package.json       # Metadata
├── components/        # Vue components
│   ├── Header.vue
│   ├── Footer.vue
│   └── PostCard.vue
├── layouts/           # Page layouts
│   ├── Default.vue
│   └── Sidebar.vue
├── public/            # Static assets
│   ├── css/
│   └── js/
└── README.md
```

### Entry Point

**index.mjs:**

```javascript
import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import { renderSSRHead } from '@unhead/ssr'
import { createHead } from '@unhead/vue'

export default async ({ req, res, next, router }) => {
  return {
    async init() {
      // Initialize theme (hooks, actions, etc.)
      const { addAction } = req.hooks

      addAction('init', async () => {
        console.log('Theme loaded')
      })
    },

    async render() {
      // SSR rendering
      const app = createSSRApp(/* Your Vue app */)
      const head = createHead()
      app.use(head)

      const html = await renderToString(app)
      const { headTags, bodyTags } = await renderSSRHead(head)

      return `
        <!DOCTYPE html>
        <html>
          <head>
            ${headTags}
          </head>
          <body>
            <div id="app">${html}</div>
            ${bodyTags}
          </body>
        </html>
      `
    }
  }
}
```

### Theme Activation

```
1. Upload theme or NPM install
     ↓
2. Extract to /content/themes/{slug}/
     ↓
3. User activates theme
     ↓
4. Update 'theme' option in database
     ↓
5. Broadcast to all workers
     ↓
6. Workers reload options
     ↓
7. Next web request: Theme render() called
```

---

## Authentication & Authorization

### JWT Flow

```
┌──────┐                    ┌──────────┐
│Client│                    │  Server  │
└──┬───┘                    └────┬─────┘
   │                             │
   │  POST /auth/login           │
   │  { email, password }        │
   ├────────────────────────────>│
   │                             │
   │    Verify credentials       │
   │    Generate tokens          │
   │                             │
   │  { access_token,            │
   │    refresh_token }          │
   │<────────────────────────────┤
   │                             │
   │  GET /api/v1/posts          │
   │  Authorization: Bearer <at> │
   ├────────────────────────────>│
   │                             │
   │    Verify access token      │
   │    Load user & permissions  │
   │                             │
   │  { posts: [...] }           │
   │<────────────────────────────┤
   │                             │
   │  (Access token expires)     │
   │                             │
   │  POST /auth/refresh         │
   │  { refresh_token }          │
   ├────────────────────────────>│
   │                             │
   │    Verify refresh token     │
   │    Generate new access token│
   │                             │
   │  { access_token }           │
   │<────────────────────────────┤
   │                             │
```

### Capability Resolution

```
1. Load user's direct capabilities
     ↓
2. Load user's roles
     ↓
3. Load role capabilities
     ↓
4. Resolve inheritance tree (BFS)
     ↓
5. Merge all capabilities
     ↓
6. Check post/term-level permissions (if applicable)
     ↓
7. Return matched capabilities or null
```

**Example Inheritance:**

```
User has role "Editor"
   ↓
Editor role has "edit_posts"
   ↓
"edit_posts" inherits from "create_posts"
   ↓
User effectively has: ["edit_posts", "create_posts"]
```

---

## Request Lifecycle

### Admin Request

```
1. Request: GET /admin
     ↓
2. Serve static index.html
     ↓
3. Vue SPA loads
     ↓
4. Vue Router matches route
     ↓
5. Component makes API call
     ↓
6. API middleware chain executes
     ↓
7. Controller handles request
     ↓
8. Response sent to client
```

### API Request

```
1. Request: GET /api/v1/posts
     ↓
2. CORS middleware
     ↓
3. Context middleware (setup req.context)
     ↓
4. Authenticate middleware (verify JWT)
     ↓
5. Registries middleware (load plugins/themes/post-types)
     ↓
6. Route handler (PostsController)
     ↓
7. Guard middleware (check permissions)
     ↓
8. Database query
     ↓
9. Load meta, authors, taxonomies
     ↓
10. Apply filters
     ↓
11. Return JSON response
```

### Web Request (Theme)

```
1. Request: GET /
     ↓
2. Context middleware
     ↓
3. Registries middleware
     ↓
4. Load active theme
     ↓
5. Call theme.render()
     ↓
6. SSR Vue components
     ↓
7. Return HTML
```

---

## Clustering

### Worker Management

```javascript
// Primary process
if (cluster.isPrimary) {
  const numWorkers = os.cpus().length

  // Spawn workers
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork()
  }

  // Handle worker crashes
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.id} died`)
    cluster.fork() // Restart
  })

  // Broadcast to workers
  function broadcast(message) {
    Object.values(cluster.workers).forEach(worker => {
      worker.send(message)
    })
  }
}
```

### Inter-process Communication

**Use Cases:**
1. **Options update** - Broadcast to all workers to reload
2. **Plugin activation** - Notify workers to reload plugins
3. **Theme change** - Notify workers to reload theme

**Example:**

```javascript
// Worker activates plugin
process.send({ type: 'options_updated' })

// Primary receives and broadcasts
process.on('message', (msg) => {
  if (msg.type === 'options_updated') {
    broadcast({ type: 'reload_options' })
  }
})

// Workers reload
process.on('message', async (msg) => {
  if (msg.type === 'reload_options') {
    req.context.options = await loadOptions()
  }
})
```

---

## Performance Considerations

### Current Optimizations

1. **Clustering** - Multi-core utilization
2. **Autoload options** - Frequently accessed options cached
3. **Meta batch loading** - Single query for multiple posts
4. **Cache-busting hashes** - Dynamic imports with hash
5. **Connection pooling** - Knex connection pool

### Known Performance Issues

1. **Registry initialization on every request**
   - Solution: Cache registry, reload only on changes

2. **N+1 query problem in meta loading**
   - Solution: Batch queries with `withMetaMany()`

3. **No caching layer**
   - Solution: Add Redis for options, post types, taxonomies

4. **Folder hashing overhead**
   - Solution: Use file system watchers, cache hashes

5. **No response compression**
   - Solution: Add compression middleware

### Recommended Improvements

1. **Add Redis caching**
2. **Implement query result caching**
3. **Add CDN for static assets**
4. **Use database read replicas**
5. **Implement lazy loading for plugins**
6. **Add request/response compression**
7. **Optimize database indexes**
8. **Use prepared statements**

---

## Security Considerations

### Current Security Features

1. **JWT authentication** - Secure token-based auth
2. **Password hashing** - bcrypt with salt
3. **Token revocation** - Blacklist for compromised tokens
4. **Capability-based authorization** - Fine-grained permissions
5. **Path traversal protection** - Sanitize file paths
6. **ZIP slip protection** - Validate ZIP contents
7. **Command injection prevention** - Spawn without shell
8. **XSS protection** - DOMPurify for SVGs

### Security Improvements Needed

1. **Rate limiting** - Prevent brute force
2. **CSRF protection** - Token-based CSRF
3. **Request size limits** - Prevent DOS
4. **Security headers** - Helmet.js
5. **Input validation** - Schema validation
6. **SQL injection review** - Audit all queries
7. **File upload validation** - MIME type checking
8. **Session management** - Secure cookie settings

---

## Scaling Strategies

### Horizontal Scaling

```
┌─────────────┐
│Load Balancer│
└──────┬──────┘
       │
   ┌───┴────┬─────────┬─────────┐
   │        │         │         │
┌──▼──┐  ┌─▼───┐  ┌─▼───┐  ┌──▼──┐
│App 1│  │App 2│  │App 3│  │App N│
└──┬──┘  └─┬───┘  └─┬───┘  └──┬──┘
   │       │        │         │
   └───────┴────┬───┴─────────┘
                │
        ┌───────▼────────┐
        │  Shared DB     │
        │  + Redis Cache │
        └────────────────┘
```

**Requirements:**
1. Shared database (MySQL/PostgreSQL)
2. Shared file storage (NFS, S3)
3. Redis for session/cache
4. Sticky sessions or stateless auth

### Vertical Scaling

- Increase CPU cores → More workers
- Increase RAM → Larger connection pool
- Faster disks → Better database performance

---

## Next Steps

See additional documentation:
- [API Reference](../api/README.md)
- [Theme Development](../themes/README.md) (if available)
- [Hooks & Filters](../hooks/README.md) (if available)
- [Deployment Guide](../deployment/README.md)
