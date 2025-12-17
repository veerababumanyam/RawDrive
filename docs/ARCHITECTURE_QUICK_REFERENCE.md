# RawDrive Architecture Quick Reference

**Last Updated**: December 17, 2025

## System Overview

RawDrive is a multi-tenant SaaS platform built on a modern, scalable architecture designed for 20,000+ photographers with high performance, reliability, and security.

## Architecture Layers

### 1. Client Layer
- Web browsers, mobile apps, desktop applications
- HTTPS/TLS 1.3 encrypted connections

### 2. Cloudflare Edge
- **WAF**: Web Application Firewall blocks malicious traffic
- **DDoS Protection**: Automatic mitigation of attacks
- **CDN**: Global content delivery network
- **Rate Limiting**: Per-IP and per-user limits
- **Bot Management**: Challenge pages for suspicious traffic

### 3. Frontend Layer
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Framer Motion
- **Deployment**: Hostinger VPS / Kubernetes
- **Build**: Optimized production builds with code splitting

### 4. API Gateway & Ingress
- **Load Balancer**: Nginx Ingress (Kubernetes)
- **Authentication**: JWT + OAuth middleware
- **Rate Limiting**: Per-endpoint limits
- **Request Tracing**: X-Request-ID for tracking

### 5. Backend Services
- **Runtime**: Node.js 18+ + Express 5 + TypeScript
- **Services**:
  - Auth Service (JWT, OAuth, MFA)
  - Gallery Service (CRUD, sharing)
  - Photo Service (upload, processing)
  - Album Service (design, export)
  - Client Service (management)
  - Booking Service (calendar, scheduling)
  - Payment Service (Razorpay, Stripe)
  - AI Service (Gemini, embeddings)
  - Email Service (SendGrid)
  - Background Jobs (BullMQ)

### 6. Data Layer

#### PostgreSQL Database
- **Version**: 16+
- **Features**: ACID compliance, pgvector for embeddings
- **Security**: Encrypted connections, RLS for multi-tenancy
- **Backups**: Automated, encrypted, point-in-time recovery

#### Redis Cache
- **Version**: 7
- **Purpose**: Sessions, cache, pub/sub messaging
- **Mode**: Cluster for high availability
- **TTL**: Automatic key expiration

#### Cloudflare R2 Storage
- **Purpose**: Object storage for photos/videos
- **Features**: S3-compatible API, no egress fees
- **CDN**: Integrated global delivery
- **Backup**: BYOS options (Google Drive, Dropbox, S3, Azure)

### 7. Background Jobs
- **Queue**: BullMQ (Redis-based)
- **Tasks**:
  - Photo processing (thumbnails, derivatives)
  - AI analysis (quality scoring, face detection)
  - Email delivery (transactional, newsletters)
  - Webhook delivery (event notifications)
  - Scheduled tasks (cleanup, reports)

### 8. Observability Layer

#### Metrics (Prometheus)
- Request count by endpoint
- Request latency (p50, p95, p99)
- Error rate by status code
- Database query latency
- Cache hit/miss ratio
- Background job processing time

#### Dashboards (Grafana)
- System health overview
- Performance metrics
- Error tracking
- Custom business metrics

#### Logs (Loki)
- Structured JSON logging
- Log levels: DEBUG, INFO, WARN, ERROR
- Request/response logging
- Error stack traces
- 1-year retention

#### Traces (Tempo/Jaeger)
- Distributed request tracing
- End-to-end latency analysis
- Service dependency mapping
- Performance bottleneck identification

#### Error Tracking (Sentry/GlitchTip)
- Exception aggregation
- Error grouping and deduplication
- Release tracking
- Performance monitoring

### 9. External Integrations

#### AI Providers
- **Primary**: Google Gemini (text + vision)
- **Fallback**: OpenAI, Anthropic
- **Enterprise**: Azure OpenAI, Azure AI Foundry
- **Self-Hosted**: Ollama, LM Studio

#### Payment Gateways
- **Primary**: Razorpay (India-first, UPI support)
- **Alternative**: Stripe

#### Email Service
- **Provider**: SendGrid
- **Features**: Transactional templates, webhooks

#### Authentication
- **OAuth**: Google, GitHub
- **Enterprise**: SAML/OIDC (Azure AD)

#### Storage (BYOS)
- **Google Drive**: OAuth integration
- **Dropbox**: OAuth integration
- **AWS S3**: IAM credentials
- **Azure Blob**: Connection string

## Key Architectural Principles

### Multi-Tenancy
- **Isolation**: `workspace_id` on all customer data tables
- **Security**: PostgreSQL Row-Level Security (RLS)
- **Enforcement**: Backend middleware validates workspace access
- **Never Trust**: Client-provided workspace_id always verified

### Security
- **Defense in Depth**: Multiple layers of protection
- **Encryption**: TLS 1.3 in transit, AES-256 at rest
- **Authentication**: JWT (15-min) + Refresh tokens (7-day)
- **Authorization**: RBAC with workspace scoping
- **Audit Logging**: All sensitive actions tracked

### Performance
- **Caching**: Redis for sessions, cache, rate limiting
- **CDN**: Cloudflare for global content delivery
- **Optimization**: Image derivatives, lazy loading
- **Monitoring**: P95 latency target <300ms

