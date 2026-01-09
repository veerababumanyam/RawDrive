"""Workspace Notification Settings Service."""

from __future__ import annotations

import logging
import json
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.api.workspace_settings_schemas import (
    WorkspaceNotificationSettings,
    UpdateWorkspaceNotificationSettingsRequest,
)

logger = logging.getLogger(__name__)

class WorkspaceNotificationSettingsError(Exception):
    """Base workspace notification settings error."""
    def __init__(self, message: str, code: str = "NOTIFICATION_SETTINGS_ERROR", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status

class WorkspaceNotificationService:
    """Service for managing workspace notification settings."""
    
    async def get_notification_settings(self, workspace_id: UUID) -> WorkspaceNotificationSettings:
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM workspace_notification_settings WHERE workspace_id = $1",
                workspace_id
            )
            if not row:
                return await self._create_default_notification_settings(workspace_id)
            return self._map_notification_settings(row)
            
    async def update_notification_settings(
        self, workspace_id: UUID, request: UpdateWorkspaceNotificationSettingsRequest
    ) -> WorkspaceNotificationSettings:
        pool = await get_postgres_pool()
        updates = []
        params = []
        param_idx = 1
        
        if request.default_email_preferences is not None:
            updates.append(f"default_email_preferences = ${param_idx}::jsonb")
            params.append(json.dumps(request.default_email_preferences))
            param_idx += 1
            
        if request.default_in_app_preferences is not None:
            updates.append(f"default_in_app_preferences = ${param_idx}::jsonb")
            params.append(json.dumps(request.default_in_app_preferences))
            param_idx += 1
            
        if request.notification_channels is not None:
            updates.append(f"notification_channels = ${param_idx}::jsonb")
            params.append(json.dumps(request.notification_channels))
            param_idx += 1

        if not updates:
            return await self.get_notification_settings(workspace_id)
            
        updates.append("updated_at = NOW()")
        params.append(workspace_id)
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE workspace_notification_settings
                SET {', '.join(updates)}
                WHERE workspace_id = ${param_idx}
                RETURNING *
                """,
                *params
            )
            return self._map_notification_settings(row)

    async def _create_default_notification_settings(self, workspace_id: UUID):
         pool = await get_postgres_pool()
         async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_notification_settings (workspace_id, default_email_preferences)
                VALUES ($1, '{}'::jsonb)
                RETURNING *
                """,
                workspace_id
            )
            return self._map_notification_settings(row)

    def _map_notification_settings(self, row) -> WorkspaceNotificationSettings:
        if not row:
            return None
            
        def parse_json(v):
            if isinstance(v, str): return json.loads(v)
            return v

        return WorkspaceNotificationSettings(
            workspace_id=row["workspace_id"],
            default_email_preferences=parse_json(row["default_email_preferences"]),
            default_in_app_preferences=parse_json(row["default_in_app_preferences"]),
            notification_channels=parse_json(row["notification_channels"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

_notification_service = None

def get_workspace_notification_service() -> WorkspaceNotificationService:
    global _notification_service
    if not _notification_service:
        _notification_service = WorkspaceNotificationService()
    return _notification_service
