# External Integrations

**Analysis Date:** 2026-03-18

## APIs & External Services

**Payment Processing:**
- Razorpay - Payment gateway for Indian customers
  - SDK/Client: `razorpay` (Python)
  - Auth: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
  - Webhooks: `RAZORPAY_WEBHOOK_SECRET`
  - Files: `backend/src/app/services/razorpay_service.py`

**AI & Vision Services:**
- Google Cloud Vision - Face detection (primary)
  - SDK/Client: `google-cloud-vision` Python client
  - Auth: Via Google Cloud service account (configured in backend)
  - Fallback provider with Gemini vision capabilities
  - Files: `backend/src/app/services/ai/providers/google_vision_provider.py`

- Google Gemini - Face detection fallback, vision analysis
  - SDK/Client: `google-generativeai` Python package
  - Auth: `GEMINI_API_KEY`
  - Models: gemini-2.5-flash (default), gemini-3-flash-preview, gemini-3-pro-preview
  - Files: `backend/src/app/services/ai/providers/gemini_provider.py`

- OpenAI - Optional LLM integration
  - SDK/Client: `openai` Python client (not explicitly in deps, loaded dynamically)
  - Auth: `OPENAI_API_KEY`
  - Purpose: Alternative LLM provider

- Anthropic - Optional Claude integration
  - SDK/Client: `anthropic` Python client (not explicitly in deps)
  - Auth: `ANTHROPIC_API_KEY`
  - Purpose: Alternative LLM provider

