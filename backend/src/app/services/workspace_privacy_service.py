"""Workspace Privacy Settings Service."""

from __future__ import annotations

import logging
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.api.workspace_settings_schemas import (
    WorkspacePrivacySettings,
    UpdateWorkspacePrivacySettingsRequest,
)

logger = logging.getLogger(__name__)

class WorkspacePrivacySettingsError(Exception):
    """Base workspace privacy settings error."""
    def __init__(self, message: str, code: str = "PRIVACY_SETTINGS_ERROR", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status

class WorkspacePrivacyService:
    """Service for managing workspace privacy settings."""

    async def get_privacy_settings(self, workspace_id: UUID) -> WorkspacePrivacySettings:
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM workspace_privacy_settings WHERE workspace_id = $1",
                workspace_id
            )
            if not row:
                return await self._create_default_privacy_settings(workspace_id)
            return self._map_privacy_settings(row)
            
    async def update_privacy_settings(
        self, workspace_id: UUID, request: UpdateWorkspacePrivacySettingsRequest
    ) -> WorkspacePrivacySettings:
        pool = await get_postgres_pool()
        updates = []
        params = []
        param_idx = 1
        
        fields = {
            "analytics_enabled": request.analytics_enabled,
            "public_profile_enabled": request.public_profile_enabled,
            "data_retention_days": request.data_retention_days,
            "gdpr_compliance_mode": request.gdpr_compliance_mode,
            "search_engine_indexing_enabled": request.search_engine_indexing_enabled
        }
        
        for k, v in fields.items():
            if v is not None:
                updates.append(f"{k} = ${param_idx}")
                params.append(v)
                param_idx += 1
        
        if not updates:
            return await self.get_privacy_settings(workspace_id)
            
        updates.append("updated_at = NOW()")
        params.append(workspace_id)
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE workspace_privacy_settings
                SET {', '.join(updates)}
                WHERE workspace_id = ${param_idx}
                RETURNING *
                """,
                *params
            )
            return self._map_privacy_settings(row)

    async def _create_default_privacy_settings(self, workspace_id: UUID):
         pool = await get_postgres_pool()
         async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_privacy_settings (workspace_id, analytics_enabled)
                VALUES ($1, TRUE)
                RETURNING *
                """,
                workspace_id
            )
            return self._map_privacy_settings(row)

    def _map_privacy_settings(self, row) -> WorkspacePrivacySettings:
        if not row:
            return None
            
        return WorkspacePrivacySettings(
            workspace_id=row["workspace_id"],
            analytics_enabled=row["analytics_enabled"],
            public_profile_enabled=row.get("public_profile_enabled", True),
            data_retention_days=row["data_retention_days"],
            gdpr_compliance_mode=row.get("gdpr_compliance_mode", False),
            search_engine_indexing_enabled=row.get("search_engine_indexing_enabled", False),
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

_privacy_service = None

def get_workspace_privacy_service() -> WorkspacePrivacyService:
    global _privacy_service
    if not _privacy_service:
        _privacy_service = WorkspacePrivacyService()
    return _privacy_service
