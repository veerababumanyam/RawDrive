# Test Users

All test users share the password **`Test@123`** and have deterministic UUIDs for automation.

## Subscription Tier Users

| Email | Plan | User ID | Workspace ID |
|-------|------|---------|--------------|
| `free@test.rawdrive.in` | Free (Starter) | `11111111-1111-1111-1111-111111111001` | `11111111-1111-1111-1111-000000000001` |
| `starter@test.rawdrive.in` | Starter | `11111111-1111-1111-1111-111111111002` | `11111111-1111-1111-1111-000000000002` |
| `professional@test.rawdrive.in` | Professional | `11111111-1111-1111-1111-111111111003` | `11111111-1111-1111-1111-000000000003` |
| `business@test.rawdrive.in` | Studio | `11111111-1111-1111-1111-111111111004` | `11111111-1111-1111-1111-000000000004` |
| `enterprise@test.rawdrive.in` | Enterprise | `11111111-1111-1111-1111-111111111005` | `11111111-1111-1111-1111-000000000005` |

Each tier user owns their workspace with the `owner` role (full permissions).

## Platform Admin Users

| Email | Platform Role | User ID | Workspace ID |
|-------|---------------|---------|--------------|
| `superadmin@test.rawdrive.in` | `super_admin` | `22222222-2222-2222-2222-222222222001` | `22222222-2222-2222-2222-000000000001` |
| `platformadmin@test.rawdrive.in` | `platform_admin` | `22222222-2222-2222-2222-222222222002` | `22222222-2222-2222-2222-000000000002` |
| `supportadmin@test.rawdrive.in` | `support_admin` | `22222222-2222-2222-2222-222222222003` | `22222222-2222-2222-2222-000000000003` |
| `billingadmin@test.rawdrive.in` | `billing_admin` | `22222222-2222-2222-2222-222222222004` | `22222222-2222-2222-2222-000000000004` |
| `contentmod@test.rawdrive.in` | `content_moderator` | `22222222-2222-2222-2222-222222222005` | `22222222-2222-2222-2222-000000000005` |
| `securityadmin@test.rawdrive.in` | `security_admin` | `22222222-2222-2222-2222-222222222006` | `22222222-2222-2222-2222-000000000006` |
| `observabilityadmin@test.rawdrive.in` | `observability_admin` | `22222222-2222-2222-2222-222222222007` | `22222222-2222-2222-2222-000000000007` |
| `productadmin@test.rawdrive.in` | `product_admin` | `22222222-2222-2222-2222-222222222008` | `22222222-2222-2222-2222-000000000008` |

## Workspace Roles

Every workspace is created with four system roles:

| Role | Permissions |
|------|-------------|
| `owner` | `workspace:*`, `members:*`, `roles:*`, `galleries:*`, `assets:*`, `billing:*`, `audit:read` |
| `admin` | `workspace:write`, `members:write`, `roles:write`, `galleries:*`, `assets:*`, `billing:read`, `audit:read` |
| `editor` | `galleries:write`, `galleries:read`, `assets:write`, `assets:read` |
| `viewer` | `galleries:read`, `assets:read` |

## Plan Capabilities

| Plan | Storage | Galleries | AI Credits | Price (INR) |
|------|---------|-----------|------------|-------------|
| Free/Starter | 5 GB | 3 | 50/month | Free |
| Professional | 100 GB | Unlimited | 500/month | 999/month |
| Studio | 500 GB | Unlimited | 2000/month | 2,499/month |
| Enterprise | Unlimited | Unlimited | Unlimited | Custom |

## Login

### Web UI

1. Open `http://localhost:5173` (Vite dev server) or `http://localhost` (via Traefik)
2. Enter email and password from the tables above

### API (cURL)

```bash
# Login and get JWT token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "free@test.rawdrive.in", "password": "Test@123"}'

# Response includes access_token and refresh_token
# Use access_token in subsequent requests:
curl http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer <access_token>"
```

