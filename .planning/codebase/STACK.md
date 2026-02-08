# RawDrive Technology Stack

## Overview

RawDrive is an enterprise SaaS professional photography platform built with a modern microservices architecture, designed for high performance, scalability, and reliability.

---

## Frontend Stack

### Core Technologies
- **React**: 18.3.0 - Modern React with hooks, concurrent features, and suspense
- **TypeScript**: 5.3.3 - Strongly typed JavaScript for better developer experience
- **Vite**: 5.0.8 - Next-generation frontend tooling for fast builds and hot reload
- **TailwindCSS**: 4.0.0 - Utility-first CSS framework for rapid UI development

### State Management & Data Fetching
- **TanStack Query**: 5.90.16 - Server state management with caching, retries, and background updates
- **React Router**: 6.21.0 - Declarative routing for React applications

### UI Components & Libraries
- **Lucide React**: 0.294.0 - Beautiful & consistent icon library
- **Heroicons**: 2.2.0 - SVG icons from the Heroicons set
- **Radix UI**: Accessible, unstyled UI components (via @radix-ui/*)

### Animation & Interaction
- **Framer Motion**: 11.0.0 - Production-ready motion library for animations
- **DnD Kit**: 6.3.1 - Modern, accessible drag and drop library

### Specialized Libraries
- **Face API.js**: 0.22.2 - Face detection and recognition in the browser
- **HEIC2Any**: 0.0.4 - Convert HEIC/HEIF images to JPEG/PNG
- **React Easy Crop**: 5.5.6 - Image cropping component with multi-touch support
- **QR Code.react**: 4.2.0 - QR code generation component

### Internationalization
- **i18next**: 25.7.3 - Internationalization framework
- **react-i18next**: 16.5.0 - React integration for i18next
- **i18next-browser-languagedetector**: 8.2.0 - Language detection

### Performance & Optimization
- **Vite PWA**: Progressive Web App support with offline caching
- **Virtualized Scrolling**: react-window, react-virtualized-auto-sizer
- **Code Splitting**: Manual chunk configuration for optimal loading

---

## Backend Stack

### Core Framework
- **Python**: 3.11 - Fast, modern Python with async support
- **FastAPI**: 0.115.5 - High-performance web framework with automatic API docs
- **Uvicorn**: 0.32.0 - ASGI server with hot reload and SSL support

### Database & ORM
- **PostgreSQL**: 16 - Advanced relational database with JSON support
- **SQLAlchemy**: 2.0.36 - Modern Python ORM with async support
- **Alembic**: 1.13.2 - Database migrations and schema management
- **pgvector**: 0.8.1 - Vector similarity search for face embeddings

### Async & Concurrency
- **asyncpg**: 0.30.0 - PostgreSQL driver for asyncio
- **Celery**: Distributed task queue for background processing
- **Redis**: 7.0 - Message broker and cache layer

### Authentication & Security
- **PyJWT**: 2.9.0 - JSON Web Token implementation
- **cryptography**: 43.0.3 - Cryptographic recipes
- **argon2-cffi**: 23.1.0 - Secure password hashing
- **python-multipart**: 0.0.9 - Multipart form parsing

### AI & Machine Learning
- **Google Cloud Vision**: 3.5.0 - Image analysis and face detection
- **Google Gemini**: 0.8.0 - AI/ML integration and content analysis
- **OpenCV**: 4.8.0 - Computer vision library (headless)
- **NumPy**: 1.24.0 - Numerical computing library
- **Milvus**: 2.3.4 - Vector database for similarity search

### Image Processing
- **Pillow**: 10.4.0 - Image manipulation and processing
- **Pillow-HEIF**: 0.18.0 - HEIC/HEIF format support
- **Pillow-AVIF**: 1.4.2 - AVIF format support
- **ExifRead**: 3.0.0 - EXIF metadata extraction
- **RawPy**: 0.25.1 - RAW file processing

### Storage
- **Cloudflare R2**: S3-compatible object storage
- **Boto3**: 1.35.0 - AWS SDK for Python

### Payments
- **Stripe**: Payment processing and billing
- **Razorpay**: 1.4.1 - Indian payment gateway

### Monitoring & Observability
- **Prometheus**: Metrics collection and monitoring
- **Grafana**: 10.2.0 - Visualization and dashboarding
- **Loki**: 2.9.0 - Log aggregation
- **OpenTelemetry**: Distributed tracing

### Development Tools
- **pytest**: 8.3.3 - Testing framework
- **pytest-asyncio**: 0.24.0 - Async test support
- **pytest-cov**: 4.1.0 - Coverage reporting
- **ruff**: 0.6.9 - Fast Python linter and formatter
- **mypy**: 1.11.2 - Static type checker

---

## Microservices Architecture

### Core Services
1. **Backend** (Port 8000)
   - Main API gateway and core services
   - Authentication, user management, workspace handling
   - Asset management, client management, search

2. **Gallery Service** (Port 8004)
   - High-performance gallery viewing and proofing
   - KEDA autoscaling for 50K concurrent magic link views
   - WebSocket support for real-time collaboration

3. **Billing Service** (Port 8005)
   - Subscription and payment processing
   - Stripe/Razorpay integration
   - Invoice management and billing analytics

4. **Upload Service** (Port 8008)
   - TUS resumable file uploads
   - Chunked upload with Redis buffering
   - KEDA autoscaling for high-volume uploads

5. **Webhooks Service** (Port 8003)
   - Event-driven webhook delivery
   - HMAC-SHA256 signatures for security
   - Exponential backoff retry mechanism

6. **Notifications Service** (Port 8010)
   - Multi-channel notifications (email, SMS, in-app)
   - SendGrid integration
   - Template-based messaging with delivery tracking

7. **Onboarding Service** (Port 8006)
   - User registration and workspace setup
   - Welcome email sequence
   - Feature introduction workflows

8. **Invitations Service** (Port 8007)
   - Digital wedding invitations
   - RSVP management
   - Guest tracking and analytics

9. **Client Service** (Port 8009)
   - Client relationship management
   - Gallery sharing and proofing
   - Activity tracking and insights

10. **AI Service** (Port 8011)
    - AI orchestration and workspace agent tools
    - RAG integration for knowledge base
    - MCP (Model Context Protocol) support

11. **AI Processing Service** (Port 8012)
    - Duplicate detection and deduplication
    - Content moderation
    - AI tagging and metadata extraction

12. **LiveSync Service** (Port 8013)
    - Real-time file synchronization
    - WebSocket-based live updates
    - Conflict resolution

13. **Growth Service** (Port 8016)
    - Referral programs and partner management
    - Credit ledger system
    - Analytics and gamification

### Background Workers
- **Face Worker**: Face detection and embedding generation
- **Content Worker**: Image processing and metadata extraction
- **Quality Worker**: Image quality assessment
- **Asset Processing Worker**: Asset transformation and optimization

---

## Infrastructure & DevOps

### Containerization & Orchestration
- **Docker**: Containerization for all services
- **Docker Compose**: Local development and multi-container orchestration
- **Kubernetes**: Production orchestration (planned)
- **KEDA**: Kubernetes Event-driven Autoscaling

### API Gateway & Routing
- **Traefik v3**: Cloud-native API gateway
- - Automatic service discovery
- - SSL termination with Let's Encrypt
- - Request routing and middleware
- - Metrics collection

### Databases
- **PostgreSQL**: 16 with TimescaleDB extension
- - pgvector for vector search
- - pgvectorscale for StreamingDiskANN indexes
- - Connection pooling with PgBouncer

### Caching & Message Broker
- **Redis**: 7.0
- - Multi-tier caching strategy
- - Session storage
- - Celery message broker
- - Rate limiting

### Monitoring & Logging
- **Prometheus**: Metrics collection and alerting
- **Grafana**: 10.2.0 - Dashboards and visualization
- **Loki**: 2.9.0 - Log aggregation
- **Alertmanager**: Notification management

### Vector Database
- **Milvus**: 2.3.4 - Vector similarity search
- - Face and image embeddings storage
- - High-performance similarity search
- - Supports various distance metrics

---

## Shared Packages

### Monorepo Structure (pnpm Workspaces)

1. **@rawdrive/shared-types**
   - Domain types and interfaces
   - Cross-service type definitions
   - Auto-generated Python types

2. **@rawdrive/shared-constants**
   - Application constants and configuration
   - Feature flags and thresholds
   - Environment-specific settings

3. **@rawdrive/shared-utils**
   - Common utility functions
   - Date/time formatting
   - File size utilities
   - Validation helpers

4. **@rawdrive/shared-validation**
   - Input validation schemas
   - Sanitization helpers
   - Business rule validation

5. **@rawdrive/shared-api**
   - API client utilities
   - Request/response interceptors
   - Error handling patterns

6. **@rawdrive/api-types**
   - OpenAPI schema definitions
   - Auto-generated API clients

7. **@rawdrive/database-utils**
   - Database connection pooling
   - Query builders
   - Migration utilities

---

## Key Dependencies & Versions

### Frontend Dependencies
```json
{
  "react": "^18.3.0",
  "typescript": "^5.3.3",
  "vite": "^5.0.8",
  "tailwindcss": "^4.0.0",
  "@tanstack/react-query": "^5.90.16",
  "framer-motion": "^11.0.0",
  "lucide-react": "^0.294.0",
  "react-router-dom": "^6.21.0"
}
```

### Backend Dependencies
```python
fastapi==0.115.5
uvicorn[standard]==0.32.0
SQLAlchemy==2.0.36
asyncpg==0.30.0
pgvector>=0.3.0
redis[hiredis]==5.1.1
pymilvus==2.3.4
google-cloud-vision>=3.5.0
google-generativeai>=0.8.0
opencv-python-headless>=4.8.0
Pillow==10.4.0
stripe>=8.0.0
razorpay>=1.4.1
prometheus-client>=0.20.0
structlog>=24.1.0
```

### Infrastructure Dependencies
```yaml
services:
  traefik: v3.0
  postgres: timescale/timescaledb-ha:pg16
  redis: redis:7-alpine
  grafana: grafana/grafana:10.2.0
  prometheus: prom/prometheus:v2.47.0
  loki: grafana/loki:2.9.0
  milvus: milvusdb/milvus:v2.3.4
```

---

## File Structure

### Frontend Structure
```
frontend/src/
├── components/         # UI components
│   ├── ui/           # Design system
│   ├── layout/       # Layout components
│   └── features/     # Feature-specific components
├── pages/           # Page components (route handlers)
├── hooks/           # Custom React hooks
├── services/        # API client services
├── contexts/        # React contexts
└── utils/           # Utility functions
```

### Backend Structure
```
backend/src/app/
├── api/v1/          # API endpoints
├── models/          # SQLAlchemy models
├── repositories/    # Data access layer
├── services/        # Business logic
├── middleware/      # FastAPI middleware
└── workers/         # Background workers
```

### Microservices Structure
```
services/[name]/
├── src/
│   ├── api/v1/      # API endpoints
│   ├── services/    # Business logic
│   ├── repositories/# Database access
│   └── schemas/     # Pydantic schemas
└── tests/           # Unit and integration tests
```

---

## Build & Development Commands

### Frontend
```bash
cd frontend
pnpm dev              # Start dev server (localhost:5173)
pnpm build            # Production build
pnpm test             # Run tests
pnpm lint             # Lint code
```

### Backend
```bash
cd backend
uvicorn app.main:app --reload  # Dev server
docker exec rawdrive-backend pytest  # Run tests
docker exec rawdrive-backend alembic upgrade head  # Run migrations
```

### Services
```bash
cd services/[service-name]
docker build -t rawdrive-[name] .
docker-compose up [service-name]  # Start service
```

### Shared Packages
```bash
pnpm build:packages      # Build all shared packages
pnpm generate:python     # Generate Python types
pnpm test:packages       # Test shared packages
```