# CLAUDE.md - RawDrive AI Context

**RawDrive** is an enterprise SaaS professional photography platform with microservices architecture.

**Version**: 0.3.3 | **Status**: Production | **Updated**: 2026-01-21

---

## 📚 Comprehensive Documentation

For detailed best practices, architecture patterns, and product requirements, refer to:

### **Primary References**
- **[Product Requirements Document (PRD)](.claude/PRD.md)** - Complete product vision, architecture, features, and tech stack
- **[Best Practices Directory](.claude/reference/)** - 24 comprehensive guides covering all technical domains

### **Claude Code Configuration**
- **[Commands](.claude/commands/)** - Development workflow commands (health checks, testing, deployment, etc.)
- **[Skills](.claude/skills/)** - 20 auto-loaded context-aware development skills
- **[Agents](.claude/agents/)** - 10 specialized AI agents for debugging, deployment, security, UI design, etc.

---

## ⚡ Quick Start

### Start Development Environment
```bash
# One-command setup (recommended)
.\setup-dev-environment.ps1

# Or manual setup
docker compose -f infrastructure/docker/docker-compose.yml up -d
cd frontend && pnpm dev  # http://localhost:5173
```

### Test Login
- Email: `free@test.rawdrive.in`
- Password: `Test@123`

### Common Commands
```bash
# Frontend
cd frontend && pnpm dev          # Start dev server
cd frontend && pnpm test         # Run tests
cd frontend && pnpm lint         # Lint code

# Backend (Docker)
docker exec rawdrive-backend pytest                    # Run tests
docker exec rawdrive-backend alembic upgrade head      # Run migrations
docker exec rawdrive-backend alembic revision -m "msg" # Create migration

# Health Checks
curl http://localhost:8000/health/live   # Backend
curl http://localhost:8004/health/live   # Gallery service
```

**📖 For detailed commands, see**: [`.claude/commands/`](.claude/commands/)

---

## 🏗️ Architecture Overview

### Microservices (13 Services)

| Service | Port | Purpose | Reference |
|---------|------|---------|-----------|
| **Backend** | 8000 | Main API, core features | [FastAPI Best Practices](.claude/reference/fastapi-best-practices.md) |
| **Gallery Service** | 8004 | High-performance gallery viewing | [Microservices Patterns](.claude/reference/microservices-patterns.md) |
| **Billing Service** | 8005 | Payment processing (Stripe/Razorpay) | [Billing Best Practices](.claude/reference/billing-payments-best-practices.md) |
| **Upload Service** | 8008 | TUS resumable uploads | [Storage Best Practices](.claude/reference/storage-upload-best-practices.md) |
| **Webhooks Service** | 8003 | Event-driven webhook delivery | [Webhooks Best Practices](.claude/reference/webhooks-integration-best-practices.md) |
| **Notifications Service** | 8010 | Multi-channel notifications | [Notifications Best Practices](.claude/reference/notifications-email-best-practices.md) |
| **Onboarding Service** | 8006 | User registration & workspace setup | [Microservices Patterns](.claude/reference/microservices-patterns.md) |
| **Invitations Service** | 8007 | Digital wedding invitations | [Microservices Patterns](.claude/reference/microservices-patterns.md) |
| **Client Service** | 8009 | Client/contact management | [Microservices Patterns](.claude/reference/microservices-patterns.md) |
| **AI Service** | 8011 | AI orchestration & inference | [AI/ML Best Practices](.claude/reference/ai-ml-best-practices.md) |
| **AI Processing Service** | 8012 | Heavy AI workloads (embeddings, CLIP) | [AI/ML Best Practices](.claude/reference/ai-ml-best-practices.md) |
| **LiveSync Service** | 8013 | Real-time file synchronization | [Microservices Patterns](.claude/reference/microservices-patterns.md) |
| **LLM Service** | 8014 | LLM integration & chat | [AI Agents Best Practices](.claude/reference/ai-agents-best-practices.md) |

