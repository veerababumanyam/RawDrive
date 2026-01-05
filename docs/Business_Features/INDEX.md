# RawDrive Business Features Documentation - Complete Index

## Overview

This comprehensive documentation provides business-focused analysis of all RawDrive features, their value propositions, technical architecture, integrations, and scalability considerations for handling 5,000+ concurrent connections.

> **Reference Documentation**:
> - `.kiro/steering/product.md` - Product overview
> - `.kiro/steering/tech.md` - Technology stack
> - `.kiro/steering/structure.md` - Project structure
> - `docs/Features/` - Detailed feature specifications
> - `specs/` - Implementation specifications
> - `.kiro/specs/` - Kiro implementation specs

---

## Documentation Structure

### 1. **Overview & Architecture** 
📄 [01_OVERVIEW.md](01_OVERVIEW.md)
- Executive overview of RawDrive platform
- Key architectural principles
- Feature integration map
- Concurrent connection architecture (5,000+)
- Data model overview
- Technology stack summary

---

## Core Features

### 2. **Gallery Management & Delivery**
📄 [02_GALLERY_MANAGEMENT.md](02_GALLERY_MANAGEMENT.md)

**Business Value**: Enable photographers to deliver beautiful, fast-loading galleries to clients with complete control over sharing, access, and client interactions.

**Key Capabilities**:
- Multi-level gallery organization (galleries → sub-galleries → assets)
- Magic Links with QR codes and face discovery
- Share links with password/PIN protection and expiry
- Client proofing (favorites, picks, comments)
- Gallery customization and themes
- Shared Dashboard for security & link management
- Analytics and engagement tracking

**Technical Stack**:
- Backend: `gallery_service.py`, `magic_link_service.py`, `smart_curation_service.py`
- API: 30+ endpoints for gallery and link management
- Database: 10+ core tables with soft delete support
- Frontend: Gallery grid, lightbox, settings, shared dashboard

**Scalability**: 5,000+ concurrent gallery viewers with CDN delivery, lazy loading, pagination

**Integration Points**: Client CRM, AI Search, Face Detection, Invitations, Billing, Notifications, Analytics

---

### 3. **Digital Invitations & Save-the-Date**
📄 [03_DIGITAL_INVITATIONS.md](03_DIGITAL_INVITATIONS.md)

**Business Value**: Create, send, and track beautiful event invitations with integrated RSVP management, multi-language support, and engagement analytics for Indian cultural events.

**Key Capabilities**:
- Step-by-step invitation wizard
- 30+ culturally-appropriate templates
- Multi-event support (Mehndi, Sangeet, Ceremony, Reception)
- RSVP management with duplicate prevention
- QR code and calendar (.ics) integration
- WhatsApp-optimized sharing
- 12 Indian languages + English (including RTL Urdu)
- AI-powered content generation
- Auto-deletion with warnings

**Technical Stack**:
- Backend: 10+ invitation services including AI, RSVP, analytics
- API: 25+ endpoints for invitation management
- Database: 12 core tables for invitations, RSVPs, guests, analytics
- Frontend: Invitation wizard, guest manager, RSVP dashboard

**Scalability**: Bulk email (500+ guests), async processing, rate limiting

**Integration Points**: Gallery Management, Client CRM, Face Detection, Company Profile, Notifications

---

### 4. **Face Detection & People Management**
📄 [04_FACE_DETECTION_PEOPLE.md](04_FACE_DETECTION_PEOPLE.md)

**Business Value**: Automatically organize photos by people, create face-based galleries, and provide "Find My Photos" functionality for clients.

**Key Capabilities**:
- Automatic background face detection
- Multi-provider AI (Google Cloud Vision, Gemini with failover)
- Face clustering and grouping
- Manual group management (merge, split, assign)
- VIP tagging (bride, groom, parents)
- Client-side "Find My Photos" (privacy-first)
- Face-based photo filtering and search

**Technical Stack**:
- Backend: `face_detection_service.py`, `face_cluster_service.py`, provider architecture
- AI: Circuit breaker, retry strategy, provider manager
- API: 15+ endpoints for face management
- Database: pgvector for embeddings, 6 core tables
- Frontend: People grid, face group browser, face search

