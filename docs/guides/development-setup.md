# Development Environment Setup

**Last Updated**: 2026-01-09  
**Status**: Active

Complete guide to setting up the RawDrive development environment from scratch. Use this when onboarding new developers or setting up a new machine.

## 📋 Prerequisites

Before starting, ensure you have:

- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **Node.js** 18+ and **pnpm** 8+
- **Git** for version control
- **VS Code** (recommended IDE)
- **PowerShell** 7+ (Windows) or **Bash** (Linux/Mac)

## 🚀 Quick Start (Recommended)

### One-Command Setup

We provide automated scripts that handle the entire setup process:

**Windows (PowerShell)**:
```powershell
.\setup-dev-environment.ps1
```

**Linux / macOS / WSL**:
```bash
bash scripts/setup-all.sh
```

**What this does**:
1. Starts all Docker containers (PostgreSQL, Redis, Microservices)
2. Installs backend dependencies inside containers
3. Runs database migrations (`alembic upgrade head`)
4. Seeds test users and data
5. Builds all shared packages (`pnpm build:packages`)

### Manual Setup

If you prefer manual control or the automated script fails:

#### 1. Start Infrastructure
```bash
# Start all Docker services
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d

# Wait for services to be healthy (2-3 minutes)
docker compose -f infrastructure/docker/docker-compose.yml ps
```

#### 2. Build Shared Packages
```bash
# Install dependencies
pnpm install

# Build all shared packages (REQUIRED before frontend)
pnpm build:packages
```

#### 3. Run Database Migrations
```bash
# Run migrations
docker exec rawdrive-backend alembic upgrade head

# Seed test users
docker exec rawdrive-backend python backend/scripts/seed_all_test_users.py
```

#### 4. Start Frontend
```bash
cd frontend
pnpm dev
```

## 🌐 Service URLs

After setup, access services at:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend** | http://localhost:5173 | See Test Users below |
| **Backend API** | http://localhost:8000 | - |
| **Gallery Service** | http://localhost:8004 | - |
| **Billing Service** | http://localhost:8005 | - |
| **Upload Service** | http://localhost:8008 | - |
| **Traefik Dashboard** | http://localhost:8080 | - |
| **Grafana** | http://localhost:3000 | admin/admin |
| **Prometheus** | http://localhost:9090 | - |

### Test Login

Use these credentials to test the application:

- **Email**: `free@test.rawdrive.in`
- **Password**: `Test@123`

**📖 For all test users, see**: [Test Users Guide](../development/test-users.md)

## 📦 Monorepo & Shared Packages

RawDrive uses a **pnpm workspace monorepo** with shared packages:

| Package | Purpose | Exports |
|---------|---------|---------|
| `@rawdrive/shared-types` | Domain types | `InvitationStatus`, `GalleryStatus`, etc. |
| `@rawdrive/shared-constants` | Configuration | `API_BASE`, `STORAGE`, `AI_THRESHOLDS` |
| `@rawdrive/shared-validation` | Validation | `isValidHexColor`, `sanitizeHtml` |
| `@rawdrive/shared-utils` | Utilities | `formatRelativeDate`, `formatFileSize` |

### Critical Build Requirement

**These packages MUST be built before the frontend can run.** They do NOT transpile on-the-fly.

```bash
# Build all shared packages
pnpm build:packages

# Build specific package
pnpm --filter @rawdrive/shared-types run build

# Verify build artifacts exist
ls packages/shared-types/dist
```

### Common Build Issues

If you see errors like:
- `Cannot find module '@rawdrive/shared-types'`
- `Internal server error: Failed to resolve entry for package`
- `ReferenceError: exports is not defined`

**Solution**:
```bash
# 1. Clean and rebuild
pnpm clean:packages
pnpm build:packages

# 2. Verify artifacts
ls packages/*/dist

# 3. Restart frontend dev server
cd frontend
pnpm dev
```

## 🗄️ Database Management

### Database Access

```bash
# Connect to PostgreSQL
docker exec -it rawdrive-postgres psql -U rawdrive -d rawdrive

# Connect via PgBouncer (connection pooling)
docker exec -it rawdrive-postgres psql -h pgbouncer -p 6432 -U rawdrive -d rawdrive
```

### Migrations

```bash
# Run migrations
docker exec rawdrive-backend alembic upgrade head

# Create new migration
docker exec rawdrive-backend alembic revision -m "description"

# Rollback one migration
docker exec rawdrive-backend alembic downgrade -1

# View migration history
docker exec rawdrive-backend alembic history
```

### Reset Database

```bash
# Stop and remove all containers + volumes
docker compose -f infrastructure/docker/docker-compose.yml down -v

# Start fresh
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Re-run setup
.\setup-dev-environment.ps1
```

### Verify Seeds

```bash
# Check user count
docker exec rawdrive-backend python -c "from src.app.core.db import SessionLocal; from src.app.models.user import User; db = SessionLocal(); print(f'Users: {db.query(User).count()}')"

# List test users
docker exec rawdrive-backend python backend/scripts/check_test_users.py
```

## 🐳 Docker Service Management

### Using Management Script (Recommended)

```bash
# Start all services
manage-services.bat start

# Stop all services
manage-services.bat stop

# Restart all services
manage-services.bat restart

# Check status
manage-services.bat status

# View logs (all services)
manage-services.bat logs

# View logs (specific service)
manage-services.bat logs gallery-service
```

### Direct Docker Compose

```bash
# Start services
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Stop services
docker compose -f infrastructure/docker/docker-compose.yml down

# View status
docker compose -f infrastructure/docker/docker-compose.yml ps

# View logs
docker compose -f infrastructure/docker/docker-compose.yml logs -f

# Rebuild specific service
docker compose -f infrastructure/docker/docker-compose.yml up -d --build gallery-service
```

