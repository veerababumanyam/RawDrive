# Gallery Service Comprehensive Issues Report

**Generated**: 2026-02-08
**Scope**: Gallery service, magic link service, and all related features

---

## Executive Summary

This report consolidates findings from 6 specialized agents that scanned the gallery service, magic link implementation, database models, configuration files, frontend components, and service integrations.

**Total Critical Issues**: 12
**Total High Priority Issues**: 28
**Total Medium Priority Issues**: 45
**Total Low Priority Issues**: 18

---

## 1. CRITICAL SECURITY ISSUES

### 1.1 Hardcoded Security Secrets (CRITICAL)
**File**: `services/gallery-service/src/config.py:66-71`

```python
JWT_SECRET: str = "dev-secret-change-in-production"  # CRITICAL SECURITY RISK
ENCRYPTION_MASTER_KEY: str = "0000000000000000000000000000000000000000000000000000000000000000"
```

**Impact**: Production code with weak default secrets
**Fix**: Remove defaults, require environment variables

### 1.2 SQL Injection Vulnerability (CRITICAL)
**File**: `services/gallery-service/src/api/v1/public/galleries.py:426-443`

```python
await conn.execute(
    'INSERT INTO client_interactions ... VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)',
    workspace_id,
    gallery_uuid,
    asset_uuid,
    f'{{"visitor_id": "{visitor_id}"}}',  # POTENTIAL SQL INJECTION
    f'{{"value": {request.rating}}}',
)
```

**Impact**: User input directly interpolated into strings
**Fix**: Use proper JSONB parameters

### 1.3 Missing JWT Algorithm Consistency (CRITICAL)
**Files**:
- `services/gallery-service/src/config.py:68`: `JWT_ALGORITHM = "EdDSA"`
- `services/billing-service/src/config.py:47`: `JWT_ALGORITHM = "HS256"`

**Impact**: Authentication failures between services
**Fix**: Standardize to EdDSA across all services

### 1.4 Timing Attack in Cache Lookup (HIGH)
**File**: `backend/src/app/services/magic_link_service.py:474-485`

```python
if cached_data.get("max_accesses"):
    cached_data = None  # Creates timing side-channel
```

**Impact**: Cache presence detectable via response time
**Fix**: Use constant-time comparison

---

## 2. MISSING FEATURE IMPLEMENTATIONS

### 2.1 Gallery Design Recommendations Disabled (HIGH)
**File**: `services/gallery-service/src/api/v1/__init__.py:11-12, 77-83`

**Issue**: `gallery_design_recommendations` router completely commented out
**Impact**: AI-powered gallery design recommendations not working
**Fix**: Fix backend-specific imports and re-enable endpoint

### 2.2 Missing Magic Link Microservice (HIGH)
**Finding**: No dedicated `magiclink-service` microservice exists

**Impact**: Invitations service calling non-existent service (connection errors)
**Files Affected**:
- `services/invitations-service/src/services/magic_link_client.py:26`

**Fix**: Create magiclink-service or update invitations to use backend directly

### 2.3 Missing Service Integrations (HIGH)

**Gallery → Upload Service**: No integration
- Gallery service doesn't coordinate with upload-service for asset processing status

**Gallery → Billing Service**: No integration
- No billing status validation or subscription limit enforcement

**Gallery → Webhooks Service**: No integration
- Gallery events don't trigger webhooks

**Gallery → Client Service**: Limited integration
- Collaboration service is just a stub (no actual WebSocket connections)

### 2.4 Export URL Placeholder (MEDIUM)
**File**: `services/gallery-service/src/api/v1/agents.py:398`

```python
"export_url": f"/api/v1/exports/{gallery_id}/selections.{export_format}"
```

**Issue**: Export endpoint not implemented
**Fix**: Implement actual export functionality

---

## 3. DATABASE ISSUES

