"""NotificationService: Manage user notification preferences.

Handles CRUD operations for notification preferences with Redis caching.
Supports email and in-app notification channels with category toggles.

Notification Categories:
- gallery_activity: Photo uploads, comments, selections
- client_interactions: Client messages, gallery views
- system_alerts: Security, billing, maintenance
- marketing: Product updates, promotions

Cache Strategy:
- 5 minute TTL for preferences (frequently read, rarely written)
- Cache invalidation on update
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CACHE_PREFIX = "notification_prefs"
CACHE_TTL_SECONDS = 300  # 5 minutes


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class NotificationChannelPrefs:
    """Preferences for a single notification channel."""

    gallery_activity: bool = True
    client_interactions: bool = True
    system_alerts: bool = True
    marketing: bool = False

    def to_dict(self) -> dict[str, bool]:
        return {
            "gallery_activity": self.gallery_activity,
            "client_interactions": self.client_interactions,
            "system_alerts": self.system_alerts,
            "marketing": self.marketing,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "NotificationChannelPrefs":
        return cls(
            gallery_activity=data.get("gallery_activity", True),
            client_interactions=data.get("client_interactions", True),
            system_alerts=data.get("system_alerts", True),
            marketing=data.get("marketing", False),
        )


@dataclass
class NotificationPreferences:
    """Complete notification preferences for a user."""

    email: NotificationChannelPrefs
    in_app: NotificationChannelPrefs

    def to_dict(self) -> dict[str, dict[str, bool]]:
        return {
            "email": self.email.to_dict(),
            "in_app": self.in_app.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "NotificationPreferences":
        if not data:
            # Return defaults
            return cls(
                email=NotificationChannelPrefs(),
                in_app=NotificationChannelPrefs(marketing=True),
            )
        return cls(
            email=NotificationChannelPrefs.from_dict(data.get("email", {})),
            in_app=NotificationChannelPrefs.from_dict(data.get("in_app", {})),
        )

    @classmethod
    def get_defaults(cls) -> "NotificationPreferences":
        """Get default notification preferences."""
        return cls(
            email=NotificationChannelPrefs(
                gallery_activity=True,
                client_interactions=True,
                system_alerts=True,
                marketing=False,
            ),
            in_app=NotificationChannelPrefs(
                gallery_activity=True,
                client_interactions=True,
                system_alerts=True,
                marketing=True,
            ),
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class NotificationService:
    """Service for managing user notification preferences."""

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
        """Generate cache key for user preferences."""
        return f"{CACHE_PREFIX}:{user_id}"

    async def _get_from_cache(self, user_id: str) -> NotificationPreferences | None:
        """Get preferences from cache if available."""
        try:
            redis = await self._get_redis()
            cached = await redis.get(self._cache_key(user_id))
            if cached:
                data = json.loads(cached)
                logger.debug(f"Cache hit for notification prefs: {user_id}")
                return NotificationPreferences.from_dict(data)
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
        return None

    async def _set_cache(self, user_id: str, prefs: NotificationPreferences) -> None:
        """Store preferences in cache."""
        try:
            redis = await self._get_redis()
            await redis.set(
                self._cache_key(user_id),
                json.dumps(prefs.to_dict()),
                ex=CACHE_TTL_SECONDS,
            )
            logger.debug(f"Cached notification prefs for: {user_id}")
        except Exception as e:
            logger.warning(f"Cache write error: {e}")

    async def _invalidate_cache(self, user_id: str) -> None:
        """Invalidate cached preferences."""
        try:
            redis = await self._get_redis()
            await redis.delete(self._cache_key(user_id))
            logger.debug(f"Invalidated cache for: {user_id}")
        except Exception as e:
            logger.warning(f"Cache invalidate error: {e}")

    async def get_preferences(self, user_id: str, workspace_id: Any = None) -> NotificationPreferences:
        """Get notification preferences for a user.

        Returns cached preferences if available, otherwise fetches from database.
        Falls back to workspace defaults if provided, then to global defaults.

        Args:
            user_id: The user's ID
            workspace_id: Optional workspace ID to fetch defaults from

        Returns:
            NotificationPreferences with current settings
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
                SELECT notification_preferences
                FROM users
                WHERE user_id = $1
                """,
                user_id,
            )

        if row and row["notification_preferences"]:
            prefs = NotificationPreferences.from_dict(row["notification_preferences"])
        else:
            # Fallback logic
            if workspace_id:
                try:
                    from app.services.workspace_notification_service import get_workspace_notification_service
                    ws_service = get_workspace_notification_service()
                    ws_settings = await ws_service.get_notification_settings(workspace_id)
                    
                    # Map workspace settings to NotificationPreferences
                    # Assuming workspace settings structure matches closely or we map explicitly
                    # WorkspaceNotificationSettings has default_email_preferences (dict), default_in_app_preferences (dict)
                    
                    email_prefs = NotificationChannelPrefs.from_dict(ws_settings.default_email_preferences or {})
                    in_app_prefs = NotificationChannelPrefs.from_dict(ws_settings.default_in_app_preferences or {})
                    
                    prefs = NotificationPreferences(email=email_prefs, in_app=in_app_prefs)
                except Exception as e:
                    logger.warning(f"Failed to fetch workspace notification defaults: {e}")
                    prefs = NotificationPreferences.get_defaults()
            else:
                prefs = NotificationPreferences.get_defaults()

        # Cache the result
        await self._set_cache(user_id, prefs)

        return prefs

    async def update_preferences(
        self,
        user_id: str,
        email_updates: dict[str, bool] | None = None,
        in_app_updates: dict[str, bool] | None = None,
    ) -> NotificationPreferences:
        """Update notification preferences for a user.

        Performs partial updates - only specified fields are changed.
        Invalidates cache after update.

        Args:
            user_id: The user's ID
            email_updates: Dict of email preference updates
            in_app_updates: Dict of in-app preference updates

        Returns:
            Updated NotificationPreferences
        """
        # Get current preferences
        current = await self.get_preferences(user_id)

        # Apply updates to email channel
        if email_updates:
            for key, value in email_updates.items():
                if hasattr(current.email, key):
                    setattr(current.email, key, value)

        # Apply updates to in_app channel
        if in_app_updates:
            for key, value in in_app_updates.items():
                if hasattr(current.in_app, key):
                    setattr(current.in_app, key, value)

        # Persist to database
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE users
                SET notification_preferences = $2::jsonb
                WHERE user_id = $1
                """,
                user_id,
                json.dumps(current.to_dict()),
            )

        # Invalidate cache
        await self._invalidate_cache(user_id)

        # Re-cache with fresh data
        await self._set_cache(user_id, current)

        logger.info(f"Updated notification preferences for user: {user_id}")
        return current

    async def reset_to_defaults(self, user_id: str) -> NotificationPreferences:
        """Reset notification preferences to defaults.

        Args:
            user_id: The user's ID

        Returns:
            Default NotificationPreferences
        """
        defaults = NotificationPreferences.get_defaults()

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE users
                SET notification_preferences = $2::jsonb
                WHERE user_id = $1
                """,
                user_id,
                json.dumps(defaults.to_dict()),
            )

        # Invalidate and re-cache
        await self._invalidate_cache(user_id)
        await self._set_cache(user_id, defaults)

        logger.info(f"Reset notification preferences to defaults for user: {user_id}")
        return defaults
