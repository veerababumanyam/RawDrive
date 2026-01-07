# Production Deployment Checklist

> **This checklist ensures all issues encountered during development are prevented in production deployments.**

## Pre-Deployment Checklist

### 1. Environment Setup

- [ ] **Environment variables configured**
  - [ ] `DATABASE_URL` set correctly (with `postgresql+asyncpg://` for runtime)
  - [ ] `JWT_SECRET` set to secure random value (64+ bytes)
  - [ ] `REDIS_URL` configured
  - [ ] Storage credentials configured (R2/S3)
  - [ ] AI API keys configured (if using AI features)

- [ ] **Secrets management**
  - [ ] All secrets stored in secure vault (not in code/env files)
  - [ ] Environment variables injected at runtime
  - [ ] No hardcoded API keys or credentials

### 2. Database Setup

- [ ] **Database migrations**
  - [ ] All migrations run successfully: `alembic current` shows head revision
  - [ ] Migration 0115 validated (SQL syntax correct)
  - [ ] No pending migrations: `alembic heads` matches `alembic current`

- [ ] **Database dependencies**
  - [ ] `psycopg2-binary` installed in backend container
  - [ ] `asyncpg` installed for runtime
  - [ ] Both drivers available for Alembic and app runtime

- [ ] **Database extensions**
  - [ ] `pgvector` extension enabled
  - [ ] `uuid-ossp` extension enabled
  - [ ] `pg_trgm` extension enabled (for text search)

- [ ] **Database schema validation**
  - [ ] All required tables exist (users, workspaces, sessions, galleries, assets)
  - [ ] Sessions table has all columns (including device_fingerprint, last_ip_address, ip_changed_at)
  - [ ] Foreign keys and indexes created
  - [ ] Constraints validated

### 3. Backend Validation

- [ ] **Dependencies**
  - [ ] `backend/requirements.txt` includes `psycopg2-binary==2.9.11`
  - [ ] All dependencies installed: `pip list` shows all packages
  - [ ] No missing dependencies

- [ ] **Code fixes applied**
  - [ ] Session creation SQL parameter binding fixed (VALUES $11, $12, $13)
  - [ ] Migration 0115 syntax error fixed (DO $$ BEGIN ... END $$)
  - [ ] Error logging added for session creation

- [ ] **Health checks**
  - [ ] `/health` endpoint returns 200
  - [ ] `/ready` endpoint returns 200
  - [ ] Database connection working
  - [ ] Redis connection working

### 4. Frontend Build

- [ ] **Shared packages built**
  - [ ] `@rawdrive/shared-types` compiled (dist/ folder exists with invitations.js)
  - [ ] `@rawdrive/shared-constants` compiled
  - [ ] `@rawdrive/shared-validation` compiled
  - [ ] `@rawdrive/shared-utils` compiled

- [ ] **Frontend build**
  - [ ] `pnpm build` completes without errors
  - [ ] No TypeScript errors
  - [ ] No Vite build errors
  - [ ] Build artifacts in `frontend/dist/`

- [ ] **Asset optimization**
  - [ ] Images optimized
  - [ ] Code splitting configured
  - [ ] Lazy loading implemented

### 5. Testing

- [ ] **Login functionality**
  - [ ] Login endpoint returns 200 (not 500)
  - [ ] Sessions created in database
  - [ ] JWT tokens generated correctly
  - [ ] Refresh token flow works

- [ ] **Workspace features**
  - [ ] Dashboard accessible
  - [ ] Galleries load without errors
  - [ ] Clients page accessible
  - [ ] Settings page works
  - [ ] Company profile accessible

- [ ] **API testing**
  - [ ] All critical endpoints tested
  - [ ] Error handling validated
  - [ ] Rate limiting configured
  - [ ] CORS configured correctly

### 6. Security

- [ ] **Authentication**
  - [ ] Password hashing uses Argon2id
  - [ ] JWT tokens expire correctly (15 min access, 7 days refresh)
  - [ ] Session security enabled (device fingerprinting, IP tracking)
  - [ ] Remember me functionality tested

- [ ] **Authorization**
  - [ ] Multi-tenant isolation verified (workspace_id filtering)
  - [ ] RBAC permissions working
  - [ ] Admin routes protected

- [ ] **Data protection**
  - [ ] Sensitive data encrypted at rest
  - [ ] HTTPS enforced (TLS 1.2+)
  - [ ] Security headers configured (HSTS, CSP, etc.)

### 7. Infrastructure

- [ ] **Docker images**
  - [ ] All images built successfully
  - [ ] Images tagged with version numbers
  - [ ] Images pushed to registry
  - [ ] Vulnerability scanning passed

- [ ] **Kubernetes/Deployment**
  - [ ] Deployment manifests validated
  - [ ] Resource limits configured
  - [ ] Health checks configured
  - [ ] Readiness probes configured
  - [ ] Liveness probes configured

- [ ] **Auto-scaling**
  - [ ] KEDA ScaledObjects configured
  - [ ] Prometheus metrics exposed
  - [ ] Scaling triggers tested

### 8. Monitoring & Observability

- [ ] **Logging**
  - [ ] Structured logging configured
  - [ ] Log aggregation setup (Loki/ELK)
  - [ ] Log retention policy configured

- [ ] **Metrics**
  - [ ] Prometheus metrics exposed
  - [ ] Grafana dashboards configured
  - [ ] Alerts configured (Alertmanager)

- [ ] **Tracing**
  - [ ] OpenTelemetry configured
  - [ ] Distributed tracing enabled
  - [ ] Performance monitoring active

