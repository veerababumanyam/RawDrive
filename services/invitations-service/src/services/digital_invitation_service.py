"""DigitalInvitationService: Save The Date digital invitations.

This service provides business logic for digital event invitations:
- Event invitations (weddings, birthdays, anniversaries, etc.)
- Template-based customization
- Public URL generation via MagicLinkService
- Image gallery management
- Guest and RSVP orchestration

Note: This is distinct from InvitationService which handles workspace member invitations.

Feature: 016-save-the-date
"""

from __future__ import annotations

import json
import logging
import secrets

logger = logging.getLogger(__name__)
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from src.database import get_pool
from src.repositories.invitation_repository import (
    InvitationRepository,
    get_invitation_repository,
)
from src.repositories.rsvp_repository import (
    RSVPRepository,
    get_rsvp_repository,
)
# Magic Link Service: Separate microservice accessed via HTTP
from src.services.magic_link_client import MagicLinkService

# R2 Storage Service: For photo/media storage (to be integrated later)
# This is used for invitation cover images, gallery images, etc.
try:
    from src.services.r2_storage_service import R2StorageService, get_r2_storage_service
except ImportError:
    # Stub for now - R2 storage integration for photos/media to be done later
    logger.warning("R2StorageService not available - media upload features will be limited")
    class R2StorageService:
        pass
    def get_r2_storage_service():
        raise NotImplementedError("R2StorageService needs to be implemented for photo/media storage")
from src.services.audit_service import AuditService, AuditEventType



# ---------------------------------------------------------------------------
# Error Types
# ---------------------------------------------------------------------------


class DigitalInvitationError(Exception):
    """Base exception for digital invitation errors."""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class InvitationNotFoundError(DigitalInvitationError):
    """Digital invitation not found."""

    def __init__(self, invitation_id: Optional[str] = None):
        super().__init__(
            message="Invitation not found" + (f": {invitation_id}" if invitation_id else ""),
            code="INVITATION_NOT_FOUND",
            status_code=404,
        )


class InvitationAccessDeniedError(DigitalInvitationError):
    """Access denied to invitation."""

    def __init__(self):
        super().__init__(
            message="You don't have permission to access this invitation",
            code="INVITATION_ACCESS_DENIED",
            status_code=403,
        )


class InvitationNotPublishedError(DigitalInvitationError):
    """Invitation must be published for this operation."""

    def __init__(self):
        super().__init__(
            message="Invitation must be published to perform this action",
            code="INVITATION_NOT_PUBLISHED",
            status_code=400,
        )


class InvitationAlreadyPublishedError(DigitalInvitationError):
    """Invitation is already published."""

    def __init__(self):
        super().__init__(
            message="Invitation is already published",
            code="INVITATION_ALREADY_PUBLISHED",
            status_code=400,
        )


class InvitationPasswordRequiredError(DigitalInvitationError):
    """Password required to access invitation."""

    def __init__(self):
        super().__init__(
            message="Password is required to access this invitation",
            code="PASSWORD_REQUIRED",
            status_code=401,
        )


class InvitationPasswordIncorrectError(DigitalInvitationError):
    """Incorrect password for invitation."""

    def __init__(self):
        super().__init__(
            message="Incorrect password",
            code="PASSWORD_INCORRECT",
            status_code=401,
        )


class InvitationPinRequiredError(DigitalInvitationError):
    """PIN required to access invitation."""

    def __init__(self):
        super().__init__(
            message="PIN is required to access this invitation",
            code="PIN_REQUIRED",
            status_code=401,
        )


class InvitationPinIncorrectError(DigitalInvitationError):
    """Incorrect PIN for invitation."""

    def __init__(self):
        super().__init__(
            message="Incorrect PIN",
            code="PIN_INCORRECT",
            status_code=401,
        )


class TemplateNotFoundError(DigitalInvitationError):
    """Template not found."""

    def __init__(self, template_id: Optional[str] = None):
        super().__init__(
            message="Template not found" + (f": {template_id}" if template_id else ""),
            code="TEMPLATE_NOT_FOUND",
            status_code=404,
        )


class RSVPDeadlinePassedError(DigitalInvitationError):
    """RSVP deadline has passed."""

    def __init__(self):
        super().__init__(
            message="The RSVP deadline for this invitation has passed",
            code="RSVP_DEADLINE_PASSED",
            status_code=400,
        )


class RSVPDisabledError(DigitalInvitationError):
    """RSVP is disabled for this invitation."""

    def __init__(self):
        super().__init__(
            message="RSVP is not enabled for this invitation",
            code="RSVP_DISABLED",
            status_code=400,
        )


class DuplicateRSVPError(DigitalInvitationError):
    """Email has already submitted an RSVP."""

    def __init__(self, email: str):
        super().__init__(
            message=f"An RSVP has already been submitted for {email}",
            code="DUPLICATE_RSVP",
            status_code=409,
        )


# ---------------------------------------------------------------------------
# Digital Invitation Service
# ---------------------------------------------------------------------------


