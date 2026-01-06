Below is a concise High-Level Design (HLD) for RawDrive aligned to the consolidated PRD (Draft v2).

---

# High-Level Design (HLD) — RawDrive

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

**Domain:** Multi-tenant photo/video delivery, album production, CRM/booking, AI discovery (GEO), and enterprise BYOS governance  
**Scope:** Core architecture, main components, data flows, tenancy (workspace model), storage/BYOS, AI, governance, and integrations

---

## 1. Overall Architecture

### 1.1 Style

- **Cloud-native, multi-tenant SaaS** (workspace-scoped)
- **Backend-for-frontend (BFF)** + modular domain services
- **Hybrid storage**: managed object storage + BYOS providers
- **Event-driven side-effects** (queues / background workers) for heavy tasks
- **Search-first media library** powered by AI metadata + vector embeddings (Postgres + pgvector)

### 1.2 Logical Components

- **API Gateway / Edge**
  - Cloudflare edge by default: terminates TLS, routes requests, rate-limiting, WAF, DDoS protection, bot mitigation (Turnstile).
- **Auth & Workspace Service**
  - Users, workspaces, roles, SSO, sessions, workspace membership.
- **Core Domain Services**
  - Gallery Service  
  - Album Designer Service  
  - Client Management & Booking Service  
  - Storage & Sync Service (Managed + BYOS)  
  - AI Platform Service (credits, job orchestration, model calls)  
  - GEO Search Service (semantic metadata, embeddings, relationship graph, search APIs)
  - People Service (face detection, embeddings, clustering, tagging)
  - Subscription & Billing Service
  - Trial Lifecycle Service (30-day trial, reminders, expiry/disable, retention timers)
  - Governance Service (labels/classification, retention, legal hold, CMK policies; enterprise)
  - Notifications Service (email first; queued delivery)
  - Developer Platform Service (API keys, webhooks, SDK/MCP surfaces; MCP runtime reference: FastAPI + FastMCP)
- **Frontends**
  - Photographer/Studio Web App (dashboard)  
  - Client Portal (gallery viewer, selections, proofing)  
  - Corporate Workspace Web App (white‑label shell)
- **Background Workers**
  - Media processing (thumbnails, transcodes)  
  - AI processing (metadata enrichment, embeddings, GEO scoring, relationships)  
  - People processing (face scan, clustering, re-scan)
  - Sync jobs (Drive/Dropbox/S3/Azure)  
  - Notifications (email pipeline, retries)
  - Trial jobs (reminders, expiry, re-engagement, cleanup)
  - Retention jobs (recycle bin purge, customer removal)
- **Shared Infrastructure**
  - Relational DB (Postgres)  
  - Vector search (pgvector in Postgres) for embeddings
  - Object storage (Cloudflare R2 default; BYOS via S3/Azure/etc) for managed media + derived assets
  - Cache (Redis)  
  - Message broker/queue (e.g., SQS/Rabbit/Kafka)  
  - Logging/metrics/tracing stack

***

## 2. Tenancy (Workspace Model), Auth & RBAC

### 2.1 Tenancy Model

- **Workspaces table**: one row per customer workspace (photographer/studio or enterprise/corporate).
- Every domain entity (gallery, album, client, job, share link, AI metadata, People, audit events) includes `workspace_id` (legacy alias: `tenant_id` — avoid in new schemas/docs).
- Data access:
  - All DB queries and service calls are workspace-scoped.
  - Optionally enforce Row Level Security (Postgres RLS) in addition to app logic.

**Note on “single-company” experience:** the product can feel single-org for photographers while still being technically multi-tenant; one studio = one workspace.

### 2.2 Users & Roles

- **Users** linked to workspaces via join table `user_workspaces` (supports multi-workspace membership, e.g., an editor works for multiple studios).
- **Role system**:
  - Global: Platform Super Admin.  
  - Per workspace: Owner, Admin, Photographer, Editor, Finance, Client; enterprise roles (Workspace Admin, Media Admin, Event Manager, Internal Viewer, External Guest).
- Roles map to permission bundles; enforcement happens in **Auth middleware** and domain services.

### 2.3 Auth Flow

- Primary:
  - Direct users: **Google OAuth (OIDC)** as primary signup/login.
  - Fallback: **local users** (email/password) for users without Google ID.
  - JWT / cookie-based session; short-lived access tokens, refresh tokens.
- Enterprise SSO:
  - SAML/OIDC integration per enterprise workspace (Azure AD, Okta).
  - Just-in-time user provisioning; group → role mapping.
  - (Later) SCIM provisioning.
- Every request:
  - Edge decodes token → Auth service validates → attaches `user_id`, `workspace_id`, roles → passed to domain services.

***

## 3. Backend Services (Logical)

### 3.1 Gallery Service

**Responsibilities**

- CRUD for galleries, sub‑galleries, and media mappings.
- Sharing model: public/secret links, PIN/password, expiry, per‑photo lock.
- Client selections, comments, proof status.

**Key behaviors**

- Share links are capability-based grants and must be auditable.
- “Per-photo lock” must not leak existence of locked assets to unauthorized viewers.

