# HTMLDrop CMS

<p align="center">
  <img src="core/admin/src/assets/logo.png" alt="HTMLDrop Logo" width="200"/>
</p>

<p align="center">
  <strong>The Modern WordPress Alternative for Node.js</strong>
</p>

<p align="center">
  A powerful, extensible, and developer-friendly CMS built with Node.js, Vue 3, and modern JavaScript.
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="core/docs/api/README.md">API Docs</a> •
  <a href="core/docs/architecture/README.md">Architecture</a> •
  <a href="#-community">Community</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--2.0-blue.svg" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node Version"></a>
  <a href="core/docs/CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

---

## 🎯 What is HTMLDrop?

HTMLDrop is a **modern, open-source CMS** designed to bring the flexibility and extensibility of WordPress to the Node.js ecosystem. Built with cutting-edge technologies, it offers:

- 🚀 **Lightning Fast** - Node.js clustering and SSR for optimal performance
- 🔌 **Truly Extensible** - WordPress-style plugins and themes with hooks/filters
- 🎨 **Modern Stack** - Vue 3, Express 5, Knex.js, and ES Modules
- 🗄️ **Database Flexible** - Support for PostgreSQL, MySQL, and SQLite
- 🛡️ **Enterprise Ready** - JWT auth, capability-based permissions, and clustering
- 🎯 **Developer Friendly** - Clean APIs, comprehensive docs, and TypeScript support

---

## ✨ Features

### Core Features

- **🖥️ Modern Admin Panel** - Beautiful Vue 3 SPA with intuitive UI
- **📝 Content Management** - Posts, pages, custom post types, and taxonomies
- **🔐 Robust Authentication** - JWT-based auth with refresh tokens and OAuth support
- **👥 User Management** - Role-based access control with capability inheritance
- **📁 Media Library** - File uploads with automatic organization
- **🎨 Theme System** - Vue 3 SSR themes with hot-reloading
- **🔌 Plugin System** - NPM-based plugins with lifecycle hooks
- **🌐 Multi-language** - Built-in i18n support
- **📡 RESTful API** - Complete REST API for headless CMS usage
- **🔍 Advanced Search** - Full-text search with filters and meta queries

### Developer Features

- **⚡ Server-Side Rendering** - Vue SSR for SEO and performance
- **🔄 Hooks & Filters** - WordPress-inspired extensibility system
- **📦 NPM Integration** - Install plugins/themes from NPM
- **🗄️ Multi-Database** - PostgreSQL, MySQL, SQLite support
- **🖥️ Clustering** - Multi-core utilization with worker processes
- **🔒 Security** - bcrypt, JWT, XSS protection, CORS, rate limiting
- **📊 Meta Fields** - Flexible EAV pattern for custom fields
- **🔗 Relationships** - Post relationships and taxonomies
- **📜 Revisions** - Content history and rollback
- **🌐 WebSockets** - Real-time features support
- **⏰ Task Scheduler** - Laravel-style cron job scheduling for plugins/themes

### Performance & Scalability

- **⚡ Clustering** - Automatic multi-core utilization
- **🚀 Caching** - Built-in caching with Redis support
- **📦 Code Splitting** - Optimized frontend bundles
- **🔄 Load Balancing** - Ready for horizontal scaling
- **💾 Connection Pooling** - Efficient database connections

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **npm**, **pnpm** or **yarn**
- **git** (required for CMS updates and version management)
- **Database** (PostgreSQL, MySQL, or SQLite)

### Installation

```bash
# Clone the repository
git clone https://github.com/htmldrop/htmldrop.git
cd htmldrop-cms

# Install dependencies
npm install

# Setup environment (optional - defaults work for development)
cp .env.example .env
# Edit .env with your configuration if needed

# Start development server
npm run dev
```

The setup wizard will guide you through database configuration and admin user creation at `http://localhost:3000`

**Note:** You can start without a `.env` file - the system uses sensible defaults:
- CORS allows all origins (configure `CORS_ORIGIN` in production)
- SQLite database (configure `DB_CLIENT` and `DB_CONNECTION` for PostgreSQL/MySQL)
- In-memory cache (configure `REDIS_URL` for Redis caching)

### Production Deployment

```bash
# Install dependencies
npm i
# Start
npm start
```

See the [Deployment Guide](core/docs/deployment/README.md) for detailed production setup.

### Quick Deploy

Deploy HTMLDrop to your favorite hosting platform with one click:

<p align="center">
  <a href="https://railway.app/new/template?template=https://github.com/htmldrop/htmldrop">
    <img src="https://railway.app/button.svg" alt="Deploy on Railway" height="32">
  </a>
  <a href="https://render.com/deploy?repo=https://github.com/htmldrop/htmldrop">
    <img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="32">
  </a>
  
</p>

<p align="center">
  <a href="https://heroku.com/deploy?template=https://github.com/htmldrop/htmldrop">
    <img src="https://www.herokucdn.com/deploy/button.svg" alt="Deploy to Heroku" height="32">
  </a>
  <a href="https://fly.io/launch?repo=https://github.com/htmldrop/htmldrop">
    <img src="https://fly.io/static/images/brand/brandmark.svg" alt="Deploy on Fly.io" height="32">
  </a>
