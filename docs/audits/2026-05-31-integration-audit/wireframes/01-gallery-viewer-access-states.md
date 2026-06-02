# Wireframe — Gallery Viewer Access States (S4-G1/G2/G3)

Low-fidelity wireframes for the public gallery viewer (`/g/[slug]`) across every
access state the backend Wave 4 delivery gate can produce. Frontend wiring:
`frontend/src/app/g/[slug]/page.tsx`, `gallery-password-gate.tsx`,
`share-pin-gate.tsx`, `gallery-locked-shell.tsx`, `public-gallery-grid.tsx`.

## Backend contract recap (what drives each state)

`GET /api/v1/public/galleries/{slug}` returns:
- **Full payload** — published, non-expired, open (or session-holder).
- **Locked shell** — `{ id, title, access_mode, access_gated: true, has_password }`
  for `private` / `invite-only` without a valid session.
- **410 + `{ expired: true }`** — past `expires_at`.
- `settings.has_password` flags a password gate.

Protected bytes (`/storage/*`) require a gallery-session token. Because
`/storage/*` is NOT proxied by the Next rewrites, the `<img>` request is
cross-origin and the `SameSite=Strict` `gallery_session` cookie does NOT ride
it — so the session token is appended as **`?gs=<token>`** (storage proxy reads
header OR cookie OR `?gs=`/`?gallery_session=`). Open-gallery thumbnails serve
anonymously; only gated galleries need `?gs=`.

## Three-theme + a11y notes (apply to every state)

- Tokens only: `bg-surface`, `surface-panel`, `bg-surface-sunken`,
  `text-text-primary/secondary/tertiary`, `text-text-inverse`,
  `bg-accent-primary`, `text-error`, `border-default`, `border-focus`,
  `feedback-warning`. Renders identically across `liquid-glass`,
  `liquid-glass-dark`, `midnight` — no theme-specific overrides; theme resolves
  via the central init script (route is never forced to a theme).
- All inputs/buttons ≥ 44px (`min-h-[var(--touch-target-min)]`); focus ring is
  `focus-visible:ring-2 focus-visible:ring-border-focus`.
- Gate/locked panels: `role="alert"` on errors, `aria-label` on the PIN/password
  input, `autoFocus` on the field.

---

## State A — Open gallery (public / unlisted, no password)

Full payload, anonymous bytes, no `?gs=`.

```
┌──────────────────────────────────────────────────────────┐
│  [studio logo / brand]                          (theme ⏾) │
│  ─────────────────── HERO (cover) ─────────────────────── │
│   Wedding — Veera & Anaya                                  │
│   320 photos · Delivered 30 May 2026                       │
├──────────────────────────────────────────────────────────┤
│  [All Photos 320] [Ceremony 80] [Reception 110] …  chips   │
├──────────────────────────────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐   thumbnails serve from       │
│  │img │ │img │ │img │ │img │   /storage/thumbnails/* with   │
│  └────┘ └────┘ └────┘ └────┘   NO ?gs= (public bytes)       │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                               │
│  └────┘ └────┘ └────┘ └────┘                               │
│              [ Load more ]                                 │
└──────────────────────────────────────────────────────────┘
```

## State B — Password gate (`settings.has_password === true`, no session)

`GalleryPasswordGate`. On success: `POST /verify-password` → token →
`sessionStorage[gallery_session_<slug>]` + readable cookie → page reloads with
cookie → full payload + `gallerySessionToken` flows to grid (images carry `?gs=`).

```
        ┌──────────────────────────────────┐
        │           surface-panel          │
        │              [ 🔒 ]               │   ← bg-surface-sunken tile
        │            STUDIO NAME            │   text-tertiary, tracking
        │     This gallery is protected     │   text-primary (h1)
        │  Enter the password to view photos│   text-secondary
        │                                   │
        │  ┌─────────────────────────────┐  │   input-base, center,
        │  │  • • • • • • • •            │  │   aria-label, autoFocus
        │  └─────────────────────────────┘  │
        │  (Incorrect password)  ← text-error role=alert (on fail)
        │  ┌─────────────────────────────┐  │   bg-accent-primary,
        │  │        Enter Gallery        │  │   text-inverse, ≥44px,
        │  └─────────────────────────────┘  │   ring-border-focus
        └──────────────────────────────────┘
```
States: idle · submitting ("Verifying…", disabled) · error (text-error) ·
429 ("Too many attempts. Please wait a few minutes.") · success → reload.

## State C — Share-PIN gate (`?share=<token>`, locked shell, no session)

`SharePinGate`. Entering the PIN hits
`GET /api/v1/public/galleries/{slug}?share=<token>&pin=<pin>` **same-origin via
the Next `/api/v1` rewrite**, so the API sets the `gallery_session` cookie on the
page origin and echoes the minted token in the `X-Gallery-Session` response
header (readable same-origin). We store it in `sessionStorage` (for the `?gs=`
image channel), strip the `share`/`pin` params, and reload.

```
        ┌──────────────────────────────────┐
        │           surface-panel          │
        │              [ 🔒 ]               │
        │            STUDIO NAME            │
        │       Enter your access PIN       │   text-primary (h1)
        │ This gallery link is protected …  │   text-secondary
        │  ┌─────────────────────────────┐  │   inputMode=numeric,
        │  │   _ _ _ _ _ _   (tracked)   │  │   autoComplete=one-time-code
        │  └─────────────────────────────┘  │
        │  (Incorrect PIN…) ← text-error role=alert
        │  ┌─────────────────────────────┐  │   bg-accent-primary, ≥44px
        │  │        View Gallery         │  │   ring-border-focus
        │  └─────────────────────────────┘  │
        └──────────────────────────────────┘
```
States: idle · submitting ("Verifying…") · wrong PIN (generic error — never
leaks which failure) · 429 throttled · success → reload (cookie now grants).

## State D — Private / invite-only locked shell (no session, no share token)

`GalleryLockedShell` rendered from `access_gated: true`. NO empty grid — a real
locked state. CTA copy nudges the visitor to use their share/invite link.

```
        ┌──────────────────────────────────┐
        │           surface-panel          │
        │              [ 🔒 ]               │
        │            STUDIO NAME            │
        │   This gallery is private         │   (invite-only variant:
        │   Wedding — Veera & Anaya         │    "This gallery is invite-only")
        │   Open it using the share link    │   text-secondary body
        │   your photographer sent you …    │
        └──────────────────────────────────┘
```
Variants: `private` · `invite-only` (copy differs; both gated).

## State E — Expired gallery (410)

`PublicGalleryUnavailable` (clock icon) / `GalleryLockedShell variant="expired"`.

```
        ┌──────────────────────────────────┐
        │             [ (clock) ]           │   bg-surface-sunken tile
        │      This gallery has expired     │   text-primary (h1)
        │  This gallery is no longer        │   text-secondary
        │  available. Please contact the    │
        │  photographer if you need access. │
        └──────────────────────────────────┘
```

## Image-auth decision (load-bearing)

```
asset bytes requested by <img src=…>
        │
        ├─ open gallery (public/unlisted, no pw) ─→ /storage/thumbnails/* (anon, no ?gs=)
        │
        └─ gated gallery (password / share / private)
                 └─ src = getStorageBackedUrl(key, null, gallerySessionToken)
                          → …/storage/…?gs=<token>   (cross-origin safe; cookie can't ride)
```
