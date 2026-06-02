# Gallery Enhancements — Implementation Plan (June 2026)

Companion to `docs/GalleryEnhancemetnsJune2026.md`. Scopes four of the "Do first" features:

1. **Slideshow with music**
2. **Branded client email automation**
3. **Gallery expiry timer**
4. **Logo / brand customisation**

> **Reality check.** The competitive doc was written from a UI walkthrough. The code is
> much further along than it implies. This is mostly **gap-closure**, not greenfield. Each
> feature section below states what already exists (with `file:line`) before the work.

---

## 0. Locked Decisions

| Decision | Choice |
|---|---|
| Slideshow music source | **Photographer uploads a track per gallery** (audio upload + B2 storage + auth-gated serve) |
| Music storage accounting | **Stored in the workspace's gallery storage (B2); bytes count against the workspace's allocated quota.** Reuse the REAL asset-ingest + storage-accounting path (enforce plan limit, increment `workspace_storage`). No bespoke upload that bypasses accounting. |
| Integration discipline | **Proper, working end-to-end integrations only — no stubs, fakes, or mocked services.** Verified against the live stack. |
| Email automation | **Full auto**: "gallery ready" on publish + scheduled reminder + expiry-warning drip; **per-gallery disable toggle**, default ON |
| Branding scope | **Workspace default + per-gallery override** |

---

## 0.5 Methodology — Test-Driven Development (mandatory)

**Every task in this plan is executed test-first.** The per-feature **"Test-first"** subsection
is the *starting* artifact, not a closing checklist — write those tests before any production code.

The loop for each unit of work (one endpoint, one worker behaviour, one component, one migration):

1. **RED** — Write the smallest failing test that pins the next behaviour. Run it; confirm it
   fails for the *right* reason (assertion, not a compile/import error). Commit the red test.
2. **GREEN** — Write the minimum production code to make that test pass. No extra scope. Run the
   focused test, then the suite.
3. **REFACTOR** — Clean up names/duplication with the suite green. Re-run before moving on.

Discipline rules:
- **No production code without a failing test that demands it.** If you cannot write a failing
  test for a change, the change is unspecified — stop and specify it.
- **Migrations are TDD too**: add the schema assertion to `m*_migrations_test.go` (RED — table/
  column absent) *before* writing the `.up.sql`.
- **Bug found mid-build** → reproduce with a failing test first, then fix.
- **Test fixtures**: real assets from `tests/photos/`; JWT claims via `middleware.WithJWTClaims`;
  seeded users from `backend/seeds/`. Never fabricate roles or synthesize images.
- Keep tests fast and isolated; the slow E2E layer asserts wiring, not unit logic.
- Per-feature task ordering below is intentionally **test → implementation** — do not reorder.

> If a `cobolt-*` skill is later driving execution, its TDD checkpoints supersede this section
> for the duration of that skill run; otherwise this is the contract.

---

## 1. Conventions This Plan Must Honour (hard floor)

These are load-bearing per `AGENTS.md` / `CLAUDE.md`. Every task below inherits them:

- **Storage = Backblaze B2 via the `s3` driver only.** Audio tracks store in B2 like any
  asset. No local disk. No public bucket URLs — serve through an auth/session-gated handler.
- **WebP derivatives are for images.** Audio is **not** an image — uploads must **bypass the
  WebP derivative pipeline** (verify the pipeline keys on `content_type LIKE 'image/%'`).
- **Icon buttons = `GlassIconButton`** (`frontend/src/components/ui/glass-icon-button.tsx`),
  icons from `frontend/src/components/icons/index.tsx`. New icons (`Play`, `Pause`, `Music`,
  `Volume`/`VolumeOff`) follow the 24×24 / 1.5px-stroke pattern. Every icon button needs a `label`.
- **Design tokens are the single source of truth.** No `neutral-*`/`gray-*`, no arbitrary
  `[...]` values, no new hardcoded hex. Per-workspace accent is injected as a **CSS custom
  property override** on a wrapper, not via scattered inline `style={{color}}`.
- **JWT claims** via `middleware.JWTClaimsFromContext` only; never a local context-key type.
- **Migrations are append-only.** Latest committed is **141**
  (`141_gallery_download_quality_webp_default`). New pairs start at **142**. Each gets schema
  assertions in an `m*_migrations_test.go`.
