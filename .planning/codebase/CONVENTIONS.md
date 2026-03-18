# Coding Conventions

**Analysis Date:** 2025-03-18

## Naming Patterns

**Files:**
- React/TypeScript components: PascalCase with .tsx extension (e.g., `ErrorBoundary.tsx`, `FavoritesPanel.tsx`)
- Services: camelCase with Service suffix (e.g., `favoritesService.ts`, `authService.ts`)
- Hooks: camelCase with use prefix (e.g., `useFavorites.ts`, `useSelection.ts`)
- Test files: Same name as source with .test.ts/.test.tsx suffix or in `__tests__` directory
  - Pattern 1: co-located in `__tests__` subdirectory (preferred): `src/components/features/gallery/__tests__/GalleryCard.test.tsx`
  - Pattern 2: parallel structure alongside source
- Python modules: snake_case (e.g., `auth_service.py`, `session_service.py`)
- Python test files: test_*.py or *_test.py (e.g., `test_session_service.py`)

**Functions:**
- TypeScript: camelCase (e.g., `getFavorites()`, `toggleFavorite()`, `getClientToken()`)
- Python: snake_case (e.g., `create_session()`, `verify_password()`, `extract_permissions()`)
- Helper functions: Prefix with underscore for module-private (e.g., `_hash_email_for_audit()`, `_get_auth_service()`)
- React hooks: `use` prefix followed by feature name in camelCase (e.g., `useFavorites`, `useSelection`, `useGalleryAssets`)

**Variables:**
- TypeScript: camelCase for all variables and constants (e.g., `mockGalleryId`, `mockFavorites`, `CLIENT_TOKEN_KEY`)
- Constants: UPPER_SNAKE_CASE (e.g., `CLIENT_TOKEN_KEY`, `API_BASE`)
- Python: snake_case for all variables (e.g., `user_id`, `workspace_id`, `expires_at`)
- Mock data in tests: camelCase prefix with "mock" (e.g., `mockFavorite`, `mockList`, `mockPool`)

**Types:**
- TypeScript interfaces: PascalCase (e.g., `ErrorInfo`, `Props`, `State`, `ToggleFavoriteRequest`)
- Python dataclasses: PascalCase (e.g., `AuthResponse`, `UserCreate`, `TokenResponse`)
- Pydantic models: PascalCase (e.g., `UserLanguageSettings`, `User`, `LoginRequest`)

## Code Style

**Formatting:**
- **Frontend:** Vite + TypeScript with TSC compiler
  - Line length: No explicit config detected, follows standard practices (~80-100 chars)
  - Indentation: 2 spaces (Vite default)
  - Tool: Prettier (implied by Vite setup, no explicit .prettierrc but configured)
  - Run: `cd frontend && pnpm lint`

- **Backend:** Python 3.11+
  - Line length: 100 characters (ruff configured)
  - Indentation: 4 spaces (Python standard)
  - Tool: ruff for linting and formatting
  - Run: `cd backend && ruff check src`

**Linting:**
- **Frontend ESLint:**
  - Config: `.eslintrc.cjs` in frontend root
  - Rules:
    - `@typescript-eslint/no-unused-vars`: warn with `argsIgnorePattern: '^_'` (unused args prefixed with _ are allowed)
    - `@typescript-eslint/no-explicit-any`: warn (discouraged but allowed)
    - `react-refresh/only-export-components`: warn with `allowConstantExport: true`
  - Extends: eslint:recommended, @typescript-eslint/recommended, react-hooks/recommended
  - Command: `pnpm lint` enforces zero warnings (`--max-warnings 0`)

- **Backend Ruff:**
  - Config: pyproject.toml `[tool.ruff]`
  - Line-length: 100
  - Select rules: E (errors), F (pyflakes), I (imports), B (bugbear), UP (upgrades), SIM (simplify), ASYNC
  - Command: `cd backend && ruff check src && mypy src`

## Import Organization

**TypeScript/React Order:**
1. React and third-party libraries (`import React`, `import { ... } from 'react'`)
2. Third-party UI libraries (`import { ... } from 'lucide-react'`, `import { AppButton } from '@/components/ui/AppButton'`)
3. Local absolute imports from `@rawdrive` workspace packages
4. Local relative imports (components, services, utils, hooks, contexts)

**Example:**
```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
// local imports follow
```

**Path Aliases:**
- `@/` → `src/` (absolute path alias for cleaner imports)
- `@rawdrive/shared-types` → workspace package
- `@rawdrive/shared-constants` → workspace package
- `@rawdrive/shared-utils` → workspace package
- `@rawdrive/shared-validation` → workspace package

**Python Imports:**
- Group 1: Standard library (`import logging`, `from typing import ...`)
- Group 2: Third-party (`from fastapi import ...`, `import asyncpg`, `from pydantic import ...`)
- Group 3: Local app imports (`from app.services import ...`, `from app.api.schemas import ...`)

