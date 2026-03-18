# Technology Stack

**Analysis Date:** 2026-03-18

## Languages

**Primary:**
- TypeScript 5.3.3 - Frontend (React), shared packages, build scripts
- Python 3.11+ - Backend (FastAPI), microservices, data processing

**Secondary:**
- JavaScript - Runtime transpilation, utility scripts
- SQL - PostgreSQL queries, Alembic migrations

## Runtime

**Environment:**
- Node.js (via pnpm) - Frontend and shared package execution
- Python 3.11+ - Backend and microservices

**Package Manager:**
- pnpm 10.18.3 - Frontend and monorepo workspace management
- pip/setuptools - Python backend dependencies

**Lockfiles:**
- pnpm-lock.yaml - Present
- requirements files managed via pyproject.toml

## Frameworks

**Frontend:**
- React 18.3.0 - Core UI framework
- Vite 5.0.8 - Build tool and dev server
- React Router DOM 6.21.0 - Client-side routing

**Backend:**
- FastAPI 0.115+ - REST API framework
- Uvicorn 0.30+ - ASGI server

**Testing:**
- Vitest 1.6.1 - TypeScript/JavaScript unit tests
- Playwright 1.57.0 - E2E and integration testing
- Jest DOM - DOM testing utilities (React testing)
- pytest 8.3+ - Python unit/integration tests
- pytest-asyncio 0.24+ - Async test support

**Build/Dev:**
- TypeScript 5.3.3 - Type checking
- ESLint 8.55.0 - Linting
- Tailwind CSS 4.0.0 - Utility-first styling
- Ruff 0.6+ - Python linting
- mypy 1.11+ - Python type checking
- Alembic 1.13+ - Database migrations

## Key Dependencies

**Frontend - UI & State:**
- @tanstack/react-query 5.90.16 - Server state management
- @tanstack/react-virtual 3.13.18 - Virtual list optimization
- framer-motion 11.0.0 - Animation library
- react-hook-form 7.69.0 - Form state management
- zod 4.3.5 - Schema validation
- lucide-react 0.294.0 - Icon library
- @heroicons/react 2.2.0 - Hero icons

**Frontend - Image/File Handling:**
- react-easy-crop 5.5.6 - Image cropping
- heic2any 0.0.4 - HEIC image conversion
- face-api.js 0.22.2 - Client-side face detection (TensorFlow.js based)
- qrcode.react 4.2.0 - QR code generation
- dompurify 3.3.1 - HTML sanitization

**Frontend - Internationalization:**
- i18next 25.7.3 - Translation framework
- react-i18next 16.5.0 - React binding
- i18next-browser-languagedetector 8.2.0 - Language detection
- i18next-http-backend 3.0.2 - Backend translation loader

**Frontend - Utilities:**
- axios 1.13.2 - HTTP client
- date-fns 4.1.0 - Date utility library
- react-helmet-async 2.0.4 - Document head management
- js-sha256 0.11.1 - SHA256 hashing
- @fingerprintjs/fingerprintjs 5.0.1 - Browser fingerprinting

**Frontend - Performance:**
- react-window 2.2.4 - Virtual scrolling
- react-window-infinite-loader 2.0.0 - Infinite list loading
- workbox-window 7.4.0 - Service worker client
- vite-plugin-pwa 0.20.0 - PWA manifest generation

**Frontend - Drag & Drop:**
- @dnd-kit/core 6.3.1 - Accessible drag-drop library
- @dnd-kit/sortable 10.0.0 - Sortable extension
- @use-gesture/react 10.3.1 - Gesture recognition

**Backend - Database:**
- asyncpg 0.29+ - Async PostgreSQL driver
- SQLAlchemy 2.0+ - ORM
- psycopg2-binary 2.9+ - PostgreSQL adapter
- alembic 1.13+ - Database migrations
- asyncpg-stubs 0.29+ - Type hints for asyncpg

**Backend - Caching & Queuing:**
- redis 5.0+ (with hiredis) - In-memory cache
- celery 5.3.6+ with redis - Task queue and background jobs

**Backend - Authentication & Security:**
- python-jose 3.3+ with cryptography - JWT handling
- argon2-cffi 23.1+ - Password hashing (Argon2)
- pyotp 2.9+ - TOTP/2FA support

**Backend - Configuration & Validation:**
- pydantic 2.7+ - Data validation and settings
- pydantic-settings 2.4+ - Environment configuration
- email-validator 2.1+ - Email validation

**Backend - HTTP & Web:**
- httpx 0.27+ - Async HTTP client
- fastapi 0.115+ - Framework (includes Starlette)

**Backend - Image Processing:**
- opencv-python-headless 4.8+ - Computer vision (no GUI)
- Pillow 10.0+ - Image manipulation
- numpy 1.24+ - Numerical computing

**Backend - Observability:**
- structlog 24.1.0+ - Structured logging
- prometheus-client (via Uvicorn) - Metrics

**Backend - AI/ML:**
- google-generativeai - Google Gemini API client (for fallback face detection)
- geoip2 4.7+ - GeoIP lookups

**Backend - Utilities:**
- qrcode 7.4+ - QR code generation
- geoip2 4.7+ - IP geolocation

**Shared Packages (pnpm workspaces):**
- `@rawdrive/shared-types` - TypeScript domain types
- `@rawdrive/shared-constants` - Configuration constants
- `@rawdrive/shared-validation` - Validation utilities
- `@rawdrive/shared-utils` - Utility functions
- `@rawdrive/database-utils` - Database helpers
- `@rawdrive/api-types` - Generated OpenAPI types
- `@rawdrive/shared-api` - API client utilities

## Configuration

**Environment:**
- `.env` file (not committed) - Development configuration
- Environment variables for all secrets and configuration
- `pydantic-settings` in backend for type-safe config loading
- `tsconfig.json` in frontend for TypeScript configuration

**Build:**
- `vite.config.ts` - Frontend bundler configuration
- `pyproject.toml` - Backend project metadata and dependencies
- `eslint.config.mjs` - Linting rules
- `tailwind.config.ts` - Tailwind CSS configuration
- `playwright.config.ts` - E2E test configuration
- `pytest.ini` settings in `pyproject.toml` - Test runner config

**Frontend Path Aliases:**
- TypeScript path mapping in `tsconfig.json` (if configured)

## Platform Requirements

**Development:**
- Node.js 18+ (for pnpm)
- Python 3.11+
- Docker & Docker Compose (recommended for full dev environment)
- PostgreSQL 16 with pgvector and TimescaleDB extensions
- Redis 7+

**Production:**
- Containerized deployment (Docker)
- PostgreSQL 16+ with pgvector, pgvectorscale, TimescaleDB
- Redis 7+ for caching and Celery
- Traefik 3.0 for reverse proxy/API gateway
- TimescaleDB for time-series data storage and pgvector for embeddings

**Microservices Architecture:**
- 14 independent services (see CLAUDE.md for port mapping)
- Shared PostgreSQL database with workspace-level isolation
- Shared Redis for caching and task queue
- JWT-based inter-service authentication

---

*Stack analysis: 2026-03-18*
