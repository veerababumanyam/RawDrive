"""UploadService: Secure file upload with validation and session management.

Handles upload session creation, file validation, checksum verification,
and upload session management for the upload microservice.

This is the migrated version of the monolith's upload_service.py, adapted
for microservice architecture with:
- Async SQLAlchemy via the database module
- Redis for chunk buffering
- Kafka for event publishing
- Service isolation (no direct dependencies on other services)

Author: Claude Code Migration
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, TypeVar
from uuid import UUID, uuid4

from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

from app.core.config import get_settings
from app.core.database import fetch_one, fetch_val, execute, get_connection

logger = logging.getLogger(__name__)

# Type variable for generic retry wrapper
T = TypeVar("T")

# =============================================================================
# File Validation Constants
# =============================================================================

# Supported MIME types for images (from shared constants)
SUPPORTED_IMAGE_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/bmp",
    "image/x-ms-bmp",
    "image/tiff",
    "image/tiff-fx",
    "image/gif",
    "image/avif",
]

# Supported MIME types for videos
SUPPORTED_VIDEO_MIME_TYPES = [
    "video/mp4",
    "video/mov",
    "video/quicktime",
]

# RAW file extensions (without leading dot)
SUPPORTED_RAW_EXTENSIONS = [
    "cr2",  # Canon Raw 2
    "cr3",  # Canon Raw 3
    "nef",  # Nikon Electronic Format
    "arw",  # Sony Alpha Raw
    "raf",  # Fujifilm Raw
    "orf",  # Olympus Raw Format
    "rw2",  # Panasonic Raw 2
    "dng",  # Adobe Digital Negative
    "pef",  # Pentax Electronic File
    "rwl",  # Leica Raw
    "srw",  # Samsung Raw
    "x3f",  # Sigma X3F
    "3fr",  # Hasselblad 3FR
]

# Common MIME types for RAW files
RAW_MIME_TYPES = [
    "image/x-canon-cr2",
    "image/x-canon-cr3",
    "image/x-nikon-nef",
    "image/x-sony-arw",
    "image/x-fuji-raf",
    "image/x-olympus-orf",
    "image/x-panasonic-rw2",
    "image/x-adobe-dng",
    "image/x-pentax-pef",
    "image/x-leica-rwl",
    "image/x-samsung-srw",
    "image/x-sigma-x3f",
    "image/x-hasselblad-3fr",
    "application/octet-stream",
]

# Convert to sets for faster lookups
ALLOWED_IMAGE_TYPES = set(SUPPORTED_IMAGE_MIME_TYPES)
ALLOWED_VIDEO_TYPES = set(SUPPORTED_VIDEO_MIME_TYPES)
ALLOWED_RAW_MIME_TYPES = set(RAW_MIME_TYPES)
ALLOWED_MIME_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES | ALLOWED_RAW_MIME_TYPES

# Storage units
STORAGE_MB = 1024 * 1024
STORAGE_GB = 1024 * 1024 * 1024

# File size limits (in bytes)
MAX_FILE_SIZE = 100 * STORAGE_MB  # 100MB for regular images
MAX_RAW_SIZE = 200 * STORAGE_MB   # 200MB for RAW files
MAX_VIDEO_SIZE = 500 * STORAGE_MB  # 500MB for videos

# Upload session configuration
UPLOAD_SESSION_TTL_HOURS = 24

# =============================================================================
# Retry Configuration
# =============================================================================

# Retry configuration for storage operations
STORAGE_RETRY_ATTEMPTS = 5
STORAGE_RETRY_WAIT_MIN = 1  # seconds
STORAGE_RETRY_WAIT_MAX = 30  # seconds
STORAGE_RETRY_WAIT_MULTIPLIER = 2


def storage_retry_config() -> dict[str, Any]:
    """Get retry configuration for storage operations.

    Returns a dict of tenacity retry parameters suitable for async operations.
    """
    settings = get_settings()
    return {
        "stop": stop_after_attempt(settings.STORAGE_RETRY_ATTEMPTS),
        "wait": wait_exponential(
            multiplier=settings.STORAGE_RETRY_MULTIPLIER,
            min=settings.STORAGE_RETRY_WAIT_MIN,
            max=settings.STORAGE_RETRY_WAIT_MAX,
        ),
        "before_sleep": before_sleep_log(logger, logging.WARNING),
        "reraise": True,
    }


# =============================================================================
# Exceptions
# =============================================================================


class UploadError(Exception):
    """Base upload error with HTTP status code support.

    Attributes:
        message: Human-readable error message
        code: Machine-readable error code for client handling
        status: HTTP status code to return
    """

    def __init__(
        self,
        message: str,
        code: str = "UPLOAD_ERROR",
        status: int = 400,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON response."""
        return {
            "error": self.code,
            "message": self.message,
            "status": self.status,
        }


