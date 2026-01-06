# Gallery Microservice Integration - Setup Complete ✅

## What Was Implemented

The gallery microservice has been successfully integrated into RawDrive's local development environment. All configuration files, scripts, and documentation have been created.

## Files Created (8 new files)

### Kubernetes Deployment
1. `infrastructure/kubernetes/base/gallery-service/secrets-template.yaml` - Production secrets template
2. `infrastructure/kubernetes/base/gallery-service/README.md` - Kubernetes deployment guide

### Development Scripts
3. `scripts/dev-gallery-service.sh` - Unix/macOS/WSL startup script
4. `scripts/dev-gallery-service.ps1` - Windows PowerShell startup script
5. `scripts/test-gallery-integration.sh` - Unix integration tests
6. `scripts/test-gallery-setup.ps1` - Windows PowerShell integration tests
7. `scripts/start-gallery-dev.ps1` - Quick start script for Windows
8. `scripts/README-GALLERY.md` - Complete usage guide

## Files Modified (6 existing files)

1. `infrastructure/docker/docker-compose.yml` - Added gallery-service container
2. `infrastructure/docker/docker-compose.dev.yml` - Added dev configuration
3. `infrastructure/docker/traefik/dynamic.dev.yaml` - Added routing rules
4. `backend/.env.example` - Added gallery tuning variables
5. `CLAUDE.md` - Updated microservices table
6. `README.md` - Added gallery service commands

## Quick Start Guide

### Step 1: Start the Gallery Service

Open PowerShell in the project root and run:

```powershell
# Start all services including gallery
.\scripts\start-gallery-dev.ps1
```

**OR** start manually:

```powershell
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
```

### Step 2: Verify Installation

Run the test script:

```powershell
.\scripts\test-gallery-setup.ps1
```

