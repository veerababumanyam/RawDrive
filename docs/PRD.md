# Product Requirements Document (PRD)
## RawDrive — Enterprise SaaS for Professional Photography Management

> **Status:** Live (v0.3.2)  
> **Last updated:** 2026-01-09  
> **Version:** 4.0 (Microservices & AI-Native)

---

## 1. Executive Summary

RawDrive is a comprehensive enterprise-grade SaaS platform that revolutionizes professional photography management. It serves as an operating system for photographers, studios, and agencies, aiming to streamline the entire lifecycle of digital assets—from ingestion and organization to client delivery and business operations.

Unlike competitors that split functionality across multiple tools (e.g., gallery delivery vs. album design vs. business management), RawDrive provides a unified, AI-native platform. It empowers users to:
- **Manage** millions of assets with enterprise-grade reliability and "Bring Your Own Storage" (BYOS) flexibility.
- **Deliver** stunning, branded client galleries with PWA support and "View as Client" previews.
- **Collaborate** with clients via interactive proofing, comments, and selection workflows.
- **Market** themselves through SEO-optimized public profiles and Digital Visiting Cards.
- **Automate** workflows using robust Webhooks and AI-driven curation.
- **Govern** data with strict RBAC, audit logging, and SOC 2 compliance features.

## 2. Product Principles

1.  **Client Experience is the Product:** The end-client’s viewing experience must be flawless, fast, and mobile-first.
2.  **AI as a Copilot:** AI features (culling, tagging, search) should save time and enhance discovery without taking control away from the photographer.
3.  **Trust by Design:** Security, privacy, and governance are foundational, not afterthoughts. Explicit permissions and audit trails are mandatory.
4.  **Performance at Scale:** The system must handle millions of assets with sub-second retrieval times, leveraging edge caching (CDN) and efficient database indexing.
5.  **Platform Reliability:** A microservices architecture ensures fault isolation, scalability, and independent deployment of core capabilities.

## 3. Target Audience

1.  **Professional Photographers:** Solopreneurs and freelancers needing an all-in-one business center.
2.  **Photography Studios & Agencies:** Teams requiring multi-user collaboration, role-based access control (RBAC), and consistent branding.
3.  **Enterprise Organizations:** Large entities needing centralized digital asset management (DAM), SSO, and compliance (BYOS, data sovereignty).
4.  **End Clients:** Couples, families, and corporations who consume the content via galleries.

## 4. Scope & Features

### 4.1 Core Capabilities (In Scope)

*   **Multi-Tenant Workspaces:** Complete data isolation with granular RBAC (Owner, Admin, Editor, Viewer).
*   **Asset Management:**
    *   High-performance ingestion (resumable uploads via TUS).
    *   Managed Storage (Cloudflare R2) or BYOS (S3-compatible).
    *   Folder/Collection organization and versioning.
*   **Client Galleries:**
    *   Responsive masonry/grid layouts with **PWA (Progressive Web App)** installation support.
    *   "View as Client" mode for photographers to preview galleries exactly as clients see them.
    *   Password protection, PIN access, and expiring links.
    *   **Magic Link Grid** for beautiful, auto-arranged displays.
*   **AI & Search (Google Gemini Integration):**
    *   **Semantic Search:** Natural language queries ("bride smiling at sunset") using vector embeddings (Milvus/pgvector).
    *   **Face Recognition (FaceIDs):** Clustering and identification with privacy controls.
    *   **Smart Curate:** AI-powered quality scoring (sharpness, composition) and culling.
    *   **Content Analysis:** Automated tagging and scene detection.
*   **Business & Marketing:**
    *   **Digital Visiting Card:** Professional profiles (`/u/{slug}`) with social links, Spotify/TikTok embeds, and vCard downloads.
    *   **Public Profiles:** SEO-optimized portfolios with custom branding and domains.
    *   **Digital Invitations:** RSVP management, guest lists, and multi-language support (Indian languages).
*   **Developer Platform:**
    *   **Webhooks Microservice:** Event-driven integration with HMAC signing, retries, and dead-letter queues.
    *   RESTful API with SDKs.

### 4.2 Out of Scope (Current Phase)

*   Native mobile apps (iOS/Android) for photographers (PWA is the current mobile strategy).
*   Advanced video editing (trimming/grading) within the browser.
*   Marketplace for third-party print labs (direct integration only).

## 5. Success Metrics

