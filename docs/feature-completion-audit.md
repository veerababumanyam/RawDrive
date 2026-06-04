# RawDrive — Feature Completion Audit

> **Type:** Read-only audit snapshot. No services were booted; findings are sourced
> from static code, route registrations, and the project's own planning docs.
> **Date:** 2026-06-04 · **Branch:** `codex/fix-ui-wcag-tokens` · **Version:** v0.0.51 / state v0.1.2
> **Scope:** "Which features are still placeholders, or built but not wired / configured / backed by API?"

## How to read this

Findings fall into **four buckets**, and the distinction matters:

- **A — Placeholder UI:** visible in the app but does nothing real.
- **B — Built but switched off:** healthy code gated behind a flag/env. *Not a defect* — flip config to enable.
- **C — Partial / stub backend:** handler exists but returns `501` / `404` / a no-op. The genuine "half-built" code.
- **D — Documented but not built:** on the roadmap per project docs; no (or skeleton) code yet.

Severity legend: 🔴 blocks a user-facing flow · 🟠 feature visibly incomplete · 🟡 cosmetic / intentional-but-worth-noting.

---

## ⚠️ Verification note — false alarms corrected

An automated wiring pass initially flagged several "frontend calls a missing backend endpoint"
defects. **All were verified against route registrations and found to be fully wired** — these
features work and are **not** listed below:

| Reported as "missing" | Actually registered at | Verdict |
|---|---|---|
| `GET /api/v1/states` | `backend/internal/handler/routes_m4.go:165` | ✅ wired |
| `PATCH /api/v1/crm/leads/{id}/stage` | `backend/internal/handler/routes_m4.go:64` | ✅ wired |
| `POST /api/v1/galleries/{id}/duplicate` | `backend/internal/handler/routes_m2.go:108` | ✅ wired |
| `PATCH /api/v1/galleries/{id}/client-link` | `backend/internal/handler/routes_m2.go:107` | ✅ wired |

CRM, dealer/revenue, and gallery duplicate/relationship features are intact.

---

## A. Placeholder UI — visible but no real function

| # | Feature | Evidence | Sev | Notes |
|---|---|---|---|---|
| A1 | **Proofing** (top-level page) | `frontend/src/app/(dashboard)/proofing/page.tsx` | 🟠 | Empty shell: heading + "will appear here", no data fetch. Actual proofing works *inside* galleries; this consolidated view is a stub. |
| A2 | **Favorites** (top-level page) | `frontend/src/app/(dashboard)/favorites/page.tsx` | 🟠 | Empty shell. Gallery-scoped favoriting **does** exist in backend (`backend/internal/handler/gallery_favorites_handler.go`) — the dashboard roll-up just isn't wired to it. |
| A3 | **Downloads** (top-level page) | `frontend/src/app/(dashboard)/downloads/page.tsx` | 🟠 | Empty shell — not connected to the approval/download workflow. |
| A4 | **Studio gallery cover preview** | `frontend/src/app/studio/page.tsx:82` | 🟡 | "Preview coming soon" fallback when a gallery has no cover. Cosmetic. |

---

## B. Built but switched off — works once config/flag is set (not defects)

These follow the project's `platform_settings → env → disable-with-warning` law. They need
configuration, not code.

