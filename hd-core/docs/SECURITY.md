# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

The HTMLDrop CMS team takes security bugs seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities through GitHub's private security advisory feature at:
https://github.com/htmldrop/htmldrop/security/advisories/new

This allows us to discuss and fix the issue privately before public disclosure.

### What to Include

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

This information will help us triage your report more quickly.

### Disclosure Policy

When we receive a security bug report, we will:

1. **Confirm the problem** - Verify the issue and determine affected versions
2. **Audit code** - Check for similar problems elsewhere in the codebase
3. **Prepare fixes** - Develop and test patches for all supported versions
4. **Release patches** - Push security updates to all affected versions
5. **Announce** - Publish a security advisory with details

### Coordinated Disclosure

We kindly ask you to:

- Give us reasonable time to investigate and fix the issue before public disclosure
- Make a good faith effort to avoid privacy violations, data destruction, and service interruption
- Not exploit the vulnerability beyond what is necessary to demonstrate it

In return, we will:

- Respond to your report promptly
- Keep you updated on our progress
- Credit you in the security advisory (unless you prefer to remain anonymous)
- Work with you to understand and resolve the issue quickly

## Security Best Practices

### For Users

#### Strong Authentication

```bash
# Use strong JWT secrets
JWT_SECRET=$(openssl rand -hex 64)

# Use strong database passwords
DB_PASSWORD=$(openssl rand -base64 32)
```

#### HTTPS Only

Always use HTTPS in production:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    return 301 https://$server_name$request_uri;
}
```

#### Environment Variables

Never commit `.env` files to version control:

```bash
# Add to .gitignore
.env
.env.local
.env.production
```

#### Regular Updates

Keep dependencies up to date:

```bash
npm audit
npm audit fix
npm update
```

#### File Upload Configuration

Configure file upload limits and restrictions:

```bash
# File size limit
MAX_FILE_SIZE=10485760  # 10MB default

# File type restrictions (optional)
# Not set or empty = allow all file types (default)
ALLOWED_FILE_EXTENSIONS=jpg,jpeg,png,gif,webp,svg,pdf

# Common presets:
# Images only: jpg,jpeg,png,gif,webp,svg
# Documents: pdf,doc,docx,txt,rtf
# Archives: zip
# Combined: jpg,jpeg,png,gif,webp,svg,pdf,doc,docx,txt,rtf,zip
```

**Default Behavior**: By default, all file types are allowed. This gives maximum flexibility but requires careful monitoring in production environments.

**Recommendation**: For production, set `ALLOWED_FILE_EXTENSIONS` to only the file types your application needs.

#### Database Security

- Use strong passwords
- Enable SSL/TLS connections
- Restrict network access
- Regular backups
- Keep database software updated

#### Firewall Configuration

```bash
# Only allow necessary ports
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

#### Rate Limiting

Configure rate limiting to prevent abuse:

```bash
RATE_LIMIT_WINDOW=15  # minutes
RATE_LIMIT_MAX=100    # requests per window
```

### For Developers

#### Input Validation

Always validate and sanitize user input:

```javascript
import { z } from 'zod'

const postSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  status: z.enum(['draft', 'published', 'pending'])
})

// Validate input
const data = postSchema.parse(req.body)
```

#### SQL Injection Prevention

Use parameterized queries:

```javascript
// ✅ Good - Parameterized query
const posts = await knex('posts')
  .where('id', userId)
  .select('*')

// ❌ Bad - String concatenation
const posts = await knex.raw(`SELECT * FROM posts WHERE id = ${userId}`)
```

#### XSS Prevention

Sanitize HTML output:

```javascript
import DOMPurify from 'dompurify'

const clean = DOMPurify.sanitize(userContent, {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em'],
  ALLOWED_ATTR: []
})
```

#### Authentication & Authorization

Always check permissions:

```javascript
// Check authentication
if (!req.user) {
  return res.status(401).json({ error: 'Unauthorized' })
}

// Check authorization
const hasPermission = await req.guard.user({
  userId: req.user.id,
  canOneOf: ['edit_posts']
})

if (!hasPermission) {
  return res.status(403).json({ error: 'Forbidden' })
}
```