**Scalability**: Batch processing with BullMQ, pgvector indexing, 100,000+ faces per workspace

**Integration Points**: Gallery Management, Client CRM, AI Search, Invitations, Smart Curation

---

### 5. **Client CRM & Relationship Management**
📄 [05_CLIENT_CRM.md](05_CLIENT_CRM.md)

**Business Value**: Manage customer relationships, track interactions, maintain contact information, and build long-term business relationships.

**Key Capabilities**:
- Client profiles with avatars and contact info
- Multiple contact methods (email, phone, social)
- Activity timeline and communication history
- Client segmentation and tagging
- Gallery-client linking
- Duplicate detection and merging
- Bulk import/export (CSV)
- Smart lists and filtering
- Referral tracking

**Technical Stack**:
- Backend: `client_service.py`, `client_activity_service.py`, `visitor_service.py`
- API: 25+ endpoints for client management
- Database: 8 core tables for clients, activities, communications
- Frontend: Client list, detail view, activity timeline

**Scalability**: Indexed queries, pagination, Redis caching for 10,000+ clients

**Integration Points**: Gallery Management, Invitations, Face Detection, Billing, Notifications

---

### 6. **AI & Search Features (GEO)**
📄 [06_AI_SEARCH_GEO.md](06_AI_SEARCH_GEO.md)

**Business Value**: AI-powered search, quality analysis, and smart curation enabling photographers to find photos instantly and deliver curated galleries efficiently.

**Key Capabilities**:
- Photo quality analysis (sharpness, exposure, composition)
- Smart curation with target-count culling
- Curation presets (social media, album, vendor, documentary)
- Caption and hashtag generation
- Gallery story generation
- Semantic search with natural language
- Auto-tagging and metadata extraction
- Duplicate detection
- Scene and moment detection
- AI credits system by subscription tier
- Feature toggles per user

**Technical Stack**:
- Backend: `photo_analysis_service.py`, `smart_curation_service.py`, `search_service.py`
- AI: Multi-provider (Gemini default, OpenAI, Anthropic, Azure, local)
- API: 20+ endpoints for AI features
- Database: pgvector for embeddings, analysis tables
- Frontend: AIToolsHub, quality cards, curation panel

**Scalability**: Async processing, circuit breaker, request deduplication, caching

**Integration Points**: Gallery Management, Face Detection, Client CRM, Invitations, Billing

---

### 7. **Company Profile & Branding**
📄 [07_COMPANY_PROFILE_BRANDING.md](07_COMPANY_PROFILE_BRANDING.md)

**Business Value**: Establish professional public presence with customizable profiles, QR codes, vCards, and consistent branding across all client-facing surfaces.

**Key Capabilities**:
- Company profile management (identity, contact, social)
- Public profile page (/p/{slug})
- Theme system (5 categories, customization)
- Live multi-device preview
- QR code generation (PNG, SVG, PDF)
- vCard generation (RFC 6350 compliant)
- SEO schema markup (JSON-LD)
- Color palette builder with WCAG validation
- Custom font upload
- Gallery branding integration
- Visibility controls per field

**Technical Stack**:
- Backend: `company_profile_service.py`, `theme_service.py`, `qr_code_service.py`
- API: 20+ endpoints for profile and theme management
- Database: 6 core tables for profiles, themes, customizations
- Frontend: Profile editor, theme selector, live preview

**Scalability**: CDN delivery, caching, lazy loading

**Integration Points**: Gallery Management, Invitations, Client CRM, Customer Portal

---

### 8. **Customer Web Portal & Client Experience**
📄 [08_CUSTOMER_WEB_PORTAL.md](08_CUSTOMER_WEB_PORTAL.md)

**Business Value**: Provide clients with seamless, branded experience to view galleries, select favorites, provide feedback, and interact with photographers.

**Key Capabilities**:
- Responsive gallery viewing (mobile/desktop)
- Photo interaction (favorites, comments, ratings)
- Magic Link access with privacy gates
- Client feedback collection
- Gallery navigation and search
- Download controls (policy-based)
- Social sharing
- Branded experience from company profile

