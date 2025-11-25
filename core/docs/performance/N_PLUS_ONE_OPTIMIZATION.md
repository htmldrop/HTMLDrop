# N+1 Query Optimization Guide

Guide for identifying and optimizing N+1 query problems in HTMLDrop CMS.

## What is the N+1 Problem?

The N+1 query problem occurs when your code executes 1 query to retrieve N records, then N additional queries to fetch related data for each record. This results in 1 + N queries instead of 2 queries.

### Example

```javascript
// BAD: N+1 Query Problem
const posts = await knex('posts').limit(10) // 1 query

for (const post of posts) {
  // 10 queries (one for each post)
  const author = await knex('users').where({ id: post.author_id }).first()
  post.author = author
}
// Total: 11 queries
```

```javascript
// GOOD: Optimized with eager loading
const posts = await knex('posts').limit(10) // 1 query

const authorIds = posts.map((p) => p.author_id)
const authors = await knex('users').whereIn('id', authorIds) // 1 query
const authorMap = new Map(authors.map((a) => [a.id, a]))

posts.forEach((post) => {
  post.author = authorMap.get(post.author_id)
})
// Total: 2 queries
```

---

## Common N+1 Patterns in HTMLDrop

### 1. Post with Taxonomies

**Problem:**
```javascript
const posts = await knex('posts').limit(10)

for (const post of posts) {
  const terms = await knex('term_relationships')
    .where({ post_id: post.id })
    .join('terms', 'term_relationships.term_id', 'terms.id')

  post.terms = terms
}
```

**Solution (Already Implemented):**
```javascript
// PostService.withTaxonomiesMany() method
async withTaxonomiesMany(posts) {
  if (!posts || posts.length === 0) return posts

  // Single query for all relationships
  const postIds = posts.map((p) => p.id)
  const relationships = await this.knex(this.table('term_relationships'))
    .whereIn('post_id', postIds)

  // Single query for all terms
  const termIds = [...new Set(relationships.map((r) => r.term_id))]
  const terms = await this.knex(this.table('terms')).whereIn('id', termIds)

  // Build maps and attach
  // ...
}
```

### 2. Posts with Authors

**Problem:**
```javascript
const posts = await knex('posts').limit(10)

for (const post of posts) {
  const authors = await knex('post_authors')
    .where({ post_id: post.id })
    .join('users', 'post_authors.user_id', 'users.id')

  post.authors = authors
}
```

**Solution:**
```javascript
async withAuthors(posts) {
  if (!posts || posts.length === 0) return posts

  const postIds = posts.map((p) => p.id)

  // Single query for all author relationships
  const authorRelations = await knex('post_authors')
    .whereIn('post_id', postIds)
    .join('users', 'post_authors.user_id', 'users.id')
    .select('post_authors.post_id', 'users.*')

  // Group by post
  const authorsByPost = new Map()
  for (const rel of authorRelations) {
    if (!authorsByPost.has(rel.post_id)) {
      authorsByPost.set(rel.post_id, [])
    }
    authorsByPost.get(rel.post_id).push(rel)
  }

  return posts.map((post) => ({
    ...post,
    authors: authorsByPost.get(post.id) || []
  }))
}
```

### 3. Posts with Meta

**Problem:**
```javascript
const posts = await knex('posts').limit(10)

for (const post of posts) {
  const meta = await knex('post_meta').where({ post_id: post.id })
  post.meta = Object.fromEntries(meta.map((m) => [m.meta_key, m.meta_value]))
}
```

**Solution:**
```javascript
async withMeta(posts) {
  if (!posts || posts.length === 0) return posts

  const postIds = posts.map((p) => p.id)

  // Single query for all meta
  const allMeta = await knex('post_meta').whereIn('post_id', postIds)

  // Group by post
  const metaByPost = new Map()
  for (const meta of allMeta) {
    if (!metaByPost.has(meta.post_id)) {
      metaByPost.set(meta.post_id, {})
    }
    metaByPost.get(meta.post_id)[meta.meta_key] = meta.meta_value
  }

  return posts.map((post) => ({
    ...post,
    meta: metaByPost.get(post.id) || {}
  }))
}
```

---

## Identification Tools

### 1. Query Logging

Enable Knex query logging to see all queries:

```javascript
const knex = require('knex')({
  client: 'mysql2',
  connection: { /* ... */ },
  debug: true // Enable query logging
})
```

### 2. Custom Query Logger

