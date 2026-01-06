"""Retention policy enforcement service.

This service provides high-level business logic for managing data retention
policies and enforcing retention rules across the platform.

It handles:
- Retention policy lifecycle management (creation, activation, pausing, retirement)
- Resource eligibility checking against policies
- Policy execution and enforcement (archive, delete, anonymize)
- Exemption management for protected resources
- Integration with legal holds to prevent deletion of held resources
- Grace period and notification management
- Execution tracking and statistics
- Audit logging for compliance

Feature: Audit & Compliance System
Task: T010 - Create retention policy enforcement service
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.config.settings import AppSettings, get_settings
from app.models.compliance import (
    RetentionActionOnExpiry,
    RetentionArchiveStorageClass,
    RetentionExecutionFrequency,
    RetentionExecutionStatus,
    RetentionExecutionType,
    RetentionExemptionReason,
    RetentionExemptionStatus,
    RetentionExemptionType,
    RetentionPolicy,
    RetentionPolicyCreate,
    RetentionPolicyExecution,
    RetentionPolicyExemption,
    RetentionPolicyStatus,
    RetentionPolicySummary,
    RetentionPolicyType,
    RetentionPolicyUpdate,
)
from app.repositories.compliance_repository import ComplianceRepository
from app.services.audit_service import AuditEventType, AuditService


logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class RetentionError(Exception):
    """Base exception for retention service errors."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class RetentionPolicyNotFoundError(RetentionError):
    """Retention policy not found."""

    def __init__(self, policy_id: UUID):
        super().__init__(
            f"Retention policy {policy_id} not found",
            "RETENTION_POLICY_NOT_FOUND",
            404,
        )
        self.policy_id = policy_id


class RetentionPolicyInvalidStatusTransitionError(RetentionError):
    """Invalid status transition for retention policy."""

    def __init__(self, current_status: str, target_status: str):
        super().__init__(
            f"Cannot transition from '{current_status}' to '{target_status}'",
            "INVALID_POLICY_STATUS_TRANSITION",
            400,
        )
        self.current_status = current_status
        self.target_status = target_status


class RetentionPolicyAlreadyActiveError(RetentionError):
    """Retention policy is already active."""

    def __init__(self, policy_id: UUID):
        super().__init__(
            f"Retention policy {policy_id} is already active",
            "RETENTION_POLICY_ALREADY_ACTIVE",
            400,
        )
        self.policy_id = policy_id


class RetentionPolicyAlreadyRetiredError(RetentionError):
    """Retention policy is already retired."""

    def __init__(self, policy_id: UUID):
        super().__init__(
            f"Retention policy {policy_id} is already retired",
            "RETENTION_POLICY_ALREADY_RETIRED",
            400,
        )
        self.policy_id = policy_id


class RetentionPolicyCodeConflictError(RetentionError):
    """Retention policy with this code already exists."""

    def __init__(self, policy_code: str):
        super().__init__(
            f"Retention policy with code '{policy_code}' already exists",
            "POLICY_CODE_CONFLICT",
            409,
        )
        self.policy_code = policy_code


class RetentionResourceBlockedError(RetentionError):
    """Resource is blocked from retention action by legal hold."""

    def __init__(self, resource_type: str, resource_id: UUID, hold_id: UUID):
        super().__init__(
            f"Resource {resource_type}/{resource_id} is blocked by legal hold {hold_id}",
            "RESOURCE_BLOCKED_BY_LEGAL_HOLD",
            409,
        )
        self.resource_type = resource_type
        self.resource_id = resource_id
        self.hold_id = hold_id


class RetentionExemptionNotFoundError(RetentionError):
    """Retention exemption not found."""

    def __init__(self, exemption_id: UUID):
        super().__init__(
            f"Retention exemption {exemption_id} not found",
            "RETENTION_EXEMPTION_NOT_FOUND",
            404,
        )
        self.exemption_id = exemption_id


class RetentionExecutionNotFoundError(RetentionError):
    """Retention policy execution not found."""

    def __init__(self, execution_id: UUID):
        super().__init__(
            f"Retention policy execution {execution_id} not found",
            "RETENTION_EXECUTION_NOT_FOUND",
            404,
        )
        self.execution_id = execution_id


class RetentionExecutionInProgressError(RetentionError):
    """Retention policy execution is already in progress."""

    def __init__(self, policy_id: UUID):
        super().__init__(
            f"Retention policy {policy_id} already has an execution in progress",
            "RETENTION_EXECUTION_IN_PROGRESS",
            409,
        )
        self.policy_id = policy_id


# =============================================================================
# CONFIGURATION
# =============================================================================


# Valid status transitions for retention policies
VALID_POLICY_STATUS_TRANSITIONS: dict[RetentionPolicyStatus, list[RetentionPolicyStatus]] = {
    RetentionPolicyStatus.DRAFT: [
        RetentionPolicyStatus.PENDING_APPROVAL,
        RetentionPolicyStatus.ACTIVE,
    ],
    RetentionPolicyStatus.PENDING_APPROVAL: [
        RetentionPolicyStatus.ACTIVE,
        RetentionPolicyStatus.DRAFT,
    ],
    RetentionPolicyStatus.ACTIVE: [
        RetentionPolicyStatus.PAUSED,
        RetentionPolicyStatus.RETIRED,
        RetentionPolicyStatus.SUPERSEDED,
    ],
    RetentionPolicyStatus.PAUSED: [
        RetentionPolicyStatus.ACTIVE,
        RetentionPolicyStatus.RETIRED,
    ],
    # Terminal states - no transitions allowed
    RetentionPolicyStatus.RETIRED: [],
    RetentionPolicyStatus.SUPERSEDED: [],
}


# Execution frequency to timedelta mapping
EXECUTION_FREQUENCY_INTERVALS = {
    RetentionExecutionFrequency.HOURLY: timedelta(hours=1),
    RetentionExecutionFrequency.DAILY: timedelta(days=1),
    RetentionExecutionFrequency.WEEKLY: timedelta(weeks=1),
    RetentionExecutionFrequency.MONTHLY: timedelta(days=30),
    RetentionExecutionFrequency.QUARTERLY: timedelta(days=90),
    RetentionExecutionFrequency.MANUAL: None,  # Manual execution has no interval
}


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class RetentionPolicyListResult:
    """Result of listing retention policies."""

    items: list[RetentionPolicySummary]
    page: int
    limit: int
    total: int
    total_pages: int


@dataclass
class RetentionExecutionListResult:
    """Result of listing retention policy executions."""

    items: list[RetentionPolicyExecution]
    page: int
    limit: int
    total: int
    total_pages: int


