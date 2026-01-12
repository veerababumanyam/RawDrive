"""Client CRM API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/clients.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Path, Query, Response, UploadFile, status

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.client_schemas import (
    ActivityCreateResponse,
    ActivitySummaryResponse,
    AddAddressRequest,
    AddContactRequest,
    AddNoteRequest,
    AddTagsRequest,
    AddressCreateResponse,
    AvatarInfoResponse,
    AvatarSelectResponse,
    AvatarUploadResponse,
    ClientActivityListResponse,
    ClientAddressResponse,
    ClientAnalyticsResponse,
    ClientCommunicationListResponse,
    ClientContactResponse,
    ClientCreateResponse,
    ClientDeleteResponse,
    ClientDetailResponse,
    ClientListMetaResponse,
    ClientListResponse,
    ClientSearchResultResponse,
    ClientUpdateResponse,
    CommunicationCreateResponse,
    ContactCreateResponse,
    CreateClientRequest,
    CreateSmartListRequest,
    DashboardAnalyticsResponse,
    DetectDuplicatesRequest,
    DetectDuplicatesResponse,
    EngagementMetricsResponse,
    ExportClientsResponse,
    GalleryLinkCreateResponse,
    GalleryLinkDetailResponse,
    GalleryLinkedClientsResponse,
    GalleryRoleUpdateResponse,
    ImportClientsResponse,
    ImportTemplateResponse,
    LinkGalleryRequest,
    LogCommunicationRequest,
    MergeClientsRequest,
    MergeClientsResponse,
    RecordActivityRequest,
    ReferralAnalyticsResponse,
    RevenueAnalyticsResponse,
    SelectGalleryPhotoRequest,
    SmartListEvaluationResponse,
    SmartListResponse,
    UpdateAddressRequest,
    UpdateClientRequest,
    UpdateContactRequest,
    UpdateGalleryRoleRequest,
    UpdateSmartListRequest,
)
from app.api.schemas import ErrorResponse, MessageResponse
from app.api.exceptions import (
    AppError,
    ForbiddenError,
    InternalError,
    NotFoundError,
    ValidationAppError,
)
from app.services.client_service import get_client_service
from app.services.contact_service import get_contact_service
from app.services.address_service import get_address_service
from app.services.avatar_service import get_avatar_service
from app.services.gallery_link_service import get_gallery_link_service
from app.services.activity_service import get_activity_service
from app.services.client_exceptions import (
    ActivityNotFoundError,
    AddressNotFoundError,
    AddressValidationError,
    AvatarAssetNotInGalleryError,
    AvatarFileTooLargeError,
    AvatarInvalidFormatError,
    AvatarUploadError,
    ClientActiveProofingError,
    ClientDeletionError,
    ClientDuplicateEmailError,
    ClientDuplicatePhoneError,
    ClientError,
    ClientNotFoundError,
    ClientValidationError,
    ContactDuplicateError,
    ContactInvalidFormatError,
    ContactLastMethodError,
    ContactNotFoundError,
    ContactPrimaryExistsError,
    GalleryAlreadyLinkedError,
    GalleryLinkNotFoundError,
    GalleryNotFoundForLinkError,
    TagAlreadyAssignedError,
    TagNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Client CRUD endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=ClientListResponse,
    status_code=status.HTTP_200_OK,
    summary="List clients",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def list_clients(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    sort: Annotated[str, Query(description="Sort field")] = "created_at",
    status_filter: Annotated[
        str | None, Query(alias="status", description="Filter by status")
    ] = None,
    tags: Annotated[
        list[str] | None, Query(description="Filter by tag IDs")
    ] = None,
    search: Annotated[
        str | None, Query(description="Search term")
    ] = None,
) -> ClientListResponse:
    """List all clients in a workspace with pagination, filtering, and search."""
    service = get_client_service()
    try:
        result = await service.list_clients(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            sort=sort,
            status=status_filter,
            tags=tags,
            search=search,
        )

        # Convert to response model
        return ClientListResponse(
            clients=result["clients"],
            meta=ClientListMetaResponse(
                page=result["meta"]["page"],
                limit=result["meta"]["limit"],
                total=result["meta"]["total"],
                total_pages=result["meta"]["total_pages"],
            ),
        )
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to list clients")
        raise InternalError("Failed to list clients")


@router.post(
    "",
    response_model=ClientCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create client",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        409: {"model": ErrorResponse, "description": "Duplicate detected"},
    },
)
async def create_client(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateClientRequest,
) -> ClientCreateResponse:
    """Create a new client in the workspace."""
    service = get_client_service()
    try:
        # Log sanitized request for debugging
        logger.info(
            "Creating client",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "first_name": request.first_name,
                "has_date_of_birth": request.date_of_birth is not None,
                "has_anniversary_date": request.anniversary_date is not None,
                "has_referred_by": request.referred_by_client_id is not None,
            },
        )
        
        result = await service.create_client(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            full_name=request.full_name,
            first_name=request.first_name,
            last_name=request.last_name,
            nickname=request.nickname,
            job_title=request.job_title,
            organization=request.organization,
            language=request.language,
            timezone=request.timezone,
            date_of_birth=request.date_of_birth,
            anniversary_date=request.anniversary_date,
            internal_notes=request.internal_notes,
            referred_by_client_id=request.referred_by_client_id,
        )
        return ClientCreateResponse(**result)
    except ClientDuplicateEmailError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
            details=e.details,
        )
    except ClientDuplicatePhoneError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
            details=e.details,
        )
    except ClientValidationError as e:
        raise ValidationAppError(str(e))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception(
            "Unexpected error creating client",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise InternalError("Failed to create client")


@router.get(
    "/search",
    response_model=list[ClientSearchResultResponse],
    status_code=status.HTTP_200_OK,
    summary="Search clients",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def search_clients(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    q: Annotated[str, Query(min_length=1, description="Search query")] = "",
    limit: Annotated[int, Query(ge=1, le=50, description="Max results")] = 20,
) -> list[ClientSearchResultResponse]:
    """Search clients by name, email, phone, or organization."""
    service = get_client_service()
    try:
        results = await service.search_clients(
            workspace_id=workspace_id,
            query=q,
            limit=limit,
        )
        return [ClientSearchResultResponse(**r) for r in results]
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to search clients")
        raise InternalError("Failed to search clients")


# ---------------------------------------------------------------------------
# Analytics endpoints (must be before /{client_id} to avoid route conflicts)
# ---------------------------------------------------------------------------


@router.get(
    "/analytics",
    response_model=ClientAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get client analytics",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_client_analytics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[datetime | None, Query(description="Start date")] = None,
    end_date: Annotated[datetime | None, Query(description="End date")] = None,
) -> ClientAnalyticsResponse:
    """Get client overview analytics with growth trends."""
    from app.services.analytics_service import get_analytics_service

    service = get_analytics_service()
    try:
        result = await service.get_client_analytics(
            workspace_id=workspace_id,
            start_date=start_date,
            end_date=end_date,
        )
        return ClientAnalyticsResponse(**result)
    except Exception as e:
        logger.exception("Failed to get client analytics")
        raise InternalError("Failed to get client analytics")


@router.get(
    "/analytics/engagement",
    response_model=EngagementMetricsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get engagement metrics",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_engagement_metrics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[datetime | None, Query(description="Start date")] = None,
    end_date: Annotated[datetime | None, Query(description="End date")] = None,
) -> EngagementMetricsResponse:
    """Get client engagement metrics."""
    from app.services.analytics_service import get_analytics_service

    service = get_analytics_service()
    try:
        result = await service.get_engagement_metrics(
            workspace_id=workspace_id,
            start_date=start_date,
            end_date=end_date,
        )
        return EngagementMetricsResponse(**result)
    except Exception as e:
        logger.exception("Failed to get engagement metrics")
        raise InternalError("Failed to get engagement metrics")


@router.get(
    "/analytics/referrals",
    response_model=ReferralAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get referral analytics",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_referral_analytics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> ReferralAnalyticsResponse:
    """Get referral source analytics."""
    from app.services.analytics_service import get_analytics_service

    service = get_analytics_service()
    try:
        result = await service.get_referral_analytics(workspace_id=workspace_id)
        return ReferralAnalyticsResponse(**result)
    except Exception as e:
        logger.exception("Failed to get referral analytics")
        raise InternalError("Failed to get referral analytics")


@router.get(
    "/analytics/revenue",
    response_model=RevenueAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get revenue per client",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_revenue_per_client(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[datetime | None, Query(description="Start date")] = None,
    end_date: Annotated[datetime | None, Query(description="End date")] = None,
) -> RevenueAnalyticsResponse:
    """Get revenue metrics per client."""
    from app.services.analytics_service import get_analytics_service

    service = get_analytics_service()
    try:
        result = await service.get_revenue_per_client(
            workspace_id=workspace_id,
            start_date=start_date,
            end_date=end_date,
        )
        return RevenueAnalyticsResponse(**result)
    except Exception as e:
        logger.exception("Failed to get revenue per client")
        raise InternalError("Failed to get revenue per client")


@router.get(
    "/analytics/dashboard",
    response_model=DashboardAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get dashboard analytics",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_dashboard_analytics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> DashboardAnalyticsResponse:
    """Get combined dashboard analytics for CRM overview."""
    from app.services.analytics_service import get_analytics_service

    service = get_analytics_service()
    try:
        result = await service.get_dashboard_analytics(workspace_id=workspace_id)
        return DashboardAnalyticsResponse(**result)
    except Exception as e:
        logger.exception("Failed to get dashboard analytics")
        raise InternalError("Failed to get dashboard analytics")


# ---------------------------------------------------------------------------
# Client detail endpoints (/{client_id} routes)
# ---------------------------------------------------------------------------


@router.get(
    "/{client_id}",
    response_model=ClientDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get client",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_client(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    include_contacts: Annotated[bool, Query(description="Include contacts")] = True,
    include_addresses: Annotated[bool, Query(description="Include addresses")] = True,
    include_tags: Annotated[bool, Query(description="Include tags")] = True,
    include_galleries: Annotated[bool, Query(description="Include linked galleries")] = True,
    include_stats: Annotated[bool, Query(description="Include stats")] = True,
) -> ClientDetailResponse:
    """Get client details with optional related data."""
    service = get_client_service()
    try:
        result = await service.get_client(
            workspace_id=workspace_id,
            client_id=client_id,
            include_contacts=include_contacts,
            include_addresses=include_addresses,
            include_tags=include_tags,
            include_galleries=include_galleries,
            include_stats=include_stats,
        )
        return ClientDetailResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get client")
        raise InternalError("Failed to get client")


@router.patch(
    "/{client_id}",
    response_model=ClientUpdateResponse,
    status_code=status.HTTP_200_OK,
    summary="Update client",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def update_client(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: UpdateClientRequest,
) -> ClientUpdateResponse:
    """Update client profile."""
    service = get_client_service()
    try:
        updates = request.model_dump(exclude_unset=True)
        result = await service.update_client(
            workspace_id=workspace_id,
            client_id=client_id,
            **updates,
        )
        return ClientUpdateResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientValidationError as e:
        raise ValidationAppError(str(e))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to update client")
        raise InternalError("Failed to update client")


@router.delete(
    "/{client_id}",
    response_model=ClientDeleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete client",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
        422: {"model": ErrorResponse, "description": "Active proofing sessions"},
    },
)
async def delete_client(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
) -> ClientDeleteResponse:
    """Delete a client and unlink all galleries."""
    service = get_client_service()
    try:
        result = await service.delete_client(
            workspace_id=workspace_id,
            client_id=client_id,
        )
        return ClientDeleteResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientActiveProofingError as e:
        raise ValidationAppError(e.user_message)
    except ClientDeletionError as e:
        raise ValidationAppError(e.user_message)
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to delete client")
        raise InternalError("Failed to delete client")


# ---------------------------------------------------------------------------
# Contact endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{client_id}/contacts",
    response_model=ContactCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add contact",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
        409: {"model": ErrorResponse, "description": "Duplicate contact"},
    },
)
async def add_contact(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: AddContactRequest,
) -> ContactCreateResponse:
    """Add a contact method to a client."""
    service = get_client_service()
    try:
        result = await service.add_contact(
            workspace_id=workspace_id,
            client_id=client_id,
            contact_type=request.contact_type,
            value=request.value,
            contact_subtype=request.contact_subtype,
            is_primary=request.is_primary,
        )
        return ContactCreateResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ContactDuplicateError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except ContactInvalidFormatError as e:
        raise ValidationAppError(e.user_message)
    except ContactPrimaryExistsError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to add contact")
        raise InternalError("Failed to add contact")


@router.delete(
    "/{client_id}/contacts/{contact_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete contact",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Contact not found"},
        422: {"model": ErrorResponse, "description": "Last contact method"},
    },
)
async def delete_contact(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    contact_id: Annotated[UUID, Path(..., description="Contact ID")],
) -> MessageResponse:
    """Delete a contact method from a client."""
    service = get_client_service()
    try:
        result = await service.delete_contact(
            workspace_id=workspace_id,
            client_id=client_id,
            contact_id=contact_id,
        )
        return MessageResponse(message=result["message"])
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ContactNotFoundError as e:
        raise NotFoundError("Contact", str(contact_id))
    except ContactLastMethodError as e:
        raise ValidationAppError(e.user_message)
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to delete contact")
        raise InternalError("Failed to delete contact")


# ---------------------------------------------------------------------------
# Gallery link endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{client_id}/galleries",
    response_model=GalleryLinkCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Link gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client or gallery not found"},
        409: {"model": ErrorResponse, "description": "Already linked"},
    },
)
async def link_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: LinkGalleryRequest,
) -> GalleryLinkCreateResponse:
    """Link a client to a gallery."""
    service = get_gallery_link_service()
    try:
        result = await service.link_gallery(
            workspace_id=workspace_id,
            client_id=client_id,
            gallery_id=request.gallery_id,
            role=request.role,
            user_id=current_user.user_id,
        )
        return GalleryLinkCreateResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except GalleryNotFoundForLinkError as e:
        raise NotFoundError("Gallery", str(request.gallery_id))
    except GalleryAlreadyLinkedError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to link gallery")
        raise InternalError("Failed to link gallery")


@router.delete(
    "/{client_id}/galleries/{gallery_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Unlink gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Link not found"},
    },
)
async def unlink_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
) -> MessageResponse:
    """Unlink a client from a gallery."""
    service = get_gallery_link_service()
    try:
        result = await service.unlink_gallery(
            workspace_id=workspace_id,
            client_id=client_id,
            gallery_id=gallery_id,
            user_id=current_user.user_id,
        )
        return MessageResponse(message=result["message"])
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except GalleryLinkNotFoundError as e:
        raise NotFoundError("Gallery link", str(gallery_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to unlink gallery")
        raise InternalError("Failed to unlink gallery")


@router.get(
    "/{client_id}/galleries",
    response_model=list[GalleryLinkDetailResponse],
    status_code=status.HTTP_200_OK,
    summary="Get linked galleries",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_linked_galleries(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    include_stats: Annotated[bool, Query(description="Include gallery stats")] = True,
) -> list[GalleryLinkDetailResponse]:
    """Get all galleries linked to a client with details and stats."""
    service = get_gallery_link_service()
    try:
        galleries = await service.get_linked_galleries(
            workspace_id=workspace_id,
            client_id=client_id,
            include_stats=include_stats,
        )
        return [GalleryLinkDetailResponse(**g) for g in galleries]
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get linked galleries")
        raise InternalError("Failed to get linked galleries")


@router.patch(
    "/{client_id}/galleries/{gallery_id}/role",
    response_model=GalleryRoleUpdateResponse,
    status_code=status.HTTP_200_OK,
    summary="Update gallery link role",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery link not found"},
    },
)
async def update_gallery_role(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: UpdateGalleryRoleRequest,
) -> GalleryRoleUpdateResponse:
    """Update the role for a client-gallery link."""
    service = get_gallery_link_service()
    try:
        result = await service.update_link_role(
            workspace_id=workspace_id,
            client_id=client_id,
            gallery_id=gallery_id,
            new_role=request.role,
            user_id=current_user.user_id,
        )
        return GalleryRoleUpdateResponse(**result)
    except GalleryLinkNotFoundError as e:
        raise NotFoundError("Gallery link", str(gallery_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to update gallery role")
        raise InternalError("Failed to update gallery role")


# ---------------------------------------------------------------------------
# Tag endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{client_id}/tags",
    response_model=list[dict],
    status_code=status.HTTP_201_CREATED,
    summary="Add tags",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client or tag not found"},
    },
)
async def add_tags(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: AddTagsRequest,
) -> list[dict]:
    """Add tags to a client."""
    service = get_client_service()
    try:
        result = await service.add_tags(
            workspace_id=workspace_id,
            client_id=client_id,
            tag_ids=request.tag_ids,
        )
        return result
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except TagNotFoundError as e:
        raise NotFoundError("Tag", str(e))
    except TagAlreadyAssignedError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to add tags")
        raise InternalError("Failed to add tags")


@router.delete(
    "/{client_id}/tags/{tag_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove tag",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client or tag not found"},
    },
)
async def remove_tag(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    tag_id: Annotated[UUID, Path(..., description="Tag ID")],
) -> MessageResponse:
    """Remove a tag from a client."""
    service = get_client_service()
    try:
        result = await service.remove_tag(
            workspace_id=workspace_id,
            client_id=client_id,
            tag_id=tag_id,
        )
        return MessageResponse(message=result["message"])
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except TagNotFoundError as e:
        raise NotFoundError("Tag", str(tag_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to remove tag")
        raise InternalError("Failed to remove tag")


# ---------------------------------------------------------------------------
# Activity & Communication endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{client_id}/activities",
    response_model=ClientActivityListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get activity timeline",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_activity_timeline(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    activity_type: Annotated[str | None, Query(description="Filter by activity type")] = None,
    entity_type: Annotated[str | None, Query(description="Filter by entity type")] = None,
) -> ClientActivityListResponse:
    """Get client activity timeline with pagination and filtering."""
    service = get_activity_service()
    try:
        result = await service.get_activity_timeline(
            workspace_id=workspace_id,
            client_id=client_id,
            page=page,
            limit=limit,
            activity_type=activity_type,
            entity_type=entity_type,
        )
        return ClientActivityListResponse(
            activities=result["activities"],
            meta=ClientListMetaResponse(**result["meta"]),
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get activity timeline")
        raise InternalError("Failed to get activity timeline")


@router.post(
    "/{client_id}/communications",
    response_model=CommunicationCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Log communication",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def log_communication(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: LogCommunicationRequest,
) -> CommunicationCreateResponse:
    """Log a communication with a client."""
    # #region agent log
    import json
    log_data = {
        "location": "backend/src/app/api/v1/clients.py:975",
        "message": "log_communication called",
        "data": {
            "workspace_id": str(workspace_id),
            "client_id": str(client_id),
            "request_data": request.model_dump(),
            "user_id": str(current_user.user_id),
        },
        "timestamp": int(__import__("time").time() * 1000),
        "sessionId": "debug-session",
        "runId": "initial",
        "hypothesisId": "H1"
    }
    with open("/app/.cursor/debug.log", "a", encoding="utf-8") as f:
        f.write(json.dumps(log_data) + "\n")
    # #endregion agent log
    
    service = get_client_service()
    try:
        result = await service.log_communication(
            workspace_id=workspace_id,
            client_id=client_id,
            user_id=current_user.user_id,
            communication_type=request.communication_type,
            direction=request.direction,
            subject=request.subject,
            notes=request.notes,
            duration_minutes=request.duration_minutes,
            follow_up_required=request.follow_up_required,
            follow_up_date=request.follow_up_date,
        )
        
        # #region agent log
        log_data = {
            "location": "backend/src/app/api/v1/clients.py:985",
            "message": "service.log_communication returned",
            "data": {
                "result": result,
                "result_type": type(result).__name__,
                "result_keys": list(result.keys()) if isinstance(result, dict) else None,
            },
            "timestamp": int(__import__("time").time() * 1000),
            "sessionId": "debug-session",
            "runId": "initial",
            "hypothesisId": "H2"
        }
        with open("/app/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
        # #endregion agent log
        
        response = CommunicationCreateResponse(**result)
        
        # #region agent log
        log_data = {
            "location": "backend/src/app/api/v1/clients.py:997",
            "message": "CommunicationCreateResponse created successfully",
            "data": {"response": response.model_dump()},
            "timestamp": int(__import__("time").time() * 1000),
            "sessionId": "debug-session",
            "runId": "initial",
            "hypothesisId": "H3"
        }
        with open("/app/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
        # #endregion agent log
        
        return response
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientValidationError as e:
        raise ValidationAppError(str(e))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        # #region agent log
        log_data = {
            "location": "backend/src/app/api/v1/clients.py:1004",
            "message": "Exception in log_communication",
            "data": {
                "exception_type": type(e).__name__,
                "exception_message": str(e),
                "exception_args": str(e.args) if e.args else None,
            },
            "timestamp": int(__import__("time").time() * 1000),
            "sessionId": "debug-session",
            "runId": "initial",
            "hypothesisId": "H4"
        }
        with open("/app/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
        # #endregion agent log
        logger.exception("Failed to log communication")
        raise InternalError("Failed to log communication")


@router.get(
    "/{client_id}/communications",
    response_model=ClientCommunicationListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get communications",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_communications(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> ClientCommunicationListResponse:
    """Get client communication history with pagination."""
    service = get_client_service()
    try:
        result = await service.get_communications(
            workspace_id=workspace_id,
            client_id=client_id,
            page=page,
            limit=limit,
        )
        return ClientCommunicationListResponse(
            communications=result["communications"],
            meta=ClientListMetaResponse(**result["meta"]),
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get communications")
        raise InternalError("Failed to get communications")


@router.post(
    "/{client_id}/activities",
    response_model=ActivityCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record activity",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def record_activity(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: RecordActivityRequest,
) -> ActivityCreateResponse:
    """Record a new activity for a client."""
    # #region agent log
    import json
    log_data = {
        "location": "backend/src/app/api/v1/clients.py:1060",
        "message": "record_activity called",
        "data": {
            "workspace_id": str(workspace_id),
            "client_id": str(client_id),
            "request_data": request.model_dump(),
            "user_id": str(current_user.user_id),
        },
        "timestamp": int(__import__("time").time() * 1000),
        "sessionId": "debug-session",
        "runId": "initial",
        "hypothesisId": "H1"
    }
    with open("/app/.cursor/debug.log", "a", encoding="utf-8") as f:
        f.write(json.dumps(log_data) + "\n")
    # #endregion agent log
    
    service = get_activity_service()
    try:
        result = await service.record_activity(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type=request.activity_type,
            description=request.description,
            related_entity_type=request.related_entity_type,
            related_entity_id=request.related_entity_id,
            metadata=request.metadata,
            created_by_user_id=current_user.user_id,
        )
        
        # #region agent log
        log_data = {
            "location": "backend/src/app/api/v1/clients.py:1070",
            "message": "service.record_activity returned",
            "data": {
                "result": result,
                "result_type": type(result).__name__,
                "result_keys": list(result.keys()) if isinstance(result, dict) else None,
            },
            "timestamp": int(__import__("time").time() * 1000),
            "sessionId": "debug-session",
            "runId": "initial",
            "hypothesisId": "H2"
        }
        with open("/app/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
        # #endregion agent log
        
        response = ActivityCreateResponse(**result)
        
        # #region agent log
        log_data = {
            "location": "backend/src/app/api/v1/clients.py:1080",
            "message": "ActivityCreateResponse created successfully",
            "data": {"response": response.model_dump()},
            "timestamp": int(__import__("time").time() * 1000),
            "sessionId": "debug-session",
            "runId": "initial",
            "hypothesisId": "H3"
        }
        with open("/app/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
        # #endregion agent log
        
        return response
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        # #region agent log
        log_data = {
            "location": "backend/src/app/api/v1/clients.py:1085",
            "message": "Exception in record_activity",
            "data": {
                "exception_type": type(e).__name__,
                "exception_message": str(e),
                "exception_args": str(e.args) if e.args else None,
            },
            "timestamp": int(__import__("time").time() * 1000),
            "sessionId": "debug-session",
            "runId": "initial",
            "hypothesisId": "H4"
        }
        with open("/app/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
        # #endregion agent log
        logger.exception("Failed to record activity")
        raise InternalError("Failed to record activity")


@router.get(
    "/{client_id}/activities/summary",
    response_model=ActivitySummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get activity summary",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_activity_summary(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
) -> ActivitySummaryResponse:
    """Get activity summary counts grouped by type."""
    service = get_activity_service()
    try:
        result = await service.get_activity_summary(
            workspace_id=workspace_id,
            client_id=client_id,
        )
        return ActivitySummaryResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get activity summary")
        raise InternalError("Failed to get activity summary")


@router.delete(
    "/{client_id}/activities/{activity_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete activity",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Activity not found"},
    },
)
async def delete_activity(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    activity_id: Annotated[UUID, Path(..., description="Activity ID")],
) -> MessageResponse:
    """Delete a specific activity record."""
    service = get_activity_service()
    try:
        result = await service.delete_activity(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_id=activity_id,
        )
        return MessageResponse(message=result["message"])
    except ActivityNotFoundError as e:
        raise NotFoundError("Activity", str(activity_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to delete activity")
        raise InternalError("Failed to delete activity")


@router.post(
    "/{client_id}/notes",
    response_model=ActivityCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add note",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def add_note(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: AddNoteRequest,
) -> ActivityCreateResponse:
    """Add a note to the client's activity timeline."""
    service = get_activity_service()
    try:
        result = await service.add_note(
            workspace_id=workspace_id,
            client_id=client_id,
            note=request.note,
            user_id=current_user.user_id,
        )
        return ActivityCreateResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to add note")
        raise InternalError("Failed to add note")