Expected results:
- ✅ Docker is running
- ✅ Gallery service container is running
- ✅ Health endpoint responds (http://localhost:8004/health)
- ✅ Traefik routing works (http://localhost/api/v1/galleries)
- ✅ Metrics endpoint available (http://localhost:8004/metrics)
- ✅ Gallery routers visible in Traefik dashboard

### Step 3: Access the Service

Once running, access:

| Endpoint | URL | Purpose |
|----------|-----|---------|
| Health Check (direct) | http://localhost:8004/health | Direct service health |
| Health Check (via Traefik) | http://localhost/api/v1/galleries/../health | Verify routing |
| Gallery API | http://localhost/api/v1/galleries | Main API endpoint |
| Public Galleries | http://localhost/api/v1/public/galleries | Public access |
| Metrics | http://localhost:8004/metrics | Prometheus metrics |
| Traefik Dashboard | http://traefik.localhost:8080 | View routing config |

## Architecture Overview

### Routing Priority

The gallery service uses Traefik for intelligent request routing:

| Priority | Route | Service | Purpose |
|----------|-------|---------|---------|
| 150 | `/api/v1/photos/upload` | backend | Photo uploads |
| **140** | `/api/v1/galleries/*` | **gallery-service** | **Authenticated galleries** |
| **140** | `/api/v1/magic-links/*` | **gallery-service** | **Magic link management** |
| **140** | `/api/v1/ws/*` | **gallery-service** | **WebSocket proofing** |
| **135** | `/api/v1/public/galleries/*` | **gallery-service** | **Public access** |
| 130 | `/api/v1/ai/*` | backend | AI endpoints |
| 120 | `/api/v1/invitations/*` | invitations-service | Invitations |
| 100 | `/api/*` | backend | **Fallback** |

### Key Features

1. **Transparent Routing**: Frontend requires zero code changes - Traefik routes automatically
2. **High Performance**: Designed for 50K concurrent users with KEDA autoscaling
3. **3-Tier Caching**: Redis-based caching (L1: 5min, L2: 2min, L3: 30sec)
4. **Circuit Breaker**: Graceful Redis failure handling
5. **WebSocket Support**: Sticky sessions for real-time proofing
6. **Prometheus Metrics**: KEDA scaling triggers based on RPS, connections, latency

## Frontend Integration

**No code changes required!** The frontend will automatically use the gallery microservice through Traefik routing:

```typescript
// Existing code continues to work
import { galleryService } from '@/services/galleryService';

// These calls automatically route to gallery-service via Traefik
const galleries = await galleryService.listGalleries(workspaceId);
const gallery = await galleryService.getGallery(workspaceId, galleryId);
```

## Environment Configuration

### Required Variables

Ensure these are set in your `.env`:

```bash
# JWT (MUST match backend)
JWT_SECRET=your-jwt-secret-here

# R2 Storage
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=rawdrive
```

### Optional Tuning

```bash
# Gallery-specific performance tuning
GALLERY_DB_POOL_MIN_SIZE=10
GALLERY_DB_POOL_MAX_SIZE=100
GALLERY_REDIS_MAX_CONNECTIONS=50
```

## Verification Checklist

Run through this checklist to ensure everything works:

### Basic Health

- [ ] Container is running: `docker ps | findstr gallery`
- [ ] Health endpoint responds: `curl http://localhost:8004/health`
- [ ] No errors in logs: `docker logs rawdrive-gallery-service`

### Traefik Routing

- [ ] Traefik dashboard shows gallery routers: http://traefik.localhost:8080
- [ ] Gallery routers have priority 140 and 135
- [ ] Health check via Traefik works: `curl http://localhost/api/v1/galleries/../health`

### Frontend Integration

- [ ] Start frontend: `cd frontend && npm run dev`
- [ ] Open http://localhost:3000 in browser
- [ ] Navigate to gallery management page
- [ ] Gallery API calls succeed (check browser Network tab)
- [ ] Requests go to `http://localhost/api/v1/galleries/*`

### Metrics & Monitoring

- [ ] Metrics endpoint works: `curl http://localhost:8004/metrics`
- [ ] Metrics show `gallery_` prefixed entries
- [ ] Redis cache metrics visible

## Common Commands

```powershell
# View logs
docker logs rawdrive-gallery-service -f

# Restart service
docker restart rawdrive-gallery-service

# Stop service
docker stop rawdrive-gallery-service

# Rebuild and restart
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d --build gallery-service

# Check container status
docker ps | findstr gallery

# View container details
docker inspect rawdrive-gallery-service
```

## Troubleshooting

### Port 8004 Already in Use

```powershell
# Find what's using the port
netstat -ano | findstr :8004

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or change port in docker-compose files
```

### Container Won't Start

```powershell
# Check logs
docker logs rawdrive-gallery-service

# Common issues:
# 1. Missing .env - copy from .env.example
# 2. PostgreSQL not running - start it first
# 3. Redis not running - start it first
# 4. Build error - check Dockerfile in services/gallery-service/
```

### Traefik Routing Not Working

```powershell
# Restart Traefik to reload config
docker restart rawdrive-traefik

# Verify routers loaded
curl http://traefik.localhost:8080/api/http/routers | ConvertFrom-Json | Where-Object { $_.name -like "*gallery*" }
```

### Database Connection Errors

```powershell
# Verify PostgreSQL is running
docker ps | findstr postgres

# Check if gallery service can connect
docker exec rawdrive-gallery-service curl http://localhost:8000/health

# Verify DATABASE_URL in .env matches PostgreSQL config
```

## Production Deployment

For Kubernetes production deployment:

1. Review `infrastructure/kubernetes/base/gallery-service/README.md`
2. Create secrets from template: `infrastructure/kubernetes/base/gallery-service/secrets-template.yaml`
3. Configure KEDA scaling: `infrastructure/kubernetes/base/keda/gallery-scaledobject.yaml`
4. Deploy: `kubectl apply -k infrastructure/kubernetes/base/gallery-service/`

## Next Steps

1. ✅ Start the services: `.\scripts\start-gallery-dev.ps1`
2. ✅ Run tests: `.\scripts\test-gallery-setup.ps1`
3. ✅ Verify frontend integration
4. ✅ Monitor metrics and logs
5. 📝 Create a git commit to document these changes
6. 🚀 Plan production deployment

## Documentation

- Complete usage guide: `scripts/README-GALLERY.md`
- Kubernetes deployment: `infrastructure/kubernetes/base/gallery-service/README.md`
- Main project docs: `CLAUDE.md` and `README.md`

---

**Status**: Ready for testing ✅
**Zero frontend code changes required** ✅
**Rollback available** (stop gallery service, backend takes over) ✅