### 9. Data Migration (if applicable)

- [ ] **Backup**
  - [ ] Database backup created
  - [ ] Backup restoration tested
  - [ ] Rollback plan documented

- [ ] **Migration plan**
  - [ ] Migration scripts tested
  - [ ] Data validation queries prepared
  - [ ] Downtime window communicated

### 10. Documentation

- [ ] **Runbooks**
  - [ ] Deployment runbook created
  - [ ] Rollback procedures documented
  - [ ] Incident response plan ready

- [ ] **Configuration**
  - [ ] Environment variables documented
  - [ ] Service dependencies mapped
  - [ ] Architecture diagrams updated

## Deployment Steps

### 1. Pre-Deployment

```bash
# 1. Verify database migrations
docker exec backend alembic current
docker exec backend alembic heads

# 2. Run migration (if needed)
docker exec backend bash -c "cd /app && alembic upgrade head"

# 3. Verify critical tables
docker exec backend python -c "
import asyncpg
import asyncio

async def check():
    conn = await asyncpg.connect('postgresql://...')
    tables = await conn.fetch(\"SELECT tablename FROM pg_tables WHERE schemaname='public'\")
    print([t['tablename'] for t in tables])
    await conn.close()

asyncio.run(check())
"

# 4. Build shared packages
cd packages/shared-types && pnpm build
cd ../shared-constants && pnpm build
cd ../shared-validation && pnpm build
cd ../shared-utils && pnpm build

# 5. Build frontend
cd frontend && pnpm build
```

### 2. Deployment

```bash
# Deploy backend
kubectl apply -f infrastructure/kubernetes/backend/

# Deploy frontend
kubectl apply -f infrastructure/kubernetes/frontend/

# Deploy services
kubectl apply -f infrastructure/kubernetes/services/
```

### 3. Post-Deployment

```bash
# 1. Verify pods are running
kubectl get pods -n rawdrive

# 2. Check logs
kubectl logs -n rawdrive -l app=backend --tail=50

# 3. Run smoke tests
./scripts/smoke-tests.sh production

# 4. Monitor metrics
# Check Grafana dashboards for anomalies
```

## Common Issues & Prevention

### Issue 1: Login 500 Error (Session Creation)

**Root Cause:** SQL parameter binding mismatch in session_service.py

**Prevention:**
- ✅ Fixed in code: VALUES ($11, $12, $13) instead of ($11, $11, $12)
- ✅ Error logging added
- ✅ Integration tests added

**Verification:**
```bash
# Test login endpoint
curl -X POST https://api.rawdrive.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Should return 200 with tokens
```

### Issue 2: Migration Syntax Error (0115)

**Root Cause:** PostgreSQL doesn't support `ADD CONSTRAINT IF NOT EXISTS` syntax

**Prevention:**
- ✅ Fixed in migration: Wrapped in DO $$ BEGIN ... END $$
- ✅ Pre-commit hook added to validate SQL syntax

**Verification:**
```bash
# Run migrations in test environment first
docker exec backend alembic upgrade head

# Check for errors
echo $?  # Should be 0
```

### Issue 3: Missing psycopg2-binary

**Root Cause:** Alembic requires sync driver, not just asyncpg

**Prevention:**
- ✅ Added to requirements.txt
- ✅ Installation verified in setup scripts
- ✅ Docker image includes both drivers

**Verification:**
```bash
docker exec backend python -c "import psycopg2; import asyncpg; print('✓ Both drivers available')"
```

### Issue 4: Shared Packages Not Built

**Root Cause:** TypeScript compilation didn't run or failed silently

**Prevention:**
- ✅ Build automation in setup scripts
- ✅ CI/CD pipeline includes package build
- ✅ Verification step checks dist/ folders

**Verification:**
```bash
# Check all packages have dist/ folder with .js files
ls packages/shared-types/dist/*.js
ls packages/shared-constants/dist/*.js
ls packages/shared-validation/dist/*.js
ls packages/shared-utils/dist/*.js
```

## Rollback Procedure

If deployment fails:

1. **Revert deployment**
   ```bash
   kubectl rollout undo deployment/backend -n rawdrive
   kubectl rollout undo deployment/frontend -n rawdrive
   ```

2. **Rollback database migrations**
   ```bash
   # Only if migrations were applied
   docker exec backend alembic downgrade -1
   ```

3. **Verify rollback**
   ```bash
   kubectl get pods -n rawdrive
   # Check all pods are running previous version
   ```

4. **Post-mortem**
   - Document what went wrong
   - Update checklist with new checks
   - Fix issues before next deployment

## Success Criteria

✅ All checklist items completed
✅ No errors in deployment logs
✅ Health checks passing
✅ Smoke tests passing
✅ Metrics showing normal behavior
✅ No increase in error rates
✅ Response times within SLA

## Support Contacts

- **DevOps:** devops@rawdrive.com
- **Backend:** backend-team@rawdrive.com
- **Frontend:** frontend-team@rawdrive.com
- **On-Call:** oncall@rawdrive.com

## Post-Deployment Monitoring

Monitor for 24 hours:
- [ ] Error rates (should be < 0.1%)
- [ ] Response times (P95 < 500ms)
- [ ] Database connection pool (< 80% utilization)
- [ ] Memory usage (< 70% of limits)
- [ ] CPU usage (< 60% of limits)
- [ ] Login success rate (> 99%)

---

**Last Updated:** 2026-01-07
**Version:** 1.0
**Owner:** Platform Team
