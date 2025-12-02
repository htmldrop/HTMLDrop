# Admin Bar Buttons

The Admin Bar Buttons system allows plugins and themes to register custom buttons in the admin bar with custom event handlers, icons, and dropdown menus.

## Basic Usage

### Registering a Button with Script

You can register both the button and its handler in one place from your backend code using the `script` parameter:

```javascript
// plugins/my-plugin/index.mjs
export default async ({ req }) => {
  req.hooks.registerButton({
    id: 'my-custom-button',
    label: 'My Tool',
    onclick: 'myCustomHandler',
    position: 500,
    script: `
      window.myCustomHandler = (event) => {
        console.log('Button clicked!', event)
        alert('Custom button was clicked!')
      }
    `
  })
}
```

The `script` code will be automatically executed in the browser when the page loads.

### Alternative: Using Global Functions

If you prefer, you can still define global functions separately (e.g., in a separate client-side file) and just reference them:

```javascript
// Backend: plugins/my-plugin/index.mjs
export default async ({ req }) => {
  req.hooks.registerButton({
    id: 'my-custom-button',
    label: 'My Tool',
    onclick: 'myCustomHandler',
    position: 500
  })
}
```

Then define the handler in a client-side file that's loaded on your pages:

```javascript
// Frontend: plugins/my-plugin/public/script.js
window.myCustomHandler = (event) => {
  alert('Custom button was clicked!')
}
```

## Button Configuration

### Required Properties

- `id` (string): Unique identifier for the button
- `label` (string): Button text/label (supports translation keys)

### Optional Properties

- `icon` (string): SVG icon markup to display before the label
- `href` (string): URL to navigate to when clicked (creates a link instead of button)
- `onclick` (string): Name of a global JavaScript function to call on click
- `script` (string): Client-side JavaScript code to execute (automatically injected and run in browser)
- `position` (number): Position in admin bar (lower = left, higher = right). Default: 1000
- `dropdown` (array): Array of dropdown menu items (see below)
- `classes` (string): Additional CSS classes to apply to the button

## Examples

### Simple Button with Icon

```javascript
// plugins/analytics-plugin/index.mjs
export default async ({ req }) => {
  req.hooks.registerButton({
    id: 'analytics-button',
    label: 'Analytics',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    onclick: 'openAnalytics',
    position: 300,
    script: `
      window.openAnalytics = () => {
        window.location.href = '/admin/analytics'
      }
    `
  })
}
```

### Button with Dynamic URL

For buttons that need to update their `href` based on the current page URL:

```javascript
// plugins/page-editor/index.mjs
export default async ({ req }) => {
  req.hooks.registerButton({
    id: 'edit-page-button',
    label: 'Edit Page',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    href: '/admin/editor',
    position: 250,
    script: `
      // Function to update link based on current page
      function updateEditLink() {
        const link = document.querySelector('#edit-page-button a')
        if (!link) return

        const currentPath = window.location.pathname

        // Build dynamic URL based on current page
        const url = '/admin/editor?page=' + encodeURIComponent(currentPath)

        link.href = url
      }

      // Update on initial load
      updateEditLink()

      // Update when URL changes (for SPAs)
      window.addEventListener('popstate', updateEditLink)
      window.addEventListener('hashchange', updateEditLink)
    `
  })
}
```

### Button as Link

```javascript
export default async ({ req }) => {
  req.hooks.registerButton({
    id: 'documentation-link',
    label: 'Documentation',
    href: 'https://docs.example.com',
    position: 900
  })
}
```

### Button with Dropdown Menu

```javascript
// plugins/content-creator/index.mjs
export default async ({ req }) => {
  req.hooks.registerButton({
    id: 'create-content',
    label: 'Create',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
    position: 200,
    dropdown: [
      {
        label: 'New Post',
        onclick: 'createNewPost'
      },
      {
        label: 'New Page',
        onclick: 'createNewPage'
      },
      {
        label: 'Import Content',
        href: '/admin/import'
      }
    ],
    script: `
      window.createNewPost = () => {
        window.location.href = '/admin/posts/new'
      }

      window.createNewPage = () => {
        window.location.href = '/admin/pages/new'
      }
    `
  })
}
```

### Custom Styling

