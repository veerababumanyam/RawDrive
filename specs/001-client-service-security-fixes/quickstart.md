# Quickstart: Client Service Security Remediation

**Feature**: 001-client-service-security-fixes
**Date**: 2026-01-21

## Prerequisites

- Docker and Docker Compose installed
- Git access to RawDrive repository
- Python 3.11+ (for local development)
- Redis CLI (optional, for debugging)

## Development Environment Setup

### 1. Start the Development Stack

```bash
# From repository root
cd /c/Users/admin/Desktop/RawDrive2

# Start all services
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Verify client-service is running
curl http://localhost:8009/health/live
# Expected: {"status": "healthy"}
```

### 2. Access Service Logs

```bash
# Watch client-service logs
docker logs -f rawdrive-client-service

# Watch Redis for rate limiting activity
docker exec -it rawdrive-redis redis-cli MONITOR | grep ratelimit
```

### 3. Test Authentication

```bash
# Get a test JWT token (use test user credentials)
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "free@test.rawdrive.in", "password": "Test@123"}' \
  | jq -r '.access_token')

# Verify token works
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8009/api/v1/workspaces/{workspace_id}/clients
```

## Security Testing

### Test 1: Rate Limit Bypass Prevention

**Purpose**: Verify X-User-ID header spoofing doesn't bypass rate limits.

```bash
# Set up test - get a valid token
TOKEN="your_token_here"
WORKSPACE_ID="your_workspace_id"

# Attempt 150 requests rapidly (limit is 100/minute)
for i in {1..150}; do
  # Try to bypass by spoofing X-User-ID
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-User-ID: spoofed-user-$i" \
    "http://localhost:8009/api/v1/workspaces/$WORKSPACE_ID/clients"
done | sort | uniq -c

# EXPECTED AFTER FIX:
# - First 100 requests: 200 OK
# - Remaining 50 requests: 429 Too Many Requests
# - X-User-ID header is IGNORED

# FAILURE (before fix):
# - All 150 requests return 200 because each gets unique bucket
```

### Test 2: Generic Auth Error Messages

**Purpose**: Verify all auth errors return identical messages.

```bash
# Test 1: Expired token (simulate by using old token)
EXPIRED_TOKEN="eyJ..."  # Use a token that's expired
curl -v http://localhost:8009/api/v1/workspaces/.../clients \
  -H "Authorization: Bearer $EXPIRED_TOKEN"
# EXPECTED: {"error": "AUTHENTICATION_REQUIRED", "message": "Invalid authentication token"}

# Test 2: Invalid signature
TAMPERED_TOKEN="${TOKEN}x"  # Append character to corrupt signature
curl -v http://localhost:8009/api/v1/workspaces/.../clients \
  -H "Authorization: Bearer $TAMPERED_TOKEN"
# EXPECTED: {"error": "AUTHENTICATION_REQUIRED", "message": "Invalid authentication token"}

# Test 3: Malformed token
curl -v http://localhost:8009/api/v1/workspaces/.../clients \
  -H "Authorization: Bearer not-a-jwt"
# EXPECTED: {"error": "AUTHENTICATION_REQUIRED", "message": "Invalid authentication token"}

# All three tests should return IDENTICAL response bodies
```

### Test 3: RBAC Permission Enforcement

**Purpose**: Verify role-based permissions are enforced.

```bash
# Use a viewer account
VIEWER_TOKEN="..."  # Token for user with viewer role

# Attempt to create a client (requires clients:write)
curl -X POST http://localhost:8009/api/v1/workspaces/$WORKSPACE_ID/clients \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Client"}'
# EXPECTED: 403 {"error": "INSUFFICIENT_PERMISSIONS", "required_permission": "clients:write"}

# Attempt bulk delete (requires admin role)
EDITOR_TOKEN="..."  # Token for user with editor role
curl -X POST http://localhost:8009/api/v1/workspaces/$WORKSPACE_ID/clients/bulk/delete \
  -H "Authorization: Bearer $EDITOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"client_ids": ["..."]}'
# EXPECTED: 403 {"error": "INSUFFICIENT_PERMISSIONS", "required_permission": "clients:bulk_delete"}
```

