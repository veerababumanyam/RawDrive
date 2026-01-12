# Deployment Best Practices Reference

A concise reference guide for deploying the RawDrive Microservices Architecture.

---

## Table of Contents

1. [Microservices Architecture](#1-microservices-architecture)
2. [Containerization (Docker)](#2-containerization-docker)
3. [Orchestration (Docker Compose & K8s)](#3-orchestration-docker-compose--k8s)
4. [API Gateway (Traefik)](#4-api-gateway-traefik)
5. [Database & State](#5-database--state)
6. [Frontend Deployment (PWA)](#6-frontend-deployment-pwa)
7. [Environment Configuration](#7-environment-configuration)
8. [Monitoring & Observability](#8-monitoring--observability)
9. [CI/CD Pipelines](#9-cicd-pipelines)

---

## 1. Microservices Architecture

The system is split into specialized services to ensure scalability and fault isolation:

*   **`gallery-service`**: Public gallery access, passwords, interactions.
*   **`upload-service`**: Resumable (TUS) uploads, processing triggers.
*   **`ai-service`**: Heavy ML workloads, face recognition, semantic search.
*   **`billing-service`**: Payments, subscriptions, invoicing.
*   **`webhooks-service`**: Asynchronous event delivery.
*   **`backend` (Core)**: Legacy/Administrative functions (being decomposed).

**Best Practice:**
*   Services communicate via HTTP (REST) or async events (Redis/BullMQ).
*   Services do **not** share database tables directly (conceptually), though they may share the physical DB cluster with schema separation.
*   Use the "Anti-Corruption Layer" pattern when dealing with legacy code.

---

## 2. Containerization (Docker)

### Multi-Stage Builds

Always use multi-stage builds to minimize image size.

```dockerfile
# Builder Stage
FROM python:3.11-slim as builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-warn-script-location -r requirements.txt

# Runtime Stage
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
CMD ["uvicorn", "main:app", "--host", "0.0.0.0"]
```

### Dockerignore

Crucial for build speed and security.

```text
__pycache__
*.pyc
.env
.git
.pytest_cache
tests/
```

---

## 3. Orchestration (Docker Compose & K8s)

### Development (Docker Compose)

We use `infrastructure/docker/docker-compose.yml` for local dev.
*   **Services:** `restart: unless-stopped`
*   **Networking:** All services on `rawdrive-network`.
*   **Volumes:** Persist usage data `postgres_data:/var/lib/postgresql/data`.

### Production (Kubernetes)

*   **Manifests:** Located in `infrastructure/kubernetes/`.
*   **Scaling:** Use HPA (Horizontal Pod Autoscaler) or **KEDA** for event-driven scaling (e.g., scale `processing-worker` based on RabbitMQ/Redis queue depth).
*   **Health Checks:** Define `livenessProbe` and `readinessProbe` for all deployments.

---

## 4. API Gateway (Traefik)

Traefik v3 is the single entry point (Ingress).

### Configuration (`infrastructure/docker/traefik.yml`)

*   **EntryPoints:** `web` (80), `websecure` (443).
*   **Providers:** Docker (auto-discovery) & File.
*   **Certificates:** Automatic Let's Encrypt (ACME) via HTTP Challenge.

### Labels (Service Discovery)

Define routing rules in `docker-compose.yml` labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.gallery.rule=Host(`rawdrive.com`) && PathPrefix(`/api/v1/galleries`)"
  - "traefik.http.services.gallery.loadbalancer.server.port=8000"
```

**Best Practice:**
*   Never expose microservice ports (8001, 8002) directly to the public internet.
*   Enforce HTTPS redirection at the Traefik level.

---

## 5. Database & State

### PostgreSQL (Production)

*   **Pooling:** ALways use **PgBouncer** in production to manage connections from multiple microservices.
*   **Extensions:** Ensure `vector` extension is enabled for AI features.
*   **Backups:** Automated, Point-in-Time Recovery (PITR) to S3/R2 (e.g., with Wal-G).

### Redis (Cache & Queue)

*   **Persistence:** Enable `appendonly yes` (AOF) for task queue reliability.
*   **Separation:** Use DB numbers or key prefixes to separate Cache vs. Queue vs. Sessions.

### Storage (Cloudflare R2)

*   **CDN:** Serve public assets via custom domain (`cdn.rawdrive.com`) behind Cloudflare.
*   **Private Assets:** Use Presigned URLs (Signed URLs) with short expiry (e.g., 1 hour).

---

## 6. Frontend Deployment (PWA)

*   **Build:** `npm run build` produces static assets.
*   **Serving:** Nginx container serves the static folder.
*   **Caching:**
    *   `index.html`: `no-cache` (must revalidate ETag).
    *   JS/CSS (hashed): `immutable, max-age=31536000`.

**Environment Injection:**
Do not bake `VITE_API_URL` into the build image if possible. Use a runtime script (`env.sh`) for Docker portability or standard generic `/api` proxying via Nginx/Traefik.

---

## 7. Environment Configuration

### Pydantic Settings

Use `pydantic-settings` to strictly validate env vars on startup.

```python
class Settings(BaseSettings):
    DATABASE_URL: PostgresDsn
    REDIS_URL: RedisDsn
    ENVIRONMENT: Literal["dev", "prod"]

    model_config = SettingsConfigDict(env_file=".env")
```

### Secrets Checks

*   **Never** commit `.env` files.
*   Rotate **JWT_SECRET** periodically.

---

## 8. Monitoring & Observability

### Stack

*   **Prometheus:** Metrics scraping.
*   **Grafana:** Dashboards.
*   **Loki:** Log aggregation.
*   **Promtail:** Log shipping from containers.

### Best Practices

*   **JSON Logging:** Services should output logs in JSON format for better parsing in Loki.
*   **Correlation IDs:** Pass `X-Request-ID` header through all microservices to trace requests.
*   **Metrics:** Expose `/metrics` endpoint in every service (using `prometheus-fastapi-instrumentator`).

---

## 9. CI/CD Pipelines

(Refer to GitHub Actions workflows in `.github/workflows`)

1.  **Commit:** Triggers Unit Tests (`pytest`).
2.  **Merge to Main:** Triggers Build & Push Docker Image.
3.  **Deploy:** Updates K8s manifest / SSH into VPS to `docker compose pull && down && up`.

**Database Migrations:**
Run migrations (`alembic upgrade head`) as a constrained job **before** rolling out new app usage code.
