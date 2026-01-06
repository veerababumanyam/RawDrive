"""Collaboration Service for Real-time Gallery Editing.

Manages collaborative editing sessions, presence tracking, action logging,
conflict detection, and resource locking for multi-user gallery editing.
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
from uuid import UUID

from sqlalchemy import select, update, delete, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums (matching TypeScript shared types)
# ---------------------------------------------------------------------------

class EditSessionStatus(str, Enum):
    ACTIVE = "active"
    IDLE = "idle"
    DISCONNECTED = "disconnected"
    EXPIRED = "expired"


class CollaborativeActionType(str, Enum):
    # Asset actions
    ASSET_ADD = "asset:add"
    ASSET_REMOVE = "asset:remove"
    ASSET_MOVE = "asset:move"
    ASSET_REORDER = "asset:reorder"
    ASSET_UPDATE = "asset:update"
    ASSET_FAVORITE = "asset:favorite"
    ASSET_SELECT = "asset:select"

    # Collection/sub-gallery actions
    COLLECTION_CREATE = "collection:create"
    COLLECTION_DELETE = "collection:delete"
    COLLECTION_RENAME = "collection:rename"
    COLLECTION_REORDER = "collection:reorder"

    # Gallery metadata actions
    GALLERY_UPDATE = "gallery:update"
    GALLERY_SETTINGS = "gallery:settings"

    # AI suggestion actions
    AI_SUGGESTION_APPLY = "ai:apply"
    AI_SUGGESTION_REJECT = "ai:reject"
    AI_SUGGESTION_REQUEST = "ai:request"

    # Cursor/selection actions
    CURSOR_MOVE = "cursor:move"
    SELECTION_CHANGE = "selection:change"


class LockType(str, Enum):
    EXCLUSIVE = "exclusive"
    SHARED = "shared"


class ConflictResolutionStrategy(str, Enum):
    LAST_WRITE_WINS = "last_write_wins"
    FIRST_WRITE_WINS = "first_write_wins"
    MANUAL = "manual"
    MERGE = "merge"


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Redis key prefixes for collaboration
COLLAB_SESSION_PREFIX = "collab:session:"
COLLAB_PRESENCE_PREFIX = "collab:presence:"
COLLAB_CURSOR_PREFIX = "collab:cursor:"
COLLAB_LOCK_PREFIX = "collab:lock:"
COLLAB_CHANNEL_PREFIX = "collab:channel:"

# Session settings
DEFAULT_SESSION_TTL = 3600  # 1 hour
DEFAULT_PRESENCE_TTL = 60  # 1 minute for presence heartbeat
DEFAULT_CURSOR_TTL = 5  # 5 seconds for cursor position
DEFAULT_LOCK_TTL = 300  # 5 minutes for locks

# Color palette for collaborators
COLLABORATOR_COLORS = [
    "#FF6B6B",  # Red
    "#4ECDC4",  # Teal
    "#45B7D1",  # Blue
    "#96CEB4",  # Green
    "#FFEAA7",  # Yellow
    "#DDA0DD",  # Plum
    "#98D8C8",  # Mint
    "#F7DC6F",  # Gold
    "#BB8FCE",  # Purple
    "#85C1E9",  # Light Blue
]


# ---------------------------------------------------------------------------
# Service Class
# ---------------------------------------------------------------------------

class CollaborationService:
    """Service for managing collaborative gallery editing."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # -------------------------------------------------------------------------
    # Session Management
    # -------------------------------------------------------------------------

    async def create_session(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        user_id: UUID,
    ) -> dict[str, Any]:
        """Create or join an existing collaborative editing session.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            user_id: User UUID creating/joining the session

        Returns:
            Session data including session_id, collaborators, and websocket info
        """
        redis = await get_redis_client()

        # Check for existing active session for this gallery
        existing_session = await self._get_active_session(gallery_id)

        if existing_session:
            # Join existing session
            session_id = UUID(existing_session["session_id"])
            color = await self._assign_collaborator_color(session_id, user_id)

            await self._add_participant(
                session_id=session_id,
                user_id=user_id,
                workspace_id=workspace_id,
                color=color,
            )

            # Get updated session data
            session_data = await self._get_session_data(session_id)
            logger.info(
                f"User {user_id} joined session {session_id} for gallery {gallery_id}"
            )
        else:
            # Create new session
            session_id = await self._create_new_session(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
            )
            color = await self._assign_collaborator_color(session_id, user_id)

            await self._add_participant(
                session_id=session_id,
                user_id=user_id,
                workspace_id=workspace_id,
                color=color,
            )

            session_data = await self._get_session_data(session_id)
            logger.info(
                f"User {user_id} created session {session_id} for gallery {gallery_id}"
            )

        # Store session in Redis for fast access
        await redis.setex(
            f"{COLLAB_SESSION_PREFIX}{session_id}",
            DEFAULT_SESSION_TTL,
            json.dumps(session_data, default=str),
        )

        return {
            "session": session_data,
            "your_color": color,
            "websocket_url": f"/api/v1/collaboration/ws/{session_id}",
            "token": await self._generate_session_token(session_id, user_id),
        }

    async def _get_active_session(self, gallery_id: UUID) -> dict[str, Any] | None:
        """Get active session for a gallery from database."""
        result = await self.db.execute(
            """
            SELECT session_id, workspace_id, gallery_id, status, version,
                   created_at, last_activity
            FROM edit_sessions
            WHERE gallery_id = :gallery_id AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            {"gallery_id": str(gallery_id)},
        )
        row = result.fetchone()
        if row:
            return {
                "session_id": str(row[0]),
                "workspace_id": str(row[1]),
                "gallery_id": str(row[2]),
                "status": row[3],
                "version": row[4],
                "created_at": row[5].isoformat() if row[5] else None,
                "last_activity": row[6].isoformat() if row[6] else None,
            }
        return None

    async def _create_new_session(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> UUID:
        """Create a new edit session in the database."""
        result = await self.db.execute(
            """
            INSERT INTO edit_sessions (workspace_id, gallery_id, status, version)
            VALUES (:workspace_id, :gallery_id, 'active', 1)
            RETURNING session_id
            """,
            {
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
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
        """Add a participant to an edit session."""
        # Check if participant already exists
        result = await self.db.execute(
            """
            SELECT participant_id FROM edit_session_participants
            WHERE session_id = :session_id AND user_id = :user_id
            """,
            {"session_id": str(session_id), "user_id": str(user_id)},
        )
        existing = result.fetchone()

        if existing:
            # Update existing participant
            await self.db.execute(
                """
                UPDATE edit_session_participants
                SET status = 'active', left_at = NULL, last_activity = NOW()
                WHERE session_id = :session_id AND user_id = :user_id
                """,
                {"session_id": str(session_id), "user_id": str(user_id)},
            )
        else:
            # Insert new participant
            await self.db.execute(
                """
                INSERT INTO edit_session_participants
                (session_id, user_id, workspace_id, color, status)
                VALUES (:session_id, :user_id, :workspace_id, :color, 'active')
                """,
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
        """Assign a unique color to a collaborator in a session."""
        # Get existing colors in this session
        result = await self.db.execute(
            """
            SELECT color FROM edit_session_participants
            WHERE session_id = :session_id AND user_id != :user_id
            """,
            {"session_id": str(session_id), "user_id": str(user_id)},
        )
        used_colors = {row[0] for row in result.fetchall()}

        # Find first unused color
        for color in COLLABORATOR_COLORS:
            if color not in used_colors:
                return color

        # All colors used, generate a random one
        return f"#{secrets.token_hex(3)}"

    async def _get_session_data(self, session_id: UUID) -> dict[str, Any]:
        """Get full session data including collaborators."""
        # Get session info
        result = await self.db.execute(
            """
            SELECT session_id, workspace_id, gallery_id, status, version,
                   created_at, last_activity
            FROM edit_sessions
            WHERE session_id = :session_id
            """,
            {"session_id": str(session_id)},
        )
        session_row = result.fetchone()

        if not session_row:
            raise ValueError(f"Session {session_id} not found")

        # Get collaborators with user info
        result = await self.db.execute(
            """
            SELECT p.user_id, p.color, p.status, p.cursor_position,
                   p.selected_assets, p.focus_area, p.joined_at, p.last_activity,
                   u.email, u.first_name, u.last_name
            FROM edit_session_participants p
            JOIN users u ON p.user_id = u.user_id
            WHERE p.session_id = :session_id AND p.status != 'disconnected'
            """,
            {"session_id": str(session_id)},
        )
        collaborators = []
        for row in result.fetchall():
            display_name = f"{row[8] or ''} {row[9] or ''}".strip() or row[7]
            collaborators.append({
                "user_id": str(row[0]),
                "display_name": display_name,
                "color": row[1],
                "status": row[2],
                "cursor": row[3],
                "selected_assets": row[4] or [],
                "focus_area": row[5],
                "joined_at": row[6].isoformat() if row[6] else None,
                "last_activity": row[7].isoformat() if row[7] else None,
            })

        return {
            "session_id": str(session_row[0]),
            "workspace_id": str(session_row[1]),
            "gallery_id": str(session_row[2]),
            "status": session_row[3],
            "version": session_row[4],
            "created_at": session_row[5].isoformat() if session_row[5] else None,
            "last_activity": session_row[6].isoformat() if session_row[6] else None,
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

        # Store token with session/user mapping
        token_data = {
            "session_id": str(session_id),
            "user_id": str(user_id),
        }
        await redis.setex(
            f"collab:token:{token}",
            DEFAULT_SESSION_TTL,
            json.dumps(token_data),
        )
        return token

    async def validate_session_token(self, token: str) -> dict[str, str] | None:
        """Validate a session token and return session/user info."""
        redis = await get_redis_client()
        data = await redis.get(f"collab:token:{token}")
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
            """
            UPDATE edit_session_participants
            SET status = 'disconnected', left_at = NOW()
            WHERE session_id = :session_id AND user_id = :user_id
            """,
            {"session_id": str(session_id), "user_id": str(user_id)},
        )
        await self.db.commit()

        # Check if session is now empty
        result = await self.db.execute(
            """
            SELECT COUNT(*) FROM edit_session_participants
            WHERE session_id = :session_id AND status = 'active'
            """,
            {"session_id": str(session_id)},
        )
        count = result.fetchone()[0]

        if count == 0:
            # Close empty session
            await self.db.execute(
                """
                UPDATE edit_sessions
                SET status = 'closed', closed_at = NOW()
                WHERE session_id = :session_id
                """,
                {"session_id": str(session_id)},
            )
            await self.db.commit()

        # Broadcast leave event
        await self._broadcast_presence_update(
            session_id=session_id,
            user_id=user_id,
            event="left",
        )

        logger.info(f"User {user_id} left session {session_id}")

    # -------------------------------------------------------------------------
    # Presence & Cursor Management
    # -------------------------------------------------------------------------

    async def update_presence(
        self,
        session_id: UUID,
        user_id: UUID,
        status: str = "active",
        cursor: dict[str, Any] | None = None,
        selected_assets: list[str] | None = None,
        focus_area: str | None = None,
    ) -> None:
        """Update a user's presence in a session."""
        redis = await get_redis_client()

        # Update database
        updates = {"last_activity": datetime.now(timezone.utc)}
        if status:
            updates["status"] = status
        if cursor is not None:
            updates["cursor_position"] = json.dumps(cursor)
        if selected_assets is not None:
            updates["selected_assets"] = selected_assets
        if focus_area is not None:
            updates["focus_area"] = focus_area

        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        params = {
            **{k: v if not isinstance(v, datetime) else v.isoformat() for k, v in updates.items()},
            "session_id": str(session_id),
            "user_id": str(user_id),
        }

        await self.db.execute(
            f"""
            UPDATE edit_session_participants
            SET {set_clause}
            WHERE session_id = :session_id AND user_id = :user_id
            """,
            params,
        )
        await self.db.commit()

        # Store cursor in Redis for fast access
        if cursor:
            await redis.setex(
                f"{COLLAB_CURSOR_PREFIX}{session_id}:{user_id}",
                DEFAULT_CURSOR_TTL,
                json.dumps(cursor),
            )

        # Broadcast update
        await self._broadcast_presence_update(
            session_id=session_id,
            user_id=user_id,
            event="updated",
            cursor=cursor,
            selected_assets=selected_assets,
        )

    async def _broadcast_presence_update(
        self,
        session_id: UUID,
        user_id: UUID,
        event: str,
        cursor: dict[str, Any] | None = None,
        selected_assets: list[str] | None = None,
    ) -> None:
        """Broadcast presence update to all session participants."""
        redis = await get_redis_client()

        message = {
            "type": "collab:presence",
            "session_id": str(session_id),
            "user_id": str(user_id),
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if cursor:
            message["cursor"] = cursor
        if selected_assets:
            message["selected_assets"] = selected_assets

        await redis.publish(
            f"{COLLAB_CHANNEL_PREFIX}{session_id}",
            json.dumps(message),
        )

    # -------------------------------------------------------------------------
    # Action Management
    # -------------------------------------------------------------------------

    async def record_action(
        self,
        session_id: UUID,
        user_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        action_type: str,
        payload: dict[str, Any],
        base_version: int,
    ) -> dict[str, Any]:
        """Record a collaborative action and check for conflicts.

        Args:
            session_id: Session UUID
            user_id: User performing the action
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            action_type: Type of action
            payload: Action payload
            base_version: Version the action is based on

        Returns:
            Action result including new version and any conflicts
        """
        # Get current session version
        result = await self.db.execute(
            """
            SELECT version FROM edit_sessions
            WHERE session_id = :session_id
            FOR UPDATE
            """,
            {"session_id": str(session_id)},
        )
        row = result.fetchone()
        current_version = row[0] if row else 1

        # Check for version conflict
        conflict = None
        if base_version < current_version:
            # Potential conflict - check if actions affect same resources
            conflict = await self._detect_conflict(
                session_id=session_id,
                action_type=action_type,
                payload=payload,
                base_version=base_version,
                current_version=current_version,
            )

        # Record the action
        new_version = current_version + 1
        result = await self.db.execute(
            """
            INSERT INTO collaborative_actions
            (session_id, user_id, workspace_id, gallery_id, action_type,
             payload, base_version, result_version, applied_at)
            VALUES (:session_id, :user_id, :workspace_id, :gallery_id,
                    :action_type, :payload, :base_version, :result_version, NOW())
            RETURNING action_id
            """,
            {
                "session_id": str(session_id),
                "user_id": str(user_id),
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
                "action_type": action_type,
                "payload": json.dumps(payload),
                "base_version": base_version,
                "result_version": new_version,
            },
        )
        action_row = result.fetchone()
        action_id = str(action_row[0])

        # Update session version
        await self.db.execute(
            """
            UPDATE edit_sessions
            SET version = :version, last_activity = NOW()
            WHERE session_id = :session_id
            """,
            {"version": new_version, "session_id": str(session_id)},
        )
        await self.db.commit()

        # Broadcast action to collaborators
        await self._broadcast_action(
            session_id=session_id,
            user_id=user_id,
            action_id=action_id,
            action_type=action_type,
            payload=payload,
            new_version=new_version,
        )

        return {
            "action_id": action_id,
            "success": True,
            "new_version": new_version,
            "conflict": conflict,
        }

    async def _detect_conflict(
        self,
        session_id: UUID,
        action_type: str,
        payload: dict[str, Any],
        base_version: int,
        current_version: int,
    ) -> dict[str, Any] | None:
        """Detect if there's a conflict with recent actions."""
        # Get actions since base_version
        result = await self.db.execute(
            """
            SELECT action_id, user_id, action_type, payload
            FROM collaborative_actions
            WHERE session_id = :session_id
              AND result_version > :base_version
              AND result_version <= :current_version
            ORDER BY result_version
            """,
            {
                "session_id": str(session_id),
                "base_version": base_version,
                "current_version": current_version,
            },
        )
        recent_actions = result.fetchall()

        # Check for conflicting actions
        affected_assets = set(payload.get("asset_ids", []))
        if "asset_id" in payload:
            affected_assets.add(payload["asset_id"])

        for action in recent_actions:
            other_payload = json.loads(action[3]) if action[3] else {}
            other_assets = set(other_payload.get("asset_ids", []))
            if "asset_id" in other_payload:
                other_assets.add(other_payload["asset_id"])

            # Check for overlap
            if affected_assets & other_assets:
                return {
                    "conflict_type": "concurrent_edit",
                    "conflicting_action_id": str(action[0]),
                    "conflicting_user_id": str(action[1]),
                    "conflicting_action_type": action[2],
                    "suggested_resolution": ConflictResolutionStrategy.LAST_WRITE_WINS.value,
                }

        return None

    async def _broadcast_action(
        self,
        session_id: UUID,
        user_id: UUID,
        action_id: str,
        action_type: str,
        payload: dict[str, Any],
        new_version: int,
    ) -> None:
        """Broadcast an action to all session participants."""
        redis = await get_redis_client()

        message = {
            "type": "collab:action",
            "session_id": str(session_id),
            "action": {
                "action_id": action_id,
                "user_id": str(user_id),
                "action_type": action_type,
                "payload": payload,
                "base_version": new_version - 1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "new_version": new_version,
        }

        await redis.publish(
            f"{COLLAB_CHANNEL_PREFIX}{session_id}",
            json.dumps(message),
        )

    async def get_action_history(
        self,
        session_id: UUID,
        from_version: int = 0,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get action history for a session."""
        result = await self.db.execute(
            """
            SELECT action_id, user_id, action_type, payload, base_version,
                   result_version, undoable, undone, created_at
            FROM collaborative_actions
            WHERE session_id = :session_id
              AND result_version > :from_version
            ORDER BY result_version
            LIMIT :limit
            """,
            {
                "session_id": str(session_id),
                "from_version": from_version,
                "limit": limit,
            },
        )

        actions = []
        for row in result.fetchall():
            actions.append({
                "action_id": str(row[0]),
                "user_id": str(row[1]),
                "action_type": row[2],
                "payload": json.loads(row[3]) if row[3] else {},
                "base_version": row[4],
                "result_version": row[5],
                "undoable": row[6],
                "undone": row[7],
                "timestamp": row[8].isoformat() if row[8] else None,
            })

        return actions

    async def undo_action(
        self,
        session_id: UUID,
        user_id: UUID,
        action_id: UUID,
    ) -> dict[str, Any]:
        """Undo a specific action."""
        # Get the action to undo
        result = await self.db.execute(
            """
            SELECT action_type, payload, undoable, undone
            FROM collaborative_actions
            WHERE action_id = :action_id AND session_id = :session_id
            """,
            {"action_id": str(action_id), "session_id": str(session_id)},
        )
        row = result.fetchone()

        if not row:
            return {"success": False, "error": "Action not found"}

        if not row[2]:
            return {"success": False, "error": "Action is not undoable"}

        if row[3]:
            return {"success": False, "error": "Action already undone"}

        # Mark as undone
        await self.db.execute(
            """
            UPDATE collaborative_actions
            SET undone = TRUE
            WHERE action_id = :action_id
            """,
            {"action_id": str(action_id)},
        )
        await self.db.commit()

        # TODO: Actually reverse the action based on type
        # This would require implementing inverse operations

        return {"success": True, "action_id": str(action_id)}

    # -------------------------------------------------------------------------
    # Locking
    # -------------------------------------------------------------------------

    async def acquire_lock(
        self,
        workspace_id: UUID,
        session_id: UUID,
        user_id: UUID,
        resource_type: str,
        resource_id: UUID,
        lock_type: str = "exclusive",
        duration_seconds: int = DEFAULT_LOCK_TTL,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Acquire a lock on a resource.

        Args:
            workspace_id: Workspace UUID
            session_id: Session UUID
            user_id: User requesting the lock
            resource_type: Type of resource ('gallery', 'sub_gallery', 'asset', 'settings')
            resource_id: Resource UUID
            lock_type: 'exclusive' or 'shared'
            duration_seconds: Lock duration
            reason: Optional reason for the lock

        Returns:
            Lock result including lock_id or error
        """
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=duration_seconds)

        # Check for existing locks
        result = await self.db.execute(
            """
            SELECT lock_id, user_id, lock_type, expires_at
            FROM resource_locks
            WHERE resource_type = :resource_type
              AND resource_id = :resource_id
              AND released_at IS NULL
              AND expires_at > NOW()
            """,
            {
                "resource_type": resource_type,
                "resource_id": str(resource_id),
            },
        )
        existing_locks = result.fetchall()

        # Check lock compatibility
        for lock in existing_locks:
            existing_user_id = lock[1]
            existing_lock_type = lock[2]

            # Same user can extend their lock
            if str(existing_user_id) == str(user_id):
                # Update existing lock
                await self.db.execute(
                    """
                    UPDATE resource_locks
                    SET expires_at = :expires_at
                    WHERE lock_id = :lock_id
                    """,
                    {"expires_at": expires_at, "lock_id": str(lock[0])},
                )
                await self.db.commit()
                return {
                    "success": True,
                    "lock": {
                        "lock_id": str(lock[0]),
                        "resource_type": resource_type,
                        "resource_id": str(resource_id),
                        "user_id": str(user_id),
                        "lock_type": lock_type,
                        "expires_at": expires_at.isoformat(),
                    },
                }

            # Exclusive locks block all other locks
            if existing_lock_type == "exclusive" or lock_type == "exclusive":
                # Get holder info
                holder_result = await self.db.execute(
                    """
                    SELECT email, first_name, last_name FROM users
                    WHERE user_id = :user_id
                    """,
                    {"user_id": str(existing_user_id)},
                )
                holder_row = holder_result.fetchone()
                holder_name = (
                    f"{holder_row[1] or ''} {holder_row[2] or ''}".strip()
                    or holder_row[0]
                ) if holder_row else "Unknown"

                return {
                    "success": False,
                    "error": "Resource is locked",
                    "holder": {
                        "user_id": str(existing_user_id),
                        "display_name": holder_name,
                    },
                }

        # Acquire the lock
        result = await self.db.execute(
            """
            INSERT INTO resource_locks
            (workspace_id, session_id, user_id, resource_type, resource_id,
             lock_type, reason, expires_at)
            VALUES (:workspace_id, :session_id, :user_id, :resource_type,
                    :resource_id, :lock_type, :reason, :expires_at)
            RETURNING lock_id
            """,
            {
                "workspace_id": str(workspace_id),
                "session_id": str(session_id),
                "user_id": str(user_id),
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "lock_type": lock_type,
                "reason": reason,
                "expires_at": expires_at,
            },
        )
        await self.db.commit()
        lock_row = result.fetchone()

        # Broadcast lock acquired
        await self._broadcast_lock_event(
            session_id=session_id,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            event="acquired",
        )

        return {
            "success": True,
            "lock": {
                "lock_id": str(lock_row[0]),
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "user_id": str(user_id),
                "lock_type": lock_type,
                "acquired_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": expires_at.isoformat(),
            },
        }

    async def release_lock(
        self,
        lock_id: UUID,
        user_id: UUID,
    ) -> dict[str, Any]:
        """Release a lock on a resource."""
        # Verify ownership
        result = await self.db.execute(
            """
            SELECT session_id, resource_type, resource_id
            FROM resource_locks
            WHERE lock_id = :lock_id AND user_id = :user_id AND released_at IS NULL
            """,
            {"lock_id": str(lock_id), "user_id": str(user_id)},
        )
        row = result.fetchone()

        if not row:
            return {"success": False, "error": "Lock not found or not owned by user"}

        session_id = row[0]
        resource_type = row[1]
        resource_id = row[2]

        # Release the lock
        await self.db.execute(
            """
            UPDATE resource_locks
            SET released_at = NOW()
            WHERE lock_id = :lock_id
            """,
            {"lock_id": str(lock_id)},
        )
        await self.db.commit()

        # Broadcast lock released
        if session_id:
            await self._broadcast_lock_event(
                session_id=UUID(str(session_id)),
                user_id=user_id,
                resource_type=resource_type,
                resource_id=UUID(str(resource_id)),
                event="released",
            )

        return {"success": True}

    async def _broadcast_lock_event(
        self,
        session_id: UUID,
        user_id: UUID,
        resource_type: str,
        resource_id: UUID,
        event: str,
    ) -> None:
        """Broadcast lock event to session participants."""
        redis = await get_redis_client()

        message = {
            "type": f"collab:lock_{event}",
            "session_id": str(session_id),
            "user_id": str(user_id),
            "resource_type": resource_type,
            "resource_id": str(resource_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        await redis.publish(
            f"{COLLAB_CHANNEL_PREFIX}{session_id}",
            json.dumps(message),
        )

    # -------------------------------------------------------------------------
    # Notifications
    # -------------------------------------------------------------------------

    async def send_notification(
        self,
        session_id: UUID,
        user_id: UUID,
        user_name: str,
        action_type: str,
        summary: str,
        affected_items: list[str],
    ) -> None:
        """Send a change notification to session participants."""
        redis = await get_redis_client()

        message = {
            "type": "collab:notification",
            "session_id": str(session_id),
            "user_id": str(user_id),
            "user_name": user_name,
            "action_type": action_type,
            "summary": summary,
            "affected_items": affected_items,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        await redis.publish(
            f"{COLLAB_CHANNEL_PREFIX}{session_id}",
            json.dumps(message),
        )

        # Log the event
        await self.db.execute(
            """
            INSERT INTO collaboration_events
            (session_id, workspace_id, gallery_id, user_id, event_type, event_data)
            SELECT :session_id, workspace_id, gallery_id, :user_id, 'notification', :event_data
            FROM edit_sessions WHERE session_id = :session_id
            """,
            {
                "session_id": str(session_id),
                "user_id": str(user_id),
                "event_data": json.dumps({
                    "action_type": action_type,
                    "summary": summary,
                    "affected_items": affected_items,
                }),
            },
        )
        await self.db.commit()


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

def get_collaboration_service(db: AsyncSession) -> CollaborationService:
    """Get a CollaborationService instance."""
    return CollaborationService(db)
