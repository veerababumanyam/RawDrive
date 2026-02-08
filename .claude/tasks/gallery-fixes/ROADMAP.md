# Gallery Fixes Roadmap

**Created**: 2026-02-08
**Status**: Active
**Priority**: CRITICAL

---

## Overview

This roadmap systematically addresses all gallery service issues identified in the comprehensive issues report. Issues are organized by category and priority level.

---

## Phase 1: Database Foundation (CRITICAL)

### Task 1.1: Create Gallery Pydantic Model
**Priority**: HIGH
**File**: `backend/src/app/models/gallery.py`
**Description**: Create comprehensive Gallery model with all fields from migrations
**Acceptance Criteria**:
- [ ] All fields from migrations 0186-0190 included
- [ ] Type hints for all fields
- [ ] Pydantic v2 validation
- [ ] Proper workspace_id isolation

### Task 1.2: Add Foreign Key Constraints
**Priority**: HIGH
**Migration**: Create new migration
**Description**: Add foreign key constraints to prevent orphaned records
**Acceptance Criteria**:
- [ ] `gallery_assets.asset_id → assets.asset_id`
- [ ] `sub_galleries.cover_asset_id → assets.asset_id`
- [ ] `galleries.cover_asset_id → assets.asset_id`
- [ ] Migration tested on staging

### Task 1.3: Add Performance Indexes
**Priority**: MEDIUM
**Migration**: Create new migration
**Description**: Add indexes for common query patterns
**Acceptance Criteria**:
- [ ] `(workspace_id, client_name)` on galleries
- [ ] `(workspace_id, title)` on galleries
- [ ] `(workspace_id, status, expires_at)` on galleries
- [ ] `(workspace_id, gallery_id, rating)` on gallery_assets
- [ ] `(workspace_id, gallery_id, flag)` on gallery_assets
- [ ] `(workspace_id, sub_gallery_id, visible)` on gallery_assets

---

## Phase 2: Configuration Security (CRITICAL)

### Task 2.1: Create .env.example for Gallery Service
**Priority**: HIGH
**File**: `services/gallery-service/.env.example`
**Description**: Document all required environment variables
**Acceptance Criteria**:
- [ ] All config variables documented
- [ ] Default values removed for sensitive vars
- [ ] Examples provided for non-sensitive vars
- [ ] Comments explaining purpose

### Task 2.2: Replace Hardcoded Service URLs
**Priority**: MEDIUM
**Files**: `services/gallery-service/src/config.py`
**Description**: Use environment variables for all service URLs
**Acceptance Criteria**:
- [ ] AI_SERVICE_URL from environment
- [ ] DATABASE_URL from environment
- [ ] All URLs have no defaults
- [ ] Validation on startup

### Task 2.3: Add Configuration Validation
**Priority**: HIGH
**File**: `services/gallery-service/src/config.py`
**Description**: Validate required environment variables on startup
**Acceptance Criteria**:
- [ ] Service fails if critical vars missing
- [ ] Clear error messages for missing vars
- [ ] Validation runs before app starts

---

## Phase 3: API Standards (HIGH)

### Task 3.1: Standardize Error Response Format
**Priority**: MEDIUM
**Files**: All API endpoints
**Description**: Use consistent error response format
**Acceptance Criteria**:
- [ ] All errors use `{"error": "CODE", "message": "text"}`
- [ ] Error codes documented
- [ ] HTTP status codes consistent

### Task 3.2: Fix Manual Date Parsing
**Priority**: MEDIUM
**File**: `services/gallery-service/src/api/v1/galleries.py:109-116`
**Description**: Use Pydantic datetime validation
**Acceptance Criteria**:
- [ ] Pydantic validator for shoot_date
- [ ] Proper error handling
- [ ] ISO format validation

### Task 3.3: Add Rate Limiting
**Priority**: MEDIUM
**Files**: Public endpoints
**Description**: Add rate limiting to prevent abuse
**Acceptance Criteria**:
- [ ] Rate limit on public gallery endpoints
- [ ] Configurable limits per endpoint
- [ ] Proper headers (X-RateLimit-*)
- [ ] Redis-backed implementation

