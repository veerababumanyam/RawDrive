# RawDrive Project Structure

## Directory Layout

```
RawDrive/
├── frontend/                    # React 19 + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/         # Reusable React components
│   │   │   ├── ui/            # Design system components (AppButton, AppInput, etc.)
│   │   │   ├── gallery/       # Gallery-specific components
│   │   │   ├── album/         # Album designer components
│   │   │   └── common/        # Shared components (Header, Footer, etc.)
│   │   ├── pages/             # Page components (route-level)
│   │   ├── services/          # API clients and external service integrations
│   │   ├── hooks/             # Custom React hooks
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Utility functions
│   │   ├── styles/            # Global styles and CSS variables
│   │   ├── App.tsx            # Root component
│   │   └── index.css           # Design tokens and CSS variables
│   ├── public/                # Static assets
│   ├── tailwind.config.js     # Tailwind configuration
│   ├── vite.config.ts         # Vite configuration
│   ├── tsconfig.json          # TypeScript configuration
│   └── package.json           # Frontend dependencies
│
├── backend/                     # Express 5 + TypeScript + PostgreSQL
│   ├── src/
│   │   ├── index.ts           # Application entry point
│   │   ├── config/            # Configuration files
│   │   │   ├── database.ts    # PostgreSQL connection
│   │   │   ├── redis.ts       # Redis connection
│   │   │   └── env.ts         # Environment variables
│   │   ├── middleware/        # Express middleware
│   │   │   ├── auth.ts        # Authentication middleware
│   │   │   ├── tenant.ts      # Tenant/workspace scoping
│   │   │   ├── errorHandler.ts # Error handling
│   │   │   └── rateLimit.ts   # Rate limiting
│   │   ├── routes/            # API routes
│   │   │   └── v1/            # API v1 endpoints
│   │   │       ├── auth.ts
│   │   │       ├── galleries.ts
│   │   │       ├── photos.ts
│   │   │       ├── albums.ts
│   │   │       ├── clients.ts
│   │   │       ├── bookings.ts
│   │   │       └── payments.ts
│   │   ├── controllers/       # Request handlers
│   │   ├── services/          # Business logic
│   │   │   ├── authService.ts
│   │   │   ├── galleryService.ts
│   │   │   ├── photoService.ts
│   │   │   ├── storageService.ts
│   │   │   ├── aiService.ts
│   │   │   └── paymentService.ts
│   │   ├── models/            # Data models and types
│   │   ├── db/                # Database layer
│   │   │   ├── migrations/    # SQL migration files (numbered)
│   │   │   ├── schema.sql     # Database schema
│   │   │   └── seeds/         # Seed data for development
│   │   ├── workers/           # Background job workers
│   │   │   ├── photoProcessor.ts
│   │   │   ├── aiProcessor.ts
│   │   │   └── emailWorker.ts
│   │   ├── utils/             # Utility functions
│   │   ├── types/             # TypeScript type definitions
│   │   └── logger.ts          # Logging configuration
│   ├── tests/                 # Test files
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   ├── tsconfig.json          # TypeScript configuration
│   └── package.json           # Backend dependencies
│
├── ai-service/                  # Python FastAPI (optional, Phase 6+)
│   ├── src/
│   │   ├── main.py            # FastAPI application
│   │   ├── models/            # ML models and inference
│   │   ├── services/          # AI service logic
│   │   ├── routes/            # API endpoints
│   │   └── utils/             # Utility functions
│   ├── tests/                 # Test files
│   ├── requirements.txt       # Python dependencies
│   └── Dockerfile             # Container configuration
│
├── infrastructure/              # Deployment and infrastructure
│   ├── docker-compose.yml     # Local development environment
│   ├── Dockerfile             # Backend container image
│   ├── nginx/                 # Nginx configuration
│   │   └── nginx.conf
│   ├── kubernetes/            # Kubernetes manifests (future)
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── ingress.yaml
│   └── monitoring/            # Prometheus, Grafana configs
│
├── docs/                        # Project documentation
│   ├── project/               # Project-level documentation
│   │   ├── 01-TECH_STACK.md
│   │   ├── 02-SECURITY_REQUIREMENTS.md
│   │   ├── 03-API_CONTRACTS.md
│   │   ├── 04-DATA_MODEL.md
│   │   ├── 05-ONBOARDING_FLOWS.md
│   │   ├── 06-PRICING_MODEL.md
│   │   ├── 07-PROD_CHECKLIST.md
│   │   ├── 08-SUPPORT_PLAYBOOK.md
│   │   └── roadmap.md
│   ├── Features/               # Feature documentation
│   │   ├── PRD.md
│   │   ├── CLIENT_FACING_FEATURES.md
│   │   ├── GalleryFeatures.md
│   │   ├── DigitalAlbumFeatures.md
│   │   ├── CALENDAR_INTEGRATIONS_AND_BOOKINGS.md
│   │   ├── AI_POWERED_FEATURES.md
│   │   ├── GEO_Search.md
│   │   ├── BYOS_Requiremetns.md
│   │   └── ... (more feature docs)
│   ├── TechnicalSpecs/        # Technical specifications
│   │   ├── index.json
│   │   ├── auth_rbac.json
│   │   ├── galleries_client_portal.json
│   │   ├── album_designer.json
│   │   ├── payments_billing_subscriptions.json
│   │   └── ... (more specs)
│   └── DatabaseSchemas/       # Database schema documentation
│
├── .kiro/                       # Kiro IDE configuration
│   ├── steering/              # Steering rules for AI assistants
│   │   ├── product.md         # Product overview
│   │   ├── tech.md            # Technology stack
│   │   └── structure.md       # Project structure (this file)
│   └── settings/              # IDE settings
│
├── .github/                     # GitHub configuration
│   ├── workflows/             # CI/CD workflows
│   │   ├── test.yml           # Run tests on PR
│   │   ├── lint.yml           # Lint code
│   │   └── deploy.yml         # Deploy to production
│   └── CODEOWNERS             # Code ownership rules
│
├── .env                         # Environment variables (local development)
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore rules
├── .eslintrc.json              # ESLint configuration
├── .prettierrc                 # Prettier configuration
├── tsconfig.json               # Root TypeScript configuration
├── package.json                # Root package.json (monorepo)
├── pnpm-workspace.yaml         # pnpm workspace configuration
├── docker-compose.yml          # Local development containers
├── CLAUDE.md                   # AI context and coding guidelines
└── README.md                   # Project overview

```

