# CLAUDE.md — RawDrive Agent Onboarding

> Instruction manual for AI agents working in this repo. Read top-to-bottom before the first tool call. For deep hardcode laws, UI/design token rules, and MCP usage, follow the import to `AGENTS.md`.

@AGENTS.md

---

## 1. WHAT — Project Context

### Identity
- **Name:** `rawdrive` (see `package.json`) — India's premium photography SaaS platform.
- **License:** PROPRIETARY. Do not publish snippets externally.
- **Current version:** tracked in `package.json` and `cobolt-state.json`. Milestone context lives in `docs/TechnicalRequirements/` and `cobolt-state.json`.
- **`README.md` is stale** (claims React 19 + Vite, Go planned). Trust this file, `AGENTS.md`, and the code.

### Tech Stack
- **Backend:** Go — Chi router, JWT, pgvector. Modules in `backend/go.mod`.
- **Frontend:** Next.js 15 + TypeScript 5 + Tailwind v4, pnpm. See `frontend/package.json` and `frontend/AGENTS.md` (mandatory before touching `frontend/`).
- **Data plane:** Postgres 16 + pgvector, Valkey 8, NATS JetStream, Mailpit.
- **Storage:** Backblaze B2 (S3-compatible) is the managed default for ALL tiers. Enterprise can override via BYOS (S3/MinIO/B2).
- **E2E:** Playwright in the `playwright` Docker service, not the Windows host.
- **Package managers:** npm at root (orchestration only), pnpm inside `frontend/`, `go mod` inside `backend/`.

### Repository Map
```
backend/         Go API — cmd/, internal/{handler,service,repository,middleware,auth,streaming,...}
  seeds/         Seeded test users (use these, do not fabricate roles)
  internal/database/migrations/  Versioned SQL migrations, numbered
frontend/        Next.js app — see frontend/AGENTS.md
docs/            PRDs, TRDs, milestone plans, runbooks, carry-forward
e2e/             Playwright specs (run via Docker)
tests/photos/    17 real wedding JPEGs — canonical test assets
infra/           Deployment scripts
_cobolt-docker/  Playwright + tooling compose
design-tokens.json  Single source of truth for all visual styling
cobolt-state.json   Milestone/version state
docker-compose.yml  postgres + valkey + nats + mailpit + playwright
```

---

## 2. WHY — Principles & Rules

These are **load-bearing**. Violations have caused real production bugs. `AGENTS.md` holds the authoritative long-form version; the items below are the hard floor.

### Architectural Invariants
- **Storage:** Backblaze B2 (via the `s3` driver, S3-compatible API) is the managed file storage backend for ALL tiers. `STORAGE_DRIVER=local` must FATAL exit. No local disk, ever. Enterprise tenants may override the managed B2 backend via the BYOS wizard with S3/MinIO/B2 credentials of their own.
- **Credentials:** Never hardcode secrets. Resolution order is `platform_settings` DB table → env var → disable feature with warning. `.env.cobolt` is gitignored.
- **WebP derivatives:** Every image upload MUST generate `thumb_sm_webp`, `thumb_md_webp`, `thumb_lg_webp`, `display_webp` via `cwebp`. Originals preserved for download only.
- **JWT context:** Handlers MUST call `middleware.JWTClaimsFromContext(r.Context())`. Never define a local context-key type — Go matches `(type, value)` and a local type silently fails, returning 401 on every route.
- **Platform roles:** Use `RequirePlatformRole` middleware. Test users come from `backend/seeds/`, not fabricated.
- **Auth primitives are NOT interchangeable:**
  - **Email OTP** → registration-only (`/auth/verify-otp` from `/activate`). Never on login.
  - **TOTP (RFC 6238)** → opt-in login step-up after password. `/auth/login` returns `{mfa_required, mfa_token, challenge:"totp"}`; client calls `/auth/verify-totp`.
  - TOTP secrets are envelope-encrypted with `PLATFORM_SETTINGS_KEK`. Recovery codes are bcrypt-hashed. `mfa_verified` claim preserved across refresh via `refresh_sessions.mfa_verified`.
- **Upload UX:** Lives inside a gallery/sub-gallery/album. No `/upload` route in sidebar nav. A legacy `/upload/page.tsx` may exist but must not be linked.

### UI & Design Tokens
- **`design-tokens.json` is the single source of truth.** Edit it, then run `node tools/cobolt-sync-tokens.js sync` to regenerate `frontend/src/index.css`, `frontend/src/lib/tokens.ts`, `.stitch/DESIGN.md`, `component-registry.json`. Never edit downstream files directly for token values.
- **Never use Tailwind primitive scales** (`bg-neutral-100`, `text-gray-500`, `shadow-lg`) or arbitrary values (`w-[245px]`, `text-[#3B82F6]`). Only semantic token classes.
- **Icon buttons:** Always `GlassIconButton` from `frontend/src/components/ui/glass-icon-button.tsx`. Icons from `frontend/src/components/icons/index.tsx` (SF Symbols, 24×24 viewBox, 1.5px stroke). Required `label` prop. Default size `md` (44px, WCAG touch target).
- **Proofing variants:** Select=`accent`, Approve=`success`, Reject=`danger`.
- **Themes:** three themes (`liquid-glass`, `liquid-glass-dark`, `midnight`). Components must render correctly across all three with no theme-specific overrides. **Never force a route to a specific theme** — theme resolves via OS preference + user toggle through the central init script.

