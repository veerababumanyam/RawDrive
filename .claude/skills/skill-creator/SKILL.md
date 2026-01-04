---
name: skill-creator
aliases: [skills, claude-skills, skill-template]
description: Create and maintain Claude Code skills for RawDrive. Use when building new skills, reviewing skill structure, or updating existing skills.
---

# RawDrive Skill Creator

## Existing Skills

| Skill | Purpose |
|-------|---------|
| `project-structure` | Codebase layout, file locations, conventions |
| `testing` | Test patterns, fixtures, coverage |
| `security` | Auth, RBAC, data protection |
| `performance` | Optimization, caching, scaling |
| `accessibility` | WCAG compliance, ARIA patterns |
| `design-system` | UI components, tokens, themes |
| `saas-practices` | Multi-tenancy, billing, subscriptions |
| `ai-mcp-integration` | AI features, MCP tools |
| `frontend-design` | Premium UI aesthetics |
| `ide` | Claude Code IDE integration |

## RawDrive Project Structure

```
RawDrive/
├── frontend/              # React 19 + Vite + TypeScript
│   └── src/
│       ├── components/ui/     # Design system components
│       ├── hooks/             # Custom React hooks
│       ├── services/          # API clients
│       └── pages/             # Page components
│
├── backend/               # Python 3.11 + FastAPI
│   └── src/app/
│       ├── api/v1/            # Route handlers
│       ├── services/          # Business logic
│       ├── repositories/      # Database access
│       └── models/            # SQLAlchemy models
│
├── ai-service/            # Python FastAPI + MCP
│   └── src/
│       └── mcp/               # MCP server tools
│
└── .claude/skills/        # Claude skills
```

## Creating a New Skill

### 1. Create Directory

```bash
mkdir -p .claude/skills/my-skill/references
```

### 2. Create SKILL.md

```markdown
---
name: my-skill
description: One sentence describing when to use this skill.
---

# Skill Title

## Key Files

| Purpose | Location |
|---------|----------|
| Main service | `backend/src/app/services/my_service.py` |
| API routes | `backend/src/app/api/v1/my_routes.py` |
| Frontend hook | `frontend/src/hooks/useMyFeature.ts` |

## Patterns

### Backend Pattern

```python
# backend/src/app/services/my_service.py

class MyService:
    async def get_by_id(self, workspace_id: UUID, id: UUID):
        # ALWAYS include workspace_id for tenant isolation
        return await self.repo.get_by_id(workspace_id, id)
```

### Frontend Pattern

```typescript
// frontend/src/hooks/useMyFeature.ts

export function useMyFeature(id: string) {
  return useQuery({
    queryKey: ['my-feature', id],
    queryFn: () => api.get(`/api/v1/my-feature/${id}`),
  });
}
```

## Best Practices

### Do
- Include workspace_id in all queries
- Use existing UI components

### Don't
- Hardcode secrets or API keys
- Skip error handling
```

## Size Guidelines

| Content | Max Lines |
|---------|-----------|
| SKILL.md | 500 |
| Reference files | 300 each |

## Skill Template

Copy this template for new skills:

```markdown
---
name: skill-name
description: Brief description. Use when [specific trigger].
---

# Skill Title

## Key Files

| Purpose | Location |
|---------|----------|
| File 1 | `path/to/file` |

## Patterns

### Pattern Name

```language
// path/to/example.ext
code example here
```

## Best Practices

### Do
- Action 1
- Action 2

### Don't
- Anti-pattern 1
- Anti-pattern 2
```

## Tech Stack Reference

When creating skills, use these technologies:

### Backend (Python)
```python
# Imports
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

# Dependencies
from app.api.dependencies import get_db, get_current_user, get_current_workspace
```

### Frontend (TypeScript)
```typescript
// Imports
import { useQuery, useMutation } from '@tanstack/react-query';
import { AppButton, AppCard, AppInput } from '@/components/ui';
import type { Gallery, Asset } from '@/types';
```

## Checklist

Before finalizing a skill:

- [ ] Paths match actual project structure
- [ ] Code examples are runnable
- [ ] Under 500 lines
- [ ] No duplicate CLAUDE.md content
- [ ] Focused on one domain
- [ ] Uses correct tech stack (Python backend, TS frontend)
