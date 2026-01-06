"""UploadService: Secure file upload with encryption and processing.

Handles upload session creation, file validation, checksum verification,
and encrypted storage with image processing.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable, Optional, TypeVar
from uuid import UUID, uuid4

from botocore.exceptions import ClientError, BotoCoreError
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

from app.db.postgres import get_postgres_pool
from app.services.chunked_upload_service import get_chunked_upload_service
from app.services.encryption_service import (
    get_encryption_service,
    StreamingEncryptor,
    STREAMING_CHUNK_SIZE,
)
from app.services.image_processing_service import get_image_processing_service
from app.services.metadata_service import get_metadata_service
from app.services.r2_storage_service import get_r2_storage_service, MULTIPART_PART_SIZE, StorageError
from app.services.storage_service import get_storage_service
from app.services.task_queue import TaskPriority, get_task_queue

logger = logging.getLogger(__name__)

# Type variable for generic retry wrapper
T = TypeVar("T")

# Retry configuration for storage operations
# These values are tuned for cloud storage resilience:
# - 5 attempts: handles transient failures without excessive delay
# - exponential backoff: 1s, 2s, 4s, 8s, 16s (max) between retries
# - max wait 30s: prevents excessive delays
STORAGE_RETRY_ATTEMPTS = 5
STORAGE_RETRY_WAIT_MIN = 1  # seconds
STORAGE_RETRY_WAIT_MAX = 30  # seconds
STORAGE_RETRY_WAIT_MULTIPLIER = 2

# Exceptions that are safe to retry (transient network/service errors)
RETRYABLE_STORAGE_EXCEPTIONS = (
    ClientError,
    BotoCoreError,
    StorageError,
    ConnectionError,
    TimeoutError,
)


def is_retryable_storage_error(exception: BaseException) -> bool:
    """Determine if an exception is retryable for storage operations.

    Some errors should not be retried:
    - 4xx client errors (bad request, not found, forbidden)
    - Authentication errors
    - Validation errors

    Retryable errors include:
    - 5xx server errors
    - Network timeouts
    - Connection errors
    - Throttling (429)
    """
    if isinstance(exception, ClientError):
        error_code = exception.response.get("Error", {}).get("Code", "")
        http_status = exception.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0)

        # Don't retry client errors (4xx) except throttling
        if 400 <= http_status < 500 and error_code not in ("Throttling", "SlowDown", "RequestTimeout"):
            return False

        # Retry 5xx server errors and throttling
        return True

    if isinstance(exception, StorageError):
        # Don't retry validation errors
        if exception.code in ("INVALID_VARIANT", "FILE_NOT_FOUND"):
            return False
        return True

    # Retry network-related errors
    return isinstance(exception, (BotoCoreError, ConnectionError, TimeoutError))


# Custom retry predicate that uses our classification function
storage_retry_predicate = retry_if_exception_type(RETRYABLE_STORAGE_EXCEPTIONS)


def storage_retry_config():
    """Get retry configuration for storage operations.

    Returns a dict of tenacity retry parameters suitable for async operations.
    """
    return {
        "stop": stop_after_attempt(STORAGE_RETRY_ATTEMPTS),
        "wait": wait_exponential(
            multiplier=STORAGE_RETRY_WAIT_MULTIPLIER,
            min=STORAGE_RETRY_WAIT_MIN,
            max=STORAGE_RETRY_WAIT_MAX,
        ),
        "retry": storage_retry_predicate,
        "before_sleep": before_sleep_log(logger, logging.WARNING),
        "reraise": True,
    }


async def with_storage_retry(
    operation: Callable[..., T],
    *args,
    operation_name: str = "storage_operation",
    **kwargs,
) -> T:
    """Execute a storage operation with retry logic.

    This wrapper provides exponential backoff retry for transient storage failures.

    Args:
        operation: Async callable to execute
        *args: Positional arguments for the operation
        operation_name: Name for logging purposes
        **kwargs: Keyword arguments for the operation

    Returns:
        Result of the operation

    Raises:
        The original exception after all retries are exhausted
    """
    attempt = 0
    async for attempt_ctx in AsyncRetrying(**storage_retry_config()):
        with attempt_ctx:
            attempt += 1
            if attempt > 1:
                logger.info(f"Retry attempt {attempt} for {operation_name}")
            result = await operation(*args, **kwargs)
            return result

# File validation constants
from app.shared.constants import (
    SUPPORTED_IMAGE_MIME_TYPES,
    SUPPORTED_VIDEO_MIME_TYPES,
    SUPPORTED_RAW_EXTENSIONS,
    RAW_MIME_TYPES,
    FILE_SIZE_LIMITS,
)

# Convert lists to sets for faster lookups
ALLOWED_IMAGE_TYPES = set(SUPPORTED_IMAGE_MIME_TYPES)
ALLOWED_VIDEO_TYPES = set(SUPPORTED_VIDEO_MIME_TYPES)
ALLOWED_RAW_MIME_TYPES = set(RAW_MIME_TYPES)
ALLOWED_MIME_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES | ALLOWED_RAW_MIME_TYPES

MAX_FILE_SIZE = FILE_SIZE_LIMITS["PHOTO"]
MAX_RAW_SIZE = FILE_SIZE_LIMITS["RAW"]
MAX_VIDEO_SIZE = FILE_SIZE_LIMITS["VIDEO"]
UPLOAD_SESSION_TTL_HOURS = 24

# Streaming upload thresholds
STREAMING_THRESHOLD = 10 * 1024 * 1024  # 10MB - files larger use streaming
STREAMING_BUFFER_SIZE = 5 * 1024 * 1024  # 5MB - aligns with S3 minimum part size


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
        """Validate file type and size with extension fallback for RAW files.

        Args:
            filename: Original filename
            mime_type: MIME type (may be empty for RAW files)
            size_bytes: File size in bytes

        Returns:
            Tuple of (file_type, normalized_mime_type_or_extension)

        Raises:
            UploadError: If validation fails
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
                f"Detected RAW file by extension: {filename} (MIME: {mime_type!r})"
            )
            # Use extension as pseudo-mime-type for storage
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
                raise UploadError(
                    f"Unknown file type: {mime_type}", "UNKNOWN_FILE_TYPE"
                )

        # Case 3: RAW extension with RAW-like MIME type
        elif is_raw_extension:
            logger.info(
                f"Detected RAW file by extension with non-standard MIME: {filename} "
                f"(MIME: {mime_type!r})"
            )
            normalized_mime_type = f"image/x-raw-{ext}"
            file_type = "photo"
            max_size = MAX_RAW_SIZE

        # Case 4: Invalid - no valid MIME and no RAW extension
        else:
            raise UploadError(
                f"Unsupported file type: {mime_type or 'empty'} for file {filename}. "
                f"Allowed MIME types: {', '.join(sorted(list(ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES)))}. "
                f"Allowed RAW extensions: {', '.join(SUPPORTED_RAW_EXTENSIONS)}",
                "INVALID_FILE_TYPE",
            )

        # Validate file size
        if size_bytes > max_size:
            max_size_mb = max_size / (1024 * 1024)
            raise UploadError(
                f"File too large: {size_bytes} bytes. Maximum: {max_size_mb}MB",
                "FILE_TOO_LARGE",
            )

        # Security: Log RAW file uploads for monitoring
        if is_raw_extension:
            logger.info(
                f"RAW file accepted: {filename} ({ext.upper()}, {size_bytes} bytes)"
            )

        return file_type, normalized_mime_type

    async def verify_raw_file_content(
        self, file_data: bytes, filename: str, expected_ext: str
    ) -> bool:
        """Verify RAW file content matches declared extension.

        Security measure to prevent extension spoofing.

        Args:
            file_data: File bytes
            filename: Original filename
            expected_ext: Expected extension (e.g., 'cr2')

        Returns:
            True if content matches, False otherwise
        """
        from app.services.raw_processing_service import get_raw_processing_service

        raw_service = get_raw_processing_service()

        try:
            detected_format = raw_service.detect_raw_format(file_data, filename)
            if detected_format is None:
                logger.warning(
                    f"RAW file content verification failed: {filename} "
                    f"(expected {expected_ext}, detected None)"
                )
                return False

            # Check if detected format matches expected extension
            matches = detected_format.value == expected_ext
            if not matches:
                logger.warning(
                    f"RAW file extension mismatch: {filename} "
                    f"(expected {expected_ext}, detected {detected_format.value})"
                )
            return matches

        except Exception as e:
            logger.error(f"RAW file verification error for {filename}: {e}")
            return False

    async def _get_or_create_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        name: str,
    ) -> UUID:
        """Get or create sub-gallery by name."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Try to find existing (exclude deleted)
            row = await conn.fetchrow(
                """
                SELECT sub_gallery_id FROM sub_galleries
                WHERE gallery_id = $1 AND name = $2 AND deleted = FALSE
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
                # Exclude deleted in case a race created then deleted
                row = await conn.fetchrow(
                    """
                    SELECT sub_gallery_id FROM sub_galleries
                    WHERE gallery_id = $1 AND name = $2 AND deleted = FALSE
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
        gallery_id: Optional[UUID],
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
            gallery_id: Target gallery UUID (required - all uploads go to galleries)
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

        # Check storage limit before allowing upload
        storage_service = get_storage_service()
        allowed, error_message = await storage_service.check_upload_allowed(
            workspace_id, size_bytes
        )
        if not allowed:
            raise UploadError(
                error_message or "Storage limit exceeded",
                "STORAGE_LIMIT_EXCEEDED",
                402,  # Payment Required
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
        client_metadata: Optional[dict] = None,
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
            client_metadata: Optional client-side metadata

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
            file_type, normalized_mime = self.validate_file(
                session["file_name"], session["mime_type"], len(file_data)
            )

            # Security: Verify RAW file content matches extension
            if normalized_mime.startswith("image/x-raw-"):
                ext = session["file_name"].lower().split(".")[-1]
                if not await self.verify_raw_file_content(file_data, session["file_name"], ext):
                    raise UploadError(
                        f"RAW file content verification failed for {session['file_name']}. "
                        f"File may be corrupted or extension is incorrect.",
                        "RAW_VERIFICATION_FAILED",
                    )

            # Create asset record
            asset_id = uuid4()
            # Handle asyncpg UUID objects (they're already UUIDs)
            gallery_id = None
            if session["gallery_id"]:
                gallery_id = session["gallery_id"] if isinstance(session["gallery_id"], UUID) else UUID(str(session["gallery_id"]))

            # NOTE: Full metadata extraction is deferred to background processing
            # for faster upload response times. Only basic validation happens here.
            # The asset.extract_metadata task will populate EXIF, dimensions, etc.
            metadata = None
            width, height = None, None

            # Quick dimension check for very small files (< 1MB) - optional optimization
            # For larger files, dimensions are extracted in background
            if file_type == "photo" and len(file_data) < 1024 * 1024:
                try:
                    width, height = self.image_processing_service.get_image_dimensions(
                        file_data
                    )
                except Exception as e:
                    logger.debug(f"Quick dimension extraction failed, will retry in background: {e}")

            # Create asset record - all assets belong to galleries
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

            # Link asset to gallery (only if gallery_id is present)
            if gallery_id:
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
                # Emit encrypting status via WebSocket
                try:
                    from app.services.websocket_service import emit_upload_progress
                    await emit_upload_progress(
                        workspace_id, upload_id, "encrypting", progress=50
                    )
                except Exception:
                    pass  # Non-critical

                encrypted_original, _, _, _ = (
                    await self.encryption_service.encrypt_file(
                        file_data, workspace_id, asset_id, variant="original"
                    )
                )

                # Emit storing status via WebSocket
                try:
                    await emit_upload_progress(
                        workspace_id, upload_id, "storing", progress=75
                    )
                except Exception:
                    pass  # Non-critical

                # Upload original to R2 with retry logic
                await with_storage_retry(
                    self.storage_service.upload_encrypted_file,
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    asset_id=asset_id,
                    variant="original",
                    filename=session["file_name"],
                    encrypted_data=encrypted_original,
                    content_type=session["mime_type"],
                    operation_name="upload_encrypted_original",
                )

            except Exception as e:
                logger.error(f"Failed to encrypt/upload original file: {e}")
                await conn.execute(
                    "UPDATE assets SET status = 'failed' WHERE asset_id = $1",
                    asset_id,
                )
                # Emit error status
                try:
                    from app.services.websocket_service import emit_upload_progress
                    await emit_upload_progress(
                        workspace_id, upload_id, "error", error=str(e)
                    )
                except Exception:
                    pass
                raise UploadError(
                    f"Failed to store original file: {e}",
                    "STORAGE_FAILED",
                    500,
                ) from e

            # Enqueue background jobs
            content_analysis_queued = False  # Track if content detection was queued
            task_queue = get_task_queue()

            if file_type == "photo":
                # Queue thumbnail generation (high priority - users expect thumbnails fast)
                try:
                    await task_queue.enqueue(
                        task_type="asset.process",
                        payload={
                            "asset_id": str(asset_id),
                            "workspace_id": str(workspace_id),
                            "gallery_id": str(gallery_id) if gallery_id else None,
                            "file_type": file_type,
                            "mime_type": session["mime_type"],
                            "original_object_key": original_object_key,
                        },
                        priority=TaskPriority.HIGH,
                        max_retries=3,
                    )
                except Exception as e:
                    logger.error(f"Failed to enqueue asset processing job: {e}")

                # Queue metadata extraction (deferred from upload for speed)
                # This extracts EXIF, dimensions, camera info, GPS, etc.
                try:
                    await task_queue.enqueue(
                        task_type="asset.extract_metadata",
                        payload={
                            "asset_id": str(asset_id),
                            "workspace_id": str(workspace_id),
                            "original_object_key": original_object_key,
                            "mime_type": session["mime_type"],
                        },
                        priority=TaskPriority.NORMAL,
                        max_retries=3,
                    )
                except Exception as e:
                    logger.warning(f"Failed to enqueue metadata extraction job: {e}")
                
                # Queue face detection job for photos
                try:
                    await task_queue.enqueue(
                        task_type="face_detection",
                        payload={
                            "photo_id": str(asset_id),
                            "workspace_id": str(workspace_id),
                            "priority": 0,
                            "client_metadata": client_metadata,
                        },
                        priority=TaskPriority.NORMAL,
                        max_retries=3,
                    )
                except Exception as e:
                    logger.debug(f"Failed to enqueue face detection job: {e}")

                # Queue content detection job for AI tagging (T039)
                # This enables instant AI-powered search after upload
                content_analysis_queued = False
                try:
                    from app.services.content_detection_service import (
                        get_content_detection_service,
                    )

                    content_service = get_content_detection_service()
                    job_id = await content_service.queue_detection(
                        asset_id=asset_id,
                        workspace_id=workspace_id,
                        priority=0,
                    )
                    content_analysis_queued = job_id is not None
                except Exception as e:
                    logger.debug(f"Failed to queue content detection job: {e}")

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
                from app.services.websocket_service import (
                    emit_asset_created,
                    emit_upload_progress,
                )
                # Emit upload complete event
                await emit_upload_progress(
                    workspace_id, upload_id, "complete", progress=100, asset_id=asset_id
                )
                # Emit asset created event (might need update to handle null gallery_id)
                await emit_asset_created(workspace_id, gallery_id, asset_id)
            except Exception as e:
                logger.warning(f"Failed to emit upload complete events: {e}")

            # Invalidate storage cache after successful upload
            try:
                storage_service = get_storage_service()
                await storage_service.invalidate_cache(workspace_id)
            except Exception as e:
                logger.warning(f"Failed to invalidate storage cache: {e}")

            return {
                "asset_id": str(asset_id),
                "status": "processing",
                "analysis_queued": content_analysis_queued,
            }

    async def process_large_upload(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: int,
        client_metadata: Optional[dict] = None,
    ) -> dict:
        """Process a large file using streaming encryption and multipart upload.

        This method is optimized for large files (> 10MB):
        1. Streams chunks from Redis (assembled by chunked_upload_service)
        2. Encrypts in-stream using AES-256-CTR + HMAC
        3. Uploads to R2 using multipart upload

        Memory usage is bounded to ~15MB regardless of file size:
        - 5MB chunk buffer for reading
        - 5MB encryption buffer
        - 5MB upload buffer

        Args:
            workspace_id: Workspace UUID
            upload_id: Upload session UUID
            total_size: Total file size in bytes
            client_metadata: Optional client-provided metadata

        Returns:
            Dict with asset_id and status

        Raises:
            UploadError: If processing fails
        """
        import base64
        from app.services.websocket_service import emit_upload_progress
        from app.services.encryption_service import STREAMING_ALGORITHM

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get upload session
            session = await conn.fetchrow(
                """
                SELECT upload_id, workspace_id, gallery_id, sub_gallery_id,
                       file_name, mime_type, size_bytes, sha256,
                       state, created_by_user_id, asset_id
                FROM upload_sessions
                WHERE upload_id = $1 AND workspace_id = $2
                """,
                upload_id,
                workspace_id,
            )

            if not session:
                raise UploadError("Upload session not found", "SESSION_NOT_FOUND", 404)

            if session["state"] == "committed":
                # Already processed
                return {"asset_id": str(session.get("asset_id")), "status": "processing"}

            # Validate file type
            file_type, _ = self.validate_file(
                session["file_name"], session["mime_type"], total_size
            )

            # Create asset record
            asset_id = uuid4()
            gallery_id = session["gallery_id"] if session["gallery_id"] else None
            if gallery_id and not isinstance(gallery_id, UUID):
                gallery_id = UUID(str(gallery_id))

            original_object_key = f"workspaces/{workspace_id}/galleries/{gallery_id}/original/{asset_id}/{session['file_name']}"

            # Insert asset record first (status = processing)
            await conn.execute(
                """
                INSERT INTO assets (
                    asset_id, workspace_id, library_id,
                    type, original_object_key, original_bytes,
                    sha256, mime_type, status, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                """,
                asset_id,
                workspace_id,
                None,
                file_type,
                original_object_key,
                total_size,
                session["sha256"],
                session["mime_type"],
                "processing",
                session["created_by_user_id"] if isinstance(session["created_by_user_id"], UUID) else UUID(str(session["created_by_user_id"])),
            )

            # Link to gallery if present
            if gallery_id:
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

            # Update session state
            await conn.execute(
                "UPDATE upload_sessions SET state = 'processing' WHERE upload_id = $1",
                upload_id,
            )

        # Emit progress: starting encryption
        try:
            await emit_upload_progress(workspace_id, upload_id, "encrypting", progress=30)
        except Exception:
            pass

        # Get workspace encryption key
        workspace_key, key_version = await self.encryption_service.get_workspace_key(
            workspace_id
        )

        # Create streaming encryptor
        encryptor = StreamingEncryptor(workspace_key)
        iv = encryptor.iv

        # Get chunked upload service
        chunked_service = get_chunked_upload_service()

        try:
            # Start R2 multipart upload with retry logic
            r2_upload_id = await with_storage_retry(
                self.storage_service.create_multipart_upload,
                original_object_key,
                session["mime_type"],
                operation_name="create_multipart_upload",
            )

            parts = []
            part_number = 1
            encrypted_buffer = bytearray()
            total_encrypted = 0
            bytes_processed = 0

            # Process chunks from Redis in streaming fashion
            async for chunk in chunked_service.assemble_file(
                workspace_id, upload_id, total_size
            ):
                # Encrypt chunk
                encrypted_chunk = encryptor.encrypt_chunk(chunk)
                encrypted_buffer.extend(encrypted_chunk)
                bytes_processed += len(chunk)

                # Upload when buffer reaches part size
                while len(encrypted_buffer) >= MULTIPART_PART_SIZE:
                    part_data = bytes(encrypted_buffer[:MULTIPART_PART_SIZE])
                    encrypted_buffer = encrypted_buffer[MULTIPART_PART_SIZE:]

                    # Upload part with retry logic
                    part_info = await with_storage_retry(
                        self.storage_service.upload_part,
                        original_object_key,
                        r2_upload_id,
                        part_number,
                        part_data,
                        operation_name=f"upload_part_{part_number}",
                    )
                    parts.append(part_info)
                    part_number += 1
                    total_encrypted += len(part_data)

                    # Update progress
                    progress = min(30 + int((bytes_processed / total_size) * 50), 80)
                    try:
                        await emit_upload_progress(
                            workspace_id, upload_id, "storing", progress=progress
                        )
                    except Exception:
                        pass

            # Finalize encryption and get HMAC
            hmac_tag = encryptor.finalize()

            # Upload remaining buffer (must be > 0 for last part) with retry logic
            if encrypted_buffer:
                part_info = await with_storage_retry(
                    self.storage_service.upload_part,
                    original_object_key,
                    r2_upload_id,
                    part_number,
                    bytes(encrypted_buffer),
                    operation_name=f"upload_part_{part_number}_final",
                )
                parts.append(part_info)
                total_encrypted += len(encrypted_buffer)

            # Complete multipart upload with retry logic
            await with_storage_retry(
                self.storage_service.complete_multipart_upload,
                original_object_key,
                r2_upload_id,
                parts,
                operation_name="complete_multipart_upload",
            )

            # Store encryption metadata
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO asset_encryption (
                        asset_id, workspace_id, variant, key_version, iv, auth_tag, algorithm
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (asset_id, variant) DO UPDATE SET
                        key_version = EXCLUDED.key_version,
                        iv = EXCLUDED.iv,
                        auth_tag = EXCLUDED.auth_tag,
                        algorithm = EXCLUDED.algorithm,
                        encrypted_at = NOW()
                    """,
                    asset_id,
                    workspace_id,
                    "original",
                    key_version,
                    base64.b64encode(iv).decode("utf-8"),
                    base64.b64encode(hmac_tag).decode("utf-8"),
                    STREAMING_ALGORITHM,
                )

            logger.info(
                f"Streaming upload complete: {upload_id} -> asset {asset_id}, "
                f"encrypted {total_encrypted} bytes"
            )

        except Exception as e:
            # Abort multipart upload on failure
            try:
                await self.storage_service.abort_multipart_upload(
                    original_object_key, r2_upload_id
                )
            except Exception:
                pass

            # Mark asset as failed
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE assets SET status = 'failed' WHERE asset_id = $1",
                    asset_id,
                )

            # Emit error
            try:
                await emit_upload_progress(
                    workspace_id, upload_id, "error", error=str(e)
                )
            except Exception:
                pass

            logger.error(f"Streaming upload failed for {upload_id}: {e}")
            raise UploadError(
                f"Streaming upload failed: {e}", "STREAMING_UPLOAD_FAILED", 500
            ) from e

        finally:
            # Clean up chunks from Redis
            try:
                await chunked_service.cleanup_chunks(workspace_id, upload_id, total_size)
            except Exception as e:
                logger.warning(f"Failed to cleanup chunks: {e}")

        # Enqueue background jobs
        task_queue = get_task_queue()
        content_analysis_queued = False

        if file_type == "photo":
            # Queue thumbnail generation
            try:
                await task_queue.enqueue(
                    task_type="asset.process",
                    payload={
                        "asset_id": str(asset_id),
                        "workspace_id": str(workspace_id),
                        "gallery_id": str(gallery_id) if gallery_id else None,
                        "file_type": file_type,
                        "mime_type": session["mime_type"],
                        "original_object_key": original_object_key,
                    },
                    priority=TaskPriority.HIGH,
                    max_retries=3,
                )
            except Exception as e:
                logger.error(f"Failed to enqueue asset processing job: {e}")

            # Queue metadata extraction
            try:
                await task_queue.enqueue(
                    task_type="asset.extract_metadata",
                    payload={
                        "asset_id": str(asset_id),
                        "workspace_id": str(workspace_id),
                        "original_object_key": original_object_key,
                        "mime_type": session["mime_type"],
                    },
                    priority=TaskPriority.NORMAL,
                    max_retries=3,
                )
            except Exception as e:
                logger.warning(f"Failed to enqueue metadata extraction job: {e}")

            # Queue face detection
            try:
                await task_queue.enqueue(
                    task_type="face_detection",
                    payload={
                        "photo_id": str(asset_id),
                        "workspace_id": str(workspace_id),
                        "priority": 0,
                        "client_metadata": client_metadata,
                    },
                    priority=TaskPriority.NORMAL,
                    max_retries=3,
                )
            except Exception as e:
                logger.debug(f"Failed to enqueue face detection job: {e}")

            # Queue content detection
            try:
                from app.services.content_detection_service import (
                    get_content_detection_service,
                )
                content_service = get_content_detection_service()
                job_id = await content_service.queue_detection(
                    asset_id=asset_id,
                    workspace_id=workspace_id,
                    priority=0,
                )
                content_analysis_queued = job_id is not None
            except Exception as e:
                logger.debug(f"Failed to queue content detection job: {e}")

        # Update session state to committed
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE upload_sessions
                SET state = 'committed', asset_id = $1
                WHERE upload_id = $2
                """,
                asset_id,
                upload_id,
            )

        # Emit completion events
        try:
            from app.services.websocket_service import emit_asset_created
            await emit_upload_progress(
                workspace_id, upload_id, "complete", progress=100, asset_id=asset_id
            )
            await emit_asset_created(workspace_id, gallery_id, asset_id)
        except Exception as e:
            logger.warning(f"Failed to emit completion events: {e}")

        # Invalidate storage cache
        try:
            storage_service = get_storage_service()
            await storage_service.invalidate_cache(workspace_id)
        except Exception as e:
            logger.warning(f"Failed to invalidate storage cache: {e}")

        return {
            "asset_id": str(asset_id),
            "status": "processing",
            "analysis_queued": content_analysis_queued,
            "streaming": True,
        }


# Export singleton instance
_upload_service: Optional[UploadService] = None


def get_upload_service() -> UploadService:
    """Get singleton upload service instance."""
    global _upload_service
    if _upload_service is None:
        _upload_service = UploadService()
    return _upload_service

