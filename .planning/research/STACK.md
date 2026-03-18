# Technology Stack — RawDrive Stabilization & Completion

**Project:** RawDrive Photography SaaS — Milestone 2 (Email, AI/ML, Rate Limiting, Security)
**Researched:** 2026-03-18
**Scope:** Additions to existing stack only. Existing stack (FastAPI, React 18, PostgreSQL 16+pgvector, Redis, Docker) is not re-evaluated.

## Recommended Stack Additions

### Email Infrastructure — Postal

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Postal | 3.x (latest Docker image) | Self-hosted transactional email | Already decided in PROJECT.md. Purpose-built for transactional sending with delivery tracking, bounce handling, webhook callbacks, and web UI. Lighter than full mail servers (Stalwart, docker-mailserver) which bundle IMAP/POP3 you don't need | HIGH |
| MariaDB | 11.x | Postal's internal database | Required by Postal — MySQL is explicitly NOT supported. Run as a dedicated container; do NOT share with app PostgreSQL | HIGH |
| RabbitMQ | 3.13+ | Postal's internal message queue | Required by Postal for email queue processing. Runs as a separate container with its own vhost. Do NOT use for app messaging — keep isolated to Postal | HIGH |
| Caddy | 2.8+ | SSL termination for Postal web UI | Postal docs recommend Caddy for simplicity. Route through existing Traefik if possible, but Postal's admin UI may need its own proxy for HTTPS on a separate subdomain (e.g., postal.rawdrive.in) | MEDIUM |

**Postal Python client (for FastAPI services):**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `httpx` | 0.27+ (already in stack) | Postal HTTP API client | Postal exposes a REST API for sending. No official Python SDK exists — use httpx directly. Simpler and avoids unmaintained third-party wrappers | HIGH |

**Integration pattern:** Create a shared `EmailService` class in backend that calls Postal's HTTP API (`POST /api/v1/send/message`). All services (backend, invitations, onboarding) import this service. Do NOT install an SMTP library — use Postal's HTTP API, which returns message IDs for tracking.

**DNS requirements:** SPF, DKIM (Postal auto-generates keys), DMARC, and rDNS records. Port 25 outbound must be open on the host.

### AI/ML — CLIP Embeddings & Similarity

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `open-clip-torch` | 3.2.0 | CLIP ViT-B/32 model loading and inference | Industry standard open-source CLIP. Supports multiple pretrained checkpoints. Use `laion2b_s34b_b79k` weights for best quality. Already partially scaffolded in ai-processing-service | HIGH |
| `torch` | 2.5.1 (already in stack) | PyTorch runtime | Already pinned in ai-processing-service requirements. Provides GPU and CPU inference | HIGH |
| `Pillow` | 11.0.0 (already in stack) | Image preprocessing before CLIP | Already in stack. Used for resize/normalize before model input | HIGH |
| `numpy` | 2.2.1 (already in stack) | Embedding vector operations | Already in stack. Used for cosine similarity computation | HIGH |
| `scipy` | 1.15.0 (already in stack) | Clustering algorithms | Already in stack. Use `scipy.cluster.hierarchy` for agglomerative clustering of embeddings | HIGH |
| `scikit-learn` | 1.6+ | DBSCAN clustering for similarity groups | Add this. DBSCAN is better than hierarchical for photo similarity — no need to specify cluster count, handles noise (non-similar photos), and works with precomputed cosine distance matrices | HIGH |

**Model serving architecture:**

- Load CLIP model ONCE at ai-processing-service startup via `open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k')`
- Keep model in memory as a singleton — ViT-B/32 is ~340MB, fits comfortably in container memory
- Batch inference: process images in batches of 32-64 for throughput
- CPU inference is viable for ViT-B/32 (~50-100 images/min on modern CPU). GPU not required for photography workloads (hundreds, not millions of photos per workspace)
- Store 512-dim embeddings in pgvector `vector(512)` column on the assets table

**Clustering approach:**

- Compute cosine similarity in PostgreSQL using pgvector's `<=>` operator for nearest-neighbor queries
- For full clustering (grouping all photos): pull embeddings from DB, run DBSCAN with `metric='precomputed'` on cosine distance matrix in Python
- Cache similarity groups in Redis (replacing current in-memory storage per PROJECT.md)
- HNSW index on pgvector for fast similarity search: `CREATE INDEX ON assets USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`

### Rate Limiting

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom Redis sliding window | N/A | Rate limiting for A2A API keys | Build a thin custom implementation (~50 lines) using Redis sorted sets. The project already uses Redis 5.2+. Third-party libraries (slowapi, fastapi-limiter) add dependency overhead for a feature that needs exactly one pattern: per-API-key sliding window | HIGH |

**Why NOT slowapi:** SlowAPI is designed for per-IP/per-route rate limiting of external HTTP requests. RawDrive needs per-API-key rate limiting for inter-service A2A calls — a different pattern. SlowAPI's abstractions would fight the use case.

**Why NOT fastapi-limiter:** Similar mismatch — designed for endpoint-level decorator patterns, not middleware-level A2A key validation.

**Why NOT fastapi-advanced-rate-limiter:** New library (2025), small user base, adds unnecessary dependency for a straightforward Redis sorted set pattern.

**Implementation pattern:**
```python
# Redis sorted set sliding window — the entire implementation
async def check_rate_limit(redis: Redis, key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, now - window_seconds)  # Remove expired
    pipe.zadd(key, {str(now): now})  # Add current request
    pipe.zcard(key)  # Count requests in window
    pipe.expire(key, window_seconds)  # TTL cleanup
    results = await pipe.execute()
    return results[2] <= limit
```

