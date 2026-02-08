# RawDrive Codebase Structure

## Overview

This document describes the file structure and organization of the RawDrive codebase, following established patterns and conventions for an enterprise SaaS photography platform.

## Root Directory Structure

```
RawDrive2/
├── .planning/                    # Planning documentation
│   └── codebase/                # Architecture and structure docs
├── .claude/                      # Claude Code configuration
│   ├── skills/                   # Context-aware development skills
│   ├── commands/                 # Development workflow commands
│   ├── agents/                   # Specialized AI agents
│   ├── hooks/                    # Git hooks
│   ├── reference/                # Technical best practices
│   ├── PRD.md                    # Product requirements document
│   └── settings.json             # Claude configuration
├── backend/                       # Main backend API service
│   ├── migrations/versions/     # Database migrations
│   ├── src/
│   │   └── app/
│   │       ├── api/v1/          # API endpoints
│   │       ├── models/          # SQLAlchemy models
│   │       ├── repositories/    # Data access layer
│   │       ├── services/        # Business logic
│   │       ├── middleware/      # HTTP middleware
│   │       ├── api/             # API schemas
│   │       └── workers/         # Background workers
│   ├── tests/                   # Unit and integration tests
│   └── secrets/                  # JWT keys and credentials
├── frontend/                      # React frontend application
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── ui/              # Design system components
│   │   │   ├── layout/          # Layout components
│   │   │   └── features/        # Feature-specific components
│   │   ├── pages/               # Page components (route handlers)
│   │   ├── hooks/               # Custom React hooks
│   │   ├── services/            # API client services
│   │   ├── contexts/            # React contexts
│   │   ├── utils/               # Utility functions
│   │   └── types/               # TypeScript type definitions
│   ├── public/                  # Static assets
│   ├── dist/                   # Build output
│   └── .cache/                 # Build cache
├── services/                     # Microservices
│   ├── gallery-service/          # High-performance gallery viewing
│   ├── billing-service/          # Payment processing
│   ├── upload-service/           # TUS resumable uploads
│   ├── webhooks-service/         # Event-driven webhook delivery
│   ├── notifications-service/   # Multi-channel notifications
│   ├── onboarding-service/       # User registration & setup
│   ├── invitations-service/     # Digital wedding invitations
│   ├── client-service/           # Client/contact management
│   ├── ai-service/              # AI orchestration & MCP
│   ├── ai-processing-service/    # Heavy AI workloads
│   ├── livesync-service/        # Real-time file sync
│   ├── llm-service/             # LLM integration
│   ├── growth-service/          # Referrals & partner programs
│   └── photo-livesync-service/  # Photo-specific sync
├── packages/                     # Shared packages (monorepo)
│   ├── shared-types/            # Domain types (TypeScript)
│   ├── shared-constants/        # Configuration constants
│   ├── shared-validation/       # Validation utilities
│   ├── shared-utils/            # General utilities
│   ├── shared-api/              # API client shared code
│   └── database-utils/          # Database utilities
├── infrastructure/               # Infrastructure configuration
│   └── docker/                  # Docker configuration
│       └── docker-compose.yml   # All services configuration
├── docs/                        # Documentation
│   ├── Features/               # Detailed feature specifications
│   ├── Business_Features/       # Business feature specs
│   ├── TechnicalSpecs/          # Technical specifications
│   ├── ARCHITECTURE_QUICK_REFERENCE.md
│   ├── troubleshooting/        # Debugging guides
│   └── runbooks/               # Operational guides
├── .cache/                     # Build cache
├── .gitignore                  # Git ignore rules
├── FACEID_ANALYSIS_AND_PLAN.md  # Face ID analysis document
├── migration_error.txt         # Migration error logs
├── migration_output.txt        # Migration output logs
├── packages/                   # Additional packages
└── services/                   # Additional services
```

## Frontend Structure

### Component Organization