### All Services (20 total)

**Microservices (12)** — ports from `PORT_*` in `.env`:
- backend (PORT_BACKEND=8000) - Main API
- gallery-service (PORT_GALLERY=8004) - Gallery viewing
- billing-service (PORT_BILLING=8005) - Payments
- onboarding-service (PORT_ONBOARDING=8006) - Registration
- invitations-api (PORT_INVITATIONS=8007) - Invitations
- upload-service (PORT_UPLOAD=8008) - File uploads
- notifications-service (PORT_NOTIFICATIONS=8010) - Notifications
- client-service (PORT_CLIENT=8011) - CRM
- ai-processing (PORT_AI_PROCESSING=8012) - Embeddings, CLIP
- ai-service-mcp (PORT_AI_SERVICE=8013) - AI orchestration
- webhooks-service (PORT_WEBHOOKS=8015) - Webhook delivery
- growth-service (PORT_FACE_SERVICE=8016) - Referrals

**Workers (3)**:
- face-worker (PORT_FACE_WORKER=8001) - Face detection
- content-worker (PORT_CONTENT_WORKER=8002) - Content analysis
- quality-worker (PORT_QUALITY_WORKER=8003) - Quality scoring

**Infrastructure (11)**:
- postgres (PORT_POSTGRES=5432) - PostgreSQL 16 + pgvector
- redis (PORT_REDIS=6379) - Redis 7
- pgbouncer (PORT_PGBOUNCER=6432) - Connection pooler
- traefik (80, 443, 8080) - API Gateway
- prometheus (PORT_PROMETHEUS=9090) - Metrics
- grafana (PORT_GRAFANA=3000) - Dashboards
- loki (PORT_LOKI=3100) - Logs
- milvus (PORT_MILVUS=19530) - Vector DB
- etcd (PORT_ETCD=2379) - Service discovery
- minio (PORT_MINIO=9000) - Object storage
- one-api (PORT_ONE_API=3002) - AI gateway

## 🛠️ IDE Configuration

### VS Code (Recommended)

1. **Open Workspace**: Open the project root in VS Code
2. **Install Extensions**:
   - ESLint
   - Prettier
   - Python
   - Docker
   - GitLens

3. **Configure TypeScript**:
   - Use Workspace TypeScript version
   - Enable "TypeScript: Enable Prompt" in settings

4. **Recommended Settings** (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true
}
```

## 🔍 Health Checks

### Quick Health Check

```bash
# Check all services
docker compose -f infrastructure/docker/docker-compose.yml ps

# Check specific service health
docker inspect rawdrive-gallery-service --format='{{.State.Health.Status}}'

# Test API endpoints
curl http://localhost:8000/health/live
curl http://localhost:8004/health/live
curl http://localhost:8005/health/live
```

### Expected Output

All services should show `healthy` status:
```
postgres        healthy
redis           healthy
backend         healthy
gallery-service healthy
billing-service healthy
upload-service  healthy
```

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Windows: Find process using port
netstat -ano | findstr :8004

# Kill process (replace PID)
taskkill /F /PID <PID>

# Linux/Mac: Find and kill
lsof -ti:8004 | xargs kill -9
```

### Service Won't Start

```bash
# Check logs
docker compose -f infrastructure/docker/docker-compose.yml logs gallery-service

# Rebuild service
docker compose -f infrastructure/docker/docker-compose.yml up -d --build gallery-service

# Check container status
docker ps -a | grep gallery-service
```

### Frontend Build Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules frontend/node_modules packages/*/node_modules
pnpm install

# Rebuild shared packages
pnpm build:packages

# Clear Vite cache
rm -rf frontend/.vite
cd frontend && pnpm dev
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check connection
docker exec rawdrive-postgres pg_isready

# View PostgreSQL logs
docker logs rawdrive-postgres

# Reset database
docker compose -f infrastructure/docker/docker-compose.yml down -v
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

## 📝 Common Development Tasks

### Running Tests

```bash
# Frontend tests
cd frontend
pnpm test

# Backend tests
docker exec rawdrive-backend pytest

# Specific test file
docker exec rawdrive-backend pytest tests/test_auth.py

# With coverage
docker exec rawdrive-backend pytest --cov=src
```

### Code Quality

```bash
# Frontend linting
cd frontend
pnpm lint
pnpm lint:fix

# Backend linting
docker exec rawdrive-backend black .
docker exec rawdrive-backend isort .
docker exec rawdrive-backend mypy src
```

### Building for Production

```bash
# Build frontend
cd frontend
pnpm build

# Build Docker images
docker compose -f infrastructure/docker/docker-compose.yml build

# Build specific service
docker compose -f infrastructure/docker/docker-compose.yml build gallery-service
```

## 📚 Next Steps

After setup, explore:

1. **[Test Users Guide](../development/test-users.md)** - Test account details
2. **[Testing Guide](testing.md)** - Running and writing tests
3. **[Coding Standards](../development/coding-standards.md)** - Code style guide
4. **[Architecture Overview](../architecture/overview.md)** - System architecture
5. **[Troubleshooting Guide](troubleshooting.md)** - Common issues

## 🆘 Getting Help

1. Check [Troubleshooting Guide](troubleshooting.md)
2. Review [Architecture Documentation](../architecture/overview.md)
3. Consult [Claude Code References](../../.claude/reference/)
4. Check service logs: `manage-services.bat logs <service>`

---

**Related Documentation**:
- [Docker Quick Start](docker-quick-start.md)
- [Testing Guide](testing.md)
- [Deployment Guide](deployment.md)
- [Troubleshooting](troubleshooting.md)
