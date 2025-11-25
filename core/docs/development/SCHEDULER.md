# Scheduler Integration Guide for Plugins & Themes

## Overview

The HTMLDrop scheduler provides automatic lifecycle management for scheduled tasks. When your plugin or theme registers scheduled tasks, they are automatically torn down when deactivated or uninstalled.

## How It Works

### 1. Automatic Owner Tracking

The scheduler tracks which plugin or theme registered each task using an "owner" property. This is set **automatically and immutably** by the plugin/theme lifecycle system. Once a task is registered, its owner cannot be changed, preventing plugins from accidentally or maliciously overriding ownership.

### 2. Task Registration in Plugins

```javascript
// In your plugin's index.mjs
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context

  // The scheduler automatically knows this task belongs to your plugin
  // No manual cleanup needed!
  scheduler
    .call(async () => {
      console.log('Running my plugin task')
      // Your task logic here
    }, 'my_plugin_daily_sync')
    .dailyAt('03:00')

  // Another example: periodic cleanup
  scheduler
    .call(async () => {
      // Clean up old data
    }, 'my_plugin_cleanup')
    .everyFiveMinutes()
}
```

### 3. Task Registration in Themes

```javascript
// In your theme's index.mjs
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context

  // Schedule a task for your theme
  scheduler
    .call(async () => {
      console.log('Running theme maintenance')
    }, 'my_theme_maintenance')
    .weekly()
}
```

### 4. Automatic Teardown

When your plugin/theme is deactivated or uninstalled, **all scheduled tasks are automatically stopped and removed**. No manual cleanup code needed!

## Lifecycle Integration

### Plugin Lifecycle Hooks

The scheduler integrates with your plugin lifecycle:

```javascript
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context

  return {
    async init() {
      // Register your scheduled tasks here
      scheduler
        .call(async () => {
          // Task logic
        }, 'my_task')
        .hourly()
    },

    async onDeactivate() {
      // Tasks are automatically torn down - no manual cleanup needed!
      // But you can still run custom cleanup if needed:
      console.log('Plugin deactivated')
    },

    async onUninstall() {
      // Tasks already cleaned up automatically
      // Clean up other resources here (database tables, files, etc.)
    }
  }
}
```

### Theme Lifecycle Hooks

Same pattern for themes:

```javascript
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context

  return {
    async init() {
      scheduler
        .call(async () => {
          // Theme task
        }, 'theme_task')
        .daily()
    },

    async onDeactivate() {
      // Tasks automatically torn down
    }
  }
}
```

## Advanced Usage

### Checking Your Tasks

You can query which tasks are registered for your plugin/theme:

```javascript
const myTasks = scheduler.getTasksByOwner('my-plugin-slug')
console.log(`My plugin has ${myTasks.length} scheduled tasks:`, myTasks)
```

### Manual Teardown (Rare)

In rare cases, you might want to manually tear down tasks:

```javascript
// Remove all tasks for a specific plugin/theme
await scheduler.teardownTasksByOwner('my-plugin-slug')
```

## Best Practices

### 1. Use Descriptive Task Names

```javascript
// Good: Clear, namespaced task names
scheduler.call(async () => { /* ... */ }, 'email_plugin_send_digest').daily()
scheduler.call(async () => { /* ... */ }, 'backup_plugin_cleanup_old').weekly()

// Bad: Generic names that might conflict
scheduler.call(async () => { /* ... */ }, 'daily_task').daily()
scheduler.call(async () => { /* ... */ }, 'cleanup').weekly()
```

### 2. Avoid Heavy Operations

```javascript
// Good: Efficient, targeted operations
scheduler.call(async () => {
  const { knex, table } = req.context
  await knex(table('logs'))
    .where('created_at', '<', knex.raw('NOW() - INTERVAL 30 DAY'))
    .delete()
}, 'cleanup_old_logs').daily()

// Bad: Heavy operations that might timeout
scheduler.call(async () => {
  // Avoid: Processing millions of records
  // Avoid: Long-running API calls without timeouts
}, 'heavy_task').hourly()
```

### 3. Handle Errors Gracefully

