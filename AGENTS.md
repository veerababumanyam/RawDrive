# RawDrive — Root Agent Guide

Multi-service monorepo. Go API + Next.js app + pgvector DB, currently at v0.0.51
(milestone M23). **Read `frontend/AGENTS.md` before touching anything under `frontend/`**
— Next.js here has breaking changes from public docs.

> The top-level `README.md` is stale (says "React 19 + Vite, Go planned"). Reality is
> Next.js 15 + shipped Go API. Trust this file and the code, not README marketing copy.

## Stack

- **Backend:** Go (`backend/cmd`, `backend/internal`) — Chi router, JWT, pgvector
- **Frontend:** Next.js 15 + TS 5 + Tailwind v4 + pnpm (`frontend/`)
- **Data plane:** Postgres 16 + pgvector, Valkey 8, NATS JetStream, Mailpit (dev SMTP)
- **Storage:** Backblaze B2 (S3-compatible API) is the managed default for ALL tiers; enterprise tenants can override via BYOS (S3/MinIO/B2)
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
npm run lint:backend              # golangci-lint

# Services (Postgres, Valkey, NATS, Mailpit, Playwright)
docker compose up -d

# Ship a change to GitHub (branch → docker test → commit → PR → auto-merge)
npm run ship -- "fix(scope): subject"

