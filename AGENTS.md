# RawDrive — Root Agent Guide

Multi-service monorepo. Go API + Next.js app + pgvector DB, currently at v0.0.35
(milestone M16). **Read `frontend/AGENTS.md` before touching anything under `frontend/`**
— Next.js here has breaking changes from public docs.

> The top-level `README.md` is stale (says "React 19 + Vite, Go planned"). Reality is
> Next.js 15 + shipped Go API. Trust this file and the code, not README marketing copy.

## Stack

- **Backend:** Go (`backend/cmd`, `backend/internal`) — Chi router, JWT, pgvector
- **Frontend:** Next.js 15 + TS 5 + Tailwind v4 + pnpm (`frontend/`)
- **Data plane:** Postgres 16 + pgvector, Valkey 8, NATS JetStream, Mailpit (dev SMTP)
- **Storage:** Cloudflare R2 (default, standard/pro tiers); BYOS is enterprise-only
- **E2E:** Playwright runs **inside the `playwright` docker service**, not Windows host

## Layout

```
backend/     Go API — cmd/, internal/{handler,service,repository,middleware}
frontend/    Next.js app — see frontend/AGENTS.md
docs/        PRDs, TRDs, milestone plans
e2e/         Playwright specs (executed via docker playwright container)
infra/       Deployment / infra scripts
tests/       Shared test assets, incl. tests/photos/ (17 real JPEGs)
_cobolt-docker/  Docker tooling incl. playwright runner
docker-compose.yml  postgres + valkey + nats + mailpit + playwright
```

## Commands

```bash
# Dev
pnpm --dir frontend dev           # or: npm run dev
go run ./backend/cmd/api          # backend dev

# Tests (from repo root)
npm run test                      # backend + frontend
npm run test:backend              # go test ./... -count=1 -timeout 120s
npm run test:frontend             # vitest (frontend)
npm run lint                      # frontend eslint

# Services (Postgres, Valkey, NATS, Mailpit, Playwright)
docker compose up -d
```

## Non-obvious project rules

These are load-bearing — breaking them causes real bugs and has burned us before.

- **Auth model:** OTP is **registration-only**. All subsequent logins are password-only.
  Do not add OTP paths to login flows.
- **Upload UX:** Upload lives **inside a gallery / sub-gallery**. There is no standalone
  `/upload` route in the sidebar — do not add one.
- **Storage:** Cloudflare R2 is the sole storage backend for standard/pro tiers.
  BYOS (bring-your-own-storage) is enterprise-only. No local disk storage, no
  hardcoded credentials — service creds live in admin settings CRUD.
- **Derivatives:** All uploads must produce **WebP** derivatives. Storage auth is
  required; download offers format choice.
- **JWT claims:** Handlers must call `middleware.JWTClaimsFromContext(ctx)`. Never
  define a local context-key type — it silently fails to match the middleware's key.
- **Platform roles (M7.5):** Two-tier model. Use `RequirePlatformRole` middleware;
  see `backend/seeds/` for test users.
- **Icons & buttons:** All buttons use `GlassIconButton` + SF Symbol icons
  (iOS 26 liquid-glass style). Do not introduce ad-hoc `<button>` elements for icons.
- **Test photos:** UI/gallery tests use `tests/photos/` (17 real wedding JPEGs).
  Never placeholders, never external URLs.
- **E2E auth:** Dashboard E2E tests need auth-token injection via Playwright
  `storageState` or `addInitScript` — no UI login flow in tests.

## When in doubt

- Frontend specifics → `frontend/AGENTS.md`
- Milestone context → `docs/TechnicalRequirements/` and `cobolt-state.json`
- Don't trust `README.md` for tech stack
