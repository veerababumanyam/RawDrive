# Quickstart: Client Favorites System

**Feature**: 012-client-favorites
**Date**: December 29, 2025

## Prerequisites

- Docker containers running (`npm run docker:dev:up`)
- Backend running (`npm run dev:backend`)
- Frontend running (`npm run dev`)
- Migration 0053 applied

## Quick Verification

### 1. Run Migration

```bash
cd backend
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" PYTHONPATH=src alembic upgrade head
```

### 2. Verify Tables Created

```bash
PGPASSWORD=rawdrive psql -h localhost -U rawdrive -d rawdrive -c "
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('favorite_lists', 'favorite_shares', 'favorite_downloads');
"
```

Expected output:
```
    table_name
-------------------
 favorite_lists
 favorite_shares
 favorite_downloads
```

### 3. Test Client Favorites API

```bash
# Get a test gallery ID
GALLERY_ID=$(PGPASSWORD=rawdrive psql -h localhost -U rawdrive -d rawdrive -t -c "
SELECT gallery_id FROM galleries WHERE status = 'published' LIMIT 1;
" | tr -d ' ')

# Generate a client token
CLIENT_TOKEN=$(uuidgen)

# Create default favorites list
curl -X POST "http://localhost:8000/api/v1/public/galleries/${GALLERY_ID}/favorites" \
  -H "Content-Type: application/json" \
  -H "X-Client-Token: ${CLIENT_TOKEN}" \
  -d '{"asset_id": "REPLACE_WITH_ASSET_ID", "favorited": true}'

# List favorites
curl "http://localhost:8000/api/v1/public/galleries/${GALLERY_ID}/favorites" \
  -H "X-Client-Token: ${CLIENT_TOKEN}"

# Get favorite lists
curl "http://localhost:8000/api/v1/public/galleries/${GALLERY_ID}/favorites/lists" \
  -H "X-Client-Token: ${CLIENT_TOKEN}"
```

### 4. Test Photographer Analytics

```bash
# Login and get token (use existing test user)
TOKEN=$(curl -s -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "photographer@test.com", "password": "Test123!"}' \
  | jq -r '.access_token')

WORKSPACE_ID="YOUR_WORKSPACE_ID"
GALLERY_ID="YOUR_GALLERY_ID"

# Get favorites analytics
curl "http://localhost:8000/api/v1/workspaces/${WORKSPACE_ID}/galleries/${GALLERY_ID}/favorites/analytics" \
  -H "Authorization: Bearer ${TOKEN}"

# Export as CSV
curl "http://localhost:8000/api/v1/workspaces/${WORKSPACE_ID}/galleries/${GALLERY_ID}/favorites/export" \
  -H "Authorization: Bearer ${TOKEN}" \
  -o favorites.csv
```

## Development Workflow

### Backend

1. **Service Implementation**

```python
# backend/src/app/services/favorites_service.py
from app.db.postgres import get_postgres_pool

class FavoritesService:
    async def toggle_favorite(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        client_token: str,
        favorited: bool,
        list_id: Optional[UUID] = None,
    ) -> dict:
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Ensure default list exists
            list_id = list_id or await self._get_or_create_default_list(
                conn, gallery_id, client_token
            )
            # ... implementation
```

2. **API Router**

```python
# backend/src/app/api/v1/client_favorites.py
from fastapi import APIRouter, Header, HTTPException

router = APIRouter(prefix="/public/galleries/{gallery_id}/favorites", tags=["Favorites"])

@router.post("")
async def toggle_favorite(
    gallery_id: UUID,
    request: ToggleFavoriteRequest,
    client_token: str = Header(..., alias="X-Client-Token"),
):
    service = FavoritesService()
    return await service.toggle_favorite(
        gallery_id=gallery_id,
        asset_id=request.asset_id,
        client_token=client_token,
        favorited=request.favorited,
        list_id=request.list_id,
    )
```

3. **Register Router**

```python
# backend/src/app/main.py
from app.api.v1 import client_favorites

app.include_router(client_favorites.router)
```

### Frontend

1. **Service**

