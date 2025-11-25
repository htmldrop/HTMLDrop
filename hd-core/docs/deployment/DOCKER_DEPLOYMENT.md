# Docker Deployment Guide

## Persisting Data in Docker Swarm

HTMLDrop automatically generates JWT and session secrets on first startup. In Docker Swarm, **only runtime-generated data needs named volumes** to persist across container restarts:

1. **Application code** (`- .:/app`) - Bind mount is fine, code is static
2. **User content** (`hd-content/`) - Named volume required (uploads, plugins, themes)
3. **Secrets** (`.env`) - Named volume required (JWT/session keys)

### Included docker-compose.yml Configuration

The included `docker-compose.yml` is configured for Docker Swarm with named volumes:

```yaml
version: '3.8'

services:
  app:
    image: node:20-alpine
    volumes:
      - .:/app                              # Application code
      - hd-content:/app/hd-content          # User content (persistent)
      - env-data:/app/.env-persist          # Secrets (persistent)
    environment:
      ENV_FILE_PATH: /app/.env-persist/.env
      # ... other environment variables

volumes:
  env-data:     # JWT/session secrets
  hd-content:   # User uploads, plugins, themes
```

**How it works:**
1. `- .:/app` mounts your application code (no persistence needed)
2. `hd-content` volume persists user uploads, installed plugins, and themes
3. `env-data` volume persists JWT/session secrets
4. Both named volumes are shared across Swarm nodes
5. Containers can restart on any node and access the same persistent data

### Alternative: Bind Mount (Development)

For development or when you want secrets on your host filesystem:

```yaml
services:
  app:
    volumes:
      - .:/app
      - ./docker-secrets:/app/.env-persist  # Bind mount to host directory
    environment:
      ENV_FILE_PATH: /app/.env-persist/.env
```

**Setup:**
1. Create directory: `mkdir -p ./docker-secrets`
2. Secrets will be saved to `./docker-secrets/.env` on your host
3. You can view and backup secrets easily

### Multi-Node Docker Swarm (with shared storage)

For true multi-node Swarm deployments, you need a shared volume driver:

```yaml
volumes:
  hd-content:
    driver: local
    driver_opts:
      type: nfs
      o: addr=your-nfs-server,rw
      device: ":/path/to/hd-content"
  env-data:
    driver: local
    driver_opts:
      type: nfs
      o: addr=your-nfs-server,rw
      device: ":/path/to/env-data"
```

Or use a volume plugin like:
- REX-Ray
- Convoy
- GlusterFS
- Ceph

### Most Secure: Docker Secrets (Swarm Only)

For production environments using Docker Swarm, use Docker Secrets:

```yaml
version: '3.8'

services:
  app:
    image: your-htmldrop-image:latest
    deploy:
      replicas: 3
    secrets:
      - jwt_secret
      - jwt_refresh_secret
      - session_secret
    environment:
      NODE_ENV: production
      # Secrets will be read from files
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      JWT_REFRESH_SECRET_FILE: /run/secrets/jwt_refresh_secret
      SESSION_SECRET_FILE: /run/secrets/session_secret

secrets:
  jwt_secret:
    external: true
  jwt_refresh_secret:
    external: true
  session_secret:
    external: true
```

**Setup:**
```bash
# Generate and create secrets
echo $(openssl rand -hex 32) | docker secret create jwt_secret -
echo $(openssl rand -hex 32) | docker secret create jwt_refresh_secret -
echo $(openssl rand -hex 32) | docker secret create session_secret -

# Deploy
docker stack deploy -c docker-compose.yml htmldrop
```

**Note:** This approach requires modifying `secrets.mjs` to read from `/run/secrets/*` files when `*_FILE` environment variables are set.

## Why This Matters

**Without persistent secrets:**
- Every container restart generates new JWT secrets
- All active user sessions are invalidated
- Users are forced to log in again
- Poor user experience in production

**With persistent secrets:**
- Secrets remain the same across restarts
- User sessions stay valid
- Seamless updates and deployments
- Professional production behavior

## Verification

To verify secrets are persisting:

```bash
# Check the secrets file content
docker exec <container-id> cat /app/.env-persist/.env

# Restart the container
docker restart <container-id>

# Check again - secrets should be the same
docker exec <container-id> cat /app/.env-persist/.env
```

For docker-compose:
```bash
# View secrets
docker-compose exec app cat /app/.env-persist/.env

# Restart services
docker-compose restart

# Verify secrets unchanged
docker-compose exec app cat /app/.env-persist/.env
```

## Troubleshooting

### Secrets still changing after restart

1. Verify the volume is actually mounted:
   ```bash
   docker inspect <container-id> | grep Mounts -A 20
   ```

2. Check that `ENV_FILE_PATH` environment variable is set:
   ```bash
   docker exec <container-id> env | grep ENV_FILE_PATH
   ```

3. Verify the secrets file exists in the volume:
   ```bash
   docker exec <container-id> ls -la /app/.env-persist/
   ```

### Volume permissions issues

If the container can't write to the volume:

```yaml
services:
  app:
    user: "node"  # Use appropriate user
    volumes:
      - env-data:/app/.env-persist
```

Or ensure directory has correct permissions:
```bash
docker exec <container-id> chmod 777 /app/.env-persist
```
