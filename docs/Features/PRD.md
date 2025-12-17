
# Product Requirements Document (PRD)
## RawDrive — Photo & Video Delivery Platform with Albums, CRM, AI Search (GEO), and Enterprise BYOS Governance

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

**Last updated:** 17 Dec 2025  
**Owner:** Prasad Manyam  
**Company:** SWAZ Consultants  
**Product:** RawDrive  
**Status:** Draft v2 (consolidated)

---

## 1. Executive Summary

RawDrive is a multi-tenant platform for photographers, studios, and enterprise/corporate teams to manage the full media workflow end-to-end:

- **Ingest** (managed storage or BYOS), organize, and deliver photo/video galleries.
- **Collaborate** with clients and stakeholders via selections, comments, approvals, and proofs.
- **Produce** print and digital albums with a modern designer and print-safe exports.
- **Operate** the business with lead tracking, booking, contracts, and India-first payments.
- **Discover** content using AI-powered internal search (GEO): semantic metadata, embeddings, relationships, and personalized relevance.
- **Govern** enterprise media with SSO, policies, classification labels, retention/legal hold, and auditability.

RawDrive competes in an overcrowded market by combining three things most tools split across products:

1) client delivery + proofing, 2) album production, and 3) enterprise-grade governance/BYOS + AI discovery.

---

## 2. Product Principles (How we win)

1. **Client experience is the product.** Viewing, selecting, and approving must be effortless on mobile.
2. **Fast by default.** Galleries feel instant via progressive loading, caching, and derivatives.
3. **Trust and control.** Sharing is explicit, auditable, and policy-driven; no accidental leakage.
4. **BYOS without BYOS pain.** Users keep their storage; RawDrive provides the UX, metadata, search, and governance.
5. **AI that saves time, not creates work.** Background jobs, quotas/credits, clear previews, and reversible actions.

---

## 3. Target Users & Personas

1. **Photographer / Studio Owner**: delivers galleries, sells albums, runs bookings and payments.
2. **Client (Couple/Family)**: views, favorites, requests edits, approves album.
3. **Corporate Workspace Admin (Comms/HR/IT)**: SSO, roles, policies, retention, and security.
4. **Corporate Employee (Internal Viewer)**: secure portal access to internal galleries.
5. **External Guest / Agency**: time-boxed, scoped access with download rules.
6. **Platform Admin (RawDrive Ops)**: workspace support, abuse prevention, billing and monitoring.

---

## 4. Scope: What RawDrive ships

### 4.1 In scope

- Workspaces (multi-tenant) with RBAC, audit logging, and feature flags.
- Media ingestion to managed storage (Cloudflare R2 default) and/or BYOS providers.
- Fast global delivery via Cloudflare CDN (images/derivatives, client portal assets) with signed URLs and strict cache controls.
- Galleries + sub-galleries, viewer UX, selective sharing models, download controls, watermarking.
- Proofing: selections, comments, approvals, and notifications.
- Album designer (print + digital) with presets, guides, preflight, export.
- CRM + bookings (calendar integrations) + quotes/contracts + payments (India-first).
- AI features (tiered by plan): analysis, captions/hashtags, culling signals, duplicates, semantic search, People/face features.
- GEO internal search optimization system (quality score, enrichment, relationships graph).
- Developer platform: REST API, webhooks, SDKs; optional MCP resources/tools for automation.
- Enterprise governance: SSO, policies, sensitivity labels/classification, retention/legal hold, CMK support, sovereignty routing.
- Data lifecycle management: retention rules, recycle bin, purge, customer removal automation.

### 4.2 Out of scope (initial)

- Full video editing suite (beyond hosting, playback, thumbnails, basic trimming/cover selection).
- Offline desktop album design tools (web-first only).
- External SEO growth product (GEO is internal AI discovery, not public SEO).

---

## 5. Success Metrics

### 5.1 Activation & retention

- $\ge 60\%$ of new signups upload a gallery within 48 hours.
- $\ge 40\%$ of active photographers share a client link within 7 days.
- $\ge 25\%$ of Business-trial users convert to paid within 30 days.

### 5.2 Client experience

- Median time-to-first-photo (client view) under 2 seconds on a typical 4G connection.
- $\ge 80\%$ of client sessions successfully complete at least one action (view, favorite, download, comment).