</p>

**Note:** HTMLDrop requires:
- A persistent Node.js server (>= 20.0.0)
- Git CLI installed (for CMS updates)
- A database (PostgreSQL, MySQL, or SQLite)

Railway, Render, Heroku, and Fly.io are recommended platforms for full-stack deployment. Most platforms include git by default in their build environments.

### Docker Deploy

Run HTMLDrop locally with Docker Compose:

<p align="center">
  <a href="#docker-deployment">
    <img src="https://img.shields.io/badge/Docker-Deploy-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Deploy with Docker" height="32">
  </a>
</p>

```bash
# Clone the repository
git clone https://github.com/htmldrop/htmldrop.git
cd htmldrop

# Start with Docker Compose
docker-compose up -d
```

This will start HTMLDrop with MySQL and Redis. Access at `http://localhost`

The Docker image includes git CLI for CMS updates and version management.

---

## 📖 Documentation

### Getting Started

- [Installation Guide](core/docs/deployment/README.md#installation)
- [Configuration](core/docs/deployment/README.md#environment-configuration)
- [Quick Start Tutorial](#) (coming soon)

### Core Concepts

- [Architecture Overview](core/docs/architecture/README.md)
- [Database Schema](core/docs/architecture/README.md#database-schema)
- [Request Lifecycle](core/docs/architecture/README.md#request-lifecycle)
- [Plugin System](core/docs/architecture/README.md#plugin-system)
- [Theme System](core/docs/architecture/README.md#theme-system)

### Development

- [API Reference](core/docs/api/README.md)
- [Theme Development](core/docs/themes/README.md)
- [Plugin Development](content/plugins/README.md)
- [Hooks & Filters](core/docs/hooks/README.md)
- [Contributing Guide](core/docs/CONTRIBUTING.md)

### Deployment

- [Production Setup](core/docs/deployment/README.md)
- [SSL Configuration](core/docs/deployment/README.md#sslhttps-configuration)
- [Performance Optimization](core/docs/deployment/README.md#performance-optimization)
- [Security Hardening](core/docs/deployment/README.md#security-hardening)

---

## 🎨 Creating Themes

Themes support any frontend framework or vanilla JavaScript. Here's an example using Vue 3 with SSR:

```javascript
// content/themes/my-theme/index.mjs
import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import App from './App.vue'

export default async ({ req, res, next, router }) => {
  return {
    async init() {
      // Theme initialization
    },

    async render() {
      const app = createSSRApp(App, {
        posts: await fetchPosts(),
        url: req.url
      })

      const html = await renderToString(app)
      return `<!DOCTYPE html>
        <html>
          <head><title>My Site</title></head>
          <body><div id="app">${html}</div></body>
        </html>`
    }
  }
}
```

See the [Theme Development Guide](core/docs/themes/README.md) for more details.

---

## 🔌 Creating Plugins

Plugins extend functionality using hooks and filters:

```javascript
// content/plugins/my-plugin/index.mjs
export default async ({ req, res, next, router }) => {
  return {
    async init() {
      const { addAction, addFilter, registerPostType } = req.hooks

      // Register custom post type
      await registerPostType({
        slug: 'products',
        name_singular: 'Product',
        name_plural: 'Products'
      })

      // Add action hook
      addAction('save_post', async (post) => {
        console.log('Post saved:', post.id)
      })

      // Add filter hook
      addFilter('the_content', (content) => {
        return content + '\n\n[Modified by plugin]'
      })

      // Add custom route
      router.get('/my-plugin/api', (req, res) => {
        res.json({ message: 'Hello from plugin!' })
      })

      // Schedule a background task
      const { scheduler } = req.context
      scheduler
        .call(async () => {
          console.log('Running scheduled cleanup')
        }, 'my_plugin_cleanup')
        .daily()
    }
  }
}
```

See the [Plugin Development Guide](content/plugins/README.md) for more details.

---

## 🔥 Why HTMLDrop?

### vs WordPress

| Feature | HTMLDrop | WordPress |
|---------|----------|-----------|
| Language | Node.js (JavaScript) | PHP |
| Modern Stack | ✅ Vue 3, ES Modules | ❌ jQuery, legacy code |
| API | ✅ RESTful, headless-ready | Partial REST API |
| Async/Await | ✅ Native | ❌ Limited |
| Package Manager | NPM | Composer |
| Real-time | ✅ WebSockets | ❌ Limited |
| Clustering | ✅ Built-in | ❌ Requires external tools |
| Type Safety | TypeScript support | Limited |

### vs Strapi / Directus

| Feature | HTMLDrop | Strapi/Directus |
|---------|----------|-----------------|
| Approach | Traditional CMS | Headless-first |
| Themes | ✅ Built-in SSR | ❌ No themes |
| Plugin System | ✅ WordPress-style | Different approach |
| Learning Curve | Easy (familiar to WordPress) | Steeper |
| Content Editing | ✅ Rich editor | Admin-focused |
| Community | Growing | Established |

### vs Ghost

| Feature | HTMLDrop | Ghost |
|---------|----------|-------|
| Use Case | General CMS | Blogging-focused |
| Custom Post Types | ✅ Unlimited | ❌ Limited |
| Plugin System | ✅ Full extensibility | Limited |
| Themes | ✅ Full control | Handlebars templates |
| Admin UI | Vue 3 SPA | Ember.js |
| Flexibility | ✅ Highly flexible | Blog-specific |

---

## 🏗️ Project Structure

```
htmldrop-cms/
├── core/                   # Core application
│   ├── admin/                 # Vue 3 admin panel
│   ├── controllers/           # API controllers
│   ├── middlewares/           # Express middlewares
│   ├── registries/            # Plugin/theme/post-type system
│   ├── routes/                # API routes
│   ├── services/              # Business logic
│   ├── utils/                 # Helper utilities
│   └── database/              # Migrations & seeds
│
├── content/                # User content (WordPress-like)
│   ├── plugins/               # Installed plugins
│   ├── themes/                # Installed themes
│   ├── uploads/               # Media uploads
│   └── config/                # Configuration files
│
├── core/docs/              # Documentation
│   ├── api/                   # API reference
│   ├── architecture/          # System architecture
│   ├── themes/                # Theme development
│   ├── hooks/                 # Hooks & filters
│   └── deployment/            # Deployment guides
│
└── core/tests/             # Test files
```

---

## 🛠️ Technology Stack

### Backend

- **Node.js** - JavaScript runtime
- **Express 5** - Web framework
- **Knex.js** - SQL query builder
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **multer** - File uploads
- **ws** - WebSocket support

### Frontend (Admin)

- **Vue 3** - Progressive framework
- **Vue Router** - SPA routing
- **Vite** - Build tool
- **DOMPurify** - XSS protection

### Database

- **PostgreSQL** - Recommended for production
- **MySQL/MariaDB** - Alternative option
- **SQLite** - Development/testing

### DevOps

- **PM2** - Process management
- **Nginx** - Reverse proxy
- **Redis** - Caching (optional)
- **Docker** - Containerization

---

## 📊 Release log

### Version 1.0 (Current)

- [x] Core CMS functionality
- [x] Plugin system with hooks/filters
- [x] Theme system with SSR
- [x] REST API
- [x] Authentication & authorization
- [x] Admin panel (Vue 3)
- [x] Multi-database support
- [x] Clustering
- [x] Plugin lifecycle hooks (install/uninstall/upgrade)
- [x] Theme lifecycle hooks (install/uninstall/upgrade)
- [x] Dependency management
- [x] Redis caching layer
- [x] Rate limiting
- [x] Enhanced security (CSRF, Helmet)
- [x] Testing infrastructure
- [x] One-click installers

---

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Ways to Contribute

- 🐛 **Report bugs** - Open an issue with details
- 💡 **Suggest features** - Share your ideas
- 📖 **Improve docs** - Fix typos, add examples
- 🔧 **Submit PRs** - Fix bugs or add features
- 🎨 **Create themes** - Share your designs
- 🔌 **Build plugins** - Extend functionality
- 💬 **Help others** - Answer questions in discussions
- ⭐ **Star the repo** - Show your support

### Getting Started

1. Read the [Contributing Guide](core/docs/CONTRIBUTING.md)
2. Look for [good first issues](https://github.com/htmldrop/htmldrop/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
3. Fork, code, and submit a PR!

---

## 👥 Community

### Get Help

- 📖 **Documentation** - [core/docs/](core/docs/)
- 💬 **Discussions** - [GitHub Discussions](https://github.com/htmldrop/htmldrop/discussions)
- 🐛 **Bug Reports** - [GitHub Issues](https://github.com/htmldrop/htmldrop/issues)
- 💡 **Feature Requests** - [GitHub Issues](https://github.com/htmldrop/htmldrop/issues)

### Stay Connected

- 🌐 **Website** - [htmldrop.com](#) (coming soon)

---

## 📝 License

HTMLDrop CMS is open-source software licensed under the [GNU General Public License v2.0](LICENSE).

---

## 🙏 Acknowledgments

HTMLDrop was inspired by:

- **WordPress** - For pioneering the plugin/theme architecture
- **Ghost** - For clean Node.js CMS architecture
- **Strapi** - For modern headless CMS patterns
- **Vue.js** - For the amazing reactive framework

Special thanks to all our contributors and the open-source community!

---

## 📈 Statistics

![GitHub stars](https://img.shields.io/github/stars/htmldrop/htmldrop?style=social)
![GitHub forks](https://img.shields.io/github/forks/htmldrop/htmldrop?style=social)
![GitHub issues](https://img.shields.io/github/issues/htmldrop/htmldrop)
![GitHub pull requests](https://img.shields.io/github/issues-pr/htmldrop/htmldrop)

---

<p align="center">
  Made with ❤️ by the HTMLDrop team and contributors
</p>

<p align="center">
  <a href="#htmldrop-cms">Back to top ↑</a>
</p>
