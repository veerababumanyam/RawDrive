# @rawdrive/api-types

Auto-generated TypeScript types and API clients for RawDrive microservices.

## Overview

This package provides:

- **Strongly typed API clients** - Generated from OpenAPI specs
- **Request/response types** - Full TypeScript definitions
- **Zod schemas** - Runtime validation for API responses
- **Service discovery** - Port mappings and service URLs

## Installation

```bash
pnpm add @rawdrive/api-types
```

## Quick Start

### Using Generated Clients

```typescript
import { getGalleries, Gallery } from '@rawdrive/api-types/gallery-service';
import { getCurrentUser } from '@rawdrive/api-types/backend';

// Get current user
const user = await getCurrentUser();
console.log('Logged in as:', user.email);

// List galleries with full type safety
const response = await getGalleries({
  workspaceId: 'xxx',
  page: 1,
  limit: 20,
  status: 'published', // TypeScript enforces valid status values
});

// response.data is typed as Gallery[]
response.data.forEach(gallery => {
  console.log(gallery.title, gallery.status);
});
```

### Runtime Validation with Zod

```typescript
import { gallerySchema, validateApiResponse } from '@rawdrive/api-types/schemas';
import type { Gallery } from '@rawdrive/api-types/gallery-service';

// Validate API response at runtime
const result = validateApiResponse(apiData, gallerySchema);

if (result.success) {
  // result.data is fully typed as Gallery
  console.log('Valid gallery:', result.data.title);
} else {
  // result.error contains Zod validation errors
  console.error('Invalid data:', result.error.issues);
}
```

### With React Query

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { getGalleries, createGallery, Gallery } from '@rawdrive/api-types/gallery-service';

// Query hook with full type inference
function useGalleries(workspaceId: string) {
  return useQuery({
    queryKey: ['galleries', workspaceId],
    queryFn: () => getGalleries({ workspaceId, page: 1, limit: 50 }),
  });
}

// Mutation hook with typed request/response
function useCreateGallery() {
  return useMutation({
    mutationFn: (data: { workspaceId: string; title: string }) =>
      createGallery({
        workspaceId: data.workspaceId,
        data: { title: data.title },
      }),
  });
}

// Usage in component
function GalleryList() {
  const { data, isLoading } = useGalleries('workspace-id');
  const createMutation = useCreateGallery();

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {data?.data.map(gallery => (
        <li key={gallery.id}>{gallery.title}</li>
      ))}
    </ul>
  );
}
```

## Available Services

| Service | Import Path | Description |
|---------|-------------|-------------|
| Backend | `@rawdrive/api-types/backend` | Auth, users, workspaces |
| Gallery | `@rawdrive/api-types/gallery-service` | Galleries, assets, sub-galleries |
| Webhooks | `@rawdrive/api-types/webhooks-service` | Webhook subscriptions, deliveries |
| Billing | `@rawdrive/api-types/billing-service` | Payments, subscriptions |
| Client | `@rawdrive/api-types/client-service` | Client/contact management |
| Notifications | `@rawdrive/api-types/notifications-service` | Email, push notifications |
| Invitations | `@rawdrive/api-types/invitations-service` | Digital wedding invitations |

## Generating Types

### Prerequisites

1. All microservices must be running:
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml up -d
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

### Generate Commands

From the repository root:

```bash
# Generate OpenAPI schemas from running services
pnpm generate:openapi

# Generate TypeScript clients from schemas
pnpm generate:api-clients

# Or do both in one command
pnpm generate:api-types
```

### Workflow

1. Make API changes in FastAPI microservices
2. Restart affected services
3. Run `pnpm generate:api-types`
4. Commit generated files

## Package Structure

```
packages/api-types/
├── openapi/                  # OpenAPI JSON specs (generated)
│   ├── backend.json
│   ├── gallery-service.json
│   └── ...
├── src/
│   ├── clients/              # API client functions (generated)
│   │   ├── backend.ts
│   │   ├── gallery-service.ts
│   │   └── ...
│   ├── models/               # Type definitions (generated)
│   ├── schemas/              # Zod validation schemas
│   │   └── index.ts
│   ├── lib/
│   │   └── axios-instance.ts # Axios mutator for auth
│   └── index.ts              # Package exports
├── orval.config.ts           # Orval configuration
└── package.json
```

## Zod Schemas

The package includes pre-built Zod schemas for common types:

```typescript
import {
  // Common
  uuidSchema,
  dateTimeSchema,
  paginationMetaSchema,
  apiErrorSchema,

  // Gallery
  gallerySchema,
  galleryStatusSchema,
  galleryListResponseSchema,

  // Asset
  assetSchema,
  assetTypeSchema,
  assetListResponseSchema,

  // User & Workspace
  userSchema,
  userRoleSchema,
  workspaceSchema,

  // Webhook
  webhookEventTypeSchema,
  webhookSubscriptionSchema,

  // Utilities
  validateApiResponse,
  assertValidResponse,
  createResponseValidator,
} from '@rawdrive/api-types/schemas';
```

## Error Handling

All API clients throw typed errors:

```typescript
import { getGallery } from '@rawdrive/api-types/gallery-service';

try {
  const gallery = await getGallery({ workspaceId: 'xxx', galleryId: 'yyy' });
} catch (error) {
  if (error instanceof Error) {
    // Typed error properties
    const code = (error as any).code;     // e.g., 'NOT_FOUND'
    const status = (error as any).status; // e.g., 404
    const details = (error as any).details;
    const requestId = (error as any).requestId;

    if (status === 404) {
      console.log('Gallery not found');
    } else if (status === 401) {
      console.log('Please log in');
    }
  }
}
```

## Configuration

### Environment Variables

```bash
# Browser (Vite)
VITE_API_URL=http://localhost

# Node.js
API_BASE_URL=http://localhost
```

### Custom Axios Instance

The package uses a custom axios instance that:

- Automatically adds auth tokens from localStorage
- Handles 401 responses with token refresh
- Provides consistent error formatting

## Contributing

### Updating Types

1. Make changes to FastAPI Pydantic models
2. Restart the affected service
3. Run `pnpm generate:api-types`
4. Review generated changes
5. Commit all generated files

### Adding New Services

1. Add service config to `scripts/generate-openapi-schemas.ts`
2. Add orval config to `orval.config.ts`
3. Add exports to `src/index.ts`
4. Run generation commands

## License

MIT