### 5.3 AI value

- $\ge 30\%$ reduction in time spent finding photos (self-reported and behavior proxies).
- Search “no result” rate under 5% for accounts with GEO scores $\ge 80$.

---

## 6. Core Concepts and Data Model (Product-level)

### 6.1 Workspace (Tenant) Model — resolves tenancy/RBAC inconsistencies

- A **Workspace** is the unit of tenancy and billing.
- A workspace can be:
  - **Photographer Workspace** (self-serve): one studio/photographer organization.
  - **Enterprise Workspace** (corporate): org hierarchy, policies, and governance.

**Rule:** every record that can contain customer data is scoped to exactly one workspace via `workspace_id` (legacy alias: `tenant_id` — avoid in new schemas/docs).

Implementation note (for cross-doc alignment): a “single-company” product experience is represented as a single workspace; isolation is still enforced by `workspace_id`, even if the UI is “one studio”.

### 6.2 Library objects

- **Gallery**: container for media; supports sub-galleries/sections.
- **Asset**: photo or video plus derivatives and metadata.
- **Client**: end-recipient identity for selections/comments and deliveries.
- **Album**: digital/print project containing spreads/pages.
- **Share Link**: capability-based access grant with policy rules and auditing.

---

## 7. Functional Requirements (By Domain)

### 7.1 Identity, Authentication, and RBAC

**Requirements**

- Support email/password sign-in and optional social auth (future), with MFA options.
- Enterprise: SAML/OIDC SSO, Just-in-Time provisioning, group-to-role mapping; SCIM is a later milestone.
- RBAC is workspace-scoped and permission-driven (bundles).
- Platform (Ops) admin roles are **global** and separate from workspace RBAC; cross-workspace customer data access requires explicit, audited support access.
- Fine-grained permissions cover: upload/manage media, create/share links, download originals, manage billing, manage policies, manage users, manage retention/legal hold.

**Acceptance criteria (high-signal)**

1. WHEN an authenticated user requests any workspace-scoped resource THEN the system SHALL enforce `workspace_id` authorization and deny cross-workspace access.
2. WHEN a role is updated THEN permissions take effect within 60 seconds for all active sessions.

---

### 7.2 Storage, Ingestion, and Sync (Managed + BYOS)

**Modes**

1. **Managed Storage** (default): Cloudflare R2 (or compatible object storage).
2. **BYOS**:
   - Google Drive
   - Dropbox
   - AWS S3
   - Azure Blob
   - (future) GCS

**Delivery requirement (hosted)**

- In RawDrive-hosted mode, deliver media and static assets via **Cloudflare CDN**, with cache rules that respect workspace policies (expiry/revocation), and signed URL TTLs.

**Requirements**

- Workspace chooses storage mode (managed or BYOS) and provider.
- OAuth flows for Drive/Dropbox use least-privilege scopes and store tokens securely.
- File mapping and sync:
  - Maintain provider identifiers (folder IDs, file IDs), checksums, MIME types.
  - Background jobs reconcile external deletes/moves.
- Media access uses signed/temporary URLs; provider credentials are never exposed to clients.
- Support resumable uploads (where feasible) and background processing pipelines.

---

### 7.3 Galleries, Client Portal, and Sharing

**Client viewing experience**

- Responsive masonry/grid gallery with lazy loading.
- Lightbox with zoom, swipe, keyboard navigation, slideshow.
- Download modes: view-only, web-size, original; enforce policy and watermarking.

**Sharing models**

- Public link
- Link + PIN
- Password
- Invite-only (email-based)
- Expiry date/time and revocation

**Locking requirements (anti-leak)**

- General lock (gallery PIN) gates the gallery.
- Per-asset lock (per-photo PIN/code) is supported.
- The UI must not reveal locked assets exist until the correct secret is presented.

**Selections and comments**

- Per-client selections (“favorites”) persisted per gallery/sub-gallery.
- Comment threads per asset and per album spread; open/resolved states.
- Comments can be marked internal-only by photographers.

**Accessibility & localization**

- WCAG 2.1 AA for client portal.
- Multi-language support (India-first, globally extensible).

**i18n requirements (India-first)**

