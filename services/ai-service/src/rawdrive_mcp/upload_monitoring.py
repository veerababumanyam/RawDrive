"""Upload Monitoring Tools for RawDrive MCP Server.

Provides operational monitoring tools for upload sessions and AI processing status.
These tools extend the existing ai-service MCP server with upload analytics capabilities.

Phase 6 of AI Enhancement Plan (Week 11-12)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from rawdrive_mcp.db import get_db_conn

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool Input/Output Models
# ---------------------------------------------------------------------------


class UploadStatusResult(BaseModel):
    """Upload session status result."""

    upload_id: str
    state: str
    progress_percentage: float
    bytes_uploaded: int
    total_size: int
    created_at: datetime
    updated_at: datetime
    error_message: str | None = None


class UploadItem(BaseModel):
    """Upload summary for listings."""

    upload_id: str
    filename: str
    state: str
    progress_percentage: float
    created_at: datetime
    updated_at: datetime


class UploadMetrics(BaseModel):
    """Upload analytics metrics."""

    time_range: str
    total_uploads: int
    successful_uploads: int
    failed_uploads: int
    success_rate_pct: float
    total_bytes_uploaded: int
    avg_upload_duration_sec: float
    avg_upload_speed_mbps: float


class AIProcessingStatus(BaseModel):
    """AI processing status for an asset."""

    asset_id: str
    duplicate_detection: dict[str, Any]
    content_moderation: dict[str, Any]
    quality_analysis: dict[str, Any]
    upscaling: dict[str, Any]


# ---------------------------------------------------------------------------
# MCP Tools
# ---------------------------------------------------------------------------


async def get_upload_status(
    upload_id: str = Field(description="Upload session ID"),
    workspace_id: str = Field(description="Workspace ID (for multi-tenant isolation)"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Get current status of an upload session.

    Returns upload progress, state, bytes uploaded, and any error messages.
    Requires 'uploads:read' permission.

    Args:
        upload_id: UUID of the upload session
        workspace_id: UUID of the workspace (for access control)
        context: Authentication context with user_id, workspace_id, permissions

    Returns:
        Upload status including:
        - upload_id: Upload session ID
        - state: created, uploading, committed, failed, aborted
        - progress_percentage: Upload completion percentage
        - bytes_uploaded: Bytes transferred
        - total_size: Total file size
        - created_at: Upload start time
        - updated_at: Last activity time
        - error_message: Error details if failed

    Raises:
        PermissionError: If user lacks uploads:read permission
        ValueError: If upload not found
    """
    # Extract auth context
    auth = context.get("auth", {})
    if not auth.get("user_id") or not auth.get("workspace_id"):
        raise ValueError("Authentication context required: user_id and workspace_id")

    # Verify workspace access
    if auth["workspace_id"] != workspace_id:
        raise PermissionError("Cannot access uploads from different workspace")

    # Check permission
    permissions = auth.get("permissions", [])
    if "uploads:read" not in permissions and "*" not in permissions:
        raise PermissionError("uploads:read permission required")

    # Query upload session
    try:
        async with get_db_conn() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    upload_id,
                    state,
                    bytes_uploaded,
                    total_size,
                    created_at,
                    updated_at,
                    error_message
                FROM upload_sessions
                WHERE upload_id = $1 AND workspace_id = $2
                """,
                UUID(upload_id),
                UUID(workspace_id),
            )

            if not row:
                return {"error": "Upload session not found"}

            # Calculate progress percentage
            progress_pct = (
                (row["bytes_uploaded"] / row["total_size"] * 100)
                if row["total_size"] > 0
                else 0.0
            )

            result = UploadStatusResult(
                upload_id=str(row["upload_id"]),
                state=row["state"],
                progress_percentage=round(progress_pct, 2),
                bytes_uploaded=row["bytes_uploaded"],
                total_size=row["total_size"],
                created_at=row["created_at"].replace(tzinfo=timezone.utc)
                if row["created_at"].tzinfo is None
                else row["created_at"],
                updated_at=row["updated_at"].replace(tzinfo=timezone.utc)
                if row["updated_at"].tzinfo is None
                else row["updated_at"],
                error_message=row["error_message"],
            )

            return result.model_dump()

    except Exception as e:
        logger.error(f"Failed to get upload status: {e}")
        raise Exception(f"Failed to retrieve upload status: {str(e)}")


async def list_recent_uploads(
    workspace_id: str = Field(description="Workspace ID"),
    limit: int = Field(default=20, description="Maximum number of results (max 100)"),
    state: str | None = Field(
        default=None,
        description="Filter by state (created, uploading, committed, failed, aborted)",
    ),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """List recent uploads for a workspace.

    Returns a paginated list of recent upload sessions with their current status.
    Requires 'uploads:read' permission.

    Args:
        workspace_id: Workspace UUID to list uploads from
        limit: Maximum number of results (default 20, max 100)
        state: Optional filter by upload state
        context: Authentication context

    Returns:
        List of recent uploads with metadata:
        - uploads: Array of upload session summaries
        - total: Total number of results returned

    Raises:
        PermissionError: If user lacks uploads:read permission
    """
    # Extract auth context
    auth = context.get("auth", {})
    if not auth.get("user_id") or not auth.get("workspace_id"):
        raise ValueError("Authentication context required: user_id and workspace_id")

    # Verify workspace access
    if auth["workspace_id"] != workspace_id:
        raise PermissionError("Cannot access uploads from different workspace")

    # Check permission
    permissions = auth.get("permissions", [])
    if "uploads:read" not in permissions and "*" not in permissions:
        raise PermissionError("uploads:read permission required")

    # Limit to max 100
    limit = min(limit, 100)

    # Build query
    try:
        async with get_db_conn() as conn:
            query = """
                SELECT
                    upload_id,
                    filename,
                    state,
                    bytes_uploaded,
                    total_size,
                    created_at,
                    updated_at
                FROM upload_sessions
                WHERE workspace_id = $1
            """
            params = [UUID(workspace_id)]

            # Add state filter if provided
            if state:
                query += " AND state = $2"
                params.append(state)
                query += f" ORDER BY created_at DESC LIMIT ${len(params) + 1}"
                params.append(limit)
            else:
                query += f" ORDER BY created_at DESC LIMIT $2"
                params.append(limit)

            rows = await conn.fetch(query, *params)

            uploads = []
            for row in rows:
                progress_pct = (
                    (row["bytes_uploaded"] / row["total_size"] * 100)
                    if row["total_size"] > 0
                    else 0.0
                )

                uploads.append(
                    UploadItem(
                        upload_id=str(row["upload_id"]),
                        filename=row["filename"],
                        state=row["state"],
                        progress_percentage=round(progress_pct, 2),
                        created_at=row["created_at"].replace(tzinfo=timezone.utc)
                        if row["created_at"].tzinfo is None
                        else row["created_at"],
                        updated_at=row["updated_at"].replace(tzinfo=timezone.utc)
                        if row["updated_at"].tzinfo is None
                        else row["updated_at"],
                    )
                )

            return {
                "uploads": [u.model_dump() for u in uploads],
                "total": len(uploads),
            }

    except Exception as e:
        logger.error(f"Failed to list uploads: {e}")
        raise Exception(f"Failed to retrieve uploads: {str(e)}")


async def get_upload_metrics(
    workspace_id: str = Field(description="Workspace ID"),
    time_range: str = Field(
        default="24h",
        description="Time range for metrics (1h, 24h, 7d, 30d)",
    ),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Get upload analytics and metrics for a workspace.

    Returns aggregated upload statistics including success rate, throughput,
    and average upload speeds.
    Requires 'workspace:read' permission.

    Args:
        workspace_id: Workspace UUID
        time_range: Time range for metrics (1h, 24h, 7d, 30d)
        context: Authentication context

    Returns:
        Upload metrics including:
        - time_range: Requested time range
        - total_uploads: Total upload sessions
        - successful_uploads: Successfully completed uploads
        - failed_uploads: Failed upload sessions
        - success_rate_pct: Success rate percentage
        - total_bytes_uploaded: Total bytes transferred
        - avg_upload_duration_sec: Average upload time
        - avg_upload_speed_mbps: Average upload speed in Mbps

    Raises:
        PermissionError: If user lacks workspace:read permission
    """
    # Extract auth context
    auth = context.get("auth", {})
    if not auth.get("user_id") or not auth.get("workspace_id"):
        raise ValueError("Authentication context required: user_id and workspace_id")

    # Verify workspace access
    if auth["workspace_id"] != workspace_id:
        raise PermissionError("Cannot access metrics from different workspace")

    # Check permission
    permissions = auth.get("permissions", [])
    if "workspace:read" not in permissions and "*" not in permissions:
        raise PermissionError("workspace:read permission required")

    # Parse time range to SQL interval
    time_delta_map = {
        "1h": "1 hour",
        "24h": "24 hours",
        "7d": "7 days",
        "30d": "30 days",
    }
    time_delta = time_delta_map.get(time_range, "24 hours")

    # Query metrics
    try:
        async with get_db_conn() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_uploads,
                    COUNT(*) FILTER (WHERE state = 'committed') as successful_uploads,
                    COUNT(*) FILTER (WHERE state = 'failed') as failed_uploads,
                    COALESCE(SUM(total_size) FILTER (WHERE state = 'committed'), 0) as total_bytes_uploaded,
                    COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE state = 'committed'), 0) as avg_upload_duration_sec
                FROM upload_sessions
                WHERE workspace_id = $1
                  AND created_at >= NOW() - INTERVAL $2
                """,
                UUID(workspace_id),
                time_delta,
            )

            total = row["total_uploads"] or 0
            successful = row["successful_uploads"] or 0
            failed = row["failed_uploads"] or 0
            total_bytes = row["total_bytes_uploaded"] or 0
            avg_duration = row["avg_upload_duration_sec"] or 0

            # Calculate success rate
            success_rate = (successful / total * 100) if total > 0 else 0.0

            # Calculate average speed in Mbps
            # Formula: (bytes * 8 / 1_000_000) / seconds = Mbps
            avg_speed = (
                (total_bytes * 8 / 1_000_000 / avg_duration) if avg_duration > 0 else 0.0
            )

            result = UploadMetrics(
                time_range=time_range,
                total_uploads=total,
                successful_uploads=successful,
                failed_uploads=failed,
                success_rate_pct=round(success_rate, 2),
                total_bytes_uploaded=total_bytes,
                avg_upload_duration_sec=round(avg_duration, 2),
                avg_upload_speed_mbps=round(avg_speed, 2),
            )

            return result.model_dump()

    except Exception as e:
        logger.error(f"Failed to get upload metrics: {e}")
        raise Exception(f"Failed to retrieve upload metrics: {str(e)}")


async def get_ai_processing_status(
    asset_id: str = Field(description="Asset ID"),
    workspace_id: str = Field(description="Workspace ID"),
    context: dict[str, Any] = Field(default={}, description="Request context with auth"),
) -> dict[str, Any]:
    """Get AI processing status for an uploaded asset.

    Returns the status of all AI features: duplicate detection, content moderation,
    quality analysis, and upscaling.
    Requires 'assets:read' permission.

    Args:
        asset_id: UUID of the asset
        workspace_id: UUID of the workspace
        context: Authentication context

    Returns:
        AI processing status including:
        - asset_id: Asset UUID
        - duplicate_detection: Duplicate check results
          - is_duplicate: Boolean flag
          - duplicate_asset_id: ID of matching asset (if duplicate)
          - similarity_score: Similarity score (0.0-1.0)
        - content_moderation: Moderation results
          - status: SAFE, BLOCKED, REVIEW, PENDING, ERROR
          - violations: Array of policy violations
        - quality_analysis: Quality metrics
          - overall_score: Quality score (0-100)
          - blur_score: Blur detection score
          - exposure_score: Exposure quality score
        - upscaling: Upscaling results
          - status: pending, processing, completed, failed
          - upscaled_variant_id: ID of upscaled variant (if completed)

    Raises:
        PermissionError: If user lacks assets:read permission
        ValueError: If AI processing not started or asset not found
    """
    # Extract auth context
    auth = context.get("auth", {})
    if not auth.get("user_id") or not auth.get("workspace_id"):
        raise ValueError("Authentication context required: user_id and workspace_id")

    # Verify workspace access
    if auth["workspace_id"] != workspace_id:
        raise PermissionError("Cannot access assets from different workspace")

    # Check permission
    permissions = auth.get("permissions", [])
    if "assets:read" not in permissions and "*" not in permissions:
        raise PermissionError("assets:read permission required")

    # Query AI processing results
    try:
        async with get_db_conn() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    is_duplicate,
                    duplicate_asset_id,
                    similarity_score,
                    duplicate_method,
                    moderation_status,
                    moderation_violations,
                    quality_score,
                    blur_score,
                    exposure_score,
                    upscale_status,
                    upscaled_variant_id,
                    upscale_factor
                FROM ai_processing_results
                WHERE asset_id = $1 AND workspace_id = $2
                """,
                UUID(asset_id),
                UUID(workspace_id),
            )

            if not row:
                return {
                    "error": "AI processing not started or asset not found",
                    "asset_id": asset_id,
                }

            result = AIProcessingStatus(
                asset_id=asset_id,
                duplicate_detection={
                    "is_duplicate": row["is_duplicate"],
                    "duplicate_asset_id": str(row["duplicate_asset_id"])
                    if row["duplicate_asset_id"]
                    else None,
                    "similarity_score": float(row["similarity_score"])
                    if row["similarity_score"]
                    else None,
                    "method": row["duplicate_method"],
                },
                content_moderation={
                    "status": row["moderation_status"],
                    "violations": row["moderation_violations"] or [],
                },
                quality_analysis={
                    "overall_score": row["quality_score"],
                    "blur_score": float(row["blur_score"]) if row["blur_score"] else None,
                    "exposure_score": float(row["exposure_score"])
                    if row["exposure_score"]
                    else None,
                },
                upscaling={
                    "status": row["upscale_status"],
                    "upscaled_variant_id": str(row["upscaled_variant_id"])
                    if row["upscaled_variant_id"]
                    else None,
                    "upscale_factor": row["upscale_factor"],
                },
            )

            return result.model_dump()

    except Exception as e:
        logger.error(f"Failed to get AI processing status: {e}")
        raise Exception(f"Failed to retrieve AI processing status: {str(e)}")


# ---------------------------------------------------------------------------
# Registration Hook
# ---------------------------------------------------------------------------


def register_upload_monitoring_tools(mcp_server):
    """Register upload monitoring tools with the MCP server.

    This function should be called from the main MCP server initialization
    to add upload monitoring capabilities.

    Args:
        mcp_server: FastMCP server instance

    Example:
        from rawdrive_mcp.server import mcp
        from rawdrive_mcp.upload_monitoring import register_upload_monitoring_tools

        register_upload_monitoring_tools(mcp)
    """
    mcp_server.tool()(get_upload_status)
    mcp_server.tool()(list_recent_uploads)
    mcp_server.tool()(get_upload_metrics)
    mcp_server.tool()(get_ai_processing_status)

    logger.info("Upload monitoring tools registered with MCP server")
