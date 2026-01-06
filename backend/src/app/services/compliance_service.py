"""Compliance service for data subject requests.

This service provides high-level business logic for managing data subject
requests (DSRs) in compliance with GDPR, CCPA, DPDP, and other regulations.

It handles:
- DSR lifecycle management (creation, verification, processing, completion)
- Integration with legal hold checks to prevent blocked deletions
- Status transitions with validation
- Deadline tracking and extension management
- Export job orchestration
- Audit logging for compliance

Feature: Audit & Compliance System
Task: T007 - Create compliance service for data subject requests
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from app.config.settings import AppSettings, get_settings
from app.models.compliance import (
    DSRPriority,
    DSRRequestType,
    DSRSource,
    DSRStatus,
    DSRSubjectType,
    DSRVerificationStatus,
    DataSubjectRequest,
    DataSubjectRequestCreate,
    DataSubjectRequestSummary,
    DataSubjectRequestUpdate,
)
from app.repositories.compliance_repository import ComplianceRepository
from app.services.audit_service import AuditEventType, AuditService


logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class ComplianceError(Exception):
    """Base exception for compliance service errors."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class DSRNotFoundError(ComplianceError):
    """Data subject request not found."""

    def __init__(self, request_id: UUID):
        super().__init__(
            f"Data subject request {request_id} not found",
            "DSR_NOT_FOUND",
            404,
        )
        self.request_id = request_id


class DSRInvalidStatusTransitionError(ComplianceError):
    """Invalid status transition for data subject request."""

    def __init__(self, current_status: str, target_status: str):
        super().__init__(
            f"Cannot transition from '{current_status}' to '{target_status}'",
            "INVALID_STATUS_TRANSITION",
            400,
        )
        self.current_status = current_status
        self.target_status = target_status


class DSRBlockedByLegalHoldError(ComplianceError):
    """Data subject request is blocked by a legal hold."""

    def __init__(self, request_id: UUID, hold_id: UUID):
        super().__init__(
            f"Data subject request {request_id} is blocked by legal hold {hold_id}",
            "DSR_BLOCKED_BY_LEGAL_HOLD",
            409,
        )
        self.request_id = request_id
        self.hold_id = hold_id


class DSRVerificationRequiredError(ComplianceError):
    """Identity verification is required before processing."""

    def __init__(self, request_id: UUID):
        super().__init__(
            f"Identity verification required for request {request_id}",
            "VERIFICATION_REQUIRED",
            400,
        )
        self.request_id = request_id


class DSRExpiredError(ComplianceError):
    """Data subject request has expired."""

    def __init__(self, request_id: UUID):
        super().__init__(
            f"Data subject request {request_id} has expired",
            "DSR_EXPIRED",
            400,
        )
        self.request_id = request_id


class DSRAlreadyCompletedError(ComplianceError):
    """Data subject request is already completed."""

    def __init__(self, request_id: UUID):
        super().__init__(
            f"Data subject request {request_id} is already completed",
            "DSR_ALREADY_COMPLETED",
            400,
        )
        self.request_id = request_id


class DSRDuplicateRequestError(ComplianceError):
    """Duplicate data subject request detected."""

    def __init__(self, subject_email: str, request_type: str, existing_request_id: UUID):
        super().__init__(
            f"Duplicate {request_type} request for {subject_email}",
            "DUPLICATE_DSR",
            409,
        )
        self.subject_email = subject_email
        self.request_type = request_type
        self.existing_request_id = existing_request_id


# =============================================================================
# CONFIGURATION
# =============================================================================


# Regulatory deadline days by regulation
REGULATORY_DEADLINES = {
    "gdpr": 30,  # GDPR: 30 days
    "ccpa": 45,  # CCPA: 45 days
    "dpdp": 30,  # India DPDP: 30 days
    "default": 30,
}

# Maximum extension days by regulation
MAX_EXTENSION_DAYS = {
    "gdpr": 60,  # GDPR allows up to 60 additional days
    "ccpa": 45,  # CCPA allows 45 additional days
    "dpdp": 30,  # India DPDP allows 30 additional days
    "default": 30,
}

