---
name: testing
description: Testing standards for RawDrive. Use when writing tests, setting up test fixtures, or reviewing test coverage.
---

# Testing Standards

## Overview

RawDrive uses a comprehensive testing strategy across all apps and packages in the TurboRepo monorepo:
- **Frontend Apps (web, admin)**: Vitest + React Testing Library
- **Backend API**: Vitest + Supertest
- **AI Service**: pytest + pytest-asyncio
- **Shared Packages**: Vitest

## Test Organization

### Directory Structure

```
RawDrive/
├── apps/
│   ├── web/
│   │   └── src/
│   │       └── __tests__/           # Web app tests
│   │           ├── components/      # Component tests
│   │           │   ├── GalleryGrid.test.tsx
│   │           │   └── ui/
│   │           │       ├── AppButton.test.tsx
│   │           │       └── AppInput.test.tsx
│   │           ├── hooks/           # Hook tests
│   │           │   └── useToast.test.ts
│   │           ├── services/        # Service tests
│   │           │   └── apiService.test.ts
│   │           ├── utils/           # Utility tests
│   │           ├── integration/     # Integration tests
│   │           └── fixtures/        # Test data
│   │               └── mockData.ts
│   │
│   ├── admin/
│   │   └── src/
│   │       └── __tests__/           # Admin app tests
│   │           ├── components/
│   │           ├── pages/
│   │           └── fixtures/
│   │
│   ├── api/
│   │   └── tests/                   # Backend tests
│   │       ├── unit/                # Unit tests
│   │       │   ├── services/
│   │       │   │   └── AuthService.test.ts
│   │       │   └── middleware/
│   │       │       └── rbac.test.ts
│   │       ├── integration/         # Integration tests
│   │       │   └── api/
│   │       │       └── galleries.test.ts
│   │       ├── e2e/                 # End-to-end tests
│   │       ├── fixtures/            # Test fixtures
│   │       │   └── factories.ts
│   │       └── helpers/             # Test utilities
│   │           └── testDb.ts
│   │
│   └── ai-service/
│       └── tests/                   # Python tests
│           ├── unit/
│           │   └── test_llm_client.py
│           ├── integration/
│           │   └── test_mcp_tools.py
│           └── conftest.py          # pytest fixtures
│
└── packages/
    ├── ui/
    │   └── src/
    │       └── __tests__/           # Shared UI tests
    │           └── components/
    │               └── Button.test.tsx
    │
    ├── utils/
    │   └── src/
    │       └── __tests__/           # Shared utils tests
    │           └── validation.test.ts
    │
    └── types/
        └── src/
            └── __tests__/           # Type tests (type assertions)
```

### File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Component tests | `ComponentName.test.tsx` | `GalleryGrid.test.tsx` |
| Service tests | `ServiceName.test.ts` | `AuthService.test.ts` |
| Hook tests | `useHookName.test.ts` | `useToast.test.ts` |
| Integration tests | `feature.integration.test.ts` | `auth.integration.test.ts` |
| E2E tests | `workflow.e2e.test.ts` | `upload.e2e.test.ts` |
| Python tests | `test_module_name.py` | `test_llm_client.py` |

## TurboRepo Test Commands

```bash
# Run all tests across monorepo
pnpm test

# Run tests for specific app/package
pnpm test --filter=web
pnpm test --filter=admin
pnpm test --filter=api
pnpm test --filter=@rawdrive/ui

# Run tests with coverage
pnpm test:coverage

# Watch mode (in specific package)
pnpm --filter=web test:watch

# Run AI service tests
cd apps/ai-service && pytest
cd apps/ai-service && pytest --cov=src
```

## Frontend Testing (apps/web, apps/admin)

### Test Setup

```typescript
// apps/web/src/__tests__/setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock fetch globally
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  value: IntersectionObserverMock,
});
```

### Component Test Pattern

```typescript
// apps/web/src/__tests__/components/GalleryGrid.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GalleryGrid } from '@/components/GalleryGrid';
import { mockGalleries } from '../fixtures/mockData';

describe('GalleryGrid', () => {
  const mockOnSelect = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders galleries correctly', () => {
    render(<GalleryGrid galleries={mockGalleries} onSelect={mockOnSelect} />);

    expect(screen.getAllByRole('article')).toHaveLength(mockGalleries.length);
    expect(screen.getByText(mockGalleries[0].name)).toBeInTheDocument();
  });

  it('calls onSelect when gallery is clicked', async () => {
    render(<GalleryGrid galleries={mockGalleries} onSelect={mockOnSelect} />);

    await user.click(screen.getAllByRole('article')[0]);

    expect(mockOnSelect).toHaveBeenCalledWith(mockGalleries[0]);
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it('displays empty state when no galleries', () => {
    render(<GalleryGrid galleries={[]} onSelect={mockOnSelect} />);

    expect(screen.getByText(/no galleries/i)).toBeInTheDocument();
  });

  it('supports keyboard navigation', async () => {
    render(<GalleryGrid galleries={mockGalleries} onSelect={mockOnSelect} />);

    const firstGallery = screen.getAllByRole('article')[0];
    firstGallery.focus();

    await user.keyboard('{Enter}');

    expect(mockOnSelect).toHaveBeenCalledWith(mockGalleries[0]);
  });

  it('shows loading skeleton while loading', () => {
    render(<GalleryGrid galleries={[]} onSelect={mockOnSelect} loading />);

    expect(screen.getAllByTestId('gallery-skeleton')).toHaveLength(6);
  });
});
```

