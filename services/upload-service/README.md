# Upload Service

High-performance upload microservice for RawDrive with TUS protocol support and KEDA autoscaling.

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

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/upload/session` | Create upload session |
| PATCH | `/api/v1/upload/chunk/{upload_id}` | Upload chunk (TUS) |
| HEAD | `/api/v1/upload/chunk/{upload_id}` | Get upload status |
| DELETE | `/api/v1/upload/chunk/{upload_id}` | Cancel upload |
| POST | `/api/v1/upload/complete/{upload_id}` | Commit upload |
| POST | `/api/v1/upload/check-duplicate` | Check for duplicates |
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe |
| GET | `/metrics` | Prometheus metrics |

## Upload Flow

```
1. POST /session → Create session, get upload_id
2. PATCH /chunk/{upload_id} → Upload chunks (repeat)
3. HEAD /chunk/{upload_id} → Check progress (optional)
4. POST /complete/{upload_id} → Commit upload
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
│  API Layer                                               │
│  ├── POST /session     → Create upload session          │
│  ├── PATCH /chunk      → Store chunks (TUS protocol)    │
│  ├── POST /complete    → Assemble, encrypt, upload      │
│  └── POST /check-dup   → Deduplicate by SHA256          │
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

Configuration: `infrastructure/kubernetes/base/upload-service/scaledobject.yaml`

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

# Load tests
locust -f tests/load/locustfile.py
```

## Deployment

### Kubernetes

```bash
# Apply manifests
kubectl apply -k infrastructure/kubernetes/base/upload-service/

# Verify deployment
kubectl get pods -l app=upload-service
kubectl get scaledobject upload-service-scaledobject
```

### Blue-Green Deployment

1. Deploy new version to `upload-service-green`
2. Run smoke tests against green service
3. Switch Traefik routing to green
4. Monitor for 24 hours
5. Remove blue deployment

## License

Proprietary - RawDrive
