---
name: doc-sync
description: "Use when asked to update docs, sync documentation, check for stale docs, or after shipping a feature that changed behavior. Cross-references git diff against all documentation files and auto-updates what drifted. Also use before creating a PR to ensure docs match code changes. Triggers on: update docs, sync docs, stale docs, doc drift, documentation check, pre-PR docs, release notes, changelog."
---

# Documentation Sync

Keeps all RawDrive documentation in sync with code changes. Adapted from gstack's `/document-release` methodology — diff-driven, classify-then-act.

## When to Use

- After shipping a feature that changed behavior
- Before creating a PR (ensure docs match code)
- When asked to "update docs" or "check for stale docs"
- After refactoring that moved/renamed files or changed APIs

## Workflow

### Step 1 — Diff Analysis

Read the git diff to understand what changed:

```bash
# Staged + unstaged changes
git diff HEAD --name-only
git diff HEAD

# Between branches (e.g., feature vs main)
git diff main...HEAD --name-only
git diff main...HEAD
```

Focus on: new/moved/deleted files, changed function signatures, new endpoints, config changes, new services, new env vars.

### Step 2 — Documentation Discovery

Scan ALL documentation locations:

| Location | Files | What They Cover |
|----------|-------|-----------------|
| Root | `CLAUDE.md`, `README.md` | Project overview, commands, architecture tables |
| `.claude/` | `PRD.md` | Product requirements, architecture, tech stack |
| `.claude/reference/` | `*.md` (24 guides) | Best practices per domain |
| `.claude/skills/` | `README.md`, `*/SKILL.md` | Skills index and individual skill docs |
| `docs/Features/` | `*.md` | Feature specifications |
| `docs/Business_Features/` | `*.md` | Business feature specs |
| `docs/TechnicalSpecs/` | `*.json` | Validated specs (has `_schema.json`) |
| `docs/` | `ARCHITECTURE_QUICK_REFERENCE.md`, `TEST_USERS.md` | Architecture, test data |
| `docs/runbooks/` | `*.md` | Operational guides |
| `docs/troubleshooting/` | `*.md` | Debugging guides |
| `services/*/` | `README.md` | Per-service documentation |

### Step 3 — Cross-Reference

For each doc, check if the diff affects anything it describes:

- **File paths** — moved or renamed files referenced in docs
- **Command examples** — changed CLI, Docker, or pnpm commands
- **Architecture tables** — new/removed services, port changes
- **API endpoints** — new or changed routes
- **Feature descriptions** — changed behavior or new capabilities
- **Tech spec JSON** — behavior changes require `lastUpdated` update
- **Environment variables** — new or removed env vars
- **Skill descriptions** — changed triggers or patterns
- **Version numbers** — bumped versions in code but not in docs

### Step 4 — Classification

Classify each finding into one of three categories:

| Category | Criteria | Action |
|----------|----------|--------|
| **AUTO-UPDATE** | Mechanical: file paths, counts, command syntax, port numbers, `lastUpdated` timestamps | Fix silently |
| **ASK** | Subjective: feature descriptions, architecture decisions, product wording | Present options to user |
| **CURRENT** | Doc is accurate, no drift detected | Skip with confirmation note |

### Step 5 — Apply Updates

1. Make all AUTO-UPDATE changes directly
2. Present ASK items to the user with before/after snippets
3. List CURRENT docs as confirmed accurate

## RawDrive-Specific Rules

### New Microservice Added
Update ALL of these:
- `CLAUDE.md` — service table (name, port, purpose, reference link)
- `docs/ARCHITECTURE_QUICK_REFERENCE.md` — architecture diagram/list
- `.claude/PRD.md` — architecture section

### New Skill Added
Update ALL of these:
- `.claude/skills/README.md` — skills index table
- `CLAUDE.md` — skills section table

### Docker Compose Changed
Update: `CLAUDE.md` commands section (startup instructions, port mappings)

### Tech Spec Behavior Changed
ALWAYS update the `lastUpdated` field in the affected `docs/TechnicalSpecs/*.json` file.

```json
{
  "lastUpdated": "2026-03-18"
}
```

### New Environment Variable
Update: `CLAUDE.md` env vars section, relevant service README, `.env.example` if present.

### Terminology Consistency
Always use canonical terms from the specs:
- `workspace_id` (not tenant_id, org_id)
- Share Links (not shared links, sharing links)
- download policies: `view_only | web_only | watermarked_only | original_allowed`

## Output Format

After running, produce a summary:

```
## Doc Sync Summary

### Auto-Updated (N files)
- CLAUDE.md — updated service table (added new-service on port 8015)
- docs/TechnicalSpecs/gallery.json — updated lastUpdated

### Needs Review (N items)
- .claude/PRD.md — feature X description may need rewording (see diff below)
  - Current: "..."
  - Suggested: "..."

### Confirmed Current (N files)
- .claude/reference/fastapi-best-practices.md — no drift
- docs/Features/gallery.md — no drift

### Commit
docs: sync documentation with [branch/feature] changes
```

## Anti-Patterns

- Never update docs without reading the diff first
- Never skip `lastUpdated` on tech spec JSON changes
- Never add a service to one doc but not the others
- Never hardcode model names, API keys, or colors in doc examples
- Never create new doc files when existing ones should be updated instead
