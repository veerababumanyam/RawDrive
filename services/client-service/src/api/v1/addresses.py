"""
Address CRUD API endpoints.

Provides REST API for client address management with workspace isolation.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Path, status

from src.services.address_service import AddressService, get_address_service
from src.schemas.address import AddressCreate, AddressUpdate, AddressResponse
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/clients/{client_id}/addresses",
    tags=["addresses"],
)


# =============================================================================
# Dependency Injection
# =============================================================================


def get_service() -> AddressService:
    """Get AddressService instance."""
    return get_address_service()


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
# List Addresses
# =============================================================================


@router.get("", response_model=List[AddressResponse])
async def list_addresses(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    address_type: Optional[str] = Query(None, description="Filter by address type"),
    service: AddressService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> List[AddressResponse]:
    """
    List all addresses for a client.

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        address_type: Optional filter by type (home, work, studio, billing, shipping, other)
        service: AddressService instance
        current_user: Current user from JWT

    Returns:
        List[AddressResponse]: List of addresses
    """
    addresses = await service.list_addresses(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
        address_type=address_type,
    )

    logger.debug(
        "Addresses listed",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "count": len(addresses),
        },
    )

    return [AddressResponse(**a) for a in addresses]


# =============================================================================
# Create Address
# =============================================================================


@router.post("", response_model=AddressResponse, status_code=status.HTTP_201_CREATED)
async def create_address(
    data: AddressCreate,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: AddressService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> AddressResponse:
    """
    Create a new address for a client.

    Args:
        data: Address creation data
        client_id: Client ID
        workspace_id: Workspace ID
        service: AddressService instance
        current_user: Current user from JWT

    Returns:
        AddressResponse: Created address

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        address = await service.create_address(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            data=data,
        )

        logger.info(
            "Address created",
            extra={
                "address_id": str(address["address_id"]),
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return AddressResponse(**address)

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
            "Address creation failed",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="ADDRESS_CREATION_FAILED",
                message="Failed to create address",
            ).model_dump(),
        )


# =============================================================================
# Get Address
# =============================================================================


@router.get("/{address_id}", response_model=AddressResponse)
async def get_address(
    address_id: UUID = Path(..., description="Address ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: AddressService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> AddressResponse:
    """
    Get address by ID.

    Args:
        address_id: Address ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: AddressService instance
        current_user: Current user from JWT

    Returns:
        AddressResponse: Address details

    Raises:
        HTTPException: 404 if address not found
    """
    address = await service.get_address(
        str(workspace_id), str(client_id), str(address_id)
    )

    if not address:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="ADDRESS_NOT_FOUND",
                message=f"Address {address_id} not found",
            ).model_dump(),
        )

    return AddressResponse(**address)


# =============================================================================
# Update Address
# =============================================================================


@router.patch("/{address_id}", response_model=AddressResponse)
async def update_address(
    data: AddressUpdate,
    address_id: UUID = Path(..., description="Address ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: AddressService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> AddressResponse:
    """
    Update address.

    Args:
        data: Address update data
        address_id: Address ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: AddressService instance
        current_user: Current user from JWT

    Returns:
        AddressResponse: Updated address

    Raises:
        HTTPException: 404 if address not found, 400 if validation fails
    """
    try:
        address = await service.update_address(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            address_id=str(address_id),
            data=data,
        )

        if not address:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="ADDRESS_NOT_FOUND",
                    message=f"Address {address_id} not found",
                ).model_dump(),
            )

        logger.info(
            "Address updated",
            extra={
                "address_id": str(address_id),
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return AddressResponse(**address)

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
            "Address update failed",
            extra={
                "address_id": str(address_id),
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="ADDRESS_UPDATE_FAILED",
                message="Failed to update address",
            ).model_dump(),
        )


# =============================================================================
# Delete Address
# =============================================================================


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    address_id: UUID = Path(..., description="Address ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: AddressService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Delete address.

    Args:
        address_id: Address ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: AddressService instance
        current_user: Current user from JWT

    Raises:
        HTTPException: 404 if address not found
    """
    deleted = await service.delete_address(
        str(workspace_id), str(client_id), str(address_id)
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="ADDRESS_NOT_FOUND",
                message=f"Address {address_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Address deleted",
        extra={
            "address_id": str(address_id),
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return None
