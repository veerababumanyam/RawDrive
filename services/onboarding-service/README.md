# Onboarding Microservice

Dedicated microservice for handling user onboarding and registration flow.

## Features

- **Plan Selection**: Choose subscription plan (monthly/annual)
- **User Registration**: Email/password or Google OAuth
- **Email Verification**: Secure token-based verification
- **Payment Processing**: Stripe integration
- **Workspace Creation**: Automatic workspace setup

## Tech Stack

- FastAPI 0.115+
- Python 3.11
- asyncpg (PostgreSQL)
- Redis (caching)
- Prometheus (metrics)
- Stripe (payments)

## Local Development

### Prerequisites

- Docker Desktop for Windows
- Python 3.11 (for local development)

### Running with Docker Compose

```bash
# Start all services
cd infrastructure/docker
docker compose up onboarding-service

# Or start in detached mode
docker compose up -d onboarding-service
```

### Environment Variables

See `.env.example` for required configuration.

**Critical**: `JWT_SECRET` must match the main backend exactly.

### Health Checks

- `GET /health` - Basic health
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

### API Endpoints

All endpoints are prefixed with `/api/v1/onboarding`:

- `POST /start` - Start onboarding session
- `GET /status` - Get session status
- `POST /select-plan` - Select subscription plan
- `POST /register` - Register with email/password
- `POST /verify-email` - Verify email with token
- `POST /payment/create-intent` - Create Stripe payment intent
- `POST /payment/confirm` - Confirm payment
- `POST /complete` - Complete onboarding
- `DELETE /abandon` - Abandon session

### Testing

```bash
# Unit tests
pytest tests/unit

# Integration tests
pytest tests/integration

# All tests with coverage
pytest --cov=src tests/
```

## Architecture

- **Port**: 8005
- **Database**: Shared PostgreSQL with main backend
- **Cache**: Redis
- **Scale Target**: 100-500 concurrent users
- **Replicas**: 2-20 (KEDA autoscaling in Kubernetes)

## Monitoring

Prometheus metrics exposed at `/metrics`:

- `onboarding_http_requests_total` - Request count
- `onboarding_http_request_duration_seconds` - Request latency
- `onboarding_sessions_started_total` - Sessions started
- `onboarding_sessions_completed_total` - Sessions completed
- `onboarding_payment_intents_created_total` - Payments initiated
