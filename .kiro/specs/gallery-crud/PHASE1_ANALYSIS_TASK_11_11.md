# Phase 1: Codebase Analysis - Task 11.11 Real-Time Gallery Update via WebSocket

## 📊 Codebase Analysis Complete

### ✅ Current State

**Backend:**
- ✅ FastAPI backend (Python)
- ✅ FastAPI supports WebSocket via `WebSocket` from `fastapi` or `starlette`
- ❌ **MISSING**: WebSocket endpoint implementation
- ❌ **MISSING**: WebSocket authentication middleware
- ❌ **MISSING**: Event emission on asset creation/processing

**Frontend:**
- ❌ **MISSING**: `useSocket` hook (mentioned in CLAUDE.md but doesn't exist)
- ❌ **MISSING**: WebSocket connection management
- ❌ **MISSING**: Integration with gallery components
- ✅ React Query (`useQueryClient`) available for cache invalidation
- ✅ Gallery components ready for real-time updates

**Events Needed:**
- `asset:created` - When upload completes and asset is created
- `asset:processed` - When background processing completes (thumbnails ready)
- `upload:progress` - Upload progress updates (optional, already handled client-side)

### ⚠️ Gaps Found

1. **No WebSocket endpoint in backend**
   - Need: WebSocket endpoint at `/ws` or `/api/v1/ws`
   - Need: Authentication via JWT token in query param or header
   - Need: Workspace-scoped room subscriptions
   - Location: `backend/src/app/api/v1/websocket.py` or `backend/src/app/api/websocket.py`

2. **No WebSocket client hook in frontend**
   - Need: `useSocket` hook for connection management
   - Need: Auto-reconnect logic
   - Need: Event subscription/unsubscription
   - Location: `frontend/src/hooks/useSocket.ts`

3. **No event emission in backend**
   - Need: Emit events when assets are created/processed
   - Need: Integration with asset_processing_worker
   - Need: Integration with upload_service commit_upload

4. **No integration with gallery components**
   - Need: Listen for `asset:created` and `asset:processed` events
   - Need: Auto-add thumbnail to PhotoGrid
   - Need: Invalidate React Query cache
   - Integration point: `GalleryDetailPage.tsx` and `PhotoGrid.tsx`

### 📋 Dependencies

**Backend Services:**
- `asset_processing_worker.py` - Emit `asset:processed` event
- `upload_service.py` - Emit `asset:created` event on commit
- Authentication middleware - Verify JWT for WebSocket connection

**Frontend Services:**
- `galleryService.ts` - Already exists
- React Query - For cache invalidation
- `useAuth` hook - For workspace/user context

**Components:**
- `PhotoGrid.tsx` - Display new thumbnails
- `GalleryDetailPage.tsx` - Main page component
- `useGalleryAssets.ts` - Hook for fetching assets

**Database:**
- No schema changes needed
- Events are ephemeral (not stored)

### 🎯 Integration Points

**Exact Files/Endpoints:**

1. **Backend WebSocket:**
   - `backend/src/app/api/v1/websocket.py` - NEW WebSocket endpoint
   - Endpoint: `/api/v1/ws` or `/ws`
   - Authentication: JWT token in query param or header
   - Rooms: `workspace:{workspace_id}` for workspace-scoped events

2. **Backend Event Emission:**
   - `backend/src/app/services/asset_processing_worker.py` - Emit `asset:processed`
   - `backend/src/app/services/upload_service.py` - Emit `asset:created`

3. **Frontend Hook:**
   - `frontend/src/hooks/useSocket.ts` - NEW WebSocket hook
   - Manages connection, reconnection, subscriptions

4. **Frontend Integration:**
   - `frontend/src/pages/workspace/GalleryDetailPage.tsx` - Listen for events
   - `frontend/src/components/features/gallery/PhotoGrid.tsx` - Update on events
   - `frontend/src/hooks/useGalleryAssets.ts` - Invalidate cache on events

### 📐 Design System Compliance

**No UI changes needed** - This is a background feature that updates existing components.

### 🔒 Security & Compliance

**SOC2/GDPR:**
- ✅ WebSocket authentication via JWT
- ✅ Workspace-scoped rooms (users only receive their workspace events)
- ✅ No PII in WebSocket messages
- ✅ Connection limits per user

**Accessibility:**
- ✅ No UI changes, existing components remain accessible
- ✅ Screen readers will announce new content via React Query updates

### 📝 Requirements Mapping

**Requirement 5.18:** Real-time gallery update - Show thumbnail immediately on upload complete

### 🎨 Architecture Pattern

**WebSocket Flow:**
```
Backend Event → WebSocket Server → Client Hook → React Query Invalidation → UI Update
```

**Event Structure:**
```typescript
{
  type: 'asset:created' | 'asset:processed',
  workspace_id: string,
  gallery_id: string,
  asset_id: string,
  thumbnail_url?: string, // Signed URL for thumbnail
  data?: any // Additional metadata
}
```

### ✅ Next Steps

**Phase 2:** Architecture Design
- Design WebSocket endpoint structure
- Define event schema
- Plan authentication flow
- Design reconnection logic

**Phase 3:** Implementation
- Create backend WebSocket endpoint
- Add event emission to workers
- Create frontend useSocket hook
- Integrate with gallery components

**Phase 4:** Testing
- Test WebSocket connection
- Test event emission and reception
- Test reconnection logic
- Test workspace isolation