```
frontend/src/components/
├── ui/                         # Design system components
│   ├── AppButton.tsx           # Reusable button component
│   ├── AppInput.tsx            # Reusable input component
│   ├── AppModal.tsx            # Modal dialog component
│   ├── LoadingSpinner.tsx       # Loading indicator
│   └── Alert.tsx               # Alert/notification component
│
├── layout/                     # Layout components
│   ├── Header.tsx              # Application header
│   ├── Sidebar.tsx             # Navigation sidebar
│   ├── Footer.tsx              # Application footer
│   └── Layout.tsx              # Main layout container
│
└── features/                   # Feature-specific components
    ├── gallery/                # Gallery functionality
    │   ├── GalleryGrid.tsx     # Photo grid display
    │   ├── GalleryViewer.tsx   # Full-screen viewer
    │   ├── GalleryToolbar.tsx  # Gallery actions
    │   └── UploadPanel.tsx     # Photo upload
    │
    ├── album-design/          # Album design studio
    │   ├── DesignCanvas.tsx    # Design surface
    │   ├── TemplateGrid.tsx     # Template selection
    │   ├── CoverStyleGrid.tsx  # Cover style selection
    │   └── CommentPanel.tsx    # Comment system
    │
    ├── ai/                     # AI features
    │   ├── UnifiedAIPanel.tsx  # Main AI interface
    │   ├── AskSection.tsx      # AI ask interface
    │   ├── AnalyzeSection.tsx  # AI analysis tools
    │   └── CurateSection.tsx   # AI curation tools
    │
    ├── upload/                 # Upload functionality
    │   ├── DropZone.tsx        # Drag & drop zone
    │   ├── ProgressTracker.tsx # Upload progress
    │   └── FilePreview.tsx     # File preview
    │
    ├── client-management/      # Client management
    │   ├── ClientList.tsx      # Client listing
    │   ├── ClientForm.tsx      # Add/edit client
    │   └── ActivityTimeline.tsx # Client activity
    │
    └── webhooks/              # Webhooks management
        └── WorkflowBuilder.tsx # Visual workflow editor
```

### Frontend Conventions

```typescript
// Component naming: PascalCase.tsx
// Hook naming: useCamelCase.ts
// Service naming: camelCase.ts
// Type naming: PascalCase
// Constant naming: SCREAMING_SNAKE_CASE
```

### Page Structure

```
frontend/src/pages/
├── DashboardPage.tsx           # Main dashboard
├── GalleriesPage.tsx           # Galleries listing
├── GalleryPage.tsx            # Individual gallery
├── DesignStudioPage.tsx        # Album design studio
├── ClientsPage.tsx            # Client management
├── SettingsPage.tsx            # Workspace settings
└── ProfilePage.tsx             # User profile
```

## Backend Structure

### Layered Architecture

```
backend/src/app/
├── api/v1/                     # API endpoints
│   ├── auth.py                # Authentication endpoints
│   ├── galleries.py           # Gallery management
│   ├── assets.py              # Asset operations
│   ├── clients.py             # Client management
│   ├── faces.py               # Face detection
│   └── webhooks.py            # Webhook handling
│
├── models/                     # SQLAlchemy models
│   ├── user.py                # User model
│   ├── workspace.py           # Workspace model
│   ├── gallery.py             # Gallery model
│   ├── asset.py               # Asset model
│   ├── face.py                # Face detection model
│   └── webhook.py             # Webhook model
│
├── repositories/               # Data access layer
│   ├── user_repository.py     # User data access
│   ├── gallery_repository.py  # Gallery data access
│   ├── asset_repository.py    # Asset data access
│   └── face_repository.py     # Face data access
│
├── services/                   # Business logic
│   ├── auth_service.py        # Authentication logic
│   ├── gallery_service.py     # Gallery operations
│   ├── asset_service.py       # Asset management
│   ├── face_service.py        # Face detection
│   ├── ai_service.py          # AI orchestration
│   └── notification_service.py # Notifications
│
├── middleware/                 # HTTP middleware
│   ├── auth.py                # Authentication middleware
│   ├── cors.py                # CORS handling
│   └── rate_limit.py          # Rate limiting
│
└── workers/                   # Background workers
    ├── face_worker.py         # Face detection worker
    ├── content_worker.py      # Content analysis worker
    └── quality_worker.py      # Quality assessment worker
```

### Backend Conventions