### Naming & Code Style
- **Go:** package-lowercase; exported identifiers PascalCase; unexported camelCase; errors returned, never panicked in request paths; handlers live under `backend/internal/handler`, services under `backend/internal/service`, repos under `backend/internal/repository`.
- **TypeScript/React:** components PascalCase (`GlassIconButton.tsx`); hooks `useXxx` camelCase; variables/functions camelCase; route segments kebab-case; no default exports for components (named exports only, matching existing style in `frontend/src/components`).
- **SQL migrations:** `NNN_feature_name.up.sql` + `NNN_feature_name.down.sql`, numbered sequentially. Never renumber or edit a committed migration — append a new one.
- **Tests:** use `tests/photos/` assets (17 real JPEGs, some with spaces/parens in filenames — tests MUST handle these). Never synthetic images, never external URLs.

### Anti-Patterns (Do Not Do)
- Adding OTP to login, or accepting either OTP or TOTP interchangeably.
- Adding `/upload` to sidebar nav.
- Introducing `<button>` with inline SVG for an icon action.
- Hardcoding API keys, B2 creds, or SMTP creds anywhere in Go or TS.
- Defining a private `contextKey` type in a handler package for JWT claims.
- Editing `frontend/src/index.css` tokens directly instead of `design-tokens.json`.
- Using Tailwind `neutral-*`/`gray-*`/arbitrary `[...]` values.
- Creating E2E tests that log in through the UI (use `storageState` or `addInitScript`).
- Placing `STORAGE_DRIVER=local` fallback paths anywhere.
- Mocking the dashboard storage widget — it reads from `workspace_storage`.
- Showing the BYOS wizard to standard/pro users. The managed-B2 row is read-only for all tiers; the BYOS wizard is enterprise-only and offers AWS S3, MinIO, and Backblaze B2 as override providers.
- Working in sibling `RawDrive*` directories — the active project is **RawDriveCobolt** only.

---

## 3. HOW — Workflows

### Install
```bash
pnpm --dir frontend install
(cd backend && go mod download)
```

### Dev
```bash
docker compose up -d                 # postgres, valkey, nats, mailpit, playwright
pnpm --dir frontend dev              # or: npm run dev
go run ./backend/cmd/api             # backend dev server
```

### Build
```bash
npm run build                        # frontend production build
(cd backend && go build ./...)       # backend compile check
```

### Test
```bash
npm run test                         # backend + frontend
npm run test:backend                 # go test ./... -count=1 -timeout 120s
npm run test:frontend                # vitest
# E2E — runs inside Docker playwright container, not Windows host:
docker compose run --rm playwright npx playwright test
```

### Lint
```bash
npm run lint                         # frontend eslint (pnpm lint inside frontend/)
(cd backend && go vet ./...)
```

### Migrations
- Add paired `NNN_name.up.sql` + `NNN_name.down.sql` under `backend/internal/database/migrations/`.
- Add/extend `m*_migrations_test.go` to cover schema assertions.
- Never edit a committed migration — append a new numbered pair.

### Token Sync
```bash
node tools/cobolt-sync-tokens.js sync   # after editing design-tokens.json
```

### Deploy (Production)
- Hostinger: 3 KVM VPSes (`.42`/`.44` app tier, `.46` db). Full IPs: `187.127.142.42` / `.44` / `.46`.
- **SSH access:** root login uses the dedicated deploy key `~/.ssh/rawdrive_hostinger` (ed25519 fingerprint `SHA256:IJch3VFzuGuz6kk41q/kbPOYPlt9l/rq+AaROpmGZS8`). The deploy scripts default `SSH_KEY` to this path. **Do NOT use `~/.ssh/id_ed25519`** — that is the local GitHub/default identity and is no longer authorized on the nodes. Leave all pre-existing team keys on the nodes in place.
- Host keys for all three nodes are pinned in `deploy/known_hosts` (deploy runs `StrictHostKeyChecking=yes`). If a node is rebuilt, re-verify fingerprints out-of-band before updating that file — never seed blind.
- Rolling deploy via `deploy/scripts/deploy-prod.ps1` — app1 first, then app2.
- Never bypass the script; never deploy directly to `.46`.

### Release
- Version bumps go through `cobolt-release` skill (patch/minor/major). Keeps `package.json`, `cobolt-state.json`, and git tags in sync.

### Pre-Change Checklist (every task)
- [ ] Read `AGENTS.md` (imported above) and `frontend/AGENTS.md` if touching frontend.
- [ ] Read `design-tokens.json` before any UI work.
- [ ] Use `tests/photos/` for any upload/gallery test.
- [ ] Verify CWD = `RawDriveCobolt`, not a sibling directory.
- [ ] For E2E: inject auth via `storageState`/`addInitScript`, run inside Docker.
- [ ] For secrets/config: add to `platform_settings` table or env, never source.
- [ ] Confirm touch targets ≥ 44px and focus ring uses `focusRing` tokens.

### When In Doubt
- Frontend specifics → `frontend/AGENTS.md`
- Deep hardcode laws, MCP usage, UI system → `AGENTS.md` (imported above)
- Milestone status → `cobolt-state.json` and `docs/TechnicalRequirements/`
- Do **not** trust `README.md` for stack or status.
