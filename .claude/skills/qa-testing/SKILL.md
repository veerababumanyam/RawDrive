---
name: qa-testing
description: "Use when asked to QA test the application, find bugs on the live site, test user flows, verify a deployment, or dogfood a feature. Also use when asked to qa, test this, find bugs, test and fix, or check if it works. Three tiers: Quick (critical only), Standard (+ medium), Exhaustive (+ cosmetic)."
---

# QA Testing Skill

Live QA testing methodology for RawDrive. Complements `testing-patterns` (unit/integration) with hands-on browser-based quality assurance using Playwright MCP or Chrome DevTools MCP.

## Prerequisites

- **Clean working tree** — commit or stash all changes before starting QA
- **Dev environment running** — `setup-dev-environment.ps1` or `docker compose up -d` + `pnpm dev`
- **Test credentials** — `free@test.rawdrive.in` / `Test@123`
- **Browser MCP available** — Playwright MCP or Chrome DevTools MCP

## Test Tiers

| Tier | Severities | When to use |
|------|-----------|-------------|
| **Quick** | Critical, High | Pre-deploy smoke test, hotfix verification |
| **Standard** | Critical, High, Medium | Default tier — feature verification, sprint QA |
| **Exhaustive** | All (+ cosmetic, a11y) | Release candidate, major feature launch |

## Phases

### Phase 1: Orient

1. Confirm target URL (default: `http://localhost:5173`)
2. Verify backend health: `http://localhost:8000/health/live`
3. Verify gallery service: `http://localhost:8004/health/live`
4. Check git status — abort if working tree is dirty (uncommitted changes)
5. Detect scope: full app QA vs. specific feature/page

Health check all critical services:

| Service | Endpoint |
|---------|----------|
| Backend | `localhost:8000/health/live` |
| Gallery | `localhost:8004/health/live` |
| Billing | `localhost:8005/health/live` |
| Upload | `localhost:8008/health/live` |
| Notifications | `localhost:8010/health/live` |

### Phase 2: Plan

Build a test plan based on tier and scope. Prioritize RawDrive core flows:

**Critical Flows (all tiers):**
1. Login / authentication (Google OAuth + local)
2. Gallery viewing — public share links + authenticated
3. Photo upload — TUS resumable upload flow
4. Multi-tenant isolation — verify no cross-workspace data leaks

**High Priority (all tiers):**
5. Billing / subscription management
6. Digital invitations — create, send, RSVP
7. Client portal / share links with download policies
8. Navigation — sidebar, header, routing

**Medium Priority (Standard + Exhaustive):**
9. AI features — smart tags, face grouping, search
10. Workspace settings — branding, privacy, notifications
11. User profile / visiting card (`/u/{slug}`)
12. Empty states, loading states, error states

**Low / Cosmetic (Exhaustive only):**
13. Typography consistency, spacing, alignment
14. Dark/light theme transitions
15. Animation smoothness (Framer Motion)
16. Accessibility — keyboard nav, screen reader, WCAG 2.1 AA
17. Responsive breakpoints (mobile, tablet, desktop)

### Phase 3: Baseline

Before testing, capture initial state:

1. **Navigate** to the app root and take a screenshot
2. **Check console** — record any pre-existing errors/warnings
3. **Record health score** using the grading rubric below
4. **Note** the current git commit hash for the report

Baseline checklist:
- Screenshot of landing/dashboard captured
- Console error count recorded
- Console warning count recorded
- All health endpoints responding (yes/no)
- Initial health score assigned

### Phase 4: Explore

For each page/flow in the test plan, run this checklist:

#### Per-Page Checklist

**Visual Scan:**
- Page loads without layout shift
- No broken images or missing assets
- Text is readable (no truncation, overflow, or overlap)
- Theme tokens used correctly (no hardcoded colors)

**Interactive Elements:**
- All buttons clickable and respond visually
- Forms validate inputs (required fields, formats)
- Form submission works (success + error paths)
- Dropdowns, modals, tooltips open/close correctly

**Navigation:**
- All links route to correct pages
- Back/forward browser navigation works
- Breadcrumbs accurate (if present)

**State Testing:**
- Empty state — shows helpful message/CTA
- Loading state — shows skeleton/spinner
- Error state — shows user-friendly error
- Overflow — long text, many items handled gracefully

**Console and Network:**
- No new console errors
- No failed network requests (4xx/5xx)
- API responses include workspace_id filtering

**Responsiveness (Exhaustive only):**
- Mobile (375px) — layout adapts
- Tablet (768px) — layout adapts
- Desktop (1440px) — layout uses space well

#### RawDrive-Specific Test Procedures

**Gallery Viewing:**
- Open a public share link (unauthenticated)
- Verify download policy enforcement (`view_only`, `web_only`, `watermarked_only`, `original_allowed`)
- Check LQIP placeholder to full image load transition
- Test lightbox navigation (arrow keys, swipe)

**Photo Upload:**
- Upload a single image — verify TUS resumable protocol
- Upload multiple images (batch)
- Simulate network interruption — verify resume capability
- Check upload progress indicators

