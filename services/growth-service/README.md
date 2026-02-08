# Growth Microservice

Dedicated microservice for handling referrals, partner programs, and user engagement gamification.

## Features

- **Peer-to-Peer Referrals**: Generate and track referral codes for user acquisition
- **Partner Program**: Affiliate system with commission tracking and payouts
- **Setup Goals**: Gamification system for onboarding engagement
- **Credit Ledger**: AI credits management for rewards

## Tech Stack

- FastAPI 0.115+
- Python 3.11
- asyncpg (PostgreSQL)
- Redis (caching)
- Prometheus (metrics)
- Stripe Connect (partner payouts)

## Local Development

### Prerequisites

- Docker Desktop for Windows
- Python 3.11 (for local development)

### Running with Docker Compose

```bash
# Start all services
cd infrastructure/docker
docker compose up growth-service

# Or start in detached mode
docker compose up -d growth-service
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

All endpoints are prefixed with `/api/v1`:

#### Referrals (`/referrals`)
- `GET /referral-code` - Get user's referral code
- `POST /referral-code` - Generate new referral code
- `GET /referral-code/{code}/validate` - Validate a referral code

#### Conversions (`/conversions`)
- `POST /conversions` - Record a referral conversion
- `GET /conversions` - List user's referral conversions

#### Credits (`/credits`)
- `GET /credits/balance` - Get user's credit balance
- `GET /credits/transactions` - List credit transactions

#### Partners (`/partners`)
- `POST /partners/apply` - Apply for partner program
- `GET /partners/dashboard` - Partner analytics dashboard
- `POST /partners/payout-request` - Request payout

#### Goals (`/goals`)
- `GET /goals` - List setup goals with progress
- `POST /goals/{goal_id}/complete` - Mark goal as complete

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

- **Port**: 8016
- **Database**: Shared PostgreSQL with main backend
- **Cache**: Redis
- **Scale Target**: 100-500 concurrent users
- **Replicas**: 2-20 (KEDA autoscaling in Kubernetes)

## Monitoring

Prometheus metrics exposed at `/metrics`:

- `growth_http_requests_total` - Request count
- `growth_http_request_duration_seconds` - Request latency
- `growth_referrals_created_total` - Referral codes generated
- `growth_conversions_total` - Referral conversions tracked
- `growth_credits_awarded_total` - Credits awarded to users
- `growth_partner_applications_total` - Partner applications received
- `growth_payouts_processed_total` - Partner payouts processed
