"""Workspace Security Settings Service."""

from __future__ import annotations

import logging
import json
from uuid import UUID
from typing import Optional, Dict, Any

from app.db.postgres import get_postgres_pool
from app.api.workspace_settings_schemas import (
    WorkspaceSecuritySettings,
    UpdateWorkspaceSecuritySettingsRequest,
)

logger = logging.getLogger(__name__)

class WorkspaceSecuritySettingsError(Exception):
    """Base workspace security settings error."""
    def __init__(self, message: str, code: str = "SECURITY_SETTINGS_ERROR", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status

class WorkspaceSecurityService:
    """Service for managing workspace security settings."""

    async def get_security_settings(self, workspace_id: UUID) -> WorkspaceSecuritySettings:
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM workspace_security_settings WHERE workspace_id = $1",
                workspace_id
            )
            if not row:
                return await self._create_default_security_settings(workspace_id)
            return self._map_security_settings(row)

    async def update_security_settings(
        self, workspace_id: UUID, request: UpdateWorkspaceSecuritySettingsRequest
    ) -> WorkspaceSecuritySettings:
        pool = await get_postgres_pool()
        updates = []
        params = []
        param_idx = 1
        
        # Map to actual schema columns
        if request.require_2fa is not None:
            updates.append(f"require_2fa = ${param_idx}")
            params.append(request.require_2fa)
            param_idx += 1
        
        if request.session_timeout_minutes is not None:
            updates.append(f"session_timeout_minutes = ${param_idx}")
            params.append(request.session_timeout_minutes)
            param_idx += 1
        
        # Map max_active_sessions to max_sessions_per_user (schema column name)
        if request.max_active_sessions is not None:
            updates.append(f"max_sessions_per_user = ${param_idx}")
            params.append(request.max_active_sessions)
            param_idx += 1
        
        # Map password_policy dict to individual columns
        if request.password_policy is not None:
            policy = request.password_policy
            if "min_length" in policy:
                updates.append(f"password_min_length = ${param_idx}")
                params.append(policy["min_length"])
                param_idx += 1
            if "require_uppercase" in policy:
                updates.append(f"password_require_uppercase = ${param_idx}")
                params.append(policy["require_uppercase"])
                param_idx += 1
            if "require_lowercase" in policy:
                updates.append(f"password_require_lowercase = ${param_idx}")
                params.append(policy["require_lowercase"])
                param_idx += 1
            if "require_numbers" in policy:
                updates.append(f"password_require_numbers = ${param_idx}")
                params.append(policy["require_numbers"])
                param_idx += 1
            if "require_special" in policy:
                updates.append(f"password_require_special = ${param_idx}")
                params.append(policy["require_special"])
                param_idx += 1
        
        if request.ip_whitelist is not None:
             updates.append(f"ip_whitelist = ${param_idx}::jsonb")
             params.append(json.dumps(request.ip_whitelist))
             param_idx += 1
        
        if not updates:
             return await self.get_security_settings(workspace_id)
             
        updates.append("updated_at = NOW()")
        params.append(workspace_id)
        
        async with pool.acquire() as conn:
             row = await conn.fetchrow(
                f"""
                UPDATE workspace_security_settings
                SET {', '.join(updates)}
                WHERE workspace_id = ${param_idx}
                RETURNING *
                """,
                *params
            )
             return self._map_security_settings(row)

    async def _create_default_security_settings(self, workspace_id: UUID):
         pool = await get_postgres_pool()
         async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_security_settings (workspace_id, require_2fa, session_timeout_minutes)
                VALUES ($1, FALSE, 1440)
                RETURNING *
                """,
                workspace_id
            )
            return self._map_security_settings(row)

    def _map_security_settings(self, row) -> WorkspaceSecuritySettings:
        if not row:
            return None
        
        # Build password_policy from individual columns (schema has individual columns, not JSONB)
        password_policy = None
        if any(key in row for key in ["password_min_length", "password_require_uppercase", "password_require_lowercase", "password_require_numbers", "password_require_special"]):
            password_policy = {
                "min_length": row.get("password_min_length", 8),
                "require_uppercase": row.get("password_require_uppercase", False),
                "require_lowercase": row.get("password_require_lowercase", False),
                "require_numbers": row.get("password_require_numbers", False),
                "require_special": row.get("password_require_special", False),
            }
        
        # ip_whitelist: check type
        ip_wl = row.get("ip_whitelist")
        if isinstance(ip_wl, str):
            try: ip_wl = json.loads(ip_wl)
            except: ip_wl = []
        elif ip_wl is None:
            ip_wl = []
        
        # Use max_sessions_per_user from schema (not max_active_sessions)
        max_active_sessions = row.get("max_sessions_per_user")
        
        return WorkspaceSecuritySettings(
            workspace_id=row["workspace_id"],
            require_2fa=row["require_2fa"],
            password_policy=password_policy,
            session_timeout_minutes=row["session_timeout_minutes"],
            max_active_sessions=max_active_sessions,
            ip_whitelist=ip_wl,
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

_security_service = None

def get_workspace_security_service() -> WorkspaceSecurityService:
    global _security_service
    if not _security_service:
        _security_service = WorkspaceSecurityService()
    return _security_service
