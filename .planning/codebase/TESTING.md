# RawDrive Testing Guide

This document outlines the testing framework, structure, and practices used throughout the RawDrive codebase.

---

## 📋 Table of Contents

- [Frontend Testing](#frontend-testing)
- [Backend Testing](#backend-testing)
- [Test Location Patterns](#test-location-patterns)
- [Coverage Requirements](#coverage-requirements)
- [How to Run Tests](#how-to-run-tests)
- [Testing Best Practices](#testing-best-practices)
- [E2E Testing](#e2e-testing)
- [Mocking Strategies](#mocking-strategies)

---

## 🎨 Frontend Testing

### Framework Stack

- **Vitest**: Fast unit testing framework with Vite integration
- **Testing Library**: React component testing utilities
- **Playwright**: End-to-end testing framework
- **Jest DOM**: DOM-specific assertions

### Test Structure

```
frontend/src/
├── components/
│   ├── features/
│   │   ├── gallery/
│   │   │   ├── __tests__/           # Unit tests
│   │   │   │   ├── GalleryCard.test.tsx
│   │   │   │   ├── GalleryGrid.test.tsx
│   │   │   │   └── integration.test.tsx
│   │   │   └── GalleryCard.tsx
│   │   └── upload/
│   │       └── UploadDropzone.tsx
│   └── ui/
│       └── AppButton.tsx
│           └── __tests__/
│               └── AppButton.test.tsx
├── hooks/
│   └── useGalleryAssets.ts
│       └── __tests__/
│           └── useGalleryAssets.test.ts
├── services/
│   └── galleryService.ts
│       └── __tests__/
│           └── galleryService.test.ts
└── pages/
    └── Galleries.tsx
        └── __tests__/
│           └── Galleries.test.tsx
```

### Unit Test Example

```typescript
// components/features/gallery/__tests__/GalleryCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GalleryCard } from '../GalleryCard';
import { galleryService } from '../../../../services/galleryService';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../../../../services/galleryService', () => ({
    galleryService: {
        getSignedUrl: vi.fn(),
    },
}));

vi.mock('../../../../contexts/AuthContext', () => ({
    useAuth: () => ({
        workspace: { workspace_id: 'ws-123' },
    }),
}));

describe('GalleryCard', () => {
    const mockGallery = {
        gallery_id: 'gal-1',
        title: 'Test Gallery',
        status: 'published' as const,
        photo_count: 10,
        created_at: new Date().toISOString(),
        cover_asset_id: 'asset-123',
    };

    const mockOnClick = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (galleryService.getSignedUrl as any).mockResolvedValue('https://example.com/default.jpg');
    });

    it('renders gallery title and info', () => {
        render(
            <BrowserRouter>
                <GalleryCard gallery={mockGallery} onClick={mockOnClick} />
            </BrowserRouter>
        );

        expect(screen.getByText('Test Gallery')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument(); // Photo count
    });

    it('fetches and displays cover image from signed URL', async () => {
        const signedUrl = 'https://example.com/signed-url.jpg';
        (galleryService.getSignedUrl as any).mockResolvedValue(signedUrl);

        render(
            <BrowserRouter>
                <GalleryCard gallery={mockGallery} onClick={mockOnClick} />
            </BrowserRouter>
        );

        await waitFor(() => {
            const img = screen.getByAltText('Test Gallery cover');
            expect(img).toHaveAttribute('src', signedUrl);
        });
    });
});
```

### Hook Testing Example

```typescript
// hooks/__tests__/useGalleryAssets.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGalleryAssets } from '../useGalleryAssets';

const mockQueryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false },
    },
});

describe('useGalleryAssets', () => {
    it('fetches gallery assets successfully', async () => {
        const mockAssets = [
            { id: '1', name: 'asset1.jpg', url: 'https://example.com/1.jpg' },
            { id: '2', name: 'asset2.jpg', url: 'https://example.com/2.jpg' },
        ];

        vi.mock('../../services/galleryService', () => ({
            galleryService: {
                getGalleryAssets: vi.fn().mockResolvedValue(mockAssets),
            },
        }));

        const { result } = renderHook(
            () => useGalleryAssets('gal-123'),
            {
                wrapper: ({ children }) => (
                    <QueryClientProvider client={mockQueryClient}>
                        {children}
                    </QueryClientProvider>
                ),
            }
        );

        await waitFor(() => {
            expect(result.current.data).toEqual(mockAssets);
        });
    });
});
```

### Component Testing Best Practices

1. **Test behavior, not implementation**
2. **Use Testing Library queries** (getBy, findBy, queryBy)
3. **Mock external dependencies** (API calls, services)
4. **Test async operations** with async/await
5. **Include accessibility tests**

---

## 🔧 Backend Testing

### Framework Stack

- **pytest**: Python testing framework
- **httpx**: Async HTTP client for API testing
- **pytest-asyncio**: Async test support
- **pytest-mock**: Mocking utilities
- **pytest-cov**: Coverage reporting

### Test Structure

```
backend/tests/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── test_auth.py
│   │       ├── test_faces.py
│   │       └── test_galleries.py
│   ├── services/
│   │   ├── test_face_detection_service.py
│   │   └── test_gallery_service.py
│   └── repositories/
│       ├── test_face_repository.py
│       └── test_gallery_repository.py
├── integration/
│   ├── test_a2a_communication.py
│   └── test_database_transactions.py
└── e2e/
    ├── test_gallery_workflow.py
    ├── test_login_flow.py
    └── test_upload_flow.py
```

### Unit Test Example

```python
# tests/app/services/test_face_detection_service.py
import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, patch

from app.services.face_detection_service import FaceDetectionService
from app.services.face_exceptions import FaceDetectionError

@pytest.fixture
def face_service():
    return FaceDetectionService()

@pytest.mark.asyncio
async def test_detect_faces_success(face_service):
    """Test successful face detection."""
    # Mock response from AI provider
    mock_response = {
        "faces": [
            {
                "id": "face1",
                "bounding_box": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.3},
                "confidence": 0.95,
                "embedding": [0.1, 0.2, ...],  # 512 dimensions
            }
        ]
    }

    with patch('app.services.face_detection_service.AIProvider.detect_faces') as mock_detect:
        mock_detect.return_value = mock_response

        result = await face_service.detect_faces(
            workspace_id=uuid4(),
            image_data=b"fake_image_data"
        )

        assert len(result) == 1
        assert result[0]["confidence"] == 0.95
        mock_detect.assert_called_once()

@pytest.mark.asyncio
async def test_detect_faces_error(face_service):
    """Test error handling in face detection."""
    with patch('app.services.face_detection_service.AIProvider.detect_faces') as mock_detect:
        mock_detect.side_effect = Exception("AI service unavailable")

        with pytest.raises(FaceDetectionError):
            await face_service.detect_faces(
                workspace_id=uuid4(),
                image_data=b"fake_image_data"
            )
```

### Integration Test Example

```python
# tests/app/api/v1/test_faces.py
import pytest
from httpx import AsyncClient
from uuid import uuid4

@pytest.mark.asyncio
async def test_create_face_endpoint(async_client: AsyncClient, mock_current_user_headers):
    """Test creating a face via API endpoint."""
    workspace_id = uuid4()
    image_id = uuid4()

    # Create test image first
    image_data = {
        "filename": "test.jpg",
        "content_type": "image/jpeg",
        "size": 1024,
        "width": 1920,
        "height": 1080,
    }

    # Create image
    image_response = await async_client.post(
        f"/api/v1/workspaces/{workspace_id}/assets",
        json=image_data,
        headers=mock_current_user_headers
    )

    if image_response.status_code != 201:
        pytest.skip("Image creation failed, skipping test")

    image_id = image_response.json()["asset_id"]

    # Create face
    face_data = {
        "asset_id": str(image_id),
        "bounding_box": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.3},
        "confidence": 0.95,
    }

    response = await async_client.post(
        f"/api/v1/workspaces/{workspace_id}/faces",
        json=face_data,
        headers=mock_current_user_headers
    )

    assert response.status_code == 201
    data = response.json()
    assert data["confidence"] == 0.95
    assert data["asset_id"] == str(image_id)
```

### E2E Test Example

```python
# tests/e2e/test_gallery_workflow.py
import pytest
from playwright.async_api import async_playwright

@pytest.mark.asyncio
async def test_gallery_creation_workflow():
    """Test complete gallery creation workflow."""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Login
        await page.goto("/login")
        await page.fill("input[name='email']", "test@example.com")
        await page.fill("input[name='password']", "password123")
        await page.click("button[type='submit']")

        # Navigate to galleries
        await page.click("text=Galleries")
        await page.click("text=Create New Gallery")

        # Fill form
        await page.fill("input[name='title']", "Test Gallery")
        await page.fill("textarea[name='description']", "Test description")
        await page.click("button[type='submit']")

        # Verify gallery created
        await page.wait_for_selector("text=Gallery created successfully")
        assert await page.is_visible("text=Test Gallery")

        await browser.close()
```

---

## 📍 Test Location Patterns

### Frontend Tests

- **Component Tests**: `__tests__` directory next to component
  ```typescript
  components/
    features/
      gallery/
        GalleryCard.tsx
        __tests__/
          GalleryCard.test.tsx
  ```

- **Hook Tests**: `__tests__` directory next to hook
  ```typescript
  hooks/
    useGalleryAssets.ts
    __tests__/
      useGalleryAssets.test.ts
  ```

- **Service Tests**: `__tests__` directory next to service
  ```typescript
  services/
    galleryService.ts
    __tests__/
      galleryService.test.ts
  ```

- **Integration Tests**: `src/test/` directory
  ```typescript
  src/
    test/
      integration.test.tsx
      e2e/
        SettingsNavigation.e2e.test.ts
  ```

### Backend Tests

- **Unit Tests**: Next to source file
  ```python
  app/
    api/
      v1/
        faces.py
        test_faces.py  # Unit tests for faces API
  ```

- **Integration Tests**: `tests/integration/`
  ```python
  tests/
    integration/
      test_database_transactions.py
      test_a2a_communication.py
  ```

- **E2E Tests**: `tests/e2e/`
  ```python
  tests/
    e2e/
      test_gallery_workflow.py
      test_login_flow.py
  ```

---

## 📊 Coverage Requirements

### Minimum Coverage Targets

| Component Type | Unit Test Coverage | Integration Test Coverage |
|----------------|-------------------|--------------------------|
| Frontend Components | 80%+ | 60%+ |
| Backend Services | 85%+ | 70%+ |
| API Endpoints | 90%+ | 80%+ |
| Repository Layer | 95%+ | - |
| Total Project | 80%+ | 60%+ |

### Coverage Reporting

#### Frontend

```bash
# Run tests with coverage
pnpm test:coverage

# Generate coverage report
pnpm test:coverage -- --coverage-reporter=text --coverage-reporter=html
```

#### Backend

```bash
# Run tests with coverage
docker exec rawdrive-backend pytest --cov=app --cov-report=html --cov-report=term

# Run specific test with coverage
docker exec rawdrive-backend pytest tests/app/services/face_service.py::test_detect_faces --cov=app.services.face_detection_service
```

### Coverage Exclusions

The following should be excluded from coverage reporting:

- `__tests__` directories
- `test_*.py` files
- `node_modules/`
- `venv/` and virtual environments
- `__init__.py` files with no content
- Abstract classes and methods
- Generated code

---

## 🚀 How to Run Tests

### Frontend Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/components/features/gallery/__tests__/GalleryCard.test.tsx

# Run tests matching pattern
pnpm test -t "GalleryCard"

# Run tests with UI
pnpm test --ui
```

### Backend Tests

```bash
# Run all tests (in Docker)
docker exec rawdrive-backend pytest

# Run with verbose output
docker exec rawdrive-backend pytest -v

# Run with coverage
docker exec rawdrive-backend pytest --cov=app --cov-report=term-missing

# Run specific test file
docker exec rawdrive-backend pytest tests/app/api/v1/test_faces.py

# Run specific test
docker exec rawdrive-backend pytest tests/app/api/v1/test_faces.py::test_create_face

# Run tests matching pattern
docker exec rawdrive-backend pytest -k "face"

# Run tests in parallel
docker exec rawdrive-backend pytest -n auto

# Run with markers
docker exec rawdrive-backend pytest -m "asyncio"
```

### E2E Tests

```bash
# Run Playwright tests (frontend)
pnpm test:e2e

# Run E2E tests with UI
pnpm test:e2e --ui

# Run specific test file
pnpm test:e2e tests/e2e/settings.spec.ts

# Run tests matching pattern
pnpm test:e2e --grep "login"

# Run tests in headed mode (visible browser)
pnpm test:e2e --headed

# Run tests with specific browser
pnpm test:e2e --browser=chromium
```

### Health Check Tests

```bash
# Backend health check
curl http://localhost:8000/health/live

# Gallery service health check
curl http://localhost:8004/health/live

# Run smoke tests
docker exec rawdrive-backend pytest tests/smoke/
```

---

## 🧪 Testing Best Practices

### General Principles

1. **Test early and often** - Write tests before implementation (TDD)
2. **Test the happy path and error cases** - Don't forget edge cases
3. **Keep tests simple and focused** - One assertion per test
4. **Use meaningful test names** - Describe what's being tested
5. **Mock external dependencies** - Avoid real API calls in unit tests
6. **Test user behavior, not implementation** - Use Testing Library for components

### Frontend Testing Tips

1. **Prefer Testing Library over enzyme** - Simulates user behavior
2. **Use async/await for async operations** - Don't forget to `await`
3. **Test accessibility** - Use `toHaveAttribute` for ARIA labels
4. **Mock API calls** - Use `vi.mock` for services
5. **Use testing-library/jest-dom** for DOM assertions

### Backend Testing Tips

1. **Use pytest fixtures** - For reusable test setup
2. **Mock database calls** - Use `AsyncMock` for async operations
3. **Test HTTP status codes** - Verify both success and error responses
4. **Use parametrized tests** - For multiple test cases
5. **Test middleware** - Verify authentication and authorization

### Testing Anti-Patterns

- ❌ Don't test implementation details
- ❌ Don't write integration tests for unit tests
- ❌ Don't skip tests even if they "work"
- ❌ Don't use real external services in unit tests
- ❌ Don't leave tests flaky (async/await properly)

---

## 🌐 E2E Testing

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
});
```

### Common E2E Test Patterns

```typescript
// Authentication Flow
test('user can login successfully', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('text="Welcome back"')).toBeVisible();
});

// Form Submission
test('can create a new gallery', async ({ page }) => {
  await page.goto('/galleries');
  await page.click('text="Create Gallery"');

  await page.fill('input[name="title"]', 'Test Gallery');
  await page.fill('textarea[name="description"]', 'Description');
  await page.click('button[type="submit"]');

  await expect(page.locator('text="Gallery created"')).toBeVisible();
  await expect(page.locator('text="Test Gallery"')).toBeVisible();
});

// Error Handling
test('shows error for invalid login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'invalid@example.com');
  await page.fill('input[name="password"]', 'wrong');
  await page.click('button[type="submit"]');

  await expect(page.locator('text="Invalid credentials"')).toBeVisible();
});
```

---

## 🎭 Mocking Strategies

### Frontend Mocking

#### Service Mocking

```typescript
// services/__tests__/galleryService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { galleryService } from '../galleryService';

// Mock API responses
vi.mock('../galleryService', () => ({
  galleryService: {
    getGalleries: vi.fn(),
    createGallery: vi.fn(),
  },
}));

describe('GalleryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch galleries', async () => {
    const mockGalleries = [
      { id: '1', title: 'Gallery 1' },
      { id: '2', title: 'Gallery 2' },
    ];

    (galleryService.getGalleries as any).mockResolvedValue(mockGalleries);

    const result = await galleryService.getGalleries('workspace-123');
    expect(result).toEqual(mockGalleries);
  });
});
```

#### Context Mocking

```typescript
// contexts/__tests__/AuthContext.test.tsx
import { renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

vi.mock('../AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useAuth: () => ({
    user: { id: 'user-123', email: 'test@example.com' },
    workspace: { id: 'ws-123', name: 'Test Workspace' },
  }),
}));

test('provides auth context', () => {
  const { result } = renderHook(() => useAuth());

  expect(result.current.user).toEqual({
    id: 'user-123',
    email: 'test@example.com',
  });
});
```

### Backend Mocking

#### Database Mocking

```python
# tests/app/services/test_gallery_service.py
import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.services.gallery_service import GalleryService
from app.models.gallery import Gallery

@pytest.fixture
def mock_db():
    with patch('app.db.postgres.get_postgres_pool') as mock_pool:
        mock_conn = AsyncMock()
        mock_pool.return_value.acquire.return_value.__aenter__.return_value = mock_conn
        yield mock_conn

@pytest.fixture
def gallery_service():
    return GalleryService()

@pytest.mark.asyncio
async def test_create_gallery(mock_db, gallery_service):
    # Mock database response
    mock_db.fetchrow.return_value = {
        'gallery_id': uuid4(),
        'title': 'Test Gallery',
        'workspace_id': uuid4(),
        'created_at': '2023-01-01',
    }

    # Mock database execute
    mock_db.execute = AsyncMock()

    gallery = await gallery_service.create_gallery(
        workspace_id=uuid4(),
        title='Test Gallery',
        description='Description'
    )

    assert gallery['title'] == 'Test Gallery'
    mock_db.execute.assert_called_once()
```

#### API Response Mocking

```python
# tests/app/api/v1/test_galleries.py
import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_get_galleries(async_client: AsyncClient):
    # Mock database response
    with patch('app.repositories.gallery_repository.GalleryRepository.get_all') as mock_get:
        mock_get.return_value = [
            {
                'gallery_id': uuid4(),
                'title': 'Gallery 1',
                'workspace_id': uuid4(),
            },
            {
                'gallery_id': uuid4(),
                'title': 'Gallery 2',
                'workspace_id': uuid4(),
            }
        ]

        response = await async_client.get("/api/v1/galleries")

        assert response.status_code == 200
        assert len(response.json()) == 2
```

### Common Mock Utilities

```typescript
// __tests__/mockUtils.ts
export const createMockWorkspace = () => ({
  workspace_id: 'ws-123',
  name: 'Test Workspace',
  plan: 'premium',
});

export const createMockUser = () => ({
  id: 'user-123',
  email: 'test@example.com',
  workspace_id: 'ws-123',
});

export const createMockGallery = (overrides = {}) => ({
  gallery_id: 'gal-123',
  title: 'Test Gallery',
  description: 'Description',
  workspace_id: 'ws-123',
  created_at: new Date().toISOString(),
  status: 'published',
  photo_count: 10,
  ...overrides,
});
```

---

## 📝 Testing Checklist

Before submitting tests, ensure:

- [ ] Test name clearly describes what's being tested
- [ ] Test covers both success and error cases
- [ ] All external dependencies are mocked
- [ ] Async operations are properly awaited
- [ ] Assertions are specific and meaningful
- [ ] Test is isolated (no side effects)
- [ ] Test follows the project's naming conventions
- [ ] Coverage requirements are met
- [ ] E2E tests are stable and reliable

---

**Last Updated**: 2026-02-08
**Maintained by**: RawDrive Development Team