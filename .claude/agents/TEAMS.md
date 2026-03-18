# RawDrive Agent Teams

Teams are created on-demand when coordinated parallel work is needed. Only one team can be active at a time.

## Team: core-dev
**Purpose:** Full-stack feature development
**Members:** backend-specialist, frontend-specialist, database-architect
**When to use:** Building new features that span backend API, database schema, and frontend UI

```
TeamCreate(team_name="core-dev", description="Full-stack feature development")
```

**Typical workflow:**
1. database-architect designs schema + migration
2. backend-specialist implements API (service + repository + endpoint)
3. frontend-specialist builds UI consuming the API
4. All work in parallel where possible (schema first, then API + UI in parallel)

## Team: quality
**Purpose:** Code validation and security assurance
**Members:** qa-engineer, security-auditor
**When to use:** Pre-release validation, security reviews, or after major feature implementations

```
TeamCreate(team_name="quality", description="Code validation and security assurance")
```

**Typical workflow:**
1. security-auditor reviews for multi-tenant isolation, auth, OWASP issues
2. qa-engineer writes/runs tests for new functionality
3. Both report findings, fixes applied, re-verified

## Team: ops
**Purpose:** Infrastructure, performance, and AI features
**Members:** devops-engineer, performance-optimizer, ai-ml-engineer
**When to use:** Deployment config, performance tuning, or AI feature implementation

```
TeamCreate(team_name="ops", description="Infrastructure, performance, and AI features")
```

**Typical workflow:**
1. devops-engineer handles Docker/Traefik/CI-CD configuration
2. performance-optimizer tunes queries, caching, frontend perf
3. ai-ml-engineer implements AI pipelines (tagging, face recognition, search)

## Agent-Team Mapping

| Agent | Color | Team | Domain |
|-------|-------|------|--------|
| backend-specialist | blue | core-dev | FastAPI 3-layer, Pydantic, async |
| frontend-specialist | cyan | core-dev | React 18, TanStack Query, TailwindCSS |
| database-architect | green | core-dev | PostgreSQL, pgvector, Alembic |
| qa-engineer | green | quality | pytest, Vitest, test coverage |
| security-auditor | red | quality | Multi-tenant, RBAC, OWASP |
| devops-engineer | yellow | ops | Docker, Traefik, GitHub Actions |
| performance-optimizer | magenta | ops | Redis, query tuning, Core Web Vitals |
| ai-ml-engineer | magenta | ops | Gemini, CLIP, pgvector, face recognition |
