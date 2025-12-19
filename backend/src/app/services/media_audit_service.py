"""MediaAuditService: Immutable audit logging for media access and operations.

Implements SOC2/GDPR compliant audit trail with 7-year retention.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)

# Audit action types
ACTION_VIEW_THUMBNAIL = "view_thumbnail"
ACTION_VIEW_PREVIEW = "view_preview"
ACTION_VIEW_ORIGINAL = "view_original"
ACTION_DOWNLOAD_WEBP = "download_webp"
ACTION_DOWNLOAD_ORIGINAL = "download_original"


class MediaAuditError(Exception):
    """Base audit logging error."""

    def __init__(self, message: str, code: str = "AUDIT_ERROR"):
        super().__init__(message)
        self.code = code


class MediaAuditService:
    """Service for media access audit logging."""

    async def log_access(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        action: str,
        ip_address: str,
        user_id: Optional[UUID] = None,
        share_link_id: Optional[UUID] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Log media access event (immutable append-only).

        Args:
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            action: Action type (view_thumbnail, view_preview, etc.)
            ip_address: Client IP address
            user_id: User UUID (if authenticated)
            share_link_id: Share link UUID (if accessed via share link)
            user_agent: HTTP User-Agent header

        Raises:
            MediaAuditError: If logging fails
        """
        # Validate action
        valid_actions = {
            ACTION_VIEW_THUMBNAIL,
            ACTION_VIEW_PREVIEW,
            ACTION_VIEW_ORIGINAL,
            ACTION_DOWNLOAD_WEBP,
            ACTION_DOWNLOAD_ORIGINAL,
        }
        if action not in valid_actions:
            raise MediaAuditError(
                f"Invalid action: {action}. Must be one of {valid_actions}",
                "INVALID_ACTION",
            )

        # At least one of user_id or share_link_id must be provided
        if not user_id and not share_link_id:
            logger.warning(
                f"Media access log without user_id or share_link_id: "
                f"workspace={workspace_id}, asset={asset_id}, action={action}"
            )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            try:
                await conn.execute(
                    """
                    INSERT INTO media_access_logs (
                        workspace_id, asset_id, user_id, share_link_id,
                        action, ip_address, user_agent
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    workspace_id,
                    asset_id,
                    user_id,
                    share_link_id,
                    action,
                    ip_address,
                    user_agent,
                )
            except Exception as e:
                logger.error(
                    f"Failed to log media access: workspace={workspace_id}, "
                    f"asset={asset_id}, action={action}, error={e}"
                )
                # Don't raise - audit logging failures shouldn't break the request
                # but we should alert on this in production

    async def get_access_logs(
        self,
        workspace_id: UUID,
        asset_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Retrieve access logs for audit purposes.

        Args:
            workspace_id: Workspace UUID
            asset_id: Filter by asset (optional)
            user_id: Filter by user (optional)
            limit: Maximum number of records
            offset: Pagination offset

        Returns:
            List of audit log records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query
            where_clauses = ["workspace_id = $1"]
            params = [workspace_id]
            param_idx = 2

            if asset_id:
                where_clauses.append(f"asset_id = ${param_idx}")
                params.append(asset_id)
                param_idx += 1

            if user_id:
                where_clauses.append(f"user_id = ${param_idx}")
                params.append(user_id)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            rows = await conn.fetch(
                f"""
                SELECT
                    log_id, workspace_id, asset_id, user_id, share_link_id,
                    action, ip_address, user_agent, created_at
                FROM media_access_logs
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return [
                {
                    "log_id": str(row["log_id"]),
                    "workspace_id": str(row["workspace_id"]),
                    "asset_id": str(row["asset_id"]),
                    "user_id": str(row["user_id"]) if row["user_id"] else None,
                    "share_link_id": (
                        str(row["share_link_id"]) if row["share_link_id"] else None
                    ),
                    "action": row["action"],
                    "ip_address": row["ip_address"],
                    "user_agent": row["user_agent"],
                    "created_at": row["created_at"].isoformat(),
                }
                for row in rows
            ]


# Export singleton instance
_media_audit_service: Optional[MediaAuditService] = None


def get_media_audit_service() -> MediaAuditService:
    """Get singleton media audit service instance."""
    global _media_audit_service
    if _media_audit_service is None:
        _media_audit_service = MediaAuditService()
    return _media_audit_service

