# Chat / Messaging — End-to-End Audit, Paid-Gating & Profile-Linkage Recommendations

- **Date:** 2026-06-07
- **Scope:** Every "chat" surface in RawDrive end-to-end — **internal workspace
  channels** (`000016`: channels/members/messages/client_conversations),
  **marketplace enquiries** (`marketplace_inquiries` + `reply_message` + the
  `inquiry_messages` thread), and the **public viewer/livestream chat** (`ChatBox` +
  `useChatStream`) — across database/data-model, backend handlers/repos, API,
  realtime (SSE), and frontend. Evaluated against the **intended model**: chat is
  **profile-linked**, restricted to **registered paid subscribers only (not free)**,
  scoped to **creating channels + answering enquiries**, and **fully integrated** like
  the other domains (CRM, calendar, notifications, profiles).
- **Companion docs:** `docs/audits/freelancer-marketplace-audit-2026-06-07.md` (the
  enquiry path's M5 RLS/IDOR root cause) and `docs/audits/camera-rentals-gear-audit-2026-06-07.md`
  (the same "isolated island / no profile linkage / no integrations" pattern).
- **Type:** Read-only documentation audit (no live boot). Every claim cites `file:line`;
  the five highest-severity / most structural findings (free-tier exists, chat ungated,
  inquiry IDOR, inert user-RLS, live workspace-RLS) were re-verified directly.

---

## 1. Executive summary

Against the intended model, **chat scores 0/4 on the four pillars you named**:

1. **Paid-subscriber gating — ABSENT.** A `free` tier genuinely exists
   (`plan_catalog.go:49-60`, `Paid:false`) alongside paid tiers
   (creator/pro_photographer/studio/elite_studio), and the platform already has a
   `subscriptions` table with an `active` status and `IsPaidPlanTier` helper. **Yet no
   chat or enquiry route checks any of it** — verified: `routes_m5.go` has zero
   `PlanTier`/`RequirePaid` references. A free workspace can create unlimited channels,
   send unlimited messages, and answer enquiries. The infrastructure to gate this to
   paid subscribers exists; it is simply not wired.

2. **Photographer-profile linkage — ABSENT.** Internal messages carry only a bare
   `sender_id` (no name, avatar, or profile); enquiries surface a raw user
   name/email but never a `/p/{slug}` profile. No chat query joins
   `photographer_profiles` — the same isolation pattern found in the gear audit.

3. **"Create channels + answer enquiries" — UNCONSTRAINED & FRAGMENTED.** There is no
   restriction scoping chat to those two actions, and the enquiry path is split across
   **two data models** (`reply_message` single field vs the `inquiry_messages` thread)
   surfaced by **two disconnected UIs** (`/messages?tab=inquiries` vs
   `/crm/inquiries`) that do not sync. Counting the public livestream `ChatBox`, RawDrive
   has **three separate, unintegrated chat systems**.

4. **Integrations — ABSENT (like the other domains).** No CRM lead/contact/deal capture
   on a new enquiry, no calendar block from an enquiry's `event_date`, no
   notification/email on enquiry receipt or reply, and the `client_conversations`
   client-portal table is **orphaned** (no handlers).

Layered on top are two **security defects**: a cross-user **IDOR in `UpdateInquiry`**
(it says `_ = userID // ownership verified via RLS` while the RLS it trusts is inert),
and a **channel-membership IDOR** (workspace isolation is live, but any workspace member
can read/write *any* channel because membership is never checked).

### Severity snapshot

| # | Layer | Finding | Severity |
|---|-------|---------|----------|
| C-1 | Gating | **Chat & enquiries are NOT gated to paid subscribers.** Free tier exists; no route checks plan/subscription. | **High (the core ask)** |
| C-2 | Security | **Inquiry IDOR.** `UpdateInquiry`/`ReplyInquiry`/`UpdateInquiryStatus` do no ownership check (`_ = userID // verified via RLS`); the `app.current_user_id` RLS is **never set** → any user can reply-as / restatus any inquiry. | **High** |
| C-3 | Security | **Channel-membership IDOR.** `app.current_workspace_id` RLS *is* live (isolation works), but `GetMessages`/`SendMessage` check only `channel ∈ workspace`, not `user ∈ channel_members` → any member reads/writes any channel. | **High** |
| C-4 | Data/UX | **Enquiry path is doubled:** legacy `reply_message` (single) vs `inquiry_messages` (thread), surfaced by two non-syncing UIs. | **Med-High** |
| C-5 | Linkage | **No photographer-profile linkage** anywhere (messages = bare `sender_id`; enquiries = raw name/email; no `/p/{slug}`). | **Med-High** |
| C-6 | Architecture | **Three disconnected chat systems** (channels, enquiries, viewer/stream) — no unification, separate nav, separate models. | **Med** |
| C-7 | Integrations | **No CRM/calendar/notification wiring**; `client_conversations` orphaned. | **Med** |
| C-8 | Backend | **No member-management, read-receipt, typing/presence endpoints** (repo methods exist, no handlers); enquiries have **no SSE** (poll only). | **Med** |
| C-9 | Backend | **No rate-limiting / spam control / message-size limits**; `attachment_url` stored unvalidated (SSRF/unauthorized-fetch risk). | **Med** |
| C-10 | Frontend | Design-law violations (raw `<button>`+inline SVG, arbitrary `min-h-[44px]`/`max-w-[75%]`), missing `aria-live` for new messages, optimistic-update race in the CRM panel. | **Low** |

---

## 2. The three chat systems (what exists)

| System | Tables | Routes / surface | Realtime | Status |
|--------|--------|------------------|----------|--------|
| **Internal workspace channels** | `channels`, `channel_members`, `messages` (`000016`) | `/api/v1/messages/*`; `/messages` page | **SSE** (`chat.message.{ws}.{ch}`) | Works; workspace-isolated; **no membership check, no gating, no profile** |
| **Marketplace enquiries** | `marketplace_inquiries` (`000014`) + `reply_message` (`114`) + `inquiry_messages` (`115`) | `/api/v1/marketplace/inquiries`, `/api/v1/inquiry/{id}/messages`; `/messages?tab=inquiries` **and** `/crm/inquiries` | **Poll only** | Works; **IDOR on update; dual model; two UIs; no gating; no CRM/notify** |
| **Public viewer / livestream chat** | stream state (separate) | `/api/v1/public/streams/{id}/chat`; `ChatBox` + `useChatStream` | **SSE** | Separate public system; slow-mode/ban; unrelated to the above |
| **Client-portal chat** | `client_conversations` (`000016`) | — | — | **Orphaned** (table only, no handlers/routes) |

The first two are the "chat" the intended model targets. They share **no** code, model, or UI with each other.

---

## 3. Pillar 1 — Paid-subscriber gating (the core ask)

### 3.1 The plan/subscription model already supports this
- **A real `free` tier exists** (`backend/internal/service/plan_catalog.go:49` `Tier:"free"`, `:60 Paid:false`) plus paid self-serve tiers `creator`/`pro_photographer`/`studio` and admin-granted `elite_studio`/`pay_per_event`. New workspaces default to `free` (onboarding) — verified.
- **Paid status is determinable** two ways: `IsPaidPlanTier(tier)` (catalog `Paid` flag) and the `subscriptions` table (`status='active'`). A correct gate checks **both** (paid tier *and* a non-expired active subscription), since a `creator` workspace whose subscription `churned` should not retain access.
- **The plan-tier is already on every request context** via `PlanTierContext`→`PlanTierFromContext` (`middleware.go:85-96`), with a documented safe default ("empty ⇒ not privileged").

### 3.2 The gate is simply not applied
- **Verified:** `routes_m5.go` contains **zero** `PlanTier`/`RequirePaid`/`RequireActiveSub` references; `messaging_handler.go` and `marketplace_handler.go` never call `PlanTierFromContext`. Free workspaces have full chat + enquiry access.

### 3.3 Recommendation — `RequirePaidPlan` middleware (new)
Add one reusable middleware and mount it on the chat + enquiry route groups (after `TenantContext`/`PlanTierContext`):
```go
// Deny unless the workspace is on a paid tier AND has an active (or trialing) subscription.
func RequirePaidPlan(pool PlanPool) func(http.Handler) http.Handler {
  return func(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
      tier := middleware.PlanTierFromContext(r.Context())
      if tier == "" || !service.IsPaidPlanTier(tier) {           // free / unknown ⇒ deny
        respondJSON(w, 402, map[string]string{"error":"upgrade_required",
          "message":"Chat is available on paid plans.","upgrade_url":"/settings/plans"})
        return
      }
      // defense-in-depth: confirm a live subscription (paid tier can be churned)
      if !hasActiveOrTrialingSubscription(r.Context(), pool, middleware.WorkspaceIDFromContext(r.Context())) {
        respondJSON(w, 402, map[string]string{"error":"subscription_expired","upgrade_url":"/settings/plans"}); return
      }
      next.ServeHTTP(w, r)
    })
  }
}
```
- Return **402 Payment Required** with an `upgrade_url` (the quota gate already uses a similar informative-JSON pattern). Treat `trialing` as paid; treat `free`/empty/expired as denied (default-deny).
- **Decide the policy precisely:** the intended model is "photographers (paid) create channels + answer enquiries." That means the gate belongs on **write** paths (create channel, send message, create/reply enquiry) at minimum. Decide whether a free user may still *read* an enquiry sent to them (recommended: yes — receiving a lead shouldn't require paying, but *replying* should) — this nuance drives whether the gate is on the whole route group or just the write handlers.

---

## 4. Pillar 2 — Photographer-profile linkage

- **Internal messages** persist only `sender_id` (`messaging_repo.go` `Message` struct) — no `display_name`/avatar/profile. The UI even renders `sender_id.slice(0,8)` as the identity (`messages/page.tsx`).
- **Enquiries** `LEFT JOIN users` for `from_user_name`/`email` (`marketplace_handler.go` ListInquiries) but never touch `photographer_profiles`; there is **no `/p/{slug}` link** to the other party's public profile in any chat UI.
- **No chat query references `photographer_profiles`** — same island pattern as gear.

**Recommendation:** hydrate participants from `photographer_profiles` (display_name, `avatar_cropped_url`, `url_slug`, verified `status`, `average_rating`). For enquiries, the `to_user` *is* a photographer with a profile — surface that profile card (name, avatar, rating, link to `/p/{slug}`) so the inquirer knows who they're contacting, and surface the inquirer's identity to the photographer. This is also what makes "paid photographers answer enquiries" coherent: the responder is a profile-bearing, paid studio.

---

## 5. Pillar 3 — "Create channels + answer enquiries" (scope & fragmentation)

- **No scoping today:** any workspace member can create channels of any type; there's no notion of "this user may only create channels / answer enquiries." If the intended model restricts chat to photographers on paid plans, that's the `RequirePaidPlan` gate (§3.3) plus (optionally) a role check.
- **Dual enquiry model (C-4):** migration `114` added a single `reply_message` column; migration `115` then added the `inquiry_messages` thread. **Both are live and unsynced** — `UpdateInquiry` writes `reply_message`; `SendInquiryMessage` writes the thread; `GET /inquiry/{id}/messages` returns only the thread. The frontend compounds it: `/messages?tab=inquiries` renders the **thread**, while `/crm/inquiries` (marketplace-inquiries-panel) renders the **single `reply_message`**. A reply in one surface is invisible in the other.
- **Recommendation:** make `inquiry_messages` the single source of truth; backfill any `reply_message` into a thread row; deprecate/drop the column (follow-up migration); collapse the two UIs into one enquiry conversation surface.

---

## 6. Pillar 4 — Integrations (like the other domains)

| Integration | Exists in repo? | Wired to chat/enquiry? | Gap |
|---|---|---|---|
| **CRM (leads/contacts/deals, `021`)** | ✅ | ❌ | A new enquiry should create/attach a **lead/contact** and a **deal**; replies should roll into the contact timeline. Today an enquiry writes only `marketplace_inquiries`. (`/crm` has a manual "Convert to project" button — one-way, manual.) |
| **Calendar (`events`)** | ✅ | ❌ | Enquiries carry `event_date`/`duration_days` but never create/hold a calendar event or check conflicts. |
| **Notifications / email** | ✅ (dispatcher, `bookings` category) | ❌ | **No email/notification** on new enquiry or reply — the photographer must poll the UI. Same silence found in gear. |
| **Photographer profiles** | ✅ | ❌ | §4. |
| **Galleries / client portal** | ✅ table `client_conversations` | ❌ orphaned | Client-portal chat table exists with no handlers/routes. |
| **Moderation** | ✅ | ⚠️ partial | Message body is keyword-screened on send (`messaging_handler.go`), but flagged messages still post; enquiries aren't screened. |

---

## 7. Security & operational findings (verified)

- **C-2 Inquiry IDOR (High).** `UpdateInquiry` (`marketplace_handler.go:548`) does `_ = userID // ownership verified via RLS`; `ReplyInquiry`/`UpdateInquiryStatus` SQL has **no owner predicate**; and `app.current_user_id` is **never set anywhere in Go** (grep empty) → the `marketplace_inquiries_participant` RLS policy never evaluates. Any authenticated user can reply-as or re-status any inquiry by id. (Same root cause as the freelancer audit's F-B6; there's a second bare `_ = userID` at `:335` worth reviewing.)
- **C-3 Channel-membership IDOR (High).** Workspace RLS **is** live (`db_context.go:32-33` sets `app.current_workspace_id`), so cross-workspace leakage is prevented. But `GetMessages`/`SendMessage` only assert `channel ∈ workspace` (`requireChannelInWorkspace`), never `user ∈ channel_members` → any workspace member can read/post to any channel, including `dm`/`client` channels they were never added to. Fix: `SELECT 1 FROM channel_members WHERE channel_id=$1 AND user_id=$2` gate.
- **C-8 Missing endpoints.** `MarkChannelRead`/`GetUnreadCount` repo methods exist with **no handler**; **no add/remove/list member** endpoints (only the creator is auto-added as admin); **no typing/presence**; enquiries have **no SSE** (poll only) while channels do.
- **C-9 Abuse surface.** No rate-limiting on channel/message/enquiry creation; no message-length cap (only empty-check); `attachment_url` is stored as an arbitrary string with no scheme/domain validation and no auth on fetch (SSRF / unauthorized-object risk). Soft-delete works (`deleted_at`).

---

## 8. Target data model (recommended)

All additive; column drops in a follow-up slice after dual-read (append-only migration law; assign `NNN` against `origin/main`).

### 8.1 Gate + decide RLS posture
```sql
-- No schema change needed to GATE (middleware + existing subscriptions table do it).
-- But FIX the inert user-RLS that UpdateInquiry trusts — either:
--   (a) set app.current_user_id per request in db_context (mirror SetWorkspaceID), making
--       the marketplace_inquiries_participant policy live, OR
--   (b) formally retire that RLS and add explicit owner predicates in the repo.
-- Recommended: BOTH — add explicit handler checks (defense in depth) AND set the GUC.
```

### 8.2 Consolidate the enquiry model onto a thread
```sql
-- inquiry_messages already exists (115). Backfill reply_message into it, then:
ALTER TABLE marketplace_inquiries DROP COLUMN IF EXISTS reply_message;  -- follow-up slice
-- Optional: richer status lifecycle
ALTER TABLE marketplace_inquiries
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES photographer_profiles(profile_id),  -- the to_user's profile
  ADD COLUMN IF NOT EXISTS lead_id    UUID REFERENCES leads(id),     -- CRM capture
  ADD COLUMN IF NOT EXISTS deal_id    UUID REFERENCES deals(id),     -- CRM pipeline
  ADD COLUMN IF NOT EXISTS event_id   UUID REFERENCES events(id);    -- calendar block from event_date
```

### 8.3 Profile-link the internal channel participants & integrate
```sql
-- Channels can optionally bind to a CRM contact / gallery for "client" channels:
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS gallery_id UUID REFERENCES galleries(id);
-- Read path hydrates message senders from photographer_profiles (display_name, avatar_cropped_url,
-- url_slug, status) — no schema change to `messages` required; join at read time.

-- Add the missing membership/read-state operations against the EXISTING channel_members
-- (channel_id, user_id, role, last_read_at) — handlers only, no schema change.
```

### 8.4 Wire the orphan or drop it
```sql
-- client_conversations (000016) is unwired. Either build the client-portal chat handlers
-- (gallery_id + share_token already present) or drop the table to remove dead schema.
```

### 8.5 Connection map (solid = exists, ┄ = recommended)
```
 photographer_profiles ──┐ (hydrate sender/participant: name, avatar, /p/slug, rating, verified)
                         ┊
 workspaces ──plan_tier──● RequirePaidPlan (NEW gate) ──guards──▶ channels + marketplace_inquiries
     │                        ▲ subscriptions.status='active'
     │ workspace_id           │
 ┌───▼────────┐  created_by  ┌┴──────────────┐    from/to_user ┌──────────────┐
 │  channels  │──user───────▶│    users      │◀───────────────│marketplace_   │
 │ (000016)   │┄contact_id┄▶ contacts(CRM)   │                │inquiries(014) │┄profile_id┄▶ photographer_profiles
 │            │┄gallery_id┄▶ galleries        │                │  ┊lead_id/deal_id/event_id (NEW)
 └───┬────────┘              └──────────────┘                 └──────┬───────┘
     │ channel_id (+ channel_members: ENFORCE membership)             │ inquiry_id
 ┌───▼────────┐                                                ┌──────▼────────┐
 │  messages  │  (hydrate sender from profiles at read)        │inquiry_messages│ (single source of truth; drop reply_message)
 └────────────┘                                                └───────────────┘
   client_conversations (000016) ┄┄ orphaned: build client-portal handlers OR drop
```

---

## 9. Remediation roadmap (flag-gated, one-unit-per-PR; track on Project #2)

**Phase 0 — Security (do first)**
1. Fix **inquiry IDOR**: explicit owner predicates in `ReplyInquiry`/`UpdateInquiryStatus` + set `app.current_user_id` (or drop the dead RLS). *(C-2)*
2. Fix **channel-membership IDOR**: `channel_members` check in `GetMessages`/`SendMessage`. *(C-3)*

**Phase 1 — Paid-subscriber gating (the core ask)**
3. Add `RequirePaidPlan` middleware (paid tier **and** active/trialing subscription; 402 + upgrade_url); mount on chat + enquiry **write** routes; decide read policy for received enquiries. *(C-1)*
4. Frontend: upgrade-prompt UI on 402 instead of a hard error; hide create/reply affordances for free tier with a "Upgrade to chat" CTA.

**Phase 2 — Profile linkage**
5. Hydrate message senders + enquiry participants from `photographer_profiles`; render name/avatar/rating + `/p/{slug}` link. *(C-5)*

**Phase 3 — Consolidate the enquiry path**
6. Make `inquiry_messages` the single model; backfill + drop `reply_message`; merge the two enquiry UIs into one; add **SSE** to enquiries. *(C-4, C-8)*

**Phase 4 — Integrations (like the others)**
7. Enquiry → CRM lead/contact + deal; calendar event/hold from `event_date`; email/notification on new enquiry + reply. *(C-7)*
8. Build the `client_conversations` client-portal chat or drop the orphan table. *(C-7)*

**Phase 5 — Operational hardening**
9. Member-management + read-receipt + typing/presence endpoints; rate-limiting; message-size caps; validate `attachment_url` (scheme/domain/auth). *(C-8, C-9)*
10. Design-law + a11y fixes (`GlassIconButton`, tokens, `aria-live`, fix optimistic-update race). *(C-10)*

---

## 10. Evidence appendix (primary citations)

- **Free tier + paid flags:** `backend/internal/service/plan_catalog.go:49-142` (`free` Paid:false; `creator`/`pro_photographer`/`studio`/`elite_studio` Paid:true); normalization `:430-434`. Paid status: `IsPaidPlanTier` + `subscriptions.status='active'`.
- **No gate on chat/enquiry routes:** `backend/internal/handler/routes_m5.go` (grep `PlanTier|RequirePaid` → empty); `messaging_handler.go` / `marketplace_handler.go` never call `PlanTierFromContext`.
- **Inquiry IDOR:** `backend/internal/handler/marketplace_handler.go:548` (`_ = userID // ownership verified via RLS`), `:335`; `app.current_user_id` never set in Go (grep empty); RLS policy in `000014_create_m5_marketplace_tables.up.sql`.
- **Workspace RLS live; membership unchecked:** `backend/internal/middleware/db_context.go:29-34` (sets `app.current_workspace_id`); `messaging_handler.go` `GetMessages`/`SendMessage` use `requireChannelInWorkspace` only.
- **Dual enquiry model:** `114_marketplace_inquiry_reply.up.sql` (`reply_message`) vs `115_inquiry_messages.up.sql` (thread); two UIs `frontend/src/app/(dashboard)/messages/page.tsx` (thread) vs `frontend/src/components/crm/marketplace-inquiries-panel.tsx` (single reply).
- **Channels/SSE/orphan:** `000016_create_m5_messaging_tables.up.sql` (channels/members/messages/client_conversations); SSE `backend/internal/handler/events_handler.go`; `client_conversations` has no repo/handler.
- **Profiles:** `photographer_profiles` (migration 163); no reference in messaging/marketplace handlers.
- **Frontend surfaces:** `messages/page.tsx`, `lib/api/messaging.ts`, `crm/inquiries/page.tsx`, `components/crm/marketplace-inquiries-panel.tsx`, `components/viewer/ChatBox.tsx`, `hooks/streams/useChatStream.ts`.
- **Companions:** `docs/audits/freelancer-marketplace-audit-2026-06-07.md`, `docs/audits/camera-rentals-gear-audit-2026-06-07.md`.

---

*Prepared as a read-only audit. No source files were modified and the application was not
booted. All `file:line` references were verified against the working tree at the time of
writing (branch `main`). Sub-domain detail was gathered by parallel sub-audits;
high-severity and structural findings (free-tier existence, ungated chat, inquiry IDOR,
inert user-RLS vs live workspace-RLS) were re-verified directly.*
