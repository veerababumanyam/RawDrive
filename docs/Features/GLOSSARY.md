# RawDrive Glossary (Canonical Terminology)

This glossary is the **single source of truth** for product/architecture terminology across `docs/RawDrive_Project`.

If another document uses a different term (e.g., “tenant”), treat this glossary as canonical and update the document to match.

---

## Canonical tenancy terminology

### Workspace
- **Definition:** The unit of tenancy, isolation, billing, and policy enforcement in RawDrive.
- **Synonyms (legacy):** *tenant*.
- **Canonical ID field:** `workspace_id`.
- **Legacy alias (avoid in new docs):** `tenant_id` (only acceptable when describing migration/compat).
- **Rule:** Every record that can contain customer data MUST be scoped to exactly one `workspace_id`.

### Organization / Studio / Company
- **Definition:** The real-world entity using RawDrive.
- **Mapping:** In almost all cases, one organization/studio maps to **one workspace**.

### Platform / Ops
- **Definition:** RawDrive’s internal administrative control plane used by RawDrive staff.
- **Note:** Platform admins can access multiple workspaces, but access must be auditable.

---

## Users & identities

### User
- **Definition:** An authenticated identity in RawDrive.
- **Membership:** A user can belong to one or more workspaces (directly or via org provisioning).

### Workspace member
- **Definition:** A user + role assignment within a specific workspace.

### Client (end-recipient)
- **Definition:** A non-team identity that interacts with shared galleries/albums (favorites, comments, downloads) typically via share link + invite.
- **Note:** Clients are still scoped to a workspace.

### Role / RBAC
- **Definition:** Role-based access control evaluated within the active workspace.
- **Examples:** `owner`, `manager`, `editor`, `viewer`, plus platform roles (super admin, platform admin).

### Workspace role
- **Definition:** A role whose permissions are evaluated **within a workspace** (the active `workspace_id`).
- **Examples:** `workspace_owner`, `workspace_admin`, `editor`, `finance`, `viewer`, `external_guest`.

### Platform role (Ops role)
- **Definition:** A **global** role used for RawDrive’s internal control plane (Ops/Admin Console). Platform roles are **not** tied to a specific workspace membership.
- **Examples:** `super_admin`, `platform_admin`, `support_admin`, `billing_admin`, `security_admin`, `observability_admin`, `auditor_readonly`, `product_admin`.
- **Rule:** Platform roles do **not** automatically grant access to customer content. Any cross-workspace customer data access must be explicitly granted and audited (e.g., support access sessions / break-glass).

### Role template
- **Definition:** A predefined role configuration (permissions bundle) intended to be reused consistently.
- **Types:**
	- **Workspace role templates** (e.g., “Studio Editor”, “Studio Finance”).
	- **Platform admin role templates** (e.g., “Support Admin”, “Billing Admin”).

---

## Core content model

### Gallery
- **Definition:** A workspace-scoped container for photo/video assets, with settings and sharing.

### Sub-gallery / Section
- **Definition:** A first-class partition under a gallery, used for organization and selective sharing.

### Asset
- **Definition:** A photo or video plus all derivatives (thumbnails, renditions), metadata (EXIF, tags), and AI annotations.
- **Preferred over:** “photo” when the statement applies to both photos and videos.

### Album
- **Definition:** A digital/print design project that references assets, has spreads/pages, and has proofing/approval.

### Share Link
- **Definition:** A capability-based access grant that can be scoped (gallery/sub-gallery/asset/album), time-boxed, policy-bound (download/watermark/email capture), and audited.

---

## Storage

### Managed storage
- **Definition:** RawDrive-hosted object storage (e.g., Cloudflare R2) used when a customer does not bring their own storage.

### BYOS (Bring Your Own Storage)
- **Definition:** Customer-owned storage provider integrated with RawDrive.
- **Examples:** Google Drive, Dropbox, S3-compatible, Azure Blob.
- **Rule:** BYOS configurations and credentials are scoped to a workspace; access is policy-controlled and auditable.

### Signed URL
- **Definition:** Time-limited URL granting access to an object; used for uploads/downloads.

---

## Infrastructure (Canonical Hosted SaaS Stack)

### Cloudflare Edge (CDN/WAF)
- **Definition:** The default edge layer for RawDrive-hosted environments.
- **Includes:** CDN caching, WAF, DDoS protection, rate limiting, bot mitigation.

