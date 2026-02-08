"""People and Face Tagging API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/people.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse, MessageResponse
from app.api.exceptions import AppError, NotFoundError, InternalError
from app.services.people_service import (
    PeopleError,
    PersonNotFoundError,
    FaceNotFoundError,
    get_people_service,
)
from app.services.biometric_consent_service import require_biometric_consent

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class CreatePersonRequest(BaseModel):
    """Create person request."""

    display_name: Optional[str] = Field(None, max_length=255, description="Person's display name")


class UpdatePersonRequest(BaseModel):
    """Update person request."""

    display_name: Optional[str] = Field(None, max_length=255)
    cover_face_id: Optional[UUID] = None
    status: Optional[str] = Field(None, description="Status (active, hidden)")


class MergePeopleRequest(BaseModel):
    """Merge people request."""

    source_person_id: UUID = Field(..., description="Person to merge from (will be deleted)")
    target_person_id: UUID = Field(..., description="Person to merge into (will remain)")


class PersonResponse(BaseModel):
    """Person response."""

    person_id: str
    display_name: Optional[str] = None
    cover_face_id: Optional[str] = None
    cover_asset_id: Optional[str] = None
    status: str
    face_count: int = 0
    created_at: str


class PersonDetailResponse(BaseModel):
    """Person detail response."""

    person_id: str
    workspace_id: str
    display_name: Optional[str] = None
    cover_face_id: Optional[str] = None
    cover_asset_id: Optional[str] = None
    status: str
    face_count: int = 0
    created_at: str
    updated_at: Optional[str] = None


class PersonListMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class PersonListResponse(BaseModel):
    """Person list response."""

    data: list[PersonResponse]
    meta: PersonListMeta


class BoundingBox(BaseModel):
    """Face bounding box."""

    x: float = Field(..., ge=0, le=1, description="X coordinate (0-1)")
    y: float = Field(..., ge=0, le=1, description="Y coordinate (0-1)")
    width: float = Field(..., ge=0, le=1, description="Width (0-1)")
    height: float = Field(..., ge=0, le=1, description="Height (0-1)")


class CreateFaceRequest(BaseModel):
    """Create face detection request."""

    asset_id: UUID = Field(..., description="Asset ID")
    bbox: BoundingBox = Field(..., description="Bounding box coordinates")
    person_id: Optional[UUID] = Field(None, description="Person to assign (optional)")


class TagFaceRequest(BaseModel):
    """Tag face request."""

    person_id: UUID = Field(..., description="Person to assign")


class FaceResponse(BaseModel):
    """Face detection response."""

    face_id: str
    asset_id: str
    bbox: dict
    person_id: Optional[str] = None
    person_name: Optional[str] = None
    confidence: Optional[float] = None
    tagged_by_user_id: Optional[str] = None
    detected_at: str
    tagged_at: Optional[str] = None


class AssetIdResponse(BaseModel):
    """Asset ID response."""

    asset_id: str


class AssetListMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class PersonAssetsResponse(BaseModel):
    """Person's assets response."""

    data: list[AssetIdResponse]
    meta: AssetListMeta


# ---------------------------------------------------------------------------
# Person Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=PersonListResponse,
    status_code=status.HTTP_200_OK,
    summary="List people",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_people(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    search: Annotated[Optional[str], Query(description="Search by name")] = None,
    status_filter: Annotated[str, Query(alias="status", description="Filter by status")] = "active",
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> PersonListResponse:
    """List all people in a workspace."""
    service = get_people_service()
    try:
        result = await service.list_people(
            workspace_id=workspace_id,
            search=search,
            status=status_filter,
            page=page,
            limit=limit,
        )
        return PersonListResponse(**result)
    except Exception as e:
        logger.exception("Failed to list people")
        raise InternalError("Failed to list people")


@router.post(
    "",
    response_model=PersonDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create person",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_person(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreatePersonRequest,
    _: None = Depends(require_biometric_consent),
) -> PersonDetailResponse:
    """Create a new person."""
    service = get_people_service()
    try:
        result = await service.create_person(
            workspace_id=workspace_id,
            display_name=request.display_name,
        )
        return PersonDetailResponse(**result)
    except Exception as e:
        logger.exception("Failed to create person")
        raise InternalError("Failed to create person")


@router.get(
    "/{person_id}",
    response_model=PersonDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get person",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Person not found"},
    },
)
async def get_person(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    person_id: Annotated[UUID, Path(..., description="Person ID")],
    _: None = Depends(require_biometric_consent),
) -> PersonDetailResponse:
    """Get person details."""
    service = get_people_service()
    try:
        result = await service.get_person(workspace_id=workspace_id, person_id=person_id)
        return PersonDetailResponse(**result)
    except PersonNotFoundError:
        raise NotFoundError("Person", str(person_id))
    except Exception as e:
        logger.exception("Failed to get person")
        raise InternalError("Failed to get person")


@router.patch(
    "/{person_id}",
    response_model=PersonDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Update person",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Person not found"},
    },
)
async def update_person(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    person_id: Annotated[UUID, Path(..., description="Person ID")],
    request: UpdatePersonRequest,
) -> PersonDetailResponse:
    """Update a person."""
    service = get_people_service()
    try:
        result = await service.update_person(
            workspace_id=workspace_id,
            person_id=person_id,
            display_name=request.display_name,
            cover_face_id=request.cover_face_id,
            status=request.status,
        )
        return PersonDetailResponse(**result)
    except PersonNotFoundError:
        raise NotFoundError("Person", str(person_id))
    except PeopleError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to update person")
        raise InternalError("Failed to update person")