## Key Organizational Principles

### Multi-Tenant Data Isolation

Every database query and API endpoint must include `workspace_id` (tenant_id) filtering:

```typescript
// CORRECT: Always filter by workspace_id
const galleries = await db.query(
  'SELECT * FROM galleries WHERE workspace_id = $1',
  [req.user.workspaceId]
);

// WRONG: Never trust client-provided workspace_id
const galleries = await db.query(
  'SELECT * FROM galleries WHERE workspace_id = $1',
  [req.body.workspaceId]  // SECURITY VULNERABILITY
);
```

### Component Organization

**Frontend components follow this hierarchy:**

1. **UI Components** (`components/ui/`): Design system primitives
   - AppButton, AppInput, AppCard, AppBadge, etc.
   - Reusable across the entire application
   - No business logic

2. **Feature Components** (`components/gallery/`, `components/album/`, etc.): Domain-specific
   - GalleryGrid, PhotoLightbox, AlbumDesigner, etc.
   - May contain business logic
   - Scoped to specific features

3. **Page Components** (`pages/`): Route-level containers
   - GalleryPage, AlbumPage, DashboardPage, etc.
   - Orchestrate feature components
   - Handle data fetching and state management

### Service Layer Organization

**Backend services follow this pattern:**

1. **Controllers** (`controllers/`): Request handlers
   - Parse and validate input
   - Call services
   - Format responses

2. **Services** (`services/`): Business logic
   - Implement domain logic
   - Handle data transformations
   - Coordinate with repositories

3. **Models** (`models/`): Data access
   - Database queries
   - ORM interactions
   - Data persistence

### Database Organization

**Migrations are numbered and immutable:**

```
backend/src/db/migrations/
├── 001_create_users_table.sql
├── 002_create_workspaces_table.sql
├── 003_create_galleries_table.sql
├── 004_add_workspace_id_to_galleries.sql
└── ...
```

**Schema includes:**
- `workspace_id` on all customer-data tables
- Proper indexes for common queries
- Foreign key constraints
- Audit columns (created_at, updated_at, deleted_at)

### API Route Organization

**Routes are organized by resource and versioned:**

```
backend/src/routes/v1/
├── auth.ts              # POST /api/v1/auth/login, /auth/logout
├── galleries.ts         # GET/POST /api/v1/galleries
├── photos.ts            # GET/POST /api/v1/photos
├── albums.ts            # GET/POST /api/v1/albums
├── clients.ts           # GET/POST /api/v1/clients
├── bookings.ts          # GET/POST /api/v1/bookings
└── payments.ts          # GET/POST /api/v1/payments
```

### Type Definitions

**TypeScript types are centralized:**

```
frontend/src/types/
├── types.ts             # All frontend types
├── api.ts               # API request/response types
└── models.ts            # Domain model types

backend/src/types/
├── types.ts             # All backend types
├── models.ts            # Database model types
└── api.ts               # API contract types
```

### Utility Functions

**Utilities are organized by domain:**

