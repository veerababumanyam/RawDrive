---
name: testing
aliases: [tests, vitest, pytest, coverage, fixtures, unit-tests, integration-tests]
description: Testing standards for RawDrive. Use when writing tests, setting up test fixtures, or reviewing test coverage.
---

# Testing Standards

## Test Stack

| Area | Framework | Location |
|------|-----------|----------|
| Frontend | Vitest + React Testing Library | `frontend/src/test/` |
| Backend | pytest + pytest-asyncio | `backend/tests/` |
| AI Service | pytest | `ai-service/tests/` |

## Commands

```bash
# Frontend
cd frontend && npm test              # Run tests
cd frontend && npm run test:coverage # With coverage
cd frontend && npm run test:watch    # Watch mode

# Backend
cd backend && pytest                 # Run tests
cd backend && pytest --cov=src       # With coverage
cd backend && pytest tests/unit/     # Unit tests only
cd backend && pytest -v -k "test_gallery"  # Filter tests

# AI Service
cd ai-service && pytest
```

## Directory Structure

```
frontend/
├── src/test/
│   ├── components/          # Component tests
│   ├── hooks/               # Hook tests
│   ├── services/            # Service tests
│   └── fixtures/            # Test data

backend/
├── tests/
│   ├── unit/                # Unit tests
│   │   ├── services/
│   │   └── repositories/
│   ├── integration/         # Integration tests
│   │   └── api/
│   └── conftest.py          # pytest fixtures
```

## Frontend Tests (Vitest)

### Component Test

```typescript
// frontend/src/test/components/GalleryGrid.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GalleryGrid } from '@/components/features/gallery/GalleryGrid';

describe('GalleryGrid', () => {
  const mockGalleries = [
    { id: '1', name: 'Wedding 2024', cover_url: '/img1.jpg' },
  ];

  it('renders galleries', () => {
    render(<GalleryGrid galleries={mockGalleries} onSelect={vi.fn()} />);
    expect(screen.getByText('Wedding 2024')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn();
    render(<GalleryGrid galleries={mockGalleries} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('article'));
    expect(onSelect).toHaveBeenCalledWith(mockGalleries[0]);
  });

  it('shows empty state when no galleries', () => {
    render(<GalleryGrid galleries={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no galleries/i)).toBeInTheDocument();
  });
});
```

### Hook Test

```typescript
// frontend/src/test/hooks/useToast.test.ts
import { renderHook, act } from '@testing-library/react';
import { useToast } from '@/hooks/useToast';

describe('useToast', () => {
  it('shows toast with message', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Success!', 'success');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Success!');
  });
});
```

## Backend Tests (pytest)

### Unit Test

```python
# backend/tests/unit/services/test_gallery_service.py
import pytest
from uuid import uuid4
from unittest.mock import AsyncMock
from app.services.gallery_service import GalleryService

@pytest.fixture
def mock_repo():
    return AsyncMock()

@pytest.fixture
def gallery_service(mock_repo):
    return GalleryService(repo=mock_repo)

@pytest.mark.asyncio
async def test_get_by_id_returns_gallery(gallery_service, mock_repo):
    workspace_id = uuid4()
    gallery_id = uuid4()
    mock_repo.get_by_id.return_value = {"id": gallery_id, "name": "Test"}

    result = await gallery_service.get_by_id(workspace_id, gallery_id)

    assert result["id"] == gallery_id
    mock_repo.get_by_id.assert_called_once_with(workspace_id, gallery_id)

@pytest.mark.asyncio
async def test_get_by_id_returns_none_for_missing(gallery_service, mock_repo):
    mock_repo.get_by_id.return_value = None

    result = await gallery_service.get_by_id(uuid4(), uuid4())

    assert result is None
```

### Integration Test

```python
# backend/tests/integration/api/test_galleries.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

@pytest.fixture
def auth_headers(test_user_token):
    return {"Authorization": f"Bearer {test_user_token}"}

@pytest.mark.asyncio
async def test_list_galleries_returns_200(client, auth_headers, test_workspace):
    response = await client.get(
        f"/api/v1/workspaces/{test_workspace.id}/galleries",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert "items" in response.json()

@pytest.mark.asyncio
async def test_list_galleries_requires_auth(client):
    response = await client.get("/api/v1/workspaces/123/galleries")
    assert response.status_code == 401
```

### Test Fixtures (conftest.py)

```python
# backend/tests/conftest.py
import pytest
import asyncio
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
async def db_session():
    """Create isolated test database session."""
    async with test_engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(bind=conn)
        yield session
        await conn.rollback()

@pytest.fixture
def test_workspace():
    return {
        "id": uuid4(),
        "name": "Test Studio",
        "plan_slug": "professional",
    }

@pytest.fixture
def test_user(test_workspace):
    return {
        "id": uuid4(),
        "workspace_id": test_workspace["id"],
        "email": "test@example.com",
    }
```

## Coverage Targets

| Area | Target |
|------|--------|
| Auth/Security | 95% |
| Payment/Billing | 95% |
| API Services | 85% |
| UI Components | 70% |
| Overall | 80% |

## Best Practices

### Do's
- Test behavior, not implementation
- Use meaningful test names
- Mock external dependencies
- Test edge cases and errors
- Keep unit tests fast (<100ms)
- Clean up test data

### Don'ts
- Don't test implementation details
- Don't share state between tests
- Don't write flaky tests
- Don't skip tests for "simple" code
- Don't commit failing tests
