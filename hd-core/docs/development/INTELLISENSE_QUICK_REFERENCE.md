# IntelliSense Quick Reference

## Two Approaches for Instant Autocomplete

### Approach 1: Helper Functions (Recommended)

Import helper functions that provide automatic type inference:

```javascript
import { createContext } from '../../types/context.mjs'

export default async ({ req, res, next, router }) => {
  const { context, hooks, guard } = createContext(req)

  // Now you get instant IntelliSense without JSDoc annotations!
  context.table('posts')
  hooks.addAction('init', ...)
  guard.user({ userId: 1, canOneOf: ['read'] })
}
```

**Pros:**
- Clean, no inline JSDoc comments needed
- Single import provides all typed objects
- Consistent across all plugins/themes

### Approach 2: JSDoc Type Annotations

Add type annotations at the top of your plugin/theme `export default` function:

```javascript
/** @type {HTMLDrop.Context} */
const context = req.context

/** @type {HTMLDrop.Hooks} */
const hooks = req.hooks

/** @type {HTMLDrop.Guard} */
const guard = req.guard
```

**Pros:**
- No imports needed
- Explicit type declarations
- Works in any file location

## Complete Plugin/Theme Boilerplate

**Using Helper Functions:**
```javascript
import { createContext } from '../../types/context.mjs'

/**
 * @param {HTMLDrop.PluginRequest} params  // or HTMLDrop.ThemeRequest
 * @returns {Promise<HTMLDrop.PluginInstance>}  // or HTMLDrop.ThemeInstance
 */
export default async ({ req, res, next, router }) => {
  const { context, hooks, guard } = createContext(req)

  return {
    async init() {
      // Your code here - now with full IntelliSense!
    }
  }
}
```

**Using JSDoc Annotations:**
```javascript
/**
 * @param {HTMLDrop.PluginRequest} params  // or HTMLDrop.ThemeRequest
 * @returns {Promise<HTMLDrop.PluginInstance>}  // or HTMLDrop.ThemeInstance
 */
export default async ({ req, res, next, router }) => {
  /** @type {HTMLDrop.Context} */
  const context = req.context

  /** @type {HTMLDrop.Hooks} */
  const hooks = req.hooks

  /** @type {HTMLDrop.Guard} */
  const guard = req.guard

  return {
    async init() {
      // Your code here - now with full IntelliSense!
    }
  }
}
```

## What You Get

### context. → Instant suggestions for:
- `context.table('table_name')`
- `context.knex` (with full Knex.js autocomplete)
- `context.options` (site options)
- `context.normalizeSlug('text')`
- `context.formatDate(date)`
- `context.translate('key')`
- `context.postTypes` (all registered post types)
- `context.taxonomies` (all registered taxonomies)

### hooks. → Instant suggestions for:
- `hooks.addAction('name', callback, priority)`
- `hooks.doAction('name', ...args)`
- `hooks.addFilter('name', callback, priority)`
- `hooks.applyFilters('name', value, ...args)`
- `hooks.registerPostType(config)`
- `hooks.registerPostField(config)`
- `hooks.registerTaxonomy(config)`
- `hooks.registerTermField(config)`
- `hooks.addMenuPage(config)`
- `hooks.addSubMenuPage(config)`

### guard. → Instant suggestions for:
- `guard.user({ userId, canOneOf: ['read'] })`
- `guard.user({ userId, canAllOf: ['edit', 'delete'] })`
- `guard.user({ userId, canOneOf: ['read_posts'], postId: 123 })`

## Common Patterns

### Database Query
```javascript
const posts = await context.knex(context.table('posts'))
  .where('status', 'published')
  .limit(10)
```

### Add Hook
```javascript
hooks.addAction('save_post', async ({ post, req, res }) => {
  console.log('Post saved:', post.id)
})
```

### Check Permission
```javascript
const hasAccess = await guard.user({
  userId: req.user?.id,
  canOneOf: ['read', 'read_posts']
})
```

### Add Filter
```javascript
hooks.addFilter('the_content', (content, post) => {
  return content.toUpperCase()
})
```

## Troubleshooting

### ❌ No autocomplete appears
**Problem**: You didn't add type information

**Solution 1** (Recommended): Use helper functions:
```javascript
import { createContext } from '../../types/context.mjs'
const { context, hooks, guard } = createContext(req)
```

**Solution 2**: Add JSDoc type annotations:
```javascript
/** @type {HTMLDrop.Context} */
const context = req.context

/** @type {HTMLDrop.Hooks} */
const hooks = req.hooks
```

### ❌ Autocomplete only shows after typing a few letters
**Problem**: VS Code is inferring types from usage instead of declarations

**Solution**: Use either helper functions or JSDoc annotations before using the objects

### ❌ VS Code doesn't recognize HTMLDrop types
**Problem**: The `jsconfig.json` or type definitions aren't loaded

**Solution**:
1. Make sure `jsconfig.json` exists in the root directory
2. Make sure `types/index.d.ts` exists
3. Reload VS Code window (Cmd/Ctrl + Shift + P → "Reload Window")

## Which Approach Should You Use?

### Use Helper Functions When:
- Starting a new plugin or theme (recommended for clean code)
- You want a consistent pattern across all your code
- You prefer less boilerplate in your files
- You're working in a large codebase with many plugins/themes

### Use JSDoc Annotations When:
- Working in existing plugins without imports
- You need types for specific variables only
- You're writing utility functions outside of plugins/themes
- You prefer explicit type declarations

**Both approaches provide identical IntelliSense functionality** - choose based on your preference!

## Pro Tips

1. **Always declare types at the top** of your default export function
2. **Use the templates** - they have all the types pre-configured
3. **Hover over methods** to see JSDoc documentation and examples
4. **Press Ctrl+Space** to manually trigger IntelliSense if it doesn't appear
5. **Keep TYPE_HINTS.md open** as reference while coding
6. **Mix approaches if needed** - you can use helper functions for some files and JSDoc for others

## Quick Links

- [Full Type Hints Documentation](./TYPE_HINTS.md)
- [Plugin Template](./PLUGIN_TEMPLATE.mjs)
- [Theme Template](./THEME_TEMPLATE.mjs)
- [Type Definitions](../../types/index.d.ts)