```typescript
// frontend/src/services/favoritesService.ts
const getClientToken = (): string => {
  let token = localStorage.getItem('client_token');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('client_token', token);
  }
  return token;
};

export const favoritesService = {
  async toggleFavorite(galleryId: string, assetId: string, favorited: boolean) {
    return api.post(`/public/galleries/${galleryId}/favorites`, {
      asset_id: assetId,
      favorited,
    }, {
      headers: { 'X-Client-Token': getClientToken() },
    });
  },

  async getFavorites(galleryId: string) {
    return api.get(`/public/galleries/${galleryId}/favorites`, {
      headers: { 'X-Client-Token': getClientToken() },
    });
  },
};
```

2. **Hook**

```typescript
// frontend/src/hooks/useFavorites.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { favoritesService } from '@/services/favoritesService';

export const useFavorites = (galleryId: string) => {
  const queryClient = useQueryClient();

  const { data: favorites } = useQuery({
    queryKey: ['favorites', galleryId],
    queryFn: () => favoritesService.getFavorites(galleryId),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ assetId, favorited }: { assetId: string; favorited: boolean }) =>
      favoritesService.toggleFavorite(galleryId, assetId, favorited),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', galleryId] });
    },
  });

  return {
    favorites: favorites?.data ?? [],
    toggleFavorite: toggleMutation.mutate,
    isLoading: toggleMutation.isPending,
  };
};
```

3. **Component**

```tsx
// frontend/src/components/features/gallery/FavoriteButton.tsx
import { Heart } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';

interface FavoriteButtonProps {
  galleryId: string;
  assetId: string;
  isFavorited: boolean;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  galleryId,
  assetId,
  isFavorited,
}) => {
  const { toggleFavorite, isLoading } = useFavorites(galleryId);

  return (
    <button
      onClick={() => toggleFavorite({ assetId, favorited: !isFavorited })}
      disabled={isLoading}
      className="p-2 rounded-full hover:bg-surface-hover transition-colors"
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        className={`w-5 h-5 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-text-tertiary'}`}
      />
    </button>
  );
};
```

## Testing

### Unit Tests

```python
# backend/tests/unit/services/test_favorites_service.py
import pytest
from app.services.favorites_service import FavoritesService

@pytest.mark.asyncio
async def test_toggle_favorite_creates_default_list():
    service = FavoritesService()
    result = await service.toggle_favorite(
        gallery_id=test_gallery_id,
        asset_id=test_asset_id,
        client_token="test-token",
        favorited=True,
    )
    assert result["is_favorited"] is True
    assert result["list_id"] is not None
```

### Integration Tests

```python
# backend/tests/integration/api/test_client_favorites.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_favorite_workflow(client: AsyncClient, test_gallery):
    # Toggle favorite
    response = await client.post(
        f"/api/v1/public/galleries/{test_gallery.gallery_id}/favorites",
        json={"asset_id": str(test_asset.asset_id), "favorited": True},
        headers={"X-Client-Token": "test-client"},
    )
    assert response.status_code == 200
    assert response.json()["is_favorited"] is True

    # List favorites
    response = await client.get(
        f"/api/v1/public/galleries/{test_gallery.gallery_id}/favorites",
        headers={"X-Client-Token": "test-client"},
    )
    assert response.status_code == 200
    assert len(response.json()["data"]) == 1
```

## Common Issues

### Issue: Client token not persisting

**Symptom**: Favorites disappear on page refresh

**Solution**: Ensure localStorage is used for token persistence:
```typescript
// Check DevTools > Application > Local Storage
localStorage.getItem('client_token')
```

### Issue: Favorites count not updating

**Symptom**: Heart icon doesn't reflect actual state

**Solution**: Invalidate queries after mutation:
```typescript
queryClient.invalidateQueries({ queryKey: ['favorites', galleryId] });
queryClient.invalidateQueries({ queryKey: ['gallery-assets', galleryId] });
```

### Issue: ZIP download timing out

**Symptom**: Download request hangs

**Solution**:
1. Verify Redis is running for job queue
2. Check worker is processing jobs
3. Reduce batch size if memory issues

## Next Steps

After basic implementation:

1. Add share link generation
2. Implement ZIP download worker
3. Add photographer analytics dashboard
4. Write E2E tests with Playwright
