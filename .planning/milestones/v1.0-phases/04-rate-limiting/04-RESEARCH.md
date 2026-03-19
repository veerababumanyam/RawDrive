# Phase 4: Rate Limiting - Research

**Researched:** 2026-03-18
**Domain:** Redis sliding window rate limiting for A2A API keys
**Confidence:** HIGH

## Summary

This phase implements per-key rate limiting for external A2A agent API keys. The existing codebase already has 90% of the infrastructure in place: a fully functional `RateLimitService` using Redis sorted sets with sliding window algorithm, an `A2AContext` that carries `api_key_id`, and a `check_a2a_rate_limit()` stub in `a2a_auth.py` with a TODO comment marking exactly where implementation goes. The `agent_api_keys` table already stores `rate_limit_rpm` per key (default 100, range 1-10000).

The remaining work is: (1) wire `RateLimitService.check_rate_limit()` into the `check_a2a_rate_limit()` stub using the per-key RPM from the database, (2) return proper 429 responses with `Retry-After` headers, (3) add a log-only/enforcing toggle via environment variable or settings, and (4) write tests. Total estimated new code is approximately 50 lines of implementation plus tests.

**Primary recommendation:** Reuse the existing `RateLimitService` with `custom_config` parameter -- do NOT build a separate rate limiter. The sliding window sorted set algorithm is already battle-tested in the codebase.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RATE-01 | Redis sliding window rate limiter implemented for A2A API keys (~50 lines) | `RateLimitService` already implements sliding window via Redis sorted sets. Wire it into `check_a2a_rate_limit()` with per-key config. |
| RATE-02 | Rate limiter checks agent_api_keys.rate_limit_rpm per request | `validate_api_key()` already fetches `rate_limit_rpm` from DB. Pass it to `RateLimitService.check_rate_limit()` via `custom_config` parameter. |
| RATE-03 | Returns 429 with Retry-After header when limit exceeded | `RateLimitResult` already computes `retry_after`. Middleware already returns 429 with headers. Replicate pattern in A2A flow. |
| RATE-04 | Rate limiter deployed in log-only mode first, then enforced after soak period | Add `A2A_RATE_LIMIT_MODE` setting (log_only/enforcing). In log-only mode, log but allow request through. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| redis.asyncio | (already installed) | Redis sorted set operations | Already used by RateLimitService |
| FastAPI/Starlette | (already installed) | HTTP middleware, 429 responses | Already the web framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| InMemoryRedis | (in-tree) | Test double for Redis | All unit/integration tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sorted set sliding window | Token bucket | Sorted set already implemented and tested in codebase; no reason to change |
| Per-key Redis lookup | Lua script | Lua script is more atomic but existing pipeline approach works fine at this scale |

**Installation:** No new packages needed. Everything is already in the dependency tree.

## Architecture Patterns

### Existing Code to Reuse (DO NOT REBUILD)

```
backend/src/app/
  middleware/
    a2a_auth.py          # check_a2a_rate_limit() STUB -- implement here
    rate_limit.py         # Reference for 429 response pattern
  services/
    rate_limit_service.py # RateLimitService -- reuse directly
  db/
    redis.py              # InMemoryRedis for tests
  api/v1/
    agent_api_keys.py     # rate_limit_rpm field (1-10000, default 100)
```

### Pattern 1: Wire Existing Service into Existing Stub
**What:** The `check_a2a_rate_limit()` function in `a2a_auth.py` is already a stub. Implement it by calling `RateLimitService.check_rate_limit()` with a `RateLimitConfig` built from the key's `rate_limit_rpm`.
**When to use:** This is THE pattern for RATE-01 and RATE-02.
**Example:**
```python
# In a2a_auth.py -- replace the stub
async def check_a2a_rate_limit(context: A2AContext, endpoint: str) -> None:
    if not context.is_agent_call:
        return  # Service-to-service calls are trusted

    # Fetch rate_limit_rpm from A2AContext (needs to be added during validate_api_key)
    rate_limit_rpm = context.rate_limit_rpm  # New field on A2AContext

    # Build per-key config
    config = RateLimitConfig(requests=rate_limit_rpm, window_seconds=60)

    # Check using existing service
    service = RateLimitService()
    result = await service.check_rate_limit(
        identifier=f"a2a:{context.api_key_id}",
        limit_type=RateLimitType.API,  # or add A2A type
        custom_config=config,
    )

    if not result.allowed:
        if settings.a2a_rate_limit_mode == "log_only":
            logger.warning("A2A rate limit WOULD block", extra={...})
            return
        raise HTTPException(
            status_code=429,
            detail={"error": "rate_limit_exceeded", "retry_after": result.retry_after},
            headers={"Retry-After": str(result.retry_after)},
        )
```

