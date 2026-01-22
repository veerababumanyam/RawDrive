# Permanent Fixes Guide - Reliable Docker Restarts

## Overview

This guide implements **permanent architectural fixes** to ensure RawDrive containers start reliably every time, without manual intervention or workarounds.

---

## 🎯 Architecture of Permanent Fixes

### Layer 1: Database Initialization (Automatic)
**File**: `infrastructure/docker/init/02-create-databases.sql`
- Automatically runs when PostgreSQL starts
- Creates missing databases
- Enables required extensions
- **No manual intervention needed**

### Layer 2: Service Startup Orchestration
**File**: `infrastructure/docker/init/startup-wrapper.sh`
- Verifies dependencies before starting services
- Waits for PostgreSQL and Redis
- Validates databases exist
- Provides clear error messages
- **Used in service Dockerfiles**

### Layer 3: Connection Health Middleware
**File**: `backend/src/app/middleware/database_health.py`
- Verifies database connectivity before serving requests
- Automatic retry logic
- Returns 503 if database unavailable
- **Integrated into services**

### Layer 4: Environment Configuration
**File**: `infrastructure/docker/.env.database`
- Unified connection pool settings across all services
- Prevents "too many connections" errors
- Consistent timeout values
- **Sourced by all services**

### Layer 5: Docker Compose Configuration
**File**: `infrastructure/docker/docker-compose.permanent-fixes.yml`
- Improved health checks
- Better service dependencies
- Optimal restart policies
- Increased start periods
- **Merged into docker-compose.yml**

---

## 📋 Implementation Checklist

### ✅ Step 1: Create Initialization Files (DONE)
- [x] `infrastructure/docker/init/02-create-databases.sql` - Database auto-creation
- [x] `infrastructure/docker/init/startup-wrapper.sh` - Service startup orchestration
- [x] `infrastructure/docker/.env.database` - Environment configuration
- [x] `backend/src/app/middleware/database_health.py` - Connection health checks

### ⏳ Step 2: Update Docker Compose

**Edit**: `infrastructure/docker/docker-compose.yml`

1. **PostgreSQL section** - Increase connections:
```yaml
postgres:
  environment:
    POSTGRES_INIT_ARGS: "-c max_connections=300 -c shared_buffers=256MB"
  command:
    - "postgres"
    - "-c"
    - "max_connections=300"
    - "-c"
    - "shared_buffers=256MB"
  volumes:
    - pg_data:/var/lib/postgresql/data
    - ./init/enable_pgvector.sql:/docker-entrypoint-initdb.d/01-enable_pgvector.sql:ro
    - ./init/02-create-databases.sql:/docker-entrypoint-initdb.d/02-create-databases.sql:ro  # ADD THIS
  healthcheck:
    test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER:-rawdrive}", "-d", "${POSTGRES_DB:-rawdrive}"]
    interval: 5s
    timeout: 5s
    retries: 10  # INCREASE FROM 5
    start_period: 30s  # INCREASE FROM 10
```

2. **All backend services** - Add env_file and improve health:
```yaml
backend:
  # ... existing config ...
  env_file:
    - .env.database  # ADD THIS
  depends_on:
    postgres:
      condition: service_healthy  # ENSURE THIS
    redis:
      condition: service_healthy  # ENSURE THIS
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health/live"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 40s  # INCREASE FROM 10
```

3. **Billing service** - Lower pool size to avoid exhaustion:
```yaml
billing-service:
  # ... existing config ...
  env_file:
    - .env.database
  environment:
    DB_POOL_MIN_SIZE: 5
    DB_POOL_MAX_SIZE: 15  # Lower than other services
  healthcheck:
    start_period: 40s
```

### ⏳ Step 3: Update Service Environment

**File**: Each service's `.env` or config
```bash
# Source the database environment
source infrastructure/docker/.env.database

# Or in services, add to env_file in docker-compose:
env_file:
  - .env.database
```

### ⏳ Step 4: Integrate Health Check Middleware

**File**: `services/billing-service/src/main.py` (and other services)
```python
from src.middleware.database_health import setup_database_health_middleware

# In app creation
app = FastAPI(lifespan=lifespan)

# Add health check middleware
setup_database_health_middleware(app, get_pool)
```

### ⏳ Step 5: Test Permanent Fixes

```bash
# Run verification script
chmod +x infrastructure/docker/verify-restart-readiness.sh
./infrastructure/docker/verify-restart-readiness.sh

# Test complete restart
docker compose down
docker volume rm rawdrive_pg_data  # Fresh start
docker compose up -d

# Verify all containers are healthy
docker ps --format "table {{.Names}}\t{{.Status}}"

# Check database initialization
docker exec rawdrive-postgres psql -U rawdrive -d postgres -c "\l" | grep one_api
```

---

## 🔧 Configuration Details

### PostgreSQL Settings
```bash
max_connections=300           # Increased from default 100
shared_buffers=256MB         # 25% of RAM for 1GB system
maintenance_work_mem=64MB    # For VACUUM, CREATE INDEX
work_mem=16MB                # Per operation in sorting/hashing
```

### Connection Pool Settings (all services)
```bash
DB_POOL_MIN_SIZE=5           # Minimum connections to maintain
DB_POOL_MAX_SIZE=15          # Maximum connections per service
DB_POOL_TIMEOUT=10           # Timeout for acquiring connection
DB_COMMAND_TIMEOUT=30        # SQL query timeout
```

