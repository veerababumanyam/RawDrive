# Quickstart Guide - RawDrive

This guide provides step-by-step instructions to get RawDrive up and running locally.

## Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for frontend development)
- pnpm 8+ (package manager for monorepo)
- Python 3.11+ (optional, for local development)

## 1. Environment Setup

### Start Development Stack
```bash
# Full development stack (recommended)
docker compose -f infrastructure/docker/docker-compose.yml up -d

# OR backend-only development (faster for backend work)
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
```

This starts PostgreSQL + pgvector, Redis, and all backend services.

### Install Dependencies (pnpm Workspaces)
```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install all workspace dependencies (frontend + shared packages)
pnpm install

# Build shared packages
pnpm build:packages
```

## 2. Database Setup

### Run Migrations
```bash
docker compose -f infrastructure/docker/docker-compose.yml exec backend alembic upgrade head
```

### Seed Development Data
```bash
docker compose -f infrastructure/docker/docker-compose.yml exec backend python -m src.scripts.seed_user
```

## 3. Start Services

### Development Mode
```bash
# Frontend (React dev server)
cd frontend && npm run dev

# Backend (FastAPI) - runs inside Docker
# Already started with docker compose above
```

Services will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- AI Service: http://localhost:8001

### Alternative: Individual Services
```bash
# Frontend only
cd frontend && npm run dev

# Backend only (if not using Docker)
cd backend && uvicorn app.main:app --reload --port 8000
```

## 4. Start Background Workers

Background workers start automatically with the Docker stack. If running locally:

```bash
# Using Docker
docker compose -f infrastructure/docker/docker-compose.yml exec backend celery -A src.tasks worker --loglevel=info

# OR locally
cd backend && celery -A src.tasks worker --loglevel=info
```

## 5. Verify Installation

### Health Check
```bash
curl http://localhost:8000/api/v1/health
```

### Test AI Tagging
1. Upload a photo via the frontend
2. Check gallery health dashboard for AI analysis status
3. Use search with tags/people filters

## Testing

### Run Backend Tests
```bash
docker compose -f infrastructure/docker/docker-compose.yml exec backend pytest
docker compose -f infrastructure/docker/docker-compose.yml exec backend pytest --cov=src
```

### Run Frontend Tests
```bash
cd frontend && npm test
```

### Run Shared Package Tests
```bash
# Test all shared packages
pnpm test:packages

# Run cross-platform type parity tests
pnpm test:parity
```

## Troubleshooting

### Database Connection Issues
- Ensure Docker containers are running: `docker compose -f infrastructure/docker/docker-compose.yml ps`
- Check logs: `docker compose -f infrastructure/docker/docker-compose.yml logs postgres`

### Worker Not Processing
- Check worker logs: `docker compose -f infrastructure/docker/docker-compose.yml logs worker`
- Verify Redis connection: `docker compose -f infrastructure/docker/docker-compose.yml exec redis redis-cli ping`

### AI Provider Issues

### AI Provider Issues
- Check AI service logs
- Verify API keys in environment variables

## Working with Shared Packages

RawDrive uses pnpm workspaces for shared code across frontend, backend, and microservices.

### Adding New Shared Types

1. Add TypeScript types in `packages/shared-types/src/`
2. Export from `packages/shared-types/src/index.ts`
3. Generate Python models: `pnpm generate:python`
4. Use in frontend: `import { MyType } from '@rawdrive/shared-types'`
5. Use in backend: `from app.shared.types import MyType`

### Available Packages

| Package | Import (TS) | Import (Python) |
|---------|-------------|-----------------|
| Types | `@rawdrive/shared-types` | `app.shared.types` |
| Constants | `@rawdrive/shared-constants` | `app.shared.constants` |
| Validation | `@rawdrive/shared-validation` | `app.shared.validation` |
| Utils | `@rawdrive/shared-utils` | N/A (TS only) |

## Next Steps

- Explore the [API Documentation](./api/)
- Review [Architecture Overview](./ARCHITECTURE_QUICK_REFERENCE.md)
- Check [Development Roadmap](./DEVELOPMENT_ROADMAP.md)