**📖 For architecture details, see**: [PRD Section 7](.claude/PRD.md#7-architecture--tech-stack)

### Tech Stack

| Layer | Technologies | Reference |
|-------|--------------|-----------|
| **Frontend** | React 18.3, TypeScript, Vite, TailwindCSS | [React Best Practices](.claude/reference/react-frontend-best-practices.md) |
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.0 | [FastAPI Best Practices](.claude/reference/fastapi-best-practices.md) |
| **Database** | PostgreSQL 16, pgvector, Redis 7 | [PostgreSQL Best Practices](.claude/reference/postgresql-best-practices.md) |
| **Infrastructure** | Traefik v3, KEDA, Kubernetes, Docker | [Deployment Best Practices](.claude/reference/deployment-best-practices.md) |
| **AI/ML** | Gemini, Cloud Vision, CLIP, Milvus | [AI/ML Best Practices](.claude/reference/ai-ml-best-practices.md) |
| **Monitoring** | Prometheus, Grafana, Loki | [Observability Best Practices](.claude/reference/observability-best-practices.md) |

**📖 For complete tech stack, see**: [PRD Section 7](.claude/PRD.md#7-architecture--tech-stack)

---

## 📁 Critical File Structure Rules

**ALWAYS follow these strict file placement rules. NEVER create files in random locations.**

### Frontend Files
```
frontend/src/
├── components/
│   ├── ui/              # Design system (AppButton, AppInput, etc.)
│   ├── layout/          # Layout components (Header, Sidebar)
│   └── features/        # Feature-specific components
│       ├── gallery/     # Gallery components
│       ├── upload/      # Upload components
│       └── [feature]/   # Other features
├── pages/               # Page components (route handlers)
├── hooks/               # Custom React hooks
├── services/            # API client services
├── contexts/            # React contexts
└── utils/               # Utility functions
```

### Backend Files
```
backend/src/app/
├── api/v1/              # API endpoints
├── models/              # SQLAlchemy models (ONLY database models)
├── repositories/        # Data access layer
├── services/            # Business logic (NEVER in models/)
├── middleware/          # FastAPI middleware
└── workers/             # Background workers (Celery)
```

### Microservices Files
```
services/[service-name]/
├── src/
│   ├── api/v1/          # API endpoints
│   ├── services/        # Business logic
│   ├── repositories/    # Database access
│   ├── schemas/         # Pydantic schemas
│   ├── observability/   # Health checks, metrics
│   └── config.py        # Configuration
└── tests/               # Unit, integration, load tests
```

**📖 For complete file structure, see**: [Coding Standards](.claude/reference/coding-standards.md)

---

## 🔒 Critical Security Rules

### Multi-Tenant Isolation (MANDATORY)
```python
# EVERY query MUST include workspace_id
result = await db.execute(
    select(Asset).where(Asset.workspace_id == workspace_id)
)
# NEVER trust client-provided workspace_id - extract from JWT token
```

### Never Hardcode
- ❌ API keys, secrets, credentials
- ❌ LLM provider names or model identifiers  
- ❌ Colors (use design tokens from `@rawdrive/shared-constants`)
- ❌ User-facing strings (use i18n)
- ❌ Magic numbers (use named constants)

### Security Checklist
- ✅ Validate JWT tokens in all microservices
- ✅ Use shared `JWT_SECRET` across all services
- ✅ Implement rate limiting on public endpoints
- ✅ Sanitize user inputs (use `@rawdrive/shared-validation`)
- ✅ Use parameterized queries (SQLAlchemy prevents SQL injection)
- ✅ Encrypt sensitive data at rest (AES-256)

**📖 For security details, see**: [Security Best Practices](.claude/reference/security-best-practices.md)

---

## 🎨 Code Style & Conventions

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React components | `PascalCase.tsx` | `GalleryUpload.tsx` |
| React hooks | `useCamelCase.ts` | `useUpload.ts` |
| Python services | `snake_case.py` | `upload_service.py` |
| Python classes | `PascalCase` | `UploadService` |
| API routes | `/api/v1/kebab-case` | `/api/v1/gallery-items` |
| Database tables | `snake_case` | `gallery_items` |
| Environment variables | `SCREAMING_SNAKE` | `JWT_SECRET` |

### Architecture Pattern (Backend)
```python
# Repository → Service → API (3-layer architecture)

# 1. Repository (database access)
class GalleryRepository:
    async def get_by_id(self, gallery_id: UUID, workspace_id: UUID) -> Gallery:
        # Database query with workspace isolation

# 2. Service (business logic)
class GalleryService:
    async def get_gallery(self, gallery_id: UUID, workspace_id: UUID) -> Gallery:
        # Business logic + validation

# 3. API (HTTP handling)
@router.get("/galleries/{gallery_id}")
async def get_gallery(gallery_id: UUID, service: GalleryService = Depends()):
    return await service.get_gallery(gallery_id)
```

**📖 For coding standards, see**: [Coding Standards](.claude/reference/coding-standards.md)

---

## 📦 Shared Packages (pnpm Workspaces)

RawDrive uses a **monorepo with pnpm workspaces** for shared code:

| Package | Purpose | Exports |
|---------|---------|---------|
| `@rawdrive/shared-types` | Domain types | `InvitationStatus`, `GalleryStatus`, etc. |
| `@rawdrive/shared-constants` | Configuration | `API_BASE`, `STORAGE`, `AI_THRESHOLDS`, etc. |
| `@rawdrive/shared-validation` | Validation | `isValidHexColor`, `sanitizeHtml`, etc. |
| `@rawdrive/shared-utils` | Utilities | `formatRelativeDate`, `formatFileSize`, etc. |

### Usage
```typescript
// Frontend: Import from shared packages
import { InvitationStatus } from '@rawdrive/shared-types';
import { API_BASE, PAGINATION } from '@rawdrive/shared-constants';
import { isValidHexColor } from '@rawdrive/shared-validation';
```

```python
# Backend: Import from generated Python modules
from app.shared.types import InvitationStatus, GalleryStatus
from app.shared.constants import API_BASE, PAGINATION
```

### Commands
```bash
pnpm build:packages      # Build all shared packages
pnpm generate:python     # Generate Python types from TypeScript
pnpm test:packages       # Test shared packages
```

---

## 🛠️ Development Workflows

### Adding New Features

1. **Check References**: Review relevant best practices in `.claude/reference/`
2. **Follow Structure**: Place files in correct directories (see File Structure Rules)
3. **Use Shared Packages**: Reuse types, constants, validation
4. **Write Tests**: Unit tests (80%+ coverage), integration tests, E2E tests
5. **Create Migration**: Database changes require Alembic migration
6. **Update Documentation**: Add to `docs/Features/` and update PRD

**📖 For workflows, see**: [`.claude/commands/`](.claude/commands/)

### Working with Microservices

1. **Use shared database** - All services connect to same PostgreSQL instance
2. **Validate JWT tokens** - Use shared `JWT_SECRET` and validate in middleware
3. **Include workspace_id** - Every query must filter by `workspace_id`
4. **Follow service templates** - Use gallery-service as reference
5. **Add health checks** - `/health/live` and `/health/ready` endpoints required
6. **Expose metrics** - Prometheus `/metrics` endpoint for monitoring

**📖 For microservices patterns, see**: [Microservices Patterns](.claude/reference/microservices-patterns.md)

---

## 🤖 Claude Code Skills & Agents

### Skills (Auto-loaded based on context)

20 specialized skills available in `.claude/skills/`:

| Skill | Use When |
|-------|----------|
| `accessibility` | WCAG 2.1 AA compliance, ARIA, keyboard navigation |
| `ai-mcp-integration` | AI features, MCP integration, LLM tooling |
| `api-standards` | API conventions, response formats, pagination |
| `design-system` | Design tokens, UI components, theming |
| `frontend-design` | Premium UI, animations, modern aesthetics |
| `security` | Authentication, RBAC, encryption, compliance |
| `testing` | Vitest, pytest patterns, test coverage |
| `performance` | Optimization, caching, scaling, web vitals |

**📖 For all skills, see**: [`.claude/skills/README.md`](.claude/skills/README.md)

### Agents (Specialized AI assistants)

10 agents available in `.claude/agents/`:

| Agent | Purpose |
|-------|---------|
| `project-planner` | Task breakdown, feature planning, architecture decisions |
| `database-architect` | Schema design, query optimization, migrations |
| `debugger` | Root cause analysis, systematic debugging |
| `devops-engineer` | Deployment, CI/CD, infrastructure management |
| `performance-optimizer` | Performance analysis and optimization |
| `coding-standards-enforcer` | Review code for adherence to standards |
| `security-code-reviewer` | Comprehensive security-focused code review |
| `ui-component-designer` | Design modern, accessible UI components |
| `auth-troubleshooter` | Debug authentication/authorization issues |
| `skills-architect` | Create and maintain project skills |

**📖 For agent details, see**: [`.claude/agents/`](.claude/agents/)

### IDE Agents (Antigravity Kit)

RawDrive also includes **Antigravity Kit** - an extensive IDE agent toolkit in `.agent/`:

| Category | Count | Examples |
|----------|-------|----------|
| **Agents** | 19 | `backend-specialist`, `frontend-specialist`, `database-architect`, `devops-engineer`, `security-auditor` |
| **Skills** | 36 | `api-patterns`, `database-design`, `frontend-design`, `testing-patterns`, `deployment-procedures` |
| **Workflows** | 11 | `/brainstorm`, `/create`, `/debug`, `/deploy`, `/orchestrate` |

**📖 For IDE agent details, see**: [`.agent/ARCHITECTURE.md`](.agent/ARCHITECTURE.md)

---

## 🔍 Key Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/rawdrive
REDIS_URL=redis://localhost:6379/0

# Auth
JWT_SECRET=<64-byte-hex>

# Storage
R2_ACCESS_KEY_ID=<cloudflare-r2-key>
R2_SECRET_ACCESS_KEY=<cloudflare-r2-secret>
R2_BUCKET_NAME=rawdrive-assets
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com

# AI (NEVER hardcode!)
AI_PROVIDER=<provider>
AI_API_KEY=<api-key>
AI_MODEL=<model-name>

# Payment
STRIPE_SECRET_KEY=<stripe-key>
RAZORPAY_KEY_ID=<razorpay-id>
RAZORPAY_KEY_SECRET=<razorpay-secret>
```

---

## 📊 Monitoring & Observability

| Service | Port | Purpose |
|---------|------|---------|
| Prometheus | 9090 | Metrics collection |
| Grafana | 3000 | Dashboards (admin/admin) |
| Traefik Dashboard | 8080 | API Gateway metrics |
| Loki | 3100 | Log aggregation |

**📖 For observability details, see**: [Observability Best Practices](.claude/reference/observability-best-practices.md)

---

## 📖 Additional Documentation

### Core Documentation
- **[PRD](.claude/PRD.md)** - Complete product requirements and architecture
- **[Best Practices](.claude/reference/)** - 24 comprehensive technical guides
- **[Architecture](docs/ARCHITECTURE_QUICK_REFERENCE.md)** - Quick architecture reference
- **[Test Users](docs/TEST_USERS.md)** - Test user credentials and configurations

### Feature Documentation
- **[Features](docs/Features/)** - Detailed feature specifications
- **[Business Features](docs/Business_Features/)** - Business feature specs
- **[Specs](specs/)** - Technical specifications

### Operational Documentation
- **[Runbooks](docs/runbooks/)** - Operational guides
- **[Troubleshooting](docs/troubleshooting/)** - Debugging guides

---

## 🎯 Development Principles

### From the PRD

1. **Client Experience is the Product** - End-client viewing experience must be flawless
2. **AI as a Copilot** - AI features enhance without taking control
3. **Trust by Design** - Security, privacy, and governance are foundational
4. **Performance at Scale** - Sub-second retrieval for millions of assets
5. **Platform Reliability** - Microservices ensure fault isolation and scalability

**📖 For complete principles, see**: [PRD Section 2](.claude/PRD.md#2-product-principles)

### Best Practices

- **Always reference** `.claude/reference/` for domain-specific best practices
- **Use skills** for context-aware development guidance
- **Invoke agents** for specialized code review and design tasks
- **Follow the PRD** for product requirements and architecture decisions
- **Maintain consistency** across all services and components

---

## 📝 Version History

### Current: v0.3.3 (2026-01-21)

**Major Features:**
- JWT authentication fixes for gallery and upload services
- Magic link service improvements with Redis caching
- Download policy defaults updated to watermarked only
- Gallery branding data on public endpoints
- Album proofing and notification templates
- Client service security enhancements

### v0.3.2 (2026-01-09)

**Major Features:**
- Personal Profile Digital Visiting Card (`/u/{slug}`)
- Webhooks Microservice (event-driven integration)
- Workspace Settings System (AI, security, notifications, privacy)
- Gallery Performance Optimizations (LQIP, extended TTL, prefetching)
- SEO & Search Engine Integration

**📖 For complete changelog, see**: [PRD Section 9](.claude/PRD.md#9-delivery-plan)

---

## 🆘 Getting Help

1. **Check References First**: Review `.claude/reference/` for best practices
2. **Use Skills**: Invoke relevant skills for guided development
3. **Consult PRD**: Review product requirements and architecture
4. **Use Commands**: Run `.claude/commands/` for common workflows
5. **Invoke Agents**: Use specialized agents for code review and design

**Remember**: This file provides quick reference. For comprehensive guidance, always refer to:
- **[.claude/PRD.md](.claude/PRD.md)** - Product requirements
- **[.claude/reference/](.claude/reference/)** - Best practices
- **[.claude/skills/](.claude/skills/)** - Development skills
- **[.claude/agents/](.claude/agents/)** - Specialized agents
- **[.claude/commands/](.claude/commands/)** - Workflow commands

---

**Maintained by**: RawDrive Development Team
**Last Updated**: 2026-01-21
**Status**: Production Ready ✅

## Active Technologies
- Python 3.11 (backend), TypeScript 5.3+ (frontend) + FastAPI, SQLAlchemy 2.0, React 18.3, passlib (bcrypt) (027-gallery-feature-completion)
- PostgreSQL 16 (galleries, magic_links), Redis 7 (quotas, rate-limiting) (027-gallery-feature-completion)
- Python 3.11 (backend), TypeScript 5.3+ (frontend) + FastAPI, SQLAlchemy 2.0, React 18.3, reportlab (PDF) (026-album-proofing)
- Python 3.11 (backend), TypeScript 5.3+ (frontend) + FastAPI 0.115+, SQLAlchemy 2.0, Redis 7.x, Celery 5.x, Pydantic V2 (002-face-audit-remediation)
- PostgreSQL 16 (with pgvector), Redis 7.x (caching/rate limiting) (002-face-audit-remediation)

## Recent Changes
- 027-gallery-feature-completion: Added passlib (bcrypt) for access code hashing, Redis quota tracking, WCAG 2.1 AAA CSS variables
- 026-album-proofing: Added Python 3.11 (backend), TypeScript 5.3+ (frontend) + FastAPI, SQLAlchemy 2.0, React 18.3, reportlab (PDF)
