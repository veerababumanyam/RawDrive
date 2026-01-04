# Production Troubleshooting Guide

> **Last Updated:** January 2026
> **Environment:** Production (rawdrive-vps)

## Table of Contents

1. [Quick Reference Commands](#quick-reference-commands)
2. [Frontend Issues](#frontend-issues)
3. [Backend Issues](#backend-issues)
4. [Database Issues](#database-issues)
5. [Docker & Infrastructure](#docker--infrastructure)
6. [Deployment Procedures](#deployment-procedures)

---

## Quick Reference Commands

### SSH to Production
```bash
ssh rawdrive-vps
```

### Service Status
```bash
# All containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Specific service logs
docker logs rawdrive-backend --tail 50
docker logs rawdrive-face-worker --tail 50

# Resource usage
docker stats --no-stream
```

### Quick Deploy
```bash
# Pull and restart backend
cd /opt/RawDrive && git pull origin main
cd infrastructure/docker && docker compose --env-file ../../.env up -d backend --force-recreate

# Rebuild frontend
cd /opt/RawDrive/frontend && npm run build
# Or use PM2 if configured
pm2 restart all
```

---

## Frontend Issues

### 1. API Calls Going to localhost:8000

**Symptoms:**
- 404 errors on API calls in browser console
- Network tab shows requests to `http://localhost:8000/...`
- Works locally but fails in production

**Root Cause:**
JavaScript falsy value handling. Empty string `""` is falsy, so:
```javascript
// WRONG - treats empty string as falsy
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// CORRECT - only use fallback if undefined
const API_URL = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:8000'
```

**Diagnosis:**
```bash
# Check what VITE_API_URL is set to in production build
grep -r "localhost:8000" /var/www/rawdrive-frontend/assets/*.js
```

**Files Commonly Affected:**
- `frontend/src/hooks/useUpload.ts`
- `frontend/src/hooks/useSocket.ts`
- `frontend/src/services/api.ts`
- `frontend/src/services/galleryService.ts`
- `frontend/src/services/tusUploadService.ts`
- `frontend/src/services/auth.ts`

**Solution:**
1. Fix the pattern in source code
2. Rebuild frontend: `npm run build`
3. Deploy built assets to production

---

### 2. CORS Errors

**Symptoms:**
- Browser console shows CORS policy errors
- API calls blocked by browser

**Root Cause:**
- `ALLOWED_CORS_ORIGINS` not configured correctly
- Missing domain in allowed origins list

**Diagnosis:**
```bash
# Check backend CORS config
docker exec rawdrive-backend env | grep CORS
```

**Solution:**
Add domain to `.env`:
```bash
ALLOWED_CORS_ORIGINS=https://rawdrive.ai,https://www.rawdrive.ai
```

---

### 3. OAuth Login Fails

**Symptoms:**
- Google/OAuth login redirects fail
- "Invalid redirect_uri" errors

**Root Cause:**
- Redirect URI not registered in OAuth provider
- `PUBLIC_URL` environment variable incorrect

**Solution:**
1. Check `PUBLIC_URL` in `.env` matches production domain
2. Add redirect URIs to Google Cloud Console:
   - `https://rawdrive.ai/auth/callback`
   - `https://rawdrive.ai/workspace`

---

## Backend Issues

### 1. 500 Internal Server Error

**Diagnosis:**
```bash
# Check backend logs for stack trace
docker logs rawdrive-backend --tail 100 2>&1 | grep -A 20 "ERROR\|Exception\|Traceback"
```

**Common Causes:**

#### Missing Environment Variable
```bash
# Check all required env vars are set
docker exec rawdrive-backend env | sort
```

#### Database Query Error
```bash
# Check for SQL errors
docker logs rawdrive-backend 2>&1 | grep -i "sqlalchemy\|asyncpg\|database"
```

#### Import Error
```bash
# Check for import issues
docker logs rawdrive-backend 2>&1 | grep -i "import\|module"
```

---

### 2. Wrong Table Alias in SQL

**Example Error:**
```
asyncpg.exceptions.UndefinedColumnError: column ga.deleted_at does not exist
```

**Root Cause:**
Using wrong table alias in JOIN queries. `deleted_at` might be on `assets` table, not `gallery_assets`.

**Diagnosis:**
```bash
# Find the query in code
grep -rn "ga.deleted_at" backend/src/

# Check table schema
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "\d gallery_assets"
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "\d assets"
```

**Solution:**
Fix the table alias in the query (e.g., change `ga.deleted_at` to `a.deleted_at`).

---

### 3. Upload Failures (422/500)

**Symptoms:**
- File uploads fail
- "Commit" endpoint returns 404 or 422

**Diagnosis:**
```bash
# Check upload-related logs
docker logs rawdrive-backend 2>&1 | grep -i "upload\|commit\|tus"

# Check R2 connectivity
docker exec rawdrive-backend python -c "
from app.services.r2_storage_service import R2StorageService
import asyncio
async def test():
    svc = R2StorageService()
    print('R2 connected:', svc.client is not None)
asyncio.run(test())
"
```

**Common Causes:**
- R2 credentials not set
- Missing upload service imports
- TUS upload session expired

---

## Database Issues

### 1. Migration Failures

**Symptoms:**
- `alembic upgrade head` fails
- "Column already exists" or "Column does not exist" errors

**Diagnosis:**
```bash
# Check current migration state
cd /opt/RawDrive/backend
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" alembic current

# Check migration history
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" alembic history --verbose
```

**Solution:**
```bash
# If migration is partially applied, stamp to current state
DATABASE_URL="..." alembic stamp <revision_id>

# Then retry upgrade
DATABASE_URL="..." alembic upgrade head
```

---

### 2. Connection Pool Exhausted

**Symptoms:**
- "too many connections" errors
- Slow API responses
- Timeouts

**Diagnosis:**
```bash
# Check active connections
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT count(*), state FROM pg_stat_activity WHERE datname = 'rawdrive' GROUP BY state;"
```

**Solution:**
```bash
# Restart services to release connections
docker restart rawdrive-backend rawdrive-face-worker

# Or increase pool limits in .env
DB_POOL_MAX_SIZE=20
```

---

### 3. Query Performance Issues

**Diagnosis:**
```bash
# Find slow queries
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;"

# Check table sizes
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables
   ORDER BY pg_total_relation_size(relid) DESC
   LIMIT 10;"
```

**Solution:**
- Add missing indexes
- Optimize queries with EXPLAIN ANALYZE
- Consider partitioning large tables

---

## Docker & Infrastructure

### 1. Container Won't Start

**Diagnosis:**
```bash
# Check container logs
docker logs rawdrive-backend 2>&1 | head -50

# Check container exit code
docker inspect rawdrive-backend --format '{{.State.ExitCode}}'

# Check available resources
df -h  # Disk space
free -m  # Memory
```

**Common Causes:**
- Missing environment variables
- Port already in use
- Out of disk space
- Out of memory

---

### 2. Container Keeps Restarting

**Diagnosis:**
```bash
# Check restart count
docker inspect rawdrive-face-worker --format '{{.RestartCount}}'

# Check for OOM kills
docker events --since 1h --filter 'event=oom'

# Check container health
docker inspect rawdrive-backend --format '{{.State.Health.Status}}'
```

**Solution:**
- Increase memory limits
- Fix application errors causing crashes
- Check health check configuration

---

### 3. Docker Compose Issues

**Diagnosis:**
```bash
# Validate compose file
cd /opt/RawDrive/infrastructure/docker
docker compose config

# Check service dependencies
docker compose ps
```

**Common Commands:**
```bash
# Rebuild specific service
docker compose build backend --no-cache

# Force recreate
docker compose --env-file ../../.env up -d backend --force-recreate

# View all logs
docker compose logs -f

# Clean up unused resources
docker system prune -f
```

---

## Deployment Procedures

### Standard Backend Deploy
```bash
ssh rawdrive-vps << 'EOF'
cd /opt/RawDrive
git pull origin main
cd infrastructure/docker
docker compose --env-file ../../.env up -d backend --force-recreate
sleep 5
docker logs rawdrive-backend --tail 20
EOF
```

### Standard Frontend Deploy
```bash
ssh rawdrive-vps << 'EOF'
cd /opt/RawDrive/frontend
npm run build
# Copy to nginx served directory if separate
# cp -r dist/* /var/www/rawdrive-frontend/
EOF
```

### Full Stack Deploy
```bash
ssh rawdrive-vps << 'EOF'
cd /opt/RawDrive
git pull origin main

# Backend
cd infrastructure/docker
docker compose --env-file ../../.env up -d --force-recreate

# Frontend
cd ../../frontend
npm run build

# Verify
docker ps
curl -s http://localhost:8000/health
EOF
```

### Rollback Procedure
```bash
ssh rawdrive-vps << 'EOF'
cd /opt/RawDrive

# Find previous commit
git log --oneline -10

# Rollback to specific commit
git checkout <commit-hash>

# Redeploy
cd infrastructure/docker
docker compose --env-file ../../.env up -d --force-recreate
EOF
```

---

## Monitoring Checklist

### Daily Health Check
- [ ] All containers running: `docker ps`
- [ ] No error logs: `docker logs rawdrive-backend --since 24h 2>&1 | grep -c ERROR`
- [ ] Database connections healthy
- [ ] Face detection jobs processing
- [ ] Disk space > 20% free

### Weekly Maintenance
- [ ] Review failed jobs and clear if needed
- [ ] Check log rotation
- [ ] Verify backups are running
- [ ] Review resource usage trends

---

## Related Documentation

- [Face Detection Worker Troubleshooting](./FACE_DETECTION_WORKER.md)
- [Docker Compose Configuration](../../infrastructure/docker/docker-compose.yml)
- [Environment Variables Reference](../../.env.example)
