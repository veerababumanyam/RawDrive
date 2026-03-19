# Testing Setup Guide

This document provides an overview of all testing tools installed and configured for RawDrive.

## Installed Testing Tools

### Frontend Testing

#### 1. Vitest (Unit & Integration Testing)
- **Version**: `^1.6.1`
- **Location**: `frontend/package.json`
- **Run Tests**:
  ```bash
  cd frontend && pnpm test
  cd frontend && pnpm test:coverage
  ```
- **Purpose**: Fast unit and integration testing for React components
- **Features**:
  - @testing-library/react for component testing
  - @testing-library/jest-dom for DOM matchers
  - @testing-library/user-event for user interaction simulation
  - JSDOM for DOM environment
  - Property-based testing with fast-check

#### 2. Playwright (E2E Testing)
- **Version**: `^1.57.0`
- **Location**: `frontend/package.json`
- **Configuration**: `frontend/playwright.config.ts`
- **Test Directory**: `frontend/tests/e2e/`
- **Run Tests**:
  ```bash
  cd frontend && npx playwright test
  cd frontend && npx playwright test --ui  # Interactive mode
  cd frontend && npx playwright show-report  # View HTML report
  ```
- **Purpose**: End-to-end browser automation testing
- **Browsers Installed**:
  - Chromium (Desktop Chrome)
  - Firefox (Desktop Firefox)
  - WebKit (Desktop Safari)
  - Mobile Chrome (Pixel 5)
  - Mobile Safari (iPhone 12)
- **Features**:
  - Multi-browser testing
  - Mobile viewport emulation
  - Screenshot/video on failure
  - Trace recording for debugging
  - Auto-starts dev server before tests

### Backend Testing

#### 3. Pytest (Python Testing Framework)
- **Version**: `8.3.3`
- **Location**: `backend/requirements.txt`
- **Test Directory**: `backend/tests/`
- **Run Tests**:
  ```bash
  # Inside Docker (recommended)
  docker exec rawdrive-backend pytest
  docker exec rawdrive-backend pytest tests/path/test_file.py
  docker exec rawdrive-backend pytest -k "test_name"
  docker exec rawdrive-backend pytest --cov

  # Local (if backend is running locally)
  cd backend && pytest
  ```
- **Purpose**: Unit, integration, and E2E testing for FastAPI services
- **Features**:
  - pytest-asyncio for async test support
  - pytest-cov for coverage reporting
  - pytest-xdist for parallel test execution
  - pytest-timeout for hanging test detection
  - pytest-mock for mocking
  - Hypothesis for property-based testing
  - Faker for test data generation

### Browser Automation (MCP)

#### 4. Superpowers-Chrome MCP Server
- **Installation**: Via npx from GitHub
- **Configuration**: `%APPDATA%\Claude\claude_desktop_config.json`
- **MCP Server Name**: `superpowers-chrome`
- **Purpose**: Chrome browser control via DevTools Protocol for AI-assisted testing
- **Usage**: Available through Claude Code's MCP tools
- **Features**:
  - Direct Chrome browser control
  - Zero dependencies
  - Headless and headed modes
  - DevTools Protocol integration

**MCP Configuration**:
```json
{
  "mcpServers": {
    "superpowers-chrome": {
      "command": "npx",
      "args": [
        "github:obra/superpowers-chrome"
      ]
    }
  }
}
```

## Testing Strategy

### Frontend
- **Unit Tests**: Component logic, utilities, hooks (Vitest)
- **Integration Tests**: Component interactions, API integration (Vitest)
- **E2E Tests**: User flows, critical paths (Playwright)

### Backend
- **Unit Tests**: Repository layer, service layer logic (pytest)
- **Integration Tests**: API endpoints, database operations (pytest)
- **E2E Tests**: Multi-service workflows (pytest + aiohttp)

## Test Directory Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── __tests__/          # Component unit tests
│   ├── hooks/
│   │   └── __tests__/          # Hook unit tests
│   ├── utils/
│   │   └── __tests__/          # Utility unit tests
│   └── services/
│       └── __tests__/          # Service integration tests
└── tests/
    └── e2e/                     # Playwright E2E tests

backend/
└── tests/
    ├── unit/                    # Unit tests
    ├── integration/             # Integration tests
    └── e2e/                     # End-to-end tests
```

## Quick Commands Reference

```bash
# Frontend
cd frontend && pnpm test                    # Run Vitest tests
cd frontend && pnpm test:coverage           # Run with coverage
cd frontend && npx playwright test          # Run E2E tests
cd frontend && npx playwright test --ui     # Interactive E2E

# Backend
docker exec rawdrive-backend pytest         # All tests
docker exec rawdrive-backend pytest --cov   # With coverage
docker exec rawdrive-backend pytest -x      # Stop on first failure

# Build shared packages (required before frontend tests)
pnpm build:packages
```

## CI/CD Integration

All testing tools are configured for CI/CD:
- Vitest: Runs in CI mode with coverage reporting
- Playwright: Retries on failure, runs serially on CI
- Pytest: Parallel execution with xdist

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Pytest Documentation](https://docs.pytest.org/)
- [Testing Library](https://testing-library.com/)
- [Superpowers-Chrome GitHub](https://github.com/obra/superpowers-chrome)

## Troubleshooting

### Playwright browsers not installed
```bash
cd frontend && npx playwright install
```

### Backend tests failing due to missing container
```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### Shared package type errors
```bash
pnpm build:packages
```

### MCP server not working
1. Restart Claude Desktop
2. Check MCP config at `%APPDATA%\Claude\claude_desktop_config.json`
3. Verify npx can access GitHub
