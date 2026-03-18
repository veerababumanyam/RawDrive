# Codebase Structure

**Analysis Date:** 2026-03-18

## Directory Layout

```
RawDrive2/
├── backend/                          # Main FastAPI backend (monolithic + workers)
│   ├── src/app/
│   │   ├── main.py                  # Entry point, app initialization
│   │   ├── api/v1/                  # HTTP endpoints (auth, users, workspaces, albums, etc.)
│   │   ├── models/                  # Pydantic models (User, Album, Gallery, etc.)
│   │   ├── repositories/            # Data access layer (AlbumRepository, etc.)
│   │   ├── services/                # Business logic services
│   │   ├── schemas/                 # Request/response validation schemas
│   │   ├── middleware/              # Correlation, rate limit, timeout, audit logging
│   │   ├── config/                  # Environment config, settings
│   │   ├── db/                      # PostgreSQL pool, Alembic migrations
│   │   ├── core/                    # JWT, RBAC, permissions
│   │   ├── api/dependencies/        # Dependency injection (auth, workspace)
│   │   ├── workers/                 # Background job handlers
│   │   ├── events/                  # Event system (webhooks, listeners)
│   │   ├── metrics/                 # Prometheus metrics, observability
│   │   ├── logging/                 # Structured logging config
│   │   ├── utils/                   # Helpers (errors, validators, etc.)
│   │   └── shared/                  # Shared types, constants (Python equivalents)
│   ├── models/                      # Old SQLAlchemy models (being migrated)
│   ├── migrations/                  # Alembic migration history
│   ├── tests/                       # pytest tests
│   ├── requirements.txt             # Dependencies
│   ├── pyproject.toml              # Poetry/pip config
│   ├── alembic.ini                 # Alembic config
│   └── Dockerfile                  # Container image
│
├── frontend/                         # React SPA (Vite + TypeScript)
│   ├── src/
│   │   ├── main.tsx                # Entry point
│   │   ├── App.tsx                 # Root component with providers
│   │   ├── index.css               # Global styles
│   │   ├── pages/                  # Page components (Gallery, Album, Settings, etc.)
│   │   ├── components/             # UI components
│   │   │   ├── ui/                # Reusable UI (Button, Modal, etc.)
│   │   │   ├── features/          # Feature-specific components
│   │   │   ├── layout/            # Layout components
│   │   │   └── error/             # Error boundaries, fallbacks
│   │   ├── contexts/              # React Context (AuthContext, PWAProvider)
│   │   ├── hooks/                 # Custom hooks (useAuth, useTheme, etc.)
│   │   ├── services/              # API client (api.ts, tokenStorage.ts)
│   │   ├── router/                # React Router config, routes
│   │   ├── types/                 # TypeScript interfaces/types
│   │   ├── utils/                 # Helper functions
│   │   ├── validation/            # Input validation helpers
│   │   ├── constants/             # Magic numbers, config
│   │   ├── i18n/                  # i18n config and translations
│   │   ├── styles/                # CSS files
│   │   ├── workers/               # Web Workers (background tasks)
│   │   ├── lib/                   # Third-party integrations
│   │   └── __tests__/             # Unit/integration tests
│   ├── public/                    # Static assets
│   ├── vite.config.ts            # Vite build config
│   ├── tsconfig.json             # TypeScript config
│   └── package.json              # Dependencies
│
├── services/                       # 13 Independent microservices
│   ├── gallery-service/           # Reference microservice (high-perf gallery viewing)
│   ├── ai-service/                # AI orchestration
│   ├── ai-processing-service/     # Heavy AI (embeddings, CLIP)
│   ├── billing-service/           # Stripe/Razorpay payments
│   ├── upload-service/            # TUS resumable uploads
│   ├── webhooks-service/          # Event delivery
│   ├── notifications-service/     # Multi-channel notifications
│   ├── onboarding-service/        # Registration, workspace setup
│   ├── invitations-service/       # Wedding invitations
│   ├── client-service/            # CRM/contact management
│   ├── livesync-service/          # Real-time file sync
│   ├── llm-service/               # LLM integration, chat
│   └── growth-service/            # Growth metrics, analytics
│
│   Each service follows: src/{api/v1/, services/, repositories/, schemas/, config.py}
│
├── packages/                       # Shared npm packages (pnpm workspaces)
│   ├── shared-types/              # Domain types (InvitationStatus, GalleryStatus)
│   ├── shared-constants/          # Config (API_BASE, STORAGE, AI_THRESHOLDS)
│   ├── shared-validation/         # Validation (isValidHexColor, sanitizeHtml)
│   ├── shared-utils/              # Utilities (formatRelativeDate, formatFileSize)
│   ├── api-types/                 # OpenAPI-generated client types
│   └── database-utils/            # Database utilities
│
├── infrastructure/                 # Docker, Kubernetes, deployment
│   ├── docker/                    # docker-compose.yml, Dockerfiles
│   ├── kubernetes/                # K8s manifests (optional)
│   └── traefik/                   # Reverse proxy config
│
├── tests/                         # E2E tests
│   └── *.spec.ts                 # Playwright tests
│
├── docs/                          # Documentation
│   ├── TechnicalSpecs/           # Tech specs (JSON validated by _schema.json)
│   └── GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md
│
├── scripts/                       # Automation scripts
│   ├── generate-python-types.ts  # TypeScript → Python types
│   ├── generate-openapi-schemas.ts
│   └── *.py                      # Utility scripts
│
├── .claude/                      # Claude AI context
│   ├── skills/                   # 20+ skills for code generation
│   ├── agents/                   # Agent definitions
│   ├── commands/                 # Command workflows
│   ├── settings.json            # Claude configuration
│   └── PRD.md                   # Product requirements
│
├── .planning/                   # GSD (Get Shit Done) planning
│   ├── codebase/               # This directory (ARCHITECTURE.md, STRUCTURE.md, etc.)
│   └── milestones/            # Milestone tracking
│
├── CLAUDE.md                   # Project instructions (MANDATORY - override all defaults)
├── package.json               # Root workspace config
├── pnpm-workspace.yaml       # pnpm workspace definition
└── .env.example              # Environment variable template
```

