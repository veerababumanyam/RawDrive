# Phase 2: Architecture Design - Task 11.11 WebSocket Real-Time Updates

## 🏗️ Architecture Design Complete

### Backend Architecture

**WebSocket Endpoint:**
- **Location:** `backend/src/app/api/v1/websocket.py`
- **Endpoint:** `/api/v1/ws` or `/ws`
- **Authentication:** JWT token in query param (`?token=...`) or header
- **Rooms:** `workspace:{workspace_id}` for workspace-scoped events
- **Connection Management:** Track active connections per workspace

**Event Emission Service:**
- **Location:** `backend/src/app/services/websocket_service.py` - NEW
- **Purpose:** Broadcast events to WebSocket clients via Redis pub/sub
- **Pattern:** Publisher-subscriber using Redis channels
- **Channels:** `ws:workspace:{workspace_id}`

**Integration Points:**
- `asset_processing_worker.py` - Emit `asset:processed` event
- `upload_service.py` - Emit `asset:created` event

### Frontend Architecture

**WebSocket Hook:**
- **Location:** `frontend/src/hooks/useSocket.ts` - NEW
- **Purpose:** Manage WebSocket connection, subscriptions, reconnection
- **Features:**
  - Auto-connect on mount
  - Auto-reconnect on disconnect
  - Event subscription/unsubscription
  - Connection state management

**Integration:**
- `GalleryDetailPage.tsx` - Listen for events, invalidate React Query cache
- `PhotoGrid.tsx` - Auto-update when new assets arrive
- `useGalleryAssets.ts` - Invalidate queries on events

### Event Schema

```typescript
interface WebSocketEvent {
  type: 'asset:created' | 'asset:processed' | 'asset:deleted';
  workspace_id: string;
  gallery_id: string;
  asset_id: string;
  data?: {
    thumbnail_url?: string; // Signed URL for thumbnail
    status?: 'available' | 'processing' | 'failed';
    [key: string]: any;
  };
}
```

### Connection Flow

```
1. Client connects to /api/v1/ws?token=<jwt>
2. Backend validates JWT, extracts workspace_id
3. Client subscribes to workspace:{workspace_id} room
4. Backend stores connection in memory/Redis
5. Events published to Redis channel
6. WebSocket server broadcasts to subscribed clients
7. Client receives event, updates UI
```

### Reconnection Logic

- **Exponential backoff:** 1s, 2s, 4s, 8s, max 30s
- **Max retries:** Unlimited (keep trying)
- **Reconnect triggers:**
  - Connection closed unexpectedly
  - Network error
  - Server error

### Security

- ✅ JWT authentication required
- ✅ Workspace-scoped rooms (users only receive their workspace events)
- ✅ Connection limits per user (prevent abuse)
- ✅ Rate limiting on WebSocket messages

### Performance

- **Connection pooling:** Reuse connections per workspace
- **Event batching:** Batch multiple events if needed
- **Selective updates:** Only invalidate affected queries
- **Lazy loading:** Don't fetch full asset data, just invalidate cache