- Azure OpenAI - Optional enterprise LLM
  - SDK/Client: Via OpenAI library with Azure configuration
  - Auth: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`
  - Config: `AZURE_OPENAI_DEPLOYMENT`

- Ollama - Local LLM fallback
  - SDK/Client: HTTP API
  - Base URL: `OLLAMA_BASE_URL` (default: http://localhost:11434)
  - Purpose: Local AI inference

- LM Studio - Local LLM alternative
  - SDK/Client: HTTP API
  - Base URL: `LM_STUDIO_BASE_URL` (default: http://localhost:1234)

**Email Delivery:**
- SendGrid - Primary email service
  - SDK/Client: `sendgrid` Python package
  - Auth: `SENDGRID_API_KEY`
  - Config: `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`
  - Files: `backend/src/app/services/email_service.py`
  - Features: Template-based email, delivery tracking

- SMTP - Fallback email provider
  - Auth: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`
  - Config: `SMTP_USE_TLS`, `SMTP_USE_SSL`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_TIMEOUT`
  - Supports both TLS (587) and SSL (465) connections

**Authentication:**
- Google OAuth 2.0 - User authentication
  - Client ID/Secret: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - Redirect URI: `GOOGLE_REDIRECT_URI`
  - Scope: Login/signup only (NOT for gallery sync)
  - Control: `GALLERY_SETTINGS_SYNC_ENABLED` (disabled by default)
  - Note: Gallery settings remain independent per security/privacy requirements

**GeoIP Services:**
- MaxMind GeoIP2 - IP geolocation
  - SDK/Client: `geoip2` Python package (4.7+)
  - Purpose: Geo-location lookups, analytics

## Data Storage

**Databases:**
- PostgreSQL 16 (TimescaleDB variant)
  - Client: `asyncpg` (async driver), `SQLAlchemy` (ORM), `psycopg2-binary` (fallback)
  - Connection: `DATABASE_URL` or via `PGBOUNCER_HOST`/`PGBOUNCER_PORT` if enabled
  - Extensions: pgvector, pgvectorscale, TimescaleDB
  - Use: All structured data, vector embeddings, time-series metrics
  - Pool: asyncpg with min/max size config, PgBouncer for scaling 5000+ concurrent

- Redis 7+
  - Client: `redis[hiredis]` Python package (5.0+)
  - Connection: `REDIS_URL`
  - Pool: Configurable (max 50 connections default)
  - Use: Caching, session storage, task queue (Celery)

- Milvus Vector Database (optional)
  - Enabled: `MILVUS_ENABLED` (false by default)
  - Config: `MILVUS_HOST` (localhost), `MILVUS_PORT` (19530)
  - Purpose: Vector similarity search (alternative to pgvector)

**File Storage:**
- Cloudflare R2 (S3-compatible)
  - Auth: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  - Config: `R2_BUCKET_NAME`, `R2_ENDPOINT_URL` (template), `R2_ACCOUNT_ID`
  - Purpose: Media storage (photos, exports, assets)
  - Signed URLs: `SIGNED_URL_SECRET` for pre-signed downloads

**Caching:**
- Redis 7+ (in-memory)
  - Connection: `REDIS_URL`
  - Use: Session caching, rate limiting, Celery broker

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based
  - Implementation: `python-jose` with EdDSA algorithm
  - Keys: `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH` (RSA or EdDSA)
  - Tokens: Access (15 min), Refresh (7 days), Extended refresh (30 days)
  - Storage: JWT in HTTP-only cookies (secure)
  - Multi-tenant: Each user tied to workspace_id (extracted from JWT, never client-provided)

**OAuth:**
- Google OAuth 2.0
  - Endpoint: `GOOGLE_REDIRECT_URI`
  - Purpose: Social login only

**Password Security:**
- Argon2 hashing
  - Library: `argon2-cffi`
  - Params: `ARGON2_MEMORY_COST` (65536), `ARGON2_TIME_COST` (3), `ARGON2_PARALLELISM` (4)

**2FA/TOTP:**
- TOTP support via `pyotp`

## Monitoring & Observability

**Error Tracking:**
- Sentry (optional)
  - Config: `SENTRY_DSN` (if set, error tracking enabled)

**Logs:**
- Structured logging: `structlog` 24.1.0+
  - Format: Configurable (`LOG_FORMAT`: 'json', 'console', 'plain')
  - Default: JSON in prod/staging, console in dev
  - Aggregation: Loki (via Promtail) in Docker Compose

**Metrics:**
- Prometheus
  - Endpoint: `/metrics` on all services
  - Collection: Prometheus scrapes at :9090
  - Visualization: Grafana (:3000, admin/admin)

**Alerting:**
- AlertManager (via Prometheus)
  - Config: `infrastructure/monitoring/prometheus/alertmanager.yaml`

**Log Aggregation:**
- Grafana Loki
  - Port: :3100
  - Collection: Promtail from Docker logs
  - Retention: Configured in `infrastructure/loki/loki-config.yaml`

## CI/CD & Deployment

**Hosting:**
- Docker containers
- Docker Compose orchestration for local dev
- Production: Kubernetes-ready (12-factor app compliant)

**API Gateway:**
- Traefik 3.0
  - Dashboard: :8080 (localhost only)
  - HTTP → HTTPS redirect
  - Service discovery: Docker labels + dynamic config
  - Config files: `infrastructure/docker/traefik/traefik.dev.yaml`, `dynamic.dev.yaml`

**Reverse Proxy:**
- Traefik routes all microservices
- Port mapping: Backend :8000, Gallery :8004, Billing :8005, etc.

**CI Pipeline:**
- Not detected (likely external, GitHub Actions or similar)

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_PRIVATE_KEY_PATH` - EdDSA private key file path
- `JWT_PUBLIC_KEY_PATH` - EdDSA public key file path
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `GOOGLE_REDIRECT_URI` - OAuth callback URL
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` - Object storage
- `SIGNED_URL_SECRET` - 32-byte hex for signed URL generation
- `ENCRYPTION_MASTER_KEY` - 32-byte hex for data encryption

**Optional but recommended:**
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` - Payments
- `SENDGRID_API_KEY` or SMTP config - Email delivery
- `GEMINI_API_KEY` - AI features
- `SENTRY_DSN` - Error tracking

**Secrets location:**
- `.env` file (local development, not committed)
- Environment variables (Docker, CI/CD)
- Kubernetes Secrets (production)

## Webhooks & Callbacks

**Incoming:**
- Razorpay webhooks (payment events)
  - Endpoint: `backend/src/app/api/v1/webhooks` (likely)
  - Verification: HMAC signature via `RAZORPAY_WEBHOOK_SECRET`

**Outgoing:**
- Webhooks service (microservice :8003)
  - Purpose: Event-driven webhook delivery to third parties
  - Pattern: Service publishes events → Webhooks service delivers to registered endpoints

**Inter-service Communication:**
- Direct HTTP via microservice URLs
- JWT validation for all requests (shared `JWT_SECRET`)
- Example: Invitations service at `INVITATIONS_SERVICE_URL`

---

*Integration audit: 2026-03-18*
