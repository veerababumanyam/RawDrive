"""Face Group History Service.

Handles recording and undoing face group operations.
Requirements: 16.7
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool
from app.repositories.face_group_repository import get_face_group_repository
from app.repositories.face_repository import get_face_repository

logger = logging.getLogger(__name__)


# Valid action types matching database check constraint
VALID_ACTIONS = {
    "assign", "unassign", "merge", "split", 
    "delete_group", "create_group", "rename"
}


class FaceGroupHistoryService:
    """Service for managing face group history and undo operations.
    
    This service records face group actions to enable undo functionality.
    History entries auto-expire after 24 hours (configured in database).
    """
    
    def __init__(self):
        self._group_repo = None
        self._face_repo = None

    @property
    def group_repo(self):
        if self._group_repo is None:
            self._group_repo = get_face_group_repository()
        return self._group_repo

    @property
    def face_repo(self):
        if self._face_repo is None:
            self._face_repo = get_face_repository()
        return self._face_repo

    async def record_action(
        self,
        workspace_id: UUID,
        action: str,
        face_id: Optional[UUID] = None,
        source_group_id: Optional[UUID] = None,
        target_group_id: Optional[UUID] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> UUID:
        """Record a face group action for history.
        
        Args:
            workspace_id: Workspace ID
            action: Action type (assign, unassign, merge, split, delete_group, create_group, rename)
            face_id: Face ID involved in the action (optional)
            source_group_id: Source group ID (for merge/split/unassign)
            target_group_id: Target group ID (for assign/merge)
            metadata: Additional context as JSON
            
        Returns:
            ID of the created history entry
        """
        if action not in VALID_ACTIONS:
            raise ValueError(f"Invalid action: {action}. Valid actions: {VALID_ACTIONS}")
        
        pool = await get_postgres_pool()
        history_id = uuid4()
        
        # Serialize metadata to JSON safely
        metadata_json = json.dumps(metadata or {}, default=str)
        
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO face_group_history (
                        id, workspace_id, action,
                        face_id, source_group_id, target_group_id,
                        metadata, created_at, expires_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '24 hours')
                    """,
                    history_id,
                    workspace_id,
                    action,
                    face_id,
                    source_group_id,
                    target_group_id,
                    metadata_json,
                )
            
            logger.info(
                f"Recorded face group action: {action}",
                extra={
                    "history_id": str(history_id),
                    "action": action,
                    "face_id": str(face_id) if face_id else None,
                }
            )
            return history_id
            
        except Exception as e:
            # Log but don't fail the main operation
            logger.error(f"Failed to record face group history: {e}")
            raise

    async def get_recent_history(
        self,
        workspace_id: UUID,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get recent history for a workspace (non-expired entries)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM face_group_history
                WHERE workspace_id = $1 AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT $2
                """,
                workspace_id,
                limit,
            )
            return [dict(row) for row in rows]

    async def get_history_by_face(
        self,
        workspace_id: UUID,
        face_id: UUID,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Get history for a specific face."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM face_group_history
                WHERE workspace_id = $1 AND face_id = $2 AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT $3
                """,
                workspace_id,
                face_id,
                limit,
            )
            return [dict(row) for row in rows]

    async def undo_action(
        self,
        workspace_id: UUID,
        history_id: UUID,
    ) -> bool:
        """Undo a specific history action.
        
        This reverses the recorded action:
        - assign: unassign face from group
        - unassign: reassign face to source group
        - merge: cannot undo (complex operation)
        - split: cannot undo (complex operation)
        - rename: revert to previous name (from metadata)
        
        Returns:
            True if undo was successful, False otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Fetch the history entry
            entry = await conn.fetchrow(
                """
                SELECT * FROM face_group_history
                WHERE id = $1 AND workspace_id = $2 AND expires_at > NOW()
                """,
                history_id,
                workspace_id,
            )
            
            if not entry:
                logger.warning(f"History entry {history_id} not found or expired")
                return False
            
            action = entry["action"]
            face_id = entry["face_id"]
            source_group_id = entry["source_group_id"]
            target_group_id = entry["target_group_id"]
            metadata = entry["metadata"] if entry["metadata"] else {}
            
            # Perform undo based on action type
            if action == "assign":
                # Undo assign: unassign from target group
                if face_id and target_group_id:
                    await self.face_repo.update(
                        face_id, workspace_id, face_group_id=None
                    )
                    await self.group_repo.decrement_face_count(target_group_id, workspace_id, 1)
                    logger.info(f"Undid assign: face {face_id} removed from group {target_group_id}")
                    return True
                    
            elif action == "unassign":
                # Undo unassign: reassign to source group
                if face_id and source_group_id:
                    await self.face_repo.update(
                        face_id, workspace_id, face_group_id=source_group_id
                    )
                    await self.group_repo.increment_face_count(source_group_id, workspace_id, 1)
                    logger.info(f"Undid unassign: face {face_id} reassigned to group {source_group_id}")
                    return True
                    
            elif action == "rename":
                # Undo rename: revert to previous name
                previous_name = metadata.get("previous_name")
                group_id = target_group_id or source_group_id
                if previous_name and group_id:
                    await self.group_repo.update(group_id, workspace_id, name=previous_name)
                    logger.info(f"Undid rename: group {group_id} reverted to '{previous_name}'")
                    return True
                    
            elif action in ("merge", "split", "delete_group", "create_group"):
                # Complex operations - cannot easily undo
                logger.warning(f"Cannot undo complex action: {action}")
                return False
            
            # Delete the history entry after successful undo
            await conn.execute(
                "DELETE FROM face_group_history WHERE id = $1",
                history_id,
            )
            
            return False

    async def cleanup_expired(self) -> int:
        """Remove expired history entries. Returns count of deleted rows."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM face_group_history WHERE expires_at < NOW()"
            )
            # Parse "DELETE N" to get count
            count = int(result.split()[-1]) if result else 0
            logger.info(f"Cleaned up {count} expired history entries")
            return count


# Singleton
_history_service: Optional[FaceGroupHistoryService] = None

def get_face_group_history_service() -> FaceGroupHistoryService:
    global _history_service
    if _history_service is None:
        _history_service = FaceGroupHistoryService()
    return _history_service
