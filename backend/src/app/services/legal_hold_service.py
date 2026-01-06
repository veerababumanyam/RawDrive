"""Legal hold service for hold management.

This service provides high-level business logic for managing legal holds
to preserve data for litigation, regulatory investigations, and compliance
requirements.

It handles:
- Legal hold lifecycle management (creation, activation, release)
- Scope management (users, resources, custodians)
- Resource protection and deletion blocking
- Custodian acknowledgment tracking
- Integration with data subject requests to block erasure
- Audit logging for compliance

Feature: Audit & Compliance System
Task: T008 - Create legal hold service for hold management
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.config.settings import AppSettings, get_settings
from app.models.compliance import (
    LegalHold,
    LegalHoldCaptureMethod,
    LegalHoldCreate,
    LegalHoldPriority,
    LegalHoldResource,
    LegalHoldScopeType,
    LegalHoldStatus,
    LegalHoldSummary,
    LegalHoldType,
    LegalHoldUpdate,
)
from app.repositories.compliance_repository import ComplianceRepository
from app.services.audit_service import AuditEventType, AuditService


logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class LegalHoldError(Exception):
    """Base exception for legal hold service errors."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class LegalHoldNotFoundError(LegalHoldError):
    """Legal hold not found."""

    def __init__(self, hold_id: UUID):
        super().__init__(
            f"Legal hold {hold_id} not found",
            "LEGAL_HOLD_NOT_FOUND",
            404,
        )
        self.hold_id = hold_id


class LegalHoldInvalidStatusTransitionError(LegalHoldError):
    """Invalid status transition for legal hold."""

    def __init__(self, current_status: str, target_status: str):
        super().__init__(
            f"Cannot transition from '{current_status}' to '{target_status}'",
            "INVALID_HOLD_STATUS_TRANSITION",
            400,
        )
        self.current_status = current_status
        self.target_status = target_status


class LegalHoldAlreadyActiveError(LegalHoldError):
    """Legal hold is already active."""

    def __init__(self, hold_id: UUID):
        super().__init__(
            f"Legal hold {hold_id} is already active",
            "LEGAL_HOLD_ALREADY_ACTIVE",
            400,
        )
        self.hold_id = hold_id


class LegalHoldAlreadyReleasedError(LegalHoldError):
    """Legal hold is already released."""

    def __init__(self, hold_id: UUID):
        super().__init__(
            f"Legal hold {hold_id} is already released",
            "LEGAL_HOLD_ALREADY_RELEASED",
            400,
        )
        self.hold_id = hold_id


class LegalHoldResourceBlockedError(LegalHoldError):
    """Resource is blocked by legal hold."""

    def __init__(self, resource_type: str, resource_id: UUID, hold_id: UUID):
        super().__init__(
            f"Resource {resource_type}/{resource_id} is blocked by legal hold {hold_id}",
            "RESOURCE_BLOCKED_BY_LEGAL_HOLD",
            409,
        )
        self.resource_type = resource_type
        self.resource_id = resource_id
        self.hold_id = hold_id


class LegalHoldDuplicateResourceError(LegalHoldError):
    """Resource is already under this legal hold."""

    def __init__(self, hold_id: UUID, resource_type: str, resource_id: UUID):
        super().__init__(
            f"Resource {resource_type}/{resource_id} is already under legal hold {hold_id}",
            "DUPLICATE_HOLD_RESOURCE",
            409,
        )
        self.hold_id = hold_id
        self.resource_type = resource_type
        self.resource_id = resource_id


class LegalHoldExpiredError(LegalHoldError):
    """Legal hold has expired."""

    def __init__(self, hold_id: UUID):
        super().__init__(
            f"Legal hold {hold_id} has expired",
            "LEGAL_HOLD_EXPIRED",
            400,
        )
        self.hold_id = hold_id


# =============================================================================
# CONFIGURATION
# =============================================================================


# Valid status transitions for legal holds
VALID_HOLD_STATUS_TRANSITIONS: dict[LegalHoldStatus, list[LegalHoldStatus]] = {
    LegalHoldStatus.DRAFT: [
        LegalHoldStatus.PENDING_APPROVAL,
        LegalHoldStatus.ACTIVE,
        LegalHoldStatus.CANCELLED,
    ],
    LegalHoldStatus.PENDING_APPROVAL: [
        LegalHoldStatus.ACTIVE,
        LegalHoldStatus.DRAFT,
        LegalHoldStatus.CANCELLED,
    ],
    LegalHoldStatus.ACTIVE: [
        LegalHoldStatus.SUSPENDED,
        LegalHoldStatus.RELEASED,
    ],
    LegalHoldStatus.SUSPENDED: [
        LegalHoldStatus.ACTIVE,
        LegalHoldStatus.RELEASED,
    ],
    # Terminal states - no transitions allowed
    LegalHoldStatus.RELEASED: [],
    LegalHoldStatus.EXPIRED: [],
    LegalHoldStatus.CANCELLED: [],
}


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class LegalHoldListResult:
    """Result of listing legal holds."""

    items: list[LegalHoldSummary]
    page: int
    limit: int
    total: int
    total_pages: int