# ---------------------------------------------------------------------------
# Contact Management endpoints (using ContactService)
# ---------------------------------------------------------------------------


@router.patch(
    "/{client_id}/contacts/{contact_id}",
    response_model=ClientContactResponse,
    status_code=status.HTTP_200_OK,
    summary="Update contact",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Contact not found"},
    },
)
async def update_contact(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    contact_id: Annotated[UUID, Path(..., description="Contact ID")],
    request: UpdateContactRequest,
) -> ClientContactResponse:
    """Update a contact method."""
    service = get_contact_service()
    try:
        updates = request.model_dump(exclude_unset=True)
        result = await service.update_contact(
            workspace_id=workspace_id,
            client_id=client_id,
            contact_id=contact_id,
            **updates,
        )
        return ClientContactResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ContactNotFoundError as e:
        raise NotFoundError("Contact", str(contact_id))
    except ContactInvalidFormatError as e:
        raise ValidationAppError(e.user_message)
    except ContactDuplicateError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to update contact")
        raise InternalError("Failed to update contact")


@router.post(
    "/{client_id}/contacts/{contact_id}/set-primary",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Set primary contact",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Contact not found"},
    },
)
async def set_primary_contact(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    contact_id: Annotated[UUID, Path(..., description="Contact ID")],
) -> MessageResponse:
    """Set a contact as primary for its type."""
    service = get_contact_service()
    try:
        result = await service.set_primary_contact(
            workspace_id=workspace_id,
            client_id=client_id,
            contact_id=contact_id,
        )
        return MessageResponse(message=result["message"])
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ContactNotFoundError as e:
        raise NotFoundError("Contact", str(contact_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to set primary contact")
        raise InternalError("Failed to set primary contact")


# ---------------------------------------------------------------------------
# Address endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{client_id}/addresses",
    response_model=AddressCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add address",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def add_address(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: AddAddressRequest,
) -> AddressCreateResponse:
    """Add an address to a client with automatic timezone inference."""
    service = get_address_service()
    try:
        result = await service.add_address(
            workspace_id=workspace_id,
            client_id=client_id,
            address_type=request.address_type,
            address_line1=request.address_line1,
            address_line2=request.address_line2,
            city=request.city,
            state=request.state,
            country=request.country,
            postal_code=request.postal_code,
            is_primary=request.is_primary,
        )
        return AddressCreateResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except AddressValidationError as e:
        raise ValidationAppError(e.user_message)
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to add address")
        raise InternalError("Failed to add address")


@router.get(
    "/{client_id}/addresses",
    response_model=list[ClientAddressResponse],
    status_code=status.HTTP_200_OK,
    summary="List addresses",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def list_addresses(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
) -> list[ClientAddressResponse]:
    """List all addresses for a client."""
    service = get_address_service()
    try:
        result = await service.list_addresses(
            workspace_id=workspace_id,
            client_id=client_id,
        )
        return [ClientAddressResponse(**addr) for addr in result]
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to list addresses")
        raise InternalError("Failed to list addresses")


@router.patch(
    "/{client_id}/addresses/{address_id}",
    response_model=ClientAddressResponse,
    status_code=status.HTTP_200_OK,
    summary="Update address",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Address not found"},
    },
)
async def update_address(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    address_id: Annotated[UUID, Path(..., description="Address ID")],
    request: UpdateAddressRequest,
) -> ClientAddressResponse:
    """Update an address."""
    service = get_address_service()
    try:
        updates = request.model_dump(exclude_unset=True)
        result = await service.update_address(
            workspace_id=workspace_id,
            client_id=client_id,
            address_id=address_id,
            **updates,
        )
        return ClientAddressResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except AddressNotFoundError as e:
        raise NotFoundError("Address", str(address_id))
    except AddressValidationError as e:
        raise ValidationAppError(e.user_message)
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to update address")
        raise InternalError("Failed to update address")


@router.delete(
    "/{client_id}/addresses/{address_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete address",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Address not found"},
    },
)
async def delete_address(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    address_id: Annotated[UUID, Path(..., description="Address ID")],
) -> MessageResponse:
    """Delete an address from a client."""
    service = get_address_service()
    try:
        result = await service.delete_address(
            workspace_id=workspace_id,
            client_id=client_id,
            address_id=address_id,
        )
        return MessageResponse(message=result["message"])
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except AddressNotFoundError as e:
        raise NotFoundError("Address", str(address_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to delete address")
        raise InternalError("Failed to delete address")


@router.post(
    "/{client_id}/addresses/{address_id}/set-primary",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Set primary address",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Address not found"},
    },
)
async def set_primary_address(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    address_id: Annotated[UUID, Path(..., description="Address ID")],
) -> MessageResponse:
    """Set an address as primary."""
    service = get_address_service()
    try:
        result = await service.set_primary_address(
            workspace_id=workspace_id,
            client_id=client_id,
            address_id=address_id,
        )
        return MessageResponse(message=result["message"])
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except AddressNotFoundError as e:
        raise NotFoundError("Address", str(address_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to set primary address")
        raise InternalError("Failed to set primary address")


# ---------------------------------------------------------------------------
# Avatar endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{client_id}/avatar",
    response_model=AvatarUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload avatar",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid file"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
        413: {"model": ErrorResponse, "description": "File too large"},
        422: {"model": ErrorResponse, "description": "Invalid format"},
    },
)
async def upload_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    file: UploadFile = File(..., description="Avatar image file"),
    crop_x: Annotated[float | None, Query(ge=0, le=100, description="Crop X offset %")] = None,
    crop_y: Annotated[float | None, Query(ge=0, le=100, description="Crop Y offset %")] = None,
    crop_scale: Annotated[float | None, Query(ge=0.1, le=10.0, description="Crop scale")] = None,
) -> AvatarUploadResponse:
    """Upload and process a new avatar image."""
    service = get_avatar_service()
    try:
        # Read file data
        file_data = await file.read()

        # Build crop data if provided
        crop_data = None
        if crop_x is not None or crop_y is not None or crop_scale is not None:
            crop_data = {
                "x": crop_x if crop_x is not None else 50.0,
                "y": crop_y if crop_y is not None else 50.0,
                "scale": crop_scale if crop_scale is not None else 1.0,
            }

        result = await service.upload_avatar(
            workspace_id=workspace_id,
            client_id=client_id,
            file_data=file_data,
            content_type=file.content_type,
            crop_data=crop_data,
            user_id=current_user.user_id,
        )
        return AvatarUploadResponse(
            avatar_asset_id=UUID(result["avatar_asset_id"]),
            avatar_url=result["avatar_url"],
            thumbnails=result["thumbnails"],
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except AvatarFileTooLargeError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except AvatarInvalidFormatError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except AvatarUploadError as e:
        raise ValidationAppError(e.user_message)
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to upload avatar")
        raise InternalError("Failed to upload avatar")


@router.post(
    "/{client_id}/avatar/from-gallery",
    response_model=AvatarSelectResponse,
    status_code=status.HTTP_200_OK,
    summary="Select gallery photo as avatar",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
        422: {"model": ErrorResponse, "description": "Asset not in linked gallery"},
    },
)
async def select_gallery_photo_as_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: SelectGalleryPhotoRequest,
) -> AvatarSelectResponse:
    """Select a photo from a linked gallery as the client's avatar."""
    service = get_avatar_service()
    try:
        # Build crop data if provided
        crop_data = None
        if request.crop_x is not None or request.crop_y is not None or request.crop_scale is not None:
            crop_data = {
                "x": request.crop_x if request.crop_x is not None else 50.0,
                "y": request.crop_y if request.crop_y is not None else 50.0,
                "scale": request.crop_scale if request.crop_scale is not None else 1.0,
            }

        result = await service.select_gallery_photo(
            workspace_id=workspace_id,
            client_id=client_id,
            asset_id=request.asset_id,
            crop_data=crop_data,
            user_id=current_user.user_id,
        )
        return AvatarSelectResponse(
            avatar_asset_id=UUID(result["avatar_asset_id"]),
            avatar_url=result["avatar_url"],
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except AvatarAssetNotInGalleryError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to select gallery photo as avatar")
        raise InternalError("Failed to select gallery photo as avatar")


@router.delete(
    "/{client_id}/avatar",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove avatar",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def remove_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
) -> MessageResponse:
    """Remove the client's avatar."""
    service = get_avatar_service()
    try:
        result = await service.remove_avatar(
            workspace_id=workspace_id,
            client_id=client_id,
            user_id=current_user.user_id,
        )
        return MessageResponse(message=result["message"])
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to remove avatar")
        raise InternalError("Failed to remove avatar")


@router.get(
    "/{client_id}/avatar",
    response_model=AvatarInfoResponse,
    status_code=status.HTTP_200_OK,
    summary="Get avatar info",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_avatar_info(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    size: Annotated[int, Query(description="Thumbnail size")] = 256,
) -> AvatarInfoResponse:
    """Get avatar URL or initials for display."""
    service = get_avatar_service()
    try:
        result = await service.get_avatar_url(
            workspace_id=workspace_id,
            client_id=client_id,
            size=size,
        )
        if result is None:
            raise NotFoundError("Client", str(client_id))
        return AvatarInfoResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get avatar info")
        raise InternalError("Failed to get avatar info")


@router.get(
    "/{client_id}/avatar/{size}",
    status_code=status.HTTP_200_OK,
    summary="Get avatar image",
    responses={
        200: {"content": {"image/webp": {}}},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Avatar not found"},
    },
)
async def get_avatar_image(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    size: Annotated[int, Path(..., description="Thumbnail size (64, 128, or 256)")],
) -> Response:
    """Get avatar image bytes for display."""
    service = get_avatar_service()
    try:
        image_data = await service.get_avatar_image(
            workspace_id=workspace_id,
            client_id=client_id,
            size=size,
        )
        if image_data is None:
            raise NotFoundError("Avatar", str(client_id))

        return Response(
            content=image_data,
            media_type="image/webp",
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
            },
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get avatar image")
        raise InternalError("Failed to get avatar image")


# ---------------------------------------------------------------------------
# Duplicate Detection & Merge endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/detect-duplicates",
    response_model=DetectDuplicatesResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect duplicate clients",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def detect_duplicates(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: DetectDuplicatesRequest,
) -> DetectDuplicatesResponse:
    """Detect potential duplicate clients by email or phone."""
    from app.services.duplicate_detection_service import get_duplicate_detection_service
    from app.api.client_schemas import DuplicateClientResponse

    service = get_duplicate_detection_service()
    try:
        results = await service.find_duplicates(
            workspace_id=workspace_id,
            email=request.email,
            phone=request.phone,
        )

        # Transform service results to response format
        duplicates = []
        max_confidence = 0.0
        for result in results:
            confidence = result.get("match_score", 0.0)
            if confidence > max_confidence:
                max_confidence = confidence
            duplicates.append(DuplicateClientResponse(
                client_id=UUID(result["client_id"]),
                full_name=result["full_name"],
                primary_email=result.get("matched_email"),
                primary_phone=result.get("matched_phone"),
                confidence=confidence,
            ))

        return DetectDuplicatesResponse(
            duplicates=duplicates,
            confidence=max_confidence if duplicates else 0.0,
        )
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to detect duplicates")
        raise InternalError("Failed to detect duplicates")


@router.post(
    "/merge",
    response_model=MergeClientsResponse,
    status_code=status.HTTP_200_OK,
    summary="Merge duplicate clients",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def merge_clients(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: MergeClientsRequest,
) -> MergeClientsResponse:
    """Merge a duplicate client into the primary client."""
    from app.services.duplicate_detection_service import get_duplicate_detection_service

    service = get_duplicate_detection_service()
    try:
        result = await service.merge_clients(
            workspace_id=workspace_id,
            primary_client_id=request.primary_client_id,
            secondary_client_id=request.duplicate_client_id,
            user_id=current_user.user_id,
        )

        # Extract stats from the merge result
        stats = result.get("stats", {})
        return MergeClientsResponse(
            client_id=UUID(result["primary_client_id"]),
            galleries_merged=stats.get("gallery_links_merged", 0),
            activities_merged=stats.get("activities_merged", 0),
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(e.client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to merge clients")
        raise InternalError("Failed to merge clients")


# ---------------------------------------------------------------------------
# Smart List endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/smart-lists",
    response_model=list[SmartListResponse],
    status_code=status.HTTP_200_OK,
    summary="List smart lists",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_smart_lists(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    include_system: Annotated[bool, Query(description="Include system lists")] = True,
) -> list[SmartListResponse]:
    """List all smart lists for the workspace."""
    from app.services.smart_list_service import get_smart_list_service

    service = get_smart_list_service()
    try:
        result = await service.list_smart_lists(
            workspace_id=workspace_id,
            include_system=include_system,
        )
        return [SmartListResponse(**r) for r in result]
    except Exception as e:
        logger.exception("Failed to list smart lists")
        raise InternalError("Failed to list smart lists")


@router.post(
    "/smart-lists",
    response_model=SmartListResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create smart list",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        409: {"model": ErrorResponse, "description": "Duplicate name"},
    },
)
async def create_smart_list(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateSmartListRequest,
) -> SmartListResponse:
    """Create a new smart list with filter criteria."""
    from app.services.smart_list_service import (
        get_smart_list_service,
        SmartListDuplicateError,
        SmartListValidationError,
    )

    service = get_smart_list_service()
    try:
        result = await service.create_smart_list(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            name=request.name,
            description=request.description,
            filter_criteria=request.filter_criteria.model_dump(),
        )
        return SmartListResponse(**result)
    except SmartListDuplicateError as e:
        raise AppError(message=e.user_message, code=e.code, status_code=e.status_code)
    except SmartListValidationError as e:
        raise ValidationAppError(e.user_message)
    except Exception as e:
        logger.exception("Failed to create smart list")
        raise InternalError("Failed to create smart list")


@router.get(
    "/smart-lists/{list_id}",
    response_model=SmartListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get smart list",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Smart list not found"},
    },
)
async def get_smart_list(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    list_id: Annotated[UUID, Path(..., description="Smart list ID")],
) -> SmartListResponse:
    """Get smart list details."""
    from app.services.smart_list_service import get_smart_list_service, SmartListNotFoundError

    service = get_smart_list_service()
    try:
        result = await service.get_smart_list(
            workspace_id=workspace_id,
            list_id=list_id,
        )
        return SmartListResponse(**result)
    except SmartListNotFoundError:
        raise NotFoundError("Smart list", str(list_id))
    except Exception as e:
        logger.exception("Failed to get smart list")
        raise InternalError("Failed to get smart list")


@router.patch(
    "/smart-lists/{list_id}",
    response_model=SmartListResponse,
    status_code=status.HTTP_200_OK,
    summary="Update smart list",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied or system list"},
        404: {"model": ErrorResponse, "description": "Smart list not found"},
    },
)
async def update_smart_list(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    list_id: Annotated[UUID, Path(..., description="Smart list ID")],
    request: UpdateSmartListRequest,
) -> SmartListResponse:
    """Update a smart list."""
    from app.services.smart_list_service import (
        get_smart_list_service,
        SmartListNotFoundError,
        SmartListValidationError,
        SystemSmartListError,
    )

    service = get_smart_list_service()
    try:
        filter_criteria = None
        if request.filter_criteria:
            filter_criteria = request.filter_criteria.model_dump()

        result = await service.update_smart_list(
            workspace_id=workspace_id,
            list_id=list_id,
            name=request.name,
            description=request.description,
            filter_criteria=filter_criteria,
        )
        return SmartListResponse(**result)
    except SmartListNotFoundError:
        raise NotFoundError("Smart list", str(list_id))
    except SystemSmartListError as e:
        raise ForbiddenError(e.user_message)
    except SmartListValidationError as e:
        raise ValidationAppError(e.user_message)
    except Exception as e:
        logger.exception("Failed to update smart list")
        raise InternalError("Failed to update smart list")


