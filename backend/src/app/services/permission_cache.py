"""Redis-backed permission caching service.

Caches role/permission lookups with TTL and provides cache invalidation
on role updates.

Requirements: 2.3, 7.4
Property 8: Cache Invalidation on Role Update
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

# Cache TTL in seconds (5 minutes)
PERMISSION_CACHE_TTL = 300


def _user_permissions_key(user_id: uuid.UUID, workspace_id: uuid.UUID) -> str:
    """Redis key for user's permissions in a workspace."""
    return f"perms:{workspace_id}:{user_id}"


def _role_permissions_key(role_id: uuid.UUID) -> str:
    """Redis key for role's permissions."""
    return f"role_perms:{role_id}"


def _workspace_roles_key(workspace_id: uuid.UUID) -> str:
    """Redis key for tracking all roles in a workspace."""
    return f"workspace_roles:{workspace_id}"


class PermissionCacheService:
    """Caches and retrieves user/role permissions from Redis."""

    def __init__(self, ttl_seconds: int = PERMISSION_CACHE_TTL):
        self._ttl = ttl_seconds

    async def get_user_permissions(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> list[str] | None:
        """Get cached permissions for user in workspace.

        Returns None if not cached.
        """
        redis = await get_redis_client()
        key = _user_permissions_key(user_id, workspace_id)
        data = await redis.get(key)

        if data is None:
            return None

        return json.loads(data)

    async def set_user_permissions(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
        permissions: list[str],
    ) -> None:
        """Cache user permissions in workspace."""
        redis = await get_redis_client()
        key = _user_permissions_key(user_id, workspace_id)
        await redis.setex(key, self._ttl, json.dumps(permissions))

    async def invalidate_user_permissions(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> None:
        """Invalidate cached permissions for a user in workspace."""
        redis = await get_redis_client()
        key = _user_permissions_key(user_id, workspace_id)
        await redis.delete(key)
        logger.debug(
            "User permissions cache invalidated",
            extra={"user_id": str(user_id), "workspace_id": str(workspace_id)},
        )

    async def invalidate_workspace_permissions(
        self,
        workspace_id: uuid.UUID,
    ) -> int:
        """Invalidate all cached permissions for a workspace.

        Used when workspace-wide role changes occur.
        """
        redis = await get_redis_client()
        pattern = f"perms:{workspace_id}:*"

        # Find and delete all matching keys
        cursor = 0
        deleted = 0
        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            if keys:
                await redis.delete(*keys)
                deleted += len(keys)
            if cursor == 0:
                break

        logger.info(
            "Workspace permissions cache invalidated",
            extra={"workspace_id": str(workspace_id), "keys_deleted": deleted},
        )
        return deleted

    async def invalidate_role_members(
        self,
        role_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> int:
        """Invalidate cached permissions for all members with a specific role.

        Property 8: Cache Invalidation on Role Update
        """
        pool = await get_postgres_pool()

        # Get all users with this role
        rows = await pool.fetch(
            """
            SELECT DISTINCT wm.user_id
            FROM member_roles mr
            JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
            WHERE mr.role_id = $1
            """,
            role_id,
        )

        count = 0
        for row in rows:
            await self.invalidate_user_permissions(row["user_id"], workspace_id)
            count += 1

        logger.info(
            "Role members permissions cache invalidated",
            extra={"role_id": str(role_id), "workspace_id": str(workspace_id), "users_affected": count},
        )
        return count

    async def get_role_permissions(self, role_id: uuid.UUID) -> list[str] | None:
        """Get cached permissions for a role."""
        redis = await get_redis_client()
        key = _role_permissions_key(role_id)
        data = await redis.get(key)

        if data is None:
            return None

        return json.loads(data)

    async def set_role_permissions(
        self,
        role_id: uuid.UUID,
        permissions: list[str],
    ) -> None:
        """Cache role permissions."""
        redis = await get_redis_client()
        key = _role_permissions_key(role_id)
        await redis.setex(key, self._ttl, json.dumps(permissions))

    async def invalidate_role_permissions(self, role_id: uuid.UUID) -> None:
        """Invalidate cached role permissions."""
        redis = await get_redis_client()
        key = _role_permissions_key(role_id)
        await redis.delete(key)


# Global cache instance
_cache_service: PermissionCacheService | None = None


def get_permission_cache() -> PermissionCacheService:
    """Get or create global permission cache service."""
    global _cache_service
    if _cache_service is None:
        _cache_service = PermissionCacheService()
    return _cache_service