```python
# Service naming: snake_case_service.py
# Repository naming: snake_case_repository.py
# Model naming: PascalCase (SQLAlchemy)
# API route naming: snake_case.py
# Constant naming: SCREAMING_SNAKE_CASE
```

## Microservices Structure

Each microservice follows a consistent structure:

```
services/[service-name]/
├── src/
│   ├── api/v1/                # API endpoints
│   │   ├── __init__.py       # API router initialization
│   │   ├── endpoints.py      # Route definitions
│   │   └── schemas.py        # Request/response models
│   ├── services/             # Business logic
│   │   ├── __init__.py       # Service registration
│   │   └── [service]_service.py
│   ├── repositories/          # Data access
│   │   ├── __init__.py       # Repository registration
│   │   └── [entity]_repository.py
│   ├── schemas/               # Pydantic models
│   ├── middleware/            # Service-specific middleware
│   ├── observability/        # Health checks, metrics
│   │   ├── health.py         # Health check endpoints
│   │   └── metrics.py        # Prometheus metrics
│   ├── config.py             # Service configuration
│   └── main.py               # FastAPI application
├── tests/                     # Unit and integration tests
│   ├── unit/                 # Unit tests
│   └── integration/          # Integration tests
├── Dockerfile                # Container definition
├── requirements.txt          # Python dependencies
├── alembic/                 # Database migrations
│   └── versions/            # Migration files
└── .env.example             # Environment template
```

### Service-Specific Patterns

```python
# Gallery Service Pattern
src/
├── api/v1/galleries.py      # Gallery CRUD operations
├── services/gallery_service.py     # Business logic
├── repositories/gallery_repository.py # Data access
└── schemas/gallery.py      # Gallery models

# Billing Service Pattern
src/
├── api/v1/billing.py        # Subscription management
├── services/billing_service.py     # Payment processing
├── repositories/billing_repository.py # Billing data
└── schemas/billing.py       # Billing models
```

## Shared Packages Structure

### Monorepo with pnpm Workspaces

```
packages/
├── shared-types/             # Domain types (TypeScript)
│   ├── src/
│   │   ├── index.ts         # Type exports
│   │   ├── gallery.ts      # Gallery types
│   │   ├── user.ts          # User types
│   │   └── asset.ts        # Asset types
│   └── package.json
│
├── shared-constants/         # Configuration constants
│   ├── src/
│   │   ├── index.ts         # Constant exports
│   │   ├── api.ts           # API constants
│   │   └── storage.ts       # Storage constants
│   └── package.json
│
├── shared-validation/        # Validation utilities
│   ├── src/
│   │   ├── index.ts         # Validation exports
│   │   ├── validators.ts   # Custom validators
│   │   └── sanitizers.ts   # Input sanitizers
│   └── package.json
│
└── shared-utils/            # General utilities
    ├── src/
    │   ├── index.ts         # Utility exports
    │   ├── formatters.ts   # Data formatters
    │   └── helpers.ts       # General helpers
    └── package.json
```

### Python Integration

Shared Python modules are generated from TypeScript:

```
# Backend imports
from app.shared.types import GalleryStatus, UserRole
from app.shared.constants import API_BASE, PAGINATION
```

## Database Structure

### Migration Pattern

```
backend/migrations/versions/
├── 0001_initial_schema.py              # Initial schema
├── 0002_add_galleries.py                # Add galleries table
├── 0003_add_assets_table.py            # Add assets table
└── 0004_add_face_detection.py          # Add face detection
```

### Model Relationships

```python
# Workspace-level isolation
class Workspace(Base):
    id = UUID primary key
    name = string
    settings = JSONB

class Gallery(Base):
    id = UUID primary key
    workspace_id = UUID foreign key
    name = string
    status = enum

class Asset(Base):
    id = UUID primary key
    workspace_id = UUID foreign key
    gallery_id = UUID foreign key
    file_path = string
    metadata = JSONB

class Face(Base):
    id = UUID primary key
    workspace_id = UUID foreign key
    asset_id = UUID foreign key
    embedding = vector(512)
    bounding_box = JSONB
```

## Documentation Structure

### Product Documentation

