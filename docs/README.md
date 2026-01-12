# RawDrive Documentation

**Version**: 0.3.2 | **Last Updated**: 2026-01-09

Welcome to the RawDrive documentation hub. This directory contains all operational, architectural, and feature documentation for the platform.

## 📚 Documentation Structure

### Quick Links

- **[Quick Start Guide](quickstart.md)** - Get up and running in 5 minutes
- **[Development Setup](guides/development-setup.md)** - Complete development environment setup
- **[Architecture Overview](architecture/overview.md)** - System architecture and design
- **[API Documentation](api/README.md)** - REST API reference and guides
- **[Test Users](development/test-users.md)** - Test credentials and configurations

### For Developers

#### Getting Started
- **[Quick Start](quickstart.md)** - Fast track to development
- **[Development Setup](guides/development-setup.md)** - Detailed environment setup
- **[Docker Quick Start](guides/docker-quick-start.md)** - Docker-based development
- **[Coding Standards](development/coding-standards.md)** - Code style and conventions

#### Development Resources
- **[Testing Guide](guides/testing.md)** - Testing strategy and execution
- **[Database Migrations](development/database-migrations.md)** - Alembic migration workflows
- **[Test Users](development/test-users.md)** - Test accounts and data
- **[Troubleshooting](guides/troubleshooting.md)** - Common issues and solutions

### For Architects

#### Architecture Documentation
- **[Architecture Overview](architecture/overview.md)** - High-level system design
- **[Microservices Architecture](architecture/microservices.md)** - Service breakdown and communication
- **[Database Design](architecture/database-design.md)** - Schema and data models
- **[Security Architecture](architecture/security-architecture.md)** - Security design and patterns
- **[Tech Stack](architecture/tech-stack.md)** - Technology choices and rationale

#### Integration Guides
- **[A2A Integration](integrations/a2a-integration.md)** - Agent-to-Agent communication
- **[MCP Integration](integrations/mcp-integration.md)** - Model Context Protocol
- **[Webhooks](integrations/webhooks.md)** - Webhook integration guide
- **[Billing Providers](integrations/billing-providers.md)** - Stripe/Razorpay integration

### For Product Managers

#### Feature Documentation
- **[Feature Index](features/README.md)** - Complete feature catalog
- **[Gallery Management](features/gallery-management.md)** - Core gallery features
- **[Digital Invitations](features/digital-invitations.md)** - Wedding invitation system
- **[AI Search & Geo](features/ai-search.md)** - AI-powered search capabilities
- **[Client CRM](features/client-crm.md)** - Client relationship management
- **[Billing & Subscription](features/billing-subscription.md)** - Payment and plans

### For Operations

#### Deployment & Operations
- **[Deployment Guide](guides/deployment.md)** - Production deployment procedures
- **[Monitoring](operations/monitoring.md)** - Observability and metrics
- **[Security Checklist](operations/security-checklist.md)** - Security verification

#### Runbooks
- **[Deployment Runbook](operations/runbooks/deployment.md)** - Step-by-step deployment
- **[Rollback Runbook](operations/runbooks/rollback.md)** - Emergency rollback procedures
- **[Incident Response](operations/runbooks/incident-response.md)** - Incident handling

## 🎯 Common Tasks

### I want to...

#### Start Development
1. Read [Quick Start](quickstart.md)
2. Follow [Development Setup](guides/development-setup.md)
3. Review [Test Users](development/test-users.md)
4. Check [Troubleshooting](guides/troubleshooting.md) if issues arise

#### Understand the Architecture
1. Start with [Architecture Overview](architecture/overview.md)
2. Review [Microservices Architecture](architecture/microservices.md)
3. Examine [Database Design](architecture/database-design.md)
4. Check [Tech Stack](architecture/tech-stack.md) for technology details

#### Deploy to Production
1. Review [Deployment Guide](guides/deployment.md)
2. Follow [Deployment Runbook](operations/runbooks/deployment.md)
3. Verify with [Security Checklist](operations/security-checklist.md)
4. Monitor using [Monitoring Guide](operations/monitoring.md)

#### Implement a New Feature
1. Check [Feature Index](features/README.md) for existing features
2. Review [Coding Standards](development/coding-standards.md)
3. Follow [Testing Guide](guides/testing.md)
4. Create [Database Migration](development/database-migrations.md) if needed

#### Integrate External Service
1. Review [API Documentation](api/README.md)
2. Check [Integration Guides](integrations/) for similar integrations
3. Follow [Webhooks Guide](integrations/webhooks.md) for event-driven integration
4. Implement using [A2A Integration](integrations/a2a-integration.md) for service-to-service

