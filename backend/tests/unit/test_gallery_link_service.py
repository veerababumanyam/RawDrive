"""Unit tests for GalleryLinkService.

Task 34.3: GalleryLinkService Unit Tests
Tests gallery linking, unlinking, role management, and workspace isolation.
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from app.services.gallery_link_service import (
    GalleryLinkService,
    VALID_GALLERY_ROLES,
)
from app.services.client_exceptions import (
    ClientNotFoundError,
    ClientValidationError,
    GalleryAlreadyLinkedError,
    GalleryLinkNotFoundError,
    GalleryNotFoundForLinkError,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db_pool():
    """Mock database pool with async context manager."""
    pool = AsyncMock()
    conn = AsyncMock()

    class MockAcquire:
        def __init__(self, conn):
            self.conn = conn
        async def __aenter__(self):
            return self.conn
        async def __aexit__(self, *args):
            return None

    class MockTransaction:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return None

    def acquire_side_effect():
        return MockAcquire(conn)

    def transaction_side_effect():
        return MockTransaction()

    pool.acquire = MagicMock(side_effect=acquire_side_effect)
    conn.transaction = MagicMock(side_effect=transaction_side_effect)

    return pool, conn


@pytest.fixture
def sample_gallery_row():
    """Sample gallery database row."""
    return {
        "gallery_id": uuid4(),
        "title": "Wedding Album 2024",
        "cover_asset_id": uuid4(),
        "status": "published",
        "asset_count": 150,
    }


@pytest.fixture
def sample_link_row():
    """Sample link database row."""
    now = datetime.now(timezone.utc)
    return {
        "link_id": uuid4(),
        "gallery_id": uuid4(),
        "role": "primary",
        "title": "Wedding Album 2024",
        "created_at": now,
    }


# ---------------------------------------------------------------------------
# GalleryLinkService.link_gallery Tests
# ---------------------------------------------------------------------------


class TestLinkGallery:
    """Tests for GalleryLinkService.link_gallery."""

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_links_gallery_successfully(self, mock_get_pool, mock_db_pool, sample_gallery_row):
        """Successfully links a gallery to a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        client_id = uuid4()
        link_id = uuid4()

        # Mock client exists, gallery exists, no existing link
        conn.fetchrow.side_effect = [
            {"client_id": client_id, "full_name": "John Smith"},  # Client
            sample_gallery_row,  # Gallery
        ]
        conn.fetchval.side_effect = [None, link_id]  # No existing link, then link_id

        result = await service.link_gallery(
            workspace_id=uuid4(),
            client_id=client_id,
            gallery_id=sample_gallery_row["gallery_id"],
            role="primary",
        )

        assert result["link_id"] == str(link_id)
        assert result["gallery_title"] == "Wedding Album 2024"
        assert result["role"] == "primary"

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_records_activity(self, mock_get_pool, mock_db_pool, sample_gallery_row):
        """Records linking activity in client timeline."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        client_id = uuid4()
        user_id = uuid4()
        link_id = uuid4()

        conn.fetchrow.side_effect = [
            {"client_id": client_id, "full_name": "John Smith"},
            sample_gallery_row,
        ]
        conn.fetchval.side_effect = [None, link_id]

        await service.link_gallery(
            workspace_id=uuid4(),
            client_id=client_id,
            gallery_id=sample_gallery_row["gallery_id"],
            role="primary",
            user_id=user_id,
        )

        # Verify activity was recorded
        execute_calls = conn.execute.call_args_list
        assert any("client_activities" in str(call) and "gallery_linked" in str(call)
                   for call in execute_calls)

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_raises_client_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        conn.fetchrow.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.link_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=uuid4(),
            )

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_raises_gallery_not_found(self, mock_get_pool, mock_db_pool):
        """Raises GalleryNotFoundForLinkError when gallery doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        # Client exists, gallery not found
        conn.fetchrow.side_effect = [
            {"client_id": uuid4(), "full_name": "John Smith"},
            None,  # Gallery not found
        ]

        with pytest.raises(GalleryNotFoundForLinkError):
            await service.link_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=uuid4(),
            )

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_raises_already_linked(self, mock_get_pool, mock_db_pool, sample_gallery_row):
        """Raises GalleryAlreadyLinkedError when link exists."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        # Client exists, gallery exists, link already exists
        conn.fetchrow.side_effect = [
            {"client_id": uuid4(), "full_name": "John Smith"},
            sample_gallery_row,
        ]
        conn.fetchval.return_value = uuid4()  # Existing link_id

        with pytest.raises(GalleryAlreadyLinkedError):
            await service.link_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=sample_gallery_row["gallery_id"],
            )

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_defaults_invalid_role_to_primary(self, mock_get_pool, mock_db_pool, sample_gallery_row):
        """Defaults to primary role when invalid role provided."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        client_id = uuid4()

        # Invalid role should raise validation error (not silently default)
        with pytest.raises(ClientValidationError) as exc_info:
            await service.link_gallery(
                workspace_id=uuid4(),
                client_id=client_id,
                gallery_id=sample_gallery_row["gallery_id"],
                role="invalid_role",  # Invalid role
            )

        assert "Invalid gallery role" in str(exc_info.value)
        assert "invalid_role" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_all_valid_roles(self, mock_get_pool, mock_db_pool, sample_gallery_row):
        """Accepts all valid roles."""
        for role in VALID_GALLERY_ROLES:
            pool, conn = mock_db_pool
            mock_get_pool.return_value = pool
            service = GalleryLinkService()

            link_id = uuid4()

            conn.fetchrow.side_effect = [
                {"client_id": uuid4(), "full_name": "John Smith"},
                sample_gallery_row,
            ]
            conn.fetchval.side_effect = [None, link_id]

            result = await service.link_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=sample_gallery_row["gallery_id"],
                role=role,
            )

            assert result["role"] == role


