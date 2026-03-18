---
name: engineering-retro
description: "Use when asked for a weekly retro, engineering retrospective, shipping stats, what was shipped this week, team velocity, or development metrics. Analyzes git history for commits, LOC, test ratio, shipping streaks, and per-contributor breakdowns."
---

# Engineering Retrospective

Pure git-based engineering retrospective for the RawDrive monorepo. No external dependencies — all metrics derived from `git log`.

## When to Use

- "What did we ship this week?"
- "Run a retro" / "engineering retrospective"
- "Show shipping stats" / "team velocity"
- "Development metrics for the last N days"

## Data Collection

Run these git commands for the analysis period (default: last 7 days). Use `ctx_batch_execute` or Bash.

### 1. Commits in Period

```bash
# All commits with stats (default: 7 days)
SINCE="7 days ago"
git log --since="$SINCE" --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso --shortstat
```

### 2. Per-Contributor LOC

```bash
git log --since="$SINCE" --pretty=format:"%an" --shortstat | \
  awk '/^[A-Za-z]/{name=$0} /files? changed/{print name"|"$0}'
```

### 3. Test File Ratio

Count test files touched vs total files touched in the period:

```bash
# All files changed
git diff --name-only --diff-filter=ACMR "$(git log --since="$SINCE" --format=%H | tail -1)"..HEAD

# Test files pattern (frontend + backend)
# Frontend: *.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx
# Backend:  test_*.py, *_test.py, conftest.py
```

### 4. Hotspot Files

```bash
git log --since="$SINCE" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20
```

### 5. Commit Timestamps (Session Detection)

```bash
git log --since="$SINCE" --pretty=format:"%an|%ad" --date=format:"%H" | sort | uniq -c | sort -rn
```

### 6. Fix Ratio

```bash
TOTAL=$(git log --since="$SINCE" --oneline | wc -l)
FIXES=$(git log --since="$SINCE" --oneline --grep="^fix" | wc -l)
```

### 7. PR / Merge Frequency

```bash
git log --since="$SINCE" --merges --oneline | wc -l
```

## Metrics Computed

| Metric | How |
|--------|-----|
| Total commits | Count of commits in period |
| LOC (net) | Lines added minus lines removed |
| Test ratio % | Test files changed / total files changed * 100 |
| Shipping streak | Consecutive days with at least one commit (walk backwards from today) |
| Biggest ship | Largest single commit by LOC or largest merged PR |
| Per-service breakdown | Group changed files by `backend/`, `frontend/`, `services/*` |
| Frontend vs Backend ratio | Files in `frontend/` vs `backend/` + `services/` |
| Peak coding hours | Hour buckets from commit timestamps |
| Fix ratio | `fix:` prefixed commits / total commits |

## Per-Contributor Breakdown

For each contributor, compute:

1. **Commits** — total count
2. **LOC** — lines added / removed / net
3. **Test ratio** — their test files vs total files
4. **Praise** — call out their biggest ship, any new test coverage, documentation updates
5. **Growth areas** — flag commits with 500+ LOC (could be split), low test ratio, missing commit prefixes
6. **Session patterns** — peak hours, average session length (gap > 2h = new session)

## Test Health Dashboard

```bash
# Total test files in repo
find frontend/src -name "*.test.*" -o -name "*.spec.*" 2>/dev/null | wc -l
find backend services -name "test_*.py" -o -name "*_test.py" 2>/dev/null | wc -l

# Tests added this period
git diff --name-only --diff-filter=A "$(git log --since="$SINCE" --format=%H | tail -1)"..HEAD | \
  grep -E '\.(test|spec)\.(ts|tsx|js|jsx)$|^test_.*\.py$|_test\.py$' | wc -l

# Previous period comparison (for trend)
PREV_SINCE="14 days ago"
# Run same queries with --since="$PREV_SINCE" --until="$SINCE"
```

Flag with a warning if test ratio drops below 20%.

## RawDrive-Specific Analysis

### Service Directory Breakdown

Map changed files to services:

| Path Prefix | Service |
|-------------|---------|
| `frontend/` | Frontend (React) |
| `backend/` | Backend API |
| `services/gallery-service/` | Gallery Service |
| `services/billing-service/` | Billing Service |
| `services/upload-service/` | Upload Service |
| `services/webhooks-service/` | Webhooks Service |
| `services/notifications-service/` | Notifications Service |
| `services/onboarding-service/` | Onboarding Service |
| `services/invitations-service/` | Invitations Service |
| `services/client-service/` | Client Service |
| `services/ai-service/` | AI Service |
| `services/ai-processing-service/` | AI Processing Service |
| `services/livesync-service/` | LiveSync Service |
| `services/llm-service/` | LLM Service |
| `packages/` | Shared Packages |
| `infrastructure/` | Infrastructure / DevOps |
| `docs/` | Documentation |
| `.claude/` | Claude Skills / Agents |

### Additional Checks

- **Migration files**: count new files in `*/alembic/versions/` or `*/migrations/`
- **Skills / docs updated**: changes in `.claude/skills/`, `.claude/reference/`, `docs/`
- **Health check additions**: new files matching `*health*`, `*readiness*`
- **New dependencies**: changes to `package.json`, `requirements.txt`, `pyproject.toml`

## Output Format

```markdown
# Engineering Retro

**Week of [date]:** N commits (M contributors), X.Xk LOC, NN% tests | Streak: Nd

## Highlights
- Biggest ship: [description from commit message]
- Services touched: [list]
- Fix ratio: NN% (N fix commits / N total)
- Peak hours: [e.g., 10am-12pm, 2pm-5pm]

## Your Week
[Detailed personal stats for the user running the retro]
- Commits: N | LOC: +X / -Y (net Z)
- Test ratio: NN%
- Top files: [most touched files]
- Sessions: N sessions, avg Xh

## Team Breakdown

### [Contributor Name]
- Commits: N | LOC: +X / -Y
- Shipped: [notable items]
- Growth: [actionable suggestions]

## Test Health
- Frontend tests: N files (M new this period)
- Backend tests: N files (M new this period)
- Test ratio trend: [up/down arrow] NN% (prev: NN%)
- [WARNING if below 20%]

## Service Activity
| Service | Commits | LOC | Tests |
|---------|---------|-----|-------|
| frontend | N | +X/-Y | N |
| backend | N | +X/-Y | N |
| ... | | | |

## Recommendations
1. [Actionable next step based on data]
2. [e.g., "gallery-service has 0 new tests -- add coverage for recent changes"]
3. [e.g., "3 PRs over 500 LOC -- consider smaller increments"]
```

## Saving the Report

Save output to `docs/retros/retro-YYYY-MM-DD.md` (create directory if needed):

```bash
mkdir -p docs/retros
# Write report to docs/retros/retro-$(date +%Y-%m-%d).md
```

## Customization

- **Period**: Accept `--since` override (e.g., "14 days ago", "2026-03-01")
- **Single contributor**: Filter to one author with `--author`
- **Service focus**: Filter to a specific service directory
- **Compare periods**: Run two periods side-by-side for trend analysis

## Implementation Notes

- All analysis is pure git — no npm packages, no Python dependencies, no API calls
- Use `ctx_batch_execute` to run all git commands in one call when possible
- For large repos, limit `git log` output with `--max-count=500` as a safety valve
- Commit message prefixes follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- The existing `git-workflow` skill defines commit conventions — reference it for prefix definitions