class ValidationError(UploadError):
    """File validation failed."""

    def __init__(self, message: str, code: str = "VALIDATION_ERROR") -> None:
        super().__init__(message, code, 400)


class SessionNotFoundError(UploadError):
    """Upload session not found."""

    def __init__(self, upload_id: UUID) -> None:
        super().__init__(
            f"Upload session not found: {upload_id}",
            "SESSION_NOT_FOUND",
            404,
        )


class SessionExpiredError(UploadError):
    """Upload session has expired."""

    def __init__(self, upload_id: UUID) -> None:
        super().__init__(
            f"Upload session expired: {upload_id}",
            "SESSION_EXPIRED",
            410,
        )


class StorageLimitExceededError(UploadError):
    """Workspace storage limit exceeded."""

    def __init__(self, message: str = "Storage limit exceeded") -> None:
        super().__init__(message, "STORAGE_LIMIT_EXCEEDED", 402)


class ChecksumMismatchError(UploadError):
    """File checksum verification failed."""

    def __init__(self, expected: str, actual: str) -> None:
        super().__init__(
            f"Checksum mismatch: expected {expected}, got {actual}",
            "CHECKSUM_MISMATCH",
            400,
        )


# =============================================================================
# Upload Service
# =============================================================================


class UploadService:
    """Service for secure file uploads with validation and session management.

    This service handles:
    - File type and size validation (images, videos, RAW files)
    - Upload session creation and management
    - Sub-gallery auto-creation for folder uploads
    - Storage quota checking
    - SHA256 checksum verification

    The service is stateless and uses the database for session persistence.
    """

    def __init__(self) -> None:
        """Initialize the upload service."""
        self._settings = get_settings()

    # =========================================================================
    # File Validation
    # =========================================================================

    def validate_file(
        self,
        filename: str,
        mime_type: str,
        size_bytes: int,
    ) -> tuple[str, str]:
        """Validate file type and size with extension fallback for RAW files.

        Handles the complexity of RAW file detection where MIME types are
        unreliable. Uses a combination of MIME type and file extension
        to accurately identify and validate files.

        Args:
            filename: Original filename with extension
            mime_type: Declared MIME type (may be empty/generic for RAW)
            size_bytes: File size in bytes

        Returns:
            Tuple of (file_type, normalized_mime_type)
            - file_type: "photo" or "video"
            - normalized_mime_type: Cleaned MIME type or synthetic RAW type

        Raises:
            ValidationError: If file type is unsupported or size exceeds limit
        """
        # Normalize MIME type
        mime_type = mime_type.lower().strip() if mime_type else ""

        # Extract file extension
        ext = filename.lower().split(".")[-1] if "." in filename else ""

        # Determine if this is a RAW file by extension
        is_raw_extension = ext in SUPPORTED_RAW_EXTENSIONS

        # Case 1: Empty or generic MIME type + RAW extension
        if (not mime_type or mime_type == "application/octet-stream") and is_raw_extension:
            logger.info(
                "Detected RAW file by extension",
                extra={
                    "filename": filename,
                    "extension": ext,
                    "original_mime": mime_type,
                },
            )
            normalized_mime_type = f"image/x-raw-{ext}"
            file_type = "photo"
            max_size = MAX_RAW_SIZE

        # Case 2: Valid MIME type in allowed list
        elif mime_type in ALLOWED_MIME_TYPES:
            normalized_mime_type = mime_type
            if mime_type in ALLOWED_IMAGE_TYPES or mime_type in ALLOWED_RAW_MIME_TYPES:
                file_type = "photo"
                max_size = MAX_RAW_SIZE if is_raw_extension else MAX_FILE_SIZE
            elif mime_type in ALLOWED_VIDEO_TYPES:
                file_type = "video"
                max_size = MAX_VIDEO_SIZE
            else:
                raise ValidationError(
                    f"Unknown file type: {mime_type}",
                    "UNKNOWN_FILE_TYPE",
                )

        # Case 3: RAW extension with non-standard MIME type
        elif is_raw_extension:
            logger.info(
                "Detected RAW file by extension with non-standard MIME",
                extra={
                    "filename": filename,
                    "extension": ext,
                    "original_mime": mime_type,
                },
            )
            normalized_mime_type = f"image/x-raw-{ext}"
            file_type = "photo"
            max_size = MAX_RAW_SIZE

        # Case 4: Invalid - no valid MIME and no RAW extension
        else:
            allowed_types = sorted(ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES)
            raise ValidationError(
                f"Unsupported file type: {mime_type or 'empty'} for file {filename}. "
                f"Allowed MIME types: {', '.join(allowed_types[:10])}... "
                f"Allowed RAW extensions: {', '.join(SUPPORTED_RAW_EXTENSIONS)}",
                "INVALID_FILE_TYPE",
            )

        # Validate file size
        if size_bytes > max_size:
            max_size_mb = max_size / STORAGE_MB
            raise ValidationError(
                f"File too large: {size_bytes} bytes. Maximum: {max_size_mb:.0f}MB",
                "FILE_TOO_LARGE",
            )

        if size_bytes <= 0:
            raise ValidationError(
                "File size must be greater than 0",
                "INVALID_FILE_SIZE",
            )

        # Log RAW file uploads for monitoring
        if is_raw_extension:
            logger.info(
                "RAW file accepted",
                extra={
                    "filename": filename,
                    "extension": ext.upper(),
                    "size_bytes": size_bytes,
                },
            )

        return file_type, normalized_mime_type

    # =========================================================================
    # Storage Quota Checking
    # =========================================================================

    async def check_storage_quota(
        self,
        workspace_id: UUID,
        size_bytes: int,
    ) -> tuple[bool, Optional[str]]:
        """Check if workspace has sufficient storage quota for upload.

        Queries the workspace's current storage usage and plan limits.
        Returns whether the upload is allowed and an error message if not.

        Args:
            workspace_id: Workspace UUID
            size_bytes: Size of file to upload in bytes

        Returns:
            Tuple of (allowed: bool, error_message: Optional[str])
        """
        # Query current storage usage and limit
        query = """
            SELECT
                COALESCE(w.storage_used_bytes, 0) as storage_used,
                COALESCE(p.storage_bytes, 0) as storage_limit
            FROM workspaces w
            LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = w.workspace_id
            LEFT JOIN plans p ON p.plan_id = ws.plan_id
            WHERE w.workspace_id = :workspace_id
        """

        row = await fetch_one(query, {"workspace_id": workspace_id})

        if not row:
            logger.warning(
                "Workspace not found for storage check",
                extra={"workspace_id": str(workspace_id)},
            )
            return False, "Workspace not found"

        storage_used = row[0] or 0
        storage_limit = row[1] or 0

        # Allow upload if no limit is set (unlimited plan)
        if storage_limit == 0:
            return True, None

        # Check if upload would exceed limit
        if storage_used + size_bytes > storage_limit:
            used_gb = storage_used / STORAGE_GB
            limit_gb = storage_limit / STORAGE_GB
            return False, (
                f"Storage limit exceeded. "
                f"Used: {used_gb:.2f}GB, Limit: {limit_gb:.2f}GB. "
                f"Please upgrade your plan or delete unused files."
            )

        return True, None

    # =========================================================================
    # Sub-Gallery Management
    # =========================================================================

    async def _get_or_create_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        name: str,
    ) -> UUID:
        """Get existing sub-gallery by name or create a new one.

        Used for folder uploads where each top-level folder becomes a
        sub-gallery. Handles race conditions with ON CONFLICT DO NOTHING.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Parent gallery UUID
            name: Sub-gallery name (typically folder name)

        Returns:
            UUID of the existing or newly created sub-gallery

        Raises:
            UploadError: If sub-gallery creation fails
        """
        # Try to find existing sub-gallery (exclude deleted)
        existing = await fetch_one(
            """
            SELECT sub_gallery_id FROM sub_galleries
            WHERE gallery_id = :gallery_id AND name = :name AND deleted = FALSE
            """,
            {"gallery_id": gallery_id, "name": name},
        )

        if existing:
            return existing[0]

        # Create new sub-gallery
        sub_gallery_id = uuid4()
        try:
            # Use ON CONFLICT DO NOTHING to handle race conditions
            await execute(
                """
                INSERT INTO sub_galleries (
                    sub_gallery_id, workspace_id, gallery_id,
                    name, sort_order, visible, created_at
                )
                VALUES (:sub_gallery_id, :workspace_id, :gallery_id, :name, 0, TRUE, NOW())
                ON CONFLICT (gallery_id, name) DO NOTHING
                """,
                {
                    "sub_gallery_id": sub_gallery_id,
                    "workspace_id": workspace_id,
                    "gallery_id": gallery_id,
                    "name": name,
                },
            )

            # Fetch the authoritative ID (ours or the one that won the race)
            row = await fetch_one(
                """
                SELECT sub_gallery_id FROM sub_galleries
                WHERE gallery_id = :gallery_id AND name = :name AND deleted = FALSE
                """,
                {"gallery_id": gallery_id, "name": name},
            )

            if row:
                return row[0]

            raise UploadError(
                "Failed to create sub-gallery",
                "SUB_GALLERY_CREATION_FAILED",
                500,
            )

        except UploadError:
            raise
        except Exception as e:
            logger.error(
                "Error creating sub-gallery",
                extra={
                    "name": name,
                    "gallery_id": str(gallery_id),
                    "error": str(e),
                },
            )
            raise UploadError(
                f"Failed to create sub-gallery: {e}",
                "SUB_GALLERY_ERROR",
                500,
            ) from e

    # =========================================================================
    # Upload Session Management
    # =========================================================================

    async def create_upload_session(
        self,
        workspace_id: UUID,
        user_id: UUID,
        gallery_id: Optional[UUID],
        filename: str,
        mime_type: str,
        size_bytes: int,
        sub_gallery_id: Optional[UUID] = None,
        sha256: Optional[str] = None,
        relative_path: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new upload session for file upload.

        Validates the file, checks storage quota, handles folder structure,
        and creates a database record for tracking the upload.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID creating the upload
            gallery_id: Target gallery UUID
            filename: Original filename
            mime_type: File MIME type
            size_bytes: File size in bytes
            sub_gallery_id: Optional target sub-gallery UUID
            sha256: Optional SHA256 checksum (can be provided at commit)
            relative_path: Optional relative path for folder uploads

        Returns:
            Dictionary with upload session details:
            - upload_id: Session UUID
            - provider: Storage provider ("r2")
            - upload_url: URL for uploading data
            - headers: Required headers for upload
            - expires_at: Session expiry timestamp

        Raises:
            ValidationError: If file validation fails
            StorageLimitExceededError: If storage quota exceeded
            UploadError: If session creation fails
        """
        # Validate file type and size
        file_type, normalized_mime_type = self.validate_file(
            filename, mime_type, size_bytes
        )

        # Check storage quota
        allowed, error_message = await self.check_storage_quota(
            workspace_id, size_bytes
        )
        if not allowed:
            raise StorageLimitExceededError(error_message or "Storage limit exceeded")

        # Handle folder uploads: create/assign sub-gallery if path provided
        if not sub_gallery_id and relative_path and gallery_id:
            # Extract top-level folder name
            # e.g. "Wedding/Reception/img.jpg" -> "Wedding"
            parts = relative_path.split("/")
            if len(parts) > 1:
                sub_gallery_name = parts[0]
                if sub_gallery_name and sub_gallery_name != ".":
                    sub_gallery_id = await self._get_or_create_sub_gallery(
                        workspace_id, gallery_id, sub_gallery_name
                    )

        # Generate upload ID and expiry
        upload_id = uuid4()
        expires_at = datetime.now(timezone.utc) + timedelta(
            hours=self._settings.UPLOAD_SESSION_TTL_HOURS
        )

        # Create upload session in database
        await execute(
            """
            INSERT INTO upload_sessions (
                upload_id, workspace_id, created_by_user_id,
                gallery_id, sub_gallery_id,
                file_name, mime_type, size_bytes, sha256,
                resumable_protocol, provider, state, expires_at
            )
            VALUES (
                :upload_id, :workspace_id, :user_id,
                :gallery_id, :sub_gallery_id,
                :filename, :mime_type, :size_bytes, :sha256,
                :protocol, :provider, :state, :expires_at
            )
            """,
            {
                "upload_id": upload_id,
                "workspace_id": workspace_id,
                "user_id": user_id,
                "gallery_id": gallery_id,
                "sub_gallery_id": sub_gallery_id,
                "filename": filename,
                "mime_type": normalized_mime_type,
                "size_bytes": size_bytes,
                "sha256": sha256,
                "protocol": "s3_multipart",
                "provider": "r2",
                "state": "created",
                "expires_at": expires_at,
            },
        )

        logger.info(
            "Created upload session",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id) if gallery_id else None,
                "filename": filename,
                "size_bytes": size_bytes,
                "file_type": file_type,
            },
        )

        # Generate upload URL
        # In production, this would be a presigned R2 URL
        # For the microservice, we use our own endpoint
        settings = get_settings()
        base_url = f"http://{settings.HOST}:{settings.PORT}"

        return {
            "upload_id": str(upload_id),
            "provider": "r2",
            "upload_url": f"{base_url}/api/v1/upload/chunk/{upload_id}",
            "headers": {
                "Tus-Resumable": settings.TUS_RESUMABLE_VERSION,
            },
            "expires_at": expires_at.isoformat(),
        }

    async def get_upload_session(
        self,
        workspace_id: UUID,
        upload_id: UUID,
    ) -> dict[str, Any]:
        """Get upload session details and validate ownership.

        Args:
            workspace_id: Workspace UUID for authorization
            upload_id: Upload session UUID

        Returns:
            Dictionary with session details

        Raises:
            SessionNotFoundError: If session doesn't exist
            SessionExpiredError: If session has expired
        """
        row = await fetch_one(
            """
            SELECT
                upload_id, workspace_id, created_by_user_id,
                gallery_id, sub_gallery_id,
                file_name, mime_type, size_bytes, sha256,
                state, expires_at, asset_id, file_bytes
            FROM upload_sessions
            WHERE upload_id = :upload_id AND workspace_id = :workspace_id
            """,
            {"upload_id": upload_id, "workspace_id": workspace_id},
        )

        if not row:
            raise SessionNotFoundError(upload_id)

        # Map row to dict
        session = {
            "upload_id": row[0],
            "workspace_id": row[1],
            "created_by_user_id": row[2],
            "gallery_id": row[3],
            "sub_gallery_id": row[4],
            "file_name": row[5],
            "mime_type": row[6],
            "size_bytes": row[7],
            "sha256": row[8],
            "state": row[9],
            "expires_at": row[10],
            "asset_id": row[11],
            "file_bytes": row[12],
        }

        # Check expiry
        if session["expires_at"] < datetime.now(timezone.utc):
            raise SessionExpiredError(upload_id)

        return session

    async def update_session_state(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        state: str,
        sha256: Optional[str] = None,
        asset_id: Optional[UUID] = None,
        file_bytes: Optional[int] = None,
    ) -> None:
        """Update upload session state.

        Args:
            workspace_id: Workspace UUID for authorization
            upload_id: Upload session UUID
            state: New state (created, uploading, verifying, committed, failed)
            sha256: Optional SHA256 checksum to update
            asset_id: Optional asset ID after commit
            file_bytes: Optional uploaded bytes count
        """
        params: dict[str, Any] = {
            "upload_id": upload_id,
            "workspace_id": workspace_id,
            "state": state,
        }

        set_clauses = ["state = :state"]

        if sha256 is not None:
            set_clauses.append("sha256 = :sha256")
            params["sha256"] = sha256

        if asset_id is not None:
            set_clauses.append("asset_id = :asset_id")
            params["asset_id"] = asset_id

        if file_bytes is not None:
            set_clauses.append("file_bytes = :file_bytes")
            params["file_bytes"] = file_bytes

        await execute(
            f"""
            UPDATE upload_sessions
            SET {", ".join(set_clauses)}
            WHERE upload_id = :upload_id AND workspace_id = :workspace_id
            """,
            params,
        )

        logger.debug(
            "Updated upload session state",
            extra={
                "upload_id": str(upload_id),
                "state": state,
            },
        )

    async def verify_checksum(
        self,
        file_data: bytes,
        expected_sha256: Optional[str],
    ) -> str:
        """Verify file checksum and return computed hash.

        Args:
            file_data: File bytes to verify
            expected_sha256: Expected SHA256 hash (optional)

        Returns:
            Computed SHA256 hash

        Raises:
            ChecksumMismatchError: If checksums don't match
        """
        computed_sha256 = hashlib.sha256(file_data).hexdigest()

        if expected_sha256 and computed_sha256 != expected_sha256:
            raise ChecksumMismatchError(expected_sha256, computed_sha256)

        return computed_sha256

    # =========================================================================
    # Duplicate Detection
    # =========================================================================

    async def check_duplicate(
        self,
        workspace_id: UUID,
        sha256: str,
        gallery_id: Optional[UUID] = None,
    ) -> list[dict[str, Any]]:
        """Check for duplicate files by SHA256 hash.

        Searches for existing assets with matching SHA256 in the workspace
        or specific gallery.

        Args:
            workspace_id: Workspace UUID
            sha256: SHA256 hash to check
            gallery_id: Optional gallery UUID to limit search

        Returns:
            List of matching asset dictionaries with:
            - asset_id, filename, mime_type, size_bytes, gallery_id, created_at
        """
        if gallery_id:
            query = """
                SELECT
                    a.asset_id,
                    a.original_object_key as filename,
                    a.mime_type,
                    a.original_bytes as size_bytes,
                    ga.gallery_id,
                    a.created_at
                FROM assets a
                JOIN gallery_assets ga ON ga.asset_id = a.asset_id
                WHERE a.workspace_id = :workspace_id
                  AND a.sha256 = :sha256
                  AND ga.gallery_id = :gallery_id
                  AND a.status != 'deleted'
                LIMIT 10
            """
            params = {
                "workspace_id": workspace_id,
                "sha256": sha256,
                "gallery_id": gallery_id,
            }
        else:
            query = """
                SELECT
                    a.asset_id,
                    a.original_object_key as filename,
                    a.mime_type,
                    a.original_bytes as size_bytes,
                    ga.gallery_id,
                    a.created_at
                FROM assets a
                LEFT JOIN gallery_assets ga ON ga.asset_id = a.asset_id
                WHERE a.workspace_id = :workspace_id
                  AND a.sha256 = :sha256
                  AND a.status != 'deleted'
                LIMIT 10
            """
            params = {"workspace_id": workspace_id, "sha256": sha256}

        async with get_connection() as conn:
            from sqlalchemy import text
            result = await conn.execute(text(query), params)
            rows = result.fetchall()

        duplicates = []
        for row in rows:
            # Extract filename from object key
            object_key = row[1] or ""
            filename = object_key.split("/")[-1] if "/" in object_key else object_key

            duplicates.append({
                "asset_id": row[0],
                "filename": filename,
                "mime_type": row[2],
                "size_bytes": row[3],
                "gallery_id": row[4],
                "created_at": row[5].isoformat() if row[5] else None,
            })

        return duplicates

    # =========================================================================
    # Session Cleanup
    # =========================================================================

    async def cleanup_expired_sessions(self, batch_size: int = 100) -> int:
        """Clean up expired upload sessions.

        Removes sessions that have passed their expiry time.
        Should be called periodically by a background task.

        Args:
            batch_size: Maximum sessions to delete per call

        Returns:
            Number of sessions deleted
        """
        # Delete expired sessions
        result = await fetch_val(
            """
            WITH deleted AS (
                DELETE FROM upload_sessions
                WHERE expires_at < NOW()
                  AND state NOT IN ('committed')
                LIMIT :batch_size
                RETURNING upload_id
            )
            SELECT COUNT(*) FROM deleted
            """,
            {"batch_size": batch_size},
        )

        deleted_count = result or 0

        if deleted_count > 0:
            logger.info(
                "Cleaned up expired upload sessions",
                extra={"deleted_count": deleted_count},
            )

        return deleted_count


# =============================================================================
# Singleton Instance
# =============================================================================

_upload_service: Optional[UploadService] = None


def get_upload_service() -> UploadService:
    """Get singleton upload service instance.

    Returns:
        UploadService instance
    """
    global _upload_service
    if _upload_service is None:
        _upload_service = UploadService()
    return _upload_service


def reset_upload_service() -> None:
    """Reset singleton instance (for testing)."""
    global _upload_service
    _upload_service = None


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Service
    "UploadService",
    "get_upload_service",
    "reset_upload_service",
    # Exceptions
    "UploadError",
    "ValidationError",
    "SessionNotFoundError",
    "SessionExpiredError",
    "StorageLimitExceededError",
    "ChecksumMismatchError",
    # Constants
    "SUPPORTED_IMAGE_MIME_TYPES",
    "SUPPORTED_VIDEO_MIME_TYPES",
    "SUPPORTED_RAW_EXTENSIONS",
    "RAW_MIME_TYPES",
    "ALLOWED_MIME_TYPES",
    "MAX_FILE_SIZE",
    "MAX_RAW_SIZE",
    "MAX_VIDEO_SIZE",
    "UPLOAD_SESSION_TTL_HOURS",
]
