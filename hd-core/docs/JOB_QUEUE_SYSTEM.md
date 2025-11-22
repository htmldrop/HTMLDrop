# Job Queue System

The HTMLDrop Job Queue System allows plugins and themes to create background jobs with real-time progress tracking and notifications in the admin UI.

## Overview

The job queue system uses the **native post type system** for job storage - no additional database tables required!

The job queue system consists of:

1. **Post Type** - Jobs stored as posts with `post_type_slug: 'jobs'`
2. **Registry** - `RegisterJobs` class for job management
3. **API Endpoints** - RESTful API for job operations
4. **WebSocket** - Real-time updates via WebSocket
5. **Frontend UI** - Beautiful notification component in admin
6. **Plugin/Theme Integration** - Easy-to-use hooks for creating jobs

## Features

- ✅ **Post Type Integration** - Uses native CMS post system
- ✅ **No Additional Tables** - Leverages existing posts + post_meta
- ✅ **Real-time progress tracking** - Update progress from 0-100%
- ✅ **WebSocket notifications** - Live updates across all browser tabs
- ✅ **Custom SVG icons** - Add branded icons to your jobs
- ✅ **Metadata storage** - Store custom data with jobs
- ✅ **Historical records** - All jobs stored in database
- ✅ **Auto-cleanup** - Remove old completed jobs
- ✅ **Beautiful UI** - Animated notifications in bottom-right corner
- ✅ **Status tracking** - pending, running, completed, failed, cancelled
- ✅ **Error handling** - Capture and display error messages

## Data Structure

Jobs are stored using the existing post type system:

### Post Entry
```
hd_posts:
  id: [auto-increment]
  post_type_slug: 'jobs'
  title: [Job name]
  slug: [UUID job identifier]
  status: 'publish'
  created_at: [timestamp]
  updated_at: [timestamp]
```

### Post Meta Fields
Each job has these meta fields in `hd_post_meta`:
- `job_id` - UUID identifier
- `description` - Job description
- `type` - Job type (import, export, backup, etc.)
- `status` - pending | running | completed | failed | cancelled
- `progress` - 0-100
- `icon_svg` - Custom SVG icon
- `metadata` - JSON metadata object
- `error_message` - Error message if failed
- `result` - Result data if completed
- `source` - Plugin/theme name
- `started_at` - When job started
- `completed_at` - When job completed

## Creating Jobs in Plugins/Themes

### Basic Example

```javascript
export default async function MyPlugin({ req }) {
  const { hooks } = req

  // Create a job
  const job = await hooks.createJob({
    name: 'Import Products',
    description: 'Importing products from external API',
    type: 'import',
    source: 'my-plugin-name',
    metadata: { apiUrl: 'https://api.example.com' }
  })

  // Start the job
  await job.start()

  // Update progress
  await job.updateProgress(50)

  // Complete the job
  await job.complete({ importedCount: 100 })
}
```

### Advanced Example with Custom Icon

```javascript
const job = await hooks.createJob({
  name: 'Backup Database',
  description: 'Creating full database backup',
  type: 'backup',
  source: 'backup-plugin',
  iconSvg: `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  `,
  metadata: {
    backupType: 'full',
    compression: true
  }
})

await job.start()

// Simulate backup process
for (let i = 0; i <= 100; i += 10) {
  await new Promise(resolve => setTimeout(resolve, 500))
  await job.updateProgress(i, {
    currentTable: `table_${i}`,
    bytesProcessed: i * 1024
  })
}

await job.complete({
  backupFile: '/backups/db-2025-11-22.sql.gz',
  fileSize: '125MB'
})
```

### Error Handling

```javascript
try {
  const job = await hooks.createJob({
    name: 'Sync Remote Data',
    type: 'sync',
    source: 'sync-plugin'
  })

  await job.start()

  // Simulate work
  await job.updateProgress(30)

  // Something goes wrong
  throw new Error('API timeout')

} catch (error) {
  await job.fail(error.message)
}
```

## Job Instance Methods

### `job.start()`
Marks the job as running and sets `started_at` timestamp.

```javascript
await job.start()
```

### `job.updateProgress(progress, metadata?)`
Updates job progress (0-100) and optionally merges metadata.

```javascript
await job.updateProgress(75, {
  currentItem: 'item-75',
  itemsProcessed: 75
})
```

### `job.complete(result?)`
Marks job as completed with optional result data.

```javascript
await job.complete({
  processedItems: 100,
  duration: '5m 23s'
})
```

### `job.fail(errorMessage)`
Marks job as failed with error message.

```javascript
await job.fail('Connection to API failed')
```

### `job.cancel()`
Cancels the job.

```javascript
await job.cancel()
```

## API Endpoints

### List Jobs
```http
GET /api/v1/jobs?status=running&type=import&limit=50
```