- **Tests use `tests/photos/`** (17 real JPEGs, some with spaces/parens). E2E runs inside the
  Docker `playwright` service with auth injected via `storageState`/`addInitScript` — never a
  UI login. Dev email lands in **Mailpit**.
- **Email/OTP separation stays intact.** Automated gallery emails are a brand-new channel; do
  not touch the registration-OTP or TOTP-MFA paths.

---

## 2. Migration Plan

| # | Name | Adds |
|---|---|---|
| 142 | `142_gallery_slideshow_music` | `galleries.music_asset_id UUID NULL` (FK `assets`), index. Slideshow timing/options live in the existing `cover_config`/design_config JSONB (no extra columns). |
| 143 | `143_gallery_email_automation` | `galleries.email_automation_enabled BOOLEAN NOT NULL DEFAULT true`; new table `gallery_email_events` (idempotent send ledger). |

No migration is needed for **expiry** (`expires_at` exists since 071) or **branding** (workspace
columns exist since 080; per-gallery override rides in the design_config JSONB).

`gallery_email_events` shape:

```sql
CREATE TABLE gallery_email_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id    UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,          -- 'ready' | 'reminder' | 'last_chance'
    recipient     TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at       TIMESTAMPTZ,            -- NULL = pending
    status        TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed|skipped
    last_error    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gallery_email_events_due
    ON gallery_email_events (scheduled_for)
    WHERE sent_at IS NULL AND status = 'pending';
CREATE UNIQUE INDEX idx_gallery_email_events_dedupe
    ON gallery_email_events (gallery_id, event_type, recipient);
```

---

## 3. Feature 1 — Gallery Expiry Timer  *(effort: S — backend already done)*

### Already built
- `galleries.expires_at TIMESTAMPTZ` (nullable, indexed) — migration `071_gallery_cover_expiry`.
- `gallery_handler.go` `Update` accepts `expires_at`; `gallery_repo.go` `Update` persists it (~330-359).
- Public access gate enforces it: `public_gallery_handler.go` `gateGalleryAccess` returns
  **HTTP 410 Gone** when `expires_at` is in the past (~340-342), *before* password/access-mode checks.
- `backend/internal/worker/gallery_expiry_worker.go` polls every 15 min and flips
  `status='expired'`.

### The gap → work
**Backend:** none required for enforcement. (Optional: have the expiry worker enqueue the
"last_chance" email — see Feature 3.)

**Frontend — settings (`frontend/src/app/(dashboard)/galleries/[id]/settings/page.tsx`):**
- Add an **"Access window"** section: radio (No expiry / 30 / 60 / 90 days / Custom date) →
  computes an absolute `expires_at` and writes via the existing
  `updateGallerySettings(token, id, { expires_at })` (`lib/api/galleries.ts:643`).
- Show the resolved absolute date + "Clients lose access after this date" helper text.

**Frontend — client countdown (public gallery):**
- New `frontend/src/components/gallery/gallery-expiry-banner.tsx`: when `expires_at` is set and
  within a threshold (e.g. ≤14 days), render a token-styled banner in
  `public-gallery-hero.tsx` — "Available until {date} · {N} days left". Pure client countdown
  off the already-returned `expires_at`; no new API.
- The 410 path already blocks expired galleries; add a friendly **"This gallery has expired"**
  state on `/g/[slug]` when the fetch returns 410.

### Test-first (write these as RED before the work above)
- Frontend vitest: settings writes correct `expires_at`; banner shows/hides at threshold;
  410 → expired state.
- Backend: gate-returns-410 test likely already exists; extend if needed.

---

## 4. Feature 2 — Logo / Brand Customisation  *(effort: S/M — mostly built)*

### Already built
- Workspace branding columns (migration `080_studio_identity_public_sharing`): `brand_name`,
  `brand_accent_color` (`#RRGGBB`), `public_branding_enabled`, `logo_asset_id`, `logo_metadata`.
- `workspace_profile_handler.go` GET/PUT `/api/v1/workspaces/current/profile` reads/writes them.
- Public endpoints: `GET /api/v1/public/galleries/{slug}/branding` (returns brandName,
  accentColor, logoUrl, tier gating) and `.../branding/logo` (streams logo bytes, image-only,
  no bucket URL leak) — `public_gallery_handler.go:1070-1270`.
