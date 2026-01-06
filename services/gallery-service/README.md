# Gallery Microservice

High-performance microservice for gallery viewing and proofing, capable of serving **50K concurrent Magic Link views** and real-time proofing interactions.

## Features

- **Gallery CRUD**: Full gallery management with sub-galleries
- **Magic Links**: Secure gallery sharing with PIN/password protection
- **Real-time Proofing**: WebSocket-based live updates for favorites/selections
- **Face Search**: pgvector-powered face similarity search
- **KEDA Autoscaling**: 5-20 pods based on request rate and WebSocket connections
- **3-Tier Caching**: Redis caching for gallery metadata, assets, and proofing state
- **Circuit Breaker**: Resilient Redis operations with automatic fallback

## Architecture

```
Internet
↓ HTTPS (Traefik TLS)
Gallery Microservice (5→20 pods)
↓ KEDA Scaled Deployment
├── API Layer (FastAPI):
│   ├── /v1/galleries/* → authenticated CRUD
│   ├── /v1/public/galleries/* → public view
│   ├── /v1/magic-links/* → link management
│   └── /v1/ws/* → WebSocket proofing
├── Cache Layer:
│   ├── L1: Gallery metadata (5 min TTL)
│   ├── L2: Gallery assets (2 min TTL)
│   └── L3: Proofing state (30 sec TTL)
├── Storage:
│   └── R2 Signed URLs (images bypass service)
└── Database:
    └── PostgreSQL (read replicas for public endpoints)
```

## Quick Start

### Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
uvicorn src.main:app --reload --port 8000
```

### Docker

```bash
# Build
docker build -t gallery-service .

# Run
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  gallery-service
```

### Kubernetes

```bash
# Apply with kustomize
kubectl apply -k infrastructure/kubernetes/base/gallery-service/
```

## API Endpoints

### Authenticated (requires JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/galleries` | List galleries |
| GET | `/api/v1/galleries/{id}` | Get gallery details |
| GET | `/api/v1/galleries/{id}/assets` | List gallery assets |
| POST | `/api/v1/magic-links` | Create magic link |

### Public (magic link required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/magic-links/{token}/validate` | Validate magic link |
| POST | `/api/v1/magic-links/{token}/verify-pin` | Verify PIN |
| GET | `/api/v1/public/galleries/{id}` | Get public gallery |
| GET | `/api/v1/public/galleries/{id}/assets` | Get public assets |
| POST | `/api/v1/public/galleries/{id}/proof/favorite` | Toggle favorite |
| POST | `/api/v1/public/galleries/{id}/proof/select` | Toggle selection |
| WS | `/api/v1/ws/{gallery_id}` | Real-time updates |

### Health & Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/live` | Kubernetes liveness |
| GET | `/health/ready` | Kubernetes readiness |
| GET | `/metrics` | Prometheus metrics |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `DATABASE_READ_REPLICA_URL` | - | Read replica (optional) |
| `REDIS_URL` | - | Redis connection string |
| `JWT_SECRET` | - | JWT signing secret |
| `LOG_LEVEL` | INFO | Logging level |
| `RATE_LIMIT_ENABLED` | true | Enable rate limiting |

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Public gallery views | 1000/min per IP |
| Proofing actions | 100/min per visitor |
| PIN verification | 10/min per IP |
| Face search | 20/min per visitor |

## KEDA Scaling

Scaling triggers:
- **HTTP RPS**: Scale up at 100 RPS
- **WebSocket connections**: Scale up at 500 connections
- **P95 latency**: Scale up when >1 second

Min replicas: 5
Max replicas: 20

## Testing

```bash
# Unit tests
pytest tests/unit -v

# Integration tests
pytest tests/integration -v

# All tests with coverage
pytest --cov=src --cov-report=html
```

## Metrics

Key Prometheus metrics for monitoring:

- `gallery_http_requests_total` - Request count by endpoint
- `gallery_http_request_duration_seconds` - Request latency
- `gallery_websocket_connections_active` - Active WS connections
- `gallery_proofing_actions_total` - Proofing action count
- `gallery_cache_hits_total` / `gallery_cache_misses_total` - Cache performance

## License

Proprietary - RawDrive
