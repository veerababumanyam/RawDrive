"""Tests for favorites service.

Feature: 012-client-favorites
Tests US1 (Heart Toggle) and US2 (Favorites Panel) functionality.
"""

import pytest
from uuid import uuid4, UUID
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta

from app.services.favorites_service import FavoritesService


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_db_pool():
    """Mock database pool."""
    pool = AsyncMock()
    conn = AsyncMock()

    class MockAcquire:
        def __init__(self, conn):
            self.conn = conn
        async def __aenter__(self):
            return self.conn
        async def __aexit__(self, *args):
            return None

    def acquire_side_effect():
        return MockAcquire(conn)

    pool.acquire = MagicMock(side_effect=acquire_side_effect)

    return pool, conn


@pytest.fixture
def mock_repository():
    """Mock favorites repository."""
    repo = AsyncMock()
    return repo


@pytest.fixture
def service(mock_repository):
    """Create service with mocked repository."""
    svc = FavoritesService()
    svc.repository = mock_repository
    return svc


# Helper functions
def create_mock_gallery(gallery_id: UUID, workspace_id: UUID) -> dict:
    """Create a mock gallery dict."""
    return {
        'gallery_id': gallery_id,
        'workspace_id': workspace_id,
        'status': 'published',
        'title': 'Test Gallery',
    }


def create_mock_asset(asset_id: UUID, gallery_id: UUID) -> dict:
    """Create a mock asset dict."""
    return {
        'asset_id': asset_id,
        'gallery_id': gallery_id,
        'status': 'available',
        'filename': 'test.jpg',
    }


def create_mock_list(list_id: UUID, client_token: str, is_default: bool = False) -> dict:
    """Create a mock favorites list dict."""
    return {
        'list_id': list_id,
        'client_token': client_token,
        'name': 'My Favorites' if is_default else 'Custom List',
        'is_default': is_default,
        'sort_order': 0,
        'created_at': datetime.now(timezone.utc),
        'updated_at': datetime.now(timezone.utc),
    }


# ============================================================================
# US1: Heart Toggle Tests
# ============================================================================

class TestToggleFavorite:
    """Tests for toggle_favorite (US1 - Heart Toggle)."""

    @pytest.mark.asyncio
    async def test_add_favorite_creates_default_list_if_missing(self, service, mock_repository):
        """When adding a favorite, create default list if client has none."""
        gallery_id = uuid4()
        asset_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        list_id = uuid4()

        # Mock gallery lookup
        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)

        # Mock asset lookup
        mock_repository.get_asset_in_gallery.return_value = create_mock_asset(asset_id, gallery_id)

        # No existing list
        mock_repository.get_default_list.return_value = None

        # Mock list creation
        mock_repository.create_list.return_value = create_mock_list(list_id, client_token, is_default=True)

        # Mock add favorite
        mock_repository.add_favorite.return_value = {
            'interaction_id': uuid4(),
            'asset_id': asset_id,
            'list_id': list_id,
        }

        # Mock get count
        mock_repository.get_favorites_count_for_asset.return_value = 1

        result = await service.toggle_favorite(
            gallery_id=gallery_id,
            asset_id=asset_id,
            client_token=client_token,
            favorited=True,
        )

        # Should create default list
        mock_repository.create_list.assert_called_once()
        call_args = mock_repository.create_list.call_args
        assert call_args.kwargs.get('is_default') == True

        # Should add to favorites
        mock_repository.add_favorite.assert_called_once()

        assert result['is_favorited'] == True
        assert result['favorites_count'] == 1

    @pytest.mark.asyncio
    async def test_add_favorite_uses_existing_default_list(self, service, mock_repository):
        """When adding a favorite, use existing default list."""
        gallery_id = uuid4()
        asset_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        list_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.get_asset_in_gallery.return_value = create_mock_asset(asset_id, gallery_id)
        mock_repository.get_default_list.return_value = create_mock_list(list_id, client_token, is_default=True)
        mock_repository.add_favorite.return_value = {
            'interaction_id': uuid4(),
            'asset_id': asset_id,
            'list_id': list_id,
        }
        mock_repository.get_favorites_count_for_asset.return_value = 1

        result = await service.toggle_favorite(
            gallery_id=gallery_id,
            asset_id=asset_id,
            client_token=client_token,
            favorited=True,
        )

        # Should NOT create a new list
        mock_repository.create_list.assert_not_called()

        # Should add favorite to existing list
        mock_repository.add_favorite.assert_called_once()
        assert result['is_favorited'] == True

    @pytest.mark.asyncio
    async def test_add_favorite_to_specific_list(self, service, mock_repository):
        """Adding favorite to a specific list should use that list."""
        gallery_id = uuid4()
        asset_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        custom_list_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.get_asset_in_gallery.return_value = create_mock_asset(asset_id, gallery_id)
        mock_repository.get_list_by_id.return_value = create_mock_list(custom_list_id, client_token, is_default=False)
        mock_repository.add_favorite.return_value = {
            'interaction_id': uuid4(),
            'asset_id': asset_id,
            'list_id': custom_list_id,
        }
        mock_repository.get_favorites_count_for_asset.return_value = 1

        result = await service.toggle_favorite(
            gallery_id=gallery_id,
            asset_id=asset_id,
            client_token=client_token,
            favorited=True,
            list_id=custom_list_id,
        )

        # Should use specified list
        mock_repository.add_favorite.assert_called_once()
        call_args = mock_repository.add_favorite.call_args
        assert call_args.kwargs.get('list_id') == custom_list_id

    @pytest.mark.asyncio
    async def test_remove_favorite_deletes_from_list(self, service, mock_repository):
        """Removing a favorite should delete the interaction."""
        gallery_id = uuid4()
        asset_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.remove_favorite.return_value = True
        mock_repository.get_favorites_count_for_asset.return_value = 0

        result = await service.toggle_favorite(
            gallery_id=gallery_id,
            asset_id=asset_id,
            client_token=client_token,
            favorited=False,
        )

        mock_repository.remove_favorite.assert_called_once()
        assert result['is_favorited'] == False
        assert result['favorites_count'] == 0

    @pytest.mark.asyncio
    async def test_toggle_rejects_unpublished_gallery(self, service, mock_repository):
        """Should reject favorites on unpublished galleries."""
        gallery_id = uuid4()
        asset_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())

        # Gallery is draft, not published
        gallery = create_mock_gallery(gallery_id, workspace_id)
        gallery['status'] = 'draft'
        mock_repository.get_gallery.return_value = gallery

        with pytest.raises(ValueError, match="not accessible"):
            await service.toggle_favorite(
                gallery_id=gallery_id,
                asset_id=asset_id,
                client_token=client_token,
                favorited=True,
            )


