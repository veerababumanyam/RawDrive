"""
Invitation Export API Routes

Provides endpoints for exporting invitations as PDF or images.

Feature: 016-save-the-date Phase 11
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field

from src.api.dependencies import get_current_user
from src.services.invitation_export_service import (
    get_invitation_export_service,
    InvitationExportService,
    ExportFormat,
    ExportStatus,
)
from src.services.digital_invitation_service import get_digital_invitation_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class CreateExportRequest(BaseModel):
    format: ExportFormat = Field(ExportFormat.PDF)
    options: Optional[dict] = Field(None, description="Export options like quality, size, etc.")


class ExportJobResponse(BaseModel):
    export_id: UUID
    workspace_id: UUID
    invitation_id: UUID
    format: str
    status: str
    file_url: Optional[str]
    file_size_bytes: Optional[int]
    error_message: Optional[str]
    expires_at: Optional[str]
    created_at: str
    completed_at: Optional[str]


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_service() -> InvitationExportService:
    return get_invitation_export_service()


# ---------------------------------------------------------------------------
# Background Tasks
# ---------------------------------------------------------------------------


async def process_export_task(
    export_id: UUID,
    workspace_id: UUID,
    invitation_id: UUID,
):
    """Background task to process an export job."""
    service = get_invitation_export_service()
    invitation_service = get_digital_invitation_service()
    
    try:
        # Get invitation data
        invitation = await invitation_service.get_invitation(workspace_id, invitation_id)
        if not invitation:
            await service.update_export_status(
                export_id,
                ExportStatus.FAILED,
                error_message="Invitation not found",
            )
            return
        
        # Process the export
        await service.process_export(export_id, invitation)
        
    except Exception as e:
        await service.update_export_status(
            export_id,
            ExportStatus.FAILED,
            error_message=str(e),
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=ExportJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_export(
    workspace_id: UUID,
    invitation_id: UUID,
    request: CreateExportRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    service: InvitationExportService = Depends(get_service),
):
    """Create an export job for an invitation."""
    user_id = current_user.get("user_id")
    
    # Create the export job
    job = await service.create_export_job(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        user_id=UUID(user_id),
        export_format=request.format,
        options=request.options,
    )
    
    # Queue background processing
    background_tasks.add_task(
        process_export_task,
        job["export_id"],
        workspace_id,
        invitation_id,
    )
    
    return ExportJobResponse(
        export_id=job["export_id"],
        workspace_id=job["workspace_id"],
        invitation_id=job["invitation_id"],
        format=job["format"],
        status=job["status"],
        file_url=job.get("file_url"),
        file_size_bytes=job.get("file_size_bytes"),
        error_message=job.get("error_message"),
        expires_at=str(job["expires_at"]) if job.get("expires_at") else None,
        created_at=str(job["created_at"]),
        completed_at=str(job["completed_at"]) if job.get("completed_at") else None,
    )


@router.get("", response_model=List[ExportJobResponse])
async def list_exports(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: dict = Depends(get_current_user),
    service: InvitationExportService = Depends(get_service),
):
    """List all exports for an invitation."""
    jobs = await service.list_exports(workspace_id, invitation_id)
    
    return [
        ExportJobResponse(
            export_id=job["export_id"],
            workspace_id=job["workspace_id"],
            invitation_id=job["invitation_id"],
            format=job["format"],
            status=job["status"],
            file_url=job.get("file_url"),
            file_size_bytes=job.get("file_size_bytes"),
            error_message=job.get("error_message"),
            expires_at=str(job["expires_at"]) if job.get("expires_at") else None,
            created_at=str(job["created_at"]),
            completed_at=str(job["completed_at"]) if job.get("completed_at") else None,
        )
        for job in jobs
    ]


@router.get("/{export_id}", response_model=ExportJobResponse)
async def get_export(
    workspace_id: UUID,
    invitation_id: UUID,
    export_id: UUID,
    current_user: dict = Depends(get_current_user),
    service: InvitationExportService = Depends(get_service),
):
    """Get export job status."""
    job = await service.get_export_job(workspace_id, export_id)
    
    if not job or job["invitation_id"] != invitation_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export not found",
        )
    
    return ExportJobResponse(
        export_id=job["export_id"],
        workspace_id=job["workspace_id"],
        invitation_id=job["invitation_id"],
        format=job["format"],
        status=job["status"],
        file_url=job.get("file_url"),
        file_size_bytes=job.get("file_size_bytes"),
        error_message=job.get("error_message"),
        expires_at=str(job["expires_at"]) if job.get("expires_at") else None,
        created_at=str(job["created_at"]),
        completed_at=str(job["completed_at"]) if job.get("completed_at") else None,
    )


@router.delete("/{export_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_export(
    workspace_id: UUID,
    invitation_id: UUID,
    export_id: UUID,
    current_user: dict = Depends(get_current_user),
    service: InvitationExportService = Depends(get_service),
):
    """Delete an export."""
    deleted = await service.delete_export(workspace_id, export_id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export not found",
        )
    return None
