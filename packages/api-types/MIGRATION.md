# Migration Guide: From Manual Types to Generated API Clients

This guide helps migrate from the current manual typing pattern (using `useApiRequest<T>`) to the new auto-generated API clients with full type safety and runtime validation.

## Before vs After

### Before (Manual Types)

```typescript
// frontend/src/services/galleryService.ts
import apiClient from './api';
import type { GalleryListResponse } from '../types/gallery';

export class GalleryService {
  async listGalleries(workspaceId: string, options?: {...}): Promise<GalleryListResponse> {
    const response = await apiClient.get<GalleryListResponse>(endpoint, {...});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch galleries');
    }
    return response.data!;
  }
}
```

### After (Generated Clients)

```typescript
// Using generated client directly
import { getGalleries } from '@rawdrive/api-types/gallery-service';

const response = await getGalleries({
  workspaceId: 'xxx',
  page: 1,
  limit: 20,
});
// response is fully typed as GalleryListResponse
```

## Migration Steps

### Step 1: Install the Package

```bash
pnpm add @rawdrive/api-types
```

### Step 2: Generate Types

Ensure services are running, then generate:

```bash
pnpm generate:api-types
```

### Step 3: Gradual Migration

Migrate service-by-service. Start with new code, then refactor existing code.

#### Hook Migration Example

**Before:**
```typescript
// hooks/useGalleries.ts
import { useQuery } from '@tanstack/react-query';
import galleryService from '../services/galleryService';

export function useGalleries(workspaceId: string) {
  return useQuery({
    queryKey: ['galleries', workspaceId],
    queryFn: () => galleryService.listGalleries(workspaceId),
  });
}
```

**After:**
```typescript
// hooks/useGalleries.ts
import { useQuery } from '@tanstack/react-query';
import { getGalleries } from '@rawdrive/api-types/gallery-service';

export function useGalleries(workspaceId: string) {
  return useQuery({
    queryKey: ['galleries', workspaceId],
    queryFn: () => getGalleries({ workspaceId, page: 1, limit: 100 }),
  });
}
```

### Step 4: Add Runtime Validation (Optional)

For critical data, add Zod validation:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getGalleries } from '@rawdrive/api-types/gallery-service';
import { galleryListResponseSchema, validateApiResponse } from '@rawdrive/api-types/schemas';

export function useGalleries(workspaceId: string) {
  return useQuery({
    queryKey: ['galleries', workspaceId],
    queryFn: async () => {
      const response = await getGalleries({ workspaceId, page: 1, limit: 100 });

      // Runtime validation
      const validated = validateApiResponse(response, galleryListResponseSchema);
      if (!validated.success) {
        console.error('API response validation failed:', validated.error.issues);
        throw new Error('Invalid API response');
      }

      return validated.data;
    },
  });
}
```

## Service-by-Service Migration Map

### Gallery Service

| Old Method | New Function | Notes |
|------------|--------------|-------|
| `galleryService.listGalleries()` | `getGalleries()` | |
| `galleryService.getGallery()` | `getGallery()` | |
| `galleryService.createGallery()` | `createGallery()` | |
| `galleryService.updateGallery()` | `updateGallery()` | |
| `galleryService.deleteGallery()` | `deleteGallery()` | |
| `galleryService.publishGallery()` | `publishGallery()` | |
| `galleryService.listGalleryAssets()` | `getGalleryAssets()` | |
| `galleryService.getPublicGallery()` | `getPublicGallery()` | No auth required |

### Backend Service

| Old Method | New Function | Notes |
|------------|--------------|-------|
| `authService.login()` | `login()` | |
| `authService.refresh()` | `refreshToken()` | |
| `userService.getMe()` | `getCurrentUser()` | |
| `workspaceService.list()` | `getWorkspaces()` | |

### Webhooks Service

| Old Method | New Function | Notes |
|------------|--------------|-------|
| `webhooksService.getSubscriptions()` | `getSubscriptions()` | |
| `webhooksService.createSubscription()` | `createSubscription()` | |
| `webhooksService.deleteSubscription()` | `deleteSubscription()` | |

## Type Mapping

Types from `frontend/src/types/*.ts` map to generated types:

| Old Type Location | New Import |
|-------------------|------------|
| `types/gallery.ts` → `GalleryListResponse` | `@rawdrive/api-types/gallery-service` |
| `types/gallery.ts` → `GalleryDetailData` | `@rawdrive/api-types/gallery-service` → `Gallery` |
| `types/user.ts` → `User` | `@rawdrive/api-types/backend` |
| `types/workspace.ts` → `Workspace` | `@rawdrive/api-types/backend` |

## Coexistence Strategy

During migration, both patterns can coexist:

```typescript
// New code uses generated clients
import { getGalleries } from '@rawdrive/api-types/gallery-service';

// Old code continues to use manual service
import galleryService from '../services/galleryService';

// Both work simultaneously
const newWay = await getGalleries({ workspaceId: 'xxx' });
const oldWay = await galleryService.listGalleries('xxx');
```

## Error Handling Changes

### Before

```typescript
try {
  const data = await galleryService.getGallery(workspaceId, galleryId);
} catch (error) {
  if (error instanceof Error) {
    toast.error(error.message);
  }
}
```

### After

```typescript
try {
  const data = await getGallery({ workspaceId, galleryId });
} catch (error) {
  if (error instanceof Error) {
    // Access typed error properties
    const code = (error as any).code;
    const status = (error as any).status;

    if (status === 404) {
      toast.error('Gallery not found');
    } else if (status === 403) {
      toast.error('Access denied');
    } else {
      toast.error(error.message);
    }
  }
}
```

## Testing Migration

Update tests to use generated types:

```typescript
// Before
import type { Gallery } from '../types/gallery';

const mockGallery: Gallery = {
  id: 'xxx',
  title: 'Test',
  // ... manually ensure all fields
};

// After
import type { Gallery } from '@rawdrive/api-types/gallery-service';
import { gallerySchema } from '@rawdrive/api-types/schemas';

const mockGallery: Gallery = {
  id: 'xxx',
  title: 'Test',
  // ... TypeScript ensures all required fields
};

// Optionally validate mock data
const validated = gallerySchema.safeParse(mockGallery);
expect(validated.success).toBe(true);
```

## Checklist

- [ ] Install `@rawdrive/api-types`
- [ ] Generate types with `pnpm generate:api-types`
- [ ] Migrate hooks one at a time
- [ ] Update type imports to use generated types
- [ ] Add runtime validation for critical paths
- [ ] Update tests
- [ ] Remove old manual type definitions (eventually)

## Questions?

If you encounter issues during migration:

1. Check that services are running
2. Regenerate types: `pnpm generate:api-types`
3. Check for type mismatches between old and new definitions
4. Review the generated client code in `packages/api-types/src/clients/`
