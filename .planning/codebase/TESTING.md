# Testing Patterns

**Analysis Date:** 2025-03-18

## Test Framework

**Frontend:**
- **Runner:** Vitest 1.6.1
- **Config:** `frontend/vitest.config.ts` (implicit, uses Vite integration)
- **Assertion Library:** Vitest built-in (expect)
- **DOM Testing:** @testing-library/react (16.3.1), @testing-library/dom (10.4.1)
- **User interaction:** @testing-library/user-event (14.6.1)

**Backend:**
- **Runner:** pytest 8.3+ with pytest-asyncio
- **Config:** `backend/pyproject.toml` `[tool.pytest.ini_options]`
- **Assertion Library:** pytest built-in (assert)
- **Mocking:** unittest.mock (AsyncMock, MagicMock, patch)
- **Property-based testing:** Hypothesis 6.100+
- **Data generation:** Faker 25.0+

**Run Commands:**
```bash
# Frontend
cd frontend && pnpm test                           # Run all tests with Vitest
cd frontend && pnpm test --watch                   # Watch mode
cd frontend && pnpm test:coverage                  # Coverage report

# Backend
docker exec rawdrive-backend pytest                # All tests in container
docker exec rawdrive-backend pytest tests/path/test_file.py # Single test
docker exec rawdrive-backend pytest -k "test_name" # By test name
docker exec rawdrive-backend pytest -m unit       # By marker (unit, integration, etc.)
docker exec rawdrive-backend pytest --cov=app --cov-report=html # Coverage HTML

# Backend (local)
cd backend && pytest
cd backend && pytest --cov=app --cov-report=html
```

## Test File Organization

**Frontend Location:**
- **Co-located pattern (preferred):** `__tests__` subdirectory next to source
  - Source: `src/components/features/gallery/GalleryCard.tsx`
  - Test: `src/components/features/gallery/__tests__/GalleryCard.test.tsx`
  - Source: `src/hooks/useFavorites.ts`
  - Test: `src/hooks/__tests__/useFavorites.test.ts`
  - Source: `src/services/favoritesService.ts`
  - Test: `src/services/__tests__/favoritesService.test.ts`

- **Landing page tests:** `src/test/` directory (e.g., `src/test/integration.test.tsx`, `src/test/seo.test.tsx`)
- **E2E tests:** `src/__tests__/e2e/` (e.g., `src/__tests__/e2e/SettingsNavigation.e2e.test.ts`)

**Naming:**
- `.test.ts` or `.test.tsx` for standard tests
- `.property.test.tsx` for property-based tests (e.g., `privacy.property.test.tsx`)
- `.integration.test.tsx` for integration tests (e.g., `coordinateWorkflow.integration.test.tsx`)

**Backend Location:**
- Root: `backend/tests/` directory
- Mirrored structure: `tests/api/v1/test_auth.py` mirrors `src/app/api/v1/auth.py`
- File naming: `test_*.py` or `*_test.py`
- Conftest: `backend/tests/conftest.py` for shared fixtures

**Structure:**
```
frontend/src/
├── components/features/gallery/
│   ├── GalleryCard.tsx
│   └── __tests__/
│       ├── GalleryCard.test.tsx
│       ├── BulkActions.test.tsx
│       └── ...

backend/tests/
├── conftest.py
├── test_session_service.py
└── test_shared_types_parity.py
```

## Test Structure

**Frontend Pattern (Vitest + React Testing Library):**
```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFavorites } from '../useFavorites';
import { favoritesService } from '../../services/favoritesService';

// Mock external dependencies
vi.mock('../../services/favoritesService', () => ({
  favoritesService: {
    getFavorites: vi.fn(),
    getLists: vi.fn(),
    toggleFavorite: vi.fn(),
  },
}));

// Helper factories for test data
const createMockFavorite = (id: string, listId = 'default-list') => ({
  interaction_id: `interaction-${id}`,
  asset_id: id,
  list_id: listId,
  // ... other fields
});

describe('useFavorites Hook', () => {
  const mockGalleryId = 'gallery-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return empty state when disabled', async () => {
      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId, enabled: false })
      );

      expect(result.current.favorites).toEqual([]);
    });
  });

  describe('toggleFavorite', () => {
    it('should call the service when adding favorite', async () => {
      // Setup
      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 50, total: 0, total_pages: 0 },
      });

      const { result } = renderHook(() => useFavorites({ galleryId: mockGalleryId }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Execute
      await act(async () => {
        await result.current.toggleFavorite('new-asset', true);
      });

      // Assert
      expect(favoritesService.toggleFavorite).toHaveBeenCalledWith(
        mockGalleryId,
        { asset_id: 'new-asset', favorited: true, list_id: undefined }
      );
    });
  });
});
```

