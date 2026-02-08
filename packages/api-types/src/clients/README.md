# Generated API Clients

This directory contains auto-generated TypeScript API clients for RawDrive microservices.

## How to Generate

Run the following commands from the repository root:

```bash
# Generate OpenAPI schemas from running services
pnpm generate:openapi

# Generate TypeScript clients from schemas
pnpm generate:api-clients

# Or do both in one command
pnpm generate:api-types
```

## Prerequisites

1. **Running Services**: All microservices must be running to fetch their OpenAPI specs.
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml up -d
   ```

2. **Dependencies**: Install dependencies in the api-types package.
   ```bash
   pnpm install
   ```

## Generated Files

After generation, this directory will contain:

- `backend.ts` - Main backend API client
- `gallery-service.ts` - Gallery service client
- `webhooks-service.ts` - Webhooks service client
- `billing-service.ts` - Billing service client
- `client-service.ts` - Client management client
- `notifications-service.ts` - Notifications client
- `invitations-service.ts` - Invitations client
- `onboarding-service.ts` - Onboarding client
- `ai-service.ts` - AI orchestration client
- `ai-processing-service.ts` - AI processing client
- `livesync-service.ts` - LiveSync client

## Usage

```typescript
// Import generated types and client functions
import { getGalleries, Gallery } from '@rawdrive/api-types/gallery-service';

// Make typed API calls
const galleries = await getGalleries({
  workspaceId: 'xxx',
  page: 1,
  limit: 20,
});

// galleries is strongly typed as GalleryListResponse
console.log(galleries.data);
```

## Runtime Validation

Use Zod schemas for runtime validation:

```typescript
import { gallerySchema, validateApiResponse } from '@rawdrive/api-types/schemas';

// Validate response at runtime
const result = validateApiResponse(apiResponse, gallerySchema);
if (result.success) {
  console.log('Valid gallery:', result.data);
} else {
  console.error('Validation failed:', result.error.issues);
}
```

## Notes

- **DO NOT EDIT** generated files manually - they will be overwritten
- Run `pnpm generate:api-types` after API changes
- Check `openapi/` directory for the raw OpenAPI specs
