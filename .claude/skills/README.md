# RawDrive Claude Code Skills

This directory contains specialized skills that Claude Code auto-loads based on context. Skills provide domain-specific knowledge, patterns, and best practices for the RawDrive codebase.

## Project References

For comprehensive best practices and product requirements, always consult:

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product Requirements Document with architecture overview and feature specifications
- **Best Practices**: [`.claude/reference/`](../reference/) - Comprehensive best practices documentation covering all technical domains:
  - Architecture & Microservices
  - Security & Authentication  
  - Performance & Scaling
  - AI/ML & MCP Integration
  - Database & Caching
  - Frontend & UI/UX
  - Testing & Observability
  - Deployment & Infrastructure
  - And more...

**Note**: The reference documentation is the authoritative source for RawDrive-specific standards and patterns. Skills should align with and reference these best practices.

## How Skills Work

- **Auto-loaded**: Skills are automatically activated when you mention related terms
- **Aliases**: Each skill has aliases for flexible matching (e.g., "a11y" triggers `accessibility`)
- **Focused**: Each skill covers one domain to keep context efficient
- **Reference-based**: Skills point to comprehensive documentation in `.claude/reference/`

## Available Skills

### Core Development

| Skill | Aliases | Purpose | Best Practice Reference |
|-------|---------|---------|------------------------|
| [project-structure](project-structure/SKILL.md) | `codebase`, `architecture`, `folders`, `conventions`, `layout`, `organization` | Codebase layout, file locations, naming conventions | [Coding Standards](../reference/coding-standards.md) |
| [testing](testing/SKILL.md) | `tests`, `vitest`, `pytest`, `coverage`, `fixtures`, `unit-tests`, `integration-tests` | Test patterns, fixtures, coverage requirements | [Testing & Logging](../reference/testing-and-logging.md) |
| [git-workflow](git-workflow/SKILL.md) | `git`, `commits`, `branches`, `pr`, `pull-request`, `version-control` | Commit messages, branch naming, PR process | [Coding Standards](../reference/coding-standards.md) |
| [api-standards](api-standards/SKILL.md) | `api`, `rest`, `endpoints`, `http`, `responses`, `pagination` | REST conventions, response formats, versioning | [FastAPI Best Practices](../reference/fastapi-best-practices.md) |

### Frontend

| Skill | Aliases | Purpose | Best Practice Reference |
|-------|---------|---------|------------------------|
| [frontend-design](frontend-design/SKILL.md) | `ui-design`, `frontend`, `react-components`, `pages`, `premium-ui`, `cinematic`, `landing-page` | Premium UI aesthetics, page layouts, design thinking | [UI/UX Design](../reference/ui-ux-design-best-practices.md) |
| [design-system](design-system/SKILL.md) | `ui`, `styling`, `tokens`, `theme`, `colors`, `components`, `tailwind`, `css` | Color tokens, typography, UI component patterns | [React Frontend](../reference/react-frontend-best-practices.md) |
| [accessibility](accessibility/SKILL.md) | `a11y`, `wcag`, `aria`, `keyboard-nav`, `screen-reader` | WCAG 2.1 AA compliance, ARIA patterns | [UI/UX Design](../reference/ui-ux-design-best-practices.md) |
| [webapp-testing](webapp-testing/SKILL.md) | `e2e`, `playwright`, `browser-testing`, `screenshots`, `ui-testing` | Playwright MCP testing, browser automation | [Testing & Logging](../reference/testing-and-logging.md) |
| [web-artifacts-builder](web-artifacts-builder/SKILL.md) | `prototype`, `bundle`, `demo`, `standalone-html`, `component-demo` | Standalone prototypes, bundled HTML demos | [React Frontend](../reference/react-frontend-best-practices.md) |

### Backend & Infrastructure

| Skill | Aliases | Purpose | Best Practice Reference |
|-------|---------|---------|------------------------|
| [security](security/SKILL.md) | `auth`, `authentication`, `authorization`, `rbac`, `encryption`, `soc2`, `gdpr`, `jwt` | Auth flows, RBAC, encryption, compliance | [Security Best Practices](../reference/security-best-practices.md) |
| [storage](storage/SKILL.md) | `uploads`, `r2`, `byos`, `s3`, `files`, `assets`, `object-storage` | R2 storage, BYOS integration, upload flows | [Storage & Upload](../reference/storage-upload-best-practices.md) |
| [performance](performance/SKILL.md) | `optimization`, `caching`, `scaling`, `web-vitals`, `latency`, `speed` | Caching strategies, query optimization, Core Web Vitals | [Observability](../reference/observability-best-practices.md) |
| [error-handling](error-handling/SKILL.md) | `errors`, `exceptions`, `error-boundary`, `error-messages` | Error boundaries, user-friendly messages, logging | [Testing & Logging](../reference/testing-and-logging.md) |
| [infrastructure](infrastructure/SKILL.md) | `docker`, `kubernetes`, `k8s`, `traefik`, `keda`, `prometheus`, `kafka` | Traefik v3, KEDA, Prometheus, Kafka, K8s, Docker | [Deployment](../reference/deployment-best-practices.md), [Kubernetes Scaling](../reference/kubernetes-scaling-best-practices.md) |

