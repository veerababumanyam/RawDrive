# Analytics & Reporting - Comprehensive Specification

## 1. Problem Statement

Photographers and studios currently lack visibility into how their galleries perform, how clients engage with their content, and what business trends are emerging. Without data-driven insights, they cannot optimize their workflow, identify high-value clients, or make informed business decisions. This feature provides comprehensive analytics across galleries, clients, invitations, and revenue to enable data-informed decision making.

## 2. User Story

**Primary**: As a photographer, I want to see comprehensive analytics about my galleries and client engagement, so that I can understand my business performance and make data-driven decisions.

**Secondary**: As a studio manager, I want to track revenue metrics and client lifetime value, so that I can identify growth opportunities and reduce churn.

## 3. Acceptance Criteria

### Dashboard Analytics
- **GIVEN** an authenticated user on the workspace dashboard, **WHEN** loading the analytics page, **THEN** display overview metrics (total galleries, total assets, storage used, active clients, recent activity)
- **GIVEN** a workspace with activity data, **WHEN** viewing quick stats, **THEN** show views, downloads, new clients, and revenue for the selected period
- **GIVEN** no analytics data exists, **WHEN** viewing the dashboard, **THEN** display empty states with helpful guidance

### Gallery Analytics
- **GIVEN** a gallery with visitor activity, **WHEN** viewing gallery analytics, **THEN** display total views, unique visitors, geographic distribution, and device breakdown
- **GIVEN** client engagement with a gallery, **WHEN** viewing engagement metrics, **THEN** show favorites, comments, downloads, session duration, and bounce rate
- **GIVEN** share links for a gallery, **WHEN** viewing link analytics, **THEN** show access count, gate conversion rates, and expiry status

### Client Analytics
- **GIVEN** a client with gallery interactions, **WHEN** viewing client analytics, **THEN** display activity history, engagement score, and lifetime value
- **GIVEN** multiple clients in a workspace, **WHEN** viewing client analytics list, **THEN** identify most engaged clients and churn risks
- **GIVEN** a client ID, **WHEN** fetching individual analytics, **THEN** return comprehensive client metrics

### Reports & Export
- **GIVEN** analytics data, **WHEN** creating a custom report, **THEN** allow configuration of metrics, date ranges, and filters
- **GIVEN** a report request, **WHEN** exporting data, **THEN** generate downloadable CSV/PDF with selected metrics
- **GIVEN** a scheduled report, **WHEN** the schedule triggers, **THEN** send the report to configured recipients

### Error Handling
- **GIVEN** invalid date range parameters, **WHEN** requesting analytics, **THEN** return 400 with validation error details
- **GIVEN** unauthorized workspace access, **WHEN** fetching analytics, **THEN** return 403 Forbidden
- **GIVEN** analytics service timeout, **WHEN** aggregating data, **THEN** return cached data with staleness indicator

## 4. Technical Context

| Aspect | Value |
|--------|-------|
| Affected Files | `backend/src/app/api/v1/analytics.py`, `backend/src/app/services/analytics_service.py`, `backend/src/app/repositories/analytics_repository.py`, `backend/src/app/models/analytics.py`, `frontend/src/pages/workspace/AnalyticsDashboardPage.tsx`, `frontend/src/services/analyticsService.ts`, `frontend/src/hooks/useAnalytics.ts` |
| Dependencies | Redis (caching), PostgreSQL (storage), existing gallery/client models |
| Constraints | Must support 50K+ galleries per workspace, real-time view tracking, multi-tenant isolation |
| Patterns to Follow | Repository-Service-API pattern, React Query for data fetching, Pydantic schemas, workspace_id filtering |

## 5. Non-Goals

- Real-time streaming analytics (batch aggregation is sufficient)
- Predictive analytics or ML-based forecasting
- Third-party analytics integration (Google Analytics, Mixpanel)
- A/B testing framework
- Custom dashboard builder (predefined dashboards only)
- Cohort analysis tools

## 6. Implementation Tasks

