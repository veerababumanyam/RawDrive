"""Shared Dashboard Service - Business logic for Security & Sharing Dashboard.

This service provides the core business logic for the workspace-wide
Sharing Dashboard, enabling photographers to:
- View all active share links across galleries
- Bulk revoke links (Kill Switch)
- Export sharing data for compliance

Security considerations:
- All operations are workspace-scoped
- Audit logging for revocation actions
- Rate limiting on list operations
"""

from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.repositories.shared_repository import SharedRepository, get_shared_repository


logger = logging.getLogger(__name__)


class SharedServiceError(Exception):
    """Base exception for shared service errors."""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class LinkNotFoundError(SharedServiceError):
    """Link not found in workspace."""

    def __init__(self, link_id: Optional[str] = None):
        super().__init__(
            message="Link not found" + (f": {link_id}" if link_id else ""),
            code="LINK_NOT_FOUND",
            status_code=404,
        )


class BulkOperationError(SharedServiceError):
    """Error during bulk operation."""

    def __init__(self, message: str):
        super().__init__(
            message=message,
            code="BULK_OPERATION_FAILED",
            status_code=400,
        )


class SharedService:
    """Service for shared dashboard operations.

    Provides business logic for:
    - Listing all magic links across workspace
    - Getting detailed link information
    - Bulk revocation (Kill Switch)
    - Exporting sharing data
    - Aggregate statistics
    """

    # Constants
    MAX_BULK_REVOKE = 100  # Maximum links to revoke in one request
    DEFAULT_STATS_DAYS = 30  # Default period for statistics

    def __init__(self, repository: Optional[SharedRepository] = None):
        self.repo = repository or get_shared_repository()

    # =========================================================================
    # LIST OPERATIONS
    # =========================================================================

    async def list_links(
        self,
        workspace_id: UUID,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        exclude_revoked: bool = False,
        gallery_id: Optional[UUID] = None,
        search: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        """List all magic links across the workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum results (1-100)
            offset: Pagination offset
            status: Filter by status ('active', 'expired', 'revoked', 'all')
            exclude_revoked: If True, exclude revoked links from results
            gallery_id: Filter by specific gallery
            search: Search term for label or gallery title
            sort_by: Column to sort by
            sort_order: Sort direction

        Returns:
            Dict with links array and meta information
        """
        # Validate and sanitize inputs
        limit = min(max(1, limit), 100)
        offset = max(0, offset)

        valid_statuses = {"active", "expired", "revoked", "all", None}
        if status not in valid_statuses:
            status = "active"

        valid_sorts = {"created_at", "access_count", "expires_at", "last_accessed_at"}
        if sort_by not in valid_sorts:
            sort_by = "created_at"

        if sort_order.lower() not in {"asc", "desc"}:
            sort_order = "desc"

        links, counts = await self.repo.list_workspace_links(
            workspace_id=workspace_id,
            limit=limit,
            offset=offset,
            status=status,
            exclude_revoked=exclude_revoked,
            gallery_id=gallery_id,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
        )

        return {
            "data": links,
            "meta": {
                "total": counts["total"],
                "active_count": counts["active_count"],
                "expired_count": counts["expired_count"],
                "revoked_count": counts["revoked_count"],
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(links) < counts["total"],
            },
        }

    async def get_link_detail(
        self,
        workspace_id: UUID,
        link_id: UUID,
    ) -> dict[str, Any]:
        """Get detailed information for a single link.

        Args:
            workspace_id: Workspace ID for tenant isolation
            link_id: The magic link ID

        Returns:
            Link details with gallery info and access log

        Raises:
            LinkNotFoundError: If link not found in workspace
        """
        link = await self.repo.get_link_detail(workspace_id, link_id)

        if not link:
            raise LinkNotFoundError(str(link_id))

        return link

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_stats(
        self,
        workspace_id: UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get aggregate sharing statistics for the workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            days: Number of days for trend data (1-90)

        Returns:
            Aggregate statistics including totals, trends, breakdowns
        """
        # Validate days
        days = min(max(1, days), 90)

        return await self.repo.get_workspace_stats(workspace_id, days)

    # =========================================================================
    # REVOCATION
    # =========================================================================

    async def revoke_link(
        self,
        workspace_id: UUID,
        link_id: UUID,
        user_id: Optional[UUID] = None,
        reason: Optional[str] = None,
    ) -> dict[str, Any]:
        """Revoke a single magic link.

        Args:
            workspace_id: Workspace ID for tenant isolation
            link_id: The magic link ID
            user_id: User performing the revocation (for audit)
            reason: Optional reason for audit log

        Returns:
            Success message

        Raises:
            LinkNotFoundError: If link not found in workspace
        """
        # Use bulk revoke with single link
        revoked_count, failures = await self.repo.bulk_revoke(
            workspace_id=workspace_id,
            link_ids=[link_id],
        )

        if failures:
            raise LinkNotFoundError(str(link_id))

        logger.info(
            "Magic link revoked via shared dashboard",
            extra={
                "workspace_id": str(workspace_id),
                "link_id": str(link_id),
                "user_id": str(user_id) if user_id else None,
                "reason": reason,
            },
        )

        return {
            "message": "Link revoked successfully",
            "link_id": str(link_id),
        }

    async def bulk_revoke(
        self,
        workspace_id: UUID,
        link_ids: list[UUID],
        user_id: Optional[UUID] = None,
        reason: Optional[str] = None,
    ) -> dict[str, Any]:
        """Revoke multiple magic links at once (Kill Switch).

        Args:
            workspace_id: Workspace ID for tenant isolation
            link_ids: List of link IDs to revoke
            user_id: User performing the revocation (for audit)
            reason: Optional reason for audit log

        Returns:
            Dict with revoked count and any failures

        Raises:
            BulkOperationError: If too many links requested
        """
        if len(link_ids) > self.MAX_BULK_REVOKE:
            raise BulkOperationError(
                f"Cannot revoke more than {self.MAX_BULK_REVOKE} links at once"
            )

        if not link_ids:
            return {
                "revoked_count": 0,
                "failed": [],
            }

        revoked_count, failures = await self.repo.bulk_revoke(
            workspace_id=workspace_id,
            link_ids=link_ids,
        )

        logger.info(
            "Bulk revoke via shared dashboard",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user_id) if user_id else None,
                "requested": len(link_ids),
                "revoked": revoked_count,
                "failed": len(failures),
                "reason": reason,
            },
        )

        return {
            "revoked_count": revoked_count,
            "failed": failures,
        }

    # =========================================================================
    # EXPORT
    # =========================================================================

    async def export_links(
        self,
        workspace_id: UUID,
        format: str = "csv",
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> tuple[bytes, str, str]:
        """Export sharing data for compliance/audit.

        Args:
            workspace_id: Workspace ID for tenant isolation
            format: Output format ('csv' or 'json')
            date_from: Optional start date filter
            date_to: Optional end date filter

        Returns:
            Tuple of (data bytes, content type, filename)
        """
        links = await self.repo.export_links(
            workspace_id=workspace_id,
            date_from=date_from,
            date_to=date_to,
        )

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

        if format == "json":
            data = json.dumps(links, indent=2, default=str).encode("utf-8")
            content_type = "application/json"
            filename = f"sharing_export_{timestamp}.json"
        else:
            # CSV format
            output = io.StringIO()
            if links:
                fieldnames = [
                    "link_id",
                    "gallery_id",
                    "gallery_title",
                    "label",
                    "status",
                    "target_type",
                    "expires_at",
                    "max_accesses",
                    "access_count",
                    "created_at",
                    "updated_at",
                    "created_by_email",
                    "password_protected",
                    "pin_protected",
                    "email_registration_required",
                    "download_policy",
                ]
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                for link in links:
                    writer.writerow({k: link.get(k, "") for k in fieldnames})
            else:
                output.write("No links found for the specified period.\n")

            data = output.getvalue().encode("utf-8")
            content_type = "text/csv"
            filename = f"sharing_export_{timestamp}.csv"

        logger.info(
            "Sharing data exported",
            extra={
                "workspace_id": str(workspace_id),
                "format": format,
                "record_count": len(links),
            },
        )

        return data, content_type, filename


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_shared_service: Optional[SharedService] = None


def get_shared_service() -> SharedService:
    """Get singleton shared service instance."""
    global _shared_service
    if _shared_service is None:
        _shared_service = SharedService()
    return _shared_service