# ============================================================================
# US2: Favorites Panel Tests
# ============================================================================

class TestListFavorites:
    """Tests for list_favorites (US2 - Favorites Panel)."""

    @pytest.mark.asyncio
    async def test_list_favorites_returns_paginated_results(self, service, mock_repository):
        """Should return paginated favorites with metadata."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)

        # Mock 3 favorites
        mock_favorites = [
            {
                'interaction_id': uuid4(),
                'asset_id': uuid4(),
                'list_id': uuid4(),
                'thumbnail_url': 'https://example.com/thumb1.jpg',
                'filename': 'photo1.jpg',
                'width': 1920,
                'height': 1080,
                'favorited_at': datetime.now(timezone.utc),
            }
            for _ in range(3)
        ]

        mock_repository.list_favorites.return_value = {
            'data': mock_favorites,
            'total': 3,
        }

        result = await service.list_favorites(
            gallery_id=gallery_id,
            client_token=client_token,
            page=1,
            limit=50,
        )

        assert len(result['data']) == 3
        assert result['meta']['total'] == 3
        assert result['meta']['page'] == 1
        assert result['meta']['limit'] == 50

    @pytest.mark.asyncio
    async def test_list_favorites_filters_by_list_id(self, service, mock_repository):
        """Should filter favorites by list_id when provided."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        list_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.list_favorites.return_value = {
            'data': [],
            'total': 0,
        }

        await service.list_favorites(
            gallery_id=gallery_id,
            client_token=client_token,
            list_id=list_id,
        )

        # Verify list_id was passed to repository
        call_args = mock_repository.list_favorites.call_args
        assert call_args.kwargs.get('list_id') == list_id


