# Product Requirements Document (PRD)
## RawDrive — Enterprise SaaS for Professional Photography Management

> **Status:** Live (v0.3.2)  
> **Last updated:** 2026-01-09  
> **Version:** 4.1 (Microservices & AI-Native with Enterprise Governance)

---

## 1. Executive Summary

RawDrive is a comprehensive enterprise-grade SaaS platform that revolutionizes professional photography management. It serves as an operating system for photographers, studios, and agencies, aiming to streamline the entire lifecycle of digital assets—from ingestion and organization to client delivery and business operations.

Unlike competitors that split functionality across multiple tools (e.g., gallery delivery vs. album design vs. business management), RawDrive provides a unified, AI-native platform. It empowers users to:
- **Manage** millions of assets with enterprise-grade reliability and "Bring Your Own Storage" (BYOS) flexibility.
- **Deliver** stunning, branded client galleries with PWA support and "View as Client" previews.
- **Collaborate** with clients via interactive proofing, comments, and selection workflows.
- **Market** themselves through SEO-optimized public profiles and Digital Visiting Cards.
- **Automate** workflows using robust Webhooks and AI-driven curation (Agents).
- **Govern** data with strict RBAC, audit logging, and SOC 2 compliance features.

## 2. Product Principles

1.  **Client Experience is the Product:** The end-client’s viewing experience must be flawless, fast, and mobile-first.
2.  **AI as a Copilot:** AI features (Agents, Culling, Tagging) should save time and enhance discovery without taking control away from the photographer.
3.  **Trust by Design:** Security, privacy, and governance are foundational. Explicit permissions and audit trails are mandatory.
4.  **Performance at Scale:** The system must handle millions of assets with sub-second retrieval times, leveraging edge caching (CDN), Redis caching, and K8s auto-scaling.
5.  **Platform Reliability:** A microservices architecture ensures fault isolation, scalability, and independent deployment.

## 3. Target Audience

1.  **Professional Photographers:** Solopreneurs needing an all-in-one business center.
2.  **Studios & Agencies:** Teams requiring multi-user collaboration, RBAC, and consistent branding.
3.  **Enterprise:** Large organizations needing centralized DAM, SSO, compliance (BYOS, sovereignty), and observability.
4.  **End Clients:** Couples/families consuming content via galleries.

## 4. Scope & Features

### 4.1 Core Capabilities (In Scope)

*   **Multi-Tenant Workspaces:** Complete data isolation with granular RBAC (Owner, Admin, Editor, Viewer).
*   **Asset Management (Storage):**
    *   TUS Resumable Uploads for huge files.
    *   Managed Storage (Cloudflare R2) or BYOS (S3/Azure).
    *   Versioning and Folder organization.
*   **Client Galleries (UX):**
    *   Responsive layouts, **PWA** support, "View as Client" mode.
    *   Password/PIN protection, Magic Links.
*   **AI & Search (Intelligence):**
    *   **Semantic Search:** Natural language search using pgvector/Milvus.
    *   **GEO Optimizations:** Internal asset discoverability via enriched metadata.
    *   **FaceIDs:** Clustering and identification.
    *   **Smart Curate:** AI quality scoring and culling.
    *   **AI Agents:** ReAct-based autonomous agents using **MCP (Model Context Protocol)** tools.
*   **Business & Marketing:**
    *   **Digital Visiting Card:** `/u/{slug}` profiles with social embeds.
    *   **Public Profiles:** SEO-optimized portfolios.
    *   **Digital Invitations:** RSVP management.
*   **Developer Platform:**
    *   **Webhooks:** Event-driven delivery with HMAC signing.
    *   **API:** RESTful endpoints for integration.

### 4.2 Out of Scope (Current Phase)
*   Native mobile apps (iOS/Android) for photographers (PWA first).
*   Video editing suite (trimming/grading).

## 5. Success Metrics
*   **Activation:** 60% of signups upload a gallery < 48h.
*   **Engagement:** Avg session > 3 mins; 80% interaction rate.
*   **Performance:** P95 load < 1.5s; Search latency < 200ms.
*   **Reliability:** 99.9% uptime.

## 6. Functional Requirements

### 6.1 Identity & Security
*   **Auth:** Email/Pass, Social, SAML/OIDC SSO.
*   **RBAC:** Strict `workspace_id` scoping.
*   **Compliance:** Audit logs, UUID URLs, 2FA.