## Error Handling

**Patterns:**
- **Custom exception classes:** Inherit from base exceptions with descriptive names and error codes
  - Pattern: `class XyzError(BaseException): def __init__(self, message: str, code: str, status: int = 401)`
  - Examples: `InvalidCredentialsError`, `TokenExpiredError`, `UserExistsError`, `AuthError`
  - Each error has a code (e.g., `AUTH_INVALID_CREDENTIALS`) and HTTP status code
  - Error messages should be opaque for security (avoid revealing internals)

- **TypeScript/React:** Try-catch blocks in services, error state in hooks and components
  - Error boundaries for React component trees: `ErrorBoundary` component catches errors in children
  - Inline error fallbacks: `InlineErrorFallback` component for non-critical components
  - Error state in hooks: `{ isLoading, error, data }` tuple pattern

- **Python async functions:** Use explicit exception raising with context
  - Example: `if not user: raise InvalidCredentialsError()`
  - Log errors with audit context (hashed PII for compliance)
  - Never expose sensitive details in error messages

## Logging

**Framework:**
- **Frontend:** `console.error()`, `console.warn()`, `console.log()` in development mode
- **Backend:** `structlog` with `logging.getLogger(__name__)`

**Patterns:**
- **Frontend:** Log errors only in development (guarded by `import.meta.env.DEV`)
  - Example: `if (import.meta.env.DEV) { console.error(...) }`
- **Backend:** Use module-level logger: `logger = logging.getLogger(__name__)`
  - Structured logging for audit trail (see `app/logging.py`)
  - Hash PII before logging (e.g., hashed email with `_hash_email_for_audit()`)
  - Log auth events with `log_auth_event()` for audit

## Comments

**When to Comment:**
- JSDoc/TSDoc for public functions, types, and components
- Inline comments for non-obvious logic or workarounds
- Feature flags: Reference feature/task IDs (e.g., "Feature: 012-client-favorites")
- Security/compliance notes: Mark with reasons and reference GDPR/SOC2

**JSDoc/TSDoc:**
- Required for exported components, hooks, services, and types
- Format: `/** ... */` above exports
- Example:
```typescript
/**
 * Error Boundary Component
 *
 * Catches JavaScript errors in child component tree and displays
 * a fallback UI. Provides error reporting and recovery options.
 *
 * Feature: 016-save-the-date Phase 13
 */
```

**Python Docstrings:**
- Required for modules, classes, and public functions
- Format: Triple-quoted strings at top of module/class/function
- Example:
```python
"""AuthService: signup, login, refresh, logout operations.

Implements local email/password authentication with Argon2id hashing and
JWT token issuance (EdDSA). Google OAuth is handled separately.

Correctness Properties enforced:
- Property 2: Password Hashing Consistency
- Property 3: JWT Token Claims Completeness
"""
```

## Function Design

**Size:**
- Keep functions focused on single responsibility
- Frontend components should be under 300 lines
- Backend service methods should be under 50 lines (extract async calls to helpers)

**Parameters:**
- Use destructuring for objects (TypeScript/React)
- Python: explicit parameters with type hints
- Avoid parameter proliferation; use config objects/dataclasses if >5 params

**Return Values:**
- TypeScript services return typed objects or tuples
- Python async functions return explicit types (use type hints)
- Hooks follow `{ state, loading, error, actions }` pattern
- Avoid returning undefined/None without explicit intent

## Module Design

**Exports:**
- TypeScript: Named exports preferred over default exports (except for React components)
- Python: Explicit `__all__` for public API
- Barrel files (index.ts) used for feature-level exports

**Barrel Files:**
- Used: `src/components/features/gallery/__tests__/` → exports commonly tested components
- Used: Service/hook index files export all public functions
- Pattern: Collect related exports in `index.ts` for cleaner imports

**Example barrel file:**
```typescript
export { ErrorBoundary, withErrorBoundary, InlineErrorFallback } from './ErrorBoundary';
export { withErrorBoundary } from './ErrorBoundary';
```

## Project-Specific Conventions

**Workspace packages:**
- Types: `@rawdrive/shared-types` - Domain enums and types
- Constants: `@rawdrive/shared-constants` - Config values (API_BASE, THRESHOLDS)
- Validation: `@rawdrive/shared-validation` - Zod/Pydantic schemas
- Utils: `@rawdrive/shared-utils` - Helper functions (formatDate, formatSize)

**Multi-tenant isolation:**
- Every database query MUST filter by `workspace_id`
- Extract from JWT claims, never from request body
- Python example: `select(Asset).where(Asset.workspace_id == workspace_id)`

**Authentication context:**
- Frontend: Extract JWT from localStorage or request
- Backend: Validate JWT with shared `JWT_SECRET` in all services
- Dependency injection: Use `Depends()` for auth in FastAPI routes

---

*Convention analysis: 2025-03-18*