```
frontend/src/utils/
├── formatting.ts        # Date, currency, number formatting
├── validation.ts        # Form and input validation
├── storage.ts           # LocalStorage helpers
└── api.ts               # API helper functions

backend/src/utils/
├── encryption.ts        # Encryption/decryption
├── jwt.ts               # JWT token generation/verification
├── validation.ts        # Input validation
└── errors.ts            # Error handling utilities
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React components | PascalCase | `GalleryGrid.tsx` |
| TypeScript interfaces | PascalCase | `interface Gallery {}` |
| TypeScript types | PascalCase | `type GalleryStatus = 'draft' \| 'published'` |
| Services (TS) | PascalCase + Service | `GalleryService.ts` |
| Services (Python) | snake_case | `gallery_service.py` |
| API routes | kebab-case | `/api/v1/photo-albums` |
| Database tables | snake_case | `user_workspaces` |
| Database columns | snake_case | `created_at` |
| Environment vars | SCREAMING_SNAKE_CASE | `JWT_SECRET` |
| CSS classes | kebab-case | `gallery-grid`, `photo-card` |
| CSS variables | kebab-case | `--color-primary`, `--spacing-base` |

## File Size Guidelines

- **React components**: Max 400 lines (split into smaller components)
- **Services**: Max 600 lines (split by domain)
- **Controllers**: Max 300 lines (one resource per file)
- **Utilities**: Max 200 lines (split by function)

## Import Organization

**Imports should follow this order:**

```typescript
// 1. External libraries
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Type imports
import type { Gallery } from '@/types/types';

// 3. Internal services/utilities
import { galleryService } from '@/services/galleryService';
import { formatDate } from '@/utils/formatting';

// 4. Internal components
import { AppButton } from '@/components/ui/AppButton';
import { GalleryGrid } from '@/components/gallery/GalleryGrid';

// 5. Styles
import styles from './GalleryPage.module.css';
```

## Path Aliases

**Frontend uses `@/*` alias:**

```typescript
// Instead of: import { Gallery } from '../../../types/types'
import { Gallery } from '@/types/types';

// Instead of: import { AppButton } from '../../../components/ui/AppButton'
import { AppButton } from '@/components/ui/AppButton';
```

**Backend uses `@/*` alias:**

```typescript
// Instead of: import { galleryService } from '../../../services/galleryService'
import { galleryService } from '@/services/galleryService';
```

## Documentation Files

**Each major feature should have documentation:**

```
docs/Features/
├── FEATURE_NAME.md          # Feature overview and requirements
├── FEATURE_NAME_DESIGN.md   # Design and architecture
└── FEATURE_NAME_API.md      # API contracts (optional)
```

**Documentation should include:**
- Feature overview
- User stories
- Technical requirements
- API contracts (if applicable)
- Database schema changes
- Security considerations

## Testing Organization

**Tests mirror source structure:**

```
backend/tests/
├── unit/
│   ├── services/
│   │   ├── galleryService.test.ts
│   │   └── authService.test.ts
│   └── utils/
│       └── validation.test.ts
├── integration/
│   ├── galleries.test.ts
│   ├── auth.test.ts
│   └── payments.test.ts
└── fixtures/
    ├── users.json
    └── galleries.json

frontend/tests/
├── unit/
│   ├── components/
│   │   └── GalleryGrid.test.tsx
│   └── utils/
│       └── formatting.test.ts
└── integration/
    └── gallery-flow.test.tsx
```

## Configuration Files

**Root-level configuration:**

- `.env` - Environment variables (local development)
- `.env.example` - Environment variables template
- `.eslintrc.json` - ESLint rules
- `.prettierrc` - Code formatting rules
- `tsconfig.json` - TypeScript configuration
- `package.json` - Monorepo root dependencies
- `pnpm-workspace.yaml` - Workspace configuration
- `docker-compose.yml` - Local development containers

**Workspace-specific configuration:**

- `frontend/vite.config.ts` - Vite build configuration
- `frontend/tailwind.config.js` - Tailwind CSS configuration
- `backend/tsconfig.json` - Backend TypeScript configuration

## Git Workflow

**Branch naming:**

```bash
feature/add-album-sharing      # New features
fix/photo-upload-timeout       # Bug fixes
refactor/gallery-service       # Code improvements
docs/api-documentation         # Documentation
chore/update-dependencies      # Maintenance
```

**Commit messages:**

```bash
feat(gallery): add bulk photo selection
fix(upload): handle timeout on large files
refactor(auth): extract token validation to middleware
docs(api): add gallery endpoints documentation
test(photos): add integration tests for upload flow
```

## Development Workflow

1. **Setup**: `npm install && npm run docker:dev:up`
2. **Development**: `npm run dev:all` (frontend + backend)
3. **Testing**: `npm test` (run all tests)
4. **Linting**: `npm run lint` (check code quality)
5. **Building**: `npm run build` (production build)
6. **Deployment**: Push to main branch (GitHub Actions handles CI/CD)

## Related Documentation

- `CLAUDE.md` - AI context and coding guidelines
- `docs/project/01-TECH_STACK.md` - Technology decisions
- `docs/project/04-DATA_MODEL.md` - Database schema
- `docs/Features/PRD.md` - Product requirements
