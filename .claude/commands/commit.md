---
description: Update the commit command to follow RawDrive's git workflow
---

# Create Git Commit

Create a conventional commit for RawDrive following the project's git workflow.

## References

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product requirements and architecture overview
- **Best Practices**:
  - [Coding Standards](../reference/coding-standards.md)
  - [Testing and Logging](../reference/testing-and-logging.md)

## Quick Usage

```bash
# Stage changes
git add .

# Create commit with this command
/commit
```

## Commit Message Format

RawDrive uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes (dependencies, etc.)

### Scopes

Common scopes in RawDrive:

- `frontend`: Frontend changes
- `backend`: Backend API changes
- `gallery`: Gallery service
- `billing`: Billing service
- `upload`: Upload service
- `webhooks`: Webhooks service
- `ai`: AI service
- `db`: Database migrations
- `docs`: Documentation
- `infra`: Infrastructure/Docker
- `deps`: Dependencies

### Examples

```bash
# Feature
feat(gallery): add magic link sharing for galleries

# Bug fix
fix(upload): resolve chunked upload timeout issue

# Documentation
docs(readme): update installation instructions

# Database migration
feat(db): add personal_profiles table

# Performance
perf(gallery): optimize asset loading with batch queries

# Breaking change
feat(api)!: change gallery endpoint response format

BREAKING CHANGE: Gallery list endpoint now returns paginated results
```

## Commit Workflow

### 1. Check Status

```bash
# See what files changed
git status

# See detailed changes
git diff

# See staged changes
git diff --cached
```

### 2. Stage Changes

```bash
# Stage all changes
git add .

# Stage specific files
git add frontend/src/components/Gallery.tsx

# Stage interactively
git add -p
```

### 3. Create Commit

```bash
# Commit with message
git commit -m "feat(gallery): add photo favorites feature"

# Commit with body
git commit -m "feat(gallery): add photo favorites feature" -m "
- Add favorites toggle button
- Store favorites in database
- Add favorites filter to gallery view
"

# Amend last commit
git commit --amend

# Amend without changing message
git commit --amend --no-edit
```

### 4. Verify Commit

```bash
# View last commit
git show

# View commit history
git log --oneline -5

# View commit with files
git show --stat
```

## Pre-Commit Checks

Before committing, ensure:

### Linting Passes

```bash
# Frontend
cd frontend && pnpm lint

# Backend
docker exec rawdrive-backend ruff check src
```

### Tests Pass

```bash
# Frontend
cd frontend && pnpm test

# Backend
docker exec rawdrive-backend pytest
```

### Type Checking

```bash
# Frontend
cd frontend && pnpm type-check

# Backend
docker exec rawdrive-backend mypy src
```

## Commit Best Practices

### DO

✅ Write clear, descriptive commit messages
✅ Use conventional commit format
✅ Keep commits focused and atomic
✅ Reference issue numbers when applicable
✅ Run tests before committing
✅ Stage related changes together

### DON'T

❌ Commit broken code
❌ Mix unrelated changes in one commit
❌ Use vague messages like "fix stuff"
❌ Commit sensitive data (API keys, passwords)
❌ Commit large binary files
❌ Commit generated files (node_modules, dist)

## Common Commit Scenarios

### New Feature

```bash
git add frontend/src/components/NewFeature.tsx
git add backend/src/app/api/v1/new_feature.py
git commit -m "feat(api): add new feature endpoint

- Add NewFeature component
- Create API endpoint
- Add tests
- Update documentation
"
```

### Bug Fix

```bash
git add services/gallery-service/src/api/v1/galleries.py
git commit -m "fix(gallery): resolve null pointer in gallery list

Fixes #123
"
```

### Database Migration

```bash
git add backend/migrations/versions/0157_add_feature_table.py
git add backend/src/app/models/feature.py
git commit -m "feat(db): add feature table for new functionality

- Create feature table with workspace isolation
- Add indexes on workspace_id and created_at
- Update models
"
```

### Documentation Update

```bash
git add README.md
git add docs/Features/NEW_FEATURE.md
git commit -m "docs: add documentation for new feature

- Update README with feature description
- Add detailed feature documentation
- Include API examples
"
```

### Dependency Update

```bash
git add frontend/package.json
git add frontend/pnpm-lock.yaml
git commit -m "chore(deps): update React to v19.0.1"
```

## Advanced Git Operations

### Interactive Rebase

```bash
# Rebase last 3 commits
git rebase -i HEAD~3

# Squash commits
# Edit commit messages
# Reorder commits
```

### Cherry Pick

```bash
# Apply specific commit from another branch
git cherry-pick <commit-hash>
```

### Stash Changes

```bash
# Stash uncommitted changes
git stash

# List stashes
git stash list

# Apply stash
git stash pop

# Apply specific stash
git stash apply stash@{0}
```

## Commit Hooks

RawDrive uses Git hooks for automation:

### Pre-Commit Hook

`.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Run linters
cd frontend && pnpm lint || exit 1
docker exec rawdrive-backend ruff check src || exit 1

# Run type check
cd frontend && pnpm type-check || exit 1

echo "✓ Pre-commit checks passed"
```

### Commit Message Hook

`.git/hooks/commit-msg`:

```bash
#!/bin/bash

# Validate conventional commit format
commit_msg=$(cat "$1")
pattern="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?: .+"

if ! echo "$commit_msg" | grep -qE "$pattern"; then
  echo "Error: Commit message must follow conventional commits format"
  echo "Example: feat(gallery): add new feature"
  exit 1
fi
```

## Notes

- Always pull before pushing: `git pull --rebase`
- Use feature branches for new work
- Keep commits small and focused
- Write commit messages for future you
- Reference issues in commit messages
