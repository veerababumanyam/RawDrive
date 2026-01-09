"""Workspace AI Settings Service."""

from __future__ import annotations

import logging
import base64
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional

from app.db.postgres import get_postgres_pool
from app.api.workspace_settings_schemas import (
    WorkspaceAISettings,
    UpdateWorkspaceAISettingsRequest,
    AIProvider,
    AIStatus,
)
from app.services.encryption_service import EncryptionService
from app.services.gemini_settings_service import get_gemini_settings_service

logger = logging.getLogger(__name__)

class WorkspaceAISettingsError(Exception):
    """Base workspace AI settings error."""
    def __init__(self, message: str, code: str = "AI_SETTINGS_ERROR", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status

class WorkspaceAISettingsService:
    """Service for managing workspace AI settings."""

    async def get_ai_settings(self, workspace_id: UUID) -> WorkspaceAISettings:
        """Get AI settings for workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM workspace_ai_settings WHERE workspace_id = $1
                """,
                workspace_id
            )
            if not row:
                return await self._create_default_ai_settings(workspace_id)

            return self._map_ai_settings(row)

    async def update_ai_settings(
        self, workspace_id: UUID, request: UpdateWorkspaceAISettingsRequest
    ) -> WorkspaceAISettings:
        """Update AI settings."""
        pool = await get_postgres_pool()
        
        updates = []
        params = []
        param_idx = 1
        
        if request.provider:
            updates.append(f"provider = ${param_idx}")
            params.append(request.provider.value)
            param_idx += 1
            
        if request.selected_model:
            updates.append(f"selected_model = ${param_idx}")
            params.append(request.selected_model)
            param_idx += 1

        if request.selected_model_id:
            updates.append(f"selected_model_id = ${param_idx}")
            params.append(request.selected_model_id)
            param_idx += 1

        if request.api_key:
            # Validate API Key
            gemini_service = get_gemini_settings_service()
            validation_result = await gemini_service.validate_api_key(request.api_key)
            
            if not validation_result.is_valid:
                 raise WorkspaceAISettingsError(
                     message=validation_result.error_message or "Invalid API Key",
                     code=validation_result.error_code or "INVALID_KEY",
                     status=400
                 )

            # Encrypt API key
            encryption = EncryptionService()
            ciphertext, iv_b64 = encryption.encrypt_gallery_credential(request.api_key, workspace_id)
            encrypted_key = ciphertext
            iv = base64.b64decode(iv_b64)
            prefix = request.api_key[:4]
            suffix = request.api_key[-4:]
            
            updates.append(f"api_key_encrypted = ${param_idx}")
            params.append(encrypted_key)
            param_idx += 1
            
            updates.append(f"api_key_iv = ${param_idx}")
            params.append(iv)
            param_idx += 1
            
            updates.append(f"api_key_prefix = ${param_idx}")
            params.append(prefix)
            param_idx += 1
            
            updates.append(f"api_key_suffix = ${param_idx}")
            params.append(suffix)
            param_idx += 1
            
            updates.append(f"status = ${param_idx}")
            params.append('connected') 
            param_idx += 1

            updates.append(f"last_validated_at = ${param_idx}")
            params.append(datetime.now(timezone.utc))
            param_idx += 1

            updates.append(f"validation_error = ${param_idx}")
            params.append(None)
            param_idx += 1

        if not updates:
            return await self.get_ai_settings(workspace_id)

        updates.append("updated_at = NOW()")
        params.append(workspace_id) # Last param for WHERE

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE workspace_ai_settings
                SET {', '.join(updates)}
                WHERE workspace_id = ${param_idx}
                RETURNING *
                """,
                *params
            )
            return self._map_ai_settings(row)

    async def _create_default_ai_settings(self, workspace_id: UUID):
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_ai_settings (workspace_id, provider, status)
                VALUES ($1, 'gemini', 'not_configured')
                RETURNING *
                """,
                workspace_id
            )
            return self._map_ai_settings(row)

    def _map_ai_settings(self, row) -> WorkspaceAISettings:
        if not row:
            return None
        
        try:
            # Convert string values to enum types
            provider_str = row["provider"] if row.get("provider") else "gemini"
            status_str = row.get("status", "not_configured")
            
            # Convert to enum types (Pydantic will validate)
            provider_enum = AIProvider(provider_str) if isinstance(provider_str, str) else provider_str
            status_enum = AIStatus(status_str) if isinstance(status_str, str) else status_str
            
            return WorkspaceAISettings(
                workspace_id=row["workspace_id"],
                provider=provider_enum,
                selected_model=row.get("selected_model"),  # May not exist in DB
                selected_model_id=row.get("selected_model_id"),
                status=status_enum,
                credits_used=0 if row.get("credits_used") is None else row.get("credits_used"),
                last_validated_at=row.get("last_validated_at"),
                validation_error=row.get("validation_error"),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                has_api_key=bool(row.get("api_key_encrypted"))
            )
        except Exception as e:
            raise

_ai_settings_service = None

def get_workspace_ai_settings_service() -> WorkspaceAISettingsService:
    global _ai_settings_service
    if not _ai_settings_service:
        _ai_settings_service = WorkspaceAISettingsService()
    return _ai_settings_service