@router.delete(
    "/smart-lists/{list_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete smart list",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied or system list"},
        404: {"model": ErrorResponse, "description": "Smart list not found"},
    },
)
async def delete_smart_list(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    list_id: Annotated[UUID, Path(..., description="Smart list ID")],
) -> MessageResponse:
    """Delete a smart list."""
    from app.services.smart_list_service import (
        get_smart_list_service,
        SmartListNotFoundError,
        SystemSmartListError,
    )

    service = get_smart_list_service()
    try:
        result = await service.delete_smart_list(
            workspace_id=workspace_id,
            list_id=list_id,
        )
        return MessageResponse(message=result["message"])
    except SmartListNotFoundError:
        raise NotFoundError("Smart list", str(list_id))
    except SystemSmartListError as e:
        raise ForbiddenError(e.user_message)
    except Exception as e:
        logger.exception("Failed to delete smart list")
        raise InternalError("Failed to delete smart list")


@router.get(
    "/smart-lists/{list_id}/evaluate",
    response_model=SmartListEvaluationResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate smart list",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Smart list not found"},
    },
)
async def evaluate_smart_list(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    list_id: Annotated[UUID, Path(..., description="Smart list ID")],
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> SmartListEvaluationResponse:
    """Evaluate a smart list and return matching clients."""
    from app.services.smart_list_service import get_smart_list_service, SmartListNotFoundError

    service = get_smart_list_service()
    try:
        result = await service.evaluate_smart_list(
            workspace_id=workspace_id,
            list_id=list_id,
            page=page,
            limit=limit,
        )
        return SmartListEvaluationResponse(
            clients=result["clients"],
            meta=ClientListMetaResponse(**result["meta"]),
        )
    except SmartListNotFoundError:
        raise NotFoundError("Smart list", str(list_id))
    except Exception as e:
        logger.exception("Failed to evaluate smart list")
        raise InternalError("Failed to evaluate smart list")


# ---------------------------------------------------------------------------
# Import/Export endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/export",
    response_model=ExportClientsResponse,
    status_code=status.HTTP_200_OK,
    summary="Export clients",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def export_clients(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    format: Annotated[str, Query(description="Export format (csv or json)")] = "csv",
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    tags: Annotated[list[str] | None, Query(description="Filter by tag names")] = None,
    include_contacts: Annotated[bool, Query(description="Include contacts")] = True,
    include_addresses: Annotated[bool, Query(description="Include addresses")] = True,
    include_tags: Annotated[bool, Query(description="Include tags")] = True,
) -> ExportClientsResponse:
    """Export clients to CSV or JSON format."""
    from app.services.import_export_service import get_import_export_service, ExportError

    service = get_import_export_service()
    try:
        result = await service.export_clients(
            workspace_id=workspace_id,
            format=format,
            status=status_filter,
            tags=tags,
            include_contacts=include_contacts,
            include_addresses=include_addresses,
            include_tags=include_tags,
        )
        return ExportClientsResponse(**result)
    except ExportError as e:
        raise ValidationAppError(e.user_message)
    except Exception as e:
        logger.exception("Failed to export clients")
        raise InternalError("Failed to export clients")


@router.post(
    "/import",
    response_model=ImportClientsResponse,
    status_code=status.HTTP_200_OK,
    summary="Import clients",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def import_clients(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    file: Annotated[UploadFile, File(description="CSV file to import")],
    skip_duplicates: Annotated[bool, Query(description="Skip duplicate emails")] = True,
    update_existing: Annotated[bool, Query(description="Update existing clients")] = False,
) -> ImportClientsResponse:
    """Import clients from a CSV file."""
    from app.services.import_export_service import (
        get_import_export_service,
        InvalidFileFormatError,
        EmptyFileError,
        MissingRequiredFieldsError,
    )

    service = get_import_export_service()
    try:
        file_content = await file.read()
        result = await service.import_clients(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            file_content=file_content,
            content_type=file.content_type or "text/csv",
            skip_duplicates=skip_duplicates,
            update_existing=update_existing,
        )
        return ImportClientsResponse(**result)
    except InvalidFileFormatError as e:
        raise ValidationAppError(e.user_message)
    except EmptyFileError as e:
        raise ValidationAppError(e.user_message)
    except MissingRequiredFieldsError as e:
        raise ValidationAppError(e.user_message)
    except Exception as e:
        logger.exception("Failed to import clients")
        raise InternalError("Failed to import clients")


@router.get(
    "/import/template",
    response_model=ImportTemplateResponse,
    status_code=status.HTTP_200_OK,
    summary="Get import template",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_import_template(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> ImportTemplateResponse:
    """Get a blank CSV template for importing clients."""
    from app.services.import_export_service import get_import_export_service

    service = get_import_export_service()
    try:
        result = await service.get_import_template()
        return ImportTemplateResponse(**result)
    except Exception as e:
        logger.exception("Failed to get import template")
        raise InternalError("Failed to get import template")