class TestGetFavoriteLists:
    """Tests for get_favorite_lists (US3 - Multiple Lists)."""

    @pytest.mark.asyncio
    async def test_get_lists_returns_all_client_lists(self, service, mock_repository):
        """Should return all lists for a client."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)

        mock_lists = [
            {
                'list_id': uuid4(),
                'name': 'My Favorites',
                'is_default': True,
                'photo_count': 5,
            },
            {
                'list_id': uuid4(),
                'name': 'Best Shots',
                'is_default': False,
                'photo_count': 3,
            },
        ]

        mock_repository.get_lists.return_value = {
            'lists': mock_lists,
            'total_favorites': 8,
        }

        result = await service.get_favorite_lists(
            gallery_id=gallery_id,
            client_token=client_token,
        )

        assert len(result['lists']) == 2
        assert result['total_favorites'] == 8


class TestCreateList:
    """Tests for create_list (US3 - Multiple Lists)."""

    @pytest.mark.asyncio
    async def test_create_list_enforces_limit(self, service, mock_repository):
        """Should reject list creation when client has 10 lists."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.count_client_lists.return_value = 10  # At limit

        with pytest.raises(ValueError, match="maximum.*10"):
            await service.create_list(
                gallery_id=gallery_id,
                client_token=client_token,
                name="New List",
            )

    @pytest.mark.asyncio
    async def test_create_list_under_limit_succeeds(self, service, mock_repository):
        """Should create list when under limit."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        list_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.count_client_lists.return_value = 5  # Under limit
        mock_repository.create_list.return_value = {
            'list_id': list_id,
            'name': 'New List',
            'is_default': False,
        }

        result = await service.create_list(
            gallery_id=gallery_id,
            client_token=client_token,
            name="New List",
        )

        assert result['list_id'] == list_id
        mock_repository.create_list.assert_called_once()


# ============================================================================
# Sharing Tests (US6)
# ============================================================================

class TestShareLink:
    """Tests for share link functionality."""

    @pytest.mark.asyncio
    async def test_create_share_link_generates_token(self, service, mock_repository):
        """Should generate unique share token."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        list_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.get_list_by_id.return_value = create_mock_list(list_id, client_token)
        mock_repository.create_share_link.return_value = {
            'share_id': uuid4(),
            'share_token': 'test-token-123',
            'expires_at': datetime.now(timezone.utc) + timedelta(days=30),
        }

        result = await service.create_share_link(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
        )

        assert 'share_token' in result or 'share_url' in result
        mock_repository.create_share_link.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_share_link_uses_custom_expiration(self, service, mock_repository):
        """Should use custom expiration when provided."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        list_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.get_list_by_id.return_value = create_mock_list(list_id, client_token)
        mock_repository.create_share_link.return_value = {
            'share_id': uuid4(),
            'share_token': 'test-token-123',
            'expires_at': datetime.now(timezone.utc) + timedelta(days=7),
        }

        await service.create_share_link(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
            expires_in_days=7,
        )

        # Verify expiration was calculated for 7 days
        call_args = mock_repository.create_share_link.call_args
        expires_at = call_args.kwargs.get('expires_at')
        # Should be approximately 7 days from now
        expected_min = datetime.now(timezone.utc) + timedelta(days=6)
        expected_max = datetime.now(timezone.utc) + timedelta(days=8)
        assert expected_min <= expires_at <= expected_max


# ============================================================================
# Download Tests (US4)
# ============================================================================

class TestDownload:
    """Tests for download functionality."""

    @pytest.mark.asyncio
    async def test_request_download_enforces_rate_limit(self, service, mock_repository):
        """Should reject downloads when rate limit exceeded."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        list_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.get_list_by_id.return_value = create_mock_list(list_id, client_token)
        mock_repository.get_client_download_count.return_value = 10  # At limit

        with pytest.raises(ValueError, match="rate limit"):
            await service.request_download(
                gallery_id=gallery_id,
                list_id=list_id,
                client_token=client_token,
            )

    @pytest.mark.asyncio
    async def test_request_download_under_limit_succeeds(self, service, mock_repository):
        """Should create download job when under rate limit."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        list_id = uuid4()
        download_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.get_list_by_id.return_value = create_mock_list(list_id, client_token)
        mock_repository.get_client_download_count.return_value = 5  # Under limit
        mock_repository.create_download_job.return_value = {
            'download_id': download_id,
            'status': 'pending',
        }

        result = await service.request_download(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
        )

        assert result['download_id'] == download_id
        mock_repository.create_download_job.assert_called_once()


# ============================================================================
# Security Tests
# ============================================================================

class TestSecurity:
    """Security-related tests."""

    @pytest.mark.asyncio
    async def test_client_isolation_different_tokens(self, service, mock_repository):
        """Different client tokens should have isolated favorites."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token_1 = str(uuid4())
        client_token_2 = str(uuid4())

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.list_favorites.return_value = {'data': [], 'total': 0}

        # Call for first client
        await service.list_favorites(
            gallery_id=gallery_id,
            client_token=client_token_1,
        )

        # Call for second client
        await service.list_favorites(
            gallery_id=gallery_id,
            client_token=client_token_2,
        )

        # Verify different client tokens were used
        calls = mock_repository.list_favorites.call_args_list
        assert len(calls) == 2
        assert calls[0].kwargs.get('client_token') == client_token_1
        assert calls[1].kwargs.get('client_token') == client_token_2

    @pytest.mark.asyncio
    async def test_cannot_access_other_client_list(self, service, mock_repository):
        """Client should not access another client's list."""
        gallery_id = uuid4()
        workspace_id = uuid4()
        client_token = str(uuid4())
        other_client_list_id = uuid4()

        mock_repository.get_gallery.return_value = create_mock_gallery(gallery_id, workspace_id)
        mock_repository.get_list_by_id.return_value = None  # List not found for this client

        with pytest.raises(ValueError, match="not found"):
            await service.update_list(
                gallery_id=gallery_id,
                list_id=other_client_list_id,
                client_token=client_token,
                name="Hacked List",
            )
