# Architecture

**Analysis Date:** 2026-03-18

## Pattern Overview

**Overall:** Distributed microservices architecture with a centralized monolithic backend, 13 specialized microservices, React SPA frontend, and shared packages for cross-service code reuse.

**Key Characteristics:**
- Backend 3-layer architecture: Repository (DB) → Service (business logic) → API (HTTP)
- 13 independent microservices on shared PostgreSQL + Redis
- JWT-based authentication with shared `JWT_SECRET` across all services
- Mandatory workspace-based multi-tenant isolation on every query
- Async-first design with FastAPI + asyncpg for high concurrency
- React frontend with React Router, React Query, and context-based state management

## Layers

**API Layer (HTTP Request Handling):**
- Purpose: Parse requests, validate inputs, enforce authorization, return responses
- Location: `backend/src/app/api/v1/*.py` (main backend), `services/*/src/api/v1/*.py` (microservices)
- Contains: FastAPI route handlers, Pydantic schemas, dependency injection
- Depends on: Service layer for business logic, auth dependencies for permissions
- Used by: Frontend, external clients, other services

**Service Layer (Business Logic):**
- Purpose: Implement business rules, orchestrate repositories, handle workflows
- Location: `backend/src/app/services/*.py`, `services/*/src/services/*.py`
- Contains: Domain-specific service classes (AlbumService, GalleryService, etc.), exception handling, state transitions
- Depends on: Repository layer for data access, external APIs, caching, task queues
- Used by: API layer for request handling

**Repository Layer (Data Access):**
- Purpose: Abstract database access, enforce multi-tenant isolation, handle queries
- Location: `backend/src/app/repositories/*.py`, `services/*/src/repositories/*.py`
- Contains: AsyncPG queries, transaction handling, workspace_id filtering on all reads/writes
- Depends on: PostgreSQL connection pool, database models
- Used by: Service layer exclusively

**Database Layer:**
- Purpose: Manage connections, migrations, transaction handling
- Location: `backend/src/app/db/postgres.py`, `backend/src/db/migrations/`
- Contains: asyncpg pool management, Alembic migrations, connection initialization
- Depends on: PostgreSQL (shared across all services)
- Used by: Repositories

**Middleware & Cross-Cutting:**
- Purpose: Handle concerns that span all requests
- Location: `backend/src/app/middleware/`, `backend/src/app/metrics/`
- Contains: Correlation ID tracking, request ID generation, rate limiting, timeouts, audit logging, Prometheus metrics
- Depends on: Starlette/FastAPI middleware interface, Redis for rate limiting, Loki for audit logs
- Used by: FastAPI app initialization in `main.py`

## Data Flow

**Request → Response Flow:**

1. Request arrives at FastAPI app
2. Middleware processes request (correlation ID, request ID, rate limiting, timeout)
3. Route handler validates with Pydantic schema
4. Dependency injection extracts user/workspace from JWT token
5. Handler calls Service layer method
6. Service orchestrates Repository methods and business logic
7. Repository executes asyncpg queries with `workspace_id` filter
8. Results returned through layers
9. Response serialized via Pydantic schema
10. Middleware adds correlation/request IDs to response headers

**Multi-Service Communication:**

- Backend acts as main API gateway for initial requests
- Services communicate via HTTP (documented in service registry)
- Service Registry (A2A) allows services to discover capabilities and endpoints
- JWT token passed in `Authorization: Bearer` header for service-to-service calls
- All cross-service queries must include workspace_id from initiating JWT

**State Management:**

- **Frontend:** React Context (AuthContext, PWAProvider) + React Query for server state
- **Backend:** Redis for caching, task queues, rate limit counters
- **Async Jobs:** Task queue system (asyncio-based) for asset processing, face detection, scheduled jobs
- **Database:** PostgreSQL with pgvector extension for vector searches (AI embeddings)

## Key Abstractions

**Workspace Isolation:**
- Purpose: Enforce strict data segregation for multi-tenant SaaS
- Examples: `backend/src/app/repositories/album_repository.py`, all service repositories
- Pattern: Every query filters by `workspace_id` extracted from JWT
- Error if missing: Security vulnerability, cross-tenant data leak

**Repository Pattern:**
- Purpose: Abstract database access, enable testability, enforce data consistency
- Examples: `AlbumRepository`, `GalleryRepository`, `ClientRepository`
- Pattern: Class methods return dicts/models, handle all SQL, enforce transactions
- Used by: All Service classes exclusively (not directly by API layer)

**Service Classes:**
- Purpose: Implement business logic separate from HTTP concerns
- Examples: `AlbumService`, `GalleryService`, `NotificationService`
- Pattern: Methods throw domain exceptions (e.g., `AlbumNotFoundError`), receive workspace_id from caller
- Used by: API handlers call service methods

**Microservice Template:**
- Purpose: Ensure consistency across 13 services
- Reference: `services/gallery-service/src/` (marked as reference implementation in CLAUDE.md)
- Pattern: Each service has own `api/v1/`, `services/`, `repositories/`, `schemas/`, `config.py`
- Health endpoints: `/health/live` (liveness), `/health/ready` (readiness), `/metrics` (Prometheus)

**Pydantic Schemas:**
- Purpose: Data validation, serialization, OpenAPI documentation
- Location: `backend/src/app/schemas/*.py`, `services/*/src/schemas/*.py`
- Pattern: Request models inherit from BaseModel, response models use ConfigDict for serialization
- Rule: Validate early (in schema), serialize late (in response)