```javascript
// plugins/cache-manager/index.mjs
export default async ({ req }) => {
  req.hooks.registerButton({
    id: 'clear-cache',
    label: 'Clear Cache',
    onclick: 'clearCache',
    classes: 'cache-button danger-action',
    position: 800,
    script: `
      window.clearCache = async () => {
        if (!confirm('Clear all caches?')) return

        try {
          const tokens = JSON.parse(localStorage.getItem('tokens'))
          await fetch('/api/v1/cache/clear', {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${tokens.accessToken}\`
            }
          })
          alert('Cache cleared!')
        } catch (error) {
          alert('Failed to clear cache: ' + error.message)
        }
      }
    `
  })
}
```

## Dropdown Menu Items

Dropdown items support the same properties as buttons:

- `label` (string, required): Menu item text
- `href` (string, optional): URL to navigate to
- `onclick` (string, optional): Function name to call on click

```javascript
dropdown: [
  {
    label: 'Action 1',
    onclick: 'myFunction'
  },
  {
    label: 'Visit Page',
    href: '/my-page'
  },
  {
    label: 'External Link',
    href: 'https://example.com',
    onclick: 'trackClick' // Can have both href and onclick
  }
]
```

## Translation Support

Button labels automatically support the translation system. Use translation keys as labels:

```javascript
req.hooks.registerButton({
  id: 'settings-button',
  label: 'Settings', // Will be translated based on user locale
  onclick: 'openSettings',
  position: 700
})
```

## Positioning

Buttons are sorted by their `position` value:
- Lower values appear on the left
- Higher values appear on the right
- Default position is 1000
- The profile dropdown is typically at the rightmost position

Suggested position ranges:
- 0-200: Left-most critical actions
- 200-500: Primary tools
- 500-800: Secondary tools
- 800-1000: Settings and utilities
- 1000+: Right-most non-critical items

## Registry Methods

### `registerButton(button)`

Register a new button or replace an existing one with the same ID.

```javascript
req.hooks.registerButton({
  id: 'my-button',
  label: 'My Button',
  onclick: 'myHandler',
  position: 500
})
```

### `unregisterButton(id)`

Remove a button by its ID.

```javascript
req.hooks.unregisterButton('my-button')
```

### `getButtons()`

Get all registered buttons (sorted by position).

```javascript
const allButtons = req.hooks.adminBarButtons.getButtons()
```

### `getButton(id)`

Get a specific button by ID.

```javascript
const button = req.hooks.adminBarButtons.getButton('my-button')
```

## Best Practices

### 1. Use Unique IDs

Always use unique, namespaced IDs to avoid conflicts:

```javascript
// Good
id: 'myplugin-export-button'

// Bad
id: 'export'
```

### 2. Define Global Functions Carefully

Event handlers must be global functions. Define them once and avoid conflicts:

```javascript
// Good - namespaced
window.myPlugin_handleExport = () => { /* ... */ }

// Bad - generic name
window.handleClick = () => { /* ... */ }
```

### 3. Clean Icons

Use inline SVG for icons. Keep them simple and sized at 16x16 or 24x24:

```javascript
icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M..."></path></svg>'
```

### 4. User Feedback

Always provide feedback for actions:

```javascript
window.myAction = async () => {
  try {
    await fetch('/api/v1/my-action', { method: 'POST' })
    alert('Action completed successfully!')
  } catch (error) {
    alert('Action failed: ' + error.message)
  }
}
```

### 5. Permission Checking

Check user permissions before registering buttons:

```javascript
export default async ({ req }) => {
  // Only show button to users with specific capability
  const canManage = await req.guard.user({ can: 'manage_options' })

  if (!canManage) return

  req.hooks.registerButton({
    id: 'admin-tools',
    label: 'Admin Tools',
    onclick: 'openAdminTools',
    position: 500
  })
}
```

## Complete Plugin Example

Here's a complete example of a plugin that adds an admin bar button with dropdown menu and multiple handlers:

```javascript
// plugins/my-tools/index.mjs
export default async ({ req }) => {
  // Check if user has permission
  const canAccess = await req.guard.user({ can: 'edit_posts' })
  if (!canAccess) return

  // Register main button with dropdown and handlers
  req.hooks.registerButton({
    id: 'my-tools-menu',
    label: 'My Tools',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
    position: 400,
    dropdown: [
      {
        label: 'Quick Edit',
        onclick: 'myTools_quickEdit'
      },
      {
        label: 'View Drafts',
        onclick: 'myTools_viewDrafts'
      },
      {
        label: 'Bulk Export',
        onclick: 'myTools_bulkExport'
      },
      {
        label: 'Documentation',
        href: 'https://docs.example.com/my-tools'
      }
    ],
    script: `
      // Define all handler functions
      window.myTools_quickEdit = () => {
        const url = prompt('Enter post URL to edit:')
        if (url) {
          const postId = url.split('/').pop()
          window.location.href = \`/admin/posts/\${postId}/edit\`
        }
      }

      window.myTools_bulkExport = async () => {
        if (!confirm('Export all posts?')) return

        try {
          const tokens = JSON.parse(localStorage.getItem('tokens'))
          const response = await fetch('/api/v1/posts/export', {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${tokens.accessToken}\`
            }
          })

          if (!response.ok) throw new Error('Export failed')

          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'posts-export.json'
          a.click()

          alert('Export completed!')
        } catch (error) {
          alert('Failed to export: ' + error.message)
        }
      }

      window.myTools_viewDrafts = () => {
        window.location.href = '/admin/posts?status=draft'
      }
    `
  })
}
```

## Styling Custom Buttons

Admin bar buttons inherit the default admin bar styles. To add custom styling, include CSS in your script:

```javascript
// plugins/my-plugin/index.mjs
export default async ({ req }) => {
  req.hooks.registerButton({
    id: 'my-custom-button',
    label: 'Custom',
    onclick: 'myHandler',
    classes: 'custom-button danger-action',
    position: 600,
    script: `
      // Add custom styles
      const style = document.createElement('style')
      style.textContent = \`
        #my-custom-button {
          background-color: #4CAF50;
          color: white;
        }

        #my-custom-button:hover {
          background-color: #45a049;
        }

        .danger-action {
          background-color: #f44336 !important;
        }

        .danger-action:hover {
          background-color: #da190b !important;
        }
      \`
      document.head.appendChild(style)

      // Define handler
      window.myHandler = () => {
        alert('Custom button clicked!')
      }
    `
  })
}
```
