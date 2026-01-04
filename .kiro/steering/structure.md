# RawDrive Project Structure

## Directory Layout

```
RawDrive/
├── frontend/                    # React 19 + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/         # Reusable React components
│   │   │   ├── ui/            # Design system components (AppButton, AppInput, etc.)
│   │   │   ├── features/      # Feature-sliced domain components
│   │   │   │   ├── gallery/   # Gallery features
│   │   │   │   ├── profile/   # Public profile features
│   │   │   │   ├── invitations/ # Digital invitation features
│   │   │   │   └── ...        # (album, billing, auth, etc.)
│   │   │   ├── layout/        # Layout components (Sidebar, Shell, etc.)
│   │   │   ├── landing/       # Landing page components
│   │   │   ├── auth/          # Authentication flows
│   │   │   ├── admin/         # Admin panel components
│   │   │   └── common/        # Shared components
│   │   ├── pages/             # Page components (route-level)
│   │   ├── services/          # API clients (galleryService, authService, etc.)
│   │   ├── hooks/             # Custom hooks (useGallery, useAuth, etc.)
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Utility functions
│   │   ├── styles/            # Global styles and CSS variables
│   │   ├── App.tsx            # Root component
│   │   └── index.css           # Design tokens and CSS variables
│   ├── public/                # Static assets (favicons, logos)
│   ├── tailwind.config.js     # Tailwind configuration
│   ├── vite.config.ts         # Vite configuration
│   ├── tsconfig.json          # TypeScript configuration
│   └── package.json           # Frontend dependencies
│
├── backend/                     # Python 3.11+ + FastAPI + SQLAlchemy
│   ├── src/
│   │   ├── app/
│   │   │   ├── main.py            # Application entry point
│   │   │   ├── api/               # API Layer
│   │   │   │   ├── v1/            # Route handlers
│   │   │   │   └── schemas.py     # Pydantic models (Request/Response)
│   │   │   ├── models/            # Pydantic Domain models
│   │   │   ├── repositories/      # Data access layer
│   │   │   ├── services/          # Business logic
│   │   │   ├── core/              # Config and security
│   │   │   └── workers/           # Background tasks
│   │   └── migrations/            # Alembic migrations
│   ├── tests/                     # Pytest tests
│   ├── alembic.ini                # Alembic configuration
│   ├── pyproject.toml             # Project configuration
│   └── requirements.txt           # Python dependencies
│
├── ai-service/                  # Python FastAPI (optional, Phase 6+)
│   ├── src/
│   │   ├── main.py            # FastAPI application
│   │   ├── models/            # ML models and inference
│   │   ├── services/          # AI service logic
│   │   └── routes/            # API endpoints
│   ├── tests/                 # Test files
│   ├── pyproject.toml         # Python dependencies and config
│   └── Dockerfile             # Container configuration
│
├── infrastructure/              # Deployment and infrastructure
│   ├── docker/                # Dockerfiles and helpers
│   ├── nginx/                 # Nginx configuration
│   ├── monitoring/            # Prometheus, Grafana configs
│   ├── scripts/               # Utility scripts
│   └── docker-compose.yml     # Local development environment (if moved here)
│
├── docs/                        # Project documentation
│   ├── project/               # Project-level documentation (Tech Stack, API, etc.)
│   ├── Features/              # Feature documentation (PRD, Requirements)
│   ├── TechnicalSpecs/        # Technical specifications
│   └── DatabaseSchemas/       # Database schema documentation
│
├── .kiro/                       # Kiro IDE configuration
│   ├── steering/              # Steering rules for AI assistants
│   │   ├── product.md         # Product overview
│   │   ├── tech.md            # Technology stack
│   │   └── structure.md       # Project structure (this file)
│   └── settings/              # IDE settings
│
├── .github/                     # GitHub configuration (Workflows, Codeowners)
├── .env                         # Environment variables (local development)
├── .gitignore                  # Git ignore rules
├── .eslintrc.json              # ESLint configuration
├── .prettierrc                 # Prettier configuration
├── tsconfig.json               # Root TypeScript configuration
├── package.json                # Root package.json (monorepo)
├── pnpm-workspace.yaml         # pnpm workspace configuration
├── docker-compose.yml          # Local development containers
├── CLAUDE.md                   # AI context and coding guidelines
└── README.md                   # Project overview
````

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

2. **Feature Components** (`components/features/`): Domain-specific
   - Organized by feature (`gallery`, `profile`, `invitations`)
   - `components/features/gallery/`, `components/features/profile/`
   - Scoped to specific features, containing their own sub-components

3. **Page Components** (`pages/`): Route-level containers
   - Organized by layout context (`admin/`, `workspace/`, `public/`)
   - `pages/workspace/GalleryPage`, `pages/admin/DashboardPage`
   - Orchestrate feature components & data fetching

### Service Layer Organization (Backend)
1. **API Layer** (`api/v1/`): Route handlers (FastAPI)
   - Validate inputs (Pydantic)
   - Call services
2. **Service Layer** (`services/`): Business Logic
   - Coordinate transactions
   - Complex domain logic
3. **Repository Layer** (`repositories/`): Data Access
   - Raw SQL queries (asyncpg)
   - Database abstractions
4. **Models** (`models/`):
   - Pydantic Domain models

### Database Organization

**Migrations are managed by Alembic:**

```
backend/migrations/versions/
├── 1234abcd_create_users_table.py
├── 5678efgh_add_workspace_id.py
└── ...
```

**Schema includes:**
- `workspace_id` on all customer-data tables
- Proper indexes for common queries
- Foreign key constraints
- Audit columns (created_at, updated_at, deleted_at)

### API Route Organization

**Routes are organized by resource:**

```
backend/src/app/api/v1/
├── auth.py
├── galleries.py
├── photos.py
└── ...
```

### Type Definitions

**TypeScript types are centralized:**

```
frontend/src/types/
├── client.ts            # Client domain types
├── gallery.ts           # Gallery domain types
├── invitations.ts       # Invitation domain types
├── common.ts            # Shared types
└── ...                  # (activity, userSettings, etc.)