**Technical Stack**:
- Backend: `public_gallery_service.py`, `client_portal_service.py`, `favorites_service.py`
- API: 20+ endpoints for client portal
- Database: 10 core tables for views, favorites, comments
- Frontend: Public gallery, lightbox, favorites panel

**Scalability**: Lazy loading, CDN delivery, pagination for 5,000+ concurrent users

**Integration Points**: Gallery Management, Face Detection, Client CRM, Company Profile, Notifications

---

### 9. **Authentication & Authorization (RBAC)**
📄 [09_AUTHENTICATION_AUTHORIZATION.md](09_AUTHENTICATION_AUTHORIZATION.md)

**Business Value**: Secure user management, workspace isolation, and role-based access control for data security and compliance.

**Key Capabilities**:
- Email/password and OAuth authentication
- Enterprise SSO (SAML/OIDC)
- Two-factor authentication (TOTP)
- Workspace management and isolation
- Role-based access control (Owner, Admin, Editor, Viewer)
- Permission caching for performance
- Session management
- Comprehensive audit logging

**Technical Stack**:
- Backend: `auth_service.py`, `rbac_service.py`, `oauth_service.py`, `workspace_service.py`
- API: 25+ endpoints for auth and user management
- Database: 8 core tables for users, workspaces, roles, sessions
- Frontend: Auth forms, 2FA setup, workspace settings

**Scalability**: Permission caching in Redis, session pooling, rate limiting

**Integration Points**: All features (workspace-scoped access control)

---

### 10. **Billing & Subscription Management**
📄 [10_BILLING_SUBSCRIPTION.md](10_BILLING_SUBSCRIPTION.md)

**Business Value**: Monetize platform through flexible subscription plans with India-first payment processing (Razorpay) and international support (Stripe).

**Key Capabilities**:
- Tiered subscription plans (Starter, Professional, Business, Enterprise)
- Monthly/annual billing
- Usage-based billing
- Razorpay integration (UPI, card, netbanking)
- Stripe integration (international)
- GST-compliant invoicing
- 30-day trial management
- Usage tracking and quotas
- AI credits allocation

**Technical Stack**:
- Backend: `subscription_service.py`, `razorpay_service.py`, `stripe_service.py`
- API: 20+ endpoints for billing
- Database: 10 core tables for subscriptions, invoices, payments
- Frontend: Pricing page, subscription management, billing history

**Scalability**: Async payment processing, webhook handling, retry logic

**Integration Points**: All features (plan-based feature access and quotas)

---

### 11. **Storage & Media Management**
📄 [11_STORAGE_MEDIA_MANAGEMENT.md](11_STORAGE_MEDIA_MANAGEMENT.md)

**Business Value**: Flexible storage options with efficient media processing and global CDN delivery.

**Key Capabilities**:
- Managed storage (Cloudflare R2)
- BYOS providers (Google Drive, Dropbox, S3, Azure)
- Chunked uploads with TUS protocol resume
- Image processing (thumbnails, web-optimized, watermarks)
- RAW file support (CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG)
- Video processing (MP4, MOV, AVI)
- Comprehensive metadata extraction (EXIF, camera-specific)
- Encryption at rest (AES-256-GCM)
- Signed URL generation (1-hour TTL)

**Technical Stack**:
- Backend: `upload_service.py`, `storage_service.py`, `image_processing_service.py`
- API: 15+ endpoints for uploads and media
- Database: 8 core tables for assets, variants, uploads
- Frontend: Media library, upload zone, processing status

**Scalability**: Chunked uploads, async processing, CDN delivery

**Integration Points**: Gallery Management, Face Detection, AI Search, Company Profile, Billing

---

### 12. **Analytics & Reporting**
📄 [12_ANALYTICS_REPORTING.md](12_ANALYTICS_REPORTING.md)

**Business Value**: Comprehensive insights into gallery performance, client engagement, and business trends.

**Key Capabilities**:
- Dashboard analytics
- Gallery performance metrics
- Client engagement analytics
- Revenue analytics (MRR/ARR)
- Invitation analytics
- Custom reports
- Data export (CSV, PDF, Excel)
- Real-time updates

