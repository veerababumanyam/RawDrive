"""Legal Holds API endpoints for compliance.

Provides endpoints for managing legal holds:
- Create new legal holds
- List and filter legal holds
- View legal hold details
- Update legal holds
- Lifecycle management (activate, suspend, release)
- Resource management (add/remove resources)
- Custodian management
- Check if resources are blocked by legal holds
- Get legal hold statistics

All routes prefixed with /api/v1/workspaces/{workspace_id}/legal-holds.
Implements Audit & Compliance System requirements.

Feature: Audit & Compliance System
Task: T013 - Create legal holds API endpoints
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import PaginatedResponse
from app.models.compliance import (
    LegalHold,
    LegalHoldCaptureMethod,
    LegalHoldPriority,
    LegalHoldResource,
    LegalHoldScopeType,
    LegalHoldStatus,
    LegalHoldSummary,
    LegalHoldType,
    LegalHoldUpdate,
)
from app.services.legal_hold_service import (
    LegalHoldAlreadyActiveError,
    LegalHoldAlreadyReleasedError,
    LegalHoldError,
    LegalHoldInvalidStatusTransitionError,
    LegalHoldNotFoundError,
    LegalHoldService,
    get_legal_hold_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class CreateLegalHoldRequest(BaseModel):
    """Request to create a new legal hold."""

    name: str = Field(..., min_length=1, max_length=255, description="Name/title of the legal hold")
    description: Optional[str] = Field(None, description="Detailed description of the hold")
    hold_type: LegalHoldType = Field(LegalHoldType.LITIGATION, description="Type of legal hold")
    matter_id: Optional[str] = Field(None, max_length=100, description="External legal matter ID")
    matter_name: Optional[str] = Field(None, max_length=255, description="Name of the legal matter")
    priority: LegalHoldPriority = Field(LegalHoldPriority.NORMAL, description="Priority level")
    external_reference: Optional[str] = Field(None, max_length=255, description="External reference number")
    legal_counsel: Optional[str] = Field(None, max_length=255, description="Legal counsel name")
    law_firm: Optional[str] = Field(None, max_length=255, description="Law firm name")
    scope_type: LegalHoldScopeType = Field(LegalHoldScopeType.SELECTIVE, description="How scope is determined")
    scope_users: list[str] = Field(default_factory=list, description="User IDs covered by hold")
    scope_resources: list[dict[str, Any]] = Field(default_factory=list, description="Specific resources under hold")
    scope_resource_types: list[str] = Field(default_factory=list, description="Resource types covered")
    scope_date_range: Optional[dict[str, Any]] = Field(None, description="Date range filter")
    scope_keywords: list[str] = Field(default_factory=list, description="Keywords for matching")
    custodians: list[dict[str, Any]] = Field(default_factory=list, description="Custodian information")
    effective_from: Optional[datetime] = Field(None, description="When hold takes effect")
    effective_until: Optional[datetime] = Field(None, description="When hold expires")
    reminder_frequency_days: Optional[int] = Field(None, ge=1, description="Days between reminders")
    auto_activate: bool = Field(True, description="Automatically activate the hold")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class UpdateLegalHoldRequest(BaseModel):
    """Request to update a legal hold."""

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Name/title of the legal hold")
    description: Optional[str] = Field(None, description="Detailed description")
    status: Optional[LegalHoldStatus] = Field(None, description="New status")
    status_reason: Optional[str] = Field(None, description="Reason for status change")
    priority: Optional[LegalHoldPriority] = Field(None, description="Priority level")
    scope_users: Optional[list[str]] = Field(None, description="User IDs covered by hold")
    scope_resources: Optional[list[dict[str, Any]]] = Field(None, description="Specific resources under hold")
    scope_resource_types: Optional[list[str]] = Field(None, description="Resource types covered")
    scope_date_range: Optional[dict[str, Any]] = Field(None, description="Date range filter")
    scope_keywords: Optional[list[str]] = Field(None, description="Keywords for matching")
    custodians: Optional[list[dict[str, Any]]] = Field(None, description="Custodian information")
    effective_until: Optional[datetime] = Field(None, description="When hold expires")
    reminder_frequency_days: Optional[int] = Field(None, ge=1, description="Days between reminders")
    internal_notes: Optional[str] = Field(None, description="Internal notes")
    metadata: Optional[dict[str, Any]] = Field(None, description="Additional metadata")


class ActivateLegalHoldRequest(BaseModel):
    """Request to activate a legal hold."""

    reason: Optional[str] = Field(None, description="Reason for activation")


class SuspendLegalHoldRequest(BaseModel):
    """Request to suspend a legal hold."""

    reason: str = Field(..., min_length=10, description="Reason for suspension")


class ReleaseLegalHoldRequest(BaseModel):
    """Request to release a legal hold."""

    release_reason: str = Field(..., min_length=10, description="Reason for releasing the hold")


class AddResourceRequest(BaseModel):
    """Request to add a resource to a legal hold."""

    resource_type: str = Field(..., max_length=50, description="Type of resource (asset, gallery, etc.)")
    resource_id: UUID = Field(..., description="ID of the resource")
    user_id: Optional[UUID] = Field(None, description="User associated with the resource")
    capture_method: LegalHoldCaptureMethod = Field(
        LegalHoldCaptureMethod.MANUAL_ADD,
        description="How the resource was captured"
    )
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class RemoveResourceRequest(BaseModel):
    """Request to remove a resource from a legal hold."""

    resource_type: str = Field(..., max_length=50, description="Type of resource")
    resource_id: UUID = Field(..., description="ID of the resource")
    reason: Optional[str] = Field(None, description="Reason for removal")


class AddCustodianRequest(BaseModel):
    """Request to add a custodian to a legal hold."""

    user_id: UUID = Field(..., description="User ID of the custodian")
    name: str = Field(..., max_length=255, description="Name of the custodian")
    email: str = Field(..., max_length=255, description="Email of the custodian")


class AcknowledgeCustodianRequest(BaseModel):
    """Request to record custodian acknowledgment."""

    method: str = Field("portal", max_length=30, description="Method of acknowledgment")


class CheckDeletionRequest(BaseModel):
    """Request to check if deletion is blocked."""

    resource_type: str = Field(..., max_length=50, description="Type of resource")
    resource_id: UUID = Field(..., description="ID of the resource")


# Response Schemas


class LegalHoldResponse(BaseModel):
    """Full legal hold response."""

    hold_id: UUID
    workspace_id: UUID
    hold_number: str
    name: str
    description: Optional[str] = None
    hold_type: LegalHoldType
    matter_id: Optional[str] = None
    matter_name: Optional[str] = None
    status: LegalHoldStatus
    status_reason: Optional[str] = None
    priority: LegalHoldPriority
    external_reference: Optional[str] = None
    legal_counsel: Optional[str] = None
    law_firm: Optional[str] = None
    scope_type: LegalHoldScopeType
    scope_users: list[str] = Field(default_factory=list)
    scope_resources: list[dict[str, Any]] = Field(default_factory=list)
    scope_resource_types: list[str] = Field(default_factory=list)
    scope_date_range: Optional[dict[str, Any]] = None
    scope_keywords: list[str] = Field(default_factory=list)
    custodians: list[dict[str, Any]] = Field(default_factory=list)
    custodian_acknowledgments: list[dict[str, Any]] = Field(default_factory=list)
    issued_at: datetime
    effective_from: datetime
    effective_until: Optional[datetime] = None
    released_at: Optional[datetime] = None
    issued_by_user_id: UUID
    released_by_user_id: Optional[UUID] = None
    release_reason: Optional[str] = None
    notification_sent_at: Optional[datetime] = None
    reminder_frequency_days: Optional[int] = None
    last_reminder_sent_at: Optional[datetime] = None
    next_reminder_at: Optional[datetime] = None
    affected_users_count: int = 0
    affected_resources_count: int = 0
    blocked_deletions_count: int = 0
    blocked_requests_count: int = 0
    internal_notes: Optional[str] = None
    status_history: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class LegalHoldSummaryResponse(BaseModel):
    """Lightweight legal hold summary."""

    hold_id: UUID
    workspace_id: UUID
    hold_number: str
    name: str
    hold_type: LegalHoldType
    status: LegalHoldStatus
    priority: LegalHoldPriority
    effective_from: datetime
    effective_until: Optional[datetime] = None
    affected_resources_count: int = 0


class LegalHoldListResponse(PaginatedResponse):
    """Paginated list of legal holds."""

    items: list[LegalHoldSummaryResponse]


class LegalHoldResourceResponse(BaseModel):
    """Legal hold resource response."""

    id: UUID
    hold_id: UUID
    workspace_id: UUID
    resource_type: str
    resource_id: UUID
    user_id: Optional[UUID] = None
    capture_method: LegalHoldCaptureMethod
    added_at: datetime
    added_by_user_id: Optional[UUID] = None
    deletion_attempts: int = 0
    last_deletion_attempt_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class LegalHoldStatsResponse(BaseModel):
    """Legal hold statistics."""

    total: int
    active: int
    suspended: int
    released: int
    draft: int
    pending_approval: int
    total_affected_users: int
    total_affected_resources: int
    total_blocked_deletions: int


class DeletionCheckResponse(BaseModel):
    """Response for checking if deletion is blocked."""

    blocked: bool
    blocking_holds: list[LegalHoldSummaryResponse]
    reason: Optional[str] = None


class LegalHoldTypesResponse(BaseModel):
    """Available legal hold types."""

    hold_types: list[dict[str, str]]


class LegalHoldStatusesResponse(BaseModel):
    """Available legal hold statuses."""

    statuses: list[dict[str, str]]


class CustodianAcknowledgmentResponse(BaseModel):
    """Custodian acknowledgment response."""

    user_id: UUID
    acknowledged_at: datetime
    method: str
    hold_id: UUID


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def _get_legal_hold_service() -> LegalHoldService:
    """Get legal hold service instance."""
    return get_legal_hold_service()


LegalHoldServiceDep = Annotated[LegalHoldService, Depends(_get_legal_hold_service)]


def _model_to_response(model: LegalHold) -> LegalHoldResponse:
    """Convert a LegalHold model to a response."""
    return LegalHoldResponse(
        hold_id=model.hold_id,
        workspace_id=model.workspace_id,
        hold_number=model.hold_number,
        name=model.name,
        description=model.description,
        hold_type=model.hold_type,
        matter_id=model.matter_id,
        matter_name=model.matter_name,
        status=model.status,
        status_reason=model.status_reason,
        priority=model.priority,
        external_reference=model.external_reference,
        legal_counsel=model.legal_counsel,
        law_firm=model.law_firm,
        scope_type=model.scope_type,
        scope_users=model.scope_users,
        scope_resources=model.scope_resources,
        scope_resource_types=model.scope_resource_types,
        scope_date_range=model.scope_date_range,
        scope_keywords=model.scope_keywords,
        custodians=model.custodians,
        custodian_acknowledgments=model.custodian_acknowledgments,
        issued_at=model.issued_at,
        effective_from=model.effective_from,
        effective_until=model.effective_until,
        released_at=model.released_at,
        issued_by_user_id=model.issued_by_user_id,
        released_by_user_id=model.released_by_user_id,
        release_reason=model.release_reason,
        notification_sent_at=model.notification_sent_at,
        reminder_frequency_days=model.reminder_frequency_days,
        last_reminder_sent_at=model.last_reminder_sent_at,
        next_reminder_at=model.next_reminder_at,
        affected_users_count=model.affected_users_count,
        affected_resources_count=model.affected_resources_count,
        blocked_deletions_count=model.blocked_deletions_count,
        blocked_requests_count=model.blocked_requests_count,
        internal_notes=model.internal_notes,
        status_history=model.status_history,
        metadata=model.metadata,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _summary_to_response(summary: LegalHoldSummary) -> LegalHoldSummaryResponse:
    """Convert a LegalHoldSummary to a response."""
    return LegalHoldSummaryResponse(
        hold_id=summary.hold_id,
        workspace_id=summary.workspace_id,
        hold_number=summary.hold_number,
        name=summary.name,
        hold_type=summary.hold_type,
        status=summary.status,
        priority=summary.priority,
        effective_from=summary.effective_from,
        effective_until=summary.effective_until,
        affected_resources_count=summary.affected_resources_count,
    )


def _resource_to_response(resource: LegalHoldResource) -> LegalHoldResourceResponse:
    """Convert a LegalHoldResource to a response."""
    return LegalHoldResourceResponse(
        id=resource.id,
        hold_id=resource.hold_id,
        workspace_id=resource.workspace_id,
        resource_type=resource.resource_type,
        resource_id=resource.resource_id,
        user_id=resource.user_id,
        capture_method=resource.capture_method,
        added_at=resource.added_at,
        added_by_user_id=resource.added_by_user_id,
        deletion_attempts=resource.deletion_attempts,
        last_deletion_attempt_at=resource.last_deletion_attempt_at,
        metadata=resource.metadata,
    )


def _handle_legal_hold_error(error: LegalHoldError) -> HTTPException:
    """Convert a LegalHoldError to an HTTPException."""
    return HTTPException(
        status_code=error.status,
        detail={"code": error.code, "message": str(error)},
    )


# ---------------------------------------------------------------------------
# List Endpoints (Static routes first)
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=LegalHoldListResponse,
    summary="List legal holds",
    description="""
    List legal holds with filtering and pagination.

    Supports filtering by status, hold type, and whether to include released holds.
    """,
    responses={
        200: {"description": "List of legal holds"},
        403: {"description": "Access denied"},
    },
)
async def list_legal_holds(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    status_filter: Annotated[
        LegalHoldStatus | None, Query(alias="status", description="Filter by status")
    ] = None,
    hold_type: Annotated[
        LegalHoldType | None, Query(description="Filter by hold type")
    ] = None,
    include_released: Annotated[
        bool, Query(description="Include released/expired holds")
    ] = False,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> LegalHoldListResponse:
    """List legal holds with filtering and pagination."""
    result = await legal_hold_service.list_legal_holds(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        status=status_filter,
        hold_type=hold_type,
        include_released=include_released,
    )

    items = [_summary_to_response(item) for item in result.items]

    logger.info(
        "legal_holds_listed",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "result_count": len(items),
            "total": result.total,
        },
    )

    return LegalHoldListResponse(
        items=items,
        total=result.total,
        page=result.page,
        per_page=result.limit,
        total_pages=result.total_pages,
    )


@router.get(
    "/stats",
    response_model=LegalHoldStatsResponse,
    summary="Get legal hold statistics",
    description="Get aggregated statistics for legal holds.",
)
async def get_legal_hold_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
) -> LegalHoldStatsResponse:
    """Get legal hold statistics."""
    stats = await legal_hold_service.get_stats(workspace_id)

    return LegalHoldStatsResponse(
        total=stats.total,
        active=stats.active,
        suspended=stats.suspended,
        released=stats.released,
        draft=stats.draft,
        pending_approval=stats.pending_approval,
        total_affected_users=stats.total_affected_users,
        total_affected_resources=stats.total_affected_resources,
        total_blocked_deletions=stats.total_blocked_deletions,
    )


@router.get(
    "/active",
    response_model=LegalHoldListResponse,
    summary="List active legal holds",
    description="List only active legal holds.",
)
async def list_active_legal_holds(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> LegalHoldListResponse:
    """List active legal holds."""
    result = await legal_hold_service.get_active_holds(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
    )

    items = [_summary_to_response(item) for item in result.items]

    return LegalHoldListResponse(
        items=items,
        total=result.total,
        page=result.page,
        per_page=result.limit,
        total_pages=result.total_pages,
    )


@router.get(
    "/expiring",
    response_model=list[LegalHoldSummaryResponse],
    summary="List expiring legal holds",
    description="List legal holds that are expiring soon.",
)
async def list_expiring_legal_holds(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    days: Annotated[int, Query(ge=1, le=365, description="Days to look ahead")] = 30,
) -> list[LegalHoldSummaryResponse]:
    """List legal holds expiring within the specified days."""
    holds = await legal_hold_service.get_expiring_holds(
        workspace_id=workspace_id,
        days_until_expiry=days,
    )

    return [_summary_to_response(hold) for hold in holds]


@router.get(
    "/hold-types",
    response_model=LegalHoldTypesResponse,
    summary="List available hold types",
    description="Get a list of all available legal hold types.",
)
async def list_hold_types(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> LegalHoldTypesResponse:
    """List all available legal hold types."""
    hold_types = [
        {"value": t.value, "label": t.value.replace("_", " ").title()}
        for t in LegalHoldType
    ]
    return LegalHoldTypesResponse(hold_types=hold_types)


@router.get(
    "/statuses",
    response_model=LegalHoldStatusesResponse,
    summary="List available statuses",
    description="Get a list of all available legal hold statuses.",
)
async def list_statuses(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> LegalHoldStatusesResponse:
    """List all available legal hold statuses."""
    statuses = [
        {"value": s.value, "label": s.value.replace("_", " ").title()}
        for s in LegalHoldStatus
    ]
    return LegalHoldStatusesResponse(statuses=statuses)


@router.post(
    "/check-deletion",
    response_model=DeletionCheckResponse,
    summary="Check if deletion is blocked",
    description="Check if a resource deletion would be blocked by any legal holds.",
)
async def check_deletion_blocked(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: CheckDeletionRequest,
) -> DeletionCheckResponse:
    """Check if a resource deletion would be blocked by legal holds."""
    result = await legal_hold_service.check_deletion_blocked(
        workspace_id=workspace_id,
        resource_type=request_data.resource_type,
        resource_id=request_data.resource_id,
    )

    return DeletionCheckResponse(
        blocked=result.blocked,
        blocking_holds=[_summary_to_response(hold) for hold in result.blocking_holds],
        reason=result.reason,
    )


# ---------------------------------------------------------------------------
# Create Endpoint
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=LegalHoldResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create legal hold",
    description="""
    Create a new legal hold to preserve data for litigation, regulatory
    investigations, or compliance requirements.

    Hold types:
    - litigation: Legal litigation/lawsuit
    - regulatory: Regulatory investigation
    - internal_audit: Internal audit/investigation
    - compliance: Compliance requirement
    - preservation: General preservation request
    - subpoena: Subpoena/court order
    - government: Government inquiry

    By default, the hold is immediately activated. Set auto_activate=False
    to create in draft status for review before activation.
    """,
    responses={
        201: {"description": "Legal hold created"},
        400: {"description": "Invalid request data"},
    },
)
async def create_legal_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: CreateLegalHoldRequest,
) -> LegalHoldResponse:
    """Create a new legal hold."""
    try:
        hold = await legal_hold_service.create_legal_hold(
            workspace_id=workspace_id,
            name=request_data.name,
            issued_by_user_id=current_user.user_id,
            hold_type=request_data.hold_type,
            description=request_data.description,
            matter_id=request_data.matter_id,
            matter_name=request_data.matter_name,
            priority=request_data.priority,
            external_reference=request_data.external_reference,
            legal_counsel=request_data.legal_counsel,
            law_firm=request_data.law_firm,
            scope_type=request_data.scope_type,
            scope_users=request_data.scope_users,
            scope_resources=request_data.scope_resources,
            scope_resource_types=request_data.scope_resource_types,
            scope_date_range=request_data.scope_date_range,
            scope_keywords=request_data.scope_keywords,
            custodians=request_data.custodians,
            effective_from=request_data.effective_from,
            effective_until=request_data.effective_until,
            reminder_frequency_days=request_data.reminder_frequency_days,
            auto_activate=request_data.auto_activate,
            metadata=request_data.metadata,
        )

        logger.info(
            "legal_hold_created",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold.hold_id),
                "hold_number": hold.hold_number,
                "hold_type": hold.hold_type.value,
                "created_by": str(current_user.user_id),
            },
        )

        return _model_to_response(hold)

    except LegalHoldError as e:
        raise _handle_legal_hold_error(e)


# ---------------------------------------------------------------------------
# Detail/Action Endpoints (Parameterized routes last)
# ---------------------------------------------------------------------------


@router.get(
    "/by-number/{hold_number}",
    response_model=LegalHoldResponse,
    summary="Get legal hold by number",
    description="Get a legal hold by its human-readable number.",
    responses={
        200: {"description": "Legal hold details"},
        404: {"description": "Legal hold not found"},
    },
)
async def get_legal_hold_by_number(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_number: Annotated[str, Path(..., description="Hold number (e.g., LH-2026-00001)")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
) -> LegalHoldResponse:
    """Get a legal hold by its number."""
    # We need to search by hold_number - use list_legal_holds and filter
    from app.db.postgres import get_postgres_pool

    pool = await get_postgres_pool()
    row = await pool.fetchrow(
        """
        SELECT hold_id FROM legal_holds
        WHERE workspace_id = $1 AND hold_number = $2
        """,
        workspace_id,
        hold_number,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LEGAL_HOLD_NOT_FOUND", "message": f"Legal hold {hold_number} not found"},
        )

    try:
        hold = await legal_hold_service.get_legal_hold(
            workspace_id=workspace_id,
            hold_id=row["hold_id"],
        )
        return _model_to_response(hold)
    except LegalHoldNotFoundError as e:
        raise _handle_legal_hold_error(e)


@router.get(
    "/{hold_id}",
    response_model=LegalHoldResponse,
    summary="Get legal hold",
    description="Get details of a specific legal hold.",
    responses={
        200: {"description": "Legal hold details"},
        404: {"description": "Legal hold not found"},
    },
)
async def get_legal_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
) -> LegalHoldResponse:
    """Get a legal hold by ID."""
    try:
        hold = await legal_hold_service.get_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
        )

        logger.info(
            "legal_hold_retrieved",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "user_id": str(current_user.user_id),
            },
        )

        return _model_to_response(hold)
    except LegalHoldNotFoundError as e:
        raise _handle_legal_hold_error(e)


@router.patch(
    "/{hold_id}",
    response_model=LegalHoldResponse,
    summary="Update legal hold",
    description="Update a legal hold.",
    responses={
        200: {"description": "Legal hold updated"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Legal hold not found"},
    },
)
async def update_legal_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: UpdateLegalHoldRequest,
) -> LegalHoldResponse:
    """Update a legal hold."""
    try:
        update = LegalHoldUpdate(
            name=request_data.name,
            description=request_data.description,
            status=request_data.status,
            status_reason=request_data.status_reason,
            priority=request_data.priority,
            scope_users=request_data.scope_users,
            scope_resources=request_data.scope_resources,
            scope_resource_types=request_data.scope_resource_types,
            scope_date_range=request_data.scope_date_range,
            scope_keywords=request_data.scope_keywords,
            custodians=request_data.custodians,
            effective_until=request_data.effective_until,
            reminder_frequency_days=request_data.reminder_frequency_days,
            internal_notes=request_data.internal_notes,
            metadata=request_data.metadata,
        )

        hold = await legal_hold_service.update_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            update=update,
            updated_by_user_id=current_user.user_id,
        )

        logger.info(
            "legal_hold_updated",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "user_id": str(current_user.user_id),
            },
        )

        return _model_to_response(hold)
    except (LegalHoldNotFoundError, LegalHoldInvalidStatusTransitionError, LegalHoldAlreadyReleasedError) as e:
        raise _handle_legal_hold_error(e)


@router.post(
    "/{hold_id}/activate",
    response_model=LegalHoldResponse,
    summary="Activate legal hold",
    description="Activate a legal hold. Once active, resources in scope are protected from deletion.",
    responses={
        200: {"description": "Legal hold activated"},
        400: {"description": "Already active or invalid transition"},
        404: {"description": "Legal hold not found"},
    },
)
async def activate_legal_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: ActivateLegalHoldRequest,
) -> LegalHoldResponse:
    """Activate a legal hold."""
    try:
        hold = await legal_hold_service.activate_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            activated_by_user_id=current_user.user_id,
            reason=request_data.reason,
        )

        logger.info(
            "legal_hold_activated",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "activated_by": str(current_user.user_id),
            },
        )

        return _model_to_response(hold)
    except (LegalHoldNotFoundError, LegalHoldAlreadyActiveError, LegalHoldInvalidStatusTransitionError) as e:
        raise _handle_legal_hold_error(e)


@router.post(
    "/{hold_id}/suspend",
    response_model=LegalHoldResponse,
    summary="Suspend legal hold",
    description="Temporarily suspend an active hold. Resources remain protected while suspended.",
    responses={
        200: {"description": "Legal hold suspended"},
        400: {"description": "Invalid transition"},
        404: {"description": "Legal hold not found"},
    },
)
async def suspend_legal_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: SuspendLegalHoldRequest,
) -> LegalHoldResponse:
    """Suspend a legal hold."""
    try:
        hold = await legal_hold_service.suspend_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            suspended_by_user_id=current_user.user_id,
            reason=request_data.reason,
        )

        logger.info(
            "legal_hold_suspended",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "suspended_by": str(current_user.user_id),
            },
        )

        return _model_to_response(hold)
    except (LegalHoldNotFoundError, LegalHoldInvalidStatusTransitionError) as e:
        raise _handle_legal_hold_error(e)


@router.post(
    "/{hold_id}/release",
    response_model=LegalHoldResponse,
    summary="Release legal hold",
    description="Permanently release the hold. Protected resources are no longer blocked from deletion. This action cannot be undone.",
    responses={
        200: {"description": "Legal hold released"},
        400: {"description": "Already released or invalid transition"},
        404: {"description": "Legal hold not found"},
    },
)
async def release_legal_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: ReleaseLegalHoldRequest,
) -> LegalHoldResponse:
    """Release a legal hold."""
    try:
        hold = await legal_hold_service.release_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            released_by_user_id=current_user.user_id,
            release_reason=request_data.release_reason,
        )

        logger.info(
            "legal_hold_released",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "released_by": str(current_user.user_id),
            },
        )

        return _model_to_response(hold)
    except (LegalHoldNotFoundError, LegalHoldAlreadyReleasedError, LegalHoldInvalidStatusTransitionError) as e:
        raise _handle_legal_hold_error(e)


# ---------------------------------------------------------------------------
# Resource Management Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{hold_id}/resources",
    response_model=LegalHoldResourceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add resource to hold",
    description="Add a resource to a legal hold. The resource will be protected from deletion.",
    responses={
        201: {"description": "Resource added to hold"},
        400: {"description": "Hold is released"},
        404: {"description": "Legal hold not found"},
    },
)
async def add_resource_to_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: AddResourceRequest,
) -> LegalHoldResourceResponse:
    """Add a resource to a legal hold."""
    try:
        resource = await legal_hold_service.add_resource_to_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            resource_type=request_data.resource_type,
            resource_id=request_data.resource_id,
            added_by_user_id=current_user.user_id,
            user_id=request_data.user_id,
            capture_method=request_data.capture_method,
            metadata=request_data.metadata,
        )

        logger.info(
            "resource_added_to_hold",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "resource_type": request_data.resource_type,
                "resource_id": str(request_data.resource_id),
                "added_by": str(current_user.user_id),
            },
        )

        return _resource_to_response(resource)
    except (LegalHoldNotFoundError, LegalHoldAlreadyReleasedError) as e:
        raise _handle_legal_hold_error(e)


@router.delete(
    "/{hold_id}/resources",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Remove resource from hold",
    description="Remove a resource from a legal hold.",
    responses={
        204: {"description": "Resource removed from hold"},
        404: {"description": "Legal hold or resource not found"},
    },
)
async def remove_resource_from_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: RemoveResourceRequest,
) -> None:
    """Remove a resource from a legal hold."""
    try:
        removed = await legal_hold_service.remove_resource_from_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            resource_type=request_data.resource_type,
            resource_id=request_data.resource_id,
            removed_by_user_id=current_user.user_id,
            reason=request_data.reason,
        )

        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "RESOURCE_NOT_FOUND", "message": "Resource not found in this legal hold"},
            )

        logger.info(
            "resource_removed_from_hold",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "resource_type": request_data.resource_type,
                "resource_id": str(request_data.resource_id),
                "removed_by": str(current_user.user_id),
            },
        )

    except LegalHoldNotFoundError as e:
        raise _handle_legal_hold_error(e)


# ---------------------------------------------------------------------------
# Custodian Management Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{hold_id}/custodians",
    response_model=LegalHoldResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add custodian to hold",
    description="Add a custodian to a legal hold. Custodians are responsible for preserving data.",
    responses={
        201: {"description": "Custodian added"},
        400: {"description": "Hold is released"},
        404: {"description": "Legal hold not found"},
    },
)
async def add_custodian(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: AddCustodianRequest,
) -> LegalHoldResponse:
    """Add a custodian to a legal hold."""
    try:
        hold = await legal_hold_service.add_custodian(
            workspace_id=workspace_id,
            hold_id=hold_id,
            user_id=request_data.user_id,
            name=request_data.name,
            email=request_data.email,
            added_by_user_id=current_user.user_id,
        )

        logger.info(
            "custodian_added_to_hold",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "custodian_user_id": str(request_data.user_id),
                "added_by": str(current_user.user_id),
            },
        )

        return _model_to_response(hold)
    except (LegalHoldNotFoundError, LegalHoldAlreadyReleasedError) as e:
        raise _handle_legal_hold_error(e)


@router.post(
    "/{hold_id}/custodians/{user_id}/acknowledge",
    response_model=CustodianAcknowledgmentResponse,
    summary="Record custodian acknowledgment",
    description="Record a custodian's acknowledgment of a legal hold.",
    responses={
        200: {"description": "Acknowledgment recorded"},
        404: {"description": "Legal hold not found"},
    },
)
async def acknowledge_custodian(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    hold_id: Annotated[UUID, Path(..., description="Hold ID")],
    user_id: Annotated[UUID, Path(..., description="Custodian user ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
    request_data: AcknowledgeCustodianRequest,
) -> CustodianAcknowledgmentResponse:
    """Record a custodian's acknowledgment of a legal hold."""
    try:
        ack = await legal_hold_service.record_custodian_acknowledgment(
            workspace_id=workspace_id,
            hold_id=hold_id,
            user_id=user_id,
            method=request_data.method,
        )

        logger.info(
            "custodian_acknowledged_hold",
            extra={
                "workspace_id": str(workspace_id),
                "hold_id": str(hold_id),
                "custodian_user_id": str(user_id),
            },
        )

        return CustodianAcknowledgmentResponse(
            user_id=ack.user_id,
            acknowledged_at=ack.acknowledged_at,
            method=ack.method,
            hold_id=ack.hold_id,
        )
    except LegalHoldNotFoundError as e:
        raise _handle_legal_hold_error(e)


