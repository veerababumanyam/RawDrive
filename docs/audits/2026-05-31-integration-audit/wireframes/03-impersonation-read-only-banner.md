# Wireframe — Impersonation Read-Only Banner (S5-G1)

Low-fidelity wireframe for the persistent read-only signal shown during an admin
impersonation session. Frontend wiring:
`frontend/src/components/admin/impersonation-banner.tsx`,
`frontend/src/lib/auth.ts` (`isImpersonatingSession`),
`frontend/src/app/(dashboard)/layout.tsx` (mount),
`frontend/src/app/globals.css` (read-only CSS rule).

## Backend contract recap

Admin impersonation access tokens carry `impersonation: true` (JWT claim;
`backend/internal/auth/auth.go`). The server marks the whole session read-only:
`RejectImpersonationWrites` middleware 403s every mutating HTTP method. Refresh
rotation never sets the flag true (impersonation tokens are non-refreshable).
The frontend reads the claim off the stored access token and surfaces a clear
signal instead of letting the admin hit surprise 403s.

## Behavior

- `isImpersonatingSession()` decodes the `impersonation` claim from the current
  access token. The banner is client-only (token lives in a client cache), so it
  uses the `useSyncExternalStore` mounted pattern (same as `ThemeToggleButton`)
  to avoid SSR hydration mismatch.
- When active, the banner sets `data-impersonation="true"` on `<html>`. A single
  global CSS rule then:
  - shifts the fixed dashboard `header` down by the banner height (both visible);
  - applies `opacity:.5; pointer-events:none; cursor:not-allowed` to any control
    tagged `data-mutation` (e.g. the gallery Publish/Unpublish button), so
    mutating affordances read as unavailable before a click.
- "Exit impersonation" logs out the impersonated session and returns to `/login`
  (where the admin re-auths as themselves) — correct because the token is
  non-refreshable.

## Three-theme + a11y notes

- Tokens only: `bg-feedback-warning/15`, `text-feedback-warning`,
  `text-text-primary/secondary`, `border-default`, `surface-container-high`,
  `border-focus`. Identical across `liquid-glass`, `liquid-glass-dark`,
  `midnight`; no theme-specific overrides; route is never forced to a theme.
- Banner is `role="status" aria-live="polite"` so screen readers announce the
  read-only state on entry.
- "Exit impersonation" is a ≥44px touch target (`min-h-[var(--touch-target-min)]`)
  with `focus-visible:ring-2 focus-visible:ring-border-focus`.
- `z-[60]` keeps it above the fixed header (`z-40`).

---

## State — Active impersonation session (pinned top, full width)

```
┌──────────────────────────────────────────────────────────────────────┐
│ (!) Read-only impersonation session.  You are viewing this account as  │  ← role=status
│     an admin. Changes are disabled.        [ Exit impersonation ]      │     aria-live
└──────────────────────────────────────────────────────────────────────┘   bg-feedback-warning/15
┌────────────┬───────────────────────────────────────────────────────────┐
│            │  [quick-nav]        [ global search ]      [🔔] [avatar ⌄]  │  header pushed
│  SIDEBAR   ├───────────────────────────────────────────────────────────┤  down by banner
│            │                                                             │  height
│  Home      │   Gallery — Veera & Anaya                                   │
│  Projects  │   [Published]  [ Publish/Unpublish ]   ← dimmed + disabled  │  data-mutation →
│  Clients   │                                          (opacity .5,        │  pointer-events:none
│  …         │                                           pointer-events:none)│
│            │   ┌────┐ ┌────┐ ┌────┐   (viewing is fine; editing blocked) │
│            │   └────┘ └────┘ └────┘                                       │
└────────────┴───────────────────────────────────────────────────────────┘
```

## State — Normal session (no impersonation)

Banner returns `null`; `data-impersonation` is absent; no controls dimmed;
header sits at `top-0`. Indistinguishable from today's layout.

```
┌────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR   │  [quick-nav]   [ search ]   [🔔] [avatar ⌄]   (top-0)        │
│            │   Gallery — Veera & Anaya   [Publish] ← normal, clickable   │
└────────────┴───────────────────────────────────────────────────────────┘
```

## Disabling contract (how a surface opts a control out)

```
<button data-mutation onClick={mutate}>Publish</button>
   │
   └─ html[data-impersonation="true"] [data-mutation] {
          opacity: .5; pointer-events: none; cursor: not-allowed;
      }
```
The Publish/Unpublish control on the gallery detail page is tagged as the
reference adoption. Other mutating controls opt in by adding `data-mutation`;
the banner + server-side 403 are the guaranteed backstop regardless of tagging.
```
