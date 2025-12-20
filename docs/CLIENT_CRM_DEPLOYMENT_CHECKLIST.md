# Client CRM Module - Deployment Checklist

This checklist covers the deployment of the Client CRM Module for RawDrive.

## Pre-Deployment Requirements

### Database Migrations

- [ ] **Run migration 0012_client_crm_schema.py**
  ```bash
  cd backend && alembic upgrade head
  ```
  - Creates 10 new tables:
    - `clients` - Core client profiles
    - `client_contacts` - Multiple contact methods
    - `client_addresses` - Physical addresses
    - `client_tags` - Reusable tags
    - `client_tag_assignments` - Client-tag relationships
    - `client_gallery_links` - Client-gallery associations
    - `client_activities` - Activity timeline
    - `client_communications` - Communication history
    - `client_preferences` - Gallery/delivery preferences
    - `client_smart_lists` - Dynamic segmentation
  - Creates 20+ indexes for query optimization

- [ ] **Verify migration success**
  ```bash
  cd backend && alembic current
  # Should show: 0012 (head)
  ```

### Environment Variables

No new environment variables required for this module. Existing configuration is sufficient:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis for caching |
| `JWT_SECRET` | Yes | Authentication |

### Feature Flags

No feature flags required. The module is enabled by default when deployed.

### API Routes Registration

Verify the following routes are registered in `backend/src/routes/v1/index.ts`:

```python
# Client CRM routes should be registered
from app.routes.v1 import clients, contacts, communications, activities, smart_lists
```

## Deployment Steps

### 1. Backend Deployment

- [ ] **Run tests locally**
  ```bash
  cd backend
  PYTHONPATH=src pytest tests/unit/test_client_service.py \
    tests/unit/test_contact_service.py \
    tests/unit/test_gallery_link_service.py \
    tests/unit/test_activity_service.py \
    tests/unit/test_duplicate_detection_service.py \
    tests/property/test_client_crm_properties.py \
    tests/integration/test_client_crm_workflows.py \
    -v
  ```
  - Expected: 237 tests pass
  - Coverage: 94%+

- [ ] **Run database migration** (staging first)
  ```bash
  # On staging
  cd backend && alembic upgrade head

  # Verify tables exist
  psql $DATABASE_URL -c "\dt client*"
  ```

- [ ] **Deploy backend services**
  - Deploy updated service code
  - Verify health check passes
  - Check logs for startup errors

### 2. Frontend Deployment

- [ ] **Build frontend**
  ```bash
  cd frontend && npm run build
  ```

- [ ] **Deploy frontend assets**
  - Upload to CDN/hosting
  - Invalidate cache if necessary

### 3. Cache Warm-up

- [ ] **Clear relevant caches**
  ```bash
  redis-cli KEYS "client:*" | xargs -r redis-cli DEL
  redis-cli KEYS "workspace:*:clients" | xargs -r redis-cli DEL
  ```

## Post-Deployment Verification

### API Endpoints

Test each endpoint with curl or Postman:

- [ ] **Clients CRUD**
  - `POST /api/v1/workspaces/{id}/clients` - Create client
  - `GET /api/v1/workspaces/{id}/clients` - List clients
  - `GET /api/v1/workspaces/{id}/clients/{id}` - Get client
  - `PATCH /api/v1/workspaces/{id}/clients/{id}` - Update client
  - `DELETE /api/v1/workspaces/{id}/clients/{id}` - Delete client

- [ ] **Contacts CRUD**
  - `POST /api/v1/workspaces/{id}/clients/{id}/contacts` - Add contact
  - `PATCH /api/v1/workspaces/{id}/clients/{id}/contacts/{id}` - Update contact
  - `DELETE /api/v1/workspaces/{id}/clients/{id}/contacts/{id}` - Delete contact

- [ ] **Gallery Links**
  - `POST /api/v1/workspaces/{id}/clients/{id}/galleries` - Link gallery
  - `GET /api/v1/workspaces/{id}/clients/{id}/galleries` - List linked galleries
  - `DELETE /api/v1/workspaces/{id}/clients/{id}/galleries/{id}` - Unlink gallery