### Test 4: Request Timeout Enforcement

**Purpose**: Verify slow requests are terminated.

```bash
# Create a slow endpoint test (if available)
# Or use a large export that might exceed timeout

time curl -X GET "http://localhost:8009/api/v1/workspaces/$WORKSPACE_ID/clients/export?format=csv" \
  -H "Authorization: Bearer $TOKEN"
# EXPECTED: If export takes >60s, returns 504 with:
# {"error": "REQUEST_TIMEOUT", "message": "Request timed out...", "timeout_seconds": 60}
```

### Test 5: Redis Failure (Fail-Closed)

**Purpose**: Verify system fails closed when Redis is unavailable.

```bash
# Stop Redis temporarily
docker stop rawdrive-redis

# Attempt a request
curl -v http://localhost:8009/api/v1/workspaces/$WORKSPACE_ID/clients \
  -H "Authorization: Bearer $TOKEN"
# EXPECTED: 503 {"error": "SERVICE_UNAVAILABLE", "message": "Service temporarily unavailable..."}

# Restore Redis
docker start rawdrive-redis
```

## Running Unit Tests

```bash
# Navigate to client-service
cd services/client-service

# Install dev dependencies
pip install -r requirements-dev.txt

# Run security-specific tests
pytest tests/unit/test_rate_limiter_security.py -v
pytest tests/unit/test_auth_error_messages.py -v
pytest tests/unit/test_rbac.py -v

# Run all tests with coverage
pytest --cov=src --cov-report=html
```

## Debugging Tips

### Inspect Rate Limit Buckets

```bash
# Connect to Redis
docker exec -it rawdrive-redis redis-cli

# List all rate limit keys
KEYS ratelimit:*

# Check specific user's rate limit
GET ratelimit:user:550e8400-e29b-41d4-a716-446655440000:/api/v1/clients:1705845600

# Watch rate limit activity
MONITOR
```

### Check Audit Logs

```sql
-- Connect to PostgreSQL
-- docker exec -it rawdrive-postgres psql -U postgres -d rawdrive

-- View recent audit logs for PII access
SELECT audit_id, actor_user_id, action, target_type, metadata, created_at
FROM audit_logs
WHERE action = 'access'
  AND metadata ? 'fields_accessed'
ORDER BY created_at DESC
LIMIT 10;
```

### Verify JWT Claims

```bash
# Decode JWT token (without verification) to inspect claims
echo $TOKEN | cut -d. -f2 | base64 -d | jq .

# Expected claims for RBAC:
# {
#   "sub": "user-uuid",
#   "workspace_id": "workspace-uuid",
#   "role": "editor",
#   "permissions": ["clients:read", "clients:write", "clients:delete"],
#   ...
# }
```

## Common Issues

### Issue: All requests return 503

**Cause**: Redis is down or unreachable.
**Fix**: Check Redis container status: `docker ps | grep redis`

### Issue: Permission checks not working

**Cause**: JWT token might not include role/permissions claims.
**Fix**: Verify token claims and ensure auth-service is generating complete tokens.

### Issue: Rate limits not resetting

**Cause**: Stale Redis keys or clock skew.
**Fix**: Clear rate limit keys: `redis-cli KEYS "ratelimit:*" | xargs redis-cli DEL`

## Test User Accounts

| Email | Password | Role | Permissions |
|-------|----------|------|-------------|
| free@test.rawdrive.in | Test@123 | admin | All |
| viewer@test.rawdrive.in | Test@123 | viewer | clients:read |
| editor@test.rawdrive.in | Test@123 | editor | clients:read, write, delete |

See `docs/TEST_USERS.md` for complete list.

## Next Steps

After completing development:

1. Run full test suite: `pytest tests/ -v`
2. Run security scan: `bandit -r src/`
3. Update API documentation
4. Request security team review
5. Deploy to staging for penetration testing
