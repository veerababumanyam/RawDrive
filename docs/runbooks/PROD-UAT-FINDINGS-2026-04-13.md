# Production UAT Findings — 2026-04-13

**Scope:** Post-deploy verification of `main@abbbbb6` on Hostinger production
(app1 `.42`, app2 `.44`, db `.46`). Executed against `https://rawdrive.in` and
`https://api.rawdrive.in` using the 17 seeded UAT accounts.

**Verdict:** Deploy is live and healthy, but UAT surfaced one **P0 authorization
regression** and several P2 cleanup items. Production should stay up — the P0 is
read-mostly data exposure, not a crash or data-loss path — but the fix should
land before any wider announcement.

---

## P0 — Privilege escalation: every authenticated user can read admin endpoints

### Evidence

Logged in as `client.wed@rawdrive.test` (platform role = `client`, a regular
gallery-viewing customer) and received `HTTP 200` with real data from:

| Endpoint | Data returned |
|---|---|
| `GET /api/v1/admin/dealers` | Full dealer roster incl. `business_name`, `pan_number`, `gstin`, approval metadata |
| `GET /api/v1/admin/coupons` | Every platform + dealer coupon with codes, discount values, redemption counts, `dealer_id` linkage |
| `GET /api/v1/admin/margins` | 200 (empty body, but route reached past auth gate) |

The same holds for the `photographer` and `dealer` roles — any non-admin token
bypasses the gate.

### Root cause

`backend/internal/handler/routes_m6.go:14-28` defines a local `requireAdmin`
middleware that reads the **workspace role** (`claims["role"]`) instead of the
**platform role** (`claims["platform_role"]`):

```go
role, _ := claims["role"].(string)
if role != "Admin" && role != "Owner" && role != "super_admin" { ... }
```

Every user is `Owner` of their own workspace. A freshly registered client's JWT
is `{"platform_role":"client", "role":"Owner", ...}`. The check passes because
`role == "Owner"`.

This directly violates the CLAUDE.md / AGENTS.md rule:

> **Platform roles (M7.5):** Two-tier model. Use `RequirePlatformRole`
> middleware; see `backend/seeds/` for test users.

The correct middleware already exists at
`backend/internal/middleware/middleware.go:243` — `RequirePlatformRole(roles
...string)` — and correctly inspects `platform_role`. It is simply not wired
into the M6 admin routes.

### Affected routes

All mounted inside `RegisterM6Routes` (`backend/internal/handler/routes_m6.go`):

- `/api/v1/admin/dealers` (GET list, POST create, PUT approve/reject/suspend)
- `/api/v1/admin/margins` (GET list, GET history, PUT configure)
- `/api/v1/admin/coupons` (GET list, POST create)
- `/api/v1/admin/payouts` (POST approve, POST confirm-payment)
- `/api/v1/admin/kyc-documents` (PATCH review)

**Note on payouts:** `GET /api/v1/admin/payouts` returned 404 during UAT only
because no index route is defined — the gate itself is still broken. The mutating
POST routes are wide open to any authenticated user.

### Blast radius

- **Reads (data exposure):** dealer PII (PAN, GST, bank details when present),
  commission rates, full coupon economics, KYC doc references. A logged-in
  client can enumerate the entire dealer network and its business terms.
- **Writes (privilege escalation):** any authenticated user can
  - approve / reject / suspend dealers
  - create admin-owned coupons
  - configure margin tables
  - approve + confirm dealer payouts
  - patch KYC document review status

Writes are the more serious half. A hostile client-tier account can mint
platform-wide coupons or mark a dealer payout "paid" without actually paying.

### Fix

Two edits. Both land in `backend/internal/handler/routes_m6.go`:

1. **Delete** the `requireAdmin` function (lines 13-28).
2. **Swap** every `r.Use(requireAdmin)` for
   `r.Use(middleware.RequirePlatformRole("admin", "super_admin"))`.

```go
// before
r.Route("/api/v1/admin/dealers", func(r chi.Router) {
    r.Use(requireAdmin)
    ...
})

// after
r.Route("/api/v1/admin/dealers", func(r chi.Router) {
    r.Use(middleware.RequirePlatformRole("admin", "super_admin"))
    ...
})
```

Apply to all five `/api/v1/admin/*` route groups. No other call sites reference
`requireAdmin`.

### Verification plan (post-fix)

1. Re-run the login sweep script against prod.
2. Hit each admin endpoint with `client.wed` token → expect 403.
3. Hit each admin endpoint with `admin@rawdrive.test` token → expect 200.
4. Add a regression test in `backend/internal/handler/routes_m6_test.go`
   (or extend the existing M6 route table tests) that asserts
   403 for a photographer/client JWT and 200 for an admin JWT against each
   `/api/v1/admin/*` path.

### Suggested audit follow-up

Grep the whole handler package for other uses of `claims["role"]` that might be
making the same mistake:

```bash
grep -rn 'claims\[.role.\]' backend/internal/handler backend/cmd
```

Any match that is not paired with a workspace-scoped check is almost certainly
the same bug.

---

## P2 — UAT accounts missing onboarding

### Evidence

`uat.new.pho.002@rawdrive.test` authenticates successfully but its JWT carries
`workspace_id=pending-...` instead of a real UUID. The credential table notes
"Created during UAT" — onboarding was never completed.

### Impact

Any feature guard that keys off `workspace_id` will either 404 or silently run
against the literal `pending-...` string. Low-severity because the account
is a test fixture, but it will trip future UAT runs.

### Fix

