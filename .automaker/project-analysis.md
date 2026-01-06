# RawDrive - Project Analysis

## Executive Summary

**RawDrive** is an enterprise-grade SaaS professional photography management platform built for photographers, agencies, and enterprises. It provides digital asset management, client collaboration, AI-powered workflow automation, and professional gallery sharing capabilities.

**Version:** 0.2.6 | **License:** Proprietary

---

## 1. Project Structure and Architecture

### Directory Organization
```
RawDrive/
├── backend/                    # Python FastAPI (117 services, 471 API endpoints)
├── frontend/                   # React 19 TypeScript (596 TS/TSX files)
├── packages/                   # pnpm monorepo shared packages
│   ├── shared-types/           # TypeScript domain types
│   ├── shared-constants/       # Shared constants
│   ├── shared-validation/      # Validation utilities
│   └── shared-utils/           # Utility functions
├── services/                   # Microservices (invitations-service, ai-service, llm-service)
├── infrastructure/             # Docker, Kubernetes, nginx configs
├── docs/                       # Comprehensive documentation
├── specs/                      # Feature specifications
├── scripts/                    # Build and utility scripts
└── tests/                      # Integration and E2E tests
```

### Layered Architecture

**Backend (FastAPI):**
- **API Layer** → 471 endpoints with request validation
- **Service Layer** → 117 services for business logic
- **Repository Layer** → 23 repositories for data access
- **Model Layer** → SQLAlchemy ORM models
- **Worker Layer** → Background job processors

**Frontend (React 19):**
- **Pages** → Route-level components (56 pages)
- **Features** → Domain-specific modules (14 feature areas)
- **Components** → Reusable UI components
- **Hooks** → Custom React hooks (20+)
- **Services** → API client layer

---

## 2. Main Technologies and Frameworks

### Frontend Stack
| Category | Technology |
|----------|------------|
| **Framework** | React 19 + TypeScript 5.2 |
| **Build Tool** | Vite 5.0 |
| **Styling** | TailwindCSS 3.3 |
| **State Management** | TanStack React Query 5.90 |
| **Routing** | React Router v6 |
| **Forms** | React Hook Form 7.69 + Zod 4.2 |
| **Animation** | Framer Motion 11 |
| **i18n** | i18next 25.7 |
| **Uploads** | TUS Protocol 5.x |
| **HTTP Client** | Axios 1.13 |

### Backend Stack
| Category | Technology |
|----------|------------|
| **Framework** | FastAPI 0.115 + Uvicorn 0.32 |
| **ORM** | SQLAlchemy 2.0 + Alembic 1.13 |
| **Database** | PostgreSQL 16 + pgvector |
| **Caching** | Redis 7 |
| **Auth** | PyJWT + Argon2 + PyOTP (2FA) |
| **Image Processing** | Pillow 10.4 + OpenCV 4.8 |
| **AI/ML** | Google Cloud Vision + Gemini API |
| **Storage** | boto3 (S3/R2 compatible) |
| **Payments** | Razorpay |

### DevOps & Infrastructure
| Category | Technology |
|----------|------------|
| **Containerization** | Docker + Docker Compose |
| **Monitoring** | Prometheus + Grafana + Loki |
| **Tracing** | OpenTelemetry |
| **Package Management** | pnpm (frontend) + pip (backend) |

---

## 3. Key Components and Their Responsibilities

### Backend Components

| Component | Responsibility |
|-----------|---------------|
| **API Endpoints** | Handle HTTP requests, validation, RBAC |
| **Services** | Business logic (auth, galleries, AI, billing) |
| **Repositories** | Database queries and data access |
| **Workers** | Background jobs (processing, face detection, transcoding) |
| **Middleware** | Audit logging, rate limiting, request tracking |
| **AI Providers** | Multi-provider AI with fallback (Google, OpenCV) |

### Frontend Components

| Component | Responsibility |
|-----------|---------------|
| **Pages** | Route-level containers (workspace, admin, public) |
| **Feature Modules** | Domain logic (gallery, auth, AI, invitations) |
| **UI Components** | Design system (buttons, modals, forms) |
| **Custom Hooks** | Reusable logic (useGallery, useUpload, useCuration) |
| **Contexts** | Global state (Auth, Search, SignedUrls) |
| **API Services** | HTTP client configuration and endpoints |

### Shared Packages

