"""
Custom Font Upload API for Invitations

Allows users to upload custom fonts for their invitations.
Fonts are stored in workspace-scoped storage and can be reused across invitations.

Feature: 019-invitation-indian-languages (Font Enhancement)
"""

from uuid import UUID, uuid4
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile, File, status, Form
from pydantic import BaseModel

from src.api.dependencies.auth import CurrentUserDep
from src.db.postgres import get_postgres_pool
from src.services.storage_service import get_storage_service

router = APIRouter(prefix="/fonts", tags=["invitation-fonts"])

# Maximum font file size (5MB)
MAX_FONT_SIZE = 5 * 1024 * 1024

# Allowed font MIME types
ALLOWED_FONT_TYPES = {
    "font/ttf": ".ttf",
    "font/otf": ".otf",
    "font/woff": ".woff",
    "font/woff2": ".woff2",
    "application/x-font-ttf": ".ttf",
    "application/x-font-otf": ".otf",
    "application/font-woff": ".woff",
    "application/font-woff2": ".woff2",
    "application/octet-stream": None,  # Will check extension
}

# Allowed file extensions
ALLOWED_EXTENSIONS = {".ttf", ".otf", ".woff", ".woff2"}


class CustomFontResponse(BaseModel):
    """Response model for custom font."""
    font_id: str
    name: str
    family: str
    url: str
    file_size: int
    format: str
    created_at: str
    workspace_id: str


class FontListResponse(BaseModel):
    """Response model for font list."""
    fonts: list[CustomFontResponse]
    total: int


def sanitize_font_name(name: str) -> str:
    """Sanitize font name for use as CSS font-family."""
    # Remove special characters, keep alphanumeric, spaces, and hyphens
    sanitized = re.sub(r'[^a-zA-Z0-9\s\-]', '', name)
    # Replace multiple spaces with single space
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    return sanitized or "Custom Font"


def generate_font_family(font_id: str, name: str) -> str:
    """Generate a unique CSS font-family name."""
    sanitized_name = sanitize_font_name(name)
    return f"'{sanitized_name}', 'CustomFont-{font_id}'"


@router.post(
    "",
    response_model=CustomFontResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a custom font",
    description="Upload a custom font file (TTF, OTF, WOFF, WOFF2) for use in invitations.",
)
async def upload_custom_font(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    name: str = Form(..., description="Display name for the font"),
    file: UploadFile = File(..., description="Font file (TTF, OTF, WOFF, WOFF2)"),
) -> CustomFontResponse:
    """
    Upload a custom font for invitations.

    - Maximum file size: 5MB
    - Supported formats: TTF, OTF, WOFF, WOFF2
    - Font will be available workspace-wide for all invitations
    """
    # Validate file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning

    if file_size > MAX_FONT_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Font file too large. Maximum size is {MAX_FONT_SIZE // (1024 * 1024)}MB.",
        )

    # Validate file type
    content_type = file.content_type or "application/octet-stream"
    file_ext = None

    if file.filename:
        file_ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else None

    if content_type not in ALLOWED_FONT_TYPES:
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Invalid font file type. Supported formats: TTF, OTF, WOFF, WOFF2",
            )

    # Use extension if content_type is generic
    if ALLOWED_FONT_TYPES.get(content_type) is None and file_ext:
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Invalid font file extension. Supported: .ttf, .otf, .woff, .woff2",
            )

    # Generate font ID
    font_id = str(uuid4())

    # Determine format from extension
    font_format = file_ext.lstrip(".") if file_ext else "unknown"

    # Generate storage path
    storage_path = f"workspaces/{workspace_id}/fonts/{font_id}/{file.filename}"

    # Read file content
    file_content = await file.read()

    # Get storage service and upload
    storage = await get_storage_service()
    try:
        await storage.upload_file(
            key=storage_path,
            content=file_content,
            content_type=content_type,
        )

        # Get public URL
        font_url = await storage.get_presigned_url(storage_path, expires_in=86400 * 365)  # 1 year

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload font: {str(e)}",
        )

    # Store font metadata in database
    sanitized_name = sanitize_font_name(name)
    font_family = generate_font_family(font_id, sanitized_name)
    created_at = datetime.now(timezone.utc).isoformat()

    # Insert into database
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO custom_fonts (
                font_id, workspace_id, name, family, url, storage_path,
                file_size, format, created_by_user_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            font_id, str(workspace_id), sanitized_name, font_family, font_url,
            storage_path, file_size, font_format, str(current_user.id), created_at,
        )

    return CustomFontResponse(
        font_id=font_id,
        name=sanitized_name,
        family=font_family,
        url=font_url,
        file_size=file_size,
        format=font_format,
        created_at=created_at,
        workspace_id=str(workspace_id),
    )


@router.get(
    "",
    response_model=FontListResponse,
    summary="List custom fonts",
    description="List all custom fonts uploaded for the workspace.",
)
async def list_custom_fonts(
    workspace_id: UUID,
    current_user: CurrentUserDep,
) -> FontListResponse:
    """List all custom fonts for the workspace."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT font_id, name, family, url, file_size, format, created_at, workspace_id
            FROM custom_fonts
            WHERE workspace_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            """,
            str(workspace_id),
        )

    fonts = [
        CustomFontResponse(
            font_id=row["font_id"],
            name=row["name"],
            family=row["family"],
            url=row["url"],
            file_size=row["file_size"],
            format=row["format"],
            created_at=row["created_at"],
            workspace_id=row["workspace_id"],
        )
        for row in rows
    ]

    return FontListResponse(fonts=fonts, total=len(fonts))


@router.delete(
    "/{font_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete custom font",
    description="Delete a custom font from the workspace.",
)
async def delete_custom_font(
    workspace_id: UUID,
    font_id: str,
    current_user: CurrentUserDep,
) -> None:
    """Soft delete a custom font."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get font info
        row = await conn.fetchrow(
            """
            SELECT storage_path FROM custom_fonts
            WHERE font_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
            """,
            font_id, str(workspace_id),
        )

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Font not found",
            )

        # Soft delete
        await conn.execute(
            """
            UPDATE custom_fonts
            SET deleted_at = $1
            WHERE font_id = $2 AND workspace_id = $3
            """,
            datetime.now(timezone.utc).isoformat(), font_id, str(workspace_id),
        )

    # Optionally delete from storage (or let lifecycle policies handle it)
    # storage = await get_storage_service()
    # await storage.delete_file(row["storage_path"])


@router.get(
    "/{font_id}",
    response_model=CustomFontResponse,
    summary="Get custom font details",
    description="Get details of a specific custom font.",
)
async def get_custom_font(
    workspace_id: UUID,
    font_id: str,
    current_user: CurrentUserDep,
) -> CustomFontResponse:
    """Get details of a specific font."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT font_id, name, family, url, file_size, format, created_at, workspace_id
            FROM custom_fonts
            WHERE font_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
            """,
            font_id, str(workspace_id),
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Font not found",
        )

    return CustomFontResponse(
        font_id=row["font_id"],
        name=row["name"],
        family=row["family"],
        url=row["url"],
        file_size=row["file_size"],
        format=row["format"],
        created_at=row["created_at"],
        workspace_id=row["workspace_id"],
    )
