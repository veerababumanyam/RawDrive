# RawDrive Claude Code Skills

This directory contains specialized skills that Claude Code auto-loads based on context. Skills provide domain-specific knowledge, patterns, and best practices for the RawDrive codebase.

## How Skills Work

- **Auto-loaded**: Skills are automatically activated when you mention related terms
- **Aliases**: Each skill has aliases for flexible matching (e.g., "a11y" triggers `accessibility`)
- **Focused**: Each skill covers one domain to keep context efficient

## Available Skills

### Core Development

| Skill | Aliases | Purpose |
|-------|---------|---------|
| [project-structure](project-structure/SKILL.md) | `codebase`, `architecture`, `folders`, `conventions`, `layout`, `organization` | Codebase layout, file locations, naming conventions |
| [testing](testing/SKILL.md) | `tests`, `vitest`, `pytest`, `coverage`, `fixtures`, `unit-tests`, `integration-tests` | Test patterns, fixtures, coverage requirements |
| [git-workflow](git-workflow/SKILL.md) | `git`, `commits`, `branches`, `pr`, `pull-request`, `version-control` | Commit messages, branch naming, PR process |
| [api-standards](api-standards/SKILL.md) | `api`, `rest`, `endpoints`, `http`, `responses`, `pagination` | REST conventions, response formats, versioning |

### Frontend

| Skill | Aliases | Purpose |
|-------|---------|---------|
| [frontend-design](frontend-design/SKILL.md) | `ui-design`, `frontend`, `react-components`, `pages`, `premium-ui`, `cinematic`, `landing-page` | Premium UI aesthetics, page layouts, design thinking |
| [design-system](design-system/SKILL.md) | `ui`, `styling`, `tokens`, `theme`, `colors`, `components`, `tailwind`, `css` | Color tokens, typography, UI component patterns |
| [accessibility](accessibility/SKILL.md) | `a11y`, `wcag`, `aria`, `keyboard-nav`, `screen-reader` | WCAG 2.1 AA compliance, ARIA patterns |
| [webapp-testing](webapp-testing/SKILL.md) | `e2e`, `playwright`, `browser-testing`, `screenshots`, `ui-testing` | Playwright MCP testing, browser automation |
| [web-artifacts-builder](web-artifacts-builder/SKILL.md) | `prototype`, `bundle`, `demo`, `standalone-html`, `component-demo` | Standalone prototypes, bundled HTML demos |

### Backend & Infrastructure

| Skill | Aliases | Purpose |
|-------|---------|---------|
| [security](security/SKILL.md) | `auth`, `authentication`, `authorization`, `rbac`, `encryption`, `soc2`, `gdpr`, `jwt` | Auth flows, RBAC, encryption, compliance |
| [storage](storage/SKILL.md) | `uploads`, `r2`, `byos`, `s3`, `files`, `assets`, `object-storage` | R2 storage, BYOS integration, upload flows |
| [performance](performance/SKILL.md) | `optimization`, `caching`, `scaling`, `web-vitals`, `latency`, `speed` | Caching strategies, query optimization, Core Web Vitals |
| [error-handling](error-handling/SKILL.md) | `errors`, `exceptions`, `error-boundary`, `error-messages` | Error boundaries, user-friendly messages, logging |

### AI & Platform

| Skill | Aliases | Purpose |
|-------|---------|---------|
| [ai-mcp-integration](ai-mcp-integration/SKILL.md) | `ai`, `mcp`, `llm`, `agents`, `face-detection`, `smart-tagging`, `embeddings`, `gemini` | MCP tools, face detection, smart tagging |
| [saas-practices](saas-practices/SKILL.md) | `multi-tenancy`, `billing`, `subscriptions`, `onboarding`, `metering`, `workspace`, `plans` | Workspace isolation, billing, subscription management |

### Documentation & Tooling

| Skill | Aliases | Purpose |
|-------|---------|---------|
| [doc-coauthoring](doc-coauthoring/SKILL.md) | `docs`, `documentation`, `specs`, `adr`, `prd`, `rfc`, `proposals` | Structured documentation workflows, specs, ADRs |
| [ide](ide/SKILL.md) | `vscode`, `jetbrains`, `editor`, `extension`, `intellij`, `pycharm` | VS Code and JetBrains IDE integration |
| [skill-creator](skill-creator/SKILL.md) | `skills`, `claude-skills`, `skill-template` | Creating and maintaining Claude Code skills |

## Quick Reference

### By Task

| When you want to... | Use skill |
|---------------------|-----------|
| Build a new page or component | `frontend-design` |
| Style with design tokens | `design-system` |
| Add keyboard/screen reader support | `accessibility` |
| Write tests | `testing` |
| Handle file uploads | `storage` |
| Add AI features | `ai-mcp-integration` |
| Implement auth/permissions | `security` |
| Optimize performance | `performance` |
| Handle errors gracefully | `error-handling` |
| Create API endpoints | `api-standards` |
| Write documentation | `doc-coauthoring` |
| Commit code properly | `git-workflow` |

### RawDrive Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite + TailwindCSS |
| Backend | Python 3.11 + FastAPI + SQLAlchemy 2.0 |
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis 7 |
| Storage | Cloudflare R2 / BYOS (S3-compatible) |
| AI | MCP + Gemini/Cloud Vision |

## Creating New Skills

Use the `skill-creator` skill or follow the template:

```bash
mkdir -p .claude/skills/my-skill
```

```markdown
---
name: my-skill
aliases: [alias1, alias2, alias3]
description: One sentence describing when to use this skill.
---

# Skill Title

## Key Files
| Purpose | Location |
|---------|----------|
| Main file | `path/to/file.ts` |

## Patterns
### Pattern Name
\`\`\`typescript
// Code example
\`\`\`

## Best Practices
### Do
- Action 1

### Don't
- Anti-pattern 1
```

### Guidelines

- **Max 500 lines** per SKILL.md
- **Focus on one domain** - create separate skills for separate concerns
- **Include code examples** with correct file paths
- **Add aliases** for discoverability
- **Cross-reference** related skills with `> See the \`skill-name\` skill`
