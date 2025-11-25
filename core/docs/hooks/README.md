# Hooks & Filters Reference

Complete reference for the HTMLDrop CMS hooks and filters system.

## Table of Contents

- [Introduction](#introduction)
- [Actions (Hooks)](#actions-hooks)
- [Filters](#filters)
- [Priority System](#priority-system)
- [Examples](#examples)
- [Creating Custom Hooks](#creating-custom-hooks)
- [Best Practices](#best-practices)

---

## Introduction

HTMLDrop's hooks and filters system is inspired by WordPress, allowing plugins and themes to modify behavior and content without touching core code.

### Concepts

**Actions (Hooks)** - Execute code at specific points in the lifecycle
**Filters** - Modify values before they're used or returned

### Basic Usage

```javascript
export default async ({ req, res, next, router }) => {
  return {
    async init() {
      const { addAction, addFilter, doAction, applyFilters } = req.hooks

      // Register an action
      addAction('init', async () => {
        console.log('System initialized')
      }, 10) // Priority: 10 (default)

      // Register a filter
      addFilter('the_content', (content) => {
        return content.toUpperCase()
      }, 10)

      // Trigger an action
      await doAction('custom_event', data)

      // Apply filters
      const modifiedContent = applyFilters('the_content', originalContent)
    }
  }
}
```

---

## Actions (Hooks)

Actions allow you to execute code at specific points without returning a value.

### Core Actions

#### `init`

Fires after the system initialization, before processing the request.

**Parameters:** None

**Example:**
```javascript
addAction('init', async () => {
  console.log('System ready')
})
```

**Use Cases:**
- Initialize plugin services
- Set up database connections
- Register custom post types
- Register taxonomies

---

#### `save_post`

Fires after a post is saved (both create and update).

**Parameters:**
- `post` (Object) - The post object
- `isUpdate` (Boolean) - True if updating, false if creating

**Example:**
```javascript
addAction('save_post', async (post, isUpdate) => {
  if (!isUpdate) {
    console.log('New post created:', post.id)
  } else {
    console.log('Post updated:', post.id)
  }

  // Clear cache
  await clearCache(`post_${post.id}`)

  // Send notification
  await sendNotification('Post saved', post)
}, 10)
```

**Use Cases:**
- Clear caches
- Send notifications
- Update search indexes
- Sync with external services
- Generate thumbnails
- Update related content

---

#### `create_post`

Fires after a new post is created.

**Parameters:**
- `post` (Object) - The newly created post

**Example:**
```javascript
addAction('create_post', async (post) => {
  console.log('New post:', post.title)

  // Send email to admin
  await sendEmail({
    to: 'admin@example.com',
    subject: 'New post published',
    body: `${post.title} was just published`
  })
})
```

**Use Cases:**
- Send welcome emails
- Create default meta fields
- Assign default taxonomies
- Trigger webhooks

---

#### `delete_post`

Fires before a post is deleted.

**Parameters:**
- `post` (Object) - The post about to be deleted

**Example:**
```javascript
addAction('delete_post', async (post) => {
  // Delete associated files
  if (post.meta?.attachments) {
    for (const attachment of post.meta.attachments) {
      await deleteFile(attachment.path)
    }
  }

  // Clean up relationships
  await knex('custom_relationships')
    .where('post_id', post.id)
    .del()
})
```

**Use Cases:**
- Clean up files
- Delete relationships
- Remove from caches
- Archive data

---

#### `pre_upload`

Fires before a file is uploaded.

**Parameters:**
- `file` (Object) - The file object from multer
  - `originalname` - Original filename
  - `mimetype` - MIME type
  - `size` - File size in bytes

**Example:**
```javascript
addAction('pre_upload', async (file) => {
  console.log('Uploading:', file.originalname)

  // Validate file
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File too large')
  }

  // Check MIME type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('File type not allowed')
  }
})
```

**Use Cases:**
- Validate file size
- Check file type
- Scan for viruses
- Check permissions

---

#### `after_upload`

Fires after a file is successfully uploaded.

**Parameters:**
- `file` (Object) - The uploaded file object
- `attachment` (Object) - The created attachment post

**Example:**
```javascript
addAction('after_upload', async (file, attachment) => {
  // Generate thumbnails for images
  if (file.mimetype.startsWith('image/')) {
    await generateThumbnails(file.path, [
      { width: 150, height: 150, name: 'thumbnail' },
      { width: 300, height: 300, name: 'medium' },
      { width: 1024, height: 1024, name: 'large' }
    ])

    // Update attachment meta with thumbnail URLs
    await knex(table('post_meta'))
      .insert({
        post_id: attachment.id,
        meta_key: 'thumbnails',
        meta_value: JSON.stringify({
          thumbnail: '/uploads/2025/11/image-150x150.jpg',
          medium: '/uploads/2025/11/image-300x300.jpg',
          large: '/uploads/2025/11/image-1024x1024.jpg'
        })
      })
  }

  // Extract metadata
  if (file.mimetype === 'application/pdf') {
    const metadata = await extractPDFMetadata(file.path)
    await savePostMeta(attachment.id, 'pdf_metadata', metadata)
  }
})
```

**Use Cases:**
- Generate thumbnails
- Extract metadata
- Optimize images
- Upload to CDN
- Create backups

---

#### `user_login`

Fires after a user successfully logs in.

**Parameters:**
- `user` (Object) - The user object
- `token` (String) - The JWT access token

**Example:**
```javascript
addAction('user_login', async (user, token) => {
  // Log login
  await knex('login_logs').insert({
    user_id: user.id,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    logged_in_at: new Date()
  })

  // Update last login time
  await knex('users')
    .where('id', user.id)
    .update({ last_login: new Date() })

  // Send notification
  await sendEmail({
    to: user.email,
    subject: 'New login detected',
    body: `You logged in from ${req.ip}`
  })
})
```

**Use Cases:**
- Log login attempts
- Update user metadata
- Send notifications
- Track analytics

---

#### `user_register`

Fires after a new user registers.

**Parameters:**
- `user` (Object) - The newly created user

**Example:**
```javascript
addAction('user_register', async (user) => {
  // Send welcome email
  await sendEmail({
    to: user.email,
    subject: 'Welcome to our site!',
    body: `Hi ${user.display_name}, welcome to our community!`
  })

  // Assign default role
  await knex('user_roles').insert({
    user_id: user.id,
    role_id: await getRoleId('subscriber')
  })

  // Create user profile
  await knex('user_profiles').insert({
    user_id: user.id,
    bio: '',
    avatar: '/default-avatar.png'
  })
})
```

**Use Cases:**
- Send welcome emails
- Assign default roles
- Create user profiles
- Add to mailing lists

---

### Custom Actions

Plugins and themes can create their own actions:

```javascript
// Define custom action
addAction('my_plugin_event', async (data) => {
  console.log('Custom event triggered:', data)
})

// Trigger custom action
await doAction('my_plugin_event', { foo: 'bar' })
```

---

## Filters

Filters allow you to modify values before they're used or returned.

### Core Filters

#### `the_content`

Modifies post content before it's displayed.

**Parameters:**
- `content` (String) - The post content
- `post` (Object) - The post object

**Returns:** Modified content (String)

**Example:**
```javascript
addFilter('the_content', (content, post) => {
  // Add reading time
  const wordCount = content.split(/\s+/).length
  const readingTime = Math.ceil(wordCount / 200)
  const notice = `<p class="reading-time">Reading time: ${readingTime} min</p>`

  return notice + content
}, 10)
```

**Use Cases:**
- Add shortcodes
- Embed videos
- Add reading time
- Add table of contents
- Lazy load images
- Add social sharing buttons

---

#### `the_title`

Modifies post title before display.

**Parameters:**
- `title` (String) - The post title
- `post` (Object) - The post object

**Returns:** Modified title (String)

**Example:**
```javascript
addFilter('the_title', (title, post) => {
  // Add prefix for draft posts
  if (post.status === 'draft') {
    return `[DRAFT] ${title}`
  }
  return title
})
```

**Use Cases:**
- Add prefixes/suffixes
- Transform case
- Sanitize output
- Translate titles

---

#### `the_excerpt`

Modifies post excerpt before display.

**Parameters:**
- `excerpt` (String) - The post excerpt
- `post` (Object) - The post object

**Returns:** Modified excerpt (String)

**Example:**
```javascript
addFilter('the_excerpt', (excerpt, post) => {
  // Add "read more" link
  return `${excerpt} <a href="/post/${post.slug}">Read more →</a>`
})
```

**Use Cases:**
- Add read more links
- Limit length
- Add formatting
- Add metadata

---

#### `post_query`

Modifies the Knex query before fetching posts.

**Parameters:**
- `query` (Knex.QueryBuilder) - The Knex query builder
- `params` (Object) - Query parameters

**Returns:** Modified query (Knex.QueryBuilder)

**Example:**
```javascript
addFilter('post_query', (query, params) => {
  // Always exclude private posts for non-admins
  if (!req.user?.hasCapability('read_private_posts')) {
    query.where('status', '!=', 'private')
  }

  return query
})
```

**Use Cases:**
- Add WHERE clauses
- Modify ORDER BY
- Add JOINs
- Filter by permissions

---

#### `rest_response`

Modifies the API response before sending.

**Parameters:**
- `data` (Object) - The response data
- `request` (Object) - The request object

**Returns:** Modified data (Object)

**Example:**
```javascript
addFilter('rest_response', (data, request) => {
  // Add custom fields to all post responses
  if (data.post_type) {
    data.custom_field = 'custom value'
    data.request_time = new Date().toISOString()
  }

  return data
})
```

**Use Cases:**
- Add computed fields
- Remove sensitive data
- Add metadata
- Transform structure

---

#### `upload_dir`

Modifies the upload directory path.

**Parameters:**
- `path` (String) - The default upload path
- `file` (Object) - The file being uploaded

**Returns:** Modified path (String)

**Example:**
```javascript
addFilter('upload_dir', (path, file) => {
  // Organize by file type
  if (file.mimetype.startsWith('image/')) {
    return path + '/images'
  } else if (file.mimetype === 'application/pdf') {
    return path + '/documents'
  }
  return path
})
```

**Use Cases:**
- Organize by file type
- Organize by user
- Custom directory structure

---

#### `menu_items`

Modifies admin menu items.

**Parameters:**
- `items` (Array) - Array of menu items

**Returns:** Modified items (Array)

**Example:**
```javascript
addFilter('menu_items', (items) => {
  // Add custom menu item
  items.push({
    slug: 'my-page',
    title: 'My Custom Page',
    icon: '<svg>...</svg>',
    order: 100
  })

  // Remove a menu item
  return items.filter(item => item.slug !== 'unwanted-page')
})
```

**Use Cases:**
- Add custom pages
- Reorder menu
- Remove items
- Modify icons

---

### Custom Filters

Create custom filters for your plugins:

```javascript
// Define custom filter
addFilter('my_plugin_value', (value) => {
  return value * 2
})

// Apply custom filter
const result = applyFilters('my_plugin_value', 5) // 10
```

---

## Priority System

Both actions and filters support priority values. Lower priority = earlier execution.

**Default Priority:** 10

**Example:**
```javascript
// This runs first (priority 5)
addAction('save_post', async (post) => {
  console.log('First')
}, 5)

// This runs second (priority 10)
addAction('save_post', async (post) => {
  console.log('Second')
}, 10)

// This runs last (priority 20)
addAction('save_post', async (post) => {
  console.log('Last')
}, 20)
```

**Use Cases:**
- Ensure order of execution
- Override other plugins
- Run before/after core logic

---

## Examples

### Add Custom Shortcodes

```javascript
addFilter('the_content', (content) => {
  // [youtube url="..."]
  content = content.replace(
    /\[youtube url="([^"]+)"\]/g,
    '<iframe src="$1" frameborder="0" allowfullscreen></iframe>'
  )

  // [button text="..." link="..."]
  content = content.replace(
    /\[button text="([^"]+)" link="([^"]+)"\]/g,
    '<a href="$2" class="button">$1</a>'
  )

  return content
})
```

### Auto-generate Excerpts

```javascript
addFilter('the_excerpt', (excerpt, post) => {
  // If no excerpt, generate from content
  if (!excerpt && post.content) {
    const text = post.content.replace(/<[^>]+>/g, '') // Strip HTML
    excerpt = text.substring(0, 150) + '...'
  }
  return excerpt
})
```

### Add Table of Contents

```javascript
addFilter('the_content', (content) => {
  // Extract headings
  const headings = []
  const headingRegex = /<h([2-3])>(.*?)<\/h\1>/g
  let match

  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1],
      text: match[2],
      id: match[2].toLowerCase().replace(/\s+/g, '-')
    })
  }

  // Generate TOC
  let toc = '<div class="table-of-contents"><h2>Table of Contents</h2><ul>'
  for (const heading of headings) {
    toc += `<li class="level-${heading.level}">
      <a href="#${heading.id}">${heading.text}</a>
    </li>`
  }
  toc += '</ul></div>'

  // Add IDs to headings
  content = content.replace(/<h([2-3])>(.*?)<\/h\1>/g, (match, level, text) => {
    const id = text.toLowerCase().replace(/\s+/g, '-')
    return `<h${level} id="${id}">${text}</h${level}>`
  })

  return toc + content
})
```

### Cache Post Queries

```javascript
const cache = new Map()

addFilter('post_query', (query, params) => {
  // Add cache key to query
  const cacheKey = JSON.stringify(params)

  if (cache.has(cacheKey)) {
    console.log('Returning cached result')
    // Return cached result immediately
    return Promise.resolve(cache.get(cacheKey))
  }

  return query
})

addAction('save_post', async (post) => {
  // Clear cache on post save
  cache.clear()
})
```

### Add Related Posts

```javascript
addFilter('the_content', async (content, post) => {
  // Find related posts by category
  const categories = post.taxonomies?.categories || []
  if (categories.length === 0) return content

  const categoryIds = categories.map(cat => cat.id)

  const relatedPosts = await knex(table('posts'))
    .join(table('term_relationships'), 'posts.id', 'term_relationships.post_id')
    .whereIn('term_relationships.term_id', categoryIds)
    .where('posts.id', '!=', post.id)
    .where('posts.status', 'published')
    .limit(3)
    .select('posts.*')

  // Generate related posts HTML
  let relatedHTML = '<div class="related-posts"><h3>Related Posts</h3><ul>'
  for (const related of relatedPosts) {
    relatedHTML += `<li><a href="/post/${related.slug}">${related.title}</a></li>`
  }
  relatedHTML += '</ul></div>'

  return content + relatedHTML
})
```

---

## Creating Custom Hooks

Plugins can define their own hooks for extensibility:

```javascript
// In your plugin
export default async ({ req, res, next, router }) => {
  return {
    async init() {
      const { addAction, doAction } = req.hooks

      // Your plugin logic
      async function processOrder(order) {
        // Before processing
        await doAction('my_plugin_before_order', order)

        // Process order
        const result = await saveOrder(order)

        // After processing
        await doAction('my_plugin_after_order', order, result)

        return result
      }

      // Add route
      router.post('/orders', async (req, res) => {
        const result = await processOrder(req.body)
        res.json(result)
      })
    }
  }
}
```

Now other plugins can hook into your plugin:

```javascript
// In another plugin
addAction('my_plugin_before_order', async (order) => {
  // Validate order
  if (order.total < 0) {
    throw new Error('Invalid order total')
  }
})

addAction('my_plugin_after_order', async (order, result) => {
  // Send confirmation email
  await sendEmail({
    to: order.email,
    subject: 'Order confirmed',
    body: `Your order #${result.id} has been received`
  })
})
```

---

## Best Practices

### 1. Use Appropriate Priorities

```javascript
// Run early (before most plugins)
addAction('init', async () => {
  // Core setup
}, 5)

// Run at default time
addAction('init', async () => {
  // Normal plugin logic
}, 10)

// Run late (after other plugins)
addAction('init', async () => {
  // Cleanup or finalization
}, 20)
```

### 2. Always Return Values in Filters

```javascript
// ✅ Good
addFilter('the_content', (content) => {
  return content.toUpperCase()
})

// ❌ Bad (doesn't return)
addFilter('the_content', (content) => {
  content.toUpperCase() // This does nothing!
})
```

### 3. Handle Async Operations

```javascript
// ✅ Good
addAction('save_post', async (post) => {
  await sendNotification(post)
  await clearCache(post.id)
})

// ❌ Bad (fire and forget)
addAction('save_post', (post) => {
  sendNotification(post) // Not awaited!
})
```

### 4. Check for Existing Data

```javascript
addFilter('the_excerpt', (excerpt, post) => {
  // Only generate if excerpt is missing
  if (excerpt) return excerpt

  // Generate from content
  return post.content.substring(0, 150) + '...'
})
```

### 5. Use Specific Hook Names

```javascript
// ✅ Good (specific)
addAction('my_plugin_order_processed', async (order) => {
  // ...
})

// ❌ Bad (too generic)
addAction('process', async (data) => {
  // What is this processing?
})
```

### 6. Document Your Hooks

```javascript
/**
 * Fires after an order is processed.
 *
 * @hook my_plugin_order_processed
 * @param {Object} order - The order object
 * @param {Object} result - The processing result
 */
await doAction('my_plugin_order_processed', order, result)
```

### 7. Handle Errors Gracefully

```javascript
addAction('save_post', async (post) => {
  try {
    await sendNotification(post)
  } catch (error) {
    console.error('Failed to send notification:', error)
    // Don't let notification failure break post saving
  }
})
```

---

## Available Hooks Summary

### Actions

| Hook | Description | Parameters |
|------|-------------|------------|
| `init` | System initialization | None |
| `save_post` | After post save | `post`, `isUpdate` |
| `create_post` | After post creation | `post` |
| `delete_post` | Before post deletion | `post` |
| `pre_upload` | Before file upload | `file` |
| `after_upload` | After file upload | `file`, `attachment` |
| `user_login` | After user login | `user`, `token` |
| `user_register` | After user registration | `user` |

### Filters

| Filter | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `the_content` | Modify post content | `content`, `post` | String |
| `the_title` | Modify post title | `title`, `post` | String |
| `the_excerpt` | Modify post excerpt | `excerpt`, `post` | String |
| `post_query` | Modify post query | `query`, `params` | Query |
| `rest_response` | Modify API response | `data`, `request` | Object |
| `upload_dir` | Modify upload path | `path`, `file` | String |
| `menu_items` | Modify admin menu | `items` | Array |

---

## Need Help?

- [Plugin Development Guide](../../content/plugins/README.md)
- [Theme Development Guide](../themes/README.md)
- [API Reference](../api/README.md)
- [GitHub Issues](https://github.com/your-repo/issues)