# ---------------------------------------------------------------------------
# GalleryLinkService.unlink_gallery Tests
# ---------------------------------------------------------------------------


class TestUnlinkGallery:
    """Tests for GalleryLinkService.unlink_gallery."""

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_unlinks_successfully(self, mock_get_pool, mock_db_pool, sample_link_row):
        """Successfully unlinks a gallery from a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        conn.fetchrow.return_value = sample_link_row

        result = await service.unlink_gallery(
            workspace_id=uuid4(),
            client_id=uuid4(),
            gallery_id=sample_link_row["gallery_id"],
        )

        assert "Unlinked from gallery" in result["message"]
        assert "Wedding Album 2024" in result["message"]

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_records_unlink_activity(self, mock_get_pool, mock_db_pool, sample_link_row):
        """Records unlinking activity in client timeline."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        user_id = uuid4()
        conn.fetchrow.return_value = sample_link_row

        await service.unlink_gallery(
            workspace_id=uuid4(),
            client_id=uuid4(),
            gallery_id=sample_link_row["gallery_id"],
            user_id=user_id,
        )

        # Verify activity was recorded
        execute_calls = conn.execute.call_args_list
        assert any("client_activities" in str(call) and "gallery_unlinked" in str(call)
                   for call in execute_calls)

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_raises_link_not_found(self, mock_get_pool, mock_db_pool):
        """Raises GalleryLinkNotFoundError when link doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        conn.fetchrow.return_value = None

        with pytest.raises(GalleryLinkNotFoundError):
            await service.unlink_gallery(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=uuid4(),
            )


# ---------------------------------------------------------------------------
# GalleryLinkService.get_linked_galleries Tests
# ---------------------------------------------------------------------------


class TestGetLinkedGalleries:
    """Tests for GalleryLinkService.get_linked_galleries."""

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_returns_linked_galleries(self, mock_get_pool, mock_db_pool):
        """Returns all linked galleries for a client."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        now = datetime.now(timezone.utc)
        gallery_id = uuid4()

        # Mock client exists
        conn.fetchval.return_value = 1

        # Mock galleries
        conn.fetch.return_value = [
            {
                "link_id": uuid4(),
                "gallery_id": gallery_id,
                "role": "primary",
                "link_created_at": now,
                "title": "Wedding Album 2024",
                "description": "Beautiful wedding photos",
                "cover_asset_id": uuid4(),
                "status": "published",
                "gallery_created_at": now,
                "gallery_updated_at": now,
                "asset_count": 150,
            }
        ]

        # Mock stats
        conn.fetchrow.return_value = {
            "picks_count": 25,
            "favorites_count": 10,
        }

        result = await service.get_linked_galleries(
            workspace_id=uuid4(),
            client_id=uuid4(),
            include_stats=True,
        )

        assert len(result) == 1
        assert result[0]["title"] == "Wedding Album 2024"
        assert result[0]["asset_count"] == 150
        assert result[0]["picks_count"] == 25
        assert result[0]["favorites_count"] == 10

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_without_stats(self, mock_get_pool, mock_db_pool):
        """Returns galleries without stats when include_stats=False."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        now = datetime.now(timezone.utc)

        conn.fetchval.return_value = 1
        conn.fetch.return_value = [
            {
                "link_id": uuid4(),
                "gallery_id": uuid4(),
                "role": "primary",
                "link_created_at": now,
                "title": "Wedding Album 2024",
                "description": None,
                "cover_asset_id": None,
                "status": "draft",
                "gallery_created_at": now,
                "gallery_updated_at": now,
                "asset_count": 0,
            }
        ]

        result = await service.get_linked_galleries(
            workspace_id=uuid4(),
            client_id=uuid4(),
            include_stats=False,
        )

        assert len(result) == 1
        assert "picks_count" not in result[0]
        assert "favorites_count" not in result[0]

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_raises_client_not_found(self, mock_get_pool, mock_db_pool):
        """Raises ClientNotFoundError when client doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        conn.fetchval.return_value = None

        with pytest.raises(ClientNotFoundError):
            await service.get_linked_galleries(
                workspace_id=uuid4(),
                client_id=uuid4(),
            )