@router.delete(
    "/{person_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete person",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Person not found"},
    },
)
async def delete_person(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    person_id: Annotated[UUID, Path(..., description="Person ID")],
    _: None = Depends(require_biometric_consent),
) -> MessageResponse:
    """Delete a person and unlink all their faces."""
    service = get_people_service()
    try:
        await service.delete_person(workspace_id=workspace_id, person_id=person_id)
        return MessageResponse(message="Person deleted successfully")
    except PersonNotFoundError:
        raise NotFoundError("Person", str(person_id))
    except Exception as e:
        logger.exception("Failed to delete person")
        raise InternalError("Failed to delete person")


@router.post(
    "/merge",
    response_model=PersonDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Merge people",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Person not found"},
    },
)
async def merge_people(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: MergePeopleRequest,
    _: None = Depends(require_biometric_consent),
) -> PersonDetailResponse:
    """Merge two people. Source person's faces move to target, source is deleted."""
    service = get_people_service()
    try:
        result = await service.merge_people(
            workspace_id=workspace_id,
            source_person_id=request.source_person_id,
            target_person_id=request.target_person_id,
        )
        return PersonDetailResponse(**result)
    except PersonNotFoundError as e:
        raise NotFoundError("Person", str(request.source_person_id))
    except Exception as e:
        logger.exception("Failed to merge people")
        raise InternalError("Failed to merge people")


@router.get(
    "/{person_id}/assets",
    response_model=PersonAssetsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get person's assets",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Person not found"},
    },
)
async def get_person_assets(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    person_id: Annotated[UUID, Path(..., description="Person ID")],
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    _: None = Depends(require_biometric_consent),
) -> PersonAssetsResponse:
    """Get all assets containing a specific person."""
    service = get_people_service()
    try:
        result = await service.get_assets_for_person(
            workspace_id=workspace_id,
            person_id=person_id,
            page=page,
            limit=limit,
        )
        return PersonAssetsResponse(**result)
    except PersonNotFoundError:
        raise NotFoundError("Person", str(person_id))
    except Exception as e:
        logger.exception("Failed to get person assets")
        raise InternalError("Failed to get person assets")


# ---------------------------------------------------------------------------
# Face Detection Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/faces",
    response_model=FaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create face detection",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_face_detection(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateFaceRequest,
    _: None = Depends(require_biometric_consent),
) -> FaceResponse:
    """Create a face detection (manual tagging)."""
    service = get_people_service()
    try:
        bbox = request.bbox.model_dump()
        result = await service.create_face_detection(
            workspace_id=workspace_id,
            asset_id=request.asset_id,
            bbox=bbox,
            user_id=current_user.user_id,
            person_id=request.person_id,
        )
        return FaceResponse(**result)
    except PersonNotFoundError as e:
        raise NotFoundError("Person", str(request.person_id))
    except Exception as e:
        logger.exception("Failed to create face detection")
        raise InternalError("Failed to create face detection")


@router.get(
    "/faces/asset/{asset_id}",
    response_model=list[FaceResponse],
    status_code=status.HTTP_200_OK,
    summary="List faces for asset",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_faces_for_asset(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
) -> list[FaceResponse]:
    """List all face detections for an asset."""
    service = get_people_service()
    try:
        result = await service.list_faces_for_asset(
            workspace_id=workspace_id,
            asset_id=asset_id,
        )
        return [FaceResponse(**f) for f in result]
    except Exception as e:
        logger.exception("Failed to list faces for asset")
        raise InternalError("Failed to list faces for asset")


@router.post(
    "/faces/{face_id}/tag",
    response_model=FaceResponse,
    status_code=status.HTTP_200_OK,
    summary="Tag face",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Face or person not found"},
    },
)
async def tag_face(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_id: Annotated[UUID, Path(..., description="Face ID")],
    request: TagFaceRequest,
) -> FaceResponse:
    """Assign a face to a person."""
    service = get_people_service()
    try:
        result = await service.tag_face(
            workspace_id=workspace_id,
            face_id=face_id,
            person_id=request.person_id,
            user_id=current_user.user_id,
        )
        return FaceResponse(**result)
    except FaceNotFoundError:
        raise NotFoundError("Face", str(face_id))
    except PersonNotFoundError:
        raise NotFoundError("Person", str(request.person_id))
    except Exception as e:
        logger.exception("Failed to tag face")
        raise InternalError("Failed to tag face")


@router.delete(
    "/faces/{face_id}/tag",
    response_model=FaceResponse,
    status_code=status.HTTP_200_OK,
    summary="Untag face",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Face not found"},
    },
)
async def untag_face(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_id: Annotated[UUID, Path(..., description="Face ID")],
) -> FaceResponse:
    """Remove person assignment from a face."""
    service = get_people_service()
    try:
        result = await service.untag_face(
            workspace_id=workspace_id,
            face_id=face_id,
        )
        return FaceResponse(**result)
    except FaceNotFoundError:
        raise NotFoundError("Face", str(face_id))
    except Exception as e:
        logger.exception("Failed to untag face")
        raise InternalError("Failed to untag face")


@router.delete(
    "/faces/{face_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete face detection",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Face not found"},
    },
)
async def delete_face_detection(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_id: Annotated[UUID, Path(..., description="Face ID")],
) -> MessageResponse:
    """Delete a face detection."""
    service = get_people_service()
    try:
        await service.delete_face_detection(
            workspace_id=workspace_id,
            face_id=face_id,
        )
        return MessageResponse(message="Face detection deleted successfully")
    except FaceNotFoundError:
        raise NotFoundError("Face", str(face_id))
    except Exception as e:
        logger.exception("Failed to delete face detection")
        raise InternalError("Failed to delete face detection")
