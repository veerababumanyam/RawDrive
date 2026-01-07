# Troubleshooting: Login and Workspace Access Issues

**Last Updated:** 2026-01-07
**Applies To:** RawDrive v0.3.0+

## Quick Diagnosis

Use this decision tree to quickly identify your issue:

```
Login fails with 500 error?
└─> See: Session Creation Issues

Login succeeds but workspace 404?
└─> See: Missing Workspace Subscriptions

Login succeeds but 401 errors?
└─> See: Token/Authentication Issues

Login succeeds but digital-invitations 404?
└─> See: Known Limitations (not a bug)
```

---

## Common Issues and Solutions

### Issue 1: Login Returns 500 Internal Server Error

**Symptoms:**
```
POST /api/v1/auth/login → 500 Internal Server Error
Browser console: "Failed to login. Please try again."
Backend logs: "asyncpg.exceptions.InterfaceError"
```

**Root Cause:**
SQL parameter binding error in `session_service.py` where VALUES clause reuses placeholders.

**Solution:**

1. **Verify the fix is applied:**
   ```bash
   # Check session_service.py line 175
   docker exec rawdrive-backend grep -A 5 "VALUES" /app/src/app/services/session_service.py
   ```

   Should see: `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`

   NOT: `VALUES ($1, $2, ..., $11, $11, $12)`

2. **If incorrect, update the code:**
   - File: `backend/src/app/services/session_service.py`
   - Lines: 157-179
   - Change: Use $11, $12, $13 for last three parameters
   - Pass `now` twice (for created_at and last_used_at)

3. **Restart backend:**
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml restart backend
   ```

4. **Verify fix:**
   ```bash
   curl -X POST http://localhost:8000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"free@test.rawdrive.in","password":"Test@123"}'
   ```

   Should return 200 OK with tokens.

**Prevention:**
- Run `pytest backend/tests/test_session_service.py` before deployment
- The test will catch SQL parameter binding errors

---

### Issue 2: Workspace 404 (WORKSPACE_NOT_FOUND)

**Symptoms:**
```
GET /api/v1/workspaces/{workspace_id} → 404 Not Found
Error: {"code": "WORKSPACE_NOT_FOUND", "message": "The item you're looking for doesn't exist."}
Browser console shows workspace_id but GET fails
```

**Root Cause:**
- Workspace exists in `workspaces` table
- NO subscription in `workspace_subscriptions` table
- `get_workspace()` uses INNER JOIN requiring subscription
- Query returns 0 rows → 404

**Diagnosis:**

```sql
-- Check if workspace has subscription
SELECT
  w.workspace_id,
  w.name,
  ws.subscription_id
FROM workspaces w
LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = w.workspace_id
WHERE w.workspace_id = 'YOUR_WORKSPACE_ID';
```

If `subscription_id` is NULL → Missing subscription!

**Solutions:**

**Option A: Run Database Validation Script (Recommended)**
```bash
# Check issues
docker exec rawdrive-backend python /app/scripts/validate-database.py

# Auto-fix
docker exec rawdrive-backend python /app/scripts/validate-database.py --fix
```

**Option B: Run Backfill Migration**
```bash
# Apply migration 0117
docker exec rawdrive-backend alembic upgrade head

# Verify
docker exec rawdrive-backend alembic current
```

**Option C: Manually Create Subscription**
```sql
-- Get starter plan ID
SELECT plan_id FROM plans WHERE code = 'starter';

-- Insert subscription
INSERT INTO workspace_subscriptions (
  workspace_id,
  plan_id,
  status,
  trial_expires_at,
  current_period_end
) VALUES (
  'YOUR_WORKSPACE_ID',
  'STARTER_PLAN_ID',
  'active',
  NOW() + INTERVAL '30 days',
  NOW() + INTERVAL '30 days'
);
```

**Verification:**
```bash
# Via API
curl http://localhost:8000/api/v1/health/database-integrity