### Security Hardening

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `hmac` (stdlib) | N/A | Timing-safe A2A API key comparison | Python stdlib `hmac.compare_digest()`. No library needed — this is a one-line fix replacing `==` with `hmac.compare_digest()` | HIGH |
| `asyncpg` advisory locks | Already in stack | Row-level locking for curation state machine | Use PostgreSQL advisory locks via `SELECT pg_advisory_xact_lock(workspace_id, session_id)` for state transitions. Already available through asyncpg | HIGH |

### PDF Generation (Gallery Export)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `weasyprint` | 63+ | PDF generation from HTML/CSS templates | Best Python PDF library for layout-heavy documents. Supports CSS Grid/Flexbox for photo gallery layouts. Alternative (reportlab) is too low-level for gallery-style PDFs | MEDIUM |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Email server | Postal | docker-mailserver | Full mail server with IMAP/POP3 — overkill for send-only transactional email |
| Email server | Postal | Mailtrain + Postfix | More complex setup, Mailtrain is for campaigns not transactional |
| Email server | Postal | External SaaS (SendGrid, Mailgun) | Violates self-hosted constraint, ongoing cost |
| CLIP library | open-clip-torch | openai/CLIP (original) | Archived repo, no longer maintained. open-clip is the active fork with better pretrained weights |
| CLIP library | open-clip-torch | sentence-transformers | Adds unnecessary abstraction layer. open-clip is more direct for image-only embeddings |
| CLIP serving | In-process (singleton) | CLIP-as-service (Jina) | Over-engineered for single-service use. Adds gRPC dependency and another container |
| Clustering | DBSCAN (scikit-learn) | K-Means | Requires specifying cluster count upfront — impossible for photo similarity where group count is unknown |
| Clustering | pgvector HNSW | Milvus/Qdrant | Already have pgvector in PostgreSQL. Adding a vector DB is unnecessary complexity when dataset size is workspace-scoped (thousands, not millions) |
| Rate limiting | Custom Redis sorted set | slowapi | Designed for per-IP HTTP limiting, not per-API-key A2A limiting |
| Rate limiting | Custom Redis sorted set | fastapi-advanced-rate-limiter | New, small community. Sorted set pattern is ~50 lines of code |
| PDF generation | weasyprint | reportlab | Too low-level for gallery layouts. WeasyPrint renders HTML/CSS directly |
| PDF generation | weasyprint | puppeteer/playwright | Requires Node.js/browser runtime in Python service — wrong ecosystem |

## Installation

```bash
# AI Processing Service additions (services/ai-processing-service/)
pip install open-clip-torch==3.2.0 scikit-learn>=1.6.0

# Backend additions
pip install weasyprint>=63.0

# Postal (Docker Compose addition to infrastructure/)
# No pip install — runs as separate Docker containers
# See docker-compose.postal.yml
```

## Docker Compose Addition for Postal

```yaml
# infrastructure/docker/docker-compose.postal.yml
services:
  postal-mariadb:
    image: mariadb:11
    environment:
      MARIADB_ROOT_PASSWORD: ${POSTAL_DB_ROOT_PASSWORD}
      MARIADB_DATABASE: postal
    volumes:
      - postal-mariadb-data:/var/lib/mysql
    networks:
      - postal

  postal-rabbitmq:
    image: rabbitmq:3.13-alpine
    environment:
      RABBITMQ_DEFAULT_USER: postal
      RABBITMQ_DEFAULT_PASS: ${POSTAL_RABBITMQ_PASSWORD}
      RABBITMQ_DEFAULT_VHOST: postal
    networks:
      - postal

  postal:
    image: ghcr.io/postalserver/postal:3
    depends_on:
      - postal-mariadb
      - postal-rabbitmq
    volumes:
      - ./postal-config:/config
    ports:
      - "5000:5000"   # Web UI
    networks:
      - postal
      - default       # So backend services can reach Postal API

volumes:
  postal-mariadb-data:

networks:
  postal:
    driver: bridge
```

## Key Environment Variables to Add

```env
# Postal
POSTAL_API_URL=http://postal:5000
POSTAL_API_KEY=<generated-in-postal-ui>
POSTAL_DB_ROOT_PASSWORD=<secure-password>
POSTAL_RABBITMQ_PASSWORD=<secure-password>
POSTAL_DOMAIN=postal.rawdrive.in
POSTAL_SENDER=noreply@rawdrive.in
```

## Sources

- [Postal Official Docs — Prerequisites](https://docs.postalserver.io/getting-started/prerequisites/)
- [Postal Official Docs — Installation](https://docs.postalserver.io/getting-started/installation/)
- [Postal Docker Compose](https://github.com/postalserver/postal/blob/main/docker-compose.yml)
- [open-clip-torch on PyPI](https://pypi.org/project/open-clip-torch/) — v3.2.0, Feb 2026
- [open-clip GitHub](https://github.com/mlfoundations/open_clip)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [HNSW Indexes with pgvector — Crunchy Data](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector)
- [FastAPI + CLIP Docker — PyImageSearch](https://pyimagesearch.com/2025/03/24/fastapi-meets-openai-clip-build-and-deploy-with-docker/)
- [Redis Sliding Window Rate Limiter for FastAPI](https://dev.to/jpegcreate/building-a-distributed-rate-limiter-for-fastapi-with-redis-sliding-window-algorithm-5h10)
- [SlowAPI GitHub](https://github.com/laurentS/slowapi)
