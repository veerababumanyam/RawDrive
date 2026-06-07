# Photo Proofing & Comment System — End-to-End Audit & Recommendations

- **Date:** 2026-06-07
- **Scope:** Full vertical slice of **photo proofing & comments** — database & data
  model, backend (selections, sessions, comments, album approval, favorites,
  fulfillment bridge), API contract, and frontend (public viewer proofing, owner
  gallery proofing toolbar, `/proofing` & `/favorites` dashboards, comment UI).
- **Out of scope:** the commerce/order pipeline downstream of the bridge, and the
  livestream `ReactionsBar` (unrelated to photo proofing).
- **Type:** Read-only documentation audit (no live boot). Findings cite `file:line`.
  Backend/frontend gathered by parallel sub-audits; high-severity items verified.

---

## 1. Executive Summary

Proofing is **the domain where the backend is furthest ahead of the frontend, and
where one route is genuinely exploitable cross-tenant.** The per-photo
Select/Approve/Reject loop works and is convention-correct, but the *system* around
it — comments, sessions, ratings, labels, album approval, CSV export, the two
dashboard pages — is a patchwork of owner-only routes, unwired endpoints, orphaned
components, and stubs.

Five themes:

1. **The comment system is a phantom.** Comments are **owner-authenticated only** —
   there is **no public comment route and no client comment UI anywhere** — so a
   client reviewing proofs **cannot comment or annotate** (B-C1/FE-C1). Edit, delete,
   resolve, and threaded-reply are **coded in the service/repo but wired to no
   route** (`is_resolved` is unreachable, B-C2). The richest comment component
   (`comment-thread.tsx`, with threading + pin display + resolve) is **orphaned dead
   code**; the shipped owner sidebar is a flat, pinless, unresolvable subset.
2. **A real cross-tenant hole.** The fulfillment bridge is the **only** owner
   proofing route that omits the `guardGalleryWorkspace` tenancy check, and it reads
   selections by `gallery_id` alone — so a user can pass another workspace's
   `gallery_id` and **read that tenant's client selections and mint an order stamped
   with their own workspace** (B-B2, High).
3. **The album-approval "consent ledger" is legally hollow.** The append-only
   immutable ledger is well-built at the DB layer, but the endpoint is **owner-only**
   with **owner-typed** `approved_by_name/email`, and it records the **photographer's**
   IP/User-Agent — so a photographer can fabricate any client's approval with no
   client involvement, and `version_hash` hashes a **client-supplied blob**, not real
   album state (B-AA1/AA2, High).
4. **Two dashboard routes are stubs.** `/proofing` and `/favorites` are static
   empty-state cards with no data fetching (FE-1/FE-2), and ~half of `proofing.ts`
   (CSV export, ratings, labels, sessions, album approval, access logs) are API
   clients with **no UI** (FE-4).
5. **No RLS + minimal API docs.** None of the proofing/comment/favorites tables have
   RLS — isolation depends entirely on app-layer gallery scoping (which the bridge
   breaks) — and the surface is barely present in OpenAPI.

What genuinely works: the public **Select** + **Favorite** flows (E2EE-decrypted,
windowed, limit-enforced), the owner **Select/Approve/Reject** toolbar (correct
accent/success/danger convention), and the DB-level immutability triggers.

### Severity snapshot

