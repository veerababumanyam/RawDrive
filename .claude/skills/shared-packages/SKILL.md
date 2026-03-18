---
name: shared-packages
description: "RawDrive monorepo shared packages: @rawdrive/shared-types, shared-constants, shared-validation, shared-utils, shared-api, database-utils, and api-types. Use this skill when importing shared types, adding new constants, creating validation schemas, generating API client types with Orval, or managing the pnpm workspace. Also use when adding new shared functionality, running package builds, or understanding package dependencies. Triggers on: shared-types, shared-constants, shared-validation, shared-utils, api-types, @rawdrive, pnpm workspace, monorepo package, shared package, Orval, type generation."
---

# Shared Packages (pnpm Workspaces)

RawDrive uses 7 shared packages in a pnpm monorepo. All cross-service types, constants, and utilities live here.

## Package Overview

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `@rawdrive/shared-types` | Domain type definitions | `InvitationStatus`, `GalleryStatus`, `RSVPStatus`, `EventType`, `LayoutMode`, `AIGenerationType`, `NotificationPreference` |
| `@rawdrive/shared-constants` | Centralized configuration | `API_BASE`, `PAGINATION`, `RATE_LIMITS`, `FILE_LIMITS`, `STORAGE_KEYS`, `AI_THRESHOLDS`, `BOOKING_LIMITS`, `EXPORT_SIZE_LIMITS` |
| `@rawdrive/shared-validation` | Zod validation schemas | `isValidHexColor`, RSVP schemas, input patterns |
| `@rawdrive/shared-utils` | Utility functions | `formatRelativeDate`, `formatFileSize` |
| `@rawdrive/shared-api` | API utilities | Error handling, pagination helpers, response formatting |
| `@rawdrive/database-utils` | SQLAlchemy helpers | Database constants, query utilities, type helpers |
| `@rawdrive/api-types` | Auto-generated API clients | TypeScript clients for all services via Orval |

## Usage

### Frontend (TypeScript)
```typescript
import { InvitationStatus, GalleryStatus } from '@rawdrive/shared-types';
import { API_BASE, PAGINATION, FILE_LIMITS } from '@rawdrive/shared-constants';
import { isValidHexColor } from '@rawdrive/shared-validation';
import { formatFileSize, formatRelativeDate } from '@rawdrive/shared-utils';
```

### Backend (Python — generated)
```python
from app.shared.types import InvitationStatus, GalleryStatus
from app.shared.constants import API_BASE, PAGINATION
```

## API Types (Orval Auto-Generation)

`@rawdrive/api-types` auto-generates TypeScript clients from OpenAPI schemas:

```typescript
// Generated clients for each service
import { BackendAPI } from '@rawdrive/api-types/backend';
import { GalleryServiceAPI } from '@rawdrive/api-types/gallery-service';
import { BillingServiceAPI } from '@rawdrive/api-types/billing-service';
import { ClientServiceAPI } from '@rawdrive/api-types/client-service';
import { InvitationsServiceAPI } from '@rawdrive/api-types/invitations-service';
import { NotificationsServiceAPI } from '@rawdrive/api-types/notifications-service';
import { WebhooksServiceAPI } from '@rawdrive/api-types/webhooks-service';
```

**Dependencies:** `zod ^3.23.8`, peer: `axios >=1.0.0`

### Regenerating API Types
```bash
pnpm --filter @rawdrive/api-types generate:openapi   # From OpenAPI schemas
pnpm --filter @rawdrive/api-types generate:clients    # Via Orval
```

## Adding New Shared Code

### New Type
1. Add to `packages/shared-types/src/<category>.ts`
2. Export from `packages/shared-types/src/index.ts`
3. Run `pnpm build:packages`
4. Run `pnpm generate:python` (if needed in backend)

### New Constant
1. Add to appropriate file in `packages/shared-constants/src/`
2. Available categories: `admin`, `analytics`, `api`, `calendar`, `compliance`, `export`, `livesync`, `storage`
3. Export from index
4. Rebuild packages

### New Validation
1. Add Zod schema to `packages/shared-validation/src/`
2. Uses `zod ^4.3.5`

## Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - packages/*
  - frontend
  - backend
  - services/*
  - desktop
  - mobile
```

## Commands

```bash
pnpm build:packages      # Build all shared packages
pnpm generate:python     # Generate Python types from TypeScript
pnpm test:packages       # Test shared packages
pnpm --filter @rawdrive/shared-types build  # Build specific package
```

## Rules

1. **Types go in shared-types** — never define domain types locally
2. **Constants go in shared-constants** — never hardcode magic numbers
3. **Validation goes in shared-validation** — reuse across frontend and services
4. **Build after changes** — always run `pnpm build:packages` after modifying
5. **Keep in sync** — TypeScript types and Python types must match
