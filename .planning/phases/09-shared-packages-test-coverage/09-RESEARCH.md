# Phase 9: Shared Packages & Test Coverage - Research

**Researched:** 2026-03-19
**Domain:** TypeScript package builds (tsup/tsc), pytest integration testing, Vitest component testing
**Confidence:** HIGH

## Summary

Phase 9 has two distinct workstreams: (1) fixing two shared packages that fail to produce `dist/` output, and (2) writing comprehensive tests across backend and frontend for all critical paths from Phases 1-8.

The package build issues are straightforward. `@rawdrive/api-types` uses tsup but its tsconfig has `noEmit: true` -- tsup ignores tsconfig emit settings so this is not the blocker; the issue is simply that `pnpm build:packages` has never been run successfully or the dist directories were gitignored/deleted. `@rawdrive/database-utils` uses plain `tsc` for build, and its tsconfig does NOT have `noEmit`, so it should build cleanly. Both packages have zero dependencies on external runtime libraries (only types/constants), making builds trivial.

The test coverage workstream is larger. The backend already has ~30 test files across unit/integration/security directories plus root-level test files. The frontend has ~90 test files. The gaps are specific: no dedicated auth flow integration tests, no multi-tenant isolation tests, no email sending integration tests, no AI worker concurrency tests, no upload workflow component tests, and no auth page component tests. Existing test infrastructure (pytest with asyncio + httpx for backend, Vitest with jsdom + React Testing Library for frontend) is mature and ready.

**Primary recommendation:** Fix package builds first (small, fast), then write tests grouped by backend-integration, backend-security, frontend-gallery, frontend-auth -- each group is independent and parallelizable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion -- infrastructure + testing phase. Specific targets:

- PKG-01: @rawdrive/api-types package built with dist output
- PKG-02: @rawdrive/database-utils package built with dist output
- TEST-01: Backend integration tests for auth flows (login, signup, token refresh, logout)
- TEST-02: Backend integration tests for multi-tenant isolation (workspace_id enforcement)
- TEST-03: Backend integration tests for email sending (verification, reset, invitations)
- TEST-04: Backend tests for AI worker concurrency (CLIP embedding, clustering)
- TEST-05: Frontend component tests for gallery viewing and upload workflows
- TEST-06: Frontend component tests for auth pages (signin, signup, forgot password)
- TEST-07: Security enforcement tests (permission checks, workspace isolation, timing-safe comparison)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PKG-01 | @rawdrive/api-types built with dist output | tsup build script exists in package.json; tsconfig `noEmit` irrelevant since tsup handles emit; just needs `pnpm install` + `pnpm build` |
| PKG-02 | @rawdrive/database-utils built with dist output | tsc build script exists; tsconfig is correctly configured with `outDir: dist`; sources are 3 small files |
| TEST-01 | Backend integration tests for auth flows | Backend has `auth.py` API route, `test_auth_service.py` unit test exists but no integration test hitting endpoints; use httpx AsyncClient with ASGI transport |
| TEST-02 | Backend integration tests for multi-tenant isolation | `test_workspace_authorization.py` and `test_rsvp_workspace_isolation.py` exist in integration/; need dedicated workspace_id enforcement tests across multiple endpoints |
| TEST-03 | Backend integration tests for email sending | `test_email_verification.py`, `test_password_reset.py`, `test_invitation_emails.py` exist at root level; may need consolidation or gap-filling for invitation email integration |
| TEST-04 | Backend tests for AI worker concurrency | `test_similarity_worker.py`, `test_clustering_integration.py`, `test_embedding_repository.py` exist; need concurrency-specific tests (parallel batch processing, race conditions) |
| TEST-05 | Frontend component tests for gallery/upload | Gallery has 19 existing test files in `__tests__/`; upload components (UploadDropzone, UploadQueue, UploadProgressPanel) have ZERO tests |
| TEST-06 | Frontend component tests for auth pages | SignInPage.tsx, SignUpPage.tsx, ForgotPasswordPage.tsx in `pages/public/` have ZERO tests |
| TEST-07 | Security enforcement tests | `tests/security/` has 4 files (timing-safe, AI key, comment isolation, curation locking); need permission check tests and broader workspace isolation enforcement |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tsup | ^8.0.0 | Bundle @rawdrive/api-types | Already configured in package.json; handles ESM + DTS generation |
| typescript | ^5.3.3 | Build @rawdrive/database-utils, type checking | Already installed across all packages |
| pytest | (Docker) | Backend test runner | Already configured in conftest.py with asyncio support |
| pytest-asyncio | (Docker) | Async test support | Already in conftest.py fixtures |
| httpx | >=0.27 | Backend integration test HTTP client | Already used via AsyncClient + ASGITransport pattern |
| vitest | ^1.6.1 | Frontend test runner | Already configured in vite.config.ts with jsdom |
| @testing-library/react | ^16.3.1 | React component testing | Already installed in frontend devDependencies |
| @testing-library/user-event | ^14.6.1 | User interaction simulation | Already installed in frontend devDependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/jest-dom | ^6.9.1 | DOM matchers (toBeInTheDocument, etc.) | Already setup in test/setup.ts |
| fast-check | ^4.5.1 | Property-based testing | Already installed; use for edge-case heavy tests |
| unittest.mock | stdlib | Python mocking | Already used extensively in conftest.py |

