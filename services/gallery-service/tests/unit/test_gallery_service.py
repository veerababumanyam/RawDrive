"""
Unit tests for Gallery Service.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import UUID

from src.services.gallery_service import (
    GalleryService,
    GalleryNotFoundError,
    row_to_gallery_dict,
)


class TestRowToGalleryDict:
    """Tests for row_to_gallery_dict helper function."""

    def test_converts_basic_row(self):
        """Test basic row conversion."""
        row = {
            "gallery_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
            "workspace_id": UUID("550e8400-e29b-41d4-a716-446655440001"),
            "title": "Test Gallery",
            "description": "Test description",
            "client_name": "Test Client",
            "client_id": None,
            "shoot_date": None,
            "status": "published",
            "branding_profile_id": None,
            "portal_language": "en",
            "layout_style": "masonry",
            "theme": "light",
            "download_policy": "original",
            "exif_visible": True,
            "password_protected": False,
            "pin_protected": False,
            "email_registration_required": False,
            "expires_at": None,
            "published_at": None,
            "cover_asset_id": None,
            "primary_color": None,
            "gradient_config": None,
            "font_family": None,
            "custom_domain": None,
            "custom_links": [],
            "created_by_user_id": UUID("550e8400-e29b-41d4-a716-446655440002"),
            "created_at": MagicMock(isoformat=lambda: "2024-01-01T00:00:00"),
            "pinned_at": None,
            "last_accessed_at": None,
        }

        result = row_to_gallery_dict(row, [], None)

        assert result["gallery_id"] == "550e8400-e29b-41d4-a716-446655440000"
        assert result["title"] == "Test Gallery"
        assert result["status"] == "published"
        assert result["is_pinned"] is False

    def test_converts_row_with_sub_galleries(self):
        """Test row conversion with sub-galleries."""
        row = {
            "gallery_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
            "workspace_id": UUID("550e8400-e29b-41d4-a716-446655440001"),
            "title": "Test Gallery",
            "description": None,
            "client_name": None,
            "client_id": None,
            "shoot_date": None,
            "status": "draft",
            "branding_profile_id": None,
            "portal_language": None,
            "layout_style": None,
            "theme": None,
            "download_policy": None,
            "exif_visible": None,
            "password_protected": False,
            "pin_protected": False,
            "email_registration_required": False,
            "expires_at": None,
            "published_at": None,
            "cover_asset_id": None,
            "primary_color": "#FF5733",
            "gradient_config": None,
            "font_family": None,
            "custom_domain": None,
            "custom_links": None,
            "created_by_user_id": UUID("550e8400-e29b-41d4-a716-446655440002"),
            "created_at": MagicMock(isoformat=lambda: "2024-01-01T00:00:00"),
            "pinned_at": None,
            "last_accessed_at": None,
        }

        sub_galleries = [
            {
                "sub_gallery_id": UUID("550e8400-e29b-41d4-a716-446655440010"),
                "name": "Ceremony",
                "sort_order": 1,
                "visible": True,
                "photo_count": 50,
                "cover_asset_id": None,
            }
        ]

        result = row_to_gallery_dict(row, sub_galleries, None)

        assert len(result["sub_galleries"]) == 1
        assert result["sub_galleries"][0]["name"] == "Ceremony"
        # Should have gradient config from primary_color fallback
        assert result["gradient_config"] is not None


class TestGalleryService:
    """Tests for GalleryService class."""

    @pytest.fixture
    def gallery_service(self):
        """Create gallery service instance."""
        return GalleryService()

    @pytest.mark.asyncio
    async def test_get_gallery_not_found(self, gallery_service):
        """Test get_gallery raises error when gallery not found."""
        with patch("src.services.gallery_service.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__.return_value = mock_ctx
            mock_ctx.__aexit__.return_value = None
            mock_ctx.fetchrow.return_value = None
            mock_conn.return_value = mock_ctx

            with pytest.raises(GalleryNotFoundError):
                await gallery_service.get_gallery(
                    workspace_id="550e8400-e29b-41d4-a716-446655440000",
                    gallery_id="660e8400-e29b-41d4-a716-446655440000",
                )

    @pytest.mark.asyncio
    async def test_list_galleries_pagination(self, gallery_service):
        """Test list_galleries returns paginated results."""
        mock_galleries = [
            {
                "gallery_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
                "title": "Gallery 1",
                "description": None,
                "client_name": None,
                "client_id": None,
                "shoot_date": None,
                "status": "published",
                "cover_asset_id": None,
                "published_at": None,
                "created_at": MagicMock(isoformat=lambda: "2024-01-01T00:00:00"),
                "pinned_at": None,
                "last_accessed_at": None,
                "photo_count": 10,
            }
        ]

        with patch("src.services.gallery_service.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__.return_value = mock_ctx
            mock_ctx.__aexit__.return_value = None
            mock_ctx.fetchval.return_value = 1
            mock_ctx.fetch.return_value = mock_galleries
            mock_conn.return_value = mock_ctx

            result = await gallery_service.list_galleries(
                workspace_id="550e8400-e29b-41d4-a716-446655440000",
                page=1,
                limit=20,
            )

            assert "data" in result
            assert "meta" in result
            assert result["meta"]["total"] == 1
            assert result["meta"]["page"] == 1


class TestMagicLinkService:
    """Tests for MagicLinkService class."""

    @pytest.mark.asyncio
    async def test_generate_magic_token_is_unique(self):
        """Test that generated tokens are unique."""
        from src.services.magic_link_service import generate_magic_token

        tokens = set()
        for _ in range(100):
            token = generate_magic_token()
            assert token not in tokens
            tokens.add(token)

    @pytest.mark.asyncio
    async def test_hash_pin_consistency(self):
        """Test that PIN hashing is consistent."""
        from src.services.magic_link_service import hash_pin

        pin = "1234"
        hash1 = hash_pin(pin)
        hash2 = hash_pin(pin)
        assert hash1 == hash2

    @pytest.mark.asyncio
    async def test_hash_pin_different_inputs(self):
        """Test that different PINs produce different hashes."""
        from src.services.magic_link_service import hash_pin

        hash1 = hash_pin("1234")
        hash2 = hash_pin("5678")
        assert hash1 != hash2
