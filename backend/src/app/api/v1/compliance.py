"""Data Subject Requests API endpoints for compliance.

Provides endpoints for managing GDPR/CCPA/DPDP data subject requests:
- Submit new data subject requests (access, erasure, portability, etc.)
- List and filter data subject requests
- View request details
- Update request status
- Acknowledge, process, complete, reject, cancel requests
- Extend deadlines
- Verify identity
- Assign requests
- Get DSR statistics

All routes prefixed with /api/v1/workspaces/{workspace_id}/compliance/data-subject-requests.
Implements Audit & Compliance System requirements.

Feature: Audit & Compliance System
Task: T012 - Create data subject requests API endpoints
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from pydantic import BaseModel, EmailStr, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import PaginatedResponse
from app.models.compliance import (
    DSRPriority,
    DSRRequestType,
    DSRSource,
    DSRStatus,
    DSRSubjectType,
    DSRVerificationStatus,
    DataSubjectRequest,
    DataSubjectRequestSummary,
    DataSubjectRequestUpdate,
)
from app.services.compliance_service import (
    ComplianceError,
    ComplianceService,
    DSRAlreadyCompletedError,
    DSRBlockedByLegalHoldError,
    DSRDuplicateRequestError,
    DSRInvalidStatusTransitionError,
    DSRNotFoundError,
    DSRVerificationRequiredError,
    get_compliance_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class CreateDataSubjectRequestRequest(BaseModel):
    """Request to create a new data subject request."""

    subject_email: EmailStr = Field(..., description="Email address of the data subject")
    subject_name: Optional[str] = Field(None, max_length=255, description="Name of the data subject")
    subject_user_id: Optional[UUID] = Field(None, description="User ID if subject is a platform user")
    subject_type: DSRSubjectType = Field(DSRSubjectType.USER, description="Type of data subject")
    request_type: DSRRequestType = Field(..., description="Type of data subject request")
    request_source: DSRSource = Field(DSRSource.USER_PORTAL, description="Source of the request")
    description: Optional[str] = Field(None, description="Additional details or notes")
    priority: DSRPriority = Field(DSRPriority.NORMAL, description="Priority level")
    scope: dict[str, Any] = Field(default_factory=dict, description="Scope of data to include")
    regulation: str = Field("gdpr", description="Applicable regulation (gdpr, ccpa, dpdp)")
    skip_duplicate_check: bool = Field(False, description="Skip duplicate request check")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class UpdateDataSubjectRequestRequest(BaseModel):
    """Request to update a data subject request."""

    status: Optional[DSRStatus] = Field(None, description="New status")
    status_reason: Optional[str] = Field(None, description="Reason for status change")
    priority: Optional[DSRPriority] = Field(None, description="New priority level")
    assigned_to_user_id: Optional[UUID] = Field(None, description="User to assign to")
    internal_notes: Optional[str] = Field(None, description="Internal processing notes")
    scope: Optional[dict[str, Any]] = Field(None, description="Updated scope")
    metadata: Optional[dict[str, Any]] = Field(None, description="Updated metadata")


class AcknowledgeRequestRequest(BaseModel):
    """Request to acknowledge a data subject request."""

    internal_notes: Optional[str] = Field(None, description="Internal notes")


class CompleteRequestRequest(BaseModel):
    """Request to complete a data subject request."""

    export_storage_key: Optional[str] = Field(None, description="Storage key for data export")
    export_expires_at: Optional[datetime] = Field(None, description="When export download expires")
    partial: bool = Field(False, description="Mark as partially completed")
    completion_notes: Optional[str] = Field(None, description="Completion notes")


class RejectRequestRequest(BaseModel):
    """Request to reject a data subject request."""

    rejection_reason: str = Field(..., min_length=10, description="Reason for rejection")


class CancelRequestRequest(BaseModel):
    """Request to cancel a data subject request."""

    cancellation_reason: str = Field(..., min_length=10, description="Reason for cancellation")


class ExtendDeadlineRequest(BaseModel):
    """Request to extend a data subject request deadline."""

    extension_days: int = Field(..., ge=1, le=90, description="Number of days to extend")
    extension_reason: str = Field(..., min_length=10, description="Reason for extension")
    regulation: str = Field("gdpr", description="Applicable regulation")


class VerifyIdentityRequest(BaseModel):
    """Request to verify identity for a data subject request."""

    verification_method: str = Field(..., max_length=30, description="Method used for verification")
    verified: bool = Field(True, description="Whether verification was successful")
    verification_notes: Optional[str] = Field(None, description="Notes on verification")


class AssignRequestRequest(BaseModel):
    """Request to assign a data subject request."""

    assigned_to_user_id: UUID = Field(..., description="User to assign the request to")


class DataSubjectRequestResponse(BaseModel):
    """Full data subject request response."""

    request_id: UUID
    workspace_id: UUID
    request_number: str
    subject_user_id: Optional[UUID] = None
    subject_email: str
    subject_name: Optional[str] = None
    subject_type: DSRSubjectType
    request_type: DSRRequestType
    request_source: DSRSource
    description: Optional[str] = None
    status: DSRStatus
    status_reason: Optional[str] = None
    priority: DSRPriority
    assigned_to_user_id: Optional[UUID] = None
    submitted_at: datetime
    deadline_at: datetime
    extended_deadline_at: Optional[datetime] = None
    extension_reason: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    processing_started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    verification_status: DSRVerificationStatus
    verification_method: Optional[str] = None
    verified_at: Optional[datetime] = None
    verified_by_user_id: Optional[UUID] = None
    export_job_id: Optional[UUID] = None
    export_storage_key: Optional[str] = None
    export_expires_at: Optional[datetime] = None
    export_download_count: int = 0
    blocked_by_legal_hold_id: Optional[UUID] = None
    blocked_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None
    scope: dict[str, Any] = Field(default_factory=dict)
    internal_notes: Optional[str] = None
    status_history: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    requester_ip_address: Optional[str] = None
    requester_user_agent: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    days_until_deadline: int = 0


class DataSubjectRequestSummaryResponse(BaseModel):
    """Lightweight data subject request summary."""

    request_id: UUID
    workspace_id: UUID
    request_number: str
    subject_email: str
    request_type: DSRRequestType
    status: DSRStatus
    priority: DSRPriority
    submitted_at: datetime
    deadline_at: datetime
    days_until_deadline: int


class DataSubjectRequestListResponse(PaginatedResponse):
    """Paginated list of data subject requests."""

    items: list[DataSubjectRequestSummaryResponse]


class DSRStatsResponse(BaseModel):
    """Data subject request statistics."""

    total: int
    pending: int
    in_progress: int
    completed: int
    overdue: int
    blocked: int
    average_completion_days: float


class DSRRequestTypesResponse(BaseModel):
    """Available DSR request types."""

    request_types: list[dict[str, str]]


class DSRStatusesResponse(BaseModel):
    """Available DSR statuses."""

    statuses: list[dict[str, str]]


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def _get_compliance_service() -> ComplianceService:
    """Get compliance service instance."""
    return get_compliance_service()


ComplianceServiceDep = Annotated[ComplianceService, Depends(_get_compliance_service)]


def _model_to_response(model: DataSubjectRequest) -> DataSubjectRequestResponse:
    """Convert a DataSubjectRequest model to a response."""
    now = datetime.now(timezone.utc)
    deadline = model.extended_deadline_at or model.deadline_at
    days_until = (deadline - now).days if deadline else 0

    return DataSubjectRequestResponse(
        request_id=model.request_id,
        workspace_id=model.workspace_id,
        request_number=model.request_number,
        subject_user_id=model.subject_user_id,
        subject_email=model.subject_email,
        subject_name=model.subject_name,
        subject_type=model.subject_type,
        request_type=model.request_type,
        request_source=model.request_source,
        description=model.description,
        status=model.status,
        status_reason=model.status_reason,
        priority=model.priority,
        assigned_to_user_id=model.assigned_to_user_id,
        submitted_at=model.submitted_at,
        deadline_at=model.deadline_at,
        extended_deadline_at=model.extended_deadline_at,
        extension_reason=model.extension_reason,
        acknowledged_at=model.acknowledged_at,
        processing_started_at=model.processing_started_at,
        completed_at=model.completed_at,
        verification_status=model.verification_status,
        verification_method=model.verification_method,
        verified_at=model.verified_at,
        verified_by_user_id=model.verified_by_user_id,
        export_job_id=model.export_job_id,
        export_storage_key=model.export_storage_key,
        export_expires_at=model.export_expires_at,
        export_download_count=model.export_download_count,
        blocked_by_legal_hold_id=model.blocked_by_legal_hold_id,
        blocked_at=model.blocked_at,
        blocked_reason=model.blocked_reason,
        scope=model.scope,
        internal_notes=model.internal_notes,
        status_history=model.status_history,
        metadata=model.metadata,
        requester_ip_address=model.requester_ip_address,
        requester_user_agent=model.requester_user_agent,
        created_at=model.created_at,
        updated_at=model.updated_at,
        days_until_deadline=days_until,
    )


def _summary_to_response(
    summary: DataSubjectRequestSummary,
) -> DataSubjectRequestSummaryResponse:
    """Convert a DataSubjectRequestSummary to a response."""
    return DataSubjectRequestSummaryResponse(
        request_id=summary.request_id,
        workspace_id=summary.workspace_id,
        request_number=summary.request_number,
        subject_email=summary.subject_email,
        request_type=summary.request_type,
        status=summary.status,
        priority=summary.priority,
        submitted_at=summary.submitted_at,
        deadline_at=summary.deadline_at,
        days_until_deadline=summary.days_until_deadline,
    )


def _handle_compliance_error(error: ComplianceError) -> HTTPException:
    """Convert a ComplianceError to an HTTPException."""
    return HTTPException(
        status_code=error.status,
        detail={"code": error.code, "message": str(error)},
    )


# ---------------------------------------------------------------------------
# List Endpoints (Static routes first)
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=DataSubjectRequestListResponse,
    summary="List data subject requests",
    description="""
    List data subject requests with filtering and pagination.

    Supports filtering by status, request type, priority, subject email,
    and overdue status.
    """,
    responses={
        200: {"description": "List of data subject requests"},
        403: {"description": "Access denied"},
    },
)
async def list_data_subject_requests(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    status_filter: Annotated[
        DSRStatus | None, Query(alias="status", description="Filter by status")
    ] = None,
    request_type: Annotated[
        DSRRequestType | None, Query(description="Filter by request type")
    ] = None,
    priority: Annotated[
        DSRPriority | None, Query(description="Filter by priority")
    ] = None,
    subject_email: Annotated[
        str | None, Query(description="Filter by subject email (partial match)")
    ] = None,
    overdue_only: Annotated[
        bool, Query(description="Only return overdue requests")
    ] = False,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> DataSubjectRequestListResponse:
    """List data subject requests with filtering and pagination."""
    result = await compliance_service.list_data_subject_requests(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        status=status_filter,
        request_type=request_type,
        priority=priority,
        subject_email=subject_email,
        overdue_only=overdue_only,
    )

    items = [_summary_to_response(item) for item in result.items]

    logger.info(
        "data_subject_requests_listed",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "result_count": len(items),
            "total": result.total,
        },
    )

    return DataSubjectRequestListResponse(
        items=items,
        total=result.total,
        page=result.page,
        per_page=result.limit,
        total_pages=result.total_pages,
    )


@router.get(
    "/stats",
    response_model=DSRStatsResponse,
    summary="Get DSR statistics",
    description="Get aggregated statistics for data subject requests.",
)
async def get_dsr_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
) -> DSRStatsResponse:
    """Get data subject request statistics."""
    stats = await compliance_service.get_stats(workspace_id)

    return DSRStatsResponse(
        total=stats.total,
        pending=stats.pending,
        in_progress=stats.in_progress,
        completed=stats.completed,
        overdue=stats.overdue,
        blocked=stats.blocked,
        average_completion_days=stats.average_completion_days,
    )


@router.get(
    "/overdue",
    response_model=DataSubjectRequestListResponse,
    summary="List overdue requests",
    description="List data subject requests that are past their deadline.",
)
async def list_overdue_requests(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> DataSubjectRequestListResponse:
    """List overdue data subject requests."""
    result = await compliance_service.get_overdue_requests(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
    )

    items = [_summary_to_response(item) for item in result.items]

    return DataSubjectRequestListResponse(
        items=items,
        total=result.total,
        page=result.page,
        per_page=result.limit,
        total_pages=result.total_pages,
    )


@router.get(
    "/request-types",
    response_model=DSRRequestTypesResponse,
    summary="List available request types",
    description="Get a list of all available data subject request types.",
)
async def list_request_types(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> DSRRequestTypesResponse:
    """List all available DSR request types."""
    request_types = [
        {"value": t.value, "label": t.value.replace("_", " ").title()}
        for t in DSRRequestType
    ]
    return DSRRequestTypesResponse(request_types=request_types)


@router.get(
    "/statuses",
    response_model=DSRStatusesResponse,
    summary="List available statuses",
    description="Get a list of all available data subject request statuses.",
)
async def list_statuses(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> DSRStatusesResponse:
    """List all available DSR statuses."""
    statuses = [
        {"value": s.value, "label": s.value.replace("_", " ").title()}
        for s in DSRStatus
    ]
    return DSRStatusesResponse(statuses=statuses)


# ---------------------------------------------------------------------------
# Create Endpoint
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=DataSubjectRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create data subject request",
    description="""
    Submit a new data subject request (GDPR/CCPA/DPDP).

    Request types:
    - access: Right to access personal data
    - rectification: Right to correct data
    - erasure: Right to be forgotten
    - portability: Right to data portability
    - restriction: Right to restrict processing
    - objection: Right to object to processing
    - opt_out_sale: CCPA opt-out of sale
    - disclosure: CCPA right to know

    The deadline is automatically calculated based on the regulation:
    - GDPR: 30 days
    - CCPA: 45 days
    - DPDP: 30 days
    """,
    responses={
        201: {"description": "Data subject request created"},
        400: {"description": "Invalid request data"},
        409: {"description": "Duplicate request exists"},
    },
)
async def create_data_subject_request(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: CreateDataSubjectRequestRequest,
    request: Request,
) -> DataSubjectRequestResponse:
    """Create a new data subject request."""
    # Extract request context
    requester_ip = request.client.host if request.client else None
    requester_user_agent = request.headers.get("user-agent")

    try:
        dsr = await compliance_service.create_data_subject_request(
            workspace_id=workspace_id,
            subject_email=request_data.subject_email,
            request_type=request_data.request_type,
            subject_name=request_data.subject_name,
            subject_user_id=request_data.subject_user_id,
            subject_type=request_data.subject_type,
            request_source=request_data.request_source,
            description=request_data.description,
            priority=request_data.priority,
            scope=request_data.scope,
            requester_ip_address=requester_ip,
            requester_user_agent=requester_user_agent,
            regulation=request_data.regulation,
            skip_duplicate_check=request_data.skip_duplicate_check,
            created_by_user_id=current_user.user_id,
            metadata=request_data.metadata,
        )

        logger.info(
            "data_subject_request_created",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(dsr.request_id),
                "request_number": dsr.request_number,
                "request_type": dsr.request_type.value,
                "created_by": str(current_user.user_id),
            },
        )

        return _model_to_response(dsr)

    except DSRDuplicateRequestError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": e.code,
                "message": str(e),
                "existing_request_id": str(e.existing_request_id),
            },
        )
    except ComplianceError as e:
        raise _handle_compliance_error(e)


# ---------------------------------------------------------------------------
# Detail/Action Endpoints (Parameterized routes last)
# ---------------------------------------------------------------------------


@router.get(
    "/by-number/{request_number}",
    response_model=DataSubjectRequestResponse,
    summary="Get request by number",
    description="Get a data subject request by its human-readable number.",
    responses={
        200: {"description": "Data subject request details"},
        404: {"description": "Request not found"},
    },
)
async def get_request_by_number(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_number: Annotated[str, Path(..., description="Request number (e.g., DSR-2026-00001)")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
) -> DataSubjectRequestResponse:
    """Get a data subject request by its number."""
    try:
        dsr = await compliance_service.get_data_subject_request_by_number(
            workspace_id=workspace_id,
            request_number=request_number,
        )
        return _model_to_response(dsr)
    except DSRNotFoundError as e:
        raise _handle_compliance_error(e)


@router.get(
    "/{request_id}",
    response_model=DataSubjectRequestResponse,
    summary="Get data subject request",
    description="Get details of a specific data subject request.",
    responses={
        200: {"description": "Data subject request details"},
        404: {"description": "Request not found"},
    },
)
async def get_data_subject_request(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
) -> DataSubjectRequestResponse:
    """Get a data subject request by ID."""
    try:
        dsr = await compliance_service.get_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
        )

        logger.info(
            "data_subject_request_retrieved",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "user_id": str(current_user.user_id),
            },
        )

        return _model_to_response(dsr)
    except DSRNotFoundError as e:
        raise _handle_compliance_error(e)


@router.patch(
    "/{request_id}",
    response_model=DataSubjectRequestResponse,
    summary="Update data subject request",
    description="Update a data subject request.",
    responses={
        200: {"description": "Request updated"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Request not found"},
    },
)
async def update_data_subject_request(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: UpdateDataSubjectRequestRequest,
) -> DataSubjectRequestResponse:
    """Update a data subject request."""
    try:
        update = DataSubjectRequestUpdate(
            status=request_data.status,
            status_reason=request_data.status_reason,
            priority=request_data.priority,
            assigned_to_user_id=request_data.assigned_to_user_id,
            internal_notes=request_data.internal_notes,
            scope=request_data.scope,
            metadata=request_data.metadata,
        )

        dsr = await compliance_service.update_data_subject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            update=update,
            updated_by_user_id=current_user.user_id,
        )

        logger.info(
            "data_subject_request_updated",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "user_id": str(current_user.user_id),
            },
        )

        return _model_to_response(dsr)
    except (DSRNotFoundError, DSRInvalidStatusTransitionError) as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/acknowledge",
    response_model=DataSubjectRequestResponse,
    summary="Acknowledge request",
    description="Acknowledge a data subject request.",
    responses={
        200: {"description": "Request acknowledged"},
        400: {"description": "Verification required or invalid transition"},
        404: {"description": "Request not found"},
    },
)
async def acknowledge_request(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: AcknowledgeRequestRequest,
) -> DataSubjectRequestResponse:
    """Acknowledge a data subject request."""
    try:
        dsr = await compliance_service.acknowledge_request(
            workspace_id=workspace_id,
            request_id=request_id,
            acknowledged_by_user_id=current_user.user_id,
            internal_notes=request_data.internal_notes,
        )

        logger.info(
            "data_subject_request_acknowledged",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "acknowledged_by": str(current_user.user_id),
            },
        )

        return _model_to_response(dsr)
    except (DSRNotFoundError, DSRVerificationRequiredError, DSRInvalidStatusTransitionError) as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/start-processing",
    response_model=DataSubjectRequestResponse,
    summary="Start processing",
    description="Start processing a data subject request.",
    responses={
        200: {"description": "Processing started"},
        400: {"description": "Invalid status transition"},
        404: {"description": "Request not found"},
        409: {"description": "Blocked by legal hold"},
    },
)
async def start_processing(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
) -> DataSubjectRequestResponse:
    """Start processing a data subject request."""
    try:
        dsr = await compliance_service.start_processing(
            workspace_id=workspace_id,
            request_id=request_id,
            processor_user_id=current_user.user_id,
        )

        logger.info(
            "data_subject_request_processing_started",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "processor": str(current_user.user_id),
            },
        )

        return _model_to_response(dsr)
    except DSRBlockedByLegalHoldError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": e.code,
                "message": str(e),
                "legal_hold_id": str(e.hold_id),
            },
        )
    except (DSRNotFoundError, DSRInvalidStatusTransitionError) as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/complete",
    response_model=DataSubjectRequestResponse,
    summary="Complete request",
    description="Complete a data subject request.",
    responses={
        200: {"description": "Request completed"},
        400: {"description": "Already completed or invalid transition"},
        404: {"description": "Request not found"},
    },
)
async def complete_request(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: CompleteRequestRequest,
) -> DataSubjectRequestResponse:
    """Complete a data subject request."""
    try:
        dsr = await compliance_service.complete_request(
            workspace_id=workspace_id,
            request_id=request_id,
            completed_by_user_id=current_user.user_id,
            export_storage_key=request_data.export_storage_key,
            export_expires_at=request_data.export_expires_at,
            partial=request_data.partial,
            completion_notes=request_data.completion_notes,
        )

        logger.info(
            "data_subject_request_completed",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "completed_by": str(current_user.user_id),
                "partial": request_data.partial,
            },
        )

        return _model_to_response(dsr)
    except (DSRNotFoundError, DSRAlreadyCompletedError, DSRInvalidStatusTransitionError) as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/reject",
    response_model=DataSubjectRequestResponse,
    summary="Reject request",
    description="Reject a data subject request.",
    responses={
        200: {"description": "Request rejected"},
        400: {"description": "Already completed or invalid transition"},
        404: {"description": "Request not found"},
    },
)
async def reject_request(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: RejectRequestRequest,
) -> DataSubjectRequestResponse:
    """Reject a data subject request."""
    try:
        dsr = await compliance_service.reject_request(
            workspace_id=workspace_id,
            request_id=request_id,
            rejected_by_user_id=current_user.user_id,
            rejection_reason=request_data.rejection_reason,
        )

        logger.info(
            "data_subject_request_rejected",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "rejected_by": str(current_user.user_id),
            },
        )

        return _model_to_response(dsr)
    except (DSRNotFoundError, DSRAlreadyCompletedError, DSRInvalidStatusTransitionError) as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/cancel",
    response_model=DataSubjectRequestResponse,
    summary="Cancel request",
    description="Cancel a data subject request.",
    responses={
        200: {"description": "Request cancelled"},
        400: {"description": "Already completed or invalid transition"},
        404: {"description": "Request not found"},
    },
)
async def cancel_request(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: CancelRequestRequest,
) -> DataSubjectRequestResponse:
    """Cancel a data subject request."""
    try:
        dsr = await compliance_service.cancel_request(
            workspace_id=workspace_id,
            request_id=request_id,
            cancelled_by_user_id=current_user.user_id,
            cancellation_reason=request_data.cancellation_reason,
        )

        logger.info(
            "data_subject_request_cancelled",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "cancelled_by": str(current_user.user_id),
            },
        )

        return _model_to_response(dsr)
    except (DSRNotFoundError, DSRAlreadyCompletedError, DSRInvalidStatusTransitionError) as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/extend-deadline",
    response_model=DataSubjectRequestResponse,
    summary="Extend deadline",
    description="Extend the deadline for a data subject request.",
    responses={
        200: {"description": "Deadline extended"},
        400: {"description": "Extension exceeds maximum allowed"},
        404: {"description": "Request not found"},
    },
)
async def extend_deadline(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: ExtendDeadlineRequest,
) -> DataSubjectRequestResponse:
    """Extend the deadline for a data subject request."""
    try:
        dsr = await compliance_service.extend_deadline(
            workspace_id=workspace_id,
            request_id=request_id,
            extended_by_user_id=current_user.user_id,
            extension_days=request_data.extension_days,
            extension_reason=request_data.extension_reason,
            regulation=request_data.regulation,
        )

        logger.info(
            "data_subject_request_deadline_extended",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "extended_by": str(current_user.user_id),
                "extension_days": request_data.extension_days,
            },
        )

        return _model_to_response(dsr)
    except (DSRNotFoundError, ComplianceError) as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/verify-identity",
    response_model=DataSubjectRequestResponse,
    summary="Verify identity",
    description="Record identity verification for a data subject request.",
    responses={
        200: {"description": "Identity verification recorded"},
        404: {"description": "Request not found"},
    },
)
async def verify_identity(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: VerifyIdentityRequest,
) -> DataSubjectRequestResponse:
    """Record identity verification for a data subject request."""
    try:
        dsr = await compliance_service.verify_identity(
            workspace_id=workspace_id,
            request_id=request_id,
            verified_by_user_id=current_user.user_id,
            verification_method=request_data.verification_method,
            verified=request_data.verified,
            verification_notes=request_data.verification_notes,
        )

        logger.info(
            "data_subject_request_identity_verified",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "verified_by": str(current_user.user_id),
                "verified": request_data.verified,
                "method": request_data.verification_method,
            },
        )

        return _model_to_response(dsr)
    except DSRNotFoundError as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/assign",
    response_model=DataSubjectRequestResponse,
    summary="Assign request",
    description="Assign a data subject request to a user.",
    responses={
        200: {"description": "Request assigned"},
        404: {"description": "Request not found"},
    },
)
async def assign_request(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
    request_data: AssignRequestRequest,
) -> DataSubjectRequestResponse:
    """Assign a data subject request to a user."""
    try:
        dsr = await compliance_service.assign_request(
            workspace_id=workspace_id,
            request_id=request_id,
            assigned_to_user_id=request_data.assigned_to_user_id,
            assigned_by_user_id=current_user.user_id,
        )

        logger.info(
            "data_subject_request_assigned",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "assigned_to": str(request_data.assigned_to_user_id),
                "assigned_by": str(current_user.user_id),
            },
        )

        return _model_to_response(dsr)
    except DSRNotFoundError as e:
        raise _handle_compliance_error(e)


@router.post(
    "/{request_id}/record-download",
    response_model=DataSubjectRequestResponse,
    summary="Record export download",
    description="Record when the data export has been downloaded.",
    responses={
        200: {"description": "Download recorded"},
        404: {"description": "Request not found"},
    },
)
async def record_export_download(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request_id: Annotated[UUID, Path(..., description="Request ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    compliance_service: ComplianceServiceDep,
) -> DataSubjectRequestResponse:
    """Record an export download for a data subject request."""
    try:
        dsr = await compliance_service.record_export_download(
            workspace_id=workspace_id,
            request_id=request_id,
        )

        logger.info(
            "data_subject_request_export_downloaded",
            extra={
                "workspace_id": str(workspace_id),
                "request_id": str(request_id),
                "user_id": str(current_user.user_id),
                "download_count": dsr.export_download_count,
            },
        )

        return _model_to_response(dsr)
    except DSRNotFoundError as e:
        raise _handle_compliance_error(e)