### 6.2 Storage & Ingestion
*   **Uploads:** Dedicated `upload-service` (TUS).
*   **Processing:** KEDA-scaled workers for thumbnails (LQIP), EXIF.
*   **CDN:** Cloudflare Edge Caching.

### 6.3 Client Experience
*   **PWA:** Installable galleries.
*   **Interactivity:** Comments, Ratings, Favorites.
*   **Downloads:** Configurable (Original/Web, Single/Zip).

### 6.4 AI Platform (Agents & MCP)
*   **Architecture:** `ai-service` hosting MCP Servers.
*   **Capabilities:** FaceID, Semantic Search, Agentic Culling.
*   **Privacy:** Isolated embeddings per workspace.

### 6.5 Webhooks & Integrations
*   **Reliability:** Exponential backoff retries.
*   **Security:** HMAC-SHA256 signatures.

## 7. Architecture & Tech Stack

*   **Frontend:** React 19, TypeScript, Vite, Tailwind CSS.
*   **Gateway:** Traefik v3 (Routing, SSL).
*   **Microservices (Python FastAPI):**
    *   `gallery-service`, `upload-service`, `ai-service`, `billing-service`, `webhooks-service`, `notifications-service`.
*   **Data:**
    *   PostgreSQL 16 (Relational + JSONB).
    *   pgvector / Milvus (Vector).
    *   Redis 7 (Cache/Queue).
*   **Infra:** Kubernetes (K8s), KEDA (Scaling), Helm.

## 8. Best Practice References

For detailed implementation guidelines, refer to the `.claude/reference/` documentation:

| Domain | Best Practice Document |
| :--- | :--- |
| **Architecture** | [`microservices-patterns.md`](reference/microservices-patterns.md) |
| **Backend** | [`fastapi-best-practices.md`](reference/fastapi-best-practices.md) |
| **Frontend** | [`react-frontend-best-practices.md`](reference/react-frontend-best-practices.md) |
| **Database** | [`postgresql-best-practices.md`](reference/postgresql-best-practices.md) |
| **AI / Machine Learning** | [`ai-ml-best-practices.md`](reference/ai-ml-best-practices.md) |
| **AI Agents & MCP** | [`ai-agents-best-practices.md`](reference/ai-agents-best-practices.md), [`mcp-best-practices.md`](reference/mcp-best-practices.md) |
| **Vectors (Search)** | [`milvus-best-practices.md`](reference/milvus-best-practices.md), [`geo-optimization-best-practices.md`](reference/geo-optimization-best-practices.md) |
| **Security** | [`security-best-practices.md`](reference/security-best-practices.md) |
| **Infrastructure (K8s)** | [`deployment-best-practices.md`](reference/deployment-best-practices.md), [`kubernetes-scaling-best-practices.md`](reference/kubernetes-scaling-best-practices.md), [`traefik-best-practices.md`](reference/traefik-best-practices.md) |
| **Storage & Uploads** | [`storage-upload-best-practices.md`](reference/storage-upload-best-practices.md) |
| **Observability** | [`observability-best-practices.md`](reference/observability-best-practices.md), [`testing-and-logging.md`](reference/testing-and-logging.md) |
| **Caching (Redis)** | [`redis-best-practices.md`](reference/redis-best-practices.md) |
| **Billing** | [`billing-payments-best-practices.md`](reference/billing-payments-best-practices.md) |
| **Notifications** | [`notifications-email-best-practices.md`](reference/notifications-email-best-practices.md) |
| **Webhooks** | [`webhooks-integration-best-practices.md`](reference/webhooks-integration-best-practices.md) |
| **SEO** | [`seo-best-practices.md`](reference/seo-best-practices.md) |
| **Design / UX** | [`ui-ux-design-best-practices.md`](reference/ui-ux-design-best-practices.md) |
| **Coding Standards** | [`coding-standards.md`](reference/coding-standards.md) |

## 9. Delivery Plan

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 0** | **Foundations:** Workspace, RBAC, Storage, Galleries. | ✅ Complete |
| **Phase 1** | **Core:** Proofing, CRM, Payments, Trial. | ✅ Complete |
| **Phase 2** | **AI:** FaceIDs, Semantic Search, Smart Curate, **MCP Agents**. | ✅ Complete |
| **Phase 3** | **Enterprise:** SSO, Audit logs, White-labeling. | 🚧 In Progress |
| **Phase 4** | **Scale:** High-Scale K8s, Global Replication. | 📅 Planned |