# Or via script
docker exec rawdrive-backend python /app/scripts/validate-database.py
```

**Prevention:**
- Always use `seed_test_users_with_subscriptions.py` for test users
- Migration 0117 adds trigger to prevent workspace creation without subscription
- Monitor `/health/database-integrity` endpoint in production

---

### Issue 3: 401 Unauthorized Errors After Login

**Symptoms:**
```
GET /api/v1/workspaces/{workspace_id}/face-groups → 401 Unauthorized
Login succeeded but API calls return 401
Token appears valid in localStorage
```

**Root Causes:**

1. **Token Expired**
   - Access tokens last 15 minutes
   - Solution: Refresh the page or re-login

2. **Workspace Mismatch**
   - Logged in as User A (workspace X)
   - Trying to access workspace Y
   - Solution: Ensure workspace_id in URL matches user's workspace

3. **Stale Token (After Bug Fix)**
   - Old token from before session_service.py fix
   - Solution: Clear localStorage and re-login

**Diagnosis:**

```javascript
// In browser console (F12)
const token = localStorage.getItem('rawdrive_access_token');
const user = JSON.parse(localStorage.getItem('rawdrive_user'));

console.log('Token exists:', !!token);
console.log('User workspace_id:', user?.workspace_id);
console.log('Current URL workspace:', window.location.pathname.match(/workspace\/([^/]+)/)?.[1]);
```

**Solutions:**

**1. Clear localStorage and re-login:**
```javascript
// Browser console
localStorage.clear();
// Then navigate to /signin and login again
```

**2. Hard refresh:**
```
Windows/Linux: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

**3. Check token expiration:**
```javascript
const expiresAt = localStorage.getItem('rawdrive_expires_at');
const isExpired = Date.now() > parseInt(expiresAt);
console.log('Token expired:', isExpired);
```

**4. Verify workspace access:**
```bash
# Test with fresh token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"free@test.rawdrive.in","password":"Test@123"}' \
  | jq -r '.tokens.access_token'

# Save token, then test workspace endpoint
TOKEN="..."
WORKSPACE_ID="..."
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID
```

---

### Issue 4: Digital Invitations 404 (Expected Behavior)

**Symptoms:**
```
GET /api/v1/workspaces/{id}/digital-invitations → 404 Not Found
GET /api/v1/workspaces/{id}/digital-invitations/drafts → 404 Not Found
```

**Root Cause:**
This is **intentional** - digital invitations endpoints are disabled in the backend.

**Explanation:**
In `backend/src/app/api/v1/__init__.py` lines 51-53:
```python
# Temporarily commented out until all invitation types are generated
# from app.api.v1.digital_invitations import router as digital_invitations_router
# from app.api.v1.public_invitations import router as public_invitations_router
```

The `invitations-service` microservice (port 8007) is running, but backend proxy routes are disabled.

**Status:**
- NOT a bug
- Feature in development
- Will be enabled in future release

**Workaround:**
None needed - this doesn't affect login or workspace access.

---

## Diagnostic Tools

### 1. Database Validation Script

```bash
# Check all issues
docker exec rawdrive-backend python /app/scripts/validate-database.py

# Auto-fix issues
docker exec rawdrive-backend python /app/scripts/validate-database.py --fix
```

**What it checks:**
- Workspaces without subscriptions
- Orphaned sessions
- Missing required plans
- Duplicate workspace slugs
- Orphaned workspace members

### 2. Health Check Endpoints

**Basic Health:**
```bash
curl http://localhost:8000/api/v1/health
```

**Database Integrity:**
```bash
curl http://localhost:8000/api/v1/health/database-integrity | jq
```

**Detailed Health:**
```bash
curl http://localhost:8000/api/v1/health/detailed | jq
```

### 3. PowerShell Test Scripts

**Test Workspace Endpoint:**
```powershell
.\tests\test-workspace-endpoint.ps1
```

**Test Face Groups:**
```powershell
.\tests\test-face-groups.ps1
```

### 4. Database Queries

**Check Workspace Subscriptions:**
```sql
SELECT
  w.workspace_id,
  w.name,
  ws.subscription_id IS NOT NULL as has_subscription,
  p.code as plan_code,
  ws.status
FROM workspaces w
LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = w.workspace_id
LEFT JOIN plans p ON p.plan_id = ws.plan_id
WHERE w.status = 'active'
ORDER BY w.name;
```