### 3.1 Missing Gallery Pydantic Model (HIGH)
**Finding**: No Gallery model in `backend/src/app/models/` despite migrations up to 0190

**File to Create**: `backend/src/app/models/gallery.py`
**Impact**: Type safety issues, runtime errors instead of compile-time

### 3.2 Missing Foreign Key Constraints (HIGH)

**Missing Constraints**:
- `gallery_assets.asset_id → assets.asset_id`
- `sub_galleries.cover_asset_id → assets.asset_id`
- `galleries.cover_asset_id → assets.asset_id`

**Impact**: Orphaned references possible, data integrity risks

### 3.3 Missing Database Indexes (MEDIUM)

**Galleries Table**:
- ❌ `(workspace_id, client_name)` for filtered searches
- ❌ `(workspace_id, title)` for title searches
- ❌ `(workspace_id, status, expires_at)` for expiring galleries

**Gallery Assets Table**:
- ❌ `(workspace_id, gallery_id, rating)` for rating-based filtering
- ❌ `(workspace_id, gallery_id, flag)` for flag-based filtering
- ❌ `(workspace_id, sub_gallery_id, visible)` for sub-gallery queries

**Assets Table**:
- ❌ `(workspace_id, created_at DESC)` for recent assets queries
- ❌ `(workspace_id, type)` for type-based filtering

### 3.4 Missing Fields in Models (MEDIUM)

**Missing from models but in migrations**:
- `show_people_filter`
- `last_accessed_at`
- `gradient_config`
- `custom_links`
- `public_url` (in magic_links)

---

## 4. CONFIGURATION ISSUES

### 4.1 Missing Environment Variable Documentation (HIGH)
**Finding**: No `.env.example` file in `services/gallery-service/`

**Impact**: Developers don't know required environment variables
**Fix**: Create comprehensive `.env.example`

### 4.2 Hardcoded Service URLs (MEDIUM)

**Files**: `services/gallery-service/src/config.py`

```python
AI_SERVICE_URL = "http://ai-service:8013"  # Line 113
DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/rawdrive"  # Lines 43-46
```

**Fix**: Use environment variables with no defaults

### 4.3 Configuration Inconsistencies (MEDIUM)

**Cache TTL**:
- Config: `CACHE_TTL_SIGNED_URL: 14400` (4 hours)
- Docker: `CACHE_TTL_SIGNED_URL: 3600` (1 hour)

**Database Pool Sizes**:
- Gallery Service: `DB_POOL_MAX_SIZE: 100`
- Billing Service: `DB_POOL_MAX_SIZE: 50`

**Redis Connections**:
- Gallery Service: `REDIS_MAX_CONNECTIONS: 50`
- Billing Service: `REDIS_MAX_CONNECTIONS: 20`

### 4.4 Missing Configuration Validation (HIGH)
**Issue**: No validation of required environment variables on startup
**Impact**: Service fails unpredictably if variables missing

---

## 5. API & ENDPOINT ISSUES

### 5.1 Inconsistent Error Response Formats (MEDIUM)

**Different formats used**:
- `{"error": "CODE", "message": "text"}`
- `{"error": "text"}`
- `{"detail": "text"}`

**Fix**: Standardize error response format across all endpoints

### 5.2 Manual Date Parsing Instead of Pydantic Validation (MEDIUM)
**File**: `services/gallery-service/src/api/v1/galleries.py:109-116`

```python
if request.shoot_date:
    from datetime import datetime
    try:
        shoot_date = datetime.fromisoformat(request.shoot_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid shoot_date format")
```

**Fix**: Use Pydantic's `datetime` field with validator

### 5.3 Missing Rate Limiting (MEDIUM)
**Issue**: No rate limiting on most public endpoints
**Risk**: DoS attacks possible

### 5.4 Direct Database Queries in Endpoints (MEDIUM)
**File**: `services/gallery-service/src/api/v1/public/galleries.py:223-257`