# Valid status transitions
VALID_STATUS_TRANSITIONS: dict[DSRStatus, list[DSRStatus]] = {
    DSRStatus.PENDING: [
        DSRStatus.IDENTITY_VERIFICATION,
        DSRStatus.ACKNOWLEDGED,
        DSRStatus.REJECTED,
        DSRStatus.CANCELLED,
    ],
    DSRStatus.IDENTITY_VERIFICATION: [
        DSRStatus.ACKNOWLEDGED,
        DSRStatus.REJECTED,
        DSRStatus.CANCELLED,
    ],
    DSRStatus.ACKNOWLEDGED: [
        DSRStatus.IN_PROGRESS,
        DSRStatus.AWAITING_APPROVAL,
        DSRStatus.BLOCKED,
        DSRStatus.CANCELLED,
    ],
    DSRStatus.IN_PROGRESS: [
        DSRStatus.AWAITING_APPROVAL,
        DSRStatus.COMPLETED,
        DSRStatus.PARTIALLY_COMPLETED,
        DSRStatus.BLOCKED,
        DSRStatus.CANCELLED,
    ],
    DSRStatus.AWAITING_APPROVAL: [
        DSRStatus.IN_PROGRESS,
        DSRStatus.COMPLETED,
        DSRStatus.REJECTED,
        DSRStatus.CANCELLED,
    ],
    DSRStatus.BLOCKED: [
        DSRStatus.IN_PROGRESS,
        DSRStatus.CANCELLED,
    ],
    DSRStatus.PARTIALLY_COMPLETED: [
        DSRStatus.IN_PROGRESS,
        DSRStatus.COMPLETED,
    ],
    # Terminal states - no transitions allowed
    DSRStatus.COMPLETED: [],
    DSRStatus.REJECTED: [],
    DSRStatus.CANCELLED: [],
    DSRStatus.EXPIRED: [],
}


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class DSRListResult:
    """Result of listing data subject requests."""

    items: list[DataSubjectRequestSummary]
    page: int
    limit: int
    total: int
    total_pages: int


@dataclass
class DSRStats:
    """Statistics for data subject requests."""

    total: int
    pending: int
    in_progress: int
    completed: int
    overdue: int
    blocked: int
    average_completion_days: float


@dataclass
class VerificationResult:
    """Result of identity verification."""

    verified: bool
    method: str
    details: Optional[str] = None


# =============================================================================
# COMPLIANCE SERVICE
# =============================================================================