- `public-gallery-hero.tsx` **renders** logo + brand name + monogram + accent today
  (~280-743), gated to `can_customize` tiers (pro/enterprise/studio) and `public_branding_enabled`.
  → The doc's "no photographer identity visible" claim is **refuted** for those tiers.

### The gaps → work
**(a) Accent injected as CSS variable (token-rule fix).** Today accent is applied via scattered
`style={{ color: brandColor, borderColor: brandColor }}` (hero lines ~497-743) — violates the
"no inline theme colors" rule.
- On the `/g/[slug]` wrapper (`frontend/src/app/g/[slug]/page.tsx`), set
  `style={{ "--accent-default": resolvedAccent, "--accent-hover": …, "--accent-muted": … }}`
  where `resolvedAccent = galleryOverride ?? workspaceAccent ?? token default`.
- Refactor hero CTAs/chips to token classes (`border-accent-default`, `text-accent-default`,
  `hover:border-accent-hover`) instead of inline color styles.

**(b) Per-gallery override** (decision: workspace default + override). The gallery design_config
`branding` block (`frontend/src/lib/gallery-design-config.ts:101-108`) already has
`logoPlacement`, `monogram`, `brandColor`, `watermarkStyle`. Extend it with:
- `useWorkspaceDefault?: boolean` (default true), `logoAssetId?: string`, `studioName?: string`.
- Public hero resolves: per-gallery override (if `useWorkspaceDefault === false`) → workspace
  branding → none. Persisted in the existing `cover_config`/design_config JSONB (no migration).

**(c) Cover editor Brand tab** (`frontend/src/app/(dashboard)/galleries/[id]/cover/page.tsx`):
- Add a **logo asset picker** (reuse the asset-library picker; logo is referenced by `asset_id`,
  consistent with workspace logo flow) and a **studio-name** field.
- Add a **"Use studio default / Override for this gallery"** toggle controlling
  `useWorkspaceDefault`.

**(d) Workspace branding dashboard surface.** Confirm a dashboard settings screen drives the
existing `PUT /workspaces/current/profile` (name, accent hex, logo asset, `public_branding_enabled`).
If absent, add a "Studio branding" settings card. (Backend already complete.)

### Test-first (write these as RED before the work above)
- Frontend vitest: accent CSS-var resolution precedence (gallery → workspace → token); hero
  renders override vs default; tier gating hides branding for standard tier.
- Backend: branding endpoints likely covered; extend for the per-gallery override resolution if
  any backend resolution is added (most resolution is client-side off existing fields).

---

## 5. Feature 3 — Branded Client Email Automation  *(effort: L — biggest backend)*

### Already built
- SMTP core with dynamic config (`platform_settings` → env), HTML-capable
  (`backend/internal/email/smtp.go`); `gallery_share.go` already sends an **HTML** gallery-share
  email (~48-78). Creds never hardcoded.
- Manual, synchronous share-email send via `share_link_handler.go` (~144-204).
- Workspace branding available for templates (migration 080).
- Polling-worker pattern to copy: `gallery_expiry_worker.go`; worker registry wiring in
  `cmd/api/main.go:2990-3023`.
- **No** scheduler for "day 7 / day 25", **no** branding in templates, **no** auto "ready" email.

### Work
**1. Branded email template layer** — `backend/internal/email/branded_template.go`:
- Reusable branded HTML layout: header studio logo (via the public logo URL pattern), accent
  CTA button (`brand_accent_color`), studio name, footer. Falls back to RawDrive default when
  `public_branding_enabled = false` or tier can't customise.
- Three concrete templates: **gallery-ready**, **reminder** ("your gallery is waiting"),
  **last-chance** ("access ends in N days").
- Fetch branding once per send: `SELECT brand_name, brand_accent_color, logo_asset_id,
  public_branding_enabled FROM workspaces WHERE id = $1`.

**2. Recipient resolution** — resolve the client email from the gallery's
`primary_contact_id`/`contact_id` → contacts table email. (Fall back to share-link
`recipient_emails` if a contact email is absent.)

