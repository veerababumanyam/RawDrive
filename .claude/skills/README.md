# RawDrive Skills

26 context-aware development skills that auto-load based on your task. Each skill provides RawDrive-specific patterns and conventions, referencing the detailed guides in `.claude/reference/` for deep dives.

## Available Skills

### Core Architecture
| Skill | Triggers On | Reference Docs |
|-------|------------|----------------|
| **multi-tenant-security** | Database queries, auth, RBAC, share links, audit logging | security-best-practices.md, authentication-architecture.md |
| **fastapi-services** | Backend endpoints, services, repositories, Pydantic schemas | fastapi-best-practices.md |
| **react-frontend** | React components, hooks, pages, state management, forms | react-frontend-best-practices.md |
| **database-migrations** | Models, migrations, schemas, indexes, pgvector, queries | postgresql-best-practices.md |
| **microservice-development** | Service communication, resilience, health checks, events | microservices-patterns.md |
| **api-design** | Endpoint design, response formats, pagination, rate limiting | webhooks-integration-best-practices.md |

### Features
| Skill | Triggers On | Reference Docs |
|-------|------------|----------------|
| **gallery-features** | Design Studio, cover templates, magic links, exports, proofing | microservices-patterns.md |
| **invitations** | Digital invitations, RSVP, guests, sub-events, AI content | — |
| **client-management** | Client CRM, favorites, reviews, activity, smart lists | — |
| **billing-payments** | Stripe, Razorpay, subscriptions, plans, webhooks | billing-payments-best-practices.md |
| **ai-ml-integration** | Gemini, CLIP, face recognition, vector search, embeddings | ai-ml-best-practices.md, milvus-best-practices.md |
| **storage-uploads** | R2/S3, presigned URLs, TUS uploads, thumbnails, watermarks | storage-upload-best-practices.md |

### Quality & Operations
| Skill | Triggers On | Reference Docs |
|-------|------------|----------------|
| **testing-patterns** | Vitest, pytest, mocking, fixtures, coverage | testing-and-logging.md |
| **performance-optimization** | Caching, query tuning, frontend perf, Redis, scaling | redis-best-practices.md, kubernetes-scaling-best-practices.md |
| **design-system** | UI components, themes, accessibility, animations, icons | ui-ux-design-best-practices.md |
| **observability** | Metrics, logging, tracing, dashboards, alerting | observability-best-practices.md |
| **traefik-infrastructure** | Traefik routing, Docker, Kubernetes, KEDA, CI/CD | deployment-best-practices.md, traefik-best-practices.md |
| **git-workflow** | Commits, branches, PRs, CI/CD, releases | coding-standards.md |

### Workflow & Shipping (adapted from gstack methodology)
| Skill | Triggers On | Reference Docs |
|-------|------------|----------------|
| **qa-testing** | "qa", "test this site", "find bugs", "test and fix", browser QA | — |
| **design-audit** | "audit design", "visual QA", "find AI slop", "design polish" | ui-ux-design-best-practices.md |
| **pre-landing-review** | "review this PR", "check my diff", "safe to merge?" | security-best-practices.md, coding-standards.md |
| **ship-release** | "ship", "create PR", "push this", "ready to merge" | coding-standards.md |
| **doc-sync** | "update docs", "sync docs", "check stale docs", pre-PR doc check | — |
| **engineering-retro** | "weekly retro", "shipping stats", "what did we ship" | — |

### Cross-Cutting
| Skill | Triggers On | Reference Docs |
|-------|------------|----------------|
| **i18n-localization** | Translations, i18next, 13 languages, RTL support | — |
| **shared-packages** | @rawdrive/* packages, Orval, type generation, pnpm workspace | — |

## How Skills Work

Skills are **auto-loaded** when Claude detects relevant context in your task. Each skill:
1. Provides the most critical patterns and conventions (quick reference)
2. Points to detailed reference docs for deep dives
3. Includes code examples specific to RawDrive's architecture

## Relationship to Reference Docs

Skills are concise triggers (~100-200 lines) that give Claude the right mental model. The 24 reference docs in `.claude/reference/` are comprehensive guides (hundreds of lines each). Skills reference these docs but don't duplicate them.