# ---------------------------------------------------------------------------
# GalleryLinkService.get_gallery_clients Tests
# ---------------------------------------------------------------------------


class TestGetGalleryClients:
    """Tests for GalleryLinkService.get_gallery_clients."""

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_returns_linked_clients(self, mock_get_pool, mock_db_pool):
        """Returns all clients linked to a gallery."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        now = datetime.now(timezone.utc)
        client_id = uuid4()

        conn.fetch.return_value = [
            {
                "link_id": uuid4(),
                "role": "primary",
                "link_created_at": now,
                "client_id": client_id,
                "full_name": "John Smith",
                "first_name": "John",
                "last_name": "Smith",
                "avatar_asset_id": None,
                "status": "active",
            }
        ]

        result = await service.get_gallery_clients(
            workspace_id=uuid4(),
            gallery_id=uuid4(),
        )

        assert len(result) == 1
        assert result[0]["full_name"] == "John Smith"
        assert result[0]["initials"] == "JS"
        assert result[0]["role"] == "primary"

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_computes_initials_correctly(self, mock_get_pool, mock_db_pool):
        """Computes initials from first and last name."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        now = datetime.now(timezone.utc)

        conn.fetch.return_value = [
            {
                "link_id": uuid4(),
                "role": "primary",
                "link_created_at": now,
                "client_id": uuid4(),
                "full_name": "Jane Doe",
                "first_name": "jane",  # lowercase
                "last_name": "doe",    # lowercase
                "avatar_asset_id": None,
                "status": "active",
            }
        ]

        result = await service.get_gallery_clients(
            workspace_id=uuid4(),
            gallery_id=uuid4(),
        )

        assert result[0]["initials"] == "JD"  # Should be uppercase

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_returns_empty_for_no_links(self, mock_get_pool, mock_db_pool):
        """Returns empty list when no clients linked."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        conn.fetch.return_value = []

        result = await service.get_gallery_clients(
            workspace_id=uuid4(),
            gallery_id=uuid4(),
        )

        assert result == []


# ---------------------------------------------------------------------------
# GalleryLinkService.update_link_role Tests
# ---------------------------------------------------------------------------


class TestUpdateLinkRole:
    """Tests for GalleryLinkService.update_link_role."""

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_updates_role_successfully(self, mock_get_pool, mock_db_pool, sample_link_row):
        """Successfully updates link role."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        sample_link_row["role"] = "primary"
        conn.fetchrow.return_value = sample_link_row

        result = await service.update_link_role(
            workspace_id=uuid4(),
            client_id=uuid4(),
            gallery_id=sample_link_row["gallery_id"],
            new_role="secondary",
        )

        assert result["role"] == "secondary"
        assert "Role updated" in result["message"]

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_records_role_change_activity(self, mock_get_pool, mock_db_pool, sample_link_row):
        """Records role change in activity timeline."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        sample_link_row["role"] = "primary"
        conn.fetchrow.return_value = sample_link_row

        await service.update_link_role(
            workspace_id=uuid4(),
            client_id=uuid4(),
            gallery_id=sample_link_row["gallery_id"],
            new_role="guest",
            user_id=uuid4(),
        )

        # Verify activity was recorded
        execute_calls = conn.execute.call_args_list
        assert any("gallery_role_changed" in str(call) for call in execute_calls)

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_returns_unchanged_if_same_role(self, mock_get_pool, mock_db_pool, sample_link_row):
        """Returns unchanged message when role is the same."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        sample_link_row["role"] = "primary"
        conn.fetchrow.return_value = sample_link_row

        result = await service.update_link_role(
            workspace_id=uuid4(),
            client_id=uuid4(),
            gallery_id=sample_link_row["gallery_id"],
            new_role="primary",  # Same role
        )

        assert result["role"] == "primary"
        assert "unchanged" in result["message"].lower()
        # No execute calls for UPDATE
        conn.execute.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_raises_link_not_found(self, mock_get_pool, mock_db_pool):
        """Raises GalleryLinkNotFoundError when link doesn't exist."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        conn.fetchrow.return_value = None

        with pytest.raises(GalleryLinkNotFoundError):
            await service.update_link_role(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=uuid4(),
                new_role="guest",
            )

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_defaults_invalid_role(self, mock_get_pool, mock_db_pool, sample_link_row):
        """Raises validation error for invalid roles."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        # Invalid role should raise validation error (not silently default)
        with pytest.raises(ClientValidationError) as exc_info:
            await service.update_link_role(
                workspace_id=uuid4(),
                client_id=uuid4(),
                gallery_id=sample_link_row["gallery_id"],
                new_role="invalid_role",
            )

        assert "Invalid gallery role" in str(exc_info.value)
        assert "invalid_role" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Workspace Isolation Tests
