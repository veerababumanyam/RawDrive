# GSD Quick Start Guide for RawDrive

**Quick reference for using GSD (Get Shit Done) with RawDrive's existing infrastructure.**

---

## Installation

```bash
# Install GSD locally for this project (recommended)
npx get-shit-done-cc --claude --local

# Or install globally for all projects
npx get-shit-done-cc --claude --global

# Verify installation
/gsd:help
```

---

## Core Workflow Commands

### For New Features

```bash
# 1. Map existing codebase first (recommended)
/gsd:map-codebase
# → Analyzes stack, architecture, conventions, concerns

# 2. Create new project/feature
/gsd:new-project
# → Questions → Research → Requirements → Roadmap

# 3. Discuss phase (capture implementation decisions)
/gsd:discuss-phase 1
# → Visual features, API format, error handling, etc.

# 4. Plan phase
/gsd:plan-phase 1
# → Research + create plans + verify

# 5. Execute phase
/gsd:execute-phase 1
# → Implement with atomic git commits

# 6. Verify work
/gsd:verify-work 1
# → User acceptance testing

# Repeat for each phase...
/gsd:complete-milestone
/gsd:new-milestone
```

### For Quick Tasks

```bash
# Ad-hoc tasks with GSD guarantees
/gsd:quick
> "Fix login bug in gallery service"
```

---

## GSD + RawDrive Integration Points

### Security

GSD plans can reference RawDrive's security skill:

```xml
<task type="auto">
  <name>Implement JWT authentication</name>
  <action>
    Use backend/src/app/core/security.py patterns.
    Follow .claude/skills/security/SKILL.md guidelines:
    - JWT with 15min access token
    - Argon2 for password hashing
    - Workspace isolation mandatory
  </action>
  <verify>
    pytest tests/test_auth.py passes
    Workspace_id always in queries
  </verify>
</task>
```

### File Structure

GSD respects RawDrive's project structure:

```xml
<task type="auto">
  <name>Create face cache service</name>
  <files>
    backend/src/app/services/face_cache_manager.py
    backend/src/app/repositories/face_cache_repository.py
    backend/src/app/models/face_cache.py
  </files>
  <action>
    Follow .claude/skills/project-structure/SKILL.md:
    - Repository for database queries
    - Service for business logic
    - Models for SQLAlchemy schema
    - Always include workspace_id in queries
  </action>
</task>
```

### Shared Types

```xml
<task type="auto">
  <name>Add gallery export feature</name>
  <action>
    Import from @rawdrive/shared-types:
    - GalleryStatus, GalleryVisibility
    Use @rawdrive/shared-constants:
    - API_BASE, EXPORT_FORMATS
  </action>
  <verify>
    pnpm generate:python run after changes
    Type parity tests pass
  </verify>
</task>
```

---

## GSD File Locations

GSD creates files in `.planning/` (separate from RawDrive's `docs/`):

```
.planning/
├── PROJECT.md           # Vision
├── REQUIREMENTS.md      # v1/v2 scope
├── ROADMAP.md           # Phases
├── STATE.md             # Session memory
├── research/            # Domain research
└── todos/               # Ideas backlog
```

**Note:** These are transient planning artifacts, not enterprise documentation.

---

## When to Use GSD vs RawDrive Tools

| Use GSD for... | Use RawDrive tools for... |
|----------------|---------------------------|
| New microservices | Enterprise features with compliance |
| Standalone features | Team coordination and ceremonies |
| Experimental work | SOC 2 requirements |
| Quick bug fixes | Audit documentation |
| API endpoints | Business feature specs |
| Frontend components | Technical specs (JSON) |

---

## Example: Adding a New API Endpoint

```bash
# Start with quick mode for simple endpoint
/gsd:quick
> "Add GET /api/v1/face-similar/{asset_id} endpoint"

# GSD will:
# 1. Create plan with XML structure
# 2. Reference security skill (workspace_id)
# 3. Reference project-structure skill
# 4. Create atomic git commit
# 5. Verify with tests
```

---

## Atomic Git History Example

After `/gsd:execute-phase`, you'll get clean history:

```bash
git log --oneline

abc123f feat(08-02): add face similarity endpoint
def456g feat(08-02): implement vector search logic
hij789k feat(08-02): add workspace isolation check
klm012o feat(08-02): add rate limiting
```

Each commit is independently revertable.

---

## Tips for RawDrive Users

1. **Run `/gsd:map-codebase` first** - Helps GSD understand RawDrive's patterns
2. **Reference skills in plans** - GSD can read `.claude/skills/`
3. **Keep `docs/` separate** - GSD artifacts in `.planning/`, docs in `docs/`
4. **Use shared types** - Reference `@rawdrive/shared-*` in plans
5. **Follow workspace isolation** - Every query needs `workspace_id`
6. **Atomic commits are good** - Can be squashed in PRs if needed

---

## Common Commands

```bash
/gsd:progress              # Where am I?
/gsd:settings              # Configure model profile
/gsd:set-profile quality   # Use Opus for planning
/gsd:add-todo "Consider X"  # Capture idea
/gsd:check-todos           # List todos
/gsd:debug "describe issue" # Systematic debugging
```

---

## See Also

- [GSD Integration Analysis](GSD_INTEGRATION_ANALYSIS.md) - Full analysis
- [GSD GitHub](https://github.com/glittercowboy/get-shit-done) - Official docs
- [RawDrive Project Structure](.claude/skills/project-structure/SKILL.md) - File rules
- [RawDrive Security Guidelines](.claude/skills/security/SKILL.md) - Security patterns
