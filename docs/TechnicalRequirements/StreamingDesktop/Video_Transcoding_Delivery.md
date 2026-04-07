# Technical Requirements: Video Transcoding & Delivery

**Document Status:** Setera Standard v2.0 (2026-04 aligned)  
**Ownership:** Media Engineering / Product  
**Technology:** Cloudflare Stream, PostgreSQL, PWA/Web App Surfaces

---

## 1. Product Mission
RawDrive must provide studios with a white-labeled video delivery layer for uploaded films, proofing videos, and replay assets. RawDrive owns metadata, access control, billing gates, analytics aggregation, and product UX; **Cloudflare Stream** remains the managed engine for upload intake, encoding, adaptive playback, and video delivery.

---

## 2. Scope and Boundaries

### 2.1 In Scope
- On-demand video upload and processing flows.
- Playback for uploaded films, proofing assets, and recorded live-event replays.
- Watermarking for uploaded or proofing videos.
- Captions, additional audio tracks, player branding metadata, signed playback, and download controls where supported.
- Viewer analytics, playback gating, and payment-aware delivery states.

### 2.2 Out of Scope
- Live-event scheduling, prepaid streaming credits, QR-based invite flows, live chat, and live moderation. Those requirements live in [LiveStreaming.md](LiveStreaming.md).
- RawDrive-owned transcoding infrastructure or CDN replacement.
- Full browser-based editing suites, timeline editing, or guaranteed higher-than-HD delivery without a separately approved media-pipeline expansion.

### 2.3 Media Processing Boundary
- Cloudflare Stream must remain the default processing and playback engine.
- RawDrive may orchestrate metadata, posters, access control, proofing rules, payment gates, and analytics joins, but must not become a custom video-processing backbone.
- RawDrive application servers must not become a default server-side transcoding tier for uploaded or replay video.

---

## 3. Supported Delivery Modes

### 3.1 On-Demand Upload and Playback
- Highlight films, recap videos, interviews, and other studio-delivered assets uploaded directly to Cloudflare Stream.

### 3.2 Proofing and Payment-Gated Delivery
- Watermarked previews or proofing copies with restricted playback or download policy until the required payment state is satisfied.

### 3.3 Live-to-Replay Handoff
- A completed live event may resolve to a replay asset created by Cloudflare recording.
- The live-event workflow itself is governed by [LiveStreaming.md](LiveStreaming.md); this document governs replay playback and delivery behavior after the live session ends.

---

## 4. Functional Requirements

### 4.1 Upload and Processing
- RawDrive must support server-initiated upload flows or direct creator uploads into Cloudflare Stream.
- The product should support both browser-based and desktop-companion upload entry points, with the desktop companion preferred for large files, folder watch workflows, and local heavy lifting.
- Every uploaded video must persist Cloudflare video identifiers, processing status, poster or thumbnail references, and business metadata in RawDrive.
- The application must surface at least `pending_upload`, `processing`, `ready`, and `error` states for uploaded videos.
- Upload and processing errors must be visible to studio operators with retry or remediation guidance.

### 4.2 Playback and Access Control
- Playback must use the official Cloudflare Stream player or a supported wrapper around Cloudflare playback.
- HLS playback must be supported by default; DASH may be enabled where the target player stack requires it.
- Private videos must support signed URLs or equivalent short-lived access tokens.
- Allowed-origin restrictions should be supported where the distribution policy requires tighter embed control.
- Public and authenticated playback surfaces must be responsive across desktop, tablet, and mobile.

### 4.3 Proofing, Watermarking, and Commercial Gates
- Proofing videos may include studio or RawDrive watermark overlays before final delivery.
- Watermark profiles must be configurable and reusable for uploaded videos.
- Commercial entitlements must control who can view, stream, or download a final asset.
- Final-delivery unlock must align with the payment state and invoice rules defined in [Contracts_Billing_GST.md](../Contracts_Billing_GST.md).
- Long-form videos should support policy-driven download enablement where the delivery model requires offline access.

### 4.4 Viewer Experience
- Playback pages should support title, poster image, branding, and a clean viewing shell for client delivery.
- Replays should resolve from stable client-facing URLs where the product surface expects continuity.
- If a replay or on-demand asset is not ready, the page must show a clear processing or unavailable state rather than a broken player.

### 4.5 Analytics and Reporting
- Studio operators should be able to review unique viewers, minutes viewed, retention or drop-off signals where available, geography, and other engagement summaries supported by the analytics pipeline.
- RawDrive should combine Cloudflare analytics with application-level business events such as proof approval, payment completion, and share-link activity.
- Analytics exports should be available in CSV or equivalent summary format for studio review.

