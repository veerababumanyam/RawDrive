"""Incidents API endpoints for security and compliance incident management.

Provides endpoints for managing security incidents and data breaches:
- Create new incidents
- List and filter incidents
- View incident details
- Update incidents
- Lifecycle management (confirm, investigate, contain, resolve, close)
- GDPR 72-hour notification deadline tracking
- Affected resource management
- Timeline updates management
- Get incident statistics

All routes prefixed with /api/v1/workspaces/{workspace_id}/incidents.
Implements Audit & Compliance System requirements.

Feature: Audit & Compliance System
Task: T014 - Create incidents API endpoints
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status, Response
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import PaginatedResponse
from app.models.compliance import (
    Incident,
    IncidentAffectedResource,
    IncidentBreachType,
    IncidentCategory,
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
from app.services.incident_service import (
    IncidentAlreadyClosedError,
    IncidentAlreadyResolvedError,
    IncidentError,
    IncidentInvalidStatusTransitionError,
    IncidentNotFoundError,
    IncidentService,
    IncidentAffectedResourceNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class CreateIncidentRequest(BaseModel):
    """Request to create a new incident."""

    title: str = Field(..., min_length=1, max_length=255, description="Incident title")
    description: str = Field(..., min_length=10, description="Detailed description of the incident")
    incident_type: IncidentType = Field(..., description="Type of incident")
    category: IncidentCategory = Field(IncidentCategory.SECURITY, description="Incident category")
    severity: IncidentSeverity = Field(IncidentSeverity.MEDIUM, description="Incident severity")
    impact: IncidentImpact = Field(IncidentImpact.MEDIUM, description="Business impact")
    urgency: IncidentUrgency = Field(IncidentUrgency.MEDIUM, description="Response urgency")
    detected_at: Optional[datetime] = Field(None, description="When incident was detected (defaults to now)")
    detection_method: IncidentDetectionMethod = Field(
        IncidentDetectionMethod.MANUAL,
        description="How incident was detected"
    )
    detection_source: Optional[str] = Field(None, max_length=100, description="Source of detection")
    is_data_breach: bool = Field(False, description="Is this a data breach")
    personal_data_involved: bool = Field(False, description="Is personal data involved")
    assigned_to_user_id: Optional[UUID] = Field(None, description="User to assign the incident to")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class UpdateIncidentRequest(BaseModel):
    """Request to update an incident."""

    title: Optional[str] = Field(None, min_length=1, max_length=255, description="Incident title")
    description: Optional[str] = Field(None, description="Detailed description")
    severity: Optional[IncidentSeverity] = Field(None, description="Incident severity")
    impact: Optional[IncidentImpact] = Field(None, description="Business impact")
    urgency: Optional[IncidentUrgency] = Field(None, description="Response urgency")
    priority: Optional[IncidentPriority] = Field(None, description="Calculated priority")
    status: Optional[IncidentStatus] = Field(None, description="New status")
    status_reason: Optional[str] = Field(None, description="Reason for status change")
    assigned_to_user_id: Optional[UUID] = Field(None, description="Assigned handler")
    incident_commander_id: Optional[UUID] = Field(None, description="Incident commander")
    team_members: Optional[list[dict[str, Any]]] = Field(None, description="Team member assignments")
    affected_users_count: Optional[int] = Field(None, ge=0, description="Number of users affected")
    affected_resources_count: Optional[int] = Field(None, ge=0, description="Number of resources affected")
    affected_data_categories: Optional[list[str]] = Field(None, description="Data categories affected")
    affected_systems: Optional[list[str]] = Field(None, description="Systems affected")
    is_data_breach: Optional[bool] = Field(None, description="Is this a data breach")
    personal_data_involved: Optional[bool] = Field(None, description="Is personal data involved")
    data_subjects_count: Optional[int] = Field(None, ge=0, description="Number of data subjects affected")
    data_categories_affected: Optional[list[str]] = Field(None, description="Personal data categories affected")
    breach_type: Optional[IncidentBreachType] = Field(None, description="Type of breach per GDPR")
    requires_notification: Optional[bool] = Field(None, description="Requires regulatory notification")
    root_cause: Optional[str] = Field(None, description="Root cause analysis")
    root_cause_category: Optional[IncidentRootCauseCategory] = Field(None, description="Root cause category")
    attack_vector: Optional[str] = Field(None, max_length=100, description="Attack vector used")
    threat_actor_type: Optional[IncidentThreatActorType] = Field(None, description="Type of threat actor")
    containment_actions: Optional[list[dict[str, Any]]] = Field(None, description="Containment actions taken")
    eradication_actions: Optional[list[dict[str, Any]]] = Field(None, description="Eradication actions taken")
    recovery_actions: Optional[list[dict[str, Any]]] = Field(None, description="Recovery actions taken")
    resolution_summary: Optional[str] = Field(None, description="Summary of resolution")
    resolution_type: Optional[IncidentResolutionType] = Field(None, description="Type of resolution")
    lessons_learned: Optional[str] = Field(None, description="Lessons learned from incident")
    recommendations: Optional[list[dict[str, Any]]] = Field(None, description="Post-incident recommendations")
    follow_up_actions: Optional[list[dict[str, Any]]] = Field(None, description="Follow-up actions")
    evidence_preserved: Optional[bool] = Field(None, description="Evidence has been preserved")
    evidence_location: Optional[str] = Field(None, max_length=500, description="Location of evidence")
    legal_hold_id: Optional[UUID] = Field(None, description="Associated legal hold")
    external_ticket_id: Optional[str] = Field(None, max_length=100, description="External ticket ID")
    external_ticket_url: Optional[str] = Field(None, max_length=500, description="External ticket URL")
    internal_notes: Optional[str] = Field(None, description="Internal notes")
    metadata: Optional[dict[str, Any]] = Field(None, description="Additional metadata")


class ConfirmIncidentRequest(BaseModel):
    """Request to confirm an incident."""

    confirmation_notes: Optional[str] = Field(None, description="Confirmation notes")


class InvestigateIncidentRequest(BaseModel):
    """Request to start investigation."""

    investigation_notes: Optional[str] = Field(None, description="Investigation notes")


class ContainmentRequest(BaseModel):
    """Request to start or complete containment."""

    notes: Optional[str] = Field(None, description="Containment notes")
    actions: list[dict[str, Any]] = Field(default_factory=list, description="Containment actions taken")


class EradicationRequest(BaseModel):
    """Request to start or complete eradication."""

    notes: Optional[str] = Field(None, description="Eradication notes")
    actions: list[dict[str, Any]] = Field(default_factory=list, description="Eradication actions taken")


class RecoveryRequest(BaseModel):
    """Request to start or complete recovery."""

    notes: Optional[str] = Field(None, description="Recovery notes")
    actions: list[dict[str, Any]] = Field(default_factory=list, description="Recovery actions taken")


class ResolveIncidentRequest(BaseModel):
    """Request to resolve an incident."""

    resolution_summary: str = Field(..., min_length=10, description="Summary of resolution")
    resolution_type: IncidentResolutionType = Field(..., description="Type of resolution")
    lessons_learned: Optional[str] = Field(None, description="Lessons learned")


class CloseIncidentRequest(BaseModel):
    """Request to close an incident."""

    closing_notes: Optional[str] = Field(None, description="Closing notes")


class MarkAsFalsePositiveRequest(BaseModel):
    """Request to mark an incident as false positive."""

    reason: str = Field(..., min_length=10, description="Reason for marking as false positive")


class MarkAsDuplicateRequest(BaseModel):
    """Request to mark an incident as duplicate."""

    original_incident_id: UUID = Field(..., description="ID of the original incident")
    notes: Optional[str] = Field(None, description="Notes about the duplicate")


class EscalateIncidentRequest(BaseModel):
    """Request to escalate an incident."""

    escalation_reason: str = Field(..., min_length=10, description="Reason for escalation")
    escalate_to_user_id: Optional[UUID] = Field(None, description="User to escalate to")


class RecordNotificationRequest(BaseModel):
    """Request to record regulatory notification."""

    notification_type: str = Field(..., description="Type: 'authority' or 'subjects'")
    reference: Optional[str] = Field(None, max_length=100, description="Notification reference")
    count: Optional[int] = Field(None, ge=0, description="Number of subjects notified (for subject notifications)")
    notes: Optional[str] = Field(None, description="Notification notes")


class AddAffectedResourceRequest(BaseModel):
    """Request to add an affected resource."""

    resource_type: str = Field(..., max_length=50, description="Type of resource")
    resource_id: UUID = Field(..., description="ID of the resource")
    resource_name: Optional[str] = Field(None, max_length=255, description="Name of the resource")
    user_id: Optional[UUID] = Field(None, description="User associated with the resource")
    impact_type: IncidentResourceImpactType = Field(
        IncidentResourceImpactType.AFFECTED,
        description="Type of impact"
    )
    impact_description: Optional[str] = Field(None, description="Description of impact")
    data_classification: Optional[IncidentDataClassification] = Field(None, description="Data classification")
    contains_pii: bool = Field(False, description="Contains PII")
    contains_sensitive_data: bool = Field(False, description="Contains sensitive data")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class UpdateAffectedResourceRequest(BaseModel):
    """Request to update an affected resource."""

    impact_type: Optional[IncidentResourceImpactType] = Field(None, description="Type of impact")
    impact_description: Optional[str] = Field(None, description="Description of impact")
    data_classification: Optional[IncidentDataClassification] = Field(None, description="Data classification")
    contains_pii: Optional[bool] = Field(None, description="Contains PII")
    contains_sensitive_data: Optional[bool] = Field(None, description="Contains sensitive data")
    remediation_status: Optional[IncidentRemediationStatus] = Field(None, description="Remediation status")
    remediation_notes: Optional[str] = Field(None, description="Remediation notes")
    metadata: Optional[dict[str, Any]] = Field(None, description="Additional metadata")


class AddTimelineUpdateRequest(BaseModel):
    """Request to add a timeline update."""

    update_type: IncidentUpdateType = Field(IncidentUpdateType.GENERAL, description="Type of update")
    title: Optional[str] = Field(None, max_length=255, description="Update title")
    content: str = Field(..., min_length=1, description="Update content")
    visibility: IncidentUpdateVisibility = Field(
        IncidentUpdateVisibility.INTERNAL,
        description="Visibility level"
    )
    is_public: bool = Field(False, description="Is publicly visible")
    attachments: list[dict[str, Any]] = Field(default_factory=list, description="Attached files/evidence")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


# Response Schemas


class IncidentResponse(BaseModel):
    """Full incident response."""

    incident_id: UUID
    workspace_id: UUID
    incident_number: str
    title: str
    description: str
    incident_type: IncidentType
    category: IncidentCategory
    severity: IncidentSeverity
    impact: IncidentImpact
    urgency: IncidentUrgency
    priority: IncidentPriority
    status: IncidentStatus
    status_reason: Optional[str] = None
    detected_at: datetime
    detected_by_user_id: Optional[UUID] = None
    detection_method: IncidentDetectionMethod
    detection_source: Optional[str] = None
    affected_users_count: int = 0
    affected_resources_count: int = 0
    affected_data_categories: list[str] = Field(default_factory=list)
    affected_systems: list[str] = Field(default_factory=list)
    geographic_scope: list[str] = Field(default_factory=list)
    is_data_breach: bool = False
    personal_data_involved: bool = False
    data_subjects_count: Optional[int] = None
    data_categories_affected: list[str] = Field(default_factory=list)
    breach_type: Optional[IncidentBreachType] = None
    requires_notification: bool = False
    notification_deadline_at: Optional[datetime] = None
    authority_notified_at: Optional[datetime] = None
    authority_notification_reference: Optional[str] = None
    subjects_notified_at: Optional[datetime] = None
    subjects_notification_count: Optional[int] = None
    assigned_to_user_id: Optional[UUID] = None
    incident_commander_id: Optional[UUID] = None
    team_members: list[dict[str, Any]] = Field(default_factory=list)
    investigation_started_at: Optional[datetime] = None
    investigation_completed_at: Optional[datetime] = None
    root_cause: Optional[str] = None
    root_cause_category: Optional[IncidentRootCauseCategory] = None
    attack_vector: Optional[str] = None
    threat_actor_type: Optional[IncidentThreatActorType] = None
    containment_started_at: Optional[datetime] = None
    containment_completed_at: Optional[datetime] = None
    containment_actions: list[dict[str, Any]] = Field(default_factory=list)
    eradication_started_at: Optional[datetime] = None
    eradication_completed_at: Optional[datetime] = None
    eradication_actions: list[dict[str, Any]] = Field(default_factory=list)
    recovery_started_at: Optional[datetime] = None
    recovery_completed_at: Optional[datetime] = None
    recovery_actions: list[dict[str, Any]] = Field(default_factory=list)
    resolved_at: Optional[datetime] = None
    resolution_summary: Optional[str] = None
    resolution_type: Optional[IncidentResolutionType] = None
    post_incident_review_at: Optional[datetime] = None
    lessons_learned: Optional[str] = None
    recommendations: list[dict[str, Any]] = Field(default_factory=list)
    follow_up_actions: list[dict[str, Any]] = Field(default_factory=list)
    evidence_preserved: bool = False
    evidence_location: Optional[str] = None
    legal_hold_id: Optional[UUID] = None
    related_incident_ids: list[str] = Field(default_factory=list)
    related_dsr_ids: list[str] = Field(default_factory=list)
    external_ticket_id: Optional[str] = None
    external_ticket_url: Optional[str] = None
    insurance_claim_id: Optional[str] = None
    communications: list[dict[str, Any]] = Field(default_factory=list)
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    internal_notes: Optional[str] = None
    status_history: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None


class IncidentSummaryResponse(BaseModel):
    """Lightweight incident summary."""

    incident_id: UUID
    workspace_id: UUID
    incident_number: str
    title: str
    incident_type: IncidentType
    category: IncidentCategory
    severity: IncidentSeverity
    priority: IncidentPriority
    status: IncidentStatus
    detected_at: datetime
    is_data_breach: bool = False
    requires_notification: bool = False


class IncidentListResponse(PaginatedResponse):
    """Paginated list of incidents."""

    items: list[IncidentSummaryResponse]


class AffectedResourceResponse(BaseModel):
    """Affected resource response."""

    id: UUID
    incident_id: UUID
    workspace_id: UUID
    resource_type: str
    resource_id: UUID
    resource_name: Optional[str] = None
    user_id: Optional[UUID] = None
    impact_type: IncidentResourceImpactType
    impact_description: Optional[str] = None
    data_classification: Optional[IncidentDataClassification] = None
    contains_pii: bool = False
    contains_sensitive_data: bool = False
    identified_at: datetime
    remediated_at: Optional[datetime] = None
    remediation_status: IncidentRemediationStatus
    remediation_notes: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AffectedResourceListResponse(PaginatedResponse):
    """Paginated list of affected resources."""

    items: list[AffectedResourceResponse]


class TimelineUpdateResponse(BaseModel):
    """Timeline update response."""

    update_id: UUID
    incident_id: UUID
    workspace_id: UUID
    update_type: IncidentUpdateType
    title: Optional[str] = None
    content: str
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    visibility: IncidentUpdateVisibility
    is_public: bool = False
    created_by_user_id: UUID
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class TimelineUpdateListResponse(PaginatedResponse):
    """Paginated list of timeline updates."""

    items: list[TimelineUpdateResponse]


class IncidentStatsResponse(BaseModel):
    """Incident statistics response."""

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


class NotificationDeadlineResponse(BaseModel):
    """Notification deadline status response."""

    requires_notification: bool
    deadline_at: Optional[datetime] = None
    hours_remaining: Optional[float] = None
    is_overdue: bool
    authority_notified: bool
    subjects_notified: bool


class IncidentTypesResponse(BaseModel):
    """Available incident types."""

    incident_types: list[dict[str, str]]


class IncidentStatusesResponse(BaseModel):
    """Available incident statuses."""

    statuses: list[dict[str, str]]


class IncidentSeveritiesResponse(BaseModel):
    """Available incident severities."""

    severities: list[dict[str, str]]


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def _get_incident_service() -> IncidentService:
    """Get incident service instance."""
    return IncidentService()


IncidentServiceDep = Annotated[IncidentService, Depends(_get_incident_service)]


def _model_to_response(model: Incident) -> IncidentResponse:
    """Convert an Incident model to a response."""
    return IncidentResponse(
        incident_id=model.incident_id,
        workspace_id=model.workspace_id,
        incident_number=model.incident_number,
        title=model.title,
        description=model.description,
        incident_type=model.incident_type,
        category=model.category,
        severity=model.severity,
        impact=model.impact,
        urgency=model.urgency,
        priority=model.priority,
        status=model.status,
        status_reason=model.status_reason,
        detected_at=model.detected_at,
        detected_by_user_id=model.detected_by_user_id,
        detection_method=model.detection_method,
        detection_source=model.detection_source,
        affected_users_count=model.affected_users_count,
        affected_resources_count=model.affected_resources_count,
        affected_data_categories=model.affected_data_categories,
        affected_systems=model.affected_systems,
        geographic_scope=model.geographic_scope,
        is_data_breach=model.is_data_breach,
        personal_data_involved=model.personal_data_involved,
        data_subjects_count=model.data_subjects_count,
        data_categories_affected=model.data_categories_affected,
        breach_type=model.breach_type,
        requires_notification=model.requires_notification,
        notification_deadline_at=model.notification_deadline_at,
        authority_notified_at=model.authority_notified_at,
        authority_notification_reference=model.authority_notification_reference,
        subjects_notified_at=model.subjects_notified_at,
        subjects_notification_count=model.subjects_notification_count,
        assigned_to_user_id=model.assigned_to_user_id,
        incident_commander_id=model.incident_commander_id,
        team_members=model.team_members,
        investigation_started_at=model.investigation_started_at,
        investigation_completed_at=model.investigation_completed_at,
        root_cause=model.root_cause,
        root_cause_category=model.root_cause_category,
        attack_vector=model.attack_vector,
        threat_actor_type=model.threat_actor_type,
        containment_started_at=model.containment_started_at,
        containment_completed_at=model.containment_completed_at,
        containment_actions=model.containment_actions,
        eradication_started_at=model.eradication_started_at,
        eradication_completed_at=model.eradication_completed_at,
        eradication_actions=model.eradication_actions,
        recovery_started_at=model.recovery_started_at,
        recovery_completed_at=model.recovery_completed_at,
        recovery_actions=model.recovery_actions,
        resolved_at=model.resolved_at,
        resolution_summary=model.resolution_summary,
        resolution_type=model.resolution_type,
        post_incident_review_at=model.post_incident_review_at,
        lessons_learned=model.lessons_learned,
        recommendations=model.recommendations,
        follow_up_actions=model.follow_up_actions,
        evidence_preserved=model.evidence_preserved,
        evidence_location=model.evidence_location,
        legal_hold_id=model.legal_hold_id,
        related_incident_ids=model.related_incident_ids,
        related_dsr_ids=model.related_dsr_ids,
        external_ticket_id=model.external_ticket_id,
        external_ticket_url=model.external_ticket_url,
        insurance_claim_id=model.insurance_claim_id,
        communications=model.communications,
        timeline=model.timeline,
        internal_notes=model.internal_notes,
        status_history=model.status_history,
        metadata=model.metadata,
        created_at=model.created_at,
        updated_at=model.updated_at,
        closed_at=model.closed_at,
    )


def _summary_to_response(summary: IncidentSummary) -> IncidentSummaryResponse:
    """Convert an IncidentSummary to a response."""
    return IncidentSummaryResponse(
        incident_id=summary.incident_id,
        workspace_id=summary.workspace_id,
        incident_number=summary.incident_number,
        title=summary.title,
        incident_type=summary.incident_type,
        category=summary.category,
        severity=summary.severity,
        priority=summary.priority,
        status=summary.status,
        detected_at=summary.detected_at,
        is_data_breach=summary.is_data_breach,
        requires_notification=summary.requires_notification,
    )


def _affected_resource_to_response(resource: IncidentAffectedResource) -> AffectedResourceResponse:
    """Convert an IncidentAffectedResource to a response."""
    return AffectedResourceResponse(
        id=resource.id,
        incident_id=resource.incident_id,
        workspace_id=resource.workspace_id,
        resource_type=resource.resource_type,
        resource_id=resource.resource_id,
        resource_name=resource.resource_name,
        user_id=resource.user_id,
        impact_type=resource.impact_type,
        impact_description=resource.impact_description,
        data_classification=resource.data_classification,
        contains_pii=resource.contains_pii,
        contains_sensitive_data=resource.contains_sensitive_data,
        identified_at=resource.identified_at,
        remediated_at=resource.remediated_at,
        remediation_status=resource.remediation_status,
        remediation_notes=resource.remediation_notes,
        metadata=resource.metadata,
    )


def _timeline_update_to_response(update: IncidentTimelineUpdate) -> TimelineUpdateResponse:
    """Convert an IncidentTimelineUpdate to a response."""
    return TimelineUpdateResponse(
        update_id=update.update_id,
        incident_id=update.incident_id,
        workspace_id=update.workspace_id,
        update_type=update.update_type,
        title=update.title,
        content=update.content,
        previous_status=update.previous_status,
        new_status=update.new_status,
        visibility=update.visibility,
        is_public=update.is_public,
        created_by_user_id=update.created_by_user_id,
        attachments=update.attachments,
        metadata=update.metadata,
        created_at=update.created_at,
    )


def _handle_incident_error(error: IncidentError) -> HTTPException:
    """Convert an IncidentError to an HTTPException."""
    return HTTPException(
        status_code=error.status,
        detail={"code": error.code, "message": str(error)},
    )


# ---------------------------------------------------------------------------
# List Endpoints (Static routes first)
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=IncidentListResponse,
    summary="List incidents",
    description="""
    List incidents with filtering and pagination.

    Supports filtering by status, incident type, severity, and data breach status.
    """,
    responses={
        200: {"description": "List of incidents"},
        403: {"description": "Access denied"},
    },
)
async def list_incidents(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    status_filter: Annotated[
        IncidentStatus | None, Query(alias="status", description="Filter by status")
    ] = None,
    incident_type: Annotated[
        IncidentType | None, Query(description="Filter by incident type")
    ] = None,
    severity: Annotated[
        IncidentSeverity | None, Query(description="Filter by severity")
    ] = None,
    is_data_breach: Annotated[
        bool | None, Query(description="Filter by data breach status")
    ] = None,
    open_only: Annotated[
        bool, Query(description="Only return open incidents")
    ] = False,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> IncidentListResponse:
    """List incidents with filtering and pagination."""
    result = await incident_service.list_incidents(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        status=status_filter,
        incident_type=incident_type,
        severity=severity,
        is_data_breach=is_data_breach,
        open_only=open_only,
    )

    items = [_summary_to_response(item) for item in result.items]

    logger.info(
        "incidents_listed",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "result_count": len(items),
            "total": result.total,
        },
    )

    return IncidentListResponse(
        items=items,
        total=result.total,
        page=result.page,
        per_page=result.limit,
        total_pages=result.total_pages,
    )


@router.get(
    "/stats",
    response_model=IncidentStatsResponse,
    summary="Get incident statistics",
    description="Get aggregated statistics for incidents.",
)
async def get_incident_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
) -> IncidentStatsResponse:
    """Get incident statistics."""
    stats = await incident_service.get_stats(workspace_id)

    return IncidentStatsResponse(
        total=stats.total,
        open=stats.open,
        resolved=stats.resolved,
        closed=stats.closed,
        data_breaches=stats.data_breaches,
        pending_notification=stats.pending_notification,
        overdue_notification=stats.overdue_notification,
        critical_severity=stats.critical_severity,
        high_severity=stats.high_severity,
        average_resolution_hours=stats.average_resolution_hours,
    )


@router.get(
    "/open",
    response_model=IncidentListResponse,
    summary="List open incidents",
    description="List only open (non-resolved, non-closed) incidents.",
)
async def list_open_incidents(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> IncidentListResponse:
    """List open incidents."""
    result = await incident_service.list_incidents(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        open_only=True,
    )

    items = [_summary_to_response(item) for item in result.items]

    return IncidentListResponse(
        items=items,
        total=result.total,
        page=result.page,
        per_page=result.limit,
        total_pages=result.total_pages,
    )


@router.get(
    "/data-breaches",
    response_model=IncidentListResponse,
    summary="List data breach incidents",
    description="List only data breach incidents.",
)
async def list_data_breaches(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> IncidentListResponse:
    """List data breach incidents."""
    result = await incident_service.list_incidents(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        is_data_breach=True,
    )

    items = [_summary_to_response(item) for item in result.items]

    return IncidentListResponse(
        items=items,
        total=result.total,
        page=result.page,
        per_page=result.limit,
        total_pages=result.total_pages,
    )


@router.get(
    "/pending-notification",
    response_model=list[IncidentSummaryResponse],
    summary="List incidents pending notification",
    description="List data breach incidents that require regulatory notification but haven't been notified yet.",
)
async def list_pending_notification(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
) -> list[IncidentSummaryResponse]:
    """List incidents pending regulatory notification."""
    incidents = await incident_service.get_pending_notification_incidents(workspace_id)
    return [_summary_to_response(inc) for inc in incidents]


@router.get(
    "/incident-types",
    response_model=IncidentTypesResponse,
    summary="List available incident types",
    description="Get a list of all available incident types.",
)
async def list_incident_types(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> IncidentTypesResponse:
    """List all available incident types."""
    incident_types = [
        {"value": t.value, "label": t.value.replace("_", " ").title()}
        for t in IncidentType
    ]
    return IncidentTypesResponse(incident_types=incident_types)


@router.get(
    "/statuses",
    response_model=IncidentStatusesResponse,
    summary="List available statuses",
    description="Get a list of all available incident statuses.",
)
async def list_statuses(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> IncidentStatusesResponse:
    """List all available incident statuses."""
    statuses = [
        {"value": s.value, "label": s.value.replace("_", " ").title()}
        for s in IncidentStatus
    ]
    return IncidentStatusesResponse(statuses=statuses)


@router.get(
    "/severities",
    response_model=IncidentSeveritiesResponse,
    summary="List available severities",
    description="Get a list of all available incident severities.",
)
async def list_severities(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> IncidentSeveritiesResponse:
    """List all available incident severities."""
    severities = [
        {"value": s.value, "label": s.value.replace("_", " ").title()}
        for s in IncidentSeverity
    ]
    return IncidentSeveritiesResponse(severities=severities)


# ---------------------------------------------------------------------------
# Create Endpoint
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=IncidentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create incident",
    description="""
    Create a new security or compliance incident.

    For data breaches (is_data_breach=True), the system automatically:
    - Sets requires_notification=True if personal_data_involved=True
    - Calculates the GDPR 72-hour notification deadline
    - Tracks notification status for regulatory compliance

    Incident types:
    - data_breach: Unauthorized access to personal data
    - security_breach: Security system compromise
    - unauthorized_access: Unauthorized system/data access
    - malware: Malware/ransomware infection
    - phishing: Phishing attack
    - ddos: Denial of service attack
    - data_loss: Accidental data loss
    - policy_violation: Internal policy violation
    - compliance_failure: Regulatory compliance failure
    - And more...
    """,
    responses={
        201: {"description": "Incident created"},
        400: {"description": "Invalid request data"},
    },
)
async def create_incident(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: CreateIncidentRequest,
) -> IncidentResponse:
    """Create a new incident."""
    try:
        incident = await incident_service.create_incident(
            workspace_id=workspace_id,
            title=request_data.title,
            description=request_data.description,
            incident_type=request_data.incident_type,
            reported_by_user_id=current_user.user_id,
            category=request_data.category,
            severity=request_data.severity,
            impact=request_data.impact,
            urgency=request_data.urgency,
            detected_at=request_data.detected_at,
            detected_by_user_id=current_user.user_id,
            detection_method=request_data.detection_method,
            detection_source=request_data.detection_source,
            is_data_breach=request_data.is_data_breach,
            personal_data_involved=request_data.personal_data_involved,
            assigned_to_user_id=request_data.assigned_to_user_id,
            metadata=request_data.metadata,
        )

        logger.info(
            "incident_created",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident.incident_id),
                "incident_number": incident.incident_number,
                "incident_type": incident.incident_type.value,
                "created_by": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)

    except IncidentError as e:
        raise _handle_incident_error(e)


# ---------------------------------------------------------------------------
# Detail/Action Endpoints (Parameterized routes)
# ---------------------------------------------------------------------------


@router.get(
    "/by-number/{incident_number}",
    response_model=IncidentResponse,
    summary="Get incident by number",
    description="Get an incident by its human-readable number.",
    responses={
        200: {"description": "Incident details"},
        404: {"description": "Incident not found"},
    },
)
async def get_incident_by_number(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_number: Annotated[str, Path(..., description="Incident number (e.g., INC-2026-00001)")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
) -> IncidentResponse:
    """Get an incident by its number."""
    try:
        incident = await incident_service.get_incident_by_number(
            workspace_id=workspace_id,
            incident_number=incident_number,
        )
        return _model_to_response(incident)
    except IncidentNotFoundError as e:
        raise _handle_incident_error(e)


@router.get(
    "/{incident_id}",
    response_model=IncidentResponse,
    summary="Get incident",
    description="Get details of a specific incident.",
    responses={
        200: {"description": "Incident details"},
        404: {"description": "Incident not found"},
    },
)
async def get_incident(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
) -> IncidentResponse:
    """Get an incident by ID."""
    try:
        incident = await incident_service.get_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
        )

        logger.info(
            "incident_retrieved",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "user_id": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except IncidentNotFoundError as e:
        raise _handle_incident_error(e)


@router.patch(
    "/{incident_id}",
    response_model=IncidentResponse,
    summary="Update incident",
    description="Update an incident.",
    responses={
        200: {"description": "Incident updated"},
        400: {"description": "Invalid status transition or already closed"},
        404: {"description": "Incident not found"},
    },
)
async def update_incident(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: UpdateIncidentRequest,
) -> IncidentResponse:
    """Update an incident."""
    try:
        update = IncidentUpdate(
            title=request_data.title,
            description=request_data.description,
            severity=request_data.severity,
            impact=request_data.impact,
            urgency=request_data.urgency,
            priority=request_data.priority,
            status=request_data.status,
            status_reason=request_data.status_reason,
            assigned_to_user_id=request_data.assigned_to_user_id,
            incident_commander_id=request_data.incident_commander_id,
            team_members=request_data.team_members,
            affected_users_count=request_data.affected_users_count,
            affected_resources_count=request_data.affected_resources_count,
            affected_data_categories=request_data.affected_data_categories,
            affected_systems=request_data.affected_systems,
            is_data_breach=request_data.is_data_breach,
            personal_data_involved=request_data.personal_data_involved,
            data_subjects_count=request_data.data_subjects_count,
            data_categories_affected=request_data.data_categories_affected,
            breach_type=request_data.breach_type,
            requires_notification=request_data.requires_notification,
            root_cause=request_data.root_cause,
            root_cause_category=request_data.root_cause_category,
            attack_vector=request_data.attack_vector,
            threat_actor_type=request_data.threat_actor_type,
            containment_actions=request_data.containment_actions,
            eradication_actions=request_data.eradication_actions,
            recovery_actions=request_data.recovery_actions,
            resolution_summary=request_data.resolution_summary,
            resolution_type=request_data.resolution_type,
            lessons_learned=request_data.lessons_learned,
            recommendations=request_data.recommendations,
            follow_up_actions=request_data.follow_up_actions,
            evidence_preserved=request_data.evidence_preserved,
            evidence_location=request_data.evidence_location,
            legal_hold_id=request_data.legal_hold_id,
            external_ticket_id=request_data.external_ticket_id,
            external_ticket_url=request_data.external_ticket_url,
            internal_notes=request_data.internal_notes,
            metadata=request_data.metadata,
        )

        incident = await incident_service.update_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            update=update,
            updated_by_user_id=current_user.user_id,
        )

        logger.info(
            "incident_updated",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "user_id": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError, IncidentAlreadyClosedError) as e:
        raise _handle_incident_error(e)


# ---------------------------------------------------------------------------
# Lifecycle Management Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{incident_id}/confirm",
    response_model=IncidentResponse,
    summary="Confirm incident",
    description="Confirm an incident after initial detection. Transitions from DETECTED to CONFIRMED.",
    responses={
        200: {"description": "Incident confirmed"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def confirm_incident(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: ConfirmIncidentRequest,
) -> IncidentResponse:
    """Confirm an incident."""
    try:
        incident = await incident_service.confirm_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            confirmed_by_user_id=current_user.user_id,
            confirmation_notes=request_data.confirmation_notes,
        )

        logger.info(
            "incident_confirmed",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "confirmed_by": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/investigate",
    response_model=IncidentResponse,
    summary="Start investigation",
    description="Start investigation of an incident. Transitions to INVESTIGATING status.",
    responses={
        200: {"description": "Investigation started"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def start_investigation(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: InvestigateIncidentRequest,
) -> IncidentResponse:
    """Start investigation of an incident."""
    try:
        incident = await incident_service.start_investigation(
            workspace_id=workspace_id,
            incident_id=incident_id,
            investigator_user_id=current_user.user_id,
            investigation_notes=request_data.investigation_notes,
        )

        logger.info(
            "investigation_started",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "investigator": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/contain",
    response_model=IncidentResponse,
    summary="Start containment",
    description="Start containment of an incident. Transitions to CONTAINING status.",
    responses={
        200: {"description": "Containment started"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def start_containment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: ContainmentRequest,
) -> IncidentResponse:
    """Start containment of an incident."""
    try:
        incident = await incident_service.start_containment(
            workspace_id=workspace_id,
            incident_id=incident_id,
            responder_user_id=current_user.user_id,
            containment_notes=request_data.notes,
        )

        logger.info(
            "containment_started",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "responder": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/contained",
    response_model=IncidentResponse,
    summary="Mark as contained",
    description="Mark an incident as contained. Transitions to CONTAINED status.",
    responses={
        200: {"description": "Incident marked as contained"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def mark_contained(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: ContainmentRequest,
) -> IncidentResponse:
    """Mark an incident as contained."""
    try:
        incident = await incident_service.mark_contained(
            workspace_id=workspace_id,
            incident_id=incident_id,
            responder_user_id=current_user.user_id,
            containment_actions=request_data.actions,
            containment_notes=request_data.notes,
        )

        logger.info(
            "incident_contained",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "responder": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/eradicate",
    response_model=IncidentResponse,
    summary="Start eradication",
    description="Start eradication of an incident. Transitions to ERADICATING status.",
    responses={
        200: {"description": "Eradication started"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def start_eradication(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: EradicationRequest,
) -> IncidentResponse:
    """Start eradication of an incident."""
    try:
        incident = await incident_service.start_eradication(
            workspace_id=workspace_id,
            incident_id=incident_id,
            responder_user_id=current_user.user_id,
            eradication_notes=request_data.notes,
        )

        logger.info(
            "eradication_started",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "responder": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/eradicated",
    response_model=IncidentResponse,
    summary="Mark as eradicated",
    description="Mark an incident as eradicated. Transitions to ERADICATED status.",
    responses={
        200: {"description": "Incident marked as eradicated"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def mark_eradicated(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: EradicationRequest,
) -> IncidentResponse:
    """Mark an incident as eradicated."""
    try:
        incident = await incident_service.mark_eradicated(
            workspace_id=workspace_id,
            incident_id=incident_id,
            responder_user_id=current_user.user_id,
            eradication_actions=request_data.actions,
            eradication_notes=request_data.notes,
        )

        logger.info(
            "incident_eradicated",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "responder": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/recover",
    response_model=IncidentResponse,
    summary="Start recovery",
    description="Start recovery of an incident. Transitions to RECOVERING status.",
    responses={
        200: {"description": "Recovery started"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def start_recovery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: RecoveryRequest,
) -> IncidentResponse:
    """Start recovery of an incident."""
    try:
        incident = await incident_service.start_recovery(
            workspace_id=workspace_id,
            incident_id=incident_id,
            responder_user_id=current_user.user_id,
            recovery_notes=request_data.notes,
        )

        logger.info(
            "recovery_started",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "responder": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/recovered",
    response_model=IncidentResponse,
    summary="Mark as recovered",
    description="Mark an incident as recovered. Transitions to RECOVERED status.",
    responses={
        200: {"description": "Incident marked as recovered"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def mark_recovered(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: RecoveryRequest,
) -> IncidentResponse:
    """Mark an incident as recovered."""
    try:
        incident = await incident_service.mark_recovered(
            workspace_id=workspace_id,
            incident_id=incident_id,
            responder_user_id=current_user.user_id,
            recovery_actions=request_data.actions,
            recovery_notes=request_data.notes,
        )

        logger.info(
            "incident_recovered",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "responder": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/resolve",
    response_model=IncidentResponse,
    summary="Resolve incident",
    description="Resolve an incident. Transitions to RESOLVED status.",
    responses={
        200: {"description": "Incident resolved"},
        400: {"description": "Invalid status transition or already resolved"},
        404: {"description": "Incident not found"},
    },
)
async def resolve_incident(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: ResolveIncidentRequest,
) -> IncidentResponse:
    """Resolve an incident."""
    try:
        incident = await incident_service.resolve_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            resolved_by_user_id=current_user.user_id,
            resolution_summary=request_data.resolution_summary,
            resolution_type=request_data.resolution_type,
            lessons_learned=request_data.lessons_learned,
        )

        logger.info(
            "incident_resolved",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "resolved_by": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError, IncidentAlreadyResolvedError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/close",
    response_model=IncidentResponse,
    summary="Close incident",
    description="Close an incident. Transitions to CLOSED status. This action is final.",
    responses={
        200: {"description": "Incident closed"},
        400: {"description": "Invalid status transition or already closed"},
        404: {"description": "Incident not found"},
    },
)
async def close_incident(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: CloseIncidentRequest,
) -> IncidentResponse:
    """Close an incident."""
    try:
        incident = await incident_service.close_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            closed_by_user_id=current_user.user_id,
            closing_notes=request_data.closing_notes,
        )

        logger.info(
            "incident_closed",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "closed_by": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError, IncidentAlreadyClosedError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/false-positive",
    response_model=IncidentResponse,
    summary="Mark as false positive",
    description="Mark an incident as a false positive. This action is final.",
    responses={
        200: {"description": "Incident marked as false positive"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def mark_false_positive(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: MarkAsFalsePositiveRequest,
) -> IncidentResponse:
    """Mark an incident as false positive."""
    try:
        incident = await incident_service.mark_false_positive(
            workspace_id=workspace_id,
            incident_id=incident_id,
            marked_by_user_id=current_user.user_id,
            reason=request_data.reason,
        )

        logger.info(
            "incident_marked_false_positive",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "marked_by": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/escalate",
    response_model=IncidentResponse,
    summary="Escalate incident",
    description="Escalate an incident to higher authority.",
    responses={
        200: {"description": "Incident escalated"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Incident not found"},
    },
)
async def escalate_incident(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: EscalateIncidentRequest,
) -> IncidentResponse:
    """Escalate an incident."""
    try:
        incident = await incident_service.escalate_incident(
            workspace_id=workspace_id,
            incident_id=incident_id,
            escalated_by_user_id=current_user.user_id,
            escalation_reason=request_data.escalation_reason,
            escalate_to_user_id=request_data.escalate_to_user_id,
        )

        logger.info(
            "incident_escalated",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "escalated_by": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except (IncidentNotFoundError, IncidentInvalidStatusTransitionError) as e:
        raise _handle_incident_error(e)


# ---------------------------------------------------------------------------
# Notification Management Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{incident_id}/notification-deadline",
    response_model=NotificationDeadlineResponse,
    summary="Get notification deadline status",
    description="Get the GDPR 72-hour notification deadline status for a data breach incident.",
    responses={
        200: {"description": "Notification deadline status"},
        404: {"description": "Incident not found"},
    },
)
async def get_notification_deadline(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
) -> NotificationDeadlineResponse:
    """Get notification deadline status."""
    try:
        result = await incident_service.check_notification_deadline(
            workspace_id=workspace_id,
            incident_id=incident_id,
        )

        return NotificationDeadlineResponse(
            requires_notification=result.requires_notification,
            deadline_at=result.deadline_at,
            hours_remaining=result.hours_remaining,
            is_overdue=result.is_overdue,
            authority_notified=result.authority_notified,
            subjects_notified=result.subjects_notified,
        )
    except IncidentNotFoundError as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/record-notification",
    response_model=IncidentResponse,
    summary="Record regulatory notification",
    description="Record that regulatory notification has been sent (authority or data subjects).",
    responses={
        200: {"description": "Notification recorded"},
        400: {"description": "Invalid notification type"},
        404: {"description": "Incident not found"},
    },
)
async def record_notification(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: RecordNotificationRequest,
) -> IncidentResponse:
    """Record regulatory notification."""
    try:
        if request_data.notification_type == "authority":
            incident = await incident_service.record_authority_notification(
                workspace_id=workspace_id,
                incident_id=incident_id,
                notified_by_user_id=current_user.user_id,
                reference=request_data.reference,
                notes=request_data.notes,
            )
        elif request_data.notification_type == "subjects":
            incident = await incident_service.record_subjects_notification(
                workspace_id=workspace_id,
                incident_id=incident_id,
                notified_by_user_id=current_user.user_id,
                count=request_data.count or 0,
                notes=request_data.notes,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_NOTIFICATION_TYPE", "message": "Must be 'authority' or 'subjects'"},
            )

        logger.info(
            "notification_recorded",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "notification_type": request_data.notification_type,
                "recorded_by": str(current_user.user_id),
            },
        )

        return _model_to_response(incident)
    except IncidentNotFoundError as e:
        raise _handle_incident_error(e)


# ---------------------------------------------------------------------------
# Affected Resources Management Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{incident_id}/affected-resources",
    response_model=AffectedResourceListResponse,
    summary="List affected resources",
    description="List resources affected by an incident.",
    responses={
        200: {"description": "List of affected resources"},
        404: {"description": "Incident not found"},
    },
)
async def list_affected_resources(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> AffectedResourceListResponse:
    """List affected resources for an incident."""
    try:
        result = await incident_service.list_affected_resources(
            workspace_id=workspace_id,
            incident_id=incident_id,
            page=page,
            limit=limit,
        )

        items = [_affected_resource_to_response(item) for item in result.items]

        return AffectedResourceListResponse(
            items=items,
            total=result.total,
            page=result.page,
            per_page=result.limit,
            total_pages=result.total_pages,
        )
    except IncidentNotFoundError as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/affected-resources",
    response_model=AffectedResourceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add affected resource",
    description="Add a resource affected by an incident.",
    responses={
        201: {"description": "Affected resource added"},
        404: {"description": "Incident not found"},
    },
)
async def add_affected_resource(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: AddAffectedResourceRequest,
) -> AffectedResourceResponse:
    """Add an affected resource to an incident."""
    try:
        resource = await incident_service.add_affected_resource(
            workspace_id=workspace_id,
            incident_id=incident_id,
            resource_type=request_data.resource_type,
            resource_id=request_data.resource_id,
            added_by_user_id=current_user.user_id,
            resource_name=request_data.resource_name,
            user_id=request_data.user_id,
            impact_type=request_data.impact_type,
            impact_description=request_data.impact_description,
            data_classification=request_data.data_classification,
            contains_pii=request_data.contains_pii,
            contains_sensitive_data=request_data.contains_sensitive_data,
            metadata=request_data.metadata,
        )

        logger.info(
            "affected_resource_added",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "resource_type": request_data.resource_type,
                "resource_id": str(request_data.resource_id),
                "added_by": str(current_user.user_id),
            },
        )

        return _affected_resource_to_response(resource)
    except IncidentNotFoundError as e:
        raise _handle_incident_error(e)


@router.patch(
    "/{incident_id}/affected-resources/{resource_id}",
    response_model=AffectedResourceResponse,
    summary="Update affected resource",
    description="Update an affected resource's details or remediation status.",
    responses={
        200: {"description": "Affected resource updated"},
        404: {"description": "Incident or resource not found"},
    },
)
async def update_affected_resource(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    resource_id: Annotated[UUID, Path(..., description="Affected resource record ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: UpdateAffectedResourceRequest,
) -> AffectedResourceResponse:
    """Update an affected resource."""
    try:
        resource = await incident_service.update_affected_resource(
            workspace_id=workspace_id,
            incident_id=incident_id,
            resource_id=resource_id,
            updated_by_user_id=current_user.user_id,
            impact_type=request_data.impact_type,
            impact_description=request_data.impact_description,
            data_classification=request_data.data_classification,
            contains_pii=request_data.contains_pii,
            contains_sensitive_data=request_data.contains_sensitive_data,
            remediation_status=request_data.remediation_status,
            remediation_notes=request_data.remediation_notes,
            metadata=request_data.metadata,
        )

        logger.info(
            "affected_resource_updated",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "resource_id": str(resource_id),
                "updated_by": str(current_user.user_id),
            },
        )

        return _affected_resource_to_response(resource)
    except (IncidentNotFoundError, IncidentAffectedResourceNotFoundError) as e:
        raise _handle_incident_error(e)


@router.delete(
    "/{incident_id}/affected-resources/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove affected resource",
    description="Remove a resource from the affected resources list.",
    responses={
        204: {"description": "Affected resource removed"},
        404: {"description": "Incident or resource not found"},
    },
)
async def remove_affected_resource(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    resource_id: Annotated[UUID, Path(..., description="Affected resource record ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
):
    """Remove an affected resource from an incident."""
    try:
        removed = await incident_service.remove_affected_resource(
            workspace_id=workspace_id,
            incident_id=incident_id,
            resource_id=resource_id,
            removed_by_user_id=current_user.user_id,
        )

        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "AFFECTED_RESOURCE_NOT_FOUND", "message": "Affected resource not found"},
            )

        logger.info(
            "affected_resource_removed",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "resource_id": str(resource_id),
                "removed_by": str(current_user.user_id),
            },
        )

    except IncidentNotFoundError as e:
        raise _handle_incident_error(e)


# ---------------------------------------------------------------------------
# Timeline Updates Management Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{incident_id}/updates",
    response_model=TimelineUpdateListResponse,
    summary="List timeline updates",
    description="List timeline updates for an incident.",
    responses={
        200: {"description": "List of timeline updates"},
        404: {"description": "Incident not found"},
    },
)
async def list_timeline_updates(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> TimelineUpdateListResponse:
    """List timeline updates for an incident."""
    try:
        result = await incident_service.list_timeline_updates(
            workspace_id=workspace_id,
            incident_id=incident_id,
            page=page,
            limit=limit,
        )

        items = [_timeline_update_to_response(item) for item in result.items]

        return TimelineUpdateListResponse(
            items=items,
            total=result.total,
            page=result.page,
            per_page=result.limit,
            total_pages=result.total_pages,
        )
    except IncidentNotFoundError as e:
        raise _handle_incident_error(e)


@router.post(
    "/{incident_id}/updates",
    response_model=TimelineUpdateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add timeline update",
    description="Add a timeline update to an incident.",
    responses={
        201: {"description": "Timeline update added"},
        400: {"description": "Incident is closed"},
        404: {"description": "Incident not found"},
    },
)
async def add_timeline_update(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    incident_id: Annotated[UUID, Path(..., description="Incident ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    incident_service: IncidentServiceDep,
    request_data: AddTimelineUpdateRequest,
) -> TimelineUpdateResponse:
    """Add a timeline update to an incident."""
    try:
        update = await incident_service.add_timeline_update(
            workspace_id=workspace_id,
            incident_id=incident_id,
            created_by_user_id=current_user.user_id,
            update_type=request_data.update_type,
            title=request_data.title,
            content=request_data.content,
            visibility=request_data.visibility,
            is_public=request_data.is_public,
            attachments=request_data.attachments,
            metadata=request_data.metadata,
        )

        logger.info(
            "timeline_update_added",
            extra={
                "workspace_id": str(workspace_id),
                "incident_id": str(incident_id),
                "update_id": str(update.update_id),
                "update_type": request_data.update_type.value,
                "created_by": str(current_user.user_id),
            },
        )

        return _timeline_update_to_response(update)
    except (IncidentNotFoundError, IncidentAlreadyClosedError) as e:
        raise _handle_incident_error(e)
