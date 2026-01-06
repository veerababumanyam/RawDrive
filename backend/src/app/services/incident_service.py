"""Incident management service for security and compliance incidents.

This service provides high-level business logic for managing security incidents,
data breaches, and compliance incidents throughout their lifecycle.

It handles:
- Incident lifecycle management (detection, investigation, containment, resolution)
- Status transitions with validation
- GDPR 72-hour notification deadline tracking for data breaches
- Affected resource tracking and remediation
- Timeline and update management
- Team assignment and incident command
- Evidence preservation and legal hold integration
- Audit logging for compliance

Feature: Audit & Compliance System
Task: T009 - Create incident management service
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.config.settings import AppSettings, get_settings
from app.models.compliance import (
    Incident,
    IncidentAffectedResource,
    IncidentBreachType,
    IncidentCategory,
    IncidentCreate,
    IncidentDataClassification,
    IncidentDetectionMethod,
    IncidentImpact,
    IncidentPriority,
    IncidentRemediationStatus,
    IncidentResolutionType,
    IncidentResourceImpactType,
    IncidentRootCauseCategory,
    IncidentSeverity,
    IncidentStatus,
    IncidentSummary,
    IncidentThreatActorType,
    IncidentTimelineUpdate,
    IncidentType,
    IncidentUpdate,
    IncidentUpdateType,
    IncidentUpdateVisibility,
    IncidentUrgency,
)
from app.repositories.compliance_repository import ComplianceRepository
from app.services.audit_service import AuditEventType, AuditService


logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class IncidentError(Exception):
    """Base exception for incident service errors."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class IncidentNotFoundError(IncidentError):
    """Incident not found."""

    def __init__(self, incident_id: UUID):
        super().__init__(
            f"Incident {incident_id} not found",
            "INCIDENT_NOT_FOUND",
            404,
        )
        self.incident_id = incident_id


class IncidentInvalidStatusTransitionError(IncidentError):
    """Invalid status transition for incident."""

    def __init__(self, current_status: str, target_status: str):
        super().__init__(
            f"Cannot transition from '{current_status}' to '{target_status}'",
            "INVALID_INCIDENT_STATUS_TRANSITION",
            400,
        )
        self.current_status = current_status
        self.target_status = target_status


class IncidentAlreadyClosedError(IncidentError):
    """Incident is already closed."""

    def __init__(self, incident_id: UUID):
        super().__init__(
            f"Incident {incident_id} is already closed",
            "INCIDENT_ALREADY_CLOSED",
            400,
        )
        self.incident_id = incident_id


class IncidentAlreadyResolvedError(IncidentError):
    """Incident is already resolved."""

    def __init__(self, incident_id: UUID):
        super().__init__(
            f"Incident {incident_id} is already resolved",
            "INCIDENT_ALREADY_RESOLVED",
            400,
        )
        self.incident_id = incident_id


class IncidentNotificationOverdueError(IncidentError):
    """Data breach notification deadline has passed."""

    def __init__(self, incident_id: UUID, deadline_at: datetime):
        super().__init__(
            f"Notification deadline for incident {incident_id} has passed ({deadline_at.isoformat()})",
            "NOTIFICATION_OVERDUE",
            400,
        )
        self.incident_id = incident_id
        self.deadline_at = deadline_at


class IncidentAffectedResourceNotFoundError(IncidentError):
    """Affected resource not found for incident."""

    def __init__(self, incident_id: UUID, resource_type: str, resource_id: UUID):
        super().__init__(
            f"Affected resource {resource_type}/{resource_id} not found for incident {incident_id}",
            "AFFECTED_RESOURCE_NOT_FOUND",
            404,
        )
        self.incident_id = incident_id
        self.resource_type = resource_type
        self.resource_id = resource_id


# =============================================================================
# CONFIGURATION
# =============================================================================


# GDPR Article 33 notification deadline (72 hours)
GDPR_NOTIFICATION_DEADLINE_HOURS = 72

# Valid status transitions for incidents
VALID_STATUS_TRANSITIONS: dict[IncidentStatus, list[IncidentStatus]] = {
    IncidentStatus.DETECTED: [
        IncidentStatus.CONFIRMED,
        IncidentStatus.FALSE_POSITIVE,
        IncidentStatus.DUPLICATE,
    ],
    IncidentStatus.CONFIRMED: [
        IncidentStatus.INVESTIGATING,
        IncidentStatus.ESCALATED,
        IncidentStatus.FALSE_POSITIVE,
    ],
    IncidentStatus.INVESTIGATING: [
        IncidentStatus.CONTAINING,
        IncidentStatus.CONTAINED,
        IncidentStatus.ESCALATED,
        IncidentStatus.FALSE_POSITIVE,
    ],
    IncidentStatus.CONTAINING: [
        IncidentStatus.CONTAINED,
        IncidentStatus.ESCALATED,
    ],
    IncidentStatus.CONTAINED: [
        IncidentStatus.ERADICATING,
        IncidentStatus.ERADICATED,
        IncidentStatus.ESCALATED,
    ],
    IncidentStatus.ERADICATING: [
        IncidentStatus.ERADICATED,
        IncidentStatus.ESCALATED,
    ],
    IncidentStatus.ERADICATED: [
        IncidentStatus.RECOVERING,
        IncidentStatus.RECOVERED,
        IncidentStatus.ESCALATED,
    ],
    IncidentStatus.RECOVERING: [
        IncidentStatus.RECOVERED,
        IncidentStatus.ESCALATED,
    ],
    IncidentStatus.RECOVERED: [
        IncidentStatus.RESOLVED,
        IncidentStatus.POST_INCIDENT_REVIEW,
    ],
    IncidentStatus.RESOLVED: [
        IncidentStatus.POST_INCIDENT_REVIEW,
        IncidentStatus.CLOSED,
    ],
    IncidentStatus.POST_INCIDENT_REVIEW: [
        IncidentStatus.CLOSED,
    ],
    IncidentStatus.ESCALATED: [
        IncidentStatus.INVESTIGATING,
        IncidentStatus.CONTAINING,
        IncidentStatus.RESOLVED,
    ],
    # Terminal states
    IncidentStatus.CLOSED: [],
    IncidentStatus.FALSE_POSITIVE: [],
    IncidentStatus.DUPLICATE: [],
}


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class IncidentListResult:
    """Result of listing incidents."""

    items: list[IncidentSummary]
    page: int
    limit: int
    total: int
    total_pages: int


@dataclass
class IncidentStats:
    """Statistics for incidents."""

    total: int
    open: int
    resolved: int
    closed: int
    data_breaches: int
    pending_notification: int
    overdue_notification: int
    critical_severity: int
    high_severity: int
    average_resolution_hours: float


@dataclass
class IncidentUpdateListResult:
    """Result of listing incident updates."""

    items: list[IncidentTimelineUpdate]
    page: int
    limit: int
    total: int
    total_pages: int


@dataclass
class AffectedResourceListResult:
    """Result of listing affected resources."""

    items: list[IncidentAffectedResource]
    page: int
    limit: int
    total: int
    total_pages: int


