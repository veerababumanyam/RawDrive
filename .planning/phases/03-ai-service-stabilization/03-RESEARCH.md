# Phase 3: AI Service Stabilization - Research

**Researched:** 2026-03-18
**Domain:** Python/FastAPI service stabilization, lazy imports, Docker health checks
**Confidence:** HIGH

## Summary

The ai-processing-service crash-loop has multiple root causes, all identified through direct code inspection. The primary issues are: (1) heavy ML library imports (torch, transformers, insightface, cv2) happening at module import time which fail or OOM before the service can start, (2) missing health check functions that cause ImportError at runtime, (3) health check endpoints using wrong paths (`/health` and `/ready` instead of `/health/live` and `/health/ready`), and (4) hard `sys.exit(1)` calls on DB/Redis connection failure instead of graceful degradation.

The fix is surgical: make all ML imports lazy (deferred to first use), add missing health check functions, fix endpoint paths, make Milvus fully optional with pgvector as the default, and remove hard exits from the lifespan manager.

**Primary recommendation:** Fix the six concrete bugs identified below -- no new libraries or architectural changes needed, just defensive coding and lazy imports.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices at Claude's discretion for this stabilization phase.

### Claude's Discretion
All implementation choices are at Claude's discretion -- pure infrastructure/stabilization phase. Specific targets:
- AIS-01: ai-processing-service container must start and /health/live returns 200
- AIS-02: Milvus dependency resolved -- either fix health check or make optional with pgvector fallback
- AIS-03: Heavy ML imports (InsightFace, Real-ESRGAN) made lazy-loading to prevent startup crashes

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIS-01 | ai-processing-service container starts and passes health checks | Six bugs identified: wrong endpoint paths, missing healthcheck functions, sys.exit in lifespan, eager ML imports. Fixes documented in Architecture Patterns. |
| AIS-02 | Milvus dependency resolved -- optional with pgvector fallback | Milvus already has try/except in lifespan but pymilvus imported eagerly via database.py. Config default MILVUS_ENABLED=True must flip to False. Lazy import needed in database.py. |
| AIS-03 | Heavy ML imports made lazy-loading | All six ML modules identified with their eager top-level imports. Lazy import pattern documented with code examples. |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase fixes existing code only.

### Core (already in requirements.txt)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| fastapi | 0.115.5 | Web framework | Already installed |
| uvicorn | 0.32.1 | ASGI server | Already installed |
| asyncpg | 0.30.0 | PostgreSQL driver | Already installed |
| redis | 5.2.1 | Redis client | Already installed |

### ML Libraries (already installed, need lazy loading)
| Library | Version | Issue | Fix |
|---------|---------|-------|-----|
| torch | 2.5.1 | ~2GB import, imported at module level in 4 files | Lazy import |
| transformers | 4.47.1 | Imported at module level in clip_embedder.py | Lazy import |
| insightface | 0.7.3 | Imported inside _ensure_initialized (already lazy) | OK as-is |
| opencv-python-headless | 4.10.0.84 | Imported at module level in 3 files | Lazy import |
| pymilvus | 2.3.4 | Imported at module level in milvus_service.py, pulled in by database.py | Lazy import |

### Requirements.txt Issues to Fix
| Issue | Line | Fix |
|-------|------|-----|
| Duplicate httpx entry | Lines 50 and 72 | Remove duplicate |
| onnxruntime AND onnxruntime-gpu conflict | Lines 33-34 | Keep only onnxruntime (CPU); GPU variant is optional |

## Architecture Patterns

### Bug 1: Wrong Health Check Endpoint Paths
**File:** `services/ai-processing-service/src/main.py`
**What:** Endpoints are `/health` and `/ready` but project standard (CLAUDE.md, gallery-service reference) requires `/health/live` and `/health/ready`
**Fix:** Rename routes to match project convention

### Bug 2: Missing `database_healthcheck` and `redis_healthcheck` Functions
**File:** `services/ai-processing-service/src/main.py` lines 224, 232
**What:** Readiness endpoint imports `database_healthcheck` from `core.database` and `redis_healthcheck` from `core.redis` -- neither function exists
**Fix:** Add these functions to their respective modules

### Bug 3: Hard `sys.exit(1)` in Lifespan on DB/Redis Failure
**File:** `services/ai-processing-service/src/main.py` lines 60, 70
**What:** If DB or Redis connection fails at startup, `sys.exit(1)` kills the process before health endpoints are even available, causing Docker restart loop
**Fix:** Log error, set a `_startup_healthy` flag to False, let the service start but return 503 on readiness. Liveness should still return 200 (process is alive, just not ready).