### Admin API

```bash
# Login as super admin
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "superadmin@test.rawdrive.in", "password": "Test@123"}'

# Access admin endpoints
curl http://localhost:8000/api/v1/admin/users \
  -H "Authorization: Bearer <access_token>"
```

## Seeding

### Create test users

```bash
# After migrations are applied:
docker exec rawdrive-backend python /app/scripts/seed_test_users_with_subscriptions.py

# Full seed (tier + admin users):
docker exec rawdrive-backend python /app/seed_all_test_users.py

# Force recreate (deletes and rebuilds):
docker exec rawdrive-backend python /app/scripts/seed_test_users_with_subscriptions.py --force
```

### Verify test users exist

```bash
docker exec rawdrive-backend python /app/scripts/check_test_users.py
```

### Repair broken test users

```bash
docker exec rawdrive-backend python /app/scripts/repair_all_test_users.py
```

## Service Endpoints

| Service | Port | Container | Direct URL |
|---------|------|-----------|-----------|
| Backend API | 8000 | rawdrive-backend | `http://localhost:8000/api/v1/` |
| Gallery | 8004 | rawdrive-gallery-service | `http://localhost:8004/` |
| Billing | 8005 | rawdrive-billing-service | `http://localhost:8005/` |
| Onboarding | 8006 | rawdrive-onboarding-service | `http://localhost:8006/` |
| Invitations | 8007 | rawdrive-invitations-api | `http://localhost:8007/` |
| Upload | 8008 | rawdrive-upload-service | `http://localhost:8008/` |
| Notifications | 8010 | rawdrive-notifications-service | `http://localhost:8010/` |
| Client | 8011 | rawdrive-client-service | `http://localhost:8011/` |
| AI Processing | 8012 | rawdrive-ai-processing | `http://localhost:8012/` |
| AI Service | 8013 | rawdrive-ai-service-mcp | `http://localhost:8013/` |
| Webhooks | 8015 | rawdrive-webhooks-service | `http://localhost:8015/` |
| Growth | 8016 | rawdrive-growth-service | `http://localhost:8016/` |

### Infrastructure

| Service | Port | Container |
|---------|------|-----------|
| Traefik (HTTP) | 80 | rawdrive-traefik |
| Traefik Dashboard | 8080 | rawdrive-traefik |
| PostgreSQL | 5432 | rawdrive-postgres |
| Redis | 6379 | rawdrive-redis |
| PgBouncer | 6432 | rawdrive-pgbouncer |
| Grafana | 3000 (admin/admin) | rawdrive-grafana |
| Prometheus | 9090 | rawdrive-prometheus |
| Loki | 3100 | rawdrive-loki |
| Milvus | 19530 | rawdrive-milvus |
| MinIO Console | 9001 (minioadmin/minioadmin) | rawdrive-minio |

## Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# All services health (quick check)
for port in 8000 8004 8005 8006 8007 8008 8010 8011 8012 8013 8015 8016; do
  echo "Port $port: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$port/health)"
done

# Via Traefik (tests API gateway routing)
curl http://localhost/api/v1/health
```

## Troubleshooting

### "Plans not found" during seeding

Run migrations first: `docker exec rawdrive-backend alembic upgrade head`

### "User already exists"

Use `--force` to delete and recreate: `docker exec rawdrive-backend python /app/scripts/seed_test_users_with_subscriptions.py --force`

### Login returns 401

1. Verify the user exists: `docker exec rawdrive-backend python /app/scripts/check_test_users.py`
2. The seed script uses a hardcoded Argon2 hash. If it doesn't match `Test@123`, run: `docker exec rawdrive-backend python /app/scripts/repair_all_test_users.py`

### Database connection refused

Ensure PostgreSQL is running: `docker ps --filter name=rawdrive-postgres`

### JWT token issues

All services share the same `JWT_SECRET` from `.env`. Microservices use EdDSA keys mounted at `/app/secrets/`.
