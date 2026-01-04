---
name: doc-coauthoring
aliases: [docs, documentation, specs, adr, prd, rfc, proposals]
description: Guide users through structured documentation workflows for RawDrive. Use when creating specs, proposals, feature docs, ADRs, or technical documentation. Provides three-stage co-authoring process.
---

# RawDrive Doc Co-Authoring Workflow

Structured workflow for collaborative documentation in the RawDrive project. Three stages: Context Gathering, Refinement & Structure, and Reader Testing.

## RawDrive Documentation Structure

| Type | Location | Purpose |
|------|----------|---------|
| Feature Specs | `specs/{feature-name}/spec.md` | Feature requirements and design |
| Implementation Plans | `specs/{feature-name}/plan.md` | Step-by-step implementation |
| Task Lists | `specs/{feature-name}/tasks.md` | Actionable development tasks |
| Technical Specs | `docs/TechnicalSpecs/*.json` | API and system specifications |
| Project Docs | `docs/project/*.md` | Architecture, data models, tech stack |
| Feature Docs | `docs/Features/*.md` | Feature documentation |
| ADRs | `docs/ADR/*.md` | Architecture Decision Records |

## When to Offer This Workflow

**Trigger conditions:**
- "write a spec", "create a proposal", "draft a plan"
- Feature planning: "let's design the X feature"
- Document types: "PRD", "ADR", "RFC", "design doc"
- Any substantial writing in `specs/` or `docs/`

**Initial offer:**
```
I can guide you through a structured workflow:
1. Context Gathering - You provide context, I ask clarifying questions
2. Refinement & Structure - Build sections iteratively
3. Reader Testing - Test with fresh Claude to catch blind spots

Want to try this approach, or prefer freeform?
```

## Stage 1: Context Gathering

**Goal:** Close the gap between what you know and what Claude knows.

### Initial Questions

1. What type of document? (feature spec, ADR, technical spec, plan)
2. Who's the audience? (developers, product, stakeholders)
3. What impact should it have when read?
4. Any existing templates or format requirements?
5. Related features or dependencies?

### RawDrive-Specific Context

For feature specs, gather:
- **Workspace isolation** - How does workspace_id affect this?
- **Storage implications** - R2/BYOS considerations?
- **AI/MCP integration** - Any AI features or MCP tools?
- **Multi-tenancy** - Billing, limits, permissions?
- **Frontend components** - Which UI components needed?
- **Backend services** - New repositories/services required?

### Info Dumping

Encourage dumping all context:
- Background on the feature/problem
- Related Slack discussions or docs
- Why alternatives aren't used
- Timeline pressures
- Technical dependencies
- Stakeholder concerns

**Exit condition:** When edge cases and trade-offs can be discussed without needing basics explained.

## Stage 2: Refinement & Structure

**Goal:** Build document section by section through brainstorming and iteration.

### RawDrive Document Templates

#### Feature Spec (`specs/{feature}/spec.md`)

```markdown
# {Feature Name}

## Overview
Brief description of the feature.

## User Stories
- US1: As a [role], I want [action] so that [benefit]

## Technical Requirements
### Backend
- New endpoints, services, repositories

### Frontend
- New components, hooks, pages

### Database
- New tables, migrations, indexes

## Security Considerations
- Workspace isolation
- Permission requirements
- Data encryption needs

## Performance Considerations
- Caching strategy
- Query optimization
- Rate limiting
```

#### ADR (`docs/ADR/{number}-{title}.md`)

```markdown
# ADR-{number}: {Title}

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
What is the issue we're addressing?

## Decision
What is the change we're making?

## Consequences
What are the trade-offs?

## Alternatives Considered
What other options were evaluated?
```

#### Technical Spec (`docs/TechnicalSpecs/{name}.json`)

```json
{
  "name": "feature_name",
  "version": "1.0.0",
  "description": "Brief description",
  "endpoints": [],
  "models": [],
  "workflows": []
}
```

### Section-by-Section Process

For each section:

1. **Clarify** - Ask 5-10 questions about what to include
2. **Brainstorm** - Generate 5-20 options
3. **Curate** - User selects: "Keep 1,4,7" / "Remove 3" / "Combine 5+6"
4. **Draft** - Write the section
5. **Refine** - Iterate on feedback using surgical edits

**Key instruction:** Ask user to indicate changes rather than edit directly. This helps learn their style.

### Quality Checks

After 3 iterations with no substantial changes:
- Ask if anything can be removed without losing value
- Check for RawDrive-specific requirements (workspace_id, permissions)
- Verify code examples use correct tech stack (Python/FastAPI, React/TS)

## Stage 3: Reader Testing

**Goal:** Test document with fresh Claude to catch blind spots.

### With Sub-Agents (Claude Code)

```typescript
// Test document with fresh context
const testQuestions = [
  "What is this feature trying to solve?",
  "What are the security implications?",
  "What migrations are needed?",
];

// Invoke sub-agent with just the document
for (const question of testQuestions) {
  const response = await subAgent.ask(docContent, question);
  // Check if answers are correct
}
```

### Manual Testing (Claude.ai)

1. Open fresh Claude conversation
2. Paste the document
3. Ask generated questions
4. Check if Reader Claude gets correct answers
5. Ask: "What's ambiguous?", "What context is assumed?"

### Exit Condition

Document is ready when Reader Claude:
- Answers questions correctly
- Doesn't surface new ambiguities
- Understands the RawDrive context from the doc alone

## RawDrive-Specific Checklist

Before finalizing any RawDrive document:

- [ ] Workspace isolation addressed (workspace_id in all queries)
- [ ] Permissions defined (RBAC requirements)
- [ ] Code examples use correct stack:
  - Backend: Python 3.11 + FastAPI + SQLAlchemy
  - Frontend: React 19 + TypeScript + TailwindCSS
- [ ] File paths correct (not TurboRepo `apps/` structure)
- [ ] Migrations mentioned if database changes
- [ ] Security considerations documented
- [ ] Performance implications noted

## Tips for Effective Guidance

**Tone:** Direct and procedural. Don't oversell the approach.

**Handling Deviations:**
- If user wants to skip: "Want to skip this and write freeform?"
- If frustrated: "This is taking longer than expected. Ways to speed up?"

**Context Management:**
- Address gaps as they come up
- For RawDrive, always check workspace isolation early

**File Management:**
- Create files in appropriate `specs/` or `docs/` directory
- Use `str_replace` for edits, never reprint whole doc
- Follow RawDrive naming conventions