**Query Parameters:**
- `status` - Filter by status (pending, running, completed, failed)
- `type` - Filter by type
- `source` - Filter by source (plugin/theme name)
- `limit` - Max results (default: 100)
- `offset` - Pagination offset

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "jobId": "uuid-here",
      "name": "Import Products",
      "type": "import",
      "status": "running",
      "progress": 45,
      "createdAt": "2025-11-22 10:30:00"
    }
  ]
}
```

### Get Job
```http
GET /api/v1/jobs/:jobId
```

### Create Job (API)
```http
POST /api/v1/jobs
Content-Type: application/json

{
  "name": "Export Users",
  "type": "export",
  "description": "Exporting all users to CSV",
  "source": "admin-ui"
}
```

### Cleanup Old Jobs
```http
DELETE /api/v1/jobs/cleanup?daysOld=30
```

## WebSocket Events

Jobs automatically broadcast updates via WebSocket:

```javascript
{
  "type": "job_update",
  "job": {
    "jobId": "uuid",
    "name": "Import Products",
    "status": "running",
    "progress": 75,
    // ... other job properties
  }
}
```

## Frontend Integration

The `JobQueue.vue` component is automatically included in the admin UI. It:

- Connects to WebSocket for real-time updates
- Displays jobs in bottom-right corner
- Shows progress bars for running jobs
- Auto-dismisses completed jobs after 5 seconds
- Allows manual dismissal
- Works across all admin pages

## Job Types

Common job types (you can use any string):

- `import` - Data import operations
- `export` - Data export operations
- `backup` - Backup operations
- `migration` - Database migrations
- `sync` - External sync operations
- `process` - General processing tasks
- `cleanup` - Cleanup operations

## Job Statuses

- `pending` - Job created but not started
- `running` - Job is currently executing
- `completed` - Job finished successfully
- `failed` - Job encountered an error
- `cancelled` - Job was cancelled

## Best Practices

### 1. Use Descriptive Names
```javascript
✅ name: 'Import 1,000 Products from Shopify'
❌ name: 'Import'
```

### 2. Provide Context in Metadata
```javascript
await job.updateProgress(50, {
  itemsProcessed: 500,
  itemsTotal: 1000,
  currentItem: 'Product #500',
  estimatedTimeRemaining: '2m 30s'
})
```

### 3. Always Handle Errors
```javascript
try {
  await job.start()
  // ... do work
  await job.complete()
} catch (error) {
  await job.fail(error.message)
}
```

### 4. Update Progress Regularly
```javascript
// Update every 10 items
for (let i = 0; i < items.length; i++) {
  await processItem(items[i])

  if (i % 10 === 0) {
    const progress = Math.floor((i / items.length) * 100)
    await job.updateProgress(progress)
  }
}
```

### 5. Use Source Name
Always set `source` to your plugin/theme name for tracking:
```javascript
source: 'my-awesome-plugin'
```

## Cleanup

Schedule automatic cleanup of old jobs:

```javascript
// In your plugin
hooks.addAction('init', async () => {
  // Cleanup jobs older than 30 days
  await hooks.cleanupOldJobs(30)
})
```

Or use the API endpoint:
```bash
curl -X DELETE http://localhost:3001/api/v1/jobs/cleanup?daysOld=30
```

## Examples

See the `example-job-plugin` in `/hd-content/plugins/example-job-plugin/` for complete examples of:
- Creating jobs with custom icons
- Updating progress
- Handling completion
- Handling failures
- Using metadata

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Admin UI                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │         JobQueue.vue Component                   │  │
│  │  - Displays jobs in bottom-right corner         │  │
│  │  - Connects to WebSocket                        │  │
│  │  - Shows progress bars                          │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │ WebSocket
                   │
┌──────────────────▼──────────────────────────────────────┐
│                   Backend Server                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │           RegisterJobs Registry                  │  │
│  │  - createJob()                                   │  │
│  │  - getJobs()                                     │  │
│  │  - cleanupOldJobs()                             │  │
│  │  - broadcasts via WebSocket                     │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │           JobsController (API)                   │  │
│  │  - GET /api/v1/jobs                             │  │
│  │  - POST /api/v1/jobs                            │  │
│  │  - DELETE /api/v1/jobs/cleanup                  │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│                    Database                             │
│          hd_posts + hd_post_meta tables                 │
│  - Jobs stored as post_type_slug: 'jobs'                │
│  - All job data in post_meta fields                     │
│  - No additional tables needed                          │
└─────────────────────────────────────────────────────────┘
```

## Setup

The jobs post type is automatically registered by the `jobs-provider`. No migrations needed!

The provider is located at `hd-core/providers/jobs-provider/index.mjs` and registers the jobs post type with all necessary fields on system initialization.

## Why Use Post Type?

1. **No Additional Tables** - Uses existing `hd_posts` and `hd_post_meta` tables
2. **Native Integration** - Works with CMS permissions, authors, revisions
3. **Searchable** - Can use existing post search/filter mechanisms
4. **Extensible** - Easy to add custom fields via post type fields
5. **Familiar** - Developers already understand the post system
6. **Manageable** - Can view/manage jobs in admin if needed
7. **Relationships** - Can relate jobs to users via `post_authors`

---

Happy job queuing! 🚀