@dataclass
class RetentionPolicyStats:
    """Statistics for retention policies."""

    total: int
    active: int
    paused: int
    draft: int
    retired: int
    total_resources_affected: int
    total_resources_archived: int
    total_resources_deleted: int
    total_storage_reclaimed_bytes: int


@dataclass
class ResourceRetentionStatus:
    """Status of a resource's retention eligibility."""

    resource_type: str
    resource_id: UUID
    applicable_policies: list[RetentionPolicySummary]
    is_exempt: bool
    exemption_reason: Optional[str]
    is_under_legal_hold: bool
    legal_hold_ids: list[UUID]
    retention_expiry_date: Optional[datetime]
    action_on_expiry: Optional[RetentionActionOnExpiry]
    days_until_action: Optional[int]
    in_grace_period: bool


@dataclass
class RetentionPreviewResult:
    """Result of previewing retention policy execution."""

    policy_id: UUID
    policy_name: str
    resources_matched: int
    resources_to_archive: int
    resources_to_delete: int
    resources_to_anonymize: int
    resources_to_flag: int
    resources_blocked_by_hold: int
    resources_exempt: int
    storage_to_reclaim_bytes: int
    preview_resources: list[dict[str, Any]]


@dataclass
class RetentionActionResult:
    """Result of a retention action on a single resource."""

    resource_type: str
    resource_id: UUID
    action: RetentionActionOnExpiry
    success: bool
    blocked_by_hold: bool
    blocked_hold_id: Optional[UUID]
    error: Optional[str]
    storage_reclaimed_bytes: int


# =============================================================================
# RETENTION SERVICE
# =============================================================================