### Pattern 2: Log-Only Mode Toggle
**What:** Add an environment variable / settings field that controls whether rate limiting enforces (returns 429) or just logs.
**When to use:** RATE-04 -- safe rollout.
**Example:**
```python
# In settings (app/config/settings.py)
a2a_rate_limit_mode: str = "log_only"  # "log_only" or "enforcing"
```

### Pattern 3: Add rate_limit_rpm to A2AContext
**What:** The `validate_api_key()` function already queries `rate_limit_rpm` from the database but does NOT store it on `A2AContext`. Add the field.
**When to use:** Required for RATE-02 -- the rate limit RPM must travel with the authentication context.
**Example:**
```python
@dataclass
class A2AContext:
    # ... existing fields ...
    rate_limit_rpm: int | None = None  # From agent_api_keys table

# In validate_api_key():
return A2AContext(
    # ... existing fields ...
    rate_limit_rpm=row["rate_limit_rpm"],  # Already fetched from DB
)
```

### Anti-Patterns to Avoid
- **Building a new rate limiter:** The sorted set sliding window in `RateLimitService` already works. Do not create a second implementation.
- **Using a simple counter (INCR/EXPIRE):** This creates a fixed window with burst-at-boundary problems. The sorted set approach is already in place and correct.
- **Checking rate limit after processing the request:** Always check before dispatching to the endpoint handler.
- **Storing rate limit mode in the database:** Use environment variable. It is a deployment concern, not a data concern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sliding window rate limiting | New Redis Lua script or counter | `RateLimitService.check_rate_limit()` with `custom_config` | Already tested, handles edge cases (Redis down = allow, accurate retry_after) |
| 429 response formatting | Custom response builder | Follow pattern from `RateLimitMiddleware.dispatch()` | Consistent headers, CORS handling |
| Redis connection management | Direct redis.asyncio calls | `get_redis_client()` from `app.db.redis` | Connection pooling, health checks already configured |
| Test Redis | Mock/patch | `InMemoryRedis` from `app.db.redis` | Already supports sorted sets, pipelines, expiry |

**Key insight:** This is a wiring task, not a building task. Every component exists; they just need to be connected.

## Common Pitfalls

### Pitfall 1: Race Condition Between Auth and Rate Limit
**What goes wrong:** Rate limit check happens before auth, wasting Redis calls on invalid keys. Or auth happens but rate limit is never checked.
**Why it happens:** Unclear middleware ordering.
**How to avoid:** Rate limit check MUST happen AFTER `validate_api_key()` succeeds (inside `check_a2a_rate_limit()`), using the authenticated `A2AContext`. The stub is already positioned correctly -- it is called by endpoint code after auth.
**Warning signs:** Rate limit keys appearing for invalid API keys.

### Pitfall 2: Forgetting to Add rate_limit_rpm to A2AContext
**What goes wrong:** `validate_api_key()` already fetches the column but discards it. Without adding it to `A2AContext`, the rate limiter has no way to know the per-key limit.
**Why it happens:** The field was not needed before Phase 4.
**How to avoid:** Add `rate_limit_rpm: int | None = None` to the `A2AContext` dataclass and populate it in `validate_api_key()`.
**Warning signs:** All keys getting the same rate limit regardless of their configured RPM.

### Pitfall 3: Redis Key Namespace Collision
**What goes wrong:** A2A rate limit keys collide with existing IP/user rate limit keys.
**Why it happens:** Using the same key prefix pattern.
**How to avoid:** Use a distinct identifier prefix like `a2a:{api_key_id}` instead of `ip:` or `user:`. The existing `_rate_limit_key()` function formats as `ratelimit:{type}:{identifier}`, so using `a2a:{key_id}` as the identifier is sufficient.
**Warning signs:** Rate limits appearing to be shared across different API keys.

### Pitfall 4: Log-Only Mode That Silently Fails
**What goes wrong:** Log-only mode is set but no logs are emitted, making it impossible to validate limits before enforcement.
**Why it happens:** Forgetting structured logging fields.
**How to avoid:** Log with full context: `api_key_id`, `workspace_id`, `rate_limit_rpm`, `current_count`, `would_block=True`. Use WARNING level so it appears in default log output.
**Warning signs:** Switching to enforcing mode with no data on what would have been blocked.

### Pitfall 5: Not Handling Redis Unavailability
**What goes wrong:** Redis goes down and all A2A requests fail.
**Why it happens:** Not handling the `RuntimeError` from `get_redis_client()`.
**How to avoid:** The existing `RateLimitService.check_rate_limit()` already handles this -- returns `allowed=True` when Redis is unavailable. Make sure to use it, not a custom implementation.
**Warning signs:** 500 errors when Redis is temporarily unreachable.

