# Type Hints and IntelliSense

CoralPen provides comprehensive TypeScript definitions for better developer experience with IntelliSense/autocomplete in VS Code and other IDEs.

## Quick Start - Getting Instant IntelliSense

There are two approaches to get instant autocomplete:

### Approach 1: Helper Functions (Recommended)

**Import helper functions for automatic type inference:**

```javascript
import { createContext } from '../../types/context.mjs'

/**
 * @param {HTMLDrop.PluginRequest} params
 * @returns {Promise<HTMLDrop.PluginInstance>}
 */
export default async ({ req, res, next, router }) => {
  const { context, hooks, guard } = createContext(req)

  // Now when you type "context." or "hooks." you get instant autocomplete!
  context.table('posts')        // ✅ Full IntelliSense with all methods
  hooks.addAction('init', ...)  // ✅ Parameter hints and examples
}
```

**Advantages:**
- Clean code without inline JSDoc comments
- Single import provides all typed objects
- Consistent pattern across all plugins/themes

### Approach 2: JSDoc Type Annotations

**Add explicit JSDoc type annotations:**

```javascript
/**
 * @param {HTMLDrop.PluginRequest} params
 * @returns {Promise<HTMLDrop.PluginInstance>}
 */
export default async ({ req, res, next, router }) => {
  /** @type {HTMLDrop.Context} */
  const context = req.context

  /** @type {HTMLDrop.Hooks} */
  const hooks = req.hooks

  // Now when you type "context." or "hooks." you get instant autocomplete!
  context.table('posts')        // ✅ Full IntelliSense with all methods
  hooks.addAction('init', ...)  // ✅ Parameter hints and examples
}
```

**Advantages:**
- No imports needed
- Works in any file location
- Explicit type declarations

**Without type information**, VS Code doesn't know the types and you won't get suggestions until you start typing method names.

## Templates

Ready-to-use templates with full type support:

- **Plugin Template**: [PLUGIN_TEMPLATE.mjs](./PLUGIN_TEMPLATE.mjs) - Copy this to start a new plugin
- **Theme Template**: [THEME_TEMPLATE.mjs](./THEME_TEMPLATE.mjs) - Copy this to start a new theme

## Helper Functions API

CoralPen provides helper functions in [types/context.mjs](../../types/context.mjs) for automatic type inference:

### `createContext(req)`
Returns all three typed objects in a single call:

```javascript
import { createContext } from '../../types/context.mjs'

const { context, hooks, guard } = createContext(req)
```

### `getContext(req)`
Returns only the context object:

```javascript
import { getContext } from '../../types/context.mjs'

const context = getContext(req)
```

### `getHooks(req)`
Returns only the hooks object:

```javascript
import { getHooks } from '../../types/context.mjs'

const hooks = getHooks(req)
```

### `getGuard(req)`
Returns only the guard object:

```javascript
import { getGuard } from '../../types/context.mjs'

const guard = getGuard(req)
```

**All functions provide full IntelliSense without requiring JSDoc annotations.**

## Setup

The type definitions are automatically available when working in the CoralPen project. For external plugins/themes, you can reference the types using either helper functions or JSDoc comments.

## Using Types in Plugins

### Basic Plugin Structure with Type Hints

**Using Helper Functions (Recommended):**

```javascript
import { createContext } from '../../types/context.mjs'

/**
 * @param {HTMLDrop.PluginRequest} request
 * @returns {Promise<HTMLDrop.PluginInstance>}
 */
export default async ({ req, res, next, router }) => {
  const { context, hooks, guard } = createContext(req)

  return {
    async init() {
      // Register hooks with full IntelliSense
      hooks.addAction('init', async () => {
        console.log('Plugin initialized')
      })

      // Register post type
      await hooks.registerPostType({
        slug: 'products',
        name_singular: 'Product',
        name_plural: 'Products',
        description: 'Product catalog',
        icon: 'shopping-cart',
        show_in_menu: true
      })

      // Register custom field
      await hooks.registerPostField({
        post_type_slug: 'products',
        slug: 'price',
        label: 'Price',
        type: 'number',
        required: true
      })

      // Add filter
      hooks.addFilter('the_content', (content, post) => {
        return `<div class="product-content">${content}</div>`
      })
    }
  }
}
```

**Using JSDoc Annotations (Alternative):**

