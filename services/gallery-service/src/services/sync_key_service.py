"""
Sync API Key Service - Desktop app authentication and API key management.

Handles:
- API key creation with scoped permissions
- Key validation and authentication
- Key revocation and lifecycle management
- Usage tracking and statistics
"""

from __future__ import annotations

import secrets
import hashlib
from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone, timedelta

from src.database import get_connection, fetchrow, fetch, execute
from src.cache.redis_client import redis_client
from src.config import settings
from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.schemas.sync_api_key import SyncKeyPermission

logger = get_logger(__name__)
metrics = get_metrics()

# API key prefix for easy identification
API_KEY_PREFIX = "rds_"
API_KEY_LENGTH = 32  # Bytes of randomness


# =============================================================================
# Exceptions
# =============================================================================


class SyncKeyError(Exception):
    """Base sync key error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class SyncKeyNotFoundError(SyncKeyError):
    """Sync API key not found."""

    def __init__(self, key_id: str = "") -> None:
        super().__init__(
            "API key not found",
            "SYNC_KEY_NOT_FOUND",
            404,
        )


class SyncKeyRevokedError(SyncKeyError):
    """Sync API key has been revoked."""

    def __init__(self) -> None:
        super().__init__(
            "This API key has been revoked",
            "SYNC_KEY_REVOKED",
            401,
        )


class SyncKeyExpiredError(SyncKeyError):
    """Sync API key has expired."""

    def __init__(self) -> None:
        super().__init__(
            "This API key has expired",
            "SYNC_KEY_EXPIRED",
            401,
        )


class SyncKeyInvalidError(SyncKeyError):
    """Sync API key is invalid."""

    def __init__(self) -> None:
        super().__init__(
            "Invalid API key",
            "SYNC_KEY_INVALID",
            401,
        )


class SyncKeyPermissionDeniedError(SyncKeyError):
    """Operation not permitted for this API key."""

    def __init__(self, required_permission: str) -> None:
        super().__init__(
            f"API key lacks required permission: {required_permission}",
            "SYNC_KEY_PERMISSION_DENIED",
            403,
        )


class SyncKeyGalleryScopeError(SyncKeyError):
    """API key does not have access to the requested gallery."""

    def __init__(self, gallery_id: str) -> None:
        super().__init__(
            f"API key does not have access to gallery: {gallery_id}",
            "SYNC_KEY_GALLERY_SCOPE",
            403,
        )


# =============================================================================
# Helper Functions
# =============================================================================


def generate_api_key() -> tuple[str, str]:
    """Generate a secure API key and its hash.

    Returns:
        Tuple of (full_key, key_hash)
    """
    random_bytes = secrets.token_bytes(API_KEY_LENGTH)
    key_hex = random_bytes.hex()
    full_key = f"{API_KEY_PREFIX}{key_hex}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, key_hash


def hash_api_key(api_key: str) -> str:
    """Hash an API key for comparison."""
    return hashlib.sha256(api_key.encode()).hexdigest()


def get_key_prefix(api_key: str) -> str:
    """Extract the prefix portion of an API key for identification."""
    # Return first 12 characters (prefix + first 8 of random)
    return api_key[:12] if len(api_key) >= 12 else api_key


# =============================================================================
# Sync Key Service
# =============================================================================


class SyncKeyService:
    """Service for sync API key operations."""

    async def create_key(
        self,
        workspace_id: str,
        user_id: str,
        name: str,
        scoped_gallery_ids: Optional[List[str]] = None,
        permissions: Optional[List[SyncKeyPermission]] = None,
        expires_in_days: Optional[int] = None,
    ) -> dict:
        """Create a new sync API key.

        Args:
            workspace_id: Workspace the key belongs to
            user_id: User creating the key
            name: Human-readable name for the key
            scoped_gallery_ids: List of gallery IDs this key can access (empty = all)
            permissions: List of permissions (default: read, write)
            expires_in_days: Days until expiration (None = never expires)

        Returns:
            Dictionary with key details including the full API key (shown only once)
        """
        full_key, key_hash = generate_api_key()
        key_prefix = get_key_prefix(full_key)

        # Default permissions
        if permissions is None:
            permissions = [SyncKeyPermission.READ, SyncKeyPermission.WRITE]

        # Convert permissions to strings for PostgreSQL
        permissions_list = [p.value if isinstance(p, SyncKeyPermission) else p for p in permissions]

        # Calculate expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        # Convert gallery IDs to UUIDs if provided
        gallery_uuids = []
        if scoped_gallery_ids:
            gallery_uuids = [UUID(gid) for gid in scoped_gallery_ids]

        with metrics.track_db_query("create_sync_key"):
            async with get_connection() as conn:
                result = await conn.fetchrow(
                    """
                    INSERT INTO sync_api_keys (
                        workspace_id, user_id, name, key_hash, key_prefix,
                        scoped_gallery_ids, permissions, expires_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING key_id, created_at
                    """,
                    UUID(workspace_id),
                    UUID(user_id),
                    name,
                    key_hash,
                    key_prefix,
                    gallery_uuids,
                    permissions_list,
                    expires_at,
                )

        logger.info(
            "Sync API key created",
            extra={
                "key_id": str(result["key_id"]),
                "workspace_id": workspace_id,
                "user_id": user_id,
                "key_prefix": key_prefix,
                "permissions": permissions_list,
                "scoped_galleries": len(gallery_uuids),
            },
        )

        return {
            "key_id": str(result["key_id"]),
            "workspace_id": workspace_id,
            "user_id": user_id,
            "name": name,
            "api_key": full_key,  # Only returned on creation!
            "key_prefix": key_prefix,
            "scoped_gallery_ids": [str(gid) for gid in gallery_uuids],
            "permissions": permissions_list,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "created_at": result["created_at"].isoformat(),
        }

    async def validate_key(
        self,
        api_key: str,
        required_permission: Optional[SyncKeyPermission] = None,
        gallery_id: Optional[str] = None,
    ) -> dict:
        """Validate an API key and return its metadata.

        Args:
            api_key: The full API key to validate
            required_permission: Optional permission to check
            gallery_id: Optional gallery ID to check scope

        Returns:
            Dictionary with key metadata if valid

        Raises:
            SyncKeyInvalidError: If key doesn't exist
            SyncKeyRevokedError: If key has been revoked
            SyncKeyExpiredError: If key has expired
            SyncKeyPermissionDeniedError: If key lacks required permission
            SyncKeyGalleryScopeError: If key doesn't have access to gallery
        """
        key_hash = hash_api_key(api_key)

        # Check cache first
        cache_key = f"sync_key:{key_hash[:16]}"
        cached = await redis_client.get_json(cache_key)
        if cached:
            metrics.cache_hit("sync_key")
            key_data = cached
        else:
            metrics.cache_miss("sync_key")

            with metrics.track_db_query("validate_sync_key"):
                async with get_connection(read_only=True) as conn:
                    row = await conn.fetchrow(
                        """
                        SELECT
                            key_id, workspace_id, user_id, name, key_prefix,
                            scoped_gallery_ids, permissions, expires_at,
                            revoked_at, created_at, updated_at
                        FROM sync_api_keys
                        WHERE key_hash = $1
                        """,
                        key_hash,
                    )

            if not row:
                raise SyncKeyInvalidError()

            key_data = {
                "key_id": str(row["key_id"]),
                "workspace_id": str(row["workspace_id"]),
                "user_id": str(row["user_id"]),
                "name": row["name"],
                "key_prefix": row["key_prefix"],
                "scoped_gallery_ids": [str(gid) for gid in (row["scoped_gallery_ids"] or [])],
                "permissions": row["permissions"] or [],
                "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
                "revoked_at": row["revoked_at"].isoformat() if row["revoked_at"] else None,
                "created_at": row["created_at"].isoformat(),
            }

            # Cache for 5 minutes (short TTL since keys can be revoked)
            await redis_client.set_json(cache_key, key_data, 300)

        # Check if revoked
        if key_data.get("revoked_at"):
            raise SyncKeyRevokedError()

        # Check if expired
        if key_data.get("expires_at"):
            expires_at = datetime.fromisoformat(key_data["expires_at"])
            if expires_at < datetime.now(timezone.utc):
                raise SyncKeyExpiredError()

        # Check permission if required
        if required_permission:
            perm_value = required_permission.value if isinstance(required_permission, SyncKeyPermission) else required_permission
            if perm_value not in key_data["permissions"]:
                raise SyncKeyPermissionDeniedError(perm_value)

        # Check gallery scope if required
        if gallery_id:
            scoped_ids = key_data["scoped_gallery_ids"]
            # Empty scoped_gallery_ids means access to all galleries in workspace
            if scoped_ids and gallery_id not in scoped_ids:
                raise SyncKeyGalleryScopeError(gallery_id)

        # Update last used (async, don't wait)
        # We do this in a fire-and-forget manner to not slow down validation
        # In production, this would be batched or sent to a queue
        await self._update_last_used(key_data["key_id"], api_key)

        return {
            "valid": True,
            "key_id": key_data["key_id"],
            "workspace_id": key_data["workspace_id"],
            "user_id": key_data["user_id"],
            "permissions": key_data["permissions"],
            "scoped_gallery_ids": key_data["scoped_gallery_ids"],
        }

    async def _update_last_used(self, key_id: str, api_key: str) -> None:
        """Update last used timestamp for an API key."""
        try:
            with metrics.track_db_query("update_sync_key_last_used"):
                await execute(
                    """
                    UPDATE sync_api_keys
                    SET last_used_at = NOW(), updated_at = NOW()
                    WHERE key_id = $1
                    """,
                    UUID(key_id),
                )
        except Exception as e:
            # Don't fail validation if usage tracking fails
            logger.warning(f"Failed to update last_used_at for key {key_id}: {e}")

    async def list_keys(
        self,
        workspace_id: str,
        user_id: Optional[str] = None,
        include_revoked: bool = False,
    ) -> List[dict]:
        """List all API keys for a workspace.

        Args:
            workspace_id: Workspace to list keys for
            user_id: Optional filter by user
            include_revoked: Whether to include revoked keys

        Returns:
            List of key metadata (without full key values)
        """
        conditions = ["workspace_id = $1"]
        params: List = [UUID(workspace_id)]
        param_idx = 2

        if user_id:
            conditions.append(f"user_id = ${param_idx}")
            params.append(UUID(user_id))
            param_idx += 1

        if not include_revoked:
            conditions.append("revoked_at IS NULL")

        where_clause = " AND ".join(conditions)

        with metrics.track_db_query("list_sync_keys"):
            async with get_connection(read_only=True) as conn:
                rows = await conn.fetch(
                    f"""
                    SELECT
                        key_id, workspace_id, user_id, name, key_prefix,
                        scoped_gallery_ids, permissions, last_used_at, last_used_ip,
                        expires_at, revoked_at, revoked_by, created_at, updated_at
                    FROM sync_api_keys
                    WHERE {where_clause}
                    ORDER BY created_at DESC
                    """,
                    *params,
                )

        keys = []
        now = datetime.now(timezone.utc)
        for row in rows:
            is_active = (
                row["revoked_at"] is None
                and (row["expires_at"] is None or row["expires_at"] > now)
            )
            keys.append({
                "key_id": str(row["key_id"]),
                "workspace_id": str(row["workspace_id"]),
                "user_id": str(row["user_id"]),
                "name": row["name"],
                "key_prefix": row["key_prefix"],
                "scoped_gallery_ids": [str(gid) for gid in (row["scoped_gallery_ids"] or [])],
                "permissions": row["permissions"] or [],
                "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
                "last_used_ip": row["last_used_ip"],
                "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
                "revoked_at": row["revoked_at"].isoformat() if row["revoked_at"] else None,
                "revoked_by": str(row["revoked_by"]) if row["revoked_by"] else None,
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "is_active": is_active,
            })

        return keys

    async def get_key(self, workspace_id: str, key_id: str) -> dict:
        """Get a single API key by ID.

        Args:
            workspace_id: Workspace the key belongs to
            key_id: Key ID to retrieve

        Returns:
            Key metadata

        Raises:
            SyncKeyNotFoundError: If key doesn't exist
        """
        with metrics.track_db_query("get_sync_key"):
            async with get_connection(read_only=True) as conn:
                row = await conn.fetchrow(
                    """
                    SELECT
                        key_id, workspace_id, user_id, name, key_prefix,
                        scoped_gallery_ids, permissions, last_used_at, last_used_ip,
                        expires_at, revoked_at, revoked_by, created_at, updated_at
                    FROM sync_api_keys
                    WHERE workspace_id = $1 AND key_id = $2
                    """,
                    UUID(workspace_id),
                    UUID(key_id),
                )

        if not row:
            raise SyncKeyNotFoundError(key_id)

        now = datetime.now(timezone.utc)
        is_active = (
            row["revoked_at"] is None
            and (row["expires_at"] is None or row["expires_at"] > now)
        )

        return {
            "key_id": str(row["key_id"]),
            "workspace_id": str(row["workspace_id"]),
            "user_id": str(row["user_id"]),
            "name": row["name"],
            "key_prefix": row["key_prefix"],
            "scoped_gallery_ids": [str(gid) for gid in (row["scoped_gallery_ids"] or [])],
            "permissions": row["permissions"] or [],
            "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
            "last_used_ip": row["last_used_ip"],
            "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
            "revoked_at": row["revoked_at"].isoformat() if row["revoked_at"] else None,
            "revoked_by": str(row["revoked_by"]) if row["revoked_by"] else None,
            "created_at": row["created_at"].isoformat(),
            "updated_at": row["updated_at"].isoformat(),
            "is_active": is_active,
        }

    async def update_key(
        self,
        workspace_id: str,
        key_id: str,
        name: Optional[str] = None,
        scoped_gallery_ids: Optional[List[str]] = None,
        permissions: Optional[List[SyncKeyPermission]] = None,
    ) -> dict:
        """Update an API key's metadata.

        Args:
            workspace_id: Workspace the key belongs to
            key_id: Key ID to update
            name: New name (optional)
            scoped_gallery_ids: New gallery scope (optional)
            permissions: New permissions (optional)

        Returns:
            Updated key metadata

        Raises:
            SyncKeyNotFoundError: If key doesn't exist
        """
        # Build dynamic update query
        updates = []
        params: List = []
        param_idx = 1

        if name is not None:
            updates.append(f"name = ${param_idx}")
            params.append(name)
            param_idx += 1

        if scoped_gallery_ids is not None:
            updates.append(f"scoped_gallery_ids = ${param_idx}")
            params.append([UUID(gid) for gid in scoped_gallery_ids])
            param_idx += 1

        if permissions is not None:
            updates.append(f"permissions = ${param_idx}")
            params.append([p.value if isinstance(p, SyncKeyPermission) else p for p in permissions])
            param_idx += 1

        if not updates:
            # Nothing to update, just return current state
            return await self.get_key(workspace_id, key_id)

        updates.append("updated_at = NOW()")
        params.extend([UUID(workspace_id), UUID(key_id)])

        with metrics.track_db_query("update_sync_key"):
            async with get_connection() as conn:
                result = await conn.execute(
                    f"""
                    UPDATE sync_api_keys
                    SET {', '.join(updates)}
                    WHERE workspace_id = ${param_idx} AND key_id = ${param_idx + 1}
                    """,
                    *params,
                )

        if result == "UPDATE 0":
            raise SyncKeyNotFoundError(key_id)

        # Invalidate cache
        await self._invalidate_key_cache(key_id)

        logger.info(
            "Sync API key updated",
            extra={
                "key_id": key_id,
                "workspace_id": workspace_id,
                "updates": list(updates),
            },
        )

        return await self.get_key(workspace_id, key_id)

    async def revoke_key(
        self,
        workspace_id: str,
        key_id: str,
        revoked_by_user_id: str,
    ) -> dict:
        """Revoke an API key.

        Args:
            workspace_id: Workspace the key belongs to
            key_id: Key ID to revoke
            revoked_by_user_id: User performing the revocation

        Returns:
            Updated key metadata

        Raises:
            SyncKeyNotFoundError: If key doesn't exist
        """
        with metrics.track_db_query("revoke_sync_key"):
            async with get_connection() as conn:
                result = await conn.execute(
                    """
                    UPDATE sync_api_keys
                    SET revoked_at = NOW(), revoked_by = $3, updated_at = NOW()
                    WHERE workspace_id = $1 AND key_id = $2 AND revoked_at IS NULL
                    """,
                    UUID(workspace_id),
                    UUID(key_id),
                    UUID(revoked_by_user_id),
                )

        if result == "UPDATE 0":
            # Check if key exists but was already revoked
            key = await self.get_key(workspace_id, key_id)
            if key["revoked_at"]:
                # Already revoked, just return current state
                return key
            raise SyncKeyNotFoundError(key_id)

        # Invalidate cache
        await self._invalidate_key_cache(key_id)

        logger.info(
            "Sync API key revoked",
            extra={
                "key_id": key_id,
                "workspace_id": workspace_id,
                "revoked_by": revoked_by_user_id,
            },
        )

        return await self.get_key(workspace_id, key_id)

    async def _invalidate_key_cache(self, key_id: str) -> None:
        """Invalidate cached key data.

        Note: We can't easily invalidate by key_hash since we don't have the full key.
        The cache will expire naturally (5 min TTL) or we could scan keys by pattern.
        For now, we'll rely on short TTL for revocation to take effect.
        """
        # In a production system, you might:
        # 1. Store key_id -> cache_key mapping
        # 2. Use pub/sub to broadcast invalidation
        # 3. Use shorter TTL for sensitive operations
        pass


# =============================================================================
# Service Singleton
# =============================================================================

_sync_key_service: Optional[SyncKeyService] = None


def get_sync_key_service() -> SyncKeyService:
    """Get singleton sync key service instance."""
    global _sync_key_service
    if _sync_key_service is None:
        _sync_key_service = SyncKeyService()
    return _sync_key_service
