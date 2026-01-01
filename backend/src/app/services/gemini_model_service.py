"""GeminiModelService: Admin management of Gemini model catalogue.

Implements CRUD operations for the Gemini models table with:
- User migration when models are deactivated
- Validation constraints per FR-021, FR-022
- Drag-and-drop reordering support

Feature: 003-user-gemini-settings
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

# Cache key for active models list (shared with gemini_settings_service)
GEMINI_MODELS_CACHE_KEY = "gemini:models:active"


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class GeminiModelError(Exception):
    """Base Gemini model error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class GeminiModelNotFoundError(GeminiModelError):
    """Model not found."""

    def __init__(self, model_id: UUID) -> None:
        super().__init__(
            f"Model {model_id} not found",
            "MODEL_NOT_FOUND",
            404,
        )


class CannotDeleteDefaultModelError(GeminiModelError):
    """Cannot delete the default model."""

    def __init__(self) -> None:
        super().__init__(
            "Cannot delete the default model. Set another model as default first.",
            "CANNOT_DELETE_DEFAULT",
            400,
        )


class CannotDeactivateDefaultModelError(GeminiModelError):
    """Cannot deactivate the default model."""

    def __init__(self) -> None:
        super().__init__(
            "Cannot deactivate the default model. Set another model as default first.",
            "CANNOT_DEACTIVATE_DEFAULT",
            400,
        )


class CannotDeactivateLastModelError(GeminiModelError):
    """Cannot deactivate the last active model."""

    def __init__(self) -> None:
        super().__init__(
            "Cannot deactivate the last active model. At least one model must remain active.",
            "CANNOT_DEACTIVATE_LAST",
            400,
        )


class DuplicateModelIdentifierError(GeminiModelError):
    """Model identifier already exists."""

    def __init__(self, identifier: str) -> None:
        super().__init__(
            f"Model identifier '{identifier}' already exists",
            "DUPLICATE_IDENTIFIER",
            400,
        )


# ---------------------------------------------------------------------------
# Gemini Model Service
# ---------------------------------------------------------------------------


