# Deployment Guide

Complete guide for deploying HTMLDrop CMS to production.

## Table of Contents

- [Requirements](#requirements)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [SSL/HTTPS Configuration](#sslhttps-configuration)
- [Process Management](#process-management)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [Performance Optimization](#performance-optimization)
- [Security Hardening](#security-hardening)
- [Monitoring & Logging](#monitoring--logging)
- [Backup Strategy](#backup-strategy)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)

---

## Requirements

### Minimum Requirements

- **Node.js:** >= 20.0.0
- **RAM:** 1GB minimum, 2GB recommended
- **CPU:** 1 core minimum, 2+ cores recommended
- **Storage:** 10GB recommended (depends on content)
- **OS:** Linux (Ubuntu 20.04+, Debian 10+, CentOS 8+), macOS, Windows Server

### Recommended Production Setup

- **Node.js:** 20.x LTS or 22.x LTS
- **RAM:** 4GB+
- **CPU:** 4+ cores (for clustering)
- **Storage:** SSD with 50GB+
- **Database:** PostgreSQL 14+ or MySQL 8+ (SQLite not recommended for production)
- **Reverse Proxy:** Nginx or Apache
- **Process Manager:** PM2
- **SSL:** Let's Encrypt or commercial certificate

---

## Environment Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database Configuration
DB_CLIENT=pg                                    # 'pg', 'mysql2', or 'sqlite3'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=htmldrop
DB_USER=htmldrop_user
DB_PASSWORD=your_secure_password
DB_SSL=true                                     # Enable SSL for database
TABLE_PREFIX=hd_                                # Table prefix

# For SQLite (not recommended for production)
# DB_CLIENT=sqlite3
# DB_PATH=./hd-content/config/database.sqlite

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=1h                               # Access token expiry
REFRESH_TOKEN_EXPIRES_IN=7d                     # Refresh token expiry

# Upload Configuration
UPLOAD_DIR=./hd-content/uploads
MAX_FILE_SIZE=10485760                          # 10MB in bytes
ALLOWED_FILE_EXTENSIONS=jpg,jpeg,png,gif,webp,svg,pdf  # Empty/not set = allow all (default)

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com              # Your domain
CORS_CREDENTIALS=true

# Clustering
CLUSTER_WORKERS=0                               # 0 = auto (CPU count), or specific number

# Admin Panel
ADMIN_PATH=/admin                               # Admin panel URL path

# Security
BCRYPT_ROUNDS=12                                # Password hashing rounds
RATE_LIMIT_WINDOW=15                            # Minutes
RATE_LIMIT_MAX=100                              # Max requests per window

# Logging
LOG_LEVEL=info                                  # error, warn, info, debug
LOG_FILE=./logs/app.log

# Cache (optional - Redis)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
CACHE_TTL=3600                                  # Cache TTL in seconds

# Email (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASSWORD=your_smtp_password
SMTP_FROM=noreply@example.com

# GitHub Token (optional - for CMS update checks)
# Increases API rate limit from 60 to 5000 requests/hour
# Can also be set in database options table as 'github_token' (takes priority)
# Create at: https://github.com/settings/tokens (needs 'public_repo' scope)
GITHUB_TOKEN=ghp_your_token_here

# OAuth (optional)
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=

# Monitoring (optional)
SENTRY_DSN=
NEW_RELIC_LICENSE_KEY=
```

### Generating Strong Secrets

```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Or use openssl
openssl rand -hex 64
```

---

## Database Setup

### PostgreSQL (Recommended)

#### 1. Install PostgreSQL

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo dnf install postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### 2. Create Database and User

```bash
# Login as postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE htmldrop;
CREATE USER htmldrop_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE htmldrop TO htmldrop_user;

# Exit
\q
```

#### 3. Configure PostgreSQL for Remote Access (if needed)

Edit `/etc/postgresql/14/main/postgresql.conf`:

```conf
listen_addresses = 'localhost'  # or '*' for all interfaces
```

Edit `/etc/postgresql/14/main/pg_hba.conf`:

```conf
# Allow password authentication
host    htmldrop    htmldrop_user    127.0.0.1/32    md5
```

Restart PostgreSQL:

```bash
sudo systemctl restart postgresql
```

#### 4. Run Migrations

```bash
npm run migrate:latest
```

### MySQL

#### 1. Install MySQL

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install mysql-server

# CentOS/RHEL
sudo dnf install mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

#### 2. Secure Installation

```bash
sudo mysql_secure_installation
```

#### 3. Create Database and User

```bash
# Login to MySQL
sudo mysql -u root -p

# Create database and user
CREATE DATABASE htmldrop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'htmldrop_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON htmldrop.* TO 'htmldrop_user'@'localhost';
FLUSH PRIVILEGES;

# Exit
EXIT;
```

#### 4. Update .env

```bash
DB_CLIENT=mysql2
DB_HOST=localhost
DB_PORT=3306
DB_NAME=htmldrop
DB_USER=htmldrop_user
DB_PASSWORD=your_secure_password
```

#### 5. Run Migrations

```bash
npm run migrate:latest
```

### Database Optimization

#### PostgreSQL

```sql
-- Create indexes for performance
CREATE INDEX idx_posts_type_status ON hd_posts(post_type, status);
CREATE INDEX idx_posts_created ON hd_posts(created_at DESC);
CREATE INDEX idx_post_meta_key_value ON hd_post_meta(meta_key, meta_value);

-- Vacuum and analyze
VACUUM ANALYZE;
```

#### MySQL

```sql
-- Create indexes
ALTER TABLE hd_posts ADD INDEX idx_posts_type_status (post_type, status);
ALTER TABLE hd_posts ADD INDEX idx_posts_created (created_at DESC);
ALTER TABLE hd_post_meta ADD INDEX idx_post_meta_key_value (meta_key, meta_value(100));

-- Optimize tables
OPTIMIZE TABLE hd_posts, hd_post_meta, hd_terms, hd_term_relationships;
```

---

## SSL/HTTPS Configuration

### Using Let's Encrypt (Free)

#### 1. Install Certbot

```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo dnf install certbot python3-certbot-nginx
```

#### 2. Obtain Certificate

```bash
# For Nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# For Apache
sudo certbot --apache -d yourdomain.com -d www.yourdomain.com

# Standalone (if not using Nginx/Apache as reverse proxy)
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

#### 3. Auto-renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically sets up a cron job for renewal
# Check with:
sudo systemctl status certbot.timer
```

### Manual SSL Certificate

If using a purchased certificate:

```bash
# Place your certificate files
/etc/ssl/certs/yourdomain.com.crt
/etc/ssl/private/yourdomain.com.key
/etc/ssl/certs/yourdomain.com.ca-bundle
```

---

## Process Management

### Using PM2 (Recommended)

#### 1. Install PM2

```bash
npm install -g pm2
```

#### 2. Create PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'htmldrop-cms',
    script: './hd-core/index.mjs',
    instances: 'max',        // Use all CPU cores
    exec_mode: 'cluster',    // Cluster mode
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
    ignore_watch: ['node_modules', 'hd-content/uploads', 'logs'],
  }]
}
```

#### 3. Start Application

```bash
# Start
pm2 start ecosystem.config.js

# View logs
pm2 logs htmldrop-cms

# Monitor
pm2 monit

# Restart
pm2 restart htmldrop-cms

# Stop
pm2 stop htmldrop-cms

# Reload (zero-downtime)
pm2 reload htmldrop-cms
```

#### 4. Setup Startup Script

```bash
# Generate startup script
pm2 startup

# Save current process list
pm2 save
```

#### 5. PM2 Web Dashboard (Optional)

```bash
pm2 install pm2-server-monit
```

### Using systemd

Create `/etc/systemd/system/htmldrop.service`:

```ini
[Unit]
Description=HTMLDrop CMS
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/htmldrop
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /var/www/htmldrop/hd-core/index.mjs
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=htmldrop

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable htmldrop
sudo systemctl start htmldrop
sudo systemctl status htmldrop
```

---

## Reverse Proxy Setup

### Nginx (Recommended)

#### 1. Install Nginx

```bash
# Ubuntu/Debian
sudo apt install nginx

# CentOS/RHEL
sudo dnf install nginx
```

#### 2. Configure Nginx

Create `/etc/nginx/sites-available/htmldrop`:

```nginx
# Upstream Node.js servers
upstream htmldrop_backend {
    least_conn;
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    # Add more servers for load balancing:
    # server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    # server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logging
    access_log /var/log/nginx/htmldrop-access.log;
    error_log /var/log/nginx/htmldrop-error.log;

    # Client body size (for uploads)
    client_max_body_size 100M;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss
               application/json application/javascript;

    # Static files (uploads)
    location /uploads/ {
        alias /var/www/htmldrop/hd-content/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Static files (themes/plugins)
    location ~ ^/(themes|plugins)/ {
        root /var/www/htmldrop/hd-content;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Proxy to Node.js
    location / {
        proxy_pass http://htmldrop_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://htmldrop_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

#### 3. Enable Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/htmldrop /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Apache

#### 1. Install Apache

```bash
# Ubuntu/Debian
sudo apt install apache2

# CentOS/RHEL
sudo dnf install httpd
```

#### 2. Enable Required Modules

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel ssl rewrite headers
```

#### 3. Configure Apache

Create `/etc/apache2/sites-available/htmldrop.conf`:

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com

    # Redirect to HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/yourdomain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/yourdomain.com/privkey.pem

    # Security Headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"

    # Logging
    ErrorLog ${APACHE_LOG_DIR}/htmldrop-error.log
    CustomLog ${APACHE_LOG_DIR}/htmldrop-access.log combined

    # Proxy to Node.js
    ProxyPreserveHost On
    ProxyPass /ws ws://localhost:3000/ws
    ProxyPassReverse /ws ws://localhost:3000/ws
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://localhost:3000/$1 [P,L]
</VirtualHost>
```

#### 4. Enable Site

```bash
sudo a2ensite htmldrop
sudo systemctl reload apache2
```

---

## Performance Optimization

### 1. Enable Compression

Already configured in Nginx example above. For Node.js level:

```bash
npm install compression
```

In your app:

```javascript
import compression from 'compression'
app.use(compression())
```

### 2. Redis Caching

```bash
npm install redis
```

Create cache service:

```javascript
// hd-core/services/CacheService.mjs
import { createClient } from 'redis'

class CacheService {
  constructor() {
    this.client = null
  }

  async connect() {
    this.client = createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    })

    await this.client.connect()
  }

  async get(key) {
    const value = await this.client.get(key)
    return value ? JSON.parse(value) : null
  }

  async set(key, value, ttl = 3600) {
    await this.client.setEx(key, ttl, JSON.stringify(value))
  }

  async del(key) {
    await this.client.del(key)
  }

  async flush() {
    await this.client.flushDb()
  }
}

export default new CacheService()
```

### 3. CDN for Static Assets

Use a CDN like Cloudflare, AWS CloudFront, or similar:

```bash
# Update upload URLs to use CDN
CDN_URL=https://cdn.yourdomain.com
```

### 4. Database Connection Pooling

Already handled by Knex. Configure in `knexfile.mjs`:

```javascript
pool: {
  min: 2,
  max: 10,
  acquireTimeoutMillis: 30000,
  idleTimeoutMillis: 30000
}
```

### 5. Static Asset Caching

Configure long cache headers for static assets (already in Nginx config).

---

## Security Hardening

### 1. Firewall Configuration

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 2. Fail2Ban

```bash
# Install
sudo apt install fail2ban

# Configure
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

Add custom filter for HTMLDrop:

```ini
[htmldrop]
enabled = true
port = http,https
filter = htmldrop
logpath = /var/log/nginx/htmldrop-access.log
maxretry = 5
bantime = 3600
```

### 3. Rate Limiting

Install rate limiting:

```bash
npm install express-rate-limit
```

Configure:

```javascript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
})

app.use('/api', limiter)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true
})

app.use('/api/v1/auth/login', authLimiter)
```

### 4. Security Headers

```bash
npm install helmet
```

```javascript
import helmet from 'helmet'
app.use(helmet())
```

### 5. Input Validation

Already configured via Zod (see validation section).

### 6. Regular Updates

```bash
# Check for outdated packages
npm outdated

# Update packages
npm update

# Audit for vulnerabilities
npm audit
npm audit fix
```

---

## Monitoring & Logging

### 1. Application Logging

Install Winston:

```bash
npm install winston
```

Create logger:

```javascript
// hd-core/utils/logger.mjs
import winston from 'winston'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
})

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }))
}

export default logger
```

### 2. PM2 Monitoring

```bash
# Install PM2 Plus for advanced monitoring
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 3. Error Tracking (Sentry)

```bash
npm install @sentry/node
```

Configure:

```javascript
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0
})

app.use(Sentry.Handlers.requestHandler())
app.use(Sentry.Handlers.errorHandler())
```

### 4. Health Check Endpoint

Already exists at `/api/v1/health`. Monitor with:

```bash
# Simple monitoring script
*/5 * * * * curl -f http://localhost:3000/api/v1/health || systemctl restart htmldrop
```

### 5. Uptime Monitoring

Use external services:
- UptimeRobot
- Pingdom
- StatusCake
- New Relic

---

## Backup Strategy

### 1. Database Backups

#### PostgreSQL

```bash
#!/bin/bash
# backup-db.sh
BACKUP_DIR="/backups/htmldrop"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U htmldrop_user -h localhost htmldrop | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete
```

#### MySQL

```bash
#!/bin/bash
BACKUP_DIR="/backups/htmldrop"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

mysqldump -u htmldrop_user -p htmldrop | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete
```

### 2. File Backups

```bash
#!/bin/bash
# backup-files.sh
BACKUP_DIR="/backups/htmldrop"
DATE=$(date +%Y%m%d_%H%M%S)
SOURCE="/var/www/htmldrop/hd-content"

tar -czf $BACKUP_DIR/files_$DATE.tar.gz $SOURCE

# Keep only last 30 days
find $BACKUP_DIR -name "files_*.tar.gz" -mtime +30 -delete
```

### 3. Automated Backups (Cron)

```bash
# Edit crontab
crontab -e

# Add backup jobs
0 2 * * * /usr/local/bin/backup-db.sh
0 3 * * * /usr/local/bin/backup-files.sh
```

### 4. Remote Backups

```bash
# Sync to S3
aws s3 sync /backups/htmldrop s3://your-bucket/htmldrop-backups/

# Or rsync to remote server
rsync -avz /backups/htmldrop/ user@backup-server:/backups/htmldrop/
```

---

## Scaling

### Horizontal Scaling

```
    ┌─────────────┐
    │Load Balancer│
    └──────┬──────┘
           │
   ┌───────┼───────┬───────┐
   │       │       │       │
┌──▼──┐ ┌─▼───┐ ┌─▼───┐ ┌─▼───┐
│App 1│ │App 2│ │App 3│ │App N│
└──┬──┘ └─┬───┘ └─┬───┘ └─┬───┘
   │      │      │       │
   └──────┴──┬───┴───────┘
             │
      ┌──────▼──────┐
      │Shared Redis │
      │+ PostgreSQL │
      └─────────────┘
```

#### Requirements for Horizontal Scaling:

1. **Shared Database** - PostgreSQL or MySQL (not SQLite)
2. **Shared File Storage** - NFS, S3, or similar
3. **Session Storage** - Redis for sessions
4. **Load Balancer** - Nginx, HAProxy, or cloud LB

#### Configure Shared Storage:

```bash
# Mount NFS for uploads
sudo mount -t nfs nfs-server:/exports/uploads /var/www/htmldrop/hd-content/uploads

# Or use S3
npm install aws-sdk multer-s3
```

### Vertical Scaling

- Increase CPU cores → More PM2 workers
- Increase RAM → Larger connection pools
- Faster disks → Better database performance

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs htmldrop-cms

# Check environment
pm2 env htmldrop-cms

# Check port availability
sudo lsof -i :3000
```

### Database Connection Issues

```bash
# Test database connection
psql -U htmldrop_user -h localhost -d htmldrop

# Check PostgreSQL status
sudo systemctl status postgresql

# Check logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### High Memory Usage

```bash
# Check process memory
pm2 monit

# Restart with memory limit
pm2 restart htmldrop-cms --max-memory-restart 1G

# Check for memory leaks
node --inspect hd-core/index.mjs
```

### Slow Performance

```bash
# Check database queries
# Enable query logging in PostgreSQL
ALTER DATABASE htmldrop SET log_statement = 'all';

# Check slow queries
# PostgreSQL
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;

# Check connection pool
pm2 monit
```

### SSL Certificate Issues

```bash
# Test SSL certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Check certificate expiry
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Renew certificate
sudo certbot renew
```

---

## Production Checklist

- [ ] Environment variables configured
- [ ] Strong JWT secret generated
- [ ] Database created and migrated
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Process manager (PM2) configured
- [ ] Reverse proxy (Nginx/Apache) configured
- [ ] Backups automated
- [ ] Monitoring setup
- [ ] Log rotation configured
- [ ] Rate limiting enabled
- [ ] Security headers enabled
- [ ] Fail2Ban configured
- [ ] Health checks setup
- [ ] CDN configured (optional)
- [ ] Redis cache configured (optional)
- [ ] Error tracking setup (optional)

---

## Need Help?

- [Architecture Guide](../architecture/README.md)
- [API Reference](../api/README.md)
- [GitHub Issues](https://github.com/your-repo/issues)
- [Community Forum](https://github.com/your-repo/discussions)