### Task 3.4: Move DB Queries to Service Layer
**Priority**: MEDIUM
**File**: `services/gallery-service/src/api/v1/public/galleries.py:223-257`
**Description**: Use service layer for PIN/password verification
**Acceptance Criteria**:
- [ ] No direct DB queries in endpoints
- [ ] Service layer handles validation
- [ ] Consistent error handling

---

## Phase 4: Missing Features (HIGH)

### Task 4.1: Re-enable Gallery Design Recommendations
**Priority**: HIGH
**File**: `services/gallery-service/src/api/v1/__init__.py:11-12`
**Description**: Fix imports and re-enable endpoint
**Acceptance Criteria**:
- [ ] Backend-specific imports fixed
- [ ] Router uncommented
- [ ] Endpoint tested
- [ ] AI integration verified

### Task 4.2: Implement Export Endpoint
**Priority**: MEDIUM
**Files**: Create new endpoint
**Description**: Implement actual export functionality
**Acceptance Criteria**:
- [ ] Endpoint at `/api/v1/exports/{id}/selections.{format}`
- [ ] Support multiple formats (zip, pdf)
- [ ] Rate limiting applied
- [ ] Background job for large exports

---

## Phase 5: Frontend Quality (MEDIUM)

### Task 5.1: Remove Hardcoded Colors
**Priority**: MEDIUM
**Files**: GalleryToolbar.tsx, PhotoCard.tsx
**Description**: Use design tokens from @rawdrive/shared-constants
**Acceptance Criteria**:
- [ ] All colors from shared-constants
- [ ] No hardcoded hex values
- [ ] Theme-aware values

### Task 5.2: Remove Hardcoded Text
**Priority**: MEDIUM
**Files**: PhotoGrid.tsx, PhotoListView.tsx
**Description**: Use i18n for all user-facing text
**Acceptance Criteria**:
- [ ] All text in i18n files
- [ ] No hardcoded strings
- [ ] Proper pluralization

### Task 5.3: Fix Accessibility Issues
**Priority**: MEDIUM
**Files**: PhotoCard.tsx, PhotoListView.tsx, GalleryToolbar.tsx
**Description**: Add proper ARIA attributes and keyboard navigation
**Acceptance Criteria**:
- [ ] aria-describedby on photo cards
- [ ] Proper table roles in list view
- [ ] aria-pressed on buttons
- [ ] aria-expanded on filters
- [ ] Keyboard navigation for all interactions

### Task 5.4: Optimize Performance
**Priority**: MEDIUM
**Files**: PhotoCard.tsx, PhotoGrid.tsx, VirtualPhotoGrid.tsx
**Description**: Fix memory leaks and unnecessary re-renders
**Acceptance Criteria**:
- [ ] Fix global cache memory leak
- [ ] Add React.memo to components
- [ ] Use useCallback for handlers
- [ ] Fix dependency arrays

### Task 5.5: Add Error Boundaries
**Priority**: MEDIUM
**Files**: Gallery views
**Description**: Wrap components in error boundaries
**Acceptance Criteria**:
- [ ] Error boundaries around gallery views
- [ ] Graceful fallback UI
- [ ] Error logging

---

## Phase 6: Magic Link Improvements (MEDIUM)

### Task 6.1: Standardize Token Generation
**Priority**: MEDIUM
**Files**: backend/src/app/services/magic_link_service.py, services/gallery-service/src/services/magic_link_service.py
**Description**: Use consistent token format across services
**Acceptance Criteria**:
- [ ] Single token generation method
- [ ] Shared utility in shared-utils
- [ ] Consistent token length and encoding

### Task 6.2: Increase Cache TTL
**Priority**: LOW
**File**: backend/src/app/services/magic_link_service.py:622-632
**Description**: Increase Redis cache TTL to 300-600 seconds
**Acceptance Criteria**:
- [ ] TTL increased to 300-600s
- [ ] Proper cache invalidation on revoke
- [ ] Cache warming strategy