## Code Examples

### Existing Sliding Window Implementation (reference -- DO NOT REBUILD)
```python
# Source: backend/src/app/services/rate_limit_service.py lines 127-224
# RateLimitService.check_rate_limit() already:
# 1. Removes expired entries: pipe.zremrangebyscore(key, 0, window_start)
# 2. Counts current: pipe.zcard(key)
# 3. Adds new entry: pipe.zadd(key, {f"{now}": now})
# 4. Sets TTL: pipe.expire(key, window_seconds)
# 5. Returns RateLimitResult with allowed, remaining, retry_after
# 6. Handles Redis unavailability gracefully (returns allowed=True)
```

### Existing 429 Response Pattern (reference)
```python
# Source: backend/src/app/middleware/rate_limit.py lines 126-164
# Response includes:
# - Status 429
# - JSON body: {"error": "rate_limit_exceeded", "message": "...", "retry_after": N}
# - Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After
# - CORS headers (if origin present)
```

### How check_a2a_rate_limit Is Currently Called
```python
# Source: backend/src/app/middleware/a2a_auth.py lines 430-464
# The stub exists and is ready to be implemented.
# Callers would use it as a FastAPI dependency or call it directly:
#   await check_a2a_rate_limit(context, endpoint="/galleries")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed window (INCR/EXPIRE) | Sliding window (sorted sets) | Already in codebase | More accurate, no burst-at-boundary |
| Global rate limits | Per-key configurable RPM | Already in DB schema | Keys can have 1-10000 RPM |
| Hard enforcement only | Log-only mode first | Phase 4 adds this | Safe rollout, soak testing |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (already configured) |
| Config file | backend/pytest.ini or pyproject.toml |
| Quick run command | `docker exec rawdrive-backend pytest tests/unit/test_a2a_rate_limit.py -x` |
| Full suite command | `docker exec rawdrive-backend pytest tests/ -x` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RATE-01 | Sliding window blocks after N requests in 60s | unit | `docker exec rawdrive-backend pytest tests/unit/test_a2a_rate_limit.py::test_sliding_window_blocks -x` | Wave 0 |
| RATE-02 | Per-key RPM from agent_api_keys.rate_limit_rpm | unit | `docker exec rawdrive-backend pytest tests/unit/test_a2a_rate_limit.py::test_per_key_rpm -x` | Wave 0 |
| RATE-03 | 429 response with Retry-After header | unit | `docker exec rawdrive-backend pytest tests/unit/test_a2a_rate_limit.py::test_429_retry_after -x` | Wave 0 |
| RATE-04 | Log-only mode allows request but logs warning | unit | `docker exec rawdrive-backend pytest tests/unit/test_a2a_rate_limit.py::test_log_only_mode -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `docker exec rawdrive-backend pytest tests/unit/test_a2a_rate_limit.py -x`
- **Per wave merge:** `docker exec rawdrive-backend pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_a2a_rate_limit.py` -- covers RATE-01 through RATE-04
- [ ] No new framework or fixtures needed -- `InMemoryRedis` is already available in `app.db.redis`

## Open Questions

1. **Where should check_a2a_rate_limit be called -- dependency injection or middleware?**
   - What we know: The stub is a standalone async function, not a middleware. Existing pattern is to call it from endpoint code or as a dependency.
   - What's unclear: Whether it should be wired as a FastAPI dependency (automatic on all A2A routes) or called explicitly in each endpoint.
   - Recommendation: Use it as a FastAPI dependency that wraps `get_a2a_context`. This ensures it is always called after successful auth and cannot be forgotten. Alternatively, add the check inside `get_a2a_context()` itself after validation succeeds.

2. **Should a new RateLimitType.A2A be added or reuse API?**
   - What we know: The `custom_config` parameter overrides the default config regardless of type. The type only affects the Redis key prefix.
   - Recommendation: Add `A2A = "a2a"` to `RateLimitType` for clear key namespacing. This is a one-line addition.

## Sources

### Primary (HIGH confidence)
- `backend/src/app/services/rate_limit_service.py` -- Full sliding window implementation, RateLimitConfig, RateLimitResult
- `backend/src/app/middleware/a2a_auth.py` -- A2AContext dataclass, validate_api_key(), check_a2a_rate_limit() stub
- `backend/src/app/middleware/rate_limit.py` -- 429 response pattern with headers
- `backend/src/app/api/v1/agent_api_keys.py` -- rate_limit_rpm field (1-10000, default 100)
- `backend/src/app/db/redis.py` -- InMemoryRedis test double with sorted set support

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- existing code provides clear wiring points; stub function marks exact implementation location
- Pitfalls: HIGH -- derived from direct code analysis of existing patterns

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- infrastructure code, no external dependencies)
