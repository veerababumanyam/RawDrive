# CLAUDE.md

## Project Overview
- Name: rawdrive
- Type: greenfield
- Project ID: cobolt-rawdrive-f651e4
- Root: C:/Users/admin/Desktop/RawDriveCobolt
- Runtime: Claude Code

## Tech Stack
- Detected stack: TBD during planning
- Confirm framework and runtime choices during `/cobolt-plan project`.

## Compliance Requirements
- None captured during init. Record compliance needs during planning if applicable.

## Key Conventions
- `cobolt-state.json` is the pipeline state source of truth.
- `_cobolt-output/` stores reports, audit logs, evidence, and init readiness artifacts.
- `_cobolt-docker/` contains project-scoped Docker Compose assets.
- `.env.cobolt` is for user-provided infrastructure and must stay gitignored.
- `e2e/playwright.config.js` is seeded during init so browser smoke can run at build time.

## Hardcode Laws — MANDATORY FOR ALL AGENTS

### No Local Storage (ABSOLUTE)
- The application **MUST NEVER** store files on local filesystem. Cloudflare R2 is the ONLY storage driver.
- `STORAGE_DRIVER=local` causes a **FATAL exit**. No fallback, no dev mode, no exceptions.
- All file storage goes to R2 via S3-compatible API.

### No Hardcoded Credentials (ABSOLUTE)
- **NEVER** hardcode API keys, secrets, passwords, or credentials in Go code.
- All secrets come from: (1) `platform_settings` database table → (2) environment variables → (3) fail with clear error.
- No "dev default" secrets. If an env var is missing, log a warning and disable that feature.
- `.env.cobolt` contains all env vars. It is gitignored. Never commit it.

### WebP Conversion (MANDATORY)
- Every uploaded image **MUST** produce WebP derivatives for in-app display.
- Originals are preserved for download. The application UI uses WebP variants only.
- The processing pipeline generates: thumb_sm/md/lg_webp + display_webp (2400px) via cwebp.
- Download API offers: original, WebP optimized, or thumbnail format selection.

### Service Configuration
- `platform_settings` table (migration 039) stores admin-editable service configs.
- Categories: storage, auth, payments, ai, email, messaging.
- Secrets encrypted at rest. Super admin CRUD via /api/v1/admin/settings/.
- R2 env vars: R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_REGION, R2_PUBLIC_URL

## UI Component System — MANDATORY FOR ALL AGENTS

### GlassIconButton (ABSOLUTE — use for ALL icon buttons)
- **Component**: `frontend/src/components/ui/glass-icon-button.tsx`
- **Icons**: `frontend/src/components/icons/index.tsx` (SF Symbols-style SVGs)
- **NEVER** use raw `<button>` with inline SVG for icon actions. Always use `GlassIconButton`.
- **Sizes**: `sm` (36px), `md` (44px — default, meets WCAG touch target), `lg` (52px)
- **Variants**: `glass` (default), `solid`, `ghost`, `danger`, `success`, `accent`
- **Required prop**: `label` (string) for accessibility — no icon button without a label.
- **Active state**: `active={boolean}` for toggle buttons (info panel, comments sidebar)
- **Design**: iOS 26 liquid glass — backdrop-blur, translucent bg, glass border, spring press animation
- **Proofing convention**: Select=`accent`, Approve=`success`, Reject=`danger`

### Icon Set
All icons are in `frontend/src/components/icons/index.tsx`:
- Navigation: `ChevronLeft`, `ChevronRight`
- Actions: `XMark`, `Download`, `Expand`, `Compress`
- Zoom: `ZoomIn`, `ZoomOut`
- Info: `InfoCircle`
- Communication: `ChatBubble`
- Proofing: `CheckCircle`, `ThumbsUp`, `XCircle`
- Rating: `Star`
- Add new icons here following the same pattern (24x24 viewBox, 1.5px stroke, round caps)

## Design Token System — MANDATORY FOR ALL AGENTS

### Single Source of Truth
`design-tokens.json` (project root) is the **canonical source for all visual styling**.
Every agent that writes frontend code, generates UI, or configures design tools MUST read this file first.

### Binding Rules (Non-Negotiable)
1. **Read `design-tokens.json` before writing any CSS, component, or UI code.** No exceptions.
2. **NEVER hardcode colors, spacing, shadows, radii, typography, or z-index values.** All visual properties must resolve to a token from `design-tokens.json`.
3. **NEVER use Tailwind primitive scales** (`bg-neutral-100`, `text-gray-500`, `shadow-lg`). Use only the semantic token classes generated from the token file.
4. **NEVER use arbitrary values** (`w-[245px]`, `text-[#3B82F6]`). If a value isn't in the token system, propose adding it to `design-tokens.json` first.
5. **Theme-aware code only.** Components must work across all 3 themes (`liquid-glass`, `liquid-glass-dark`, `midnight`) without theme-specific overrides.

### Cascade Architecture
```
design-tokens.json (edit here)
  ├─→ frontend/src/index.css         (CSS custom properties for Tailwind v4)
  ├─→ frontend/src/lib/tokens.ts     (TypeScript constants for runtime)
  ├─→ .stitch/DESIGN.md              (Stitch MCP design system definition)
  └─→ component-registry.json        (component catalog token refs)
```
Change `design-tokens.json` → regenerate downstream files. Never edit downstream files directly for token values.