Either complete onboarding for this account in seeds, or delete it and document
the seed set as 16 accounts instead of 17.

---

## P3 — Cosmetic: bare mount paths return 404

### Evidence

`GET` on the following returns `404 page not found` instead of an index or a
405:

- `/api/v1/dashboard` (but `/dashboard/gallery-activity` is 200)
- `/api/v1/albums`, `/api/v1/calendar`, `/api/v1/billing`, `/api/v1/messages`,
  `/api/v1/reports`

### Impact

None functionally — sub-routes work and the frontend only calls sub-routes. But
it makes smoke-test scripts noisier than necessary and suggests missing index
handlers.

### Fix

Either add an index handler per mount point returning a small JSON capability
descriptor, or leave as-is and document the pattern.

---

## Context inventory (what is known-good on prod)

Captured during UAT so the next engineer can skip the happy-path reprobes:

### Infrastructure (no change since DEPLOYMENT-2026-04-11.md)

- All three nodes HEALTHY after rolling deploy of `main@abbbbb6`
- `https://rawdrive.in/`, `/login`, `/pricing` all 200
- `https://api.rawdrive.in/health` returns `{"status":"ok"}`
- `GET /api/v1/states` returns the 36-state list from pgbouncer → postgres
- Migrate one-shot re-ran idempotently on both app nodes; no migration errors

### Login sweep (all 17 accounts → HTTP 200, MFA not enforced)

| Account | platform_role | workspace_id |
|---|---|---|
| superadmin@rawdrive.test | super_admin | 89cc3a0b… |
| super@rawdrive.test | super_admin | c7396396… |
| admin@rawdrive.test | admin | a83f9391… |
| mod@rawdrive.test | admin | 7ec5e8c5… |
| ops@rawdrive.test | admin | 36351fe1… |
| pho.pro@rawdrive.test | photographer | eef9ca0f… |
| pho.starter@rawdrive.test | photographer | 0d8b6066… |
| pho.biz@rawdrive.test | photographer | f15dd596… |
| pho.trial@rawdrive.test | photographer | 564c4cc4… |
| pho.hold@rawdrive.test | photographer | 294ac7ac… |
| team.lead@rawdrive.test | photographer | 42d36d32… |
| photographer@rawdrive.test | photographer | 076be74d… |
| uat.new.pho.002@rawdrive.test | photographer | pending-… (see P2) |
| dealer.tg@rawdrive.test | dealer | 806e03c6… |
| dealer.mh@rawdrive.test | dealer | a1608efe… |
| dealer@rawdrive.test | dealer | 7827f4a6… |
| client.wed@rawdrive.test | client | ef67c452… |

### Authenticated surface verified (as `pho.pro`)

- `GET /api/v1/galleries` → real gallery list
- `GET /api/v1/galleries/{id}` → real gallery
- `GET /api/v1/galleries/{id}/assets` → real asset rows
- `GET /api/v1/galleries/{id}/proofing` → real proofing data (**M38 surface**)
- `GET /api/v1/galleries/{id}/ai-suggest` → real theme suggestions (**M38 surface**)
- `GET /api/v1/crm/contacts`, `GET /api/v1/crm/leads` → real data
- `GET /api/v1/workspaces/current/profile`, `/api/v1/workspaces/current/plan`
- `GET /api/v1/users/profile`
- `GET /api/v1/storage/usage` — quota/used bytes correct
- `GET /api/v1/notifications` → real rows
- `GET /api/v1/streams`, `GET /api/v1/videos`
- `GET /api/v1/marketplace/freelancers`, `/gear`, `/hire-requests`, `/inquiries`
- `GET /api/v1/design-templates`, `GET /api/v1/desktop/download`
- `GET /api/v1/dashboard/gallery-activity`

### Dealer / client role probes

- Dealer can reach `GET /api/v1/dealer/analytics` → 200 (correct)
- Client cannot reach `GET /api/v1/dealer/analytics` → 404 (correct — not wired)

### Known P0s still unfixed from bootstrap (out of UAT scope)

Per `docs/runbooks/BOOTSTRAP-KNOWN-ISSUES.md`:

- Cloudflare R2 API key → dead (no nightly backups land)
- Cloudflare Zone API token → dead (no orange-cloud, no DNS-01 renewal)
- SMTP creds → suspected dead (registration hangs 60s)

User has declined to rotate these until app-level fixes are in. Noted, not
blocking UAT.

---

## Fix priority order

1. **P0 auth regression** — FIXED in `backend/internal/handler/routes_m6.go`.
   Local `requireAdmin` deleted, all five `/api/v1/admin/*` route groups now
   gate on `middleware.RequirePlatformRole("admin", "super_admin")`. Regression
   test: `routes_m6_auth_test.go::TestM6AdminRoutes_PlatformRoleGate`. Redeploy
   then re-run the UAT login sweep to confirm 403 for the client token.
2. **P2 onboarding fixture** — Cleanup script written:
   `deploy/scripts/cleanup-uat-pending-fixture.sql`. Run it on the prod DB to
   delete `uat.new.pho.002@rawdrive.test`. After it runs the documented UAT
   account count drops from 17 to 16.
3. **P3 mount-path 404s** — FIXED. Added `r.Get("/", capabilityIndex(...))` to
   dashboard, albums, calendar, billing, messages, and reports. Helper lives
   in `backend/internal/handler/capability_index.go`.
4. **Unrelated P0 credential rotation** — do when you decide to tackle the
   backup + email paths. UAT does not cover these.

---

*Captured during UAT session on 2026-04-13 against `main@abbbbb6`.*
