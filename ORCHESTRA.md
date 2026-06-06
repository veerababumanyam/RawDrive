# ORCHESTRA.md — how the Orchestra delivery pipelines operate in RawDrive

> **This is RawDrive's operating contract for the Orchestra toolchain.** Orchestra is a
> repository-agnostic delivery system (plan → build → review → fix → UAT → ship). This file is the
> *project knowledge* that adapts it to RawDrive: how to land, what "green" means here, which of
> RawDrive's laws every gate must enforce, and what is out of scope. **It does not restate the laws** —
> [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md), and [`frontend/AGENTS.md`](frontend/AGENTS.md) are
> the authoritative reference; this file tells Orchestra how to *run* them.
>
> **Precedence:** RawDrive's `AGENTS.md` / `CLAUDE.md` / `frontend/AGENTS.md` outrank any Orchestra
> SKILL default. When a generic pipeline step and a RawDrive law conflict, the RawDrive law wins, and
> this file's operating rules (land via `npm run ship`, the gate map below) bind the run.

RawDrive's delivery is driven **entirely by Orchestra**. The older `rawdrive-*` skills
(`rawdrive-add-feature`, `rawdrive-fix`, `rawdrive-design`, `rawdrive-deploy`,
`rawdrive-performance-audit`, `rawdrive-seo-geo`) are retired; map their intent to the Orchestra
pipelines below.

## Pipelines and entry points

| When you want to… | Run | Replaces |
| --- | --- | --- |
| Build a whole feature end-to-end (plan + every task to merged-green) | **orchestra-conductor** | `rawdrive-add-feature` (multi-slice), `cobolt-build` |
| Plan / decompose one feature into dependency-ordered, flag-gated slices | **orchestra-plan-feature** | `rawdrive-add-feature` (Phase-4 slicing) |
| Add / ship / finish one feature, slice, roadmap doc, or `#issue` | **orchestra-task-add** | `rawdrive-add-feature` (single unit) |
| Review a branch / PR / feature (report-only) | **orchestra-task-review** | `rawdrive-fix` (review phase) |
| Fix / remediate review findings, a bug, a defect, a stack trace | **orchestra-task-fix** | `rawdrive-fix` |
| Acceptance-test the UI / drive user journeys (also the pre-merge gate of add/fix) | **orchestra-task-uat** | `cobolt-uat`, `npm run uat` |
| Design / redesign / polish / a11y-harden a UI surface | **orchestra-task-add** + the **orchestra-design-scout** (reads `design-tokens.json`) | `rawdrive-design` |
| Clean up the repo / GitHub, sync the board, prune branches | **orchestra-git** | — |

Each pipeline is standalone; `--auto` chains them (plan → add → review → fix → UAT → ship). The
conductor owns a feature from request to every-slice-merged.

## The LAND contract (how work reaches `main`)

RawDrive lands via its own ship script. Orchestra **delegates the land to it** — it does NOT use its
built-in `gh pr merge` / `cf-pr merge` flow here, and NEVER pushes to `main`.

- **Land command (delegated):**
  ```bash
  npm run ship -- "<type>(<scope>): <subject>"
  ```
  This branches (or ships the current Orchestra `cta/`/`ctf/` branch), tests in Docker, commits
  (Conventional Commits, enforced by `.githooks/`), opens a PR, applies a type label, and **arms GitHub
  auto-merge (squash + delete-branch)**. The PR squash-merges itself the moment
  `.github/workflows/production-gates.yml` is green. The merge is therefore CI-gated *server-side* by
  GitHub — Orchestra must still hold its own gate (verify + review + UAT all green) **before** invoking
  `npm run ship`, never after.
- **Never** `git push origin main`, `git merge` to main, force-push `main`, or hand-craft the merge. A
  force-push to `main` once caused a production incident; `.githooks/pre-push` blocks direct pushes.
- **One unit = one issue = one short-lived branch = one worktree = one PR.** This is identical to
  Orchestra's own drift control, so its `cta/<slug>` / `ctf/<slug>` worktree model maps 1:1.
- **Large features are flag-gated slices, never a mega-branch.** Decompose into a dependency-ordered
  `schema → service → API → frontend → flag-on` sequence; each slice is its own one-unit PR landing on
  `main` behind a feature flag, with the flag-on slice last. `orchestra-plan-feature` /
  `orchestra-conductor` produce exactly this shape.
