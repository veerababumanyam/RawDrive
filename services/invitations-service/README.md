# Invitations Microservice

Production-ready microservice for digital wedding invitations, guest management, and RSVP handling.

## Architecture

This microservice is part of the RawDrive platform and handles:
- **Guest Management**: CSV import, bulk operations, status tracking
- **RSVP Handling**: Public submission, edit tokens, rate limiting
- **Analytics**: Response metrics, time-series data, conversion rates
- **Audit Logging**: Immutable action logs for compliance
- **Bulk Email**: Batch sending with rate limiting via SendGrid

> **Note**: Invitation CRUD operations are handled by the main backend service.
> This microservice focuses on guest operations, caching, and analytics.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL=postgresql://...
export REDIS_URL=redis://...
export SENDGRID_API_KEY=...

# Run the service
uvicorn src.main:app --host 0.0.0.0 --port 8080

# Or with Docker
docker-compose up -d
```

## API Endpoints

### Health Checks
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health/live` | GET | Liveness probe |
| `/health/ready` | GET | Readiness probe (checks DB, Redis) |
| `/metrics` | GET | Prometheus metrics |

### RSVP (Public)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/invitations/{slug}/rsvp` | POST | Submit RSVP response |
| `/v1/invitations/{slug}/rsvp/{id}` | GET | Get RSVP details (requires edit token) |
| `/v1/invitations/{slug}/rsvp/{id}` | PATCH | Update RSVP (requires edit token) |

### Guest Management (Authenticated)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/workspaces/{id}/guests` | GET | List guests (paginated) |
| `/v1/workspaces/{id}/guests` | POST | Create guest |
| `/v1/workspaces/{id}/guests/{id}` | GET | Get guest details |
| `/v1/workspaces/{id}/guests/{id}` | PATCH | Update guest |
| `/v1/workspaces/{id}/guests/{id}` | DELETE | Delete guest |
| `/v1/workspaces/{id}/guests/import` | POST | Import guests from CSV |
| `/v1/workspaces/{id}/guests/export` | GET | Export guests to CSV |

### Analytics (Authenticated)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/workspaces/{id}/invitations/{id}/analytics` | GET | Get invitation analytics |
| `/v1/workspaces/{id}/invitations/{id}/analytics/time-series` | GET | Time-series data |

### Bulk Operations (Authenticated)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/workspaces/{id}/invitations/{id}/bulk-invite` | POST | Send bulk invitations |
| `/v1/workspaces/{id}/invitations/{id}/bulk-invite/{id}/status` | GET | Check bulk job status |

### Audit Log (Authenticated)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/workspaces/{id}/audit-log` | GET | List audit events (paginated) |

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Default API | 100 requests/minute |
| RSVP Submit | 10 requests/minute per IP |
| CSV Import | 5 requests/hour |
| Bulk Invite | 10 requests/hour |

## Security Features

- **HMAC-SHA256 Edit Tokens**: Secure, stateless tokens for RSVP editing
- **Constant-Time Comparison**: Prevents timing attacks on token verification
- **XSS Prevention**: HTML escaping in email templates
- **Input Validation**: Pydantic schemas with strict validation
- **Audit Logging**: Immutable action logs with IP tracking
- **Workspace Isolation**: All queries scoped to workspace_id

## Resilience Patterns

- **Circuit Breaker**: Protects against cascading failures
- **Retry with Backoff**: Exponential backoff for transient failures
- **Fallback Handlers**: Graceful degradation when services are unavailable
- **Health Checks**: Kubernetes-compatible liveness/readiness probes

## Observability

- **Prometheus Metrics**: Request latency, error rates, business metrics
- **Structured Logging**: JSON logs with correlation IDs
- **Health Dashboard**: Real-time service status

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test category
pytest -m integration
pytest -m security
```

## Configuration

See `src/config.py` for all configuration options. Key environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `SENDGRID_API_KEY` | SendGrid API key for emails | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `EDIT_TOKEN_SECRET` | HMAC secret for edit tokens | No (falls back to JWT_SECRET) |

## API Documentation

Full OpenAPI specification available at:
- **Spec File**: `../specs/018-invitations-production-readiness/contracts/openapi.yaml`
- **Swagger UI**: `/docs` (when running in development mode)
- **ReDoc**: `/redoc` (when running in development mode)

## License

Proprietary - RawDrive Platform