class ComplianceService:
    """Service for managing data subject requests.

    This service provides the business logic layer for DSR management,
    coordinating between the repository, audit service, and other
    compliance components.

    All methods enforce workspace isolation for multi-tenant security.
    """

    def __init__(self, settings: Optional[AppSettings] = None):
        """Initialize the compliance service.

        Args:
            settings: Optional application settings override
        """
        self._settings = settings or get_settings()
        self._repository = ComplianceRepository()
        self._audit_service = AuditService()

    # =========================================================================
    # DATA SUBJECT REQUEST OPERATIONS
    # =========================================================================

    async def create_data_subject_request(
        self,
        workspace_id: UUID,
        subject_email: str,
        request_type: DSRRequestType,
        subject_name: Optional[str] = None,
        subject_user_id: Optional[UUID] = None,
        subject_type: DSRSubjectType = DSRSubjectType.USER,
        request_source: DSRSource = DSRSource.USER_PORTAL,
        description: Optional[str] = None,
        priority: DSRPriority = DSRPriority.NORMAL,
        scope: Optional[dict[str, Any]] = None,
        requester_ip_address: Optional[str] = None,
        requester_user_agent: Optional[str] = None,
        regulation: str = "gdpr",
        skip_duplicate_check: bool = False,
        created_by_user_id: Optional[UUID] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> DataSubjectRequest:
        """Create a new data subject request.

        Creates a DSR with automatic deadline calculation based on the
        applicable regulation. Checks for duplicate pending requests
        unless explicitly skipped.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subject_email: Email address of the data subject
            request_type: Type of request (access, erasure, etc.)
            subject_name: Optional name of the data subject
            subject_user_id: Optional user ID if subject is a platform user
            subject_type: Type of data subject
            request_source: Source of the request
            description: Optional description or additional details
            priority: Priority level
            scope: Optional scope specification
            requester_ip_address: IP address of requester
            requester_user_agent: User agent of requester
            regulation: Applicable regulation (gdpr, ccpa, dpdp)
            skip_duplicate_check: If True, skip duplicate request check
            created_by_user_id: User ID of creator (for admin-initiated)
            metadata: Additional metadata

        Returns:
            Created DataSubjectRequest

        Raises:
            DSRDuplicateRequestError: If duplicate pending request exists
        """
        # Check for duplicate pending requests
        if not skip_duplicate_check:
            existing = await self._check_duplicate_request(
                workspace_id=workspace_id,
                subject_email=subject_email,
                request_type=request_type,
            )
            if existing:
                raise DSRDuplicateRequestError(
                    subject_email=subject_email,
                    request_type=request_type.value,
                    existing_request_id=existing,
                )

        # Calculate deadline based on regulation
        deadline_days = REGULATORY_DEADLINES.get(regulation, REGULATORY_DEADLINES["default"])
        deadline_at = datetime.now(timezone.utc) + timedelta(days=deadline_days)

        # Auto-waive verification for logged-in users
        verification_status = (
            DSRVerificationStatus.WAIVED
            if subject_user_id and request_source == DSRSource.USER_PORTAL
            else DSRVerificationStatus.PENDING
        )

        # Create the request
        record = await self._repository.create_data_subject_request(
            workspace_id=workspace_id,
            subject_email=subject_email,
            request_type=request_type.value,
            deadline_at=deadline_at,
            subject_name=subject_name,
            subject_user_id=subject_user_id,
            subject_type=subject_type.value,
            request_source=request_source.value,
            description=description,
            priority=priority.value,
            scope=scope,
            requester_ip_address=requester_ip_address,
            requester_user_agent=requester_user_agent,
            metadata={
                **(metadata or {}),
                "regulation": regulation,
                "verification_status": verification_status.value,
            },
        )

        # Update verification status if waived
        if verification_status == DSRVerificationStatus.WAIVED:
            await self._repository.update_data_subject_request(
                workspace_id=workspace_id,
                request_id=record["request_id"],
                verification_status=verification_status.value,
                verified_at=datetime.now(timezone.utc),
            )
            record["verification_status"] = verification_status.value

        # Log audit event
        await self._audit_service.log_event(
            event_type=AuditEventType.DATA_EXPORT_REQUESTED,
            workspace_id=workspace_id,
            actor_user_id=created_by_user_id or subject_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=record["request_id"],
            ip_address=requester_ip_address,
            user_agent=requester_user_agent,
            details={
                "request_number": record["request_number"],
                "request_type": request_type.value,
                "subject_email": subject_email,
                "regulation": regulation,
            },
        )

        logger.info(
            "Data subject request created",
            extra={
                "request_id": str(record["request_id"]),
                "request_number": record["request_number"],
                "workspace_id": str(workspace_id),
                "request_type": request_type.value,
            },
        )

        return self._dict_to_dsr(record)

    async def get_data_subject_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
    ) -> DataSubjectRequest:
        """Get a data subject request by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to retrieve

        Returns:
            DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
        """
        record = await self._repository.get_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        return self._dict_to_dsr(record)

    async def get_data_subject_request_by_number(
        self,
        workspace_id: UUID,
        request_number: str,
    ) -> DataSubjectRequest:
        """Get a data subject request by its human-readable number.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_number: Human-readable request number (e.g., DSR-2026-00001)

        Returns:
            DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
        """
        record = await self._repository.get_data_subject_request_by_number(
            workspace_id=workspace_id,
            request_number=request_number,
        )

        if not record:
            # Use a placeholder UUID for the error since we don't have the ID
            from uuid import uuid4
            raise DSRNotFoundError(uuid4())

        return self._dict_to_dsr(record)

    async def list_data_subject_requests(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[DSRStatus] = None,
        request_type: Optional[DSRRequestType] = None,
        subject_email: Optional[str] = None,
        priority: Optional[DSRPriority] = None,
        overdue_only: bool = False,
    ) -> DSRListResult:
        """List data subject requests with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            request_type: Optional request type filter
            subject_email: Optional subject email filter (partial match)
            priority: Optional priority filter
            overdue_only: If True, only return overdue requests

        Returns:
            DSRListResult with items and pagination
        """
        result = await self._repository.list_data_subject_requests(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            status=status.value if status else None,
            request_type=request_type.value if request_type else None,
            subject_email=subject_email,
            priority=priority.value if priority else None,
            overdue_only=overdue_only,
        )

        items = [self._dict_to_dsr_summary(item) for item in result["items"]]

        return DSRListResult(
            items=items,
            page=result["pagination"]["page"],
            limit=result["pagination"]["limit"],
            total=result["pagination"]["total"],
            total_pages=result["pagination"]["total_pages"],
        )

    async def update_data_subject_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
        update: DataSubjectRequestUpdate,
        updated_by_user_id: Optional[UUID] = None,
    ) -> DataSubjectRequest:
        """Update a data subject request.

        Validates status transitions and updates the request with
        proper audit logging.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to update
            update: Fields to update
            updated_by_user_id: User making the update

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
            DSRInvalidStatusTransitionError: If status transition is invalid
        """
        # Get current request
        current = await self.get_data_subject_request(workspace_id, request_id)

        # Validate status transition if changing status
        if update.status and update.status != current.status:
            self._validate_status_transition(current.status, update.status)

        # Perform the update
        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            status=update.status.value if update.status else None,
            status_reason=update.status_reason,
            priority=update.priority.value if update.priority else None,
            assigned_to_user_id=update.assigned_to_user_id,
            extended_deadline_at=update.extended_deadline_at,
            extension_reason=update.extension_reason,
            verification_status=update.verification_status.value if update.verification_status else None,
            verification_method=update.verification_method,
            internal_notes=update.internal_notes,
            scope=update.scope,
            metadata=update.metadata,
            changed_by_user_id=updated_by_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        # Log status change audit event
        if update.status and update.status != current.status:
            await self._audit_service.log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                workspace_id=workspace_id,
                actor_user_id=updated_by_user_id,
                target_entity_type="data_subject_request",
                target_entity_id=request_id,
                details={
                    "action": "status_change",
                    "request_number": current.request_number,
                    "previous_status": current.status.value,
                    "new_status": update.status.value,
                    "reason": update.status_reason,
                },
            )

        logger.info(
            "Data subject request updated",
            extra={
                "request_id": str(request_id),
                "workspace_id": str(workspace_id),
                "updated_by": str(updated_by_user_id) if updated_by_user_id else None,
            },
        )

        return self._dict_to_dsr(record)

    async def acknowledge_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
        acknowledged_by_user_id: UUID,
        internal_notes: Optional[str] = None,
    ) -> DataSubjectRequest:
        """Acknowledge a data subject request.

        Transitions the request to ACKNOWLEDGED status and records
        the acknowledgment timestamp.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to acknowledge
            acknowledged_by_user_id: User acknowledging the request
            internal_notes: Optional internal notes

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
            DSRVerificationRequiredError: If identity not verified
            DSRInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_data_subject_request(workspace_id, request_id)

        # Check if verification is required and not done
        if (
            current.verification_status not in (DSRVerificationStatus.VERIFIED, DSRVerificationStatus.WAIVED)
            and current.status == DSRStatus.PENDING
        ):
            raise DSRVerificationRequiredError(request_id)

        # Validate transition
        self._validate_status_transition(current.status, DSRStatus.ACKNOWLEDGED)

        now = datetime.now(timezone.utc)
        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            status=DSRStatus.ACKNOWLEDGED.value,
            status_reason="Request acknowledged",
            acknowledged_at=now,
            assigned_to_user_id=acknowledged_by_user_id,
            internal_notes=internal_notes,
            changed_by_user_id=acknowledged_by_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=acknowledged_by_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=request_id,
            details={
                "action": "acknowledged",
                "request_number": current.request_number,
            },
        )

        return self._dict_to_dsr(record)

    async def start_processing(
        self,
        workspace_id: UUID,
        request_id: UUID,
        processor_user_id: UUID,
    ) -> DataSubjectRequest:
        """Start processing a data subject request.

        Transitions the request to IN_PROGRESS status. Checks for
        legal holds that might block erasure requests.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to process
            processor_user_id: User starting the processing

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
            DSRBlockedByLegalHoldError: If blocked by legal hold
            DSRInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_data_subject_request(workspace_id, request_id)

        # For erasure requests, check for legal holds
        if current.request_type == DSRRequestType.ERASURE:
            hold_id = await self._check_legal_hold_blocking(
                workspace_id=workspace_id,
                subject_user_id=current.subject_user_id,
            )
            if hold_id:
                # Block the request
                await self._repository.update_data_subject_request(
                    workspace_id=workspace_id,
                    request_id=request_id,
                    status=DSRStatus.BLOCKED.value,
                    status_reason="Blocked by legal hold",
                    blocked_by_legal_hold_id=hold_id,
                    blocked_at=datetime.now(timezone.utc),
                    blocked_reason=f"Legal hold {hold_id} applies to this subject",
                    changed_by_user_id=processor_user_id,
                )
                raise DSRBlockedByLegalHoldError(request_id, hold_id)

        # Validate transition
        self._validate_status_transition(current.status, DSRStatus.IN_PROGRESS)

        now = datetime.now(timezone.utc)
        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            status=DSRStatus.IN_PROGRESS.value,
            status_reason="Processing started",
            processing_started_at=now,
            assigned_to_user_id=processor_user_id,
            changed_by_user_id=processor_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=processor_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=request_id,
            details={
                "action": "processing_started",
                "request_number": current.request_number,
                "request_type": current.request_type.value,
            },
        )

        return self._dict_to_dsr(record)

    async def complete_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
        completed_by_user_id: UUID,
        export_storage_key: Optional[str] = None,
        export_expires_at: Optional[datetime] = None,
        partial: bool = False,
        completion_notes: Optional[str] = None,
    ) -> DataSubjectRequest:
        """Complete a data subject request.

        Marks the request as completed (or partially completed) and
        records any export information for access requests.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to complete
            completed_by_user_id: User completing the request
            export_storage_key: Storage key for data export (access requests)
            export_expires_at: When the export download expires
            partial: If True, mark as partially completed
            completion_notes: Optional completion notes

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
            DSRAlreadyCompletedError: If already completed
            DSRInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_data_subject_request(workspace_id, request_id)

        if current.status in (DSRStatus.COMPLETED, DSRStatus.PARTIALLY_COMPLETED):
            raise DSRAlreadyCompletedError(request_id)

        target_status = DSRStatus.PARTIALLY_COMPLETED if partial else DSRStatus.COMPLETED
        self._validate_status_transition(current.status, target_status)

        now = datetime.now(timezone.utc)
        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            status=target_status.value,
            status_reason=completion_notes or "Request completed",
            completed_at=now,
            export_storage_key=export_storage_key,
            export_expires_at=export_expires_at,
            internal_notes=completion_notes,
            changed_by_user_id=completed_by_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.DATA_EXPORT_REQUESTED,  # Reuse for completion
            workspace_id=workspace_id,
            actor_user_id=completed_by_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=request_id,
            details={
                "action": "completed",
                "request_number": current.request_number,
                "request_type": current.request_type.value,
                "partial": partial,
                "has_export": export_storage_key is not None,
            },
        )

        logger.info(
            "Data subject request completed",
            extra={
                "request_id": str(request_id),
                "workspace_id": str(workspace_id),
                "partial": partial,
            },
        )

        return self._dict_to_dsr(record)

    async def reject_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
        rejected_by_user_id: UUID,
        rejection_reason: str,
    ) -> DataSubjectRequest:
        """Reject a data subject request.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to reject
            rejected_by_user_id: User rejecting the request
            rejection_reason: Reason for rejection

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
            DSRAlreadyCompletedError: If already completed
            DSRInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_data_subject_request(workspace_id, request_id)

        if current.status == DSRStatus.COMPLETED:
            raise DSRAlreadyCompletedError(request_id)

        self._validate_status_transition(current.status, DSRStatus.REJECTED)

        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            status=DSRStatus.REJECTED.value,
            status_reason=rejection_reason,
            completed_at=datetime.now(timezone.utc),
            changed_by_user_id=rejected_by_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=rejected_by_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=request_id,
            details={
                "action": "rejected",
                "request_number": current.request_number,
                "reason": rejection_reason,
            },
        )

        return self._dict_to_dsr(record)

    async def cancel_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
        cancelled_by_user_id: UUID,
        cancellation_reason: str,
    ) -> DataSubjectRequest:
        """Cancel a data subject request.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to cancel
            cancelled_by_user_id: User cancelling the request
            cancellation_reason: Reason for cancellation

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
            DSRAlreadyCompletedError: If already completed
            DSRInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_data_subject_request(workspace_id, request_id)

        if current.status == DSRStatus.COMPLETED:
            raise DSRAlreadyCompletedError(request_id)

        self._validate_status_transition(current.status, DSRStatus.CANCELLED)

        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            status=DSRStatus.CANCELLED.value,
            status_reason=cancellation_reason,
            changed_by_user_id=cancelled_by_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=cancelled_by_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=request_id,
            details={
                "action": "cancelled",
                "request_number": current.request_number,
                "reason": cancellation_reason,
            },
        )

        return self._dict_to_dsr(record)

    async def extend_deadline(
        self,
        workspace_id: UUID,
        request_id: UUID,
        extended_by_user_id: UUID,
        extension_days: int,
        extension_reason: str,
        regulation: str = "gdpr",
    ) -> DataSubjectRequest:
        """Extend the deadline for a data subject request.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to extend
            extended_by_user_id: User granting the extension
            extension_days: Number of days to extend
            extension_reason: Reason for extension
            regulation: Applicable regulation for max extension

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
            ComplianceError: If extension exceeds maximum allowed
        """
        current = await self.get_data_subject_request(workspace_id, request_id)

        # Check max extension
        max_days = MAX_EXTENSION_DAYS.get(regulation, MAX_EXTENSION_DAYS["default"])
        if extension_days > max_days:
            raise ComplianceError(
                f"Extension of {extension_days} days exceeds maximum of {max_days} days",
                "EXTENSION_EXCEEDS_MAXIMUM",
                400,
            )

        # Calculate new deadline
        current_deadline = current.extended_deadline_at or current.deadline_at
        new_deadline = current_deadline + timedelta(days=extension_days)

        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            extended_deadline_at=new_deadline,
            extension_reason=extension_reason,
            changed_by_user_id=extended_by_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=extended_by_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=request_id,
            details={
                "action": "deadline_extended",
                "request_number": current.request_number,
                "extension_days": extension_days,
                "new_deadline": new_deadline.isoformat(),
                "reason": extension_reason,
            },
        )

        return self._dict_to_dsr(record)

    async def verify_identity(
        self,
        workspace_id: UUID,
        request_id: UUID,
        verified_by_user_id: UUID,
        verification_method: str,
        verified: bool = True,
        verification_notes: Optional[str] = None,
    ) -> DataSubjectRequest:
        """Record identity verification for a data subject request.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to verify
            verified_by_user_id: User performing verification
            verification_method: Method used for verification
            verified: Whether verification was successful
            verification_notes: Optional notes on verification

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
        """
        current = await self.get_data_subject_request(workspace_id, request_id)

        verification_status = (
            DSRVerificationStatus.VERIFIED if verified else DSRVerificationStatus.FAILED
        )
        now = datetime.now(timezone.utc)

        # If verification succeeds and status is still PENDING or IDENTITY_VERIFICATION,
        # transition to ACKNOWLEDGED
        new_status = None
        if verified and current.status in (DSRStatus.PENDING, DSRStatus.IDENTITY_VERIFICATION):
            new_status = DSRStatus.ACKNOWLEDGED

        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            verification_status=verification_status.value,
            verification_method=verification_method,
            verified_at=now,
            verified_by_user_id=verified_by_user_id,
            status=new_status.value if new_status else None,
            status_reason="Identity verified" if verified else "Identity verification failed",
            internal_notes=verification_notes,
            changed_by_user_id=verified_by_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=verified_by_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=request_id,
            details={
                "action": "identity_verified" if verified else "identity_verification_failed",
                "request_number": current.request_number,
                "method": verification_method,
            },
        )

        return self._dict_to_dsr(record)

    async def assign_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
        assigned_to_user_id: UUID,
        assigned_by_user_id: UUID,
    ) -> DataSubjectRequest:
        """Assign a data subject request to a user.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to assign
            assigned_to_user_id: User to assign the request to
            assigned_by_user_id: User making the assignment

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
        """
        current = await self.get_data_subject_request(workspace_id, request_id)

        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            assigned_to_user_id=assigned_to_user_id,
            changed_by_user_id=assigned_by_user_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=assigned_by_user_id,
            target_entity_type="data_subject_request",
            target_entity_id=request_id,
            details={
                "action": "assigned",
                "request_number": current.request_number,
                "assigned_to": str(assigned_to_user_id),
            },
        )

        return self._dict_to_dsr(record)

    async def set_export_info(
        self,
        workspace_id: UUID,
        request_id: UUID,
        export_job_id: UUID,
        export_storage_key: Optional[str] = None,
        export_expires_at: Optional[datetime] = None,
    ) -> DataSubjectRequest:
        """Set export job information for a data subject request.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to update
            export_job_id: Background job ID for export
            export_storage_key: Storage location of export
            export_expires_at: When export download expires

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
        """
        record = await self._repository.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            export_job_id=export_job_id,
            export_storage_key=export_storage_key,
            export_expires_at=export_expires_at,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        return self._dict_to_dsr(record)

    async def record_export_download(
        self,
        workspace_id: UUID,
        request_id: UUID,
    ) -> DataSubjectRequest:
        """Record an export download for a data subject request.

        Increments the download count for tracking purposes.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID

        Returns:
            Updated DataSubjectRequest

        Raises:
            DSRNotFoundError: If request not found
        """
        record = await self._repository.increment_export_download_count(
            workspace_id=workspace_id,
            request_id=request_id,
        )

        if not record:
            raise DSRNotFoundError(request_id)

        return self._dict_to_dsr(record)

    async def get_stats(
        self,
        workspace_id: UUID,
    ) -> DSRStats:
        """Get statistics for data subject requests.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            DSRStats with counts and metrics
        """
        # Get all requests for stats calculation
        all_requests = await self._repository.list_data_subject_requests(
            workspace_id=workspace_id,
            page=1,
            limit=10000,  # Get all for stats
        )

        items = all_requests["items"]
        now = datetime.now(timezone.utc)

        total = len(items)
        pending = sum(1 for r in items if r.get("status") == "pending")
        in_progress = sum(1 for r in items if r.get("status") == "in_progress")
        completed = sum(1 for r in items if r.get("status") == "completed")
        blocked = sum(1 for r in items if r.get("status") == "blocked")

        # Count overdue (not completed and past deadline)
        overdue = 0
        for r in items:
            if r.get("status") not in ("completed", "rejected", "cancelled", "expired"):
                deadline = r.get("extended_deadline_at") or r.get("deadline_at")
                if deadline and deadline < now:
                    overdue += 1

        # Calculate average completion time
        completion_times = []
        for r in items:
            if r.get("status") == "completed" and r.get("completed_at") and r.get("submitted_at"):
                delta = r["completed_at"] - r["submitted_at"]
                completion_times.append(delta.days)

        avg_completion = (
            sum(completion_times) / len(completion_times)
            if completion_times
            else 0.0
        )

        return DSRStats(
            total=total,
            pending=pending,
            in_progress=in_progress,
            completed=completed,
            overdue=overdue,
            blocked=blocked,
            average_completion_days=avg_completion,
        )

    async def get_overdue_requests(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
    ) -> DSRListResult:
        """Get overdue data subject requests.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page

        Returns:
            DSRListResult with overdue items
        """
        return await self.list_data_subject_requests(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            overdue_only=True,
        )

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    def _validate_status_transition(
        self,
        current_status: DSRStatus,
        target_status: DSRStatus,
    ) -> None:
        """Validate that a status transition is allowed.

        Args:
            current_status: Current status of the request
            target_status: Target status to transition to

        Raises:
            DSRInvalidStatusTransitionError: If transition is not allowed
        """
        allowed = VALID_STATUS_TRANSITIONS.get(current_status, [])
        if target_status not in allowed:
            raise DSRInvalidStatusTransitionError(
                current_status.value,
                target_status.value,
            )

    async def _check_duplicate_request(
        self,
        workspace_id: UUID,
        subject_email: str,
        request_type: DSRRequestType,
    ) -> Optional[UUID]:
        """Check for duplicate pending requests.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subject_email: Subject email to check
            request_type: Request type to check

        Returns:
            Existing request ID if duplicate found, None otherwise
        """
        result = await self._repository.list_data_subject_requests(
            workspace_id=workspace_id,
            subject_email=subject_email,
            request_type=request_type.value,
            page=1,
            limit=1,
        )

        for item in result["items"]:
            if item.get("status") in ("pending", "acknowledged", "in_progress"):
                return item.get("request_id")

        return None

    async def _check_legal_hold_blocking(
        self,
        workspace_id: UUID,
        subject_user_id: Optional[UUID],
    ) -> Optional[UUID]:
        """Check if there are legal holds blocking a user's data.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subject_user_id: User ID to check

        Returns:
            Legal hold ID if blocking, None otherwise
        """
        if not subject_user_id:
            return None

        # Check for legal holds that include this user in scope
        # This is a simplified check - full implementation would check
        # scope_users array and related resources
        from app.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT hold_id FROM legal_holds
                WHERE workspace_id = $1
                  AND status = 'active'
                  AND ($2::text = ANY(scope_users) OR scope_type = 'workspace_wide')
                LIMIT 1
                """,
                workspace_id,
                str(subject_user_id),
            )
            return row["hold_id"] if row else None

    def _dict_to_dsr(self, record: dict[str, Any]) -> DataSubjectRequest:
        """Convert a database record to a DataSubjectRequest model.

        Args:
            record: Database record as dict

        Returns:
            DataSubjectRequest model instance
        """
        # Calculate days until deadline
        now = datetime.now(timezone.utc)
        deadline = record.get("extended_deadline_at") or record.get("deadline_at")

        return DataSubjectRequest(
            request_id=record["request_id"],
            workspace_id=record["workspace_id"],
            request_number=record["request_number"],
            subject_user_id=record.get("subject_user_id"),
            subject_email=record["subject_email"],
            subject_name=record.get("subject_name"),
            subject_type=DSRSubjectType(record.get("subject_type", "user")),
            request_type=DSRRequestType(record["request_type"]),
            request_source=DSRSource(record.get("request_source", "user_portal")),
            description=record.get("description"),
            status=DSRStatus(record["status"]),
            status_reason=record.get("status_reason"),
            priority=DSRPriority(record.get("priority", "normal")),
            assigned_to_user_id=record.get("assigned_to_user_id"),
            submitted_at=record["submitted_at"],
            deadline_at=record["deadline_at"],
            extended_deadline_at=record.get("extended_deadline_at"),
            extension_reason=record.get("extension_reason"),
            acknowledged_at=record.get("acknowledged_at"),
            processing_started_at=record.get("processing_started_at"),
            completed_at=record.get("completed_at"),
            verification_status=DSRVerificationStatus(
                record.get("verification_status", "pending")
            ),
            verification_method=record.get("verification_method"),
            verified_at=record.get("verified_at"),
            verified_by_user_id=record.get("verified_by_user_id"),
            export_job_id=record.get("export_job_id"),
            export_storage_key=record.get("export_storage_key"),
            export_expires_at=record.get("export_expires_at"),
            export_download_count=record.get("export_download_count", 0),
            blocked_by_legal_hold_id=record.get("blocked_by_legal_hold_id"),
            blocked_at=record.get("blocked_at"),
            blocked_reason=record.get("blocked_reason"),
            scope=record.get("scope", {}),
            internal_notes=record.get("internal_notes"),
            status_history=record.get("status_history", []),
            metadata=record.get("metadata", {}),
            requester_ip_address=record.get("requester_ip_address"),
            requester_user_agent=record.get("requester_user_agent"),
            created_at=record["created_at"],
            updated_at=record["updated_at"],
        )

    def _dict_to_dsr_summary(self, record: dict[str, Any]) -> DataSubjectRequestSummary:
        """Convert a database record to a DataSubjectRequestSummary model.

        Args:
            record: Database record as dict

        Returns:
            DataSubjectRequestSummary model instance
        """
        now = datetime.now(timezone.utc)
        deadline = record.get("extended_deadline_at") or record.get("deadline_at")
        days_until = (deadline - now).days if deadline else 0

        return DataSubjectRequestSummary(
            request_id=record["request_id"],
            workspace_id=record["workspace_id"],
            request_number=record["request_number"],
            subject_email=record["subject_email"],
            request_type=DSRRequestType(record["request_type"]),
            status=DSRStatus(record["status"]),
            priority=DSRPriority(record.get("priority", "normal")),
            submitted_at=record["submitted_at"],
            deadline_at=record["deadline_at"],
            days_until_deadline=days_until,
        )


# =============================================================================
# FACTORY FUNCTION
# =============================================================================


_compliance_service: Optional[ComplianceService] = None


def get_compliance_service() -> ComplianceService:
    """Get the singleton compliance service instance.

    Returns:
        ComplianceService instance
    """
    global _compliance_service
    if _compliance_service is None:
        _compliance_service = ComplianceService()
    return _compliance_service
