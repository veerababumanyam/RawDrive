# RawDrive Technology Stack & Build System

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                             │
│  (Web Browser, Mobile Apps, Desktop Applications)            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Frontend Layer                              │
│  (React 19, TypeScript, Vite, Tailwind CSS)                │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   API Gateway                                │
│  (Load Balancer, Rate Limiting, Authentication)             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Backend Layer                               │
│   (Python 3.11+, FastAPI, asyncpg)          │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
┌───────▼──┐  ┌──────▼──┐  ┌─────▼──────┐
│ Database │  │  Cache  │  │   Storage  │
│(PostgreSQL)│ (Redis) │  │  (Cloudflare R2 + BYOS)  │
└──────────┘  └─────────┘  └────────────┘
```

## Frontend Stack

### Core Framework
- **React 19+**: Modern UI library with hooks and concurrent rendering
- **TypeScript**: Static type checking for better IDE support and code quality
- **Vite**: Lightning-fast build tool with HMR and optimized production builds
- **Tailwind CSS**: Utility-first CSS framework with dark mode support

### UI & Styling
- **Lucide React**: 1000+ consistent SVG icons
- **Framer Motion**: Smooth animations and transitions
- **CSS Variables**: Centralized design tokens (colors, typography, spacing)
- **Glass Morphism**: Modern frosted glass effects for premium UI

### State Management
- **React Context API**: Built-in state management for app-wide state
- **Custom Hooks**: Reusable logic with composition patterns
- **React Query**: Server state management and caching (optional)

### Form Handling
- **React Hook Form**: Lightweight form library with minimal re-renders
- **Zod**: Schema validation with type inference and runtime validation

### HTTP Client
- **Fetch API**: Native browser API for HTTP requests
- **Axios** (optional): Request/response interceptors and timeout support

### Testing
- **Vitest**: Fast unit test runner with Jest-compatible API
- **@testing-library/react**: Component testing with user-centric approach
- **Playwright**: End-to-end testing with cross-browser support

### Build & Deployment
- **npm/pnpm**: Package management with dependency resolution
- **GitHub Actions**: CI/CD pipeline for automated testing and deployment

## Backend Stack

### Runtime & Framework
- **Python 3.11+**: Modern Python with asyncio support
- **FastAPI**: High-performance async web framework
- **Pydantic**: Data validation and settings management using Python type hints

### API Development
- **REST API**: Standard HTTP methods
- **OpenAPI/Swagger**: Auto-generated interactive API docs (FastAPI default)
- **asyncpg**: High-performance async PostgreSQL driver (Raw SQL)

### Authentication & Authorization
- **JWT (JSON Web Tokens)**: Stateless authentication with 15-minute expiry
- **Refresh Tokens**: 7-day expiry stored in httpOnly cookies
- **OAuth 2.0**: Social login and third-party authentication
- **SAML/OIDC**: Enterprise SSO (Azure AD first)
- **bcrypt**: Password hashing with 12 rounds
- **Argon2**: Modern password hashing (OWASP recommended)

### Database
- **PostgreSQL 16+**: ACID-compliant relational database
- **asyncpg**: High-performance async PostgreSQL driver
- **Alembic**: Database migrations

### Caching
- **Redis 7**: In-memory data store for sessions, cache, and pub/sub
- **Redis Cluster**: High availability with automatic failover

### File Storage
- **Cloudflare R2**: Object storage (managed, default)
- **Cloudflare CDN**: Global content delivery with edge caching
- **Google Drive API**: BYOS option with OAuth
- **Dropbox API**: BYOS option with OAuth
- **AWS S3**: BYOS option for enterprise customers
- **Azure Blob**: BYOS option for enterprise customers

### Background Jobs
- **BullMQ**: Redis-based job queue with retry logic and scheduling
- **Background Workers**: Separate process for long-running tasks

### Email Service
- **SendGrid**: Email delivery with transactional templates
- **Mailgun** (optional): Email API with webhook support

### AI Integration
- **Multi-Provider Support**:
  - Google Gemini (primary/default)
  - OpenAI
  - Anthropic
  - Azure-hosted models (Azure OpenAI / Azure AI Foundry)
  - OpenAI-compatible local servers (Ollama, LM Studio)
- **pgvector**: Store embeddings for semantic search
- **Model Router**: Switch providers and models without code changes

### Payment Processing
- **Razorpay**: Primary payment gateway (India-first)
- **Stripe**: Alternative payment processor
- **Webhook Support**: Secure payment status updates

### Logging & Monitoring
- **Winston**: Structured logging with multiple transports
- **OpenTelemetry**: Unified traces, metrics, and logs instrumentation
- **Prometheus**: Metrics collection and time-series database
- **Grafana**: Dashboards and visualization
- **Loki**: Log aggregation
- **Tempo/Jaeger**: Distributed tracing
- **Sentry (self-hosted) / GlitchTip**: Error tracking and exception aggregation

### Security
- **Helmet.js**: HTTP headers security (XSS, CSRF, CSP)
- **express-rate-limit**: Rate limiting and DDoS protection
- **CORS**: Cross-origin request validation
- **Cloudflare WAF**: Web application firewall at edge

### Testing
- **Vitest**: Frontend unit testing
- **Pytest**: Backend testing framework
- **Hypothesis**: Property-based testing for backend

## Infrastructure

### Hosting (Default)
- **Hostinger VPS (KVM)**: Virtual private server
- **Self-managed Kubernetes (kubeadm)**: Container orchestration
- **Nginx Ingress**: Load balancing and routing
- **cert-manager**: Let's Encrypt SSL/TLS certificates

### Containerization
- **Docker**: Container images for consistent environments
- **Docker Compose**: Multi-container orchestration for development

### CI/CD
- **GitHub Actions**: Workflow automation for testing and deployment
- **Automated Tests**: Run on every PR
- **Linting & Type Checks**: Enforce code quality
- **Security Scanning**: Detect vulnerabilities

### Monitoring & Observability
- **Prometheus + Grafana**: Metrics and dashboards
- **Loki + Tempo/Jaeger**: Logs and traces
- **Alertmanager**: Alert routing and notifications
- **SLO Targets**: 99.9% uptime, P95 <300ms latency

## Development Tools

### Version Control
- **Git**: Distributed version control
- **GitHub**: Repository hosting with PR workflows

### Code Quality
- **ESLint**: JavaScript linting and error detection
- **Prettier**: Code formatting for consistency
- **TypeScript Strict Mode**: Enforce type safety

### Documentation
- **JSDoc**: Code documentation with type annotations
- **Swagger/OpenAPI**: API documentation
- **Markdown**: Project documentation

### Development Environment
- **VS Code**: Recommended code editor
- **Node.js**: JavaScript runtime
- **PostgreSQL**: Local database for development
- **Redis**: Local cache for development

## Common Commands

### Development

```bash
# Start frontend dev server (localhost:3000)
npm run dev

