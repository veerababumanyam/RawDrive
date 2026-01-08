# Immediate Fixes for AI Service

## Status: ALL ISSUES FIXED ✅

**Last Updated**: 2026-01-08

---

## Issue 1: JWT Signature Verification Failing ✅ FIXED

**Problem**: JWT verification fails with "Unable to find an algorithm for key"

**Root Cause**: JWT public key not mounted or incorrect format

**Fix Applied**:
1. Enhanced `get_jwt_secret()` in `auth.py` to:
   - Log error if key file is empty
   - Fail hard in production mode if key not configured
   - Provide detailed logging

2. Updated `docker-compose.yml` with:
   ```yaml
   ai-service:
     volumes:
       - ../../backend/secrets/jwtEd25519.key.pub:/run/secrets/jwt_public_key:ro
     environment:
       JWT_PUBLIC_KEY_PATH: /run/secrets/jwt_public_key
       JWT_ALGORITHM: EdDSA
       JWT_ISSUER: rawdrive
   ```

## Issue 2: CORS Too Permissive ✅ FIXED

**Fix Applied in `server.py`**:
```python
# Get from environment
default_origins = "http://localhost,http://localhost:3000,http://localhost:5173,http://localhost:8000"
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", default_origins)
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # Not ["*"]
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],  # Explicit list
    allow_headers=["Authorization", "Content-Type", "X-Workspace-ID", "X-Request-ID"],  # Explicit list
    max_age=3600,  # Cache preflight for 1 hour
)
```

## Issue 3: Missing Database Indexes ✅ FIXED

**Migration Created**: `backend/migrations/versions/0135_ai_service_performance_indexes.py`

**Indexes Added**:
```sql
-- Photo quality analysis indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_photo_quality_workspace_score 
    ON photo_quality_analysis(workspace_id, overall_score DESC) 
    WHERE overall_score IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_photo_quality_workspace_blur 
    ON photo_quality_analysis(workspace_id, blur_detected) 
    WHERE blur_detected = TRUE;

-- Asset analysis indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_analysis_workspace_asset 
    ON asset_analysis(workspace_id, asset_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_analysis_workspace_status_composite 
    ON asset_analysis(workspace_id, vision_status, face_status);
```

**To Apply**: Run `alembic upgrade head` or restart services.

## Issue 4: No Response Caching ✅ FIXED

**File Created**: `services/ai-service/src/rawdrive_mcp/cache.py`

**Features Implemented**:
- Async Redis client with connection pooling
- `cache_response` decorator with configurable TTL
- Cache key generation from function arguments
- Cache invalidation support
- Graceful degradation on Redis errors

**Usage**:
```python
from rawdrive_mcp.cache import cache_response, CACHE_TTL_GALLERY_HEALTH

@router.get("/galleries/{gallery_id}/health")
@cache_response("gallery_health", ttl_seconds=CACHE_TTL_GALLERY_HEALTH)
async def get_gallery_health(...):
    ...
```

## Issue 5: No Rate Limiting ✅ FIXED

**File Created**: `services/ai-service/src/middleware/rate_limit.py`

**Features Implemented**:
- Per-user/per-IP rate limiting using `slowapi`
- Configurable limits via environment variables:
  - `RATE_LIMIT_DEFAULT`: 100/minute
  - `RATE_LIMIT_HEALTH`: 60/minute
  - `RATE_LIMIT_AI_FILTER`: 30/minute
- Custom rate limit exceeded handler with JSON response
- Applied to all smart-tagging endpoints

**Usage**:
```python
from src.middleware.rate_limit import limiter, RATE_LIMIT_HEALTH

@router.get("/galleries/{gallery_id}/health")
@limiter.limit(RATE_LIMIT_HEALTH)
async def get_gallery_health(request: Request, ...):
    ...
```

---

## Additional Fixes Applied

### Query LIMIT Reduced ✅
- **File**: `smart_tagging.py`
- **Change**: Reduced `LIMIT 2000` to `LIMIT 500` in AI filter queries (lines 284, 360)

### Request ID Tracing Added ✅
- **File**: `server.py`
- **Change**: Added `RequestIdMiddleware` for distributed tracing with `X-Request-ID` header

### GZip Compression Added ✅
- **File**: `server.py`
- **Change**: Added `GZipMiddleware` with minimum_size=1000

### Global Exception Handler Added ✅
- **File**: `server.py`
- **Change**: Added `global_exception_handler` returning JSON error responses with request_id

### DB Pool Configuration ✅
- **File**: `db.py`
- **Change**: Made pool size configurable via environment variables:
  - `DB_POOL_MIN_SIZE` (default: 2)
  - `DB_POOL_MAX_SIZE` (default: 10)
  - `DB_COMMAND_TIMEOUT` (default: 60)
  - `DB_MAX_INACTIVE_LIFETIME` (default: 300)

### .env.example Created ✅
- **File**: `services/ai-service/.env.example`
- **Change**: Created template documenting all environment variables

### Prometheus Metrics ✅
- **File**: `server.py`
- **Change**: Added `prometheus-fastapi-instrumentator`
- Exposes metrics at `/metrics` endpoint
- Configurable via `METRICS_ENABLED` env var

### Circuit Breaker ✅
- **File**: `services/ai-service/src/middleware/circuit_breaker.py`
- **Change**: Implemented circuit breaker pattern:
  - Named circuit breakers for different services (ai_processing, database, redis, milvus)
  - Configurable failure threshold and recovery timeout
  - Status available at `/health/detailed`

### Enhanced Health Check ✅
- **File**: `server.py`
- **Change**: Added `/health/detailed` endpoint that checks:
  - Database connectivity and pool status
  - Redis connectivity and version
  - Milvus connectivity
  - Circuit breaker status

---

## All Issues Resolved ✅

| Priority | Issue | Status |
|----------|-------|--------|
| CRITICAL | JWT Signature Verification | ✅ FIXED |
| HIGH | CORS Too Permissive | ✅ FIXED |
| HIGH | Missing Rate Limiting | ✅ FIXED |
| HIGH | Missing Database Indexes | ✅ FIXED |
| HIGH | Query LIMIT Too Large | ✅ FIXED |
| HIGH | No Response Caching | ✅ FIXED |
| MEDIUM | No Pool Size Configuration | ✅ FIXED |
| MEDIUM | Missing Request ID Tracing | ✅ FIXED |
| MEDIUM | Generic Error Responses | ✅ FIXED |
| MEDIUM | No Circuit Breaker | ✅ FIXED |
| MEDIUM | No Prometheus Metrics | ✅ FIXED |
| MEDIUM | No .env.example | ✅ FIXED |
| MEDIUM | Enhanced Health Checks | ✅ FIXED |
| MEDIUM | GZip Compression | ✅ FIXED |
