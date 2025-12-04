# Persistence Configuration for Themes and Plugins

When upgrading or downgrading themes and plugins, you may want to preserve certain files and directories that contain user data, custom configurations, or generated content. The persistence configuration allows you to specify which files and directories should be preserved during version changes.

## Configuration File

Create a `config.mjs` file in the root of your theme or plugin directory that exports a default object with the following properties:

### Properties

- **`persistent_directories`** (Array): An array of directory paths (relative to theme/plugin root) that should be preserved during upgrades/downgrades.
- **`persistent_files`** (Array): An array of file paths (relative to theme/plugin root) that should be preserved during upgrades/downgrades.

## Example: Theme with Persistent Data

```javascript
// config.mjs in theme root
export default {
  persistent_directories: [
    'data',              // User-generated data
    'workdir',           // Git working directory
    'uploads',           // User uploads
    'custom-configs'     // Custom configuration files
  ],
  persistent_files: [
    'settings.json',     // Theme settings
    '.env.local',        // Local environment variables
    'custom-routes.mjs'  // Custom routes file
  ]
}
```

## Example: Plugin with Database and Config

```javascript
// config.mjs in plugin root
export default {
  persistent_directories: [
    'storage',           // Plugin storage directory
    'cache',             // Cache directory
    'user-data'          // User-generated content
  ],
  persistent_files: [
    'config.json',       // Plugin configuration
    'database.sqlite',   // SQLite database
    '.credentials'       // API credentials
  ]
}
```

## How It Works

1. **Before Upgrade/Downgrade**: The system reads your `config.mjs` and backs up all specified files and directories to a temporary location.

2. **During Upgrade/Downgrade**: The old version is removed and the new version is installed.

3. **After Upgrade/Downgrade**: All backed-up files and directories are restored to the new version.

4. **Cleanup**: The temporary backup is removed.

## Example Use Cases

### Theme with Git-based Development
```javascript
export default {
  persistent_directories: [
    'workdir',           // Preserve git working directory
    'workdir/.git',      // Preserve git history
    'node_modules'       // Preserve installed dependencies
  ],
  persistent_files: []
}
```

### Plugin with User Settings
```javascript
export default {
  persistent_directories: [
    'user-uploads',
    'sessions'
  ],
  persistent_files: [
    'settings.json',
    'api-keys.json',
    'custom-config.mjs'
  ]
}
```

### E-commerce Theme with Product Data
```javascript
export default {
  persistent_directories: [
    'products',          // Product images and data
    'orders',            // Order information
    'customer-uploads'   // Customer uploaded files
  ],
  persistent_files: [
    'store-config.json',
    'payment-settings.json'
  ]
}
```

## Important Notes

- Paths are **relative** to the theme/plugin root directory
- If a file or directory doesn't exist during backup, it will be skipped silently
- If the `config.mjs` file doesn't exist, no files/directories will be persisted
- The backup is cleaned up automatically after restoration
- Invalid paths or configuration errors are logged but won't prevent the upgrade/downgrade

## Best Practices

1. **Only persist user-generated content** - Don't persist code files that should be updated
2. **Be specific with paths** - Use exact paths rather than wildcards
3. **Test your configuration** - Try upgrading/downgrading in a development environment first
4. **Document your persistence config** - Add comments explaining why each path is persisted
5. **Keep it minimal** - Only persist what's necessary to avoid bloat

## Logging

The persistence system logs backup and restore operations:

```
[ThemesController] Backed up 2 persistent files and 1 persistent directories
[ThemesController] Restored 2 persistent files and 1 persistent directories
```
