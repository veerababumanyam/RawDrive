# RawDrive Business Features Documentation

## Executive Overview

RawDrive is a comprehensive multi-tenant SaaS platform designed for photographers, studios, and enterprise teams to manage the complete media workflow. This documentation provides business-focused analysis of each feature, their value propositions, integrations, and technical architecture.

> **Reference Documentation**:
> - `.kiro/steering/product.md` - Product overview
> - `.kiro/steering/tech.md` - Technology stack
> - `.kiro/steering/structure.md` - Project structure

---

## Platform Capabilities

### Ingest & Organize
Upload photos/videos to managed storage (Cloudflare R2) or BYOS (Google Drive, Dropbox, AWS S3, Azure Blob)

### Deliver & Collaborate
Create beautiful galleries with client proofing, selections, comments, and approvals

### Produce
Design print and digital albums with lab-ready exports

### Operate
Manage clients, bookings, calendar integrations, quotes, and payments (India-first with Razorpay/Stripe)

### Discover
AI-powered internal search (GEO) with semantic metadata, embeddings, and face recognition

### Govern
Enterprise-grade features including SSO, RBAC, policies, retention rules, and audit logging

---

## Target Users

| User Type | Primary Use Cases |
|-----------|-------------------|
| **Photographers/Studios** | Deliver galleries, sell albums, manage bookings and payments |
| **Clients** | View galleries, select favorites, request edits, approve albums |
| **Corporate Teams** | Secure internal media portals with SSO, policies, and governance |
| **Enterprise Admins** | Manage workspaces, users, retention policies, and compliance |

---

## Key Architectural Principles

### Multi-Tenancy
- **Workspace Model**: Each customer operates within an isolated workspace
- **Data Isolation**: All data scoped to `workspace_id` for complete tenant separation
- **RBAC**: Role-based access control enforced at workspace level

### Performance & Scalability
- **5,000+ Concurrent Connections**: Designed for high concurrency
- **CDN Delivery**: Cloudflare for global content delivery
- **Caching Strategy**: Redis for sessions, AI results, and permissions
- **Background Processing**: BullMQ for async jobs

### India-First Approach
- **Razorpay**: Primary payment gateway (UPI, card, netbanking)
- **GST Compliance**: GST-compliant invoicing
- **12 Indian Languages**: Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Urdu + English
- **RTL Support**: Urdu rendering

---

## Feature Documentation

| # | Feature | Document | Status |
|---|---------|----------|--------|
| 2 | Gallery Management | [02_GALLERY_MANAGEMENT.md](02_GALLERY_MANAGEMENT.md) | ✅ Complete |
| 3 | Digital Invitations | [03_DIGITAL_INVITATIONS.md](03_DIGITAL_INVITATIONS.md) | ✅ Complete |
| 4 | Face Detection | [04_FACE_DETECTION_PEOPLE.md](04_FACE_DETECTION_PEOPLE.md) | ✅ Complete |
| 5 | Client CRM | [05_CLIENT_CRM.md](05_CLIENT_CRM.md) | ✅ Complete |
| 6 | AI & Search | [06_AI_SEARCH_GEO.md](06_AI_SEARCH_GEO.md) | ✅ Complete (AI Native UX Spec added) |
| 7 | Company Profile | [07_COMPANY_PROFILE_BRANDING.md](07_COMPANY_PROFILE_BRANDING.md) | ✅ Complete |
| 8 | Customer Portal | [08_CUSTOMER_WEB_PORTAL.md](08_CUSTOMER_WEB_PORTAL.md) | ✅ Complete |
| 9 | Authentication | [09_AUTHENTICATION_AUTHORIZATION.md](09_AUTHENTICATION_AUTHORIZATION.md) | ✅ Complete |
| 10 | Billing | [10_BILLING_SUBSCRIPTION.md](10_BILLING_SUBSCRIPTION.md) | ✅ Complete |
| 11 | Storage | [11_STORAGE_MEDIA_MANAGEMENT.md](11_STORAGE_MEDIA_MANAGEMENT.md) | ✅ Complete |
| 12 | Analytics | [12_ANALYTICS_REPORTING.md](12_ANALYTICS_REPORTING.md) | ✅ Complete |
| 13 | Audit & Compliance | [13_AUDIT_COMPLIANCE.md](13_AUDIT_COMPLIANCE.md) | ✅ Complete |
| 14 | Self-Service | [14_SELF_SERVICE.md](14_SELF_SERVICE.md) | ✅ Complete (PW Reset & Data Export specified) |
| 15 | Notifications | [15_NOTIFICATIONS_COMMUNICATION.md](15_NOTIFICATIONS_COMMUNICATION.md) | ✅ v1 scoped; future: push/mobile |
| 16 | Calendar & Bookings | [16_CALENDAR_BOOKINGS.md](16_CALENDAR_BOOKINGS.md) | 🚧 MVP in progress |
| 17 | API & Integrations | [17_API_INTEGRATIONS.md](17_API_INTEGRATIONS.md) | 🚧 Public preview; fuller coverage planned |
| 18 | Digital Album | [18_DIGITAL_ALBUM_DESIGN.md](18_DIGITAL_ALBUM_DESIGN.md) | 🚧 Design Studio alpha |
| 19 | Admin Roles | [19_ADMIN_ROLES.md](19_ADMIN_ROLES.md) | ✅ Complete |
| 20 | Onboarding | [20_ONBOARDING_AND_WORKSPACE_SETUP.md](20_ONBOARDING_AND_WORKSPACE_SETUP.md) | ✅ Complete |
| 21 | Team Management | [21_TEAM_MANAGEMENT.md](21_TEAM_MANAGEMENT.md) | ✅ Complete |
| 22 | Localization | [22_LOCALIZATION_AND_REGIONAL_FEATURES.md](22_LOCALIZATION_AND_REGIONAL_FEATURES.md) | ✅ Complete |
| 23 | Mobile App | [23_MOBILE_COMPANION_APP.md](23_MOBILE_COMPANION_APP.md) | 🚧 Planned |
| 24 | Growth & Referrals | [24_GROWTH_AND_REFERRALS.md](24_GROWTH_AND_REFERRALS.md) | ✅ Complete |

