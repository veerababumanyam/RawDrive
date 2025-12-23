"""Face Detection Admin Settings Service.

This module provides CRUD operations for AI provider configurations
and face detection settings, with secure credential encryption.

Key features:
- Provider configuration management (Cloud Vision, Gemini)
- Encrypted credential storage using AES-256-GCM
- Provider health status tracking
- Application settings management

Requirements covered:
- 3.1: Admin can configure AI provider settings
- 3.2: Admin can enable/disable providers
- 3.3: Admin can set provider priority
- 3.4: Admin can configure rate limits
- 3.5: Admin can configure timeouts
- 3.7: Credentials stored encrypted in database
- 3.8: Admin can test provider connectivity
- 3.9: Admin can view provider health status
- 3.10: Admin can update provider credentials
"""

from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from app.api.face_schemas import ProviderHealthStatus
from app.services.face_exceptions import (
    FaceDetectionError,
    FaceGroupNotFoundError,
    InvalidConfigurationError,
    ProviderNotConfiguredError,
)
from app.api.face_schemas import FaceDetectionErrorCode

logger = logging.getLogger(__name__)


# =============================================================================
# TYPE DEFINITIONS
# =============================================================================


class ProviderConfig:
    """Configuration for an AI provider.
    
    Attributes:
        id: Unique identifier
        provider_name: Provider name (cloud_vision, gemini)
        credentials_encrypted: Encrypted credentials (bytes)
        config: Provider-specific configuration
        is_enabled: Whether provider is enabled
        priority: Selection priority (lower = higher priority)
        rate_limit_per_minute: Rate limit
        timeout_ms: Request timeout in milliseconds
        health_status: Current health status
        last_health_check: Last health check timestamp
    """
    
    def __init__(
        self,
        id: UUID,
        provider_name: str,
        credentials_encrypted: Optional[bytes] = None,
        config: Optional[dict[str, Any]] = None,
        is_enabled: bool = True,
        priority: int = 0,
        rate_limit_per_minute: int = 1800,
        timeout_ms: int = 30000,
        health_status: ProviderHealthStatus = ProviderHealthStatus.UNKNOWN,
        last_health_check: Optional[datetime] = None,
    ) -> None:
        self.id = id
        self.provider_name = provider_name
        self.credentials_encrypted = credentials_encrypted
        self.config = config or {}
        self.is_enabled = is_enabled
        self.priority = priority
        self.rate_limit_per_minute = rate_limit_per_minute
        self.timeout_ms = timeout_ms
        self.health_status = health_status
        self.last_health_check = last_health_check


# =============================================================================
# ADMIN SETTINGS SERVICE
# =============================================================================