- The Studio App, Client Portal, and Admin/Corporate UIs SHALL support internationalization (i18n) with a translation framework and locale-aware formatting.
- Users SHALL be able to set a **preferred UI language** (per user). Defaults: workspace default → browser language → English.
- Client Portal SHALL support **per-link or per-client language preference** (so a photographer can share a gallery in a client’s language).
- The system SHALL support the following **Indian languages** (initial set):
  - Hindi (हिन्दी)
  - Bengali (বাংলা)
  - Telugu (తెలుగు)
  - Marathi (मराठी)
  - Tamil (தமிழ்)
  - Gujarati (ગુજરાતી)
  - Kannada (ಕನ್ನಡ)
  - Malayalam (മലയാളം)
  - Punjabi (ਪੰਜਾਬੀ)
  - Urdu (اردو)
- Locale-aware formatting SHALL be applied for dates/times, numbers, and currency.
- The UI SHALL support **RTL rendering** for Urdu (layout, alignment, and typography) while keeping content safety and readability.
- Email templates and notifications SHOULD support localization (Phase 2) using the same translation keys.

---

### 7.4 Album Designer (Print + Digital)

**Requirements**

- Lab presets with page size, bleed, safe zones, and color profile; workspaces can save custom presets.
- Drag-and-drop layout with templates, guides, snapping, and safe/bleed/gutter overlays.
- Preflight checks: low-res warnings, bleed violations, missing spine settings.
- Proofing and approvals: comment pins on spreads; approval gates export.
- Export:
  - Lab-ready PDF/TIFF
  - Per-spread images
  - Print summary report

---

### 7.5 CRM, Booking, and Payments (India-first)

**Requirements**

- Lead capture and pipeline, client profiles, event/job records.
- Calendar (day/week/month), conflict warnings, and sync with Google Calendar/Outlook.
- Quotes, contracts, and GST invoices.
- Payments: UPI/card/netbanking via payment gateway; schedules and reminders.

---

### 7.6 AI Platform & Credit System

**Requirements**

- AI is quota-controlled via **credits** per workspace plan.
- AI workloads run as background jobs; UI displays progress and supports cancellation where safe.
- AI outputs are previewable and reversible (e.g., tags can be reverted).

**AI-native & multi-provider requirements**

- RawDrive SHALL be **AI-native**: core workflows (ingest, culling, tagging, search, album/story generation, client comms) are designed around AI assistance with human review.
- The AI Platform SHALL support a **Model Router** with multiple provider backends:
  - **Google Gemini** (primary/default)
  - **OpenAI**
  - **Anthropic**
  - **Azure-hosted models** (e.g., Azure OpenAI / Azure AI Foundry)
  - **OpenAI-compatible local servers** (e.g., Ollama, LM Studio)
- Admins SHALL configure **Model Profiles** per capability (text, vision, embeddings, moderation), including model name, limits, and safety settings.
- The system SHALL support **fallback** and **degraded modes** (e.g., queue + retry; switch to alternate provider/profile; skip optional enrichment) to keep core product usable.
- AI usage, latency, errors, and estimated cost SHALL be logged and visible per workspace (and to Platform Admin globally).

**Acceptance criteria (high-signal)**

1. WHEN a workspace admin changes the default AI provider/model profile THEN new AI jobs SHALL use the new configuration within 5 minutes (without redeploy).
2. WHEN a provider is unavailable or rate-limited THEN the Model Router SHALL either (a) fail over to a configured fallback profile or (b) mark the job as retryable and re-queue with backoff.
3. WHEN processing any asset for AI enrichment THEN the system SHALL store the provider/model identifiers used for the outputs for auditability and reprocessing.

---

### 7.7 Face Recognition & People View

**Requirements**

- Face detection produces embeddings and bounding boxes.
- Store embeddings using PostgreSQL `pgvector`.
- Create a “People” view for photographers:
  - clusters/groups, naming, merge/split, remove incorrect matches.
- Manual face tagging in viewer for missed faces.
- Client visibility is opt-in per gallery and disabled by default.

**Privacy**

- Face embeddings and people tags are isolated per workspace and never shared across workspaces.

---

### 7.8 GEO (Generative Engine Optimization) — Internal AI Search & Discovery

**Goal:** maximize internal discoverability for AI-powered queries (not external SEO).

**Requirements**