| # | Feature | Gate (evidence) | To enable |
|---|---|---|---|
| B1 | **Streaming Commercial v1** (credits / recharge / rate cards) | `backend/internal/featureflag/streaming.go` — default **OFF**; loaded at `backend/cmd/api/main.go:2648` | `FEATURE_STREAMING_COMMERCIAL_V1=true` **or** `platform_settings` `featureflag/streaming.commercial_v1` (`{enabled, rollout, enabledWorkspaces}`) |
| B2 | **Razorpay webhooks** (streaming + uploads) | `backend/cmd/api/main.go:2176-2201` — 503 if unset | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| B3 | **PhonePe v2 webhooks** (streaming + uploads) | `backend/cmd/api/main.go:2149-2174` — 503 if unset | `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_V2_BASE_URL`, `PHONEPE_V2_AUTH_BASE_URL`, `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD` |
| B4 | **Cloudflare Stream signing** (replay/signed playback) | `backend/cmd/api/main.go:2707` passes `nil` signer; replay 500s gracefully | `CF_STREAM_SIGNING_KEY` (+ `CF_STREAM_API_TOKEN`, `CF_STREAM_ACCOUNT_ID`) via `platform_settings` `streaming/*` or env |
| B5 | **Real email / SMS / push / WhatsApp delivery** | `backend/internal/service/notification_delivery.go:370-425` — default providers are **log-only stubs** | SMTP path exists; SMS/push/WhatsApp providers must be wired in `main.go`. Until then they log `[stub]` and return nil. |
| B6 | **Desktop app download** | `frontend/src/app/(dashboard)/desktop/page.tsx:87` — "Beta — early access coming soon" | `NEXT_PUBLIC_DESKTOP_RELEASE_URL` + published binaries |
| B7 | **Payment link (UPI)** | `backend/internal/handler/payment_handler.go:214-269` — emits `"provider":"upi_stub"` | Dev stub; production path is Razorpay. Resolves `payments/upi_pa` → env `UPI_PA`. |

> Cross-ref: matches the documented intentionally-gated set (PhonePe v1-salt upload webhook,
> upload-credit flags, push/WhatsApp, admin impersonation) in the prod runtime notes.

---

## C. Partial / stub backend — handler exists but returns 501 / 404 / no-op

The genuine "half-built" cluster — **mostly the streaming write-path.**

| # | Feature | Evidence | Sev | State |
|---|---|---|---|---|
| C1 | **Stream create** | `backend/cmd/api/main.go:2752-2764` (nil handler → 404) | 🔴 | NOT WIRED — awaits StreamWriter idempotency layer (M34 wave 2). |
| C2 | **Stream ingest reveal** (RTMPS/SRT setup) | same block | 🔴 | NOT WIRED — needs StreamLookup + KeyRotator + envelope-decrypt pipeline. |
| C3 | **Live console** (8-method facade) | same block | 🟠 | NOT WIRED — spans services not yet built. |
| C4 | **Stream preflight** | same block | 🟠 | PARTIAL — only `Start()` exposed; missing SessionWorkspace / RecordBandwidth / OBSProfile / TestBroadcast / Complete. |
| C5 | **Chat moderation: timeout / ban** | `backend/internal/streaming/chat/chat_service.go:181-197` | 🟠 | STUB — delete works; timeout/ban return nil with TODO ("Round 3"). |
| C6 | **Viewer presence** | `backend/cmd/api/main.go:2699-2700` `ZeroPresenceSource{}` | 🟠 | STUB — always reports 0 viewers; awaits NATS-backed presence broker. |
| C7 | **Device-key verification** (browser-worker manifests) | `backend/internal/service/upload_manifest_keys.go:10-50` | 🟡 | `noopDeviceKeyVerifier` always returns success "until M17 lands". Intentional bypass. |
| C8 | **Admin upload moderation** | `backend/internal/handler/admin_upload_moderation_handler.go:50-139` | 🟠 | 501 `UPLOAD_MODERATION_NOT_WIRED` when `UploadModerationService` nil (list / override / analytics). |
| C9 | **Admin workspace upload-policy** | `backend/internal/handler/admin_workspace_policy_handler.go:53-90` | 🟠 | 501 skeleton (GET/PUT) pending service wiring. |
| C10 | **Desktop tethered galleries** | `backend/internal/handler/desktop_handler.go:177-179` | 🟡 | 501 when `GalleryRepo` nil (optional feature). |
| C11 | **Marketplace auto-block dates** | `backend/internal/handler/marketplace_handler.go:328-341` | 🟡 | STUB — `AutoBlockListingDate` is a Phase-A no-op; Phase B wires it to calendar event-create. |
| C12 | **Upload-credit checkout** | `frontend/src/components/streams/RechargeModal.tsx:16-22` | 🟠 | UI shows credit tiers, but the POST that returns a gateway redirect URL for an upload purchase is not wired (webhooks exist; the order endpoint does not). |

