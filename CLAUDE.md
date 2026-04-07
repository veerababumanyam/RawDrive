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

## Next Steps
- Update `.env.cobolt` if you already have infrastructure.
- Start local services from `_cobolt-docker/` with `docker compose up -d` when needed.
- Run `/cobolt-plan project .` to begin planning.