| # | Layer | Finding | Severity |
|---|-------|---------|----------|
| B-B2 | Backend | Fulfillment bridge omits `guardGalleryWorkspace` + reads by `gallery_id` only → **cross-tenant selection read + order injection** | **High** |
| B-AA1 | Backend | Album-approval ledger is owner-only with owner-typed identity + **photographer's** IP/UA → consent record is fabricable/worthless | **High** |
| B-C1 / FE-C1 | All | **Clients cannot comment** — no public route, no client UI; the comment feature is unbuilt end-to-end | **High** |
| B-C2 | Backend | Comment edit/delete/resolve/thread coded but **wired to no route**; `is_resolved` unreachable | **High** |
| FE-1 | Frontend | `/proofing` dashboard route is a **non-functional stub** | **High** |
| FE-2 | Frontend | `/favorites` dashboard route is a **stub**; no cross-gallery favorites view despite its own subtitle | **High** |
| B-AA2 | Backend | `version_hash` hashes a **client-supplied `config_snapshot`**, not real album state → attests nothing verifiable | **Medium** |
| B-S2 | Backend | Public selection upsert keyed on `(gallery,asset,client_email)` + trusted body email → **one client clobbers another's picks** | **Medium** |
| B-S3 | Backend | Public `POST /proof` has **no rate limit** (unlike verify-pin) and no `asset_ids` batch cap | **Medium** |
| B-B1 | Backend | Bridge has **no idempotency** → repeat calls create **duplicate orders**; selections never marked converted | **Medium** |
| B-F4 | Backend | Favorites→proofing "bridge" is **unbuilt** (`ListAssetIDsByGallery` uncalled stub) | **Medium** |
| B-N1 | Backend | **No email/webhook** on any proofing event; album approval emits **no notification at all** | **Medium** |
| FE-3 | Frontend | `comment-thread.tsx` (threads + pins + resolve) is **orphaned dead code**; shipped sidebar is poorer | **Medium** |
| FE-4 | Frontend | ~Half of `proofing.ts` (CSV/ratings/labels/sessions/album-approval/access-logs) has **no UI** | **Medium** |
| FE-5 | Frontend | Public proofing can send **select + note only** — no rating/label/comment | **Medium** |
| D-1 | DB | **No RLS** on proofing_selections/sessions/comments/album_approvals/favorites — app-layer isolation only | **Medium** |
| B-C3 | Backend | Comment `parent_id`/`asset_id` not validated against the gallery → orphan/cross-gallery rows | **Low/Med** |
| B-F1 | Backend | `guest_session_id` is client-supplied & unbound → a guessed id lists/edits another guest's favorites | **Low/Med** |
| A-1 | API | Proofing barely present in `docs/api/openapi.yaml` (~5 matches) | **Low/Med** |
| B-S5 | Backend | Public selection inserts not transactional → partial batch can commit then 500 | **Low** |
| FE-6 | Frontend | Favorite sync failures silently swallowed (no rollback/toast) | **Low** |

---

## 2. Database & Data Model

Tables: `proofing_selections` (mig `015`; +`session_id`/`star_rating`/`color_label`
in `041`), `proofing_sessions`, `proofing_comments`, `album_approvals`,
`gallery_access_logs` (all `041`), `gallery_favorites` (`105`).

### Strong points
- **Immutable ledgers done right.** `album_approvals` and `gallery_access_logs` each
  have a `BEFORE UPDATE OR DELETE` trigger that raises (`041:60-99`) — genuine
  append-only audit at the DB layer.
- Sensible uniqueness: `proofing_selections UNIQUE(gallery_id,asset_id,client_email)`
  (`015`), `gallery_favorites UNIQUE(gallery_id,asset_id,guest_session_id)` (`105`).
- `star_rating` CHECK 1-5, `access_mode` CHECK enum (`041:112-123`).

### D-1 — No RLS anywhere in this family *(Medium)*
None of `proofing_selections` (`015`), `proofing_sessions`/`proofing_comments`/
`album_approvals` (`041`), or `gallery_favorites` (`105`) declare
`ENABLE ROW LEVEL SECURITY`. Tenant isolation depends **entirely** on app-layer
`gallery_id` scoping + the access gate — which holds for every read path **except
the bridge** (B-B2). Consider RLS via `gallery_id → galleries.workspace_id`, or at
minimum treat the app-layer guard as load-bearing and test it.