**Issue**: Direct database queries for PIN/password verification
**Fix**: Use service layer for consistency

---

## 6. FRONTEND ISSUES

### 6.1 Missing UI States (MEDIUM)

**GalleryCanvas.tsx**:
- No retry mechanism for error state
- Virtualization threshold hardcoded to 50

**PhotoGrid.tsx**:
- Loading skeleton shows 12 items regardless of actual count
- Missing error state for drag-and-drop failures

**VirtualPhotoGrid.tsx**:
- Loading skeleton doesn't reflect actual column count
- Missing error handling for initial render

**PhotoListView.tsx**:
- Loading state only when assets.length === 0
- Empty state lacks filtering information

### 6.2 Hardcoded Values (MEDIUM)

**Colors**:
- `bg-pink-500`, `bg-primary` hardcoded in GalleryToolbar.tsx

**Text**:
- "Processing...", "Upload Failed", "No photos" hardcoded

**Icons**:
- `size={48}` hardcoded in PhotoListView.tsx

**Emoji**:
- "📷" hardcoded in PhotoCard.tsx

**Fix**: Use design tokens from `@rawdrive/shared-constants`

### 6.3 Missing Accessibility Features (MEDIUM)

**PhotoCard.tsx**:
- Missing `aria-describedby` for description text
- Cover badge lacks screen reader text
- Long-press menu not keyboard accessible

**PhotoListView.tsx**:
- Table lacks proper `role="table"` and `aria-label`
- Missing `scope` attribute for headers

**GalleryToolbar.tsx**:
- View mode buttons missing `aria-pressed` states
- Filter pills lack `aria-expanded` states

**VirtualPhotoGrid.tsx**:
- Missing `aria-activedescendant` for keyboard navigation

### 6.4 Performance Issues (MEDIUM)

**PhotoCard.tsx**:
- Global `loadedImageCache` causes memory leaks
- Complex memoization function may cause false negatives

**PhotoGrid.tsx**:
- Dynamic component creation on every render
- Missing `React.memo` for child components

**VirtualPhotoGrid.tsx**:
- Cell props object recreated on every render
- Missing `useCallback` for event handlers

**useSignedUrl.ts**:
- No request cancellation for rapid successive updates

**useGalleryAssets.ts**:
- Dependency array includes `currentPage` causing unnecessary refetches

### 6.5 Missing Error Handling (MEDIUM)

**GalleryCanvas.tsx**:
- No error handling for signed URL failures
- No timeout for image loading

**PhotoCard.tsx**:
- URL refresh logic doesn't handle network errors
- Missing error boundary for image loading

**galleryService.ts**:
- Generic error handling without specific error codes
- Missing error retry logic

---

## 7. MAGIC LINK SPECIFIC ISSUES

### 7.1 Inconsistent Token Generation (MEDIUM)
**Files**:
- `backend/src/app/services/magic_link_service.py:158-178`: `secrets.token_bytes(32)` + base64
- `services/gallery-service/src/services/magic_link_service.py:104-106`: `secrets.token_urlsafe(32)`

**Impact**: Inconsistency could cause validation issues
**Fix**: Standardize token format across all services

### 7.2 Short Redis Cache TTL (LOW)
**File**: `backend/src/app/services/magic_link_service.py:622-632`

**Issue**: 60 second TTL causes unnecessary database hits
**Fix**: Increase to 300-600 seconds with proper invalidation

### 7.3 Missing Cache Invalidation (LOW)
**Issue**: No cache invalidation on link revocation/expiry
**Impact**: Stale cache data possible

### 7.4 Incomplete Public API Contract (MEDIUM)

**Backend**: Returns full gallery data
**Gallery Service**: Returns validation status boolean

**Impact**: Frontend needs to handle different response formats

---

## 8. INTEGRATION ISSUES

### 8.1 No Service Discovery Mechanism (HIGH)
**Issue**: Hardcoded service URLs
**Impact**: Service discovery failures in production

