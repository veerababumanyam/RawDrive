"""Repository for notification preferences data operations.

This module provides the PreferenceRepository class that handles all CRUD
operations for notification preferences, with proper workspace isolation
for multi-tenant security.

Features:
- User-level and workspace-level default preferences
- Per-category preference controls (gallery_activity, billing, marketing, etc.)
- Per-channel opt-in/opt-out (email, sms, in_app, push)
- Quiet hours / Do-Not-Disturb schedules
- Redis caching for high-performance preference lookups

All queries enforce workspace_id filtering to ensure data isolation
between tenants.

Feature: Notifications & Communication Microservice
Task: T019 - Create preference_repository.py
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, time, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

import asyncpg

from src.cache.redis_client import (
    build_preferences_cache_key,
    invalidate_preferences_cache,
    redis_client,
)
from src.database import fetch, fetchrow, fetchval, get_connection, transaction
from src.schemas.notification import NotificationCategory, NotificationChannel, PaginationMeta
from src.schemas.preference import (
    CategoryPreference,
    DigestFrequency,
    DigestSchedule,
    DayOfWeek,
    MergedPreferences,
    PreferenceCheckRequest,
    PreferenceCheckResult,
    PreferenceResponse,
    PreferenceSummary,
    PreferenceUpdateSource,
    QuietHoursConfig,
)

logger = logging.getLogger(__name__)

# Cache TTL in seconds
PREFERENCE_CACHE_TTL = 300  # 5 minutes


class PreferenceRepository:
    """Data access layer for notification preferences.

    This repository handles all CRUD operations for notification preferences,
    ensuring proper workspace isolation for multi-tenant security.

    Preferences are cached in Redis for fast lookups during notification
    processing. Cache is invalidated on any update.

    All methods that access data require workspace_id to enforce
    tenant isolation at the data layer.
    """

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create_preference(
        self,
        workspace_id: UUID,
        user_id: Optional[UUID] = None,
        email_enabled: bool = True,
        sms_enabled: bool = False,
        in_app_enabled: bool = True,
        push_enabled: bool = True,
        gallery_activity: Optional[CategoryPreference] = None,
        client_interactions: Optional[CategoryPreference] = None,
        system_alerts: Optional[CategoryPreference] = None,
        billing: Optional[CategoryPreference] = None,
        marketing: Optional[CategoryPreference] = None,
        invitation: Optional[CategoryPreference] = None,
        quiet_hours: Optional[QuietHoursConfig] = None,
        digest_schedule: Optional[DigestSchedule] = None,
        language: str = "en",
        timezone_str: str = "UTC",
        transactional_email_enabled: bool = True,
        metadata: Optional[dict[str, Any]] = None,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Create notification preferences for a user or workspace defaults.

        Args:
            workspace_id: Workspace ID for tenant isolation
            user_id: User ID for user-specific preferences. None for workspace defaults.
            email_enabled: Enable email notifications
            sms_enabled: Enable SMS notifications
            in_app_enabled: Enable in-app notifications
            push_enabled: Enable push notifications
            gallery_activity: Gallery activity notification preferences
            client_interactions: Client interaction notification preferences
            system_alerts: System alert notification preferences
            billing: Billing notification preferences
            marketing: Marketing notification preferences
            invitation: Invitation notification preferences
            quiet_hours: Quiet hours / DND configuration
            digest_schedule: Digest delivery schedule
            language: Preferred language for notifications (ISO 639-1)
            timezone_str: IANA timezone for scheduling
            transactional_email_enabled: Allow transactional emails
            metadata: Additional preference settings
            update_source: Source of the preference update

        Returns:
            Created preference as PreferenceResponse

        Raises:
            asyncpg.UniqueViolationError: If preference already exists
        """
        preference_id = uuid4()
        now = datetime.now(timezone.utc)

        # Set defaults for category preferences
        gallery_activity = gallery_activity or CategoryPreference()
        client_interactions = client_interactions or CategoryPreference()
        system_alerts = system_alerts or CategoryPreference()
        billing = billing or CategoryPreference()
        marketing = marketing or CategoryPreference(
            enabled=False,
            channels=[NotificationChannel.EMAIL],
            frequency=DigestFrequency.WEEKLY,
        )
        invitation = invitation or CategoryPreference()
        quiet_hours = quiet_hours or QuietHoursConfig()
        digest_schedule = digest_schedule or DigestSchedule()

        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO notification_preferences (
                    preference_id, workspace_id, user_id,
                    email_enabled, sms_enabled, in_app_enabled, push_enabled,
                    gallery_activity_enabled, gallery_activity_channels, gallery_activity_frequency,
                    client_interactions_enabled, client_interactions_channels, client_interactions_frequency,
                    system_alerts_enabled, system_alerts_channels,
                    billing_enabled, billing_channels,
                    marketing_enabled, marketing_channels, marketing_frequency,
                    invitation_enabled, invitation_channels, invitation_frequency,
                    quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
                    timezone, quiet_hours_days,
                    daily_digest_time, weekly_digest_day,
                    language, transactional_email_enabled,
                    metadata, last_updated_source,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                    $31, $32, $33, $34, $35, $36
                )
                RETURNING *
                """,
                preference_id,
                workspace_id,
                user_id,
                email_enabled,
                sms_enabled,
                in_app_enabled,
                push_enabled,
                gallery_activity.enabled,
                self._channels_to_db(gallery_activity.channels),
                gallery_activity.frequency.value,
                client_interactions.enabled,
                self._channels_to_db(client_interactions.channels),
                client_interactions.frequency.value,
                system_alerts.enabled,
                self._channels_to_db(system_alerts.channels),
                billing.enabled,
                self._channels_to_db(billing.channels),
                marketing.enabled,
                self._channels_to_db(marketing.channels),
                marketing.frequency.value,
                invitation.enabled,
                self._channels_to_db(invitation.channels),
                invitation.frequency.value,
                quiet_hours.enabled,
                quiet_hours.start_time,
                quiet_hours.end_time,
                quiet_hours.timezone if quiet_hours.enabled else timezone_str,
                self._days_to_db(quiet_hours.days),
                digest_schedule.daily_digest_time,
                digest_schedule.weekly_digest_day.value,
                language,
                transactional_email_enabled,
                json.dumps(metadata or {}),
                update_source.value,
                now,
                now,
            )

            return self._row_to_preference_response(row)

    async def create_workspace_defaults(
        self,
        workspace_id: UUID,
    ) -> PreferenceResponse:
        """Create default notification preferences for a workspace.

        Uses sensible defaults for new workspaces.

        Args:
            workspace_id: Workspace ID

        Returns:
            Created workspace default preferences
        """
        return await self.create_preference(
            workspace_id=workspace_id,
            user_id=None,  # NULL user_id = workspace defaults
            update_source=PreferenceUpdateSource.MIGRATION,
        )

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_preference(
        self,
        workspace_id: UUID,
        preference_id: UUID,
    ) -> Optional[PreferenceResponse]:
        """Get a preference by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            preference_id: Preference ID to retrieve

        Returns:
            Preference as PreferenceResponse or None if not found
        """
        row = await fetchrow(
            """
            SELECT * FROM notification_preferences
            WHERE preference_id = $1 AND workspace_id = $2
            """,
            preference_id,
            workspace_id,
            read_only=True,
        )
        return self._row_to_preference_response(row) if row else None

    async def get_user_preference(
        self,
        workspace_id: UUID,
        user_id: UUID,
        use_cache: bool = True,
    ) -> Optional[PreferenceResponse]:
        """Get notification preferences for a specific user.

        Checks Redis cache first for fast lookups during notification processing.

        Args:
            workspace_id: Workspace ID for tenant isolation
            user_id: User ID to get preferences for
            use_cache: Whether to use Redis cache (default True)

        Returns:
            User's preference or None if not set
        """
        # Check cache first
        if use_cache:
            cache_key = build_preferences_cache_key(str(user_id), str(workspace_id))
            cached = await redis_client.get_json(cache_key)
            if cached is not None:
                logger.debug(f"Preference cache HIT for user {user_id}")
                return PreferenceResponse(**cached)

        # Query database
        row = await fetchrow(
            """
            SELECT * FROM notification_preferences
            WHERE workspace_id = $1 AND user_id = $2
            """,
            workspace_id,
            user_id,
            read_only=True,
        )

        if row:
            preference = self._row_to_preference_response(row)
            # Cache the result
            if use_cache:
                cache_key = build_preferences_cache_key(str(user_id), str(workspace_id))
                await redis_client.set_json(
                    cache_key,
                    preference.model_dump(mode="json"),
                    PREFERENCE_CACHE_TTL,
                )
            return preference

        return None

    async def get_workspace_defaults(
        self,
        workspace_id: UUID,
        use_cache: bool = True,
    ) -> Optional[PreferenceResponse]:
        """Get workspace default notification preferences.

        These are used when a user has no specific preferences set.

        Args:
            workspace_id: Workspace ID
            use_cache: Whether to use Redis cache (default True)

        Returns:
            Workspace default preferences or None if not set
        """
        # Check cache first
        if use_cache:
            cache_key = build_preferences_cache_key("defaults", str(workspace_id))
            cached = await redis_client.get_json(cache_key)
            if cached is not None:
                logger.debug(f"Workspace defaults cache HIT for {workspace_id}")
                return PreferenceResponse(**cached)

        # Query database - workspace defaults have user_id = NULL
        row = await fetchrow(
            """
            SELECT * FROM notification_preferences
            WHERE workspace_id = $1 AND user_id IS NULL
            """,
            workspace_id,
            read_only=True,
        )

        if row:
            preference = self._row_to_preference_response(row)
            # Cache the result
            if use_cache:
                cache_key = build_preferences_cache_key("defaults", str(workspace_id))
                await redis_client.set_json(
                    cache_key,
                    preference.model_dump(mode="json"),
                    PREFERENCE_CACHE_TTL,
                )
            return preference

        return None

    async def get_or_create_user_preference(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> PreferenceResponse:
        """Get user preference or create with workspace defaults.

        If user has no preferences, creates a new preference record
        with values from workspace defaults.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            User's preference (existing or newly created)
        """
        # Try to get existing
        preference = await self.get_user_preference(workspace_id, user_id)
        if preference:
            return preference

        # Get workspace defaults to use as template
        defaults = await self.get_workspace_defaults(workspace_id)

        # Create new preference based on defaults
        if defaults:
            return await self.create_preference(
                workspace_id=workspace_id,
                user_id=user_id,
                email_enabled=defaults.email_enabled,
                sms_enabled=defaults.sms_enabled,
                in_app_enabled=defaults.in_app_enabled,
                push_enabled=defaults.push_enabled,
                gallery_activity=defaults.gallery_activity,
                client_interactions=defaults.client_interactions,
                system_alerts=defaults.system_alerts,
                billing=defaults.billing,
                marketing=defaults.marketing,
                invitation=defaults.invitation,
                quiet_hours=defaults.quiet_hours,
                digest_schedule=defaults.digest_schedule,
                language=defaults.language,
                timezone_str=defaults.timezone,
                transactional_email_enabled=defaults.transactional_email_enabled,
                update_source=PreferenceUpdateSource.MIGRATION,
            )
        else:
            # Create with system defaults
            return await self.create_preference(
                workspace_id=workspace_id,
                user_id=user_id,
                update_source=PreferenceUpdateSource.MIGRATION,
            )

    async def get_merged_preferences(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> MergedPreferences:
        """Get effective preferences by merging user and workspace defaults.

        User preferences take precedence over workspace defaults.
        If user has no preferences, returns workspace defaults.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            MergedPreferences with effective settings
        """
        user_pref = await self.get_user_preference(workspace_id, user_id)
        workspace_defaults = await self.get_workspace_defaults(workspace_id)

        # If user has preferences, use them
        if user_pref:
            return MergedPreferences(
                user_preference_id=user_pref.preference_id,
                workspace_default_id=workspace_defaults.preference_id if workspace_defaults else None,
                is_using_defaults=False,
                email_enabled=user_pref.email_enabled,
                sms_enabled=user_pref.sms_enabled,
                in_app_enabled=user_pref.in_app_enabled,
                push_enabled=user_pref.push_enabled,
                gallery_activity=user_pref.gallery_activity,
                client_interactions=user_pref.client_interactions,
                system_alerts=user_pref.system_alerts,
                billing=user_pref.billing,
                marketing=user_pref.marketing,
                invitation=user_pref.invitation,
                quiet_hours=user_pref.quiet_hours,
                language=user_pref.language,
                timezone=user_pref.timezone,
                global_unsubscribe=user_pref.global_unsubscribe,
                transactional_email_enabled=user_pref.transactional_email_enabled,
            )

        # Use workspace defaults
        if workspace_defaults:
            return MergedPreferences(
                user_preference_id=None,
                workspace_default_id=workspace_defaults.preference_id,
                is_using_defaults=True,
                email_enabled=workspace_defaults.email_enabled,
                sms_enabled=workspace_defaults.sms_enabled,
                in_app_enabled=workspace_defaults.in_app_enabled,
                push_enabled=workspace_defaults.push_enabled,
                gallery_activity=workspace_defaults.gallery_activity,
                client_interactions=workspace_defaults.client_interactions,
                system_alerts=workspace_defaults.system_alerts,
                billing=workspace_defaults.billing,
                marketing=workspace_defaults.marketing,
                invitation=workspace_defaults.invitation,
                quiet_hours=workspace_defaults.quiet_hours,
                language=workspace_defaults.language,
                timezone=workspace_defaults.timezone,
                global_unsubscribe=workspace_defaults.global_unsubscribe,
                transactional_email_enabled=workspace_defaults.transactional_email_enabled,
            )

        # Return system defaults
        return MergedPreferences(
            user_preference_id=None,
            workspace_default_id=None,
            is_using_defaults=True,
        )

    async def get_preference_by_unsubscribe_token(
        self,
        token: UUID,
    ) -> Optional[PreferenceResponse]:
        """Get preference by unsubscribe token.

        Used for processing email unsubscribe links.

        Args:
            token: Unsubscribe token from email link

        Returns:
            Preference or None if token not found
        """
        row = await fetchrow(
            """
            SELECT * FROM notification_preferences
            WHERE unsubscribe_token = $1
            """,
            token,
            read_only=True,
        )
        return self._row_to_preference_response(row) if row else None

    async def list_preferences(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        include_defaults: bool = False,
        email_enabled: Optional[bool] = None,
        global_unsubscribe: Optional[bool] = None,
        language: Optional[str] = None,
    ) -> tuple[list[PreferenceSummary], PaginationMeta]:
        """List notification preferences for a workspace with filtering.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page (max 100)
            include_defaults: Include workspace default preferences
            email_enabled: Filter by email enabled status
            global_unsubscribe: Filter by global unsubscribe status
            language: Filter by language

        Returns:
            Tuple of (list of PreferenceSummary, PaginationMeta)
        """
        offset = (page - 1) * limit

        conditions = ["workspace_id = $1"]
        params: list[Any] = [workspace_id]
        param_idx = 2

        if not include_defaults:
            conditions.append("user_id IS NOT NULL")

        if email_enabled is not None:
            conditions.append(f"email_enabled = ${param_idx}")
            params.append(email_enabled)
            param_idx += 1

        if global_unsubscribe is not None:
            conditions.append(f"global_unsubscribe = ${param_idx}")
            params.append(global_unsubscribe)
            param_idx += 1

        if language:
            conditions.append(f"language = ${param_idx}")
            params.append(language)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Get total count
        total = await fetchval(
            f"SELECT COUNT(*) FROM notification_preferences WHERE {where_clause}",
            *params,
            read_only=True,
        )

        # Get paginated results
        params.extend([limit, offset])
        rows = await fetch(
            f"""
            SELECT preference_id, workspace_id, user_id,
                   email_enabled, sms_enabled, in_app_enabled, push_enabled,
                   global_unsubscribe, language, timezone,
                   created_at, updated_at
            FROM notification_preferences
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """,
            *params,
            read_only=True,
        )

        preferences = [self._row_to_preference_summary(row) for row in rows]
        total_pages = (total + limit - 1) // limit if total > 0 else 0

        meta = PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
            has_more=page < total_pages,
        )

        return preferences, meta

    async def list_marketing_enabled_users(
        self,
        workspace_id: UUID,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[UUID]:
        """Get list of user IDs with marketing enabled.

        Used for marketing campaign targeting.

        Args:
            workspace_id: Workspace ID
            limit: Maximum number of user IDs to return
            offset: Offset for pagination

        Returns:
            List of user IDs with marketing enabled
        """
        rows = await fetch(
            """
            SELECT user_id FROM notification_preferences
            WHERE workspace_id = $1
              AND user_id IS NOT NULL
              AND marketing_enabled = TRUE
              AND global_unsubscribe = FALSE
              AND email_enabled = TRUE
            ORDER BY created_at
            LIMIT $2 OFFSET $3
            """,
            workspace_id,
            limit,
            offset,
            read_only=True,
        )

        return [row["user_id"] for row in rows]

    async def get_users_by_language(
        self,
        workspace_id: UUID,
        language: str,
        limit: int = 1000,
    ) -> list[UUID]:
        """Get user IDs by preferred language.

        Used for sending localized notifications.

        Args:
            workspace_id: Workspace ID
            language: ISO 639-1 language code
            limit: Maximum number of user IDs to return

        Returns:
            List of user IDs with the specified language
        """
        rows = await fetch(
            """
            SELECT user_id FROM notification_preferences
            WHERE workspace_id = $1
              AND user_id IS NOT NULL
              AND language = $2
              AND global_unsubscribe = FALSE
            LIMIT $3
            """,
            workspace_id,
            language,
            limit,
            read_only=True,
        )

        return [row["user_id"] for row in rows]

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update_preference(
        self,
        workspace_id: UUID,
        preference_id: UUID,
        email_enabled: Optional[bool] = None,
        sms_enabled: Optional[bool] = None,
        in_app_enabled: Optional[bool] = None,
        push_enabled: Optional[bool] = None,
        gallery_activity: Optional[CategoryPreference] = None,
        client_interactions: Optional[CategoryPreference] = None,
        system_alerts: Optional[CategoryPreference] = None,
        billing: Optional[CategoryPreference] = None,
        marketing: Optional[CategoryPreference] = None,
        invitation: Optional[CategoryPreference] = None,
        quiet_hours: Optional[QuietHoursConfig] = None,
        digest_schedule: Optional[DigestSchedule] = None,
        language: Optional[str] = None,
        timezone_str: Optional[str] = None,
        transactional_email_enabled: Optional[bool] = None,
        metadata: Optional[dict[str, Any]] = None,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> Optional[PreferenceResponse]:
        """Update notification preferences.

        Only provided fields are updated. None values are ignored.

        Args:
            workspace_id: Workspace ID for tenant isolation
            preference_id: Preference ID to update
            (other args): Fields to update

        Returns:
            Updated preference or None if not found
        """
        # Build dynamic update query
        updates = ["last_updated_source = $2"]
        params: list[Any] = [preference_id, update_source.value]
        param_idx = 3

        if email_enabled is not None:
            updates.append(f"email_enabled = ${param_idx}")
            params.append(email_enabled)
            param_idx += 1

        if sms_enabled is not None:
            updates.append(f"sms_enabled = ${param_idx}")
            params.append(sms_enabled)
            param_idx += 1

        if in_app_enabled is not None:
            updates.append(f"in_app_enabled = ${param_idx}")
            params.append(in_app_enabled)
            param_idx += 1

        if push_enabled is not None:
            updates.append(f"push_enabled = ${param_idx}")
            params.append(push_enabled)
            param_idx += 1

        if gallery_activity is not None:
            updates.append(f"gallery_activity_enabled = ${param_idx}")
            params.append(gallery_activity.enabled)
            param_idx += 1
            updates.append(f"gallery_activity_channels = ${param_idx}")
            params.append(self._channels_to_db(gallery_activity.channels))
            param_idx += 1
            updates.append(f"gallery_activity_frequency = ${param_idx}")
            params.append(gallery_activity.frequency.value)
            param_idx += 1

        if client_interactions is not None:
            updates.append(f"client_interactions_enabled = ${param_idx}")
            params.append(client_interactions.enabled)
            param_idx += 1
            updates.append(f"client_interactions_channels = ${param_idx}")
            params.append(self._channels_to_db(client_interactions.channels))
            param_idx += 1
            updates.append(f"client_interactions_frequency = ${param_idx}")
            params.append(client_interactions.frequency.value)
            param_idx += 1

        if system_alerts is not None:
            updates.append(f"system_alerts_enabled = ${param_idx}")
            params.append(system_alerts.enabled)
            param_idx += 1
            updates.append(f"system_alerts_channels = ${param_idx}")
            params.append(self._channels_to_db(system_alerts.channels))
            param_idx += 1

        if billing is not None:
            updates.append(f"billing_enabled = ${param_idx}")
            params.append(billing.enabled)
            param_idx += 1
            updates.append(f"billing_channels = ${param_idx}")
            params.append(self._channels_to_db(billing.channels))
            param_idx += 1

        if marketing is not None:
            updates.append(f"marketing_enabled = ${param_idx}")
            params.append(marketing.enabled)
            param_idx += 1
            updates.append(f"marketing_channels = ${param_idx}")
            params.append(self._channels_to_db(marketing.channels))
            param_idx += 1
            updates.append(f"marketing_frequency = ${param_idx}")
            params.append(marketing.frequency.value)
            param_idx += 1

        if invitation is not None:
            updates.append(f"invitation_enabled = ${param_idx}")
            params.append(invitation.enabled)
            param_idx += 1
            updates.append(f"invitation_channels = ${param_idx}")
            params.append(self._channels_to_db(invitation.channels))
            param_idx += 1
            updates.append(f"invitation_frequency = ${param_idx}")
            params.append(invitation.frequency.value)
            param_idx += 1

        if quiet_hours is not None:
            updates.append(f"quiet_hours_enabled = ${param_idx}")
            params.append(quiet_hours.enabled)
            param_idx += 1
            updates.append(f"quiet_hours_start = ${param_idx}")
            params.append(quiet_hours.start_time)
            param_idx += 1
            updates.append(f"quiet_hours_end = ${param_idx}")
            params.append(quiet_hours.end_time)
            param_idx += 1
            updates.append(f"quiet_hours_days = ${param_idx}")
            params.append(self._days_to_db(quiet_hours.days))
            param_idx += 1
            if quiet_hours.timezone:
                updates.append(f"timezone = ${param_idx}")
                params.append(quiet_hours.timezone)
                param_idx += 1

        if digest_schedule is not None:
            updates.append(f"daily_digest_time = ${param_idx}")
            params.append(digest_schedule.daily_digest_time)
            param_idx += 1
            updates.append(f"weekly_digest_day = ${param_idx}")
            params.append(digest_schedule.weekly_digest_day.value)
            param_idx += 1

        if language is not None:
            updates.append(f"language = ${param_idx}")
            params.append(language)
            param_idx += 1

        if timezone_str is not None:
            updates.append(f"timezone = ${param_idx}")
            params.append(timezone_str)
            param_idx += 1

        if transactional_email_enabled is not None:
            updates.append(f"transactional_email_enabled = ${param_idx}")
            params.append(transactional_email_enabled)
            param_idx += 1

        if metadata is not None:
            updates.append(f"metadata = ${param_idx}")
            params.append(json.dumps(metadata))
            param_idx += 1

        params.append(workspace_id)
        update_clause = ", ".join(updates)

        row = await fetchrow(
            f"""
            UPDATE notification_preferences
            SET {update_clause}
            WHERE preference_id = $1 AND workspace_id = ${param_idx}
            RETURNING *
            """,
            *params,
        )

        if row:
            preference = self._row_to_preference_response(row)
            # Invalidate cache
            if preference.user_id:
                await invalidate_preferences_cache(
                    str(preference.user_id),
                    str(workspace_id),
                )
            else:
                await redis_client.delete(
                    build_preferences_cache_key("defaults", str(workspace_id))
                )
            return preference

        return None

    async def update_user_preference(
        self,
        workspace_id: UUID,
        user_id: UUID,
        **kwargs: Any,
    ) -> Optional[PreferenceResponse]:
        """Update user preferences by user ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            user_id: User ID
            **kwargs: Fields to update (same as update_preference)

        Returns:
            Updated preference or None if not found
        """
        # Get preference ID for user
        preference_id = await fetchval(
            """
            SELECT preference_id FROM notification_preferences
            WHERE workspace_id = $1 AND user_id = $2
            """,
            workspace_id,
            user_id,
            read_only=True,
        )

        if not preference_id:
            return None

        return await self.update_preference(
            workspace_id=workspace_id,
            preference_id=preference_id,
            **kwargs,
        )

    async def toggle_channel(
        self,
        workspace_id: UUID,
        preference_id: UUID,
        channel: NotificationChannel,
        enabled: bool,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> Optional[PreferenceResponse]:
        """Toggle a specific channel on/off.

        Args:
            workspace_id: Workspace ID
            preference_id: Preference ID
            channel: Channel to toggle
            enabled: Whether to enable the channel
            update_source: Source of the update

        Returns:
            Updated preference or None if not found
        """
        column_map = {
            NotificationChannel.EMAIL: "email_enabled",
            NotificationChannel.SMS: "sms_enabled",
            NotificationChannel.IN_APP: "in_app_enabled",
            NotificationChannel.PUSH: "push_enabled",
        }

        column = column_map.get(channel)
        if not column:
            return None

        row = await fetchrow(
            f"""
            UPDATE notification_preferences
            SET {column} = $3, last_updated_source = $4
            WHERE preference_id = $1 AND workspace_id = $2
            RETURNING *
            """,
            preference_id,
            workspace_id,
            enabled,
            update_source.value,
        )

        if row:
            preference = self._row_to_preference_response(row)
            # Invalidate cache
            if preference.user_id:
                await invalidate_preferences_cache(
                    str(preference.user_id),
                    str(workspace_id),
                )
            return preference

        return None

    async def toggle_category(
        self,
        workspace_id: UUID,
        preference_id: UUID,
        category: NotificationCategory,
        enabled: bool,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> Optional[PreferenceResponse]:
        """Toggle a specific category on/off.

        Args:
            workspace_id: Workspace ID
            preference_id: Preference ID
            category: Category to toggle
            enabled: Whether to enable the category
            update_source: Source of the update

        Returns:
            Updated preference or None if not found
        """
        column_map = {
            NotificationCategory.GALLERY_ACTIVITY: "gallery_activity_enabled",
            NotificationCategory.CLIENT_INTERACTIONS: "client_interactions_enabled",
            NotificationCategory.SYSTEM_ALERTS: "system_alerts_enabled",
            NotificationCategory.BILLING: "billing_enabled",
            NotificationCategory.MARKETING: "marketing_enabled",
            NotificationCategory.INVITATION: "invitation_enabled",
        }

        column = column_map.get(category)
        if not column:
            return None

        row = await fetchrow(
            f"""
            UPDATE notification_preferences
            SET {column} = $3, last_updated_source = $4
            WHERE preference_id = $1 AND workspace_id = $2
            RETURNING *
            """,
            preference_id,
            workspace_id,
            enabled,
            update_source.value,
        )

        if row:
            preference = self._row_to_preference_response(row)
            # Invalidate cache
            if preference.user_id:
                await invalidate_preferences_cache(
                    str(preference.user_id),
                    str(workspace_id),
                )
            return preference

        return None

    async def set_global_unsubscribe(
        self,
        preference_id: UUID,
        unsubscribe: bool,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.UNSUBSCRIBE_LINK,
    ) -> Optional[PreferenceResponse]:
        """Set global unsubscribe status.

        When enabled, user receives no non-transactional notifications.
        Database trigger handles setting global_unsubscribe_at and disabling marketing.

        Args:
            preference_id: Preference ID
            unsubscribe: Whether to globally unsubscribe
            update_source: Source of the update

        Returns:
            Updated preference or None if not found
        """
        row = await fetchrow(
            """
            UPDATE notification_preferences
            SET global_unsubscribe = $2, last_updated_source = $3
            WHERE preference_id = $1
            RETURNING *
            """,
            preference_id,
            unsubscribe,
            update_source.value,
        )

        if row:
            preference = self._row_to_preference_response(row)
            # Invalidate cache
            if preference.user_id:
                await invalidate_preferences_cache(
                    str(preference.user_id),
                    str(preference.workspace_id),
                )
            return preference

        return None

    async def bulk_update_preferences(
        self,
        workspace_id: UUID,
        user_ids: list[UUID],
        updates: dict[str, Any],
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.ADMIN,
    ) -> tuple[int, int]:
        """Bulk update preferences for multiple users.

        Args:
            workspace_id: Workspace ID
            user_ids: List of user IDs to update
            updates: Dictionary of fields to update
            update_source: Source of the update

        Returns:
            Tuple of (updated count, failed count)
        """
        if not user_ids:
            return (0, 0)

        # Build update query
        set_clauses = ["last_updated_source = $1"]
        params: list[Any] = [update_source.value]
        param_idx = 2

        if "email_enabled" in updates:
            set_clauses.append(f"email_enabled = ${param_idx}")
            params.append(updates["email_enabled"])
            param_idx += 1

        if "marketing_enabled" in updates:
            set_clauses.append(f"marketing_enabled = ${param_idx}")
            params.append(updates["marketing_enabled"])
            param_idx += 1

        if "global_unsubscribe" in updates:
            set_clauses.append(f"global_unsubscribe = ${param_idx}")
            params.append(updates["global_unsubscribe"])
            param_idx += 1

        params.append(workspace_id)
        params.append(user_ids)
        set_clause = ", ".join(set_clauses)

        result = await fetchval(
            f"""
            WITH updated AS (
                UPDATE notification_preferences
                SET {set_clause}
                WHERE workspace_id = ${param_idx}
                  AND user_id = ANY(${param_idx + 1}::uuid[])
                RETURNING user_id
            )
            SELECT COUNT(*) FROM updated
            """,
            *params,
        )

        updated = result or 0
        failed = len(user_ids) - updated

        # Invalidate cache for all updated users
        for user_id in user_ids:
            await invalidate_preferences_cache(str(user_id), str(workspace_id))

        logger.info(
            f"Bulk updated {updated} preferences, {failed} failed",
            extra={"workspace_id": str(workspace_id)},
        )

        return (updated, failed)

    # =========================================================================
    # PREFERENCE CHECKING
    # =========================================================================

    async def check_notification_preference(
        self,
        request: PreferenceCheckRequest,
    ) -> PreferenceCheckResult:
        """Check if a notification should be sent based on user preferences.

        This is the main method used during notification processing to
        determine if a notification should be delivered.

        Args:
            request: PreferenceCheckRequest with user, category, and channel

        Returns:
            PreferenceCheckResult indicating if notification should be sent
        """
        # Get merged preferences (user + workspace defaults)
        merged = await self.get_merged_preferences(
            workspace_id=request.workspace_id,
            user_id=request.user_id,
        )

        # Check global unsubscribe
        if merged.global_unsubscribe:
            if request.is_transactional and merged.transactional_email_enabled:
                return PreferenceCheckResult(
                    should_send=True,
                    reason="Transactional notification allowed despite global unsubscribe",
                )
            return PreferenceCheckResult(
                should_send=False,
                reason="User has globally unsubscribed",
            )

        # Check channel enabled
        channel_enabled = {
            NotificationChannel.EMAIL: merged.email_enabled,
            NotificationChannel.SMS: merged.sms_enabled,
            NotificationChannel.IN_APP: merged.in_app_enabled,
            NotificationChannel.PUSH: merged.push_enabled,
        }

        if not channel_enabled.get(request.channel, False):
            if request.is_transactional and request.channel == NotificationChannel.EMAIL:
                if merged.transactional_email_enabled:
                    return PreferenceCheckResult(
                        should_send=True,
                        reason="Transactional email allowed despite channel disabled",
                    )
            return PreferenceCheckResult(
                should_send=False,
                reason=f"Channel {request.channel.value} is disabled",
            )

        # Get category preference
        category_pref = self._get_category_preference(merged, request.category)
        if not category_pref:
            return PreferenceCheckResult(
                should_send=True,
                reason="No specific category preference, using defaults",
            )

        # Check category enabled
        if not category_pref.enabled:
            return PreferenceCheckResult(
                should_send=False,
                reason=f"Category {request.category.value} is disabled",
            )

        # Check if channel is in category channels
        if request.channel not in category_pref.channels:
            return PreferenceCheckResult(
                should_send=False,
                reason=f"Channel {request.channel.value} not in category channels",
            )

        # Check quiet hours
        is_quiet, quiet_end = self._check_quiet_hours(merged.quiet_hours, merged.timezone)
        if is_quiet and not request.is_transactional:
            return PreferenceCheckResult(
                should_send=False,
                is_quiet_hours=True,
                delay_until=quiet_end,
                reason="Currently in quiet hours",
            )

        # Notification should be sent
        return PreferenceCheckResult(
            should_send=True,
            digest_frequency=category_pref.frequency,
        )

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete_preference(
        self,
        workspace_id: UUID,
        preference_id: UUID,
    ) -> bool:
        """Delete a notification preference.

        Args:
            workspace_id: Workspace ID for tenant isolation
            preference_id: Preference ID to delete

        Returns:
            True if deleted, False if not found
        """
        # Get user_id before deletion for cache invalidation
        row = await fetchrow(
            """
            DELETE FROM notification_preferences
            WHERE preference_id = $1 AND workspace_id = $2
            RETURNING user_id
            """,
            preference_id,
            workspace_id,
        )

        if row:
            user_id = row["user_id"]
            if user_id:
                await invalidate_preferences_cache(str(user_id), str(workspace_id))
            else:
                await redis_client.delete(
                    build_preferences_cache_key("defaults", str(workspace_id))
                )
            return True

        return False

    async def delete_user_preferences(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Delete all preferences for a user.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            True if deleted, False if not found
        """
        result = await fetchval(
            """
            DELETE FROM notification_preferences
            WHERE workspace_id = $1 AND user_id = $2
            RETURNING preference_id
            """,
            workspace_id,
            user_id,
        )

        if result:
            await invalidate_preferences_cache(str(user_id), str(workspace_id))
            return True

        return False

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_preference_stats(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get preference statistics for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Dictionary with preference statistics
        """
        row = await fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE user_id IS NOT NULL) as total_users,
                COUNT(*) FILTER (WHERE email_enabled = TRUE) as email_enabled_count,
                COUNT(*) FILTER (WHERE sms_enabled = TRUE) as sms_enabled_count,
                COUNT(*) FILTER (WHERE in_app_enabled = TRUE) as in_app_enabled_count,
                COUNT(*) FILTER (WHERE push_enabled = TRUE) as push_enabled_count,
                COUNT(*) FILTER (WHERE marketing_enabled = TRUE) as marketing_enabled_count,
                COUNT(*) FILTER (WHERE global_unsubscribe = TRUE) as global_unsubscribe_count,
                COUNT(*) FILTER (WHERE quiet_hours_enabled = TRUE) as quiet_hours_enabled_count
            FROM notification_preferences
            WHERE workspace_id = $1
            """,
            workspace_id,
            read_only=True,
        )

        return {
            "total_users": row["total_users"] or 0,
            "email_enabled": row["email_enabled_count"] or 0,
            "sms_enabled": row["sms_enabled_count"] or 0,
            "in_app_enabled": row["in_app_enabled_count"] or 0,
            "push_enabled": row["push_enabled_count"] or 0,
            "marketing_enabled": row["marketing_enabled_count"] or 0,
            "global_unsubscribe": row["global_unsubscribe_count"] or 0,
            "quiet_hours_enabled": row["quiet_hours_enabled_count"] or 0,
        }

    async def get_language_distribution(
        self,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """Get language distribution for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of language codes with user counts
        """
        rows = await fetch(
            """
            SELECT language, COUNT(*) as count
            FROM notification_preferences
            WHERE workspace_id = $1 AND user_id IS NOT NULL
            GROUP BY language
            ORDER BY count DESC
            """,
            workspace_id,
            read_only=True,
        )

        return [{"language": row["language"], "count": row["count"]} for row in rows]

    # =========================================================================
    # PRIVATE HELPER METHODS
    # =========================================================================

    def _channels_to_db(self, channels: list[NotificationChannel]) -> list[str]:
        """Convert channel list to database array format."""
        return [c.value for c in channels] if channels else []

    def _db_to_channels(self, db_channels: list[str]) -> list[NotificationChannel]:
        """Convert database array to channel list."""
        if not db_channels:
            return []
        return [NotificationChannel(c) for c in db_channels]

    def _days_to_db(self, days: list[DayOfWeek]) -> list[int]:
        """Convert day of week list to database array format."""
        return [d.value for d in days] if days else []

    def _db_to_days(self, db_days: list[int]) -> list[DayOfWeek]:
        """Convert database array to day of week list."""
        if not db_days:
            return []
        return [DayOfWeek(d) for d in db_days]

    def _get_category_preference(
        self,
        merged: MergedPreferences,
        category: NotificationCategory,
    ) -> Optional[CategoryPreference]:
        """Get category preference from merged preferences."""
        category_map = {
            NotificationCategory.GALLERY_ACTIVITY: merged.gallery_activity,
            NotificationCategory.CLIENT_INTERACTIONS: merged.client_interactions,
            NotificationCategory.SYSTEM_ALERTS: merged.system_alerts,
            NotificationCategory.BILLING: merged.billing,
            NotificationCategory.MARKETING: merged.marketing,
            NotificationCategory.INVITATION: merged.invitation,
        }
        return category_map.get(category)

    def _check_quiet_hours(
        self,
        quiet_hours: QuietHoursConfig,
        timezone_str: str,
    ) -> tuple[bool, Optional[datetime]]:
        """Check if currently in quiet hours.

        Returns:
            Tuple of (is_in_quiet_hours, quiet_hours_end_datetime)
        """
        if not quiet_hours.enabled:
            return (False, None)

        if not quiet_hours.start_time or not quiet_hours.end_time:
            return (False, None)

        try:
            from zoneinfo import ZoneInfo
        except ImportError:
            from backports.zoneinfo import ZoneInfo

        try:
            tz = ZoneInfo(quiet_hours.timezone or timezone_str or "UTC")
        except Exception:
            tz = ZoneInfo("UTC")

        now = datetime.now(tz)
        current_time = now.time()
        current_day = now.weekday()
        # Convert Python weekday (0=Monday) to our format (0=Sunday)
        current_day_of_week = (current_day + 1) % 7

        # Check if current day is in quiet hours days
        if quiet_hours.days:
            day_values = [d.value if isinstance(d, DayOfWeek) else d for d in quiet_hours.days]
            if current_day_of_week not in day_values:
                return (False, None)

        start = quiet_hours.start_time
        end = quiet_hours.end_time

        # Handle overnight quiet hours (e.g., 22:00 - 08:00)
        if start > end:
            # Quiet hours span midnight
            is_quiet = current_time >= start or current_time <= end
        else:
            # Quiet hours within same day
            is_quiet = start <= current_time <= end

        if is_quiet:
            # Calculate quiet hours end datetime
            if start > end:
                # Overnight - end is tomorrow if we're after start, today if we're before end
                if current_time >= start:
                    # End is tomorrow
                    end_dt = datetime.combine(now.date(), end, tzinfo=tz)
                    from datetime import timedelta
                    end_dt += timedelta(days=1)
                else:
                    # End is today
                    end_dt = datetime.combine(now.date(), end, tzinfo=tz)
            else:
                # Same day
                end_dt = datetime.combine(now.date(), end, tzinfo=tz)

            return (True, end_dt)

        return (False, None)

    def _row_to_preference_response(self, row: asyncpg.Record) -> PreferenceResponse:
        """Convert database row to PreferenceResponse schema."""
        return PreferenceResponse(
            preference_id=row["preference_id"],
            workspace_id=row["workspace_id"],
            user_id=row["user_id"],
            email_enabled=row["email_enabled"],
            sms_enabled=row["sms_enabled"],
            in_app_enabled=row["in_app_enabled"],
            push_enabled=row["push_enabled"],
            gallery_activity=CategoryPreference(
                enabled=row["gallery_activity_enabled"],
                channels=self._db_to_channels(row["gallery_activity_channels"]),
                frequency=DigestFrequency(row["gallery_activity_frequency"]) if row["gallery_activity_frequency"] else DigestFrequency.INSTANT,
            ),
            client_interactions=CategoryPreference(
                enabled=row["client_interactions_enabled"],
                channels=self._db_to_channels(row["client_interactions_channels"]),
                frequency=DigestFrequency(row["client_interactions_frequency"]) if row["client_interactions_frequency"] else DigestFrequency.INSTANT,
            ),
            system_alerts=CategoryPreference(
                enabled=row["system_alerts_enabled"],
                channels=self._db_to_channels(row["system_alerts_channels"]),
                frequency=DigestFrequency.INSTANT,  # System alerts are always instant
            ),
            billing=CategoryPreference(
                enabled=row["billing_enabled"],
                channels=self._db_to_channels(row["billing_channels"]),
                frequency=DigestFrequency.INSTANT,  # Billing is always instant
            ),
            marketing=CategoryPreference(
                enabled=row["marketing_enabled"],
                channels=self._db_to_channels(row["marketing_channels"]),
                frequency=DigestFrequency(row["marketing_frequency"]) if row["marketing_frequency"] else DigestFrequency.WEEKLY,
            ),
            invitation=CategoryPreference(
                enabled=row["invitation_enabled"],
                channels=self._db_to_channels(row["invitation_channels"]),
                frequency=DigestFrequency(row["invitation_frequency"]) if row["invitation_frequency"] else DigestFrequency.INSTANT,
            ),
            quiet_hours=QuietHoursConfig(
                enabled=row["quiet_hours_enabled"],
                start_time=row["quiet_hours_start"],
                end_time=row["quiet_hours_end"],
                timezone=row["timezone"],
                days=self._db_to_days(row["quiet_hours_days"]) if row["quiet_hours_days"] else list(DayOfWeek),
            ),
            digest_schedule=DigestSchedule(
                daily_digest_time=row["daily_digest_time"] or time(9, 0),
                weekly_digest_day=DayOfWeek(row["weekly_digest_day"]) if row["weekly_digest_day"] is not None else DayOfWeek.MONDAY,
            ),
            language=row["language"],
            timezone=row["timezone"],
            transactional_email_enabled=row["transactional_email_enabled"],
            global_unsubscribe=row["global_unsubscribe"],
            global_unsubscribe_at=row["global_unsubscribe_at"],
            unsubscribe_token=row["unsubscribe_token"],
            metadata=row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}"),
            last_updated_source=PreferenceUpdateSource(row["last_updated_source"]) if row["last_updated_source"] else PreferenceUpdateSource.USER,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _row_to_preference_summary(self, row: asyncpg.Record) -> PreferenceSummary:
        """Convert database row to PreferenceSummary schema."""
        return PreferenceSummary(
            preference_id=row["preference_id"],
            workspace_id=row["workspace_id"],
            user_id=row["user_id"],
            email_enabled=row["email_enabled"],
            sms_enabled=row["sms_enabled"],
            in_app_enabled=row["in_app_enabled"],
            push_enabled=row["push_enabled"],
            global_unsubscribe=row["global_unsubscribe"],
            language=row["language"],
            timezone=row["timezone"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# Singleton instance for use across the application
preference_repository = PreferenceRepository()
