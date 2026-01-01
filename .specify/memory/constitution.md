<!--
SYNC IMPACT REPORT
==================
Version Change: 0.0.0 → 1.0.0 (MAJOR: Initial constitution ratification)

Modified Principles: N/A (initial version)

Added Sections:
- Core Principles (7 principles)
- Technology Standards
- Development Workflow
- Governance

Removed Sections: N/A (initial version)

Templates Requiring Updates:
- ✅ plan-template.md: Constitution Check updated with concrete principle checklist (lines 34-42)
- ✅ spec-template.md: Priority-based user stories align with Testing Discipline principle
- ✅ tasks-template.md: Story-based organization aligns with incremental delivery
- ✅ No commands/ directory exists - no updates needed

Follow-up TODOs: None
-->

# RawDrive Constitution

## Core Principles

### I. Security & SOC 2 Compliance (NON-NEGOTIABLE)

All code MUST adhere to SOC 2 compliance requirements:

- **Never log PII**: Log user IDs only, never emails, names, or phone numbers
- **Never expose internal errors**: Return generic messages to clients; log details server-side
- **Always sanitize input**: Use Zod schemas for validation at API boundaries
- **Always use parameterized queries**: No string interpolation in SQL
- **Always encrypt sensitive data at rest**: Use `EncryptionService` for secrets
- **Never hardcode secrets**: Load all credentials from environment variables
- **Audit security-relevant actions**: Authentication, authorization, data modification, admin actions

*Rationale*: RawDrive handles professional photographers' business-critical data. Security breaches destroy trust and business relationships.

### II. Accessibility First (WCAG 2.1 AA)

All UI components MUST meet WCAG 2.1 Level AA standards:

- **Keyboard navigation**: All interactive elements must be operable via keyboard
- **Screen reader support**: Semantic HTML, proper ARIA labels, heading hierarchy
- **Color contrast**: 4.5:1 for normal text, 3:1 for large text and UI components
- **Focus indicators**: Visible focus rings on ALL interactive elements (never `outline-none` without replacement)
- **Touch targets**: Minimum 44x44 pixels on mobile

*Rationale*: Professional photographers serve diverse clients. Accessibility is not optional—it's a legal and ethical requirement.

### III. Design System Consistency

All styling MUST use the centralized design system:

- **Never hardcode colors**: Use CSS variables (`--color-primary`, `--color-surface`, etc.)
- **Never create custom buttons/inputs**: Use `AppButton`, `AppInput`, and standard UI components
- **Always use design tokens**: Tailwind semantic classes (`bg-surface`, `text-text-primary`)
- **Always support dark mode**: Test in both themes before merging
- **Consistent spacing**: 4px base unit (p-1=4px, p-2=8px, p-4=16px)

*Rationale*: Inconsistent UI erodes professionalism. A unified design system ensures brand coherence and maintainability.

### IV. Multi-Tenant Data Isolation (NON-NEGOTIABLE)

Every database query MUST enforce workspace isolation:

- **Always include workspace_id**: Every query must filter by `workspace_id`
- **Never trust client-provided workspace_id**: Use server-side authenticated context
- **Always prefix storage keys**: Format: `workspaces/{workspace_id}/assets/{asset_id}/...`
- **Verify RBAC permissions**: Use `requirePermission()` middleware for protected routes

*Rationale*: Cross-tenant data leakage is catastrophic. Photographers' client photos are sensitive and confidential.

### V. Testing Discipline

All features MUST meet coverage targets:

| Area | Minimum Coverage |
|------|-----------------|
| Auth/Security | 95% |
| Payment/Billing | 95% |
| API Services | 85% |
| UI Components | 70% |

- **Test security-critical paths first**: XSS, injection, authentication bypass
- **Integration tests for user flows**: End-to-end journey validation
- **Contract tests for APIs**: OpenAPI spec compliance verification

*Rationale*: Insufficient testing leads to production incidents. Coverage targets ensure critical paths are protected.