# ---------------------------------------------------------------------------
# User-specific Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/user/{user_id}/holds",
    response_model=list[LegalHoldSummaryResponse],
    summary="Get holds for user",
    description="Get all active legal holds that include a specific user.",
    responses={
        200: {"description": "List of legal holds covering the user"},
    },
)
async def get_holds_for_user(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    user_id: Annotated[UUID, Path(..., description="User ID to check")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
) -> list[LegalHoldSummaryResponse]:
    """Get all active legal holds that include a user."""
    holds = await legal_hold_service.get_holds_for_user(
        workspace_id=workspace_id,
        user_id=user_id,
    )

    return [_summary_to_response(hold) for hold in holds]


@router.get(
    "/user/{user_id}/status",
    response_model=dict[str, Any],
    summary="Check if user is under hold",
    description="Check if a user is under any active legal hold.",
    responses={
        200: {"description": "User hold status"},
    },
)
async def check_user_under_hold(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    user_id: Annotated[UUID, Path(..., description="User ID to check")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    legal_hold_service: LegalHoldServiceDep,
) -> dict[str, Any]:
    """Check if a user is under any active legal hold."""
    is_under_hold = await legal_hold_service.is_user_under_hold(
        workspace_id=workspace_id,
        user_id=user_id,
    )

    return {
        "user_id": str(user_id),
        "is_under_hold": is_under_hold,
    }
