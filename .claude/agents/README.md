# RawDrive Claude Code Agents

This directory contains specialized AI agents that Claude Code can invoke for complex, domain-specific tasks. Agents are more powerful than skills - they provide deep expertise and systematic methodologies for solving specific types of problems.

## Project References

For comprehensive best practices and product requirements, always consult:

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product Requirements Document
- **Best Practices**: [`.claude/reference/`](../reference/) - 24 comprehensive guides
- **Skills**: [`.claude/skills/`](../skills/) - 20 auto-loaded context-aware skills

## How Agents Work

- **Specialized Expertise**: Each agent has deep knowledge in a specific domain
- **Systematic Approach**: Agents follow structured methodologies
- **On-Demand**: Agents are invoked when their expertise is needed
- **Comprehensive**: Agents provide complete solutions, not just hints

## Available Agents (10)

### Development & Architecture

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| [project-planner](project-planner.md) | Task breakdown, feature planning, architecture decisions | Planning new features, breaking down complex tasks |
| [database-architect](database-architect.md) | Schema design, query optimization, migrations | Database design, performance issues, data modeling |
| [debugger](debugger.md) | Root cause analysis, systematic debugging | Errors, test failures, unexpected behavior |

### Code Quality & Security

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| [coding-standards-enforcer](coding-standards-enforcer.md) | Code review for standards compliance | Reviewing code for project conventions |
| [security-code-reviewer](security-code-reviewer.md) | Security-focused code review | Auditing for vulnerabilities, security patterns |
| [auth-troubleshooter](auth-troubleshooter.md) | Authentication/authorization issues | Login failures, JWT problems, permission errors |

### Infrastructure & Performance

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| [devops-engineer](devops-engineer.md) | Deployment, CI/CD, infrastructure | Deploying, monitoring, infrastructure issues |
| [performance-optimizer](performance-optimizer.md) | Performance analysis and optimization | Slow pages, API latency, Core Web Vitals |

### Design & Documentation

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| [ui-component-designer](ui-component-designer.md) | UI/UX design, accessible components | Building new UI components, design patterns |
| [skills-architect](skills-architect.md) | Creating and maintaining Claude skills | Building new skills, updating existing ones |

## Agent Categories by Task

### When you need to...

| Task | Agent(s) |
|------|----------|
| Plan a new feature | `project-planner` |
| Debug an error | `debugger` |
| Optimize slow code | `performance-optimizer`, `database-architect` |
| Review code quality | `coding-standards-enforcer` |
| Fix security issues | `security-code-reviewer`, `auth-troubleshooter` |
| Deploy to production | `devops-engineer` |
| Design database schema | `database-architect` |
| Build UI components | `ui-component-designer` |
| Create Claude skills | `skills-architect` |

## Agent vs Skill

| Aspect | Skills | Agents |
|--------|--------|--------|
| **Scope** | Domain knowledge | Complete problem-solving |
| **Activation** | Auto-loaded by context | Explicitly invoked |
| **Depth** | Patterns and references | Systematic methodologies |
| **Output** | Guidance and examples | Complete solutions |

**Use Skills** when you need quick reference or patterns.
**Use Agents** when you need deep expertise and systematic problem-solving.

## Invoking Agents

Agents are invoked through the Claude Task tool:

```
User: "I'm getting a 401 error when calling my API"
Claude: "I'll use the auth-troubleshooter agent to diagnose this."
[Task tool invocation to auth-troubleshooter agent]
```

Claude automatically selects the appropriate agent based on the problem domain.

## Creating New Agents

### Agent File Structure

```markdown
---
name: agent-name
description: When to use this agent with examples
model: opus
color: colorname
---

## Project References
- Links to relevant best practices

## Core Philosophy
> Guiding principle

## Methodology
- Systematic approach

## Expertise Areas
- Domain knowledge

## Interaction Guidelines
- How to gather information
- Output format

## Critical Rules
- Safety and quality rules
```

### Agent Guidelines

1. **Clear Purpose**: Each agent should have a distinct, focused purpose
2. **Systematic Methodology**: Provide a structured approach to problems
3. **Reference Best Practices**: Link to relevant documentation
4. **Safety-First**: Include appropriate warnings and checks
5. **Actionable Output**: Provide concrete solutions, not just advice

## Integration with Other Resources

```
User Request
    ↓
Skill (auto-loaded) → Provides context and patterns
    ↓
Agent (if needed) → Deep problem-solving
    ↓
Best Practices → Reference documentation
    ↓
Commands → Workflow execution
```

## Maintenance

### When to Update Agents

1. **New best practices** - Update references when docs change
2. **New patterns emerge** - Add methodologies for common problems
3. **User feedback** - Improve based on real usage
4. **Technology changes** - Update for new tools/frameworks

### Updating Process

1. Review agent content
2. Check if referenced best practices are current
3. Update methodology based on lessons learned
4. Test that examples are still relevant
5. Ensure cross-references are valid

---

**Maintained by**: RawDrive Development Team
**Last Updated**: 2026-01-21
**Total Agents**: 10 specialized agents
