# Plugin Migrations Guide

Complete guide for using database migrations in HTMLDrop plugins.

## Table of Contents

- [Overview](#overview)
- [Creating Migrations](#creating-migrations)
- [Migration Structure](#migration-structure)
- [Running Migrations](#running-migrations)
- [Migration Lifecycle](#migration-lifecycle)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [CLI Commands](#cli-commands)
- [Troubleshooting](#troubleshooting)

---

## Overview

HTMLDrop plugins can define their own database migrations using Knex.js. Migrations are automatically run during plugin lifecycle events:

- **Install**: Run all pending migrations
- **Upgrade**: Run new migrations added in the new version
- **Uninstall**: Rollback all migrations (remove plugin tables)

### Features

- **Automatic Execution**: Migrations run automatically during plugin lifecycle
- **Transaction Support**: All migrations run in transactions
- **Rollback Support**: Failed migrations are automatically rolled back
- **Version Tracking**: Migration history tracked in database
- **Batch Support**: Migrations grouped in batches for rollback
- **Backup & Restore**: Automatic backup before upgrades

---

## Creating Migrations

### Directory Structure

Create a `migrations` folder in your plugin directory:

```
content/plugins/my-plugin/
├── index.mjs
├── package.json
└── migrations/
    ├── 20250112120000_create_products_table.mjs
    ├── 20250112130000_create_categories_table.mjs
    └── 20250112140000_add_featured_column.mjs
```

### Naming Convention

Migration files must follow this naming pattern:

```
{timestamp}_{description}.mjs
```

Example:
```
20250112120000_create_products_table.mjs
```

- **Timestamp**: `YYYYMMDDHHMMSS` format
- **Description**: Snake_case description
- **Extension**: `.mjs` (ES modules)

### Creating Migration Files

You can create migration files manually or use the migration service:

```javascript
import PluginMigrationService from './services/PluginMigrationService.mjs'

const migrationService = new PluginMigrationService(context)

// Create a new migration file
const filepath = await migrationService.createMigrationFile(
  'my-plugin',
  'create_products_table'
)
```

This generates:
```
20250112120000_create_products_table.mjs
```

---

## Migration Structure

Each migration file exports two functions: `up` and `down`.

### Basic Template

```javascript
/**
 * Migration: create_products_table
 * Plugin: my-plugin
 * Created: 2025-01-12T12:00:00.000Z
 */

/**
 * Run the migration
 * @param {import('knex').Knex} knex - Knex instance
 * @param {Object} context - HTMLDrop context
 * @returns {Promise<void>}
 */
export async function up(knex, context) {
  const tableName = context.table('my_plugin_products')

  await knex.schema.createTable(tableName, (table) => {
    table.increments('id').primary()
    table.string('name', 255).notNullable()
    table.text('description')
    table.decimal('price', 10, 2).notNullable()
    table.integer('category_id').unsigned()
    table.timestamps(true, true)

    table.foreign('category_id')
      .references('id')
      .inTable(context.table('my_plugin_categories'))
      .onDelete('SET NULL')
  })

  console.log(`Created table: ${tableName}`)
}

/**
 * Reverse the migration
 * @param {import('knex').Knex} knex - Knex instance
 * @param {Object} context - HTMLDrop context
 * @returns {Promise<void>}
 */
export async function down(knex, context) {
  const tableName = context.table('my_plugin_products')

  await knex.schema.dropTableIfExists(tableName)

  console.log(`Dropped table: ${tableName}`)
}
```

### Key Points

1. **Always use `context.table()`** to get the prefixed table name:
   ```javascript
   const tableName = context.table('my_plugin_products')
   // Result: 'hd_my_plugin_products' (with prefix)
   ```

2. **Use descriptive names** for plugin tables:
   ```javascript
   // Good
   context.table('my_plugin_products')
   context.table('my_plugin_orders')

   // Bad (conflicts with core tables)
   context.table('products')
   context.table('posts')
   ```

3. **Make migrations reversible** - Always implement `down()`:
   ```javascript
   export async function down(knex, context) {
     // Reverse everything done in up()
   }
   ```

---

## Running Migrations

### Automatic Execution

Migrations run automatically during plugin lifecycle:

```javascript
// Install plugin - runs all migrations
await pluginLifecycleService.onInstall('my-plugin')

// Upgrade plugin - runs new migrations only
await pluginLifecycleService.onUpgrade('my-plugin', '1.0.0', '2.0.0')

// Uninstall plugin - rolls back all migrations
await pluginLifecycleService.onUninstall('my-plugin')
```

### Manual Execution

You can also run migrations manually:

```javascript
import PluginMigrationService from './services/PluginMigrationService.mjs'

const migrationService = new PluginMigrationService(context)

// Run all pending migrations
const result = await migrationService.runPluginMigrations('my-plugin')
console.log(`Ran ${result.count} migrations`)

// Rollback last batch
const rollback = await migrationService.rollbackPluginMigrations('my-plugin')
console.log(`Rolled back ${rollback.count} migrations`)

// Check migration status
const status = await migrationService.getPluginMigrationStatus('my-plugin')
console.log(`Completed: ${status.completed}/${status.total}`)

// Reset all migrations (dangerous!)
await migrationService.resetPluginMigrations('my-plugin')
```

---

## Migration Lifecycle

### 1. Plugin Install

When a plugin is installed:

```
onInstall()
  ├─ Check for migrations directory
  ├─ Run all pending migrations (in transaction)
  ├─ Record migrations in plugin_migrations table
  └─ Call plugin's onInstall() hook
```

### 2. Plugin Upgrade

When a plugin is upgraded:

```
onUpgrade()
  ├─ Create backup of plugin files
  ├─ Check for new migrations
  ├─ Run pending migrations (in transaction)
  │  └─ On failure: restore from backup
  ├─ Call plugin's onUpgrade() hook
  └─ Cleanup old backups
```

### 3. Plugin Uninstall

When a plugin is uninstalled:

```
onUninstall()
  ├─ Call plugin's onUninstall() hook
  ├─ Rollback all migrations (in reverse order)
  ├─ Remove migration records
  └─ Remove plugin state
```

---

## Best Practices

### 1. Use Transactions

Migrations automatically run in transactions, but you can use nested transactions:

```javascript
export async function up(knex, context) {
  await knex.transaction(async (trx) => {
    // Multiple operations in same transaction
    await trx(context.table('my_plugin_products')).insert({ ... })
    await trx(context.table('my_plugin_categories')).insert({ ... })
  })
}
```

### 2. Handle Data Migration

When modifying columns, migrate existing data:

```javascript
export async function up(knex, context) {
  const tableName = context.table('my_plugin_products')

  // Add new column
  await knex.schema.table(tableName, (table) => {
    table.string('sku', 50).nullable()
  })

  // Migrate existing data
  const products = await knex(tableName).select('id', 'name')
  for (const product of products) {
    await knex(tableName)
      .where({ id: product.id })
      .update({ sku: `SKU-${product.id}` })
  }

  // Make column required
  await knex.schema.alterTable(tableName, (table) => {
    table.string('sku', 50).notNullable().alter()
  })
}
```

### 3. Use Foreign Keys Properly

```javascript
export async function up(knex, context) {
  await knex.schema.createTable(context.table('my_plugin_orders'), (table) => {
    table.increments('id').primary()
    table.integer('product_id').unsigned().notNullable()
    table.integer('user_id').unsigned().notNullable()

    // Foreign key to plugin table
    table.foreign('product_id')
      .references('id')
      .inTable(context.table('my_plugin_products'))
      .onDelete('CASCADE')

    // Foreign key to core table
    table.foreign('user_id')
      .references('id')
      .inTable(context.table('users'))
      .onDelete('CASCADE')
  })
}
```

### 4. Add Indexes

```javascript
export async function up(knex, context) {
  const tableName = context.table('my_plugin_products')

  await knex.schema.createTable(tableName, (table) => {
    table.increments('id').primary()
    table.string('name', 255).notNullable()
    table.string('sku', 50).notNullable()
    table.decimal('price', 10, 2).notNullable()
    table.timestamps(true, true)

    // Add indexes for commonly queried columns
    table.index(['sku'])
    table.index(['price'])
    table.index(['created_at'])
  })
}
```

### 5. Handle Rollback Gracefully

```javascript
export async function down(knex, context) {
  const tableName = context.table('my_plugin_products')

  // Check if table exists before dropping
  const exists = await knex.schema.hasTable(tableName)

  if (exists) {
    await knex.schema.dropTable(tableName)
    console.log(`Dropped table: ${tableName}`)
  } else {
    console.log(`Table does not exist: ${tableName}`)
  }
}
```

### 6. Version-Specific Migrations

Group migrations by version in your plugin's `onUpgrade` hook:

```javascript
export default async ({ req, res, next, router }) => {
  return {
    async onUpgrade({ oldVersion, newVersion }) {
      // Version 1.0.0 -> 2.0.0 specific logic
      if (oldVersion === '1.0.0' && newVersion === '2.0.0') {
        console.log('Running v2.0.0 upgrade logic...')
        // Migrations will run automatically
      }

      // Version 2.0.0 -> 3.0.0 specific logic
      if (oldVersion === '2.0.0' && newVersion === '3.0.0') {
        console.log('Running v3.0.0 upgrade logic...')
      }
    }
  }
}
```

---

## Examples

### Example 1: E-commerce Plugin

Create product and category tables:

**migrations/20250112120000_create_categories_table.mjs**
```javascript
export async function up(knex, context) {
  const tableName = context.table('shop_categories')

  await knex.schema.createTable(tableName, (table) => {
    table.increments('id').primary()
    table.string('name', 255).notNullable()
    table.string('slug', 255).notNullable().unique()
    table.text('description')
    table.integer('parent_id').unsigned()
    table.integer('sort_order').defaultTo(0)
    table.timestamps(true, true)

    table.index(['slug'])
    table.index(['parent_id'])
  })
}

export async function down(knex, context) {
  await knex.schema.dropTableIfExists(context.table('shop_categories'))
}
```

**migrations/20250112130000_create_products_table.mjs**
```javascript
export async function up(knex, context) {
  const tableName = context.table('shop_products')

  await knex.schema.createTable(tableName, (table) => {
    table.increments('id').primary()
    table.string('name', 255).notNullable()
    table.string('sku', 50).notNullable().unique()
    table.text('description')
    table.decimal('price', 10, 2).notNullable()
    table.decimal('sale_price', 10, 2)
    table.integer('stock').defaultTo(0)
    table.integer('category_id').unsigned()
    table.boolean('featured').defaultTo(false)
    table.string('status', 50).defaultTo('draft')
    table.timestamps(true, true)

    table.foreign('category_id')
      .references('id')
      .inTable(context.table('shop_categories'))
      .onDelete('SET NULL')

    table.index(['sku'])
    table.index(['category_id'])
    table.index(['featured'])
    table.index(['status'])
  })
}

export async function down(knex, context) {
  await knex.schema.dropTableIfExists(context.table('shop_products'))
}
```

### Example 2: Add Column Migration

Add a featured image column to products:

**migrations/20250112140000_add_featured_image.mjs**
```javascript
export async function up(knex, context) {
  const tableName = context.table('shop_products')

  await knex.schema.table(tableName, (table) => {
    table.string('featured_image', 500).after('description')
  })
}

export async function down(knex, context) {
  const tableName = context.table('shop_products')

  await knex.schema.table(tableName, (table) => {
    table.dropColumn('featured_image')
  })
}
```

### Example 3: Seed Data Migration

Insert default categories:

**migrations/20250112150000_seed_default_categories.mjs**
```javascript
export async function up(knex, context) {
  const tableName = context.table('shop_categories')

  await knex(tableName).insert([
    { name: 'Electronics', slug: 'electronics', sort_order: 1 },
    { name: 'Clothing', slug: 'clothing', sort_order: 2 },
    { name: 'Books', slug: 'books', sort_order: 3 }
  ])
}

export async function down(knex, context) {
  const tableName = context.table('shop_categories')

  await knex(tableName)
    .whereIn('slug', ['electronics', 'clothing', 'books'])
    .del()
}
```

---

## CLI Commands

While there's no dedicated CLI for plugin migrations yet, you can create utility scripts:

**scripts/plugin-migrate.mjs**
```javascript
import { createContext } from '../core/core/Context.mjs'
import PluginMigrationService from '../core/services/PluginMigrationService.mjs'

const context = await createContext()
const migrationService = new PluginMigrationService(context)

const [,, command, pluginSlug, ...args] = process.argv

switch (command) {
  case 'status':
    const status = await migrationService.getPluginMigrationStatus(pluginSlug)
    console.log(status)
    break

  case 'run':
    const result = await migrationService.runPluginMigrations(pluginSlug)
    console.log(`Ran ${result.count} migrations`)
    break

  case 'rollback':
    const rollback = await migrationService.rollbackPluginMigrations(pluginSlug)
    console.log(`Rolled back ${rollback.count} migrations`)
    break

  case 'create':
    const [migrationName] = args
    const filepath = await migrationService.createMigrationFile(pluginSlug, migrationName)
    console.log(`Created: ${filepath}`)
    break

  default:
    console.log('Usage: node scripts/plugin-migrate.mjs [status|run|rollback|create] <plugin-slug> [migration-name]')
}

process.exit(0)
```

Usage:
```bash
# Check migration status
node scripts/plugin-migrate.mjs status my-plugin

# Run pending migrations
node scripts/plugin-migrate.mjs run my-plugin

# Rollback last batch
node scripts/plugin-migrate.mjs rollback my-plugin

# Create new migration
node scripts/plugin-migrate.mjs create my-plugin create_orders_table
```

---

## Troubleshooting

### Migration Failed During Install

**Problem**: Migration fails, plugin is not installed

**Solution**:
1. Check migration syntax
2. Verify table names are correct (use `context.table()`)
3. Check for foreign key conflicts
4. Look at error logs

```javascript
// View migration status
const status = await migrationService.getPluginMigrationStatus('my-plugin')
console.log(status)
```

### Migration Failed During Upgrade

**Problem**: Migration fails during upgrade, plugin is restored from backup

**Solution**:
1. Check the error message
2. Verify new migrations are valid
3. Test migrations in development first
4. Use data migration best practices

The plugin is automatically restored from backup on failure.

### Rollback Not Working

**Problem**: `down()` function fails during uninstall

**Solution**:
1. Ensure `down()` is implemented for all migrations
2. Check for foreign key constraints
3. Use `dropTableIfExists` instead of `dropTable`

```javascript
export async function down(knex, context) {
  // Good - won't fail if table doesn't exist
  await knex.schema.dropTableIfExists(context.table('my_table'))

  // Bad - fails if table doesn't exist
  await knex.schema.dropTable(context.table('my_table'))
}
```

### Foreign Key Conflicts

**Problem**: Cannot drop table due to foreign key constraints

**Solution**: Drop dependent tables first (order matters)

```javascript
export async function down(knex, context) {
  // Drop tables in correct order
  await knex.schema.dropTableIfExists(context.table('shop_orders'))
  await knex.schema.dropTableIfExists(context.table('shop_products'))
  await knex.schema.dropTableIfExists(context.table('shop_categories'))
}
```

Or disable foreign key checks temporarily:

```javascript
export async function down(knex, context) {
  // Disable FK checks
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0')

  await knex.schema.dropTableIfExists(context.table('shop_orders'))
  await knex.schema.dropTableIfExists(context.table('shop_products'))

  // Re-enable FK checks
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1')
}
```

### Migrations Not Running

**Problem**: Migrations exist but don't run during install

**Solution**:
1. Check directory name is exactly `migrations`
2. Verify files end with `.mjs` or `.js`
3. Check file naming convention: `{timestamp}_{name}.mjs`
4. Ensure plugin lifecycle service is used

### Multiple Database Support

**Problem**: Different databases (SQLite, MySQL, PostgreSQL) have different syntax

**Solution**: Use Knex abstractions or conditional logic

```javascript
export async function up(knex, context) {
  const tableName = context.table('my_plugin_products')
  const dbType = knex.client.config.client

  if (dbType === 'mysql2') {
    // MySQL-specific
    await knex.raw(`ALTER TABLE ${tableName} ADD FULLTEXT INDEX (name, description)`)
  } else if (dbType === 'pg') {
    // PostgreSQL-specific
    await knex.raw(`CREATE INDEX ON ${tableName} USING GIN(to_tsvector('english', name || ' ' || description))`)
  }

  // SQLite doesn't support fulltext out of the box
}
```

---

## Related Documentation

- [Plugin Development Guide](../plugins/README.md)
- [Plugin Lifecycle Hooks](../hooks/README.md)
- [Database Schema](../architecture/README.md#database-schema)
- [Knex.js Documentation](http://knexjs.org/)

---

**Last Updated**: 2025-11-12