**Key Patterns:**
- Use `renderHook()` for hook testing (not component-level)
- Use `act()` wrapper for state updates and async actions
- Use `waitFor()` to wait for async operations
- `vi.mock()` for mocking services (Vitest syntax)
- `vi.clearAllMocks()` before each test
- Factory functions (`createMock*`) for reusable test data
- Organized in nested `describe()` blocks by feature/responsibility

**Python Pattern (pytest + asyncio):**
```python
import pytest
import uuid
from unittest.mock import Mock, AsyncMock, patch

@pytest.fixture
def mock_pool():
    """Create a mock database pool."""
    pool = AsyncMock()
    return pool

@pytest.fixture
def session_service():
    """Create a SessionService instance."""
    return SessionService()

class TestSessionCreation:
    """Tests for session creation functionality."""

    @pytest.mark.asyncio
    async def test_create_session_sql_parameters(self, session_service, mock_pool):
        """
        Test that create_session uses correct SQL parameter binding.

        CRITICAL: If this test fails, check session_service.py line 157-179
        for SQL parameter binding issues.
        """
        # Arrange
        user_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        token = "test_token"

        # Capture SQL execution
        captured_sql = None
        captured_params = None

        async def capture_execute(sql, *params):
            nonlocal captured_sql, captured_params
            captured_sql = sql
            captured_params = params

        mock_pool.execute = AsyncMock(side_effect=capture_execute)

        # Act
        with patch('app.services.session_service.get_postgres_pool', return_value=mock_pool):
            try:
                await session_service.create_session(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    token=token,
                    device_info={"platform": "web"},
                    device_fingerprint="test_fingerprint",
                    ip_address="127.0.0.1",
                    user_agent="Mozilla/5.0",
                    expires_at=datetime.utcnow() + timedelta(hours=1)
                )
            except Exception:
                pass  # We're testing SQL structure, not execution

        # Assert
        assert captured_sql is not None, "SQL was not executed"
        assert len(captured_params) == 13, f"Expected 13 parameters, got {len(captured_params)}"
        assert "$13" in captured_sql, "VALUES clause should use $13 for last parameter"
```

**Key Patterns:**
- Use `@pytest.fixture` for setup/teardown
- Use `@pytest.mark.asyncio` for async tests
- Use `AsyncMock` for async function mocking
- Use `patch()` for dependency injection in tests
- Arrange-Act-Assert (AAA) pattern
- Capture state/SQL for verification (e.g., `captured_sql`, `captured_params`)

## Mocking

**Frontend:**
- **Framework:** Vitest `vi.mock()` with manual mock implementations
- **Pattern:** Mock at module level, not individual functions
- **Mocking services:**
  ```typescript
  vi.mock('../../services/favoritesService', () => ({
    favoritesService: {
      getFavorites: vi.fn(),
      getLists: vi.fn(),
      toggleFavorite: vi.fn(),
    },
  }));
  ```
- **Configure mock behavior:** Use `vi.mocked(fn).mockResolvedValue(...)` or `mockRejectedValue(...)`
- **Reset between tests:** `vi.clearAllMocks()` in `beforeEach()`

**Backend:**
- **Framework:** unittest.mock (AsyncMock, MagicMock, patch)
- **Pattern:** Use fixtures with AsyncMock for dependencies
- **Async mocking:**
  ```python
  mock_pool = AsyncMock()
  mock_pool.execute = AsyncMock(side_effect=capture_execute)
  ```
- **Dependency injection:** Use `patch()` context manager or decorator
  ```python
  with patch('app.services.session_service.get_postgres_pool', return_value=mock_pool):
      await session_service.create_session(...)
  ```

**What to Mock:**
- External API calls (HTTP clients, third-party APIs)
- Database/Redis connections (use fixtures)
- Service dependencies (inject as parameters or via DI)
- Crypto functions for deterministic tests

**What NOT to Mock:**
- Core business logic (test real implementations)
- Validation and schema functions (test actual behavior)
- Error handling (test actual error cases)
- Utility functions unless they have external side effects

## Fixtures and Factories