**Technical Stack**:
- Backend: `analytics_service.py`, `dashboard_service.py`, `revenue_analytics_service.py`
- API: 15+ endpoints for analytics
- Database: 8 core tables for events, analytics, reports
- Frontend: Dashboard, analytics pages, report builder

**Scalability**: Batch aggregation, metric caching, pre-computation

**Integration Points**: Gallery Management, Client CRM, Invitations, Billing

---

### 13. **Audit & Compliance**
📄 [13_AUDIT_COMPLIANCE.md](13_AUDIT_COMPLIANCE.md)

**Business Value**: Comprehensive audit logging and compliance tracking for security and regulatory requirements.

**Key Capabilities**:
- Comprehensive audit logging (all operations)
- GDPR/CCPA/DPDP compliance
- SOC2 Type II requirements
- Data classification and governance
- Access control audit
- Incident management
- Data subject rights handling (export, deletion)
- Retention and deletion policies
- Legal holds

**Technical Stack**:
- Backend: `audit_service.py`, `compliance_service.py`, `data_governance_service.py`
- API: 20+ endpoints for audit and compliance
- Database: 10 core tables for audit logs, compliance, incidents
- Frontend: Audit log viewer, compliance status, incident tracker

**Scalability**: Log aggregation, compression, archiving

**Integration Points**: All features (audit trail for all operations)

---

### 14. **Self-Service Features**
📄 [14_SELF_SERVICE.md](14_SELF_SERVICE.md)

**Business Value**: Enable users to manage their accounts independently, reducing administrative overhead and support tickets by 40-60% while ensuring GDPR/CCPA compliance.

**Key Capabilities**:
- Profile management (name, bio, phone, timezone, language)
- Avatar upload with automatic resizing (4 size variants)
- Password change with session invalidation
- Password reset flow (TODO - priority implementation)
- Email change with verification
- Two-factor authentication (TOTP with backup codes)
- Session management (list, terminate, logout everywhere)
- Notification preferences (email/in-app by category)
- Privacy settings (analytics opt-out, profile visibility)
- Data export (GDPR Article 20 compliance)
- Account deletion with 30-day grace period (GDPR Article 17)

**Technical Stack**:
- Backend: `account_deletion_service.py`, `email_verification_service.py`, `totp_service.py`, `session_service.py`
- API: 25+ endpoints for self-service operations
- Database: Users, sessions, 2FA, deletion requests, verification tokens
- Frontend: ProfileSettingsPage, NotificationSettingsPage, ForgotPasswordPage

**Scalability**: Rate limiting, async processing for exports, Redis session caching

**Integration Points**: Authentication, Notifications, Storage (avatars), Audit (all actions logged), Billing (subscription status)

---

### 15. **Notifications & Communication**
📄 [15_NOTIFICATIONS_COMMUNICATION.md](15_NOTIFICATIONS_COMMUNICATION.md)

**Business Value**: Central nervous system for user engagement, ensuring timely delivery of transactional alerts, marketing messages, and workflow updates across multiple channels.

**Key Capabilities**:
- Multi-channel delivery (Email, SMS, In-App)
- Branded email templates
- Granular user preference center
- System-wide announcements
- Workflow triggers (Gallery Ready, Order Received)
- Delivery tracking and analytics

**Technical Stack**:
- Backend: `notification_service.py`, `email_service.py`, `sms_service.py`
- API: 15+ endpoints for preferences and history
- Database: Notification logs, templates, preferences
- Frontend: Notification center, settings panel

**Scalability**: Queue-based delivery (Celery), provider abstraction (SES/SendGrid)

**Integration Points**: All features (triggers notifications)

---

### 16. **Calendar Integrations & Booking Management**
📄 [16_CALENDAR_BOOKINGS.md](16_CALENDAR_BOOKINGS.md)

**Business Value**: Transform RawDrive into a revenue-generating hub by enabling self-service bookings, calendar sync, and deposit collection without manual back-and-forth.