**3. Scheduling — enqueue on publish.** When a gallery transitions to published
(`gallery_handler.go` Update where `is_published` flips true, guarded by
`email_automation_enabled`):
- Insert `gallery_email_events` rows (idempotent via the unique index):
  - `ready` → `scheduled_for = now()`
  - `reminder` → `now() + 7d` (skip/cancel if the client has already downloaded)
  - `last_chance` → `expires_at − 3d` (only when `expires_at` is set and in the future)
- Offsets defined as named constants so they're easy to tune.

**4. New polling worker** — `backend/internal/worker/email_automation_worker.go` (mirror
`gallery_expiry_worker`, 15-min tick):
- Select due rows (`scheduled_for <= now() AND sent_at IS NULL AND status='pending'`).
- Re-check guards at send time (gallery still published, not expired-for-`ready`,
  automation still enabled, client hasn't already downloaded for `reminder`).
- Send via the branded template; mark `sent_at`/`status`. On failure set `status='failed'` +
  `last_error` (bounded retry by leaving it pending up to N attempts).
- Register in `cmd/api/main.go` worker registry.

**5. Per-gallery control** (migration 143 `email_automation_enabled`, default true):
- Settings page toggle: "Automated client emails". When off, no rows enqueue and pending rows
  are cancelled (`status='skipped'`).
- Optional: a manual "Send 'gallery ready' now" button reusing the same template (covers the
  "branded templates" value even when automation is off).

### Test-first (write these as RED before the work above)
- Backend unit: enqueue logic (correct rows/offsets, idempotency, expiry-relative last_chance),
  worker due-selection + guard re-checks, template renders branding vs default.
- Mailpit integration in dev: publish → "ready" email visible; toggle off → none.
- Edge cases: no contact email, `expires_at` unset (no last_chance), automation disabled,
  client already downloaded (reminder skipped).

---

## 6. Feature 4 — Slideshow with Music  *(effort: L — new audio infra + fullscreen autoplay)*

### Already built
- Hero cover auto-cycles 4.5s through cover + up to 4 assets (`public-gallery-hero.tsx`
  `CoverSlideshow` ~233-270). Cover editor already has a `slideshow` media mode.
- Lightbox has fullscreen (native Fullscreen API + 2.2s chrome auto-hide), keyboard nav,
  filmstrip — but **no auto-advance** (`photo-lightbox.tsx` ~211-307).
- Public images use WebP variants (`thumb_lg_webp`/`display_webp`) via
  `getStorageBackedUrl()` (`lib/dashboard-ui.ts`); gated galleries append `?gs=<session>`.
- **Zero audio infra**: no upload, storage, playback, or model field. Only an unrelated
  tethering-feedback `AudioContext`.

### Work — Audio (new)
**Data:** `galleries.music_asset_id UUID NULL` (migration 142), referencing an `assets` row.

**Upload (backend) — reuse the real asset-ingest path (no bypass):**
- New endpoint `POST /api/v1/galleries/{id}/music` (multipart) that routes the bytes through
  the **same asset-ingest + storage-accounting code** a normal photo upload uses, so:
  - audio is stored in the workspace's managed **B2** gallery storage via the `s3` driver;
  - **the file size counts against the workspace's allocated quota** — the pre-upload quota
    check (plan limit) runs and over-limit uploads are rejected with the standard error;
  - `workspace_storage` usage is incremented on upload and decremented on delete, exactly like
    images (never mocked).
  Then set `galleries.music_asset_id` to the created asset's id.
- **Validate**: allowed types (`audio/mpeg`, `audio/mp4`/m4a, `audio/aac`), max size
  (e.g. 15 MB), workspace ownership.
- **Guard the derivative pipeline**: ensure WebP/thumbnail generation does **not** run for
  audio (skip when `content_type` is not `image/*`). Verify in `processing_pipeline.go`.
- `DELETE …/music` clears `music_asset_id` and removes the asset through the real delete path
  so the freed bytes are returned to the workspace quota.

**Serve (backend):** `GET /api/v1/public/galleries/{slug}/music` streams audio bytes
(`Content-Type` + `Accept-Ranges` for seeking), mirroring the logo-stream auth model — public
for open galleries, session-gated (`?gs=`) for private ones. Never expose the B2 URL.

### Work — Frontend
**Settings/cover:** in the cover editor's Media/Brand area, when media mode = slideshow, add an
**audio uploader** (upload/replace/remove track, show filename) + slideshow options
(interval 3–8s, transition, "autoplay on open", "loop music") persisted in design_config.

**New `frontend/src/components/gallery/gallery-slideshow.tsx`:**
- Fullscreen autoplay over **all** gallery photos (extends, doesn't replace, the lightbox):
  timer-based auto-advance (interval from config), Ken-Burns/cross-fade optional, preload
  next image, pause on user interaction.
- Controls via `GlassIconButton`: Play/Pause, Prev/Next, mute/volume, fullscreen
  (`Expand`/`Compress` exist), exit. Keyboard: Space=play/pause, ←/→=nav, M=mute, Esc=exit.
- `<audio>` element wired to `music_asset_id` serve URL; loop; volume slider; **muted-autoplay
  fallback** (browsers block autoplay-with-sound until a user gesture — start muted or require a
  one-tap "Play with music" affordance).
- Launch from a "Play slideshow" `GlassIconButton` in the public hero/grid.

**Icons** (`frontend/src/components/icons/index.tsx`) — add following the existing pattern:
`Play`, `Pause`, `Music`, `Volume`, `VolumeOff`. (`Replay`, `Expand`, `Compress`, `ChevronLeft/Right` already exist.)

### Test-first (write these as RED before the work above)
- Backend: upload validation (type/size/ownership), audio bypasses WebP pipeline, serve streams
  + range header, private-gallery gating, delete clears reference.
- Frontend vitest: slideshow advance timer, play/pause, mute, autoplay-blocked fallback, exit.
- E2E (Docker playwright, `tests/photos/`): open public gallery → start slideshow → auto-advances
  → controls respond. Audio assertion limited (headless autoplay) — assert element wiring/attrs.

---

## 7. Sequencing

Largely parallelisable across one backend + one frontend track. Suggested order by ROI:

1. **Expiry UI** (S) — quick win; backend already enforces. Ship first.
2. **Logo/brand gap-closure + CSS-var refactor** (S/M) — unblocks branded emails *and* improves
   the public gallery; do the CSS-var/accent-resolution piece before email templating so both
   reuse one accent-resolution source.
3. **Branded email automation** (L) — depends on branding/logo URL (done) + template layer.
   Migration 143 + worker + publish-hook + settings toggle.
4. **Slideshow with music** (L) — independent; migration 142 + audio upload/serve + player.
   Largest net-new surface; can run in parallel with (3) on the frontend track.

Each feature ships behind its own settings so it's independently releasable; no big-bang.

---

## 8. Pre-Implementation Verification Items

Resolve these before coding the affected feature (cheap reads, avoid rework):

1. **Asset pipeline gate for audio** — confirm `processing_pipeline.go` only enqueues
   WebP/derivative work for `image/*`; if not, add the guard (Feature 4 blocker).
2. **`assets` table accepts non-image content types** cleanly (it already serves the logo image;
   confirm audio `content_type` + size columns are unconstrained).
3. **Recipient source** — confirm contacts table exposes a client email reachable from
   `galleries.primary_contact_id`/`contact_id` (Feature 3).
4. **Publish transition hook point** — confirm the exact place in `gallery_handler.go` Update
   where `is_published` flips false→true, to enqueue email events idempotently.
5. **Workspace branding dashboard UI** — confirm whether a settings screen already drives
   `PUT /workspaces/current/profile`; build only if missing (Feature 2d).
6. **Tier gating** — branded emails + branding render are tier-gated (pro/enterprise/studio).
   Decide whether expiry + slideshow are all-tier or gated.

---

## 9. Test & Quality Gates (per task)

- **TDD definition of done**: the behaviour was demonstrated RED before it went GREEN, the
  failing-then-passing test is committed, and the full suite is green after refactor. A task with
  production code but no preceding failing test is not done — it is unverified.
- `npm run test:backend` (go test ./...), `npm run test:frontend` (vitest), `npm run lint`,
  `(cd backend && go vet ./...)`.
- New migrations get assertions in `m*_migrations_test.go`; never edit committed migrations.
- E2E via the Docker `playwright` service, auth injected (no UI login), assets from `tests/photos/`.
- Email verified against **Mailpit** in dev.
- Confirm token-only colors, ≥44px touch targets, `focusRing` tokens, and all three themes
  (`liquid-glass`, `liquid-glass-dark`, `midnight`) render correctly for every new UI surface.
