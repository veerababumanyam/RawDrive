"""Tests for Shared Dashboard service.

Tests cover:
- List links with filtering and pagination
- Get link details with access log
- Workspace statistics
- Bulk revoke (Kill Switch)
- Export functionality
- Workspace isolation (multi-tenant security)
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, patch
from datetime import datetime, timezone, timedelta
import json

from app.services.shared_service import (
    SharedService,
    SharedServiceError,
    LinkNotFoundError,
    BulkOperationError,
)


@pytest.fixture
def mock_repository():
    """Mock shared repository."""
    repo = AsyncMock()
    return repo


@pytest.fixture
def service(mock_repository):
    """Create service with mocked repository."""
    return SharedService(repository=mock_repository)


class TestListLinks:
    """Test listing shared links with filters."""

    @pytest.mark.asyncio
    async def test_list_links_returns_paginated_data(self, service, mock_repository):
        """List links should return paginated results with metadata."""
        workspace_id = uuid4()

        # Mock repository response
        mock_repository.list_workspace_links.return_value = (
            [
                {
                    "link_id": str(uuid4()),
                    "gallery_id": str(uuid4()),
                    "gallery_title": "Wedding Gallery",
                    "status": "active",
                    "access_count": 5,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "access_policy": {
                        "password_protected": False,
                        "pin_protected": False,
                        "email_required": False,
                        "download_policy": "view_only",
                    },
                    "recent_visitors": [],
                }
            ],
            {
                "total": 1,
                "active_count": 1,
                "expired_count": 0,
                "revoked_count": 0,
            },
        )

        result = await service.list_links(
            workspace_id=workspace_id,
            limit=50,
            offset=0,
            status="active",
        )

        assert "data" in result
        assert "meta" in result
        assert len(result["data"]) == 1
        assert result["meta"]["total"] == 1
        assert result["meta"]["active_count"] == 1
        assert result["meta"]["has_more"] is False

    @pytest.mark.asyncio
    async def test_list_links_validates_limit(self, service, mock_repository):
        """List links should clamp limit to valid range."""
        workspace_id = uuid4()

        mock_repository.list_workspace_links.return_value = ([], {"total": 0, "active_count": 0, "expired_count": 0, "revoked_count": 0})

        # Test limit above max (100)
        await service.list_links(workspace_id=workspace_id, limit=500)

        # Verify limit was clamped to 100
        call_kwargs = mock_repository.list_workspace_links.call_args.kwargs
        assert call_kwargs["limit"] == 100

    @pytest.mark.asyncio
    async def test_list_links_validates_status(self, service, mock_repository):
        """List links should validate status filter."""
        workspace_id = uuid4()

        mock_repository.list_workspace_links.return_value = ([], {"total": 0, "active_count": 0, "expired_count": 0, "revoked_count": 0})

        # Invalid status should default to "active"
        await service.list_links(workspace_id=workspace_id, status="invalid")

        call_kwargs = mock_repository.list_workspace_links.call_args.kwargs
        assert call_kwargs["status"] == "active"

    @pytest.mark.asyncio
    async def test_list_links_with_search(self, service, mock_repository):
        """List links should pass search term to repository."""
        workspace_id = uuid4()

        mock_repository.list_workspace_links.return_value = ([], {"total": 0, "active_count": 0, "expired_count": 0, "revoked_count": 0})

        await service.list_links(workspace_id=workspace_id, search="wedding")

        call_kwargs = mock_repository.list_workspace_links.call_args.kwargs
        assert call_kwargs["search"] == "wedding"


class TestGetLinkDetail:
    """Test getting detailed link information."""

    @pytest.mark.asyncio
    async def test_get_link_detail_returns_access_log(self, service, mock_repository):
        """Get link detail should include access log."""
        workspace_id = uuid4()
        link_id = uuid4()

        mock_repository.get_link_detail.return_value = {
            "link_id": str(link_id),
            "gallery_id": str(uuid4()),
            "gallery_title": "Test Gallery",
            "status": "active",
            "access_count": 3,
            "access_policy": {},
            "accesses": [
                {
                    "access_id": str(uuid4()),
                    "accessed_at": datetime.now(timezone.utc).isoformat(),
                    "ip_address": "127.xxx.xxx.xxx",
                    "country_code": "US",
                    "device_type": "desktop",
                }
            ],
        }

        result = await service.get_link_detail(
            workspace_id=workspace_id,
            link_id=link_id,
        )

        assert result["link_id"] == str(link_id)
        assert "accesses" in result
        assert len(result["accesses"]) == 1

    @pytest.mark.asyncio
    async def test_get_link_detail_not_found_raises_error(self, service, mock_repository):
        """Getting non-existent link should raise LinkNotFoundError."""
        workspace_id = uuid4()
        link_id = uuid4()

        mock_repository.get_link_detail.return_value = None

        with pytest.raises(LinkNotFoundError):
            await service.get_link_detail(
                workspace_id=workspace_id,
                link_id=link_id,
            )


class TestGetStats:
    """Test workspace statistics."""

    @pytest.mark.asyncio
    async def test_get_stats_returns_aggregates(self, service, mock_repository):
        """Get stats should return aggregate statistics."""
        workspace_id = uuid4()

        mock_repository.get_workspace_stats.return_value = {
            "total_links": 10,
            "active_links": 7,
            "expired_links": 2,
            "revoked_links": 1,
            "total_accesses_period": 150,
            "unique_visitors_period": 45,
            "period_days": 30,
            "device_breakdown": {"desktop": 80, "mobile": 60, "tablet": 10},
            "accesses_by_day": [{"date": "2025-12-25", "count": 12}],
            "top_galleries": [
                {"gallery_id": str(uuid4()), "gallery_title": "Top Gallery", "link_count": 3, "access_count": 50}
            ],
            "top_countries": [{"country_code": "US", "count": 100}],
        }

        result = await service.get_stats(workspace_id=workspace_id, days=30)

        assert result["total_links"] == 10
        assert result["active_links"] == 7
        assert result["device_breakdown"]["desktop"] == 80
        assert len(result["top_galleries"]) == 1

    @pytest.mark.asyncio
    async def test_get_stats_clamps_days(self, service, mock_repository):
        """Get stats should clamp days to valid range (1-90)."""
        workspace_id = uuid4()

        mock_repository.get_workspace_stats.return_value = {"total_links": 0, "active_links": 0, "expired_links": 0, "revoked_links": 0, "total_accesses_period": 0, "unique_visitors_period": 0, "period_days": 90, "device_breakdown": {}, "accesses_by_day": [], "top_galleries": [], "top_countries": []}

        await service.get_stats(workspace_id=workspace_id, days=150)

        call_args = mock_repository.get_workspace_stats.call_args
        assert call_args.args[1] == 90  # days should be clamped to 90


class TestRevokeLink:
    """Test single link revocation."""

    @pytest.mark.asyncio
    async def test_revoke_link_success(self, service, mock_repository):
        """Revoking valid link should succeed."""
        workspace_id = uuid4()
        link_id = uuid4()

        mock_repository.bulk_revoke.return_value = (1, [])

        result = await service.revoke_link(
            workspace_id=workspace_id,
            link_id=link_id,
            user_id=uuid4(),
        )

        assert result["message"] == "Link revoked successfully"
        assert result["link_id"] == str(link_id)

    @pytest.mark.asyncio
    async def test_revoke_link_not_found_raises_error(self, service, mock_repository):
        """Revoking non-existent link should raise LinkNotFoundError."""
        workspace_id = uuid4()
        link_id = uuid4()

        mock_repository.bulk_revoke.return_value = (0, [{"link_id": str(link_id), "error": "Link not found"}])

        with pytest.raises(LinkNotFoundError):
            await service.revoke_link(
                workspace_id=workspace_id,
                link_id=link_id,
            )


class TestBulkRevoke:
    """Test bulk revocation (Kill Switch)."""

    @pytest.mark.asyncio
    async def test_bulk_revoke_success(self, service, mock_repository):
        """Bulk revoke should revoke multiple links."""
        workspace_id = uuid4()
        link_ids = [uuid4(), uuid4(), uuid4()]

        mock_repository.bulk_revoke.return_value = (3, [])

        result = await service.bulk_revoke(
            workspace_id=workspace_id,
            link_ids=link_ids,
            user_id=uuid4(),
            reason="Security incident",
        )

        assert result["revoked_count"] == 3
        assert result["failed"] == []

    @pytest.mark.asyncio
    async def test_bulk_revoke_partial_success(self, service, mock_repository):
        """Bulk revoke should report partial failures."""
        workspace_id = uuid4()
        link_ids = [uuid4(), uuid4(), uuid4()]

        mock_repository.bulk_revoke.return_value = (
            2,
            [{"link_id": str(link_ids[2]), "error": "Already revoked"}],
        )

        result = await service.bulk_revoke(
            workspace_id=workspace_id,
            link_ids=link_ids,
        )

        assert result["revoked_count"] == 2
        assert len(result["failed"]) == 1

    @pytest.mark.asyncio
    async def test_bulk_revoke_exceeds_limit_raises_error(self, service, mock_repository):
        """Bulk revoke should reject requests exceeding limit."""
        workspace_id = uuid4()
        link_ids = [uuid4() for _ in range(101)]  # Over limit

        with pytest.raises(BulkOperationError) as exc_info:
            await service.bulk_revoke(
                workspace_id=workspace_id,
                link_ids=link_ids,
            )

        assert "100" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_bulk_revoke_empty_list_returns_zero(self, service, mock_repository):
        """Bulk revoke with empty list should return zero count."""
        workspace_id = uuid4()

        result = await service.bulk_revoke(
            workspace_id=workspace_id,
            link_ids=[],
        )

        assert result["revoked_count"] == 0
        assert result["failed"] == []


class TestExportLinks:
    """Test export functionality."""

    @pytest.mark.asyncio
    async def test_export_csv_format(self, service, mock_repository):
        """Export should generate valid CSV."""
        workspace_id = uuid4()

        mock_repository.export_links.return_value = [
            {
                "link_id": str(uuid4()),
                "gallery_id": str(uuid4()),
                "gallery_title": "Test Gallery",
                "label": "Client Link",
                "status": "active",
                "target_type": "gallery",
                "expires_at": None,
                "max_accesses": None,
                "access_count": 5,
                "created_at": "2025-12-26T10:00:00+00:00",
                "updated_at": None,
                "created_by_email": "photographer@example.com",
                "password_protected": False,
                "pin_protected": False,
                "email_registration_required": False,
                "download_policy": "view_only",
            }
        ]

        data, content_type, filename = await service.export_links(
            workspace_id=workspace_id,
            format="csv",
        )

        assert content_type == "text/csv"
        assert filename.startswith("sharing_export_")
        assert filename.endswith(".csv")

        # Verify CSV content
        csv_content = data.decode("utf-8")
        assert "link_id" in csv_content
        assert "gallery_title" in csv_content
        assert "Test Gallery" in csv_content

    @pytest.mark.asyncio
    async def test_export_json_format(self, service, mock_repository):
        """Export should generate valid JSON."""
        workspace_id = uuid4()
        link_id = str(uuid4())

        mock_repository.export_links.return_value = [
            {
                "link_id": link_id,
                "gallery_id": str(uuid4()),
                "gallery_title": "Test Gallery",
                "status": "active",
            }
        ]

        data, content_type, filename = await service.export_links(
            workspace_id=workspace_id,
            format="json",
        )

        assert content_type == "application/json"
        assert filename.endswith(".json")

        # Verify JSON content
        parsed = json.loads(data.decode("utf-8"))
        assert len(parsed) == 1
        assert parsed[0]["link_id"] == link_id

    @pytest.mark.asyncio
    async def test_export_with_date_filters(self, service, mock_repository):
        """Export should pass date filters to repository."""
        workspace_id = uuid4()
        date_from = datetime(2025, 1, 1, tzinfo=timezone.utc)
        date_to = datetime(2025, 12, 31, tzinfo=timezone.utc)

        mock_repository.export_links.return_value = []

        await service.export_links(
            workspace_id=workspace_id,
            format="csv",
            date_from=date_from,
            date_to=date_to,
        )

        call_kwargs = mock_repository.export_links.call_args.kwargs
        assert call_kwargs["date_from"] == date_from
        assert call_kwargs["date_to"] == date_to


class TestWorkspaceIsolation:
    """Test multi-tenant security."""

    @pytest.mark.asyncio
    async def test_list_links_scoped_to_workspace(self, service, mock_repository):
        """List links should only return links from the specified workspace."""
        workspace_id = uuid4()

        mock_repository.list_workspace_links.return_value = ([], {"total": 0, "active_count": 0, "expired_count": 0, "revoked_count": 0})

        await service.list_links(workspace_id=workspace_id)

        # Verify workspace_id was passed
        call_kwargs = mock_repository.list_workspace_links.call_args.kwargs
        assert call_kwargs["workspace_id"] == workspace_id

    @pytest.mark.asyncio
    async def test_get_detail_scoped_to_workspace(self, service, mock_repository):
        """Get detail should only return links from the specified workspace."""
        workspace_id = uuid4()
        link_id = uuid4()

        mock_repository.get_link_detail.return_value = None

        with pytest.raises(LinkNotFoundError):
            await service.get_link_detail(
                workspace_id=workspace_id,
                link_id=link_id,
            )

        # Verify workspace_id was passed
        mock_repository.get_link_detail.assert_called_once_with(workspace_id, link_id)

    @pytest.mark.asyncio
    async def test_bulk_revoke_scoped_to_workspace(self, service, mock_repository):
        """Bulk revoke should only affect links in the specified workspace."""
        workspace_id = uuid4()
        link_ids = [uuid4()]

        mock_repository.bulk_revoke.return_value = (1, [])

        await service.bulk_revoke(
            workspace_id=workspace_id,
            link_ids=link_ids,
        )

        # Verify workspace_id was passed
        call_args = mock_repository.bulk_revoke.call_args
        assert call_args.kwargs["workspace_id"] == workspace_id