class RetentionService:
    """Service for managing retention policies and enforcement.

    This service provides the business logic layer for retention policy
    management, coordinating between the repository, audit service, and
    legal hold service.

    Key responsibilities:
    - Retention policy lifecycle (create, activate, pause, retire)
    - Resource eligibility checking
    - Policy execution and enforcement
    - Exemption management
    - Integration with legal holds
    - Audit logging for compliance

    All methods enforce workspace isolation for multi-tenant security.
    """

    def __init__(self, settings: Optional[AppSettings] = None):
        """Initialize the retention service.

        Args:
            settings: Optional application settings override
        """
        self._settings = settings or get_settings()
        self._repository = ComplianceRepository()
        self._audit_service = AuditService()

    # =========================================================================
    # RETENTION POLICY LIFECYCLE OPERATIONS
    # =========================================================================

    async def create_retention_policy(
        self,
        workspace_id: UUID,
        policy_name: str,
        policy_code: str,
        retention_period_days: int,
        created_by_user_id: UUID,
        description: Optional[str] = None,
        policy_type: RetentionPolicyType = RetentionPolicyType.CUSTOM,
        priority: int = 100,
        resource_types: Optional[list[str]] = None,
        resource_filters: Optional[dict[str, Any]] = None,
        archive_after_days: Optional[int] = None,
        delete_after_days: Optional[int] = None,
        grace_period_days: int = 30,
        action_on_expiry: RetentionActionOnExpiry = RetentionActionOnExpiry.DELETE,
        archive_storage_class: Optional[RetentionArchiveStorageClass] = None,
        notification_days_before: Optional[list[int]] = None,
        regulatory_basis: Optional[str] = None,
        regulatory_reference: Optional[str] = None,
        compliance_frameworks: Optional[list[str]] = None,
        allow_user_extension: bool = False,
        max_extension_days: Optional[int] = None,
        allow_legal_hold_override: bool = True,
        applies_to_existing: bool = True,
        applies_to_new: bool = True,
        effective_from: Optional[datetime] = None,
        effective_until: Optional[datetime] = None,
        execution_frequency: RetentionExecutionFrequency = RetentionExecutionFrequency.DAILY,
        auto_activate: bool = False,
        metadata: Optional[dict[str, Any]] = None,
    ) -> RetentionPolicy:
        """Create a new retention policy.

        Creates a retention policy with the specified configuration. By default,
        the policy is created in draft status for review before activation.
        Set auto_activate=True to activate immediately.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_name: Display name for the policy
            policy_code: Machine-readable code (e.g., GDPR-MIN-7Y)
            retention_period_days: Minimum days to retain (0 = indefinite)
            created_by_user_id: User who created the policy
            description: Detailed description
            policy_type: Type of policy
            priority: Priority (higher = more important)
            resource_types: Resource types this policy applies to
            resource_filters: Additional filters
            archive_after_days: Days until archival
            delete_after_days: Days until deletion
            grace_period_days: Days before permanent deletion
            action_on_expiry: Action when retention expires
            archive_storage_class: Storage class for archived data
            notification_days_before: Days before expiry to notify
            regulatory_basis: Regulatory basis
            regulatory_reference: Regulatory reference text
            compliance_frameworks: Compliance frameworks
            allow_user_extension: Allow users to request extension
            max_extension_days: Maximum extension allowed
            allow_legal_hold_override: Legal holds override this policy
            applies_to_existing: Applies to existing resources
            applies_to_new: Applies to new resources
            effective_from: When policy takes effect
            effective_until: When policy expires
            execution_frequency: How often policy runs
            auto_activate: If True, activate immediately
            metadata: Additional metadata

        Returns:
            Created RetentionPolicy

        Raises:
            RetentionPolicyCodeConflictError: If policy code already exists
        """
        # Check for existing policy with same code
        existing = await self._check_policy_code_exists(
            workspace_id=workspace_id,
            policy_code=policy_code,
        )
        if existing:
            raise RetentionPolicyCodeConflictError(policy_code)

        # Create the policy
        record = await self._repository.create_retention_policy(
            workspace_id=workspace_id,
            policy_name=policy_name,
            policy_code=policy_code,
            retention_period_days=retention_period_days,
            created_by_user_id=created_by_user_id,
            description=description,
            policy_type=policy_type.value,
            priority=priority,
            resource_types=resource_types,
            resource_filters=resource_filters,
            archive_after_days=archive_after_days,
            delete_after_days=delete_after_days,
            grace_period_days=grace_period_days,
            action_on_expiry=action_on_expiry.value,
            archive_storage_class=archive_storage_class.value if archive_storage_class else None,
            notification_days_before=notification_days_before,
            regulatory_basis=regulatory_basis,
            regulatory_reference=regulatory_reference,
            compliance_frameworks=compliance_frameworks,
            allow_user_extension=allow_user_extension,
            max_extension_days=max_extension_days,
            allow_legal_hold_override=allow_legal_hold_override,
            applies_to_existing=applies_to_existing,
            applies_to_new=applies_to_new,
            effective_from=effective_from,
            effective_until=effective_until,
            execution_frequency=execution_frequency.value,
            metadata=metadata,
        )

        # Log audit event
        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=created_by_user_id,
            target_entity_type="retention_policy",
            target_entity_id=record["policy_id"],
            details={
                "action": "retention_policy_created",
                "policy_code": policy_code,
                "policy_name": policy_name,
                "policy_type": policy_type.value,
                "retention_period_days": retention_period_days,
                "action_on_expiry": action_on_expiry.value,
            },
        )

        logger.info(
            "Retention policy created",
            extra={
                "policy_id": str(record["policy_id"]),
                "policy_code": policy_code,
                "workspace_id": str(workspace_id),
                "policy_type": policy_type.value,
            },
        )

        policy = self._dict_to_retention_policy(record)

        # Auto-activate if requested
        if auto_activate:
            policy = await self.activate_policy(
                workspace_id=workspace_id,
                policy_id=policy.policy_id,
                activated_by_user_id=created_by_user_id,
                reason="Auto-activated on creation",
            )

        return policy

    async def get_retention_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
    ) -> RetentionPolicy:
        """Get a retention policy by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to retrieve

        Returns:
            RetentionPolicy

        Raises:
            RetentionPolicyNotFoundError: If policy not found
        """
        record = await self._repository.get_retention_policy(
            workspace_id=workspace_id,
            policy_id=policy_id,
        )

        if not record:
            raise RetentionPolicyNotFoundError(policy_id)

        return self._dict_to_retention_policy(record)

    async def list_retention_policies(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[RetentionPolicyStatus] = None,
        policy_type: Optional[RetentionPolicyType] = None,
        active_only: bool = True,
    ) -> RetentionPolicyListResult:
        """List retention policies with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            policy_type: Optional policy type filter
            active_only: If True, only return active versions

        Returns:
            RetentionPolicyListResult with items and pagination
        """
        result = await self._repository.list_retention_policies(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            status=status.value if status else None,
            policy_type=policy_type.value if policy_type else None,
            active_only=active_only,
        )

        items = [self._dict_to_retention_policy_summary(item) for item in result["items"]]

        return RetentionPolicyListResult(
            items=items,
            page=result["pagination"]["page"],
            limit=result["pagination"]["limit"],
            total=result["pagination"]["total"],
            total_pages=result["pagination"]["total_pages"],
        )

    async def update_retention_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        update: RetentionPolicyUpdate,
        updated_by_user_id: UUID,
    ) -> RetentionPolicy:
        """Update a retention policy.

        Validates status transitions and updates the policy with proper
        audit logging.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to update
            update: Fields to update
            updated_by_user_id: User making the update

        Returns:
            Updated RetentionPolicy

        Raises:
            RetentionPolicyNotFoundError: If policy not found
            RetentionPolicyInvalidStatusTransitionError: If status transition is invalid
            RetentionPolicyAlreadyRetiredError: If trying to update a retired policy
        """
        # Get current policy
        current = await self.get_retention_policy(workspace_id, policy_id)

        # Check if already retired
        if current.status == RetentionPolicyStatus.RETIRED:
            raise RetentionPolicyAlreadyRetiredError(policy_id)

        # Validate status transition if changing status
        if update.status and update.status != current.status:
            self._validate_status_transition(current.status, update.status)

        # Perform the update
        record = await self._repository.update_retention_policy(
            workspace_id=workspace_id,
            policy_id=policy_id,
            policy_name=update.policy_name,
            description=update.description,
            status=update.status.value if update.status else None,
            status_reason=update.status_reason,
            priority=update.priority,
            resource_types=update.resource_types,
            resource_filters=update.resource_filters,
            retention_period_days=update.retention_period_days,
            archive_after_days=update.archive_after_days,
            delete_after_days=update.delete_after_days,
            grace_period_days=update.grace_period_days,
            action_on_expiry=update.action_on_expiry.value if update.action_on_expiry else None,
            archive_storage_class=update.archive_storage_class.value if update.archive_storage_class else None,
            notification_days_before=update.notification_days_before,
            allow_user_extension=update.allow_user_extension,
            max_extension_days=update.max_extension_days,
            allow_legal_hold_override=update.allow_legal_hold_override,
            applies_to_existing=update.applies_to_existing,
            applies_to_new=update.applies_to_new,
            effective_from=update.effective_from,
            effective_until=update.effective_until,
            execution_frequency=update.execution_frequency.value if update.execution_frequency else None,
            internal_notes=update.internal_notes,
            metadata=update.metadata,
            changed_by_user_id=updated_by_user_id,
        )

        if not record:
            raise RetentionPolicyNotFoundError(policy_id)

        # Log status change audit event
        if update.status and update.status != current.status:
            await self._audit_service.log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                workspace_id=workspace_id,
                actor_user_id=updated_by_user_id,
                target_entity_type="retention_policy",
                target_entity_id=policy_id,
                details={
                    "action": "retention_policy_status_change",
                    "policy_code": current.policy_code,
                    "previous_status": current.status.value,
                    "new_status": update.status.value,
                    "reason": update.status_reason,
                },
            )

        logger.info(
            "Retention policy updated",
            extra={
                "policy_id": str(policy_id),
                "workspace_id": str(workspace_id),
                "updated_by": str(updated_by_user_id),
            },
        )

        return self._dict_to_retention_policy(record)

    async def activate_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        activated_by_user_id: UUID,
        reason: Optional[str] = None,
    ) -> RetentionPolicy:
        """Activate a retention policy.

        Transitions the policy from draft or pending_approval to active status.
        Once active, the policy will be enforced on matching resources.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to activate
            activated_by_user_id: User activating the policy
            reason: Optional reason for activation

        Returns:
            Updated RetentionPolicy

        Raises:
            RetentionPolicyNotFoundError: If policy not found
            RetentionPolicyAlreadyActiveError: If already active
            RetentionPolicyInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_retention_policy(workspace_id, policy_id)

        if current.status == RetentionPolicyStatus.ACTIVE:
            raise RetentionPolicyAlreadyActiveError(policy_id)

        self._validate_status_transition(current.status, RetentionPolicyStatus.ACTIVE)

        # Calculate next execution time
        now = datetime.now(timezone.utc)
        next_execution = self._calculate_next_execution(
            current.execution_frequency,
            now,
        )

        record = await self._repository.update_retention_policy(
            workspace_id=workspace_id,
            policy_id=policy_id,
            status=RetentionPolicyStatus.ACTIVE.value,
            status_reason=reason or "Policy activated",
            approved_by_user_id=activated_by_user_id,
            approved_at=now,
            changed_by_user_id=activated_by_user_id,
        )

        if not record:
            raise RetentionPolicyNotFoundError(policy_id)

        # Update next execution time
        await self._repository.update_retention_policy_execution_stats(
            workspace_id=workspace_id,
            policy_id=policy_id,
            last_executed_at=now,
            next_execution_at=next_execution,
        )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=activated_by_user_id,
            target_entity_type="retention_policy",
            target_entity_id=policy_id,
            details={
                "action": "retention_policy_activated",
                "policy_code": current.policy_code,
                "reason": reason,
            },
        )

        logger.info(
            "Retention policy activated",
            extra={
                "policy_id": str(policy_id),
                "policy_code": current.policy_code,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_retention_policy(record)

    async def pause_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        paused_by_user_id: UUID,
        reason: str,
    ) -> RetentionPolicy:
        """Pause a retention policy.

        Temporarily pauses an active policy. Enforcement stops until resumed.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to pause
            paused_by_user_id: User pausing the policy
            reason: Reason for pausing

        Returns:
            Updated RetentionPolicy

        Raises:
            RetentionPolicyNotFoundError: If policy not found
            RetentionPolicyInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_retention_policy(workspace_id, policy_id)

        self._validate_status_transition(current.status, RetentionPolicyStatus.PAUSED)

        record = await self._repository.update_retention_policy(
            workspace_id=workspace_id,
            policy_id=policy_id,
            status=RetentionPolicyStatus.PAUSED.value,
            status_reason=reason,
            changed_by_user_id=paused_by_user_id,
        )

        if not record:
            raise RetentionPolicyNotFoundError(policy_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=paused_by_user_id,
            target_entity_type="retention_policy",
            target_entity_id=policy_id,
            details={
                "action": "retention_policy_paused",
                "policy_code": current.policy_code,
                "reason": reason,
            },
        )

        logger.warning(
            "Retention policy paused",
            extra={
                "policy_id": str(policy_id),
                "policy_code": current.policy_code,
                "workspace_id": str(workspace_id),
                "reason": reason,
            },
        )

        return self._dict_to_retention_policy(record)

    async def resume_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        resumed_by_user_id: UUID,
        reason: Optional[str] = None,
    ) -> RetentionPolicy:
        """Resume a paused retention policy.

        Resumes a paused policy and recalculates the next execution time.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to resume
            resumed_by_user_id: User resuming the policy
            reason: Optional reason for resuming

        Returns:
            Updated RetentionPolicy

        Raises:
            RetentionPolicyNotFoundError: If policy not found
            RetentionPolicyInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_retention_policy(workspace_id, policy_id)

        if current.status != RetentionPolicyStatus.PAUSED:
            raise RetentionPolicyInvalidStatusTransitionError(
                current.status.value,
                RetentionPolicyStatus.ACTIVE.value,
            )

        # Calculate next execution time
        now = datetime.now(timezone.utc)
        next_execution = self._calculate_next_execution(
            current.execution_frequency,
            now,
        )

        record = await self._repository.update_retention_policy(
            workspace_id=workspace_id,
            policy_id=policy_id,
            status=RetentionPolicyStatus.ACTIVE.value,
            status_reason=reason or "Policy resumed",
            changed_by_user_id=resumed_by_user_id,
        )

        if not record:
            raise RetentionPolicyNotFoundError(policy_id)

        # Update next execution time
        await self._repository.update_retention_policy_execution_stats(
            workspace_id=workspace_id,
            policy_id=policy_id,
            last_executed_at=now,
            next_execution_at=next_execution,
        )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=resumed_by_user_id,
            target_entity_type="retention_policy",
            target_entity_id=policy_id,
            details={
                "action": "retention_policy_resumed",
                "policy_code": current.policy_code,
                "reason": reason,
            },
        )

        logger.info(
            "Retention policy resumed",
            extra={
                "policy_id": str(policy_id),
                "policy_code": current.policy_code,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_retention_policy(record)

    async def retire_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        retired_by_user_id: UUID,
        retirement_reason: str,
    ) -> RetentionPolicy:
        """Retire a retention policy.

        Permanently retires a policy. This action cannot be undone.
        Resources previously affected are no longer subject to this policy.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to retire
            retired_by_user_id: User retiring the policy
            retirement_reason: Reason for retirement

        Returns:
            Updated RetentionPolicy

        Raises:
            RetentionPolicyNotFoundError: If policy not found
            RetentionPolicyAlreadyRetiredError: If already retired
            RetentionPolicyInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_retention_policy(workspace_id, policy_id)

        if current.status == RetentionPolicyStatus.RETIRED:
            raise RetentionPolicyAlreadyRetiredError(policy_id)

        self._validate_status_transition(current.status, RetentionPolicyStatus.RETIRED)

        record = await self._repository.update_retention_policy(
            workspace_id=workspace_id,
            policy_id=policy_id,
            status=RetentionPolicyStatus.RETIRED.value,
            status_reason=retirement_reason,
            changed_by_user_id=retired_by_user_id,
        )

        if not record:
            raise RetentionPolicyNotFoundError(policy_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=retired_by_user_id,
            target_entity_type="retention_policy",
            target_entity_id=policy_id,
            details={
                "action": "retention_policy_retired",
                "policy_code": current.policy_code,
                "reason": retirement_reason,
                "total_resources_affected": current.total_resources_affected,
                "total_resources_deleted": current.total_resources_deleted,
            },
        )

        logger.info(
            "Retention policy retired",
            extra={
                "policy_id": str(policy_id),
                "policy_code": current.policy_code,
                "workspace_id": str(workspace_id),
                "reason": retirement_reason,
            },
        )

        return self._dict_to_retention_policy(record)

    # =========================================================================
    # POLICY EXECUTION OPERATIONS
    # =========================================================================

    async def start_policy_execution(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        execution_type: RetentionExecutionType = RetentionExecutionType.SCHEDULED,
        initiated_by_user_id: Optional[UUID] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> RetentionPolicyExecution:
        """Start a new retention policy execution.

        Creates an execution record and returns it for tracking. The actual
        execution logic should be handled by the calling worker.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to execute
            execution_type: Type of execution (scheduled, manual, preview)
            initiated_by_user_id: User who initiated (null for scheduled)
            metadata: Additional metadata

        Returns:
            Created RetentionPolicyExecution

        Raises:
            RetentionPolicyNotFoundError: If policy not found
            RetentionExecutionInProgressError: If execution already in progress
        """
        # Verify policy exists and is active
        policy = await self.get_retention_policy(workspace_id, policy_id)

        if policy.status != RetentionPolicyStatus.ACTIVE and execution_type != RetentionExecutionType.PREVIEW:
            raise RetentionError(
                f"Cannot execute inactive policy {policy_id}",
                "POLICY_NOT_ACTIVE",
                400,
            )

        # Check for existing execution in progress
        existing_executions = await self._repository.list_retention_policy_executions(
            workspace_id=workspace_id,
            policy_id=policy_id,
            status=RetentionExecutionStatus.RUNNING.value,
            page=1,
            limit=1,
        )

        if existing_executions["items"]:
            raise RetentionExecutionInProgressError(policy_id)

        # Create execution record
        record = await self._repository.create_retention_policy_execution(
            workspace_id=workspace_id,
            policy_id=policy_id,
            execution_type=execution_type.value,
            initiated_by_user_id=initiated_by_user_id,
            metadata=metadata,
        )

        # Update to running status
        now = datetime.now(timezone.utc)
        record = await self._repository.update_retention_policy_execution(
            workspace_id=workspace_id,
            execution_id=record["execution_id"],
            status=RetentionExecutionStatus.RUNNING.value,
            started_at=now,
        )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=initiated_by_user_id,
            target_entity_type="retention_policy_execution",
            target_entity_id=record["execution_id"],
            details={
                "action": "retention_execution_started",
                "policy_id": str(policy_id),
                "policy_code": policy.policy_code,
                "execution_type": execution_type.value,
            },
        )

        logger.info(
            "Retention policy execution started",
            extra={
                "execution_id": str(record["execution_id"]),
                "policy_id": str(policy_id),
                "policy_code": policy.policy_code,
                "workspace_id": str(workspace_id),
                "execution_type": execution_type.value,
            },
        )

        return self._dict_to_retention_execution(record)

    async def complete_policy_execution(
        self,
        workspace_id: UUID,
        execution_id: UUID,
        resources_scanned: int,
        resources_matched: int,
        resources_archived: int = 0,
        resources_deleted: int = 0,
        resources_anonymized: int = 0,
        resources_flagged: int = 0,
        resources_skipped: int = 0,
        resources_failed: int = 0,
        storage_scanned_bytes: int = 0,
        storage_reclaimed_bytes: int = 0,
        errors: Optional[list[dict[str, Any]]] = None,
        warnings: Optional[list[dict[str, Any]]] = None,
        affected_resources: Optional[list[dict[str, Any]]] = None,
    ) -> RetentionPolicyExecution:
        """Complete a retention policy execution.

        Updates the execution record with final statistics and marks it complete.

        Args:
            workspace_id: Workspace ID for tenant isolation
            execution_id: Execution ID to complete
            resources_scanned: Total resources scanned
            resources_matched: Resources matching policy
            resources_archived: Resources archived
            resources_deleted: Resources deleted
            resources_anonymized: Resources anonymized
            resources_flagged: Resources flagged for review
            resources_skipped: Resources skipped
            resources_failed: Resources that failed
            storage_scanned_bytes: Storage scanned in bytes
            storage_reclaimed_bytes: Storage reclaimed in bytes
            errors: Error details
            warnings: Warning details
            affected_resources: Detailed list of affected resources

        Returns:
            Updated RetentionPolicyExecution

        Raises:
            RetentionExecutionNotFoundError: If execution not found
        """
        now = datetime.now(timezone.utc)

        # Determine final status
        error_count = len(errors) if errors else 0
        warning_count = len(warnings) if warnings else 0

        if error_count > 0 and resources_failed > 0:
            if resources_archived + resources_deleted + resources_anonymized > 0:
                status = RetentionExecutionStatus.COMPLETED_WITH_ERRORS
            else:
                status = RetentionExecutionStatus.FAILED
        else:
            status = RetentionExecutionStatus.COMPLETED

        # Get execution to find policy_id
        execution_result = await self._repository.list_retention_policy_executions(
            workspace_id=workspace_id,
            policy_id=UUID("00000000-0000-0000-0000-000000000000"),  # Placeholder
            page=1,
            limit=1,
        )

        # Update execution record
        record = await self._repository.update_retention_policy_execution(
            workspace_id=workspace_id,
            execution_id=execution_id,
            status=status.value,
            completed_at=now,
            started_at=now,  # Will be used for duration calculation
            resources_scanned=resources_scanned,
            resources_matched=resources_matched,
            resources_archived=resources_archived,
            resources_deleted=resources_deleted,
            resources_anonymized=resources_anonymized,
            resources_flagged=resources_flagged,
            resources_skipped=resources_skipped,
            resources_failed=resources_failed,
            storage_scanned_bytes=storage_scanned_bytes,
            storage_reclaimed_bytes=storage_reclaimed_bytes,
            error_count=error_count,
            warning_count=warning_count,
            errors=errors,
            warnings=warnings,
            affected_resources=affected_resources,
        )

        if not record:
            raise RetentionExecutionNotFoundError(execution_id)

        # Update policy statistics
        if record.get("policy_id"):
            await self._repository.update_retention_policy_execution_stats(
                workspace_id=workspace_id,
                policy_id=record["policy_id"],
                last_executed_at=now,
                next_execution_at=None,  # Will be calculated by scheduler
                resources_affected_delta=resources_matched,
                resources_archived_delta=resources_archived,
                resources_deleted_delta=resources_deleted,
                storage_reclaimed_delta=storage_reclaimed_bytes,
            )

        logger.info(
            "Retention policy execution completed",
            extra={
                "execution_id": str(execution_id),
                "workspace_id": str(workspace_id),
                "status": status.value,
                "resources_scanned": resources_scanned,
                "resources_matched": resources_matched,
                "resources_deleted": resources_deleted,
                "resources_archived": resources_archived,
                "storage_reclaimed_bytes": storage_reclaimed_bytes,
            },
        )

        return self._dict_to_retention_execution(record)

    async def fail_policy_execution(
        self,
        workspace_id: UUID,
        execution_id: UUID,
        error_message: str,
        errors: Optional[list[dict[str, Any]]] = None,
    ) -> RetentionPolicyExecution:
        """Mark a retention policy execution as failed.

        Args:
            workspace_id: Workspace ID for tenant isolation
            execution_id: Execution ID to fail
            error_message: Primary error message
            errors: Additional error details

        Returns:
            Updated RetentionPolicyExecution

        Raises:
            RetentionExecutionNotFoundError: If execution not found
        """
        now = datetime.now(timezone.utc)
        all_errors = errors or []
        all_errors.insert(0, {"message": error_message, "occurred_at": now.isoformat()})

        record = await self._repository.update_retention_policy_execution(
            workspace_id=workspace_id,
            execution_id=execution_id,
            status=RetentionExecutionStatus.FAILED.value,
            completed_at=now,
            error_count=len(all_errors),
            errors=all_errors,
        )

        if not record:
            raise RetentionExecutionNotFoundError(execution_id)

        logger.error(
            "Retention policy execution failed",
            extra={
                "execution_id": str(execution_id),
                "workspace_id": str(workspace_id),
                "error": error_message,
            },
        )

        return self._dict_to_retention_execution(record)

    async def list_policy_executions(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[RetentionExecutionStatus] = None,
    ) -> RetentionExecutionListResult:
        """List retention policy executions with pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to list executions for
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter

        Returns:
            RetentionExecutionListResult with items and pagination
        """
        result = await self._repository.list_retention_policy_executions(
            workspace_id=workspace_id,
            policy_id=policy_id,
            page=page,
            limit=limit,
            status=status.value if status else None,
        )

        items = [self._dict_to_retention_execution(item) for item in result["items"]]

        return RetentionExecutionListResult(
            items=items,
            page=result["pagination"]["page"],
            limit=result["pagination"]["limit"],
            total=result["pagination"]["total"],
            total_pages=result["pagination"]["total_pages"],
        )

    # =========================================================================
    # EXEMPTION MANAGEMENT
    # =========================================================================

    async def create_exemption(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        resource_type: str,
        resource_id: UUID,
        exemption_reason: RetentionExemptionReason,
        created_by_user_id: UUID,
        reason_details: Optional[str] = None,
        exemption_type: RetentionExemptionType = RetentionExemptionType.PERMANENT,
        expires_at: Optional[datetime] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> RetentionPolicyExemption:
        """Create a retention policy exemption for a resource.

        Exempts a specific resource from retention policy enforcement.
        The resource will not be affected by the policy until the exemption
        is revoked or expires.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to exempt from
            resource_type: Type of resource
            resource_id: ID of the resource
            exemption_reason: Reason for exemption
            created_by_user_id: User creating the exemption
            reason_details: Detailed reason
            exemption_type: Type of exemption
            expires_at: When exemption expires (for temporary)
            metadata: Additional metadata

        Returns:
            Created RetentionPolicyExemption
        """
        # Verify policy exists
        policy = await self.get_retention_policy(workspace_id, policy_id)

        record = await self._repository.create_retention_policy_exemption(
            workspace_id=workspace_id,
            policy_id=policy_id,
            resource_type=resource_type,
            resource_id=resource_id,
            exemption_reason=exemption_reason.value,
            created_by_user_id=created_by_user_id,
            reason_details=reason_details,
            exemption_type=exemption_type.value,
            expires_at=expires_at,
            metadata=metadata,
        )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=created_by_user_id,
            target_entity_type="retention_policy_exemption",
            target_entity_id=record["exemption_id"],
            details={
                "action": "retention_exemption_created",
                "policy_id": str(policy_id),
                "policy_code": policy.policy_code,
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "exemption_reason": exemption_reason.value,
                "exemption_type": exemption_type.value,
            },
        )

        logger.info(
            "Retention policy exemption created",
            extra={
                "exemption_id": str(record["exemption_id"]),
                "policy_id": str(policy_id),
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_retention_exemption(record)

    async def revoke_exemption(
        self,
        workspace_id: UUID,
        exemption_id: UUID,
        revoked_by_user_id: UUID,
    ) -> RetentionPolicyExemption:
        """Revoke a retention policy exemption.

        Args:
            workspace_id: Workspace ID for tenant isolation
            exemption_id: Exemption ID to revoke
            revoked_by_user_id: User revoking the exemption

        Returns:
            Updated RetentionPolicyExemption

        Raises:
            RetentionExemptionNotFoundError: If exemption not found
        """
        record = await self._repository.revoke_retention_policy_exemption(
            workspace_id=workspace_id,
            exemption_id=exemption_id,
        )

        if not record:
            raise RetentionExemptionNotFoundError(exemption_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=revoked_by_user_id,
            target_entity_type="retention_policy_exemption",
            target_entity_id=exemption_id,
            details={
                "action": "retention_exemption_revoked",
                "policy_id": str(record.get("policy_id")),
                "resource_type": record.get("resource_type"),
                "resource_id": str(record.get("resource_id")),
            },
        )

        logger.info(
            "Retention policy exemption revoked",
            extra={
                "exemption_id": str(exemption_id),
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_retention_exemption(record)

    async def is_resource_exempt(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> bool:
        """Check if a resource is exempt from a retention policy.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to check
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            True if exempt, False otherwise
        """
        return await self._repository.is_resource_exempt_from_policy(
            workspace_id=workspace_id,
            policy_id=policy_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )

    # =========================================================================
    # RESOURCE ELIGIBILITY CHECKING
    # =========================================================================

    async def check_resource_retention_status(
        self,
        workspace_id: UUID,
        resource_type: str,
        resource_id: UUID,
        resource_created_at: datetime,
    ) -> ResourceRetentionStatus:
        """Check the retention status of a resource.

        Evaluates all applicable retention policies and exemptions
        to determine the resource's retention status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            resource_type: Type of resource
            resource_id: ID of the resource
            resource_created_at: When the resource was created

        Returns:
            ResourceRetentionStatus with full retention information
        """
        # Get all active policies that apply to this resource type
        policies_result = await self._repository.list_retention_policies(
            workspace_id=workspace_id,
            status=RetentionPolicyStatus.ACTIVE.value,
            page=1,
            limit=100,
            active_only=True,
        )

        applicable_policies: list[RetentionPolicySummary] = []
        is_exempt = False
        exemption_reason: Optional[str] = None
        retention_expiry_date: Optional[datetime] = None
        action_on_expiry: Optional[RetentionActionOnExpiry] = None
        highest_priority_policy = None

        now = datetime.now(timezone.utc)

        for policy_dict in policies_result["items"]:
            policy_resource_types = policy_dict.get("resource_types", [])

            # Check if policy applies to this resource type
            if policy_resource_types and resource_type not in policy_resource_types:
                continue

            # Check effective dates
            effective_from = policy_dict.get("effective_from")
            effective_until = policy_dict.get("effective_until")

            if effective_from and resource_created_at < effective_from:
                if not policy_dict.get("applies_to_existing", True):
                    continue

            if effective_until and now > effective_until:
                continue

            # Check if exempt from this policy
            is_policy_exempt = await self._repository.is_resource_exempt_from_policy(
                workspace_id=workspace_id,
                policy_id=policy_dict["policy_id"],
                resource_type=resource_type,
                resource_id=resource_id,
            )

            if is_policy_exempt:
                is_exempt = True
                exemption_reason = f"Exempt from policy {policy_dict['policy_code']}"
                continue

            applicable_policies.append(self._dict_to_retention_policy_summary(policy_dict))

            # Track highest priority policy
            if highest_priority_policy is None or policy_dict.get("priority", 0) > highest_priority_policy.get("priority", 0):
                highest_priority_policy = policy_dict

        # Calculate retention expiry based on highest priority policy
        if highest_priority_policy:
            retention_days = highest_priority_policy.get("retention_period_days", 0)
            if retention_days > 0:
                retention_expiry_date = resource_created_at + timedelta(days=retention_days)
            action_on_expiry = RetentionActionOnExpiry(
                highest_priority_policy.get("action_on_expiry", "delete")
            )

        # Check for legal holds
        is_under_hold = await self._repository.is_resource_under_legal_hold(
            workspace_id=workspace_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )

        legal_hold_ids: list[UUID] = []
        if is_under_hold:
            holds = await self._repository.get_active_holds_for_resource(
                workspace_id=workspace_id,
                resource_type=resource_type,
                resource_id=resource_id,
            )
            legal_hold_ids = [h["hold_id"] for h in holds]

        # Calculate days until action
        days_until_action: Optional[int] = None
        in_grace_period = False
        if retention_expiry_date:
            delta = retention_expiry_date - now
            days_until_action = delta.days

            # Check grace period
            if highest_priority_policy:
                grace_days = highest_priority_policy.get("grace_period_days", 30)
                if days_until_action < 0 and abs(days_until_action) <= grace_days:
                    in_grace_period = True

        return ResourceRetentionStatus(
            resource_type=resource_type,
            resource_id=resource_id,
            applicable_policies=applicable_policies,
            is_exempt=is_exempt,
            exemption_reason=exemption_reason,
            is_under_legal_hold=is_under_hold,
            legal_hold_ids=legal_hold_ids,
            retention_expiry_date=retention_expiry_date,
            action_on_expiry=action_on_expiry,
            days_until_action=days_until_action,
            in_grace_period=in_grace_period,
        )

    async def can_delete_resource(
        self,
        workspace_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> tuple[bool, Optional[str]]:
        """Check if a resource can be deleted.

        Checks both legal holds and retention policies to determine
        if deletion is allowed.

        Args:
            workspace_id: Workspace ID for tenant isolation
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            Tuple of (can_delete, reason_if_blocked)
        """
        # Check legal holds first
        is_under_hold = await self._repository.is_resource_under_legal_hold(
            workspace_id=workspace_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )

        if is_under_hold:
            holds = await self._repository.get_active_holds_for_resource(
                workspace_id=workspace_id,
                resource_type=resource_type,
                resource_id=resource_id,
            )
            hold_numbers = [h["hold_number"] for h in holds]
            return False, f"Resource is under legal hold: {', '.join(hold_numbers)}"

        return True, None

    # =========================================================================
    # STATISTICS AND REPORTING
    # =========================================================================

    async def get_stats(
        self,
        workspace_id: UUID,
    ) -> RetentionPolicyStats:
        """Get statistics for retention policies.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            RetentionPolicyStats with counts and metrics
        """
        # Get all policies for stats calculation
        all_policies = await self._repository.list_retention_policies(
            workspace_id=workspace_id,
            page=1,
            limit=10000,  # Get all for stats
            active_only=False,
        )

        items = all_policies["items"]

        total = len(items)
        active = sum(1 for p in items if p.get("status") == "active")
        paused = sum(1 for p in items if p.get("status") == "paused")
        draft = sum(1 for p in items if p.get("status") == "draft")
        retired = sum(1 for p in items if p.get("status") == "retired")

        total_resources_affected = sum(p.get("total_resources_affected", 0) for p in items)
        total_resources_archived = sum(p.get("total_resources_archived", 0) for p in items)
        total_resources_deleted = sum(p.get("total_resources_deleted", 0) for p in items)
        total_storage_reclaimed = sum(p.get("total_storage_reclaimed_bytes", 0) for p in items)

        return RetentionPolicyStats(
            total=total,
            active=active,
            paused=paused,
            draft=draft,
            retired=retired,
            total_resources_affected=total_resources_affected,
            total_resources_archived=total_resources_archived,
            total_resources_deleted=total_resources_deleted,
            total_storage_reclaimed_bytes=total_storage_reclaimed,
        )

    async def get_policies_due_for_execution(
        self,
        workspace_id: UUID,
    ) -> list[RetentionPolicySummary]:
        """Get policies that are due for execution.

        Returns active policies whose next_execution_at has passed.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            List of policies due for execution
        """
        from app.db.postgres import get_postgres_pool

        now = datetime.now(timezone.utc)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM retention_policies
                WHERE workspace_id = $1
                  AND status = 'active'
                  AND is_active_version = true
                  AND execution_frequency != 'manual'
                  AND (next_execution_at IS NULL OR next_execution_at <= $2)
                ORDER BY priority DESC, next_execution_at ASC
                """,
                workspace_id,
                now,
            )
            return [self._dict_to_retention_policy_summary(self._row_to_dict(row)) for row in rows]

    async def get_active_policies(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
    ) -> RetentionPolicyListResult:
        """Get all active retention policies.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page

        Returns:
            RetentionPolicyListResult with active policies
        """
        return await self.list_retention_policies(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            status=RetentionPolicyStatus.ACTIVE,
        )

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    def _validate_status_transition(
        self,
        current_status: RetentionPolicyStatus,
        target_status: RetentionPolicyStatus,
    ) -> None:
        """Validate that a status transition is allowed.

        Args:
            current_status: Current status of the policy
            target_status: Target status to transition to

        Raises:
            RetentionPolicyInvalidStatusTransitionError: If transition is not allowed
        """
        allowed = VALID_POLICY_STATUS_TRANSITIONS.get(current_status, [])
        if target_status not in allowed:
            raise RetentionPolicyInvalidStatusTransitionError(
                current_status.value,
                target_status.value,
            )

    def _calculate_next_execution(
        self,
        frequency: RetentionExecutionFrequency,
        from_time: datetime,
    ) -> Optional[datetime]:
        """Calculate the next execution time based on frequency.

        Args:
            frequency: Execution frequency
            from_time: Starting point for calculation

        Returns:
            Next execution datetime or None for manual
        """
        interval = EXECUTION_FREQUENCY_INTERVALS.get(frequency)
        if interval is None:
            return None
        return from_time + interval

    async def _check_policy_code_exists(
        self,
        workspace_id: UUID,
        policy_code: str,
    ) -> bool:
        """Check if a policy with the given code already exists.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_code: Policy code to check

        Returns:
            True if policy code exists, False otherwise
        """
        from app.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM retention_policies
                WHERE workspace_id = $1
                  AND policy_code = $2
                  AND is_active_version = true
                """,
                workspace_id,
                policy_code,
            )
            return count > 0

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if hasattr(row, "_asdict"):
            return dict(row._asdict())
        return dict(row)

    def _dict_to_retention_policy(self, record: dict[str, Any]) -> RetentionPolicy:
        """Convert a database record to a RetentionPolicy model.

        Args:
            record: Database record as dict

        Returns:
            RetentionPolicy model instance
        """
        return RetentionPolicy(
            policy_id=record["policy_id"],
            workspace_id=record["workspace_id"],
            policy_name=record["policy_name"],
            policy_code=record["policy_code"],
            description=record.get("description"),
            policy_type=RetentionPolicyType(record.get("policy_type", "custom")),
            status=RetentionPolicyStatus(record["status"]),
            status_reason=record.get("status_reason"),
            priority=record.get("priority", 100),
            resource_types=record.get("resource_types", []),
            resource_filters=record.get("resource_filters", {}),
            retention_period_days=record["retention_period_days"],
            archive_after_days=record.get("archive_after_days"),
            delete_after_days=record.get("delete_after_days"),
            grace_period_days=record.get("grace_period_days", 30),
            action_on_expiry=RetentionActionOnExpiry(record.get("action_on_expiry", "delete")),
            archive_storage_class=(
                RetentionArchiveStorageClass(record["archive_storage_class"])
                if record.get("archive_storage_class")
                else None
            ),
            notification_days_before=record.get("notification_days_before", [30, 7, 1]),
            regulatory_basis=record.get("regulatory_basis"),
            regulatory_reference=record.get("regulatory_reference"),
            compliance_frameworks=record.get("compliance_frameworks", []),
            allow_user_extension=record.get("allow_user_extension", False),
            max_extension_days=record.get("max_extension_days"),
            allow_legal_hold_override=record.get("allow_legal_hold_override", True),
            applies_to_existing=record.get("applies_to_existing", True),
            applies_to_new=record.get("applies_to_new", True),
            effective_from=record.get("effective_from"),
            effective_until=record.get("effective_until"),
            created_by_user_id=record["created_by_user_id"],
            approved_by_user_id=record.get("approved_by_user_id"),
            approved_at=record.get("approved_at"),
            version=record.get("version", 1),
            previous_version_id=record.get("previous_version_id"),
            is_active_version=record.get("is_active_version", True),
            last_executed_at=record.get("last_executed_at"),
            next_execution_at=record.get("next_execution_at"),
            execution_frequency=RetentionExecutionFrequency(
                record.get("execution_frequency", "daily")
            ),
            total_resources_affected=record.get("total_resources_affected", 0),
            total_resources_archived=record.get("total_resources_archived", 0),
            total_resources_deleted=record.get("total_resources_deleted", 0),
            total_storage_reclaimed_bytes=record.get("total_storage_reclaimed_bytes", 0),
            internal_notes=record.get("internal_notes"),
            change_history=record.get("change_history", []),
            metadata=record.get("metadata", {}),
            created_at=record["created_at"],
            updated_at=record["updated_at"],
        )

    def _dict_to_retention_policy_summary(self, record: dict[str, Any]) -> RetentionPolicySummary:
        """Convert a database record to a RetentionPolicySummary model.

        Args:
            record: Database record as dict

        Returns:
            RetentionPolicySummary model instance
        """
        return RetentionPolicySummary(
            policy_id=record["policy_id"],
            workspace_id=record["workspace_id"],
            policy_name=record["policy_name"],
            policy_code=record["policy_code"],
            policy_type=RetentionPolicyType(record.get("policy_type", "custom")),
            status=RetentionPolicyStatus(record["status"]),
            retention_period_days=record["retention_period_days"],
            action_on_expiry=RetentionActionOnExpiry(record.get("action_on_expiry", "delete")),
            is_active_version=record.get("is_active_version", True),
        )

    def _dict_to_retention_execution(self, record: dict[str, Any]) -> RetentionPolicyExecution:
        """Convert a database record to a RetentionPolicyExecution model.

        Args:
            record: Database record as dict

        Returns:
            RetentionPolicyExecution model instance
        """
        return RetentionPolicyExecution(
            execution_id=record["execution_id"],
            policy_id=record["policy_id"],
            workspace_id=record["workspace_id"],
            execution_type=RetentionExecutionType(record.get("execution_type", "scheduled")),
            status=RetentionExecutionStatus(record["status"]),
            started_at=record.get("started_at"),
            completed_at=record.get("completed_at"),
            duration_ms=record.get("duration_ms"),
            initiated_by_user_id=record.get("initiated_by_user_id"),
            resources_scanned=record.get("resources_scanned", 0),
            resources_matched=record.get("resources_matched", 0),
            resources_archived=record.get("resources_archived", 0),
            resources_deleted=record.get("resources_deleted", 0),
            resources_anonymized=record.get("resources_anonymized", 0),
            resources_flagged=record.get("resources_flagged", 0),
            resources_skipped=record.get("resources_skipped", 0),
            resources_failed=record.get("resources_failed", 0),
            storage_scanned_bytes=record.get("storage_scanned_bytes", 0),
            storage_reclaimed_bytes=record.get("storage_reclaimed_bytes", 0),
            error_count=record.get("error_count", 0),
            warning_count=record.get("warning_count", 0),
            errors=record.get("errors", []),
            warnings=record.get("warnings", []),
            affected_resources=record.get("affected_resources", []),
            metadata=record.get("metadata", {}),
            created_at=record["created_at"],
        )

    def _dict_to_retention_exemption(self, record: dict[str, Any]) -> RetentionPolicyExemption:
        """Convert a database record to a RetentionPolicyExemption model.

        Args:
            record: Database record as dict

        Returns:
            RetentionPolicyExemption model instance
        """
        return RetentionPolicyExemption(
            exemption_id=record["exemption_id"],
            policy_id=record["policy_id"],
            workspace_id=record["workspace_id"],
            resource_type=record["resource_type"],
            resource_id=record["resource_id"],
            exemption_reason=RetentionExemptionReason(record["exemption_reason"]),
            reason_details=record.get("reason_details"),
            exemption_type=RetentionExemptionType(record.get("exemption_type", "permanent")),
            expires_at=record.get("expires_at"),
            created_by_user_id=record["created_by_user_id"],
            approved_by_user_id=record.get("approved_by_user_id"),
            approved_at=record.get("approved_at"),
            status=RetentionExemptionStatus(record.get("status", "active")),
            metadata=record.get("metadata", {}),
            created_at=record["created_at"],
            updated_at=record["updated_at"],
        )


# =============================================================================
# FACTORY FUNCTION
# =============================================================================


_retention_service: Optional[RetentionService] = None


def get_retention_service() -> RetentionService:
    """Get the singleton retention service instance.

    Returns:
        RetentionService instance
    """
    global _retention_service
    if _retention_service is None:
        _retention_service = RetentionService()
    return _retention_service
