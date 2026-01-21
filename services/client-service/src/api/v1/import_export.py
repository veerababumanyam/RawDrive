"""
Import/Export API endpoints.

Provides REST API for bulk client operations:
- Import clients from CSV with duplicate detection
- Export clients to CSV with filtering
- Download CSV template
"""

from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse
from io import BytesIO

from src.services.import_export_service import (
    ImportExportService,
    get_import_export_service,
)
from src.schemas.import_export import ImportResult
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.middleware.rbac import require_permission
from src.constants.permissions import Permission
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/clients",
    tags=["import-export"],
)


# =============================================================================
# Import Endpoints
# =============================================================================


@router.post("/import", response_model=ImportResult)
async def import_clients(
    file: UploadFile = File(..., description="CSV file to import"),
    skip_duplicates: bool = Query(
        True, description="Skip rows with duplicate emails"
    ),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ImportExportService = Depends(get_import_export_service),
    current_user: JWTPayload = Depends(get_current_user),
    _: None = Depends(require_permission(Permission.CLIENTS_IMPORT)),
) -> ImportResult:
    """
    Import clients from CSV file.

    CSV format:
    - Required columns: full_name
    - Optional columns: first_name, last_name, company_name, email, phone, status, tags, address fields, notes

    Duplicate detection:
    - If skip_duplicates=true, rows with duplicate emails will be skipped
    - Errors and warnings will be returned in the response

    Args:
        file: CSV file upload
        skip_duplicates: Whether to skip duplicate emails
        workspace_id: Workspace ID
        service: ImportExportService instance
        current_user: Current user from JWT

    Returns:
        ImportResult: Import summary with counts and errors

    Raises:
        HTTPException: 400 if file is not CSV or validation fails
        HTTPException: 413 if file is too large
    """
    # Validate file type
    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="INVALID_FILE_TYPE",
                message="File must be a CSV file (.csv extension)",
            ).model_dump(),
        )

    # Read file content
    try:
        content = await file.read()
        content_str = content.decode("utf-8")

        # Check file size (max 10MB)
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=ErrorResponse(
                    error="FILE_TOO_LARGE",
                    message="File size exceeds 10MB limit",
                ).model_dump(),
            )

    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="INVALID_ENCODING",
                message="File must be UTF-8 encoded",
            ).model_dump(),
        )
    except Exception as e:
        logger.error(
            "File read error",
            extra={"error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="FILE_READ_ERROR",
                message="Failed to read file",
            ).model_dump(),
        )

    # Import clients
    try:
        result = await service.import_clients_from_csv(
            workspace_id=str(workspace_id),
            file_content=content_str,
            skip_duplicates=skip_duplicates,
        )

        logger.info(
            "Clients imported",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "imported": result["imported_count"],
                "skipped": result["skipped_count"],
                "errors": result["error_count"],
            },
        )

        return ImportResult(**result)

    except Exception as e:
        logger.error(
            "Import failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="IMPORT_FAILED",
                message="Failed to import clients",
            ).model_dump(),
        )


@router.get("/import/template")
async def get_import_template(
    workspace_id: UUID = Depends(verify_workspace_access),
    service: ImportExportService = Depends(get_import_export_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> StreamingResponse:
    """
    Download CSV import template.

    Returns a CSV file with headers and an example row.

    Args:
        workspace_id: Workspace ID
        service: ImportExportService instance
        current_user: Current user from JWT

    Returns:
        StreamingResponse: CSV file download
    """
    csv_content = await service.get_csv_template()

    # Create streaming response
    output = BytesIO(csv_content.encode("utf-8"))
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=clients_import_template.csv"
        },
    )


# =============================================================================
# Export Endpoints
# =============================================================================


@router.get("/export")
async def export_clients(
    workspace_id: UUID = Depends(verify_workspace_access),
    status: Optional[str] = Query(None, description="Filter by status"),
    tag_ids: Optional[str] = Query(
        None, description="Comma-separated tag IDs to filter"
    ),
    include_contacts: bool = Query(True, description="Include contact information"),
    include_addresses: bool = Query(True, description="Include address information"),
    include_tags: bool = Query(True, description="Include tags"),
    service: ImportExportService = Depends(get_import_export_service),
    current_user: JWTPayload = Depends(get_current_user),
    _: None = Depends(require_permission(Permission.CLIENTS_EXPORT)),
) -> StreamingResponse:
    """
    Export clients to CSV file.

    Supports filtering by status and tags.

    Args:
        workspace_id: Workspace ID
        status: Optional status filter
        tag_ids: Optional comma-separated tag IDs
        include_contacts: Include contact information
        include_addresses: Include address information
        include_tags: Include tags
        service: ImportExportService instance
        current_user: Current user from JWT

    Returns:
        StreamingResponse: CSV file download
    """
    # Parse tag IDs
    tag_id_list = None
    if tag_ids:
        tag_id_list = [tid.strip() for tid in tag_ids.split(",") if tid.strip()]

    # Export clients
    try:
        csv_content = await service.export_clients_to_csv(
            workspace_id=str(workspace_id),
            status=status,
            tag_ids=tag_id_list,
            include_contacts=include_contacts,
            include_addresses=include_addresses,
            include_tags=include_tags,
        )

        logger.info(
            "Clients exported",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        # Create streaming response
        output = BytesIO(csv_content.encode("utf-8"))
        output.seek(0)

        # Generate filename with timestamp
        from datetime import datetime
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"clients_export_{timestamp}.csv"

        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    except Exception as e:
        logger.error(
            "Export failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="EXPORT_FAILED",
                message="Failed to export clients",
            ).model_dump(),
        )