---

## 5. Technical Integration Requirements

### 5.1 Cloudflare Stream Video Integration
- RawDrive must support Cloudflare Stream upload flows appropriate to the product surface, including direct creator uploads where useful.
- Desktop-companion upload flows may perform local checksuming, file validation, metadata extraction, and optional lightweight preprocessing before upload, but Cloudflare Stream remains the delivery transcode engine.
- Video processing and readiness reconciliation must consume Cloudflare webhook events for video-ready and error states.
- RawDrive must persist Cloudflare video IDs, playback metadata, poster references, and delivery configuration in the application database.
- RawDrive application servers may orchestrate upload state and policy, but they must not become the canonical transcode path for playback assets in the default architecture.

### 5.2 Playback Security
- Signed playback must be supported for protected assets.
- Download permission must be an explicit policy decision, not an implicit default.
- Hotlink resistance and embed-origin controls should be available for premium or restricted delivery modes.

### 5.3 Watermarks, Captions, and Player Metadata
- Watermark profiles may be applied to uploaded videos and proofing assets where the Cloudflare upload path supports watermark assignment.
- Watermarking must not be assumed for live streams, because live Cloudflare playback does not share the same uploaded-video watermark workflow.
- Captions and additional audio tracks should be supported where source material and Cloudflare features allow them.
- Player metadata enhancements should be limited to features supported by the chosen player surface; advanced controls beyond Cloudflare's supported player metadata must be treated as custom-player work, not assumed platform defaults.

### 5.4 Delivery Profile Constraints
- The baseline Cloudflare Stream delivery profile for this product is adaptive HD playback, not a guaranteed 4K/8K media-delivery stack.
- HDR source uploads may be accepted, but delivered playback must not be specified as guaranteed HDR because current Cloudflare Stream playback normalizes HDR uploads to SDR.
- Future ambitions for 4K+, HDR-preserving playback, automated social clipping, or richer post-processing must be documented as separate roadmap work requiring media-pipeline validation.

### 5.5 Replay Delivery Constraints
- Live recordings may remain streamable as replay assets even when MP4 download generation is unavailable.
- If the chosen delivery surface offers replay downloads, the product must account for Cloudflare's live-recording download limitations separately from standard uploaded-video download policy.

---

## 6. Data Model Requirements

### 6.1 Core Video Entities
- `videos`: `id`, `workspace_id`, `cf_video_id`, `title`, `description`, `status`, `source_type`, `poster_asset_id`, `duration_seconds`, `created_at`
- `video_delivery`: `video_id`, `require_signed_urls`, `allowed_origins`, `download_enabled`, `watermark_profile_id`, `player_profile`, `last_webhook_at`
- `video_access_policies`: `video_id`, `access_mode`, `payment_gate_state`, `proofing_state`, `expires_at`
- `video_analytics_snapshots`: `video_id`, `captured_at`, `minutes_viewed`, `unique_viewers`, `top_geographies`, `dropoff_summary`

### 6.2 Replay Linkage
- `live_event_replays`: `event_id`, `video_id`, `cf_recording_id`, `replay_status`, `published_at`

### 6.3 Audit Requirements
- Video publish, access-policy change, watermark assignment, download enablement, and admin override actions must write immutable audit entries.

---

## 7. Non-Functional Requirements
- Playback-control and delivery APIs must target **99.9% uptime** during supported operating windows.
- Delivery pages should target sub-2-second perceived shell load on constrained mobile networks before playback begins.
- Financial and access-control writes must be durable, idempotent, and reconcilable.
- Viewer-facing playback controls and proofing surfaces should meet **WCAG 2.1 AA** expectations for core navigation, readable controls, and captions support when captions are available.

---

## 8. Cross-Document Alignment
- Live-event scheduling, prepaid credits, and event operations must align with [LiveStreaming.md](LiveStreaming.md).
- Billing, invoices, GST treatment, and payment-gated release rules must align with [Contracts_Billing_GST.md](../Contracts_Billing_GST.md).
- Photographer-facing navigation and permissions must align with [Photographer-Requirements.md](../Photographer-Requirements.md).
- Client-facing gallery and delivery surfaces must align with [Client_Galleries_PWA.md](../Client_Galleries_PWA.md).
- Windows/macOS operator workflows and local heavy-processing behavior must align with [Studio_Desktop_Companion.md](Studio_Desktop_Companion.md).