---

## D. Documented but not built — roadmap (from project docs)

| # | Feature | Source | State |
|---|---|---|---|
| D1 | **Digital Invitations** backend (templates, slug/PIN access, QR/ICS, scan analytics, reminders, auto-delete, moderation, multilingual) | `docs/TechnicalRequirements/Digital_Inivtation_PRD.md` | Frontend contract exists; backend largely unbuilt. Open decisions: creator-only vs RawDrive-sent reminders; ICS deep links. |
| D2 | **Live streaming commercial system** (prepaid credit ledger, reservations, rate cards, CF lifecycle ops, CRM/scheduling linkage, role gates) | `docs/TechnicalRequirements/StreamingDesktop/missing.md` | "M8 skeleton only." Largest documented gap; corresponds to bucket C1–C6. |
| D3 | **M11/M2 open blockers** — burst grouping + aesthetic scoring, HEIC→WebP cover/video-poster derivatives, gallery state machine, composable filters + bulk ops, TUS resume, share-link enforcement (PIN/access modes/analytics/expiry), batch ZIP download, PWA service worker/offline | `docs/uat/OPEN-ISSUES.md` | Tracked as P1/P2 issues blocking M12/M13/M15. |
| D4 | **Gallery roadmap (deferred)** — per-photo client comments, tiered download packages, print store/product ordering, native autoplay slideshow, WhatsApp delivery, custom domain (CNAME), watermark-on-file, per-email access control, smart-album auto-grouping, bulk metadata editor, client mobile app, GDPR deletion flow | `docs/GalleryEnhancemetnsJune2026.md` | Prioritized backlog; a few (expiry timer, branding, branded emails, slideshow-with-music) already shipped. |
| D5 | **SEO/GEO deferred** — per-page OG/WhatsApp images, FAQPage schema, `/studio` per-studio metadata, `Organization.sameAs`, IndexNow | `SEO-CHANGES.md` | Awaiting content/assets/product decisions. |

---

## Prioritized view — what's *actually* incomplete vs. just off

**Treat as genuinely incomplete (needs code):**
1. 🔴 **Streaming write-path** — create / ingest / console / preflight / presence / chat-moderation (C1–C6). Streaming is a skeleton; this is the single biggest cluster.
2. 🟠 **Three empty dashboard pages** — Proofing / Favorites / Downloads (A1–A3). They're in nav but inert; either wire to the existing gallery-scoped backends or hide them.
3. 🟠 **Admin moderation + workspace upload-policy** (C8–C9) — 501 skeletons waiting on their services.
4. 🟠 **Upload-credit checkout order endpoint** (C12) — UI is ready; one missing POST.

**Healthy — just configuration (no code work):** everything in bucket **B**. Flip the flag/env to enable.

**Roadmap — schedule, don't "fix":** bucket **D**.

---

## Method & limits

- Sources: `frontend/src/app/**`, `frontend/src/lib/api/**`, `frontend/src/components/**`;
  `backend/cmd/api/main.go`, `backend/internal/handler/**`, `backend/internal/service/**`,
  `backend/internal/streaming/**`, `backend/internal/featureflag/**`; route files `routes_m2..m8.go`,
  `admin_routes.go`; plus `docs/**`, `cobolt-state.json`.
- **Verified directly:** the four "missing endpoint" false alarms (see top callout).
- **Not independently re-verified:** every bucket-C/D item — these are quoted from in-code
  comments and planning docs (high credibility, but a per-item live check against `origin/main`
  was not performed).
- No application boot, DB, or network calls were made.