### Scalability
- **Horizontal**: Load balancing across pods
- **Vertical**: Resource allocation per service
- **Database**: Read replicas for scaling queries
- **Async**: Background jobs for long-running tasks

### Reliability
- **Uptime Target**: 99.9% for core services
- **Failover**: Automatic pod restart on failure
- **Backups**: Encrypted, offsite, tested regularly
- **Disaster Recovery**: Point-in-time recovery capability

## Deployment Architecture

### Development
- **Local**: Docker Compose (PostgreSQL, Redis, Minio)
- **Database**: Local PostgreSQL with seed data
- **Storage**: Minio (S3-compatible local storage)

### Staging
- **Infrastructure**: Kubernetes namespace
- **Database**: Separate staging database
- **Storage**: Cloudflare R2 staging bucket
- **Monitoring**: Full observability stack

### Production
- **Infrastructure**: Hostinger VPS + Kubernetes (kubeadm)
- **Database**: PostgreSQL with replication
- **Storage**: Cloudflare R2 production bucket
- **Monitoring**: Full observability with alerting

## Technology Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 19+ |
| **Frontend Build** | Vite | Latest |
| **Frontend Styling** | Tailwind CSS | 3.3+ |
| **Backend Runtime** | Node.js | 18+ |
| **Backend Framework** | Express | 5+ |
| **Language** | TypeScript | 5+ |
| **Database** | PostgreSQL | 16+ |
| **Cache** | Redis | 7+ |
| **ORM** | Prisma | 5+ |
| **Validation** | Zod | 3.22+ |
| **Job Queue** | BullMQ | 4.11+ |
| **Image Processing** | Sharp | Latest |
| **Logging** | Winston | 3.10+ |
| **Security** | Helmet.js | 7+ |
| **Rate Limiting** | express-rate-limit | 6.7+ |
| **Metrics** | Prometheus | Latest |
| **Dashboards** | Grafana | Latest |
| **Logs** | Loki | Latest |
| **Traces** | Tempo/Jaeger | Latest |
| **Errors** | Sentry/GlitchTip | Latest |
| **Container** | Docker | Latest |
| **Orchestration** | Kubernetes | 1.27+ |
| **Ingress** | Nginx | Latest |
| **SSL/TLS** | cert-manager | Latest |
| **Edge** | Cloudflare | - |

## Performance Targets

| Metric | Target |
|--------|--------|
| **Page Load** | P95 <300ms |
| **API Response** | P95 <300ms |
| **Database Query** | <100ms (with indexing) |
| **Image Delivery** | <2s on 4G |
| **Uptime** | 99.9% |
| **Error Rate** | <1% |

## Security Checklist

- [ ] HTTPS/TLS 1.3 everywhere
- [ ] OWASP Top 10 protections
- [ ] Multi-tenant isolation via workspace_id
- [ ] Signed URLs for media access (1-hour TTL)
- [ ] Rate limiting on all endpoints
- [ ] Audit logging for sensitive actions
- [ ] Encryption at rest and in transit
- [ ] GDPR and CCPA compliance
- [ ] Regular security audits
- [ ] Penetration testing quarterly

## Monitoring & Alerting

### Key Metrics to Monitor
- Request latency (p50, p95, p99)
- Error rate by endpoint
- Database connection pool usage
- Redis memory usage
- Disk space usage
- CPU and memory utilization
- Background job queue depth
- Cache hit ratio

### Alert Thresholds
- Error rate >1%
- P95 latency >500ms
- Database connections >80%
- Redis memory >80%
- Disk space <10%
- Pod restart rate >5/hour
- Job queue depth >1000

## Related Documentation

- **Detailed Tech Stack**: `docs/project/01-TECH_STACK.md`
- **Security Requirements**: `docs/project/02-SECURITY_REQUIREMENTS.md`
- **API Contracts**: `docs/project/03-API_CONTRACTS.md`
- **Data Model**: `docs/project/04-DATA_MODEL.md`
- **Development Roadmap**: `docs/project/roadmap.md`
- **Technical Specifications**: `docs/TechnicalSpecs/`
- **Feature Documentation**: `docs/Features/`

## Quick Links

- **Architecture Diagram**: See `docs/project/01-TECH_STACK.md` for ASCII and Mermaid diagrams
- **API Documentation**: See `docs/project/03-API_CONTRACTS.md`
- **Database Schema**: See `docs/project/04-DATA_MODEL.md`
- **Deployment Guide**: See infrastructure documentation
- **Security Policy**: See `docs/project/02-SECURITY_REQUIREMENTS.md`

## Getting Started

1. **Local Development**: `npm run docker:dev:up && npm run dev:all`
2. **Database Setup**: `cd backend && npm run db:migrate && npm run db:seed`
3. **Run Tests**: `npm test`
4. **Build**: `npm run build`
5. **Deploy**: Push to main branch (GitHub Actions handles CI/CD)

## Support & Questions

For questions about the architecture:
1. Check the detailed documentation in `docs/project/`
2. Review technical specifications in `docs/TechnicalSpecs/`
3. Check feature documentation in `docs/Features/`
4. Consult the team's architecture decision records

---

**Version**: 1.0  
**Last Updated**: December 17, 2025  
**Maintained By**: Engineering Team
