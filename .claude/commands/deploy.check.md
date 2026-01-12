---
description: Pre-deployment checklist and validation for RawDrive
---

# Pre-Deployment Checks

Comprehensive pre-deployment validation for RawDrive platform.

## References

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product requirements and architecture overview
- **Best Practices**:
  - [Deployment Best Practices](../reference/deployment-best-practices.md)
  - [Security Best Practices](../reference/security-best-practices.md)
  - [Testing and Logging](../reference/testing-and-logging.md)
  - [Observability Best Practices](../reference/observability-best-practices.md)
  - [Kubernetes Scaling Best Practices](../reference/kubernetes-scaling-best-practices.md)

## Quick Checklist

Run this command before any deployment:

```bash
# 1. Health checks
/health.check

# 2. Run tests
/test.run

# 3. Check migrations
/migration.check

# 4. Verify build
/build.verify
```

## Detailed Pre-Deployment Checklist

### 1. Code Quality

#### Linting
```bash
# Frontend
cd frontend && pnpm lint

# Backend
docker exec rawdrive-backend ruff check src

# Fix issues
cd frontend && pnpm lint:fix
docker exec rawdrive-backend ruff check src --fix
```

#### Type Checking
```bash
# Frontend TypeScript
cd frontend && pnpm type-check

# Backend Python
docker exec rawdrive-backend mypy src
```

#### Format Check
```bash
# Frontend (Prettier)
cd frontend && pnpm format:check

# Backend (Ruff)
docker exec rawdrive-backend ruff format --check src
```

### 2. Testing

#### Unit Tests
```bash
# Frontend
cd frontend && pnpm test

# Backend
docker exec rawdrive-backend pytest

# All microservices
docker exec rawdrive-gallery-service pytest
docker exec rawdrive-billing-service pytest
docker exec rawdrive-upload-service pytest
```

#### Integration Tests
```bash
docker exec rawdrive-backend pytest tests/integration/
```

#### E2E Tests
```bash
cd frontend && pnpm test:e2e
```

#### Coverage Check
```bash
# Ensure >80% coverage
cd frontend && pnpm test:coverage
docker exec rawdrive-backend pytest --cov=src --cov-report=term-missing
```

### 3. Database Migrations

#### Check Migration Status
```bash
# Current migration version
docker exec rawdrive-backend bash -c "cd /app && alembic current"

# Pending migrations
docker exec rawdrive-backend bash -c "cd /app && alembic heads"

# Migration history
docker exec rawdrive-backend bash -c "cd /app && alembic history"
```

#### Validate Migrations
```bash
# Check for migration conflicts
docker exec rawdrive-backend bash -c "cd /app && alembic branches"

# Verify migrations can be applied
docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head --sql" > migration.sql
```

#### Test Rollback
```bash
# Test downgrade (on staging only!)
docker exec rawdrive-backend bash -c "cd /app && alembic downgrade -1"
docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head"
```

### 4. Build Verification

#### Frontend Build
```bash
cd frontend

# Production build
pnpm build

# Check build output
ls -lh dist/

# Verify no errors in build
echo $?  # Should be 0
```

#### Shared Packages Build
```bash
# Build all shared packages
pnpm build:packages

# Verify builds
ls -lh packages/*/dist/
```

#### Docker Images Build
```bash
# Build all service images
docker compose -f infrastructure/docker/docker-compose.yml build

# Check image sizes
docker images | grep rawdrive
```

### 5. Environment Configuration

#### Check Environment Variables
```bash
# Verify .env file exists
test -f .env && echo "✓ .env exists" || echo "✗ .env missing"

# Check required variables
grep -q "DATABASE_URL" .env && echo "✓ DATABASE_URL set" || echo "✗ DATABASE_URL missing"
grep -q "JWT_SECRET" .env && echo "✓ JWT_SECRET set" || echo "✗ JWT_SECRET missing"
grep -q "R2_ACCESS_KEY_ID" .env && echo "✓ R2_ACCESS_KEY_ID set" || echo "✗ R2_ACCESS_KEY_ID missing"
```

#### Validate Configuration
```bash
# Check JWT secret length (should be 64+ chars)
docker exec rawdrive-backend python -c "import os; secret = os.getenv('JWT_SECRET'); print(f'JWT_SECRET length: {len(secret)}'); assert len(secret) >= 64"

# Verify database connection
docker exec rawdrive-backend python -c "from sqlalchemy import create_engine; import os; engine = create_engine(os.getenv('DATABASE_URL')); conn = engine.connect(); print('✓ Database connection successful')"

# Verify Redis connection
docker exec rawdrive-backend python -c "import redis; import os; r = redis.from_url(os.getenv('REDIS_URL')); r.ping(); print('✓ Redis connection successful')"
```

### 6. Security Checks

#### Dependency Vulnerabilities
```bash
# Frontend
cd frontend && pnpm audit

# Backend
docker exec rawdrive-backend pip-audit

# Fix vulnerabilities
cd frontend && pnpm audit fix
```

