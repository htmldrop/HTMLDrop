# Theme Development Guide

Complete guide to developing themes for HTMLDrop CMS.

## Overview

HTMLDrop themes are **extremely flexible** - you can use any frontend framework (Vue, React, Svelte, etc.), build tools (Vite, Webpack), or even plain HTML/CSS/JS. Themes have full control over routing, rendering, and frontend architecture.

## Table of Contents

- [Getting Started](#getting-started)
- [Theme Structure](#theme-structure)
- [Entry Point](#entry-point)
- [Theme Approaches](#theme-approaches)
- [Routing](#routing)
- [Fetching Data](#fetching-data)
- [Static Assets](#static-assets)
- [Hooks & Filters](#hooks--filters)
- [Persistence Config](#persistence-config)
- [Publishing](#publishing)

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- HTMLDrop CMS installed
- Basic knowledge of JavaScript
- Optional: Framework knowledge (Vue 3, React, etc.)

### Create a New Theme

```bash
mkdir hd-content/themes/my-theme
cd hd-content/themes/my-theme
npm init -y
```

Update `package.json`:

```json
{
  "name": "@your-org/my-theme",
  "version": "1.0.0",
  "main": "index.mjs",
  "type": "module",
  "keywords": ["hd-theme"],
  "author": "Your Name"
}
```

---

## Theme Structure

HTMLDrop themes are flexible. You can structure them however you want.

### Simple Theme

```
my-theme/
├── index.mjs              # Entry point (required)
├── package.json           # Metadata (required)
└── public/                # Static assets
    ├── css/
    └── js/
```

### Build-Based Theme (like Componentor)

```
my-theme/
├── index.mjs              # Entry point
├── package.json           # Metadata
├── config.mjs             # Persistence config
├── client/                # Built frontend
├── server/                # SSR entry
└── workdir/               # Dev workspace
```

---

## Entry Point

The `index.mjs` file must export a function that returns `{ init, render }`:

```javascript
export default async ({ req, res, next, router }) => {
  return {
    async init() {
      // Initialize hooks, filters, admin pages
    },
    async render() {
      // Handle routing and rendering
    }
  }
}
```

### Type Safety & IntelliSense

For TypeScript/JSDoc type hints and autocompletion in VS Code (with Intelephense or similar), use the `createContext` helper:

```javascript
import { createContext } from '../../../hd-core/types/context.mjs'

export default async ({ req, res, next, router }) => {
  // Get typed context, hooks, and guard with IntelliSense support
  const { context, hooks, guard } = createContext(req)

  return {
    async init() {
      // Now you get autocomplete for hooks methods
      const { addAction, addFilter } = hooks

      addAction('create_post', ({ post }) => {
        // Full type hints for post object
        console.log(post.title)
      })
    },
    async render() {
      // Autocomplete for context properties
      const { knex, table, options } = context

      // Full IntelliSense for Knex queries
      const posts = await knex(table('posts'))
        .where('status', 'published')
    }
  }
}
```

The `createContext` helper provides full type definitions for:
- `context` - Database access, options, helpers
- `hooks` - addAction, addFilter, doAction, applyFilter, etc.
- `guard` - Permission checking utilities

---

## Theme Approaches

### 1. Simple SSR Theme (Vue Example)

```javascript
import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import App from './App.vue'

export default async ({ req, res, next, router }) => {
  return {
    async init() {},
    async render() {
      router.get('/*', async (req, res) => {
        const app = createSSRApp(App, { url: req.url })
        const html = await renderToString(app)
        res.send(`<!DOCTYPE html><html><body>\${html}</body></html>`)
      })
    }
  }
}
```

### 2. Build-Based Theme (like Componentor)

```javascript
import path from 'path'
import fs from 'fs'
import express from 'express'

export default async ({ req, res, next, router }) => {
  return {
    async init() {},
    async render() {
      // Serve client assets
      router.use(express.static('client'))

      // Load SSR render function
      const { render } = await import('./server/entry-server.js')

      router.get('/*', async (req, res) => {
        const rendered = await render(req.url)
        res.send(rendered.html)
      })
    }
  }
}
```

### 3. Static HTML Theme

```javascript
export default async ({ req, res, next, router }) => {
  return {
    async init() {},
    async render() {
      router.get('/*', async (req, res) => {
        const { knex, table } = req.context
        const posts = await knex(table('posts')).limit(10)

        res.send(`
          <!DOCTYPE html>
          <html>
            <body>
              \${posts.map(p => `<h2>\${p.title}</h2>`).join('')}
            </body>
          </html>
        `)
      })
    }
  }
}
```

---

## Routing

Full Express.js routing control:

```javascript
async render() {
  // Homepage
  router.get('/', async (req, res) => {
    // Render homepage
  })

  // Single post
  router.get('/post/:slug', async (req, res) => {
    // Render post
  })

  // Custom API
  router.get('/api/posts', async (req, res) => {
    const posts = await req.context.knex(req.context.table('posts'))
    res.json(posts)
  })
}
```

---

## Fetching Data

Access database via Knex.js:

```javascript
const { knex, table } = req.context

// Get posts
const posts = await knex(table('posts'))
  .where('status', 'published')
  .limit(10)

// Get post meta
const meta = await knex(table('post_meta'))
  .where('post_id', post.id)
```

---

## Static Assets

Serve static files:

```javascript
import express from 'express'
import path from 'path'

async render() {
  router.use(express.static(path.join(__dirname, 'public')))
}
```

---

## Hooks & Filters

```javascript
async init() {
  const { addAction, addFilter } = req.hooks

  addAction('create_post', ({ post }) => {
    console.log('Post created:', post.id)
  })

  addFilter('the_content', (content) => {
    return content.toUpperCase()
  })
}
```

---

## Persistence Config

Preserve files during upgrades with `config.mjs`:

```javascript
export default {
  persistent_directories: [
    'workdir',
    'node_modules',
    'uploads'
  ],
  persistent_files: [
    'settings.json'
  ]
}
```

See [PERSISTENCE_CONFIG.md](../PERSISTENCE_CONFIG.md) for details.

---

## Publishing

### Publishing to NPM

To make your theme installable through the HTMLDrop admin panel, publish it to NPM with the `hd-theme` keyword:

```json
{
  "name": "@your-org/my-theme",
  "version": "1.0.0",
  "main": "index.mjs",
  "type": "module",
  "keywords": ["hd-theme"],  // Required for theme discovery
  "author": "Your Name"
}
```

Then publish:

```bash
npm login
npm publish --access public
```

**Important:** The `hd-theme` keyword makes your theme searchable and installable through the HTMLDrop admin panel's theme installation page. Without this keyword, users won't be able to find your theme in the admin interface.

---

## Example Theme: Componentor

See `hd-content/themes/componentor` for a real-world example of a build-based theme with:
- Vue 3 + Vite build process
- SSR rendering
- Git-based version control
- Admin panel integration
- Custom routing

---

## Need Help?

- [API Reference](../api/README.md)
- [Hooks & Filters](../hooks/README.md)
- [GitHub Issues](https://github.com/htmldrop/htmldrop/issues)