### VI. Clean Code (SOLID + Simplicity)

Code MUST follow clean architecture principles:

- **Single Responsibility**: One component/function = one purpose
- **DRY**: Extract repeated logic into hooks/utilities after 3+ occurrences
- **KISS**: Prefer readable code over clever code; avoid premature optimization
- **Early Returns**: Reduce nesting with guard clauses
- **Max file length**: 600 lines (components), 800 lines (services)
- **Avoid over-engineering**: No abstractions for hypothetical future requirements

*Rationale*: Complex code is expensive to maintain. Simplicity reduces bugs and onboarding time.

### VII. Observability & Audit Trail

All production code MUST be observable:

- **Structured logging**: JSON format with correlation IDs
- **Prometheus metrics**: Request latency, error rates, business metrics
- **Audit logging**: Immutable logs for compliance (append-only, no updates/deletes)
- **Health checks**: `/health/live` (liveness), `/health/ready` (readiness with dependency checks)
- **Never log sensitive data**: Apply PII filtering to all log output

*Rationale*: Without observability, production issues are invisible. Audit trails are required for compliance.

## Technology Standards

### Stack Requirements

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | React + TypeScript + Vite | React 19, TS 5.2+ |
| Backend | Express + TypeScript | Express 5, TS 5.2+ |
| AI Service | Python + FastAPI | Python 3.11+, FastAPI 0.115+ |
| Database | PostgreSQL + pgvector | PostgreSQL 16 |
| Cache | Redis | Redis 7 |
| Storage | Cloudflare R2 / BYOS S3 | S3-compatible |

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React components | PascalCase | `AlbumGrid.tsx` |
| TypeScript interfaces | PascalCase | `interface Album {}` |
| Services (TS) | PascalCase + Service | `AuthService.ts` |
| Services (Python) | snake_case | `face_recognition.py` |
| API routes | kebab-case | `/api/v1/photo-albums` |
| Database tables | snake_case | `user_roles` |
| Environment vars | SCREAMING_SNAKE_CASE | `JWT_SECRET` |

### API Standards

- All endpoints versioned: `/api/v1/...`
- Error responses: `{ error: string, message: string, details?: [...], requestId?: string }`
- Pagination: `{ data: [...], pagination: { total, page, limit } }`
- Rate limiting enforced: API 100/min, Auth 5/15min, Uploads 1000/hr

## Development Workflow

### Code Review Requirements

Before merging, PRs MUST verify:

- [ ] No hardcoded colors/strings (use tokens/i18n)
- [ ] No hardcoded API keys, secrets, or LLM providers
- [ ] All interactive elements have hover/focus states
- [ ] Error, loading, and empty states handled
- [ ] Accessibility: keyboard nav, ARIA, contrast
- [ ] Security: input validation, workspace isolation
- [ ] Tests added/updated for new functionality
- [ ] No `console.log` or commented-out code

### Commit Standards

Format: `type(scope): description`

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code improvement (no behavior change)
- `docs`: Documentation only
- `test`: Test changes only
- `chore`: Maintenance/dependencies

### Branch Naming

- `feature/add-album-sharing`
- `fix/photo-upload-timeout`
- `refactor/gallery-service`

## Governance

### Constitution Authority

This Constitution supersedes all other development practices. In case of conflict, Constitution principles take precedence.

### Amendment Procedure

1. Propose amendment with rationale in team discussion
2. Document migration plan for affected code
3. Update Constitution with version increment
4. Propagate changes to dependent templates
5. Communicate changes to all contributors

### Version Policy

- **MAJOR**: Principle removal or incompatible redefinition
- **MINOR**: New principle or materially expanded guidance
- **PATCH**: Clarifications, typos, non-semantic refinements

### Compliance Review

All PRs affecting security, accessibility, or data handling MUST be reviewed against this Constitution. Constitution Check in `plan-template.md` enforces validation at feature planning stage.

**Version**: 1.0.0 | **Ratified**: 2026-01-01 | **Last Amended**: 2026-01-01
