"""Repository for language preference data operations.

This module provides the I18nRepository class that handles all CRUD
operations for language preferences, with proper user/workspace isolation
for multi-tenant security.

The repository supports:
- User-level language preferences (across all workspaces)
- Workspace-level language preferences (workspace defaults)
- Context-specific preferences (UI, email, notifications, etc.)
- Guest preferences (for magic link visitors)
- Language preference resolution following priority hierarchy

Feature: Localization & Regional Features
Task: T004 - Create i18n repository for language preference CRUD
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class I18nRepository:
    """Data access layer for language preference records.

    This repository handles all CRUD operations for language preferences,
    ensuring proper isolation by user_id, workspace_id, or guest_identifier.

    Key Features:
    - Context-specific language preferences (UI, email, notifications, etc.)
    - User, workspace, and guest preference support
    - Priority-based preference resolution
    - Regional formatting preferences (date, number, currency, timezone)
    """

    # =========================================================================
    # LANGUAGE PREFERENCE CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        context: str = "ui",
        primary_language: str = "en",
        fallback_language: str = "en",
        user_id: Optional[UUID] = None,
        workspace_id: Optional[UUID] = None,
        guest_identifier: Optional[UUID] = None,
        date_locale: str = "en-IN",
        number_locale: str = "en-IN",
        currency_code: str = "INR",
        timezone: str = "Asia/Kolkata",
        source: str = "user_selected",
        is_explicit: bool = False,
        is_active: bool = True,
        priority: int = 100,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new language preference record.

        Args:
            context: Context for the preference (ui, email, notification, etc.)
            primary_language: Primary language code (en, hi, te, etc.)
            fallback_language: Fallback language code if primary unavailable
            user_id: User ID (NULL for guest preferences)
            workspace_id: Workspace ID (NULL for user-level preferences)
            guest_identifier: Guest identifier for anonymous users
            date_locale: Locale for date formatting (e.g., 'en-IN')
            number_locale: Locale for number/currency formatting
            currency_code: Preferred currency (ISO 4217)
            timezone: Timezone for date/time display (IANA identifier)
            source: How preference was determined (user_selected, browser_detected, etc.)
            is_explicit: Whether user explicitly set this preference
            is_active: Whether this preference is currently active
            priority: Priority for preference resolution (lower = higher priority)
            metadata: Additional metadata (detection confidence, etc.)

        Returns:
            Created language preference record as dict

        Raises:
            ValueError: If neither user_id nor guest_identifier is provided
        """
        if user_id is None and guest_identifier is None:
            raise ValueError("Either user_id or guest_identifier must be provided")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            preference_id = uuid4()
            row = await conn.fetchrow(
                """
                INSERT INTO language_preferences (
                    preference_id, user_id, workspace_id, guest_identifier,
                    context, primary_language, fallback_language,
                    date_locale, number_locale, currency_code, timezone,
                    source, is_explicit, is_active, priority, metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16
                )
                RETURNING *
                """,
                preference_id,
                user_id,
                workspace_id,
                guest_identifier,
                context,
                primary_language,
                fallback_language,
                date_locale,
                number_locale,
                currency_code,
                timezone,
                source,
                is_explicit,
                is_active,
                priority,
                metadata or {},
            )

            logger.info(
                "Language preference created",
                extra={
                    "preference_id": str(preference_id),
                    "user_id": str(user_id) if user_id else None,
                    "workspace_id": str(workspace_id) if workspace_id else None,
                    "guest_identifier": str(guest_identifier) if guest_identifier else None,
                    "context": context,
                    "primary_language": primary_language,
                },
            )

            return self._row_to_dict(row)

    async def create_or_update(
        self,
        context: str,
        primary_language: str,
        user_id: Optional[UUID] = None,
        workspace_id: Optional[UUID] = None,
        guest_identifier: Optional[UUID] = None,
        fallback_language: str = "en",
        date_locale: str = "en-IN",
        number_locale: str = "en-IN",
        currency_code: str = "INR",
        timezone: str = "Asia/Kolkata",
        source: str = "user_selected",
        is_explicit: bool = False,
        priority: int = 100,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create or update a language preference (upsert).

        If a preference already exists for the given user/workspace/context,
        it will be updated. Otherwise, a new preference is created.

        Args:
            (see create() for parameter descriptions)

        Returns:
            Created or updated language preference record as dict
        """
        if user_id is None and guest_identifier is None:
            raise ValueError("Either user_id or guest_identifier must be provided")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            preference_id = uuid4()
            row = await conn.fetchrow(
                """
                INSERT INTO language_preferences (
                    preference_id, user_id, workspace_id, guest_identifier,
                    context, primary_language, fallback_language,
                    date_locale, number_locale, currency_code, timezone,
                    source, is_explicit, is_active, priority, metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16
                )
                ON CONFLICT (user_id, workspace_id, context)
                DO UPDATE SET
                    primary_language = EXCLUDED.primary_language,
                    fallback_language = EXCLUDED.fallback_language,
                    date_locale = EXCLUDED.date_locale,
                    number_locale = EXCLUDED.number_locale,
                    currency_code = EXCLUDED.currency_code,
                    timezone = EXCLUDED.timezone,
                    source = EXCLUDED.source,
                    is_explicit = EXCLUDED.is_explicit,
                    priority = EXCLUDED.priority,
                    metadata = EXCLUDED.metadata,
                    is_active = TRUE
                RETURNING *
                """,
                preference_id,
                user_id,
                workspace_id,
                guest_identifier,
                context,
                primary_language,
                fallback_language,
                date_locale,
                number_locale,
                currency_code,
                timezone,
                source,
                is_explicit,
                True,  # is_active
                priority,
                metadata or {},
            )

            logger.info(
                "Language preference upserted",
                extra={
                    "preference_id": str(row["preference_id"]),
                    "user_id": str(user_id) if user_id else None,
                    "workspace_id": str(workspace_id) if workspace_id else None,
                    "context": context,
                    "primary_language": primary_language,
                },
            )

            return self._row_to_dict(row)

    # =========================================================================
    # LANGUAGE PREFERENCE READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        preference_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single language preference by ID.

        Args:
            preference_id: Language preference ID to retrieve

        Returns:
            Language preference record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM language_preferences
                WHERE preference_id = $1
                """,
                preference_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_user_and_context(
        self,
        user_id: UUID,
        context: str,
        workspace_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Get language preference for a user and specific context.

        If workspace_id is provided, looks for workspace-specific preference first,
        then falls back to user-level preference.

        Args:
            user_id: User ID
            context: Context (ui, email, notification, etc.)
            workspace_id: Optional workspace ID for workspace-specific preference

        Returns:
            Language preference record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                # First try workspace-specific preference
                row = await conn.fetchrow(
                    """
                    SELECT * FROM language_preferences
                    WHERE user_id = $1
                      AND workspace_id = $2
                      AND context = $3
                      AND is_active = TRUE
                    """,
                    user_id,
                    workspace_id,
                    context,
                )
                if row:
                    return self._row_to_dict(row)

            # Fall back to user-level preference (no workspace)
            row = await conn.fetchrow(
                """
                SELECT * FROM language_preferences
                WHERE user_id = $1
                  AND workspace_id IS NULL
                  AND context = $2
                  AND is_active = TRUE
                """,
                user_id,
                context,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_workspace_and_context(
        self,
        workspace_id: UUID,
        context: str,
    ) -> Optional[dict[str, Any]]:
        """Get workspace default language preference for a specific context.

        This retrieves the workspace-level default (where user_id is NULL).

        Args:
            workspace_id: Workspace ID
            context: Context (ui, email, notification, etc.)

        Returns:
            Language preference record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM language_preferences
                WHERE user_id IS NULL
                  AND workspace_id = $1
                  AND context = $2
                  AND is_active = TRUE
                """,
                workspace_id,
                context,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_guest_identifier(
        self,
        guest_identifier: UUID,
        context: str = "ui",
    ) -> Optional[dict[str, Any]]:
        """Get language preference for a guest user.

        Args:
            guest_identifier: Guest identifier (e.g., from magic link)
            context: Context (default: ui)

        Returns:
            Language preference record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM language_preferences
                WHERE guest_identifier = $1
                  AND context = $2
                  AND is_active = TRUE
                """,
                guest_identifier,
                context,
            )
            return self._row_to_dict(row) if row else None

    async def list_by_user_id(
        self,
        user_id: UUID,
        workspace_id: Optional[UUID] = None,
        active_only: bool = True,
    ) -> list[dict[str, Any]]:
        """List all language preferences for a user.

        Args:
            user_id: User ID
            workspace_id: Optional workspace ID to filter by
            active_only: Whether to only include active preferences

        Returns:
            List of language preference records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                if active_only:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM language_preferences
                        WHERE user_id = $1
                          AND (workspace_id = $2 OR workspace_id IS NULL)
                          AND is_active = TRUE
                        ORDER BY
                            CASE WHEN workspace_id IS NOT NULL THEN 0 ELSE 1 END,
                            priority ASC,
                            context
                        """,
                        user_id,
                        workspace_id,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM language_preferences
                        WHERE user_id = $1
                          AND (workspace_id = $2 OR workspace_id IS NULL)
                        ORDER BY
                            CASE WHEN workspace_id IS NOT NULL THEN 0 ELSE 1 END,
                            priority ASC,
                            context
                        """,
                        user_id,
                        workspace_id,
                    )
            else:
                if active_only:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM language_preferences
                        WHERE user_id = $1 AND is_active = TRUE
                        ORDER BY workspace_id NULLS LAST, priority ASC, context
                        """,
                        user_id,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM language_preferences
                        WHERE user_id = $1
                        ORDER BY workspace_id NULLS LAST, priority ASC, context
                        """,
                        user_id,
                    )
            return [self._row_to_dict(row) for row in rows]

    async def list_by_workspace_id(
        self,
        workspace_id: UUID,
        include_user_preferences: bool = False,
        active_only: bool = True,
    ) -> list[dict[str, Any]]:
        """List all language preferences for a workspace.

        Args:
            workspace_id: Workspace ID
            include_user_preferences: Whether to include user-specific preferences
            active_only: Whether to only include active preferences

        Returns:
            List of language preference records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if include_user_preferences:
                if active_only:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM language_preferences
                        WHERE workspace_id = $1 AND is_active = TRUE
                        ORDER BY user_id NULLS FIRST, priority ASC, context
                        """,
                        workspace_id,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM language_preferences
                        WHERE workspace_id = $1
                        ORDER BY user_id NULLS FIRST, priority ASC, context
                        """,
                        workspace_id,
                    )
            else:
                # Only workspace defaults (user_id IS NULL)
                if active_only:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM language_preferences
                        WHERE workspace_id = $1
                          AND user_id IS NULL
                          AND is_active = TRUE
                        ORDER BY priority ASC, context
                        """,
                        workspace_id,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM language_preferences
                        WHERE workspace_id = $1 AND user_id IS NULL
                        ORDER BY priority ASC, context
                        """,
                        workspace_id,
                    )
            return [self._row_to_dict(row) for row in rows]

    async def list_by_guest_identifier(
        self,
        guest_identifier: UUID,
        active_only: bool = True,
    ) -> list[dict[str, Any]]:
        """List all language preferences for a guest.

        Args:
            guest_identifier: Guest identifier
            active_only: Whether to only include active preferences

        Returns:
            List of language preference records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if active_only:
                rows = await conn.fetch(
                    """
                    SELECT * FROM language_preferences
                    WHERE guest_identifier = $1 AND is_active = TRUE
                    ORDER BY priority ASC, context
                    """,
                    guest_identifier,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM language_preferences
                    WHERE guest_identifier = $1
                    ORDER BY priority ASC, context
                    """,
                    guest_identifier,
                )
            return [self._row_to_dict(row) for row in rows]

    async def list_by_language(
        self,
        language: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List all active preferences for a specific language.

        Admin/analytics method for understanding language usage.

        Args:
            language: Language code (en, hi, te, etc.)
            limit: Maximum number of records to return
            offset: Number of records to skip

        Returns:
            List of language preference records using the specified language
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM language_preferences
                WHERE primary_language = $1 AND is_active = TRUE
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                language,
                limit,
                offset,
            )
            return [self._row_to_dict(row) for row in rows]

    async def count_by_language(self) -> dict[str, int]:
        """Count active preferences by language.

        Admin/analytics method for language usage statistics.

        Returns:
            Dictionary mapping language codes to counts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT primary_language, COUNT(*) as count
                FROM language_preferences
                WHERE is_active = TRUE
                GROUP BY primary_language
                ORDER BY count DESC
                """
            )
            return {row["primary_language"]: row["count"] for row in rows}

    # =========================================================================
    # LANGUAGE PREFERENCE RESOLUTION
    # =========================================================================

    async def resolve_preference(
        self,
        user_id: Optional[UUID] = None,
        workspace_id: Optional[UUID] = None,
        guest_identifier: Optional[UUID] = None,
        context: str = "ui",
    ) -> dict[str, Any]:
        """Resolve effective language preference following priority hierarchy.

        Resolution order:
        1. User-specific preference for workspace+context
        2. User-level preference for context (no workspace)
        3. Workspace default for context
        4. Guest preference (if guest_identifier provided)
        5. System default (English)

        Args:
            user_id: Optional user ID
            workspace_id: Optional workspace ID
            guest_identifier: Optional guest identifier
            context: Context (ui, email, notification, etc.)

        Returns:
            Resolved preference dict with language, fallback, source, etc.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Use the database function for resolution if user_id is provided
            if user_id:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM resolve_language_preference($1, $2, $3)
                    """,
                    user_id,
                    workspace_id,
                    context,
                )
                if row:
                    return {
                        "language": row["language"],
                        "fallback": row["fallback"],
                        "source": row["source"],
                        "is_explicit": row["is_explicit"],
                        "date_locale": "en-IN",  # Default, could be enhanced
                        "number_locale": "en-IN",
                        "currency_code": "INR",
                        "timezone": "Asia/Kolkata",
                    }

            # Check guest preference
            if guest_identifier:
                pref = await self.get_by_guest_identifier(guest_identifier, context)
                if pref:
                    return {
                        "language": pref["primary_language"],
                        "fallback": pref["fallback_language"],
                        "source": pref["source"],
                        "is_explicit": pref["is_explicit"],
                        "date_locale": pref["date_locale"],
                        "number_locale": pref["number_locale"],
                        "currency_code": pref["currency_code"],
                        "timezone": pref["timezone"],
                    }

            # System default
            return {
                "language": "en",
                "fallback": "en",
                "source": "system_default",
                "is_explicit": False,
                "date_locale": "en-IN",
                "number_locale": "en-IN",
                "currency_code": "INR",
                "timezone": "Asia/Kolkata",
            }

    # =========================================================================
    # LANGUAGE PREFERENCE UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        preference_id: UUID,
        primary_language: Optional[str] = None,
        fallback_language: Optional[str] = None,
        date_locale: Optional[str] = None,
        number_locale: Optional[str] = None,
        currency_code: Optional[str] = None,
        timezone: Optional[str] = None,
        source: Optional[str] = None,
        is_explicit: Optional[bool] = None,
        is_active: Optional[bool] = None,
        priority: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing language preference.

        Only updates fields that are explicitly provided (not None).
        The updated_at timestamp is automatically set by database trigger.

        Args:
            preference_id: Language preference ID to update
            (other args): Fields to update (see create() for descriptions)

        Returns:
            Updated language preference record or None if not found
        """
        # Build dynamic update query based on provided fields
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "primary_language": primary_language,
            "fallback_language": fallback_language,
            "date_locale": date_locale,
            "number_locale": number_locale,
            "currency_code": currency_code,
            "timezone": timezone,
            "source": source,
            "is_explicit": is_explicit,
            "is_active": is_active,
            "priority": priority,
            "metadata": metadata,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            # No fields to update, just return current record
            return await self.get_by_id(preference_id)

        # Add preference_id as final parameter
        params.append(preference_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE language_preferences
                SET {", ".join(updates)}
                WHERE preference_id = ${param_index}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Language preference updated",
                    extra={
                        "preference_id": str(preference_id),
                        "updated_fields": [k for k, v in field_updates.items() if v is not None],
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_language(
        self,
        preference_id: UUID,
        primary_language: str,
        source: str = "user_selected",
        is_explicit: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Update the primary language for a preference.

        Convenience method for changing just the language.

        Args:
            preference_id: Language preference ID to update
            primary_language: New primary language code
            source: How the change was made (default: user_selected)
            is_explicit: Whether user explicitly set this (default: True)

        Returns:
            Updated language preference record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE language_preferences
                SET primary_language = $2,
                    source = $3,
                    is_explicit = $4
                WHERE preference_id = $1
                RETURNING *
                """,
                preference_id,
                primary_language,
                source,
                is_explicit,
            )

            if row:
                logger.info(
                    "Language preference language updated",
                    extra={
                        "preference_id": str(preference_id),
                        "primary_language": primary_language,
                        "source": source,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_regional_settings(
        self,
        preference_id: UUID,
        date_locale: Optional[str] = None,
        number_locale: Optional[str] = None,
        currency_code: Optional[str] = None,
        timezone: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update regional formatting settings for a preference.

        Convenience method for changing regional settings without language.

        Args:
            preference_id: Language preference ID to update
            date_locale: Locale for date formatting
            number_locale: Locale for number/currency formatting
            currency_code: Preferred currency (ISO 4217)
            timezone: Timezone for date/time display (IANA identifier)

        Returns:
            Updated language preference record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE language_preferences
                SET date_locale = COALESCE($2, date_locale),
                    number_locale = COALESCE($3, number_locale),
                    currency_code = COALESCE($4, currency_code),
                    timezone = COALESCE($5, timezone)
                WHERE preference_id = $1
                RETURNING *
                """,
                preference_id,
                date_locale,
                number_locale,
                currency_code,
                timezone,
            )

            if row:
                logger.info(
                    "Language preference regional settings updated",
                    extra={
                        "preference_id": str(preference_id),
                        "date_locale": date_locale,
                        "number_locale": number_locale,
                        "currency_code": currency_code,
                        "timezone": timezone,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def set_active(
        self,
        preference_id: UUID,
        is_active: bool,
    ) -> Optional[dict[str, Any]]:
        """Set the active status of a language preference.

        Args:
            preference_id: Language preference ID
            is_active: Whether to activate or deactivate

        Returns:
            Updated language preference record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE language_preferences
                SET is_active = $2
                WHERE preference_id = $1
                RETURNING *
                """,
                preference_id,
                is_active,
            )

            if row:
                logger.info(
                    "Language preference active status updated",
                    extra={
                        "preference_id": str(preference_id),
                        "is_active": is_active,
                    },
                )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # LANGUAGE PREFERENCE DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        preference_id: UUID,
    ) -> bool:
        """Delete a language preference.

        Warning: This performs a hard delete. Consider using set_active(False)
        instead to preserve historical data.

        Args:
            preference_id: Language preference ID to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM language_preferences
                WHERE preference_id = $1
                """,
                preference_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                logger.warning(
                    "Language preference deleted",
                    extra={"preference_id": str(preference_id)},
                )

            return deleted

    async def delete_by_user_and_context(
        self,
        user_id: UUID,
        context: str,
        workspace_id: Optional[UUID] = None,
    ) -> bool:
        """Delete a user's language preference for a specific context.

        Args:
            user_id: User ID
            context: Context (ui, email, notification, etc.)
            workspace_id: Optional workspace ID for workspace-specific deletion

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                result = await conn.execute(
                    """
                    DELETE FROM language_preferences
                    WHERE user_id = $1
                      AND workspace_id = $2
                      AND context = $3
                    """,
                    user_id,
                    workspace_id,
                    context,
                )
            else:
                result = await conn.execute(
                    """
                    DELETE FROM language_preferences
                    WHERE user_id = $1
                      AND workspace_id IS NULL
                      AND context = $2
                    """,
                    user_id,
                    context,
                )

            deleted = result == "DELETE 1"
            if deleted:
                logger.warning(
                    "Language preference deleted by user and context",
                    extra={
                        "user_id": str(user_id),
                        "workspace_id": str(workspace_id) if workspace_id else None,
                        "context": context,
                    },
                )

            return deleted

    async def delete_all_by_user(
        self,
        user_id: UUID,
    ) -> int:
        """Delete all language preferences for a user.

        Used for GDPR compliance when deleting user data.

        Args:
            user_id: User ID

        Returns:
            Number of records deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM language_preferences
                WHERE user_id = $1
                """,
                user_id,
            )

            # Extract count from "DELETE N" result
            deleted_count = int(result.split(" ")[1]) if result else 0
            if deleted_count > 0:
                logger.warning(
                    "All language preferences deleted for user",
                    extra={
                        "user_id": str(user_id),
                        "deleted_count": deleted_count,
                    },
                )

            return deleted_count

    async def delete_all_by_guest(
        self,
        guest_identifier: UUID,
    ) -> int:
        """Delete all language preferences for a guest.

        Args:
            guest_identifier: Guest identifier

        Returns:
            Number of records deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM language_preferences
                WHERE guest_identifier = $1
                """,
                guest_identifier,
            )

            deleted_count = int(result.split(" ")[1]) if result else 0
            if deleted_count > 0:
                logger.info(
                    "All language preferences deleted for guest",
                    extra={
                        "guest_identifier": str(guest_identifier),
                        "deleted_count": deleted_count,
                    },
                )

            return deleted_count

    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================

    async def bulk_create_defaults(
        self,
        user_id: UUID,
        primary_language: str = "en",
        date_locale: str = "en-IN",
        number_locale: str = "en-IN",
        currency_code: str = "INR",
        timezone: str = "Asia/Kolkata",
        source: str = "system_default",
    ) -> list[dict[str, Any]]:
        """Create default language preferences for all contexts for a user.

        Creates preferences for: ui, email, notification, invoice, gallery,
        invitation, report.

        Args:
            user_id: User ID
            primary_language: Primary language for all contexts
            date_locale: Date locale for all contexts
            number_locale: Number locale for all contexts
            currency_code: Currency code for all contexts
            timezone: Timezone for all contexts
            source: Source for all preferences

        Returns:
            List of created language preference records
        """
        contexts = ["ui", "email", "notification", "invoice", "gallery", "invitation", "report"]
        results = []

        for context in contexts:
            pref = await self.create(
                user_id=user_id,
                context=context,
                primary_language=primary_language,
                fallback_language="en",
                date_locale=date_locale,
                number_locale=number_locale,
                currency_code=currency_code,
                timezone=timezone,
                source=source,
                is_explicit=False,
            )
            results.append(pref)

        logger.info(
            "Bulk default language preferences created",
            extra={
                "user_id": str(user_id),
                "contexts": contexts,
                "primary_language": primary_language,
            },
        )

        return results

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary.

        Handles type conversions for UUIDs and datetimes.

        Args:
            row: asyncpg Record object

        Returns:
            Dictionary representation of the row
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = ["preference_id", "user_id", "workspace_id", "guest_identifier"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format strings
        datetime_fields = ["created_at", "updated_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_i18n_repository: Optional[I18nRepository] = None


def get_i18n_repository() -> I18nRepository:
    """Get the singleton I18nRepository instance.

    Returns:
        I18nRepository singleton instance
    """
    global _i18n_repository
    if _i18n_repository is None:
        _i18n_repository = I18nRepository()
    return _i18n_repository