```javascript
// core/utils/queryLogger.mjs
export class QueryLogger {
  constructor() {
    this.queries = []
  }

  log(query) {
    this.queries.push({
      sql: query.sql,
      bindings: query.bindings,
      timestamp: Date.now()
    })
  }

  analyze() {
    const byTable = {}

    for (const query of this.queries) {
      const match = query.sql.match(/from [`"]?(\w+)[`"]?/i)
      if (match) {
        const table = match[1]
        byTable[table] = (byTable[table] || 0) + 1
      }
    }

    // Identify potential N+1 problems
    const warnings = []
    for (const [table, count] of Object.entries(byTable)) {
      if (count > 10) {
        warnings.push(`Potential N+1 on ${table}: ${count} queries`)
      }
    }

    return { total: this.queries.length, byTable, warnings }
  }

  reset() {
    this.queries = []
  }
}
```

### 3. Monitoring Middleware

```javascript
// Add to middleware stack
app.use((req, res, next) => {
  const queryLogger = new QueryLogger()
  req.queryLogger = queryLogger

  // Intercept Knex queries
  const originalQuery = knex.client.query
  knex.client.query = function (...args) {
    queryLogger.log({ sql: args[0], bindings: args[1] })
    return originalQuery.apply(this, args)
  }

  res.on('finish', () => {
    const analysis = queryLogger.analyze()
    if (analysis.warnings.length > 0) {
      console.warn(`[N+1 Warning] ${req.method} ${req.path}`)
      analysis.warnings.forEach((w) => console.warn(`  - ${w}`))
    }
  })

  next()
})
```

---

## Optimization Strategies

### 1. Eager Loading

Load related data upfront in bulk queries:

```javascript
class PostService {
  async getPostsWithRelations(options) {
    let posts = await this.getPosts(options)

    // Eager load all relations
    posts = await this.withAuthors(posts)
    posts = await this.withTaxonomies(posts)
    posts = await this.withMeta(posts)

    return posts
  }
}
```

### 2. Join Queries

Use SQL joins when appropriate:

```javascript
// Instead of separate queries
const posts = await knex('posts')
  .join('users', 'posts.author_id', 'users.id')
  .select('posts.*', 'users.username as author_name')
```

**Note:** Be careful with joins on one-to-many relationships as they can cause duplicate rows.

### 3. DataLoader Pattern

For complex scenarios, use the DataLoader pattern (batch + cache):

```javascript
import DataLoader from 'dataloader'

const authorLoader = new DataLoader(async (postIds) => {
  const authors = await knex('post_authors')
    .whereIn('post_id', postIds)
    .join('users', 'post_authors.user_id', 'users.id')

  // Return in same order as postIds
  return postIds.map((id) => authors.filter((a) => a.post_id === id))
})

// Usage
const authors = await authorLoader.load(post.id)
```

### 4. Query Result Caching

Cache expensive query results:

```javascript
import cacheService from './services/CacheService.mjs'

async getPopularPosts() {
  return cacheService.remember('popular_posts', async () => {
    const posts = await knex('posts')
      .orderBy('views', 'desc')
      .limit(10)

    return this.withTaxonomies(posts)
  }, 300) // Cache for 5 minutes
}
```

---

## Best Practices

### 1. Always Use Bulk Loading for Relations

```javascript
// ❌ Don't
for (const post of posts) {
  post.categories = await getCategories(post.id)
}

// ✅ Do
posts = await withCategories(posts)
```

### 2. Use Select to Limit Columns

```javascript
// ❌ Don't fetch all columns if not needed
const users = await knex('users')

// ✅ Do select only what you need
const users = await knex('users').select('id', 'username', 'email')
```

### 3. Paginate Large Result Sets

```javascript
// ❌ Don't load all records
const posts = await knex('posts')

// ✅ Do use pagination
const posts = await knex('posts').limit(10).offset(offset)
```

### 4. Index Foreign Keys

```sql
-- Add indexes on foreign keys
CREATE INDEX idx_post_meta_post_id ON post_meta(post_id);
CREATE INDEX idx_term_relationships_post_id ON term_relationships(post_id);
CREATE INDEX idx_post_authors_post_id ON post_authors(post_id);
```

### 5. Use Explain to Analyze Queries

```javascript
const explain = await knex('posts')
  .where({ status: 'published' })
  .explain()

console.log(explain)
```

---

## Performance Testing

### Benchmarking N+1 vs Optimized

```javascript
import { performance } from 'perf_hooks'

// N+1 version
const start1 = performance.now()
const posts1 = await getPosts()
for (const post of posts1) {
  post.categories = await getCategories(post.id)
}
const end1 = performance.now()
console.log(`N+1: ${end1 - start1}ms`)

// Optimized version
const start2 = performance.now()
const posts2 = await getPosts()
await withCategories(posts2)
const end2 = performance.now()
console.log(`Optimized: ${end2 - start2}ms`)
```

### Expected Results

- **N+1 (10 posts):** 50-200ms (depends on latency)
- **Optimized (10 posts):** 5-20ms
- **N+1 (100 posts):** 500-2000ms
- **Optimized (100 posts):** 10-50ms

---

## Checklist

Use this checklist when reviewing code:

- [ ] Are there loops that execute database queries?
- [ ] Can related data be loaded in bulk?
- [ ] Are foreign keys indexed?
- [ ] Is query result caching appropriate?
- [ ] Have you tested with realistic data volumes?
- [ ] Did you measure query performance?
- [ ] Are there alternatives like joins or subqueries?

---

## Related Documentation

- [PostService Implementation](../core/services/PostService.mjs) - Already optimized
- [CacheService](../core/services/CacheService.mjs) - Query result caching
- [Performance Guide](./PERFORMANCE.md) - General performance optimization

---

**Last Updated:** 2025-11-12