#### Debug an Issue
1. Check [Troubleshooting Guide](guides/troubleshooting.md)
2. Review [Test Users](development/test-users.md) for test accounts
3. Examine [Monitoring](operations/monitoring.md) for metrics
4. Follow [Incident Response](operations/runbooks/incident-response.md) if critical

## 📖 Additional Resources

### Claude Code Configuration
For AI-assisted development, refer to the `.claude/` directory:
- **[PRD](.claude/PRD.md)** - Product Requirements Document
- **[Best Practices](.claude/reference/)** - 17 comprehensive technical guides
- **[Commands](.claude/commands/)** - Development workflow commands
- **[Skills](.claude/skills/)** - Context-aware development skills
- **[Agents](.claude/agents/)** - Specialized AI agents

### External Documentation
- **[Main README](../README.md)** - Project overview and quick start
- **[CHANGELOG](../CHANGELOG.md)** - Version history and changes
- **[CLAUDE.md](../CLAUDE.md)** - AI context and quick reference

## 🗂️ Directory Structure

```
docs/
├── README.md                          # This file
├── quickstart.md                      # Quick start guide
│
├── guides/                            # Step-by-step guides
│   ├── development-setup.md           # Development environment setup
│   ├── deployment.md                  # Deployment procedures
│   ├── testing.md                     # Testing guide
│   ├── docker-quick-start.md          # Docker development
│   └── troubleshooting.md             # Common issues and solutions
│
├── architecture/                      # Architecture documentation
│   ├── overview.md                    # High-level architecture
│   ├── microservices.md               # Microservices design
│   ├── database-design.md             # Database schema and design
│   ├── security-architecture.md       # Security patterns
│   └── tech-stack.md                  # Technology stack details
│
├── features/                          # Feature specifications
│   ├── README.md                      # Feature index
│   ├── gallery-management.md          # Gallery features
│   ├── digital-invitations.md         # Invitation system
│   ├── ai-search.md                   # AI search capabilities
│   ├── client-crm.md                  # CRM features
│   └── billing-subscription.md        # Billing and plans
│
├── api/                               # API documentation
│   ├── README.md                      # API overview
│   ├── authentication.md              # Auth endpoints
│   ├── endpoints/                     # Endpoint documentation
│   └── webhooks.md                    # Webhook reference
│
├── operations/                        # Operational documentation
│   ├── runbooks/                      # Operational runbooks
│   │   ├── deployment.md              # Deployment runbook
│   │   ├── rollback.md                # Rollback procedures
│   │   └── incident-response.md       # Incident handling
│   ├── monitoring.md                  # Monitoring and observability
│   └── security-checklist.md          # Security verification
│
├── development/                       # Developer resources
│   ├── coding-standards.md            # Code style guide
│   ├── testing-strategy.md            # Testing approach
│   ├── database-migrations.md         # Migration workflows
│   └── test-users.md                  # Test accounts
│
├── integrations/                      # Integration guides
│   ├── a2a-integration.md             # Agent-to-Agent
│   ├── mcp-integration.md             # Model Context Protocol
│   ├── webhooks.md                    # Webhook integration
│   └── billing-providers.md           # Payment providers
│
└── archive/                           # Historical documentation
    ├── implementation-notes/          # Completed work logs
    ├── migration-logs/                # Migration history
    └── deprecated/                    # Deprecated documentation
```

## 📝 Documentation Standards

### File Naming
- Use lowercase with hyphens: `feature-name.md`
- Be descriptive: `digital-invitations.md` not `invites.md`
- Avoid abbreviations unless widely known

### Document Structure
All documentation should include:
```markdown
# Title

**Last Updated**: YYYY-MM-DD  
**Status**: [Draft|Active|Deprecated]

## Overview
Brief description of the document's purpose

## [Content Sections]
...

## Related Documentation
- Links to related docs
```

### Maintenance
- **Review Quarterly**: Ensure documentation stays current
- **Update on Changes**: Update docs when code changes
- **Archive Old Content**: Move outdated docs to `archive/`
- **Link Verification**: Ensure all internal links work

## 🆘 Need Help?

1. **Check this README** for navigation
2. **Search the docs** for your topic
3. **Review `.claude/reference/`** for best practices
4. **Check troubleshooting** for common issues
5. **Consult the PRD** for product requirements

---

**Maintained by**: RawDrive Development Team  
**Last Updated**: 2026-01-09  
**Status**: Active ✅