- **Docs-only / already-verified lands:** Orchestra has already run the full verify ladder on the
  branch, so the ship Docker re-test is redundant; `npm run ship -- "<msg>" --skip-tests` is acceptable
  for a unit Orchestra already proved green (CI still re-gates the PR). Use `--paths a,b` when unrelated
  WIP exists in the tree so the commit stays scoped to the unit.
- Full runbook: [`docs/runbooks/cicd.md`](docs/runbooks/cicd.md).

## The GREEN contract (what every gate verifies)

Orchestra's verify ladder auto-detects `npm test`; that is correct here. The full green surface for a
RawDrive unit:

```bash
npm run test           # backend (go test ./... -count=1 -timeout 120s) + frontend (vitest)
npm run lint           # frontend eslint
npm run lint:backend   # golangci-lint (new issues vs origin/main)
npm run build          # frontend production build
(cd backend && go build ./...)   # backend compile check
```

- **Backend tests need Docker** (testcontainers) — `docker compose up -d` must be available; the ship
  Docker gate runs them the same way.
- **E2E runs inside the `playwright` Docker service**, not the host:
  `docker compose run --rm playwright npx playwright test`. Dashboard E2E injects auth via Playwright
  `storageState` / `addInitScript` — there is no UI login flow in tests.
- **CI is the authoritative gate.** `.github/workflows/production-gates.yml` jobs —
  `backend`, `backend-lint`, `frontend` (incl. design-token drift), `openapi`, `security`, `images`,
  `pr-title` — must all be green before GitHub auto-merges. Orchestra treats a non-green PR as red
  (fail-closed) and never narrates "CI passed" without the check state.
- **Blocking security gates:** `gitleaks` (any finding across full history) and `trivy fs`
  (CRITICAL/HIGH SCA) are **blocking**; `semgrep` is advisory during rollout. A unit that trips a
  blocking scan is red.

## Gate map — RawDrive's laws each reviewer must enforce

Orchestra's review fleet must check these RawDrive-specific laws (authoritative text in `AGENTS.md`;
this is the routing, not a restatement). A violation is a blocking (Fix) finding.

| RawDrive law | Orchestra reviewer | Severity |
| --- | --- | --- |
| No local storage — `STORAGE_DRIVER=local` must FATAL; B2/`s3` driver only; all file serving JWT-gated | security / architecture | critical |
| No hardcoded secrets — `platform_settings` DB → env → disable-with-warning; `.env.cobolt` gitignored | security / config | critical |
| JWT claims via `middleware.JWTClaimsFromContext`; never a local context-key type | security / backend | critical |
| Email-OTP is registration-only; TOTP is opt-in login step-up; the two are never interchangeable | security / api | critical |
| WebP derivatives mandatory on every upload (`thumb_sm/md/lg_webp`, `display_webp`); EXIF persisted | backend / integration | high |
| Migrations paired `NNN_*.up/.down.sql`, append-only, never renumber/edit a merged one (grandfathered 006/133/160/164) | schema / database | high |
| Performance hot paths — batch asset hydration (no per-asset `Promise.all`), window large media lists, no double full-file upload reads, atomic worker claims (`FOR UPDATE SKIP LOCKED`); index by real predicate/ordering | performance / database | high |
| Design tokens — `design-tokens.json` is the only source; run `node tools/cobolt-sync-tokens.js sync`; no Tailwind `neutral-*`/`gray-*`/arbitrary `[...]`; theme-aware across all 3 themes | ux / a11y / design-scout | high |
| `GlassIconButton` for every icon action (required `label`, ≥44px touch target, focus-ring tokens) | ux / a11y | high |
| Upload UX lives inside a gallery/sub-gallery/album; no `/upload` in sidebar nav | ux | medium |
| Platform roles via `RequirePlatformRole`; test users from `backend/seeds/` | security / test | high |
| Tests use `tests/photos/` (17 real JPEGs, spaces/parens in names); never synthetic/external | test | high |
| BYOS wizard is enterprise-only; managed B2 row is read-only for all tiers; storage widget reads `workspace_storage` (never mocked) | api / ux | high |

The **orchestra-design-scout** reads `design-tokens.json` + `frontend/src/components/ui/` and the
**orchestra-task-uat-runner** drives the running app via Playwright / Chrome DevTools MCP — both honor
the design + token laws above as the contract, not a suggestion.

## Security, compliance, and HA posture

