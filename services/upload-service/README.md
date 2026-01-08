# Upload Service

High-performance upload microservice for RawDrive with TUS protocol support and KEDA autoscaling.

## Recent Changes (v2.0.0)

✅ **API Modernization**: Migrated to RESTful resource-based routes
✅ **Full Service Ownership**: All manifests, scripts, and docs in service folder
✅ **Comprehensive Testing**: Integration tests and E2E route validation
✅ **Updated Documentation**: 7 comprehensive docs (ARCHITECTURE, API, DEPLOYMENT, etc.)

See [docs/](docs/) for detailed documentation.

## Features

- **TUS Protocol**: Resumable uploads with pause/resume capability
- **Chunked Uploads**: 5MB chunks with Redis buffering
- **File Encryption**: AES-256-CTR encryption with per-workspace keys
- **KEDA Autoscaling**: Scale from 2-50 pods based on demand
- **Circuit Breaker**: Resilient R2 storage operations
- **Rate Limiting**: Per-workspace request limits

## Quick Start

### Development

```bash
# Copy environment file
cp .env.example .env

# Install dependencies
pip install -e .

# Run service
uvicorn app.main:app --reload --port 8080
```

### Docker

```bash
# Build image
docker build -t rawdrive/upload-service:latest .

# Run container
docker run -p 8080:8080 --env-file .env rawdrive/upload-service:latest
```

### Docker Compose (from project root)

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up upload-service
```

## API Endpoints

**RESTful v2.0.0 Routes** (Current):

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/uploads` | Create upload session |
| PATCH | `/api/v1/uploads/{upload_id}/chunks` | Upload chunk (TUS) |
| HEAD | `/api/v1/uploads/{upload_id}/chunks` | Get upload status |
| DELETE | `/api/v1/uploads/{upload_id}` | Cancel upload |
| POST | `/api/v1/uploads/{upload_id}/complete` | Complete upload |
| POST | `/api/v1/uploads/check-duplicate` | Check for duplicates |
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe |
| GET | `/metrics` | Prometheus metrics |

## Upload Flow

```
1. POST /api/v1/uploads → Create session, get upload_id
2. PATCH /api/v1/uploads/{upload_id}/chunks → Upload chunks (repeat)
3. HEAD /api/v1/uploads/{upload_id}/chunks → Check progress (optional)
4. POST /api/v1/uploads/{upload_id}/complete → Complete upload
```

## Environment Variables

See [.env.example](.env.example) for all configuration options.

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing secret (must match backend) |
| `R2_ENDPOINT_URL` | R2/S3 endpoint URL |
| `R2_ACCESS_KEY_ID` | R2/S3 access key |
| `R2_SECRET_ACCESS_KEY` | R2/S3 secret key |
| `R2_BUCKET_NAME` | Storage bucket name |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Upload Service                        │
├─────────────────────────────────────────────────────────┤
│  API Layer (RESTful v2.0.0)                              │
│  ├── POST /uploads                → Create session      │
│  ├── PATCH /uploads/{id}/chunks   → Store chunks (TUS)  │
│  ├── POST /uploads/{id}/complete  → Assemble & upload   │
│  └── POST /uploads/check-duplicate → Deduplicate        │
├─────────────────────────────────────────────────────────┤
│  Service Layer                                           │
│  ├── UploadService     → Session management             │
│  ├── ChunkedService    → Redis chunk storage            │
│  ├── EncryptionService → AES-256-CTR encryption         │
│  ├── R2StorageService  → S3 multipart uploads           │
│  └── EventProducer     → Kafka events                   │
├─────────────────────────────────────────────────────────┤
│  Infrastructure                                          │
│  ├── Redis             → Chunk buffering                │
│  ├── PostgreSQL        → Session/asset records          │
│  ├── R2/S3             → File storage                   │
│  └── Kafka             → Processing events              │
└─────────────────────────────────────────────────────────┘
```

## KEDA Autoscaling

The service scales based on:

1. **Kafka Lag**: Scale when `upload-queue` lag > 100 messages
2. **Concurrent Uploads**: Scale when active uploads > 50
3. **Request Rate**: Scale when requests > 1000/min

Configuration: `services/upload-service/infrastructure/keda/scaledobject.yaml`

**Scaling Range**: 2-50 pods (configurable)

## Metrics

Prometheus metrics exposed at `/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `upload_concurrent_total` | Gauge | Current concurrent uploads |
| `upload_chunk_bytes_total` | Counter | Total bytes uploaded |
| `upload_session_duration_seconds` | Histogram | Upload duration |
| `upload_errors_total` | Counter | Errors by type |
| `upload_requests_total` | Counter | Requests by endpoint |

## Testing

```bash
# Unit tests
pytest tests/unit/

# Integration tests (requires running services)
pytest tests/integration/

# E2E route validation tests
cd ../../tests/e2e && npx playwright test upload-routes.spec.ts

# Load tests
locust -f tests/load/locustfile.py
```

## Documentation

Comprehensive documentation is available in the [docs/](docs/) directory:

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, TUS protocol, encryption pipeline |
| [API.md](docs/API.md) | Complete API reference with request/response schemas |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment procedures for Docker and Kubernetes |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [PERFORMANCE.md](docs/PERFORMANCE.md) | Performance tuning and optimization |
| [SECURITY.md](docs/SECURITY.md) | Security practices, JWT validation, SOC2/GDPR compliance |
| [TRAEFIK_ROUTING.md](docs/TRAEFIK_ROUTING.md) | Traefik routing configuration reference |

## Deployment

### Kubernetes

```bash
# Apply manifests from service folder
kubectl apply -k services/upload-service/infrastructure/k8s/

# Verify deployment
kubectl get pods -l app=upload-service
kubectl get scaledobject upload-service-scaledobject

# Check service routing (Traefik)
kubectl get ingressroute upload-service
```

### Development Scripts

```bash
# Start service locally
bash services/upload-service/scripts/dev.sh
# OR on Windows:
pwsh services/upload-service/scripts/dev.ps1

# Run integration tests
bash services/upload-service/scripts/test-integration.sh

# Test autoscaling
bash services/upload-service/scripts/test-autoscaling.sh
```

### Blue-Green Deployment

1. Deploy new version to `upload-service-green`
2. Run smoke tests against green service
3. Switch Traefik routing to green
4. Monitor for 24 hours
5. Remove blue deployment

## License

Proprietary - RawDrive