**Frontend Test Data:**
- Use factory functions with sensible defaults
- Pattern: `createMock<Entity>(overrides?: Partial<Entity>)`
- Examples:
  ```typescript
  const createMockFavorite = (id: string, listId = 'default-list') => ({
    interaction_id: `interaction-${id}`,
    asset_id: id,
    list_id: listId,
    thumbnail_url: `https://example.com/${id}.jpg`,
    filename: `photo-${id}.jpg`,
    width: 1920,
    height: 1080,
    favorited_at: new Date().toISOString(),
  });

  const createMockList = (id: string, name: string, isDefault = false) => ({
    list_id: id,
    workspace_id: 'workspace-1',
    gallery_id: 'gallery-1',
    client_token: 'client-token-123',
    name,
    is_default: isDefault,
    sort_order: 0,
    photo_count: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  ```

**Backend Fixtures:**
- Location: `backend/tests/conftest.py` for shared fixtures
- Scope: Typically `function` scope (isolated per test), `session` for expensive setup
- Pattern:
  ```python
  @pytest.fixture
  def mock_pool():
      """Create a mock database pool."""
      pool = AsyncMock()
      return pool

  @pytest.fixture
  def session_service():
      """Create a SessionService instance."""
      return SessionService()
  ```

## Coverage

**Requirements:**
- **Frontend:** No enforced minimum (configured in package.json but no CI check)
- **Backend:** 70% minimum (enforced by `pyproject.toml` `fail_under = 70`)

**View Coverage:**
```bash
# Frontend
cd frontend && pnpm test:coverage

# Backend
docker exec rawdrive-backend pytest --cov=app --cov-report=html --cov-report=xml
# View at: backend/htmlcov/index.html
# Or: backend/coverage.xml (for CI integration)
```

**Configuration:**
- **Backend:** `.coveragerc` in root with detailed settings
  - Source: `src/app`
  - Branch coverage enabled
  - Parallel collection for pytest-xdist
  - Excludes: tests, migrations, venv, alembic
  - Excludes from coverage: pragma comments, debug code, abstract methods, type checks

## Test Types

**Unit Tests:**
- **Scope:** Single function/hook/service in isolation
- **Speed:** <100ms per test
- **Dependencies:** All external services mocked
- **Frontend examples:** `useFavorites.test.ts`, `favoritesService.test.ts`
- **Backend examples:** `test_session_service.py` with mocked database

**Integration Tests:**
- **Scope:** Multiple components/services working together
- **Speed:** 100ms-5s per test
- **Dependencies:** Real services (database, Redis) when needed
- **Markers:** `@pytest.mark.integration`
- **Examples:** Full request-response cycle, multi-service workflows

**E2E Tests:**
- **Scope:** Full user workflows (login → action → logout)
- **Speed:** 1s-60s per test
- **Dependencies:** Live environment or Docker services
- **Framework:** Playwright (`@playwright/test` in devDependencies)
- **Location:** `src/__tests__/e2e/*.e2e.test.ts`

**Property-Based Tests:**
- **Framework:** Hypothesis (Python), fast-check (TypeScript via @types)
- **Use case:** Generate random inputs, verify invariants hold
- **Marker:** `@pytest.mark.property`
- **Example:** Authentication properties (hash consistency, token validity)

## Common Patterns

**Async Testing:**
```typescript
// Frontend - with Vitest + RTL
await waitFor(() => {
  expect(result.current.isLoading).toBe(false);
});

await act(async () => {
  await result.current.toggleFavorite('asset-1', true);
});

// Backend - with pytest-asyncio
@pytest.mark.asyncio
async def test_async_operation(self):
    result = await async_function()
    assert result is not None
```

**Error Testing:**
```typescript
// Frontend
it('should set error state when fetch fails', async () => {
  const mockError = new Error('Network error');
  vi.mocked(favoritesService.getFavorites).mockRejectedValue(mockError);

  const { result } = renderHook(() => useFavorites({ galleryId: mockGalleryId }));

  await waitFor(() => {
    expect(result.current.error).toBeTruthy();
  });
});

// Backend
def test_invalid_credentials(self):
    with pytest.raises(InvalidCredentialsError) as exc_info:
        auth_service.verify_password("wrong_password", stored_hash)

    assert exc_info.value.code == "AUTH_INVALID_CREDENTIALS"
    assert exc_info.value.status == 401
```

**Pagination/Infinite Scroll Testing:**
```typescript
// Test pagination state
it('should detect hasNextPage when more items exist', async () => {
  const page1Items = Array.from({ length: 50 }, (_, i) =>
    createMockFavorite(`asset-${i}`)
  );

  vi.mocked(favoritesService.getFavorites).mockResolvedValue({
    data: page1Items,
    meta: { page: 1, limit: 50, total: 100, total_pages: 2 },
  });

  // ... test logic
  expect(result.current.hasNextPage).toBe(true);
});

// Test loadMore
await act(async () => {
  result.current.loadMore();
});

await waitFor(() => {
  expect(result.current.favorites).toHaveLength(75);
});
```

## Test Markers (Backend)

Available pytest markers (defined in `pyproject.toml`):
- `unit` - Fast, isolated tests with mocked dependencies
- `integration` - Tests requiring external services (database, Redis)
- `e2e` - Full system end-to-end tests
- `performance` - Performance and benchmark tests
- `load` - Load testing
- `security` - Security-focused tests
- `property` - Property-based tests using Hypothesis
- `slow` - Tests taking >5 seconds
- `database` - Tests requiring PostgreSQL
- `redis` - Tests requiring Redis
- `external` - Tests requiring external services (APIs, cloud)

**Usage:**
```bash
pytest -m unit                    # Run only unit tests
pytest -m "integration and not slow"  # Integration tests, exclude slow
pytest -m "not external"          # Skip external service tests
```

---

*Testing analysis: 2025-03-18*
