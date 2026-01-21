"""
Client CRUD API endpoints.

Provides REST API for client management with workspace isolation.
"""

from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Path, status, Request
from fastapi.responses import JSONResponse

from src.services.client_service import ClientService, get_client_service
from src.services.audit_service import AuditService, get_audit_service
from src.schemas.client import (
    ClientCreate,
    ClientUpdate,
    ClientResponse,
    ClientListResponse,
    ClientSearchParams,
)
from src.schemas.common import ErrorResponse, ErrorDetail
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.middleware.rbac import require_permission
from src.constants.permissions import Permission
from src.observability.metrics import CLIENT_OPERATIONS
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/clients", tags=["clients"])


# =============================================================================
# List Clients
# =============================================================================


@router.get("", response_model=ClientListResponse)
async def list_clients(
    workspace_id: UUID = Depends(verify_workspace_access),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by status (active, inactive)"),
    search: Optional[str] = Query(None, description="Search by name, email, or phone"),
    tag_ids: Optional[str] = Query(None, description="Comma-separated tag IDs"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order (asc, desc)"),
    service: ClientService = Depends(get_client_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ClientListResponse:
    """
    List clients with pagination and filtering.

    Args:
        workspace_id: Workspace ID
        page: Page number (1-indexed)
        limit: Items per page (1-100)
        status: Filter by status
        search: Search query
        tag_ids: Comma-separated tag UUIDs
        sort_by: Sort field
        sort_order: Sort order (asc/desc)
        service: ClientService instance
        current_user: Current user from JWT

    Returns:
        ClientListResponse: Paginated client list
    """
    # Parse tag_ids
    tag_uuid_list: Optional[List[UUID]] = None
    if tag_ids:
        try:
            tag_uuid_list = [UUID(tid.strip()) for tid in tag_ids.split(",")]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="INVALID_TAG_IDS",
                    message="Invalid tag ID format",
                ).model_dump(),
            )

    # Build search params
    params = ClientSearchParams(
        page=page,
        limit=limit,
        status=status,
        search=search,
        tag_ids=tag_uuid_list,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    # Fetch clients
    result = await service.list_clients(str(workspace_id), params)

    logger.info(
        "Clients listed",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "page": page,
            "total": result.meta.total,
        },
    )

    return result


# =============================================================================
# Create Client
# =============================================================================


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    data: ClientCreate,
    request: Request,
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_client_service),
    current_user: JWTPayload = Depends(get_current_user),
    audit_service: AuditService = Depends(get_audit_service),
    _: None = Depends(require_permission(Permission.CLIENTS_WRITE)),
) -> ClientResponse:
    """
    Create a new client.

    Args:
        data: Client creation data
        request: FastAPI request for IP tracking
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT
        audit_service: Audit service for SOC2 logging

    Returns:
        ClientResponse: Created client

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        client = await service.create_client(
            workspace_id=str(workspace_id),
            created_by_user_id=str(current_user.user_id),
            data=data,
        )

        # SOC2 CC6.3: Audit log the creation
        client_ip = request.client.host if request.client else None
        await audit_service.log_change(
            workspace_id=str(workspace_id),
            user_id=str(current_user.user_id),
            entity_type="client",
            entity_id=str(client["client_id"]),
            action="create",
            before=None,
            after=client,
            ip_address=client_ip,
        )

        logger.info(
            "Client created",
            extra={
                "client_id": str(client["client_id"]),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        # Fetch full client with computed fields to match get_client response structure
        full_client = await service.get_client(str(workspace_id), str(client["client_id"]))
        if not full_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=ErrorResponse(
                    error="CLIENT_FETCH_FAILED",
                    message="Failed to fetch created client",
                ).model_dump(),
            )

        return ClientResponse(**full_client)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="VALIDATION_ERROR",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(
            "Client creation failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": error_trace,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="CLIENT_CREATION_FAILED",
                message=f"Failed to create client: {str(e)}",
            ).model_dump(),
        )


# =============================================================================
# Get Client
# =============================================================================


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    request: Request,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_client_service),
    current_user: JWTPayload = Depends(get_current_user),
    audit_service: AuditService = Depends(get_audit_service),
) -> ClientResponse:
    """
    Get client by ID.

    Args:
        request: FastAPI request for IP tracking
        client_id: Client ID
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT
        audit_service: Audit service for PII logging

    Returns:
        ClientResponse: Client details

    Raises:
        HTTPException: 404 if client not found
    """
    client = await service.get_client(str(workspace_id), str(client_id))

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="CLIENT_NOT_FOUND",
                message=f"Client {client_id} not found",
            ).model_dump(),
        )

    # SOC2 CC6.3: Log PII field access (best-effort, won't fail operation)
    client_ip = request.client.host if request.client else None
    await audit_service.log_pii_access(
        workspace_id=str(workspace_id),
        user_id=str(current_user.user_id),
        entity_type="client",
        entity_id=str(client_id),
        fields_accessed=list(client.keys()),  # All returned fields
        ip_address=client_ip,
    )

    logger.debug(
        "Client retrieved",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
        },
    )

    return ClientResponse(**client)


# =============================================================================
# Update Client
# =============================================================================


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_client(
    data: ClientUpdate,
    request: Request,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_client_service),
    current_user: JWTPayload = Depends(get_current_user),
    audit_service: AuditService = Depends(get_audit_service),
    _: None = Depends(require_permission(Permission.CLIENTS_WRITE)),
) -> ClientResponse:
    """
    Update client.

    Args:
        data: Client update data
        request: FastAPI request for IP tracking
        client_id: Client ID
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT
        audit_service: Audit service for SOC2 logging

    Returns:
        ClientResponse: Updated client

    Raises:
        HTTPException: 404 if client not found, 400 if validation fails
    """
    try:
        # Get before state for audit log
        before_state = await service.get_client(str(workspace_id), str(client_id))

        if not before_state:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="CLIENT_NOT_FOUND",
                    message=f"Client {client_id} not found",
                ).model_dump(),
            )

        # Perform update
        client = await service.update_client(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            data=data,
        )

        # SOC2 CC6.3: Audit log the update with before/after states
        client_ip = request.client.host if request.client else None
        await audit_service.log_change(
            workspace_id=str(workspace_id),
            user_id=str(current_user.user_id),
            entity_type="client",
            entity_id=str(client_id),
            action="update",
            before=before_state,
            after=client,
            ip_address=client_ip,
        )

        logger.info(
            "Client updated",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        # Fetch full client with computed fields to match get_client response structure
        full_client = await service.get_client(str(workspace_id), str(client_id))
        if not full_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=ErrorResponse(
                    error="CLIENT_FETCH_FAILED",
                    message="Failed to fetch updated client",
                ).model_dump(),
            )

        return ClientResponse(**full_client)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="VALIDATION_ERROR",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(
            "Client update failed",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": error_trace,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="CLIENT_UPDATE_FAILED",
                message=f"Failed to update client: {str(e)}",
            ).model_dump(),
        )


# =============================================================================
# Delete Client
# =============================================================================


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    request: Request,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_client_service),
    current_user: JWTPayload = Depends(get_current_user),
    audit_service: AuditService = Depends(get_audit_service),
    _: None = Depends(require_permission(Permission.CLIENTS_DELETE)),
) -> None:
    """
    Delete client (soft delete with GDPR retention).

    Args:
        request: FastAPI request for IP tracking
        client_id: Client ID
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT
        audit_service: Audit service for SOC2 logging

    Raises:
        HTTPException: 404 if client not found
    """
    # Get before state for audit log
    before_state = await service.get_client(str(workspace_id), str(client_id))

    if not before_state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="CLIENT_NOT_FOUND",
                message=f"Client {client_id} not found",
            ).model_dump(),
        )

    # Perform soft delete
    deleted = await service.delete_client(str(workspace_id), str(client_id))

    # SOC2 CC6.3: Audit log the deletion with before state
    client_ip = request.client.host if request.client else None
    await audit_service.log_change(
        workspace_id=str(workspace_id),
        user_id=str(current_user.user_id),
        entity_type="client",
        entity_id=str(client_id),
        action="delete",
        before=before_state,
        after={"deleted": True},
        ip_address=client_ip,
    )

    logger.info(
        "Client deleted",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    # Return 204 No Content (no response body)
    return None


# =============================================================================
# Search Clients
# =============================================================================


@router.get("/search", response_model=List[ClientResponse])
async def search_clients(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(10, ge=1, le=50, description="Max results"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_client_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> List[ClientResponse]:
    """
    Search clients by name, email, or phone.

    Args:
        q: Search query
        limit: Max results (1-50)
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT

    Returns:
        List[ClientResponse]: Matching clients
    """
    clients = await service.search_clients(
        workspace_id=str(workspace_id),
        query=q,
        limit=limit,
    )

    logger.info(
        "Clients searched",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "results_count": len(clients),
        },
    )

    return [ClientResponse(**c) for c in clients]