*   **Activation:** 60% of new signups upload a gallery within 48 hours.
*   **Engagement:** Average client session time > 3 minutes; 80% of delivered galleries receive client interaction (download/favorite).
*   **Performance:** P95 gallery load time < 1.5s; Search latency < 200ms.
*   **Reliability:** 99.9% uptime for gallery delivery endpoints.

## 6. Functional Requirements

### 6.1 Identity & Security
*   **Authentication:** Email/Password, Social Auth (Google), and Enterprise SSO (SAML/OIDC).
*   **Authorization:** Strict `workspace_id` scoping on all resources.
*   **Security Settings:** Configurable 2FA, session timeouts, and IP allowlists per workspace.
*   **Compliance:** UUID-based public URLs (prevent enumeration), detailed audit logs for sensitive actions.

### 6.2 Storage & Ingestion
*   **Upload Service:** Dedicated microservice handling chunked, resumable uploads.
*   **Processing:** Background workers for thumbnail generation (LQIP), EXIF extraction, and AI analysis.
*   **CDN:** Cloudflare integration for edge caching of public assets with signed URL protection (4-hour TTL).

### 6.3 Client Experience (Gallery & PWA)
*   **Progressive Web App:** Galleries must be installable on client devices (iOS/Android) for offline-like access.
*   **Interactivity:** comments, star ratings, and "favorites" lists synced in real-time.
*   **Downloads:** Configurable permissions (Original vs. Web Size, Single vs. Bulk ZIP).
*   **Performance:** Implementation of Low Quality Image Placeholders (LQIP) for instant visual feedback.

### 6.4 AI Platform
*   **Model Agnostic:** Primary integration with Google Gemini, but architected to support other providers via "Bring Your Own Key" (BYOK).
*   **Vector Search:** Hybrid search combining keyword matching with semantic vector similarity (pgvector/Milvus).
*   **Privacy:** Face embeddings must be isolated per workspace; no cross-tenant model training.

### 6.5 Webhooks & Integrations
*   **Reliability:** The system must guarantee delivery attempts with exponential backoff.
*   **Security:** All webhook payloads must be signed (HMAC-SHA256).
*   **Transparency:** Users can view delivery history, payload details, and failure reasons in the dashboard.

## 7. Architecture & Technology Stack

RawDrive leverages a modern, cloud-native microservices architecture:

*   **Frontend:** React 19, TypeScript, Vite, Tailwind CSS.
*   **API Gateway:** Traefik v3 (Routing, Rate Limiting, TLS).
*   **Microservices (Python FastAPI):**
    *   `gallery-service`: Client facing API
    *   `upload-service`: Media ingestion
    *   `ai-service`: AI orchestration
    *   `billing-service`: Subscriptions & payments
    *   `webhooks-service`: Event delivery
    *   `notifications-service`, `onboarding-service`, `invitations-service`.
*   **Data Store:**
    *   PostgreSQL 16 (Relational + JSONB).
    *   pgvector / Milvus (Vector storage).
    *   Redis 7 (Caching & Pub/Sub).
*   **Infrastructure:** Docker, Kubernetes (K8s), KEDA (Autoscaling).

## 8. Delivery Plan & Phases

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 0** | **Foundations:** Workspace model, RBAC, Managed Storage, Basic Galleries. | ✅ Complete |
| **Phase 1** | **Photographer Core:** Album proofing, CRM basics, Payments, Trial lifecycle. | ✅ Complete |
| **Phase 2** | **AI & Intelligence:** BYOS, FaceIDs, Geo-search, Smart Curate. | ✅ Complete |
| **Phase 3** | **Enterprise:** SSO, White-labeling, Audit logs, Compliance features. | 🚧 In Progress |
| **Phase 4** | **Governance:** Advanced retention policies, Legal hold, Data sovereignty. | 📅 Planned |

## 9. Risks & Assumptions

*   **Dependency on Google Gemini:** High latency or API changes could impact AI features. *Mitigation:* Abstracted "One-API" layer to swap providers if needed.
*   **Browser Capabilities:** PWA installation friction on iOS. *Mitigation:* Clear in-app instructions for "Add to Home Screen".
*   **Storage Costs:** R2 costs scaling with volume. *Mitigation:* Aggressive tiering and nudging high-volume users to BYOS.

---
*Reference Specs: `docs/Features/*`, `docs/ARCHITECTURE_QUICK_REFERENCE.md`*
