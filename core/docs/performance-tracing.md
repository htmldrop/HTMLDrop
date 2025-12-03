# Performance Tracing

HTMLDrop includes a built-in performance tracing system that helps identify bottlenecks in your themes, plugins, and the core CMS. This guide covers how to use the tracing system as a developer.

## Overview

The tracing system tracks the entire request-to-response lifecycle with:
- **Unique trace IDs** per request
- **Hierarchical spans** (parent/child relationships)
- **High-resolution timing** (microsecond precision)
- **Memory usage tracking** per span
- **Metadata/tags** support
- **Waterfall visualization** data

## Configuration

### Environment Variables

```bash
# Enable/disable tracing (default: true)
HD_TRACING_ENABLED=true

# Sample rate 0.0-1.0 (default: 1.0 = 100% of requests traced)
HD_TRACING_SAMPLE_RATE=1.0

# Log traces to console (default: false)
HD_TRACING_VERBOSE=true

# Maximum traces to store in memory (default: 100)
HD_TRACING_MAX_TRACES=100

# Maximum age of stored traces in milliseconds (default: 3600000 = 1 hour)
HD_TRACING_MAX_AGE_MS=3600000

# --- Database Persistence (optional) ---

# Store traces in database instead of memory only (default: false)
HD_TRACING_PERSIST=false

# Days to keep traces in database (default: 30)
HD_TRACING_RETENTION_DAYS=30

# Archive traces older than N days to gzipped files (default: 7, set to 0 to disable)
HD_TRACING_ARCHIVE_AFTER_DAYS=7

# Path for archived trace files (default: ./content/traces)
HD_TRACING_ARCHIVE_PATH=./content/traces

# Cleanup interval in milliseconds (default: 3600000 = 1 hour)
HD_TRACING_CLEANUP_INTERVAL_MS=3600000
```

### Storage Modes

**Memory-only (default):**
- Fast, no database overhead
- Traces lost on server restart
- Good for development and quick debugging

**Database-backed (`HD_TRACING_PERSIST=true`):**
- Traces survive server restarts
- Queryable via API with pagination
- Automatic retention and cleanup
- Optional archiving to compressed files
- Good for production debugging and long-term analysis

### Database Options

You can also configure tracing via the options table:

```javascript
// In your theme or plugin
const tracingConfig = {
  enabled: true,
  sampleRate: 0.5,  // Sample 50% of requests
  verbose: false
}
```

## Using the Tracer in Themes

The tracer is available through the `hooks` object in your theme:

```javascript
export default async ({ req, res, next, router }) => {
  const { context, hooks } = createContext(req)

  // Get tracer functions from hooks
  const { tracer, startSpan, trace, getCurrentSpan } = hooks

  return {
    async init() {
      // Your init code here
    },
    async render() {
      // Your render code here
    }
  }
}
```

### Method 1: Manual Span Management

Use `startSpan()` for fine-grained control:

```javascript
async render() {
  // Start a span
  const span = startSpan('my.operation', {
    category: 'theme',
    tags: { component: 'header' }
  })

  // Do your work
  const data = await fetchSomeData()

  // Add more tags as you learn more
  span.addTag('dataSize', data.length)

  // End the span when done
  span.end()
}
```

### Method 2: Automatic Span Management

Use `trace()` for automatic start/end handling:

```javascript
async render() {
  // Automatically starts and ends span, handles errors
  const result = await trace('my.operation', async (span) => {
    span.addTag('step', 'fetching')
    const data = await fetchSomeData()

    span.addTag('step', 'processing')
    const processed = processData(data)

    span.addTag('resultSize', processed.length)
    return processed
  }, { category: 'theme' })
}
```

### Method 3: Child Spans

Create nested spans for hierarchical operations:

```javascript
async render() {
  const parentSpan = startSpan('render.page', { category: 'render' })

  // Child span for header
  const headerSpan = parentSpan.startChild('render.header', { category: 'render' })
  await renderHeader()
  headerSpan.end()

  // Child span for content
  const contentSpan = parentSpan.startChild('render.content', { category: 'render' })
  await renderContent()
  contentSpan.end()

  // Child span for footer
  const footerSpan = parentSpan.startChild('render.footer', { category: 'render' })
  await renderFooter()
  footerSpan.end()

  parentSpan.end()
}
```

