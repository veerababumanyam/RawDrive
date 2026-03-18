---
name: git-workflow
description: "Git workflow conventions for RawDrive: conventional commits, branch strategy, PR process, CI/CD pipeline, and GitHub Actions. Use this skill when creating commits, branches, pull requests, or working with the CI/CD pipeline. Also use for understanding the branching strategy, commit message format, or deployment workflow. Triggers on: commit, branch, pull request, PR, merge, git workflow, conventional commit, CI/CD, deploy, release, version tag."
---

# Git Workflow

RawDrive uses conventional commits, feature branches, and GitHub Actions for CI/CD.

## Commit Message Format

```
<type>(<scope>): <subject>

# Examples:
feat(gallery): add password protection for shared galleries
fix(auth): resolve token expiration race condition
chore(deps): update SQLAlchemy to 2.0.35
refactor(billing): extract payment validation to service layer
docs(api): update gallery endpoint documentation
test(faces): add integration tests for face grouping
perf(gallery-service): optimize 3-tier cache invalidation
```

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance, deps, config |
| `refactor` | Code restructuring (no behavior change) |
| `docs` | Documentation only |
| `test` | Adding/updating tests |
| `perf` | Performance improvement |
| `style` | Formatting (no logic change) |
| `ci` | CI/CD changes |

**Scope** matches the service/area: `gallery`, `auth`, `billing`, `faces`, `invitations`, `upload`, `frontend`, `deps`, `docker`, `api`

## Branch Strategy

```
main (protected)
├── feature/gallery-password-protection
├── feature/invitation-rsvp-export
├── fix/auth-token-refresh
├── chore/upgrade-react-query
└── release/v0.4.0
```

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready, protected |
| `feature/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Maintenance |
| `release/<version>` | Release preparation |

**Do NOT use:** `bugfix/`, `feat-`, `dev/`, or other formats.

## PR Process

1. Create feature branch from `main`
2. Make changes with conventional commits
3. Self-review code before opening PR
4. PR triggers CI/CD (lint, type check, tests, Docker build)
5. Merge to `main` (squash or merge commit)

### PR Checklist
- [ ] Unit tests included
- [ ] Passes lint (`pnpm lint` / `ruff check .`)
- [ ] Passes type checking (`tsc` / `mypy`)
- [ ] Self-reviewed
- [ ] No hardcoded secrets or credentials
- [ ] Migration included (if schema change)
- [ ] Documentation updated (if behavior change)

## CI/CD Pipeline (GitHub Actions)

**File:** `.github/workflows/docker-build-push.yml`

**Triggers:**
- Push to `main` or `develop`
- Version tags (`v*`)
- Path-specific: `backend/**`, `services/**`, `infrastructure/docker/**`
- Manual dispatch with service selection

**Pipeline:**
```
Push → Prepare (detect changes) → Build (Docker multi-stage) → Push to GHCR
```

**Version tagging:**
- Tags (`v1.0.0`) → release version
- `main` → `latest`
- `develop` → `develop`
- Other branches → `sha-<commit>`

## Version Numbering

Format: `v<major>.<minor>.<patch>` (e.g., `v0.3.6`)

Current: v0.4.0 — update in:
- `CLAUDE.md` version header
- `packages/api-types/package.json`
- Git tag for releases
