---
description: Initialize and start the RawDrive photography platform locally
---

# Initialize RawDrive Project

Set up and start all RawDrive services for local development.

## References

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product requirements and architecture overview
- **Best Practices**:
  - [Deployment Best Practices](../reference/deployment-best-practices.md)
  - [Microservices Patterns](../reference/microservices-patterns.md)
  - [Observability Best Practices](../reference/observability-best-practices.md)

## Prerequisites

- Docker Desktop installed and running
- Node.js 18+ and pnpm installed
- Git

## Quick Start (Recommended)

### 1. One-Command Setup

```powershell
# Windows (PowerShell) - Run from project root
.\setup-dev-environment.ps1
```

This automated setup will:
- ✅ Start all Docker services (PostgreSQL, Redis, microservices)
- ✅ Run database migrations
- ✅ Install dependencies (including psycopg2-binary)
- ✅ Seed test users
- ✅ Build shared packages (@rawdrive/shared-types, etc.)
- ✅ Verify all services are healthy

### 2. Start Frontend

```bash
cd frontend && pnpm dev  # http://localhost:5173
```

### 3. Test Login

- Email: `free@test.rawdrive.in`
- Password: `Test@123`

## Manual Setup (Advanced)

### 1. Start Docker Services

```bash
# Windows
start-all-services.bat

# Or use Docker Compose directly
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### 2. Install Backend Dependencies

```bash
docker exec rawdrive-backend pip install psycopg2-binary
```

### 3. Run Database Migrations

```bash
docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head"
```

### 4. Seed Test Users

```bash
docker exec -e DATABASE_URL="postgresql://rawdrive:rawdrive@postgres:5432/rawdrive" \
  rawdrive-backend python seed_all_test_users.py
```

### 5. Build Shared Packages

```bash
cd packages/shared-types && pnpm build
cd ../shared-constants && pnpm build
cd ../shared-validation && pnpm build
cd ../shared-utils && pnpm build
cd ../../
```

### 6. Install Frontend Dependencies

```bash
cd frontend
pnpm install
pnpm dev  # Start frontend
```

## Service URLs

All services running in Docker:

- **Frontend App**: http://localhost:5173
- **Backend API**: http://localhost/api (via Traefik)
- **Gallery Service**: http://localhost:8004
- **Billing Service**: http://localhost:8005
- **Upload Service**: http://localhost:8008
- **AI Service**: http://localhost:8013
- **Webhooks Service**: http://localhost:8003
- **Traefik Dashboard**: http://traefik.localhost
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090

## Test Users

All users have password: `Test@123`

- `free@test.rawdrive.in` - Free Plan (1GB, 3 galleries)
- `starter@test.rawdrive.in` - Starter Plan (10GB, 10 galleries)
- `professional@test.rawdrive.in` - Professional Plan (100GB, 50 galleries)
- `business@test.rawdrive.in` - Business Plan (1TB, 200 galleries)
- `enterprise@test.rawdrive.in` - Enterprise Plan (Unlimited)

## Verify Services

```bash
# Check all services
manage-services.bat status

# View logs
manage-services.bat logs

# View specific service logs
manage-services.bat logs gallery-service
```

## Cleanup

```bash
# Stop all services
manage-services.bat stop

# Or stop Docker services
docker compose -f infrastructure/docker/docker-compose.yml down
```

## Troubleshooting

### Services won't start
- Ensure Docker Desktop is running
- Check port conflicts (5173, 8000, 5432, 6379)
- Run `docker compose logs` to see errors

### Database migration errors
- Ensure psycopg2-binary is installed in backend container
- Check DATABASE_URL is correct
- Verify PostgreSQL is running

### Frontend build errors
- Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`
- Rebuild shared packages: `pnpm build:packages`

## Notes

- All services configured with `restart: unless-stopped` for auto-recovery
- 22 total services: 8 microservices + 4 workers + 10 infrastructure
- Shared packages use pnpm workspaces for monorepo management