```
docs/
├── Features/                    # Feature specifications
│   ├── Gallery_System.md       # Gallery feature details
│   ├── AI_Features.md          # AI capabilities
│   └── Client_Management.md    # CRM features
│
├── Business_Features/          # Business feature specs
│   ├── Subscription_Tiers.md    # Pricing plans
│   └── Partner_Program.md      # Affiliate program
│
└── TechnicalSpecs/             # Technical specifications
    ├── API_Specification.json  # API contract
    ├── Database_Schema.json    # Database schema
    └── Security_Model.md       # Security implementation
```

### Operational Documentation

```
docs/
├── troubleshooting/             # Debugging guides
│   ├── common_issues.md        # Common problems
│   └── debugging_ai.md         # AI debugging
│
├── runbooks/                   # Operational guides
│   ├── deployment.md          # Deployment process
│   └── monitoring.md           # Monitoring setup
│
└── ARCHITECTURE_QUICK_REFERENCE.md  # Quick architecture guide
```

## Configuration Structure

### Environment Variables

```
# .env configuration
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/rawdrive
REDIS_URL=redis://localhost:6379/0

# Authentication
JWT_SECRET=64-byte-hex-string
JWT_ALGORITHM=EdDSA

# Storage
R2_ACCESS_KEY_ID=cloudflare-r2-key
R2_SECRET_ACCESS_KEY=cloudflare-r2-secret
R2_BUCKET_NAME=rawdrive-assets

# AI Services
AI_PROVIDER=openai
AI_API_KEY=ai-service-key
AI_MODEL=gpt-4

# Payment
STRIPE_SECRET_KEY=stripe-secret-key
RAZORPAY_KEY_ID=razorpay-key
```

### Docker Configuration

```yaml
# docker-compose.yml
services:
  backend:
    build: ../../backend
    environment:
      DATABASE_URL: postgresql+asyncpg://rawdrive:rawdrive@postgres:5432/rawdrive
      REDIS_URL: redis://redis:6379/0
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

## Claude Tooling Structure

### Skills Organization

```
.claude/skills/
├── accessibility.ts           # WCAG compliance
├── api-standards.ts          # API conventions
├── design-system.ts          # UI components
├── frontend-design.ts        # UI/UX patterns
├── security.ts              # Security practices
└── testing.ts               # Testing patterns
```

### Commands Organization

```
.claude/commands/
├── dev/
│   ├── start-dev.ts         # Start development
│   ├── run-tests.ts         # Run tests
│   └── deploy.ts            # Deploy to production
│
└── code/
    ├── format.ts            # Code formatting
    ├── lint.ts              # Linting
    └── type-check.ts        # Type checking
```

### Agents Organization

```
.claude/agents/
├── database-architect.ts    # Schema design
├── debugger.ts             # Root cause analysis
├── devops-engineer.ts      # Deployment
├── performance-optimizer.ts # Performance tuning
├── security-auditor.ts    # Security review
├── ui-component-designer.ts # UI design
└── auth-troubleshooter.ts  # Auth debugging
```

## Best Practices

### File Placement Rules

1. **Never create files in random locations**
2. **Follow established patterns** for each service type
3. **Use shared packages** for cross-cutting concerns
4. **Keep documentation** in designated directories
5. **Separate concerns** between layers and services

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React components | `PascalCase.tsx` | `GalleryUpload.tsx` |
| React hooks | `useCamelCase.ts` | `useUpload.ts` |
| Python services | `snake_case_service.py` | `gallery_service.py` |
| Python classes | `PascalCase` | `GalleryService` |
| API routes | `/api/v1/kebab-case` | `/api/v1/gallery-items` |
| Database tables | `snake_case` | `gallery_items` |
| Environment variables | `SCREAMING_SNAKE` | `JWT_SECRET` |

### Code Organization

1. **Frontend**: Component-based organization with clear feature boundaries
2. **Backend**: Layered architecture with separation of concerns
3. **Microservices**: Consistent structure across all services
4. **Shared packages**: Reusable code with clear interfaces
5. **Documentation**: Comprehensive and up-to-date

---

*This structure document provides a comprehensive guide to navigating and understanding the RawDrive codebase. Follow these patterns when adding new features or making changes to the codebase.*