## Directory Purposes

**backend/**
- Purpose: Monolithic FastAPI backend with 3-layer architecture
- Contains: API endpoints, business logic, data access, worker processes, migrations
- Key entry: `src/app/main.py`
- Shared resources: PostgreSQL, Redis, JWT auth

**backend/src/app/api/v1/**
- Purpose: All HTTP endpoint handlers (routes)
- Contains: Files like `albums.py`, `galleries.py`, `users.py` (one per resource)
- Pattern: Each file is an APIRouter with GET, POST, PUT, DELETE handlers
- Calls: Service layer methods from `app.services.*`

**backend/src/app/repositories/**
- Purpose: Data access abstraction
- Contains: Async methods that execute raw SQL/asyncpg queries
- Pattern: One Repository class per domain entity (Album, Gallery, User)
- Rule: All queries must include `workspace_id` filter
- Example: `AlbumRepository.create_album(workspace_id, ...)`

**backend/src/app/services/**
- Purpose: Business logic implementation
- Contains: Service classes with methods that orchestrate repositories + external APIs
- Pattern: Services receive workspace_id from API handlers, pass to repositories
- Example: `AlbumService.create_album(workspace_id, create_request)` → calls repository

**backend/src/app/middleware/**
- Purpose: Cross-request concerns
- Contains: `correlation.py` (trace IDs), `rate_limit.py`, `timeout.py`, `request_id.py`, `audit_logging.py`
- Pattern: Starlette BaseHTTPMiddleware subclasses registered in FastAPI lifespan
- Execution: Wraps all requests, adds context to response headers

**backend/src/app/db/**
- Purpose: Database connection management
- Contains: asyncpg pool initialization, Alembic migration runner, health checks
- Key file: `postgres.py` (pool creation, acquire, transaction context manager)
- Alembic config: `alembic.ini` at backend root

**frontend/src/pages/**
- Purpose: Page-level components (route targets)
- Contains: Components like `GalleryPage.tsx`, `AlbumPage.tsx`, `SettingsPage.tsx`
- Pattern: Each page imports smaller feature/ui components
- Routing: Registered in `router/index.ts`, mounted in App.tsx

**frontend/src/components/ui/**
- Purpose: Reusable UI components
- Contains: Button, Modal, Input, Table, etc.
- Pattern: Unstyled (use Tailwind classes or style prop)
- No logic: Pure presentational, accept data via props

**frontend/src/services/api.ts**
- Purpose: Centralized API client with auth interceptors
- Contains: HTTP methods (GET, POST, PUT, DELETE), token refresh logic
- Pattern: Single fetch wrapper with error handling + 401 refresh flow
- Used by: React Query hooks in pages/components

**frontend/src/contexts/**
- Purpose: React Context providers
- Contains: AuthContext (login state, token), PWAProvider (offline capability)
- Pattern: Context.Provider wraps children, useContext(AuthContext) in components
- Lifespan: Persist across route changes (at App level)

**frontend/src/hooks/**
- Purpose: Custom React hooks
- Contains: `useAuth()` (access AuthContext), `useTheme()`, `useLocalStorage()`
- Pattern: Encapsulate logic reused across multiple components
- Example: `useAuth()` returns current user, login/logout functions

**services/gallery-service/src/**
- Purpose: Reference implementation for all other microservices
- Structure: Mirrors backend 3-layer (`api/v1/`, `services/`, `repositories/`, `schemas/`, `config.py`)
- Health: `/health/live`, `/health/ready`, `/metrics` endpoints required

**packages/shared-types/**
- Purpose: Domain types shared by frontend and backend
- Contains: `InvitationStatus = "pending" | "accepted" | "declined"`, `GalleryStatus`, etc.
- Build: TypeScript source compiled to both JS (for frontend) and Python (via script)
- Updated: When domain enums/types change, regenerate Python and rebuild

**infrastructure/docker/**
- Purpose: Containerization and local dev environment
- Contains: `docker-compose.yml` (all services), individual Dockerfiles
- Key services: postgres, redis, backend, gallery-service, frontend (in dev)
- Volumes: postgres data, source code for hot reload

## Key File Locations

**Entry Points:**
- Backend: `backend/src/app/main.py` (FastAPI app, startup/shutdown)
- Frontend: `frontend/src/main.tsx` (React mount) + `frontend/src/App.tsx` (root component)
- Services: `services/*/src/main.py` (each microservice entry point)

**Configuration:**
- Backend settings: `backend/src/app/config/settings.py` (env var parsing)
- Frontend env: `frontend/.env.local` (VITE_API_URL, etc.)
- Service config: `services/*/src/config.py`

**Core Logic:**
- Album feature: `backend/src/app/repositories/album_repository.py`, `backend/src/app/services/album_service.py`, `backend/src/app/api/v1/albums.py`
- Gallery feature: `services/gallery-service/src/` (reference implementation)
- Auth: `backend/src/app/api/dependencies/auth.py` (JWT validation)

**Testing:**
- Backend tests: `backend/tests/` (pytest)
- Frontend tests: `frontend/src/__tests__/` or `*.test.tsx` (Vitest)
- E2E tests: `tests/` (Playwright)

**Database:**
- Migrations: `backend/migrations/` (Alembic versions)
- Models (old): `backend/models/` (legacy, being migrated to `src/app/models/`)

**Shared Packages:**
- Types: `packages/shared-types/src/index.ts`
- Constants: `packages/shared-constants/src/index.ts`
- Validation: `packages/shared-validation/src/index.ts`

## Naming Conventions

**Files:**
- Python: `snake_case.py` (e.g., `album_service.py`, `user_repository.py`)
- TypeScript: `camelCase.ts` for utils, `PascalCase.tsx` for React components
- Tests: `*.test.ts` (Vitest) or `test_*.py` (pytest)

**Directories:**
- Plural for collections: `services/`, `repositories/`, `components/`
- Feature-based: `pages/GalleryPage/`, `components/ui/`, `services/api.ts`
- No uppercase except React components

**Functions:**
- Python: `snake_case` (e.g., `def create_album()`, `async def fetch_data()`)
- TypeScript: `camelCase` (e.g., `const fetchData = ()`, `export function validateEmail()`)

**Classes:**
- Python: `PascalCase` (e.g., `class AlbumRepository`, `class AlbumService`)
- TypeScript: `PascalCase` (e.g., `class AuthProvider`, `class Album`)

**Constants:**
- Python: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_PAGE_SIZE = 20`)
- TypeScript: `UPPER_SNAKE_CASE` (e.g., `export const API_BASE_URL = ...`)

**Types/Interfaces:**
- TypeScript: `PascalCase` with `I` prefix for interfaces (e.g., `interface IAlbum`, `type Album`)

## Where to Add New Code

**New Feature (e.g., Tagging System):**
- Primary code:
  - Repository: `backend/src/app/repositories/tag_repository.py`
  - Service: `backend/src/app/services/tag_service.py`
  - API: `backend/src/app/api/v1/tags.py`
  - Schema: `backend/src/app/schemas/tag.py`
- Tests:
  - Backend: `backend/tests/test_tags.py`
- Frontend (if UI needed):
  - Pages: `frontend/src/pages/TagsPage.tsx`
  - Components: `frontend/src/components/features/TagList.tsx`
  - Hooks: `frontend/src/hooks/useTagSearch.ts`
  - Tests: `frontend/src/__tests__/tags.test.tsx`

**New Component/Module:**
- UI Component: `frontend/src/components/ui/MyComponent.tsx`
- Feature Component: `frontend/src/components/features/MyFeature.tsx`
- Custom Hook: `frontend/src/hooks/useMyHook.ts`
- Utility: `frontend/src/utils/myHelper.ts` or `packages/shared-utils/src/myHelper.ts`

**New Microservice:**
- Template: Copy `services/gallery-service/src/` structure
- Config: Create `src/config.py` with environment variables
- Main: Create `src/main.py` with FastAPI lifespan, health endpoints, A2A registry
- API: Create `src/api/v1/__init__.py` with routers
- Services: Create `src/services/` with business logic
- Repositories: Create `src/repositories/` with data access (use shared PostgreSQL)
- Schemas: Create `src/schemas/` with Pydantic models
- Tests: Create `tests/` with pytest tests

**Shared Utilities:**
- Cross-package helpers: `packages/shared-utils/src/`
- Build and include in both frontend (`@rawdrive/shared-utils`) and backend (`from app.shared.utils import`)

## Special Directories

**backend/models/ (Legacy):**
- Purpose: Old SQLAlchemy models
- Generated: From database schema introspection
- Committed: Yes, but being migrated
- Status: Deprecated; new code uses Pydantic models in `src/app/models/`

**backend/migrations/**
- Purpose: Alembic migration history
- Generated: By `alembic revision -m "message"`
- Committed: Yes, always commit migrations
- Run: `docker exec rawdrive-backend alembic upgrade head`

**frontend/src/_orphaned/**
- Purpose: Old/unused code awaiting cleanup
- Generated: No
- Committed: Yes (historical reference)
- Status: Do not import from here; delete eventually

**frontend/public/**
- Purpose: Static assets (icons, logos, PWA manifest)
- Generated: No (but PWA manifest is auto-generated by Vite plugin)
- Committed: Yes
- Served: As-is at root URL (e.g., `/favicon.ico`)

**.planning/**
- Purpose: GSD (Get Shit Done) planning artifacts
- Generated: By Claude via `/gsd:map-codebase`, `/gsd:plan-phase`, etc.
- Committed: Yes
- Consumed by: Downstream GSD commands for context

**.claude/skills/**
- Purpose: AI skills for code generation (20+ domain skills)
- Generated: No (maintained manually)
- Committed: Yes
- Loaded: By Claude for `/gsd:execute-phase` context

**infrastructure/docker/docker-compose.yml**
- Purpose: Local development environment
- Services: postgres, redis, backend, gallery-service, etc.
- Run: `docker compose up -d`
- Volumes: Source code (hot reload), database data

## Critical Rules for New Code

1. **Multi-tenant isolation (MANDATORY):**
   - Every query MUST filter by `workspace_id`
   - Extract workspace_id from JWT token (via `CurrentUserDep`), never from request body
   - Example: `select(Album).where(Album.workspace_id == workspace_id)`

2. **3-layer architecture:**
   - API layer: Only HTTP parsing + calling services
   - Service layer: Business logic + repository orchestration
   - Repository layer: Only SQL queries
   - Never put logic in models; never skip repository layer

3. **No hardcoding:**
   - API keys → environment variables
   - Magic numbers → constants in `constants/` or `.py`
   - Strings (user-facing) → i18n translations in `i18n/`
   - Colors → design tokens from shared-constants

4. **Error handling:**
   - Raise custom domain exceptions (e.g., `AlbumNotFoundError`)
   - Include code, message, status_code, user_message
   - Global handler converts to JSON response

5. **Testing:**
   - Every repository method: unit test with mocked asyncpg
   - Every service method: unit test with mocked repository
   - Every endpoint: integration test with test database
   - Coverage target: 80%+ (enforced by CI/CD)

6. **Shared packages must be built:**
   - After updating `packages/shared-types/`, run `pnpm build:packages`
   - Frontend cannot use old types until rebuilt

7. **Migrations are immutable:**
   - Never delete or edit migration files
   - Create new migration for schema changes
   - Run inside Docker: `docker exec rawdrive-backend alembic upgrade head`
