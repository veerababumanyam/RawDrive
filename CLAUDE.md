# CLAUDE.md - RawDrive AI Context

RawDrive is an enterprise SaaS professional photography platform.

## Quick Reference

### Commands

```bash
# Development (start Docker first!)
docker compose -f infrastructure/docker/docker-compose.yml up -d
cd frontend && npm run dev         # localhost:3000
cd backend && uvicorn app.main:app --reload --port 8000

# Database
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# Testing
cd frontend && npm test            # Vitest
cd backend && pytest               # pytest
cd backend && pytest --cov=src

# Linting
cd frontend && npm run lint
cd backend && ruff check src && mypy src
```

### Project Structure

```
RawDrive/
├── frontend/          # React 19 + TypeScript + Vite + TailwindCSS
├── backend/           # Python 3.11 + FastAPI + SQLAlchemy + Alembic
├── ai-service/        # Python FastAPI + AI/LLM + MCP
├── services/          # Microservices (invitations-service)
├── infrastructure/    # Docker, nginx configs
├── docs/              # Documentation
├── specs/             # Feature specifications
└── .claude/skills/    # Claude Code skills (see below)
```

### Key Files

| Purpose | Location |
|---------|----------|
| **Frontend** | |
| API client | `frontend/src/services/api.ts` |
| UI Components | `frontend/src/components/ui/` |
| Hooks | `frontend/src/hooks/` |
| **Backend** | |
| Entry point | `backend/src/app/main.py` |
| API routes | `backend/src/app/api/v1/` |
| Services | `backend/src/app/services/` |
| Repositories | `backend/src/app/repositories/` |
| Migrations | `backend/migrations/versions/` |

### Environment Variables

```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<64-byte-hex>
R2_ACCESS_KEY_ID=, R2_SECRET_ACCESS_KEY=, R2_BUCKET_NAME=
AI_PROVIDER=, AI_API_KEY=, AI_MODEL=  # Never hardcode!
```

## Skills Reference

Claude Code loads skills automatically based on context. Use `/skill <name>` to invoke directly.

| Skill | Use When |
|-------|----------|
| `design-system` | Styling, tokens, AppButton/AppInput |
| `frontend-design` | Premium UI, effects, animations |
| `accessibility` | WCAG 2.1 AA, ARIA, keyboard nav |
| `security` | Auth, RBAC, encryption, SOC 2 |
| `testing` | Vitest, pytest patterns |
| `performance` | Caching, optimization |
| `saas-practices` | Multi-tenancy, billing |
| `ai-mcp-integration` | AI features, MCP tools |
| `webapp-testing` | Playwright E2E |
| `project-structure` | Codebase conventions |

## Critical Rules

### Multi-Tenant Isolation (ALWAYS)

```python
# EVERY query MUST include workspace_id
result = await db.execute(
    select(Asset).where(Asset.workspace_id == workspace_id)
)
# NEVER trust client-provided workspace_id
```

### Storage Key Format

```
workspaces/{workspace_id}/assets/{asset_id}/original/{filename}
```

### Never Hardcode

- API keys, secrets, credentials
- LLM provider names or model identifiers
- Colors (use design tokens)
- User-facing strings (use i18n)

### Input Validation

```python
from pydantic import BaseModel
class CreateGallery(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
```

## Code Style

### Naming

| Type | Convention |
|------|------------|
| React components | `PascalCase.tsx` |
| Python services | `snake_case.py` |
| API routes | `/api/v1/kebab-case` |
| Database tables | `snake_case` |
| Env vars | `SCREAMING_SNAKE` |

### Component Structure

```typescript
// 1. External imports
import React from 'react';
// 2. Types
import type { Gallery } from '@/types';
// 3. Internal
import { AppButton } from '@/components/ui';

interface Props { /* ... */ }

export const Component: React.FC<Props> = () => { /* ... */ };
```

### Backend Pattern

```python
# Repository → Service → API
# Services contain business logic
# Repositories handle database queries
# API routes handle HTTP concerns
```

## Common Patterns

### API Response

```typescript
{ data: T, pagination?: { total, page, limit } }
{ error: string, message: string, details?: [] }
```

### Background Jobs (Celery)

```python
from app.tasks import process_asset
process_asset.delay(asset_id=id, workspace_id=ws_id)
```

### Caching

```python
cached = await redis.get(f"gallery:{id}")
if cached: return json.loads(cached)
result = await db.get(id)
await redis.setex(f"gallery:{id}", 3600, json.dumps(result))
```

## Architecture Notes

### Microservices

| Service | Port | Purpose |
|---------|------|---------|
| Backend | 8000 | Main API |
| Face Worker | 8001 | Face detection |
| Admin | 8002 | Platform admin |
| Invitations | 8003 | Digital invitations |

### Auth Flow

- Access token: 15min (JWT)
- Refresh token: 7 days (httpOnly cookie)
- 2FA: TOTP via speakeasy
- Password: argon2

### Database

- PostgreSQL 16 + pgvector
- Redis 7 (cache, sessions, Celery)
- Alembic migrations

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, React Query |
| Backend | Python 3.11, FastAPI, SQLAlchemy, Pydantic, Celery |
| Database | PostgreSQL 16, pgvector, Redis 7 |
| Storage | Cloudflare R2, BYOS (S3-compatible) |
| AI | Cloud Vision, Gemini, local DeepFace |

## Useful Links

- Skills: `.claude/skills/*/SKILL.md`
- Tech Specs: `docs/TechnicalSpecs/`
- Test Users: `docs/TEST_USERS.md`
