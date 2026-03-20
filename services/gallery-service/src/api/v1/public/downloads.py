"""
Public Download API Endpoints.

No authentication required - accessed via magic link tokens.
Enforces download policies and tracks all downloads.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Header, Request
from fastapi.responses import StreamingResponse

from src.services.download_service import DownloadService
from src.services.zip_worker import ZipWorker
from src.services.magic_link_service import get_magic_link_service
from src.services.r2_service import get_r2_service
from src.cache.redis_client import redis_client
from src.schemas.downloads import (
    SingleDownloadRequest,
    SingleDownloadResponse,
    BatchDownloadRequest,
    BatchDownloadStartResponse,
    DownloadJobResponse,
)
from src.api.v1.errors import raise_http_exception, ErrorCode, ErrorMessage
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


async def _validate_magic_link(token: str) -> dict:
    """Validate magic link token and return gallery access info.

    Extracts workspace_id and gallery_id from the validated token.
    Never trusts client-provided values.

    Returns:
        Dict with workspace_id, gallery_id, download_policy, etc.
    """
    magic_link_service = get_magic_link_service()
    result = await magic_link_service.validate_token(token)
    if not result:
        raise_http_exception(
            status_code=404,
            code="GALLERY_NOT_FOUND",
            message="Invalid or expired gallery link",
        )
    return result


def _get_visitor_token(request: Request) -> str:
    """Extract or generate visitor token from request."""
    return request.headers.get("X-Visitor-Token", f"anon_{uuid.uuid4().hex[:12]}")


# =============================================================================
# Single Asset Download
# =============================================================================


@router.post(
    "/{token}/downloads/single",
    response_model=SingleDownloadResponse,
    summary="Download a single asset",
)
async def download_single_asset(
    token: str,
    body: SingleDownloadRequest,
    request: Request,
):
    """Download a single gallery asset with policy enforcement.

    Validates magic link token, checks download policy, generates
    resized variant if needed, and tracks the download.
    """
    # Validate magic link - workspace_id comes from token, NOT client
    gallery_info = await _validate_magic_link(token)
    workspace_id = gallery_info["workspace_id"]
    gallery_id = gallery_info["gallery_id"]
    download_policy = gallery_info.get("download_policy", "view_only")

    # Enforce download policy
    download_service = DownloadService()
    policy_result = download_service.validate_download_policy(
        download_policy, body.size
    )

    if not policy_result["allowed"]:
        raise_http_exception(
            status_code=403,
            code="DOWNLOAD_FORBIDDEN",
            message="Downloads are not allowed for this gallery",
        )

    # Get or create resized variant
    r2_service = get_r2_service()
    download_url = await download_service.get_or_create_resized(
        workspace_id=workspace_id,
        asset_id=body.asset_id,
        size=body.size,
        format=body.format,
        r2_service=r2_service,
    )

    if not download_url:
        raise_http_exception(
            status_code=500,
            code="DOWNLOAD_ERROR",
            message="Failed to generate download URL",
        )

    # Track download
    visitor_token = _get_visitor_token(request)
    await download_service.track_download(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        asset_id=body.asset_id,
        visitor_token=visitor_token,
        size=body.size,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
    )

    return SingleDownloadResponse(download_url=download_url)


# =============================================================================
# Batch Download (ZIP)
# =============================================================================


@router.post(
    "/{token}/downloads/batch",
    response_model=BatchDownloadStartResponse,
    summary="Start batch download as ZIP",
)
async def download_batch_assets(
    token: str,
    body: BatchDownloadRequest,
    request: Request,
):
    """Start batch ZIP download of gallery assets.

    Validates magic link token, checks download policy, and spawns
    async ZIP generation task. Returns job_id for progress tracking.
    """
    # Validate magic link
    gallery_info = await _validate_magic_link(token)
    workspace_id = gallery_info["workspace_id"]
    gallery_id = gallery_info["gallery_id"]
    download_policy = gallery_info.get("download_policy", "view_only")

    # Enforce download policy
    download_service = DownloadService()
    policy_result = download_service.validate_download_policy(
        download_policy, body.size
    )

    if not policy_result["allowed"]:
        raise_http_exception(
            status_code=403,
            code="DOWNLOAD_FORBIDDEN",
            message="Downloads are not allowed for this gallery",
        )

    # Build asset list
    asset_ids = [str(aid) for aid in body.asset_ids]

    # If include_favorites or include_selections, query visitor actions
    if body.include_favorites or body.include_selections:
        visitor_token = _get_visitor_token(request)
        from src.database import get_connection
        async with get_connection(read_only=True) as conn:
            action_types = []
            if body.include_favorites:
                action_types.append("favorite")
            if body.include_selections:
                action_types.append("selection")

            rows = await conn.fetch(
                """
                SELECT DISTINCT asset_id::text
                FROM gallery_visitor_actions
                WHERE workspace_id = $1
                  AND gallery_id = $2
                  AND visitor_token = $3
                  AND action_type = ANY($4)
                  AND value = true
                """,
                workspace_id,
                gallery_id,
                visitor_token,
                action_types,
            )
            for row in rows:
                if row["asset_id"] not in asset_ids:
                    asset_ids.append(row["asset_id"])

    asset_list = [
        {"asset_id": aid, "filename": f"photo_{i + 1}.jpg"}
        for i, aid in enumerate(asset_ids)
    ]

    # Memory guard
    zip_worker = ZipWorker()
    if zip_worker.estimate_too_large(asset_list):
        raise_http_exception(
            status_code=400,
            code="BATCH_TOO_LARGE",
            message="Batch download exceeds 2GB limit. Please select fewer photos.",
        )

    # Generate job ID and spawn async task
    job_id = str(uuid.uuid4())

    # Set initial pending status
    await redis_client.set_json(
        f"download:job:{job_id}",
        {"status": "pending", "progress": 0},
        86400,
    )

    # Spawn background ZIP generation
    r2_service = get_r2_service()
    asyncio.create_task(
        zip_worker.generate_zip(
            job_id=job_id,
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            asset_list=asset_list,
            size=body.size,
            download_service=download_service,
            redis_client=redis_client,
            r2_service=r2_service,
        )
    )

    return BatchDownloadStartResponse(
        job_id=job_id,
        status="pending",
        estimated_files=len(asset_list),
    )


# =============================================================================
# Job Status
# =============================================================================


@router.get(
    "/{token}/downloads/job/{job_id}",
    response_model=DownloadJobResponse,
    summary="Check batch download job status",
)
async def get_job_status(
    token: str,
    job_id: str,
):
    """Get current status of a batch download job.

    Reads job progress from Redis.
    """
    # Validate magic link (ensures gallery access is still valid)
    await _validate_magic_link(token)

    job_data = await redis_client.get_json(f"download:job:{job_id}")
    if not job_data:
        raise_http_exception(
            status_code=404,
            code="JOB_NOT_FOUND",
            message="Download job not found or expired",
        )

    return DownloadJobResponse(
        job_id=job_id,
        status=job_data.get("status", "unknown"),
        progress=job_data.get("progress", 0),
        download_url=job_data.get("download_url"),
        expires_in=job_data.get("expires_in", 0),
        error=job_data.get("error"),
    )


# =============================================================================
# SSE Progress Stream
# =============================================================================


@router.get(
    "/{token}/downloads/job/{job_id}/stream",
    summary="Stream batch download progress via SSE",
)
async def stream_job_progress(
    token: str,
    job_id: str,
):
    """Stream download job progress via Server-Sent Events.

    Polls Redis every 1 second and yields progress events
    until job status is 'complete' or 'failed'.
    """
    # Validate magic link
    await _validate_magic_link(token)

    async def event_generator():
        redis_key = f"download:job:{job_id}"
        max_polls = 600  # 10 minute max

        for _ in range(max_polls):
            job_data = await redis_client.get_json(redis_key)
            if not job_data:
                yield f"data: {json.dumps({'status': 'not_found', 'progress': 0})}\n\n"
                break

            yield f"data: {json.dumps(job_data)}\n\n"

            status = job_data.get("status")
            if status in ("complete", "failed"):
                break

            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
