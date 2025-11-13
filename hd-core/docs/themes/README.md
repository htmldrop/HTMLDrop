# Theme Development Guide

Complete guide to developing themes for HTMLDrop CMS.

## Table of Contents

- [Getting Started](#getting-started)
- [Theme Structure](#theme-structure)
- [Entry Point](#entry-point)
- [Server-Side Rendering (SSR)](#server-side-rendering-ssr)
- [Vue Components](#vue-components)
- [Routing](#routing)
- [Fetching Data](#fetching-data)
- [Meta Tags & SEO](#meta-tags--seo)
- [Static Assets](#static-assets)
- [Hooks & Filters](#hooks--filters)
- [Theme Options](#theme-options)
- [Internationalization](#internationalization)
- [Publishing](#publishing)
- [Best Practices](#best-practices)

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- HTMLDrop CMS installed
- Basic knowledge of Vue 3
- Understanding of SSR concepts

### Create a New Theme

```bash
mkdir hd-content/themes/my-theme
cd hd-content/themes/my-theme
npm init -y
```

Update [package.json](../../hd-content/themes/):

```json
{
  "name": "@htmldrop/my-theme",
  "version": "1.0.0",
  "description": "My awesome theme",
  "main": "index.mjs",
  "type": "module",
  "keywords": ["hd-theme"],
  "author": "Your Name",
  "dependencies": {
    "vue": "^3.5.18"
  }
}
```

---

## Theme Structure

```
my-theme/
├── index.mjs              # Entry point (required)
├── package.json           # Theme metadata (required)
│
├── components/            # Vue components
│   ├── Header.vue
│   ├── Footer.vue
│   ├── Navigation.vue
│   ├── PostCard.vue
│   └── Sidebar.vue
│
├── layouts/               # Page layouts
│   ├── Default.vue
│   ├── Sidebar.vue
│   └── FullWidth.vue
│
├── pages/                 # Page templates
│   ├── Home.vue
│   ├── Post.vue
│   ├── Page.vue
│   └── Archive.vue
│
├── composables/           # Composition API utilities
│   ├── usePosts.js
│   └── useTheme.js
│
├── public/                # Static assets
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── main.js
│   └── images/
│       └── logo.png
│
└── README.md             # Documentation
```

---

## Entry Point

The `index.mjs` file is the theme's entry point. It must export a default async function.

### Basic Structure

```javascript
import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import { renderSSRHead } from '@unhead/ssr'
import { createHead } from '@unhead/vue'
import App from './components/App.vue'

export default async ({ req, res, next, router }) => {
  return {
    // Initialize theme (runs once per request)
    async init() {
      const { addAction, addFilter } = req.hooks

      // Add initialization logic
      addAction('init', async () => {
        console.log('Theme initialized')
      })

      // Modify content
      addFilter('the_content', (content) => {
        return content
      })
    },

    // Render the theme (SSR)
    async render() {
      // Create Vue SSR app
      const app = createSSRApp(App, {
        url: req.url,
        context: req.context
      })

      // Setup head management
      const head = createHead()
      app.use(head)

      // Render app to HTML
      const html = await renderToString(app)
      const { headTags, bodyTags } = await renderSSRHead(head)

      return `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${headTags}
            <link rel="stylesheet" href="/themes/my-theme/public/css/style.css">
          </head>
          <body>
            <div id="app">${html}</div>
            ${bodyTags}
            <script type="module" src="/themes/my-theme/public/js/main.js"></script>
          </body>
        </html>
      `
    }
  }
}
```

---

## Server-Side Rendering (SSR)

### Why SSR?

- **SEO** - Search engines can crawl content
- **Performance** - Faster initial page load
- **Social sharing** - Proper meta tags for social media

### SSR Flow

```
1. Request arrives → Theme render() called
     ↓
2. Create SSR app with request context
     ↓
3. Fetch data from API/database
     ↓
4. Render Vue components to HTML string
     ↓
5. Inject data into HTML for hydration
     ↓
6. Send HTML response to client
     ↓
7. Client-side Vue hydrates (takes over)
```

### Complete SSR Example

```javascript
// index.mjs
import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import { renderSSRHead } from '@unhead/ssr'
import { createHead } from '@unhead/vue'
import App from './components/App.vue'

export default async ({ req, res, next, router }) => {
  return {
    async init() {
      // Theme initialization
    },

    async render() {
      const { knex, table, options } = req.context

      // Fetch data server-side
      const posts = await knex(table('posts'))
        .where('post_type', 'posts')
        .where('status', 'published')
        .orderBy('created_at', 'desc')
        .limit(10)

      const siteTitle = options.site_title || 'My Site'

      // Create SSR app with server data
      const app = createSSRApp(App, {
        posts,
        siteTitle,
        url: req.url
      })

      const head = createHead()
      app.use(head)

      // Render to string
      const html = await renderToString(app)
      const { headTags, bodyTags } = await renderSSRHead(head)

      // Serialize data for client-side hydration
      const serializedData = JSON.stringify({ posts, siteTitle })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')

      return `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${siteTitle}</title>
            ${headTags}
            <link rel="stylesheet" href="/themes/my-theme/public/css/style.css">
          </head>
          <body>
            <div id="app">${html}</div>
            <script>
              window.__INITIAL_STATE__ = ${serializedData}
            </script>
            ${bodyTags}
            <script type="module" src="/themes/my-theme/public/js/main.js"></script>
          </body>
        </html>
      `
    }
  }
}
```

---

## Vue Components

### App Component

```vue
<!-- components/App.vue -->
<template>
  <div id="app">
    <Header :site-title="siteTitle" />
    <Navigation />

    <main class="content">
      <component :is="currentPage" :data="pageData" />
    </main>

    <Footer />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useHead } from '@unhead/vue'
import Header from './Header.vue'
import Navigation from './Navigation.vue'
import Footer from './Footer.vue'
import HomePage from '../pages/Home.vue'
import PostPage from '../pages/Post.vue'

const props = defineProps({
  posts: Array,
  siteTitle: String,
  url: String
})

// Route detection
const currentPage = computed(() => {
  const path = props.url || window.location.pathname
  if (path === '/') return HomePage
  if (path.startsWith('/post/')) return PostPage
  return HomePage
})

// SEO meta tags
useHead({
  title: props.siteTitle,
  meta: [
    { name: 'description', content: 'My awesome site' },
    { property: 'og:title', content: props.siteTitle },
  ]
})
</script>
```

### Post Card Component

```vue
<!-- components/PostCard.vue -->
<template>
  <article class="post-card">
    <a :href="`/post/${post.slug}`" class="post-link">
      <img
        v-if="post.meta?.featured_image"
        :src="post.meta.featured_image"
        :alt="post.title"
        class="post-image"
      />

      <div class="post-content">
        <h2 class="post-title">{{ post.title }}</h2>

        <p class="post-excerpt">{{ post.excerpt }}</p>

        <div class="post-meta">
          <span class="post-date">{{ formatDate(post.created_at) }}</span>
          <span v-if="post.authors?.length" class="post-author">
            by {{ post.authors[0].display_name }}
          </span>
        </div>
      </div>
    </a>
  </article>
</template>

<script setup>
const props = defineProps({
  post: {
    type: Object,
    required: true
  }
})

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
</script>

<style scoped>
.post-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s;
}

.post-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.post-link {
  text-decoration: none;
  color: inherit;
}

.post-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.post-content {
  padding: 1.5rem;
}

.post-title {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
}

.post-excerpt {
  color: #666;
  line-height: 1.6;
}

.post-meta {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
  font-size: 0.875rem;
  color: #999;
}
</style>
```

---

## Routing

### URL-based Routing

```javascript
// composables/useRouter.js
export function useRouter(url) {
  const path = url || window.location.pathname

  const route = {
    path,
    name: '',
    params: {}
  }

  // Home page
  if (path === '/') {
    route.name = 'home'
  }
  // Single post
  else if (path.match(/^\/post\/(.+)$/)) {
    route.name = 'post'
    route.params.slug = path.match(/^\/post\/(.+)$/)[1]
  }
  // Page
  else if (path.match(/^\/page\/(.+)$/)) {
    route.name = 'page'
    route.params.slug = path.match(/^\/page\/(.+)$/)[1]
  }
  // Category archive
  else if (path.match(/^\/category\/(.+)$/)) {
    route.name = 'category'
    route.params.slug = path.match(/^\/category\/(.+)$/)[1]
  }

  return route
}
```

### Dynamic Component Loading

```vue
<template>
  <component :is="currentComponent" :slug="route.params.slug" />
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from '../composables/useRouter'
import HomePage from '../pages/Home.vue'
import PostPage from '../pages/Post.vue'
import PageTemplate from '../pages/Page.vue'
import CategoryArchive from '../pages/Category.vue'

const props = defineProps({
  url: String
})

const route = useRouter(props.url)

const currentComponent = computed(() => {
  switch (route.name) {
    case 'home': return HomePage
    case 'post': return PostPage
    case 'page': return PageTemplate
    case 'category': return CategoryArchive
    default: return HomePage
  }
})
</script>
```

---

## Fetching Data

### Server-Side Data Fetching

In the theme's `render()` method:

```javascript
async render() {
  const { knex, table, getPostType, getAllPostTypes } = req.context

  // Fetch posts with meta and taxonomies
  const posts = await knex(table('posts'))
    .where('post_type', 'posts')
    .where('status', 'published')
    .orderBy('created_at', 'desc')
    .limit(10)

  // Load meta for all posts
  const postsWithMeta = await withMetaMany(knex, table, posts)

  // Load authors
  for (const post of postsWithMeta) {
    const authors = await knex(table('post_authors'))
      .join(table('users'), `${table('post_authors')}.user_id`, `${table('users')}.id`)
      .where('post_id', post.id)
      .select('users.*')
    post.authors = authors
  }

  // Pass to Vue app
  const app = createSSRApp(App, {
    posts: postsWithMeta,
    // ...
  })
}
```

### Client-Side Data Fetching

```javascript
// composables/usePosts.js
import { ref, onMounted } from 'vue'

export function usePosts() {
  const posts = ref([])
  const loading = ref(false)
  const error = ref(null)

  const fetchPosts = async (params = {}) => {
    loading.value = true
    error.value = null

    try {
      const query = new URLSearchParams(params)
      const response = await fetch(`/api/v1/posts?${query}`)

      if (!response.ok) {
        throw new Error('Failed to fetch posts')
      }

      const data = await response.json()
      posts.value = data.items
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return { posts, loading, error, fetchPosts }
}
```

Usage:

```vue
<script setup>
import { onMounted } from 'vue'
import { usePosts } from '../composables/usePosts'

const { posts, loading, error, fetchPosts } = usePosts()

onMounted(async () => {
  // Use server-side data if available
  if (window.__INITIAL_STATE__?.posts) {
    posts.value = window.__INITIAL_STATE__.posts
  } else {
    // Otherwise fetch client-side
    await fetchPosts({ status: 'published', limit: 10 })
  }
})
</script>
```

---

## Meta Tags & SEO

### Using @unhead/vue

```vue
<script setup>
import { useHead } from '@unhead/vue'

const props = defineProps({
  post: Object
})

useHead({
  title: props.post.title,
  meta: [
    { name: 'description', content: props.post.excerpt },
    { property: 'og:title', content: props.post.title },
    { property: 'og:description', content: props.post.excerpt },
    { property: 'og:image', content: props.post.meta?.featured_image },
    { property: 'og:type', content: 'article' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: props.post.title },
    { name: 'twitter:description', content: props.post.excerpt },
    { name: 'twitter:image', content: props.post.meta?.featured_image },
  ],
  link: [
    { rel: 'canonical', href: `https://example.com/post/${props.post.slug}` }
  ],
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: props.post.title,
        description: props.post.excerpt,
        datePublished: props.post.created_at,
        author: {
          '@type': 'Person',
          name: props.post.authors?.[0]?.display_name
        }
      })
    }
  ]
})
</script>
```

---

## Static Assets

### Serving Static Files

Static files in `/public` are automatically served:

```
/themes/my-theme/public/css/style.css
  → Accessible at: /themes/my-theme/public/css/style.css
```

### Loading Assets

```html
<!-- CSS -->
<link rel="stylesheet" href="/themes/my-theme/public/css/style.css">

<!-- JavaScript -->
<script type="module" src="/themes/my-theme/public/js/main.js"></script>

<!-- Images -->
<img src="/themes/my-theme/public/images/logo.png" alt="Logo">
```

### Asset Optimization

```javascript
// Build CSS with Vite or other build tool
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'public',
    rollupOptions: {
      input: {
        main: 'src/main.js',
        style: 'src/style.css'
      }
    }
  }
})
```

---

## Hooks & Filters

### Available Hooks in Themes

```javascript
async init() {
  const { addAction, addFilter, addMenuPage } = req.hooks

  // System initialization
  addAction('init', async () => {
    console.log('Theme loaded')
  })

  // Post creation
  addAction('create_post', async (post) => {
    console.log('New post created:', post.id)
  })

  // Post save
  addAction('save_post', async (post) => {
    // Send notification, clear cache, etc.
  })

  // File upload
  addAction('after_upload', async (file) => {
    // Process image, generate thumbnails, etc.
  })

  // Modify content
  addFilter('the_content', (content) => {
    // Add custom shortcodes, embeds, etc.
    return content.replace(/\[gallery\]/g, '<div class="gallery">...</div>')
  })

  // Modify title
  addFilter('the_title', (title) => {
    return title.toUpperCase()
  })

  // Modify excerpt
  addFilter('the_excerpt', (excerpt, post) => {
    return excerpt + '... [Read more]'
  })
}
```

### Custom Hooks

Themes can define their own hooks:

```javascript
// In theme
async init() {
  const { addAction, doAction } = req.hooks

  // Define custom hook
  addAction('my_theme_header', async () => {
    console.log('Header rendered')
  })

  // Trigger it
  await doAction('my_theme_header')
}
```

---

## Theme Options

### Using Options API

```javascript
async init() {
  const { knex, table } = req.context

  // Get theme option
  const themeOptions = await knex(table('options'))
    .where('option_name', 'my_theme_options')
    .first()

  const options = themeOptions ? JSON.parse(themeOptions.option_value) : {}

  // Use in theme
  console.log(options.header_style)
}
```

### Setting Options from Admin

Create an admin settings page:

```javascript
async init() {
  const { addMenuPage } = req.hooks

  addMenuPage({
    slug: 'theme-settings',
    title: 'Theme Settings',
    component: './components/Settings.vue',
    capability: 'manage_options'
  })
}
```

Settings component:

```vue
<!-- components/Settings.vue -->
<template>
  <div class="theme-settings">
    <h1>Theme Settings</h1>

    <form @submit.prevent="saveSettings">
      <div class="field">
        <label>Header Style</label>
        <select v-model="options.header_style">
          <option value="default">Default</option>
          <option value="centered">Centered</option>
          <option value="minimal">Minimal</option>
        </select>
      </div>

      <div class="field">
        <label>Primary Color</label>
        <input type="color" v-model="options.primary_color">
      </div>

      <button type="submit">Save Settings</button>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const options = ref({
  header_style: 'default',
  primary_color: '#007bff'
})

onMounted(async () => {
  const response = await fetch('/api/v1/options/my_theme_options')
  const data = await response.json()
  options.value = data.value || options.value
})

const saveSettings = async () => {
  await fetch('/api/v1/options/my_theme_options', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: options.value })
  })
  alert('Settings saved!')
}
</script>
```

---

## Internationalization

### Using Translations

```javascript
async render() {
  const { translate } = req.context

  const title = translate('site_title', 'en')
  const welcome = translate('welcome_message', req.locale || 'en')

  // Use in template
}
```

### Loading Translation Files

```javascript
// translations/en.json
{
  "site_title": "My Site",
  "welcome_message": "Welcome to my site",
  "read_more": "Read more"
}

// translations/nb.json
{
  "site_title": "Min Side",
  "welcome_message": "Velkommen til min side",
  "read_more": "Les mer"
}
```

---

## Publishing

### NPM Publishing

```bash
# 1. Update package.json
{
  "name": "@htmldrop/my-theme",
  "version": "1.0.0",
  "keywords": ["hd-theme"],
  "main": "index.mjs",
  "type": "module"
}

# 2. Create .npmignore
node_modules/
.env
*.log

# 3. Login to NPM
npm login

# 4. Publish
npm publish --access public
```

### Manual Installation

```bash
# Create ZIP
zip -r my-theme.zip my-theme/

# Upload via admin panel
# Or extract to hd-content/themes/
```

---

## Best Practices

### Performance

1. **Minimize SSR overhead** - Fetch only necessary data
2. **Use hydration** - Pass server data to client
3. **Lazy load components** - Use dynamic imports
4. **Optimize images** - Compress and use appropriate formats
5. **Cache static assets** - Use CDN or long cache headers

### SEO

1. **Use semantic HTML** - Proper heading hierarchy
2. **Add meta tags** - Description, OG tags, Twitter cards
3. **Structured data** - JSON-LD for rich snippets
4. **Canonical URLs** - Avoid duplicate content
5. **Sitemap** - Generate XML sitemap

### Accessibility

1. **ARIA labels** - For screen readers
2. **Keyboard navigation** - Tab through elements
3. **Color contrast** - WCAG AA compliance
4. **Alt text** - For all images
5. **Focus indicators** - Visible focus states

### Security

1. **Sanitize output** - Escape user-generated content
2. **Validate input** - Check all form inputs
3. **Use HTTPS** - Secure connections
4. **CSP headers** - Content Security Policy
5. **Avoid inline scripts** - Use external files

### Code Quality

1. **Component structure** - Single responsibility
2. **Prop validation** - Define prop types
3. **Error handling** - Try-catch blocks
4. **Comments** - Document complex logic
5. **Testing** - Unit tests for components

---

## Example Themes

See example themes in [/hd-content/themes/](../../hd-content/themes/):

- **default-theme** - Simple blog theme
- **magazine-theme** - Magazine-style layout
- **portfolio-theme** - Portfolio/showcase theme

---

## Need Help?

- [API Reference](../api/README.md)
- [Hooks & Filters](../hooks/README.md)
- [Architecture Guide](../architecture/README.md)
- [GitHub Issues](https://github.com/your-repo/issues)
- [Community Forum](https://github.com/your-repo/discussions)
