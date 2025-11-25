# Creating and Publishing HTMLDrop Plugins to NPM

This guide explains how to create a HTMLDrop plugin and publish it to NPM so it appears in the HTMLDrop installer.

## Plugin Structure

A HTMLDrop plugin must have this structure:

```
your-plugin/
├── index.mjs          # Required: Plugin entry point
├── package.json       # Required: NPM package metadata
├── README.md          # Recommended: Plugin documentation
└── .hd/               # Optional: Assets
    └── thumbnail.png  # Optional: 200x150px plugin thumbnail
```

## Step 1: Create Your Plugin

### 1.1 Create Plugin Directory

```bash
mkdir my-htmldrop-plugin
cd my-htmldrop-plugin
```

### 1.2 Create package.json

**CRITICAL**: Your `package.json` MUST include the `hd-plugin` keyword!

```json
{
  "name": "@your-org/my-plugin",
  "version": "1.0.0",
  "description": "A description of what your plugin does",
  "main": "index.mjs",
  "type": "module",
  "keywords": ["hd-plugin", "htmldrop", "cms"],
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/my-plugin"
  },
  "bugs": {
    "url": "https://github.com/your-org/my-plugin/issues"
  },
  "homepage": "https://github.com/your-org/my-plugin#readme"
}
```

**Important fields:**
- `keywords`: **MUST include `"hd-plugin"`** - this is how the installer finds your plugin
- `name`: Can be scoped (`@org/name`) or unscoped (`name`)
- `main`: Should point to `index.mjs`
- `type`: Should be `"module"` for ES modules

### 1.3 Create index.mjs

```javascript
/**
 * My HTMLDrop Plugin
 *
 * Description of what your plugin does
 */

export default async ({ req, res, next }) => {
  return {
    async init() {
      const { addAction, addFilter, addMenuPage, addSubMenuPage } = req.hooks

      // Add a custom admin menu page
      await addMenuPage({
        slug: 'my-plugin',
        page_title: 'My Plugin',
        menu_title: 'My Plugin',
        icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/></svg>',
        position: 25,
        capabilities: { manage_options: 'manage_options' },
        callback: async () => {
          // Return Vue 3 component as string
          return `
            export default {
              template: \`
                <div style="padding: 20px">
                  <h1>My Plugin</h1>
                  <p>Welcome to my plugin!</p>
                </div>
              \`
            }
          `
        }
      })

      // Hook into actions
      addAction('save_post', ({ req, res, next, postType, post }) => {
        console.log('[My Plugin] Post saved:', post.title)
      })

      // Add filters
      addFilter('the_content', (content, post) => {
        // Modify content if needed
        return content
      })

      console.log('[My Plugin] Successfully loaded!')
    }
  }
}
```

### 1.4 Create README.md

```markdown
# My HTMLDrop Plugin

Short description of your plugin.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

Install via HTMLDrop admin:
1. Go to Plugins → Install Plugins
2. Search for "my-plugin"
3. Click Install
4. Activate the plugin

## Usage

How to use your plugin...

## License

MIT
```

### 1.5 Add Thumbnail (Optional)

Create `.hd/thumbnail.png` - a 200x150px image:

```bash
mkdir .hd
# Add your 200x150px PNG image here
```

This will be displayed in the plugin installer grid.

## Step 2: Test Your Plugin Locally

Before publishing, test your plugin:

```bash
# Copy to HTMLDrop plugins directory
cp -r . /path/to/htmldrop/content/plugins/my-plugin

# Restart HTMLDrop
# Activate the plugin from the admin panel
```

## Step 3: Publish to NPM

### 3.1 Create NPM Account

If you don't have an NPM account:
1. Go to https://www.npmjs.com/signup
2. Create your account
3. Verify your email

### 3.2 Login to NPM

```bash
npm login
```

Enter your NPM credentials.

### 3.3 Publish Your Plugin

```bash
# Make sure you're in your plugin directory
cd my-htmldrop-plugin