# Release GitHub main to production (guarded rolling deploy)
npm run deploy:prod
```

## Non-obvious project rules

These are load-bearing — breaking them causes real bugs and has burned us before.

- **Shipping:** land every change with **`npm run ship -- "<type>(<scope>): subject"`** — it
  branches, tests in Docker, commits (Conventional Commits, enforced by `.githooks/`), opens a PR,
  and arms auto-merge so CI-green PRs squash-merge and self-delete. **Never commit/push to `main`
  directly** (a force-push to `main` once caused a prod incident). Production ships separately and
  deliberately via `npm run deploy:prod`. Full flow: `docs/runbooks/cicd.md`.
- **Auth model:** OTP is **registration-only**. All subsequent logins are password-only.
  Do not add OTP paths to login flows.
- **Upload UX:** Upload lives **inside a gallery / sub-gallery**. There is no standalone
  `/upload` route in the sidebar — do not add one.
- **Storage:** Backblaze B2 (via the S3-compatible API) is the managed
  storage backend for ALL tiers. BYOS (bring-your-own-storage) is
  enterprise-only and lets tenants override the managed B2 backend with
  their own AWS S3, MinIO, or B2 credentials. No local disk storage, no
  hardcoded credentials — service creds live in `.env.cobolt` (gitignored)
  for the managed backend and in `platform_settings` / `workspace_storage_configs`
  for BYOS overrides.
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

## Hardcode Laws — MANDATORY FOR ALL AGENTS

The bullets above are the TLDR. The sections below are the authoritative reference.

### No Local Storage (ABSOLUTE)
- The application **MUST NEVER** store files on the local filesystem. The `s3` driver (against Backblaze B2 by default) is the only allowed production driver.
- `STORAGE_DRIVER=local` causes a **FATAL exit**. No fallback, no dev mode, no exceptions.
- The managed backend is Backblaze B2 via its S3-compatible API. Enterprise tenants may override with AWS S3, MinIO, or their own B2 bucket through BYOS — all routed through the same `s3` driver case in `backend/internal/storage/factory.go`.
- All file serving requires JWT authentication — no public URL access.

### No Hardcoded Credentials (ABSOLUTE)
- **NEVER** hardcode API keys, secrets, passwords, or credentials in Go code.
- Config lookup order: (1) `platform_settings` database table → (2) environment variables → (3) fail with a clear error and disable the feature.
- No "dev default" secrets. If an env var is missing, log a warning and disable that feature — do not substitute a placeholder.
- `.env.cobolt` holds all local env vars. It is **gitignored**. Never commit it, never reference its values in source code.
- Managed B2 storage config follows the same lookup order as auth/email/payments: `platform_settings.storage.*` first, then environment variables, then fatal exit if neither supplies the required fields (bucket, key ID, application key). Keys: `platform_settings` `storage.driver` / `storage.b2_bucket_name` / `storage.b2_region` / `storage.b2_endpoint` / `storage.b2_key_id` / `storage.b2_application_key` / `storage.sse_mode` / `storage.sse_customer_key_hex`, with env fallbacks `STORAGE_DRIVER` / `B2_BUCKET_NAME` / `B2_REGION` / `B2_ENDPOINT` / `B2_KEY_ID` / `B2_APPLICATION_KEY` / `STORAGE_SSE_MODE` / `STORAGE_SSE_C_KEY`. `b2_key_id` / `B2_KEY_ID` maps to the S3 `AccessKeyID`; `b2_application_key` / `B2_APPLICATION_KEY` maps to `SecretAccessKey`. Seed the DB rows from env once via `go run ./backend/cmd/sync-platform-settings-from-env` (migration `151_storage_b2_platform_settings` creates the rows). The Backblaze console's `B2_BUCKET_ID` is kept in `.env.cobolt` as a comment for reference only — the S3 API uses the bucket name.
- `R2_ACCOUNT_ID` is **only** for Cloudflare Stream (video) — `backend/internal/service/stream_service.go` still reads it as a fallback for `CF_STREAM_ACCOUNT_ID`. It is unrelated to object storage and predates the B2 migration.

### WebP Derivatives (MANDATORY)
- Every uploaded image **MUST** produce WebP derivatives for in-app display.
- Originals are preserved for download. The application UI always serves WebP variants.
- Pipeline generates `thumb_sm_webp`, `thumb_md_webp`, `thumb_lg_webp`, and `display_webp` (2400px) via `cwebp`.
- Download API offers three formats: original, WebP optimized, thumbnail.
- EXIF metadata is extracted and persisted in the database on every upload.

### Service Configuration
- `platform_settings` table (migration `039_platform_settings`) stores admin-editable service configs.
- Categories: `storage`, `auth`, `payments`, `ai`, `email`, `messaging`.
- Secrets are encrypted at rest. Super-admin CRUD: `GET/PUT/DELETE /api/v1/admin/settings/{category}/{key}`.

### Auth Model (email-OTP is registration-only; TOTP MFA is login step-up)

There are **two separate one-time-code primitives** in this codebase and they are NOT interchangeable. Future agents must keep them separate.

**Email OTP** (6-digit code sent via SMTP/Mailpit):
- Used **only** during registration to verify email ownership.
- `/auth/verify-otp` is only called from the `/activate` page after registration.
- Never added to login flows. `/auth/login` checks password + `email_verified` flag. Unverified accounts get 403 "account not activated".
- `/auth/resend-otp` stays public and returns generic success text for account-enumeration safety. If delivery fails, the backend deletes the unsent OTP row; operators diagnose delivery with `smtp-smoke` and backend logs, not browser-visible errors.
- Production SMTP is SecureServer (`smtpout.secureserver.net:465` with `ssl`, from `noreply@rawdrive.in`). Rotate credentials in the provider dashboard, update env on both app nodes, run filtered `sync-platform-settings-from-env --category email --keys smtp_host,smtp_port,smtp_user,smtp_password,smtp_security,smtp_from,smtp_from_name`, then run `smtp-smoke` from both app nodes. `535 Authentication Failed` means provider credential rejection. Never paste SMTP passwords into source, docs, logs, or chat.
- Backed by `OTPService` in `backend/internal/auth/auth.go`.

**Authenticator-app TOTP (RFC 6238)** — F-007 (M17 wave 2):
- Second factor added **after** password check in `/auth/login` for users who have enrolled.
- Enrollment flow: `POST /auth/mfa/enroll` → user scans QR → `POST /auth/mfa/verify-enrollment` with first code → recovery codes returned (shown once).
- Login step-up: if the user has a verified enrollment, `/auth/login` returns `401 {"mfa_required": true, "mfa_token": "<short-lived JWT>", "challenge": "totp"}` instead of access/refresh tokens. The client then `POST /auth/verify-totp` with the `mfa_token` + current code → full access+refresh tokens issued with `mfa_verified: true`.
- Wave 2 is **opt-in**: only users who actively enrolled trigger the step-up path. Mandatory enforcement for photographers + platform staff roles (with a grace window via `users.mfa_grace_until`) lands in a later wave.
- TOTP secrets are envelope-encrypted at rest using the same F-005 KEK (`PLATFORM_SETTINGS_KEK`). Recovery codes are bcrypt-hashed.
- JWT access tokens carry a `mfa_verified` boolean claim. Refresh token rotation preserves it via `refresh_sessions.mfa_verified` so refreshes do not silently downgrade a verified session.
- Backed by `TOTPService`, `RecoveryCodeService`, and `MFAHandler` in `backend/internal/auth/`. Persistence: `user_mfa_enrollments` + `user_mfa_recovery_codes` tables (migration 063, amended by 065).

**Do not conflate email-OTP and TOTP.** They are separate primitives, separate tables, separate endpoints, separate flows. A handler that accepts either for login would reintroduce the email-OTP login path that this rule forbids.

### JWT Context (Non-Negotiable)
- Handlers that need JWT claims MUST call `middleware.JWTClaimsFromContext(r.Context())`.
- **Never define a local context-key type** for claims. Go's `context.Value` matches on `(type, value)`; a private type in a different package will silently never match the middleware's key. This broke M1 across onboarding/team/workspace handlers — every authenticated endpoint returned 401.
- Test fixtures inject claims via `middleware.WithJWTClaims(ctx, claims)`.

### Platform Roles (M7.5)
- Two-tier role model. Use the `RequirePlatformRole` middleware for platform-level checks.
- Test users are seeded via `backend/seeds/` — use these in integration tests rather than fabricating new roles.

### Storage Plans
- **Backblaze B2 (S3-compatible) is the managed storage backend for ALL tiers.** Credentials are driven from `.env.cobolt` (managed by ops); standard, pro, and enterprise tenants all read/write to the managed B2 bucket by default.
- **BYOS is enterprise-only.** The BYOS wizard must not be shown to standard/pro users. It lets an enterprise tenant override the managed B2 backend with their own AWS S3, MinIO, or B2 credentials (stored in `workspace_storage_configs`).
- Storage settings page: standard/pro users see managed-B2 usage (read-only) + "Upgrade to Enterprise" for BYOS. Enterprise users see usage + the BYOS wizard. The managed-B2 backend is **not** offered as a BYOS provider option (it's the default, not an override).
- Dashboard storage widget reads from `workspace_storage` table — never mocked data.

### Upload UX
- Upload lives **inside a gallery / sub-gallery / album** — it is not a standalone feature.
- There is no `/upload` route in sidebar navigation. If you see one, remove it.
- Upload dropzone and progress live within the gallery detail page (`/galleries/[id]`).
- A standalone `/upload/page.tsx` file may exist for backward compatibility but must NOT be linked from nav.

## UI Component System — MANDATORY FOR ALL AGENTS

### GlassIconButton (ABSOLUTE — use for ALL icon buttons)
- **Component:** `frontend/src/components/ui/glass-icon-button.tsx`
- **Icons:** `frontend/src/components/icons/index.tsx` (SF Symbols-style SVGs, 24×24 viewBox, 1.5px stroke, round caps)
- **NEVER** use raw `<button>` with inline SVG for icon actions. Always use `GlassIconButton`.
- **Sizes:** `sm` (36px), `md` (44px — default, meets WCAG touch target), `lg` (52px).
- **Variants:** `glass` (default), `solid`, `ghost`, `danger`, `success`, `accent`.
- **Required prop:** `label` (string) for accessibility — no icon button without a label.
- **Active state:** `active={boolean}` for toggle buttons (info panel, comments sidebar).
- **Aesthetic:** iOS 26 liquid glass — `backdrop-blur`, translucent background, glass border, spring press (`active:scale-[0.92]`).
- **Proofing convention:** Select = `accent`, Approve = `success`, Reject = `danger`.

### Icon Registry
All icons live in `frontend/src/components/icons/index.tsx`. Add new ones following the existing pattern:
- Navigation: `ChevronLeft`, `ChevronRight`
- Actions: `XMark`, `Download`, `Expand`, `Compress`
- Zoom: `ZoomIn`, `ZoomOut`
- Info: `InfoCircle`
- Communication: `ChatBubble`
- Proofing: `CheckCircle`, `ThumbsUp`, `XCircle`
- Rating: `Star`

## Design Token System — MANDATORY FOR ALL AGENTS

### Single Source of Truth
`design-tokens.json` at the project root is the **canonical source for all visual styling**. Every agent that writes frontend code, generates UI, or configures design tools MUST read this file first.

### Binding Rules (Non-Negotiable)
1. **Read `design-tokens.json` before writing any CSS, component, or UI code.** No exceptions.
2. **Never hardcode** colors, spacing, shadows, radii, typography, or z-index values. All visual properties must resolve to a token.
3. **Never use Tailwind primitive scales** (`bg-neutral-100`, `text-gray-500`, `shadow-lg`). Use only semantic token classes generated from the token file.
4. **Never use arbitrary values** (`w-[245px]`, `text-[#3B82F6]`). If a value isn't in the token system, propose adding it to `design-tokens.json` first.
5. **Theme-aware code only.** Components must work across all three themes without theme-specific overrides.

### Cascade Architecture
```
design-tokens.json (edit here)
  ├─→ frontend/src/index.css         (CSS custom properties for Tailwind v4)
  ├─→ frontend/src/lib/tokens.ts     (TypeScript constants for runtime)
  ├─→ .stitch/DESIGN.md              (Stitch MCP design system definition)
  └─→ component-registry.json        (component catalog token refs)
```
Edit `design-tokens.json`, then run `node tools/cobolt-sync-tokens.js sync` to regenerate downstream files. Never edit downstream files directly for token values.

### Theme System
- Three themes ship today: `liquid-glass` (default light), `liquid-glass-dark`, `midnight` (AMOLED gold).
- Active theme is set in `_meta.themeSystem.activeTheme` (currently `liquid-glass`).
- Add a theme by adding a key under `themes` — the build script picks it up automatically.
- Studio branding overrides (logo, accent colors, gallery branding) are stored per-workspace in the database, layered on top of the active theme at render time.

### Before Writing Any Frontend Code
- [ ] Read `design-tokens.json`.
- [ ] Confirm which theme context applies (public pages = platform theme, workspace pages = studio override).
- [ ] Use semantic token classes, not primitives.
- [ ] Verify the component renders correctly across all three themes.
- [ ] Verify interactive touch targets are ≥ 44px.
- [ ] Verify focus ring uses the `focusRing` component tokens.

## Test Photos — MANDATORY FOR ALL TESTING

`tests/photos/` contains **17 real JPEG files** for integration, E2E, and UI testing. These are real Indian wedding photography samples — ideal for testing the AI pipeline (face detection, auto-tagging, duplicate detection, culling).

### Usage Rules
1. **Always use `tests/photos/` assets** for upload, processing, and gallery tests. Never generate synthetic test images or use external URLs.
2. For E2E upload tests, pick 2–3 files to keep tests fast (e.g., `Wedding (42).jpg`, `veera.jpg`).
3. For batch/gallery tests, use the full set to exercise pagination and grid layouts.
4. **Filenames with spaces and parentheses are intentional** (e.g., `Wedding (42).jpg`). Tests MUST handle them correctly — this catches real-world filename bugs.

## MCP Tools — MANDATORY FOR ALL AGENTS

### Playwright MCP (Browser E2E)
- **Purpose:** Browser-based E2E testing, visual regression, interactive UI validation.
- **Config:** `e2e/playwright.config.js` — Chromium + Firefox projects.
- **E2E auth:** Dashboard tests require `storageState` or `addInitScript` to inject the auth token. **No UI login flow in tests.**
- **Playwright runs in Docker**, not the Windows host. Use the `_cobolt-docker/` compose runner.
- **When to use:** After any frontend change — navigate, click, verify layouts, check responsive behavior, validate accessibility.

### Chrome DevTools MCP (Live Browser Debugging)
- **Purpose:** DOM snapshots, console logs, network requests, performance traces, accessibility audits, Lighthouse.
- **Tools:** `take_screenshot`, `take_snapshot` (DOM), `evaluate_script`, `lighthouse_audit`, `list_network_requests`, `click`, `fill`, `navigate_page`.
- **Skills:** `chrome-devtools-mcp:chrome-devtools` (general), `chrome-devtools-mcp:a11y-debugging`, `chrome-devtools-mcp:debug-optimize-lcp`.
- **When to use:** Rendering bugs, console errors, network call validation, performance profiling, WCAG compliance.

### Figma MCP (Design Reference)
- **Purpose:** Read Figma designs to extract component specs, spacing, colors, and layout intent.
- **When to use:** Before building new UI — fetch the Figma source of truth for dimensions and visual hierarchy, then cross-reference with `design-tokens.json`.

### Stitch MCP (Frontend Generation)
- **Purpose:** AI-powered screen generation, design system application, variant exploration.
- **Config:** Design system definition at `.stitch/DESIGN.md`, synced from `design-tokens.json`.
- **When to use:** Generating new page layouts, exploring variants. Always feed `design-tokens.json` values into Stitch prompts.

### Context7 MCP (Library Docs)
- **Purpose:** Fetch current docs for any library/framework/SDK.
- **Tools:** `resolve-library-id` → `query-docs`.
- **When to use:** Before calling any library API — verify current signatures and check for breaking changes.

### Before Writing Any Test
- [ ] Use `tests/photos/` assets — never synthetic images.
- [ ] E2E tests use Playwright MCP or Chrome DevTools MCP for browser interaction.
- [ ] Visual validation uses `take_screenshot` or `take_snapshot`.
- [ ] Network assertions use `list_network_requests` to verify API calls.
- [ ] Accessibility checks use Lighthouse or the a11y-debugging skill.
- [ ] Tests handle filenames with spaces and parentheses.

## When in doubt

- Frontend specifics → `frontend/AGENTS.md`
- Milestone context → `docs/TechnicalRequirements/` and `cobolt-state.json`
- Don't trust `README.md` for tech stack
