---
name: testing-patterns
description: "Testing patterns for RawDrive: Vitest for frontend, pytest for backend, integration tests, and E2E patterns. Use this skill when writing tests, setting up test fixtures, mocking services, testing API endpoints, testing React components/hooks, or improving test coverage. Also use when asking about testing strategy, test structure, or CI/CD test configuration. Triggers on: test, testing, vitest, pytest, unit test, integration test, mock, fixture, test coverage, E2E, spec file."
---

# Testing Patterns

RawDrive targets 80%+ unit test coverage. Frontend uses Vitest; backend uses pytest with async support.

## Frontend Testing (Vitest)

### Component Test
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GalleryCard } from './GalleryCard';

describe('GalleryCard', () => {
  it('renders gallery name', () => {
    const gallery = { id: '1', name: 'Wedding 2025', assetCount: 42 };
    render(<GalleryCard gallery={gallery} onSelect={vi.fn()} />);
    expect(screen.getByText('Wedding 2025')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn();
    const gallery = { id: '1', name: 'Test', assetCount: 0 };
    render(<GalleryCard gallery={gallery} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });
});
```

### Hook Test (with React Query)
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGalleries } from './useGalleries';

const wrapper = ({ children }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

it('fetches galleries', async () => {
  const { result } = renderHook(() => useGalleries('ws_123'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(3);
});
```

### Commands
```bash
cd frontend && pnpm test                        # Run all
cd frontend && pnpm test src/path/file.test.ts  # Single file
cd frontend && pnpm test --watch                # Watch mode
cd frontend && pnpm test --coverage             # Coverage report
```

## Backend Testing (pytest)

### Service Test
```python
import pytest
from unittest.mock import AsyncMock
from app.services.gallery_service import GalleryService

@pytest.mark.asyncio
async def test_create_gallery():
    mock_db = AsyncMock()
    service = GalleryService(db=mock_db)

    result = await service.create_gallery(
        data=GalleryCreate(name="Wedding 2025"),
        workspace_id=uuid4(),
        user_id=uuid4(),
    )

    assert result.name == "Wedding 2025"
    mock_db.add.assert_called_once()
    mock_db.commit.assert_awaited_once()
```

### API Endpoint Test
```python
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_list_galleries(authenticated_client: AsyncClient):
    response = await authenticated_client.get("/api/v1/galleries")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "pagination" in data
```

### Fixtures
```python
@pytest.fixture
async def db_session():
    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()

@pytest.fixture
async def authenticated_client(db_session):
    # Create test user with JWT token
    ...
```

### Commands
```bash
docker exec rawdrive-backend pytest                          # All tests
docker exec rawdrive-backend pytest tests/path/test_file.py  # Single file
docker exec rawdrive-backend pytest -k "test_create"         # By name
docker exec rawdrive-backend pytest --cov=src                # Coverage
```

## Key Rules

1. **Never call real external services in tests** — mock AI providers, payment APIs, email services
2. **Test workspace isolation** — verify queries include workspace_id
3. **Use transaction rollback** for DB test isolation
4. **Test error paths** — not just happy paths (404, 403, validation errors)
5. **AI tests use golden fixtures** — known images with expected outputs
6. **Name test files** to match source: `gallery_service.py` → `test_gallery_service.py`

**Deep dive:** Read `.claude/reference/testing-and-logging.md`
