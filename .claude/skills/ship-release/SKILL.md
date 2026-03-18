---
name: ship-release
description: Use when asked to ship, create a PR, push changes, or prepare a release. Syncs with main, runs tests, audits coverage against the diff, generates missing tests, updates changelog, and creates PR. Also triggers on "ship it", "ready to merge", "create PR", or "push this".
---

# Ship & Release

Automated shipping workflow for RawDrive. Syncs with main, runs the full test suite, audits coverage against your diff, generates missing tests, and creates a structured PR.

## Workflow

### Step 1 — Pre-flight Checks

```bash
# 1a. Verify clean working tree
git status --porcelain
# If output is non-empty → STOP. Ask user to commit or stash.

# 1b. Verify not on main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ]; then
  echo "ERROR: Cannot ship from main. Create a feature branch first."
  exit 1
fi

# 1c. Sync with main
git fetch origin main
git merge origin/main
# If merge conflicts → STOP. Show conflicts. Help resolve before continuing.
```

### Step 2 — Test Run

Run all test suites. If ANY test fails, STOP immediately. Show the failure output. Do not proceed.

```bash
# Frontend (Vitest, non-interactive)
cd frontend && pnpm test --run

# Backend (pytest via Docker)
docker exec rawdrive-backend pytest --tb=short

# Shared packages (if script exists)
pnpm test:packages 2>/dev/null || echo "No shared package tests found"
```

**On failure:** Display the failing test name, file, and error. Do not continue to coverage audit or PR creation.

### Step 3 — Coverage Audit

Build a code-path map from the diff against main and check test coverage for each changed file.

#### 3a. Identify changed files

```bash
git diff --name-only origin/main...HEAD
```

#### 3b. Map files to tests

For each changed file, locate the corresponding test file:

| Source pattern | Test pattern |
|---|---|
| `frontend/src/**/*.tsx` | `frontend/src/**/*.test.tsx` or `__tests__/*.test.tsx` |
| `frontend/src/**/*.ts` | `frontend/src/**/*.test.ts` or `__tests__/*.test.ts` |
| `backend/src/**/*.py` | `backend/tests/**/test_*.py` |
| `services/*/src/**/*.py` | `services/*/tests/**/test_*.py` |
| `packages/*/src/**/*.ts` | `packages/*/src/**/*.test.ts` |

#### 3c. Produce coverage diagram

Print an ASCII coverage report for each logical change group:

```
[+] Gallery upload flow
    ├── [★★★ TESTED] File validation — upload.test.ts:42
    ├── [GAP] TUS resumable retry — NO TEST
    └── [★★  TESTED] Success callback — upload.test.ts:89

[+] Auth middleware update
    ├── [★★★ TESTED] JWT verification — test_auth.py:15
    └── [★★★ TESTED] Token refresh — test_auth.py:58

COVERAGE: 4/5 paths tested (80%)
GAPS: 1 path needs tests
```

#### 3d. Generate missing tests

For each GAP found:
- **TypeScript/React**: Generate a Vitest test using `describe`/`it`/`expect` patterns. Place in the same directory as the source or in `__tests__/`.
- **Python**: Generate a pytest test using fixtures and async patterns. Place in the corresponding `tests/` directory.
- Stage and commit generated tests: `test(scope): add missing tests for <description>`

### Step 4 — PR Creation

#### 4a. Push branch

```bash
git push -u origin "$(git branch --show-current)"
```

#### 4b. Build PR body

Auto-generate the PR body from commit history and coverage results:

```bash
# Gather commit messages since divergence from main
git log --oneline origin/main..HEAD
```

#### 4c. Create PR

```bash
gh pr create --title "<type>(scope): <short description>" --body "$(cat <<'EOF'
## Summary
[auto-generated bullet points from commit messages on the branch]

## Test Coverage
Tests: X → Y (+N new)
Coverage: M/P code paths (NN%)

## Changes
### frontend/
- [list of frontend changes]

### backend/
- [list of backend changes]

### services/*
- [list of service changes, grouped by service]

### packages/*
- [list of shared package changes]

## Post-Merge Actions
- [ ] <any required post-merge steps — see rules below>

Generated with Claude Code
EOF
)"
```

### Step 5 — RawDrive-Specific Rules

Apply these rules when building the PR body:

| Condition | Action |
|---|---|
| Diff includes `alembic/versions/*.py` | Add to Post-Merge: "Run `docker exec rawdrive-backend alembic upgrade head`" |
| Diff includes `packages/*` changes | Add to Post-Merge: "Run `pnpm build:packages`" |
| Diff adds new `os.environ` / `process.env` references | List new env vars in a **New Environment Variables** section |
| No post-merge actions needed | Omit the Post-Merge Actions section entirely |

Group file changes in the PR body by directory:
- `frontend/` — Frontend changes
- `backend/` — Backend API changes
- `services/<name>/` — Per-service changes
- `packages/<name>/` — Shared package changes
- Other files — listed under "Other"

## Commit Convention

All commits created by this skill use conventional format:

```
type(scope): description
```

Types: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `perf`, `ci`

Scope: the affected area — e.g., `gallery`, `auth`, `upload`, `shared-types`

## Guardrails

- **Never push to main directly.** Always create a PR.
- **Never skip failing tests.** Fix or ask the user before proceeding.
- **Never force-push** unless the user explicitly requests it.
- **Never commit secrets** (`.env`, API keys, credentials).
- **Always use `--run` flag** for Vitest to avoid interactive/watch mode.
- **Always use `-u` flag** on first push to set upstream tracking.

## Quick Reference

| Phase | Command | Fail behavior |
|---|---|---|
| Pre-flight | `git status`, `git fetch`, `git merge` | Stop on dirty tree or conflicts |
| Frontend tests | `cd frontend && pnpm test --run` | Stop on failure |
| Backend tests | `docker exec rawdrive-backend pytest --tb=short` | Stop on failure |
| Package tests | `pnpm test:packages` | Warn if missing, continue |
| Coverage audit | `git diff --name-only origin/main...HEAD` | Advisory only |
| Push | `git push -u origin $(git branch --show-current)` | Stop on failure |
| PR | `gh pr create --title "..." --body "..."` | Stop on failure |