```javascript
/**
 * @param {HTMLDrop.PluginRequest} request
 * @returns {Promise<HTMLDrop.PluginInstance>}
 */
export default async ({ req, res, next, router }) => {
  /** @type {HTMLDrop.Context} */
  const context = req.context

  /** @type {HTMLDrop.Hooks} */
  const hooks = req.hooks

  return {
    async init() {
      // Same implementation as above...
    }
  }
}
```

### Context Object with Type Hints

```javascript
/**
 * Initialize plugin with context
 * @param {HTMLDrop.PluginRequest} request
 */
export default async ({ req }) => {
  /** @type {HTMLDrop.Context} */
  const context = req.context

  /** @type {HTMLDrop.Hooks} */
  const { hooks } = req

  return {
    async init() {
      // Context methods now have IntelliSense
      const tableName = context.table('posts')
      const slug = context.normalizeSlug('My Product')
      const date = context.formatDate(new Date())

      // Knex queries
      const posts = await context.knex(tableName)
        .where('status', 'published')
        .limit(10)
    }
  }
}
```

### Working with Posts

```javascript
hooks.addAction('save_post', async ({ post, req, res }) => {
  /** @type {HTMLDrop.Post} */
  const typedPost = post

  // Now you get autocomplete for post properties
  console.log(typedPost.id)
  console.log(typedPost.title)
  console.log(typedPost.status)
  console.log(typedPost.meta)
})
```

### Database Queries with Type Hints

```javascript
/**
 * Fetch products with types
 * @param {HTMLDrop.Context} context
 * @returns {Promise<HTMLDrop.Post[]>}
 */
async function getProducts(context) {
  const products = await context.knex(context.table('posts'))
    .where('post_type_slug', 'products')
    .where('status', 'published')

  return products
}
```

### Guard/Authorization

```javascript
hooks.addAction('before_delete_post', async ({ post, req, res }) => {
  /** @type {HTMLDrop.Guard} */
  const guard = req.guard

  // Check capabilities with IntelliSense
  const hasAccess = await guard.user({
    userId: req.user.id,
    canOneOf: ['delete', 'delete_posts'],
    postId: post.id
  })

  if (!hasAccess) {
    throw new Error('Permission denied')
  }
})
```

## Available Interfaces

### Core Interfaces
- `HTMLDrop.Context` - Main context object
- `HTMLDrop.Hooks` - Hooks and filters system
- `HTMLDrop.Guard` - Authorization guard
- `HTMLDrop.ExtendedRequest` - Express request with CoralPen extensions

### Content Types
- `HTMLDrop.Post` - Post object
- `HTMLDrop.PostType` - Post type definition
- `HTMLDrop.PostTypeConfig` - Post type configuration
- `HTMLDrop.Field` - Custom field definition
- `HTMLDrop.FieldConfig` - Field configuration

### Taxonomy Types
- `HTMLDrop.Term` - Term object
- `HTMLDrop.Taxonomy` - Taxonomy definition
- `HTMLDrop.TaxonomyConfig` - Taxonomy configuration

### User Types
- `HTMLDrop.User` - User object
- `HTMLDrop.Role` - Role definition
- `HTMLDrop.Capability` - Capability definition

### Plugin/Theme Types
- `HTMLDrop.PluginRequest` - Plugin initialization request
- `HTMLDrop.PluginInstance` - Plugin instance interface
- `HTMLDrop.PluginMetadata` - Plugin metadata
- `HTMLDrop.ThemeRequest` - Theme initialization request
- `HTMLDrop.ThemeInstance` - Theme instance interface

### Query Types
- `HTMLDrop.PostQueryParams` - Post query parameters
- `HTMLDrop.MetaQuery` - Meta query structure
- `HTMLDrop.TaxonomyQuery` - Taxonomy query structure

### Response Types
- `HTMLDrop.ListResponse<T>` - Paginated list response
- `HTMLDrop.ErrorResponse` - Error response
- `HTMLDrop.SuccessResponse` - Success response
- `HTMLDrop.LoginResponse` - Authentication response

## IDE Configuration

### VS Code

The project includes a `jsconfig.json` that enables type checking for JavaScript files. To get the best experience:

1. Install the ESLint extension
2. Enable JavaScript validation in settings:
   ```json
   {
     "javascript.validate.enable": true,
     "javascript.suggest.autoImports": true
   }
   ```

