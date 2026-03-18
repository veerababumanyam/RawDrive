---
name: pre-landing-review
description: Use when asked to review code before merging, do a pre-landing review, check a diff for issues, or review a PR. Two-pass analysis focusing on RawDrive-critical patterns like multi-tenant isolation violations, SQL safety, LLM trust boundaries, and race conditions. Also triggers on "review this", "check my changes", or "is this safe to merge".
---

# Pre-Landing Review

Two-pass code review tailored to RawDrive2 multi-tenant SaaS photography platform.
Catches critical issues that generic review tools (CodeRabbit, pr-review-toolkit) miss:
workspace isolation violations, LLM trust boundary leaks, cross-service auth gaps, and
async race conditions across 13 FastAPI microservices.

---

## Activation

Run this skill when the user says any of:
- "review", "pre-landing review", "review this PR"
- "check my changes", "check this diff"
- "is this safe to merge", "can I land this"
- "code review", "review before merge"

---

## Workflow

### Step 0 — Gather the Diff

1. Determine the target branch (default: `main`).
2. Collect the diff:
   ```bash
   git diff main...HEAD --stat
   git diff main...HEAD
   ```
3. If the user provides a PR number, use `gh pr diff <number>`.
4. Identify changed files and categorize:
   - **Backend**: `backend/`, `services/*/src/`
   - **Frontend**: `frontend/src/`
   - **Migrations**: `**/alembic/versions/`
   - **Config/Infra**: `docker-compose*.yml`, `traefik/`, `infrastructure/`
   - **Shared packages**: `packages/`

### Step 1 — Pass 1: CRITICAL (Must Fix Before Merge)

Scan every changed file for the following. Any finding here **blocks the merge**.

#### 1.1 Multi-Tenant Isolation

- Every `select()`, `query()`, `delete()`, `update()` in repository or service
  layers MUST include a `.where(...workspace_id == workspace_id)` clause.
- Flag raw SQL strings that reference tenant-scoped tables without a
  `workspace_id` parameter.
- Flag any endpoint that reads `workspace_id` from request body or query
  params instead of extracting it from the JWT token.

```
Pattern to grep:
  select(        -> must have workspace_id within 5 lines
  db.execute(    -> must have workspace_id within 5 lines
  .query(        -> must have workspace_id within 5 lines
  .delete(       -> must have workspace_id within 5 lines
  .update(       -> must have workspace_id within 5 lines
```

#### 1.2 SQL and Data Safety

- **Raw SQL**: Flag `text()`, f-strings in queries, string concatenation in SQL.
- **N+1 queries**: New relationship access in loops without `selectinload()` or
  `joinedload()` in the original query.
- **Missing indexes**: New foreign key columns without a corresponding index
  (check Alembic migration or model definition for `index=True`).
- **Unbounded queries**: `select()` without `.limit()` on user-facing endpoints.

#### 1.3 Race Conditions and Concurrency

- Async functions that read-then-write without `SELECT ... FOR UPDATE` or
  application-level locking.
- Shared mutable state (module-level dicts/lists mutated in async handlers).
- Multi-step operations (e.g., check balance, deduct, record) without a
  database transaction (`async with session.begin()`).
- Missing `await` on coroutines (fire-and-forget without explicit background task).

#### 1.4 LLM Output Trust Boundary

- AI/LLM response text used in:
  - SQL queries: must be parameterized, never interpolated.
  - HTML rendering: must be sanitized (`sanitizeHtml` from `@rawdrive/shared-validation`).
  - File system paths: must be validated against path traversal.
  - Redirect URLs: must be validated against open redirect.
- User prompts passed to LLM without a system prompt or guardrails.
- LLM-generated JSON parsed without schema validation (use Pydantic).

#### 1.5 JWT and Auth

- New API routes missing `Depends(get_current_user)` or equivalent auth guard.
- New microservice endpoints missing JWT validation middleware.
- `workspace_id` sourced from anywhere other than the decoded JWT.
- Missing RBAC permission checks on destructive operations (DELETE, bulk updates).
- Workspace RBAC mixed with Platform RBAC (these are separate systems).

#### 1.6 Enum and Value Completeness

- New enum values added without updating all `match`/`switch` statements.
- New Python `Enum` or TypeScript `enum` without corresponding Alembic migration
  (if stored in DB).
- Missing exhaustiveness checks (Python: no `case _` default; TypeScript: no
  `default` or `never` check).

### Step 2 — Pass 2: INFORMATIONAL (Improve but Do Not Block)

These findings are reported but do not block the merge.

#### 2.1 Conditional Side Effects

- Side effects (emails, webhooks, billing charges, analytics events) inside
  `if`/`try` blocks that may silently not execute.
- Missing error handling around external service calls (Stripe, SendGrid, R2).

#### 2.2 Magic Numbers and String Coupling

- Hardcoded colors: must use design tokens from `@rawdrive/shared-constants`.
- Hardcoded AI model names: must use `AI_MODEL` env var.
- Hardcoded URLs, ports, or service names: must use config/constants.
- Magic numbers without named constants.

#### 2.3 Dead Code and Consistency

- Unused imports.
- Commented-out code blocks (more than 3 lines).
- Inconsistent naming (e.g., `camelCase` in Python, `snake_case` in TypeScript).
- Functions/methods that duplicate existing shared utilities.

#### 2.4 Test Gaps

