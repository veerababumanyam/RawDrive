"""Album Collaboration Service for Real-time Album Design Editing.

Manages collaborative album design sessions using CRDT (Conflict-free Replicated Data Types)
for conflict-free concurrent editing, presence tracking, and version history.

Implements:
- CRDT-based operation transformation for concurrent edits
- Lamport timestamps for causal ordering
- Vector clocks for detecting concurrent operations
- Real-time presence and cursor tracking
- Version snapshots for rollback
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AlbumOperationType(str, Enum):
    """Types of collaborative operations on albums."""
    # Album level
    ALBUM_CREATE = "album:create"
    ALBUM_UPDATE = "album:update"
    ALBUM_DELETE = "album:delete"

    # Spread level
    SPREAD_CREATE = "spread:create"
    SPREAD_UPDATE = "spread:update"
    SPREAD_DELETE = "spread:delete"
    SPREAD_REORDER = "spread:reorder"
    SPREAD_LOCK = "spread:lock"
    SPREAD_UNLOCK = "spread:unlock"

    # Element level
    ELEMENT_CREATE = "element:create"
    ELEMENT_UPDATE = "element:update"
    ELEMENT_DELETE = "element:delete"
    ELEMENT_MOVE = "element:move"
    ELEMENT_RESIZE = "element:resize"
    ELEMENT_ROTATE = "element:rotate"
    ELEMENT_STYLE = "element:style"
    ELEMENT_REORDER = "element:reorder"
    ELEMENT_GROUP = "element:group"
    ELEMENT_UNGROUP = "element:ungroup"

    # Comment level
    COMMENT_CREATE = "comment:create"
    COMMENT_UPDATE = "comment:update"
    COMMENT_DELETE = "comment:delete"
    COMMENT_RESOLVE = "comment:resolve"

    # Presence
    CURSOR_MOVE = "cursor:move"
    SELECTION_CHANGE = "selection:change"
    SPREAD_VIEW = "spread:view"


class AlbumSessionStatus(str, Enum):
    ACTIVE = "active"
    IDLE = "idle"
    DISCONNECTED = "disconnected"
    EXPIRED = "expired"


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALBUM_SESSION_PREFIX = "album:session:"
ALBUM_PRESENCE_PREFIX = "album:presence:"
ALBUM_CURSOR_PREFIX = "album:cursor:"
ALBUM_CHANNEL_PREFIX = "album:channel:"
ALBUM_LOCK_PREFIX = "album:lock:"

DEFAULT_SESSION_TTL = 3600  # 1 hour
DEFAULT_PRESENCE_TTL = 60  # 1 minute
DEFAULT_CURSOR_TTL = 5  # 5 seconds
DEFAULT_LOCK_TTL = 300  # 5 minutes

COLLABORATOR_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
    "#F8B500", "#00D4AA", "#FF7675", "#74B9FF", "#A29BFE",
]


# ---------------------------------------------------------------------------
# CRDT Implementation - Last Writer Wins Register with Lamport Timestamps
# ---------------------------------------------------------------------------

class LWWRegister:
    """Last Writer Wins Register for CRDT-based conflict resolution."""

    def __init__(self, value: Any = None, timestamp: int = 0, writer_id: str = ""):
        self.value = value
        self.timestamp = timestamp
        self.writer_id = writer_id

    def update(self, value: Any, timestamp: int, writer_id: str) -> bool:
        """Update the register if the new timestamp is greater.

        Returns True if the update was applied.
        """
        if timestamp > self.timestamp or (timestamp == self.timestamp and writer_id > self.writer_id):
            self.value = value
            self.timestamp = timestamp
            self.writer_id = writer_id
            return True
        return False

    def merge(self, other: "LWWRegister") -> "LWWRegister":
        """Merge with another LWW register."""
        if other.timestamp > self.timestamp or (other.timestamp == self.timestamp and other.writer_id > self.writer_id):
            return LWWRegister(other.value, other.timestamp, other.writer_id)
        return LWWRegister(self.value, self.timestamp, self.writer_id)

    def to_dict(self) -> dict:
        return {
            "value": self.value,
            "timestamp": self.timestamp,
            "writer_id": self.writer_id,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "LWWRegister":
        return cls(
            value=data.get("value"),
            timestamp=data.get("timestamp", 0),
            writer_id=data.get("writer_id", ""),
        )


class VectorClock:
    """Vector clock for tracking causal ordering of events."""

    def __init__(self, clock: dict[str, int] | None = None):
        self.clock = clock or {}

    def increment(self, node_id: str) -> None:
        """Increment the counter for a node."""
        self.clock[node_id] = self.clock.get(node_id, 0) + 1

    def get(self, node_id: str) -> int:
        """Get the counter for a node."""
        return self.clock.get(node_id, 0)

    def merge(self, other: "VectorClock") -> "VectorClock":
        """Merge with another vector clock (take max of each)."""
        all_nodes = set(self.clock.keys()) | set(other.clock.keys())
        merged = {}
        for node in all_nodes:
            merged[node] = max(self.clock.get(node, 0), other.clock.get(node, 0))
        return VectorClock(merged)

    def is_concurrent(self, other: "VectorClock") -> bool:
        """Check if two clocks are concurrent (neither happened before the other)."""
        self_before = False
        other_before = False

        all_nodes = set(self.clock.keys()) | set(other.clock.keys())
        for node in all_nodes:
            s = self.clock.get(node, 0)
            o = other.clock.get(node, 0)
            if s < o:
                other_before = True
            if s > o:
                self_before = True

        return self_before and other_before

    def to_dict(self) -> dict:
        return dict(self.clock)

    @classmethod
    def from_dict(cls, data: dict) -> "VectorClock":
        return cls(data)


# ---------------------------------------------------------------------------
# Service Class
# ---------------------------------------------------------------------------

class AlbumCollaborationService:
    """Service for managing collaborative album design editing."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._lamport_counters: dict[str, int] = {}

    # -------------------------------------------------------------------------
    # Session Management
    # -------------------------------------------------------------------------

    async def create_session(
        self,
        workspace_id: UUID,
        album_id: UUID,
        user_id: UUID,
    ) -> dict[str, Any]:
        """Create or join a collaborative album editing session.

        Args:
            workspace_id: Workspace UUID
            album_id: Album UUID
            user_id: User UUID

        Returns:
            Session data including session_id, collaborators, websocket info
        """
        redis = await get_redis_client()

        # Check for existing active session
        existing_session = await self._get_active_session(album_id)

        if existing_session:
            session_id = UUID(existing_session["session_id"])
            color = await self._assign_collaborator_color(session_id, user_id)

            await self._add_participant(
                session_id=session_id,
                user_id=user_id,
                workspace_id=workspace_id,
                color=color,
            )

            session_data = await self._get_session_data(session_id)
            logger.info(f"User {user_id} joined album session {session_id}")
        else:
            session_id = await self._create_new_session(
                workspace_id=workspace_id,
                album_id=album_id,
            )
            color = await self._assign_collaborator_color(session_id, user_id)

            await self._add_participant(
                session_id=session_id,
                user_id=user_id,
                workspace_id=workspace_id,
                color=color,
            )

            session_data = await self._get_session_data(session_id)
            logger.info(f"User {user_id} created album session {session_id}")

        # Cache session in Redis
        await redis.setex(
            f"{ALBUM_SESSION_PREFIX}{session_id}",
            DEFAULT_SESSION_TTL,
            json.dumps(session_data, default=str),
        )

        return {
            "session": session_data,
            "your_color": color,
            "websocket_url": f"/api/v1/albums/collaboration/ws/{session_id}",
            "token": await self._generate_session_token(session_id, user_id),
        }

    async def _get_active_session(self, album_id: UUID) -> dict[str, Any] | None:
        """Get active session for an album."""
        result = await self.db.execute(
            text("""
                SELECT session_id, workspace_id, album_id, status, version,
                       crdt_state, created_at, last_activity
                FROM album_collaboration_sessions
                WHERE album_id = :album_id AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"album_id": str(album_id)},
        )
        row = result.fetchone()
        if row:
            return {
                "session_id": str(row[0]),
                "workspace_id": str(row[1]),
                "album_id": str(row[2]),
                "status": row[3],
                "version": row[4],
                "crdt_state": row[5] or {},
                "created_at": row[6].isoformat() if row[6] else None,
                "last_activity": row[7].isoformat() if row[7] else None,
            }
        return None

    async def _create_new_session(
        self,
        workspace_id: UUID,
        album_id: UUID,
    ) -> UUID:
        """Create a new album collaboration session."""
        result = await self.db.execute(
            text("""
                INSERT INTO album_collaboration_sessions
                (workspace_id, album_id, status, version, crdt_state)
                VALUES (:workspace_id, :album_id, 'active', 1, '{}')
                RETURNING session_id
            """),
            {
                "workspace_id": str(workspace_id),
                "album_id": str(album_id),
            },
        )
        await self.db.commit()
        row = result.fetchone()
        return UUID(str(row[0]))

    async def _add_participant(
        self,
        session_id: UUID,
        user_id: UUID,
        workspace_id: UUID,
        color: str,
    ) -> None:
        """Add a participant to a session."""
        # Check if already exists
        result = await self.db.execute(
            text("""
                SELECT participant_id FROM album_collaboration_participants
                WHERE session_id = :session_id AND user_id = :user_id
            """),
            {"session_id": str(session_id), "user_id": str(user_id)},
        )
        existing = result.fetchone()

        if existing:
            await self.db.execute(
                text("""
                    UPDATE album_collaboration_participants
                    SET status = 'active', left_at = NULL, last_activity = NOW()
                    WHERE session_id = :session_id AND user_id = :user_id
                """),
                {"session_id": str(session_id), "user_id": str(user_id)},
            )
        else:
            await self.db.execute(
                text("""
                    INSERT INTO album_collaboration_participants
                    (session_id, user_id, workspace_id, color, status)
                    VALUES (:session_id, :user_id, :workspace_id, :color, 'active')
                """),
                {
                    "session_id": str(session_id),
                    "user_id": str(user_id),
                    "workspace_id": str(workspace_id),
                    "color": color,
                },
            )
        await self.db.commit()

    async def _assign_collaborator_color(
        self,
        session_id: UUID,
        user_id: UUID,
    ) -> str:
        """Assign a unique color to a collaborator."""
        result = await self.db.execute(
            text("""
                SELECT color FROM album_collaboration_participants
                WHERE session_id = :session_id AND user_id != :user_id
            """),
            {"session_id": str(session_id), "user_id": str(user_id)},
        )
        used_colors = {row[0] for row in result.fetchall()}

        for color in COLLABORATOR_COLORS:
            if color not in used_colors:
                return color

        return f"#{secrets.token_hex(3)}"

    async def _get_session_data(self, session_id: UUID) -> dict[str, Any]:
        """Get full session data including collaborators."""
        result = await self.db.execute(
            text("""
                SELECT session_id, workspace_id, album_id, status, version,
                       crdt_state, created_at, last_activity
                FROM album_collaboration_sessions
                WHERE session_id = :session_id
            """),
            {"session_id": str(session_id)},
        )
        session_row = result.fetchone()

        if not session_row:
            raise ValueError(f"Session {session_id} not found")

        # Get collaborators
        result = await self.db.execute(
            text("""
                SELECT p.user_id, p.color, p.status, p.cursor_position,
                       p.selected_elements, p.current_spread_id, p.joined_at, p.last_activity,
                       u.email, u.first_name, u.last_name
                FROM album_collaboration_participants p
                JOIN users u ON p.user_id = u.user_id
                WHERE p.session_id = :session_id AND p.status != 'disconnected'
            """),
            {"session_id": str(session_id)},
        )
        collaborators = []
        for row in result.fetchall():
            display_name = f"{row[8] or ''} {row[9] or ''}".strip() or row[10]
            collaborators.append({
                "user_id": str(row[0]),
                "display_name": display_name,
                "color": row[1],
                "status": row[2],
                "cursor": row[3],
                "selected_elements": row[4] or [],
                "current_spread_id": str(row[5]) if row[5] else None,
                "joined_at": row[6].isoformat() if row[6] else None,
                "last_activity": row[7].isoformat() if row[7] else None,
            })

        return {
            "session_id": str(session_row[0]),
            "workspace_id": str(session_row[1]),
            "album_id": str(session_row[2]),
            "status": session_row[3],
            "version": session_row[4],
            "crdt_state": session_row[5] or {},
            "created_at": session_row[6].isoformat() if session_row[6] else None,
            "last_activity": session_row[7].isoformat() if session_row[7] else None,
            "collaborators": collaborators,
        }

    async def _generate_session_token(
        self,
        session_id: UUID,
        user_id: UUID,
    ) -> str:
        """Generate a token for WebSocket authentication."""
        redis = await get_redis_client()
        token = secrets.token_urlsafe(32)

        token_data = {
            "session_id": str(session_id),
            "user_id": str(user_id),
        }
        await redis.setex(
            f"album:token:{token}",
            DEFAULT_SESSION_TTL,
            json.dumps(token_data),
        )
        return token

    async def validate_session_token(self, token: str) -> dict[str, str] | None:
        """Validate a session token."""
        redis = await get_redis_client()
        data = await redis.get(f"album:token:{token}")
        if data:
            return json.loads(data)
        return None

    async def leave_session(
        self,
        session_id: UUID,
        user_id: UUID,
    ) -> None:
        """Mark a user as leaving a session."""
        await self.db.execute(
            text("""
                UPDATE album_collaboration_participants
                SET status = 'disconnected', left_at = NOW()
                WHERE session_id = :session_id AND user_id = :user_id
            """),
            {"session_id": str(session_id), "user_id": str(user_id)},
        )
        await self.db.commit()

        # Check if session is empty
        result = await self.db.execute(
            text("""
                SELECT COUNT(*) FROM album_collaboration_participants
                WHERE session_id = :session_id AND status = 'active'
            """),
            {"session_id": str(session_id)},
        )
        count = result.fetchone()[0]

        if count == 0:
            await self.db.execute(
                text("""
                    UPDATE album_collaboration_sessions
                    SET status = 'closed', closed_at = NOW()
                    WHERE session_id = :session_id
                """),
                {"session_id": str(session_id)},
            )
            await self.db.commit()

        # Broadcast leave event
        await self._broadcast_presence_update(
            session_id=session_id,
            user_id=user_id,
            event="left",
        )

        logger.info(f"User {user_id} left album session {session_id}")

    # -------------------------------------------------------------------------
    # Presence Management
    # -------------------------------------------------------------------------

    async def update_presence(
        self,
        session_id: UUID,
        user_id: UUID,
        cursor: dict[str, Any] | None = None,
        selected_elements: list[str] | None = None,
        current_spread_id: UUID | None = None,
    ) -> None:
        """Update a user's presence in a session."""
        redis = await get_redis_client()

        updates = ["last_activity = NOW()"]
        params = {
            "session_id": str(session_id),
            "user_id": str(user_id),
        }

        if cursor is not None:
            updates.append("cursor_position = :cursor")
            params["cursor"] = json.dumps(cursor)

        if selected_elements is not None:
            updates.append("selected_elements = :selected")
            params["selected"] = selected_elements

        if current_spread_id is not None:
            updates.append("current_spread_id = :spread_id")
            params["spread_id"] = str(current_spread_id)

        await self.db.execute(
            text(f"""
                UPDATE album_collaboration_participants
                SET {", ".join(updates)}
                WHERE session_id = :session_id AND user_id = :user_id
            """),
            params,
        )
        await self.db.commit()

        # Cache cursor in Redis for fast access
        if cursor:
            await redis.setex(
                f"{ALBUM_CURSOR_PREFIX}{session_id}:{user_id}",
                DEFAULT_CURSOR_TTL,
                json.dumps(cursor),
            )

        # Broadcast update
        await self._broadcast_presence_update(
            session_id=session_id,
            user_id=user_id,
            event="updated",
            cursor=cursor,
            selected_elements=selected_elements,
            current_spread_id=str(current_spread_id) if current_spread_id else None,
        )

    async def _broadcast_presence_update(
        self,
        session_id: UUID,
        user_id: UUID,
        event: str,
        cursor: dict[str, Any] | None = None,
        selected_elements: list[str] | None = None,
        current_spread_id: str | None = None,
    ) -> None:
        """Broadcast presence update to all participants."""
        redis = await get_redis_client()

        message = {
            "type": "album:presence",
            "session_id": str(session_id),
            "user_id": str(user_id),
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if cursor:
            message["cursor"] = cursor
        if selected_elements:
            message["selected_elements"] = selected_elements
        if current_spread_id:
            message["current_spread_id"] = current_spread_id

        await redis.publish(
            f"{ALBUM_CHANNEL_PREFIX}{session_id}",
            json.dumps(message),
        )

    # -------------------------------------------------------------------------
    # Operation Management (CRDT)
    # -------------------------------------------------------------------------

    async def apply_operation(
        self,
        session_id: UUID,
        user_id: UUID,
        workspace_id: UUID,
        album_id: UUID,
        operation_type: str,
        target_type: str,
        target_id: UUID,
        payload: dict[str, Any],
        vector_clock: dict[str, int],
    ) -> dict[str, Any]:
        """Apply a collaborative operation using CRDT semantics.

        Args:
            session_id: Session UUID
            user_id: User performing the operation
            workspace_id: Workspace UUID
            album_id: Album UUID
            operation_type: Type of operation
            target_type: Type of target (album, spread, element, comment)
            target_id: Target UUID
            payload: Operation payload
            vector_clock: Client's vector clock

        Returns:
            Operation result including new version and any conflicts
        """
        # Get session version
        result = await self.db.execute(
            text("""
                SELECT version, crdt_state FROM album_collaboration_sessions
                WHERE session_id = :session_id
                FOR UPDATE
            """),
            {"session_id": str(session_id)},
        )
        row = result.fetchone()
        current_version = row[0] if row else 1
        crdt_state = row[1] or {} if row else {}

        # Generate Lamport timestamp
        session_key = str(session_id)
        self._lamport_counters[session_key] = max(
            self._lamport_counters.get(session_key, 0),
            max(vector_clock.values()) if vector_clock else 0
        ) + 1
        lamport_timestamp = self._lamport_counters[session_key]

        # Update vector clock
        user_key = str(user_id)
        vector_clock[user_key] = vector_clock.get(user_key, 0) + 1

        # Check for concurrent operations
        is_conflicted = await self._check_concurrent_operations(
            session_id=session_id,
            target_type=target_type,
            target_id=target_id,
            lamport_timestamp=lamport_timestamp,
        )

        conflict_resolution = None
        if is_conflicted:
            # Apply LWW resolution
            conflict_resolution = {
                "strategy": "last_writer_wins",
                "lamport_timestamp": lamport_timestamp,
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }

        # Record operation
        new_version = current_version + 1
        result = await self.db.execute(
            text("""
                INSERT INTO album_operations
                (session_id, album_id, workspace_id, user_id, operation_type,
                 target_type, target_id, payload, vector_clock, lamport_timestamp,
                 base_version, result_version, is_applied, is_conflicted, conflict_resolution)
                VALUES (:session_id, :album_id, :workspace_id, :user_id, :operation_type,
                        :target_type, :target_id, :payload, :vector_clock, :lamport_timestamp,
                        :base_version, :result_version, TRUE, :is_conflicted, :conflict_resolution)
                RETURNING operation_id
            """),
            {
                "session_id": str(session_id),
                "album_id": str(album_id),
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "operation_type": operation_type,
                "target_type": target_type,
                "target_id": str(target_id),
                "payload": json.dumps(payload),
                "vector_clock": json.dumps(vector_clock),
                "lamport_timestamp": lamport_timestamp,
                "base_version": current_version,
                "result_version": new_version,
                "is_conflicted": is_conflicted,
                "conflict_resolution": json.dumps(conflict_resolution) if conflict_resolution else None,
            },
        )
        op_row = result.fetchone()
        operation_id = str(op_row[0])

        # Update session version
        await self.db.execute(
            text("""
                UPDATE album_collaboration_sessions
                SET version = :version, last_activity = NOW()
                WHERE session_id = :session_id
            """),
            {"version": new_version, "session_id": str(session_id)},
        )
        await self.db.commit()

        # Apply operation to actual data
        await self._apply_operation_to_data(
            album_id=album_id,
            workspace_id=workspace_id,
            user_id=user_id,
            operation_type=operation_type,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
        )

        # Broadcast operation
        await self._broadcast_operation(
            session_id=session_id,
            user_id=user_id,
            operation_id=operation_id,
            operation_type=operation_type,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
            new_version=new_version,
            vector_clock=vector_clock,
            lamport_timestamp=lamport_timestamp,
        )

        return {
            "operation_id": operation_id,
            "success": True,
            "new_version": new_version,
            "vector_clock": vector_clock,
            "lamport_timestamp": lamport_timestamp,
            "is_conflicted": is_conflicted,
            "conflict_resolution": conflict_resolution,
        }

    async def _check_concurrent_operations(
        self,
        session_id: UUID,
        target_type: str,
        target_id: UUID,
        lamport_timestamp: int,
    ) -> bool:
        """Check if there are concurrent operations on the same target."""
        result = await self.db.execute(
            text("""
                SELECT operation_id FROM album_operations
                WHERE session_id = :session_id
                  AND target_type = :target_type
                  AND target_id = :target_id
                  AND lamport_timestamp >= :timestamp - 1
                  AND is_applied = TRUE
                  AND created_at > NOW() - INTERVAL '5 seconds'
                LIMIT 1
            """),
            {
                "session_id": str(session_id),
                "target_type": target_type,
                "target_id": str(target_id),
                "timestamp": lamport_timestamp,
            },
        )
        return result.fetchone() is not None

    async def _apply_operation_to_data(
        self,
        album_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        operation_type: str,
        target_type: str,
        target_id: UUID,
        payload: dict[str, Any],
    ) -> None:
        """Apply the operation to the actual database data."""
        if target_type == "element":
            await self._apply_element_operation(
                album_id, workspace_id, operation_type, target_id, payload
            )
        elif target_type == "spread":
            await self._apply_spread_operation(
                album_id, workspace_id, operation_type, target_id, payload
            )
        elif target_type == "album":
            await self._apply_album_operation(
                album_id, workspace_id, user_id, operation_type, payload
            )
        elif target_type == "comment":
            await self._apply_comment_operation(
                album_id, workspace_id, user_id, operation_type, target_id, payload
            )

    async def _apply_element_operation(
        self,
        album_id: UUID,
        workspace_id: UUID,
        operation_type: str,
        element_id: UUID,
        payload: dict[str, Any],
    ) -> None:
        """Apply element-level operations."""
        if operation_type == AlbumOperationType.ELEMENT_CREATE.value:
            await self.db.execute(
                text("""
                    INSERT INTO album_spread_elements
                    (element_id, spread_id, album_id, workspace_id, element_type,
                     asset_id, position, content, style, effects, crop_config)
                    VALUES (:element_id, :spread_id, :album_id, :workspace_id, :element_type,
                            :asset_id, :position, :content, :style, :effects, :crop_config)
                """),
                {
                    "element_id": str(element_id),
                    "spread_id": str(payload["spread_id"]),
                    "album_id": str(album_id),
                    "workspace_id": str(workspace_id),
                    "element_type": payload.get("element_type", "photo"),
                    "asset_id": str(payload["asset_id"]) if payload.get("asset_id") else None,
                    "position": json.dumps(payload.get("position", {})),
                    "content": json.dumps(payload.get("content", {})),
                    "style": json.dumps(payload.get("style", {})),
                    "effects": json.dumps(payload.get("effects", [])),
                    "crop_config": json.dumps(payload.get("crop_config", {})),
                },
            )
        elif operation_type in [
            AlbumOperationType.ELEMENT_UPDATE.value,
            AlbumOperationType.ELEMENT_MOVE.value,
            AlbumOperationType.ELEMENT_RESIZE.value,
            AlbumOperationType.ELEMENT_ROTATE.value,
            AlbumOperationType.ELEMENT_STYLE.value,
        ]:
            updates = []
            params = {
                "element_id": str(element_id),
                "workspace_id": str(workspace_id),
            }

            if "position" in payload:
                updates.append("position = :position")
                params["position"] = json.dumps(payload["position"])
            if "content" in payload:
                updates.append("content = :content")
                params["content"] = json.dumps(payload["content"])
            if "style" in payload:
                updates.append("style = :style")
                params["style"] = json.dumps(payload["style"])
            if "effects" in payload:
                updates.append("effects = :effects")
                params["effects"] = json.dumps(payload["effects"])
            if "crop_config" in payload:
                updates.append("crop_config = :crop_config")
                params["crop_config"] = json.dumps(payload["crop_config"])

            if updates:
                updates.append("updated_at = NOW()")
                await self.db.execute(
                    text(f"""
                        UPDATE album_spread_elements
                        SET {", ".join(updates)}
                        WHERE element_id = :element_id AND workspace_id = :workspace_id
                    """),
                    params,
                )
        elif operation_type == AlbumOperationType.ELEMENT_DELETE.value:
            await self.db.execute(
                text("""
                    DELETE FROM album_spread_elements
                    WHERE element_id = :element_id AND workspace_id = :workspace_id
                """),
                {
                    "element_id": str(element_id),
                    "workspace_id": str(workspace_id),
                },
            )

        await self.db.commit()

    async def _apply_spread_operation(
        self,
        album_id: UUID,
        workspace_id: UUID,
        operation_type: str,
        spread_id: UUID,
        payload: dict[str, Any],
    ) -> None:
        """Apply spread-level operations."""
        if operation_type == AlbumOperationType.SPREAD_CREATE.value:
            # Get max spread number
            result = await self.db.execute(
                text("""
                    SELECT COALESCE(MAX(spread_number), 0) + 1
                    FROM album_spreads
                    WHERE album_id = :album_id
                """),
                {"album_id": str(album_id)},
            )
            spread_number = result.fetchone()[0]

            await self.db.execute(
                text("""
                    INSERT INTO album_spreads
                    (spread_id, album_id, workspace_id, spread_number, spread_type,
                     layout_template_id, layout_config, background_config)
                    VALUES (:spread_id, :album_id, :workspace_id, :spread_number, :spread_type,
                            :layout_template_id, :layout_config, :background_config)
                """),
                {
                    "spread_id": str(spread_id),
                    "album_id": str(album_id),
                    "workspace_id": str(workspace_id),
                    "spread_number": spread_number,
                    "spread_type": payload.get("spread_type", "double"),
                    "layout_template_id": payload.get("layout_template_id"),
                    "layout_config": json.dumps(payload.get("layout_config", {})),
                    "background_config": json.dumps(payload.get("background_config", {})),
                },
            )
        elif operation_type == AlbumOperationType.SPREAD_UPDATE.value:
            updates = []
            params = {
                "spread_id": str(spread_id),
                "workspace_id": str(workspace_id),
            }

            if "layout_template_id" in payload:
                updates.append("layout_template_id = :layout_template_id")
                params["layout_template_id"] = payload["layout_template_id"]
            if "layout_config" in payload:
                updates.append("layout_config = :layout_config")
                params["layout_config"] = json.dumps(payload["layout_config"])
            if "background_config" in payload:
                updates.append("background_config = :background_config")
                params["background_config"] = json.dumps(payload["background_config"])

            if updates:
                updates.append("updated_at = NOW()")
                await self.db.execute(
                    text(f"""
                        UPDATE album_spreads
                        SET {", ".join(updates)}
                        WHERE spread_id = :spread_id AND workspace_id = :workspace_id
                    """),
                    params,
                )
        elif operation_type == AlbumOperationType.SPREAD_DELETE.value:
            await self.db.execute(
                text("""
                    DELETE FROM album_spreads
                    WHERE spread_id = :spread_id AND workspace_id = :workspace_id
                """),
                {
                    "spread_id": str(spread_id),
                    "workspace_id": str(workspace_id),
                },
            )
        elif operation_type == AlbumOperationType.SPREAD_REORDER.value:
            # Update spread numbers based on new order
            for idx, sid in enumerate(payload.get("spread_ids", [])):
                await self.db.execute(
                    text("""
                        UPDATE album_spreads
                        SET spread_number = :number, updated_at = NOW()
                        WHERE spread_id = :spread_id AND workspace_id = :workspace_id
                    """),
                    {
                        "spread_id": str(sid),
                        "workspace_id": str(workspace_id),
                        "number": idx + 1,
                    },
                )

        await self.db.commit()

    async def _apply_album_operation(
        self,
        album_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        operation_type: str,
        payload: dict[str, Any],
    ) -> None:
        """Apply album-level operations."""
        if operation_type == AlbumOperationType.ALBUM_UPDATE.value:
            updates = ["last_edited_by = :user_id", "last_edited_at = NOW()", "updated_at = NOW()"]
            params = {
                "album_id": str(album_id),
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
            }

            if "title" in payload:
                updates.append("title = :title")
                params["title"] = payload["title"]
            if "description" in payload:
                updates.append("description = :description")
                params["description"] = payload["description"]
            if "design_config" in payload:
                updates.append("design_config = :design_config")
                params["design_config"] = json.dumps(payload["design_config"])
            if "cover_config" in payload:
                updates.append("cover_config = :cover_config")
                params["cover_config"] = json.dumps(payload["cover_config"])
            if "status" in payload:
                updates.append("status = :status")
                params["status"] = payload["status"]

            await self.db.execute(
                text(f"""
                    UPDATE albums
                    SET {", ".join(updates)}
                    WHERE album_id = :album_id AND workspace_id = :workspace_id
                """),
                params,
            )
            await self.db.commit()

    async def _apply_comment_operation(
        self,
        album_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        operation_type: str,
        comment_id: UUID,
        payload: dict[str, Any],
    ) -> None:
        """Apply comment operations."""
        if operation_type == AlbumOperationType.COMMENT_CREATE.value:
            await self.db.execute(
                text("""
                    INSERT INTO album_comments
                    (comment_id, album_id, spread_id, element_id, workspace_id,
                     user_id, parent_comment_id, content, mentions, position)
                    VALUES (:comment_id, :album_id, :spread_id, :element_id, :workspace_id,
                            :user_id, :parent_comment_id, :content, :mentions, :position)
                """),
                {
                    "comment_id": str(comment_id),
                    "album_id": str(album_id),
                    "spread_id": str(payload["spread_id"]) if payload.get("spread_id") else None,
                    "element_id": str(payload["element_id"]) if payload.get("element_id") else None,
                    "workspace_id": str(workspace_id),
                    "user_id": str(user_id),
                    "parent_comment_id": str(payload["parent_comment_id"]) if payload.get("parent_comment_id") else None,
                    "content": payload["content"],
                    "mentions": payload.get("mentions", []),
                    "position": json.dumps(payload["position"]) if payload.get("position") else None,
                },
            )
        elif operation_type == AlbumOperationType.COMMENT_RESOLVE.value:
            await self.db.execute(
                text("""
                    UPDATE album_comments
                    SET status = 'resolved', resolved_by = :user_id, resolved_at = NOW()
                    WHERE comment_id = :comment_id AND workspace_id = :workspace_id
                """),
                {
                    "comment_id": str(comment_id),
                    "workspace_id": str(workspace_id),
                    "user_id": str(user_id),
                },
            )
        elif operation_type == AlbumOperationType.COMMENT_DELETE.value:
            await self.db.execute(
                text("""
                    UPDATE album_comments
                    SET status = 'archived', updated_at = NOW()
                    WHERE comment_id = :comment_id AND workspace_id = :workspace_id
                """),
                {
                    "comment_id": str(comment_id),
                    "workspace_id": str(workspace_id),
                },
            )

        await self.db.commit()

    async def _broadcast_operation(
        self,
        session_id: UUID,
        user_id: UUID,
        operation_id: str,
        operation_type: str,
        target_type: str,
        target_id: UUID,
        payload: dict[str, Any],
        new_version: int,
        vector_clock: dict[str, int],
        lamport_timestamp: int,
    ) -> None:
        """Broadcast operation to all session participants."""
        redis = await get_redis_client()

        message = {
            "type": "album:operation",
            "session_id": str(session_id),
            "operation": {
                "operation_id": operation_id,
                "user_id": str(user_id),
                "operation_type": operation_type,
                "target_type": target_type,
                "target_id": str(target_id),
                "payload": payload,
                "vector_clock": vector_clock,
                "lamport_timestamp": lamport_timestamp,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "new_version": new_version,
        }

        await redis.publish(
            f"{ALBUM_CHANNEL_PREFIX}{session_id}",
            json.dumps(message),
        )

    # -------------------------------------------------------------------------
    # Version History & Rollback
    # -------------------------------------------------------------------------

    async def create_version_snapshot(
        self,
        album_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        change_type: str = "edit",
        change_summary: str | None = None,
    ) -> dict[str, Any]:
        """Create a version snapshot of the album state.

        Args:
            album_id: Album UUID
            workspace_id: Workspace UUID
            user_id: User creating the snapshot
            change_type: Type of change (create, edit, auto_save, manual_save, rollback, approve, publish)
            change_summary: Optional description of the changes

        Returns:
            Version info including version_id and version_number
        """
        # Get album data
        result = await self.db.execute(
            text("""
                SELECT album_id, title, description, album_type, status,
                       page_size, cover_config, spine_config, design_config, metadata
                FROM albums
                WHERE album_id = :album_id AND workspace_id = :workspace_id
            """),
            {"album_id": str(album_id), "workspace_id": str(workspace_id)},
        )
        album_row = result.fetchone()

        if not album_row:
            raise ValueError(f"Album {album_id} not found")

        album_data = {
            "album_id": str(album_row[0]),
            "title": album_row[1],
            "description": album_row[2],
            "album_type": album_row[3],
            "status": album_row[4],
            "page_size": album_row[5],
            "cover_config": album_row[6],
            "spine_config": album_row[7],
            "design_config": album_row[8],
            "metadata": album_row[9],
        }

        # Get spreads
        result = await self.db.execute(
            text("""
                SELECT spread_id, spread_number, spread_type, layout_template_id,
                       layout_config, background_config, is_locked
                FROM album_spreads
                WHERE album_id = :album_id
                ORDER BY spread_number
            """),
            {"album_id": str(album_id)},
        )
        spreads = [
            {
                "spread_id": str(row[0]),
                "spread_number": row[1],
                "spread_type": row[2],
                "layout_template_id": row[3],
                "layout_config": row[4],
                "background_config": row[5],
                "is_locked": row[6],
            }
            for row in result.fetchall()
        ]

        # Get elements
        result = await self.db.execute(
            text("""
                SELECT element_id, spread_id, element_type, asset_id,
                       position, content, style, effects, crop_config,
                       is_locked, is_visible, layer_name, group_id
                FROM album_spread_elements
                WHERE album_id = :album_id
            """),
            {"album_id": str(album_id)},
        )
        elements = [
            {
                "element_id": str(row[0]),
                "spread_id": str(row[1]),
                "element_type": row[2],
                "asset_id": str(row[3]) if row[3] else None,
                "position": row[4],
                "content": row[5],
                "style": row[6],
                "effects": row[7],
                "crop_config": row[8],
                "is_locked": row[9],
                "is_visible": row[10],
                "layer_name": row[11],
                "group_id": str(row[12]) if row[12] else None,
            }
            for row in result.fetchall()
        ]

        # Create snapshot
        snapshot = {
            "album": album_data,
            "spreads": spreads,
            "elements": elements,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # Get next version number
        result = await self.db.execute(
            text("""
                SELECT COALESCE(MAX(version_number), 0) + 1
                FROM album_versions
                WHERE album_id = :album_id
            """),
            {"album_id": str(album_id)},
        )
        version_number = result.fetchone()[0]

        # Insert version
        result = await self.db.execute(
            text("""
                INSERT INTO album_versions
                (album_id, workspace_id, version_number, snapshot, change_type, change_summary, created_by)
                VALUES (:album_id, :workspace_id, :version_number, :snapshot, :change_type, :change_summary, :created_by)
                RETURNING version_id
            """),
            {
                "album_id": str(album_id),
                "workspace_id": str(workspace_id),
                "version_number": version_number,
                "snapshot": json.dumps(snapshot),
                "change_type": change_type,
                "change_summary": change_summary,
                "created_by": str(user_id),
            },
        )
        version_id = str(result.fetchone()[0])

        # Update album version
        await self.db.execute(
            text("""
                UPDATE albums
                SET current_version = :version_number
                WHERE album_id = :album_id
            """),
            {"album_id": str(album_id), "version_number": version_number},
        )
        await self.db.commit()

        return {
            "version_id": version_id,
            "version_number": version_number,
            "change_type": change_type,
            "created_at": snapshot["created_at"],
        }

    async def get_version_history(
        self,
        album_id: UUID,
        workspace_id: UUID,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get version history for an album."""
        result = await self.db.execute(
            text("""
                SELECT v.version_id, v.version_number, v.change_type, v.change_summary,
                       v.created_at, v.created_by, u.email, u.first_name, u.last_name
                FROM album_versions v
                JOIN users u ON v.created_by = u.user_id
                WHERE v.album_id = :album_id AND v.workspace_id = :workspace_id
                ORDER BY v.version_number DESC
                LIMIT :limit
            """),
            {
                "album_id": str(album_id),
                "workspace_id": str(workspace_id),
                "limit": limit,
            },
        )

        versions = []
        for row in result.fetchall():
            display_name = f"{row[7] or ''} {row[8] or ''}".strip() or row[6]
            versions.append({
                "version_id": str(row[0]),
                "version_number": row[1],
                "change_type": row[2],
                "change_summary": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
                "created_by": {
                    "user_id": str(row[5]),
                    "display_name": display_name,
                },
            })

        return versions

    async def rollback_to_version(
        self,
        album_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        version_number: int,
    ) -> dict[str, Any]:
        """Rollback an album to a specific version.

        Args:
            album_id: Album UUID
            workspace_id: Workspace UUID
            user_id: User performing the rollback
            version_number: Version number to rollback to

        Returns:
            New version info after rollback
        """
        # Get the snapshot
        result = await self.db.execute(
            text("""
                SELECT snapshot FROM album_versions
                WHERE album_id = :album_id AND version_number = :version_number
            """),
            {
                "album_id": str(album_id),
                "version_number": version_number,
            },
        )
        row = result.fetchone()

        if not row:
            raise ValueError(f"Version {version_number} not found")

        snapshot = row[0]

        # Clear existing data
        await self.db.execute(
            text("DELETE FROM album_spread_elements WHERE album_id = :album_id"),
            {"album_id": str(album_id)},
        )
        await self.db.execute(
            text("DELETE FROM album_spreads WHERE album_id = :album_id"),
            {"album_id": str(album_id)},
        )

        # Restore album data
        album_data = snapshot["album"]
        await self.db.execute(
            text("""
                UPDATE albums
                SET title = :title, description = :description, status = :status,
                    page_size = :page_size, cover_config = :cover_config,
                    spine_config = :spine_config, design_config = :design_config,
                    metadata = :metadata, last_edited_by = :user_id, last_edited_at = NOW()
                WHERE album_id = :album_id
            """),
            {
                "album_id": str(album_id),
                "title": album_data["title"],
                "description": album_data["description"],
                "status": album_data["status"],
                "page_size": json.dumps(album_data["page_size"]),
                "cover_config": json.dumps(album_data["cover_config"]),
                "spine_config": json.dumps(album_data["spine_config"]),
                "design_config": json.dumps(album_data["design_config"]),
                "metadata": json.dumps(album_data["metadata"]),
                "user_id": str(user_id),
            },
        )

        # Restore spreads
        for spread in snapshot["spreads"]:
            await self.db.execute(
                text("""
                    INSERT INTO album_spreads
                    (spread_id, album_id, workspace_id, spread_number, spread_type,
                     layout_template_id, layout_config, background_config, is_locked)
                    VALUES (:spread_id, :album_id, :workspace_id, :spread_number, :spread_type,
                            :layout_template_id, :layout_config, :background_config, :is_locked)
                """),
                {
                    "spread_id": spread["spread_id"],
                    "album_id": str(album_id),
                    "workspace_id": str(workspace_id),
                    "spread_number": spread["spread_number"],
                    "spread_type": spread["spread_type"],
                    "layout_template_id": spread["layout_template_id"],
                    "layout_config": json.dumps(spread["layout_config"]),
                    "background_config": json.dumps(spread["background_config"]),
                    "is_locked": spread["is_locked"],
                },
            )

        # Restore elements
        for element in snapshot["elements"]:
            await self.db.execute(
                text("""
                    INSERT INTO album_spread_elements
                    (element_id, spread_id, album_id, workspace_id, element_type,
                     asset_id, position, content, style, effects, crop_config,
                     is_locked, is_visible, layer_name, group_id)
                    VALUES (:element_id, :spread_id, :album_id, :workspace_id, :element_type,
                            :asset_id, :position, :content, :style, :effects, :crop_config,
                            :is_locked, :is_visible, :layer_name, :group_id)
                """),
                {
                    "element_id": element["element_id"],
                    "spread_id": element["spread_id"],
                    "album_id": str(album_id),
                    "workspace_id": str(workspace_id),
                    "element_type": element["element_type"],
                    "asset_id": element["asset_id"],
                    "position": json.dumps(element["position"]),
                    "content": json.dumps(element["content"]),
                    "style": json.dumps(element["style"]),
                    "effects": json.dumps(element["effects"]),
                    "crop_config": json.dumps(element["crop_config"]),
                    "is_locked": element["is_locked"],
                    "is_visible": element["is_visible"],
                    "layer_name": element["layer_name"],
                    "group_id": element["group_id"],
                },
            )

        await self.db.commit()

        # Create new version for the rollback
        return await self.create_version_snapshot(
            album_id=album_id,
            workspace_id=workspace_id,
            user_id=user_id,
            change_type="rollback",
            change_summary=f"Rolled back to version {version_number}",
        )


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

def get_album_collaboration_service(db: AsyncSession) -> AlbumCollaborationService:
    """Get an AlbumCollaborationService instance."""
    return AlbumCollaborationService(db)