#### Secure Password Storage

Use bcrypt for password hashing:

```javascript
import bcrypt from 'bcrypt'

const BCRYPT_ROUNDS = 12

// Hash password
const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

// Verify password
const isValid = await bcrypt.compare(password, hashedPassword)
```

#### CSRF Protection

Implement CSRF tokens for state-changing operations:

```javascript
import csrf from 'csurf'

const csrfProtection = csrf({ cookie: true })
app.use(csrfProtection)
```

#### Security Headers

Use Helmet.js for security headers:

```javascript
import helmet from 'helmet'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}))
```

#### Secrets Management

Never hardcode secrets:

```javascript
// ❌ Bad
const jwtSecret = 'my-secret-key'

// ✅ Good
const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required')
}
```

#### Error Handling

Don't expose sensitive information in errors:

```javascript
// ❌ Bad - Exposes stack trace
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.stack })
})

// ✅ Good - Generic error message
app.use((err, req, res, next) => {
  logger.error(err)
  res.status(500).json({ error: 'Internal server error' })
})
```

#### Dependency Security

Regularly audit dependencies:

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Check for outdated packages
npm outdated
```

Add to CI/CD pipeline:

```yaml
# .github/workflows/security.yml
name: Security Audit
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm audit --audit-level=moderate
```

## Security Checklist

### Production Deployment

- [ ] Strong JWT secret configured
- [ ] Database uses strong password
- [ ] HTTPS/SSL enabled
- [ ] Security headers configured (Helmet.js)
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] File upload limits set
- [ ] Input validation implemented
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection (sanitization)
- [ ] CSRF protection enabled
- [ ] Error messages don't expose sensitive info
- [ ] Logging configured (but not logging secrets)
- [ ] Firewall configured
- [ ] Regular backups enabled
- [ ] Dependencies up to date
- [ ] Security monitoring enabled
- [ ] Fail2Ban or similar configured
- [ ] Database SSL enabled
- [ ] Environment variables secured

### Code Review Checklist

- [ ] User input validated
- [ ] SQL queries parameterized
- [ ] HTML output sanitized
- [ ] Authentication checked
- [ ] Authorization checked
- [ ] Secrets not hardcoded
- [ ] Error handling doesn't leak info
- [ ] File uploads validated
- [ ] Rate limiting applied
- [ ] CSRF tokens used

## Known Security Considerations

### SQLite in Production

SQLite is not recommended for production use due to:
- No built-in user authentication
- File-based (less secure than dedicated DB server)
- Limited concurrent write performance

Use PostgreSQL or MySQL for production.

### File Uploads

File uploads can be exploited. Our mitigations:
- File size limits
- File type validation
- Path traversal protection
- Virus scanning (recommended via plugin)

### JWT Tokens

JWTs are stateless but can't be invalidated. Our mitigations:
- Short expiration times (1 hour default)
- Refresh token rotation
- Token revocation list
- Secure token storage on client

### Plugin/Theme Security

Third-party plugins/themes can introduce vulnerabilities:
- Review code before installation
- Only install from trusted sources
- Keep plugins/themes updated
- Use sandboxing where possible

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)

## Past Security Advisories

Security advisories will be published at:
- GitHub Security Advisories
- Project website
- Release notes

## Contributing to Security

We welcome contributions to improve the security of HTMLDrop CMS:

- **Report Issues**: Use [GitHub Issues](https://github.com/htmldrop/htmldrop/issues) for non-security bugs and feature requests
- **Submit Pull Requests**: Contribute security improvements via [GitHub Pull Requests](https://github.com/htmldrop/htmldrop/pulls)
- **Security Vulnerabilities**: Use [GitHub Security Advisories](https://github.com/htmldrop/htmldrop/security/advisories) for private vulnerability disclosure

---

Thank you for helping keep HTMLDrop CMS and its users safe!
