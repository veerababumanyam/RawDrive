# AGENTS.md

## Project Overview
- Name: rawdrive
- Type: greenfield
- Project ID: cobolt-rawdrive-f651e4
- Root: C:/Users/admin/Desktop/RawDriveCobolt
- Runtime: Codex IDE and compatible agent runtimes

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

## Test Photos — MANDATORY FOR ALL TESTING

### Test Asset Directory
`tests/photos/` contains 17 real JPEG files for integration, E2E, and UI testing:
- **Wedding photos**: `Wedding (42).jpg` through `Wedding (259).jpg` (8 files)
- **Portrait photos**: `veera.jpg`, `veera3.jpg`, `reethu.jpg`
- **Social/event**: `493851581_*.jpg`, `WhatsApp Image *.jpeg`
- **Reference cards**: `vCard.jpeg`, `Image.jpeg`

### Usage Rules
1. **Always use `tests/photos/` for upload, processing, and gallery tests.** Never generate synthetic test images.
2. Real Indian wedding photography samples — ideal for AI pipeline testing (face detection, auto-tagging, duplicate detection).
3. For E2E upload tests, pick 2–3 files to keep tests fast.
4. Files with spaces in names are intentional — tests MUST handle filenames with spaces and parentheses.

## MCP Tools — MANDATORY FOR ALL AGENTS

### Playwright MCP (UI/UX Testing)
- Browser-based E2E testing, visual regression, and interactive UI validation.
- Config: `e2e/playwright.config.js` — base URL `http://localhost:8229`.
- E2E auth: Dashboard tests require `storageState` or `addInitScript` for auth tokens.
- Playwright runs in Docker, not the Windows host.

### Chrome DevTools MCP (Browser Debugging)
- Live browser inspection: DOM snapshots, console logs, network requests, performance traces, accessibility audits, Lighthouse.
- Tools: `take_screenshot`, `take_snapshot`, `evaluate_script`, `lighthouse_audit`, `list_network_requests`, `click`, `fill`, `navigate_page`.

### Figma MCP (Design Reference)
- Read Figma design files for component specs, spacing, colors, and layout intent.
- Tools: `figma_get_file`, `figma_get_file_nodes`, `figma_get_file_styles`, `figma_get_file_components`, `figma_get_images`.
- Cross-reference with `design-tokens.json`.

### Stitch MCP (Frontend Design Generation)
- AI-powered screen generation, design system application, and variant exploration.
- Tools: `generate_screen_from_text`, `edit_screens`, `generate_variants`, `apply_design_system`.
- Design system at `.stitch/DESIGN.md`, synced from `design-tokens.json`.

### Context7 MCP (Library Documentation)
Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service, including setup, version migrations, configuration, or library-specific debugging.

Do not use it for refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

When using Context7 MCP:
1. Start with `resolve-library-id` unless the user already provided an exact `/org/project` library ID.
2. Pick the best match using exact name, description relevance, snippet coverage, source reputation, and benchmark score.
3. Query docs with the selected library ID and the user's full question.
4. Answer from the fetched docs.

### Agent Checklist (Before Writing Any Test)
- [ ] Use `tests/photos/` assets — never synthetic images
- [ ] E2E tests use Playwright MCP or Chrome DevTools MCP for browser interaction
- [ ] Visual validation uses `take_screenshot` or `take_snapshot`
- [ ] Accessibility checks use Lighthouse audit
- [ ] All tests handle filenames with spaces/parentheses

## Next Steps
- Update `.env.cobolt` if you already have infrastructure.
- Start local services from `_cobolt-docker/` with `docker compose up -d` when needed.
- Run `/cobolt-plan project .` to begin planning.