### WebStorm / IntelliJ

WebStorm automatically recognizes TypeScript definitions and provides IntelliSense out of the box.

## Common Hooks with Type Examples

### Action Hooks

```javascript
// Post lifecycle hooks
hooks.addAction('save_post', async ({ post, req, res, next }) => {})
hooks.addAction('insert_post', async ({ post, req, res, next }) => {})
hooks.addAction('delete_post', async ({ post, req, res, next }) => {})
hooks.addAction('trash_post', async ({ post, req, res, next }) => {})

// User lifecycle hooks
hooks.addAction('save_user', async ({ user, req, res, next }) => {})
hooks.addAction('insert_user', async ({ user, req, res, next }) => {})
hooks.addAction('delete_user', async ({ user, req, res, next }) => {})

// Application lifecycle
hooks.addAction('init', async () => {})
hooks.addAction('shutdown', async () => {})
```

### Filter Hooks

```javascript
// Content filters
hooks.addFilter('the_content', (content, post) => {
  return content
})

hooks.addFilter('the_title', (title, post) => {
  return title
})

hooks.addFilter('the_excerpt', (excerpt, post) => {
  return excerpt
})

// Data filters
hooks.addFilter('insert_post_data', ({ coreData, metaData }, existingPost) => {
  return { coreData, metaData }
})

hooks.addFilter('insert_user_data', ({ coreData, metaData }, existingUser) => {
  return { coreData, metaData }
})
```

## Example Plugin with Full Type Hints

```javascript
/**
 * E-commerce Plugin Example
 * @param {HTMLDrop.PluginRequest} request
 * @returns {Promise<HTMLDrop.PluginInstance>}
 */
export default async ({ req, res, next, router }) => {
  /** @type {HTMLDrop.Context} */
  const context = req.context

  /** @type {HTMLDrop.Hooks} */
  const { hooks } = req

  /**
   * Calculate product price with tax
   * @param {number} price
   * @param {number} taxRate
   * @returns {number}
   */
  function calculateTotalPrice(price, taxRate = 0.25) {
    return price * (1 + taxRate)
  }

  return {
    async init() {
      // Register product post type
      await hooks.registerPostType({
        slug: 'products',
        name_singular: 'Product',
        name_plural: 'Products',
        description: 'Product catalog for e-commerce',
        icon: 'shopping-cart',
        show_in_menu: true
      })

      // Register product fields
      await hooks.registerPostField({
        post_type_slug: 'products',
        slug: 'price',
        label: 'Price',
        type: 'number',
        required: true
      })

      await hooks.registerPostField({
        post_type_slug: 'products',
        slug: 'sku',
        label: 'SKU',
        type: 'text',
        required: true
      })

      // Add price calculation filter
      hooks.addFilter('product_total_price', (price, product) => {
        const taxRate = context.options.tax_rate || 0.25
        return calculateTotalPrice(price, taxRate)
      })

      // Add REST API endpoint
      router.get('/api/products/:id/price', async (req, res) => {
        try {
          const { id } = req.params

          /** @type {HTMLDrop.Post | undefined} */
          const product = await context.knex(context.table('posts'))
            .where('id', id)
            .where('post_type_slug', 'products')
            .first()

          if (!product) {
            return res.status(404).json({ error: 'Product not found' })
          }

          // Get product metadata
          const meta = await context.knex(context.table('post_meta'))
            .where('post_id', id)
            .where('field_slug', 'price')
            .first()

          const basePrice = parseFloat(meta?.value || 0)
          const totalPrice = hooks.applyFilters('product_total_price', basePrice, product)

          res.json({
            product_id: product.id,
            title: product.title,
            base_price: basePrice,
            total_price: totalPrice
          })
        } catch (error) {
          res.status(500).json({ error: error.message })
        }
      })
    }
  }
}
```

## Tips

1. **Always use JSDoc comments** for better IntelliSense
2. **Type your function parameters** using `@param` tags
3. **Specify return types** using `@returns` tags
4. **Cast variables** when needed using `/** @type {Type} */`
5. **Check the type definitions** in `types/index.d.ts` for available interfaces

## Further Reading

- [JSDoc Documentation](https://jsdoc.app/)
- [TypeScript for JavaScript](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
- [VS Code JavaScript Language Features](https://code.visualstudio.com/docs/languages/javascript)