**Key Capabilities**:
- Availability management (working hours, buffers, block-out dates)
- Two-way calendar sync (Google/Outlook) to avoid double bookings
- Service catalog with duration and pricing
- Self-service booking pages and optional approval mode
- Integrated deposits and refunds
- Self-service rescheduling within policy limits

**Technical Stack**:
- Backend: `calendar_service.py`, `booking_service.py`, `calendar_sync_service.py`
- API: 15+ endpoints for availability, bookings, and sync status
- Database: Calendars, bookings, services, sync tokens
- Frontend: Booking page, availability editor, schedule calendar

**Scalability**: Optimized availability queries, locking for concurrent bookings, robust timezone handling

**Integration Points**: Client CRM, Billing, Notifications, Company Profile (branded booking page)

---

### 17. **API & Integrations**
📄 [17_API_INTEGRATIONS.md](17_API_INTEGRATIONS.md)

**Business Value**: Expose RawDrive as a platform for studios, enterprises, and developers by providing programmatic access, webhooks, and MCP tools for AI agents.

**Key Capabilities**:
- REST API for galleries, clients, invitations, analytics, and more
- Workspace-scoped API keys and OAuth 2.0 for third-party apps
- Webhooks for real-time events (gallery published, invitation sent, payment received)
- Model Context Protocol (MCP) tools/resources for AI agents
- Strong rate limiting and versioned endpoints

**Technical Stack**:
- Backend: `developer_platform_service.py`, `api_key_service.py`, `webhook_service.py`
- API: `/api/v1/**` surface, API key and OAuth endpoints
- Database: API keys, webhook endpoints, webhook deliveries
- Developer tooling: OpenAPI schema, Postman collection, MCP manifest

**Scalability**: Per-workspace/IP throttling, cursor-based pagination, async webhook delivery

**Integration Points**: All features (API surface), Audit (log API actions), Authentication/RBAC

### 19. **Admin Roles & Platform Management**
📄 [19_admin_roles.md](19_admin_roles.md)

**Business Value**: Governance layer for the SaaS platform, ensuring operational stability, support access, and security via specialized admin roles.

**Key Capabilities**:
- Dual-Scope RBAC (Workspace vs Platform)
- Specialized roles (Super Admin, Support, Content, Finance)
- Support Access (Impersonation)
- Moderation tools
- Feature flag management

**Technical Stack**:
- Backend: `rbac_service.py`, `admin_service.py`
- Database: `platform_roles`, `audit_logs`

---

### 20. **Business Onboarding & Workspace Setup**
📄 [20_ONBOARDING_AND_WORKSPACE_SETUP.md](20_ONBOARDING_AND_WORKSPACE_SETUP.md)

**Business Value**: The "First Mile" experience converting sign-ups into active business workspaces through automated provisioning and guided setup.

**Key Capabilities**:
- Streamlined Setup Wizard
- Automated Workspace Provisioning
- Trial Plan Assignment
- Initial Branding Setup
- Onboarding Checklist

**Technical Stack**:
- Backend: `onboarding_service.py`, `workspace_service.py`
- Database: `workspaces`, `onboarding_state`

---

### 21. **Team Management**
📄 [21_TEAM_MANAGEMENT.md](21_TEAM_MANAGEMENT.md)

**Business Value**: Securely scale studio operations by inviting employees and freelancers with granular access controls (RBAC).

**Key Capabilities**:
- Email Invitation System
- Role Assignment (Owner, Admin, Editor, Viewer)
- Member Suspension/Removal
- Activity Audit Logging
- Public Team Showcase

**Technical Stack**:
- Backend: `team_service.py`, `invitation_service.py`
- Database: `user_workspaces`, `workspace_invitations`

---

### 18. **Digital Album (Design Studio)**
📄 [18_DIGITAL_ALBUM_DESIGN.md](18_DIGITAL_ALBUM_DESIGN.md)

**Business Value**: Drive high-margin revenue by letting photographers design, proof, and export print-ready albums directly from RawDrive galleries.

**Key Capabilities**:
- Lab presets and custom sizes with live bleed/gutter validation
- Drag-and-drop designer workspace with templates and auto-layout
- Photo usage tracking (used/unused/favorites)
- Client proofing with comments, versions, and explicit "Approve for Print" flow
- High-res exports with lab-ready color profiles