### Schema vs. reality gaps
- `proofing_comments` models `parent_id` (threading), `pin_x/pin_y` (annotation),
  `author_name/email` + nullable `author_user_id` (anonymous client authorship),
  `is_resolved` — a full **client-annotation** design. **None of it is reachable**
  (B-C1/B-C2): no public route, no resolve/edit/delete route, no pin write path.
- `proofing_selections.color_label` is bare `TEXT` (enum enforced only in app), and
  `session_id` is a nullable FK never validated to match the selection's gallery.

---

## 3. Backend

Files: handlers `proofing_handler.go`, `proofing_session_handler.go`,
`proofing_bridge_handler.go`, `gallery_favorites_handler.go`; services
`proofing_service.go`, `proofing_session_service.go`, `proofing_comment_service.go`,
`album_approval_service.go`, `gallery_favorites_service.go`,
`proofing_fulfillment_bridge.go`; repos `proofing_*_repo.go`; routes `routes_m2.go`.

### Isolation & the cross-tenant hole
- **B-B2 (High).** `POST /api/v1/galleries/{id}/proofing/bridge`
  (`routes_m2.go:355`) is the **only** owner proofing route that does **not** call
  `guardGalleryWorkspace` (`proofing_bridge_handler.go:32-55`). It takes `galleryID`
  from the URL and `wsID` from the JWT, never verifies the gallery belongs to that
  workspace, and `BridgeSelections` reads selections by `gallery_id` alone
  (`proofing_fulfillment_bridge.go:78` → `ListByClient`, `proofing_repo.go:78-82`).
  Result: a user in workspace A can pass workspace B's `gallery_id` + a guessed
  `client_email` and **read B's client selections and create an order stamped with
  A's `workspace_id`**. Also `wsID, _ := uuid.Parse(...)` ignores parse errors
  (`proofing_bridge_handler.go:48`) → `uuid.Nil` on the order.
- **Otherwise isolation is sound:** read/list paths run `guardGalleryWorkspace`;
  selection/rating/label mutations use `*InWorkspace` repo methods that scope the
  UPDATE atomically (`proofing_repo.go:119-133,232-264`). **B-C3/I2 (Low/Med):**
  `CreateComment` doesn't verify `asset_id`/`parent_id` belong to the gallery (unlike
  the selection path's `CountAssetsInGallery`), allowing orphan/cross-gallery comment
  rows (owner-only, low blast radius).

### Comments
- **B-C1 (High).** Comment routes (`CreateComment`/`GetComments`,
  `routes_m2.go:235-236`) live in the **authenticated owner** group behind
  `guardGalleryWorkspace`. There is **no public comment route** — a client physically
  cannot comment. The schema's anonymous-author + pin design is unbuilt.
- **B-C2 (High).** `ProofingCommentService.UpdateComment/ResolveComment/DeleteComment`
  and the repo equivalents exist (`proofing_comment_service.go:81-96`) but are **wired
  to no HTTP route**. `is_resolved` can never be toggled; `GetThread` (replies) is
  unwired. Edit/delete/resolve/threads are all dead code.
- pin 0-100 validation and required body/author are correct
  (`proofing_comment_service.go:37-50`); body has no max length (Low).

### Selections (public submit)
- **B-S2 (Medium).** `SubmitPublic` trusts `client_email`/`client_name` from the body
  (`proofing_handler.go:163-164`); the upsert on `(gallery,asset,client_email)`
  (`proofing_repo.go:42-45` `ON CONFLICT DO UPDATE`) lets **any gate-passing visitor
  overwrite another client's selection/status/note** by reusing their email. Not
  attributable (selections capture no IP/UA, unlike the approval ledger).
- **B-S3 (Medium).** `POST /galleries/{slug}/proof` (`routes_m2.go:497`) is **not**
  wrapped in `RequirePINRateLimit` (verify-pin is) and has no `asset_ids` batch cap.
- **B-S5 (Low).** The per-asset insert loop isn't transactional
  (`proofing_service.go:96-108`) → a partial batch can commit then 500.