### Alternatives Considered
None -- all tooling is already established. No new libraries needed.

**Installation:** No new packages required. All dependencies are already installed.

## Architecture Patterns

### Package Build Pattern

**api-types (tsup):**
```
packages/api-types/
  src/
    index.ts          # Re-exports + service constants
    lib/axios-instance.ts
    clients/*.ts      # Generated API clients
    schemas/*.ts      # Zod schemas
  dist/               # OUTPUT: ESM + .d.ts files
  package.json        # build: "tsup src/index.ts src/clients/*.ts src/schemas/*.ts --format esm --dts --clean"
```

Key issue: tsconfig.json has `"noEmit": true` which is fine for `typecheck` script but tsup ignores this setting entirely -- it uses its own emit logic. The build command should work as-is.

**database-utils (tsc):**
```
packages/database-utils/
  src/
    index.ts          # Re-exports types + constants
    types.ts           # Type definitions
    constants.ts       # Pool/retry defaults
  dist/               # OUTPUT: JS + .d.ts files
  package.json        # build: "tsc -p tsconfig.json"
  tsconfig.json       # outDir: dist, NO noEmit flag
```

This should build with zero changes to config.

### Backend Test Pattern (Existing)
```python
# Integration test pattern from conftest.py
@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

# Test pattern
@pytest.mark.asyncio
async def test_endpoint(client: AsyncClient):
    response = await client.post("/api/v1/auth/login", json={...})
    assert response.status_code == 200
```

### Frontend Test Pattern (Existing)
```typescript
// Component test pattern from existing gallery tests
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

// Mock dependencies
vi.mock('@/services/api', () => ({...}));
vi.mock('react-router-dom', () => ({...}));

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });
});
```

### Test File Organization
```
backend/tests/
  integration/
    test_auth_flows.py          # TEST-01 (NEW)
    test_multi_tenant.py        # TEST-02 (NEW or extend existing)
    test_email_integration.py   # TEST-03 (consolidate existing)
    test_ai_concurrency.py      # TEST-04 (NEW)
  security/
    test_permission_checks.py   # TEST-07 (NEW)
    test_a2a_timing_safe.py     # (existing)
    ...

frontend/src/
  components/features/upload/__tests__/
    UploadDropzone.test.tsx     # TEST-05 (NEW)
    UploadQueue.test.tsx        # TEST-05 (NEW)
    UploadProgressPanel.test.tsx # TEST-05 (NEW)
  pages/public/__tests__/
    SignInPage.test.tsx          # TEST-06 (NEW)
    SignUpPage.test.tsx          # TEST-06 (NEW)
    ForgotPasswordPage.test.tsx  # TEST-06 (NEW)
```

### Anti-Patterns to Avoid
- **Testing implementation details:** Test behavior, not internal state. Don't assert on component state variables -- assert on rendered output.
- **Mocking too much in integration tests:** Backend integration tests should use the real ASGI app; mock only external services (Redis, database, email provider).
- **Importing from dist in tests:** Package tests should import from `src/`, not `dist/`. Only consumers import from `dist/`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP test client | Raw fetch/requests calls | httpx AsyncClient with ASGITransport | Already configured, handles async properly |
| React render wrapper | Custom render with providers | @testing-library/react render + wrapper pattern | Standard, well-documented |
| Mock factories | Ad-hoc mock objects in each test | Shared fixtures in conftest.py / test utils | DRY, consistent test data |
| Package bundling | Custom build scripts | tsup (api-types) / tsc (database-utils) | Already configured, zero custom logic needed |

## Common Pitfalls