class DigitalInvitationService:
    """Service for managing digital event invitations.

    This service provides:
    - Invitation CRUD operations
    - Template management
    - Public URL generation
    - Image management
    - Publishing workflow
    - Guest management
    - RSVP orchestration
    """

    # Default retention for auto-delete
    DEFAULT_AUTO_DELETE_DAYS = 30

    # Maximum images per invitation
    MAX_IMAGES = 20

    def __init__(
        self,
        invitation_repo: Optional[InvitationRepository] = None,
        rsvp_repo: Optional[RSVPRepository] = None,
        magic_link_service: Optional[MagicLinkService] = None,
        audit_service: Optional[AuditService] = None,
    ):
        self.invitation_repo = invitation_repo or get_invitation_repository()
        self.rsvp_repo = rsvp_repo or get_rsvp_repository()
        # Magic Link Service: Separate microservice accessed via HTTP
        self.magic_link_service = magic_link_service or MagicLinkService()
        
        # R2 Storage Service: For photo/media storage (to be integrated later)
        try:
            self.storage_service = get_r2_storage_service()
        except (ImportError, NotImplementedError, NameError):
            logger.warning("R2StorageService not available - media upload features will be limited")
            self.storage_service = None
        self.audit_service = audit_service or AuditService()

    async def _populate_media_urls(self, invitation: dict[str, Any]) -> dict[str, Any]:
        """Populate media URLs from object keys."""
        if not invitation:
            return invitation
            
        # Video URL
        if invitation.get("video_object_key"):
            invitation["video_url"] = await self.storage_service.generate_presigned_get_url(
                invitation["video_object_key"]
            )
            
        # Audio URL
        if invitation.get("audio_object_key"):
            invitation["audio_url"] = await self.storage_service.generate_presigned_get_url(
                invitation["audio_object_key"]
            )
            
        return invitation

    # =========================================================================
    # INVITATION CRUD
    # =========================================================================

    async def create_invitation(
        self,
        workspace_id: UUID,
        created_by_user_id: UUID,
        title: str,
        event_datetime: datetime,
        venue_country: str,
        template_id: Optional[UUID] = None,
        description: Optional[str] = None,
        event_type: str = "wedding",
        event_end_datetime: Optional[datetime] = None,
        event_timezone: str = "Asia/Kolkata",
        venue: Optional[dict[str, Any]] = None,
        host_names: Optional[list[str]] = None,
        host_contact_phone: Optional[str] = None,
        host_contact_email: Optional[str] = None,
        rsvp_settings: Optional[dict[str, Any]] = None,
        primary_language: str = "en",
        secondary_language: Optional[str] = None,
        customization: Optional[dict[str, Any]] = None,
        auto_delete_enabled: bool = True,
        auto_delete_days: int = DEFAULT_AUTO_DELETE_DAYS,
        video_object_key: Optional[str] = None,
        audio_object_key: Optional[str] = None,
        layout_density: str = "normal",
        font_heading: str = "Playfair Display",
        font_body: str = "Lora",
        ai_generated_content: Optional[dict[str, Any]] = None,
        has_sub_events: bool = False,
    ) -> dict[str, Any]:
        """Create a new digital invitation.

        Args:
            workspace_id: Workspace for tenant isolation
            created_by_user_id: User creating the invitation
            title: Invitation title
            event_datetime: Event start datetime (UTC)
            venue_country: Venue country (required)
            template_id: Optional template to use
            description: Event description
            event_type: Type of event (wedding, birthday, etc.)
            event_end_datetime: Event end datetime (UTC)
            event_timezone: Event timezone
            venue: Full venue information
            host_names: Names of hosts
            host_contact_phone: Host contact phone
            host_contact_email: Host contact email
            rsvp_settings: RSVP configuration
            primary_language: Primary content language
            secondary_language: Secondary content language
            customization: Template customization data
            auto_delete_enabled: Enable auto-deletion after event
            auto_delete_days: Days after event to auto-delete
            video_object_key: Optional background video key
            audio_object_key: Optional background audio key
            layout_density: 'compact', 'normal', or 'spacious'
            font_heading: Heading font family
            font_body: Body font family
            ai_generated_content: Content generated by AI
            has_sub_events: Whether invitation has sub-events

        Returns:
            Created invitation with all fields
        """
        # Merge venue with required country
        full_venue = venue or {}
        full_venue["country"] = venue_country

        # Default RSVP settings
        default_rsvp = {
            "enabled": True,
            "max_party_size": 4,
            "collect_dietary": True,
            "collect_phone": False,
            "custom_questions": [],
        }
        final_rsvp_settings = {**default_rsvp, **(rsvp_settings or {})}

        # Calculate scheduled deletion
        scheduled_deletion_at = None
        if auto_delete_enabled and event_datetime:
            scheduled_deletion_at = event_datetime + timedelta(days=auto_delete_days)

        invitation_id = uuid4()
        now = datetime.now(timezone.utc)

        # Extract venue fields from venue dict
        venue_data = full_venue or {}
        
        # Extract rsvp settings
        rsvp_data = final_rsvp_settings

        invitation = await self.invitation_repo.create_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            created_by_user_id=created_by_user_id,
            template_id=template_id,
            title=title,
            description=description,
            event_type=event_type,
            event_datetime=event_datetime,
            event_end_datetime=event_end_datetime,
            event_timezone=event_timezone,
            venue_name=venue_data.get("name"),
            venue_address=venue_data.get("address"),
            venue_city=venue_data.get("city"),
            venue_state=venue_data.get("state"),
            venue_country=venue_data.get("country", venue_country),
            venue_postal_code=venue_data.get("postal_code"),
            venue_latitude=venue_data.get("latitude"),
            venue_longitude=venue_data.get("longitude"),
            venue_map_url=venue_data.get("map_url"),
            host_names=host_names or [],
            host_contact_phone=host_contact_phone,
            host_contact_email=host_contact_email,
            rsvp_enabled=rsvp_data.get("enabled", True),
            rsvp_deadline=rsvp_data.get("deadline"),
            rsvp_max_party_size=rsvp_data.get("max_party_size", 4),
            rsvp_collect_dietary=rsvp_data.get("collect_dietary", True),
            rsvp_collect_phone=rsvp_data.get("collect_phone", False),
            rsvp_custom_questions=rsvp_data.get("custom_questions"),
            primary_language=primary_language,
            secondary_language=secondary_language,
            customization=customization or {},
            auto_delete_enabled=auto_delete_enabled,
            auto_delete_days=auto_delete_days,
            video_object_key=video_object_key,
            audio_object_key=audio_object_key,
            layout_density=layout_density,
            font_heading=font_heading,
            font_body=font_body,
            ai_generated_content=ai_generated_content,
            has_sub_events=has_sub_events,
        )


        # Log audit event
        await self.rsvp_repo.log_event(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            event_type="created",
            actor_type="user",
            actor_user_id=created_by_user_id,
            event_data={"title": title, "event_type": event_type},
        )

        logger.info(
            "Digital invitation created",
            extra={
                "invitation_id": str(invitation_id),
                "workspace_id": str(workspace_id),
                "created_by": str(created_by_user_id),
                "event_type": event_type,
            },
        )

        return await self._populate_media_urls(invitation)

    async def get_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get a digital invitation by ID.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Invitation data

        Raises:
            InvitationNotFoundError: Invitation not found or not in workspace
        """
        invitation = await self.invitation_repo.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        if not invitation:
            raise InvitationNotFoundError(str(invitation_id))

        return await self._populate_media_urls(invitation)

    async def get_invitation_by_slug(
        self,
        slug: str,
        workspace_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Get a digital invitation by slug.

        Args:
            slug: Invitation slug (URL-friendly identifier)
            workspace_id: Optional workspace ID for tenant isolation

        Returns:
            Invitation data

        Raises:
            InvitationNotFoundError: Invitation not found
        """
        invitation = await self.invitation_repo.get_invitation_by_slug(
            slug=slug,
            workspace_id=workspace_id,
        )

        if not invitation:
            raise InvitationNotFoundError()

        return await self._populate_media_urls(invitation)

    async def update_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        updated_by_user_id: UUID,
        title: Optional[str] = None,
        description: Optional[str] = None,
        event_type: Optional[str] = None,
        event_datetime: Optional[datetime] = None,
        event_end_datetime: Optional[datetime] = None,
        event_timezone: Optional[str] = None,
        venue: Optional[dict[str, Any]] = None,
        host_names: Optional[list[str]] = None,
        host_contact_phone: Optional[str] = None,
        host_contact_email: Optional[str] = None,
        rsvp_settings: Optional[dict[str, Any]] = None,
        primary_language: Optional[str] = None,
        secondary_language: Optional[str] = None,
        customization: Optional[dict[str, Any]] = None,
        content_i18n: Optional[dict[str, dict[str, str]]] = None,
        auto_delete_enabled: Optional[bool] = None,
        auto_delete_days: Optional[int] = None,
        video_object_key: Optional[str] = None,
        audio_object_key: Optional[str] = None,
        layout_density: Optional[str] = None,
        font_heading: Optional[str] = None,
        font_body: Optional[str] = None,
        ai_generated_content: Optional[dict[str, Any]] = None,
        has_sub_events: Optional[bool] = None,
    ) -> dict[str, Any]:
        """Update a digital invitation.

        Args:
            invitation_id: Invitation to update
            workspace_id: Workspace ID for tenant isolation
            updated_by_user_id: User making the update
            ... (update fields)

        Returns:
            Updated invitation

        Raises:
            InvitationNotFoundError: Invitation not found
        """
        # Verify invitation exists
        existing = await self.get_invitation(invitation_id, workspace_id)

        # Build update data
        updates: dict[str, Any] = {}

        if title is not None:
            updates["title"] = title
        if description is not None:
            updates["description"] = description
        if event_type is not None:
            updates["event_type"] = event_type
        if event_datetime is not None:
            updates["event_datetime"] = event_datetime
        if event_end_datetime is not None:
            updates["event_end_datetime"] = event_end_datetime
        if event_timezone is not None:
            updates["event_timezone"] = event_timezone
        
        # Flatten venue
        if venue is not None:
            updates["venue_name"] = venue.get("name")
            updates["venue_address"] = venue.get("address")
            updates["venue_city"] = venue.get("city")
            updates["venue_state"] = venue.get("state")
            updates["venue_country"] = venue.get("country")
            updates["venue_postal_code"] = venue.get("postal_code")
            updates["venue_latitude"] = venue.get("latitude")
            updates["venue_longitude"] = venue.get("longitude")
            updates["venue_map_url"] = venue.get("map_url")

        if host_names is not None:
            updates["host_names"] = host_names
        if host_contact_phone is not None:
            updates["host_contact_phone"] = host_contact_phone
        if host_contact_email is not None:
            updates["host_contact_email"] = host_contact_email
            
        # Flatten RSVP settings
        if rsvp_settings is not None:
            updates["rsvp_enabled"] = rsvp_settings.get("enabled", True)
            updates["rsvp_deadline"] = rsvp_settings.get("deadline")
            updates["rsvp_max_party_size"] = rsvp_settings.get("max_party_size")
            updates["rsvp_collect_dietary"] = rsvp_settings.get("collect_dietary")
            updates["rsvp_collect_phone"] = rsvp_settings.get("collect_phone")
            updates["rsvp_custom_questions"] = rsvp_settings.get("custom_questions")

        if primary_language is not None:
            updates["primary_language"] = primary_language
        if secondary_language is not None:
            updates["secondary_language"] = secondary_language
        if customization is not None:
            updates["customization"] = customization
        if content_i18n is not None:
            updates["content_i18n"] = content_i18n
        if auto_delete_enabled is not None:
            updates["auto_delete_enabled"] = auto_delete_enabled
        if auto_delete_days is not None:
            updates["auto_delete_days"] = auto_delete_days
        if video_object_key is not None:
            updates["video_object_key"] = video_object_key
        if audio_object_key is not None:
            updates["audio_object_key"] = audio_object_key
        if layout_density is not None:
            updates["layout_density"] = layout_density
        if font_heading is not None:
            updates["font_heading"] = font_heading
        if font_body is not None:
            updates["font_body"] = font_body
        if ai_generated_content is not None:
            updates["ai_generated_content"] = ai_generated_content
        if has_sub_events is not None:
            updates["has_sub_events"] = has_sub_events

        # Recalculate scheduled deletion if needed
        if event_datetime is not None or auto_delete_days is not None:
            final_datetime = event_datetime or existing.get("event_datetime")
            final_days = auto_delete_days if auto_delete_days is not None else existing.get("auto_delete_days", 30)
            final_enabled = auto_delete_enabled if auto_delete_enabled is not None else existing.get("auto_delete_enabled", True)

            if final_enabled and final_datetime:
                if isinstance(final_datetime, str):
                    final_datetime = datetime.fromisoformat(final_datetime.replace("Z", "+00:00"))
                updates["scheduled_deletion_at"] = final_datetime + timedelta(days=final_days)
            elif not final_enabled:
                updates["scheduled_deletion_at"] = None

        if not updates:
            return existing

        invitation = await self.invitation_repo.update_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            **updates,
        )

        if not invitation:
            raise InvitationNotFoundError(str(invitation_id))

        # Log audit event
        await self.rsvp_repo.log_event(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            event_type="updated",
            actor_type="user",
            actor_user_id=updated_by_user_id,
            event_data={"updated_fields": list(updates.keys())},
        )

        logger.info(
            "Digital invitation updated",
            extra={
                "invitation_id": str(invitation_id),
                "updated_by": str(updated_by_user_id),
                "fields": list(updates.keys()),
            },
        )

        return await self._populate_media_urls(invitation)

    async def delete_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        deleted_by_user_id: UUID,
    ) -> bool:
        """Soft-delete a digital invitation.

        Args:
            invitation_id: Invitation to delete
            workspace_id: Workspace ID for tenant isolation
            deleted_by_user_id: User performing deletion

        Returns:
            True if deleted

        Raises:
            InvitationNotFoundError: Invitation not found
        """
        # Verify exists
        await self.get_invitation(invitation_id, workspace_id)

        success = await self.invitation_repo.delete_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        if not success:
            raise InvitationNotFoundError(str(invitation_id))

        # Log audit event
        await self.rsvp_repo.log_event(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            event_type="deleted",
            actor_type="user",
            actor_user_id=deleted_by_user_id,
            event_data={},
        )

        logger.info(
            "Digital invitation deleted",
            extra={
                "invitation_id": str(invitation_id),
                "deleted_by": str(deleted_by_user_id),
            },
        )

        return True

    async def list_invitations(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        event_type: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """List invitations for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            status: Filter by status
            event_type: Filter by event type
            search: Search in title
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Paginated list with items and metadata
        """
        items, total = await self.invitation_repo.list_invitations(
            workspace_id=workspace_id,
            status=status,
            event_type=event_type,
            search=search,
            page=page,
            limit=limit,
        )
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        return {
            "data": items,
            "meta": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
        }

    # =========================================================================
    # PUBLISHING
    # =========================================================================

    async def publish_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        published_by_user_id: UUID,
        base_url: str = "https://rawdrive.ai",
    ) -> dict[str, Any]:
        """Publish an invitation and generate public URL.

        Creates a magic link for public access and updates status to 'published'.

        Args:
            invitation_id: Invitation to publish
            workspace_id: Workspace ID for tenant isolation
            published_by_user_id: User publishing
            base_url: Base URL for public link

        Returns:
            Updated invitation with public_url

        Raises:
            InvitationNotFoundError: Invitation not found
            InvitationAlreadyPublishedError: Already published
        """
        invitation = await self.get_invitation(invitation_id, workspace_id)

        if invitation.get("status") == "published":
            raise InvitationAlreadyPublishedError()

        # Generate unique slug if not exists
        slug = invitation.get("slug")
        if not slug:
            # Repository handles slug generation
            pass

        # Create magic link for public access
        # Note: For invitations, we use invitation_id (not gallery_id) per migration 0079
        if self.magic_link_service is None:
            raise DigitalInvitationError(
                message="MagicLinkService is not available. Cannot publish invitation.",
                code="SERVICE_UNAVAILABLE",
                status_code=503,
            )
            
        magic_link = await self.magic_link_service.create_link(
            workspace_id=workspace_id,
            target_type="invitation",
            invitation_id=invitation_id,
            label=f"Invitation: {invitation.get('title', '')}",
            created_by_user_id=published_by_user_id,
            base_url=base_url,
        )

        # Update invitation with magic link and status
        now = datetime.now(timezone.utc)
        updated = await self.invitation_repo.publish_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            magic_link_id=UUID(str(magic_link["link_id"])),
            public_url=magic_link["url"],
        )

        if not updated:
            raise InvitationNotFoundError(str(invitation_id))

        # Log audit event
        await self.rsvp_repo.log_event(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            event_type="published",
            actor_type="user",
            actor_user_id=published_by_user_id,
            event_data={"public_url": magic_link["url"]},
        )

        logger.info(
            "Digital invitation published",
            extra={
                "invitation_id": str(invitation_id),
                "published_by": str(published_by_user_id),
                "public_url": magic_link["url"],
            },
        )

        return await self._populate_media_urls(updated)

    async def unpublish_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        unpublished_by_user_id: UUID,
    ) -> dict[str, Any]:
        """Unpublish an invitation.

        Revokes the magic link and changes status back to 'draft'.

        Args:
            invitation_id: Invitation to unpublish
            workspace_id: Workspace ID for tenant isolation
            unpublished_by_user_id: User unpublishing

        Returns:
            Updated invitation

        Raises:
            InvitationNotFoundError: Invitation not found
            InvitationNotPublishedError: Not currently published
        """
        invitation = await self.get_invitation(invitation_id, workspace_id)

        if invitation.get("status") != "published":
            raise InvitationNotPublishedError()

        # Revoke magic link if exists
        magic_link_id = invitation.get("magic_link_id")
        if magic_link_id:
            try:
                pool = await get_pool()
                await pool.execute(
                    """
                    UPDATE magic_links SET status = 'revoked', updated_at = NOW()
                    WHERE link_id = $1 AND workspace_id = $2
                    """,
                    UUID(magic_link_id) if isinstance(magic_link_id, str) else magic_link_id,
                    workspace_id,
                )
            except Exception as e:
                logger.warning(
                    "Failed to revoke magic link",
                    extra={"magic_link_id": str(magic_link_id), "error": str(e)},
                )

        # Update status to draft
        updated = await self.invitation_repo.update_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            status="draft",
            published_at=None,
        )

        if not updated:
            raise InvitationNotFoundError(str(invitation_id))

        # Log audit event
        await self.rsvp_repo.log_event(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            event_type="unpublished",
            actor_type="user",
            actor_user_id=unpublished_by_user_id,
            event_data={},
        )

        logger.info(
            "Digital invitation unpublished",
            extra={
                "invitation_id": str(invitation_id),
                "unpublished_by": str(unpublished_by_user_id),
            },
        )

        return await self._populate_media_urls(updated)

    # =========================================================================
    # PROTECTION (PASSWORD/PIN)
    # =========================================================================

    async def set_password(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        password: str,
    ) -> bool:
        """Set password protection on an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            password: Password to set (will be hashed)

        Returns:
            True if successful
        """
        return await self.invitation_repo.set_password(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            password=password,
        )

    async def remove_password(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Remove password protection from an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID

        Returns:
            True if successful
        """
        return await self.invitation_repo.remove_password(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

    async def verify_password(
        self,
        invitation_id: UUID,
        password: str,
    ) -> bool:
        """Verify password for an invitation.

        Args:
            invitation_id: Invitation ID
            password: Password to verify

        Returns:
            True if password matches
        """
        return await self.invitation_repo.verify_password(
            invitation_id=invitation_id,
            password=password,
        )

    async def set_pin(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        pin: str,
    ) -> bool:
        """Set PIN protection on an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            pin: 4-6 digit PIN

        Returns:
            True if successful
        """
        return await self.invitation_repo.set_pin(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            pin=pin,
        )

    async def remove_pin(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Remove PIN protection from an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID

        Returns:
            True if successful
        """
        return await self.invitation_repo.remove_pin(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

    async def verify_pin(
        self,
        invitation_id: UUID,
        pin: str,
    ) -> bool:
        """Verify PIN for an invitation.

        Args:
            invitation_id: Invitation ID
            pin: PIN to verify

        Returns:
            True if PIN matches
        """
        return await self.invitation_repo.verify_pin(
            invitation_id=invitation_id,
            pin=pin,
        )

    # =========================================================================
    # PUBLIC ACCESS
    # =========================================================================

    async def get_public_invitation(
        self,
        slug: str,
        password: Optional[str] = None,
        pin: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get a published invitation for public viewing.

        Handles password/PIN verification and view tracking.

        Args:
            slug: Invitation slug
            password: Password if protected
            pin: PIN if protected
            ip_address: Viewer's IP for analytics

        Returns:
            Public invitation data (sanitized for guest view)

        Raises:
            InvitationNotFoundError: Invitation not found or not published
            InvitationPasswordRequiredError: Password needed
            InvitationPasswordIncorrectError: Wrong password
            InvitationPinRequiredError: PIN needed
            InvitationPinIncorrectError: Wrong PIN
        """
        invitation = await self.invitation_repo.get_invitation_by_slug(slug)

        if not invitation:
            raise InvitationNotFoundError()

        if invitation.get("status") != "published":
            raise InvitationNotFoundError()

        # asyncpg returns UUID as native type, convert to Python UUID
        invitation_id = UUID(str(invitation["invitation_id"]))

        # Check password protection
        if invitation.get("password_protected"):
            if not password:
                raise InvitationPasswordRequiredError()
            if not await self.verify_password(invitation_id, password):
                raise InvitationPasswordIncorrectError()

        # Check PIN protection
        if invitation.get("pin_protected"):
            if not pin:
                raise InvitationPinRequiredError()
            if not await self.verify_pin(invitation_id, pin):
                raise InvitationPinIncorrectError()

        # Convert workspace_id once for reuse
        workspace_id = UUID(str(invitation["workspace_id"]))

        # Increment view count
        await self.invitation_repo.increment_view_count(
            invitation_id=invitation_id,
            unique=True,  # Track unique views based on validated access
        )

        # Log view event
        await self.rsvp_repo.log_event(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            event_type="viewed",
            actor_type="guest",
            actor_ip_address=ip_address,
            event_data={},
        )

        # Get gallery images
        images = await self.invitation_repo.list_images(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        # Build public response (omit sensitive fields like password hashes)
        # Note: workspace_id is included for RSVP routing but is not sensitive
        public_invitation = {
            "invitation_id": invitation["invitation_id"],
            "workspace_id": invitation["workspace_id"],
            "slug": invitation.get("slug"),
            "title": invitation["title"],
            "description": invitation.get("description"),
            "event_type": invitation["event_type"],
            "event_datetime": invitation["event_datetime"],
            "event_end_datetime": invitation.get("event_end_datetime"),
            "event_timezone": invitation["event_timezone"],
            "venue": invitation.get("venue", {}),
            "host_names": invitation.get("host_names", []),
            "cover_image_url": invitation.get("cover_image_url"),
            "gallery_images": [img["url"] for img in images if img.get("purpose") == "gallery"],
            "rsvp_enabled": invitation.get("rsvp_settings", {}).get("enabled", True),
            "rsvp_deadline": invitation.get("rsvp_settings", {}).get("deadline"),
            "max_party_size": invitation.get("rsvp_settings", {}).get("max_party_size", 4),
            "collect_dietary": invitation.get("rsvp_settings", {}).get("collect_dietary", True),
            "collect_phone": invitation.get("rsvp_settings", {}).get("collect_phone", False),
            "custom_questions": invitation.get("rsvp_settings", {}).get("custom_questions", []),
            "primary_language": invitation["primary_language"],
            "secondary_language": invitation.get("secondary_language"),
            "content_i18n": invitation.get("content_i18n", {}),
            "template_layout": invitation.get("template_layout"),
            "customization": invitation.get("customization", {}),
            "video_object_key": invitation.get("video_object_key"),
            "audio_object_key": invitation.get("audio_object_key"),
            "layout_density": invitation.get("layout_density", "normal"),
            "font_heading": invitation.get("font_heading", "Playfair Display"),
            "font_body": invitation.get("font_body", "Lora"),
            "ai_generated_content": invitation.get("ai_generated_content") or {},
            "has_sub_events": invitation.get("has_sub_events", False),
        }
        return await self._populate_media_urls(public_invitation)

    # Alias for API compatibility
    verify_and_get_invitation = get_public_invitation

    async def get_public_invitation_by_id(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        password: Optional[str] = None,
        pin: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get a published invitation for public viewing by ID.

        Similar to get_public_invitation but uses ID instead of slug.
        Used for magic link token-based access.

        Args:
            invitation_id: Invitation UUID
            workspace_id: Workspace ID (from magic link validation)
            password: Password if protected
            pin: PIN if protected
            ip_address: Viewer's IP for analytics

        Returns:
            Public invitation data (sanitized for guest view)

        Raises:
            InvitationNotFoundError: Invitation not found or not published
            InvitationPasswordRequiredError: Password needed
            InvitationPasswordIncorrectError: Wrong password
            InvitationPinRequiredError: PIN needed
            InvitationPinIncorrectError: Wrong PIN
        """
        invitation = await self.invitation_repo.get_invitation_by_id(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        if not invitation:
            raise InvitationNotFoundError()

        # Verify invitation is published
        if invitation.get("status") != "published":
            raise InvitationNotFoundError()

        # Increment view count
        await self.invitation_repo.increment_view_count(
            invitation_id=invitation_id,
            unique=True,
        )

        # Build public response
        public_invitation = {
            "invitation_id": str(invitation["invitation_id"]),
            "title": invitation.get("title", ""),
            "description": invitation.get("description"),
            "event_type": invitation.get("event_type", "general"),
            "event_datetime": invitation.get("event_datetime"),
            "event_end_datetime": invitation.get("event_end_datetime"),
            "event_timezone": invitation.get("event_timezone", "UTC"),
            "venue": invitation.get("venue") or {},
            "host_names": invitation.get("host_names") or [],
            "template_id": invitation.get("template_id"),
            "template_layout": invitation.get("template_layout"),
            "cover_image_url": invitation.get("cover_image_url"),
            "gallery_images": invitation.get("gallery_images") or [],
            "rsvp_settings": invitation.get("rsvp_settings") or {},
            "password_protected": invitation.get("password_protected", False),
            "pin_protected": invitation.get("pin_protected", False),
            "primary_language": invitation.get("primary_language", "en"),
            "secondary_language": invitation.get("secondary_language"),
            "content_i18n": invitation.get("content_i18n") or {},
            "customization": invitation.get("customization") or {},
            "cover_media_id": invitation.get("cover_media_id"),
            "gallery_media_ids": invitation.get("gallery_media_ids") or [],
            "layout_density": invitation.get("layout_density", "normal"),
            "font_heading": invitation.get("font_heading", "Playfair Display"),
            "font_body": invitation.get("font_body", "Lora"),
            "ai_generated_content": invitation.get("ai_generated_content") or {},
            "has_sub_events": invitation.get("has_sub_events", False),
        }
        return await self._populate_media_urls(public_invitation)

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_invitation_stats(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get statistics for an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID

        Returns:
            Stats including views, RSVPs, check-ins
        """
        invitation = await self.get_invitation(invitation_id, workspace_id)
        rsvp_stats = await self.rsvp_repo.get_rsvp_stats(invitation_id)
        checkin_stats = await self.rsvp_repo.get_checkin_stats(invitation_id)

        return {
            "invitation_id": str(invitation_id),
            "title": invitation["title"],
            "event_datetime": invitation["event_datetime"],
            "status": invitation["status"],
            "view_count": invitation.get("view_count", 0),
            "unique_view_count": invitation.get("unique_view_count", 0),
            "rsvp_total": rsvp_stats.get("total", 0),
            "attending_count": rsvp_stats.get("attending", 0),
            "not_attending_count": rsvp_stats.get("not_attending", 0),
            "pending_count": rsvp_stats.get("pending", 0),
            "maybe_count": rsvp_stats.get("maybe", 0),
            "total_party_size": rsvp_stats.get("total_party_size", 0),
            "checked_in_count": checkin_stats.get("total_checked_in", 0),
            "total_checked_in_party": checkin_stats.get("total_party_size", 0),
            "checkin_percentage": (
                (checkin_stats.get("total_party_size", 0) / rsvp_stats.get("total_party_size", 1) * 100)
                if rsvp_stats.get("total_party_size", 0) > 0
                else 0
            ),
        }

    # =========================================================================
    # DUPLICATE INVITATION
    # =========================================================================

    async def duplicate_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        duplicated_by_user_id: UUID,
        new_title: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a duplicate of an existing invitation.

        Copies all content except:
        - invitation_id (new UUID generated)
        - slug (new slug generated)
        - magic_link_id/public_url (not published)
        - RSVPs and guests (fresh start)
        - view_count/unique_view_count (reset to 0)
        - published_at/archived_at (reset)

        The title is prefixed with "Copy of " unless a custom title is provided.

        Args:
            invitation_id: Source invitation to duplicate
            workspace_id: Workspace ID for tenant isolation
            duplicated_by_user_id: User creating the duplicate
            new_title: Optional custom title (defaults to "Copy of <original>")

        Returns:
            Newly created invitation

        Raises:
            InvitationNotFoundError: Source invitation not found
        """
        # Get source invitation
        source = await self.get_invitation(invitation_id, workspace_id)

        # Build new title
        title = new_title or f"Copy of {source.get('title', 'Invitation')}"

        # Get source images to copy references
        source_images = await self.invitation_repo.list_images(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        # Create new invitation with copied fields
        new_invitation = await self.invitation_repo.create_invitation(
            workspace_id=workspace_id,
            title=title,
            template_id=source.get("template_id"),
            description=source.get("description"),
            event_type=source.get("event_type", "wedding"),
            event_datetime=source.get("event_datetime"),
            event_end_datetime=source.get("event_end_datetime"),
            event_timezone=source.get("event_timezone", "Asia/Kolkata"),
            venue_name=source.get("venue_name"),
            venue_address=source.get("venue_address"),
            venue_city=source.get("venue_city"),
            venue_state=source.get("venue_state"),
            venue_country=source.get("venue_country", "India"),
            venue_postal_code=source.get("venue_postal_code"),
            venue_latitude=source.get("venue_latitude"),
            venue_longitude=source.get("venue_longitude"),
            venue_map_url=source.get("venue_map_url"),
            host_names=source.get("host_names", []),
            host_contact_phone=source.get("host_contact_phone"),
            host_contact_email=source.get("host_contact_email"),
            rsvp_enabled=source.get("rsvp_enabled", True),
            rsvp_deadline=source.get("rsvp_deadline"),
            rsvp_max_party_size=source.get("rsvp_max_party_size", 10),
            rsvp_collect_dietary=source.get("rsvp_collect_dietary", False),
            rsvp_collect_phone=source.get("rsvp_collect_phone", False),
            rsvp_custom_questions=source.get("rsvp_custom_questions"),
            primary_language=source.get("primary_language", "en-IN"),
            secondary_language=source.get("secondary_language"),
            customization=source.get("customization", {}),
            content_i18n=source.get("content_i18n", {}),
            auto_delete_enabled=source.get("auto_delete_enabled", True),
            auto_delete_days=source.get("auto_delete_days", 7),
            created_by_user_id=duplicated_by_user_id,
        )

        new_invitation_id = UUID(str(new_invitation["invitation_id"]))

        # Copy images (reference the same storage objects)
        for img in source_images:
            await self.invitation_repo.add_image(
                invitation_id=new_invitation_id,
                workspace_id=workspace_id,
                object_key=img["object_key"],
                url=img["url"],
                filename=img["filename"],
                mime_type=img["mime_type"],
                size_bytes=img["size_bytes"],
                purpose=img.get("purpose", "gallery"),
                position=img.get("position", 0),
                thumbnail_url=img.get("thumbnail_url"),
                width=img.get("width"),
                height=img.get("height"),
                uploaded_by_user_id=duplicated_by_user_id,
                og_image_url=img.get("og_image_url"),
                og_object_key=img.get("og_object_key"),
            )

        # Log audit event
        await self.rsvp_repo.log_event(
            invitation_id=new_invitation_id,
            workspace_id=workspace_id,
            event_type="duplicated",
            actor_type="user",
            actor_user_id=duplicated_by_user_id,
            event_data={
                "source_invitation_id": str(invitation_id),
                "source_title": source.get("title"),
            },
        )

        logger.info(
            "Digital invitation duplicated",
            extra={
                "source_invitation_id": str(invitation_id),
                "new_invitation_id": str(new_invitation_id),
                "workspace_id": str(workspace_id),
                "duplicated_by": str(duplicated_by_user_id),
            },
        )

        return await self._populate_media_urls(new_invitation)

    async def update_notification_preference(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        notification_preference: str,
    ) -> dict[str, Any]:
        """Update notification preference for an invitation.

        T110: Update notification settings

        Args:
            invitation_id: The invitation ID
            workspace_id: The workspace ID
            notification_preference: One of 'immediate', 'daily_digest', 'disabled'

        Returns:
            Updated invitation data
        """
        # Validate preference value
        valid_preferences = ["immediate", "daily_digest", "disabled"]
        if notification_preference not in valid_preferences:
            raise ValueError(f"Invalid notification preference: {notification_preference}")

        # Verify invitation exists
        invitation = await self.get_invitation(invitation_id, workspace_id)
        if not invitation:
            raise InvitationNotFoundError(invitation_id, workspace_id)

        # Update the preference
        updated = await self.invitation_repo.update_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            notification_preference=notification_preference,
        )

        logger.info(
            "Notification preference updated",
            extra={
                "invitation_id": str(invitation_id),
                "workspace_id": str(workspace_id),
                "notification_preference": notification_preference,
            },
        )

        return await self._populate_media_urls(updated)


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------


def get_digital_invitation_service() -> DigitalInvitationService:
    """Get a DigitalInvitationService instance."""
    return DigitalInvitationService()


# Alias for backward compatibility with public_invitations.py
get_invitation_service = get_digital_invitation_service
