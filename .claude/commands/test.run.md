---
description: Run tests for RawDrive services (frontend, backend, microservices)
---

# Run Tests

Execute test suites for RawDrive components.

## References

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product requirements and architecture overview
- **Best Practices**:
  - [Testing and Logging](../reference/testing-and-logging.md)
  - [Coding Standards](../reference/coding-standards.md)
  - [React Frontend Best Practices](../reference/react-frontend-best-practices.md)
  - [FastAPI Best Practices](../reference/fastapi-best-practices.md)

## Quick Test Commands

### Frontend Tests
```bash
cd frontend && pnpm test
```

### Backend Tests
```bash
docker exec rawdrive-backend pytest
```

### All Tests
```bash
# Frontend
cd frontend && pnpm test

# Backend
docker exec rawdrive-backend pytest

# Specific microservice
docker exec rawdrive-gallery-service pytest
```

## Detailed Testing

### 1. Frontend Testing

#### Unit Tests (Vitest)
```bash
cd frontend

# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/components/Gallery/GalleryCard.test.tsx

# Watch mode
pnpm test:watch

# UI mode
pnpm test:ui
```

#### E2E Tests (Playwright)
```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests
pnpm test:e2e

# Run in headed mode
pnpm test:e2e --headed

# Run specific test
npx playwright test tests/gallery.spec.ts

# Debug mode
npx playwright test --debug

# Generate test report
npx playwright show-report
```

#### Type Checking
```bash
cd frontend

# Check TypeScript types
pnpm type-check

# Or use tsc directly
npx tsc --noEmit
```

#### Linting
```bash
cd frontend

# Run ESLint
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix
```

### 2. Backend Testing

#### Unit Tests
```bash
# Run all backend tests
docker exec rawdrive-backend pytest

# Run with coverage
docker exec rawdrive-backend pytest --cov=src --cov-report=html

# Run specific test file
docker exec rawdrive-backend pytest tests/test_auth.py

# Run specific test
docker exec rawdrive-backend pytest tests/test_auth.py::test_login_success

# Verbose output
docker exec rawdrive-backend pytest -v

# Stop on first failure
docker exec rawdrive-backend pytest -x

# Run only failed tests from last run
docker exec rawdrive-backend pytest --lf
```

#### Integration Tests
```bash
# Run integration tests
docker exec rawdrive-backend pytest tests/integration/

# Test database operations
docker exec rawdrive-backend pytest tests/integration/test_database.py

# Test API endpoints
docker exec rawdrive-backend pytest tests/integration/test_api.py
```

#### Type Checking (mypy)
```bash
docker exec rawdrive-backend mypy src
```

#### Linting (ruff)
```bash
# Check code
docker exec rawdrive-backend ruff check src

# Fix auto-fixable issues
docker exec rawdrive-backend ruff check src --fix

# Format code
docker exec rawdrive-backend ruff format src
```

### 3. Microservice Testing

#### Gallery Service
```bash
# Run tests
docker exec rawdrive-gallery-service pytest

# With coverage
docker exec rawdrive-gallery-service pytest --cov=src --cov-report=term-missing

# Integration tests
docker exec rawdrive-gallery-service pytest tests/integration/
```

#### Billing Service
```bash
docker exec rawdrive-billing-service pytest
docker exec rawdrive-billing-service pytest --cov=src
```

#### Upload Service
```bash
docker exec rawdrive-upload-service pytest
docker exec rawdrive-upload-service pytest tests/test_chunked_upload.py
```

#### AI Service
```bash
docker exec rawdrive-ai-service pytest
docker exec rawdrive-ai-service pytest tests/test_face_detection.py
```

### 4. Shared Packages Testing

```bash
# Test all shared packages
pnpm test:packages

# Test specific package
cd packages/shared-types && pnpm test
cd packages/shared-validation && pnpm test

# Cross-platform parity tests
pnpm test:parity
```

### 5. Load Testing

#### Upload Service Load Test
```bash
# Using k6
k6 run services/upload-service/tests/load/upload_test.js

# With custom VUs and duration
k6 run --vus 100 --duration 30s services/upload-service/tests/load/upload_test.js
```

#### Gallery Service Load Test
```bash
k6 run services/gallery-service/tests/load/gallery_load_test.js
```

### 6. API Testing (Manual)

#### Using curl
```bash
# Test login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"free@test.rawdrive.in","password":"Test@123"}'

# Test gallery list (with auth token)
curl -X GET http://localhost:8004/api/v1/galleries \
  -H "Authorization: Bearer <token>"
```

#### Using httpie
```bash
# Install httpie
pip install httpie

# Test endpoints
http POST localhost:8000/api/v1/auth/login email=free@test.rawdrive.in password=Test@123
http GET localhost:8004/api/v1/galleries Authorization:"Bearer <token>"
```

## Test Coverage Reports

### Frontend Coverage
```bash
cd frontend
pnpm test:coverage

# Open HTML report
open coverage/index.html  # macOS
start coverage/index.html  # Windows
```

### Backend Coverage
```bash
docker exec rawdrive-backend pytest --cov=src --cov-report=html

# Copy report to local
docker cp rawdrive-backend:/app/htmlcov ./backend-coverage

# Open report
start backend-coverage/index.html  # Windows
```

## Continuous Integration

### GitHub Actions Workflow

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Manual workflow dispatch

Check `.github/workflows/test.yml` for CI configuration.

## Test Data

### Seed Test Users
```bash
docker exec -e DATABASE_URL="postgresql://rawdrive:rawdrive@postgres:5432/rawdrive" \
  rawdrive-backend python seed_all_test_users.py
```

### Reset Test Database
```bash
# Drop and recreate database
docker exec rawdrive-postgres psql -U rawdrive -c "DROP DATABASE IF EXISTS rawdrive_test;"
docker exec rawdrive-postgres psql -U rawdrive -c "CREATE DATABASE rawdrive_test;"

# Run migrations
docker exec rawdrive-backend bash -c "DATABASE_URL=postgresql://rawdrive:rawdrive@postgres:5432/rawdrive_test alembic upgrade head"
```

## Common Test Patterns

### Frontend Component Test
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GalleryCard } from './GalleryCard';

describe('GalleryCard', () => {
  it('renders gallery name', () => {
    render(<GalleryCard gallery={{ name: 'Test Gallery' }} />);
    expect(screen.getByText('Test Gallery')).toBeInTheDocument();
  });

  it('handles click event', () => {
    const onClick = vi.fn();
    render(<GalleryCard gallery={{ name: 'Test' }} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

### Backend API Test
```python
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_gallery(auth_headers):
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/galleries",
            json={"name": "Test Gallery"},
            headers=auth_headers
        )
        assert response.status_code == 201
        assert response.json()["name"] == "Test Gallery"
```

## Troubleshooting

### Tests Failing
- Ensure all services are running
- Check test database is seeded
- Verify environment variables
- Clear test cache: `pytest --cache-clear`

### Coverage Not Generated
- Install coverage package: `pip install pytest-cov`
- Check write permissions for coverage directory

### E2E Tests Timeout
- Increase timeout in playwright.config.ts
- Ensure frontend and backend are running
- Check network connectivity

## Notes

- Run tests before committing code
- Maintain >80% code coverage
- Write tests for new features
- Update tests when changing functionality
- Use test fixtures for common setup
- Mock external services in tests