### Bug 4: Eager ML Imports at Module Level
**Files with eager heavy imports:**
- `models/clip_embedder.py` -- `import torch`, `from transformers import CLIPModel, CLIPProcessor`, `import numpy`, `from PIL import Image`
- `models/real_esrgan.py` -- `import cv2`, `import torch`, `import numpy`, `from PIL import Image`
- `services/face_detection_service.py` -- `import cv2`, `import torch`, `import numpy`, `from PIL import Image`
- `services/face_embedding_service.py` -- `import cv2`, `import torch`, `import numpy`, `from PIL import Image`

**Impact:** When `main.py` imports `get_clip_embedder` (line 24) or the API router (line 318), it triggers a cascade of heavy imports. torch alone is ~2GB in memory and takes seconds to import. If the container has limited memory, this causes OOM crash before the server even starts.
**Fix:** Move all heavy imports inside methods/functions, not at module top level.

### Bug 5: `database.py` Eagerly Imports `milvus_service`
**File:** `services/ai-processing-service/src/core/database.py` line 15
**What:** `from services.milvus_service import get_milvus_service` at top level means `pymilvus` is always imported even when MILVUS_ENABLED=False
**Fix:** Move milvus import inside the methods that use it (`store_embeddings`, `find_similar_by_clip`)

### Bug 6: MILVUS_ENABLED Defaults to True
**File:** `services/ai-processing-service/src/config.py` line 70
**What:** `MILVUS_ENABLED: bool = Field(default=True)` means Milvus connection is attempted by default
**Fix:** Change default to `False`. Environments that have Milvus set `MILVUS_ENABLED=true` explicitly.

### Recommended Fix Order
1. Fix health endpoint paths (`/health/live`, `/health/ready`) -- unblocks Docker health check
2. Remove `sys.exit(1)` from lifespan -- unblocks container startup on infra failures
3. Add missing `database_healthcheck` / `redis_healthcheck` functions
4. Make all ML imports lazy in the four files
5. Make milvus import lazy in `database.py`
6. Flip `MILVUS_ENABLED` default to `False`
7. Clean up `requirements.txt` (duplicate httpx, onnxruntime conflict)

### Pattern: Lazy Import for Heavy ML Libraries
**What:** Defer `import torch`, `import cv2`, `from transformers import ...` to first use
**When to use:** Any module that imports ML libraries but is itself imported at startup

```python
# BEFORE (causes crash at import time):
import torch
import numpy as np
from transformers import CLIPModel, CLIPProcessor

class CLIPEmbedder:
    def embed_image(self, path):
        # uses torch, numpy, CLIPModel...

# AFTER (deferred to first use):
class CLIPEmbedder:
    def _ensure_initialized(self):
        import torch
        import numpy as np
        from transformers import CLIPModel, CLIPProcessor
        # ... load model
```

### Pattern: Resilient Lifespan (No Hard Exit)
```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    startup_errors = []

    # Database -- required but don't exit
    try:
        from core.database import init_database
        await init_database()
    except Exception as e:
        logger.error(f"Database init failed: {e}")
        startup_errors.append("database")

    # Redis -- required but don't exit
    try:
        from core.redis import init_redis
        await init_redis()
    except Exception as e:
        logger.error(f"Redis init failed: {e}")
        startup_errors.append("redis")

    # Store startup state for health checks
    app.state.startup_errors = startup_errors
    app.state.startup_complete = True

    yield

    # ... shutdown
```

### Pattern: Health Endpoints (Project Standard)
```python
@app.get("/health/live", status_code=200)
async def liveness():
    """Liveness: is the process running? Always 200 if reachable."""
    return {"status": "alive", "service": "ai-processing-service"}

@app.get("/health/ready", status_code=200)
async def readiness(response: Response):
    """Readiness: can we handle requests?"""
    checks = {"database": False, "redis": False}

    try:
        from core.database import database_healthcheck
        checks["database"] = await database_healthcheck(timeout=2.0)
    except Exception:
        pass

    try:
        from core.redis import redis_healthcheck
        checks["redis"] = await redis_healthcheck(timeout=2.0)
    except Exception:
        pass

    all_ok = all(checks.values())
    if not all_ok:
        response.status_code = 503

    return {
        "status": "ready" if all_ok else "not_ready",
        "checks": checks,
    }
```