- **Compliance:** DPDP (India) is documented (`docs/compliance/`); SOC2 controls are in
  `docs/security/`. The **orchestra-compliance-reviewer** must treat viewer PII (name, email, IP, JWT,
  chat, reactions, watch-time) and workspace-owner billing identifiers (GSTIN, PAN, billing address) as
  regulated data; consent, retention, and access controls are in-scope. Security/SCS criticals are
  **non-deferrable** through both Orchestra escalation tiers — fixed or escalated to a human, never
  parked. Disclosure: `security@rawdrive.in`.
- **Secrets posture:** never in source/docs/logs; resolved `platform_settings` → env → disable. SMTP
  (SecureServer), B2 keys, and `PLATFORM_SETTINGS_KEK` follow that order. Rotate in the provider, sync
  only the affected `--category` with `sync-platform-settings-from-env`, then `smtp-smoke` both nodes.
- **HA / production topology:** Hostinger 3-VPS (`.42`/`.44` app, `.46` db, Patroni Postgres). This is
  operational context for reviewers; Orchestra does **not** SSH or deploy.

## Out of scope for Orchestra here

- **Production deploy.** `npm run deploy:prod` (guarded rolling deploy from clean, synced `main`) is a
  deliberate, manual, human-initiated step — never part of an Orchestra task or `--auto` chain. Orchestra
  finishes at *merged-to-`main`-and-green*. Never SSH to a node; never deploy to `.46`.
- **Version/release bumps.** Handled deliberately, outside the per-unit pipeline.
- **Editing/renumbering a merged migration**, force-pushing `main`, committing `.env*`, or working in a
  sibling `RawDrive*` directory (active project is this repo only).

## Per-run knobs (optional)

- `ORCHESTRA_MODEL_TIER=max` — force the top reasoning tier on security/compliance/correctness-critical
  runs (recommended for auth, storage, billing, and migration work).
- `ORCHESTRA_DEFER_MERGE=1` — let the conductor build independent, footprint-disjoint slices in parallel
  and serialize the `npm run ship` lands.
- The pipelines run zero-dependency on Node + `git` + `gh` (already authenticated for `npm run ship`).

## Project board (GitHub Projects v2)

RawDrive's canonical Orchestra planning board is **https://github.com/users/manyamprasad/projects/2**.
All SDLC work must be visible there before implementation starts: milestone / epic / dependency / user
story / UAT / release-gate items are board-native draft items unless a repository issue is actually
needed for a one-unit PR or external discussion. `orchestra-plan-feature` mirrors each feature plan onto
the board (main feature -> milestone/epic item, each slice -> story/task item with Status / Priority /
Size / Estimate / dates / dependency fields); `orchestra-git` reconciles the board against what is
actually merged on `main` (the tree is truth). When a pipeline asks which board to target, point it at
this project.

**No silent fixes.** Automations and agents must not quietly fix code, close issues, or ship changes
without updating the board first. For every actionable finding:

- Update an existing Project #2 item when one matches the work; otherwise create a board-native draft
  item with SDLC Phase, Artifact Type, Release Milestone, Dependencies, Blocks, Orchestra Pipeline,
  Acceptance Gate, Feature Flag (if relevant), Area, Status, Priority, Size, Estimate, Start date, and
  Target date.
- Create or update a GitHub repo issue only when the work needs the repo issue as the one-unit PR
  tracker, an external discussion thread, or a durable bug report. Link/reference that issue from the
  board item.
- Move board status through Backlog/Todo/In Progress/In Review/Blocked/Done as evidence changes.
  Comment on linked issues with reproduction/root cause/tests/PR references when applicable.
- Close a board item or GitHub issue only after validation succeeds and the corresponding PR/ship gate
  is complete, or after explicit owner-approved deferral.

**Prerequisite:** board writes need GitHub Projects v2 scopes on the `gh` token —
`gh auth refresh -s read:project,project`. If the scope is missing, stop and report the blocker instead
of silently proceeding with untracked fixes.

## Deeper references

- Laws & UI/design system: [`AGENTS.md`](AGENTS.md) · [`frontend/AGENTS.md`](frontend/AGENTS.md)
- Agent onboarding: [`CLAUDE.md`](CLAUDE.md)
- Ship / deploy runbook: [`docs/runbooks/cicd.md`](docs/runbooks/cicd.md)
- Milestone state: `cobolt-state.json` · `docs/TechnicalRequirements/`
- Orchestra's own contract (the plugin side): the installed `~/.orchestra/ORCHESTRA.md` and each
  `skills/orchestra-*/SKILL.md`.
