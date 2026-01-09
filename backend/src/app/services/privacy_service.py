"""PrivacyService: Manage user privacy settings.

Handles user privacy preferences:
- analytics_enabled: Allow anonymous usage analytics collection
- public_profile_enabled: Make profile visible to other users

Cache Strategy:
- 10 minute TTL for privacy settings (infrequently changed)
- Cache invalidation on update
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CACHE_PREFIX = "privacy_settings"
CACHE_TTL_SECONDS = 600  # 10 minutes


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class PrivacySettings:
    """User privacy settings."""

    analytics_enabled: bool = True
    public_profile_enabled: bool = False

    def to_dict(self) -> dict[str, bool]:
        return {
            "analytics_enabled": self.analytics_enabled,
            "public_profile_enabled": self.public_profile_enabled,
        }

    @classmethod
    def from_dict(cls, data: dict | None) -> "PrivacySettings":
        if not data:
            return cls()
        return cls(
            analytics_enabled=data.get("analytics_enabled", True),
            public_profile_enabled=data.get("public_profile_enabled", False),
        )

    @classmethod
    def get_defaults(cls) -> "PrivacySettings":
        """Get default privacy settings."""
        return cls(
            analytics_enabled=True,
            public_profile_enabled=False,
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PrivacyService:
    """Service for managing user privacy settings."""

    def __init__(self) -> None:
        self._pool = None
        self._redis = None

    async def _get_pool(self):
        """Get database connection pool."""
        if self._pool is None:
            self._pool = await get_postgres_pool()
        return self._pool

    async def _get_redis(self):
        """Get Redis client."""
        if self._redis is None:
            self._redis = await get_redis_client()
        return self._redis

    def _cache_key(self, user_id: str) -> str:
        """Generate cache key for user privacy settings."""
        return f"{CACHE_PREFIX}:{user_id}"

    async def _get_from_cache(self, user_id: str) -> PrivacySettings | None:
        """Get settings from cache if available."""
        try:
            redis = await self._get_redis()
            cached = await redis.get(self._cache_key(user_id))
            if cached:
                data = json.loads(cached)
                logger.debug(f"Cache hit for privacy settings: {user_id}")
                return PrivacySettings.from_dict(data)
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
        return None

    async def _set_cache(self, user_id: str, settings: PrivacySettings) -> None:
        """Store settings in cache."""
        try:
            redis = await self._get_redis()
            await redis.set(
                self._cache_key(user_id),
                json.dumps(settings.to_dict()),
                ex=CACHE_TTL_SECONDS,
            )
            logger.debug(f"Cached privacy settings for: {user_id}")
        except Exception as e:
            logger.warning(f"Cache write error: {e}")

    async def _invalidate_cache(self, user_id: str) -> None:
        """Invalidate cached settings."""
        try:
            redis = await self._get_redis()
            await redis.delete(self._cache_key(user_id))
            logger.debug(f"Invalidated privacy cache for: {user_id}")
        except Exception as e:
            logger.warning(f"Cache invalidate error: {e}")

    async def get_settings(self, user_id: str, workspace_id: Any = None) -> PrivacySettings:
        """Get privacy settings for a user.

        Returns cached settings if available, otherwise fetches from database.
        Falls back to workspace defaults if provided, then to global defaults.

        Args:
            user_id: The user's ID
            workspace_id: Optional workspace ID to fetch defaults from

        Returns:
            PrivacySettings with current values
        """
        # Try cache first
        cached = await self._get_from_cache(user_id)
        if cached:
            return cached

        # Fetch from database
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT privacy_settings
                FROM users
                WHERE user_id = $1
                """,
                user_id,
            )

        if row and row["privacy_settings"]:
            settings = PrivacySettings.from_dict(row["privacy_settings"])
        else:
            # Fallback to workspace defaults
            if workspace_id:
                try:
                    from app.services.workspace_privacy_service import get_workspace_privacy_service
                    ws_service = get_workspace_privacy_service()
                    ws_settings = await ws_service.get_privacy_settings(workspace_id)
                    
                    settings = PrivacySettings(
                        analytics_enabled=ws_settings.analytics_enabled,
                        public_profile_enabled=ws_settings.public_profile_enabled
                    )
                except Exception as e:
                    logger.warning(f"Failed to fetch workspace privacy defaults: {e}")
                    settings = PrivacySettings.get_defaults()
            else:
                settings = PrivacySettings.get_defaults()

        # Cache the result
        await self._set_cache(user_id, settings)

        return settings

    async def update_settings(
        self,
        user_id: str,
        analytics_enabled: bool | None = None,
        public_profile_enabled: bool | None = None,
    ) -> PrivacySettings:
        """Update privacy settings for a user.

        Performs partial updates - only specified fields are changed.

        Args:
            user_id: The user's ID
            analytics_enabled: New analytics preference (optional)
            public_profile_enabled: New public profile preference (optional)

        Returns:
            Updated PrivacySettings
        """
        # Get current settings
        current = await self.get_settings(user_id)

        # Apply updates
        if analytics_enabled is not None:
            current.analytics_enabled = analytics_enabled
        if public_profile_enabled is not None:
            current.public_profile_enabled = public_profile_enabled

        # Persist to database
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE users
                SET privacy_settings = $2::jsonb
                WHERE user_id = $1
                """,
                user_id,
                json.dumps(current.to_dict()),
            )

        # Invalidate and re-cache
        await self._invalidate_cache(user_id)
        await self._set_cache(user_id, current)

        logger.info(f"Updated privacy settings for user: {user_id}")
        return current