- **Solid:** membership validation via `CountAssetsInGallery`, `max_selections`
  enforcement (counts only new picks → 429), access gate, publish/expiry checks
  (`proofing_service.go:72-93,182-187`).
- **B-S1/FE-5 (Medium):** public submit only writes `status='selected'`
  (`proofing_service.go:103`) — **clients cannot approve/reject**; that's an
  owner-only `PATCH`. The Select/Approve/Reject triad is not expressible by the client.

### Album approval
- **B-AA1 (High).** `SubmitAlbumApproval` is owner-only (`routes_m2.go:237`); it stores
  owner-typed `approved_by_name/email` (`proofing_session_handler.go:356-357`) and the
  **owner's** `r.RemoteAddr`/`r.UserAgent()` as the approver's IP/UA (`:382-383`). As a
  client-consent artifact it is fabricable end-to-end with no client participation.
- **B-AA2 (Medium).** `version_hash = sha256(json.Marshal(input.ConfigSnapshot))`
  (`album_approval_service.go:43-51`) where `ConfigSnapshot` is an arbitrary
  client-supplied map — it attests to whatever JSON was posted, not verifiable
  server-side album state.
- **AA4 (positive):** DB immutability trigger holds; repo only INSERT/SELECTs.

### Favorites & bridge
- **B-F1 (Low/Med).** `guest_session_id` is a trusted opaque string
  (`gallery_favorites_handler.go:118-145`); anyone supplying another guest's id can
  list/add/delete their favorites. **F2 (Low):** the access gate is wired
  (`routes_m2.go:520-521`) but nil-gate fallthrough skips password/access-mode checks
  — a latent re-bypass if wiring is dropped.
- **B-F4 (Medium).** The advertised favorites→proofing bridge is **unbuilt**:
  `ListAssetIDsByGallery` (`gallery_favorites_repo.go:121`) has no caller; favorites
  and selections remain disconnected.
- **B-B1 (Medium).** `BridgeSelections` has **no idempotency** — repeat calls create
  duplicate `gallery_orders`; selections are never marked converted/fulfilled.