### Cloudflare Turnstile
- **Definition:** The default CAPTCHA/bot-challenge mechanism.
- **Use cases:** Signup, login abuse protection, and high-risk public forms (e.g., contact forms).

### Cloudflare R2
- **Definition:** The default managed object storage for RawDrive-hosted workspaces.
- **Note:** R2 is S3-compatible; access is via signed URLs and is delivered to end-users through the Cloudflare edge.

### Hostinger VPS (KVM)
- **Definition:** The default hosting provider for RawDrive-hosted environments.
- **Note:** Hosts the compute layer that runs the RawDrive Kubernetes cluster.

### Kubernetes (self-managed via kubeadm)
- **Definition:** The default orchestration platform for RawDrive-hosted environments.
- **Key components:** Traefik v3 API Gateway with KEDA autoscaling, cert-manager (Let’s Encrypt), network policies, and cluster/DB backup jobs.

---

## AI & search

### AI Platform
- **Definition:** The system that runs AI jobs (analysis, captions, embeddings, People scans), enforces credits/quotas, tracks cost/usage, and provides auditability.

### LLM Provider (AI Provider)
- **Definition:** A configured backend that can execute RawDrive AI tasks (text generation, vision analysis, embeddings, moderation).
- **Examples:** Google Gemini (primary/default), OpenAI, Anthropic, Azure-hosted models (e.g., Azure OpenAI / Azure AI Foundry), and OpenAI-compatible local servers (e.g., Ollama, LM Studio).

### Model Profile
- **Definition:** A named configuration that selects a provider + model + capability settings (max tokens, temperature, tool/function calling, image support, embedding dimensions), used by the Model Router.
- **Example:** `default_text`, `default_vision`, `default_embeddings`, `safe_moderation`.

### Model Router
- **Definition:** The AI Platform component that routes each AI request to the correct Model Profile (and thus provider/model), supports fallback, regional routing, and logs usage/costs per workspace.

### GEO (Generative Engine Optimization)
- **Definition:** RawDrive’s **internal** AI search optimization system (not external SEO).
- **Purpose:** Improve discoverability of assets via semantic metadata, embeddings, relationships, and analytics.

### Embedding
- **Definition:** Vector representation of an asset (or face) used for similarity/semantic retrieval.
- **Storage:** Postgres + `pgvector`.

### People
- **Definition:** A workspace-scoped grouping derived from face embeddings; supports clustering and manual labeling.

---

## Plans, billing, and lifecycle

### Plan / Tier
- **Definition:** A billing package defining feature availability and limits.

### Free trial (30-day)
- **Definition:** A time-limited trial period (30 days) that grants Business-tier access/limits.
- **Rule:** No “unlimited free tier”. On expiry, access is disabled unless the workspace upgrades.

### Trial status / account state
- **Definition:** States such as `active_trial`, `expired_trial`, `upgraded`, `disabled`, `deleted`.

---

## Governance & compliance

### Policy
- **Definition:** Workspace-level rule such as retention windows, download restrictions, sharing rules, labels/classification.

### Retention
- **Definition:** Time-based rules for keeping or deleting data; can vary by plan and enterprise policies.

### Legal hold
- **Definition:** A governance mode preventing deletion for specified data scope.

### Audit log
- **Definition:** Append-only record of security- or compliance-relevant actions.

---

## Writing rules for all docs

1. Prefer **Workspace** over **Tenant**.
2. Use `workspace_id` in schemas; only mention `tenant_id` as a legacy alias in migration/compat notes.
3. Use **Asset** when it includes both photos and videos.
4. Refer to “Share Link” as the capability-based mechanism; “invite” is a distribution mechanism, not the access primitive.
5. Refer to the **30-day free trial**; avoid “Free tier”.

---

## Localization & i18n

### i18n (Internationalization)
- **Definition:** Engineering approach where the UI uses translation keys + locale formatting so multiple languages can be supported.

### Locale
- **Definition:** A user’s language + regional formatting settings (e.g., `en-IN`, `hi-IN`).
- **Applies to:** UI language, date/time formats, number/currency formats.

### Preferred Language
- **Definition:** A per-user (and optionally per-client/per-share-link) setting that determines which UI language the product uses.
- **Fallback order:** Explicit user choice → workspace default → browser/device language → English.
