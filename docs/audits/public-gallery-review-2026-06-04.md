# Public Gallery Review — Design System, UX, and Competitive Gaps

**Date:** 2026-06-04 · **Scope:** `/g/[slug]/**`, `/s/[shortcode]/**`, `src/components/gallery/**` (lightbox, grid, hero, gates, share, compare, video, watermark) · **Competitors researched:** Pixieset, Pic-Time 2.0, ShootProof, CloudSpot, Zenfolio, SmugMug, Kwikpic, Premagic

---

## 0. Answer to "are these icons part of the central design system?"

**Mostly yes — with three deviations that cause the inconsistency in the screenshot.**

The lightbox toolbar (`photo-lightbox.tsx:597-730`) correctly uses `GlassIconButton` with icons from the central registry (ZoomIn/ZoomOut, Star, Download, Share, Expand/Compress, XMark — all 24×24, 1.5 stroke). The deviations:

1. **The heavy blue ring** on the highlighted button is the 3px token focus ring (`:focus-visible` outline, `--border-focus`) and/or the `--active` toggle state. After the logo-palette change the focus ring is bright cyan on media, so it reads much louder than the other buttons. The *active* state (`.glass-icon-button--active`) is intentionally subtle; the *focus ring* persisting after a tap is the likely visual bug — some browsers keep `:focus-visible` after touch on toggled buttons. Fix: keep the WCAG ring for keyboard, but use the quieter `--accent` variant styling for the toggled-on state so an active toggle isn't presented as a giant ring.
2. **Delete button bypasses the system** (`photo-lightbox.tsx:696-704`): hardcoded `ring-2 ring-feedback-error/30 bg-feedback-error ...` overrides instead of `variant="danger"`. This is the one true violation in the toolbar.
3. **All toolbar buttons are `size="sm"` (36px)** — below the system's own 44px Apple/WCAG target. On a photo-viewer toolbar this is the difference between "feels iOS" and "feels cramped."

---

## 1. Design-system compliance issues (with fixes)

1. Delete button ad-hoc classes in `photo-lightbox.tsx:696-704` → use `variant="danger"`. **(P1)**
2. Toolbar `size="sm"` (36px) for primary actions → `size="md"` (44px) for Download, Share, Close at minimum; keep `sm` only inside dense secondary clusters. **(P1)**
3. Active-toggle vs focus-ring confusion (screenshot) → style toggled-on via accent variant; verify `:focus-visible` doesn't stick after touch. **(P1)**
4. Inline ad-hoc SVGs instead of registry icons: `g/[slug]/page.tsx:52-81` (clock, photo), `gallery-password-gate.tsx:80-92` (lock), `share-pin-gate.tsx:130-140` (lock), `gallery-expiry-banner.tsx:80-93` (clock) → import `Clock`, `Photo`, `Lock` from `@/components/icons`. (Watermark/face-boxes/QR SVGs are procedural — acceptable.) **(P2)**
5. ~25 raw color classes in gallery components: `bg-accent text-white` (comment-thread:94, consent-banner:293, password-gate:85, gallery-canvas:232, embedded-videos-panel:212), `bg-black`/`text-black` (compare-mode:73,119, embedded-videos-panel:245, video-player:225), `bg-white` (map-view:165), `text-white` (watermark-overlay:138), and 7 instances in tethered-shooting-panel → replace with `text-text-inverse`, `bg-surface-scrim-strong`, `text-text-media`, `bg-surface-elevated`. **(P2)**
6. No focus trap in the lightbox modal — keyboard focus can tab to content behind it. Add a focus scope (the new shared `Dialog` already restores focus; extract its pattern or add a trap hook). **(P1, also a11y bug)**

## 2. Bugs / issues

1. **No `srcset`/`sizes` on grid images** — mobile downloads desktop-size `display_webp` instead of `thumb_md_webp`. Biggest performance bug on the page; you already generate the derivative sizes. **(P0 for mobile data cost in India)**
2. **No focus trap** in lightbox (see above). **(P1)**
3. **No `og:image`** in gallery metadata — shared links (WhatsApp especially) show no cover preview. Add cover image OG + Twitter card. **(P1 — direct sharing-conversion impact)**
4. No canonical URL on gallery/photo routes → duplicate-content variants from share params. **(P2)**
5. No JSON-LD structured data (`ImageGallery`) for public galleries. **(P3)**
6. Embedded-videos panel has no loading skeleton during iframe load. **(P3)**
7. Empty-gallery (0 photos) state untested/unstyled — verify it doesn't render a bare grid. **(P2)**
8. Map view component exists but is disabled on the public page (intentional per 2026-05-19 note) — dead code path to either ship or remove. **(P3)**

What's already solid: lazy loading + async decode, incremental rendering (60-photo batches), pinch-zoom/swipe gestures, scroll restoration, deep links, extensive keyboard shortcuts, expired/404 states, encrypted media, three-theme support.

## 3. Improvements / enhancements (product-level)

