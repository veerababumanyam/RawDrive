---
name: git-workflow
aliases: [git, commits, branches, pr, pull-request, version-control]
description: Git workflow conventions for RawDrive. Use when creating commits, branches, pull requests, or reviewing code changes.
---

# Git Workflow

## Branch Naming

```bash
feature/add-album-sharing      # New features
fix/photo-upload-timeout       # Bug fixes
refactor/gallery-service       # Code improvements
docs/api-documentation         # Documentation
chore/update-dependencies      # Maintenance
hotfix/critical-auth-bug       # Production fixes
```

### Pattern

```
{type}/{short-description}
```

| Type | Use Case |
|------|----------|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring (no behavior change) |
| `docs/` | Documentation only |
| `chore/` | Build, deps, tooling |
| `hotfix/` | Urgent production fixes |

## Commit Messages

### Format

```
type(scope): description

[optional body]

[optional footer]
```

### Examples

```bash
feat(gallery): add bulk photo selection
fix(upload): handle timeout on large files
refactor(auth): extract token validation to middleware
docs(api): add gallery endpoints documentation
test(photos): add integration tests for upload flow
chore(deps): update React to v19.1

# With ticket reference
feat(gallery): add sharing feature [RAW-123]

# With breaking change
feat(api)!: change gallery response format

BREAKING CHANGE: Gallery response now uses `items` instead of `galleries`
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change (no feature/fix) |
| `docs` | Documentation |
| `test` | Adding/updating tests |
| `chore` | Build, deps, config |
| `style` | Formatting (no code change) |
| `perf` | Performance improvement |

### Scopes (Common)

| Scope | Area |
|-------|------|
| `gallery` | Gallery features |
| `upload` | Upload system |
| `auth` | Authentication |
| `api` | API endpoints |
| `ui` | UI components |
| `db` | Database/migrations |
| `ai` | AI features |
| `storage` | R2/BYOS storage |

## Pull Request Guidelines

### PR Title

Same format as commit messages:

```
feat(gallery): add bulk selection and download
```

### PR Template

```markdown
## Summary

Brief description of what this PR does.

## Changes

- Added bulk selection to gallery grid
- Implemented ZIP download for selected photos
- Added progress indicator for downloads

## Testing

- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] Tested in dark mode
- [ ] Tested on mobile

## Screenshots

(if UI changes)

## Related Issues

Closes #123
```

### PR Checklist

Before requesting review:

- [ ] Branch is up to date with `main`
- [ ] All tests pass
- [ ] Linting passes (`npm run lint`, `ruff check`)
- [ ] No console.log or debug code
- [ ] Commit messages follow conventions
- [ ] Self-reviewed the diff
- [ ] Added tests for new functionality
- [ ] Updated documentation if needed

### PR Size Guidelines

| Size | Lines Changed | Review Time |
|------|---------------|-------------|
| XS | < 50 | ~10 min |
| S | 50-200 | ~30 min |
| M | 200-500 | ~1 hour |
| L | 500-1000 | Split if possible |
| XL | > 1000 | Must split |

**Prefer smaller PRs** - easier to review, faster to merge, less risk.

## Git Commands

### Daily Workflow

```bash
# Start new feature
git checkout main
git pull origin main
git checkout -b feature/my-feature

# Work on feature
git add -A
git commit -m "feat(scope): description"

# Push and create PR
git push -u origin feature/my-feature
gh pr create --fill
```

### Keeping Branch Updated

```bash
# Rebase on main (preferred for clean history)
git fetch origin
git rebase origin/main

# Or merge (if conflicts are complex)
git merge origin/main
```

### Fixing Commits

```bash
# Amend last commit (before push)
git commit --amend -m "fix(scope): better message"

# Interactive rebase (before push)
git rebase -i HEAD~3

# Undo last commit (keep changes)
git reset --soft HEAD~1
```

### Stashing

```bash
# Save work temporarily
git stash push -m "WIP: gallery feature"

# List stashes
git stash list

# Apply and remove
git stash pop

# Apply specific stash
git stash apply stash@{2}
```

## Protected Branches

### `main`

- Requires PR with approval
- Must pass CI checks
- No force push
- Squash merge preferred

### Release Process

```bash
# Tag release
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0

# Hotfix process
git checkout -b hotfix/critical-bug main
# ... fix bug ...
git commit -m "fix(auth): critical security patch"
git push -u origin hotfix/critical-bug
# Create PR to main
```

## Code Review Etiquette

### As Author

- Keep PRs focused and small
- Respond to feedback promptly
- Don't take feedback personally
- Explain complex changes in PR description

### As Reviewer

- Be constructive and specific
- Suggest, don't demand
- Approve if changes are minor
- Use conventional comments:

```
# Blocking issue
🔴 This will cause a null pointer exception

# Suggestion (non-blocking)
💡 Consider using useMemo here for performance

# Question
❓ Why was this approach chosen over X?

# Nitpick (optional)
🔵 Nit: Prefer const over let here
```

## .gitignore Essentials

```gitignore
# Dependencies
node_modules/
.venv/
__pycache__/

# Build
dist/
build/
*.egg-info/

# Environment
.env
.env.local
*.pem

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Test
coverage/
.pytest_cache/
```

## Useful Aliases

```bash
# Add to ~/.gitconfig
[alias]
  co = checkout
  br = branch
  ci = commit
  st = status
  lg = log --oneline --graph --decorate -20
  unstage = reset HEAD --
  last = log -1 HEAD
  amend = commit --amend --no-edit
```