**Technical Stack**:
- Backend: `album_project_service.py`, `album_render_service.py`
- API: Endpoints for projects, spreads, comments, and exports
- Database: Album projects, spreads, layout elements, export jobs
- Frontend: Design Studio canvas, proofing viewer, comment panel

**Scalability**: Efficient browser rendering, background export workers, large-file storage handling

**Integration Points**: Gallery Management, Client CRM, Billing (album payments), Notifications (drafts/approvals)

### 16. **Calendar Integrations & Booking Management**
📄 [16_CALENDAR_BOOKINGS.md](16_CALENDAR_BOOKINGS.md)

**Business Value**: Transforms the platform into a revenue-generating hub by enabling direct client bookings, deposit collection, and automated schedule management.

**Key Capabilities**:
- Real-time availability management
- Two-way sync with Google/Outlook calendars
- Service menu configuration (duration, price)
- Integrated deposit collection
- Automated confirmation and reminders
- Rescheduling workflows

**Technical Stack**:
- Backend: `booking_service.py`, `calendar_sync_service.py`
- API: 20+ endpoints for availability and bookings
- Database: Bookings, availability rules, calendar tokens
- Frontend: Booking widget, calendar view, service setup

**Scalability**: Concurrency locking, timezone handling

**Integration Points**: Client CRM, Billing, Notifications, Company Profile

---

### 17. **API & Integrations**
📄 [17_API_INTEGRATIONS.md](17_API_INTEGRATIONS.md)

**Business Value**: Extends the platform's capabilities by allowing third-party tools and custom workflows to integrate securely, fostering an ecosystem around RawDrive.

**Key Capabilities**:
- REST API for core resources
- Model Context Protocol (MCP) for AI agents
- OAuth 2.0 authentication
- Webhooks for real-time events
- Workspace-scoped API keys
- Comprehensive documentation (Swagger/OpenAPI)

**Technical Stack**:
- Backend: FastAPI, MCP SDK
- API: Full platform coverage
- Database: API keys, webhook subscriptions, audit logs
- Frontend: Developer portal, API key management

**Scalability**: Rate limiting, async webhooks

**Integration Points**: All features (exposed via API)

---

### 23. **Mobile Companion App**
📄 [23_MOBILE_COMPANION_APP.md](23_MOBILE_COMPANION_APP.md)

**Business Value**: Empower photographers to manage their business, upload BTS content, and respond to clients from anywhere.

**Key Capabilities**:
- Dashboard on the Go
- Mobile Gallery Creation
- WhatsApp Integration
- Offline Mode

**Technical Stack**:
- Framework: React Native
- Security: Biometric Auth

---

### 24. **Growth & Referrals**
📄 [24_GROWTH_AND_REFERRALS.md](24_GROWTH_AND_REFERRALS.md)

**Business Value**: Viral engines to lower CAC and drive organic growth through incentives and gamification.

**Key Capabilities**:
- Peer Referral Program ("Give/Get")
- Affiliate Partner Dashboard
- Setup Gamification (Bonus Credits)

**Technical Stack**:
- Backend: `referral_service.py`, `credit_ledger_service.py`

---

### 18. **Digital Album (Design Studio)**
📄 [18_DIGITAL_ALBUM_DESIGN.md](18_DIGITAL_ALBUM_DESIGN.md)

**Business Value**: A powerful upsell engine enabling photographers to design, proof, and sell physical albums directly within the platform, streamlining the print workflow.

**Key Capabilities**:
- Browser-based drag-and-drop designer
- Smart auto-layout and templates
- Lab-specific presets (bleed, safe zones)
- Client proofing and commenting
- Print-ready high-res export
- Integration with gallery favorites

**Technical Stack**:
- Backend: `album_service.py`, `render_service.py`
- API: 25+ endpoints for album design
- Database: Album projects, spreads, comments
- Frontend: Canvas editor, proofing view

**Scalability**: Client-side rendering, async export generation

**Integration Points**: Gallery Management, Client CRM, Billing

---

## Feature Integration Matrix