**Multi-Tenant Isolation:**
- Log in as user in Workspace A
- Attempt to access Workspace B resources via URL manipulation
- Verify API responses never leak cross-workspace data
- Check that `workspace_id` is present in all API calls

**Billing:**
- Navigate to billing/subscription page
- Verify plan details display correctly
- Test upgrade/downgrade flow (if test Stripe keys configured)

**Invitations:**
- Create a digital invitation
- Test RSVP flow from recipient perspective
- Verify invitation analytics/tracking

### Phase 5: Document

Record each finding with this structure:

| Field | Value |
|-------|-------|
| **ID** | QA-NNN |
| **Severity** | critical / high / medium / low |
| **Category** | visual / functional / performance / a11y / security / data |
| **Page** | URL path where the issue occurs |
| **Description** | What is wrong |
| **Repro Steps** | Numbered steps to reproduce |
| **Expected** | What should happen |
| **Actual** | What happens instead |
| **Screenshot** | Path in `docs/qa-reports/screenshots/` |

**Severity Definitions:**
- **Critical** — App crash, data loss, security breach, auth bypass
- **High** — Feature broken, workflow blocked, data displayed incorrectly
- **Medium** — UI glitch, minor UX friction, non-critical feature issue
- **Low** — Cosmetic, typo, minor alignment, nice-to-have improvement

### Phase 6: Triage

Sort findings by severity. Apply tier filter:

| Tier | Fix | Defer |
|------|-----|-------|
| Quick | Critical + High | Medium + Low |
| Standard | Critical + High + Medium | Low |
| Exhaustive | All | None (document only if truly unfixable) |

### Phase 7: Fix Loop

For each issue to fix:

1. **Locate source** — find the relevant component/service file
2. **Implement fix** — follow RawDrive coding standards
3. **Atomic commit** — one commit per fix, message format: `fix(qa): QA-NNN — short description`
4. **Re-verify** — navigate back to the page, confirm fix works
5. **Generate regression test:**
   - Frontend fix: Vitest test in co-located `.test.ts` file
   - Backend fix: pytest test in `tests/` directory
   - Include test in same commit or follow-up commit
6. **Track outcome** — categorize as: verified fix, best-effort fix, reverted fix, or deferred

**Fix Loop Rules:**
- One commit per fix — never bundle multiple fixes
- Always re-navigate and visually verify after fix
- If a fix causes a regression, revert immediately and defer
- Frontend fixes: check both light and dark themes
- Backend fixes: verify multi-tenant isolation is maintained
- Never skip `workspace_id` filtering in any query fix

### Phase 8: Summary

Write the final report to `docs/qa-reports/qa-YYYY-MM-DD.md` containing:

**Header:** Tier, Scope, Commit (before), Commit (after), Tester

**Health Score Table:**

| Category | Weight | Before | After |
|----------|--------|--------|-------|
| Console Errors | 30% | grade | grade |
| Broken Interactions | 25% | grade | grade |
| Visual Bugs | 20% | grade | grade |
| Performance | 15% | grade | grade |
| Accessibility | 10% | grade | grade |
| **Overall** | 100% | grade | grade |

**Findings Summary:** Table of all findings with ID, Severity, Category, Description, Status (Fixed/Deferred)

**Fixes Applied:** For each fix — file changed, commit hash, regression test file

**Deferred Issues:** For each — reason deferred, recommendation for next sprint

**Ship Readiness Checklist:**
- All critical issues resolved
- All high issues resolved
- No regressions introduced
- **Verdict:** SHIP / HOLD / BLOCK

## Health Score Grading

Calculate per-category scores, then weighted average:

| Grade | Meaning | Criteria |
|-------|---------|----------|
| **A** | Excellent | 0 issues in category |
| **B** | Good | 1-2 minor issues |
| **C** | Fair | 3-5 issues or 1 significant |
| **D** | Poor | Multiple significant issues |
| **F** | Failing | Critical/blocking issues |

**Weights:** Console errors (30%), Broken interactions (25%), Visual bugs (20%), Performance (15%), Accessibility (10%)

## Browser Automation Notes

Use **Playwright MCP** (preferred) or **Chrome DevTools MCP** for:
- Taking screenshots (`browser_take_screenshot`)
- Navigating pages (`browser_navigate`)
- Clicking elements (`browser_click`)
- Filling forms (`browser_fill_form`)
- Checking console messages (`browser_console_messages`)
- Getting page snapshots (`browser_snapshot`)

**Login flow via Playwright MCP:**
1. Navigate to `http://localhost:5173/login`
2. Fill email: `free@test.rawdrive.in`
3. Fill password: `Test@123`
4. Click login button
5. Wait for dashboard to load
6. Take baseline screenshot

## File Conventions

- Reports: `docs/qa-reports/qa-YYYY-MM-DD.md`
- Screenshots: `docs/qa-reports/screenshots/QA-NNN.png`
- Fix commits: `fix(qa): QA-NNN — description`
- Regression tests: co-located with the fixed file