### Pitfall 1: tsup Ignoring Client Files
**What goes wrong:** tsup only bundles entry points specified in the command. If `src/clients/*.ts` files import each other or have barrel exports not in the entry list, they get tree-shaken out.
**Why it happens:** tsup entry points must match the `exports` map in package.json.
**How to avoid:** Verify each `exports` path has a matching tsup entry point. The current build command lists `src/index.ts src/clients/*.ts src/schemas/*.ts` which should cover all exports.
**Warning signs:** Build succeeds but `dist/clients/` is missing files.

### Pitfall 2: Async Test Fixtures Scope Mismatch
**What goes wrong:** pytest-asyncio fixtures with different scopes cause event loop errors.
**Why it happens:** Session-scoped async fixtures need a session-scoped event loop (already configured in conftest.py).
**How to avoid:** New test fixtures should use function scope (default) unless there's a clear reason for session scope.
**Warning signs:** `RuntimeError: Event loop is closed` or `ScopeMismatch` errors.

### Pitfall 3: Frontend Tests Missing Providers
**What goes wrong:** Components that use react-router-dom, react-query, or context providers crash with "No Router" or "No QueryClient" errors.
**Why it happens:** Components deep in the tree depend on providers that only exist in the full app.
**How to avoid:** Create a test render wrapper that includes MemoryRouter, QueryClientProvider, and necessary contexts.
**Warning signs:** `useNavigate() may be used only in the context of a <Router>` errors.

### Pitfall 4: Mock Leaking Between Tests
**What goes wrong:** One test's mock affects subsequent tests.
**Why it happens:** vi.mock() at module level is hoisted and persistent. Backend unittest.mock.patch without proper cleanup.
**How to avoid:** Use `vi.restoreAllMocks()` in afterEach (frontend). Use pytest fixtures with proper teardown (backend).
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 5: Missing orval-generated Clients
**What goes wrong:** `@rawdrive/api-types` build fails because `src/clients/` contains orval-generated files that import axios but axios is a peerDependency.
**Why it happens:** tsup needs to externalize peerDependencies, and orval-generated code depends on axios at runtime.
**How to avoid:** Ensure tsup config externalizes axios (it does by default for peerDeps). Verify clients directory has actual generated content.
**Warning signs:** Build errors about missing `axios` module.

## Code Examples

### Backend Auth Flow Integration Test
```python
# tests/integration/test_auth_flows.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_login_returns_tokens(client: AsyncClient):
    """TEST-01: Login returns access + refresh tokens."""
    response = await client.post("/api/v1/auth/login", json={
        "email": "free@test.rawdrive.in",
        "password": "Test@123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data

@pytest.mark.asyncio
async def test_workspace_isolation(client: AsyncClient, auth_headers_workspace_a, auth_headers_workspace_b):
    """TEST-02: Workspace A cannot see Workspace B resources."""
    # Create resource in workspace A
    resp_a = await client.get("/api/v1/galleries", headers=auth_headers_workspace_a)
    gallery_ids_a = {g["id"] for g in resp_a.json()["items"]}

    # Workspace B should see none of A's galleries
    resp_b = await client.get("/api/v1/galleries", headers=auth_headers_workspace_b)
    gallery_ids_b = {g["id"] for g in resp_b.json()["items"]}

    assert gallery_ids_a.isdisjoint(gallery_ids_b)
```

### Frontend Auth Page Component Test
```typescript
// pages/public/__tests__/SignInPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInPage } from '../SignInPage';

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('SignInPage', () => {
  it('renders email and password fields', () => {
    renderWithProviders(<SignInPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows validation errors for empty submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignInPage />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/required/i)).toBeInTheDocument();
    });
  });
});
```