1. **Responsive image pipeline** — `srcset` with `thumb_sm/md/lg_webp` + `sizes` per layout column count (pairs with bug #1).
2. **Toolbar grouping** — iOS-26 style: cluster zoom controls into one segmented glass pill, separate "actions" (download/share) from "modes" (compare/info/faces) so the toolbar reads as 3 groups, not 9 equal buttons.
3. **Slideshow upgrade** — auto-advance exists; add music (licensed tracks or studio-uploaded), crossfade with `--easing-spring`, and a visible slideshow button on the gallery hero (competitors surface it prominently).
4. **Favorites list view** — a "My favorites (n)" pill that opens a filtered grid and supports download-favorites-as-zip and share-favorites-link (Pixieset/CloudSpot standard).
5. **Guest email capture** (optional per gallery) — every Western competitor funnels gallery visitors into the photographer's CRM; RawDrive has the CRM but doesn't capture gallery guests.
6. **One-tap social share row** in share dialog — WhatsApp first (India), then Instagram/Facebook/Pinterest; currently only native-share/copy.
7. **Per-photo retouch comments tied to proofing** — comments exist; connect them to the select/approve/reject flow so "approve with note" is one action (ShootProof's differentiator).
8. **Add-to-home-screen client experience** — you have a PWA already; offer a per-gallery branded install prompt ("Your wedding gallery as an app") like ShootProof/CloudSpot client apps.
9. **OG-rich share cards** — cover image + couple names + studio brand on every shared link (with #3 above).

## 4. Competitor gap analysis

### 4a. Table-stakes we're missing (most competitors have, we don't)
1. **In-gallery store / print commerce with fulfillment** — product tiles exist but cart/checkout is skeleton; Pixieset, Pic-Time, ShootProof, Zenfolio, SmugMug, CloudSpot all monetize the gallery directly.
2. **Guest email capture at gallery entry** (Pixieset Email Registration, CloudSpot Email Capture, Zenfolio email-tied favorites).
3. **Favorites export/share as its own gallery/zip** (Pixieset, CloudSpot, SmugMug).
4. **Prominent slideshow entry point** on the gallery cover (Pixieset, ShootProof, CloudSpot, Pic-Time).
5. **One-tap social sharing incl. WhatsApp** (Pixieset added platform-wide Aug 2025).
6. **Branded client mobile-app deliverable** (ShootProof, CloudSpot; PWA install prompt gets us 90% there).

### 4b. Differentiators worth adopting (1–2 competitors have)
1. **AI selfie search is going mainstream** — Pic-Time Face Scan (Nov 2025) + Zenfolio Face Finder (Oct 2025). **RawDrive already has FaceID gate + face match — we're ahead of 4 of 6 Western players; polish and market it.** Add combined face + keyword search ("bride dancing") like Pic-Time.
2. **WhatsApp push delivery of face-matched personal galleries** (Premagic's signature; Kwikpic via QR/app) — the defining India-market feature; no Western platform has it. Highest-leverage gap for rawdrive.in.
3. **Client Collections** — guest-created named sub-galleries beyond favorites (Pic-Time 2.0 only).
4. **Gallery-expiry marketing automation** — reminder emails + auto-coupons before expiry (Pic-Time); we have expiry + banner, no automation.
5. **Slideshow with licensed music, beat-matching, vertical reel export, purchasable slideshow** (Pic-Time).
6. **SMS delivery + passwordless magic links** (Zenfolio, June 2026).
7. **Guest upload with moderation** — attendees contribute photos (SmugMug only).
8. **Wall-art/room preview with client's own photo** (Pixieset).
9. **Per-guest private auto-favorites gallery for events** (SmugMug Events).
10. **Selfie liveness detection** on face-gated galleries (Kwikpic) — natural hardening of our existing FaceID gate.
11. **Sponsor monetization in event galleries** — watermark/ads/branded landing with engagement metrics (Premagic, Kwikpic Premium) — relevant to RawDrive's event/dealer segment.

### 4c. Strategic read
- AI selfie search crossed into mainstream proofing galleries in late 2025 → it will be table-stakes by 2027. RawDrive already has the hard part built.
- Pic-Time 2.0 (Apr 2026) is the UX bar: cinematic covers, collections, music slideshows, expiry commerce automation.
- For India: **WhatsApp delivery + QR-selfie onboarding + face-matched personal galleries** is the wedge no Western incumbent offers — and RawDrive has 2 of the 3 pieces (face match, QR) already.

---

*Sources for competitor claims: Pixieset blog/help (Aug 2025 update, store, room preview), Pic-Time blog (2.0 launch Apr 2026, Face Scan Nov 2025, expiry automations), ShootProof features/help (mobile apps, order comments, activity), CloudSpot help (email capture, client apps), Zenfolio blog (Face Finder Oct 2025, SMS/magic link Jun 2026), SmugMug help (Events, guest upload, client downloads), kwikpic.in, premagic.com. Full URLs in research notes.*