### Integration
- **B-N1 (Medium).** Only public selection submit fires a notification — one
  best-effort **in-app** record to the owner (`proofing_service.go:116-143`), **no
  email, no webhook**. Comments (can't happen), favorites, the bridge order, and most
  importantly **album approval** emit **nothing** — the photographer is never told
  "your client approved the album." The dispatcher/webhook infra exists.

---

## 4. API Contract

- **A-1 (Low/Med).** Proofing is barely present in `docs/api/openapi.yaml` (~5
  matches) — the public submit, the owner session/comment/approval suite, the bridge,
  and favorites are effectively undocumented and unguarded by the `openapi` gate.
- No documented error contract; public submit returns 429 on limit (good) but bad
  input largely 500s.

---

## 5. Frontend

Files: public viewer `components/gallery/public-gallery-grid.tsx`; owner
`galleries/[id]/page.tsx` + `components/gallery/photo-lightbox.tsx`; dashboards
`app/(dashboard)/proofing/page.tsx`, `favorites/page.tsx`; `comment-thread.tsx`;
clients `lib/api/proofing.ts`, `favorites.ts`.

### What works (positives)
- **Public Select + Favorite** (`public-gallery-grid.tsx`): proofing-mode tile toggle
  with `CheckCircle` overlay, client-side + server limit enforcement
  (`:1333,1369`), `submitPublicProofing` (`:1353`); favorites via `useGalleryFavorites`
  (server-authoritative + localStorage fallback, gallery-scoped key). E2EE-decrypted
  thumbnails (`useDecryptedAssetUrl`), windowed rendering, proper loading/empty/error.
- **Owner Select/Approve/Reject** toolbar (`photo-lightbox.tsx:1020-1043`): correct
  **Select=accent/CheckCircle, Approve=success/ThumbsUp, Reject=danger/XCircle** +
  keyboard 1/2/3. Convention-perfect.

### FE-1 / FE-2 — Dashboard stubs *(High)*
`/proofing` (`proofing/page.tsx:1-24`) and `/favorites` (`favorites/page.tsx:1-24`)
are static empty-state cards with **no data fetching**. The real owner proofing/
favorites data lives only inside individual gallery detail pages; there is **no
cross-gallery proofing queue or favorites view**, despite the `/favorites` subtitle
promising "across your galleries."

### FE-C1 — No client comment UI *(High)*
`grep` for comment/reply across `app/g/[slug]/*` returns **zero** — the public viewer
has Favorite/Select/Download/Share but **never Comment**. Comment create/list exist
only on the **owner** page (`galleries/[id]/page.tsx:1343,4406`) rendered in the
owner's lightbox sidebar. End-to-end, clients cannot comment.

### FE-3 — Orphaned comment component *(Medium)*
`comment-thread.tsx` (threading, pin display, resolve badge) has **zero importers/
tests** — fully orphaned. The shipped owner sidebar (`photo-lightbox.tsx:880-947`) is
a flat list with no threads, no pin, no resolve. Even the orphan **can't create
pins** (`onSubmit` never passes coords, `comment-thread.tsx:28`). `ProofingComment`'s
`pin_x/pin_y/parent_id/is_resolved` (`proofing.ts:133-145`) are never written by any
UI.

### FE-4 / FE-5 — Dead API clients & thin public vocabulary *(Medium)*
~Half of `proofing.ts` has **no caller**: `exportProofingSelectionsCsv` (`:36`),
`setStarRating` (`:114`), `setColorLabel` (`:123`), `createProofingSession`/
`listProofingSessions` (`:89,103`), `submitAlbumApproval`/`listAlbumApprovals`
(`:189,205`), `getAccessLogs` (`:236`). And `submitPublicProofing` carries only
`{asset_ids, client_name, client_email, note}` (`:53-58`) — public proofing is
**select + note only** (no rating/label/comment). There is no `submitPublicComment`
helper at all.

### FE-6 — Minor *(Low)*
Favorite sync failures are swallowed (`public-gallery-grid.tsx:666-668`) — no
rollback/toast. Owner approve/reject hard-fails on photos with no client selection
yet always shows the buttons (`galleries/[id]/page.tsx:1385-1391`). No
`neutral-*`/`gray-*`/arbitrary-value violations found; a few raw text `<button>`s
(allowed for non-icon actions but hand-rolled).

---

## 6. Cross-Cutting Themes

- **Backend ahead of frontend:** sessions, ratings, labels, CSV export, album
  approval, comment resolve/threading all exist server-side with no UI — the inverse
  of the CRM/freelancer pattern (where the frontend was thinner than a *complete*
  backend, here both are partial and misaligned).
- **The comment system is a phantom across all layers:** schema models rich
  annotation, the backend exposes only owner create/list, the frontend's rich
  component is orphaned, and clients are locked out entirely.
- **"Two of everything" again:** two comment components (orphan rich vs shipped poor),
  two favorites surfaces (working per-gallery vs stub dashboard), two consent concepts
  (selections vs album approval) with no client identity behind either.
- **No notification loop for the highest-value event** ("client approved the album").

---

## 7. Prioritized End-to-End Roadmap

Dependency-ordered, flag-gated, one-unit-per-PR slices.

**P0 — Security & integrity (first):**
1. **B-B2** Add `guardGalleryWorkspace` to the bridge; scope `BridgeSelections` by
   workspace; stop ignoring the `wsID` parse error.
2. **B-S2** Stop trusting body `client_email` for the upsert clobber — bind selection
   identity to the gallery session, or attribute + prevent overwrite of another
   email's row.
3. **B-S3** Rate-limit `POST /proof` + cap `asset_ids`.
4. **B-B1** Idempotency on the bridge (mark selections converted; dedupe orders).

**P1 — Make the consent ledger real & close the comment loop:**
5. **B-AA1/AA2** Make album approval client-facing (public, gated) with the client's
   real identity/IP/UA, and compute `version_hash` from server-side album state.
6. **B-C1/FE-C1** Add a public comment route + client comment UI (per-photo, pinned).
7. **B-C2/FE-3** Wire comment resolve/edit/delete/threads; adopt `comment-thread.tsx`
   (and give it pin-create) as the single comment component.
8. **B-N1** Email/webhook on "client selected/approved/commented" (existing infra).

**P2 — Finish the surfaces the backend already supports:**
9. **FE-1/FE-2** Build real `/proofing` (cross-gallery review queue) and `/favorites`
   (cross-gallery aggregate) dashboards.
10. **FE-4** Wire CSV export, star ratings, color labels, sessions, album-approval,
    and access-logs UIs to their existing clients.
11. **FE-5** Let public proofing carry rating/label (+ comment once P1 lands).

**P3 — Hardening & docs:**
12. **D-1** RLS (or documented app-layer guard + tests) on the proofing family.
    **B-F1/F2** bind `guest_session_id`; remove the nil-gate fallthrough.
    **B-F4** build the favorites→proofing bridge. **B-C3** validate comment
    asset/parent membership. **A-1** document proofing in OpenAPI.

### Quick wins
B-B2 (one guard + workspace scope — closes a cross-tenant read), B-S3 (reuse the
PIN limiter), and wiring the already-built CSV export / ratings / sessions clients
(FE-4) are cheap and high-impact.

---

## 8. Evidence Index

| Layer | Path |
|------|------|
| Schema | `migrations/015_create_proofing_selections`, `041_m13_gallery_viewer_proofing` (sessions/comments/approvals/access-logs + triggers `:60-99`), `105_create_gallery_favorites` |
| No RLS | `015`, `041`, `105` (no `ENABLE ROW LEVEL SECURITY`) |
| Bridge cross-tenant | `handler/proofing_bridge_handler.go:32-55`; `service/proofing_fulfillment_bridge.go:78`; `repository/proofing_repo.go:78-82`; route `routes_m2.go:355` |
| Album approval | `handler/proofing_session_handler.go:342-392`; `service/album_approval_service.go:43-51` |
| Comments | routes `routes_m2.go:235-236`; `service/proofing_comment_service.go:37-96`; `repository/proofing_comment_repo.go` |
| Public selection | `handler/proofing_handler.go:161-199`; `service/proofing_service.go:72-143`; `repository/proofing_repo.go:42-45`; route `routes_m2.go:497` |
| Favorites | `handler/gallery_favorites_handler.go:78-145`; `service/gallery_favorites_service.go:136-150`; `repository/gallery_favorites_repo.go:121`; routes `routes_m2.go:520-524` |
| Notifications | `service/proofing_service.go:116-143` (only path that notifies) |
| Frontend public | `components/gallery/public-gallery-grid.tsx` (`:1333,1353,1369,666`) |
| Frontend owner | `app/(dashboard)/galleries/[id]/page.tsx` (`:1343,1385,4406`); `components/gallery/photo-lightbox.tsx:1020-1043,880-947` |
| Frontend stubs | `app/(dashboard)/proofing/page.tsx:1-24`; `app/(dashboard)/favorites/page.tsx:1-24` |
| Orphan component | `components/gallery/comment-thread.tsx` (0 importers) |
| API clients | `lib/api/proofing.ts` (`:36,53,89,103,114,123,189,205,236`); `lib/api/favorites.ts` |
| API contract | `docs/api/openapi.yaml` (~5 proofing matches) |

---

*Audit is documentation-only; no code was changed and no services were booted.
Companion audits: `calendar-/crm-/freelancer-marketplace-/faceid-findme-audit-
2026-06-07.md`. To action, create the relevant GitHub Project #2 items and ship each
slice via `npm run ship` behind a feature flag.*