---

## Phase 7: Service Integration (HIGH)

### Task 7.1: Create Webhook Publisher
**Priority**: HIGH
**Files**: Create new module
**Description**: Implement webhook event publishing
**Acceptance Criteria**:
- [ ] Event serialization
- [ ] HTTP client for delivery
- [ ] Retry mechanism
- [ ] Failure tracking
- [ ] Circuit breaker

### Task 7.2: Add Circuit Breakers
**Priority**: HIGH
**Files**: Service clients
**Description**: Add circuit breakers for all external service calls
**Acceptance Criteria**:
- [ ] Circuit breaker for AI service
- [ ] Circuit breaker for billing service
- [ ] Circuit breaker for upload service
- [ ] Configurable thresholds
- [ ] Proper logging

### Task 7.3: Implement Service Discovery
**Priority**: HIGH
**Files**: All services
**Description**: Replace hardcoded URLs with service discovery
**Acceptance Criteria**:
- [ ] Service discovery mechanism
- [ ] Health check integration
- [ ] Fallback on service unavailable
- [ ] Proper error handling

---

## Phase 8: Observability (MEDIUM)

### Task 8.1: Add Metrics
**Priority**: MEDIUM
**Files**: All services
**Description**: Add comprehensive metrics collection
**Acceptance Criteria**:
- [ ] Service call success rates
- [ ] Latency percentiles
- [ ] Circuit breaker state changes
- [ ] Health check failures
- [ ] Message queue backlog

### Task 8.2: Remove Debug Code
**Priority**: LOW
**Files**: Multiple files
**Description**: Remove debug logging from production code
**Acceptance Criteria**:
- [ ] Debug statements removed
- [ ] Proper log levels used
- [ ] Sensitive data not logged

---

## Priority Order

### Week 1 (CRITICAL)
1. Task 1.1: Create Gallery Pydantic Model
2. Task 1.2: Add Foreign Key Constraints
3. Task 2.1: Create .env.example
4. Task 2.3: Add Configuration Validation
5. Task 4.1: Re-enable Gallery Design Recommendations

### Week 2 (HIGH)
1. Task 1.3: Add Performance Indexes
2. Task 2.2: Replace Hardcoded Service URLs
3. Task 3.4: Move DB Queries to Service Layer
4. Task 7.1: Create Webhook Publisher
5. Task 7.2: Add Circuit Breakers

### Week 3 (MEDIUM)
1. Task 3.1: Standardize Error Response Format
2. Task 3.2: Fix Manual Date Parsing
3. Task 3.3: Add Rate Limiting
4. Task 4.2: Implement Export Endpoint
5. Task 5.1-5.5: Frontend Improvements

### Week 4 (LOW)
1. Task 6.1-6.2: Magic Link Improvements
2. Task 7.3: Implement Service Discovery
3. Task 8.1-8.2: Observability

---

## Testing Requirements

Each task MUST include:
1. Unit tests for new code
2. Integration tests for service interactions
3. E2E tests for user-facing changes
4. Performance tests for optimizations
5. Security tests for auth-related changes

---

## Deployment Strategy

1. **Staging First**: All changes deployed to staging first
2. **Incremental Rollout**: Deploy by phase, not all at once
3. **Feature Flags**: Use feature flags for disruptive changes
4. **Rollback Plan**: Each phase has rollback plan
5. **Monitoring**: Enhanced monitoring during rollout

---

## Success Metrics

- [ ] All CRITICAL issues resolved
- [ ] All HIGH issues resolved
- [ ] 80%+ of MEDIUM issues resolved
- [ ] 50%+ of LOW issues resolved
- [ ] Test coverage >80%
- [ ] No performance regression
- [ ] Security audit passed

---

**Last Updated**: 2026-02-08
**Next Review**: After Phase 1 completion
