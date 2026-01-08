"""Upload API endpoints for the Upload Microservice.

This module provides the REST API endpoints for file uploads:
- POST /v1/uploads - Create upload session [T013]
- PATCH /v1/uploads/{upload_id}/chunks - Upload chunk (TUS protocol) [T014]
- HEAD /v1/uploads/{upload_id}/chunks - Get upload status (TUS HEAD) [T014]
- DELETE /v1/uploads/{upload_id} - Cancel upload (TUS DELETE) [T014]
- POST /v1/uploads/{upload_id}/complete - Commit upload [T015]
- POST /v1/uploads/check-duplicate - Check for duplicates [T016]

The endpoints follow TUS protocol (https://tus.io/protocols/resumable-upload)
for resumable uploads with chunk buffering in Redis.

Author: Claude Code Migration
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from sqlalchemy import text

from app.core.config import get_settings
from app.schemas.upload import (
    CreateUploadSessionRequest,
    UploadSessionResponse,
    CommitChunkedUploadRequest,
    UploadCommitResponse,
    UploadErrorResponse,
    ValidationErrorResponse,
    StorageLimitResponse,
    CheckDuplicateRequest,
    CheckDuplicateResponse,
)
from app.services.upload_service import (
    get_upload_service,
    UploadError,
    ValidationError,
    StorageLimitExceededError,
    SessionNotFoundError,
    SessionExpiredError,
)

logger = logging.getLogger(__name__)

# Router for upload endpoints
router = APIRouter()

# Bearer token extractor
bearer_scheme = HTTPBearer(auto_error=False)


# =============================================================================
# Authentication Dependencies (simplified for microservice)
# Full auth middleware will be implemented in T017
# =============================================================================


@dataclass
class CurrentUser:
    """Authenticated user context extracted from JWT.

    This is a simplified version for the upload microservice.
    The full auth middleware (T017) will handle JWT validation,
    session verification, and RBAC checks.
    """

    user_id: UUID
    email: str
    workspace_ids: list[UUID]


class AuthError(HTTPException):
    """Authentication error with WWW-Authenticate header."""

    def __init__(self, detail: str = "Authentication required"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class PermissionError(HTTPException):
    """Authorization/permission error."""

    def __init__(self, detail: str = "Access denied"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> CurrentUser:
    """Extract and validate current user from JWT token.

    This is a simplified implementation for T013.
    Full JWT validation will be implemented in T017 (auth middleware).

    For now, we decode the JWT payload without full signature verification
    in development. In production, the auth middleware will handle this.

    Raises:
        AuthError: If token is missing or invalid
    """
    if credentials is None:
        raise AuthError("Missing authentication token")

    token = credentials.credentials

    try:
        # Import jose for token decoding (python-jose library)
        from jose import jwt, JWTError, ExpiredSignatureError
        from jose.exceptions import JWKError

        settings = get_settings()

        # Decode token - in development, we may skip verification
        # In production, this will be handled by auth middleware (T017)
        try:
            # Try EdDSA verification first if public key is available
            if settings.JWT_PUBLIC_KEY_PATH:
                from pathlib import Path

                public_key = Path(settings.JWT_PUBLIC_KEY_PATH).read_text()
                payload = jwt.decode(
                    token,
                    public_key,
                    algorithms=[settings.JWT_ALGORITHM],
                    issuer=settings.JWT_ISSUER,
                )
            else:
                # Fallback to HS256 with secret
                payload = jwt.decode(
                    token,
                    settings.JWT_SECRET.get_secret_value(),
                    algorithms=["HS256"],
                    issuer=settings.JWT_ISSUER,
                )
        except (JWTError, JWKError) as e:
            # In development, allow unverified decode for testing
            if settings.is_development:
                try:
                    payload = jwt.get_unverified_claims(token)
                    logger.warning(
                        "JWT signature verification failed, using unverified claims in dev mode",
                        extra={"original_error": str(e)}
                    )
                except Exception as ex:
                    logger.error("Failed to decode token unverified", extra={"error": str(ex)})
                    raise AuthError("Invalid token")
            else:
                raise

        # Extract claims
        user_id = UUID(payload["sub"])
        email = payload.get("email", "")

        # workspace_ids might be in "wids" (list) or "workspace_id" (single)
        if "wids" in payload:
            workspace_ids = [UUID(w) for w in payload["wids"]]
        elif "workspace_id" in payload:
            workspace_ids = [UUID(payload["workspace_id"])]
        else:
            workspace_ids = []

        # Store user_id in request state for logging/metrics
        request.state.user_id = str(user_id)

        return CurrentUser(
            user_id=user_id,
            email=email,
            workspace_ids=workspace_ids,
        )

    except ExpiredSignatureError:
        logger.warning("Token expired")
        raise AuthError("Token has expired")
    except JWTError as e:
        logger.warning("Invalid token", extra={"error": str(e)})
        raise AuthError("Invalid token")
    except (KeyError, ValueError) as e:
        logger.warning("Invalid token claims", extra={"error": str(e)})
        raise AuthError("Invalid token claims")


async def get_workspace_id(
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    x_workspace_id: Annotated[Optional[str], Header(alias="X-Workspace-ID")] = None,
) -> UUID:
    """Extract and validate workspace_id from header or path.

    The workspace_id can come from:
    1. X-Workspace-ID header (preferred for API consistency)
    2. Path parameter (for REST resource URLs)

    Validates that the user has access to the workspace.

    Args:
        request: FastAPI request object
        user: Authenticated user from JWT
        x_workspace_id: Optional workspace ID from header

    Returns:
        UUID of the validated workspace

    Raises:
        HTTPException: 400 if workspace_id is missing
        PermissionError: 403 if user doesn't have access to workspace
    """
    workspace_id: UUID | None = None

    # Try header first
    if x_workspace_id:
        try:
            workspace_id = UUID(x_workspace_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-Workspace-ID header format",
            )

    # Try path parameter
    if workspace_id is None:
        path_params = request.path_params
        if "workspace_id" in path_params:
            try:
                workspace_id = UUID(path_params["workspace_id"])
            except ValueError:
                pass

    if workspace_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Workspace-ID header is required",
        )

    # Validate user has access to this workspace
    # Check against JWT claims (quick check without DB query)
    if user.workspace_ids and workspace_id not in user.workspace_ids:
        logger.warning(
            "Workspace access denied",
            extra={
                "user_id": str(user.user_id),
                "workspace_id": str(workspace_id),
                "user_workspaces": [str(w) for w in user.workspace_ids],
            },
        )
        raise PermissionError("Access denied to this workspace")

    # Store workspace_id in request state for logging
    request.state.workspace_id = str(workspace_id)

    return workspace_id


# Type aliases for dependency injection
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
WorkspaceIdDep = Annotated[UUID, Depends(get_workspace_id)]


# =============================================================================
# Upload Endpoints
# =============================================================================


@router.post(
    "",
    response_model=UploadSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create upload session",
    description="""
    Create a new upload session for file upload.

    This is the first step in the upload flow:
    1. Client calls POST /session with file metadata
    2. Server validates file type/size, checks storage quota
    3. Server returns upload_id and upload_url for chunk uploads
    4. Client uses the upload_url with TUS protocol to upload chunks

    The session expires after 24 hours if not committed.

    **Required Headers:**
    - `Authorization: Bearer <token>` - JWT access token
    - `X-Workspace-ID: <uuid>` - Target workspace UUID

    **Supported File Types:**
    - Images: JPEG, PNG, WebP, HEIC, TIFF, GIF, AVIF
    - RAW: CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG, PEF, and more
    - Videos: MP4, MOV

    **File Size Limits:**
    - Regular images: 100MB
    - RAW files: 200MB
    - Videos: 500MB
    """,
    responses={
        201: {
            "description": "Upload session created successfully",
            "model": UploadSessionResponse,
        },
        400: {
            "description": "Validation error (invalid file type, size, etc.)",
            "model": ValidationErrorResponse,
        },
        401: {
            "description": "Authentication required",
            "model": UploadErrorResponse,
        },
        402: {
            "description": "Storage quota exceeded",
            "model": StorageLimitResponse,
        },
        403: {
            "description": "Access denied to workspace",
            "model": UploadErrorResponse,
        },
    },
    tags=["upload"],
)
async def create_upload_session(
    request: CreateUploadSessionRequest,
    current_user: CurrentUserDep,
    workspace_id: WorkspaceIdDep,
) -> UploadSessionResponse:
    """Create a new upload session for file upload.

    Validates the file metadata, checks storage quota, and creates
    a session record in the database. Returns the upload URL for
    chunked upload via TUS protocol.

    The upload flow:
    1. POST /session (this endpoint) - Create session
    2. PATCH /chunk/{upload_id} - Upload chunks with TUS headers
    3. POST /complete - Commit the upload after all chunks uploaded

    Args:
        request: Upload session request with file metadata
        current_user: Authenticated user from JWT
        workspace_id: Target workspace from X-Workspace-ID header

    Returns:
        UploadSessionResponse with upload_id, upload_url, and expiry

    Raises:
        HTTPException 400: Invalid file type or size
        HTTPException 401: Missing or invalid authentication
        HTTPException 402: Storage quota exceeded
        HTTPException 403: No access to workspace
    """
    upload_service = get_upload_service()

    # Log RAW file upload attempts for monitoring
    ext = request.file_name.lower().split(".")[-1] if "." in request.file_name else ""
    from app.services.upload_service import SUPPORTED_RAW_EXTENSIONS

    if ext in SUPPORTED_RAW_EXTENSIONS:
        logger.info(
            "RAW file upload session requested",
            extra={
                "file_name": request.file_name,
                "extension": ext,
                "mime_type": request.mime_type,
                "size_bytes": request.size_bytes,
                "user_id": str(current_user.user_id),
                "workspace_id": str(workspace_id),
            },
        )

    try:
        # Create upload session
        result = await upload_service.create_upload_session(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            gallery_id=request.gallery_id,
            filename=request.file_name,
            mime_type=request.mime_type,
            size_bytes=request.size_bytes,
            sub_gallery_id=request.sub_gallery_id,
            sha256=request.sha256,
            relative_path=request.relative_path,
        )

        logger.info(
            "Upload session created",
            extra={
                "upload_id": result["upload_id"],
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "file_name": request.file_name,
                "size_bytes": request.size_bytes,
            },
        )

        # Convert result dict to response model
        return UploadSessionResponse(
            upload_id=UUID(result["upload_id"]),
            provider=result["provider"],
            upload_url=result["upload_url"],
            headers=result["headers"],
            expires_at=datetime.fromisoformat(result["expires_at"].replace("Z", "+00:00"))
            if isinstance(result["expires_at"], str)
            else result["expires_at"],
        )

    except ValidationError as e:
        logger.warning(
            "Upload validation failed",
            extra={
                "error": str(e),
                "code": e.code,
                "file_name": request.file_name,
                "mime_type": request.mime_type,
                "size_bytes": request.size_bytes,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": e.code,
                "message": str(e),
            },
        )

    except StorageLimitExceededError as e:
        logger.warning(
            "Storage limit exceeded",
            extra={
                "error": str(e),
                "workspace_id": str(workspace_id),
                "size_bytes": request.size_bytes,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "STORAGE_LIMIT_EXCEEDED",
                "message": str(e),
            },
        )

    except UploadError as e:
        logger.error(
            "Upload session creation failed",
            extra={
                "error": str(e),
                "code": e.code,
                "status": e.status,
            },
        )
        raise HTTPException(
            status_code=e.status,
            detail={
                "code": e.code,
                "message": str(e),
            },
        )

    except Exception as e:
        logger.exception(
            "Unexpected error creating upload session",
            extra={
                "error": str(e),
                "workspace_id": str(workspace_id),
                "file_name": request.file_name,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "Failed to create upload session",
            },
        )


# =============================================================================
# T014: PATCH /chunk/{upload_id} - Upload chunk with TUS headers
# =============================================================================


@router.patch(
    "/{upload_id}/chunks",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Upload file chunk (TUS protocol)",
    description="""
    Upload a chunk of file data using TUS resumable upload protocol.

    This endpoint implements TUS protocol (https://tus.io/protocols/resumable-upload):
    - Accepts PATCH requests with raw chunk data in the body
    - Uses Upload-Offset header to track and verify upload progress
    - Returns new Upload-Offset after successful chunk storage
    - Stores chunks in Redis with 24-hour expiry for later assembly
    - Supports optional SHA256 checksum verification per chunk

    **TUS Protocol Flow:**
    1. Client sends PATCH with chunk data and current offset
    2. Server verifies offset matches expected position
    3. Server stores chunk in Redis
    4. Server returns 204 with new Upload-Offset header
    5. Client repeats until all chunks uploaded
    6. Client calls POST /complete to commit the upload

    **Required Headers:**
    - `Authorization: Bearer <token>` - JWT access token
    - `X-Workspace-ID: <uuid>` - Workspace UUID
    - `Upload-Offset: <int>` - Byte offset for this chunk (must match server's expected offset)
    - `Content-Type: application/offset+octet-stream` - TUS content type
    - `Tus-Resumable: 1.0.0` - TUS protocol version

    **Optional Headers:**
    - `Upload-Checksum: sha256 <base64>` - SHA256 checksum of chunk data (hex format)
    - `Upload-Length: <int>` - Total file size (if known, helps optimize storage)

    **Resume Capability:**
    If upload is interrupted, client can use HEAD request to get current offset
    and resume from that position.

    **Chunk Size Recommendations:**
    - Minimum: 256KB (below this is inefficient)
    - Recommended: 5MB (optimal for network conditions)
    - Maximum: 10MB (enforced server-side)
    """,
    responses={
        204: {
            "description": "Chunk stored successfully",
            "headers": {
                "Upload-Offset": {
                    "description": "New byte offset after this chunk",
                    "schema": {"type": "integer"},
                },
                "Tus-Resumable": {
                    "description": "TUS protocol version",
                    "schema": {"type": "string", "example": "1.0.0"},
                },
            },
        },
        400: {
            "description": "Invalid request (empty chunk, invalid headers, checksum mismatch)",
            "model": ValidationErrorResponse,
        },
        401: {
            "description": "Authentication required",
            "model": UploadErrorResponse,
        },
        403: {
            "description": "Access denied to workspace",
            "model": UploadErrorResponse,
        },
        404: {
            "description": "Upload session not found",
            "model": UploadErrorResponse,
        },
        409: {
            "description": "Offset mismatch - use expected offset from response",
            "model": UploadErrorResponse,
        },
        410: {
            "description": "Upload session has expired",
            "model": UploadErrorResponse,
        },
        413: {
            "description": "Chunk too large (max 10MB)",
            "model": UploadErrorResponse,
        },
    },
    tags=["upload"],
)
async def upload_chunk(
    upload_id: UUID,
    request: Request,
    current_user: CurrentUserDep,
    workspace_id: WorkspaceIdDep,
    upload_offset: Annotated[
        int,
        Header(
            alias="Upload-Offset",
            description="Byte offset where this chunk starts (TUS protocol)",
            ge=0,
        ),
    ] = 0,
    upload_length: Annotated[
        Optional[int],
        Header(
            alias="Upload-Length",
            description="Total file size in bytes (optional)",
            ge=0,
        ),
    ] = None,
    upload_checksum: Annotated[
        Optional[str],
        Header(
            alias="Upload-Checksum",
            description="Chunk checksum in format 'sha256 <hex>' (optional)",
        ),
    ] = None,
    tus_resumable: Annotated[
        Optional[str],
        Header(
            alias="Tus-Resumable",
            description="TUS protocol version (should be 1.0.0)",
        ),
    ] = None,
    content_type: Annotated[
        Optional[str],
        Header(
            alias="Content-Type",
            description="Should be application/offset+octet-stream for TUS",
        ),
    ] = None,
):
    """Upload a chunk of file data using TUS resumable protocol.

    This endpoint implements TUS (https://tus.io/protocols/resumable-upload):
    - Accepts PATCH requests with chunk data
    - Uses Upload-Offset header to track progress
    - Returns new Upload-Offset after successful chunk storage
    - Stores chunks in Redis with configurable expiry for assembly

    Client-side chunking reduces server memory usage and enables
    resume capability for large file uploads.

    Args:
        upload_id: Upload session UUID from POST /session
        request: FastAPI request (to read raw body)
        current_user: Authenticated user from JWT
        workspace_id: Workspace from X-Workspace-ID header
        upload_offset: TUS Upload-Offset header (current byte position)
        upload_length: TUS Upload-Length header (total file size, optional)
        upload_checksum: TUS Upload-Checksum header for chunk verification
        tus_resumable: TUS-Resumable header (protocol version)
        content_type: Content-Type header

    Returns:
        HTTP 204 No Content with TUS headers on success

    Raises:
        HTTPException 400: Invalid headers, empty chunk, or checksum mismatch
        HTTPException 401: Missing or invalid authentication
        HTTPException 403: No access to workspace
        HTTPException 404: Upload session not found
        HTTPException 409: Offset mismatch (client must retry with correct offset)
        HTTPException 410: Upload session has expired
        HTTPException 413: Chunk too large
    """
    from fastapi.responses import Response
    from app.services.chunked_upload_service import (
        get_chunked_upload_service,
        ChunkError,
        OffsetMismatchError,
        ChunkTooLargeError,
        ChecksumVerificationError,
    )

    # Get the upload service singleton
    upload_service = get_upload_service()
    chunked_service = get_chunked_upload_service()
    settings = get_settings()

    try:
        # 1. Validate TUS protocol version if provided
        if tus_resumable and tus_resumable != settings.TUS_RESUMABLE_VERSION:
            logger.warning(
                "Unsupported TUS version",
                extra={
                    "upload_id": str(upload_id),
                    "tus_version": tus_resumable,
                    "expected": settings.TUS_RESUMABLE_VERSION,
                },
            )
            # TUS spec says we should still accept if we support 1.0.0
            # but log for monitoring

        # 2. Verify upload session exists and is not expired
        session = await upload_service.get_upload_session(workspace_id, upload_id)

        # 3. Check session state allows uploads
        if session["state"] == "committed":
            logger.warning(
                "Attempted chunk upload to committed session",
                extra={"upload_id": str(upload_id)},
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SESSION_ALREADY_COMMITTED",
                    "message": "Upload session has already been committed",
                },
            )

        if session["state"] == "failed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SESSION_FAILED",
                    "message": "Upload session has failed and cannot accept new chunks",
                },
            )

        # 4. Read chunk data from request body
        chunk_data = await request.body()

        # 5. Validate chunk is not empty
        # Note: TUS allows empty PATCH for "probe" but we log a warning
        if not chunk_data:
            logger.warning(
                "Received empty chunk",
                extra={
                    "upload_id": str(upload_id),
                    "offset": upload_offset,
                },
            )
            # Return current offset without storing anything
            current_offset = await chunked_service.get_current_offset(
                workspace_id, upload_id
            )
            return Response(
                status_code=status.HTTP_204_NO_CONTENT,
                headers={
                    "Upload-Offset": str(current_offset),
                    "Tus-Resumable": settings.TUS_RESUMABLE_VERSION,
                },
            )

        # 6. Parse checksum header if provided
        # Format: "sha256 <hex_digest>" or just the hex digest
        chunk_checksum: Optional[str] = None
        if upload_checksum:
            parts = upload_checksum.strip().split(" ", 1)
            if len(parts) == 2:
                algo, checksum_value = parts
                if algo.lower() == "sha256":
                    chunk_checksum = checksum_value.lower()
                else:
                    logger.warning(
                        "Unsupported checksum algorithm",
                        extra={"algorithm": algo, "upload_id": str(upload_id)},
                    )
            else:
                # Assume it's just the hex digest
                chunk_checksum = upload_checksum.strip().lower()

        # 7. Update session state to "uploading" if still "created"
        if session["state"] == "created":
            await upload_service.update_session_state(
                workspace_id, upload_id, "uploading"
            )

        # 8. Store the chunk
        new_offset = await chunked_service.store_chunk(
            workspace_id=workspace_id,
            upload_id=upload_id,
            offset=upload_offset,
            chunk_data=chunk_data,
            checksum=chunk_checksum,
            checksum_algo="sha256",
        )

        logger.debug(
            "Chunk stored successfully",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
                "offset": upload_offset,
                "chunk_size": len(chunk_data),
                "new_offset": new_offset,
                "user_id": str(current_user.user_id),
            },
        )

        # 9. Build TUS-compliant response headers
        response_headers = {
            "Upload-Offset": str(new_offset),
            "Tus-Resumable": settings.TUS_RESUMABLE_VERSION,
        }

        # Include Upload-Length if we know the total size
        if upload_length is not None:
            response_headers["Upload-Length"] = str(upload_length)
        elif session.get("size_bytes"):
            response_headers["Upload-Length"] = str(session["size_bytes"])

        # 10. Return 204 No Content (TUS success response)
        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
            headers=response_headers,
        )

    except OffsetMismatchError as e:
        # TUS protocol: return 409 with expected offset
        logger.warning(
            "Offset mismatch",
            extra={
                "upload_id": str(upload_id),
                "expected_offset": e.expected,
                "received_offset": e.received,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "OFFSET_MISMATCH",
                "message": str(e),
                "expected_offset": e.expected,
                "received_offset": e.received,
            },
            headers={
                "Upload-Offset": str(e.expected),
                "Tus-Resumable": settings.TUS_RESUMABLE_VERSION,
            },
        )

    except ChunkTooLargeError as e:
        logger.warning(
            "Chunk too large",
            extra={
                "upload_id": str(upload_id),
                "chunk_size": e.size,
                "max_size": e.max_size,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "CHUNK_TOO_LARGE",
                "message": str(e),
                "size": e.size,
                "max_size": e.max_size,
            },
        )

    except ChecksumVerificationError as e:
        logger.warning(
            "Chunk checksum verification failed",
            extra={
                "upload_id": str(upload_id),
                "offset": upload_offset,
                "expected": e.expected,
                "actual": e.actual,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CHECKSUM_MISMATCH",
                "message": str(e),
                "offset": e.offset,
                "expected": e.expected,
                "actual": e.actual,
            },
        )

    except ChunkError as e:
        logger.error(
            "Chunk error",
            extra={
                "upload_id": str(upload_id),
                "error": str(e),
                "code": e.code,
            },
        )
        raise HTTPException(
            status_code=e.status,
            detail={
                "code": e.code,
                "message": str(e),
            },
        )

    except SessionNotFoundError:
        logger.warning(
            "Upload session not found for chunk upload",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SESSION_NOT_FOUND",
                "message": f"Upload session not found: {upload_id}",
            },
        )

    except SessionExpiredError:
        logger.warning(
            "Upload session expired",
            extra={"upload_id": str(upload_id)},
        )
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "SESSION_EXPIRED",
                "message": f"Upload session expired: {upload_id}",
            },
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise

    except Exception as e:
        logger.exception(
            "Unexpected error uploading chunk",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
                "offset": upload_offset,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "Failed to store chunk",
            },
        )


@router.head(
    "/{upload_id}/chunks",
    status_code=status.HTTP_200_OK,
    summary="Get upload status (TUS HEAD)",
    description="""
    Get current upload progress for resumable upload (TUS HEAD request).

    This endpoint is used by TUS clients to check upload status and resume
    interrupted uploads. Returns the current byte offset and file metadata
    in response headers.

    **Response Headers:**
    - `Upload-Offset: <int>` - Current byte offset (bytes received so far)
    - `Upload-Length: <int>` - Total file size (if known)
    - `Tus-Resumable: 1.0.0` - TUS protocol version
    - `Tus-Version: 1.0.0` - Supported TUS versions
    - `Tus-Extension: creation,creation-with-upload,termination,checksum` - Supported extensions
    - `Tus-Checksum-Algorithm: sha256` - Supported checksum algorithm
    - `Cache-Control: no-store` - Prevent caching of upload status
    """,
    responses={
        200: {
            "description": "Upload status retrieved",
            "headers": {
                "Upload-Offset": {
                    "description": "Current byte offset",
                    "schema": {"type": "integer"},
                },
                "Upload-Length": {
                    "description": "Total file size",
                    "schema": {"type": "integer"},
                },
                "Tus-Resumable": {
                    "description": "TUS protocol version",
                    "schema": {"type": "string"},
                },
            },
        },
        401: {"description": "Authentication required"},
        403: {"description": "Access denied to workspace"},
        404: {"description": "Upload session not found"},
        410: {"description": "Upload session expired"},
    },
    tags=["upload"],
)
async def get_upload_status(
    upload_id: UUID,
    current_user: CurrentUserDep,
    workspace_id: WorkspaceIdDep,
):
    """Get current upload status for TUS resume functionality.

    Returns HTTP 200 with TUS headers indicating current upload progress.
    Clients use this to determine where to resume interrupted uploads.

    Args:
        upload_id: Upload session UUID
        current_user: Authenticated user from JWT
        workspace_id: Workspace from X-Workspace-ID header

    Returns:
        HTTP 200 OK with TUS headers (no body per TUS spec)
    """
    from fastapi.responses import Response
    from app.services.chunked_upload_service import get_chunked_upload_service

    upload_service = get_upload_service()
    chunked_service = get_chunked_upload_service()
    settings = get_settings()

    try:
        # 1. Verify upload session exists and is valid
        session = await upload_service.get_upload_session(workspace_id, upload_id)

        # 2. Get current offset from Redis
        current_offset = await chunked_service.get_current_offset(
            workspace_id, upload_id
        )

        logger.debug(
            "Upload status retrieved",
            extra={
                "upload_id": str(upload_id),
                "current_offset": current_offset,
                "total_size": session.get("size_bytes"),
                "state": session.get("state"),
            },
        )

        # 3. Build TUS-compliant response headers
        tus_headers = chunked_service.get_tus_headers(
            offset=current_offset,
            total_size=session.get("size_bytes"),
        )

        response_headers = tus_headers.to_dict()
        response_headers["Cache-Control"] = "no-store"

        # 4. Return 200 OK with headers (no body per TUS spec)
        return Response(
            status_code=status.HTTP_200_OK,
            headers=response_headers,
        )

    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SESSION_NOT_FOUND",
                "message": f"Upload session not found: {upload_id}",
            },
        )

    except SessionExpiredError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "SESSION_EXPIRED",
                "message": f"Upload session expired: {upload_id}",
            },
        )

    except Exception as e:
        logger.exception(
            "Error getting upload status",
            extra={"upload_id": str(upload_id), "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "Failed to get upload status",
            },
        )


@router.delete(
    "/{upload_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel upload (TUS DELETE)",
    description="""
    Cancel an upload session and delete all associated chunks (TUS termination extension).

    This endpoint implements the TUS termination extension:
    - Removes all chunks from Redis
    - Marks the upload session as cancelled
    - Frees up any reserved storage quota

    After deletion, the upload_id cannot be reused. Client must create
    a new session to re-upload.
    """,
    responses={
        204: {"description": "Upload cancelled successfully"},
        401: {"description": "Authentication required"},
        403: {"description": "Access denied to workspace"},
        404: {"description": "Upload session not found"},
        410: {"description": "Upload session already expired"},
    },
    tags=["upload"],
)
async def cancel_upload(
    upload_id: UUID,
    current_user: CurrentUserDep,
    workspace_id: WorkspaceIdDep,
):
    """Cancel an upload session and clean up resources.

    Implements TUS termination extension for graceful upload cancellation.
    Removes all uploaded chunks from Redis and marks session as failed.

    Args:
        upload_id: Upload session UUID
        current_user: Authenticated user from JWT
        workspace_id: Workspace from X-Workspace-ID header

    Returns:
        HTTP 204 No Content on success
    """
    from fastapi.responses import Response
    from app.services.chunked_upload_service import get_chunked_upload_service

    upload_service = get_upload_service()
    chunked_service = get_chunked_upload_service()
    settings = get_settings()

    try:
        # 1. Verify session exists (will raise if not found or expired)
        session = await upload_service.get_upload_session(workspace_id, upload_id)

        # 2. Don't allow cancellation of committed uploads
        if session["state"] == "committed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SESSION_ALREADY_COMMITTED",
                    "message": "Cannot cancel a committed upload session",
                },
            )

        # 3. Clean up chunks from Redis
        deleted_count = await chunked_service.cleanup_chunks(
            workspace_id, upload_id, session.get("size_bytes")
        )

        # 4. Mark session as failed/cancelled
        await upload_service.update_session_state(
            workspace_id, upload_id, "failed"
        )

        logger.info(
            "Upload session cancelled",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "chunks_deleted": deleted_count,
            },
        )

        # 5. Return 204 No Content with TUS header
        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
            headers={
                "Tus-Resumable": settings.TUS_RESUMABLE_VERSION,
            },
        )

    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SESSION_NOT_FOUND",
                "message": f"Upload session not found: {upload_id}",
            },
        )

    except SessionExpiredError:
        # For expired sessions, still try to clean up chunks
        try:
            await chunked_service.cleanup_chunks(workspace_id, upload_id)
        except Exception:
            pass  # Best effort cleanup

        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "SESSION_EXPIRED",
                "message": f"Upload session expired: {upload_id}",
            },
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.exception(
            "Error cancelling upload",
            extra={"upload_id": str(upload_id), "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "Failed to cancel upload",
            },
        )


# =============================================================================
# T015: POST /complete - Commit upload
# =============================================================================


@router.post(
    "/{upload_id}/complete",
    response_model=UploadCommitResponse,
    status_code=status.HTTP_200_OK,
    summary="Commit upload (finalize)",
    description="""
    Complete and commit an upload session after all chunks have been uploaded.

    This endpoint performs the final steps of the upload flow:
    1. Verifies all chunks are uploaded (current offset == expected size)
    2. Assembles chunks from Redis into complete file (streaming)
    3. Verifies SHA256 checksum against provided value
    4. Encrypts file with workspace-specific AES-256-CTR key
    5. Uploads encrypted file to R2 storage (multipart for large files)
    6. Creates asset record in database
    7. Updates workspace storage usage
    8. Publishes Kafka event for asset processing (thumbnails, variants)
    9. Cleans up chunks from Redis

    **Memory Efficiency:**
    The entire process is streaming-based. Files are never fully loaded into
    memory - chunks flow from Redis → encryption → R2 upload in a pipeline
    that uses ~15MB regardless of file size.

    **Idempotency:**
    If called multiple times with the same upload_id, subsequent calls will
    return the existing asset_id without re-processing (after first commit).

    **Required Headers:**
    - `Authorization: Bearer <token>` - JWT access token
    - `X-Workspace-ID: <uuid>` - Workspace UUID

    **Request Body:**
    - `sha256` (required): SHA256 checksum of complete file for verification
    - `client_metadata` (optional): Additional metadata from client

    **Response:**
    Returns the created asset_id and processing status.
    """,
    responses={
        200: {
            "description": "Upload committed successfully",
            "model": UploadCommitResponse,
        },
        400: {
            "description": "Validation error (incomplete upload, checksum mismatch)",
            "model": ValidationErrorResponse,
        },
        401: {
            "description": "Authentication required",
            "model": UploadErrorResponse,
        },
        403: {
            "description": "Access denied to workspace",
            "model": UploadErrorResponse,
        },
        404: {
            "description": "Upload session not found",
            "model": UploadErrorResponse,
        },
        409: {
            "description": "Upload already committed or failed",
            "model": UploadErrorResponse,
        },
        410: {
            "description": "Upload session has expired",
            "model": UploadErrorResponse,
        },
        503: {
            "description": "Storage service unavailable (circuit breaker open)",
            "model": UploadErrorResponse,
        },
    },
    tags=["upload"],
)
async def complete_upload(
    upload_id: UUID,
    request: CommitChunkedUploadRequest,
    current_user: CurrentUserDep,
    workspace_id: WorkspaceIdDep,
) -> UploadCommitResponse:
    """Complete and commit an upload session.

    This is the final step in the upload flow. After all chunks have been
    uploaded via PATCH /chunk/{upload_id}, call this endpoint to:
    - Verify the upload is complete
    - Verify checksum integrity
    - Encrypt and store the file
    - Create the asset record
    - Trigger background processing

    The process is idempotent - if the upload is already committed, this
    returns the existing asset without re-processing.

    Args:
        upload_id: Upload session UUID from POST /session
        request: Commit request with sha256 and optional metadata
        current_user: Authenticated user from JWT
        workspace_id: Workspace from X-Workspace-ID header

    Returns:
        UploadCommitResponse with asset_id and processing status

    Raises:
        HTTPException 400: Incomplete upload, checksum mismatch, or validation error
        HTTPException 401: Missing or invalid authentication
        HTTPException 403: No access to workspace
        HTTPException 404: Upload session not found
        HTTPException 409: Upload already committed or in failed state
        HTTPException 410: Upload session expired
        HTTPException 503: Storage service unavailable
    """
    from app.services.chunked_upload_service import (
        get_chunked_upload_service,
        ChunkNotFoundError,
        AssemblyError,
    )
    from app.services.encryption_service import get_encryption_service
    from app.services.r2_storage_service import (
        get_r2_storage_service,
        StorageUnavailableError,
    )
    from app.services.event_producer import (
        get_event_producer,
        AssetProcessingEvent,
        publish_upload_completed_event,
    )
    from app.core.database import execute, fetch_one, get_connection
    from uuid import uuid4
    import hashlib

    upload_service = get_upload_service()
    chunked_service = get_chunked_upload_service()
    encryption_service = get_encryption_service()
    r2_service = get_r2_storage_service()
    settings = get_settings()

    try:
        # 1. Get and verify upload session
        session = await upload_service.get_upload_session(workspace_id, upload_id)

        # 2. Check if already committed (idempotent)
        if session["state"] == "committed":
            asset_id = session.get("asset_id")
            if asset_id:
                logger.info(
                    "Upload already committed, returning existing asset",
                    extra={
                        "upload_id": str(upload_id),
                        "asset_id": str(asset_id),
                    },
                )
                return UploadCommitResponse(
                    asset_id=asset_id,
                    status="processing",
                    analysis_queued=False,
                )

        # 3. Check session state allows commit
        if session["state"] == "failed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SESSION_FAILED",
                    "message": "Upload session has failed and cannot be committed",
                },
            )

        if session["state"] not in ("created", "uploading"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "INVALID_SESSION_STATE",
                    "message": f"Upload session in invalid state for commit: {session['state']}",
                },
            )

        # 4. Update state to verifying
        await upload_service.update_session_state(
            workspace_id, upload_id, "verifying"
        )

        # 5. Verify upload is complete (all bytes received)
        current_offset = await chunked_service.get_current_offset(workspace_id, upload_id)
        expected_size = request.total_size

        # Also check against session's size_bytes if available
        if session.get("size_bytes") and session["size_bytes"] != expected_size:
            logger.warning(
                "Size mismatch between session and commit request",
                extra={
                    "upload_id": str(upload_id),
                    "session_size": session["size_bytes"],
                    "commit_size": expected_size,
                },
            )
            # Use the commit request size as authoritative
            # (client knows the actual file size)

        if current_offset < expected_size:
            await upload_service.update_session_state(
                workspace_id, upload_id, "uploading"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INCOMPLETE_UPLOAD",
                    "message": f"Upload incomplete: received {current_offset} bytes, expected {expected_size} bytes",
                    "bytes_received": current_offset,
                    "bytes_expected": expected_size,
                },
            )

        # 6. Compute SHA256 of assembled file (streaming, memory efficient)
        logger.info(
            "Computing file checksum",
            extra={
                "upload_id": str(upload_id),
                "total_size": expected_size,
            },
        )

        computed_sha256 = await chunked_service.compute_file_hash(
            workspace_id, upload_id, expected_size
        )

        # 7. Verify checksum
        if computed_sha256.lower() != request.sha256.lower():
            await upload_service.update_session_state(
                workspace_id, upload_id, "failed"
            )
            logger.warning(
                "Checksum mismatch",
                extra={
                    "upload_id": str(upload_id),
                    "expected": request.sha256,
                    "computed": computed_sha256,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "CHECKSUM_MISMATCH",
                    "message": "File checksum verification failed",
                    "expected_sha256": request.sha256,
                    "actual_sha256": computed_sha256,
                },
            )

        logger.info(
            "Checksum verified",
            extra={
                "upload_id": str(upload_id),
                "sha256": computed_sha256[:16] + "...",
            },
        )

        # 8. Generate asset ID and object key
        asset_id = uuid4()
        filename = session["file_name"]
        gallery_id = session.get("gallery_id")
        sub_gallery_id = session.get("sub_gallery_id")
        mime_type = session["mime_type"]

        # Determine file type for processing
        file_type = "photo"
        if mime_type.startswith("video/"):
            file_type = "video"
        elif "raw" in mime_type.lower() or any(
            ext in filename.lower()
            for ext in ["cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng", "pef"]
        ):
            file_type = "raw"

        # Build object key for R2 storage
        # Format: workspaces/{workspace_id}/galleries/{gallery_id}/original/{asset_id}/{filename}.enc
        if gallery_id:
            object_key = f"workspaces/{workspace_id}/galleries/{gallery_id}/original/{asset_id}/{filename}.enc"
        else:
            object_key = f"workspaces/{workspace_id}/library/original/{asset_id}/{filename}.enc"

        # 9. Encrypt and upload to R2 (streaming pipeline)
        logger.info(
            "Starting encryption and upload",
            extra={
                "upload_id": str(upload_id),
                "asset_id": str(asset_id),
                "object_key": object_key,
            },
        )

        # Create streaming encryptor
        encryptor = encryption_service.create_streaming_encryptor(workspace_id)
        encryption_iv = encryptor.iv
        hmac_tag = None
        key_version = 1  # Default version for deterministic key derivation

        # For large files (>10MB), use multipart upload
        if expected_size > r2_service.MULTIPART_THRESHOLD:
            # Streaming multipart upload with encryption
            etag, hmac_tag = await _encrypt_and_upload_multipart(
                chunked_service=chunked_service,
                r2_service=r2_service,
                encryptor=encryptor,
                workspace_id=workspace_id,
                upload_id=upload_id,
                object_key=object_key,
                total_size=expected_size,
            )
        else:
            # For smaller files, assemble, encrypt, and upload in one shot
            # (Still streaming from Redis, just not multipart to R2)
            encrypted_data, hmac_tag = await _encrypt_assembled_file(
                chunked_service=chunked_service,
                encryptor=encryptor,
                workspace_id=workspace_id,
                upload_id=upload_id,
                total_size=expected_size,
            )

            # Upload to R2
            etag = await r2_service.upload_bytes(
                key=object_key,
                data=encrypted_data,
                content_type="application/octet-stream",
                metadata={
                    "workspace_id": str(workspace_id),
                    "asset_id": str(asset_id),
                    "original_filename": filename,
                    "original_mime_type": mime_type,
                },
            )

        logger.info(
            "File uploaded to R2",
            extra={
                "upload_id": str(upload_id),
                "asset_id": str(asset_id),
                "object_key": object_key,
            },
        )

        # 10. Create asset record in database
        async with get_connection() as conn:
            # Insert asset record (without encryption columns - they're in asset_encryption table)
            await conn.execute(
                text("""
                    INSERT INTO assets (
                        asset_id, workspace_id, created_by_user_id,
                        type, mime_type, sha256,
                        original_object_key, original_bytes,
                        status, created_at, updated_at
                    )
                    VALUES (
                        :asset_id, :workspace_id, :user_id,
                        :type, :mime_type, :sha256,
                        :object_key, :size_bytes,
                        :status, NOW(), NOW()
                    )
                """),
                {
                    "asset_id": asset_id,
                    "workspace_id": workspace_id,
                    "user_id": current_user.user_id,
                    "type": file_type,
                    "mime_type": mime_type,
                    "sha256": computed_sha256,
                    "object_key": object_key,
                    "size_bytes": expected_size,
                    "status": "available",  # Set to 'available' immediately so it appears in gallery
                    # Background processing (thumbnails, variants) will still run via Kafka event
                },
            )

            # Insert encryption metadata into asset_encryption table
            import base64
            if hmac_tag is None:
                raise ValueError("HMAC tag is None - encryption finalization failed")
            await conn.execute(
                text("""
                    INSERT INTO asset_encryption (
                        asset_id, workspace_id, variant, key_version, iv, auth_tag
                    )
                    VALUES (
                        :asset_id, :workspace_id, :variant, :key_version, :iv, :auth_tag
                    )
                    ON CONFLICT (asset_id, variant) DO UPDATE SET
                        key_version = EXCLUDED.key_version,
                        iv = EXCLUDED.iv,
                        auth_tag = EXCLUDED.auth_tag,
                        encrypted_at = NOW()
                """),
                {
                    "asset_id": asset_id,
                    "workspace_id": workspace_id,
                    "variant": "original",
                    "key_version": key_version,
                    "iv": base64.b64encode(encryption_iv).decode("utf-8"),
                    "auth_tag": base64.b64encode(hmac_tag).decode("utf-8"),
                },
            )

            # Create gallery_assets link if gallery specified
            if gallery_id:
                await conn.execute(
                    text("""
                        INSERT INTO gallery_assets (
                            gallery_id, sub_gallery_id, asset_id,
                            workspace_id, visible, created_at
                        )
                        VALUES (
                            :gallery_id, :sub_gallery_id, :asset_id,
                            :workspace_id, TRUE, NOW()
                        )
                    """),
                    {
                        "gallery_id": gallery_id,
                        "sub_gallery_id": sub_gallery_id,
                        "asset_id": asset_id,
                        "workspace_id": workspace_id,
                    },
                )

            # Storage usage is tracked via workspace_storage_cache table
            # The trigger on assets table will automatically mark the cache as stale
            # when this asset is inserted, so no manual update needed here

            await conn.commit()

        logger.info(
            "Asset record created",
            extra={
                "upload_id": str(upload_id),
                "asset_id": str(asset_id),
                "workspace_id": str(workspace_id),
            },
        )

        # 11. Update upload session state to committed
        await upload_service.update_session_state(
            workspace_id,
            upload_id,
            "committed",
            sha256=computed_sha256,
            asset_id=asset_id,
            file_bytes=expected_size,
        )

        # 12. Clean up chunks from Redis (best effort)
        try:
            deleted_count = await chunked_service.cleanup_chunks(
                workspace_id, upload_id, expected_size
            )
            logger.info(
                "Cleaned up upload chunks",
                extra={
                    "upload_id": str(upload_id),
                    "chunks_deleted": deleted_count,
                },
            )
        except Exception as cleanup_error:
            logger.warning(
                "Failed to clean up chunks (non-critical)",
                extra={
                    "upload_id": str(upload_id),
                    "error": str(cleanup_error),
                },
            )

        # 13. Publish Kafka event for asset processing
        analysis_queued = False
        try:
            producer = await get_event_producer()
            event = AssetProcessingEvent(
                asset_id=str(asset_id),
                workspace_id=str(workspace_id),
                gallery_id=str(gallery_id) if gallery_id else None,
                file_type=file_type,
                mime_type=mime_type,
                original_object_key=object_key,
                priority=5,
                metadata=request.client_metadata or {},
            )
            await producer.publish_asset_processing(event)

            # Also publish upload completed event
            await publish_upload_completed_event(
                upload_id=str(upload_id),
                workspace_id=str(workspace_id),
                asset_id=str(asset_id),
                file_name=filename,
                file_size=expected_size,
            )

            analysis_queued = True
            logger.info(
                "Asset processing event published",
                extra={
                    "upload_id": str(upload_id),
                    "asset_id": str(asset_id),
                },
            )
        except Exception as kafka_error:
            logger.warning(
                "Failed to publish processing event (will retry via fallback)",
                extra={
                    "upload_id": str(upload_id),
                    "asset_id": str(asset_id),
                    "error": str(kafka_error),
                },
            )

        logger.info(
            "Upload committed successfully",
            extra={
                "upload_id": str(upload_id),
                "asset_id": str(asset_id),
                "workspace_id": str(workspace_id),
                "file_type": file_type,
                "size_bytes": expected_size,
            },
        )

        return UploadCommitResponse(
            asset_id=asset_id,
            status="processing",
            analysis_queued=analysis_queued,
        )

    except ChunkNotFoundError as e:
        await upload_service.update_session_state(
            workspace_id, upload_id, "failed"
        )
        logger.error(
            "Missing chunk during commit",
            extra={
                "upload_id": str(upload_id),
                "missing_offset": e.missing_offset,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CHUNK_NOT_FOUND",
                "message": str(e),
                "missing_offset": e.missing_offset,
            },
        )

    except AssemblyError as e:
        await upload_service.update_session_state(
            workspace_id, upload_id, "failed"
        )
        logger.error(
            "Assembly error during commit",
            extra={
                "upload_id": str(upload_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ASSEMBLY_ERROR",
                "message": str(e),
            },
        )

    except StorageUnavailableError as e:
        # Don't mark as failed - allow retry when storage recovers
        await upload_service.update_session_state(
            workspace_id, upload_id, "uploading"
        )
        logger.error(
            "Storage unavailable during commit",
            extra={
                "upload_id": str(upload_id),
                "recovery_time_ms": e.recovery_time_remaining_ms,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "STORAGE_UNAVAILABLE",
                "message": str(e),
                "retry_after_ms": e.recovery_time_remaining_ms,
            },
            headers={
                "Retry-After": str(e.recovery_time_remaining_ms // 1000 + 1),
            },
        )

    except SessionNotFoundError:
        logger.warning(
            "Upload session not found for commit",
            extra={"upload_id": str(upload_id)},
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SESSION_NOT_FOUND",
                "message": f"Upload session not found: {upload_id}",
            },
        )

    except SessionExpiredError:
        logger.warning(
            "Upload session expired",
            extra={"upload_id": str(upload_id)},
        )
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "SESSION_EXPIRED",
                "message": f"Upload session expired: {upload_id}",
            },
        )

    except HTTPException:
        raise

    except Exception as e:
        # Mark session as failed for unexpected errors
        try:
            await upload_service.update_session_state(
                workspace_id, upload_id, "failed"
            )
        except Exception:
            pass

        logger.exception(
            "Unexpected error during upload commit",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "Failed to commit upload",
            },
        )


async def _encrypt_assembled_file(
    chunked_service,
    encryptor,
    workspace_id: UUID,
    upload_id: UUID,
    total_size: int,
) -> tuple[bytes, bytes]:
    """Assemble chunks and encrypt them into a single encrypted blob.

    Used for smaller files (<10MB) where we can hold the encrypted
    result in memory for a single R2 upload.

    Args:
        chunked_service: ChunkedUploadService instance
        encryptor: StreamingEncryptor instance
        workspace_id: Workspace UUID
        upload_id: Upload session UUID
        total_size: Expected total size in bytes

    Returns:
        Encrypted bytes: [IV (16 bytes)][ciphertext][HMAC (32 bytes)]
    """
    # Collect encrypted chunks
    encrypted_chunks = [encryptor.iv]  # Start with IV

    async for chunk in chunked_service.assemble_file(
        workspace_id, upload_id, total_size
    ):
        encrypted_chunks.append(encryptor.encrypt_chunk(chunk))

    # Finalize and append HMAC
    hmac_tag = encryptor.finalize()
    encrypted_chunks.append(hmac_tag)

    return b"".join(encrypted_chunks), hmac_tag


async def _encrypt_and_upload_multipart(
    chunked_service,
    r2_service,
    encryptor,
    workspace_id: UUID,
    upload_id: UUID,
    object_key: str,
    total_size: int,
) -> tuple[str, bytes]:
    """Encrypt and upload a large file using multipart upload.

    Streams chunks from Redis → encryption → R2 multipart upload.
    Memory usage is bounded to ~15MB regardless of file size.

    Args:
        chunked_service: ChunkedUploadService instance
        r2_service: R2StorageService instance
        encryptor: StreamingEncryptor instance
        workspace_id: Workspace UUID
        upload_id: Upload session UUID
        object_key: R2 object key
        total_size: Expected total size in bytes

    Returns:
        ETag from completed multipart upload
    """
    import io

    # Minimum part size for S3/R2 multipart upload is 5MB
    PART_SIZE = 5 * 1024 * 1024

    # Create multipart upload
    multipart_upload_id = await r2_service.create_multipart_upload(
        object_key=object_key,
        content_type="application/octet-stream",
        metadata={
            "workspace_id": str(workspace_id),
            "upload_id": str(upload_id),
        },
    )

    parts = []
    part_number = 1
    buffer = io.BytesIO()

    # Write IV as first bytes
    buffer.write(encryptor.iv)

    try:
        # Stream chunks, encrypt, and upload in parts
        async for chunk in chunked_service.assemble_file(
            workspace_id, upload_id, total_size
        ):
            # Encrypt chunk
            encrypted = encryptor.encrypt_chunk(chunk)
            buffer.write(encrypted)

            # If buffer exceeds part size, upload a part
            while buffer.tell() >= PART_SIZE:
                # Read exactly PART_SIZE bytes
                buffer.seek(0)
                part_data = buffer.read(PART_SIZE)
                remaining = buffer.read()

                # Reset buffer with remaining data
                buffer = io.BytesIO()
                buffer.write(remaining)

                # Upload part
                part_info = await r2_service.upload_part(
                    object_key=object_key,
                    upload_id=multipart_upload_id,
                    part_number=part_number,
                    data=part_data,
                )
                parts.append(part_info)
                part_number += 1

        # Finalize encryption and add HMAC
        hmac_tag = encryptor.finalize()
        buffer.write(hmac_tag)

        # Upload final part (remaining buffer)
        buffer.seek(0)
        final_data = buffer.read()
        if final_data:
            part_info = await r2_service.upload_part(
                object_key=object_key,
                upload_id=multipart_upload_id,
                part_number=part_number,
                data=final_data,
            )
            parts.append(part_info)

        # Complete multipart upload
        etag = await r2_service.complete_multipart_upload(
            object_key=object_key,
            upload_id=multipart_upload_id,
            parts=parts,
        )

        return etag, hmac_tag

    except Exception:
        # Abort multipart upload on failure
        await r2_service.abort_multipart_upload(
            object_key=object_key,
            upload_id=multipart_upload_id,
        )
        raise


# =============================================================================
# T016: POST /check-duplicate - Check for duplicate assets
# =============================================================================


@router.post(
    "/check-duplicate",
    response_model=CheckDuplicateResponse,
    status_code=status.HTTP_200_OK,
    summary="Check for duplicate assets",
    description="""
    Check if an asset with the same SHA256 checksum already exists in the workspace.

    This endpoint allows clients to detect duplicates before uploading, saving
    bandwidth and storage by avoiding redundant uploads. The check is performed
    against the workspace's existing assets.

    **Use Cases:**
    - Pre-flight check before starting an upload
    - Batch upload deduplication
    - Finding existing copies of a file

    **Required Headers:**
    - `Authorization: Bearer <token>` - JWT access token
    - `X-Workspace-ID: <uuid>` - Workspace UUID

    **Request Body:**
    - `sha256` (required): SHA256 checksum of the file to check
    - `gallery_id` (optional): Limit search to specific gallery

    **Response:**
    Returns `is_duplicate: true` with a list of matching assets if duplicates
    exist, or `is_duplicate: false` with an empty list if no duplicates found.

    Duplicate assets include:
    - Asset ID and workspace information
    - Original filename and MIME type
    - File size and creation timestamp
    - Signed thumbnail URL for visual verification (valid for 1 hour)
    """,
    responses={
        200: {
            "description": "Duplicate check completed",
            "model": CheckDuplicateResponse,
        },
        400: {
            "description": "Validation error (invalid SHA256 format)",
            "model": ValidationErrorResponse,
        },
        401: {
            "description": "Authentication required",
            "model": UploadErrorResponse,
        },
        403: {
            "description": "Access denied to workspace",
            "model": UploadErrorResponse,
        },
    },
    tags=["upload"],
)
async def check_duplicate(
    request: CheckDuplicateRequest,
    current_user: CurrentUserDep,
    workspace_id: WorkspaceIdDep,
) -> CheckDuplicateResponse:
    """Check if an asset with the same SHA256 already exists in the workspace.

    This endpoint enables deduplication before upload by checking if a file
    with the same content (identified by SHA256 hash) already exists.

    The check is scoped to the workspace (and optionally a specific gallery)
    to maintain workspace isolation.

    Args:
        request: Check duplicate request with SHA256 and optional gallery_id
        current_user: Authenticated user from JWT
        workspace_id: Workspace from X-Workspace-ID header

    Returns:
        CheckDuplicateResponse with is_duplicate flag and list of matching assets

    Raises:
        HTTPException 400: Invalid SHA256 format
        HTTPException 401: Missing or invalid authentication
        HTTPException 403: No access to workspace
    """
    from app.core.database import fetch_all
    from app.services.r2_storage_service import get_r2_storage_service
    from app.schemas.upload import DuplicateAssetResponse

    try:
        # Build query to find duplicates by SHA256 in workspace
        # Join with gallery_assets to get gallery information
        if request.gallery_id:
            query = """
                SELECT
                    a.asset_id,
                    a.workspace_id,
                    a.original_object_key,
                    a.mime_type,
                    a.original_bytes as size_bytes,
                    a.created_at,
                    a.file_type,
                    ga.gallery_id
                FROM assets a
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.workspace_id = :workspace_id
                  AND a.sha256 = :sha256
                  AND a.status != 'deleted'
                  AND ga.gallery_id = :gallery_id
                ORDER BY a.created_at DESC
                LIMIT 10
            """
            params = {
                "workspace_id": workspace_id,
                "sha256": request.sha256.lower(),
                "gallery_id": request.gallery_id,
            }
        else:
            query = """
                SELECT
                    a.asset_id,
                    a.workspace_id,
                    a.original_object_key,
                    a.mime_type,
                    a.original_bytes as size_bytes,
                    a.created_at,
                    a.file_type,
                    ga.gallery_id
                FROM assets a
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                WHERE a.workspace_id = :workspace_id
                  AND a.sha256 = :sha256
                  AND a.status != 'deleted'
                ORDER BY a.created_at DESC
                LIMIT 10
            """
            params = {
                "workspace_id": workspace_id,
                "sha256": request.sha256.lower(),
            }

        rows = await fetch_all(query, params)

        if not rows:
            logger.debug(
                "No duplicates found",
                extra={
                    "workspace_id": str(workspace_id),
                    "sha256": request.sha256[:16] + "...",
                    "gallery_id": str(request.gallery_id) if request.gallery_id else None,
                },
            )
            return CheckDuplicateResponse(is_duplicate=False, duplicates=[])

        # Build duplicate list with signed URLs for thumbnails
        duplicates = []
        r2_service = get_r2_storage_service()

        for row in rows:
            asset_id = row.asset_id
            original_object_key = row.original_object_key or ""

            # Extract filename from original_object_key
            # Format: workspaces/{workspace_id}/galleries/{gallery_id}/original/{asset_id}/{filename}.enc
            # or: workspaces/{workspace_id}/library/original/{asset_id}/{filename}.enc
            file_name = original_object_key.split("/")[-1] if original_object_key else f"{asset_id}.enc"

            # Remove .enc extension if present (file was encrypted)
            if file_name.endswith(".enc"):
                file_name = file_name[:-4]

            # Generate signed URL for thumbnail
            # Thumbnail key format: workspaces/{workspace_id}/variants/{asset_id}/thumbnail.webp
            thumbnail_url: Optional[str] = None
            try:
                thumbnail_key = f"workspaces/{workspace_id}/variants/{asset_id}/thumbnail.webp"
                thumbnail_url = await r2_service.generate_presigned_get_url(
                    object_key=thumbnail_key,
                    expiry_seconds=3600,  # 1 hour
                )
            except Exception as e:
                logger.warning(
                    "Failed to generate thumbnail URL",
                    extra={
                        "asset_id": str(asset_id),
                        "error": str(e),
                    },
                )
                # Continue without thumbnail URL - it's optional

            # Format created_at as ISO 8601 string
            created_at_str = ""
            if row.created_at:
                if isinstance(row.created_at, datetime):
                    created_at_str = row.created_at.isoformat()
                else:
                    created_at_str = str(row.created_at)

            duplicates.append(
                DuplicateAssetResponse(
                    asset_id=asset_id,
                    workspace_id=row.workspace_id,
                    gallery_id=row.gallery_id,
                    file_name=file_name,
                    mime_type=row.mime_type or "application/octet-stream",
                    size_bytes=row.size_bytes or 0,
                    created_at=created_at_str,
                    thumbnail_url=thumbnail_url,
                )
            )

        logger.info(
            "Duplicates found",
            extra={
                "workspace_id": str(workspace_id),
                "sha256": request.sha256[:16] + "...",
                "duplicate_count": len(duplicates),
                "user_id": str(current_user.user_id),
            },
        )

        return CheckDuplicateResponse(is_duplicate=True, duplicates=duplicates)

    except HTTPException:
        raise

    except Exception as e:
        logger.exception(
            "Failed to check for duplicates",
            extra={
                "workspace_id": str(workspace_id),
                "sha256": request.sha256[:16] + "...",
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "Failed to check for duplicates",
            },
        )