# Publish to NPM
npm publish --access public
```

**For scoped packages** (like `@your-org/plugin`):
```bash
npm publish --access public
```

**For unscoped packages** (like `plugin-name`):
```bash
npm publish
```

## Step 4: Verify Your Plugin

### 4.1 Check NPM

Visit: `https://www.npmjs.com/package/your-plugin-name`

Verify:
- ✅ Package is published
- ✅ Keywords include `hd-plugin`
- ✅ README displays correctly

### 4.2 Test in HTMLDrop

1. Go to **Plugins → Install Plugins**
2. Search for your plugin name
3. Your plugin should appear in the grid
4. Click **Install**
5. Go to **Plugins → Installed Plugins**
6. Click **Activate**

## Available Hooks API

### Actions (Fire and Forget)

```javascript
addAction('hookName', callback, priority)
```

Available action hooks:
- `init` - After registries load
- `create_post` - When post is created
- `save_post` - When post is saved
- `delete_post` - When post is deleted
- `pre_upload` - Before file upload
- `after_upload` - After file upload

### Filters (Modify Values)

```javascript
addFilter('hookName', callback, priority)
```

Available filter hooks:
- `the_content` - Modify post content
- `the_title` - Modify post title
- `the_excerpt` - Modify post excerpt
- `sanitize_file_name` - Modify uploaded file names
- `attachment_metadata` - Modify attachment metadata

### Admin Pages

```javascript
await addMenuPage({
  slug: 'my-page',
  page_title: 'My Page',
  menu_title: 'My Menu',
  icon: '<svg>...</svg>',
  position: 25,
  capabilities: { manage_options: 'manage_options' },
  callback: async () => {
    return `Vue component as string`
  }
})
```

### Submenu Pages

```javascript
await addSubMenuPage({
  parent_slug: 'my-page',
  slug: 'my-subpage',
  page_title: 'My Subpage',
  menu_title: 'Submenu',
  capabilities: { manage_options: 'manage_options' },
  callback: async () => {
    return `Vue component as string`
  }
})
```

## Publishing Updates

When you make changes to your plugin:

```bash
# Update version in package.json
# Then publish
npm version patch  # 1.0.0 → 1.0.1
# or
npm version minor  # 1.0.0 → 1.1.0
# or
npm version major  # 1.0.0 → 2.0.0

npm publish
```

## Best Practices

1. **Always include `hd-plugin` keyword** in package.json
2. **Use semantic versioning** (major.minor.patch)
3. **Write clear documentation** in README
4. **Test locally first** before publishing
5. **Add a thumbnail** for better discoverability
6. **Use scoped packages** (@org/name) to avoid naming conflicts
7. **Include error handling** in your hooks
8. **Follow HTMLDrop's naming conventions**
9. **Document required capabilities**
10. **Keep your plugin lightweight**

## Troubleshooting

### Plugin doesn't appear in installer

- ✅ Check package.json has `"hd-plugin"` in keywords
- ✅ Wait 5-10 minutes for NPM to index
- ✅ Verify package is public: `npm publish --access public`
- ✅ Check NPM search: https://www.npmjs.com/search?q=keywords:hd-plugin

### Plugin won't install

- ✅ Ensure `index.mjs` exists in package root
- ✅ Check Node.js version compatibility
- ✅ Verify export format matches examples

### Thumbnail doesn't show

- ✅ Create `.hd/thumbnail.png` (200x150px)
- ✅ Publish updated package
- ✅ Wait for jsDelivr CDN to update (few minutes)

## Example Plugins

Check out these example plugins for reference:
- [@htmldrop/hello-world](https://www.npmjs.com/package/@htmldrop/hello-world)
- See `content/plugins/hello-world/` in HTMLDrop repository

## Support

For help with plugin development:
- GitHub Issues: https://github.com/your-repo/htmldrop/issues
- Documentation: See README.md in plugins folder

---

Happy plugin building! 🚀