backend/src/app/
├── api/schemas.py       # Pydantic Schemas (Request/Response types)
├── models/              # Pydantic Domain Models
└── ...
```

### Utility Functions

**Utilities are organized by domain:**

```
frontend/src/utils/
├── date.ts              # Date formatting (date-fns wrapper)
├── fileUtils.ts         # File handling helpers
├── colorTools.ts        # Color manipulation
├── themeTransformer.ts  # Theme conversion logic
└── ...                  # (securityUtils, errorMessages, etc.)

backend/src/app/
├── core/security.py     # Auth utilities
├── utils/
│   ├── time.py          # Time helpers
│   └── email.py         # Email helpers
└── ...
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
- **API Routes**: Max 300 lines (one resource per file)
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
import { GalleryCard } from '@/components/features/gallery/GalleryCard';

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

**Backend uses absolute imports:**

```python
# From src root
from src.app.services.gallery_service import GalleryService
from src.app.core.config import settings
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
├── integration/
├── fixtures/
└── conftest.py          # Pytest configuration and fixtures

frontend/tests/
├── unit/
│   ├── components/
│   │   └── GalleryCard.test.tsx
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
- `backend/pyproject.toml` - Backend Python configuration

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

1. **Setup**: `npm install` (frontend) + `pip install -r requirements.txt` (backend)
2. **Development**:
   - Frontend: `npm run dev`
   - Backend: `uvicorn src.app.main:app --reload`
   - Services: `docker-compose up -d`
3. **Testing**: `npm test` (run all tests)
4. **Linting**: `npm run lint` (check code quality)
5. **Building**: `npm run build` (production build)
6. **Deployment**: Push to main branch (GitHub Actions handles CI/CD)

## Related Documentation

- `CLAUDE.md` - AI context and coding guidelines
- `docs/project/01-TECH_STACK.md` - Technology decisions
- `docs/project/04-DATA_MODEL.md` - Database schema
- `docs/Features/PRD.md` - Product requirements