---

## Enterprise & Platform Bundle

For larger studios and enterprise teams, RawDrive offers an opinionated bundle of features that work together to support security, governance, and deep integration:

- **Identity & Access**: Authentication, SSO (planned), workspace RBAC, and Self-Service security controls.
- **Governance & Compliance**: Audit & Compliance, retention policies, legal holds, and data subject workflows.
- **Integration Surface**: API & Integrations (REST, webhooks, MCP), Analytics exports, and Notifications as a system-of-record.
- **Operations & Scheduling**: Calendar & Bookings, multi-user scheduling, and booking-linked billing.
- **Client Experience at Scale**: Customer Portal, Company Profile/Branding, and Digital Album creation as a unified branded experience.

These capabilities are designed to be fully **workspace-scoped** via `workspace_id`, respect **RBAC** for every operation, and emit comprehensive **audit events** for both UI and API activity.

---

## Technology Stack Summary

### Frontend
- **React 19**: Modern UI with hooks and concurrent rendering
- **TypeScript**: Static type checking
- **Vite**: Fast build tool with HMR
- **Tailwind CSS**: Utility-first styling

### Backend
- **Python 3.11+**: Modern async runtime
- **FastAPI**: High-performance async web framework
- **asyncpg**: High-performance async PostgreSQL driver (Raw SQL)
- **Pydantic**: Data validation and type hints
- **Alembic**: Database migrations

### Infrastructure
- **PostgreSQL 16+**: ACID-compliant relational database
- **pgvector**: Vector embeddings for semantic search
- **Redis 7**: In-memory cache and session store
- **Cloudflare R2**: Object storage
- **Cloudflare CDN**: Global content delivery
- **Kubernetes**: Container orchestration
- **BullMQ**: Redis-based job queue

### AI & Search
- **Google Gemini**: Primary AI provider
- **Google Cloud Vision**: Face detection
- **Fallback Providers**: OpenAI, Anthropic, Azure

---

## Success Metrics

### Activation & Retention
- 60%+ of new signups upload a gallery within 48 hours
- 40%+ of active photographers share a client link within 7 days
- 25%+ of Business-trial users convert to paid within 30 days

### Client Experience
- Median time-to-first-photo under 2 seconds on 4G
- 80%+ of client sessions complete at least one action

### AI Value
- 70% faster gallery curation with AI assistance
- 30%+ reduction in time spent finding photos

---

## Scalability Architecture

### Performance Targets
- **Gallery Load**: < 2 seconds on 4G
- **API Response**: < 300ms for typical queries
- **Image Delivery**: < 500ms per image
- **Concurrent Users**: 5,000+ per workspace

### Load Distribution
- Cloudflare Edge: TLS termination, routing, rate limiting
- Kubernetes Ingress: Distribute traffic across pods
- Database Connection Pooling: asyncpg with configurable pool
- Redis Clustering: Horizontal scaling for sessions/cache

---

## Related Documentation

- **Complete Index**: [INDEX.md](INDEX.md)
- **Product Overview**: `.kiro/steering/product.md`
- **Technology Stack**: `.kiro/steering/tech.md`
- **Project Structure**: `.kiro/steering/structure.md`
- **Feature Specifications**: `docs/Features/`
- **Technical Specifications**: `docs/TechnicalSpecs/`
- **Implementation Specs**: `specs/`, `.kiro/specs/`

---

## Document Maintenance

**Last Updated**: January 5, 2026  
**Version**: 2.1  
**Owner**: RawDrive Product Team