- New code paths without corresponding test files.
- Modified behavior without updated test assertions.
- Test files that import from wrong paths or use outdated fixtures.
- Missing edge case tests for error/empty states.

#### 2.5 Frontend Patterns

- Missing loading states (no `isLoading` / `isPending` handling).
- Missing error boundaries or error state UI.
- Missing accessibility: `aria-label`, `role`, keyboard navigation.
- Direct color values instead of Tailwind classes or design tokens.
- Components not following the `features/` directory structure.

### Step 3 — Fix-First Flow

After both passes:

1. **AUTO-FIX** (apply without asking):
   - Add missing `workspace_id` filter when the pattern is unambiguous
     (repository method has `workspace_id` param but query omits it).
   - Remove unused imports.
   - Add missing type annotations where inference is clear.
   - Replace hardcoded colors with design token references (when mapping is obvious).
   - Add missing `await` on clearly async calls.

2. **ASK** (present the issue, propose a fix, wait for confirmation):
   - Architecture or design decisions.
   - Business logic changes.
   - Security-sensitive modifications (auth, RBAC, encryption).
   - New dependency additions.
   - Changes that affect multiple services.

3. **Commit auto-fixes** as:
   ```
   fix(review): pre-landing review fixes
   ```

### Step 4 — RawDrive Checklist

Print this checklist with pass/fail status for each item:

```
## Pre-Landing Checklist

- [ ] Every new repository method filters by workspace_id
- [ ] New API endpoints have auth middleware (Depends(get_current_user))
- [ ] New microservice endpoints validate JWT tokens
- [ ] AI/LLM outputs are sanitized before use in SQL/HTML/paths
- [ ] Database schema changes have corresponding Alembic migration
- [ ] New enum values handled in all match/switch statements
- [ ] Frontend components use design system tokens (no hardcoded colors)
- [ ] Shared types added to @rawdrive/shared-types if cross-package
- [ ] New services include /health/live and /health/ready endpoints
- [ ] Async operations use proper transactions for multi-step writes
- [ ] Docker exec commands reference correct service name
- [ ] No secrets, API keys, or credentials in committed code
```

Mark each item: `[x]` pass, `[!]` violation found, `[-]` not applicable.

### Step 5 — Output Format

Present findings in this structure:

```
## Pre-Landing Review: <branch-name>

### Files Reviewed
<list of files with categories>

### Pass 1 — CRITICAL (N findings)

#### [C1] <Category>: <Short description>
- **File**: `path/to/file.py:42`
- **Severity**: CRITICAL
- **Issue**: <What is wrong>
- **Fix**: <Exact code change or recommendation>
- **Auto-fixed**: Yes / No

...

### Pass 2 — INFORMATIONAL (N findings)

#### [I1] <Category>: <Short description>
- **File**: `path/to/file.ts:18`
- **Severity**: INFO
- **Issue**: <What is wrong>
- **Suggestion**: <Recommended improvement>

...

### Pre-Landing Checklist
<checklist from Step 4>

### Verdict
- **CRITICAL issues**: N (must fix)
- **Informational**: N (optional)
- **Auto-fixed**: N items
- **Recommendation**: SAFE TO MERGE / FIX REQUIRED / NEEDS DISCUSSION
```

---

## Key References

When reviewing, consult these project files for authoritative patterns:

| Domain | Reference |
|--------|-----------|
| Multi-tenant isolation | `.claude/skills/multi-tenant-security/SKILL.md` |
| FastAPI 3-layer pattern | `.claude/skills/fastapi-services/SKILL.md` |
| Database and migrations | `.claude/skills/database-migrations/SKILL.md` |
| Frontend components | `.claude/skills/react-frontend/SKILL.md` |
| AI/ML integration | `.claude/skills/ai-ml-integration/SKILL.md` |
| Security practices | `.claude/reference/security-best-practices.md` |
| Coding standards | `.claude/reference/coding-standards.md` |
| Design system | `.claude/skills/design-system/SKILL.md` |

---

## Examples

### Example: Missing workspace_id (CRITICAL)

```python
# BAD — missing workspace_id isolation
async def get_galleries(self, db: AsyncSession) -> list[Gallery]:
    result = await db.execute(select(Gallery))
    return result.scalars().all()

# GOOD — workspace-scoped query
async def get_galleries(self, db: AsyncSession, workspace_id: UUID) -> list[Gallery]:
    result = await db.execute(
        select(Gallery).where(Gallery.workspace_id == workspace_id)
    )
    return result.scalars().all()
```

### Example: LLM trust boundary violation (CRITICAL)

```python
# BAD — LLM output interpolated into SQL
description = await llm.generate(prompt)
await db.execute(text(f"UPDATE assets SET description = '{description}' WHERE id = :id"))

# GOOD — parameterized query with sanitized output
description = sanitize_text(await llm.generate(prompt))
await db.execute(
    text("UPDATE assets SET description = :desc WHERE id = :id"),
    {"desc": description, "id": asset_id}
)
```

### Example: Race condition (CRITICAL)

```python
# BAD — read-then-write without locking
album = await repo.get_album(album_id, workspace_id)
album.photo_count += 1
await repo.save(album)

# GOOD — atomic update or SELECT FOR UPDATE
await db.execute(
    update(Album)
    .where(Album.id == album_id, Album.workspace_id == workspace_id)
    .values(photo_count=Album.photo_count + 1)
)
```