```
Gallery Management
├── → Client CRM (galleries linked to clients)
├── → AI Search (photos analyzed for metadata)
├── → Face Detection (faces detected in photos)
├── → Invitations (galleries embedded in invitations)
├── → Company Profile (galleries branded)
├── → Customer Portal (galleries viewed by clients)
├── → Billing (storage quota based on plan)
├── → Storage (photos stored)
├── → Notifications (client activity alerts)
└── → Analytics (gallery performance metrics)

Digital Invitations
├── → Gallery Management (galleries embedded)
├── → Client CRM (guests become clients)
├── → Face Detection (identify guests in photos)
├── → AI Search (AI-generated content)
├── → Company Profile (branded invitations)
├── → Notifications (invitation emails, RSVP alerts)
└── → Analytics (invitation engagement)

Face Detection
├── → Gallery Management (face-based filtering)
├── → Client CRM (identify clients)
├── → AI Search (face embeddings)
├── → Invitations (identify guests)
├── → Smart Curation (per-person coverage)
└── → Analytics (detection metrics)

AI & Search
├── → Gallery Management (semantic search, curation)
├── → Face Detection (face embeddings)
├── → Client CRM (recommendations)
├── → Invitations (AI-generated content)
├── → Billing (AI credits)
└── → Analytics (search analytics)

Company Profile
├── → Gallery Management (branded galleries)
├── → Invitations (branded invitations)
├── → Customer Portal (branded experience)
└── → Analytics (profile analytics)
```

---

## Scalability Architecture for 5,000+ Concurrent Connections

### Load Distribution
- **Cloudflare Edge**: TLS termination, routing, rate limiting, WAF
- **Kubernetes Ingress**: Distribute traffic across backend pods
- **Database Connection Pooling**: asyncpg with configurable pool size
- **Redis Clustering**: Horizontal scaling for sessions/cache

### Performance Optimization
- **Lazy Loading**: Components load on-demand
- **Query Caching**: Frequently accessed data cached in Redis
- **Image Derivatives**: Pre-generated thumbnails and web-optimized versions
- **Pagination**: Cursor-based pagination for large datasets
- **Indexed Queries**: Database indexes on workspace_id and common filters

### Monitoring & Scaling
- **Prometheus Metrics**: Real-time performance monitoring
- **Grafana Dashboards**: Visual monitoring and alerting
- **Auto-scaling**: Kubernetes HPA scales pods based on CPU/memory
- **Circuit Breaker**: Prevents cascading failures in AI services

### Performance Targets
- Gallery load: < 2 seconds on 4G
- API response: < 300ms for typical queries
- Image delivery: < 500ms per image
- Search response: < 500ms
- Concurrent users: 5,000+ per workspace

---

## Technology Stack Summary

### Frontend
- **React 19**: Modern UI with hooks and concurrent rendering
- **TypeScript**: Static type checking
- **Vite**: Fast build tool with HMR
- **Tailwind CSS**: Utility-first styling
- **Framer Motion**: Smooth animations

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
- **Cloudflare R2**: Object storage (default)
- **Cloudflare CDN**: Global content delivery
- **Kubernetes**: Container orchestration
- **BullMQ**: Redis-based job queue

### AI & Search
- **Google Gemini**: Primary AI provider (default)
- **Google Cloud Vision**: Face detection
- **Fallback Providers**: OpenAI, Anthropic, Azure, local servers

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
- Search "no result" rate under 5%

---

## Navigation Guide

### By User Role
- **Photographer/Studio Owner**: [Gallery](02_GALLERY_MANAGEMENT.md), [CRM](05_CLIENT_CRM.md), [Profile](07_COMPANY_PROFILE_BRANDING.md), [AI](06_AI_SEARCH_GEO.md)
- **Client/Guest**: [Portal](08_CUSTOMER_WEB_PORTAL.md), [Invitations](03_DIGITAL_INVITATIONS.md)
- **Corporate Admin**: [Auth](09_AUTHENTICATION_AUTHORIZATION.md), [Audit](13_AUDIT_COMPLIANCE.md)
- **Finance Manager**: [Billing](10_BILLING_SUBSCRIPTION.md), [Analytics](12_ANALYTICS_REPORTING.md)

