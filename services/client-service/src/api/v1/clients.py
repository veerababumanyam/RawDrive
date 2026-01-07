"""
Client CRUD API endpoints.

Provides REST API for client management with workspace isolation.
"""

from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from fastapi.responses import JSONResponse

from src.services.client_service import ClientService, get_client_service
from src.schemas.client import (
    ClientCreate,
    ClientUpdate,
    ClientResponse,
    ClientListResponse,
    ClientSearchParams,
)
from src.schemas.common import ErrorResponse, ErrorDetail
from src.middleware.auth import get_current_user, JWTPayload
from src.observability.metrics import CLIENT_OPERATIONS
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/workspaces/{workspace_id}/clients", tags=["clients"])


# =============================================================================
# Dependency Injection
# =============================================================================


def get_service() -> ClientService:
    """Get ClientService instance."""
    return get_client_service()


async def verify_workspace_access(
    workspace_id: UUID = Path(...),
    current_user: JWTPayload = Depends(get_current_user),
) -> UUID:
    """
    Verify user has access to workspace.

    Args:
        workspace_id: Workspace ID from path
        current_user: JWT payload from auth middleware

    Returns:
        UUID: Validated workspace_id

    Raises:
        HTTPException: 403 if user doesn't have access
    """
    # Check if user's workspace matches requested workspace
    if str(current_user.workspace_id) != str(workspace_id):
        logger.warning(
            "Workspace access denied",
            extra={
                "user_id": str(current_user.user_id),
                "requested_workspace": str(workspace_id),
                "user_workspace": str(current_user.workspace_id),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="WORKSPACE_ACCESS_DENIED",
                message="You do not have access to this workspace",
            ).model_dump(),
        )

    return workspace_id


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
    service: ClientService = Depends(get_service),
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
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ClientResponse:
    """
    Create a new client.

    Args:
        data: Client creation data
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT

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

        logger.info(
            "Client created",
            extra={
                "client_id": str(client["client_id"]),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return ClientResponse(**client)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="VALIDATION_ERROR",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        logger.error(
            "Client creation failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="CLIENT_CREATION_FAILED",
                message="Failed to create client",
            ).model_dump(),
        )


# =============================================================================
# Get Client
# =============================================================================


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ClientResponse:
    """
    Get client by ID.

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT

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
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ClientResponse:
    """
    Update client.

    Args:
        data: Client update data
        client_id: Client ID
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT

    Returns:
        ClientResponse: Updated client

    Raises:
        HTTPException: 404 if client not found, 400 if validation fails
    """
    try:
        client = await service.update_client(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            data=data,
        )

        if not client:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="CLIENT_NOT_FOUND",
                    message=f"Client {client_id} not found",
                ).model_dump(),
            )

        logger.info(
            "Client updated",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return ClientResponse(**client)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="VALIDATION_ERROR",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        logger.error(
            "Client update failed",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="CLIENT_UPDATE_FAILED",
                message="Failed to update client",
            ).model_dump(),
        )


# =============================================================================
# Delete Client
# =============================================================================


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ClientService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Delete client.

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        service: ClientService instance
        current_user: Current user from JWT

    Raises:
        HTTPException: 404 if client not found
    """
    deleted = await service.delete_client(str(workspace_id), str(client_id))

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="CLIENT_NOT_FOUND",
                message=f"Client {client_id} not found",
            ).model_dump(),
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
    service: ClientService = Depends(get_service),
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