### Testing Shared UI Components

```typescript
// packages/ui/src/__tests__/components/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('applies variant styles', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-destructive');
  });

  it('shows loading state', () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);
    await user.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Hook Test Pattern

```typescript
// apps/web/src/__tests__/hooks/useToast.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '@/hooks/useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows toast with message', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Test message', 'success');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Test message');
    expect(result.current.toasts[0].type).toBe('success');
  });

  it('auto-dismisses toast after timeout', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Test message', 'info');
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.toasts).toHaveLength(0);
  });
});
```

## Backend Testing (apps/api)

### Test Database Setup

```typescript
// apps/api/tests/helpers/testDb.ts
import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';

let testPool: Pool;

export async function setupTestDb(): Promise<Pool> {
  testPool = new Pool({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'rawdrive_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
  });

  await runMigrations(testPool);
  return testPool;
}

export async function cleanupTestDb(): Promise<void> {
  await testPool.query(`
    TRUNCATE TABLE
      assets, galleries, users, workspaces, audit_logs
    CASCADE
  `);
}

export async function teardownTestDb(): Promise<void> {
  await testPool.end();
}

// Test data factories
export function createTestWorkspace(overrides = {}) {
  return {
    id: uuid(),
    name: 'Test Studio',
    slug: `test-studio-${Date.now()}`,
    plan_id: 'professional',
    ...overrides,
  };
}

export function createTestUser(workspaceId: string, overrides = {}) {
  return {
    id: uuid(),
    workspace_id: workspaceId,
    email: `test-${Date.now()}@example.com`,
    password_hash: '$2b$12$test-hash',
    full_name: 'Test User',
    ...overrides,
  };
}
```

### Service Unit Test

```typescript
// apps/api/tests/unit/services/AuthService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '@/services/AuthService';
import { pool } from '@/config/database';
import { cacheGet, cacheSet } from '@/config/redis';

vi.mock('@/config/database');
vi.mock('@/config/redis');

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = AuthService.getInstance();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('creates user with hashed password', async () => {
      const mockUserId = 'user-123';
      const mockWorkspaceId = 'workspace-123';

      (pool.query as any)
        .mockResolvedValueOnce({ rows: [{ id: mockWorkspaceId }] })
        .mockResolvedValueOnce({ rows: [{ id: mockUserId }] });

      const result = await authService.register(
        'test@example.com',
        'SecurePass123!',
        'Test User'
      );

      expect(result.userId).toBe(mockUserId);

      // Verify password was hashed
      const createUserCall = (pool.query as any).mock.calls[1];
      expect(createUserCall[1][2]).not.toBe('SecurePass123!');
      expect(createUserCall[1][2]).toMatch(/^\$2[aby]\$/);
    });

    it('validates password strength', async () => {
      await expect(
        authService.register('test@example.com', 'weak', 'Test User')
      ).rejects.toThrow(/password/i);
    });
  });
});
```

### API Integration Test

```typescript
// apps/api/tests/integration/api/galleries.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@/index';
import {
  setupTestDb,
  cleanupTestDb,
  teardownTestDb,
  createTestWorkspace,
  createTestUser
} from '../../helpers/testDb';
import { generateTestToken } from '../../helpers/auth';

describe('GET /api/v1/galleries', () => {
  let authToken: string;
  let testWorkspace: any;
  let testUser: any;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();

    testWorkspace = await createTestWorkspace();
    testUser = await createTestUser(testWorkspace.id);
    authToken = generateTestToken(testUser);

    // Create test galleries
    await pool.query(
      `INSERT INTO galleries (id, workspace_id, name, created_at)
       VALUES
         (gen_random_uuid(), $1, 'Wedding 2024', NOW()),
         (gen_random_uuid(), $1, 'Portrait Session', NOW())`,
      [testWorkspace.id]
    );
  });

  it('returns galleries for authenticated user', async () => {
    const response = await request(app)
      .get('/api/v1/galleries')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it('returns 401 without auth token', async () => {
    const response = await request(app).get('/api/v1/galleries');
    expect(response.status).toBe(401);
  });

  it('only returns galleries for current workspace', async () => {
    // Create another workspace with galleries
    const otherWorkspace = await createTestWorkspace({ name: 'Other Studio' });
    await pool.query(
      `INSERT INTO galleries (id, workspace_id, name)
       VALUES (gen_random_uuid(), $1, 'Other Gallery')`,
      [otherWorkspace.id]
    );

    const response = await request(app)
      .get('/api/v1/galleries')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.data.every((g: any) => g.workspace_id === testWorkspace.id)
    ).toBe(true);
  });
});
```

## AI Service Testing (apps/ai-service)

### pytest Configuration

```python
# apps/ai-service/tests/conftest.py
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from PIL import Image
import io

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_llm_response():
    """Mock LLM API response."""
    response = MagicMock()
    response.text = '''
    {
        "caption": "A beautiful sunset over the ocean",
        "tags": ["sunset", "ocean", "landscape", "golden hour"],
        "scores": {
            "aesthetic": 0.85,
            "technical": 0.78,
            "overall": 0.82
        }
    }
    '''
    return response


