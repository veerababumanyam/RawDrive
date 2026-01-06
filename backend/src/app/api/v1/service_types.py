"""Service Types API endpoints.

This module provides API endpoints for managing photography service types
with pricing, duration, and booking configuration.

Feature: Calendar Integrations & Booking Management
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.dependencies.auth import get_current_user, get_current_workspace_id
from app.repositories.service_type_repository import get_service_type_repository


router = APIRouter()


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================


class CreateServiceTypeRequest(BaseModel):
    """Request schema for creating a service type."""

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    duration: int = Field(..., ge=15, le=1440, description="Duration in minutes or hours")
    duration_unit: str = Field("minutes", pattern="^(minutes|hours)$")
    price_cents: int = Field(..., ge=0)
    currency: str = Field("USD", max_length=3)
    deposit_cents: int = Field(0, ge=0)
    is_active: bool = True
    display_order: int = Field(0, ge=0)
    color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    location: Optional[str] = Field(None, max_length=500)
    client_location_allowed: bool = False
    max_per_day: Optional[int] = Field(None, ge=1)
    public_notes: Optional[str] = Field(None, max_length=2000)
    private_notes: Optional[str] = Field(None, max_length=2000)


class UpdateServiceTypeRequest(BaseModel):
    """Request schema for updating a service type."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    duration: Optional[int] = Field(None, ge=15, le=1440)
    duration_unit: Optional[str] = Field(None, pattern="^(minutes|hours)$")
    price_cents: Optional[int] = Field(None, ge=0)
    currency: Optional[str] = Field(None, max_length=3)
    deposit_cents: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    display_order: Optional[int] = Field(None, ge=0)
    color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    location: Optional[str] = Field(None, max_length=500)
    client_location_allowed: Optional[bool] = None
    max_per_day: Optional[int] = Field(None, ge=1)
    public_notes: Optional[str] = Field(None, max_length=2000)
    private_notes: Optional[str] = Field(None, max_length=2000)


class ReorderServiceTypesRequest(BaseModel):
    """Request schema for reordering service types."""

    service_type_ids: list[UUID] = Field(..., min_length=1)


# =============================================================================
# SERVICE TYPE ENDPOINTS
# =============================================================================


@router.get("")
async def list_service_types(
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    sort_by: str = Query("display_order", pattern="^(display_order|name|price_cents|created_at)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
):
    """List service types for the workspace."""
    service_type_repo = get_service_type_repository()
    offset = (page - 1) * limit

    service_types = await service_type_repo.list_by_workspace(
        workspace_id=workspace_id,
        is_active=is_active,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    total = await service_type_repo.count_by_workspace(workspace_id)

    return {
        "data": service_types,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit,
        },
    }


@router.post("")
async def create_service_type(
    request: CreateServiceTypeRequest,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Create a new service type."""
    service_type_repo = get_service_type_repository()

    # Check if we've hit the limit (50 service types per workspace)
    count = await service_type_repo.count_by_workspace(workspace_id)
    if count >= 50:
        raise HTTPException(
            status_code=400,
            detail="Maximum number of service types (50) reached",
        )

    service_type = await service_type_repo.create(
        workspace_id=workspace_id,
        name=request.name,
        description=request.description,
        duration=request.duration,
        duration_unit=request.duration_unit,
        price_cents=request.price_cents,
        currency=request.currency,
        deposit_cents=request.deposit_cents,
        is_active=request.is_active,
        display_order=request.display_order,
        color=request.color,
        location=request.location,
        client_location_allowed=request.client_location_allowed,
        max_per_day=request.max_per_day,
        public_notes=request.public_notes,
        private_notes=request.private_notes,
    )

    return {"data": service_type, "message": "Service type created successfully"}


@router.get("/{service_type_id}")
async def get_service_type(
    service_type_id: UUID,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Get a single service type by ID."""
    service_type_repo = get_service_type_repository()
    service_type = await service_type_repo.get_by_id(workspace_id, service_type_id)

    if not service_type:
        raise HTTPException(status_code=404, detail="Service type not found")

    return {"data": service_type}


@router.patch("/{service_type_id}")
async def update_service_type(
    service_type_id: UUID,
    request: UpdateServiceTypeRequest,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Update a service type."""
    service_type_repo = get_service_type_repository()

    service_type = await service_type_repo.update(
        workspace_id=workspace_id,
        service_type_id=service_type_id,
        name=request.name,
        description=request.description,
        duration=request.duration,
        duration_unit=request.duration_unit,
        price_cents=request.price_cents,
        currency=request.currency,
        deposit_cents=request.deposit_cents,
        is_active=request.is_active,
        display_order=request.display_order,
        color=request.color,
        location=request.location,
        client_location_allowed=request.client_location_allowed,
        max_per_day=request.max_per_day,
        public_notes=request.public_notes,
        private_notes=request.private_notes,
    )

    if not service_type:
        raise HTTPException(status_code=404, detail="Service type not found")

    return {"data": service_type, "message": "Service type updated successfully"}


@router.post("/reorder")
async def reorder_service_types(
    request: ReorderServiceTypesRequest,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Reorder service types by updating their display order."""
    service_type_repo = get_service_type_repository()

    success = await service_type_repo.reorder(
        workspace_id=workspace_id,
        service_type_ids=request.service_type_ids,
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to reorder service types")

    return {"message": "Service types reordered successfully"}


@router.delete("/{service_type_id}")
async def delete_service_type(
    service_type_id: UUID,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    hard_delete: bool = Query(False, description="Permanently delete (fails if bookings exist)"),
):
    """Delete a service type (soft delete by default)."""
    service_type_repo = get_service_type_repository()

    if hard_delete:
        try:
            deleted = await service_type_repo.hard_delete(workspace_id, service_type_id)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete service type with existing bookings",
            )
    else:
        deleted = await service_type_repo.delete(workspace_id, service_type_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Service type not found")

    return {"message": "Service type deleted successfully"}