# Start backend dev server (localhost:8000)
uvicorn src.app.main:app --reload

# Start frontend + backend (requires tmux/concurrently setup)
npm run dev:all

# Start Docker containers (PostgreSQL + Redis)
docker-compose up -d

# Stop Docker containers
docker-compose down

# View logs
docker-compose logs -f
```

### Build & Verification

```bash
# Build both frontend and backend
npm run build

# Production-ready build with verification
npm run build:prod

# Lint all workspaces
npm run lint

# Run production readiness checks
npm run verify
```

### Database

```bash
# Run metadata migration (Alembic)
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Seed data
python src/scripts/seed.py
```

### Testing

```bash
# Frontend tests (Vitest)
cd frontend && npm test

# Frontend tests with coverage
cd frontend && npm run test:coverage

# Backend tests (Vitest)
cd backend && npm test

# Backend integration tests
cd backend && npm run test:integration

# AI service tests (pytest)
cd ai-service && pytest

# AI service with coverage
cd ai-service && pytest --cov=src
```

### Background Jobs

```bash
# Start background job workers
cd backend && npm run workers
```

## Environment Variables

Required in `.env`:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/rawdrive
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<64-byte-hex>
JWT_REFRESH_SECRET=<64-byte-hex>
ENCRYPTION_KEY=<32-byte-hex>

# Storage (Cloudflare R2)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=

# AI Service
GEMINI_API_KEY=

# Payments (optional)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Email
SENDGRID_API_KEY=

# Monitoring
SENTRY_DSN=
```

## Performance Targets

- **Frontend**: P95 <300ms for page load
- **API**: P95 <300ms for typical read endpoints
- **Database**: Sub-100ms queries with proper indexing
- **Image Delivery**: <2 seconds for first photo on 4G
- **Uptime**: 99.9% for core gallery and delivery flows

## Security Baseline

- HTTPS/TLS 1.3 everywhere
- OWASP Top 10 protections
- Multi-tenant isolation via `workspace_id`
- Signed URLs for media access (1-hour TTL)
- Rate limiting on all endpoints
- Audit logging for sensitive actions
- Encryption at rest and in transit
- GDPR and CCPA compliance

## Scalability Architecture

- **Horizontal Scaling**: Load balancing with health checks
- **Database Replication**: Read replicas for scaling queries
- **Caching Strategy**: Redis for sessions, cache, and rate limiting
- **Background Jobs**: BullMQ for async processing
- **CDN**: Cloudflare for global content delivery
- **Microservices** (future): Service-oriented architecture with independent deployment

## Key Files

| Purpose | Location |
|---------|----------|
| Frontend types | `frontend/src/types/*.ts` (domain specific) |
| API client | `frontend/src/services/api.ts` |
| Backend entry | `backend/src/app/main.py` |
| Database config | `backend/src/app/core/config.py` |
| Redis config | `backend/src/app/core/redis.py` |
| Environment vars | `.env` (single source of truth) |
| API routes | `backend/src/app/api/v1/` |
| Services | `backend/src/app/services/` |
| Database migrations | `backend/migrations/` |
| Docker config | `docker-compose.yml` |
| CI/CD workflows | `.github/workflows/` |

## Related Documentation

- `docs/project/01-TECH_STACK.md` - Detailed technology decisions
- `docs/project/03-API_CONTRACTS.md` - API specifications
- `docs/project/04-DATA_MODEL.md` - Database schema
- `CLAUDE.md` - AI context and coding guidelines
