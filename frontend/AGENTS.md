<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Frontend Testing & Design Tools

### Test Photos
All UI tests that involve image uploads, galleries, or photo display MUST use `tests/photos/` (17 real JPEGs). Never use placeholder images or external URLs.

### Playwright MCP — UI/UX Testing
- Use for E2E testing of all frontend pages and flows.
- Navigate, click, fill forms, verify layouts, check responsive behavior.
- Dashboard tests need auth token injection via `storageState` or `addInitScript`.
- Playwright runs in Docker — see `_cobolt-docker/` for the test runner.

### Chrome DevTools MCP — Browser Debugging
- Use for live DOM inspection, console error checking, network request validation, performance profiling.
- `take_screenshot` / `take_snapshot` for visual regression.
- `lighthouse_audit` for performance and accessibility scoring.
- `list_network_requests` to verify API calls from frontend.

### Figma MCP — Design Reference
- Fetch Figma files for component specs before building new UI.
- Cross-reference with `design-tokens.json` — tokens are the binding source of truth.

### Stitch MCP — Design Generation
- Generate new page layouts and explore variants using RawDrive's design system.
- Design system definition: `.stitch/DESIGN.md` (synced from `design-tokens.json`).
- Always feed token values into Stitch prompts — never let Stitch invent colors/spacing.
