# CoralPen Plugins

This directory contains plugins for the CoralPen CMS. Each plugin should have its own folder with a main `index.mjs` file.

## Plugin Structure

```
plugins/
└── my-plugin/
    ├── index.mjs          # Main plugin entry point (required)
    ├── package.json       # Optional: Plugin metadata
    ├── providers/         # Optional: Provider modules
    └── assets/           # Optional: Plugin assets
```

## Creating a Plugin

### 1. Basic Plugin Structure

Create a new folder in `hd-content/plugins/` with an `index.mjs` file:

```javascript
// hd-content/plugins/my-plugin/index.mjs

export default async ({ req, res, next }) => {
  return {
    async init() {
      // Your plugin initialization code here
      const { addAction, addFilter, addMenuPage } = req.hooks

      console.log('My plugin loaded!')
    }
  }
}
```

### 2. Available Hooks

Your plugin has access to the following hooks via `req.hooks`:

#### Actions (fire and forget)
```javascript
addAction('hookName', callback, priority)
doAction('hookName', ...args)
```

**Available action hooks:**
- `init` - Fires after all registries are loaded
- `create_post` - Fires when a post is created
- `save_post` - Fires when a post is saved
- `delete_post` - Fires when a post is deleted
- `pre_upload` - Fires before file upload
- `after_upload` - Fires after file upload

#### Filters (modify values)
```javascript
addFilter('hookName', callback, priority)
applyFilters('hookName', value, ...args)
```

**Available filter hooks:**
- `the_content` - Modify post content before output
- `the_title` - Modify post title before output
- `the_excerpt` - Modify post excerpt before output
- `sanitize_file_name` - Modify uploaded file names
- `attachment_metadata` - Modify attachment metadata

### 3. Adding Admin Pages

```javascript
await addMenuPage({
  slug: 'my-plugin',
  page_title: 'My Plugin',
  menu_title: 'My Plugin',
  icon: '<svg>...</svg>',
  position: 25,
  capabilities: { manage_options: 'manage_options' },
  callback: async () => {
    return `<div>Your HTML or Vue component here</div>`
  }
})
```

### 4. Adding Submenu Pages

```javascript
await addSubMenuPage({
  parent_slug: 'my-plugin',
  slug: 'my-plugin-settings',
  page_title: 'Plugin Settings',
  menu_title: 'Settings',
  capabilities: { manage_options: 'manage_options' },
  callback: async () => {
    return `<div>Settings page</div>`
  }
})
```

### 5. Registering Custom Post Types

```javascript
await registerPostType({
  slug: 'products',
  name_singular: 'Product',
  name_plural: 'Products',
  show_in_menu: true,
  capabilities: {
    edit_post: 'edit_product',
    delete_post: 'delete_product'
  }
})
```

### 6. Registering Custom Taxonomies

```javascript
await registerTaxonomy({
  slug: 'product-categories',
  post_types: ['products'],
  name_singular: 'Product Category',
  name_plural: 'Product Categories',
  hierarchical: true
})
```

## Activating Plugins

1. **Via Admin Interface:**
   - Upload your plugin ZIP file through the Plugins page
   - Click "Activate" on the plugin card

2. **Manually:**
   - Place your plugin folder in `hd-content/plugins/`
   - Add the folder name to the `active_plugins` option in the database:
     ```sql
     UPDATE hd_options
     SET value = '["plugin-folder-name"]'
     WHERE name = 'active_plugins';
     ```

## Plugin Lifecycle

1. **Loading:** Plugins are loaded on every request during the registry initialization phase
2. **Initialization:** The `init()` method is called for each active plugin
3. **Hooks:** Plugins register their hooks and functionality
4. **Execution:** Hooks fire at appropriate times during request processing

## Best Practices

1. **Error Handling:** Wrap your code in try-catch blocks
2. **Performance:** Keep initialization lightweight
3. **Dependencies:** Document any required packages
4. **Capabilities:** Use proper capability checks for admin pages
5. **Namespacing:** Prefix your hooks/actions to avoid conflicts

## Example Plugin

TODO

demonstrating:
- Custom admin pages
- Action hooks
- Filter hooks
- Content modification

## Packaging for Distribution

To create a distributable plugin ZIP:

```bash
cd hd-content/plugins/my-plugin
zip -r my-plugin.zip . -x "*.git*" -x "*node_modules*"
```

The ZIP file should have this structure:
```
my-plugin.zip
└── my-plugin/
    └── index.mjs
```

## Troubleshooting

- **Plugin not appearing:** Check that `index.mjs` exists in the plugin folder
- **Plugin not loading:** Check server logs for JavaScript errors
- **Hooks not firing:** Verify the plugin is activated in the database
- **Permission denied:** Check file permissions on the plugin folder