- [ ] **Activities**
  - `GET /api/v1/workspaces/{id}/clients/{id}/activities` - Get timeline
  - `POST /api/v1/workspaces/{id}/clients/{id}/activities` - Record activity

- [ ] **Communications**
  - `GET /api/v1/workspaces/{id}/clients/{id}/communications` - List communications
  - `POST /api/v1/workspaces/{id}/clients/{id}/communications` - Add communication

- [ ] **Smart Lists**
  - `GET /api/v1/workspaces/{id}/smart-lists` - List smart lists
  - `POST /api/v1/workspaces/{id}/smart-lists` - Create smart list
  - `GET /api/v1/workspaces/{id}/smart-lists/{id}/evaluate` - Evaluate list

- [ ] **Duplicate Detection**
  - `GET /api/v1/workspaces/{id}/clients/duplicates` - Find duplicates
  - `POST /api/v1/workspaces/{id}/clients/merge` - Merge clients

### Workspace Isolation

- [ ] **Verify data isolation**
  - Create client in Workspace A
  - Attempt to access from Workspace B (should 404)
  - Attempt to list from Workspace B (should not appear)

### Performance

- [ ] **Response times**
  - Client list (100 items): < 250ms
  - Client detail with relations: < 200ms
  - Activity timeline: < 150ms
  - Duplicate detection: < 500ms

### Error Handling

- [ ] **Validation errors**
  - Empty full_name returns 400
  - Invalid email format returns 400
  - Invalid phone format returns 400

- [ ] **Not found errors**
  - Non-existent client returns 404
  - Non-existent gallery link returns 404

- [ ] **Conflict errors**
  - Duplicate contact returns 409
  - Duplicate gallery link returns 409

## Monitoring & Alerts

### Metrics to Monitor

- [ ] **Request metrics**
  - `http_requests_total{path="/api/v1/*/clients*"}` - Request count
  - `http_request_duration_seconds{path="/api/v1/*/clients*"}` - Latency

- [ ] **Database metrics**
  - Query execution time for client tables
  - Index utilization

- [ ] **Error rates**
  - 4xx error rate for CRM endpoints
  - 5xx error rate for CRM endpoints

### Recommended Alerts

| Metric | Threshold | Action |
|--------|-----------|--------|
| CRM endpoint error rate | > 5% | Investigate |
| CRM endpoint p95 latency | > 500ms | Optimize queries |
| Duplicate detection p95 | > 2s | Review batch size |

## Rollback Plan

If issues are detected:

### 1. Immediate Rollback

```bash
# Revert to previous backend version
kubectl rollout undo deployment/backend

# Or for Docker Compose
docker-compose down && docker-compose up -d --build
```

### 2. Database Rollback (if necessary)

```bash
# CAUTION: This will drop all CRM tables and data
cd backend && alembic downgrade 0011
```

### 3. Feature Disable (if routing issue)

Comment out CRM routes in route registration to disable endpoints without full rollback.

## Security Checklist

- [ ] **Authentication**
  - All CRM endpoints require valid JWT
  - Tokens validated on every request

- [ ] **Authorization**
  - Workspace isolation enforced via middleware
  - User must belong to workspace to access clients

- [ ] **Input Validation**
  - All inputs validated with Zod schemas
  - SQL injection prevented via parameterized queries
  - XSS prevented via output encoding

- [ ] **Audit Logging**
  - Client CRUD operations logged
  - Merge operations logged with before/after data

- [ ] **Data Protection**
  - PII not logged (only client_id logged)
  - Sensitive data encrypted at rest

## Test Coverage Summary

| Service | Coverage | Tests |
|---------|----------|-------|
| ClientService | 93% | 57 |
| ContactService | 94% | 63 |
| GalleryLinkService | 96% | 25 |
| ActivityService | 96% | 26 |
| DuplicateDetectionService | 96% | 39 |
| Property Tests | - | 18 |
| Integration Tests | - | 9 |
| **Total** | **94%** | **237** |

## Contacts

- **Module Owner**: Engineering Team
- **On-Call**: See PagerDuty rotation
- **Documentation**: See `docs/TechnicalSpecs/client_crm.json`

---

Last updated: 2025-12-20