### Anti-Patterns to Avoid
- **`sys.exit()` in async lifespan:** Kills process before health endpoints register. Docker restarts immediately, creating crash-loop.
- **Top-level `import torch`:** 2GB+ memory allocation at import time. If container memory limit is 1-2GB, OOM before server starts.
- **Importing Milvus unconditionally:** pymilvus tries to connect on import in some versions. Always guard with lazy import.
- **Mixed onnxruntime/onnxruntime-gpu:** Both can't be installed simultaneously. Pick one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Health check pattern | Custom health logic | Follow gallery-service pattern exactly | Consistency across services |
| Lazy import mechanism | Complex import proxy | Simple `import X` inside method body | Python handles this natively; no framework needed |
| pgvector fallback | Custom vector search adapter | Already implemented in `database.py` `find_similar_by_clip` | pgvector fallback code already exists (lines 294-323) |

## Common Pitfalls

### Pitfall 1: Forgetting to Remove Unused Top-Level Import
**What goes wrong:** You add lazy import inside method but leave the top-level `import torch` -- Python still executes it at module load time.
**Why it happens:** Easy to miss when refactoring.
**How to avoid:** After making imports lazy, verify no heavy imports remain at module top level. Search for `^import torch|^import cv2|^from transformers|^import numpy|^from PIL`.
**Warning signs:** Container still crashes on startup after "fixing" lazy imports.

### Pitfall 2: Circular Import When Moving Imports
**What goes wrong:** Moving an import from top-level to inside a method can sometimes trigger circular imports if the imported module also imports from the current module.
**Why it happens:** Python's import system resolves top-level imports during initial module load.
**How to avoid:** The current codebase doesn't have circular dependencies between these modules, but test imports after changes.

### Pitfall 3: Docker HEALTHCHECK Path Mismatch
**What goes wrong:** Dockerfile has `HEALTHCHECK ... CMD curl -f http://localhost:${PORT:-8012}/health` but we're renaming to `/health/live`.
**Why it happens:** Dockerfile and application code updated separately.
**How to avoid:** Update Dockerfile HEALTHCHECK path to `/health/live` in same commit.

### Pitfall 4: Readiness Returning 503 Blocks All Traffic
**What goes wrong:** If readiness check is too strict, service never becomes "ready" in Docker/K8s and gets no traffic.
**Why it happens:** Checking non-essential dependencies (Milvus, Kafka) in readiness.
**How to avoid:** Readiness should only check DB and Redis. Milvus/Kafka are optional -- check them in a `/health/detailed` endpoint if needed, not in readiness.

### Pitfall 5: `main.py` Line 24 Import Still Triggers Full torch Load
**What goes wrong:** `from models.clip_embedder import get_clip_embedder` at top of main.py will load clip_embedder.py module, which imports torch.
**Fix:** Either (a) make this import lazy (inside lifespan or endpoint handler), or (b) make clip_embedder.py itself lazy-import torch.
**Best approach:** Both -- remove unused top-level import in main.py AND make clip_embedder.py lazy.

## Code Examples

### Adding `database_healthcheck` to `core/database.py`
```python
async def database_healthcheck(timeout: float = 2.0) -> bool:
    """Check database connectivity for readiness probe."""
    global _database
    if _database is None or not _database._initialized or not _database.pool:
        return False
    try:
        async with _database.pool.acquire(timeout=timeout) as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:
        return False
```

### Adding `redis_healthcheck` to `core/redis.py`
```python
async def redis_healthcheck(timeout: float = 2.0) -> bool:
    """Check Redis connectivity for readiness probe."""
    global _redis_client
    if _redis_client is None or not _redis_client._initialized or not _redis_client.client:
        return False
    try:
        await _redis_client.client.ping()
        return True
    except Exception:
        return False
```

### Making `clip_embedder.py` Lazy
```python
# At top of file -- NO heavy imports
import logging
from pathlib import Path
from typing import TYPE_CHECKING, List, Optional, Union

if TYPE_CHECKING:
    import numpy as np
    import torch
    from transformers import CLIPModel, CLIPProcessor

from config import get_settings

logger = logging.getLogger(__name__)


class CLIPEmbedder:
    def __init__(self):
        self.settings = get_settings()
        self.model = None
        self.processor = None
        self._device = None
        self._initialized = False

    @property
    def device(self) -> str:
        if self._device is None:
            import torch
            if torch.cuda.is_available():
                self._device = "cuda"
            elif torch.backends.mps.is_available():
                self._device = "mps"
            else:
                self._device = "cpu"
        return self._device

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        import torch
        import numpy as np
        from transformers import CLIPModel, CLIPProcessor
        # ... rest of initialization
```