### AI & Platform

| Skill | Aliases | Purpose | Best Practice Reference |
|-------|---------|---------|------------------------|
| [ai-mcp-integration](ai-mcp-integration/SKILL.md) | `ai`, `mcp`, `llm`, `agents`, `face-detection`, `smart-tagging`, `embeddings`, `gemini` | MCP tools, face detection, smart tagging | [AI/ML](../reference/ai-ml-best-practices.md), [MCP](../reference/mcp-best-practices.md), [AI Agents](../reference/ai-agents-best-practices.md) |
| [saas-practices](saas-practices/SKILL.md) | `multi-tenancy`, `billing`, `subscriptions`, `onboarding`, `metering`, `workspace`, `plans` | Workspace isolation, billing, subscription management | [Billing & Payments](../reference/billing-payments-best-practices.md), [Microservices](../reference/microservices-patterns.md) |

### Documentation & Tooling

| Skill | Aliases | Purpose | Best Practice Reference |
|-------|---------|---------|------------------------|
| [doc-coauthoring](doc-coauthoring/SKILL.md) | `docs`, `documentation`, `specs`, `adr`, `prd`, `rfc`, `proposals` | Structured documentation workflows, specs, ADRs | [Coding Standards](../reference/coding-standards.md) |
| [ide](ide/SKILL.md) | `vscode`, `jetbrains`, `editor`, `extension`, `intellij`, `pycharm` | VS Code and JetBrains IDE integration | - |
| [skill-creator](skill-creator/SKILL.md) | `skills`, `claude-skills`, `skill-template` | Creating and maintaining Claude Code skills | - |

## Quick Reference

### By Task

| When you want to... | Use skill | Best Practice |
|---------------------|-----------|---------------|
| Build a new page or component | `frontend-design` | [UI/UX Design](../reference/ui-ux-design-best-practices.md) |
| Style with design tokens | `design-system` | [React Frontend](../reference/react-frontend-best-practices.md) |
| Add keyboard/screen reader support | `accessibility` | [UI/UX Design](../reference/ui-ux-design-best-practices.md) |
| Write tests | `testing` | [Testing & Logging](../reference/testing-and-logging.md) |
| Handle file uploads | `storage` | [Storage & Upload](../reference/storage-upload-best-practices.md) |
| Add AI features | `ai-mcp-integration` | [AI/ML](../reference/ai-ml-best-practices.md), [MCP](../reference/mcp-best-practices.md) |
| Implement auth/permissions | `security` | [Security Best Practices](../reference/security-best-practices.md) |
| Optimize performance | `performance` | [Observability](../reference/observability-best-practices.md) |
| Handle errors gracefully | `error-handling` | [Testing & Logging](../reference/testing-and-logging.md) |
| Create API endpoints | `api-standards` | [FastAPI Best Practices](../reference/fastapi-best-practices.md) |
| Write documentation | `doc-coauthoring` | [Coding Standards](../reference/coding-standards.md) |
| Commit code properly | `git-workflow` | [Coding Standards](../reference/coding-standards.md) |
| Deploy to production | `infrastructure` | [Deployment](../reference/deployment-best-practices.md) |

### RawDrive Tech Stack

| Layer | Technology | Best Practice Reference |
|-------|------------|------------------------|
| Frontend | React 18.3 + TypeScript + Vite + TailwindCSS | [React Frontend](../reference/react-frontend-best-practices.md) |
| Backend | Python 3.11 + FastAPI + SQLAlchemy 2.0 | [FastAPI](../reference/fastapi-best-practices.md) |
| Database | PostgreSQL 16 + pgvector + pgvectorscale | [PostgreSQL](../reference/postgresql-best-practices.md) |
| Cache | Redis 7 | [Redis](../reference/redis-best-practices.md) |
| Storage | Cloudflare R2 / BYOS (S3-compatible) | [Storage & Upload](../reference/storage-upload-best-practices.md) |
| AI | Gemini, Cloud Vision, CLIP, Milvus | [AI/ML](../reference/ai-ml-best-practices.md), [Milvus](../reference/milvus-best-practices.md) |
| Infrastructure | Traefik v3, KEDA, Kubernetes, Docker | [Deployment](../reference/deployment-best-practices.md), [Kubernetes](../reference/kubernetes-scaling-best-practices.md) |
| Monitoring | Prometheus, Grafana, Loki | [Observability](../reference/observability-best-practices.md) |