**Key APIs (examples)**

- `POST /api/galleries` – create gallery.  
- `GET /api/galleries/:id` – gallery details + sections.  
- `GET /api/galleries/:id/media` – paginated list (with filters).  
- `POST /api/galleries/:id/shares` – create/update share links.  
- `POST /api/media/:id/select` – toggle selection per client.  
- `POST /api/media/:id/comments` – add comment; internal/client visibility.

### 3.2 Album Designer Service

**Responsibilities**

- Album projects, spreads, elements (images, text, shapes).
- Lab presets, cover designs, versioning, proofing.

**APIs**

- `POST /api/albums` – create album for gallery.  
- `GET /api/albums/:id` – fetch structure, spreads.  
- `POST /api/albums/:id/spreads` – save layout.  
- `POST /api/albums/:id/proof/share` – publish proof link.  
- `POST /api/albums/:id/export` – trigger export job.

### 3.3 Storage & Sync Service

**Responsibilities**

- Unified abstraction over:
  - Managed object storage.  
  - BYOS providers (Google Drive/Dropbox/S3/Azure).
- Upload URLs, media metadata, sync jobs.

**Flows**

- Upload:
  - Frontend → get signed upload URL from Storage service → upload file → callback/notification → Gallery service creates media record.
- BYOS:
  - OAuth flow; store tokens securely.  
  - Create a per-gallery root in the provider:
    - Drive/Dropbox: folder(s)
    - S3/Azure: bucket/container + prefixes (or a workspace root prefix)
  - Maintain `external_folder_id` and `external_file_id`.  
  - Sync worker periodically reconciles remote state with DB.

### 3.4 Client Management & Booking Service

**Responsibilities**

- Clients/leads, jobs/events, calendar, packages, quotes & invoices, payments integration.

### 3.5 AI Platform Service

**Responsibilities**

- Quota/credit enforcement per workspace plan.
- Background job orchestration for AI workloads.
- **AI-native, multi-provider model routing** for captions/tags/analysis/search enrichment, with **Gemini as the default**.
- Support provider backends:
  - **Google Gemini** (primary/default)
  - **OpenAI**
  - **Anthropic**
  - **Azure-hosted models** (e.g., Azure OpenAI / Azure AI Foundry)
  - **OpenAI-compatible local servers** (e.g., Ollama, LM Studio) for self-hosted deployments
- Admin-configurable **Model Profiles** per capability (text, vision, embeddings, moderation) with fallback.
- Produces AI outputs that feed GEO Search and Gallery/Album features.

### 3.6 GEO Search Service (Generative Engine Optimization)

**Responsibilities**

- Generate semantic metadata for assets (descriptions, tags, scene, mood, color palette, EXIF extraction).
- Generate and store embeddings (pgvector), validate dimensionality/normalization.
- Compute and persist GEO quality score (0–100) and recommendations.
- Build semantic relationships graph (visual similarity, shared subjects, temporal proximity, location, same people).
- Provide search APIs:
  - natural language search
  - vector similarity search
  - hybrid search and related-photos retrieval
- Provide GEO health analytics and failed-query diagnostics.

### 3.7 People Service (Face Recognition & Tagging)

**Responsibilities**

- Detect faces and compute embeddings per face.
- Store embeddings in pgvector, scoped by workspace.
- Cluster faces into “people” groups; support rename, merge, split.
- Persist bounding boxes for face tags (metadata-driven; do not modify original images).
- Client visibility is opt-in per gallery.

### 3.8 Subscription & Billing

**Responsibilities**

- Plan definitions, limits, usage tracking.
- Integration with payment provider (Stripe/Razorpay).
- Enforcement layer that other services consult for limits.

### 3.9 Trial Lifecycle Service

**Responsibilities**

- Create a 30-day trial on signup with Business-tier feature access/limits.
- Send 7/3/1 day reminders and expiry notices.
- On expiry: transition account to disabled (no grace period) until upgrade.
- Abuse prevention: blacklist email and company name on trial completion (expiry or upgrade).
- Retention timers: retain data for 90 days post-expiry; delete at 120 days if not upgraded (except blacklist entries).
- Re-engagement email campaign scheduling for up to 12 months.

### 3.10 Governance Service (Enterprise)

**Responsibilities**

- Sensitivity labels/classification and policy evaluation.
- Retention policies per label, legal hold, and immutability controls.
- Customer-managed key (CMK/KMS) policy integration for enterprise storage.
- Data sovereignty routing and enforcement where required.
- Org hierarchy model (HQ → region → country → branch) for access/policy scoping.

### 3.11 Notifications Service

**Responsibilities**

- Unified notifications routing (email-first; optional SMS/WhatsApp later).
- Templates, scheduling, retries, and delivery observability.

### 3.12 Developer Platform Service

**Responsibilities**

- API keys, OAuth (future), request signing policies.
- Webhooks (HMAC signatures, replay protection, event retries).
- SDK distribution/documentation surfaces.
- Optional MCP resources/tools/prompts for automation.

***

