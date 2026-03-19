---
name: real-time-collaboration
description: "Real-time collaboration patterns for RawDrive: LiveSync engine, WebSocket connections, collaborative gallery editing, presence indicators, conflict resolution, and optimistic updates. Use this skill when implementing real-time features like collaborative proofing, live cursor/selection sharing, real-time notifications, WebSocket event handling, or any feature requiring instant multi-user synchronization. Also use for connection management, reconnection strategies, and event broadcasting. Triggers on: real-time, WebSocket, LiveSync, collaborative editing, presence, live updates, sync, broadcast, socket, SSE, server-sent events, concurrent editing, conflict resolution, optimistic update."
---

# Real-Time Collaboration Patterns

RawDrive supports collaborative workflows where photographers and clients interact simultaneously — proofing sessions, live selections, and shared editing require real-time synchronization.

## WebSocket Architecture

```
Frontend (React)                    Backend (FastAPI)
┌─────────────┐    WebSocket    ┌──────────────────┐
│ useWebSocket │◄──────────────►│ WebSocketManager  │
│ hook         │                │                   │
│ useLiveSync  │    Events      │ ConnectionPool    │
│ hook         │◄──────────────►│ Redis PubSub      │
└─────────────┘                └──────────────────┘
```

## Backend WebSocket Manager

```python
# WebSocket connection management with Redis PubSub for multi-instance scaling
class WebSocketManager:
    def __init__(self, redis: Redis):
        self.redis = redis
        self.active_connections: dict[str, dict[UUID, WebSocket]] = {}
        # Key: channel (e.g., "gallery:{id}"), Value: {user_id: websocket}

    async def connect(
        self, websocket: WebSocket, channel: str, user_id: UUID, workspace_id: UUID
    ):
        await websocket.accept()
        if channel not in self.active_connections:
            self.active_connections[channel] = {}
        self.active_connections[channel][user_id] = websocket
        # Broadcast presence
        await self.broadcast(channel, {
            "type": "presence.join",
            "user_id": str(user_id),
            "timestamp": datetime.utcnow().isoformat(),
        }, exclude=user_id)
        # Subscribe to Redis PubSub for cross-instance events
        await self.redis.subscribe(f"ws:{channel}")

    async def disconnect(self, channel: str, user_id: UUID):
        if channel in self.active_connections:
            self.active_connections[channel].pop(user_id, None)
            await self.broadcast(channel, {
                "type": "presence.leave",
                "user_id": str(user_id),
            })

    async def broadcast(
        self, channel: str, message: dict, exclude: UUID | None = None
    ):
        """Send to all local connections + publish to Redis for other instances."""
        # Local broadcast
        for uid, ws in self.active_connections.get(channel, {}).items():
            if uid != exclude:
                await ws.send_json(message)
        # Cross-instance via Redis
        await self.redis.publish(f"ws:{channel}", json.dumps(message))
```

## Event Types

```python
class WSEventType(str, Enum):
    # Presence
    PRESENCE_JOIN = "presence.join"
    PRESENCE_LEAVE = "presence.leave"
    PRESENCE_CURSOR = "presence.cursor"
    # Gallery collaboration
    ASSET_FAVORITED = "asset.favorited"
    ASSET_COMMENT = "asset.comment"
    ASSET_SELECTED = "asset.selected"
    GALLERY_UPDATED = "gallery.updated"
    # Proofing
    PROOF_APPROVED = "proof.approved"
    PROOF_REJECTED = "proof.rejected"
    PROOF_REVISION = "proof.revision"
    # Upload progress
    UPLOAD_PROGRESS = "upload.progress"
    UPLOAD_COMPLETE = "upload.complete"
    # Notifications
    NOTIFICATION = "notification"
```

## Frontend Hooks

```typescript
// Core WebSocket hook with auto-reconnect
function useWebSocket(channel: string) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_DELAY = 1000; // Exponential backoff

  const connect = useCallback(() => {
    const token = getAuthToken();
    const ws = new WebSocket(
      `${WS_BASE_URL}/ws/${channel}?token=${token}`
    );
    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };
    ws.onclose = () => {
      setIsConnected(false);
      // Exponential backoff reconnection
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = BASE_DELAY * Math.pow(2, reconnectAttempts.current);
        setTimeout(connect, delay);
        reconnectAttempts.current++;
      }
    };
    wsRef.current = ws;
  }, [channel]);

  return { isConnected, send: wsRef.current?.send, ws: wsRef.current };
}

// LiveSync hook for collaborative state
function useLiveSync<T>(channel: string, initialState: T) {
  const { ws, isConnected } = useWebSocket(channel);
  const [state, setState] = useState<T>(initialState);
  const [peers, setPeers] = useState<PeerPresence[]>([]);

  // Apply remote updates with conflict resolution
  // Last-write-wins for simple fields, CRDT for collections
  return { state, peers, isConnected, updateState };
}
```

## Conflict Resolution

```python
# Strategy depends on data type:
# 1. Last-Write-Wins (LWW) — simple fields (gallery title, description)
# 2. Add-Wins Set — collections (favorites, selections)
# 3. Operational Transform — ordered lists (album layout)

class ConflictResolver:
    @staticmethod
    def resolve_lww(local: dict, remote: dict) -> dict:
        """Compare timestamps, latest write wins."""
        if remote["updated_at"] > local["updated_at"]:
            return remote
        return local

    @staticmethod
    def resolve_add_wins_set(local: set, remote: set) -> set:
        """Union of both sets — additions always win over removals."""
        return local | remote
```

## Security Considerations

- WebSocket connections must validate JWT on connect (not just HTTP upgrade)
- All events must include workspace_id validation
- Rate limit WebSocket messages (prevent flooding)
- Sanitize all broadcast payloads (prevent XSS via WebSocket)
- Close connections on token expiry