class FaceAdminSettingsService:
    """Service for managing face detection admin settings.
    
    This service provides CRUD operations for:
    - AI provider configurations (Cloud Vision, Gemini)
    - Face detection application settings
    - Provider health status tracking
    
    Credentials are encrypted using AES-256-GCM before storage.
    
    Example:
        admin_service = FaceAdminSettingsService(db_pool, encryption_service)
        
        # Get all providers
        providers = await admin_service.get_providers()
        
        # Update provider credentials
        await admin_service.update_provider_credentials(
            "cloud_vision",
            {"client_email": "...", "private_key": "..."}
        )
    """

    def __init__(
        self, 
        db_pool: Any,
        encryption_key: Optional[bytes] = None,
    ) -> None:
        """Initialize the admin settings service.
        
        Args:
            db_pool: Database connection pool (asyncpg)
            encryption_key: 32-byte key for credential encryption.
                If None, uses ENCRYPTION_MASTER_KEY from environment.
        """
        self._db_pool = db_pool
        self._encryption_key = encryption_key or self._get_encryption_key()

    def _get_encryption_key(self) -> bytes:
        """Gets the encryption key from environment.
        
        Returns:
            32-byte encryption key
            
        Raises:
            InvalidConfigurationError: If key not set or invalid
        """
        key_hex = os.environ.get("ENCRYPTION_MASTER_KEY")
        
        if not key_hex:
            # Use a default key for development only
            logger.warning(
                "ENCRYPTION_MASTER_KEY not set, using development default. "
                "DO NOT use in production!"
            )
            key_hex = "0" * 64  # 32 bytes of zeros
        
        try:
            key = bytes.fromhex(key_hex)
            if len(key) != 32:
                raise InvalidConfigurationError(
                    setting="ENCRYPTION_MASTER_KEY",
                    reason="Key must be 64 hex characters (32 bytes)",
                )
            return key
        except ValueError as e:
            raise InvalidConfigurationError(
                setting="ENCRYPTION_MASTER_KEY",
                reason=f"Invalid hex format: {e}",
            )

    # =========================================================================
    # PROVIDER CONFIGURATION
    # =========================================================================

    async def get_providers(self) -> list[dict[str, Any]]:
        """Gets all configured AI providers.
        
        Returns:
            List of provider configurations (without decrypted credentials)
        """
        async with self._db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    id, provider_name, config, is_enabled, priority,
                    rate_limit_per_minute, timeout_ms, health_status,
                    last_health_check, created_at, updated_at
                FROM ai_provider_settings
                ORDER BY priority ASC
                """
            )
            
            return [
                {
                    "id": str(row["id"]),
                    "provider_name": row["provider_name"],
                    "config": row["config"] or {},
                    "is_enabled": row["is_enabled"],
                    "priority": row["priority"],
                    "rate_limit_per_minute": row["rate_limit_per_minute"],
                    "timeout_ms": row["timeout_ms"],
                    "health_status": row["health_status"],
                    "last_health_check": row["last_health_check"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
                for row in rows
            ]

    async def get_provider_config(
        self, 
        provider_name: str,
    ) -> Optional[dict[str, Any]]:
        """Gets configuration for a specific provider.
        
        Args:
            provider_name: Provider name (cloud_vision, gemini)
            
        Returns:
            Provider configuration with decrypted credentials, or None if not found
        """
        async with self._db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT 
                    id, provider_name, credentials_encrypted, config,
                    is_enabled, priority, rate_limit_per_minute, timeout_ms,
                    health_status, last_health_check
                FROM ai_provider_settings
                WHERE provider_name = $1
                """,
                provider_name,
            )
            
            if not row:
                return None
            
            result: dict[str, Any] = {
                "id": str(row["id"]),
                "provider_name": row["provider_name"],
                "config": row["config"] or {},
                "is_enabled": row["is_enabled"],
                "priority": row["priority"],
                "rate_limit_per_minute": row["rate_limit_per_minute"],
                "timeout_ms": row["timeout_ms"],
                "health_status": row["health_status"],
                "last_health_check": row["last_health_check"],
            }
            
            # Decrypt credentials if present
            if row["credentials_encrypted"]:
                try:
                    result["credentials_decrypted"] = self._decrypt_credentials(
                        row["credentials_encrypted"]
                    )
                except Exception as e:
                    logger.error(
                        "Failed to decrypt credentials",
                        extra={"provider": provider_name, "error": str(e)}
                    )
                    result["credentials_decrypted"] = None
            
            return result

    async def update_provider(
        self, 
        provider_name: str, 
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        """Updates provider configuration.
        
        Args:
            provider_name: Provider name to update
            updates: Dictionary of fields to update. Supported fields:
                - is_enabled: bool
                - priority: int
                - rate_limit_per_minute: int
                - timeout_ms: int
                - credentials: dict (will be encrypted)
                - config: dict
                
        Returns:
            Updated provider configuration
            
        Raises:
            ProviderNotConfiguredError: If provider not found
        """
        # Build update query dynamically based on provided fields
        set_clauses = ["updated_at = NOW()"]
        params: list[Any] = []
        param_idx = 1
        
        if "is_enabled" in updates:
            set_clauses.append(f"is_enabled = ${param_idx}")
            params.append(updates["is_enabled"])
            param_idx += 1
            
        if "priority" in updates:
            set_clauses.append(f"priority = ${param_idx}")
            params.append(updates["priority"])
            param_idx += 1
            
        if "rate_limit_per_minute" in updates:
            set_clauses.append(f"rate_limit_per_minute = ${param_idx}")
            params.append(updates["rate_limit_per_minute"])
            param_idx += 1
            
        if "timeout_ms" in updates:
            set_clauses.append(f"timeout_ms = ${param_idx}")
            params.append(updates["timeout_ms"])
            param_idx += 1
            
        if "credentials" in updates:
            # Encrypt credentials before storing
            encrypted = self._encrypt_credentials(updates["credentials"])
            set_clauses.append(f"credentials_encrypted = ${param_idx}")
            params.append(encrypted)
            param_idx += 1
            
        if "config" in updates:
            set_clauses.append(f"config = ${param_idx}")
            params.append(json.dumps(updates["config"]))
            param_idx += 1
        
        # Add provider_name as the last parameter
        params.append(provider_name)
        
        query = f"""
            UPDATE ai_provider_settings
            SET {', '.join(set_clauses)}
            WHERE provider_name = ${param_idx}
            RETURNING id, provider_name, config, is_enabled, priority,
                      rate_limit_per_minute, timeout_ms, health_status,
                      last_health_check, updated_at
        """
        
        async with self._db_pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)
            
            if not row:
                raise ProviderNotConfiguredError(provider_name)
            
            return {
                "id": str(row["id"]),
                "provider_name": row["provider_name"],
                "config": row["config"] or {},
                "is_enabled": row["is_enabled"],
                "priority": row["priority"],
                "rate_limit_per_minute": row["rate_limit_per_minute"],
                "timeout_ms": row["timeout_ms"],
                "health_status": row["health_status"],
                "last_health_check": row["last_health_check"],
                "updated_at": row["updated_at"],
            }

    async def update_provider_health(
        self, 
        provider_name: str, 
        health_status: str,
    ) -> None:
        """Updates provider health status.
        
        Args:
            provider_name: Provider name to update
            health_status: New health status (healthy, unhealthy, unknown)
        """
        async with self._db_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE ai_provider_settings
                SET health_status = $1, last_health_check = NOW(), updated_at = NOW()
                WHERE provider_name = $2
                """,
                health_status,
                provider_name,
            )
            
            logger.info(
                "Updated provider health status",
                extra={"provider": provider_name, "status": health_status}
            )

    async def create_provider(
        self, 
        provider_name: str, 
        config: Optional[dict[str, Any]] = None,
        credentials: Optional[dict[str, Any]] = None,
        priority: int = 0,
    ) -> dict[str, Any]:
        """Creates a new provider configuration.
        
        Args:
            provider_name: Provider name (cloud_vision, gemini)
            config: Provider-specific configuration
            credentials: Provider credentials (will be encrypted)
            priority: Selection priority (lower = higher priority)
            
        Returns:
            Created provider configuration
        """
        credentials_encrypted = None
        if credentials:
            credentials_encrypted = self._encrypt_credentials(credentials)
        
        async with self._db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO ai_provider_settings (
                    provider_name, credentials_encrypted, config, priority
                )
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (provider_name) DO UPDATE SET
                    credentials_encrypted = COALESCE(EXCLUDED.credentials_encrypted, ai_provider_settings.credentials_encrypted),
                    config = COALESCE(EXCLUDED.config, ai_provider_settings.config),
                    priority = EXCLUDED.priority,
                    updated_at = NOW()
                RETURNING id, provider_name, config, is_enabled, priority,
                          rate_limit_per_minute, timeout_ms, health_status,
                          last_health_check, created_at, updated_at
                """,
                provider_name,
                credentials_encrypted,
                json.dumps(config) if config else None,
                priority,
            )
            
            return {
                "id": str(row["id"]),
                "provider_name": row["provider_name"],
                "config": row["config"] or {},
                "is_enabled": row["is_enabled"],
                "priority": row["priority"],
                "rate_limit_per_minute": row["rate_limit_per_minute"],
                "timeout_ms": row["timeout_ms"],
                "health_status": row["health_status"],
                "last_health_check": row["last_health_check"],
            }

    # =========================================================================
    # APPLICATION SETTINGS
    # =========================================================================

    async def get_setting(self, key: str) -> Optional[str]:
        """Gets an application setting by key.
        
        Args:
            key: Setting key (e.g., "face.similarity_threshold")
            
        Returns:
            Setting value, or None if not found
        """
        async with self._db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT value FROM application_settings WHERE key = $1
                """,
                key,
            )
            
            return row["value"] if row else None

    async def set_setting(self, key: str, value: str, description: Optional[str] = None) -> None:
        """Sets an application setting.
        
        Args:
            key: Setting key
            value: Setting value
            description: Optional description of the setting
        """
        async with self._db_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO application_settings (key, value, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    description = COALESCE(EXCLUDED.description, application_settings.description),
                    updated_at = NOW()
                """,
                key,
                value,
                description,
            )
            
            logger.debug("Set application setting", extra={"key": key})

    async def get_settings(self, prefix: str) -> dict[str, str]:
        """Gets all settings with a given prefix.
        
        Args:
            prefix: Key prefix to filter by (e.g., "face.")
            
        Returns:
            Dictionary of key-value pairs
        """
        async with self._db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT key, value FROM application_settings
                WHERE key LIKE $1
                ORDER BY key
                """,
                f"{prefix}%",
            )
            
            return {row["key"]: row["value"] for row in rows}

    async def delete_setting(self, key: str) -> bool:
        """Deletes an application setting.
        
        Args:
            key: Setting key to delete
            
        Returns:
            True if setting was deleted, False if not found
        """
        async with self._db_pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM application_settings WHERE key = $1
                """,
                key,
            )
            
            return result == "DELETE 1"

    # =========================================================================
    # WORKSPACE SETTINGS
    # =========================================================================

    async def get_workspace_face_settings(
        self, 
        workspace_id: str,
    ) -> dict[str, Any]:
        """Gets face detection settings for a workspace.
        
        Args:
            workspace_id: Workspace ID
            
        Returns:
            Dictionary of workspace face detection settings
        """
        settings = await self.get_settings(f"workspace.{workspace_id}.")
        
        # Parse settings with defaults
        return {
            "enabled": settings.get(
                f"workspace.{workspace_id}.face_detection_enabled", "true"
            ).lower() == "true",
            "auto_detect_on_upload": settings.get(
                f"workspace.{workspace_id}.auto_detect_on_upload", "true"
            ).lower() == "true",
            "min_confidence_threshold": float(settings.get(
                f"workspace.{workspace_id}.min_confidence", "0.7"
            )),
            "auto_cluster_threshold": float(settings.get(
                f"workspace.{workspace_id}.auto_cluster_threshold", "0.8"
            )),
            "max_faces_per_photo": int(settings.get(
                f"workspace.{workspace_id}.max_faces_per_photo", "50"
            )),
        }

    async def update_workspace_face_settings(
        self, 
        workspace_id: str, 
        settings: dict[str, Any],
    ) -> dict[str, Any]:
        """Updates face detection settings for a workspace.
        
        Args:
            workspace_id: Workspace ID
            settings: Dictionary of settings to update
            
        Returns:
            Updated workspace settings
        """
        prefix = f"workspace.{workspace_id}"
        
        if "enabled" in settings:
            await self.set_setting(
                f"{prefix}.face_detection_enabled",
                str(settings["enabled"]).lower(),
            )
            
        if "auto_detect_on_upload" in settings:
            await self.set_setting(
                f"{prefix}.auto_detect_on_upload",
                str(settings["auto_detect_on_upload"]).lower(),
            )
            
        if "min_confidence_threshold" in settings:
            await self.set_setting(
                f"{prefix}.min_confidence",
                str(settings["min_confidence_threshold"]),
            )
            
        if "auto_cluster_threshold" in settings:
            await self.set_setting(
                f"{prefix}.auto_cluster_threshold",
                str(settings["auto_cluster_threshold"]),
            )
            
        if "max_faces_per_photo" in settings:
            await self.set_setting(
                f"{prefix}.max_faces_per_photo",
                str(settings["max_faces_per_photo"]),
            )
        
        return await self.get_workspace_face_settings(workspace_id)

    # =========================================================================
    # CREDENTIAL ENCRYPTION
    # =========================================================================

    def _encrypt_credentials(self, credentials: dict[str, Any]) -> bytes:
        """Encrypts credentials for database storage.
        
        Uses AES-256-GCM encryption with a random IV.
        Format: IV (12 bytes) + ciphertext + auth tag (16 bytes)
        
        Args:
            credentials: Credentials dictionary to encrypt
            
        Returns:
            Encrypted credentials as bytes
        """
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        
        # Serialize credentials to JSON
        plaintext = json.dumps(credentials).encode("utf-8")
        
        # Generate random IV (12 bytes for GCM)
        iv = os.urandom(12)
        
        # Encrypt with AES-256-GCM
        aesgcm = AESGCM(self._encryption_key)
        ciphertext = aesgcm.encrypt(iv, plaintext, None)
        
        # Return IV + ciphertext (includes auth tag)
        return iv + ciphertext

    def _decrypt_credentials(self, encrypted: bytes) -> dict[str, Any]:
        """Decrypts credentials from database storage.
        
        Args:
            encrypted: Encrypted credentials (IV + ciphertext + auth tag)
            
        Returns:
            Decrypted credentials dictionary
            
        Raises:
            InvalidConfigurationError: If decryption fails
        """
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        
        if len(encrypted) < 28:  # 12 (IV) + 16 (auth tag) minimum
            raise InvalidConfigurationError(
                setting="credentials",
                reason="Encrypted data too short",
            )
        
        # Extract IV and ciphertext
        iv = encrypted[:12]
        ciphertext = encrypted[12:]
        
        try:
            # Decrypt with AES-256-GCM
            aesgcm = AESGCM(self._encryption_key)
            plaintext = aesgcm.decrypt(iv, ciphertext, None)
            
            # Parse JSON
            return json.loads(plaintext.decode("utf-8"))
        except Exception as e:
            raise InvalidConfigurationError(
                setting="credentials",
                reason=f"Decryption failed: {e}",
            )

    def _is_encrypted(self, data: bytes) -> bool:
        """Checks if data appears to be encrypted.
        
        Simple heuristic: encrypted data should not be valid JSON.
        
        Args:
            data: Data to check
            
        Returns:
            True if data appears encrypted, False otherwise
        """
        try:
            json.loads(data.decode("utf-8"))
            return False  # Valid JSON = not encrypted
        except (json.JSONDecodeError, UnicodeDecodeError):
            return True  # Not valid JSON = likely encrypted


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_admin_settings_service: Optional[FaceAdminSettingsService] = None


async def get_face_admin_settings_service() -> FaceAdminSettingsService:
    """Get singleton admin settings service instance.
    
    Note: Requires database pool to be initialized first.
    """
    global _admin_settings_service
    if _admin_settings_service is None:
        from app.db.postgres import get_postgres_pool
        pool = await get_postgres_pool()
        _admin_settings_service = FaceAdminSettingsService(pool)
    return _admin_settings_service