class GeminiModelService:
    """Service for admin management of Gemini model catalogue."""

    async def _invalidate_models_cache(self) -> None:
        """Invalidate the cached active models list.

        Called after any operation that modifies models.
        """
        try:
            redis = await get_redis_client()
            await redis.delete(GEMINI_MODELS_CACHE_KEY)
            logger.debug("Gemini models cache invalidated")
        except Exception as e:
            # Log but don't fail - cache will expire naturally
            logger.warning(f"Failed to invalidate models cache: {e}")

    async def list_all_models(self, include_inactive: bool = True) -> list[dict]:
        """List all models (including inactive for admin view).

        Args:
            include_inactive: Whether to include inactive models

        Returns:
            List of models sorted by is_default DESC, sort_order ASC
        """
        pool = await get_postgres_pool()

        where_clause = "" if include_inactive else "WHERE is_active = TRUE"

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT
                    model_id,
                    identifier,
                    display_name,
                    description,
                    is_default,
                    is_active,
                    sort_order,
                    created_at,
                    updated_at
                FROM gemini_models
                {where_clause}
                ORDER BY is_default DESC, sort_order ASC, display_name ASC
                """
            )

            # Get user counts for each model
            user_counts = await conn.fetch(
                """
                SELECT selected_model_id, COUNT(*) as user_count
                FROM user_gemini_settings
                WHERE selected_model_id IS NOT NULL
                GROUP BY selected_model_id
                """
            )
            counts_map = {r["selected_model_id"]: r["user_count"] for r in user_counts}

            return [
                {
                    "model_id": row["model_id"],
                    "identifier": row["identifier"],
                    "display_name": row["display_name"],
                    "description": row["description"],
                    "is_default": row["is_default"],
                    "is_active": row["is_active"],
                    "sort_order": row["sort_order"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "user_count": counts_map.get(row["model_id"], 0),
                }
                for row in rows
            ]

    async def get_model(self, model_id: UUID) -> dict:
        """Get a specific model by ID.

        Args:
            model_id: Model UUID

        Returns:
            Model dict

        Raises:
            GeminiModelNotFoundError: If model not found
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    model_id,
                    identifier,
                    display_name,
                    description,
                    is_default,
                    is_active,
                    sort_order,
                    created_at,
                    updated_at
                FROM gemini_models
                WHERE model_id = $1
                """,
                model_id,
            )

            if not row:
                raise GeminiModelNotFoundError(model_id)

            # Get user count
            user_count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM user_gemini_settings
                WHERE selected_model_id = $1
                """,
                model_id,
            )

            return {
                "model_id": row["model_id"],
                "identifier": row["identifier"],
                "display_name": row["display_name"],
                "description": row["description"],
                "is_default": row["is_default"],
                "is_active": row["is_active"],
                "sort_order": row["sort_order"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "user_count": user_count or 0,
            }

    async def create_model(
        self,
        identifier: str,
        display_name: str,
        description: Optional[str] = None,
        sort_order: Optional[int] = None,
        is_active: bool = True,
        is_default: bool = False,
    ) -> dict:
        """Create a new model in the catalogue.

        Args:
            identifier: Gemini model identifier (e.g., "gemini-2.0-flash")
            display_name: Human-readable name
            description: Optional description
            sort_order: Optional display order (auto-assigned if not provided)
            is_active: Whether model is active (default True)
            is_default: Whether this is the default model

        Returns:
            Created model dict

        Raises:
            DuplicateModelIdentifierError: If identifier already exists
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Check for duplicate identifier
                existing = await conn.fetchval(
                    "SELECT 1 FROM gemini_models WHERE identifier = $1",
                    identifier,
                )
                if existing:
                    raise DuplicateModelIdentifierError(identifier)

                # Auto-assign sort_order if not provided
                if sort_order is None:
                    max_order = await conn.fetchval(
                        "SELECT COALESCE(MAX(sort_order), 0) FROM gemini_models"
                    )
                    sort_order = max_order + 1

                # If setting as default, unset any existing default
                if is_default:
                    await conn.execute(
                        "UPDATE gemini_models SET is_default = FALSE WHERE is_default = TRUE"
                    )

                # Insert new model
                model_id = await conn.fetchval(
                    """
                    INSERT INTO gemini_models (
                        identifier, display_name, description,
                        is_default, is_active, sort_order, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING model_id
                    """,
                    identifier,
                    display_name,
                    description,
                    is_default,
                    is_active,
                    sort_order,
                    now,
                    now,
                )

        # Invalidate cache after creating model
        await self._invalidate_models_cache()

        return await self.get_model(model_id)

    async def update_model(
        self,
        model_id: UUID,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
        sort_order: Optional[int] = None,
        is_active: Optional[bool] = None,
        is_default: Optional[bool] = None,
    ) -> dict:
        """Update an existing model.

        Args:
            model_id: Model UUID
            display_name: New display name
            description: New description
            sort_order: New sort order
            is_active: New active status
            is_default: New default status

        Returns:
            Updated model dict

        Raises:
            GeminiModelNotFoundError: If model not found
            CannotDeactivateDefaultModelError: If trying to deactivate default model
            CannotDeactivateLastModelError: If trying to deactivate last active model
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Get current model state
                current = await conn.fetchrow(
                    "SELECT model_id, is_default, is_active FROM gemini_models WHERE model_id = $1",
                    model_id,
                )
                if not current:
                    raise GeminiModelNotFoundError(model_id)

                # Validation: cannot deactivate default model
                if is_active is False and current["is_default"]:
                    raise CannotDeactivateDefaultModelError()

                # Validation: cannot deactivate last active model
                if is_active is False:
                    active_count = await conn.fetchval(
                        "SELECT COUNT(*) FROM gemini_models WHERE is_active = TRUE"
                    )
                    if active_count == 1 and current["is_active"]:
                        raise CannotDeactivateLastModelError()

                # Build update query dynamically
                updates = ["updated_at = $2"]
                params: list = [model_id, now]
                param_idx = 3

                if display_name is not None:
                    updates.append(f"display_name = ${param_idx}")
                    params.append(display_name)
                    param_idx += 1

                if description is not None:
                    updates.append(f"description = ${param_idx}")
                    params.append(description)
                    param_idx += 1

                if sort_order is not None:
                    updates.append(f"sort_order = ${param_idx}")
                    params.append(sort_order)
                    param_idx += 1

                if is_active is not None:
                    updates.append(f"is_active = ${param_idx}")
                    params.append(is_active)
                    param_idx += 1

                    # Migrate users if deactivating
                    if is_active is False:
                        await self._migrate_users_to_default(conn, model_id)

                if is_default is not None:
                    if is_default:
                        # Unset existing default
                        await conn.execute(
                            "UPDATE gemini_models SET is_default = FALSE WHERE is_default = TRUE"
                        )
                    updates.append(f"is_default = ${param_idx}")
                    params.append(is_default)
                    param_idx += 1

                await conn.execute(
                    f"""
                    UPDATE gemini_models
                    SET {', '.join(updates)}
                    WHERE model_id = $1
                    """,
                    *params,
                )

        # Invalidate cache after updating model
        await self._invalidate_models_cache()

        return await self.get_model(model_id)

    async def delete_model(self, model_id: UUID) -> None:
        """Delete a model from the catalogue.

        Args:
            model_id: Model UUID

        Raises:
            GeminiModelNotFoundError: If model not found
            CannotDeleteDefaultModelError: If trying to delete default model
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Get current model state
                current = await conn.fetchrow(
                    "SELECT model_id, is_default FROM gemini_models WHERE model_id = $1",
                    model_id,
                )
                if not current:
                    raise GeminiModelNotFoundError(model_id)

                # Validation: cannot delete default model
                if current["is_default"]:
                    raise CannotDeleteDefaultModelError()

                # Migrate users before deletion
                await self._migrate_users_to_default(conn, model_id)

                # Delete the model
                await conn.execute(
                    "DELETE FROM gemini_models WHERE model_id = $1",
                    model_id,
                )

        # Invalidate cache after deleting model
        await self._invalidate_models_cache()

    async def reorder_models(self, model_ids: list[UUID]) -> list[dict]:
        """Reorder models by updating sort_order based on list position.

        Args:
            model_ids: List of model IDs in new order

        Returns:
            Updated list of all models
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            async with conn.transaction():
                for idx, model_id in enumerate(model_ids):
                    await conn.execute(
                        """
                        UPDATE gemini_models
                        SET sort_order = $2, updated_at = $3
                        WHERE model_id = $1
                        """,
                        model_id,
                        idx,
                        now,
                    )

        # Invalidate cache after reordering models
        await self._invalidate_models_cache()

        return await self.list_all_models()

    async def set_default_model(self, model_id: UUID) -> dict:
        """Set a model as the platform default.

        Args:
            model_id: Model UUID to set as default

        Returns:
            Updated model dict

        Raises:
            GeminiModelNotFoundError: If model not found
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Verify model exists and is active
                exists = await conn.fetchval(
                    "SELECT 1 FROM gemini_models WHERE model_id = $1 AND is_active = TRUE",
                    model_id,
                )
                if not exists:
                    raise GeminiModelNotFoundError(model_id)

                # Unset existing default
                await conn.execute(
                    "UPDATE gemini_models SET is_default = FALSE, updated_at = $1 WHERE is_default = TRUE",
                    now,
                )

                # Set new default
                await conn.execute(
                    "UPDATE gemini_models SET is_default = TRUE, updated_at = $1 WHERE model_id = $2",
                    now,
                    model_id,
                )

        # Invalidate cache after setting default model
        await self._invalidate_models_cache()

        return await self.get_model(model_id)

    async def _migrate_users_to_default(self, conn, model_id: UUID) -> int:
        """Migrate users from a model to the default model.

        Called when a model is deactivated or deleted.

        Args:
            conn: Database connection
            model_id: Model ID to migrate users from

        Returns:
            Number of users migrated
        """
        # Get the default model
        default_model_id = await conn.fetchval(
            "SELECT model_id FROM gemini_models WHERE is_default = TRUE AND is_active = TRUE"
        )

        # Update all users with this model to use NULL (platform default)
        result = await conn.execute(
            """
            UPDATE user_gemini_settings
            SET selected_model_id = NULL, updated_at = NOW()
            WHERE selected_model_id = $1
            """,
            model_id,
        )

        # Parse count from result (format: "UPDATE N")
        count = int(result.split()[-1]) if result else 0

        if count > 0:
            logger.info(
                f"Migrated {count} users from model {model_id} to default (NULL)"
            )

        return count

    async def get_admin_stats(self, workspace_id: Optional[UUID] = None) -> dict:
        """Get aggregate statistics for admin dashboard.

        Args:
            workspace_id: Optional workspace filter

        Returns:
            Dict with:
            - total_users: Total users in system/workspace
            - users_with_key: Users who have configured an API key
            - users_connected: Users with status 'connected'
            - users_failed: Users with status 'validation_failed'
            - model_distribution: List of {model_identifier, display_name, user_count}
            - recent_ai_calls: AI calls in last 24 hours
            - ai_success_rate: Success rate percentage
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # Base user query with optional workspace filter
            if workspace_id:
                # Get user stats for specific workspace
                user_stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(DISTINCT u.user_id) as total_users,
                        COUNT(DISTINCT ugs.user_id) FILTER (WHERE ugs.api_key_encrypted IS NOT NULL) as users_with_key,
                        COUNT(DISTINCT ugs.user_id) FILTER (WHERE ugs.status = 'connected') as users_connected,
                        COUNT(DISTINCT ugs.user_id) FILTER (WHERE ugs.status = 'validation_failed') as users_failed
                    FROM workspace_memberships wm
                    JOIN users u ON u.user_id = wm.user_id
                    LEFT JOIN user_gemini_settings ugs ON ugs.user_id = u.user_id
                    WHERE wm.workspace_id = $1
                    """,
                    workspace_id,
                )

                # Get model distribution for workspace
                model_dist = await conn.fetch(
                    """
                    SELECT
                        gm.identifier as model_identifier,
                        gm.display_name,
                        COUNT(ugs.user_id) as user_count
                    FROM gemini_models gm
                    LEFT JOIN user_gemini_settings ugs ON ugs.selected_model_id = gm.model_id
                    LEFT JOIN workspace_memberships wm ON wm.user_id = ugs.user_id
                    WHERE gm.is_active = TRUE AND (wm.workspace_id = $1 OR wm.workspace_id IS NULL)
                    GROUP BY gm.model_id, gm.identifier, gm.display_name
                    ORDER BY user_count DESC
                    """,
                    workspace_id,
                )

                # Get AI usage stats for workspace
                usage_stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(*) as recent_calls,
                        COUNT(*) FILTER (WHERE success = TRUE) as successful_calls
                    FROM ai_usage_logs
                    WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
                    """,
                    workspace_id,
                )
            else:
                # Get global user stats
                user_stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(DISTINCT u.user_id) as total_users,
                        COUNT(DISTINCT ugs.user_id) FILTER (WHERE ugs.api_key_encrypted IS NOT NULL) as users_with_key,
                        COUNT(DISTINCT ugs.user_id) FILTER (WHERE ugs.status = 'connected') as users_connected,
                        COUNT(DISTINCT ugs.user_id) FILTER (WHERE ugs.status = 'validation_failed') as users_failed
                    FROM users u
                    LEFT JOIN user_gemini_settings ugs ON ugs.user_id = u.user_id
                    """
                )

                # Get global model distribution
                model_dist = await conn.fetch(
                    """
                    SELECT
                        gm.identifier as model_identifier,
                        gm.display_name,
                        COUNT(ugs.user_id) as user_count
                    FROM gemini_models gm
                    LEFT JOIN user_gemini_settings ugs ON ugs.selected_model_id = gm.model_id
                    WHERE gm.is_active = TRUE
                    GROUP BY gm.model_id, gm.identifier, gm.display_name
                    ORDER BY user_count DESC
                    """
                )

                # Get global AI usage stats
                usage_stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(*) as recent_calls,
                        COUNT(*) FILTER (WHERE success = TRUE) as successful_calls
                    FROM ai_usage_logs
                    WHERE created_at > NOW() - INTERVAL '24 hours'
                    """
                )

            # Calculate success rate
            recent_calls = usage_stats["recent_calls"] or 0
            successful_calls = usage_stats["successful_calls"] or 0
            success_rate = (
                round((successful_calls / recent_calls) * 100, 1)
                if recent_calls > 0
                else 100.0
            )

            return {
                "total_users": user_stats["total_users"],
                "users_with_key": user_stats["users_with_key"],
                "users_connected": user_stats["users_connected"],
                "users_failed": user_stats["users_failed"],
                "model_distribution": [
                    {
                        "model_identifier": row["model_identifier"],
                        "display_name": row["display_name"],
                        "user_count": row["user_count"],
                    }
                    for row in model_dist
                ],
                "recent_ai_calls": recent_calls,
                "ai_success_rate": success_rate,
            }


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------

_gemini_model_service: Optional[GeminiModelService] = None


def get_gemini_model_service() -> GeminiModelService:
    """Get singleton Gemini model service instance."""
    global _gemini_model_service
    if _gemini_model_service is None:
        _gemini_model_service = GeminiModelService()
    return _gemini_model_service