## RawDrive Architecture

### Microservices (13 Services)

| Service | Port | Purpose | Skill | Best Practice |
|---------|------|---------|-------|---------------|
| Backend | 8000 | Main API, core features | `api-standards` | [FastAPI](../reference/fastapi-best-practices.md) |
| Gallery Service | 8004 | High-performance gallery viewing | `performance` | [Microservices](../reference/microservices-patterns.md) |
| Billing Service | 8005 | Payment processing (Stripe/Razorpay) | `saas-practices` | [Billing](../reference/billing-payments-best-practices.md) |
| Upload Service | 8008 | TUS resumable uploads | `storage` | [Storage & Upload](../reference/storage-upload-best-practices.md) |
| Webhooks Service | 8003 | Event-driven webhook delivery | `api-standards` | [Webhooks](../reference/webhooks-integration-best-practices.md) |
| Notifications Service | 8010 | Multi-channel notifications | `saas-practices` | [Notifications](../reference/notifications-email-best-practices.md) |
| Onboarding Service | 8006 | User registration & workspace setup | `saas-practices` | [Microservices](../reference/microservices-patterns.md) |
| Invitations Service | 8007 | Digital wedding invitations | `saas-practices` | [Microservices](../reference/microservices-patterns.md) |
| Client Service | 8009 | Client/contact management | `saas-practices` | [Microservices](../reference/microservices-patterns.md) |
| AI Service | 8011 | AI orchestration & inference | `ai-mcp-integration` | [AI/ML](../reference/ai-ml-best-practices.md) |
| AI Processing Service | 8012 | Heavy AI workloads (embeddings, CLIP) | `ai-mcp-integration` | [AI/ML](../reference/ai-ml-best-practices.md) |
| LiveSync Service | 8013 | Real-time file synchronization | `performance` | [Microservices](../reference/microservices-patterns.md) |
| LLM Service | 8014 | LLM integration & chat | `ai-mcp-integration` | [AI Agents](../reference/ai-agents-best-practices.md) |

**For complete architecture, see**: [PRD Section 7](../PRD.md#7-architecture--tech-stack)

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

## Best Practice Reference

**Primary**: [Relevant Best Practice](../reference/xxx-best-practices.md)

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

## See Also
- [Related Best Practice](../reference/yyy-best-practices.md)
- [Related Skill](../skills/related-skill/SKILL.md)
```

### Guidelines

- **Max 500 lines** per SKILL.md
- **Focus on one domain** - create separate skills for separate concerns
- **Include code examples** with correct file paths
- **Add aliases** for discoverability
- **Reference best practices** - Link to `.claude/reference/` for comprehensive guidance
- **Cross-reference** related skills with `> See the \`skill-name\` skill`

## Skill Maintenance

### When to Update Skills

1. **New patterns emerge** - Document new architectural patterns or code conventions
2. **Best practices change** - Update references when best practice docs are updated
3. **New features added** - Add examples for new RawDrive features
4. **User feedback** - Improve based on developer experience

### Updating Process

1. Review the skill content
2. Check if referenced best practices are current
3. Update code examples to match current codebase
4. Test that aliases still make sense
5. Ensure cross-references are valid

## Integration with Other Claude Resources

### Skills work with:

- **[Commands](../commands/)** - Skills provide context, commands provide workflows
- **[Agents](../agents/)** - Agents use skills for domain expertise
- **[Best Practices](../reference/)** - Skills reference best practices for comprehensive guidance
- **[PRD](../PRD.md)** - Skills align with product requirements and architecture

### Example Flow:

```
User mentions "authentication"
    ↓
Skill: security (auto-loaded)
    ↓
References: Security Best Practices
    ↓
Agent: security-code-reviewer (if code review needed)
    ↓
Command: test.run (to verify implementation)
```

## Notes

- Skills are loaded automatically based on context and aliases
- Use `/skill <name>` to explicitly invoke a skill
- Skills should be concise and reference comprehensive docs
- Keep skills updated with current project patterns
- All skills should reference relevant best practices in `.claude/reference/`

---

**Maintained by**: RawDrive Development Team
**Last Updated**: 2026-01-21
**Total Skills**: 20 active skills