@dataclass
class LegalHoldStats:
    """Statistics for legal holds."""

    total: int
    active: int
    suspended: int
    released: int
    draft: int
    pending_approval: int
    total_affected_users: int
    total_affected_resources: int
    total_blocked_deletions: int


@dataclass
class DeletionCheckResult:
    """Result of checking if deletion is blocked."""

    blocked: bool
    blocking_holds: list[LegalHoldSummary]
    reason: Optional[str] = None


@dataclass
class CustodianAcknowledgment:
    """Result of recording custodian acknowledgment."""

    user_id: UUID
    acknowledged_at: datetime
    method: str
    hold_id: UUID


# =============================================================================
# LEGAL HOLD SERVICE
# =============================================================================


class LegalHoldService:
    """Service for managing legal holds.

    This service provides the business logic layer for legal hold management,
    coordinating between the repository, audit service, and compliance
    components.

    Key responsibilities:
    - Legal hold lifecycle (create, activate, suspend, release)
    - Resource protection from deletion
    - Custodian notification and acknowledgment tracking
    - Integration with data subject request blocking
    - Audit logging for compliance

    All methods enforce workspace isolation for multi-tenant security.
    """

    def __init__(self, settings: Optional[AppSettings] = None):
        """Initialize the legal hold service.

        Args:
            settings: Optional application settings override
        """
        self._settings = settings or get_settings()
        self._repository = ComplianceRepository()
        self._audit_service = AuditService()

    # =========================================================================
    # LEGAL HOLD LIFECYCLE OPERATIONS
    # =========================================================================

    async def create_legal_hold(
        self,
        workspace_id: UUID,
        name: str,
        issued_by_user_id: UUID,
        hold_type: LegalHoldType = LegalHoldType.LITIGATION,
        description: Optional[str] = None,
        matter_id: Optional[str] = None,
        matter_name: Optional[str] = None,
        priority: LegalHoldPriority = LegalHoldPriority.NORMAL,
        external_reference: Optional[str] = None,
        legal_counsel: Optional[str] = None,
        law_firm: Optional[str] = None,
        scope_type: LegalHoldScopeType = LegalHoldScopeType.SELECTIVE,
        scope_users: Optional[list[str]] = None,
        scope_resources: Optional[list[dict[str, Any]]] = None,
        scope_resource_types: Optional[list[str]] = None,
        scope_date_range: Optional[dict[str, Any]] = None,
        scope_keywords: Optional[list[str]] = None,
        custodians: Optional[list[dict[str, Any]]] = None,
        effective_from: Optional[datetime] = None,
        effective_until: Optional[datetime] = None,
        reminder_frequency_days: Optional[int] = None,
        auto_activate: bool = True,
        metadata: Optional[dict[str, Any]] = None,
    ) -> LegalHold:
        """Create a new legal hold.

        Creates a legal hold with the specified scope. By default, the hold
        is immediately activated. Set auto_activate=False to create in
        draft status for review before activation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            name: Name/title of the legal hold
            issued_by_user_id: User who issued the hold
            hold_type: Type of legal hold (litigation, regulatory, etc.)
            description: Detailed description of the hold
            matter_id: External legal matter ID
            matter_name: Name of the legal matter
            priority: Priority level
            external_reference: External reference number
            legal_counsel: Legal counsel name
            law_firm: Law firm name
            scope_type: How scope is determined
            scope_users: User IDs covered by hold
            scope_resources: Specific resources under hold
            scope_resource_types: Resource types covered
            scope_date_range: Date range filter
            scope_keywords: Keywords for matching
            custodians: Custodian information
            effective_from: When hold takes effect
            effective_until: When hold expires
            reminder_frequency_days: Days between reminders
            auto_activate: If True, activate immediately
            metadata: Additional metadata

        Returns:
            Created LegalHold
        """
        # Set effective_from to now if not specified and auto-activating
        if auto_activate and effective_from is None:
            effective_from = datetime.now(timezone.utc)

        # Create the hold
        record = await self._repository.create_legal_hold(
            workspace_id=workspace_id,
            name=name,
            issued_by_user_id=issued_by_user_id,
            hold_type=hold_type.value,
            description=description,
            matter_id=matter_id,
            matter_name=matter_name,
            priority=priority.value,
            external_reference=external_reference,
            legal_counsel=legal_counsel,
            law_firm=law_firm,
            scope_type=scope_type.value,
            scope_users=scope_users,
            scope_resources=scope_resources,
            scope_resource_types=scope_resource_types,
            scope_date_range=scope_date_range,
            scope_keywords=scope_keywords,
            custodians=custodians,
            effective_from=effective_from,
            effective_until=effective_until,
            reminder_frequency_days=reminder_frequency_days,
            metadata=metadata,
        )

        # Log audit event
        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=issued_by_user_id,
            target_entity_type="legal_hold",
            target_entity_id=record["hold_id"],
            details={
                "action": "legal_hold_created",
                "hold_number": record["hold_number"],
                "hold_type": hold_type.value,
                "name": name,
                "scope_type": scope_type.value,
                "auto_activated": auto_activate,
            },
        )

        logger.info(
            "Legal hold created",
            extra={
                "hold_id": str(record["hold_id"]),
                "hold_number": record["hold_number"],
                "workspace_id": str(workspace_id),
                "hold_type": hold_type.value,
            },
        )

        return self._dict_to_legal_hold(record)

    async def get_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
    ) -> LegalHold:
        """Get a legal hold by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to retrieve

        Returns:
            LegalHold

        Raises:
            LegalHoldNotFoundError: If hold not found
        """
        record = await self._repository.get_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
        )

        if not record:
            raise LegalHoldNotFoundError(hold_id)

        return self._dict_to_legal_hold(record)

    async def list_legal_holds(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[LegalHoldStatus] = None,
        hold_type: Optional[LegalHoldType] = None,
        include_released: bool = False,
    ) -> LegalHoldListResult:
        """List legal holds with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            hold_type: Optional hold type filter
            include_released: If True, include released/expired holds

        Returns:
            LegalHoldListResult with items and pagination
        """
        result = await self._repository.list_legal_holds(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            status=status.value if status else None,
            hold_type=hold_type.value if hold_type else None,
            include_released=include_released,
        )

        items = [self._dict_to_legal_hold_summary(item) for item in result["items"]]

        return LegalHoldListResult(
            items=items,
            page=result["pagination"]["page"],
            limit=result["pagination"]["limit"],
            total=result["pagination"]["total"],
            total_pages=result["pagination"]["total_pages"],
        )

    async def update_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        update: LegalHoldUpdate,
        updated_by_user_id: UUID,
    ) -> LegalHold:
        """Update a legal hold.

        Validates status transitions and updates the hold with proper
        audit logging.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to update
            update: Fields to update
            updated_by_user_id: User making the update

        Returns:
            Updated LegalHold

        Raises:
            LegalHoldNotFoundError: If hold not found
            LegalHoldInvalidStatusTransitionError: If status transition is invalid
            LegalHoldAlreadyReleasedError: If trying to update a released hold
        """
        # Get current hold
        current = await self.get_legal_hold(workspace_id, hold_id)

        # Check if already released
        if current.status == LegalHoldStatus.RELEASED:
            raise LegalHoldAlreadyReleasedError(hold_id)

        # Validate status transition if changing status
        if update.status and update.status != current.status:
            self._validate_status_transition(current.status, update.status)

        # Perform the update
        record = await self._repository.update_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            name=update.name,
            description=update.description,
            status=update.status.value if update.status else None,
            status_reason=update.status_reason,
            priority=update.priority.value if update.priority else None,
            scope_users=update.scope_users,
            scope_resources=update.scope_resources,
            scope_resource_types=update.scope_resource_types,
            scope_date_range=update.scope_date_range,
            scope_keywords=update.scope_keywords,
            custodians=update.custodians,
            effective_until=update.effective_until,
            reminder_frequency_days=update.reminder_frequency_days,
            internal_notes=update.internal_notes,
            metadata=update.metadata,
            changed_by_user_id=updated_by_user_id,
        )

        if not record:
            raise LegalHoldNotFoundError(hold_id)

        # Log status change audit event
        if update.status and update.status != current.status:
            await self._audit_service.log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                workspace_id=workspace_id,
                actor_user_id=updated_by_user_id,
                target_entity_type="legal_hold",
                target_entity_id=hold_id,
                details={
                    "action": "legal_hold_status_change",
                    "hold_number": current.hold_number,
                    "previous_status": current.status.value,
                    "new_status": update.status.value,
                    "reason": update.status_reason,
                },
            )

        logger.info(
            "Legal hold updated",
            extra={
                "hold_id": str(hold_id),
                "workspace_id": str(workspace_id),
                "updated_by": str(updated_by_user_id),
            },
        )

        return self._dict_to_legal_hold(record)

    async def activate_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        activated_by_user_id: UUID,
        reason: Optional[str] = None,
    ) -> LegalHold:
        """Activate a legal hold.

        Transitions the hold from draft or pending_approval to active status.
        Once active, all resources in scope are protected from deletion.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to activate
            activated_by_user_id: User activating the hold
            reason: Optional reason for activation

        Returns:
            Updated LegalHold

        Raises:
            LegalHoldNotFoundError: If hold not found
            LegalHoldAlreadyActiveError: If already active
            LegalHoldInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_legal_hold(workspace_id, hold_id)

        if current.status == LegalHoldStatus.ACTIVE:
            raise LegalHoldAlreadyActiveError(hold_id)

        self._validate_status_transition(current.status, LegalHoldStatus.ACTIVE)

        now = datetime.now(timezone.utc)
        record = await self._repository.update_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            status=LegalHoldStatus.ACTIVE.value,
            status_reason=reason or "Hold activated",
            changed_by_user_id=activated_by_user_id,
        )

        if not record:
            raise LegalHoldNotFoundError(hold_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=activated_by_user_id,
            target_entity_type="legal_hold",
            target_entity_id=hold_id,
            details={
                "action": "legal_hold_activated",
                "hold_number": current.hold_number,
                "reason": reason,
            },
        )

        logger.info(
            "Legal hold activated",
            extra={
                "hold_id": str(hold_id),
                "hold_number": current.hold_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_legal_hold(record)

    async def suspend_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        suspended_by_user_id: UUID,
        reason: str,
    ) -> LegalHold:
        """Suspend a legal hold.

        Temporarily suspends an active hold. Resources remain protected
        while suspended, but no new resources are captured.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to suspend
            suspended_by_user_id: User suspending the hold
            reason: Reason for suspension

        Returns:
            Updated LegalHold

        Raises:
            LegalHoldNotFoundError: If hold not found
            LegalHoldInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_legal_hold(workspace_id, hold_id)

        self._validate_status_transition(current.status, LegalHoldStatus.SUSPENDED)

        record = await self._repository.update_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            status=LegalHoldStatus.SUSPENDED.value,
            status_reason=reason,
            changed_by_user_id=suspended_by_user_id,
        )

        if not record:
            raise LegalHoldNotFoundError(hold_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=suspended_by_user_id,
            target_entity_type="legal_hold",
            target_entity_id=hold_id,
            details={
                "action": "legal_hold_suspended",
                "hold_number": current.hold_number,
                "reason": reason,
            },
        )

        logger.warning(
            "Legal hold suspended",
            extra={
                "hold_id": str(hold_id),
                "hold_number": current.hold_number,
                "workspace_id": str(workspace_id),
                "reason": reason,
            },
        )

        return self._dict_to_legal_hold(record)

    async def release_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        released_by_user_id: UUID,
        release_reason: str,
    ) -> LegalHold:
        """Release a legal hold.

        Permanently releases the hold. Protected resources are no longer
        blocked from deletion. This action cannot be undone.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to release
            released_by_user_id: User releasing the hold
            release_reason: Reason for releasing the hold

        Returns:
            Updated LegalHold

        Raises:
            LegalHoldNotFoundError: If hold not found
            LegalHoldAlreadyReleasedError: If already released
            LegalHoldInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_legal_hold(workspace_id, hold_id)

        if current.status == LegalHoldStatus.RELEASED:
            raise LegalHoldAlreadyReleasedError(hold_id)

        self._validate_status_transition(current.status, LegalHoldStatus.RELEASED)

        record = await self._repository.release_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            released_by_user_id=released_by_user_id,
            release_reason=release_reason,
        )

        if not record:
            raise LegalHoldNotFoundError(hold_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=released_by_user_id,
            target_entity_type="legal_hold",
            target_entity_id=hold_id,
            details={
                "action": "legal_hold_released",
                "hold_number": current.hold_number,
                "reason": release_reason,
                "affected_resources_count": current.affected_resources_count,
                "blocked_deletions_count": current.blocked_deletions_count,
            },
        )

        logger.info(
            "Legal hold released",
            extra={
                "hold_id": str(hold_id),
                "hold_number": current.hold_number,
                "workspace_id": str(workspace_id),
                "reason": release_reason,
            },
        )

        return self._dict_to_legal_hold(record)

    # =========================================================================
    # RESOURCE MANAGEMENT OPERATIONS
    # =========================================================================

    async def add_resource_to_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        resource_type: str,
        resource_id: UUID,
        added_by_user_id: UUID,
        user_id: Optional[UUID] = None,
        capture_method: LegalHoldCaptureMethod = LegalHoldCaptureMethod.MANUAL_ADD,
        metadata: Optional[dict[str, Any]] = None,
    ) -> LegalHoldResource:
        """Add a resource to a legal hold.

        Manually adds a specific resource to the hold's scope.
        The resource will be protected from deletion while the hold is active.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to add resource to
            resource_type: Type of resource (asset, gallery, etc.)
            resource_id: ID of the resource
            added_by_user_id: User adding the resource
            user_id: Optional user associated with the resource
            capture_method: How the resource was captured
            metadata: Additional metadata

        Returns:
            Created LegalHoldResource

        Raises:
            LegalHoldNotFoundError: If hold not found
            LegalHoldAlreadyReleasedError: If hold is released
        """
        # Verify hold exists and is not released
        hold = await self.get_legal_hold(workspace_id, hold_id)

        if hold.status == LegalHoldStatus.RELEASED:
            raise LegalHoldAlreadyReleasedError(hold_id)

        record = await self._repository.add_resource_to_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            resource_type=resource_type,
            resource_id=resource_id,
            user_id=user_id,
            capture_method=capture_method.value,
            added_by_user_id=added_by_user_id,
            metadata=metadata,
        )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=added_by_user_id,
            target_entity_type="legal_hold_resource",
            target_entity_id=record["id"],
            details={
                "action": "resource_added_to_hold",
                "hold_id": str(hold_id),
                "hold_number": hold.hold_number,
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "capture_method": capture_method.value,
            },
        )

        logger.info(
            "Resource added to legal hold",
            extra={
                "hold_id": str(hold_id),
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_legal_hold_resource(record)

    async def remove_resource_from_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        resource_type: str,
        resource_id: UUID,
        removed_by_user_id: UUID,
        reason: Optional[str] = None,
    ) -> bool:
        """Remove a resource from a legal hold.

        Removes a specific resource from the hold. The resource will
        no longer be protected by this hold (may still be protected
        by other holds).

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to remove resource from
            resource_type: Type of resource
            resource_id: ID of the resource
            removed_by_user_id: User removing the resource
            reason: Optional reason for removal

        Returns:
            True if removed, False if not found

        Raises:
            LegalHoldNotFoundError: If hold not found
        """
        # Verify hold exists
        hold = await self.get_legal_hold(workspace_id, hold_id)

        removed = await self._repository.remove_resource_from_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )

        if removed:
            await self._audit_service.log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                workspace_id=workspace_id,
                actor_user_id=removed_by_user_id,
                target_entity_type="legal_hold_resource",
                target_entity_id=resource_id,
                details={
                    "action": "resource_removed_from_hold",
                    "hold_id": str(hold_id),
                    "hold_number": hold.hold_number,
                    "resource_type": resource_type,
                    "resource_id": str(resource_id),
                    "reason": reason,
                },
            )

            logger.info(
                "Resource removed from legal hold",
                extra={
                    "hold_id": str(hold_id),
                    "resource_type": resource_type,
                    "resource_id": str(resource_id),
                    "workspace_id": str(workspace_id),
                },
            )

        return removed

    async def check_deletion_blocked(
        self,
        workspace_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> DeletionCheckResult:
        """Check if a resource deletion would be blocked by legal holds.

        Use this before attempting to delete any resource to check for
        legal hold protection.

        Args:
            workspace_id: Workspace ID for tenant isolation
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            DeletionCheckResult with blocking information
        """
        is_blocked = await self._repository.is_resource_under_legal_hold(
            workspace_id=workspace_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )

        if not is_blocked:
            return DeletionCheckResult(
                blocked=False,
                blocking_holds=[],
            )

        # Get the blocking holds
        holds = await self._repository.get_active_holds_for_resource(
            workspace_id=workspace_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )

        blocking_holds = [self._dict_to_legal_hold_summary(h) for h in holds]

        return DeletionCheckResult(
            blocked=True,
            blocking_holds=blocking_holds,
            reason=f"Resource is protected by {len(blocking_holds)} active legal hold(s)",
        )

    async def record_blocked_deletion(
        self,
        workspace_id: UUID,
        resource_type: str,
        resource_id: UUID,
        attempted_by_user_id: Optional[UUID] = None,
    ) -> list[LegalHoldSummary]:
        """Record a blocked deletion attempt.

        Called when a deletion is blocked due to legal hold. Updates
        statistics on the hold and creates an audit trail.

        Args:
            workspace_id: Workspace ID for tenant isolation
            resource_type: Type of resource
            resource_id: ID of the resource
            attempted_by_user_id: User who attempted the deletion

        Returns:
            List of legal holds that blocked the deletion
        """
        holds = await self._repository.get_active_holds_for_resource(
            workspace_id=workspace_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )

        for hold in holds:
            await self._repository.record_deletion_attempt(
                workspace_id=workspace_id,
                hold_id=hold["hold_id"],
                resource_type=resource_type,
                resource_id=resource_id,
            )

            await self._audit_service.log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                workspace_id=workspace_id,
                actor_user_id=attempted_by_user_id,
                target_entity_type="legal_hold",
                target_entity_id=hold["hold_id"],
                details={
                    "action": "deletion_blocked",
                    "hold_number": hold["hold_number"],
                    "resource_type": resource_type,
                    "resource_id": str(resource_id),
                },
            )

        logger.warning(
            "Deletion blocked by legal hold",
            extra={
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "blocking_holds": [h["hold_number"] for h in holds],
                "workspace_id": str(workspace_id),
            },
        )

        return [self._dict_to_legal_hold_summary(h) for h in holds]

    async def is_user_under_hold(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Check if a user is under any active legal hold.

        This checks if the user ID appears in any active hold's scope_users
        or if there's a workspace-wide hold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            user_id: User ID to check

        Returns:
            True if user is under hold, False otherwise
        """
        from app.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM legal_holds
                WHERE workspace_id = $1
                  AND status = 'active'
                  AND ($2::text = ANY(scope_users) OR scope_type = 'workspace_wide')
                """,
                workspace_id,
                str(user_id),
            )
            return count > 0

    async def get_holds_for_user(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> list[LegalHoldSummary]:
        """Get all active legal holds that include a user.

        Args:
            workspace_id: Workspace ID for tenant isolation
            user_id: User ID to check

        Returns:
            List of legal holds covering the user
        """
        from app.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM legal_holds
                WHERE workspace_id = $1
                  AND status = 'active'
                  AND ($2::text = ANY(scope_users) OR scope_type = 'workspace_wide')
                ORDER BY priority DESC, created_at ASC
                """,
                workspace_id,
                str(user_id),
            )
            return [self._dict_to_legal_hold_summary(self._row_to_dict(row)) for row in rows]

    # =========================================================================
    # CUSTODIAN MANAGEMENT
    # =========================================================================

    async def add_custodian(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        user_id: UUID,
        name: str,
        email: str,
        added_by_user_id: UUID,
    ) -> LegalHold:
        """Add a custodian to a legal hold.

        Custodians are individuals responsible for preserving data
        related to the legal matter.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID
            user_id: User ID of the custodian
            name: Name of the custodian
            email: Email of the custodian
            added_by_user_id: User adding the custodian

        Returns:
            Updated LegalHold
        """
        hold = await self.get_legal_hold(workspace_id, hold_id)

        if hold.status == LegalHoldStatus.RELEASED:
            raise LegalHoldAlreadyReleasedError(hold_id)

        # Add to custodians list
        custodians = list(hold.custodians)
        now = datetime.now(timezone.utc)
        custodians.append({
            "user_id": str(user_id),
            "name": name,
            "email": email,
            "added_at": now.isoformat(),
            "added_by": str(added_by_user_id),
            "notified_at": None,
            "acknowledged_at": None,
        })

        record = await self._repository.update_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            custodians=custodians,
            changed_by_user_id=added_by_user_id,
        )

        # Also add user to scope_users if not already there
        scope_users = list(hold.scope_users)
        user_id_str = str(user_id)
        if user_id_str not in scope_users:
            scope_users.append(user_id_str)
            await self._repository.update_legal_hold(
                workspace_id=workspace_id,
                hold_id=hold_id,
                scope_users=scope_users,
            )
            # Increment affected users count
            await self._repository.increment_legal_hold_stats(
                workspace_id=workspace_id,
                hold_id=hold_id,
                affected_users_delta=1,
            )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=added_by_user_id,
            target_entity_type="legal_hold",
            target_entity_id=hold_id,
            details={
                "action": "custodian_added",
                "hold_number": hold.hold_number,
                "custodian_user_id": str(user_id),
                "custodian_email": email,
            },
        )

        return self._dict_to_legal_hold(record)

    async def record_custodian_acknowledgment(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        user_id: UUID,
        method: str = "portal",
    ) -> CustodianAcknowledgment:
        """Record a custodian's acknowledgment of a legal hold.

        Custodians must acknowledge receipt of hold notice and their
        obligation to preserve data.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID
            user_id: User ID of the custodian
            method: Method of acknowledgment (portal, email, etc.)

        Returns:
            CustodianAcknowledgment record
        """
        hold = await self.get_legal_hold(workspace_id, hold_id)

        now = datetime.now(timezone.utc)

        # Update custodian's acknowledgment
        custodians = list(hold.custodians)
        user_id_str = str(user_id)
        updated = False
        for custodian in custodians:
            if custodian.get("user_id") == user_id_str:
                custodian["acknowledged_at"] = now.isoformat()
                custodian["acknowledgment_method"] = method
                updated = True
                break

        if updated:
            # Update custodian_acknowledgments list as well
            acks = list(hold.custodian_acknowledgments)
            acks.append({
                "user_id": user_id_str,
                "acknowledged_at": now.isoformat(),
                "method": method,
            })

            await self._repository.update_legal_hold(
                workspace_id=workspace_id,
                hold_id=hold_id,
                custodians=custodians,
                changed_by_user_id=user_id,
            )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=user_id,
            target_entity_type="legal_hold",
            target_entity_id=hold_id,
            details={
                "action": "custodian_acknowledged",
                "hold_number": hold.hold_number,
                "custodian_user_id": user_id_str,
                "method": method,
            },
        )

        logger.info(
            "Custodian acknowledged legal hold",
            extra={
                "hold_id": str(hold_id),
                "hold_number": hold.hold_number,
                "custodian_user_id": user_id_str,
                "workspace_id": str(workspace_id),
            },
        )

        return CustodianAcknowledgment(
            user_id=user_id,
            acknowledged_at=now,
            method=method,
            hold_id=hold_id,
        )

    # =========================================================================
    # STATISTICS AND REPORTING
    # =========================================================================

    async def get_stats(
        self,
        workspace_id: UUID,
    ) -> LegalHoldStats:
        """Get statistics for legal holds.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            LegalHoldStats with counts and metrics
        """
        # Get all holds for stats calculation
        all_holds = await self._repository.list_legal_holds(
            workspace_id=workspace_id,
            page=1,
            limit=10000,  # Get all for stats
            include_released=True,
        )

        items = all_holds["items"]

        total = len(items)
        active = sum(1 for h in items if h.get("status") == "active")
        suspended = sum(1 for h in items if h.get("status") == "suspended")
        released = sum(1 for h in items if h.get("status") == "released")
        draft = sum(1 for h in items if h.get("status") == "draft")
        pending_approval = sum(1 for h in items if h.get("status") == "pending_approval")

        total_affected_users = sum(h.get("affected_users_count", 0) for h in items)
        total_affected_resources = sum(h.get("affected_resources_count", 0) for h in items)
        total_blocked_deletions = sum(h.get("blocked_deletions_count", 0) for h in items)

        return LegalHoldStats(
            total=total,
            active=active,
            suspended=suspended,
            released=released,
            draft=draft,
            pending_approval=pending_approval,
            total_affected_users=total_affected_users,
            total_affected_resources=total_affected_resources,
            total_blocked_deletions=total_blocked_deletions,
        )

    async def get_active_holds(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
    ) -> LegalHoldListResult:
        """Get all active legal holds.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page

        Returns:
            LegalHoldListResult with active holds
        """
        return await self.list_legal_holds(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            status=LegalHoldStatus.ACTIVE,
        )

    async def get_expiring_holds(
        self,
        workspace_id: UUID,
        days_until_expiry: int = 30,
    ) -> list[LegalHoldSummary]:
        """Get legal holds that are expiring soon.

        Args:
            workspace_id: Workspace ID for tenant isolation
            days_until_expiry: Number of days to look ahead

        Returns:
            List of holds expiring within the specified days
        """
        from app.db.postgres import get_postgres_pool

        expiry_threshold = datetime.now(timezone.utc) + timedelta(days=days_until_expiry)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM legal_holds
                WHERE workspace_id = $1
                  AND status = 'active'
                  AND effective_until IS NOT NULL
                  AND effective_until <= $2
                ORDER BY effective_until ASC
                """,
                workspace_id,
                expiry_threshold,
            )
            return [self._dict_to_legal_hold_summary(self._row_to_dict(row)) for row in rows]

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    def _validate_status_transition(
        self,
        current_status: LegalHoldStatus,
        target_status: LegalHoldStatus,
    ) -> None:
        """Validate that a status transition is allowed.

        Args:
            current_status: Current status of the hold
            target_status: Target status to transition to

        Raises:
            LegalHoldInvalidStatusTransitionError: If transition is not allowed
        """
        allowed = VALID_HOLD_STATUS_TRANSITIONS.get(current_status, [])
        if target_status not in allowed:
            raise LegalHoldInvalidStatusTransitionError(
                current_status.value,
                target_status.value,
            )

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if hasattr(row, "_asdict"):
            return dict(row._asdict())
        return dict(row)

    def _dict_to_legal_hold(self, record: dict[str, Any]) -> LegalHold:
        """Convert a database record to a LegalHold model.

        Args:
            record: Database record as dict

        Returns:
            LegalHold model instance
        """
        return LegalHold(
            hold_id=record["hold_id"],
            workspace_id=record["workspace_id"],
            hold_number=record["hold_number"],
            name=record["name"],
            description=record.get("description"),
            hold_type=LegalHoldType(record.get("hold_type", "litigation")),
            matter_id=record.get("matter_id"),
            matter_name=record.get("matter_name"),
            status=LegalHoldStatus(record["status"]),
            status_reason=record.get("status_reason"),
            priority=LegalHoldPriority(record.get("priority", "normal")),
            external_reference=record.get("external_reference"),
            legal_counsel=record.get("legal_counsel"),
            law_firm=record.get("law_firm"),
            scope_type=LegalHoldScopeType(record.get("scope_type", "selective")),
            scope_users=record.get("scope_users", []),
            scope_resources=record.get("scope_resources", []),
            scope_resource_types=record.get("scope_resource_types", []),
            scope_date_range=record.get("scope_date_range"),
            scope_keywords=record.get("scope_keywords", []),
            custodians=record.get("custodians", []),
            custodian_acknowledgments=record.get("custodian_acknowledgments", []),
            issued_at=record["issued_at"],
            effective_from=record["effective_from"],
            effective_until=record.get("effective_until"),
            released_at=record.get("released_at"),
            issued_by_user_id=record["issued_by_user_id"],
            released_by_user_id=record.get("released_by_user_id"),
            release_reason=record.get("release_reason"),
            notification_sent_at=record.get("notification_sent_at"),
            reminder_frequency_days=record.get("reminder_frequency_days"),
            last_reminder_sent_at=record.get("last_reminder_sent_at"),
            next_reminder_at=record.get("next_reminder_at"),
            affected_users_count=record.get("affected_users_count", 0),
            affected_resources_count=record.get("affected_resources_count", 0),
            blocked_deletions_count=record.get("blocked_deletions_count", 0),
            blocked_requests_count=record.get("blocked_requests_count", 0),
            internal_notes=record.get("internal_notes"),
            status_history=record.get("status_history", []),
            metadata=record.get("metadata", {}),
            created_at=record["created_at"],
            updated_at=record["updated_at"],
        )

    def _dict_to_legal_hold_summary(self, record: dict[str, Any]) -> LegalHoldSummary:
        """Convert a database record to a LegalHoldSummary model.

        Args:
            record: Database record as dict

        Returns:
            LegalHoldSummary model instance
        """
        return LegalHoldSummary(
            hold_id=record["hold_id"],
            workspace_id=record["workspace_id"],
            hold_number=record["hold_number"],
            name=record["name"],
            hold_type=LegalHoldType(record.get("hold_type", "litigation")),
            status=LegalHoldStatus(record["status"]),
            priority=LegalHoldPriority(record.get("priority", "normal")),
            effective_from=record["effective_from"],
            effective_until=record.get("effective_until"),
            affected_resources_count=record.get("affected_resources_count", 0),
        )

    def _dict_to_legal_hold_resource(self, record: dict[str, Any]) -> LegalHoldResource:
        """Convert a database record to a LegalHoldResource model.

        Args:
            record: Database record as dict

        Returns:
            LegalHoldResource model instance
        """
        return LegalHoldResource(
            id=record["id"],
            hold_id=record["hold_id"],
            workspace_id=record["workspace_id"],
            resource_type=record["resource_type"],
            resource_id=record["resource_id"],
            user_id=record.get("user_id"),
            capture_method=LegalHoldCaptureMethod(record.get("capture_method", "scope_match")),
            added_at=record["added_at"],
            added_by_user_id=record.get("added_by_user_id"),
            deletion_attempts=record.get("deletion_attempts", 0),
            last_deletion_attempt_at=record.get("last_deletion_attempt_at"),
            metadata=record.get("metadata", {}),
        )


# =============================================================================
# FACTORY FUNCTION
# =============================================================================


_legal_hold_service: Optional[LegalHoldService] = None


def get_legal_hold_service() -> LegalHoldService:
    """Get the singleton legal hold service instance.

    Returns:
        LegalHoldService instance
    """
    global _legal_hold_service
    if _legal_hold_service is None:
        _legal_hold_service = LegalHoldService()
    return _legal_hold_service