### Method 4: Using traceChild()

Combine child spans with automatic management:

```javascript
async render() {
  const mainSpan = startSpan('render.page', { category: 'render' })

  // Automatically manage child span lifecycle
  const headerHtml = await mainSpan.traceChild('render.header', async (span) => {
    span.addTag('template', 'default-header')
    return await renderHeader()
  }, { category: 'render' })

  mainSpan.end()
}
```

## Categories

Use consistent categories to group related operations:

| Category | Description |
|----------|-------------|
| `core` | Core CMS operations |
| `theme` | Theme-specific operations |
| `plugin` | Plugin-specific operations |
| `database` | Database queries |
| `ssr` | Server-side rendering |
| `render` | Component/template rendering |
| `middleware` | Middleware execution |
| `lifecycle` | Lifecycle hooks |
| `hook` | Action/filter hooks |
| `external` | External API calls |
| `io` | File system operations |
| `cache` | Cache operations |

Import the category constants:

```javascript
import { TraceCategory } from '../../../core/services/PerformanceTracer.mjs'

const span = startSpan('my.operation', {
  category: TraceCategory.THEME
})
```

## Span Methods

### TraceSpan API

```javascript
const span = startSpan('operation.name', options)

// Add a single tag
span.addTag('key', 'value')

// Add multiple tags
span.addTags({ key1: 'value1', key2: 'value2' })

// Log an event during the span
span.log('Processing started', { itemCount: 100 })

// Create a child span
const child = span.startChild('child.operation', { category: 'theme' })

// Trace a child operation with automatic span management
const result = await span.traceChild('child.operation', async (childSpan) => {
  return await doWork()
})

// End the span
span.end()

// End with error
span.end({ error: new Error('Something went wrong') })
```

## Using the Tracer in Plugins

The tracer works the same way in plugins:

```javascript
export default async ({ req, res, next, router }) => {
  const { startSpan, trace } = req.hooks

  return {
    async init() {
      await trace('plugin.myPlugin.init', async (span) => {
        span.addTag('plugin', 'my-plugin')

        // Register hooks, routes, etc.
        req.hooks.addAction('some_action', () => {
          // You can also trace inside action handlers
          const actionSpan = startSpan('plugin.myPlugin.actionHandler', {
            category: 'hook'
          })
          // ... do work ...
          actionSpan.end()
        })
      }, { category: 'plugin' })
    }
  }
}
```

## API Endpoints

The tracing system exposes REST API endpoints for viewing traces:

### List Recent Traces

```
GET /api/v1/tracing/traces?limit=20&offset=0
```

Query parameters:
- `limit` - Number of traces to return (default: 20)
- `offset` - Offset for pagination (default: 0)
- `path` - Filter by request path
- `minDuration` - Filter by minimum duration in ms
- `errorsOnly` - Set to `true` to only return traces with errors

### Get Specific Trace

```
GET /api/v1/tracing/traces/:traceId
```

Returns the full trace with all spans.

### Get Slowest Traces

```
GET /api/v1/tracing/slowest?limit=10
```

Returns the slowest traces, sorted by duration.

### Get Traces with Errors

```
GET /api/v1/tracing/errors?limit=20
```

Returns traces that contain errors.

### Get Aggregate Statistics

```
GET /api/v1/tracing/stats?timeWindow=300000
```

Returns aggregate statistics for the specified time window (default 5 minutes).

Response includes:
- Request counts and durations (avg, min, max, p50, p95, p99)
- Error rate
- Breakdown by category
- Breakdown by path

### Find Bottlenecks

```
GET /api/v1/tracing/bottlenecks?limit=10&timeWindow=300000
```

Analyzes traces to identify performance bottlenecks.

### Get Waterfall Data

```
GET /api/v1/tracing/waterfall/:traceId
```

Returns data formatted for waterfall visualization.

### Export Traces

```
GET /api/v1/tracing/export
```

Downloads all stored traces as JSON.

### Clear Traces

```
DELETE /api/v1/tracing/traces
```

Clears all stored traces.

### Get Configuration

```
GET /api/v1/tracing/config
```

Returns current tracing configuration.

## Example: Full Theme with Tracing