```tasks
## Phase 1: Database & Models
- [ ] T001: Create analytics database migration with all tables | File: backend/migrations/versions/0109_analytics_system.py
- [ ] T002: Create analytics event model | File: backend/src/app/models/analytics.py
- [ ] T003: Create gallery analytics model | File: backend/src/app/models/analytics.py
- [ ] T004: Create client analytics model | File: backend/src/app/models/analytics.py
- [ ] T005: Create custom reports model | File: backend/src/app/models/analytics.py
- [ ] T006: Register models in __init__.py | File: backend/src/app/models/__init__.py

## Phase 2: Shared Types & Constants
- [ ] T007: Add analytics TypeScript types | File: packages/shared-types/src/analytics.ts
- [ ] T008: Add analytics constants | File: packages/shared-constants/src/analytics.ts
- [ ] T009: Export analytics types from index | File: packages/shared-types/src/index.ts
- [ ] T010: Export analytics constants from index | File: packages/shared-constants/src/index.ts

## Phase 3: Backend Repository Layer
- [ ] T011: Create analytics repository with event tracking | File: backend/src/app/repositories/analytics_repository.py
- [ ] T012: Add gallery analytics aggregation methods | File: backend/src/app/repositories/analytics_repository.py
- [ ] T013: Add client analytics aggregation methods | File: backend/src/app/repositories/analytics_repository.py
- [ ] T014: Add report configuration persistence | File: backend/src/app/repositories/analytics_repository.py

## Phase 4: Backend Service Layer
- [ ] T015: Create analytics service with event recording | File: backend/src/app/services/analytics_service.py
- [ ] T016: Add dashboard metrics aggregation | File: backend/src/app/services/analytics_service.py
- [ ] T017: Add gallery analytics calculation | File: backend/src/app/services/analytics_service.py
- [ ] T018: Add client engagement scoring | File: backend/src/app/services/analytics_service.py
- [ ] T019: Add report generation and export | File: backend/src/app/services/analytics_service.py

## Phase 5: Backend API Layer
- [ ] T020: Create analytics API router with dashboard endpoints | File: backend/src/app/api/v1/analytics.py
- [ ] T021: Add gallery analytics endpoints | File: backend/src/app/api/v1/analytics.py
- [ ] T022: Add client analytics endpoints | File: backend/src/app/api/v1/analytics.py
- [ ] T023: Add reports CRUD endpoints | File: backend/src/app/api/v1/analytics.py
- [ ] T024: Add export endpoints | File: backend/src/app/api/v1/analytics.py
- [ ] T025: Register analytics router in API | File: backend/src/app/api/v1/__init__.py

## Phase 6: Frontend Services & Hooks
- [ ] T026: Create analytics API service | File: frontend/src/services/analyticsService.ts
- [ ] T027: Export analytics service from index | File: frontend/src/services/index.ts
- [ ] T028: Create useAnalytics hook for dashboard data | File: frontend/src/hooks/useAnalytics.ts
- [ ] T029: Create useGalleryAnalytics hook | File: frontend/src/hooks/useGalleryAnalytics.ts
- [ ] T030: Export analytics hooks from index | File: frontend/src/hooks/index.ts

## Phase 7: Frontend Components
- [ ] T031: Create AnalyticsOverviewCard component | File: frontend/src/components/features/analytics/AnalyticsOverviewCard.tsx
- [ ] T032: Create AnalyticsChart component | File: frontend/src/components/features/analytics/AnalyticsChart.tsx
- [ ] T033: Create GalleryAnalyticsPanel component | File: frontend/src/components/features/analytics/GalleryAnalyticsPanel.tsx
- [ ] T034: Create ClientAnalyticsTable component | File: frontend/src/components/features/analytics/ClientAnalyticsTable.tsx
- [ ] T035: Create ReportBuilder component | File: frontend/src/components/features/analytics/ReportBuilder.tsx

## Phase 8: Frontend Pages & Routes
- [ ] T036: Create AnalyticsDashboardPage | File: frontend/src/pages/workspace/AnalyticsDashboardPage.tsx
- [ ] T037: Create GalleryAnalyticsPage | File: frontend/src/pages/workspace/GalleryAnalyticsPage.tsx
- [ ] T038: Create ReportsPage | File: frontend/src/pages/workspace/ReportsPage.tsx
- [ ] T039: Add analytics routes to router | File: frontend/src/router/routes.tsx
- [ ] T040: Add analytics to workspace sidebar | File: frontend/src/components/workspace/WorkspaceSidebar.tsx

## Phase 9: Integration & Testing
- [ ] T041: Create Playwright verification test | File: tests/e2e/analytics-verification.spec.ts
- [ ] T042: Run verification test and validate functionality | File: tests/e2e/analytics-verification.spec.ts
- [ ] T043: Clean up verification test file | File: tests/e2e/analytics-verification.spec.ts
```

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Dashboard load time | < 2 seconds |
| Analytics API response time | P95 < 500ms |
| Cache hit rate for dashboard metrics | > 80% |
| Event tracking latency | < 100ms |
| Export generation time | < 30 seconds for 100K records |
| All analytics endpoints return valid data | 100% |
| Multi-tenant isolation verified | 100% |

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| High-volume event storage grows rapidly | Implement 90-day retention policy, aggregate older data |
| Aggregation queries slow on large datasets | Pre-compute daily/weekly/monthly rollups, use Redis caching |
| Real-time view tracking impacts gallery performance | Use async event recording, batch inserts |
| Complex report generation times out | Implement async export with status polling |
| Inaccurate engagement scoring | Start with simple metrics, iterate based on feedback |

---

[SPEC_GENERATED] Please review the comprehensive specification above. Reply with 'approved' to proceed or provide feedback for revisions.