**Error Handling:**
- Purpose: Standardized error responses across all services
- Location: `backend/src/app/api/exceptions.py` (base exceptions), domain-specific error modules
- Pattern: Custom AppError subclasses with code, status_code, user_message, details
- Response format (per api_standards.json):
  ```json
  {
    "error": {
      "code": "ALBUM_NOT_FOUND",
      "message": "Album with ID ... not found",
      "requestId": "req-xxx",
      "timestamp": "2026-03-18T...",
      "details": {}
    }
  }
  ```

**Shared Packages (pnpm workspaces):**
- Purpose: Avoid code duplication, enforce consistency across frontend/backend
- Location: `packages/{shared-types, shared-constants, shared-validation, shared-utils, api-types}`
- Pattern: Frontend imports from `@rawdrive/*`, backend imports equivalent Python types via `from app.shared.types import`
- Rule: Always run `pnpm build:packages` before frontend dev if types changed

## Entry Points

**Backend Main API:**
- Location: `backend/src/app/main.py`
- Triggers: Application startup via `uvicorn app.main:app --reload --port 8000`
- Responsibilities:
  - Initialize FastAPI app with lifespan management
  - Connect to PostgreSQL and Redis pools
  - Register middleware (correlation, rate limiting, timeout, audit logging, Prometheus)
  - Register exception handlers
  - Start async workers (asset processing, face detection, scheduler, audit log worker)
  - Register service in A2A registry (heartbeat loop)
  - Mount v1 API router

**Gallery Service (Reference Microservice):**
- Location: `services/gallery-service/src/main.py`
- Triggers: Docker startup `docker compose up gallery-service`
- Responsibilities:
  - Initialize FastAPI with lifespan
  - Connect to shared PostgreSQL and Redis
  - Register capabilities in A2A registry
  - Mount v1 API router for gallery operations
  - Start Prometheus metrics server

**Frontend Entry Point:**
- Location: `frontend/src/main.tsx`
- Triggers: Vite dev server `pnpm dev` or production build
- Responsibilities:
  - Register Service Worker (PWA)
  - Initialize i18n config before React renders
  - Mount React app with providers (Auth, PWA, Theme, Toast, React Query)
  - Set up error boundary
  - Route via React Router

**Frontend App Component:**
- Location: `frontend/src/App.tsx`
- Triggers: React mount
- Responsibilities:
  - Wrap app with providers (QueryClient, HelmetProvider, ThemeProvider, AuthProvider)
  - Create React Router with routes
  - Render PWA components (update notification, install prompt, offline indicator)

## Error Handling

**Strategy:** Layered validation + standardized exception responses

**Patterns:**

1. **Input Validation (API Layer):**
   - Pydantic schemas validate request payloads automatically
   - Custom validators raise ValidationError for business rules
   - FastAPI converts to 422 Unprocessable Entity

2. **Authorization (Dependency Layer):**
   - `CurrentUserDep` extracts JWT, validates expiry, returns User or raises HTTPException 401
   - `WorkspaceAccessDep` verifies workspace membership or raises 403
   - Location: `backend/src/app/api/dependencies/auth.py`

3. **Domain Exceptions (Service Layer):**
   - Custom exceptions: `AlbumNotFoundError`, `DuplicateRSVPError`, `ConflictError`
   - Inherit from `AppError` with code, message, status_code, user_message
   - Example: `backend/src/app/api/exceptions.py`

4. **Global Exception Handlers (Main App):**
   - Register handlers for AppError, ValidationError, HTTPException in `main.py`
   - Convert to JSON response with standard error schema
   - Log with correlation ID for debugging

5. **Tenant-Safe Error Logging:**
   - Tool: `app.utils.error_validator.TenantSafeErrorValidator`
   - Purpose: Prevent sensitive data leaks in error messages
   - Rule: Never expose workspace_id, user_id, or file paths to clients

## Cross-Cutting Concerns

**Logging:**
- Framework: Python `logging` + structured JSON logs + Loki for aggregation
- Pattern: Get logger via `get_logger(__name__)`, log with structured extras
- Location: `backend/src/app/logging.py`, `backend/src/app/middleware/audit_logging.py`
- Correlation ID included in all logs for request tracing

**Validation:**
- Input: Pydantic schemas (frontend types generated from backend via `pnpm generate:python`)
- Business rules: Custom validators in schemas + service layer checks
- Location: `packages/shared-validation/`, `backend/src/app/schemas/`

**Authentication:**
- JWT with `JWT_SECRET` from env, extracted in middleware
- Token contains: user_id, workspace_id, roles, permissions
- Verified in dependency: `app.api.dependencies.auth.CurrentUserDep`
- Refreshable: Frontend intercepts 401, calls `/auth/refresh`, updates token storage

**Multi-Tenant Isolation:**
- Mandatory: Every repository query must include `where(Model.workspace_id == workspace_id)`
- Source: Extract from `current_user.workspace_id` (from JWT), never trust client
- Enforcement: Code review, automated by TenantSafeErrorValidator
- Failure risk: Cross-tenant data leaks, security vulnerability

**Caching (Redis):**
- 3-tier strategy in Gallery Service: page-level, object-level, computation-level
- Used for: Magic links, gallery metadata, rate limit counters, session data
- TTL: Varies by data type (5m for metadata, 24h for magic links)
- Invalidation: Manual cache.delete() on mutation

**Rate Limiting:**
- Middleware: `RateLimitMiddleware` in main.py
- Storage: Redis counters
- Per-endpoint: Configurable limits (e.g., 100 req/min for public endpoints)
- Location: `backend/src/app/middleware/rate_limit.py`

**Observability:**
- Metrics: Prometheus `/metrics` endpoint (prometheus library)
- Traces: Correlation ID for distributed tracing across services
- Logs: Structured JSON to Loki (service_name, level, message, correlation_id, workspace_id)
- Health: `/health/live` (FastAPI up?), `/health/ready` (DB + Redis up?)
- KEDA auto-scaling based on Prometheus metrics
