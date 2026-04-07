# Technical Stack Document (TSD)
## RawDrive — Infrastructure and Scaling for 50,000+ Users

**Document Status:** Setera Standard v1.1 (2026 Ready)  
**Ownership:** Platform Engineering / CTO Office  
**Target Scale:** 10,000 to 50,000 active/concurrent users

---

## 1. Architectural Strategy

RawDrive follows a **Data Plane / Control Plane** architecture to ensure performance at scale. This separation allows the system to handle massive media ingestion and client-facing delivery independently of the complex business logic (dealerships, payments, and admin governance).

- **Data Plane (Go):** High-throughput, stateless, optimized for fast I/O and media workflows.
- **Control Plane (Elixir/Ash):** Complex domain logic, transactional integrity, and reactive admin interfaces.
- **Edge Layer (Traefik):** Dynamic routing, load balancing, and SSL termination.

---

## 2. Core Service Stack

### 2.1 Backend (Data Plane) - Golang 1.24+
Chosen for its efficiency, concurrency model, and low memory footprint.
- **Web Framework:** `fasthttp` for high-throughput operational APIs; `net/http` for SSE and long-lived connections.
- **Upload Protocol:** **TUS (Resumable File Uploads)** via `tusd` or custom Go implementation for mission-critical reliability during large gallery uploads.
- **Policy Engine:** **Open Policy Agent (OPA)** for distributed, low-latency authorization checks.
- **Plugins:** `wazero` for zero-CGO WebAssembly plugins (secure, cross-platform extensions).
- **Logging:** Structured logging using `zerolog` and `log/slog`.

### 2.2 Backend (Control Plane) - Elixir 1.18+ / OTP 27+
Chosen for its fault tolerance and the **Ash Framework**.
- **Resources & Logic:** **Ash Framework 3.x** for domain modeling, declarative policies, and cross-resource actions.
- **Admin UI:** **Phoenix LiveView** for a real-time, reactive admin command center without the overhead of a separate SPA.
- **Database Access:** Ecto for robust transactional management.

### 2.3 Frontend - Next.js & PWA
- **Core Framework:** Next.js for SEO-optimized landing pages and public gallery shells.
- **Mobile Strategy:** **PWA-First** (Progressive Web App) with service workers for offline gallery access and push notifications.
- **Studio Operator Strategy:** Browser-first for routine work, with a Windows/macOS desktop companion for source-side live preparation and large local-media workflows.
- **Styling:** Vanilla CSS / Tailwind for a utility-first, performant design system.
- **State Management:** TanStack Query for efficient data fetching and caching.
- **Deployment:** Vercel or Docker-based self-hosting via Traefik.

---

## 3. Infrastructure & Robust Solutions

### 3.1 Edge Layer & Load Balancing - Traefik
**Traefik** serves as the primary ingress controller and edge router.
- **Reasoning:** Native support for Docker, dynamic configuration without restarts, and seamless integration with Let's Encrypt for automatic SSL.
- **Capability:** Load balances traffic between Go and Elixir services based on request paths and headers.

### 3.2 Data Persistence - PostgreSQL 16+
- **Search:** **pgvector** for semantic search, face embedding lookups, and AI-driven recommendations.
- **Scaling:** **Primary-Replica** setup with pgpool-II or HAProxy for read-scaling (necessary for the 50k user target).
- **Partitioning:** Logical partitioning by `state_id` to maintain performance as metadata grows into the hundreds of millions.

### 3.3 Caching & Session Management - Valkey 8.x (Redis compatible)
- **Use Cases:** User sessions, rate limiting, and real-time caching of gallery metadata.
- **Scaling:** Redis Cluster or Sentinel for high availability.

### 3.4 Messaging & Async Workflows - NATS JetStream
- **High Throughput:** NATS provides a lightweight, extremely fast messaging layer compared to RabbitMQ or Kafka.
- **Auditability:** JetStream ensures at-least-once delivery for audit logs and critical financial attribution events.
- **Scheduling & Orchestration:** **Temporal.io** for durable execution of long-running Google Calendar sync jobs and notification retries.

---

## 4. Media & AI Pipeline

### 4.1 Asset Storage - Cloudflare R2
- **Benefit:** S3-compatible, zero egress fees (critical for high-volume photography).
- **Security:** Signed URLs with 4-hour TTL for all gallery assets.

### 4.2 Live Video - Cloudflare Stream
- **Backbone:** Cloudflare Stream for RTMP/SRT ingest and adaptive bitrate playback.
- **Monetization:** RawDrive manages session credits; Cloudflare handles the heavy lifting of global video delivery.
- **Source Strategy:** First-mile live encoding occurs on the broadcaster machine through supported local encoder workflows; RawDrive servers remain control-plane systems, not a media-processing tier.

### 4.3 AI & Intelligence
- **Vision:** **Google Cloud Vision API** for face detection, clustering, and object recognition (FaceID).
- **Creative Logic:** **Google Gemini** for smart culling, aesthetic scoring, and "Smart Layout" generation in the Album Designer.
- **Vector Search:** **pgvector** on Postgres for similarity searches and semantic discovery.

### 4.4 Communications & Payments (India First)
- **Messaging:** **WhatsApp Business API (WABA)** for automated CRM lead nurturing, notifications, and VCF sharing.
- **Payments:** **PhonePe Gateway** for UPI-first transactions, milestone billing, and dealer margin settlements.
- **Calendars:** **Google Calendar API (v3)** for 2-way photographer availability and booking sync.

---

## 5. Scaling Strategies for 50,000 Users

| Component | Strategy |
|-----------|----------|
| **API Tier** | Horizontal scaling of Go pods behind Traefik. |
| **Database** | Read replicas for gallery viewing traffic; connection pooling via `pgbouncer`. |
| **Media** | Global edge delivery via Cloudflare CDN to ensure sub-1.5s load times across India. |
| **Uploads** | TUS protocol with chunked uploads to handle intermittent network connectivity common in regional markets. |
| **Concurrency** | NATS JetStream to decouple ingestion from processing (thumbnails, AI analysis). |

---

## 6. Security Posture
- **PQC Cryptography:** Post-quantum resistant algorithms for sensitive data.
- **FIPS 140-3:** Security posture maintained in production builds (`GOFIPS140=latest`).
- **Zero CGO:** Statically linked Go binaries to reduce attack surface and deployment complexity.

---

## 7. Compliance Architecture (Setera v1.1)

### 7.1 Data Sovereignty (India Focus)
- **Primary Data Region:** AWS Mumbai (`ap-south-1`) for all PII and Metadata.
- **Sovereign Metadata:** Logical isolation of India-based user metadata to prevent cross-border leakage.
- **Biometric Security:** Biometric FaceID embeddings stored in an encrypted, isolated database with a manual "Selfie Consent" trigger.

### 7.2 Zero-Trust Controls
- **HSM (Hardware Security Modules):** AWS CloudHSM or Azure Dedicated HSM for root TLS certificates and cryptographic keys.
- **WAF & DDoS:** Cloudflare Enterprise WAF with rigid "Indian-Only" access rules for internal admin interfaces.
- **Audit Trails:** Immutable logging of all state changes pushed to an isolated, log-only S3 bucket.

### 7.3 CLI & Automation Tooling
- **Framework:** **Go/Cobra** (CLI execution) and **Go/Viper** (Configuration).
- **Terminal UI:** **Pterm** for progress bars, spinners, and interactive tables.
- **Auth:** OAuth2 with PKCE flow for secure `rawdrive login`.