## 4. Frontend Architecture

### 4.1 Apps

- **Studio Dashboard**
  - SPA (React/Vue) with router.  
  - Modules: Galleries, Albums, Clients, Calendar, Billing, Settings.
- **Client Portal**
  - Separate entry, white-labeled per workspace.  
  - Routes: Home (galleries list), Gallery detail, Album proof, Payments.
- **Corporate Workspace UI**
  - Shell using workspace-specific theming (CSS variables).  
  - Additional sections: Policies, Teams/Groups, Audit.
  - Enterprise-only sections: Labels, Retention, Legal Hold, Key Management.

### 4.2 State & Data

- Use a **data fetching layer** (React Query/SWR) to call REST/GraphQL APIs.
- Global auth/workspace context.
- Caching of gallery lists, media pages, and user profile.
- Feature flags for AI/BYOS/corporate modules.

### 4.3 Key UI Patterns

- Main shell: header + left sidebar for navigation.  
- Masonry gallery grids with:
  - Responsive columns, lazy‑loaded images, skeleton states.  
- Lightbox:
  - Keyboard + swipe navigation, comments overlay, selection controls.  
- Album designer canvas:
  - Drag/drop, resizable frames, toolbar, undo/redo.

***

## 5. Data Model (High‑Level)

Core relational tables (simplified):

- `workspaces`  
- `users`  
- `user_workspaces` (roles)  
- `galleries` (workspace_id, title, event_date, etc.)  
- `sub_galleries`  
- `media` (gallery_id, storage_provider, path/file_id, type, metadata)  
- `media_selections` (media_id, client_id, context)  
- `media_comments` (media_id, author_id, visibility, text, status)  
- `albums`, `album_spreads`, `album_elements`  
- `clients`, `jobs/events`, `invoices`, `payments`  
- `share_links` (workspace_id, type, token, password_hash, expiry, scope)  
- `ai_jobs`, `ai_metadata`  
- `geo_scores`, `semantic_relationships`, `search_query_log`  
- `people`, `photo_people`, `face_embeddings`  
- `subscription_plans`, `workspace_subscriptions`, `usage_counters`  
- `trial_blacklist`, `trial_email_queue`, `reengagement_campaigns`, `trial_analytics`  
- `audit_events` (policy-relevant actions: view/download/share/admin changes)  
- `labels`, `retention_policies`, `legal_holds`, `cmk_configs` (enterprise)

External mapping tables:

- `storage_integrations` (workspace_id, provider, tokens, root_folder_id).  
- `idp_integrations` (workspace_id, protocol, config).  
- `webhook_subscriptions` (workspace_id, endpoint, secret, events).

***

## 6. Integrations

- **Storage**: Google Drive, Dropbox, S3‑compatible store.  
- **AI**: multi-provider model backends with a Model Router (Gemini default; supports OpenAI/Anthropic/Azure-hosted and OpenAI-compatible local endpoints) + embeddings in Postgres/pgvector.  
- **Payments**: Razorpay/Stripe.  
- **SSO**: Azure AD/Okta/Google via SAML/OIDC.  
- **Email / SMS / WhatsApp**: SMTP + provider APIs for notifications (email first).

***

## 7. Cross‑Cutting Concerns

### 7.1 Security

- Central auth + RBAC.  
- Workspace-scoped data access in every service.  
- OWASP Top 10 mitigations; signed URLs for media.
- Share links are capability tokens and must be treated as secrets (rotation/revocation supported).
- Enterprise governance events (label changes, retention/legal hold actions) are auditable.

### 7.2 Observability

- Central log aggregation.  
- Metrics (per service, per workspace where useful).  
- Tracing for key flows (upload → process → gallery view).
- Additional tracing for: AI jobs, GEO enrichment, People scans, trial jobs.

### 7.3 Config & Feature Flags

- Config via env + secrets manager.  
- Feature flags (e.g., AI features, GEO, People, BYOS, enterprise governance) served to frontend & backend.

***

## 8. Deployment & Environments

- Environments: dev, staging, production.
- Default hosted deployment:
  - **Hostinger VPS (KVM)** nodes running a **self-managed Kubernetes cluster (kubeadm)**.
  - **Traefik v3 API Gateway** with KEDA autoscaling for north/south traffic; **cert-manager** for Let's Encrypt TLS.
  - **Cloudflare** in front of the cluster (CDN/WAF/DDoS/rate limits) and **Turnstile** for bot mitigation.
  - **Cloudflare R2** for managed object storage; media delivery via Cloudflare edge with signed URLs.
- CI/CD:
  - Linting, tests, security scans.
  - Rolling deployments (or blue/green where needed).
- DB migrations with versioning and rollback mechanisms.

**Enterprise option:** support regional deployments (or data residency controls) as a Phase 4 capability, driven by governance requirements.

***

This HLD provides the architectural skeleton aligned to the PRD v2. Next, create LLDs per service (Gallery, Storage/BYOS, AI Platform, GEO Search, People, Trial Lifecycle, Governance, Developer Platform) and validate flows end-to-end with representative workspace scenarios.