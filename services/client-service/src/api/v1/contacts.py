"""
Contact CRUD API endpoints.

Provides REST API for client contact management with workspace isolation.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Path, status

from src.services.contact_service import ContactService, get_contact_service
from src.schemas.contact import ContactCreate, ContactUpdate, ContactResponse
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/clients/{client_id}/contacts",
    tags=["contacts"],
)


# =============================================================================
# List Contacts
# =============================================================================


@router.get("", response_model=List[ContactResponse])
async def list_contacts(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    contact_type: Optional[str] = Query(None, description="Filter by contact type"),
    service: ContactService = Depends(get_contact_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> List[ContactResponse]:
    """
    List all contacts for a client.

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        contact_type: Optional filter by type (email, phone, social_media, website, other)
        service: ContactService instance
        current_user: Current user from JWT

    Returns:
        List[ContactResponse]: List of contacts
    """
    contacts = await service.list_contacts(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
        contact_type=contact_type,
    )

    logger.debug(
        "Contacts listed",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "count": len(contacts),
        },
    )

    return [ContactResponse(**c) for c in contacts]


# =============================================================================
# Create Contact
# =============================================================================


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    data: ContactCreate,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ContactService = Depends(get_contact_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ContactResponse:
    """
    Create a new contact for a client.

    Args:
        data: Contact creation data
        client_id: Client ID
        workspace_id: Workspace ID
        service: ContactService instance
        current_user: Current user from JWT

    Returns:
        ContactResponse: Created contact

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        contact = await service.create_contact(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            data=data,
        )

        logger.info(
            "Contact created",
            extra={
                "contact_id": str(contact["contact_id"]),
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return ContactResponse(**contact)

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
            "Contact creation failed",
            extra={
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="CONTACT_CREATION_FAILED",
                message="Failed to create contact",
            ).model_dump(),
        )


# =============================================================================
# Get Contact
# =============================================================================


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: UUID = Path(..., description="Contact ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ContactService = Depends(get_contact_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ContactResponse:
    """
    Get contact by ID.

    Args:
        contact_id: Contact ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: ContactService instance
        current_user: Current user from JWT

    Returns:
        ContactResponse: Contact details

    Raises:
        HTTPException: 404 if contact not found
    """
    contact = await service.get_contact(
        str(workspace_id), str(client_id), str(contact_id)
    )

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="CONTACT_NOT_FOUND",
                message=f"Contact {contact_id} not found",
            ).model_dump(),
        )

    return ContactResponse(**contact)


# =============================================================================
# Update Contact
# =============================================================================


@router.patch("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    data: ContactUpdate,
    contact_id: UUID = Path(..., description="Contact ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ContactService = Depends(get_contact_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ContactResponse:
    """
    Update contact.

    Args:
        data: Contact update data
        contact_id: Contact ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: ContactService instance
        current_user: Current user from JWT

    Returns:
        ContactResponse: Updated contact

    Raises:
        HTTPException: 404 if contact not found, 400 if validation fails
    """
    try:
        contact = await service.update_contact(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            contact_id=str(contact_id),
            data=data,
        )

        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(
                    error="CONTACT_NOT_FOUND",
                    message=f"Contact {contact_id} not found",
                ).model_dump(),
            )

        logger.info(
            "Contact updated",
            extra={
                "contact_id": str(contact_id),
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return ContactResponse(**contact)

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
            "Contact update failed",
            extra={
                "contact_id": str(contact_id),
                "client_id": str(client_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="CONTACT_UPDATE_FAILED",
                message="Failed to update contact",
            ).model_dump(),
        )


# =============================================================================
# Delete Contact
# =============================================================================


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: UUID = Path(..., description="Contact ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ContactService = Depends(get_contact_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Delete contact.

    Args:
        contact_id: Contact ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: ContactService instance
        current_user: Current user from JWT

    Raises:
        HTTPException: 404 if contact not found
    """
    deleted = await service.delete_contact(
        str(workspace_id), str(client_id), str(contact_id)
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="CONTACT_NOT_FOUND",
                message=f"Contact {contact_id} not found",
            ).model_dump(),
        )

    logger.info(
        "Contact deleted",
        extra={
            "contact_id": str(contact_id),
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return None