| Package | Purpose |
|---------|---------|
| `@rawdrive/shared-types` | Cross-platform TypeScript interfaces |
| `@rawdrive/shared-constants` | Configuration constants |
| `@rawdrive/shared-validation` | Validation schemas (Zod/Pydantic) |
| `@rawdrive/shared-utils` | Utility functions |

---

## 4. Build and Test Commands

### Root Level (pnpm)
```bash
pnpm build:packages       # Build all shared packages
pnpm generate:python      # Generate Python types from TypeScript
pnpm test:packages        # Test all shared packages
pnpm test:parity          # Cross-platform parity tests
```

### Frontend
```bash
npm run dev               # Vite dev server (port 5173)
npm run build             # Production build
npm run lint              # ESLint
npm test                  # Vitest unit tests
npm run test:coverage     # With coverage report
npm run preview           # Preview production build
```

### Backend (Docker-based)
```bash
# Start infrastructure
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Run development server
docker compose exec backend uvicorn app.main:app --reload --port 8000

# Database migrations
docker compose exec backend alembic upgrade head
docker compose exec backend alembic revision --autogenerate -m "description"

# Testing
docker compose exec backend pytest
docker compose exec backend pytest --cov=src

# Linting & Type Checking
docker compose exec backend ruff check src
docker compose exec backend mypy src
docker compose exec backend ruff format src
```

---

## 5. Existing Conventions and Patterns

### Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| Python variables/functions | snake_case | `get_gallery_assets()` |
| Python classes | PascalCase | `GalleryService` |
| TypeScript variables | camelCase | `fetchGalleryData` |
| React components | PascalCase | `GalleryGrid` |
| Custom hooks | use* prefix | `useGallery`, `useUpload` |
| CSS classes | kebab-case (Tailwind) | `bg-primary-500` |

### Architectural Patterns

**Backend:**
- **Service Layer Pattern** - Business logic isolation
- **Repository Pattern** - Data access abstraction
- **Dependency Injection** - FastAPI dependencies
- **Circuit Breaker** - API resilience for AI calls
- **Strategy Pattern** - Multiple AI providers with fallback
- **Worker Pattern** - Async job processing

**Frontend:**
- **Container/Presentational** - Smart/dumb component split
- **Custom Hooks** - Logic extraction
- **Context API** - Global state management
- **React Query** - Server state caching
- **Feature-based organization** - Co-located code

### Code Quality Tools

| Tool | Purpose | Config |
|------|---------|--------|
| **Ruff** | Python linting (line-length: 100) | `pyproject.toml` |
| **mypy** | Python type checking | `pyproject.toml` |
| **ESLint** | TypeScript/React linting | Package.json |
| **TypeScript** | Strict mode enabled | `tsconfig.json` |
| **Vitest** | Frontend unit testing | `vite.config.ts` |
| **Pytest** | Backend testing with asyncio | `pyproject.toml` |

### Configuration Patterns

- **Environment-based** settings via `.env` files
- **Pydantic** validation for backend config
- **Zod** validation for frontend schemas
- **TypeScript strict mode** for compile-time safety
- **Fail-fast** behavior for critical settings

### Testing Patterns

**Backend:**
- Unit tests in `tests/unit/`
- Integration tests in `tests/integration/`
- E2E tests in `tests/e2e/`
- Property-based tests using Hypothesis

**Frontend:**
- Vitest + React Testing Library
- Tests co-located with components
- Focus on user interactions

---

## Key Features Summary

| Feature | Description |
|---------|-------------|
| **Asset Management** | Upload and organize millions of photos/videos |
| **AI Intelligence** | Auto-tagging, face recognition, scene detection |
| **Multi-Tenancy** | Complete workspace isolation with RBAC |
| **Smart Curate** | AI photo culling with quality scoring |
| **Face Recognition** | Automatic people clustering |
| **Client Galleries** | Branded sharing with approval workflows |
| **Digital Invitations** | Event invites with RSVP management |
| **SOC 2 Compliance** | Encryption, audit trails |
| **BYOS Support** | Bring Your Own S3-compatible storage |

---

## Database Overview

- **93 Alembic migrations** tracking schema evolution
- **PostgreSQL 16 + pgvector** for vector embeddings
- **Key entities:** Users, Workspaces, Assets, Galleries, Faces, Invitations, Subscriptions
- **Redis** for caching and job queues

---

This is a **mature, production-ready platform** with clean architecture, comprehensive testing infrastructure, and well-documented specifications.