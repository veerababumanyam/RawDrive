---
name: traefik-infrastructure
description: "Traefik v3 API gateway routing, Docker Compose orchestration, Kubernetes/KEDA deployment, PgBouncer connection pooling, and infrastructure management for RawDrive. Use this skill when configuring Traefik routers/middlewares, modifying docker-compose files, setting up service routing, configuring rate limiting at gateway level, managing SSL/TLS certificates, working with Kubernetes manifests, or troubleshooting infrastructure issues. Also use for CI/CD with GitHub Actions, GHCR container builds, or Cloudflare R2/DNS config. Triggers on: Traefik, Docker, docker-compose, Kubernetes, KEDA, infrastructure, routing, gateway, reverse proxy, SSL, Let's Encrypt, PgBouncer, deployment, CI/CD, GitHub Actions, container."
---

# Traefik & Infrastructure

RawDrive uses Traefik v3 as the API gateway with Docker Compose for orchestration and Kubernetes for production scaling.

## Traefik Service Routing

All service routing is defined in `infrastructure/docker/traefik/dynamic.dev.yaml`:

```yaml
# Router pattern for a microservice
http:
  routers:
    gallery-service-router:
      rule: "PathPrefix(`/api/v1/galleries/public`)"
      service: gallery-service
      middlewares:
        - rate-limit-api
        - security-headers-dev

  services:
    gallery-service:
      loadBalancer:
        servers:
          - url: "http://gallery-service:8004"
```

### Current Route Map

| Path Prefix | Service | Port |
|-------------|---------|------|
| `/api` (default) | backend-service | 8000 |
| `/api/v1/galleries/public` | gallery-service | 8004 |
| `/api/v1/uploads` | upload-service | 8008 |
| `/api/v1/invitations` | invitations-service | 8007 |
| `/api/v1/billing` | billing-service | 8005 |
| `/api/v1/clients` | client-service | 8009 |
| `/api/v1/notifications` | notifications-service | 8010 |
| `/api/v1/webhooks` | webhooks-service | 8003 |
| `/api/v1/ai` | ai-service | 8011 |
| Subdomain routing | frontend-service | 5173 |

### Adding a New Route

1. Add router + service in `dynamic.dev.yaml`
2. Apply appropriate middlewares (rate-limit, security-headers, cors)
3. Add service to `docker-compose.yml`
4. For uploads/large payloads, use `large-body-size` middleware

## Traefik Middlewares

```yaml
middlewares:
  rate-limit-api:
    rateLimit:
      average: 100
      burst: 50

  rate-limit-uploads:
    rateLimit:
      average: 10
      burst: 5

  security-headers-dev:
    headers:
      browserXssFilter: true
      contentTypeNosniff: true
      frameDeny: true

  compress:
    compress: {}

  large-body-size:
    buffering:
      maxRequestBodyBytes: 524288000  # 500MB for uploads
```

## Docker Compose Architecture

**Files:**
- `docker-compose.yml` — Main orchestration (all services)
- `docker-compose.dev.yml` — Dev overrides (hot reload, debug ports)
- `docker-compose.prod.yml` — Production settings
- `docker-compose.db.yml` — Database-only (for local dev)
- `docker-compose.traefik.yml` — Gateway-only

**Core infrastructure services:**
```yaml
services:
  traefik:     # API Gateway - ports 80, 443, 8080 (dashboard)
  postgres:    # TimescaleDB PG16 - port 5432 (pgvector, pgvectorscale)
  redis:       # Redis 7 - port 6379 (no persistence in dev)
  pgbouncer:   # Connection pooling (transaction mode)
```

### Adding a New Microservice

```yaml
# In docker-compose.yml
new-service:
  build:
    context: ./services/new-service
    dockerfile: Dockerfile
  ports:
    - "8015:8015"
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=${REDIS_URL}
    - JWT_SECRET=${JWT_SECRET}
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8015/health/live"]
    interval: 30s
    timeout: 10s
    retries: 3
```

## Kubernetes (Production)

**Structure:** `infrastructure/kubernetes/base/` + `infrastructure/kubernetes/overlays/`

Key patterns:
- KEDA for autoscaling (gallery-service scales to 50K concurrent views)
- Horizontal Pod Autoscaler for CPU/memory-based scaling
- PgBouncer sidecar for connection pooling at scale

## CI/CD (GitHub Actions)

**File:** `.github/workflows/docker-build-push.yml`

- Triggers on push to `main`, `develop`, or version tags (`v*`)
- Build matrix: backend, face-worker, content-worker, invitations
- Registry: `ghcr.io` (GitHub Container Registry)
- Version strategy: tags → release, main → latest, develop → develop

## SSL/TLS

Traefik handles SSL termination with Let's Encrypt:
- Production: Cloudflare DNS challenge for wildcard certs
- Dev: Self-signed or HTTP only

**Deep dive:** Read `.claude/reference/deployment-best-practices.md`, `.claude/reference/traefik-best-practices.md`, `.claude/reference/kubernetes-scaling-best-practices.md`
