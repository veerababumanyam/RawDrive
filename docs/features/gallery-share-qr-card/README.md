# Feature: Share & QR card on the gallery publish surface

**Issue:** #118 · **Branch:** `feature/gallery-share-qr-card-20260604` · **Type:** `feat(galleries)` ·
**Scope:** frontend-only (no API / migration / `openapi.yaml` change).

## Problem

When a photographer publishes a gallery, RawDrive generates the public slug URL. A QR code for that
URL already existed — but only on the **secondary** `/galleries/[id]/preview` page (the `ShareQrPopover`
chip in `PreviewChrome`), and its only download was a **224 px PNG** (too low-resolution for the
"print package" its own comment targets). Non-technical photographers rarely found it, and couldn't
get a print-quality file.

> **Anti-duplication note:** this is an **EXTEND**, not a new feature. We reuse the installed `qrcode`
> dependency and the `qrCode` design tokens. The orphan `gallery-share-center.tsx` and the dead,
> non-spec hand-rolled `share-dialog.tsx` SVG encoder were deliberately **not** revived.

## What shipped

1. **`frontend/src/lib/qr.ts`** — a shared, tested QR helper over the real `qrcode` lib + the
   `components.qrCode` design tokens (fixed high-contrast black-on-white for scanner reliability across
   all three themes). Entry points: `renderQrToCanvas` (preview), `qrPngDataUrl`/`downloadQrPng`
   (**2048 px print PNG**), `qrSvgString`/`downloadQrSvg` (**true vector SVG** via `qrcode.toString`).
   Error-correction level **H**.
2. **`frontend/src/components/gallery/gallery-share-qr-card.tsx`** — an always-visible "Share & QR"
   card: the QR, a clean copyable public address, and **Download QR (PNG) / SVG (vector)**. Token-pure,
   three themes, WCAG 2.2 AA, `GlassIconButton` + icons from `@/components/icons`, SSR/hydration-safe
   client URL read via `useSyncExternalStore`.
3. **Wiring in `galleries/[id]/page.tsx`** — rendered under the header, gated on `gallery.is_published`,
   encoding `buildShareUrl()` (the durable public URL, including the `#rd_key` E2E fragment when present
   — parity with the existing Copy/Share actions). Scanning the QR opens the gallery.

## Design decisions (user-approved at the plan gate)

- **Placement:** an always-visible inline card on the main gallery page (not a popover, not the preview
  page) so non-technical photographers find it the moment they publish.
- **Download formats:** high-res PNG (print/WhatsApp) **+** vector SVG (infinite-scale print/signage).
- The displayed address strips the protocol and `#rd_key` fragment for tidiness; the QR and Copy
  encode the **full** key-bearing URL so the link actually opens the (E2E-encrypted) gallery.

## Coverage table

| Element | Status | Notes |
|---|---|---|
| Card UI · 3 themes · WCAG AA · ≥44px · focus rings | ✅ IN SCOPE | token-pure, `GlassIconButton`, `@/components/icons` |
| High-res PNG (2048px) + vector SVG download | ✅ IN SCOPE | `lib/qr.ts` (ECC H) |
| QR encodes the canonical published URL; scan opens it | ✅ IN SCOPE | `buildShareUrl()`, gated on `is_published` |
| Encrypted-media `#rd_key` parity | ✅ IN SCOPE (note) | same URL the Copy action uses; owner-only, published-only — no new exposure |
| Unavailable / error states | ✅ IN SCOPE | publish CTA when no URL; `role="alert"` on render/download failure |
| Backend / API / openapi / migration / workers / events / notifications | N/A | frontend-only; no new endpoint |
| Route / IA / guards | N/A | lives on existing `/galleries/[id]`, gated on publish |
| Analytics / audit log | N/A | client-side download of an already-public URL; no security-relevant state change |
| i18n | N/A | app is English-only (no i18n framework) |

## Verification (this session, local)

- `pnpm -C frontend lint` — **clean** (incl. React-Compiler `react-hooks/*` rules; pre-commit
  design-token guard passed).
- `pnpm -C frontend build` (type gate) — **passed**.
- `pnpm -C frontend test` — **1153 passed, 2 skipped** (pre-existing quarantine), 0 failed; the
  10 new tests (`lib/qr.test.ts`, `gallery-share-qr-card.test.tsx`) pass.
- Independent SCS gate-review of the diff — **PASS** (real behavior, tokens, purity, no XSS, no rule
  weakened, `#rd_key` parity confirmed).
- **Not run this session:** live browser smoke / Playwright E2E (needs the full stack + a published
  gallery + auth injection). The QR canvas path is already proven in production
  (`share-qr-popover.tsx`, `InviteGenerator.tsx`, `settings/profile/.../live-preview.tsx`).

## Follow-up (out of scope, noted)

- `share-qr-popover.tsx` (preview page) has the same low-res-PNG defect and imports icons from
  `lucide-react`. It could be migrated onto `lib/qr.ts` in a fast-follow for consistent quality
  everywhere.