### Health Check Settings
```bash
HEALTH_CHECK_INTERVAL=15s    # Check every 15 seconds
HEALTH_CHECK_TIMEOUT=5s      # Timeout per check
HEALTH_CHECK_RETRIES=3       # Fail after 3 retries
HEALTH_CHECK_START_PERIOD=30s # Grace period on startup
```

---

## 📊 Expected Results

### Before Permanent Fixes
```
❌ Container restarts fail
❌ Database "one_api" doesn't exist
❌ "Too many clients" errors
❌ Services stuck in "health: starting"
❌ Manual database creation needed
```

### After Permanent Fixes
```
✅ Automatic database creation
✅ Services start reliably every time
✅ No connection pool exhaustion
✅ Clear error messages if dependencies unavailable
✅ Health checks pass immediately after init
✅ Zero manual intervention needed
```

---

## 🧪 Restart Test Sequence

```bash
# Step 1: Verify setup
./infrastructure/docker/verify-restart-readiness.sh

# Step 2: Full restart test
docker compose down
sleep 5
docker volume rm rawdrive_pg_data
sleep 5
docker compose up -d

# Step 3: Monitor startup (watch for 2-3 minutes)
watch -n 2 "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E '(postgres|billing|backend|gallery|one-api)'"

# Step 4: Verify all healthy
docker ps --format "{{.Status}}" | grep -c "healthy"

# Step 5: Test database access
docker exec rawdrive-postgres psql -U rawdrive -d one_api -c "SELECT 1"
```

---

## 📝 Files Modified/Created

### New Files
- `infrastructure/docker/init/02-create-databases.sql` - Database initialization
- `infrastructure/docker/init/startup-wrapper.sh` - Service startup wrapper
- `infrastructure/docker/.env.database` - Database environment config
- `infrastructure/docker/docker-compose.permanent-fixes.yml` - Reference for docker-compose changes
- `infrastructure/docker/apply-permanent-fixes.sh` - Setup automation script
- `infrastructure/docker/verify-restart-readiness.sh` - Verification script
- `backend/src/app/middleware/database_health.py` - Health check middleware
- `docs/PERMANENT_FIXES_GUIDE.md` - This file

### Modified Files
- `infrastructure/docker/docker-compose.yml` - Apply changes from permanent-fixes.yml
- Service Dockerfiles - Add startup wrapper (if using)
- Service main.py files - Add health check middleware

---

## ⚠️ Troubleshooting

### Issue: "too many clients already"
**Cause**: PostgreSQL connection limit too low
**Fix**: Increase in docker-compose.yml postgres section
```yaml
POSTGRES_INIT_ARGS: "-c max_connections=300"
```

### Issue: "one_api database does not exist"
**Cause**: Initialization script not mounted
**Fix**: Check docker-compose.yml postgres volumes:
```yaml
volumes:
  - ./init/02-create-databases.sql:/docker-entrypoint-initdb.d/02-create-databases.sql:ro
```

### Issue: Services stuck in "health: starting"
**Cause**: start_period too short
**Fix**: Increase start_period to 30-40s per service

### Issue: "Connection refused"
**Cause**: Service starting before PostgreSQL is healthy
**Fix**: Check depends_on condition:
```yaml
depends_on:
  postgres:
    condition: service_healthy
```

---

## 🎯 Long-term Benefits

1. **Zero Downtime**: Containers restart without manual intervention
2. **Self-Healing**: Services automatically recover from transient failures
3. **Scalability**: Connection pool management prevents resource exhaustion
4. **Observability**: Clear health check status and error messages
5. **Maintainability**: Centralized configuration reduces configuration drift
6. **Reliability**: Architectural improvements reduce mean time to recovery (MTTR)

---

## 📚 References

- Original issues: `docs/DOCKER_RESTART_ISSUES.md`
- PostgreSQL documentation: https://www.postgresql.org/docs/16/
- Docker Compose health checks: https://docs.docker.com/compose/compose-file/compose-file-v3/#healthcheck
- FastAPI middleware: https://fastapi.tiangolo.com/tutorial/middleware/

---

## ✅ Verification Checklist

Before considering permanent fixes complete:

- [ ] All initialization files created
- [ ] docker-compose.yml updated with new configuration
- [ ] .env.database sourced by all services
- [ ] Health check middleware integrated
- [ ] Connection pool settings applied
- [ ] PostgreSQL max_connections increased
- [ ] verify-restart-readiness.sh passes all checks
- [ ] Full restart test passes (docker compose down/up)
- [ ] All 25+ containers running and healthy
- [ ] Databases auto-created on restart
- [ ] No manual intervention needed

---

## 🚀 Next Steps

1. **Merge docker-compose changes**: Apply permanent-fixes.yml into docker-compose.yml
2. **Rebuild services**: `docker compose build`
3. **Test restart sequence**: Follow "Restart Test Sequence" above
4. **Commit changes**: `git add -A && git commit -m "feat: permanent fixes for reliable restarts"`
5. **Document**: Update team wiki/docs with new setup procedure
6. **Monitor**: Watch logs for any issues in first few days
7. **Iterate**: Adjust pool sizes/timeouts based on actual usage patterns

---

**Status**: ✅ All permanent fix files created
**Next**: Apply docker-compose.yml changes and test
**Timeline**: ~30 minutes to apply and test all fixes