```javascript
import { createContext } from '../../../core/types/context.mjs'

export default async ({ req, res, next, router }) => {
  const { context, hooks } = createContext(req)
  const { startSpan, trace } = hooks

  return {
    async init() {
      await trace('theme.myTheme.init', async (span) => {
        span.addTag('theme', 'my-theme')

        // Register your hooks
        hooks.addAction('create_post', async ({ postType, post }) => {
          const actionSpan = startSpan('theme.myTheme.createPost', {
            category: 'hook',
            tags: { postType, postId: post.id }
          })

          // Handle post creation
          await handlePostCreation(post)

          actionSpan.end()
        })
      }, { category: 'theme' })
    },

    async render() {
      const { knex, table } = context

      // Main render span
      const renderSpan = startSpan('theme.myTheme.render', {
        category: 'render',
        tags: { url: req.url }
      })

      // Database query with tracing
      const posts = await trace('theme.myTheme.fetchPosts', async (span) => {
        const results = await knex(table('posts'))
          .where('status', 'published')
          .limit(10)

        span.addTag('postCount', results.length)
        return results
      }, { category: 'database' })

      // Template rendering with tracing
      const html = await trace('theme.myTheme.renderTemplate', async (span) => {
        const rendered = await renderTemplate('home', { posts })
        span.addTag('htmlSize', rendered.length)
        return rendered
      }, { category: 'render' })

      renderSpan.addTag('responseSize', html.length)
      renderSpan.end()

      // Set up routes
      router.get('/', (req, res) => {
        res.type('html').send(html)
      })
    }
  }
}
```

## Best Practices

### 1. Use Descriptive Names

Use dot-notation for span names to create clear hierarchies:

```javascript
// Good
startSpan('theme.myTheme.render.header')
startSpan('plugin.seo.generateMeta')
startSpan('database.posts.fetchPublished')

// Avoid
startSpan('render')
startSpan('fetch')
```

### 2. Add Meaningful Tags

Tags help with filtering and debugging:

```javascript
span.addTags({
  postType: 'pages',
  postId: post.id,
  userId: user?.id,
  cacheHit: true,
  resultCount: results.length
})
```

### 3. Handle Errors

Always end spans, even on errors:

```javascript
const span = startSpan('my.operation')
try {
  await riskyOperation()
  span.end()
} catch (error) {
  span.end({ error })
  throw error
}

// Or use trace() for automatic error handling
await trace('my.operation', async (span) => {
  await riskyOperation()  // Error automatically captured
})
```

### 4. Use Sampling in Production

For high-traffic sites, use sampling to reduce overhead:

```bash
HD_TRACING_SAMPLE_RATE=0.1  # Sample 10% of requests
```

### 5. Don't Over-Trace

Focus on meaningful operations:

```javascript
// Good - trace significant operations
await trace('theme.render.fetchData', async () => {
  return await db.query('...')
})

// Avoid - don't trace trivial operations
await trace('theme.render.addString', async () => {
  return str1 + str2  // Too granular
})
```

## Viewing Traces

### Console Output (Development)

Enable verbose mode to see traces in the console:

```bash
HD_TRACING_VERBOSE=true
```

Output example:
```
=== Trace abc123-def456 ===
Request: GET /blog
Total Duration: 145.23ms
Spans: 12 (0 errors)

Slowest Operations:
  - database.posts.fetch (database): 45.12ms
  - theme.blog.render (render): 32.45ms
  - themes.init (theme): 28.90ms

By Category:
  database: 2 spans, 52.34ms total
  render: 4 spans, 48.12ms total
  theme: 6 spans, 44.77ms total
```

### API (Production)

Use the API endpoints to query traces programmatically or build a dashboard.

## Troubleshooting

### Traces Not Appearing

1. Check if tracing is enabled: `HD_TRACING_ENABLED=true`
2. Check sample rate: `HD_TRACING_SAMPLE_RATE=1.0`
3. Verify `traceStorage` is initialized in context
4. Check API authentication (requires valid JWT)

### High Memory Usage

Reduce the number of stored traces:

```bash
HD_TRACING_MAX_TRACES=50
HD_TRACING_MAX_AGE_MS=1800000  # 30 minutes
```

### Performance Impact

Use sampling in production:

```bash
HD_TRACING_SAMPLE_RATE=0.05  # 5% sampling
```