```javascript
scheduler.call(async () => {
  try {
    await myApiCall()
  } catch (error) {
    console.error('Task failed:', error)
    // Don't throw - let the scheduler continue
  }
}, 'api_sync').everyFiveMinutes()
```

### 4. Use Appropriate Intervals

```javascript
// Good: Reasonable intervals for the task
scheduler.call(async () => {
  // Check for new content
}, 'content_check').everyFiveMinutes()

// Bad: Too frequent for the operation
scheduler.call(async () => {
  // Heavy data export
}, 'export_data').everyMinute() // ❌ Too frequent!
```

## How Lifecycle Works Behind the Scenes

### 1. Plugin/Theme Activation

```javascript
// When your plugin loads, the system automatically:
scheduler._setOwner('your-plugin-slug')  // INTERNAL - called by lifecycle system

// Then your plugin's init() runs and registers tasks
// All tasks registered now have owner = 'your-plugin-slug' (immutable)

// After init() completes:
scheduler._clearOwner()  // INTERNAL - called by lifecycle system
```

**Note:** The `_setOwner()` and `_clearOwner()` methods are internal and should never be called directly from plugins/themes. They are managed automatically by the lifecycle system.

### 2. Plugin/Theme Deactivation

```javascript
// When your plugin is deactivated, the system automatically:
await scheduler.teardownTasksByOwner('your-plugin-slug')

// This:
// 1. Stops all running cron jobs for your plugin
// 2. Removes tasks from the tasks array
// 3. Cleans up database records
```

### 3. Cross-Worker Synchronization

All workers register tasks, but only worker 1 executes them. Task metadata is stored in the database so all workers know which tasks exist.

## Migration from Manual Cleanup

If you previously had manual cleanup code, you can remove it:

### Before (Manual Cleanup - Not Needed!)

```javascript
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context
  let myTask = null

  return {
    async init() {
      myTask = scheduler.call(async () => {
        // Task logic
      }, 'my_task').daily()
    },

    async onDeactivate() {
      // ❌ This is not needed anymore!
      if (myTask) {
        myTask.stop()
      }
    }
  }
}
```

### After (Automatic Cleanup)

```javascript
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context

  return {
    async init() {
      // Just register - cleanup is automatic!
      scheduler
        .call(async () => {
          // Task logic
        }, 'my_task')
        .daily()
    }

    // onDeactivate not needed for scheduler cleanup!
  }
}
```

## Troubleshooting

### My tasks aren't being torn down

- Check that your plugin/theme slug matches what you expect
- Verify the scheduler._setOwner() is called by the lifecycle system during plugin initialization
- Check logs for "[Scheduler] Tearing down X task(s) for owner: your-slug"

### Tasks are being torn down unexpectedly

- Ensure you're not calling teardownTasksByOwner() manually
- Check if another plugin might be interfering
- Verify your plugin lifecycle hooks are implemented correctly

### Task ownership is null

- This means the task was registered outside of plugin/theme initialization
- Core system tasks (like badge count refresh) have null ownership and are never torn down
- Only register tasks during your plugin's init() phase

## Examples

### Example 1: Email Digest Plugin

```javascript
export default async ({ req, res, next, router }) => {
  const { scheduler, knex, table } = req.context

  return {
    async init() {
      // Send daily email digest
      scheduler
        .call(async () => {
          const users = await knex(table('users'))
            .where('email_digest_enabled', true)

          for (const user of users) {
            await sendDigestEmail(user)
          }
        }, 'email_digest_daily')
        .dailyAt('08:00')
    }
  }
}
```

### Example 2: Backup Plugin

```javascript
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context

  return {
    async init() {
      // Daily database backup
      scheduler
        .call(async () => {
          await createDatabaseBackup()
        }, 'backup_database')
        .dailyAt('02:00')

      // Weekly cleanup of old backups
      scheduler
        .call(async () => {
          await cleanupOldBackups()
        }, 'backup_cleanup')
        .weekly()
    }
  }
}
```

### Example 3: Analytics Theme

```javascript
export default async ({ req, res, next, router }) => {
  const { scheduler } = req.context

  return {
    async init() {
      // Hourly analytics aggregation
      scheduler
        .call(async () => {
          await aggregateAnalytics()
        }, 'analytics_aggregate')
        .hourly()
    }
  }
}
```
