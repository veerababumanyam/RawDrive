# Docker Compose Port Standardization - Summary

## Overview
This document summarizes the port standardization work completed to eliminate hard-coded ports and ensure all microservices use unique port numbers from the `.env` file.

## Issues Fixed

### 1. **services/invitations-service/docker-compose.yml**
**Problems:**
- Hard-coded port mapping `8001:8000` 
- Hard-coded internal port `8000` in healthcheck
- Hard-coded ports in DATABASE_URL and REDIS_URL defaults (5432, 6379)

**Solutions:**
- Changed port mapping to `${PORT_INVITATIONS:-8007}:${PORT_INVITATIONS:-8007}`
- Updated healthcheck to use `${PORT_INVITATIONS:-8007}`
- Updated all connection strings to use `${PORT_POSTGRES:-5432}` and `${PORT_REDIS:-6379}`
- Added `PORT=${PORT_INVITATIONS:-8007}` environment variable

### 2. **infrastructure/docker/docker-compose.yml**
**Problems:**
- Line 452: invitations-worker had hard-coded internal port `8000` (conflicting with backend)
- Line 383: one-api had hard-coded internal port `3000` (conflicting with Grafana)
- Line 389: one-api PORT environment variable was hard-coded to `3000`

**Solutions:**
- Changed invitations-worker port mapping from `:8000` to `:${PORT_INVITATIONS_WORKER}`
- Changed one-api port mapping from `:3000` to `:${PORT_ONE_API_INTERNAL:-3002}`
- Updated one-api PORT environment variable to `${PORT_ONE_API_INTERNAL:-3002}`

## Port Allocation Summary

### Infrastructure Services (Standard Ports - OK to keep)
These services use standard ports internally and are isolated in containers:
- **Traefik HTTP**: 80 (external: ${PORT_TRAEFIK_HTTP})
- **Traefik HTTPS**: 443 (external: ${PORT_TRAEFIK_HTTPS})
- **Traefik Dashboard**: 8080 (external: ${PORT_TRAEFIK_DASHBOARD})
- **Traefik Metrics**: 8082 (external: ${PORT_TRAEFIK_METRICS})
- **PostgreSQL**: 5432 (external: ${PORT_POSTGRES})
- **Redis**: 6379 (external: ${PORT_REDIS})
- **PgBouncer**: 6432 (external: ${PORT_PGBOUNCER})
- **Prometheus**: 9090 (external: ${PORT_PROMETHEUS})
- **Alertmanager**: 9093 (external: ${PORT_ALERTMANAGER})
- **Grafana**: 3000 (external: ${PORT_GRAFANA})
- **Loki**: 3100 (external: ${PORT_LOKI})
- **Promtail**: 9080 (external: ${PORT_PROMTAIL})
- **Node Exporter**: 9100 (external: ${PORT_NODE_EXPORTER})
- **Redis Exporter**: 9121 (external: ${PORT_REDIS_EXPORTER})

### Application Microservices (Must be Unique)
All application services now use unique ports both externally and internally:
- **Backend**: 8000 (${PORT_BACKEND})
- **Face Worker**: 8001 (${PORT_FACE_WORKER})
- **Content Worker**: 8002 (${PORT_CONTENT_WORKER})
- **Quality Worker**: 8003 (${PORT_QUALITY_WORKER})
- **Gallery Service**: 8004 (${PORT_GALLERY})
- **Billing Service**: 8005 (${PORT_BILLING})
- **Onboarding Service**: 8006 (${PORT_ONBOARDING})
- **Invitations API**: 8007 (${PORT_INVITATIONS})
- **Upload Service**: 8008 (${PORT_UPLOAD})
- **Invitations Worker**: 8009 (${PORT_INVITATIONS_WORKER})
- **One-API**: 3002 (external), 3002 (internal via ${PORT_ONE_API_INTERNAL})

## Current .env Port Configuration

```env
# Infrastructure Ports
PORT_TRAEFIK_HTTP=80
PORT_TRAEFIK_HTTPS=443
PORT_TRAEFIK_DASHBOARD=8080
PORT_TRAEFIK_METRICS=8082
PORT_POSTGRES=5432
PORT_REDIS=6379
PORT_REDIS_EXPORTER=9121
PORT_PGBOUNCER=6432
PORT_PROMETHEUS=9090
PORT_ALERTMANAGER=9093
PORT_GRAFANA=3000
PORT_LOKI=3100
PORT_PROMTAIL=9080
PORT_ONE_API=3002
PORT_NODE_EXPORTER=9100

# Application Microservices Ports
PORT_BACKEND=8000
PORT_FACE_WORKER=8001
PORT_CONTENT_WORKER=8002
PORT_QUALITY_WORKER=8003
PORT_GALLERY=8004
PORT_BILLING=8005
PORT_ONBOARDING=8006
PORT_INVITATIONS=8007
PORT_UPLOAD=8008
PORT_INVITATIONS_WORKER=8009
```

## Missing Environment Variable

The following variable should be added to `.env`:
```env
PORT_ONE_API_INTERNAL=3002
```

This ensures one-api uses port 3002 internally instead of the default 3000 which conflicts with Grafana.

## Verification Checklist

- [x] No hard-coded ports in `services/invitations-service/docker-compose.yml`
- [x] No hard-coded ports in `infrastructure/docker/docker-compose.yml`
- [x] All application microservices use unique ports (8000-8009)
- [x] Infrastructure services use standard ports (isolated in containers)
- [x] All port mappings use environment variables
- [x] All healthchecks use environment variables for ports
- [x] All inter-service communication uses environment variables

## Port Conflict Resolution

### Before:
- **Backend**: 8000
- **Invitations Worker**: 8000 ❌ CONFLICT
- **Grafana**: 3000
- **One-API**: 3000 ❌ CONFLICT

### After:
- **Backend**: 8000 ✅
- **Invitations Worker**: 8009 ✅
- **Grafana**: 3000 ✅
- **One-API**: 3002 (internal) ✅

## Testing Recommendations

1. **Restart all services** to apply the new port configuration:
   ```powershell
   docker compose -f infrastructure/docker/docker-compose.yml down
   docker compose -f infrastructure/docker/docker-compose.yml up -d
   ```

2. **Verify each service** is running on its assigned port:
   ```powershell
   docker ps --format "table {{.Names}}\t{{.Ports}}"
   ```

3. **Check for port conflicts**:
   ```powershell
   netstat -ano | findstr "LISTENING" | findstr "8000 8001 8002 8003 8004 8005 8006 8007 8008 8009"
   ```

4. **Test health endpoints** for all services:
   ```powershell
   curl http://localhost:8000/health  # Backend
   curl http://localhost:8001/health  # Face Worker
   curl http://localhost:8002/health  # Content Worker
   curl http://localhost:8003/health  # Quality Worker
   curl http://localhost:8004/health  # Gallery
   curl http://localhost:8005/health  # Billing
   curl http://localhost:8006/health  # Onboarding
   curl http://localhost:8007/health  # Invitations
   curl http://localhost:8008/health  # Upload
   ```

## Notes

- Infrastructure services (Postgres, Redis, Grafana, etc.) use their standard internal ports (5432, 6379, 3000, etc.) which is acceptable since they run in isolated containers
- Application microservices must use unique ports both internally and externally to avoid conflicts
- All port references now use environment variables, making it easy to change port assignments in the future
- The `.env` file is the single source of truth for all port configurations
