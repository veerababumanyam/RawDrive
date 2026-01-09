"""Workspace Deletion Service."""

from __future__ import annotations

import logging
from uuid import UUID
from datetime import datetime, timedelta

from app.db.postgres import get_postgres_pool
from app.api.workspace_settings_schemas import (
    DeletionReason
)

logger = logging.getLogger(__name__)

class WorkspaceDeletionError(Exception):
    """Base workspace deletion error."""
    def __init__(self, message: str, code: str = "DELETION_ERROR", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status

class WorkspaceDeletionService:
    """Service for managing workspace deletion requests."""
    
    async def request_workspace_deletion(self, workspace_id: UUID, reason: DeletionReason, details: str, user_id: UUID):
        """Request workspace deletion (schedules it)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Update workspaces table directly (migration 0145 adds columns to workspaces)
            # We assume a 30 day grace period
            scheduled_at = datetime.utcnow() + timedelta(days=30)
            
            await conn.execute(
                """
                UPDATE workspaces
                SET 
                    deletion_requested_at = NOW(),
                    scheduled_deletion_at = $1,
                    deletion_reason = $2,
                    deletion_requested_by = $3
                WHERE workspace_id = $4
                """,
                scheduled_at, details or reason.value, user_id, workspace_id
            )
            
            logger.info(f"Workspace {workspace_id} deletion requested by user {user_id}. Scheduled for {scheduled_at}")
            
            return {
                "message": "Workspace deletion requested successfully",
                "scheduled_at": scheduled_at.isoformat(),
                "grace_period_days": 30
            }

    async def cancel_workspace_deletion(self, workspace_id: UUID, user_id: UUID):
        """Cancel a pending workspace deletion request."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check if there is a pending request
            row = await conn.fetchrow(
                """
                SELECT deletion_requested_at FROM workspaces
                WHERE workspace_id = $1 AND deletion_requested_at IS NOT NULL
                """,
                workspace_id
            )
            
            if not row:
                raise WorkspaceDeletionError("No pending deletion request found for this workspace", status=404)
                
            # Clear deletion fields
            await conn.execute(
                """
                UPDATE workspaces
                SET 
                    deletion_requested_at = NULL,
                    scheduled_deletion_at = NULL,
                    deletion_reason = NULL,
                    deletion_requested_by = NULL
                WHERE workspace_id = $1
                """,
                workspace_id
            )
            
            logger.info(f"Workspace {workspace_id} deletion cancelled by user {user_id}")
            
            return {
                 "message": "Workspace deletion request cancelled"
            }
            
    async def get_deletion_status(self, workspace_id: UUID):
        """Get current deletion status."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Query workspaces table directly (migration 0145 adds columns to workspaces, not a separate table)
            row = await conn.fetchrow(
                """
                SELECT 
                    deletion_requested_at,
                    scheduled_deletion_at,
                    deletion_reason,
                    deletion_requested_by
                FROM workspaces
                WHERE workspace_id = $1 AND deletion_requested_at IS NOT NULL
                """,
                workspace_id
            )
            
            if row and row["deletion_requested_at"]:
                return {
                    "is_deletion_pending": True,
                    "scheduled_at": row["scheduled_deletion_at"],
                    "requested_at": row["deletion_requested_at"],
                    "requested_by": row["deletion_requested_by"]
                }
            
            return {
                "is_deletion_pending": False
            }

_deletion_service = None

def get_workspace_deletion_service() -> WorkspaceDeletionService:
    global _deletion_service
    if not _deletion_service:
        _deletion_service = WorkspaceDeletionService()
    return _deletion_service