@pytest.fixture
def test_image():
    """Create a test image."""
    img = Image.new('RGB', (100, 100), color='red')
    return img


@pytest.fixture
def test_image_bytes(test_image):
    """Convert test image to bytes."""
    buffer = io.BytesIO()
    test_image.save(buffer, format='JPEG')
    buffer.seek(0)
    return buffer.read()
```

### Unit Test

```python
# apps/ai-service/tests/unit/test_llm_client.py
import pytest
from unittest.mock import AsyncMock, patch
from src.services.llm_client import LLMService


class TestLLMService:
    @pytest.fixture
    def service(self):
        return LLMService()

    @pytest.mark.asyncio
    async def test_analyze_photo_returns_caption(
        self, service, test_image, mock_llm_response
    ):
        """Test that photo analysis returns expected fields."""
        with patch.object(service, '_client') as mock_client:
            mock_client.generate_async = AsyncMock(
                return_value=mock_llm_response
            )
            service._initialized = True

            result = await service.analyze_photo(
                image=test_image,
                asset_id="test-123",
                include_caption=True,
            )

            assert "caption" in result
            assert "A beautiful sunset" in result["caption"]

    @pytest.mark.asyncio
    async def test_analyze_photo_returns_tags(
        self, service, test_image, mock_llm_response
    ):
        """Test that photo analysis returns tags."""
        with patch.object(service, '_client') as mock_client:
            mock_client.generate_async = AsyncMock(
                return_value=mock_llm_response
            )
            service._initialized = True

            result = await service.analyze_photo(
                image=test_image,
                asset_id="test-123",
                include_tags=True,
            )

            assert "tags" in result
            assert isinstance(result["tags"], list)
            assert len(result["tags"]) > 0
```

### MCP Tool Integration Test

```python
# apps/ai-service/tests/integration/test_mcp_tools.py
import pytest
from src.mcp.server import detect_faces, semantic_search, score_photo_quality


class TestMCPTools:
    @pytest.mark.asyncio
    async def test_detect_faces_returns_face_data(self, mock_face_service):
        """Test that detect_faces MCP tool returns expected structure."""
        result = await detect_faces(
            photo_id="test-photo-123",
            workspace_id="workspace-123",
            image_url="https://example.com/photo.jpg",
            detect_attributes=True,
        )

        assert "photo_id" in result
        assert "face_count" in result
        assert "faces" in result
        assert isinstance(result["faces"], list)

    @pytest.mark.asyncio
    async def test_semantic_search_requires_workspace_id(self):
        """Test that workspace_id is required for search."""
        result = await semantic_search(
            query="sunset at beach",
            workspace_id="workspace-123",
        )

        assert "results" in result
        assert "query" in result
```

## Test Coverage Targets

| Area | Target | Critical |
|------|--------|----------|
| Overall | 80% | 70% |
| Auth/Security | 95% | 90% |
| Payment/Billing | 95% | 90% |
| API Services | 85% | 75% |
| UI Components | 70% | 60% |
| Shared Packages | 90% | 85% |
| AI Services | 80% | 70% |

## Running Tests

### Full Monorepo

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run affected tests only (CI optimization)
pnpm test --filter=[HEAD^1]
```

### Individual Apps/Packages

```bash
# Web app
pnpm --filter=web test
pnpm --filter=web test:watch
pnpm --filter=web test:coverage

# Admin app
pnpm --filter=admin test

# API
pnpm --filter=api test
pnpm --filter=api test:integration

# Shared packages
pnpm --filter=@rawdrive/ui test
pnpm --filter=@rawdrive/utils test

# AI Service
cd apps/ai-service && pytest
cd apps/ai-service && pytest --cov=src --cov-report=html
cd apps/ai-service && pytest tests/unit/test_llm_client.py -v
```

## Best Practices

### Do's

- Write tests before or alongside code (TDD/BDD)
- Test behavior, not implementation
- Use meaningful test names that describe the scenario
- Mock external dependencies (API, database, etc.)
- Test edge cases and error conditions
- Keep tests fast (< 100ms for unit tests)
- Use factories for test data creation
- Clean up test data after each test
- Test shared packages independently
- Run affected tests in CI for faster feedback

### Don'ts

- Don't test implementation details
- Don't share state between tests
- Don't test third-party library internals
- Don't write flaky tests (random failures)
- Don't skip writing tests for "simple" code
- Don't commit failing tests
- Don't mock everything (integration tests need real dependencies)
- Don't duplicate test utilities - use shared helpers