- On upload (or scheduled batch), generate semantic metadata:
  - descriptions, tags, scene type, mood, dominant colors, EXIF extraction.
- Generate and store vector embeddings (768-d where applicable) and normalize vectors.
- Maintain a GEO quality score per asset (0–100) with breakdown and recommendations.
- Build and store semantic relationships graph: visual similarity, shared subjects, temporal proximity, location proximity, same people.
- Provide semantic search that leverages metadata + embeddings + relationship graph traversal.
- Admin and workspace analytics for GEO health: coverage, score distributions, failed-query patterns.

**Performance requirement**

- Vector similarity search remains sub-second for workspaces with 10,000+ images.

---

### 7.9 Notifications and Communication

**Requirements**

- Email is the default channel; optional SMS/WhatsApp/push as later enhancements.
- Events: share link created, client viewed, comments, selections, approvals, payment reminders, trial reminders, retention/deletion notices.
- Delivery is queued; failures are retried and observable.

---

### 7.10 Data Retention, Customer Removal, and Recycle Bin

**Requirements**

- Soft-delete and recycle bin for galleries/assets with configurable retention windows.
- Customer removal automation (delete/anonymize as required), with audit trail.
- Enterprise: retention rules per classification label, legal hold, immutable retention where required.

---

### 7.11 Admin and Platform Management

**Requirements**

- Platform Super Admin can:
  - view workspace health and billing status
  - manage feature flags
  - investigate audit logs
  - manage abuse prevention and blacklists
  - create/disable platform admin accounts and assign/revoke specific admin role templates (least privilege)
  - start/approve break-glass support access sessions (audited)

---

### 7.12 Developer Platform (API, Webhooks, SDK, MCP)

**Requirements**

- REST API for Business+ tiers; API keys with rotation.
- OAuth (future) for third-party apps.
- Webhooks with HMAC signatures and replay protection.
- SDKs and developer documentation.
- Optional MCP resources/tools/prompts for automation and integrations.

---

### 7.13 Enterprise Workspace Mode & Governance (BYOS Requirements)

**Requirements**

- White-label branding, custom domains.
- SSO via SAML/OIDC; guest accounts optionally use app-level MFA.
- Policies: who can create external links, domain allowlists, watermark enforcement, download restrictions.
- Purview-like governance:
  - sensitivity labels/classification
  - auto-classification rules (where feasible)
  - retention rules per label
  - legal hold / immutability
  - CMK/KMS integration (customer-provided KMS/Key Vault where applicable; for RawDrive-hosted managed storage, use envelope encryption with a workspace key managed via a secure key store)
  - data sovereignty routing by region/country where required
  - org hierarchy (HQ → region → country → branch)
- Audit: sensitive views/downloads, exportable logs.

---

## 8. Pricing, Plans, and the Free Trial Lifecycle

### 8.1 Plans (product requirement)

- Plans enforce limits on storage, galleries, clients, team members, downloads, and AI credits.
- “Business” tier is the reference tier for high-value features (API access, face recognition, video).

### 8.2 30-day Free Trial (replaces unlimited free tier)

**Requirements**

- New signups receive a 30-day trial with **Business tier** feature access and limits.
- At expiry: no grace period; account is disabled until upgrade.
- Retain user data for 90 days post-expiry; delete at 120 days if not upgraded (except blacklist entries).
- Abuse prevention: blacklist email and company name upon trial completion (expiry or upgrade).
- Automated reminders: 7/3/1 days before expiry, expiry notice, re-engagement campaign for 12 months.

---

## 9. Non-Functional Requirements

### 9.1 Security & privacy

- OWASP Top 10 protections, strict authorization checks on every request.
- HTTPS everywhere, HSTS, secure cookies, session hardening, CSRF protections.
- Rate limiting and DDoS/CDN protections.
- Bot protection for high-risk public endpoints (signup/login, contact forms) via Cloudflare Turnstile.
- Encryption at rest for secrets and tokens.
- Audit logs for sensitive actions.

### 9.4 Infrastructure baseline (RawDrive-hosted)

The default hosted deployment assumptions for RawDrive are:

