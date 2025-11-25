# Contributing to HTMLDrop CMS

Thank you for your interest in contributing to HTMLDrop CMS! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Testing](#testing)
- [Documentation](#documentation)

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (code snippets, screenshots, etc.)
- **Describe the behavior you observed and what you expected**
- **Include your environment details** (OS, Node.js version, database, etc.)

**Template:**

```markdown
## Bug Description
A clear description of what the bug is.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What you expected to happen.

## Actual Behavior
What actually happened.

## Environment
- OS: [e.g., Ubuntu 22.04]
- Node.js: [e.g., 20.10.0]
- Database: [e.g., PostgreSQL 14]
- HTMLDrop version: [e.g., 1.0.0]

## Additional Context
Any other information about the problem.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the proposed feature**
- **Explain why this enhancement would be useful**
- **List any potential drawbacks or challenges**

### Your First Code Contribution

Unsure where to begin? Look for issues tagged with:

- `good first issue` - Simple issues for newcomers
- `help wanted` - Issues where we need community help
- `documentation` - Documentation improvements

### Pull Requests

We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Add tests if applicable
4. Ensure tests pass
5. Update documentation
6. Submit a pull request

---

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- npm, pnpm or yarn
- PostgreSQL, MySQL, or SQLite
- Git

### Setup Steps

1. **Fork and clone the repository**

```bash
git clone https://github.com/your-username/htmldrop-cms.git
cd htmldrop-cms
```

2. **Install dependencies**

```bash
npm install
```

3. **Setup environment**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Setup database**

```bash
# Create database
createdb htmldrop_dev

# Run migrations
npm run migrate:latest

# Seed data (optional)
npm run seed
```

5. **Start development server**

```bash
npm run dev
```

6. **Run tests**

```bash
npm test
```

### Project Structure

```
htmldrop-cms/
├── core/              # Core application
│   ├── admin/            # Admin panel (Vue)
│   ├── controllers/      # API controllers
│   ├── middlewares/      # Express middlewares
│   ├── registries/       # Plugin/theme system
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   └── utils/            # Helper utilities
├── content/           # User content
│   ├── plugins/          # Plugins
│   ├── themes/           # Themes
│   └── uploads/          # Uploads
├── core/docs/                 # Documentation
└── core/tests/                # Tests
```

---

## Pull Request Process

### Before Submitting

1. **Check existing PRs** - Ensure no duplicate PRs exist
2. **Run tests** - Make sure all tests pass
3. **Update documentation** - Document any new features or changes
4. **Follow coding standards** - Use ESLint and Prettier
5. **Write good commit messages** - Follow our commit guidelines

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that breaks existing functionality)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Related Issues
Closes #issue_number

## How Has This Been Tested?
Describe the tests you ran and how to reproduce them.

## Screenshots (if applicable)
Add screenshots to help explain your changes.

## Checklist
- [ ] My code follows the project's coding standards
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
```

### Review Process

1. At least one maintainer must approve the PR
2. All CI checks must pass
3. Code must follow project standards
4. Documentation must be updated
5. No merge conflicts

### After Submission

- Be responsive to review comments
- Make requested changes promptly
- Keep your branch up to date with main
- Be patient - reviews may take time

---

## Coding Standards

### JavaScript/Node.js

#### General Principles

- Write clean, readable, maintainable code
- Follow functional programming principles where appropriate
- Use ES6+ features (async/await, destructuring, etc.)
- Avoid deeply nested code (max 3-4 levels)
- Keep functions small and focused (single responsibility)

#### Naming Conventions

```javascript
// Variables and functions: camelCase
const userName = 'John'
function getUserById(id) { }

// Classes: PascalCase
class UserService { }

// Constants: UPPER_SNAKE_CASE
const MAX_FILE_SIZE = 10485760

// Private variables/methods: prefix with _
class MyClass {
  _privateMethod() { }
}

// File names: kebab-case or PascalCase
// user-service.mjs or UserService.mjs
```

#### Code Style

```javascript
// Use const by default, let when reassignment is needed
const items = []
let count = 0

// Use destructuring
const { name, email } = user
const [first, second] = items

// Use arrow functions for callbacks
items.map(item => item.id)

// Use template literals
const message = `Hello, ${name}!`

// Use async/await over promises
async function getUser(id) {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [id])
  return user
}

// Error handling
try {
  await riskyOperation()
} catch (error) {
  logger.error('Operation failed:', error)
  throw error
}

// Use optional chaining
const city = user?.address?.city

// Use nullish coalescing
const port = process.env.PORT ?? 3000
```

#### Comments

```javascript
// Use JSDoc for functions and classes
/**
 * Get a user by ID
 * @param {number} id - The user ID
 * @returns {Promise<Object>} The user object
 * @throws {Error} If user not found
 */
async function getUserById(id) {
  // Implementation
}

// Use inline comments for complex logic
// Calculate discounted price based on user tier
const discount = user.tier === 'premium' ? 0.2 : 0.1
```

### Vue.js (Admin Panel)

#### Component Structure

```vue
<template>
  <!-- Template -->
</template>

<script setup>
// Imports
import { ref, computed, onMounted } from 'vue'

// Props
const props = defineProps({
  userId: {
    type: Number,
    required: true
  }
})

// Emits
const emit = defineEmits(['update', 'delete'])

// Reactive state
const user = ref(null)
const loading = ref(false)

// Computed properties
const fullName = computed(() => {
  return `${user.value?.firstName} ${user.value?.lastName}`
})

// Methods
async function fetchUser() {
  loading.value = true
  try {
    const response = await fetch(`/api/v1/users/${props.userId}`)
    user.value = await response.json()
  } finally {
    loading.value = false
  }
}

// Lifecycle hooks
onMounted(() => {
  fetchUser()
})
</script>

<style scoped>
/* Component styles */
</style>
```

#### Component Naming

```javascript
// Component files: PascalCase
UserProfile.vue
PostCard.vue
NavigationMenu.vue

// Component usage: kebab-case
<user-profile :user-id="123" />
<post-card :post="post" />
```

### ESLint Configuration

We use ESLint for code linting. Run before committing:

```bash
npm run lint
npm run lint:fix
```

### Prettier Configuration

We use Prettier for code formatting. Run before committing:

```bash
npm run format
```

---

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Maintenance tasks
- `ci` - CI/CD changes
- `build` - Build system changes

### Examples

```
feat(posts): add pagination to posts list

Add limit and offset parameters to the posts endpoint
to support pagination.

Closes #123

---

fix(auth): resolve JWT expiration issue

Fixed bug where refresh tokens were not properly validated
causing premature session expiration.

Fixes #456

---

docs(api): update API reference for posts endpoint

Added examples for meta_query parameter usage.

---

refactor(controllers): extract service layer

Moved business logic from PostsController to PostService
for better separation of concerns.

---

perf(database): optimize post queries

Added indexes for commonly queried fields:
- posts.post_type
- posts.status
- posts.created_at

Improves query performance by 50%.

---

test(auth): add unit tests for AuthController

Added tests for login, register, and token refresh.
Coverage increased to 85%.
```

### Subject Line Rules

- Use imperative mood ("add" not "added")
- Don't capitalize first letter
- No period at the end
- Limit to 50 characters

### Body Rules

- Wrap at 72 characters
- Explain what and why, not how
- Separate from subject with blank line

### Footer Rules

- Reference issues: `Closes #123`, `Fixes #456`, `Refs #789`
- Note breaking changes: `BREAKING CHANGE: describe the change`

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test path/to/test.spec.js

# Run in watch mode
npm run test:watch
```

### Writing Tests

We use Vitest for testing. Place tests next to the files they test or in a `tests/` directory.

#### Unit Test Example

```javascript
// core/utils/slug.spec.js
import { describe, it, expect } from 'vitest'
import { normalizeSlug } from './slug.mjs'

describe('normalizeSlug', () => {
  it('should convert to lowercase', () => {
    expect(normalizeSlug('Hello World')).toBe('hello-world')
  })

  it('should replace spaces with hyphens', () => {
    expect(normalizeSlug('foo bar baz')).toBe('foo-bar-baz')
  })

  it('should remove special characters', () => {
    expect(normalizeSlug('hello@world!')).toBe('helloworld')
  })

  it('should handle empty strings', () => {
    expect(normalizeSlug('')).toBe('')
  })
})
```

#### Integration Test Example

```javascript
// tests/integration/posts.spec.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../core/app.mjs'
import knex from '../../core/database/knex.mjs'

describe('Posts API', () => {
  let authToken

  beforeAll(async () => {
    await knex.migrate.latest()
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password' })
    authToken = response.body.access_token
  })

  afterAll(async () => {
    await knex.migrate.rollback()
    await knex.destroy()
  })

  it('should list posts', async () => {
    const response = await request(app)
      .get('/api/v1/posts')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)

    expect(response.body).toHaveProperty('items')
    expect(Array.isArray(response.body.items)).toBe(true)
  })

  it('should create a post', async () => {
    const response = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Test Post',
        content: 'Test content',
        status: 'draft'
      })
      .expect(201)

    expect(response.body).toHaveProperty('id')
    expect(response.body.title).toBe('Test Post')
  })
})
```

### Test Coverage

We aim for:
- **80%+ overall coverage**
- **90%+ for critical paths** (auth, permissions, data access)
- **100% for utility functions**

---

## Documentation

### Code Documentation

- Use JSDoc comments for all public functions and classes
- Document complex logic with inline comments
- Keep comments up to date with code changes

### README Files

- Update README.md if you change user-facing features
- Add examples for new features
- Keep installation instructions current

### API Documentation

- Update [docs/api/README.md](core/docs/api/README.md) for API changes
- Include request/response examples
- Document all query parameters and headers

### Architecture Documentation

- Update [docs/architecture/README.md](core/docs/architecture/README.md) for architectural changes
- Update diagrams if structure changes
- Document design decisions

---

## Community

### Getting Help

- **GitHub Discussions** - Ask questions, share ideas
- **GitHub Issues** - Report bugs, request features
- **Discord** - Real-time chat with community (coming soon)

### Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Project website (coming soon)

---

## License

By contributing to HTMLDrop CMS, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

## Questions?

Feel free to reach out:
- Open a GitHub Discussion
- Comment on relevant issues
- Contact maintainers

Thank you for contributing to HTMLDrop CMS! 🎉