# ---------------------------------------------------------------------------


class TestGalleryLinkWorkspaceIsolation:
    """Tests ensuring workspace isolation for gallery link operations."""

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_link_uses_workspace_id(self, mock_get_pool, mock_db_pool, sample_gallery_row):
        """Link operation includes workspace_id in all queries."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        workspace_id = uuid4()
        link_id = uuid4()

        conn.fetchrow.side_effect = [
            {"client_id": uuid4(), "full_name": "John Smith"},
            sample_gallery_row,
        ]
        conn.fetchval.side_effect = [None, link_id]

        await service.link_gallery(
            workspace_id=workspace_id,
            client_id=uuid4(),
            gallery_id=sample_gallery_row["gallery_id"],
        )

        # Verify workspace_id in client check
        client_check_call = conn.fetchrow.call_args_list[0]
        assert workspace_id in client_check_call[0]

        # Verify workspace_id in gallery check
        gallery_check_call = conn.fetchrow.call_args_list[1]
        assert workspace_id in gallery_check_call[0]

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_unlink_uses_workspace_id(self, mock_get_pool, mock_db_pool, sample_link_row):
        """Unlink operation filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        workspace_id = uuid4()
        conn.fetchrow.return_value = sample_link_row

        await service.unlink_gallery(
            workspace_id=workspace_id,
            client_id=uuid4(),
            gallery_id=sample_link_row["gallery_id"],
        )

        # Verify DELETE includes workspace_id
        execute_calls = conn.execute.call_args_list
        delete_call = next(c for c in execute_calls if "DELETE" in str(c))
        assert workspace_id in delete_call[0]

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_get_galleries_uses_workspace_id(self, mock_get_pool, mock_db_pool):
        """Get linked galleries filters by workspace_id."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        workspace_id = uuid4()
        conn.fetchval.return_value = 1
        conn.fetch.return_value = []

        await service.get_linked_galleries(
            workspace_id=workspace_id,
            client_id=uuid4(),
        )

        # Verify workspace_id in query
        fetch_call = conn.fetch.call_args
        sql = fetch_call[0][0]
        params = fetch_call[0][1:]

        assert "workspace_id = $1" in sql
        assert workspace_id in params


# ---------------------------------------------------------------------------
# Data Preservation Tests
# ---------------------------------------------------------------------------


class TestGalleryLinkDataPreservation:
    """Tests that gallery data is preserved during unlink operations."""

    @pytest.mark.asyncio
    @patch('app.services.gallery_link_service.get_postgres_pool')
    async def test_unlink_preserves_gallery(self, mock_get_pool, mock_db_pool, sample_link_row):
        """Unlinking preserves gallery data (only removes link)."""
        pool, conn = mock_db_pool
        mock_get_pool.return_value = pool
        service = GalleryLinkService()

        conn.fetchrow.return_value = sample_link_row

        await service.unlink_gallery(
            workspace_id=uuid4(),
            client_id=uuid4(),
            gallery_id=sample_link_row["gallery_id"],
        )

        # Verify only DELETE on client_gallery_links was executed
        execute_calls = conn.execute.call_args_list
        for call in execute_calls:
            sql = str(call[0][0])
            if "DELETE" in sql:
                assert "client_gallery_links" in sql
                assert "galleries" not in sql