### By Feature Domain
- **Content Management**: [Gallery](02_GALLERY_MANAGEMENT.md), [Storage](11_STORAGE_MEDIA_MANAGEMENT.md)
- **Client Engagement**: [Invitations](03_DIGITAL_INVITATIONS.md), [Portal](08_CUSTOMER_WEB_PORTAL.md), [CRM](05_CLIENT_CRM.md)
- **AI & Discovery**: [Face Detection](04_FACE_DETECTION_PEOPLE.md), [AI Search](06_AI_SEARCH_GEO.md)
- **Business Operations**: [Billing](10_BILLING_SUBSCRIPTION.md), [Analytics](12_ANALYTICS_REPORTING.md)
- **Security & Governance**: [Auth](09_AUTHENTICATION_AUTHORIZATION.md), [Audit](13_AUDIT_COMPLIANCE.md)

---

## Quick Links

| # | Feature | Document |
|---|---------|----------|
| 1 | Overview | [01_OVERVIEW.md](01_OVERVIEW.md) |
| 2 | Gallery Management | [02_GALLERY_MANAGEMENT.md](02_GALLERY_MANAGEMENT.md) |
| 3 | Digital Invitations | [03_DIGITAL_INVITATIONS.md](03_DIGITAL_INVITATIONS.md) |
| 4 | Face Detection | [04_FACE_DETECTION_PEOPLE.md](04_FACE_DETECTION_PEOPLE.md) |
| 5 | Client CRM | [05_CLIENT_CRM.md](05_CLIENT_CRM.md) |
| 6 | AI & Search | [06_AI_SEARCH_GEO.md](06_AI_SEARCH_GEO.md) |
| 7 | Company Profile | [07_COMPANY_PROFILE_BRANDING.md](07_COMPANY_PROFILE_BRANDING.md) |
| 8 | Customer Portal | [08_CUSTOMER_WEB_PORTAL.md](08_CUSTOMER_WEB_PORTAL.md) |
| 9 | Authentication | [09_AUTHENTICATION_AUTHORIZATION.md](09_AUTHENTICATION_AUTHORIZATION.md) |
| 10 | Billing | [10_BILLING_SUBSCRIPTION.md](10_BILLING_SUBSCRIPTION.md) |
| 11 | Storage | [11_STORAGE_MEDIA_MANAGEMENT.md](11_STORAGE_MEDIA_MANAGEMENT.md) |
| 12 | Analytics | [12_ANALYTICS_REPORTING.md](12_ANALYTICS_REPORTING.md) |
| 13 | Audit & Compliance | [13_AUDIT_COMPLIANCE.md](13_AUDIT_COMPLIANCE.md) |
| 14 | Self-Service | [14_SELF_SERVICE.md](14_SELF_SERVICE.md) |
| 15 | Notifications | [15_NOTIFICATIONS_COMMUNICATION.md](15_NOTIFICATIONS_COMMUNICATION.md) |
| 16 | Calendar & Bookings | [16_CALENDAR_BOOKINGS.md](16_CALENDAR_BOOKINGS.md) |
| 17 | API & Integrations | [17_API_INTEGRATIONS.md](17_API_INTEGRATIONS.md) |
| 18 | Digital Album | [18_DIGITAL_ALBUM_DESIGN.md](18_DIGITAL_ALBUM_DESIGN.md) |

---

## Related Documentation

- **Product Overview**: `.kiro/steering/product.md`
- **Technology Stack**: `.kiro/steering/tech.md`
- **Project Structure**: `.kiro/steering/structure.md`
- **Feature Specifications**: `docs/Features/`
- **Technical Specifications**: `docs/TechnicalSpecs/`
- **Implementation Specs**: `specs/`, `.kiro/specs/`

---

## Document Maintenance

**Last Updated**: January 5, 2026  
**Version**: 2.0  
**Owner**: RawDrive Product Team

### Update Schedule
- Quarterly: Feature updates and new capabilities
- Monthly: Performance metrics and scalability updates
- As-needed: Security and compliance updates
