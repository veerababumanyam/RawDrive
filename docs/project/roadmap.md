# RawDrive SaaS - Complete Development Roadmap & Architecture Guide

**Version 1.0** | **Date: Dec 17, 2025** | **Owner: [Your Name]**

***

## Table of Contents
1. [Product Vision](#product-vision)
2. [Architecture Overview](#architecture-overview)
3. [Development Phases](#development-phases)
4. [Technical Stack](#technical-stack)
5. [Data Models](#data-models)
6. [API Contracts](#api-contracts)
7. [Deployment & Operations](#deployment)
8. [Security & Compliance](#security)
9. [Testing Strategy](#testing)

***

## Product Vision {#product-vision}

**RawDrive** is a multi-tenant SaaS for photographers and corporate teams to:
- Create beautiful photo/video galleries with client proofing
- Design print/digital albums with lab-ready exports
- Manage clients, bookings, and payments (India-first)
- Support BYOS (Google Drive/Dropbox) for enterprises
- White-label corporate workspaces with SSO & governance

**Target Market**: Indian wedding photographers (80%) + corporate event teams (20%)

***

## Architecture Overview {#architecture-overview}

See detailed architecture in `docs/project/01-TECH_STACK.md` with ASCII diagram and Mermaid visualization.

**High-Level Flow:**
```
Clients (Browser/Mobile)
    ↓ HTTPS/TLS 1.3
Cloudflare Edge (WAF, DDoS, CDN, Rate Limiting)
    ↓ HTTP
Frontend (React 19, TypeScript, Vite)
    ↓ REST API
Traefik API Gateway (Rate Limiting, TLS, KEDA Autoscaling)
    ↓
Backend Services (Node.js, Express, TypeScript)
    ├─ Auth Service
    ├─ Gallery Service
    ├─ Photo Service
    ├─ Album Service
    ├─ Client Service
    ├─ Booking Service
    ├─ Payment Service
    ├─ AI Service
    ├─ Email Service
    └─ Background Jobs (BullMQ)
    ↓
Data Layer:
    ├─ PostgreSQL (ACID, pgvector, RLS)
    ├─ Redis (Sessions, Cache)
    └─ Cloudflare R2 (Object Storage + CDN)
    ↓
Observability:
    ├─ Prometheus (Metrics)
    ├─ Grafana (Dashboards)
    ├─ Loki (Logs)
    ├─ Tempo/Jaeger (Tracing)
    └─ Sentry (Error Tracking)
```

**Key Principles**:
- Multi-tenant isolation (`workspace_id` everywhere + PostgreSQL RLS)
- Event-driven background processing (BullMQ)
- Storage abstraction (Managed R2 + BYOS providers)
- RBAC with centralized auth (JWT + OAuth)
- Observability at every layer (metrics, logs, traces)
- Cloudflare edge security (WAF, DDoS, rate limiting)

***

## Development Phases {#development-phases}

**Legend**:
- ⬜ Planned / not yet verified in this repository
- ✅ Implemented and verified in this repository

### Phase 0: Foundation (1-2 weeks) ⭐ **CRITICAL**
```
⬜ Monorepo (TurboRepo): apps/web, apps/admin, packages/*
⬜ Postgres schema with workspace_id + ORM (Drizzle/Prisma)
⬜ Auth: Google OAuth (OIDC) for direct users + optional local users + JWT + HttpOnly cookies
⬜ API with workspace middleware
⬜ Developer platform baseline: API keys + webhooks + MCP endpoint (FastAPI + FastMCP reference; SSE transport)
⬜ Basic dashboard: Login → Workspace → "Create Gallery"
```

**Deliverable**: Secure multi-tenant skeleton

### Phase 1: Gallery  (2-3 weeks) ⭐ **HIGH VALUE**
```
⬜ Gallery CRUD (list/create/edit)
⬜ Drag-drop upload → R2 signed URLs + thumbnails
⬜ Masonry grid + lightbox (React Photo Gallery)
⬜ Public share links
⬜ Client view with branding header
```

**Deliverable**: Upload → Share → Client views photos

### Phase 2: Client Loop (2 weeks)
```
⬜ Client favorites/hearts (per-client state)
⬜ Bulk selection ("Picks") + "Selected" filter
⬜ Download ZIP of selections
⬜ Photographer sees client activity in dashboard
⬜ Basic stats (views, picks count)
⬜ i18n foundation + language selector (English so m+ India-first languages; Urdu RTL)
```

**Deliverable**: Full proofing workflow

### Phase 3: Gallery Pro + Album v1 (3 weeks)
```
⬜ Gallery settings: password, watermark, expiry
⬜ Sub-galleries (tabs in client view)
⬜ Album Designer: drag to spreads, basic crop
⬜ PDF export (one spread demo)
⬜ Drag-drop reordering
```

**Deliverable**: Production galleries + album proofing

### Phase 4: Studio Operations (3 weeks)
```
⬜ Client management (directory, WhatsApp integration)
⬜ Jobs calendar + conflict detection
⬜ Packages → Quotes → GST invoices
⬜ Razorpay/Stripe payments
⬜ Subscription plans + usage limits
```

**Deliverable**: Complete studio dashboard

### Phase 5: BYOS Storage (3 weeks)
```
⬜ Google Drive OAuth + folder management
⬜ Storage abstraction layer
⬜ Fallback to managed storage
⬜ Sync reconciliation jobs
⬜ Dropbox support (parallel)
```

**Deliverable**: Enterprise storage option

### Phase 6: AI Features (2 weeks)
```
⬜ Photo quality scoring (Gemini vision or self-hosted vision model)
⬜ Face grouping + smart albums
⬜ Auto-captions + gallery story
⬜ Background job processing
```

**Deliverable**: AI-powered curation

### Phase 7: Corporate Mode (4 weeks)
```
⬜ White-label theming (CSS vars + custom domain)
⬜ SAML/OIDC SSO (Azure AD first)
⬜ Department/group access control
⬜ Policy enforcement (download rules)
⬜ Audit logs + exports
```

**Deliverable**: Corporate tenant signup-to-share

### Phase 8: Production (2 weeks)
```
⬜ Observability (Sentry, Prometheus)
⬜ Automated tests (95% coverage)
⬜ CI/CD (GitHub Actions)
⬜ Scale testing (100 concurrent users)
⬜ Launch checklist
```

***

## Technical Stack {#technical-stack}

**See detailed stack in `docs/project/01-TECH_STACK.md`**

```
Frontend:
├── React 19 + TypeScript + Vite
├── Tailwind CSS + Framer Motion
├── Lucide React (icons)
├── React Hook Form + Zod (validation)
├── Masonry gallery + lightbox components
└── Fetch API / Axios (HTTP client)

Backend:
├── Node.js 18+ + Express 5 + TypeScript
├── Prisma ORM (PostgreSQL)
├── Zod (request/response validation)
├── BullMQ + Redis (background jobs)
├── Sharp (image processing)
├── Winston (logging)
└── Helmet.js (security headers)

API Gateway & Ingress:
├── Traefik v3 (Kubernetes IngressRoute CRDs)
├── KEDA autoscaling based on request metrics
├── Automatic TLS via Let's Encrypt
├── Rate limiting via middleware
└── Request/response logging

Storage:
├── Cloudflare R2 (managed, default)
├── Cloudflare CDN (global delivery)
├── Google Drive API (BYOS)
├── Dropbox API (BYOS)
├── AWS S3 (BYOS)
└── Azure Blob (BYOS)

Database:
├── PostgreSQL 16+ (ACID, pgvector)
├── Row-Level Security (RLS) for multi-tenancy
├── Encrypted connections (TLS)
├── Automated backups with encryption
└── Point-in-time recovery

Caching:
├── Redis 7 (sessions, cache, pub/sub)
├── Redis Cluster (high availability)
└── Automatic failover

Auth:
├── Google OAuth (OIDC) - primary
├── Email/password (fallback)
├── JWT (15-min expiry) + Refresh tokens (7-day)
├── MFA (TOTP, SMS, Email)
├── SAML/OIDC (enterprise)
└── Workspace-scoped RBAC

AI:
├── Google Gemini (default)
├── OpenAI (fallback)
├── Anthropic (fallback)
├── Azure OpenAI (enterprise)
├── Ollama/LM Studio (self-hosted)
└── pgvector (embeddings storage)

Observability:
├── Prometheus (metrics collection)
├── Grafana (dashboards & visualization)
├── Loki (log aggregation)
├── Tempo/Jaeger (distributed tracing)
├── Sentry/GlitchTip (error tracking)
└── Alertmanager (alerting)

Infrastructure:
├── Hostinger VPS (KVM) - default
├── Kubernetes (kubeadm) - orchestration
├── Cloudflare Edge (WAF, DDoS, CDN)
├── cert-manager (Let's Encrypt SSL)
└── Docker (containerization)

CI/CD:
├── GitHub Actions (workflows)
├── Automated testing (Vitest, Playwright)
├── Linting & type checking
├── Security scanning (Snyk, OWASP ZAP)
└── Automated deployment (rolling updates)
```

***

## Data Models {#data-models}

```sql
-- Core Tables
workspaces (id, name, slug, storage_provider, subscription_plan_id)
users (id, email, name)  
user_workspaces (user_id, workspace_id, role) -- RBAC

-- Gallery Domain
galleries (id, workspace_id, title, share_token, password_hash, expires_at)
sub_galleries (id, gallery_id, name, order)
media (id, gallery_id|sub_gallery_id, storage_provider, file_id, thumbnail_url, ai_score)

-- Client Interactions
client_selections (media_id, client_id, gallery_id)
media_comments (media_id, user_id, text, resolved)

-- Albums
albums (id, gallery_id, lab_preset_id, status)
album_spreads (id, album_id, page_number)
album_elements (id, spread_id, media_id, crop, position)

-- Billing
workspace_subscriptions (workspace_id, plan_id, status)
invoices (id, workspace_id, amount, gst_amount)
```

***

## API Contracts {#api-contracts}

**Gallery Service** (API examples):
```typescript
// Create gallery
mutation.createGallery: { title: string } → { galleryId: string }

// Upload media
mutation.uploadMedia: { galleryId: string, files: File[] } → { progress: number }

// Client picks
mutation.togglePick: { mediaId: string, selected: boolean } → { updated: boolean }

// Share gallery
mutation.createShare: { galleryId: string, password?: string } → { shareUrl: string }

// AI analyze
mutation.analyzeGallery: { galleryId: string } → { jobId: string }
```

**Auth Middleware** (every request):
```typescript
// Automatic tenant scoping
const ctx = {
  userId: string,
  workspaceId: string,
  roles: string[],
  isCorporate: boolean
}
```

***

## Deployment & Operations {#deployment}

```
Environments:
├── dev.local (docker-compose)
├── staging (Kubernetes namespace + staging DB)
└── production (Hostinger VPS + Kubernetes, separate DB)

CI/CD (GitHub Actions):
├── PR checks: lint, test, typecheck, security scan
├── Deploy preview: ephemeral namespace (optional)
└── Production: manual approval → rolling deploy (Helm/GitOps)

Monitoring:
├── Sentry (errors + performance)
├── Prometheus/Grafana (SLOs: 99.9% uptime, P95 <300ms)
└── UptimeRobot (heartbeat checks)
```

**Database Migrations**: Drizzle-kit with zero-downtime schema changes

***

## Security & Compliance {#security}

```
🔒 Multi-tenant isolation (workspace_id + optional Postgres RLS)
🔐 OWASP Top 10 mitigations
🛡️ Signed URLs (media access, short TTL)
🔗 CSRF protection + strict CORS
🧑‍💻 RBAC (20+ roles across photographer/corporate)
🧑‍💻 Platform admin roles (templates) + audited support access sessions
📊 Audit logs (share creation, downloads, policy changes)
🇮🇳 GST-compliant invoices
🛡️ Rate limiting (API gateway)
```

**Enterprise Security**:
- SAML/OIDC SSO per tenant
- SCIM provisioning (Phase 7+)
- Data residency controls

***

## Testing Strategy {#testing}

```
Unit (95% coverage): 
├── Domain services (gallery CRUD, auth logic)
├── Utilities (image processing, validation)
└── Components (isolated)

Integration:
├── API contracts (gallery + auth flows)
├── Background jobs (upload → thumbnail → AI)
└── Storage providers (S3 + Drive)

E2E (Cypress/Playwright):
├── Photographer: signup → gallery → share → client picks
├── Corporate: SSO → policy setup → restricted gallery
└── Edge cases: expired links, wrong passwords
```

**Load Testing**: Artillery (100 concurrent gallery views)

***

## Success Metrics

```
Phase 1 Complete: 1 photographer uploads → 1 client views
Phase 4 Complete: 5 paying studios with 50+ galleries
Phase 7 Complete: 1 corporate pilot with 100+ employees

Production KPIs:
├── 99.9% uptime (gallery APIs)
├── P95 <300ms (gallery load)
├── <1% error rate (uploads)
└── 95% client pick conversion rate
```

***

**Next Steps**: Start Phase 0 today → MVP in 8 weeks → First paying customer in 12 weeks.

*This document serves as your engineering north star. Print it. Share it with your team. Reference it in every sprint planning.*