**Check Session Integrity:**
```sql
SELECT
  s.session_id,
  s.user_id,
  s.created_at,
  s.expires_at,
  u.email
FROM sessions s
LEFT JOIN users u ON u.user_id = s.user_id
WHERE s.expires_at > NOW()
ORDER BY s.created_at DESC
LIMIT 10;
```

---

## Prevention Checklist

Use this checklist to prevent these issues in the future:

### Development Setup

- [ ] Run `backend/scripts/setup.ps1` (Windows) or `backend/scripts/setup.sh` (Linux/Mac)
- [ ] Verify all migrations applied: `alembic current`
- [ ] Run database validation: `python scripts/validate-database.py`
- [ ] Seed users with subscriptions: `python scripts/seed_test_users_with_subscriptions.py`
- [ ] Run tests: `pytest backend/tests/test_session_service.py`

### Before Deployment

- [ ] Run full test suite: `pytest`
- [ ] Check database integrity: `curl /api/v1/health/database-integrity`
- [ ] Verify all migrations applied
- [ ] Review session_service.py SQL queries
- [ ] Test login flow with test users
- [ ] Check workspace access for all tier users

### Production Monitoring

- [ ] Monitor `/health/database-integrity` endpoint (alerting on 503)
- [ ] Set up alerts for 500 errors on `/auth/login`
- [ ] Set up alerts for 404 errors on `/workspaces/{id}`
- [ ] Weekly: Run `validate-database.py` script
- [ ] Monthly: Review orphaned sessions and cleanup

---

## Quick Reference Commands

### Docker

```bash
# View backend logs
docker compose -f infrastructure/docker/docker-compose.yml logs -f backend

# Restart backend
docker compose -f infrastructure/docker/docker-compose.yml restart backend

# Access database
docker exec -it rawdrive-postgres psql -U rawdrive -d rawdrive

# Run script in backend
docker exec rawdrive-backend python /app/scripts/SCRIPT_NAME.py
```

### Database

```bash
# Check migrations
docker exec rawdrive-backend alembic current
docker exec rawdrive-backend alembic history

# Apply migrations
docker exec rawdrive-backend alembic upgrade head

# Validate database
docker exec rawdrive-backend python /app/scripts/validate-database.py --fix
```

### Testing

```bash
# Test login endpoint
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"free@test.rawdrive.in","password":"Test@123"}'

# Test workspace endpoint (need token)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/api/v1/workspaces/WORKSPACE_ID

# Run E2E tests
cd tests && npx playwright test workspace-features.spec.ts
```

---

## Getting Help

If issues persist:

1. **Check Logs:**
   ```bash
   docker compose logs -f backend | grep -E "ERROR|CRITICAL|500"
   ```

2. **Run Full Validation:**
   ```bash
   docker exec rawdrive-backend python /app/scripts/validate-database.py
   ```

3. **Check Health Endpoints:**
   ```bash
   curl http://localhost:8000/api/v1/health/database-integrity | jq
   ```

4. **Review Recent Changes:**
   ```bash
   git log --oneline -10 backend/src/app/services/session_service.py
   ```

5. **Contact Support:**
   - GitHub Issues: https://github.com/rawdrive/rawdrive/issues
   - Include: Error message, logs, database validation output

---

## Related Documentation

- [TEST_RESULTS.md](../tests/TEST_RESULTS.md) - Comprehensive test results
- [FIX_SUMMARY.md](../FIX_SUMMARY.md) - Detailed fix documentation
- [TEST_USERS_COMPLETE.md](TEST_USERS_COMPLETE.md) - Test user credentials
- [PRODUCTION_DEPLOYMENT_CHECKLIST.md](PRODUCTION_DEPLOYMENT_CHECKLIST.md) - Deployment guide

---

**Document Version:** 1.0
**Last Verified:** 2026-01-07
**Tested On:** RawDrive v0.3.0
