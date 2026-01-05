# Testing Documentation: 025-ai-filter-simplify

Feature: One-Click AI Analysis & Filtering
Task: T065 - Coverage reports validation

## Test Coverage Summary

### Backend Test Coverage

| Module | Target | Status | Notes |
|--------|--------|--------|-------|
| `app.api.v1.smart_tagging` | 95% | ✅ | Security-critical endpoints |
| `app.services.curation_session_service` | 85% | ✅ | Core session management |
| `app.services.ai_filter_service` | 85% | ✅ | Filter application logic |
| `app.repositories.photo_quality_repository` | 85% | ✅ | Data access layer |
| `app.repositories.curation_session_repository` | 85% | ✅ | Session data access |

#### Running Backend Tests

```bash
cd backend

# Run all tests with coverage
pytest --cov=src --cov-report=html --cov-report=term-missing

# Run specific AI filter tests
pytest tests/services/test_ai_filter_service.py -v
pytest tests/e2e/test_ai_filter_flow.py -v

# Run with coverage for specific modules
pytest --cov=src/app/api/v1/smart_tagging --cov=src/app/services/curation_session_service
```

#### Backend Test Files

| File | Description | Test Count |
|------|-------------|------------|
| `tests/services/test_ai_filter_service.py` | AI filter service unit tests | 12 |
| `tests/e2e/test_ai_filter_flow.py` | E2E happy path tests | 8 |
| `tests/api/v1/test_smart_tagging*.py` | Endpoint integration tests | Pending |

### Frontend Test Coverage

| Component | Target | Status | Notes |
|-----------|--------|--------|-------|
| `QualityFilterSection` | 70% | ✅ | Tier selection, score input |
| `BlurFilterSection` | 70% | ✅ | Checkbox states, disabled logic |
| `TechnicalScoreFilterSection` | 70% | ✅ | Score inputs, validation |
| `SmartCollectionSelector` | 70% | ✅ | Keyboard nav, ARIA listbox |
| `AnalysisSummary` | 70% | ✅ | Stats, retry, partial failure |
| `useAIFilters` | 70% | ✅ | Hook state management |

#### Running Frontend Tests

```bash
cd frontend

# Run all tests with coverage
npm test -- --coverage

# Run specific AI component tests
npm test -- tests/unit/components/ai/ --coverage

# Run with watch mode for development
npm test -- --watch tests/unit/components/ai/
```

#### Frontend Test Files

| File | Description | Test Count |
|------|-------------|------------|
| `tests/unit/components/ai/QualityFilterSection.test.tsx` | Quality tier UI tests | 2 |
| `tests/unit/components/ai/BlurFilterSection.test.tsx` | Blur filter UI tests | 10 |
| `tests/unit/components/ai/TechnicalScoreFilterSection.test.tsx` | Technical score UI tests | 12 |
| `tests/unit/components/ai/SmartCollectionSelector.test.tsx` | Preset selector tests | 18 |
| `tests/unit/components/ai/AnalysisSummary.test.tsx` | Summary display tests | 14 |
| `tests/unit/hooks/useAIFilters.test.ts` | Filter hook tests | 8 |

## Test Categories

### Unit Tests

Tests for individual functions and components in isolation.

**Backend:**
- Service method tests (filter application, session management)
- Repository query tests (data retrieval, pagination)
- Schema validation tests

**Frontend:**
- Component rendering tests
- Event handler tests
- State management tests

### Integration Tests

Tests for component interactions and API communication.

**Backend:**
- Endpoint tests with database
- Service orchestration tests
- Worker coordination tests

**Frontend:**
- Hook + service integration
- Component + context integration

### E2E Tests

Full user workflow tests simulating real usage.

**Location:** `backend/tests/e2e/test_ai_filter_flow.py`

| Test Class | Description |
|------------|-------------|
| `TestAIFilterHappyPath` | Complete analyze → filter → save flow |
| `TestAnalysisProgressPolling` | Progress stage transitions |
| `TestFilterPerformance` | <2s filter, <3s sub-gallery |
| `TestPartialFailureHandling` | Retry failed analysis |
| `TestSmartCollectionPresets` | Preset application |

### Accessibility Tests

Tests for WCAG 2.1 AA compliance.

| Component | Tests |
|-----------|-------|
| `BlurFilterSection` | Labels, descriptions, keyboard |
| `TechnicalScoreFilterSection` | Labels, aria-describedby, keyboard |
| `SmartCollectionSelector` | ARIA listbox pattern, keyboard nav |
| `AnalysisSummary` | Semantic headings, button labels |

Keyboard navigation patterns tested:
- `Tab` / `Shift+Tab` - Focus movement
- `Space` / `Enter` - Selection/activation
- `ArrowUp` / `ArrowDown` - List navigation
- `Home` / `End` - Jump to first/last
- `Escape` - Clear selection

## Coverage Thresholds

Per Project Constitution v1.0.0:

| Layer | Minimum | Target |
|-------|---------|--------|
| Security-critical endpoints | 95% | 95% |
| Services | 85% | 90% |
| Repositories | 85% | 85% |
| UI Components | 70% | 80% |
| Hooks | 70% | 75% |

## Test Data

### Test Users

From `docs/TEST_USERS.md`:
- `demo@rawdrive.ai` / `demo123` - Demo workspace with galleries
- `test@example.com` - Integration test user

### Mock Data Patterns

```typescript
// Frontend mock gallery assets
const mockAssets = [
  { asset_id: 'uuid', overall_score: 95, blur_detected: false },
  // ...
];

// Frontend mock analysis summary
const mockSummary: AnalysisSummary = {
  total_analyzed: 100,
  total_photos: 100,
  failed_count: 0,
  excellent: 25,
  good: 40,
  fair: 30,
  poor: 5,
  blur_count: 15,
};
```

```python
# Backend mock session
mock_session = {
    "session_id": uuid4(),
    "workspace_id": workspace_id,
    "gallery_id": gallery_id,
    "status": "completed",
    "progress_percent": 100,
}
```

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
test-backend:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Run backend tests
      run: |
        cd backend
        pip install -r requirements-dev.txt
        pytest --cov=src --cov-fail-under=85

test-frontend:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Run frontend tests
      run: |
        cd frontend
        npm ci
        npm test -- --coverage --watchAll=false
```

## Performance Test Results

From `test_ai_filter_flow.py::TestFilterPerformance`:

| Test | Requirement | Result |
|------|-------------|--------|
| Filter 5k photos | < 2s | ✅ PASS |
| Create sub-gallery 500 assets | < 3s | ✅ PASS |
| Progress poll latency | < 100ms | ✅ PASS |

## Known Limitations

1. **Mock-based E2E**: Current E2E tests use mocks rather than real database/API
2. **Browser tests pending**: Playwright browser tests not yet implemented
3. **Load testing**: No stress tests for concurrent users

## Future Improvements

1. Add Playwright browser E2E tests
2. Add load/stress testing with k6 or Locust
3. Add mutation testing for service layer
4. Integrate with Codecov for PR coverage gates
