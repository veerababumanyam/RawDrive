"""UploadService: Secure file upload with encryption and processing.

Handles upload session creation, file validation, checksum verification,
and encrypted storage with image processing.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool
from app.services.encryption_service import get_encryption_service
from app.services.image_processing_service import get_image_processing_service
from app.services.metadata_service import get_metadata_service
from app.services.r2_storage_service import get_r2_storage_service
from app.services.task_queue import TaskPriority, get_task_queue

logger = logging.getLogger(__name__)

# File validation constants
ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/mov", "video/quicktime"}
ALLOWED_MIME_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB for images
MAX_VIDEO_SIZE = 500 * 1024 * 1024  # 500MB for videos
UPLOAD_SESSION_TTL_HOURS = 24


class UploadError(Exception):
    """Base upload error."""

    def __init__(self, message: str, code: str = "UPLOAD_ERROR", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class UploadService:
    """Service for secure file uploads with encryption."""

    def __init__(self):
        self.encryption_service = get_encryption_service()
        self.storage_service = get_r2_storage_service()
        self.metadata_service = get_metadata_service()
        self.image_processing_service = get_image_processing_service()

    def validate_file(
        self, filename: str, mime_type: str, size_bytes: int
    ) -> tuple[str, str]:
        """Validate file type and size.

        Args:
            filename: Original filename
            mime_type: MIME type
            size_bytes: File size in bytes

        Returns:
            Tuple of (file_type, normalized_mime_type)

        Raises:
            UploadError: If validation fails
        """
        # Normalize MIME type
        mime_type = mime_type.lower().strip()

        # Validate MIME type
        if mime_type not in ALLOWED_MIME_TYPES:
            raise UploadError(
                f"Unsupported file type: {mime_type}. "
                f"Allowed types: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
                "INVALID_FILE_TYPE",
            )

        # Determine file type
        if mime_type in ALLOWED_IMAGE_TYPES:
            file_type = "photo"
            max_size = MAX_FILE_SIZE
        elif mime_type in ALLOWED_VIDEO_TYPES:
            file_type = "video"
            max_size = MAX_VIDEO_SIZE
        else:
            raise UploadError(f"Unknown file type: {mime_type}", "UNKNOWN_FILE_TYPE")

        # Validate file size
        if size_bytes > max_size:
            raise UploadError(
                f"File too large: {size_bytes} bytes. Maximum: {max_size} bytes",
                "FILE_TOO_LARGE",
            )

        return file_type, mime_type

    async def _get_or_create_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        name: str,
    ) -> UUID:
        """Get or create sub-gallery by name."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Try to find existing
            row = await conn.fetchrow(
                """
                SELECT sub_gallery_id FROM sub_galleries
                WHERE gallery_id = $1 AND name = $2
                """,
                gallery_id,
                name,
            )
            if row:
                return row["sub_gallery_id"]

            # Create new
            sub_gallery_id = uuid4()
            try:
                # We use ON CONFLICT DO NOTHING to handle race conditions
                # where another upload might create it simultaneously
                await conn.execute(
                    """
                    INSERT INTO sub_galleries (
                        sub_gallery_id, workspace_id, gallery_id,
                        name, sort_order, visible, created_at
                    )
                    VALUES ($1, $2, $3, $4, 0, TRUE, NOW())
                    ON CONFLICT (gallery_id, name) DO NOTHING
                    """,
                    sub_gallery_id,
                    workspace_id,
                    gallery_id,
                    name,
                )
                
                # Fetch again to get the authoritative ID (ours or the one that won the race)
                row = await conn.fetchrow(
                    """
                    SELECT sub_gallery_id FROM sub_galleries
                    WHERE gallery_id = $1 AND name = $2
                    """,
                    gallery_id,
                    name,
                )
                if row:
                    return row["sub_gallery_id"]
                
                # Should not happen unless delete happened in between
                raise UploadError("Failed to create sub-gallery", "SUB_GALLERY_CREATION_FAILED")
                
            except Exception as e:
                logger.error(f"Error creating sub-gallery {name}: {e}")
                raise UploadError(f"Failed to create sub-gallery: {e}", "SUB_GALLERY_ERROR")

    async def create_upload_session(
        self,
        workspace_id: UUID,
        user_id: UUID,
        gallery_id: UUID,
        filename: str,
        mime_type: str,
        size_bytes: int,
        sub_gallery_id: Optional[UUID] = None,
        sha256: Optional[str] = None,
        relative_path: Optional[str] = None,
    ) -> dict:
        """Create upload session for file upload.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID creating the upload
            gallery_id: Target gallery UUID
            filename: Original filename
            mime_type: MIME type
            size_bytes: File size in bytes
            sub_gallery_id: Optional sub-gallery UUID
            sha256: Optional SHA256 checksum (can be provided at commit)
            relative_path: Optional relative path from client (for folder uploads)

        Returns:
            Dictionary with upload_id, upload_url, headers, expires_at

        Raises:
            UploadError: If validation fails
        """
        # Validate file
        file_type, normalized_mime_type = self.validate_file(
            filename, mime_type, size_bytes
        )

        # Handle folder uploads: create/assign sub-gallery if path provided
        if not sub_gallery_id and relative_path:
            # Extract top-level folder name
            # e.g. "Wedding/Reception/img.jpg" -> "Wedding"
            # e.g. "JustFolder/img.jpg" -> "JustFolder"
            parts = relative_path.split("/")
            if len(parts) > 1:
                # Use the first directory as sub-gallery name
                sub_gallery_name = parts[0]
                if sub_gallery_name and sub_gallery_name != ".":
                     sub_gallery_id = await self._get_or_create_sub_gallery(
                        workspace_id, gallery_id, sub_gallery_name
                    )

        # Generate upload ID
        upload_id = uuid4()

        # Calculate expiry (24 hours from now)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=UPLOAD_SESSION_TTL_HOURS)

        # Store upload session in database
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO upload_sessions (
                    upload_id, workspace_id, created_by_user_id,
                    gallery_id, sub_gallery_id,
                    file_name, mime_type, size_bytes, sha256,
                    resumable_protocol, provider, state, expires_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                """,
                upload_id,
                workspace_id,
                user_id,
                gallery_id,
                sub_gallery_id,
                filename,
                normalized_mime_type,
                size_bytes,
                sha256,
                "s3_multipart",  # Use S3 multipart for R2
                "r2",
                "created",
                expires_at,
            )

        # Generate presigned URL for direct upload to R2
        # For now, we'll return a placeholder - full implementation would generate
        # a presigned PUT URL for the temporary upload location
        # The actual upload would happen directly to R2, then we'd move/encrypt on commit

        logger.info(
            f"Created upload session: {upload_id} "
            f"(workspace={workspace_id}, gallery={gallery_id}, file={filename})"
        )

        # Generate absolute URL for upload endpoint
        # In production, this would be a presigned R2 URL
        # For now, return backend endpoint URL
        from app.config.settings import get_settings
        settings = get_settings()

        # Use API_BASE_URL if configured, otherwise fallback to localhost
        if settings.api_base_url:
            api_base_url = settings.api_base_url.rstrip("/")
        else:
            api_base_url = f"http://localhost:{settings.api_port}"

        return {
            "upload_id": str(upload_id),
            "provider": "r2",
            "upload_url": f"{api_base_url}/api/v1/workspaces/{workspace_id}/uploads/{upload_id}/upload",
            "headers": {},
            "expires_at": expires_at.isoformat(),
        }

    async def process_proxy_upload(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        file_data: Optional[bytes] = None,
        sha256: Optional[str] = None,
    ) -> dict:
        """Process proxy upload: verify, encrypt, store, and create asset.

        This method is idempotent:
        - If called with file_data (via PUT): performs upload and marks as committed.
        - If called without file_data (via COMMIT): checks if committed and returns result.

        Args:
            workspace_id: Workspace UUID
            upload_id: Upload session UUID
            file_data: Uploaded file bytes (optional if already committed)
            sha256: SHA256 checksum (optional)

        Returns:
            Dictionary with asset_id and status

        Raises:
            UploadError: If processing fails or state is invalid
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get upload session
            session = await conn.fetchrow(
                """
                SELECT
                    upload_id, workspace_id, created_by_user_id,
                    gallery_id, sub_gallery_id,
                    file_name, mime_type, size_bytes, sha256 as session_sha256,
                    state, expires_at, asset_id
                FROM upload_sessions
                WHERE upload_id = $1 AND workspace_id = $2
                """,
                upload_id,
                workspace_id,
            )

            if not session:
                raise UploadError(
                    f"Upload session not found: {upload_id}",
                    "UPLOAD_NOT_FOUND",
                    404,
                )

            # Check expiry
            if session["expires_at"] < datetime.now(timezone.utc):
                raise UploadError(
                    f"Upload session expired: {upload_id}",
                    "UPLOAD_EXPIRED",
                )

            # Handle Idempotency: If already committed, return success
            if session["state"] == "committed":
                if session["asset_id"]:
                    return {
                        "asset_id": str(session["asset_id"]),
                        "status": "processing",
                    }
                else:
                    # Should not happen if state is committed
                    raise UploadError(
                        "Upload is committed but asset_id is missing",
                        "INVALID_STATE",
                    )

            # If not committed, we MUST have file_data to proceed
            if not file_data:
                raise UploadError(
                    "File data required for processing",
                    "FILE_REQUIRED",
                )

            # Verify checksum
            computed_sha256 = hashlib.sha256(file_data).hexdigest()
            expected_sha256 = sha256 or session["session_sha256"]

            if expected_sha256 and computed_sha256 != expected_sha256:
                raise UploadError(
                    f"Checksum mismatch: expected {expected_sha256}, got {computed_sha256}",
                    "CHECKSUM_MISMATCH",
                )

            # Generate SHA256 if not provided in session
            final_sha256 = expected_sha256 or computed_sha256

            # Update session state to processing
            await conn.execute(
                """
                UPDATE upload_sessions
                SET state = 'verifying', sha256 = $1
                WHERE upload_id = $2
                """,
                final_sha256,
                upload_id,
            )

            # Determine file type
            file_type, _ = self.validate_file(
                session["file_name"], session["mime_type"], len(file_data)
            )

            # Create asset record
            asset_id = uuid4()
            # Handle asyncpg UUID objects (they're already UUIDs)
            gallery_id = session["gallery_id"] if isinstance(session["gallery_id"], UUID) else UUID(str(session["gallery_id"]))

            # Extract metadata (for images)
            metadata = None
            if file_type == "photo":
                try:
                    metadata = self.metadata_service.extract_metadata(
                        file_data, workspace_id, strip_gps=False  # TODO: Use workspace privacy setting
                    )
                except Exception as e:
                    logger.warning(f"Failed to extract metadata: {e}")

            # Get image dimensions
            width, height = None, None
            if file_type == "photo":
                try:
                    width, height = self.image_processing_service.get_image_dimensions(
                        file_data
                    )
                except Exception as e:
                    logger.warning(f"Failed to get image dimensions: {e}")

            # Create asset record
            original_object_key = f"workspaces/{workspace_id}/galleries/{gallery_id}/original/{asset_id}/{session['file_name']}"
            
            await conn.execute(
                """
                INSERT INTO assets (
                    asset_id, workspace_id, library_id,
                    type, original_object_key, original_bytes,
                    sha256, mime_type, exif, status, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                asset_id,
                workspace_id,
                None,
                file_type,
                original_object_key,
                len(file_data),
                final_sha256,
                session["mime_type"],
                metadata,
                "processing",
                session["created_by_user_id"] if isinstance(session["created_by_user_id"], UUID) else UUID(str(session["created_by_user_id"])),
            )

            # Link asset to gallery
            await conn.execute(
                """
                INSERT INTO gallery_assets (
                    workspace_id, gallery_id, sub_gallery_id, asset_id,
                    sort_order, visible
                )
                VALUES ($1, $2, $3, $4, 0, TRUE)
                ON CONFLICT (gallery_id, asset_id) DO NOTHING
                """,
                workspace_id,
                gallery_id,
                session["sub_gallery_id"],
                asset_id,
            )

            # Encrypt and store original file
            try:
                encrypted_original, _, _, _ = (
                    await self.encryption_service.encrypt_file(
                        file_data, workspace_id, asset_id, variant="original"
                    )
                )

                # Upload original to R2
                await self.storage_service.upload_encrypted_file(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    asset_id=asset_id,
                    variant="original",
                    filename=session["file_name"],
                    encrypted_data=encrypted_original,
                    content_type=session["mime_type"],
                )

            except Exception as e:
                logger.error(f"Failed to encrypt/upload original file: {e}")
                await conn.execute(
                    "UPDATE assets SET status = 'failed' WHERE asset_id = $1",
                    asset_id,
                )
                raise UploadError(
                    f"Failed to store original file: {e}",
                    "STORAGE_FAILED",
                    500,
                ) from e

            # Enqueue background job
            if file_type == "photo":
                try:
                    task_queue = get_task_queue()
                    await task_queue.enqueue(
                        task_type="asset.process",
                        payload={
                            "asset_id": str(asset_id),
                            "workspace_id": str(workspace_id),
                            "gallery_id": str(gallery_id),
                            "file_type": file_type,
                            "mime_type": session["mime_type"],
                            "original_object_key": original_object_key,
                        },
                        priority=TaskPriority.HIGH,
                        max_retries=3,
                    )
                except Exception as e:
                    logger.error(f"Failed to enqueue asset processing job: {e}")

            # Update upload session with asset_id and state
            await conn.execute(
                """
                UPDATE upload_sessions
                SET state = 'committed', asset_id = $1
                WHERE upload_id = $2
                """,
                asset_id,
                upload_id,
            )

            logger.info(
                f"Processed upload: {upload_id} -> asset {asset_id}"
            )

            try:
                from app.services.websocket_service import emit_asset_created
                await emit_asset_created(workspace_id, gallery_id, asset_id)
            except Exception as e:
                logger.warning(f"Failed to emit asset:created event: {e}")

            return {
                "asset_id": str(asset_id),
                "status": "processing",
            }


# Export singleton instance
_upload_service: Optional[UploadService] = None


def get_upload_service() -> UploadService:
    """Get singleton upload service instance."""
    global _upload_service
    if _upload_service is None:
        _upload_service = UploadService()
    return _upload_service