- **Edge:** Cloudflare (CDN + WAF + DDoS protection + rate limiting).
- **CAPTCHA:** Cloudflare Turnstile for bot mitigation.
- **Object storage:** Cloudflare R2 for managed media/derivatives and backup artifacts.
- **Compute:** Hostinger VPS (KVM) running a self-managed Kubernetes cluster (kubeadm).
- **Ingress/TLS:** Nginx Ingress Controller with cert-manager (Let’s Encrypt).
- **Backups:** automated Postgres backups to R2 (PITR-capable) and cluster backup/restore to R2 (e.g., Velero).

### 9.2 Performance & reliability

- 99.9% uptime for core gallery and delivery flows.
- P95 API latency < 300ms for typical read endpoints (excluding heavy AI/background jobs).
- Background jobs for AI, sync, derivatives; progress visible to users.
- Observability (open-source): OpenTelemetry instrumentation + Prometheus (metrics) + Grafana (dashboards) + Loki (logs) + Tempo/Jaeger (traces) + Alertmanager.

### 9.3 Accessibility & UX

- WCAG 2.1 AA baseline.
- Mobile-first client views.

---

## 10. Delivery Plan (Phasing with exit criteria)

### Phase 0 — Foundations

- Workspace model + RBAC
- Managed storage ingest + derivatives
- Basic galleries + share links

Exit: end-to-end upload → share → view works reliably and securely.

### Phase 1 — Photographer SaaS Core

- Client selections/comments/approval workflow
- Album designer v1 + exports
- CRM + booking + payments
- Subscription + billing + 30-day trial lifecycle

Exit: a studio can run a full client delivery + album approval flow.

### Phase 2 — BYOS + AI (GEO)

- BYOS providers (Drive/Dropbox first)
- AI credits system in production
- GEO metadata enrichment + embeddings + semantic search
- Face recognition + People view

Exit: search works with semantic queries and People view is stable and privacy-safe.

### Phase 3 — Corporate Workspace

- White-label + custom domains
- SSO (Azure AD first)
- Policies, audit logs, external sharing controls

Exit: corporate can deploy internal portal with audited sharing.

### Phase 4 — Enterprise Governance Enhancements

- CMK/KMS integrations
- Label-based retention + legal hold/immutability
- Sovereignty routing + org hierarchy
- SCIM, advanced analytics

Exit: enterprise governance requirements are met for regulated customers.

---

## 11. Risks, Dependencies, and Open Questions

### 11.1 Key risks

- BYOS sync edge cases (external moves/deletes) impacting trust.
- AI cost/latency and quota enforcement complexity.
- Enterprise governance scope creep (must be edition-gated and phased).

### 11.2 Open questions

- Which BYOS providers are required for Phase 2 beyond Drive/Dropbox (S3/Azure priority order)?
- What is the default derivative pipeline (sizes, formats) for best client performance?
- Which compliance targets are required for Enterprise launch (SOC2, ISO 27001, etc.)?

---

## 12. Traceability Matrix (Specs → PRD coverage)

| Spec Document | Covered in PRD Sections |
|---|---|
| `HLD.md` | 6, 7, 9, 10 |
| `CLIENT_FACING_FEATURES.md` | 7.3, 9.3 |
| `GalleryFeatures.md` | 7.3 |
| `DigitalAlbumFeatures.md` | 7.4 |
| `CALENDAR_INTEGRATIONS_AND_BOOKINGS.md` | 7.5 |
| `API_AND_INTEGRATIONS.md` | 7.12 |
| `DEVELOPER_TOOLS_AND_PROTOCOLS.md` | 7.12 |
| `NOTIFICATIONS_AND_COMMUNICATION.md` | 7.9 |
| `AUTHENTICATION_AND_SECURITY.md` | 7.1, 9.1 |
| `RBAC_AND_USER_MANAGEMENT.md` | 6.1, 7.1 |
| `STORAGE_AND_BACKUP.md` | 7.2, 7.10 |
| `DATA_RETENTION_AND_CUSTOMER_REMOVAL.md` | 7.10 |
| `CUSTOMER_AUTOMATED_ONBOARDING.md` | 8, 10 |
| `AI_POWERED_FEATURES.md` | 7.6, 7.8 |
| `FaceRecognizationRequiremtns.md` | 7.7 |
| `GEO_Search.md` | 7.8 |
| `BYOS_Requiremetns.md` | 7.13 |
| `FreeTrailLifecycle.md` | 8.2 |