### Updating Dockerfile HEALTHCHECK
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD curl -f http://localhost:${PORT:-8012}/health/live || exit 1
```
Note: `start-period` increased from 10s to 30s to allow time for Python startup without heavy ML imports blocking it.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Eager import all ML libs | Lazy import at first use | Best practice since transformers 4.x | 10-100x faster startup, lower base memory |
| `sys.exit()` on startup failure | Graceful degradation with health checks | K8s/Docker standard | No crash-loop, proper observability |
| Single `/health` endpoint | Split `/health/live` and `/health/ready` | K8s liveness/readiness pattern | Proper container orchestration |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.3.4 + pytest-asyncio 0.25.2 |
| Config file | None -- needs creation (Wave 0) |
| Quick run command | `docker exec rawdrive-ai-processing pytest tests/ -x --timeout=30` |
| Full suite command | `docker exec rawdrive-ai-processing pytest tests/ -v` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIS-01 | /health/live returns 200 | integration | `docker exec rawdrive-ai-processing pytest tests/test_health.py::test_liveness -x` | No -- Wave 0 |
| AIS-01 | /health/ready returns 200 when DB+Redis up | integration | `docker exec rawdrive-ai-processing pytest tests/test_health.py::test_readiness -x` | No -- Wave 0 |
| AIS-01 | Container starts without crash | smoke | `docker compose up ai-processing-service -d && sleep 10 && docker inspect --format='{{.State.Status}}' rawdrive-ai-processing` | Manual |
| AIS-02 | Service starts with MILVUS_ENABLED=false | integration | `docker exec rawdrive-ai-processing pytest tests/test_health.py::test_no_milvus -x` | No -- Wave 0 |
| AIS-02 | pgvector fallback works when Milvus disabled | unit | `docker exec rawdrive-ai-processing pytest tests/test_database.py::test_pgvector_fallback -x` | No -- Wave 0 |
| AIS-03 | No heavy imports at module load time | unit | `docker exec rawdrive-ai-processing pytest tests/test_lazy_imports.py -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `docker exec rawdrive-ai-processing pytest tests/ -x --timeout=30`
- **Per wave merge:** Full suite
- **Phase gate:** Container running + health checks passing + all tests green

### Wave 0 Gaps
- [ ] `tests/test_health.py` -- covers AIS-01 (health endpoints return correct status codes)
- [ ] `tests/test_lazy_imports.py` -- covers AIS-03 (verify no torch/cv2/transformers at import time)
- [ ] `tests/test_database.py` -- covers AIS-02 (pgvector fallback when Milvus disabled)
- [ ] `tests/conftest.py` -- shared fixtures (test client, mock DB/Redis)
- [ ] `pytest.ini` or `pyproject.toml` -- pytest configuration

## Open Questions

1. **Container memory limit**
   - What we know: torch alone needs ~2GB. Container may have lower limit in docker-compose.
   - What's unclear: Actual memory limit set for ai-processing-service container.
   - Recommendation: After lazy imports, verify container starts. If still OOM, check docker-compose memory limits and consider CPU-only torch (`torch-cpu`) which is much smaller.

2. **onnxruntime vs onnxruntime-gpu**
   - What we know: Both listed in requirements.txt. They conflict when installed together.
   - What's unclear: Whether GPU inference is needed in dev/staging.
   - Recommendation: Keep only `onnxruntime` (CPU). GPU variant should only be in a separate GPU-specific requirements file or Dockerfile.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `services/ai-processing-service/src/` -- all 23 Python files reviewed
- `services/gallery-service/src/main.py` -- reference health check pattern (lines 295-310)
- `infrastructure/docker/docker-compose.yml` -- container configuration (lines 1283-1297)
- `CLAUDE.md` -- project conventions for health endpoints and service patterns

### Secondary (MEDIUM confidence)
- Python lazy import pattern is standard Python practice (no external source needed)
- FastAPI lifespan pattern from FastAPI official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, all fixes in existing code
- Architecture: HIGH -- all bugs identified through direct code reading, fixes are straightforward
- Pitfalls: HIGH -- each pitfall tied to specific lines of code in the codebase

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- no external dependency changes expected)