#### Secret Scanning
```bash
# Check for exposed secrets (using git-secrets or similar)
git secrets --scan

# Check for hardcoded credentials
grep -r "password.*=" --include="*.py" --include="*.ts" --include="*.tsx" src/
```

#### CORS Configuration
```bash
# Verify CORS settings in production
grep -r "allow_origins" backend/src/app/
```

### 7. Performance Checks

#### Bundle Size
```bash
# Frontend bundle analysis
cd frontend && pnpm build --analyze

# Check bundle sizes
ls -lh dist/assets/*.js | awk '{print $5, $9}'
```

#### Database Indexes
```bash
# Check for missing indexes
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;
"

# Check for unused indexes
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
WHERE idx_scan = 0 
ORDER BY schemaname, tablename;
"
```

#### Query Performance
```bash
# Check slow queries
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
"
```

### 8. Documentation

#### Update Version
```bash
# Check VERSION file
cat VERSION

# Update CHANGELOG.md
grep -q "$(cat VERSION)" CHANGELOG.md && echo "✓ CHANGELOG updated" || echo "✗ Update CHANGELOG"
```

#### API Documentation
```bash
# Verify OpenAPI docs are accessible
curl -s http://localhost:8000/docs -o /dev/null -w "HTTP Status: %{http_code}\n"

# Check all microservices docs
curl -s http://localhost:8004/docs -o /dev/null -w "Gallery Service: %{http_code}\n"
curl -s http://localhost:8005/docs -o /dev/null -w "Billing Service: %{http_code}\n"
```

### 9. Monitoring & Observability

#### Prometheus Metrics
```bash
# Check metrics endpoints
curl -s http://localhost:8000/metrics | head -20
curl -s http://localhost:8004/metrics | head -20
```

#### Health Endpoints
```bash
# Verify all health endpoints
for port in 8000 8004 8005 8006 8007 8008 8010 8003 8013; do
  curl -s http://localhost:$port/health/live | jq -r ".status" | xargs echo "Port $port:"
done
```

#### Logging Configuration
```bash
# Check log levels
docker exec rawdrive-backend env | grep LOG_LEVEL
docker exec rawdrive-gallery-service env | grep LOG_LEVEL
```

### 10. Backup & Recovery

#### Database Backup
```bash
# Create backup before deployment
docker exec rawdrive-postgres pg_dump -U rawdrive rawdrive > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backup_*.sql
```

#### Verify Backup Restoration (Staging Only)
```bash
# Test restore on staging database
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive_staging < backup_latest.sql
```

## Automated Pre-Deployment Script

Create `scripts/pre-deploy-check.ps1`:

```powershell
#!/usr/bin/env pwsh

Write-Host "=== RawDrive Pre-Deployment Checks ===" -ForegroundColor Cyan

$errors = 0

# 1. Linting
Write-Host "`n[1/10] Running linters..." -ForegroundColor Yellow
cd frontend
if (pnpm lint) {
    Write-Host "✓ Frontend linting passed" -ForegroundColor Green
} else {
    Write-Host "✗ Frontend linting failed" -ForegroundColor Red
    $errors++
}

# 2. Tests
Write-Host "`n[2/10] Running tests..." -ForegroundColor Yellow
if (pnpm test) {
    Write-Host "✓ Frontend tests passed" -ForegroundColor Green
} else {
    Write-Host "✗ Frontend tests failed" -ForegroundColor Red
    $errors++
}

# 3. Build
Write-Host "`n[3/10] Building frontend..." -ForegroundColor Yellow
if (pnpm build) {
    Write-Host "✓ Frontend build successful" -ForegroundColor Green
} else {
    Write-Host "✗ Frontend build failed" -ForegroundColor Red
    $errors++
}

# ... more checks ...

if ($errors -eq 0) {
    Write-Host "`n✓ All pre-deployment checks passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n✗ $errors check(s) failed. Fix issues before deploying." -ForegroundColor Red
    exit 1
}
```

## Deployment Readiness Criteria

✅ **Ready to Deploy** if:
- All tests passing (unit, integration, E2E)
- Code coverage >80%
- No linting errors
- No type errors
- All migrations tested
- Production build successful
- No security vulnerabilities
- Documentation updated
- Health checks passing
- Backup created

❌ **NOT Ready** if:
- Any tests failing
- Linting errors present
- Type errors exist
- Untested migrations
- Build failures
- Critical security issues
- Missing environment variables

## Post-Deployment Verification

After deployment:

1. **Smoke Tests**: Run critical user flows
2. **Health Checks**: Verify all services healthy
3. **Monitoring**: Check Grafana dashboards
4. **Logs**: Monitor for errors in first 15 minutes
5. **Rollback Plan**: Be ready to rollback if issues

## Notes

- Always run pre-deployment checks on staging first
- Keep deployment windows short
- Have rollback plan ready
- Monitor closely after deployment
- Document any manual steps required