@dataclass
class NotificationDeadlineResult:
    """Result of checking notification deadline."""

    requires_notification: bool
    deadline_at: Optional[datetime]
    hours_remaining: Optional[float]
    is_overdue: bool
    authority_notified: bool
    subjects_notified: bool


# =============================================================================
# INCIDENT SERVICE
# =============================================================================


class IncidentService:
    """Service for managing security and compliance incidents.

    This service provides the business logic layer for incident management,
    coordinating between the repository, audit service, and compliance
    components.

    Key responsibilities:
    - Incident lifecycle management (detect, investigate, contain, resolve)
    - GDPR 72-hour notification deadline tracking
    - Affected resource management and remediation tracking
    - Team assignment and incident command
    - Evidence preservation and legal hold integration
    - Timeline management with updates
    - Audit logging for compliance

    All methods enforce workspace isolation for multi-tenant security.
    """

    def __init__(self, settings: Optional[AppSettings] = None):
        """Initialize the incident service.

        Args:
            settings: Optional application settings override
        """
        self._settings = settings or get_settings()
        self._repository = ComplianceRepository()
        self._audit_service = AuditService()

    # =========================================================================
    # INCIDENT LIFECYCLE OPERATIONS
    # =========================================================================

    async def create_incident(
        self,
        workspace_id: UUID,
        title: str,
        description: str,
        incident_type: IncidentType,
        reported_by_user_id: Optional[UUID] = None,
        category: IncidentCategory = IncidentCategory.SECURITY,
        severity: IncidentSeverity = IncidentSeverity.MEDIUM,
        impact: IncidentImpact = IncidentImpact.MEDIUM,
        urgency: IncidentUrgency = IncidentUrgency.MEDIUM,
        detected_at: Optional[datetime] = None,
        detected_by_user_id: Optional[UUID] = None,
        detection_method: IncidentDetectionMethod = IncidentDetectionMethod.MANUAL,
        detection_source: Optional[str] = None,
        is_data_breach: bool = False,
        personal_data_involved: bool = False,
        assigned_to_user_id: Optional[UUID] = None,
        reporter_ip_address: Optional[str] = None,
        reporter_user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Incident:
        """Create a new incident.

        Creates an incident with automatic priority calculation and
        GDPR notification deadline calculation for data breaches.

        Args:
            workspace_id: Workspace ID for tenant isolation
            title: Incident title
            description: Detailed description
            incident_type: Type of incident
            reported_by_user_id: User who reported the incident
            category: Incident category
            severity: Incident severity
            impact: Business impact
            urgency: Response urgency
            detected_at: When incident was detected (defaults to now)
            detected_by_user_id: User who detected the incident
            detection_method: How incident was detected
            detection_source: Source of detection
            is_data_breach: Whether this is a data breach
            personal_data_involved: Whether personal data is involved
            assigned_to_user_id: User to assign the incident to
            reporter_ip_address: Reporter's IP address
            reporter_user_agent: Reporter's user agent
            metadata: Additional metadata

        Returns:
            Created Incident
        """
        record = await self._repository.create_incident(
            workspace_id=workspace_id,
            title=title,
            description=description,
            incident_type=incident_type.value,
            category=category.value,
            severity=severity.value,
            impact=impact.value,
            urgency=urgency.value,
            detected_at=detected_at,
            detected_by_user_id=detected_by_user_id or reported_by_user_id,
            detection_method=detection_method.value,
            detection_source=detection_source,
            is_data_breach=is_data_breach,
            personal_data_involved=personal_data_involved,
            assigned_to_user_id=assigned_to_user_id,
            reporter_ip_address=reporter_ip_address,
            reporter_user_agent=reporter_user_agent,
            metadata=metadata,
        )

        # Log audit event
        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=reported_by_user_id or detected_by_user_id,
            target_entity_type="incident",
            target_entity_id=record["incident_id"],
            ip_address=reporter_ip_address,
            user_agent=reporter_user_agent,
            details={
                "action": "incident_created",
                "incident_number": record["incident_number"],
                "incident_type": incident_type.value,
                "severity": severity.value,
                "is_data_breach": is_data_breach,
                "personal_data_involved": personal_data_involved,
            },
        )

        logger.info(
            "Incident created",
            extra={
                "incident_id": str(record["incident_id"]),
                "incident_number": record["incident_number"],
                "workspace_id": str(workspace_id),
                "incident_type": incident_type.value,
                "severity": severity.value,
                "is_data_breach": is_data_breach,
            },
        )

        return self._dict_to_incident(record)

    async def get_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
    ) -> Incident:
        """Get an incident by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to retrieve

        Returns:
            Incident

        Raises:
            IncidentNotFoundError: If incident not found
        """
        record = await self._repository.get_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        return self._dict_to_incident(record)

    async def get_incident_by_number(
        self,
        workspace_id: UUID,
        incident_number: str,
    ) -> Incident:
        """Get an incident by its human-readable number.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_number: Human-readable incident number (e.g., INC-2026-00001)

        Returns:
            Incident

        Raises:
            IncidentNotFoundError: If incident not found
        """
        record = await self._repository.get_incident_by_number(
            workspace_id=workspace_id,
            incident_number=incident_number,
        )

        if not record:
            from uuid import uuid4
            raise IncidentNotFoundError(uuid4())

        return self._dict_to_incident(record)

    async def list_incidents(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[IncidentStatus] = None,
        incident_type: Optional[IncidentType] = None,
        severity: Optional[IncidentSeverity] = None,
        is_data_breach: Optional[bool] = None,
        open_only: bool = False,
    ) -> IncidentListResult:
        """List incidents with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            incident_type: Optional incident type filter
            severity: Optional severity filter
            is_data_breach: Optional data breach filter
            open_only: If True, only return open incidents

        Returns:
            IncidentListResult with items and pagination
        """
        result = await self._repository.list_incidents(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            status=status.value if status else None,
            incident_type=incident_type.value if incident_type else None,
            severity=severity.value if severity else None,
            is_data_breach=is_data_breach,
            open_only=open_only,
        )

        items = [self._dict_to_incident_summary(item) for item in result["items"]]

        return IncidentListResult(
            items=items,
            page=result["pagination"]["page"],
            limit=result["pagination"]["limit"],
            total=result["pagination"]["total"],
            total_pages=result["pagination"]["total_pages"],
        )

    async def update_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        update: IncidentUpdate,
        updated_by_user_id: UUID,
    ) -> Incident:
        """Update an incident.

        Validates status transitions and updates the incident with
        proper audit logging.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to update
            update: Fields to update
            updated_by_user_id: User making the update

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If status transition is invalid
            IncidentAlreadyClosedError: If trying to update a closed incident
        """
        current = await self.get_incident(workspace_id, incident_id)

        # Check if already closed
        if current.status == IncidentStatus.CLOSED:
            raise IncidentAlreadyClosedError(incident_id)

        # Validate status transition if changing status
        if update.status and update.status != current.status:
            self._validate_status_transition(current.status, update.status)

        # Perform the update
        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            title=update.title,
            description=update.description,
            severity=update.severity.value if update.severity else None,
            impact=update.impact.value if update.impact else None,
            urgency=update.urgency.value if update.urgency else None,
            priority=update.priority.value if update.priority else None,
            status=update.status.value if update.status else None,
            status_reason=update.status_reason,
            assigned_to_user_id=update.assigned_to_user_id,
            incident_commander_id=update.incident_commander_id,
            team_members=update.team_members,
            affected_users_count=update.affected_users_count,
            affected_resources_count=update.affected_resources_count,
            affected_data_categories=update.affected_data_categories,
            affected_systems=update.affected_systems,
            is_data_breach=update.is_data_breach,
            personal_data_involved=update.personal_data_involved,
            data_subjects_count=update.data_subjects_count,
            data_categories_affected=update.data_categories_affected,
            breach_type=update.breach_type.value if update.breach_type else None,
            requires_notification=update.requires_notification,
            root_cause=update.root_cause,
            root_cause_category=update.root_cause_category.value if update.root_cause_category else None,
            attack_vector=update.attack_vector,
            threat_actor_type=update.threat_actor_type.value if update.threat_actor_type else None,
            containment_actions=update.containment_actions,
            eradication_actions=update.eradication_actions,
            recovery_actions=update.recovery_actions,
            resolution_summary=update.resolution_summary,
            resolution_type=update.resolution_type.value if update.resolution_type else None,
            lessons_learned=update.lessons_learned,
            recommendations=update.recommendations,
            follow_up_actions=update.follow_up_actions,
            evidence_preserved=update.evidence_preserved,
            evidence_location=update.evidence_location,
            legal_hold_id=update.legal_hold_id,
            external_ticket_id=update.external_ticket_id,
            external_ticket_url=update.external_ticket_url,
            internal_notes=update.internal_notes,
            metadata=update.metadata,
            changed_by_user_id=updated_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        # Log status change audit event
        if update.status and update.status != current.status:
            await self._audit_service.log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                workspace_id=workspace_id,
                actor_user_id=updated_by_user_id,
                target_entity_type="incident",
                target_entity_id=incident_id,
                details={
                    "action": "incident_status_change",
                    "incident_number": current.incident_number,
                    "previous_status": current.status.value,
                    "new_status": update.status.value,
                    "reason": update.status_reason,
                },
            )

        logger.info(
            "Incident updated",
            extra={
                "incident_id": str(incident_id),
                "workspace_id": str(workspace_id),
                "updated_by": str(updated_by_user_id),
            },
        )

        return self._dict_to_incident(record)

    async def confirm_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        confirmed_by_user_id: UUID,
        confirmation_notes: Optional[str] = None,
    ) -> Incident:
        """Confirm an incident after initial detection.

        Transitions the incident from DETECTED to CONFIRMED status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to confirm
            confirmed_by_user_id: User confirming the incident
            confirmation_notes: Optional confirmation notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.CONFIRMED)

        now = datetime.now(timezone.utc)

        # Add timeline event
        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="incident_confirmed",
            occurred_at=now,
            description=confirmation_notes or "Incident confirmed",
            actor_user_id=confirmed_by_user_id,
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.CONFIRMED.value,
            status_reason=confirmation_notes or "Incident confirmed",
            changed_by_user_id=confirmed_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=confirmed_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "incident_confirmed",
                "incident_number": current.incident_number,
            },
        )

        logger.info(
            "Incident confirmed",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def start_investigation(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        investigator_user_id: UUID,
        investigation_notes: Optional[str] = None,
    ) -> Incident:
        """Start investigation of an incident.

        Transitions the incident to INVESTIGATING status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to investigate
            investigator_user_id: User starting the investigation
            investigation_notes: Optional investigation notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.INVESTIGATING)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="investigation_started",
            occurred_at=now,
            description=investigation_notes or "Investigation started",
            actor_user_id=investigator_user_id,
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.INVESTIGATING.value,
            status_reason=investigation_notes or "Investigation started",
            investigation_started_at=now,
            assigned_to_user_id=investigator_user_id,
            changed_by_user_id=investigator_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=investigator_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "investigation_started",
                "incident_number": current.incident_number,
            },
        )

        logger.info(
            "Investigation started",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def start_containment(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        responder_user_id: UUID,
        containment_notes: Optional[str] = None,
    ) -> Incident:
        """Start containment of an incident.

        Transitions the incident to CONTAINING status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to contain
            responder_user_id: User starting containment
            containment_notes: Optional containment notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.CONTAINING)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="containment_started",
            occurred_at=now,
            description=containment_notes or "Containment started",
            actor_user_id=responder_user_id,
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.CONTAINING.value,
            status_reason=containment_notes or "Containment started",
            containment_started_at=now,
            changed_by_user_id=responder_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=responder_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "containment_started",
                "incident_number": current.incident_number,
            },
        )

        logger.info(
            "Containment started",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def mark_contained(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        responder_user_id: UUID,
        containment_actions: list[dict[str, Any]],
        containment_notes: Optional[str] = None,
    ) -> Incident:
        """Mark an incident as contained.

        Transitions the incident to CONTAINED status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            responder_user_id: User marking as contained
            containment_actions: Actions taken for containment
            containment_notes: Optional containment notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.CONTAINED)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="containment_completed",
            occurred_at=now,
            description=containment_notes or "Incident contained",
            actor_user_id=responder_user_id,
            metadata={"actions_count": len(containment_actions)},
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.CONTAINED.value,
            status_reason=containment_notes or "Incident contained",
            containment_completed_at=now,
            containment_actions=containment_actions,
            changed_by_user_id=responder_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=responder_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "incident_contained",
                "incident_number": current.incident_number,
                "containment_actions_count": len(containment_actions),
            },
        )

        logger.info(
            "Incident contained",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def start_eradication(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        responder_user_id: UUID,
        eradication_notes: Optional[str] = None,
    ) -> Incident:
        """Start eradication of an incident.

        Transitions the incident to ERADICATING status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            responder_user_id: User starting eradication
            eradication_notes: Optional eradication notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.ERADICATING)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="eradication_started",
            occurred_at=now,
            description=eradication_notes or "Eradication started",
            actor_user_id=responder_user_id,
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.ERADICATING.value,
            status_reason=eradication_notes or "Eradication started",
            eradication_started_at=now,
            changed_by_user_id=responder_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=responder_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "eradication_started",
                "incident_number": current.incident_number,
            },
        )

        logger.info(
            "Eradication started",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def mark_eradicated(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        responder_user_id: UUID,
        eradication_actions: list[dict[str, Any]],
        root_cause: Optional[str] = None,
        root_cause_category: Optional[IncidentRootCauseCategory] = None,
        attack_vector: Optional[str] = None,
        threat_actor_type: Optional[IncidentThreatActorType] = None,
        eradication_notes: Optional[str] = None,
    ) -> Incident:
        """Mark an incident as eradicated.

        Transitions the incident to ERADICATED status and records
        root cause analysis.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            responder_user_id: User marking as eradicated
            eradication_actions: Actions taken for eradication
            root_cause: Root cause analysis
            root_cause_category: Root cause category
            attack_vector: Attack vector used
            threat_actor_type: Type of threat actor
            eradication_notes: Optional eradication notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.ERADICATED)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="eradication_completed",
            occurred_at=now,
            description=eradication_notes or "Threat eradicated",
            actor_user_id=responder_user_id,
            metadata={"actions_count": len(eradication_actions)},
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.ERADICATED.value,
            status_reason=eradication_notes or "Threat eradicated",
            eradication_completed_at=now,
            eradication_actions=eradication_actions,
            investigation_completed_at=now,
            root_cause=root_cause,
            root_cause_category=root_cause_category.value if root_cause_category else None,
            attack_vector=attack_vector,
            threat_actor_type=threat_actor_type.value if threat_actor_type else None,
            changed_by_user_id=responder_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=responder_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "incident_eradicated",
                "incident_number": current.incident_number,
                "root_cause_category": root_cause_category.value if root_cause_category else None,
                "eradication_actions_count": len(eradication_actions),
            },
        )

        logger.info(
            "Incident eradicated",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
                "root_cause_category": root_cause_category.value if root_cause_category else None,
            },
        )

        return self._dict_to_incident(record)

    async def start_recovery(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        responder_user_id: UUID,
        recovery_notes: Optional[str] = None,
    ) -> Incident:
        """Start recovery from an incident.

        Transitions the incident to RECOVERING status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            responder_user_id: User starting recovery
            recovery_notes: Optional recovery notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.RECOVERING)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="recovery_started",
            occurred_at=now,
            description=recovery_notes or "Recovery started",
            actor_user_id=responder_user_id,
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.RECOVERING.value,
            status_reason=recovery_notes or "Recovery started",
            recovery_started_at=now,
            changed_by_user_id=responder_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=responder_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "recovery_started",
                "incident_number": current.incident_number,
            },
        )

        logger.info(
            "Recovery started",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def mark_recovered(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        responder_user_id: UUID,
        recovery_actions: list[dict[str, Any]],
        recovery_notes: Optional[str] = None,
    ) -> Incident:
        """Mark an incident as recovered.

        Transitions the incident to RECOVERED status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            responder_user_id: User marking as recovered
            recovery_actions: Actions taken for recovery
            recovery_notes: Optional recovery notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.RECOVERED)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="recovery_completed",
            occurred_at=now,
            description=recovery_notes or "Recovery completed",
            actor_user_id=responder_user_id,
            metadata={"actions_count": len(recovery_actions)},
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.RECOVERED.value,
            status_reason=recovery_notes or "Recovery completed",
            recovery_completed_at=now,
            recovery_actions=recovery_actions,
            changed_by_user_id=responder_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=responder_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "incident_recovered",
                "incident_number": current.incident_number,
                "recovery_actions_count": len(recovery_actions),
            },
        )

        logger.info(
            "Incident recovered",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def resolve_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        resolved_by_user_id: UUID,
        resolution_summary: str,
        resolution_type: IncidentResolutionType = IncidentResolutionType.REMEDIATED,
        lessons_learned: Optional[str] = None,
        recommendations: Optional[list[dict[str, Any]]] = None,
        follow_up_actions: Optional[list[dict[str, Any]]] = None,
    ) -> Incident:
        """Resolve an incident.

        Transitions the incident to RESOLVED status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            resolved_by_user_id: User resolving the incident
            resolution_summary: Summary of resolution
            resolution_type: Type of resolution
            lessons_learned: Lessons learned
            recommendations: Post-incident recommendations
            follow_up_actions: Follow-up actions

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentAlreadyResolvedError: If already resolved
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)

        if current.status == IncidentStatus.RESOLVED:
            raise IncidentAlreadyResolvedError(incident_id)

        self._validate_status_transition(current.status, IncidentStatus.RESOLVED)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="incident_resolved",
            occurred_at=now,
            description=resolution_summary,
            actor_user_id=resolved_by_user_id,
            metadata={"resolution_type": resolution_type.value},
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.RESOLVED.value,
            status_reason=resolution_summary,
            resolved_at=now,
            resolution_summary=resolution_summary,
            resolution_type=resolution_type.value,
            lessons_learned=lessons_learned,
            recommendations=recommendations,
            follow_up_actions=follow_up_actions,
            changed_by_user_id=resolved_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=resolved_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "incident_resolved",
                "incident_number": current.incident_number,
                "resolution_type": resolution_type.value,
            },
        )

        logger.info(
            "Incident resolved",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
                "resolution_type": resolution_type.value,
            },
        )

        return self._dict_to_incident(record)

    async def close_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        closed_by_user_id: UUID,
        closure_notes: Optional[str] = None,
    ) -> Incident:
        """Close an incident after resolution.

        Transitions the incident to CLOSED status. This is a terminal state.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            closed_by_user_id: User closing the incident
            closure_notes: Optional closure notes

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentAlreadyClosedError: If already closed
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)

        if current.status == IncidentStatus.CLOSED:
            raise IncidentAlreadyClosedError(incident_id)

        self._validate_status_transition(current.status, IncidentStatus.CLOSED)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="incident_closed",
            occurred_at=now,
            description=closure_notes or "Incident closed",
            actor_user_id=closed_by_user_id,
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.CLOSED.value,
            status_reason=closure_notes or "Incident closed",
            closed_at=now,
            changed_by_user_id=closed_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=closed_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "incident_closed",
                "incident_number": current.incident_number,
            },
        )

        logger.info(
            "Incident closed",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def mark_false_positive(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        marked_by_user_id: UUID,
        reason: str,
    ) -> Incident:
        """Mark an incident as false positive.

        Transitions the incident to FALSE_POSITIVE status. This is a terminal state.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            marked_by_user_id: User marking as false positive
            reason: Reason for marking as false positive

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.FALSE_POSITIVE)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="marked_false_positive",
            occurred_at=now,
            description=reason,
            actor_user_id=marked_by_user_id,
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.FALSE_POSITIVE.value,
            status_reason=reason,
            resolution_type=IncidentResolutionType.FALSE_POSITIVE.value,
            resolved_at=now,
            closed_at=now,
            changed_by_user_id=marked_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=marked_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "marked_false_positive",
                "incident_number": current.incident_number,
                "reason": reason,
            },
        )

        logger.info(
            "Incident marked as false positive",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def escalate_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        escalated_by_user_id: UUID,
        escalation_reason: str,
        incident_commander_id: Optional[UUID] = None,
    ) -> Incident:
        """Escalate an incident.

        Transitions the incident to ESCALATED status and optionally
        assigns an incident commander.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            escalated_by_user_id: User escalating the incident
            escalation_reason: Reason for escalation
            incident_commander_id: Optional incident commander

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
            IncidentInvalidStatusTransitionError: If transition is invalid
        """
        current = await self.get_incident(workspace_id, incident_id)
        self._validate_status_transition(current.status, IncidentStatus.ESCALATED)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="incident_escalated",
            occurred_at=now,
            description=escalation_reason,
            actor_user_id=escalated_by_user_id,
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            status=IncidentStatus.ESCALATED.value,
            status_reason=escalation_reason,
            incident_commander_id=incident_commander_id,
            changed_by_user_id=escalated_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=escalated_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "incident_escalated",
                "incident_number": current.incident_number,
                "reason": escalation_reason,
                "incident_commander_id": str(incident_commander_id) if incident_commander_id else None,
            },
        )

        logger.warning(
            "Incident escalated",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
                "reason": escalation_reason,
            },
        )

        return self._dict_to_incident(record)

    # =========================================================================
    # DATA BREACH NOTIFICATION OPERATIONS
    # =========================================================================

    async def check_notification_deadline(
        self,
        workspace_id: UUID,
        incident_id: UUID,
    ) -> NotificationDeadlineResult:
        """Check the notification deadline status for a data breach.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID

        Returns:
            NotificationDeadlineResult with deadline information
        """
        incident = await self.get_incident(workspace_id, incident_id)

        if not incident.requires_notification:
            return NotificationDeadlineResult(
                requires_notification=False,
                deadline_at=None,
                hours_remaining=None,
                is_overdue=False,
                authority_notified=incident.authority_notified_at is not None,
                subjects_notified=incident.subjects_notified_at is not None,
            )

        now = datetime.now(timezone.utc)
        deadline_at = incident.notification_deadline_at

        if deadline_at is None:
            return NotificationDeadlineResult(
                requires_notification=True,
                deadline_at=None,
                hours_remaining=None,
                is_overdue=False,
                authority_notified=incident.authority_notified_at is not None,
                subjects_notified=incident.subjects_notified_at is not None,
            )

        # Parse deadline if it's a string
        if isinstance(deadline_at, str):
            deadline_at = datetime.fromisoformat(deadline_at.replace("Z", "+00:00"))

        hours_remaining = (deadline_at - now).total_seconds() / 3600
        is_overdue = hours_remaining < 0

        return NotificationDeadlineResult(
            requires_notification=True,
            deadline_at=deadline_at,
            hours_remaining=max(0, hours_remaining) if not is_overdue else 0,
            is_overdue=is_overdue,
            authority_notified=incident.authority_notified_at is not None,
            subjects_notified=incident.subjects_notified_at is not None,
        )

    async def record_authority_notification(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        notified_by_user_id: UUID,
        notification_reference: str,
        notification_details: Optional[str] = None,
    ) -> Incident:
        """Record that the supervisory authority has been notified.

        For GDPR Article 33 compliance (72-hour notification requirement).

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            notified_by_user_id: User who sent the notification
            notification_reference: Reference number from authority
            notification_details: Optional details

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
        """
        current = await self.get_incident(workspace_id, incident_id)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="authority_notified",
            occurred_at=now,
            description=notification_details or f"Authority notified, reference: {notification_reference}",
            actor_user_id=notified_by_user_id,
            metadata={"reference": notification_reference},
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            authority_notified_at=now,
            authority_notification_reference=notification_reference,
            changed_by_user_id=notified_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=notified_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "authority_notified",
                "incident_number": current.incident_number,
                "notification_reference": notification_reference,
            },
        )

        logger.info(
            "Authority notified for data breach",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
                "notification_reference": notification_reference,
            },
        )

        return self._dict_to_incident(record)

    async def record_subjects_notification(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        notified_by_user_id: UUID,
        subjects_count: int,
        notification_method: str,
        notification_details: Optional[str] = None,
    ) -> Incident:
        """Record that data subjects have been notified.

        For GDPR Article 34 compliance (notification to data subjects).

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            notified_by_user_id: User who sent the notification
            subjects_count: Number of subjects notified
            notification_method: Method used (email, letter, etc.)
            notification_details: Optional details

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
        """
        current = await self.get_incident(workspace_id, incident_id)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="subjects_notified",
            occurred_at=now,
            description=notification_details or f"Notified {subjects_count} data subjects via {notification_method}",
            actor_user_id=notified_by_user_id,
            metadata={
                "subjects_count": subjects_count,
                "method": notification_method,
            },
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            subjects_notified_at=now,
            subjects_notification_count=subjects_count,
            changed_by_user_id=notified_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=notified_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "subjects_notified",
                "incident_number": current.incident_number,
                "subjects_count": subjects_count,
                "method": notification_method,
            },
        )

        logger.info(
            "Data subjects notified of breach",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
                "subjects_count": subjects_count,
            },
        )

        return self._dict_to_incident(record)

    # =========================================================================
    # AFFECTED RESOURCE OPERATIONS
    # =========================================================================

    async def add_affected_resource(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        resource_type: str,
        resource_id: UUID,
        added_by_user_id: UUID,
        impact_type: IncidentResourceImpactType = IncidentResourceImpactType.AFFECTED,
        resource_name: Optional[str] = None,
        user_id: Optional[UUID] = None,
        impact_description: Optional[str] = None,
        data_classification: Optional[IncidentDataClassification] = None,
        contains_pii: bool = False,
        contains_sensitive_data: bool = False,
        metadata: Optional[dict[str, Any]] = None,
    ) -> IncidentAffectedResource:
        """Add an affected resource to an incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            resource_type: Type of resource
            resource_id: ID of the resource
            added_by_user_id: User adding the resource
            impact_type: Type of impact
            resource_name: Name of the resource
            user_id: User associated with the resource
            impact_description: Description of impact
            data_classification: Data sensitivity classification
            contains_pii: Contains personally identifiable information
            contains_sensitive_data: Contains sensitive data
            metadata: Additional metadata

        Returns:
            Created IncidentAffectedResource

        Raises:
            IncidentNotFoundError: If incident not found
        """
        # Verify incident exists
        await self.get_incident(workspace_id, incident_id)

        record = await self._repository.add_affected_resource_to_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            resource_type=resource_type,
            resource_id=resource_id,
            impact_type=impact_type.value,
            resource_name=resource_name,
            user_id=user_id,
            impact_description=impact_description,
            data_classification=data_classification.value if data_classification else None,
            contains_pii=contains_pii,
            contains_sensitive_data=contains_sensitive_data,
            metadata=metadata,
        )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=added_by_user_id,
            target_entity_type="incident_affected_resource",
            target_entity_id=record["id"],
            details={
                "action": "affected_resource_added",
                "incident_id": str(incident_id),
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "impact_type": impact_type.value,
            },
        )

        logger.info(
            "Affected resource added to incident",
            extra={
                "incident_id": str(incident_id),
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_affected_resource(record)

    async def update_affected_resource_remediation(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        resource_type: str,
        resource_id: UUID,
        updated_by_user_id: UUID,
        remediation_status: IncidentRemediationStatus,
        remediation_notes: Optional[str] = None,
    ) -> IncidentAffectedResource:
        """Update remediation status for an affected resource.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            resource_type: Type of resource
            resource_id: ID of the resource
            updated_by_user_id: User updating the status
            remediation_status: New remediation status
            remediation_notes: Notes on remediation

        Returns:
            Updated IncidentAffectedResource

        Raises:
            IncidentAffectedResourceNotFoundError: If resource not found
        """
        remediated_at = None
        if remediation_status == IncidentRemediationStatus.COMPLETED:
            remediated_at = datetime.now(timezone.utc)

        record = await self._repository.update_affected_resource_remediation(
            workspace_id=workspace_id,
            incident_id=incident_id,
            resource_type=resource_type,
            resource_id=resource_id,
            remediation_status=remediation_status.value,
            remediation_notes=remediation_notes,
            remediated_at=remediated_at,
        )

        if not record:
            raise IncidentAffectedResourceNotFoundError(incident_id, resource_type, resource_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=updated_by_user_id,
            target_entity_type="incident_affected_resource",
            target_entity_id=record["id"],
            details={
                "action": "remediation_updated",
                "incident_id": str(incident_id),
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "remediation_status": remediation_status.value,
            },
        )

        logger.info(
            "Affected resource remediation updated",
            extra={
                "incident_id": str(incident_id),
                "resource_type": resource_type,
                "resource_id": str(resource_id),
                "remediation_status": remediation_status.value,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_affected_resource(record)

    async def list_affected_resources(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        page: int = 1,
        limit: int = 50,
        impact_type: Optional[IncidentResourceImpactType] = None,
        remediation_status: Optional[IncidentRemediationStatus] = None,
    ) -> AffectedResourceListResult:
        """List affected resources for an incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            page: Page number (1-indexed)
            limit: Number of items per page
            impact_type: Optional impact type filter
            remediation_status: Optional remediation status filter

        Returns:
            AffectedResourceListResult with items and pagination
        """
        result = await self._repository.list_affected_resources_for_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            page=page,
            limit=limit,
            impact_type=impact_type.value if impact_type else None,
            remediation_status=remediation_status.value if remediation_status else None,
        )

        items = [self._dict_to_affected_resource(item) for item in result["items"]]

        return AffectedResourceListResult(
            items=items,
            page=result["pagination"]["page"],
            limit=result["pagination"]["limit"],
            total=result["pagination"]["total"],
            total_pages=result["pagination"]["total_pages"],
        )

    # =========================================================================
    # INCIDENT UPDATE OPERATIONS
    # =========================================================================

    async def add_update(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        content: str,
        created_by_user_id: UUID,
        update_type: IncidentUpdateType = IncidentUpdateType.GENERAL,
        title: Optional[str] = None,
        visibility: IncidentUpdateVisibility = IncidentUpdateVisibility.INTERNAL,
        is_public: bool = False,
        attachments: Optional[list[dict[str, Any]]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> IncidentTimelineUpdate:
        """Add an update to an incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            content: Update content
            created_by_user_id: User creating the update
            update_type: Type of update
            title: Optional update title
            visibility: Visibility level
            is_public: Is publicly visible
            attachments: Attached files/evidence
            metadata: Additional metadata

        Returns:
            Created IncidentTimelineUpdate

        Raises:
            IncidentNotFoundError: If incident not found
        """
        # Verify incident exists
        current = await self.get_incident(workspace_id, incident_id)

        record = await self._repository.create_incident_update(
            workspace_id=workspace_id,
            incident_id=incident_id,
            content=content,
            created_by_user_id=created_by_user_id,
            update_type=update_type.value,
            title=title,
            visibility=visibility.value,
            is_public=is_public,
            attachments=attachments,
            metadata=metadata,
        )

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=created_by_user_id,
            target_entity_type="incident_update",
            target_entity_id=record["update_id"],
            details={
                "action": "update_added",
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "update_type": update_type.value,
            },
        )

        logger.info(
            "Incident update added",
            extra={
                "incident_id": str(incident_id),
                "update_id": str(record["update_id"]),
                "update_type": update_type.value,
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident_update(record)

    async def list_updates(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        page: int = 1,
        limit: int = 50,
        update_type: Optional[IncidentUpdateType] = None,
        visibility: Optional[IncidentUpdateVisibility] = None,
    ) -> IncidentUpdateListResult:
        """List updates for an incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            page: Page number (1-indexed)
            limit: Number of items per page
            update_type: Optional update type filter
            visibility: Optional visibility filter

        Returns:
            IncidentUpdateListResult with items and pagination
        """
        result = await self._repository.list_incident_updates(
            workspace_id=workspace_id,
            incident_id=incident_id,
            page=page,
            limit=limit,
            update_type=update_type.value if update_type else None,
            visibility=visibility.value if visibility else None,
        )

        items = [self._dict_to_incident_update(item) for item in result["items"]]

        return IncidentUpdateListResult(
            items=items,
            page=result["pagination"]["page"],
            limit=result["pagination"]["limit"],
            total=result["pagination"]["total"],
            total_pages=result["pagination"]["total_pages"],
        )

    # =========================================================================
    # ASSIGNMENT AND TEAM OPERATIONS
    # =========================================================================

    async def assign_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        assigned_to_user_id: UUID,
        assigned_by_user_id: UUID,
    ) -> Incident:
        """Assign an incident to a user.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            assigned_to_user_id: User to assign to
            assigned_by_user_id: User making the assignment

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
        """
        current = await self.get_incident(workspace_id, incident_id)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="assigned",
            occurred_at=now,
            description=f"Incident assigned",
            actor_user_id=assigned_by_user_id,
            metadata={"assigned_to": str(assigned_to_user_id)},
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            assigned_to_user_id=assigned_to_user_id,
            changed_by_user_id=assigned_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=assigned_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "incident_assigned",
                "incident_number": current.incident_number,
                "assigned_to": str(assigned_to_user_id),
            },
        )

        logger.info(
            "Incident assigned",
            extra={
                "incident_id": str(incident_id),
                "assigned_to": str(assigned_to_user_id),
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    async def set_incident_commander(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        commander_user_id: UUID,
        set_by_user_id: UUID,
    ) -> Incident:
        """Set the incident commander.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            commander_user_id: User to set as commander
            set_by_user_id: User making the change

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
        """
        current = await self.get_incident(workspace_id, incident_id)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="commander_set",
            occurred_at=now,
            description=f"Incident commander assigned",
            actor_user_id=set_by_user_id,
            metadata={"commander": str(commander_user_id)},
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            incident_commander_id=commander_user_id,
            changed_by_user_id=set_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=set_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "commander_set",
                "incident_number": current.incident_number,
                "commander_id": str(commander_user_id),
            },
        )

        logger.info(
            "Incident commander set",
            extra={
                "incident_id": str(incident_id),
                "commander_id": str(commander_user_id),
                "workspace_id": str(workspace_id),
            },
        )

        return self._dict_to_incident(record)

    # =========================================================================
    # EVIDENCE AND LEGAL HOLD OPERATIONS
    # =========================================================================

    async def preserve_evidence(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        preserved_by_user_id: UUID,
        evidence_location: str,
        legal_hold_id: Optional[UUID] = None,
    ) -> Incident:
        """Record evidence preservation for an incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            preserved_by_user_id: User who preserved evidence
            evidence_location: Location where evidence is stored
            legal_hold_id: Optional associated legal hold

        Returns:
            Updated Incident

        Raises:
            IncidentNotFoundError: If incident not found
        """
        current = await self.get_incident(workspace_id, incident_id)

        now = datetime.now(timezone.utc)

        await self._repository.add_incident_timeline_event(
            workspace_id=workspace_id,
            incident_id=incident_id,
            event="evidence_preserved",
            occurred_at=now,
            description=f"Evidence preserved at {evidence_location}",
            actor_user_id=preserved_by_user_id,
            metadata={
                "location": evidence_location,
                "legal_hold_id": str(legal_hold_id) if legal_hold_id else None,
            },
        )

        record = await self._repository.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            evidence_preserved=True,
            evidence_location=evidence_location,
            legal_hold_id=legal_hold_id,
            changed_by_user_id=preserved_by_user_id,
        )

        if not record:
            raise IncidentNotFoundError(incident_id)

        await self._audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            actor_user_id=preserved_by_user_id,
            target_entity_type="incident",
            target_entity_id=incident_id,
            details={
                "action": "evidence_preserved",
                "incident_number": current.incident_number,
                "evidence_location": evidence_location,
                "legal_hold_id": str(legal_hold_id) if legal_hold_id else None,
            },
        )

        logger.info(
            "Evidence preserved for incident",
            extra={
                "incident_id": str(incident_id),
                "incident_number": current.incident_number,
                "workspace_id": str(workspace_id),
                "evidence_location": evidence_location,
            },
        )

        return self._dict_to_incident(record)

    # =========================================================================
    # STATISTICS AND REPORTING
    # =========================================================================

    async def get_stats(
        self,
        workspace_id: UUID,
    ) -> IncidentStats:
        """Get statistics for incidents.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            IncidentStats with counts and metrics
        """
        # Get all incidents for stats calculation
        all_incidents = await self._repository.list_incidents(
            workspace_id=workspace_id,
            page=1,
            limit=10000,  # Get all for stats
        )

        items = all_incidents["items"]
        now = datetime.now(timezone.utc)

        total = len(items)
        open_statuses = {
            "detected", "confirmed", "investigating", "containing",
            "contained", "eradicating", "eradicated", "recovering",
            "recovered", "escalated",
        }
        closed_statuses = {"closed", "false_positive", "duplicate"}

        open_count = sum(1 for i in items if i.get("status") in open_statuses)
        resolved = sum(1 for i in items if i.get("status") == "resolved")
        closed = sum(1 for i in items if i.get("status") in closed_statuses)
        data_breaches = sum(1 for i in items if i.get("is_data_breach"))

        # Count pending and overdue notifications
        pending_notification = 0
        overdue_notification = 0

        for item in items:
            if item.get("requires_notification") and not item.get("authority_notified_at"):
                deadline = item.get("notification_deadline_at")
                if deadline:
                    if isinstance(deadline, str):
                        deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
                    if deadline < now:
                        overdue_notification += 1
                    else:
                        pending_notification += 1

        critical_severity = sum(1 for i in items if i.get("severity") == "critical")
        high_severity = sum(1 for i in items if i.get("severity") == "high")

        # Calculate average resolution time
        resolution_times = []
        for item in items:
            if item.get("resolved_at") and item.get("detected_at"):
                detected_at = item["detected_at"]
                resolved_at = item["resolved_at"]
                if isinstance(detected_at, str):
                    detected_at = datetime.fromisoformat(detected_at.replace("Z", "+00:00"))
                if isinstance(resolved_at, str):
                    resolved_at = datetime.fromisoformat(resolved_at.replace("Z", "+00:00"))
                delta = resolved_at - detected_at
                resolution_times.append(delta.total_seconds() / 3600)

        avg_resolution = (
            sum(resolution_times) / len(resolution_times)
            if resolution_times
            else 0.0
        )

        return IncidentStats(
            total=total,
            open=open_count,
            resolved=resolved,
            closed=closed,
            data_breaches=data_breaches,
            pending_notification=pending_notification,
            overdue_notification=overdue_notification,
            critical_severity=critical_severity,
            high_severity=high_severity,
            average_resolution_hours=avg_resolution,
        )

    async def get_open_incidents(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
    ) -> IncidentListResult:
        """Get all open incidents.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page

        Returns:
            IncidentListResult with open incidents
        """
        return await self.list_incidents(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            open_only=True,
        )

    async def get_data_breaches(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
    ) -> IncidentListResult:
        """Get all data breach incidents.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page

        Returns:
            IncidentListResult with data breaches
        """
        return await self.list_incidents(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            is_data_breach=True,
        )

    async def get_pending_notifications(
        self,
        workspace_id: UUID,
    ) -> list[IncidentSummary]:
        """Get data breaches with pending authority notification.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            List of incidents pending notification
        """
        from app.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM incidents
                WHERE workspace_id = $1
                  AND requires_notification = TRUE
                  AND authority_notified_at IS NULL
                  AND status NOT IN ('closed', 'false_positive', 'duplicate')
                ORDER BY notification_deadline_at ASC
                """,
                workspace_id,
            )
            return [self._dict_to_incident_summary(self._row_to_dict(row)) for row in rows]

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    def _validate_status_transition(
        self,
        current_status: IncidentStatus,
        target_status: IncidentStatus,
    ) -> None:
        """Validate that a status transition is allowed.

        Args:
            current_status: Current status of the incident
            target_status: Target status to transition to

        Raises:
            IncidentInvalidStatusTransitionError: If transition is not allowed
        """
        allowed = VALID_STATUS_TRANSITIONS.get(current_status, [])
        if target_status not in allowed:
            raise IncidentInvalidStatusTransitionError(
                current_status.value,
                target_status.value,
            )

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if hasattr(row, "_asdict"):
            return dict(row._asdict())
        return dict(row)

    def _dict_to_incident(self, record: dict[str, Any]) -> Incident:
        """Convert a database record to an Incident model.

        Args:
            record: Database record as dict

        Returns:
            Incident model instance
        """
        # Parse datetime fields if they are strings
        def parse_dt(val):
            if val is None:
                return None
            if isinstance(val, str):
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            return val

        return Incident(
            incident_id=record["incident_id"],
            workspace_id=record["workspace_id"],
            incident_number=record["incident_number"],
            title=record["title"],
            description=record["description"],
            incident_type=IncidentType(record["incident_type"]),
            category=IncidentCategory(record.get("category", "security")),
            severity=IncidentSeverity(record.get("severity", "medium")),
            impact=IncidentImpact(record.get("impact", "medium")),
            urgency=IncidentUrgency(record.get("urgency", "medium")),
            priority=IncidentPriority(record.get("priority", "medium")),
            status=IncidentStatus(record["status"]),
            status_reason=record.get("status_reason"),
            detected_at=parse_dt(record["detected_at"]),
            detected_by_user_id=record.get("detected_by_user_id"),
            detection_method=IncidentDetectionMethod(record.get("detection_method", "manual")),
            detection_source=record.get("detection_source"),
            affected_users_count=record.get("affected_users_count", 0),
            affected_resources_count=record.get("affected_resources_count", 0),
            affected_data_categories=record.get("affected_data_categories", []),
            affected_systems=record.get("affected_systems", []),
            geographic_scope=record.get("geographic_scope", []),
            is_data_breach=record.get("is_data_breach", False),
            personal_data_involved=record.get("personal_data_involved", False),
            data_subjects_count=record.get("data_subjects_count"),
            data_categories_affected=record.get("data_categories_affected", []),
            breach_type=IncidentBreachType(record["breach_type"]) if record.get("breach_type") else None,
            requires_notification=record.get("requires_notification", False),
            notification_deadline_at=parse_dt(record.get("notification_deadline_at")),
            authority_notified_at=parse_dt(record.get("authority_notified_at")),
            authority_notification_reference=record.get("authority_notification_reference"),
            subjects_notified_at=parse_dt(record.get("subjects_notified_at")),
            subjects_notification_count=record.get("subjects_notification_count"),
            assigned_to_user_id=record.get("assigned_to_user_id"),
            incident_commander_id=record.get("incident_commander_id"),
            team_members=record.get("team_members", []),
            investigation_started_at=parse_dt(record.get("investigation_started_at")),
            investigation_completed_at=parse_dt(record.get("investigation_completed_at")),
            root_cause=record.get("root_cause"),
            root_cause_category=IncidentRootCauseCategory(record["root_cause_category"]) if record.get("root_cause_category") else None,
            attack_vector=record.get("attack_vector"),
            threat_actor_type=IncidentThreatActorType(record["threat_actor_type"]) if record.get("threat_actor_type") else None,
            containment_started_at=parse_dt(record.get("containment_started_at")),
            containment_completed_at=parse_dt(record.get("containment_completed_at")),
            containment_actions=record.get("containment_actions", []),
            eradication_started_at=parse_dt(record.get("eradication_started_at")),
            eradication_completed_at=parse_dt(record.get("eradication_completed_at")),
            eradication_actions=record.get("eradication_actions", []),
            recovery_started_at=parse_dt(record.get("recovery_started_at")),
            recovery_completed_at=parse_dt(record.get("recovery_completed_at")),
            recovery_actions=record.get("recovery_actions", []),
            resolved_at=parse_dt(record.get("resolved_at")),
            resolution_summary=record.get("resolution_summary"),
            resolution_type=IncidentResolutionType(record["resolution_type"]) if record.get("resolution_type") else None,
            post_incident_review_at=parse_dt(record.get("post_incident_review_at")),
            lessons_learned=record.get("lessons_learned"),
            recommendations=record.get("recommendations", []),
            follow_up_actions=record.get("follow_up_actions", []),
            evidence_preserved=record.get("evidence_preserved", False),
            evidence_location=record.get("evidence_location"),
            legal_hold_id=record.get("legal_hold_id"),
            related_incident_ids=record.get("related_incident_ids", []),
            related_dsr_ids=record.get("related_dsr_ids", []),
            external_ticket_id=record.get("external_ticket_id"),
            external_ticket_url=record.get("external_ticket_url"),
            insurance_claim_id=record.get("insurance_claim_id"),
            communications=record.get("communications", []),
            timeline=record.get("timeline", []),
            internal_notes=record.get("internal_notes"),
            status_history=record.get("status_history", []),
            metadata=record.get("metadata", {}),
            reporter_ip_address=record.get("reporter_ip_address"),
            reporter_user_agent=record.get("reporter_user_agent"),
            created_at=parse_dt(record["created_at"]),
            updated_at=parse_dt(record["updated_at"]),
            closed_at=parse_dt(record.get("closed_at")),
        )

    def _dict_to_incident_summary(self, record: dict[str, Any]) -> IncidentSummary:
        """Convert a database record to an IncidentSummary model.

        Args:
            record: Database record as dict

        Returns:
            IncidentSummary model instance
        """
        def parse_dt(val):
            if val is None:
                return None
            if isinstance(val, str):
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            return val

        return IncidentSummary(
            incident_id=record["incident_id"],
            workspace_id=record["workspace_id"],
            incident_number=record["incident_number"],
            title=record["title"],
            incident_type=IncidentType(record["incident_type"]),
            category=IncidentCategory(record.get("category", "security")),
            severity=IncidentSeverity(record.get("severity", "medium")),
            priority=IncidentPriority(record.get("priority", "medium")),
            status=IncidentStatus(record["status"]),
            detected_at=parse_dt(record["detected_at"]),
            is_data_breach=record.get("is_data_breach", False),
            requires_notification=record.get("requires_notification", False),
        )

    def _dict_to_incident_update(self, record: dict[str, Any]) -> IncidentTimelineUpdate:
        """Convert a database record to an IncidentTimelineUpdate model.

        Args:
            record: Database record as dict

        Returns:
            IncidentTimelineUpdate model instance
        """
        def parse_dt(val):
            if val is None:
                return None
            if isinstance(val, str):
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            return val

        return IncidentTimelineUpdate(
            update_id=record["update_id"],
            incident_id=record["incident_id"],
            workspace_id=record["workspace_id"],
            update_type=IncidentUpdateType(record.get("update_type", "general")),
            title=record.get("title"),
            content=record["content"],
            previous_status=record.get("previous_status"),
            new_status=record.get("new_status"),
            visibility=IncidentUpdateVisibility(record.get("visibility", "internal")),
            is_public=record.get("is_public", False),
            created_by_user_id=record["created_by_user_id"],
            attachments=record.get("attachments", []),
            metadata=record.get("metadata", {}),
            created_at=parse_dt(record["created_at"]),
        )

    def _dict_to_affected_resource(self, record: dict[str, Any]) -> IncidentAffectedResource:
        """Convert a database record to an IncidentAffectedResource model.

        Args:
            record: Database record as dict

        Returns:
            IncidentAffectedResource model instance
        """
        def parse_dt(val):
            if val is None:
                return None
            if isinstance(val, str):
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            return val

        return IncidentAffectedResource(
            id=record["id"],
            incident_id=record["incident_id"],
            workspace_id=record["workspace_id"],
            resource_type=record["resource_type"],
            resource_id=record["resource_id"],
            resource_name=record.get("resource_name"),
            user_id=record.get("user_id"),
            impact_type=IncidentResourceImpactType(record.get("impact_type", "affected")),
            impact_description=record.get("impact_description"),
            data_classification=IncidentDataClassification(record["data_classification"]) if record.get("data_classification") else None,
            contains_pii=record.get("contains_pii", False),
            contains_sensitive_data=record.get("contains_sensitive_data", False),
            identified_at=parse_dt(record["identified_at"]),
            remediated_at=parse_dt(record.get("remediated_at")),
            remediation_status=IncidentRemediationStatus(record.get("remediation_status", "pending")),
            remediation_notes=record.get("remediation_notes"),
            metadata=record.get("metadata", {}),
        )


# =============================================================================
# FACTORY FUNCTION
# =============================================================================


_incident_service: Optional[IncidentService] = None


def get_incident_service() -> IncidentService:
    """Get the singleton incident service instance.

    Returns:
        IncidentService instance
    """
    global _incident_service
    if _incident_service is None:
        _incident_service = IncidentService()
    return _incident_service