### Theme System
- 3 themes available: `liquid-glass` (default light), `liquid-glass-dark`, `midnight` (AMOLED gold)
- Active theme set in `_meta.themeSystem.activeTheme`
- New themes: add a key under `themes` — build script picks up automatically
- User branding overrides (logo, accent color, etc.) stored in DB per workspace, layered on top of the active theme

### Branding
- Platform brand defaults are in `design-tokens.json → brand`
- Studio-level overrides (logo, colors, gallery branding) are stored per-workspace in the database
- Public pages use platform brand; workspace pages use studio brand with platform fallback

### Agent Checklist (Before Writing Any Frontend Code)
- [ ] Read `design-tokens.json`
- [ ] Confirm which theme context applies (public pages = platform theme, workspace = studio override)
- [ ] Use semantic token classes, not primitives
- [ ] Test that the component renders correctly in all 3 themes
- [ ] Verify touch targets >= 44px on interactive elements
- [ ] Verify focus ring uses `focusRing` component tokens

## Test Photos — MANDATORY FOR ALL TESTING

### Test Asset Directory
`tests/photos/` contains 17 real JPEG files for integration, E2E, and UI testing:
- **Wedding photos**: `Wedding (42).jpg` through `Wedding (259).jpg` (8 files)
- **Portrait photos**: `veera.jpg`, `veera3.jpg`, `reethu.jpg`
- **Social/event**: `493851581_*.jpg`, `WhatsApp Image *.jpeg`
- **Reference cards**: `vCard.jpeg`, `Image.jpeg`

### Usage Rules
1. **Always use `tests/photos/` for upload, processing, and gallery tests.** Never generate synthetic test images or use external URLs.
2. These are real Indian wedding photography samples — ideal for testing AI pipeline (face detection, auto-tagging, duplicate detection, culling).
3. For E2E upload tests, pick 2–3 files (e.g., `Wedding (42).jpg`, `veera.jpg`) to keep tests fast.
4. For batch/gallery tests, use the full set to exercise pagination and grid layouts.
5. Files with spaces in names (e.g., `Wedding (42).jpg`) are intentional — tests MUST handle filenames with spaces and parentheses.

## MCP Tools — MANDATORY FOR ALL AGENTS

### Playwright MCP (UI/UX Testing)
- **Purpose**: Browser-based E2E testing, visual regression, and interactive UI validation.
- **Config**: `e2e/playwright.config.js` — base URL `http://localhost:8229`, Chromium + Firefox projects.
- **E2E auth**: Dashboard tests require `storageState` or `addInitScript` to inject auth tokens (see `reference_e2e_auth_pattern` memory).
- **Playwright runs in Docker**, not the Windows host. Use `_cobolt-docker/` compose for the test runner.
- **Skill**: Use `/chrome-devtools-mcp:chrome-devtools` skill for Playwright MCP interactions.
- **When to use**: After any frontend change — navigate pages, click elements, verify layouts, check responsive behavior, validate accessibility.

### Chrome DevTools MCP (Browser Debugging)
- **Purpose**: Live browser inspection — DOM snapshots, console logs, network requests, performance traces, accessibility audits, Lighthouse.
- **Tools**: `take_screenshot`, `take_snapshot` (DOM), `evaluate_script`, `lighthouse_audit`, `list_network_requests`, `click`, `fill`, `navigate_page`.
- **Skill**: Use `/chrome-devtools-mcp:chrome-devtools` for general debugging, `/chrome-devtools-mcp:a11y-debugging` for accessibility, `/chrome-devtools-mcp:debug-optimize-lcp` for performance.
- **When to use**: Debugging rendering issues, checking console errors, validating network calls to API, performance profiling, accessibility compliance (WCAG).

### Figma MCP (Design Reference)
- **Purpose**: Read Figma design files to extract component specs, spacing, colors, and layout intent.
- **Tools**: `figma_get_file`, `figma_get_file_nodes`, `figma_get_file_styles`, `figma_get_file_components`, `figma_get_images`.
- **When to use**: Before building new UI — fetch the Figma source of truth for component dimensions, spacing, and visual hierarchy. Cross-reference with `design-tokens.json`.

### Stitch MCP (Frontend Design Generation)
- **Purpose**: AI-powered screen generation, design system application, and variant exploration.
- **Tools**: `generate_screen_from_text`, `edit_screens`, `generate_variants`, `create_design_system`, `apply_design_system`.
- **Config**: Design system definition lives at `.stitch/DESIGN.md`, synced from `design-tokens.json`.
- **When to use**: Generating new page layouts, exploring design variants, applying the RawDrive design system to new screens. Always feed `design-tokens.json` values into Stitch prompts.

### Context7 MCP (Library Documentation)
- **Purpose**: Fetch current docs for any library/framework/SDK.
- **Tools**: `resolve-library-id` → `query-docs`.
- **When to use**: Before using any library API — verify current signatures, check for breaking changes, get code examples.

### Agent Checklist (Before Writing Any Test)
- [ ] Use `tests/photos/` assets — never synthetic images
- [ ] E2E tests use Playwright MCP or Chrome DevTools MCP for browser interaction
- [ ] Visual validation uses `take_screenshot` or `take_snapshot` for DOM state
- [ ] Network assertions use `list_network_requests` to verify API calls
- [ ] Accessibility checks use Lighthouse audit or a11y-debugging skill
- [ ] All tests handle filenames with spaces/parentheses

## Next Steps
- Update `.env.cobolt` if you already have infrastructure.
- Start local services from `_cobolt-docker/` with `docker compose up -d` when needed.
- Run `/cobolt-plan project .` to begin planning.