### Frontend Upload Component Test
```typescript
// components/features/upload/__tests__/UploadDropzone.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadDropzone } from '../UploadDropzone';

vi.mock('@/hooks/useUpload', () => ({
  useUpload: () => ({
    upload: vi.fn(),
    isUploading: false,
    progress: 0,
  }),
}));

describe('UploadDropzone', () => {
  it('renders drop area with instructions', () => {
    render(<UploadDropzone galleryId="test-id" />);
    expect(screen.getByText(/drag.*drop/i)).toBeInTheDocument();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tsc for all packages | tsup for complex packages (api-types), tsc for simple packages (database-utils) | Already configured | tsup handles ESM/DTS/tree-shaking better for multi-entry packages |
| Jest for React testing | Vitest | Already configured | Faster, native ESM support, Vite integration |
| requests for Python API tests | httpx AsyncClient with ASGITransport | Already configured | Native async support, no real server needed |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend) | pytest + pytest-asyncio (in Docker) |
| Framework (frontend) | Vitest 1.6.1 + jsdom + React Testing Library |
| Config file (backend) | `backend/pyproject.toml` + `backend/tests/conftest.py` |
| Config file (frontend) | `frontend/vite.config.ts` (test section) + `frontend/src/test/setup.ts` |
| Quick run command (backend) | `docker exec rawdrive-backend pytest tests/integration/test_auth_flows.py -x` |
| Quick run command (frontend) | `cd frontend && pnpm test src/pages/public/__tests__/SignInPage.test.tsx` |
| Full suite command (backend) | `docker exec rawdrive-backend pytest` |
| Full suite command (frontend) | `cd frontend && pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PKG-01 | api-types produces dist/ | build | `cd packages/api-types && pnpm build && ls dist/index.js` | N/A (build verification) |
| PKG-02 | database-utils produces dist/ | build | `cd packages/database-utils && pnpm build && ls dist/index.js` | N/A (build verification) |
| TEST-01 | Auth flow integration | integration | `docker exec rawdrive-backend pytest tests/integration/test_auth_flows.py -x` | Wave 0 |
| TEST-02 | Multi-tenant isolation | integration | `docker exec rawdrive-backend pytest tests/integration/test_multi_tenant.py -x` | Wave 0 |
| TEST-03 | Email sending integration | integration | `docker exec rawdrive-backend pytest tests/test_email_verification.py tests/test_invitation_emails.py -x` | Partial (existing files) |
| TEST-04 | AI worker concurrency | unit/integration | `docker exec rawdrive-backend pytest tests/integration/test_ai_concurrency.py -x` | Wave 0 |
| TEST-05 | Gallery/upload frontend | component | `cd frontend && pnpm test src/components/features/upload/__tests__/` | Wave 0 |
| TEST-06 | Auth pages frontend | component | `cd frontend && pnpm test src/pages/public/__tests__/` | Wave 0 |
| TEST-07 | Security enforcement | security | `docker exec rawdrive-backend pytest tests/security/ -x` | Partial (4 files exist) |

### Sampling Rate
- **Per task commit:** Quick run command for affected test files
- **Per wave merge:** Full backend + frontend suite
- **Phase gate:** All test suites green

### Wave 0 Gaps
- [ ] `tests/integration/test_auth_flows.py` -- covers TEST-01
- [ ] `tests/integration/test_multi_tenant.py` -- covers TEST-02
- [ ] `tests/integration/test_ai_concurrency.py` -- covers TEST-04
- [ ] `frontend/src/components/features/upload/__tests__/UploadDropzone.test.tsx` -- covers TEST-05
- [ ] `frontend/src/components/features/upload/__tests__/UploadQueue.test.tsx` -- covers TEST-05
- [ ] `frontend/src/pages/public/__tests__/SignInPage.test.tsx` -- covers TEST-06
- [ ] `frontend/src/pages/public/__tests__/SignUpPage.test.tsx` -- covers TEST-06
- [ ] `frontend/src/pages/public/__tests__/ForgotPasswordPage.test.tsx` -- covers TEST-06
- [ ] `tests/security/test_permission_checks.py` -- covers TEST-07

## Open Questions

1. **orval-generated client completeness**
   - What we know: `src/clients/` has backend.ts, gallery-service.ts, webhooks-service.ts but package.json exports billing, client, notifications, invitations services too
   - What's unclear: Whether missing client files will cause tsup build to fail on glob expansion
   - Recommendation: Run build, handle missing entries by either generating them or removing from exports map

2. **Backend test database state**
   - What we know: conftest.py sets `DATABASE_URL` to a test database and mocks heavily
   - What's unclear: Whether integration tests need a real database or can work with mocked repositories
   - Recommendation: Use mocked repositories for unit/integration tests (existing pattern); only e2e needs real DB

## Sources

### Primary (HIGH confidence)
- Direct file inspection of `packages/api-types/package.json`, `tsconfig.json`, source files
- Direct file inspection of `packages/database-utils/package.json`, `tsconfig.json`, source files
- Direct file inspection of `backend/tests/conftest.py` and existing test files
- Direct file inspection of `frontend/vite.config.ts` test configuration
- Direct file inspection of `frontend/src/test/setup.ts`

### Secondary (MEDIUM confidence)
- tsup documentation: tsup ignores tsconfig `noEmit` -- it has its own emit pipeline
- Vitest documentation: test config in vite.config.ts `test` block is standard

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools already installed and configured in the project
- Architecture: HIGH - existing patterns are clear from conftest.py and test files
- Pitfalls: HIGH - identified from actual project configuration inspection
- Package builds: HIGH - root cause (missing dist/) identified from direct file listing

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- testing infrastructure rarely changes)