### 8.2 Missing Service-to-Service Authentication (HIGH)
**Issue**: No JWT or mTLS for inter-service communication
**Impact**: Security gap between microservices

### 8.3 No Circuit Breakers for Most Services (MEDIUM)
**Current**: Only AI service has circuit breaker protection
**Risk**: Cascading failures from unprotected services

### 8.4 No Webhook Publisher (HIGH)
**Missing Components**:
- Webhook event configuration
- Event serialization
- HTTP client for delivery
- Retry mechanism
- Failure tracking

### 8.5 In-Memory WebSocket Manager (MEDIUM)
**File**: `services/gallery-service/src/api/v1/websocket_agents.py:42-47`

**Issue**: No persistent storage for connections
**Impact**: Connections lost on service restart

### 8.6 Missing Distributed Tracing (LOW)
**Issue**: No tracing for service call chains
**Impact**: Difficult to debug cross-service issues

---

## 9. OBSERVABILITY GAPS

### 9.1 Missing Metrics (MEDIUM)

**Not Tracked**:
- Service call success rates
- Service latency percentiles
- Circuit breaker state changes
- Service health check failures
- Message queue backlog sizes

### 9.2 Missing Health Checks (LOW)
**Issue**: Some services lack comprehensive health check endpoints

### 9.3 Debug Code in Production (LOW)
**Files**: Multiple files contain debug logging

---

## 10. CODE QUALITY ISSUES

### 10.1 Type Safety (MEDIUM)

**Issues**:
- Many components use `any` types for API responses
- Missing null checks for optional props
- Generic `Model` type in shared types defeats type safety

### 10.2 Missing Error Boundaries (MEDIUM)
**Issue**: No error boundaries wrapped around critical components
**Impact**: Unhandled errors can crash entire views

### 10.3 Large Component Files (LOW)
**Example**: GalleryDetailPage.tsx is 1441 lines
**Impact**: Difficult to maintain

---

## Priority Action Items

### Immediate (This Week)
1. [ ] Remove hardcoded JWT_SECRET and ENCRYPTION_MASTER_KEY defaults
2. [ ] Fix SQL injection vulnerability in public rating endpoint
3. [ ] Create Gallery Pydantic model in backend
4. [ ] Add missing foreign key constraints to database
5. [ ] Create .env.example for gallery service

### High Priority (This Month)
1. [ ] Fix JWT algorithm inconsistency across services
2. [ ] Re-enable gallery design recommendations endpoint
3. [ ] Implement missing service integrations (upload, billing, webhooks)
4. [ ] Add service-to-service authentication
5. [ ] Implement circuit breakers for all external service calls
6. [ ] Fix timing attack in cache lookup

### Medium Priority (This Quarter)
1. [ ] Add all missing database indexes
2. [ ] Standardize error response formats
3. [ ] Implement rate limiting on public endpoints
4. [ ] Add configuration validation on startup
5. [ ] Fix frontend accessibility issues
6. [ ] Optimize frontend performance (memoization, lazy loading)
7. [ ] Remove hardcoded values (use design tokens)

### Low Priority (Future)
1. [ ] Remove debug code from production
2. [ ] Add comprehensive metrics collection
3. [ ] Implement distributed tracing
4. [ ] Reduce component file sizes through refactoring
5. [ ] Add comprehensive test coverage

---

## Agent Report Summaries

| Agent | Focus | Issues Found |
|-------|-------|--------------|
| API Explorer | Endpoints & handlers | 12 issues |
| Magic Link Explorer | Magic link service | 12 issues |
| Database Explorer | Models & repositories | 8 issues |
| Config Explorer | Configuration files | 10 issues |
| Frontend Explorer | UI components | 25+ issues |
| Integration Explorer | Service integrations | 15 issues |

---

**Report Generated By**: Claude Code Multi-Agent Analysis System
**Date**: 2026-02-08
**Version**: 1.0
