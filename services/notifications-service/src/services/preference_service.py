"""Preference service for managing notification preferences.

This module provides the PreferenceService class that handles all business logic
for notification preference management, including:
- User preference CRUD operations
- Workspace default management
- Preference validation and enforcement
- Unsubscribe/resubscribe workflows
- Bulk preference operations
- Preference export/import for data portability

The service acts as the intermediary between API endpoints and the
PreferenceRepository, adding business logic, validation, and audit logging.

Features:
- Workspace-level default preference management
- User-specific preference overrides
- Quiet hours / Do-Not-Disturb enforcement
- Global and category-specific unsubscribe handling
- Preference merging (user + workspace defaults)
- Bulk operations with validation
- Export/import for GDPR compliance

Feature: Notifications & Communication Microservice
Task: T025 - Create preference_service.py
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from src.cache.redis_client import (
    invalidate_preferences_cache,
    redis_client,
)
from src.config import settings
from src.observability.metrics import get_metrics
from src.repositories.preference_repository import preference_repository
from src.schemas.notification import (
    NotificationCategory,
    NotificationChannel,
    PaginationMeta,
)
from src.schemas.preference import (
    BulkPreferenceUpdateRequest,
    BulkPreferenceUpdateResponse,
    CategoryPreference,
    DigestFrequency,
    DigestSchedule,
    DayOfWeek,
    MergedPreferences,
    PreferenceCheckRequest,
    PreferenceCheckResult,
    PreferenceCreateRequest,
    PreferenceExport,
    PreferenceImportRequest,
    PreferenceListResponse,
    PreferenceResponse,
    PreferenceSummary,
    PreferenceUpdateRequest,
    PreferenceUpdateSource,
    QuietHoursConfig,
    ResubscribeRequest,
    UnsubscribeRequest,
)

logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class PreferenceServiceError(Exception):
    """Base exception for preference service errors."""

    def __init__(
        self,
        message: str,
        code: str,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class PreferenceNotFoundError(PreferenceServiceError):
    """Preference not found."""

    def __init__(self, preference_id: Optional[UUID] = None, user_id: Optional[UUID] = None):
        if preference_id:
            msg = f"Preference not found: {preference_id}"
        elif user_id:
            msg = f"Preference not found for user: {user_id}"
        else:
            msg = "Preference not found"
        super().__init__(
            msg,
            "PREFERENCE_NOT_FOUND",
            {"preference_id": str(preference_id) if preference_id else None, "user_id": str(user_id) if user_id else None},
        )


class PreferenceAlreadyExistsError(PreferenceServiceError):
    """Preference already exists for user/workspace."""

    def __init__(self, user_id: Optional[UUID] = None, workspace_id: Optional[UUID] = None):
        super().__init__(
            f"Preference already exists for user {user_id} in workspace {workspace_id}",
            "PREFERENCE_ALREADY_EXISTS",
            {"user_id": str(user_id) if user_id else None, "workspace_id": str(workspace_id) if workspace_id else None},
        )


class InvalidUnsubscribeTokenError(PreferenceServiceError):
    """Invalid or expired unsubscribe token."""

    def __init__(self, token: UUID):
        super().__init__(
            f"Invalid or expired unsubscribe token: {token}",
            "INVALID_UNSUBSCRIBE_TOKEN",
            {"token": str(token)},
        )


class PreferenceValidationError(PreferenceServiceError):
    """Preference validation failed."""

    def __init__(self, message: str, field: Optional[str] = None):
        super().__init__(
            message,
            "PREFERENCE_VALIDATION_ERROR",
            {"field": field} if field else {},
        )


# =============================================================================
# PREFERENCE SERVICE
# =============================================================================


class PreferenceService:
    """Service for managing notification preferences.

    Handles all business logic for notification preferences including:
    - CRUD operations with validation
    - Preference merging (user + workspace defaults)
    - Unsubscribe/resubscribe workflows
    - Bulk operations
    - Export/import for data portability

    Usage:
        service = PreferenceService()

        # Get user preferences (or workspace defaults if not set)
        prefs = await service.get_effective_preferences(workspace_id, user_id)

        # Update user preferences
        updated = await service.update_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
            request=PreferenceUpdateRequest(email_enabled=False),
        )

        # Process unsubscribe from email link
        result = await service.process_unsubscribe(
            token=token,
            category=NotificationCategory.MARKETING,
        )
    """

    def __init__(self):
        """Initialize the preference service."""
        self._metrics = get_metrics()
        # Categories that cannot be disabled (transactional)
        self._protected_categories = set(settings.TRANSACTIONAL_CATEGORIES)

    # =========================================================================
    # PUBLIC METHODS - Preference Retrieval
    # =========================================================================

    async def get_preference(
        self,
        workspace_id: UUID,
        preference_id: UUID,
    ) -> PreferenceResponse:
        """Get a preference by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            preference_id: Preference ID to retrieve

        Returns:
            PreferenceResponse

        Raises:
            PreferenceNotFoundError: If preference not found
        """
        preference = await preference_repository.get_preference(
            workspace_id=workspace_id,
            preference_id=preference_id,
        )

        if not preference:
            raise PreferenceNotFoundError(preference_id=preference_id)

        return preference

    async def get_user_preference(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> Optional[PreferenceResponse]:
        """Get notification preferences for a specific user.

        Returns None if user has no custom preferences set.
        Use get_effective_preferences() to get merged preferences with defaults.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            PreferenceResponse or None if not set
        """
        return await preference_repository.get_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
        )

    async def get_or_create_user_preference(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> PreferenceResponse:
        """Get user preference or create with workspace defaults.

        Creates a new preference record for the user if none exists,
        using workspace defaults as the template.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            User's preference (existing or newly created)
        """
        preference = await preference_repository.get_or_create_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        logger.info(
            "Got or created user preference",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "preference_id": str(preference.preference_id),
            },
        )

        return preference

    async def get_effective_preferences(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> MergedPreferences:
        """Get effective preferences by merging user and workspace defaults.

        This is the main method for getting a user's notification preferences.
        It returns merged preferences where user settings take precedence
        over workspace defaults.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            MergedPreferences with effective settings
        """
        merged = await preference_repository.get_merged_preferences(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        return merged

    async def get_workspace_defaults(
        self,
        workspace_id: UUID,
    ) -> Optional[PreferenceResponse]:
        """Get workspace default notification preferences.

        Args:
            workspace_id: Workspace ID

        Returns:
            Workspace default preferences or None if not set
        """
        return await preference_repository.get_workspace_defaults(workspace_id)

    async def list_preferences(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        include_defaults: bool = False,
        email_enabled: Optional[bool] = None,
        global_unsubscribe: Optional[bool] = None,
        language: Optional[str] = None,
    ) -> PreferenceListResponse:
        """List notification preferences for a workspace with filtering.

        Args:
            workspace_id: Workspace ID
            page: Page number (1-indexed)
            limit: Items per page (max 100)
            include_defaults: Include workspace defaults in list
            email_enabled: Filter by email enabled status
            global_unsubscribe: Filter by global unsubscribe status
            language: Filter by language

        Returns:
            PreferenceListResponse with paginated preferences
        """
        # Clamp limit to prevent abuse
        limit = min(limit, 100)

        preferences, meta = await preference_repository.list_preferences(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            include_defaults=include_defaults,
            email_enabled=email_enabled,
            global_unsubscribe=global_unsubscribe,
            language=language,
        )

        return PreferenceListResponse(data=preferences, meta=meta)

    # =========================================================================
    # PUBLIC METHODS - Preference Creation
    # =========================================================================

    async def create_preference(
        self,
        workspace_id: UUID,
        request: PreferenceCreateRequest,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Create notification preferences for a user or workspace defaults.

        Args:
            workspace_id: Workspace ID
            request: Creation request
            update_source: Source of the update

        Returns:
            Created PreferenceResponse

        Raises:
            PreferenceAlreadyExistsError: If preference already exists
        """
        # Check if preference already exists
        if request.user_id:
            existing = await preference_repository.get_user_preference(
                workspace_id=workspace_id,
                user_id=request.user_id,
            )
            if existing:
                raise PreferenceAlreadyExistsError(
                    user_id=request.user_id,
                    workspace_id=workspace_id,
                )
        else:
            # Check for existing workspace defaults
            existing = await preference_repository.get_workspace_defaults(workspace_id)
            if existing:
                raise PreferenceAlreadyExistsError(workspace_id=workspace_id)

        # Create the preference
        preference = await preference_repository.create_preference(
            workspace_id=workspace_id,
            user_id=request.user_id,
            email_enabled=request.email_enabled,
            sms_enabled=request.sms_enabled,
            in_app_enabled=request.in_app_enabled,
            push_enabled=request.push_enabled,
            gallery_activity=request.gallery_activity,
            client_interactions=request.client_interactions,
            system_alerts=request.system_alerts,
            billing=request.billing,
            marketing=request.marketing,
            invitation=request.invitation,
            quiet_hours=request.quiet_hours,
            digest_schedule=request.digest_schedule,
            language=request.language,
            timezone_str=request.timezone,
            transactional_email_enabled=request.transactional_email_enabled,
            metadata=request.metadata,
            update_source=update_source,
        )

        logger.info(
            "Created notification preference",
            extra={
                "preference_id": str(preference.preference_id),
                "workspace_id": str(workspace_id),
                "user_id": str(request.user_id) if request.user_id else "workspace_defaults",
            },
        )

        return preference

    async def create_workspace_defaults(
        self,
        workspace_id: UUID,
        request: Optional[PreferenceCreateRequest] = None,
    ) -> PreferenceResponse:
        """Create or get workspace default preferences.

        If defaults already exist, returns the existing defaults.
        Otherwise creates new defaults based on request or system defaults.

        Args:
            workspace_id: Workspace ID
            request: Optional creation request

        Returns:
            Workspace default preferences
        """
        # Check if defaults already exist
        existing = await preference_repository.get_workspace_defaults(workspace_id)
        if existing:
            return existing

        # Create with request parameters or system defaults
        if request:
            request.user_id = None  # Ensure it's workspace defaults
            return await self.create_preference(
                workspace_id=workspace_id,
                request=request,
                update_source=PreferenceUpdateSource.ADMIN,
            )
        else:
            return await preference_repository.create_workspace_defaults(workspace_id)

    # =========================================================================
    # PUBLIC METHODS - Preference Updates
    # =========================================================================

    async def update_preference(
        self,
        workspace_id: UUID,
        preference_id: UUID,
        request: PreferenceUpdateRequest,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Update notification preferences.

        Only provided fields are updated.

        Args:
            workspace_id: Workspace ID
            preference_id: Preference ID to update
            request: Update request
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse

        Raises:
            PreferenceNotFoundError: If preference not found
        """
        # Validate the update
        self._validate_preference_update(request)

        updated = await preference_repository.update_preference(
            workspace_id=workspace_id,
            preference_id=preference_id,
            email_enabled=request.email_enabled,
            sms_enabled=request.sms_enabled,
            in_app_enabled=request.in_app_enabled,
            push_enabled=request.push_enabled,
            gallery_activity=request.gallery_activity,
            client_interactions=request.client_interactions,
            system_alerts=request.system_alerts,
            billing=request.billing,
            marketing=request.marketing,
            invitation=request.invitation,
            quiet_hours=request.quiet_hours,
            digest_schedule=request.digest_schedule,
            language=request.language,
            timezone_str=request.timezone,
            transactional_email_enabled=request.transactional_email_enabled,
            metadata=request.metadata,
            update_source=update_source,
        )

        if not updated:
            raise PreferenceNotFoundError(preference_id=preference_id)

        logger.info(
            "Updated notification preference",
            extra={
                "preference_id": str(preference_id),
                "workspace_id": str(workspace_id),
                "source": update_source.value,
            },
        )

        # Track preference update in metrics
        self._metrics.preference_updated(source=update_source.value)

        return updated

    async def update_user_preference(
        self,
        workspace_id: UUID,
        user_id: UUID,
        request: PreferenceUpdateRequest,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Update preferences for a specific user.

        Creates preference if it doesn't exist.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            request: Update request
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse
        """
        # Get or create user preference first
        preference = await self.get_or_create_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        # Now update it
        return await self.update_preference(
            workspace_id=workspace_id,
            preference_id=preference.preference_id,
            request=request,
            update_source=update_source,
        )

    async def toggle_channel(
        self,
        workspace_id: UUID,
        user_id: UUID,
        channel: NotificationChannel,
        enabled: bool,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Toggle a notification channel on/off for a user.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            channel: Channel to toggle
            enabled: Whether to enable the channel
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse
        """
        # Get or create user preference
        preference = await self.get_or_create_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        updated = await preference_repository.toggle_channel(
            workspace_id=workspace_id,
            preference_id=preference.preference_id,
            channel=channel,
            enabled=enabled,
            update_source=update_source,
        )

        if not updated:
            raise PreferenceNotFoundError(preference_id=preference.preference_id)

        logger.info(
            f"Toggled channel {channel.value} to {enabled}",
            extra={
                "user_id": str(user_id),
                "workspace_id": str(workspace_id),
                "channel": channel.value,
                "enabled": enabled,
            },
        )

        return updated

    async def toggle_category(
        self,
        workspace_id: UUID,
        user_id: UUID,
        category: NotificationCategory,
        enabled: bool,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Toggle a notification category on/off for a user.

        Protected categories (billing, security) cannot be disabled.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            category: Category to toggle
            enabled: Whether to enable the category
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse

        Raises:
            PreferenceValidationError: If trying to disable protected category
        """
        # Check if category is protected
        if not enabled and category.value in self._protected_categories:
            raise PreferenceValidationError(
                f"Cannot disable protected category: {category.value}",
                field="category",
            )

        # Get or create user preference
        preference = await self.get_or_create_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        updated = await preference_repository.toggle_category(
            workspace_id=workspace_id,
            preference_id=preference.preference_id,
            category=category,
            enabled=enabled,
            update_source=update_source,
        )

        if not updated:
            raise PreferenceNotFoundError(preference_id=preference.preference_id)

        logger.info(
            f"Toggled category {category.value} to {enabled}",
            extra={
                "user_id": str(user_id),
                "workspace_id": str(workspace_id),
                "category": category.value,
                "enabled": enabled,
            },
        )

        return updated

    async def update_quiet_hours(
        self,
        workspace_id: UUID,
        user_id: UUID,
        quiet_hours: QuietHoursConfig,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Update quiet hours configuration for a user.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            quiet_hours: Quiet hours configuration
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse
        """
        return await self.update_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
            request=PreferenceUpdateRequest(quiet_hours=quiet_hours),
            update_source=update_source,
        )

    async def update_digest_schedule(
        self,
        workspace_id: UUID,
        user_id: UUID,
        digest_schedule: DigestSchedule,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Update digest schedule configuration for a user.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            digest_schedule: Digest schedule configuration
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse
        """
        return await self.update_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
            request=PreferenceUpdateRequest(digest_schedule=digest_schedule),
            update_source=update_source,
        )

    async def update_language(
        self,
        workspace_id: UUID,
        user_id: UUID,
        language: str,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Update notification language preference for a user.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            language: ISO 639-1 language code
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse
        """
        # Validate language code
        if len(language) > 5:
            raise PreferenceValidationError(
                "Language code must be 5 characters or less",
                field="language",
            )

        return await self.update_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
            request=PreferenceUpdateRequest(language=language),
            update_source=update_source,
        )

    # =========================================================================
    # PUBLIC METHODS - Unsubscribe/Resubscribe
    # =========================================================================

    async def process_unsubscribe(
        self,
        request: UnsubscribeRequest,
    ) -> PreferenceResponse:
        """Process an unsubscribe request from an email link.

        Can unsubscribe from a specific category or globally.

        Args:
            request: Unsubscribe request with token

        Returns:
            Updated PreferenceResponse

        Raises:
            InvalidUnsubscribeTokenError: If token is invalid
        """
        # Get preference by unsubscribe token
        preference = await preference_repository.get_preference_by_unsubscribe_token(
            token=request.token,
        )

        if not preference:
            raise InvalidUnsubscribeTokenError(request.token)

        # If no specific category, do global unsubscribe
        if not request.category:
            updated = await preference_repository.set_global_unsubscribe(
                preference_id=preference.preference_id,
                unsubscribe=True,
                update_source=PreferenceUpdateSource.UNSUBSCRIBE_LINK,
            )
        else:
            # Unsubscribe from specific category
            updated = await preference_repository.toggle_category(
                workspace_id=preference.workspace_id,
                preference_id=preference.preference_id,
                category=request.category,
                enabled=False,
                update_source=PreferenceUpdateSource.UNSUBSCRIBE_LINK,
            )

        if not updated:
            raise PreferenceNotFoundError(preference_id=preference.preference_id)

        logger.info(
            "Processed unsubscribe request",
            extra={
                "preference_id": str(preference.preference_id),
                "category": request.category.value if request.category else "global",
                "reason": request.reason,
            },
        )

        # Track unsubscribe in metrics
        category = request.category.value if request.category else "global"
        self._metrics.unsubscribe_processed(category=category)

        return updated

    async def process_resubscribe(
        self,
        workspace_id: UUID,
        user_id: UUID,
        request: ResubscribeRequest,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Process a resubscribe request.

        Enables specified categories or all non-marketing categories.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            request: Resubscribe request
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse
        """
        # Get or create user preference
        preference = await self.get_or_create_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        # Clear global unsubscribe
        updated = await preference_repository.set_global_unsubscribe(
            preference_id=preference.preference_id,
            unsubscribe=False,
            update_source=update_source,
        )

        if not updated:
            raise PreferenceNotFoundError(preference_id=preference.preference_id)

        # If specific categories requested, enable them
        if request.categories:
            for category in request.categories:
                await preference_repository.toggle_category(
                    workspace_id=workspace_id,
                    preference_id=preference.preference_id,
                    category=category,
                    enabled=True,
                    update_source=update_source,
                )
        else:
            # Enable all non-marketing categories by default
            non_marketing_categories = [
                NotificationCategory.GALLERY_ACTIVITY,
                NotificationCategory.CLIENT_INTERACTIONS,
                NotificationCategory.SYSTEM_ALERTS,
                NotificationCategory.BILLING,
                NotificationCategory.INVITATION,
            ]
            for category in non_marketing_categories:
                await preference_repository.toggle_category(
                    workspace_id=workspace_id,
                    preference_id=preference.preference_id,
                    category=category,
                    enabled=True,
                    update_source=update_source,
                )

        # Fetch final state
        result = await preference_repository.get_preference(
            workspace_id=workspace_id,
            preference_id=preference.preference_id,
        )

        logger.info(
            "Processed resubscribe request",
            extra={
                "user_id": str(user_id),
                "categories": [c.value for c in request.categories] if request.categories else "all_non_marketing",
            },
        )

        return result

    async def set_global_unsubscribe(
        self,
        workspace_id: UUID,
        user_id: UUID,
        unsubscribe: bool,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.USER,
    ) -> PreferenceResponse:
        """Set global unsubscribe status for a user.

        When globally unsubscribed, only transactional notifications are sent.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            unsubscribe: Whether to globally unsubscribe
            update_source: Source of the update

        Returns:
            Updated PreferenceResponse
        """
        # Get or create user preference
        preference = await self.get_or_create_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        updated = await preference_repository.set_global_unsubscribe(
            preference_id=preference.preference_id,
            unsubscribe=unsubscribe,
            update_source=update_source,
        )

        if not updated:
            raise PreferenceNotFoundError(preference_id=preference.preference_id)

        logger.info(
            f"Set global unsubscribe to {unsubscribe}",
            extra={
                "user_id": str(user_id),
                "workspace_id": str(workspace_id),
            },
        )

        return updated

    # =========================================================================
    # PUBLIC METHODS - Bulk Operations
    # =========================================================================

    async def bulk_update_preferences(
        self,
        workspace_id: UUID,
        request: BulkPreferenceUpdateRequest,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.ADMIN,
    ) -> BulkPreferenceUpdateResponse:
        """Bulk update preferences for multiple users.

        Args:
            workspace_id: Workspace ID
            request: Bulk update request
            update_source: Source of the update

        Returns:
            BulkPreferenceUpdateResponse with counts
        """
        # Convert request updates to dict
        updates: dict[str, Any] = {}
        if request.updates.email_enabled is not None:
            updates["email_enabled"] = request.updates.email_enabled
        if request.updates.marketing is not None:
            updates["marketing_enabled"] = request.updates.marketing.enabled

        # Use global_unsubscribe if we need to update that
        # Note: For more fields, extend the repository method

        updated, failed = await preference_repository.bulk_update_preferences(
            workspace_id=workspace_id,
            user_ids=request.user_ids,
            updates=updates,
            update_source=update_source,
        )

        logger.info(
            "Bulk updated preferences",
            extra={
                "workspace_id": str(workspace_id),
                "total_users": len(request.user_ids),
                "updated": updated,
                "failed": failed,
            },
        )

        return BulkPreferenceUpdateResponse(
            updated=updated,
            failed=failed,
            errors=[],
        )

    async def get_marketing_enabled_users(
        self,
        workspace_id: UUID,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[UUID]:
        """Get list of user IDs with marketing enabled.

        Used for marketing campaign targeting.

        Args:
            workspace_id: Workspace ID
            limit: Maximum number of users
            offset: Offset for pagination

        Returns:
            List of user IDs with marketing enabled
        """
        return await preference_repository.list_marketing_enabled_users(
            workspace_id=workspace_id,
            limit=limit,
            offset=offset,
        )

    async def get_users_by_language(
        self,
        workspace_id: UUID,
        language: str,
        limit: int = 1000,
    ) -> list[UUID]:
        """Get user IDs by preferred language.

        Args:
            workspace_id: Workspace ID
            language: ISO 639-1 language code
            limit: Maximum number of users

        Returns:
            List of user IDs with the specified language
        """
        return await preference_repository.get_users_by_language(
            workspace_id=workspace_id,
            language=language,
            limit=limit,
        )

    # =========================================================================
    # PUBLIC METHODS - Preference Check
    # =========================================================================

    async def check_notification_preference(
        self,
        workspace_id: UUID,
        user_id: UUID,
        category: NotificationCategory,
        channel: NotificationChannel,
        is_transactional: bool = False,
    ) -> PreferenceCheckResult:
        """Check if a notification should be sent based on user preferences.

        This is the main method used during notification processing.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            category: Notification category
            channel: Delivery channel
            is_transactional: Whether this is a transactional notification

        Returns:
            PreferenceCheckResult indicating if notification should be sent
        """
        return await preference_repository.check_notification_preference(
            request=PreferenceCheckRequest(
                workspace_id=workspace_id,
                user_id=user_id,
                category=category,
                channel=channel,
                is_transactional=is_transactional,
            )
        )

    async def is_channel_enabled(
        self,
        workspace_id: UUID,
        user_id: UUID,
        channel: NotificationChannel,
    ) -> bool:
        """Check if a specific channel is enabled for a user.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            channel: Channel to check

        Returns:
            True if channel is enabled
        """
        merged = await self.get_effective_preferences(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        channel_map = {
            NotificationChannel.EMAIL: merged.email_enabled,
            NotificationChannel.SMS: merged.sms_enabled,
            NotificationChannel.IN_APP: merged.in_app_enabled,
            NotificationChannel.PUSH: merged.push_enabled,
        }

        return channel_map.get(channel, False)

    async def is_category_enabled(
        self,
        workspace_id: UUID,
        user_id: UUID,
        category: NotificationCategory,
    ) -> bool:
        """Check if a specific category is enabled for a user.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            category: Category to check

        Returns:
            True if category is enabled
        """
        merged = await self.get_effective_preferences(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        # Check global unsubscribe first
        if merged.global_unsubscribe:
            return False

        category_map = {
            NotificationCategory.GALLERY_ACTIVITY: merged.gallery_activity,
            NotificationCategory.CLIENT_INTERACTIONS: merged.client_interactions,
            NotificationCategory.SYSTEM_ALERTS: merged.system_alerts,
            NotificationCategory.BILLING: merged.billing,
            NotificationCategory.MARKETING: merged.marketing,
            NotificationCategory.INVITATION: merged.invitation,
        }

        cat_pref = category_map.get(category)
        return cat_pref.enabled if cat_pref else True

    # =========================================================================
    # PUBLIC METHODS - Export/Import
    # =========================================================================

    async def export_preferences(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> PreferenceExport:
        """Export user's notification preferences for data portability.

        Supports GDPR data export requirements.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            PreferenceExport with all preference data
        """
        preference = await self.get_or_create_user_preference(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        return PreferenceExport(
            workspace_id=preference.workspace_id,
            user_id=preference.user_id,
            email_enabled=preference.email_enabled,
            sms_enabled=preference.sms_enabled,
            in_app_enabled=preference.in_app_enabled,
            push_enabled=preference.push_enabled,
            gallery_activity=preference.gallery_activity,
            client_interactions=preference.client_interactions,
            system_alerts=preference.system_alerts,
            billing=preference.billing,
            marketing=preference.marketing,
            invitation=preference.invitation,
            quiet_hours=preference.quiet_hours,
            digest_schedule=preference.digest_schedule,
            language=preference.language,
            timezone=preference.timezone,
            transactional_email_enabled=preference.transactional_email_enabled,
            global_unsubscribe=preference.global_unsubscribe,
            metadata=preference.metadata,
            exported_at=datetime.now(timezone.utc),
        )

    async def import_preferences(
        self,
        workspace_id: UUID,
        user_id: UUID,
        request: PreferenceImportRequest,
        update_source: PreferenceUpdateSource = PreferenceUpdateSource.API,
    ) -> PreferenceResponse:
        """Import notification preferences from export data.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            request: Import request with preference data
            update_source: Source of the update

        Returns:
            Imported PreferenceResponse
        """
        data = request.data

        # Get or create preference
        if request.overwrite:
            # Delete existing and create new
            await preference_repository.delete_user_preferences(
                workspace_id=workspace_id,
                user_id=user_id,
            )
            preference = await preference_repository.create_preference(
                workspace_id=workspace_id,
                user_id=user_id,
                email_enabled=data.email_enabled,
                sms_enabled=data.sms_enabled,
                in_app_enabled=data.in_app_enabled,
                push_enabled=data.push_enabled,
                gallery_activity=data.gallery_activity,
                client_interactions=data.client_interactions,
                system_alerts=data.system_alerts,
                billing=data.billing,
                marketing=data.marketing,
                invitation=data.invitation,
                quiet_hours=data.quiet_hours,
                digest_schedule=data.digest_schedule,
                language=data.language,
                timezone_str=data.timezone,
                transactional_email_enabled=data.transactional_email_enabled,
                metadata=data.metadata,
                update_source=update_source,
            )
        else:
            # Merge with existing
            preference = await self.update_user_preference(
                workspace_id=workspace_id,
                user_id=user_id,
                request=PreferenceUpdateRequest(
                    email_enabled=data.email_enabled,
                    sms_enabled=data.sms_enabled,
                    in_app_enabled=data.in_app_enabled,
                    push_enabled=data.push_enabled,
                    gallery_activity=data.gallery_activity,
                    client_interactions=data.client_interactions,
                    system_alerts=data.system_alerts,
                    billing=data.billing,
                    marketing=data.marketing,
                    invitation=data.invitation,
                    quiet_hours=data.quiet_hours,
                    digest_schedule=data.digest_schedule,
                    language=data.language,
                    timezone=data.timezone,
                    transactional_email_enabled=data.transactional_email_enabled,
                    metadata=data.metadata,
                ),
                update_source=update_source,
            )

        logger.info(
            "Imported notification preferences",
            extra={
                "user_id": str(user_id),
                "workspace_id": str(workspace_id),
                "overwrite": request.overwrite,
            },
        )

        return preference

    # =========================================================================
    # PUBLIC METHODS - Deletion
    # =========================================================================

    async def delete_preference(
        self,
        workspace_id: UUID,
        preference_id: UUID,
    ) -> bool:
        """Delete a notification preference.

        Args:
            workspace_id: Workspace ID
            preference_id: Preference ID to delete

        Returns:
            True if deleted, False if not found
        """
        deleted = await preference_repository.delete_preference(
            workspace_id=workspace_id,
            preference_id=preference_id,
        )

        if deleted:
            logger.info(
                "Deleted notification preference",
                extra={
                    "preference_id": str(preference_id),
                    "workspace_id": str(workspace_id),
                },
            )

        return deleted

    async def delete_user_preferences(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Delete all preferences for a user.

        Used for account deletion / GDPR right to erasure.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            True if deleted, False if not found
        """
        deleted = await preference_repository.delete_user_preferences(
            workspace_id=workspace_id,
            user_id=user_id,
        )

        if deleted:
            logger.info(
                "Deleted user notification preferences",
                extra={
                    "user_id": str(user_id),
                    "workspace_id": str(workspace_id),
                },
            )

        return deleted

    # =========================================================================
    # PUBLIC METHODS - Statistics
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
        return await preference_repository.get_preference_stats(workspace_id)

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
        return await preference_repository.get_language_distribution(workspace_id)

    # =========================================================================
    # PRIVATE METHODS - Validation
    # =========================================================================

    def _validate_preference_update(
        self,
        request: PreferenceUpdateRequest,
    ) -> None:
        """Validate a preference update request.

        Args:
            request: Update request to validate

        Raises:
            PreferenceValidationError: If validation fails
        """
        # Validate language code if provided
        if request.language is not None and len(request.language) > 5:
            raise PreferenceValidationError(
                "Language code must be 5 characters or less",
                field="language",
            )

        # Validate timezone if provided
        if request.timezone is not None and len(request.timezone) > 50:
            raise PreferenceValidationError(
                "Timezone must be 50 characters or less",
                field="timezone",
            )

        # Validate quiet hours if provided
        if request.quiet_hours is not None:
            qh = request.quiet_hours
            if qh.enabled:
                if qh.start_time is None or qh.end_time is None:
                    raise PreferenceValidationError(
                        "Start time and end time are required when quiet hours are enabled",
                        field="quiet_hours",
                    )

        # Validate protected categories - billing and system_alerts
        # Users cannot completely disable these categories
        # (The repository and database triggers handle this, but we validate here too)


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================


_preference_service: PreferenceService | None = None


def get_preference_service() -> PreferenceService:
    """Get the preference service singleton."""
    global _preference_service
    if _preference_service is None:
        _preference_service = PreferenceService()
    return _preference_service


# Convenience alias
preference_service = get_preference_service()
