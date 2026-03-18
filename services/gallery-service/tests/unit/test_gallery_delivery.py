"""Tests for gallery delivery email trigger logic and SlideshowConfig music fields."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4


# ---------------------------------------------------------------------------
# SlideshowConfig schema tests
# ---------------------------------------------------------------------------


class TestSlideshowConfigMusicFields:
    """Test SlideshowConfig accepts and validates music fields."""

    def test_music_fields_accepted(self):
        """SlideshowConfig accepts music_enabled, music_url, music_volume, music_autoplay, music_loop."""
        from src.schemas.common import SlideshowConfig

        config = SlideshowConfig(
            music_enabled=True,
            music_url="https://example.com/track.mp3",
            music_volume=0.5,
            music_autoplay=True,
            music_loop=False,
        )
        assert config.music_enabled is True
        assert config.music_url == "https://example.com/track.mp3"
        assert config.music_volume == 0.5
        assert config.music_autoplay is True
        assert config.music_loop is False

    def test_music_volume_validates_range(self):
        """music_volume rejects values outside 0.0-1.0."""
        from src.schemas.common import SlideshowConfig
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            SlideshowConfig(music_volume=1.5)

        with pytest.raises(ValidationError):
            SlideshowConfig(music_volume=-0.1)

    def test_music_defaults(self):
        """Defaults: music_enabled=False, music_volume=0.7, music_autoplay=False, music_loop=True."""
        from src.schemas.common import SlideshowConfig

        config = SlideshowConfig()
        assert config.music_enabled is False
        assert config.music_volume == 0.7
        assert config.music_autoplay is False
        assert config.music_loop is True
        assert config.music_url is None


# ---------------------------------------------------------------------------
# Delivery email trigger tests
# ---------------------------------------------------------------------------


class TestSendDeliveryEmailIfClient:
    """Test _send_delivery_email_if_client logic."""

    @pytest.fixture
    def workspace_id(self):
        return uuid4()

    @pytest.fixture
    def gallery_id(self):
        return uuid4()

    @pytest.fixture
    def user_id(self):
        return uuid4()

    @pytest.fixture
    def client_id(self):
        return uuid4()

    @pytest.mark.asyncio
    async def test_sends_email_when_client_has_primary_email(
        self, workspace_id, gallery_id, user_id, client_id
    ):
        """_send_delivery_email_if_client sends email when gallery has client_id with primary email."""
        from src.services.gallery_service import GalleryService

        svc = GalleryService.__new__(GalleryService)

        # Mock DB pool
        mock_conn = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
        svc.pool = mock_pool

        # Gallery row: has client_id, no delivery_email_sent_at
        mock_conn.fetchrow = AsyncMock(side_effect=[
            # First call: gallery info
            {
                "title": "Wedding Photos",
                "client_id": client_id,
                "cover_asset_id": None,
                "delivery_email_sent_at": None,
                "photographer_name": "John Doe",
                "created_by_user_id": user_id,
            },
            # Second call: client email
            {"email": "client@example.com"},
        ])
        mock_conn.execute = AsyncMock()

        # Mock magic link service
        mock_magic_link_svc = AsyncMock()
        mock_magic_link_svc.create_magic_link = AsyncMock(return_value={
            "link_id": str(uuid4()),
            "gallery_id": str(gallery_id),
            "token": "abc123",
            "url": "/g/abc123",
        })
        svc.magic_link_service = mock_magic_link_svc

        # Mock postal client
        mock_postal = AsyncMock()
        mock_postal.send_gallery_delivery = AsyncMock()

        with patch("src.services.gallery_service.get_postal_client", return_value=mock_postal):
            await svc._send_delivery_email_if_client(workspace_id, gallery_id)

        # Verify email was sent
        mock_postal.send_gallery_delivery.assert_called_once()
        call_kwargs = mock_postal.send_gallery_delivery.call_args
        assert call_kwargs[1]["to_email"] == "client@example.com" or call_kwargs[0][0] == "client@example.com"

        # Verify magic link was created with correct workspace_id and gallery_id
        mock_magic_link_svc.create_magic_link.assert_called_once()
        ml_kwargs = mock_magic_link_svc.create_magic_link.call_args
        assert str(workspace_id) in str(ml_kwargs) and str(gallery_id) in str(ml_kwargs)

    @pytest.mark.asyncio
    async def test_skips_when_no_client_id(self, workspace_id, gallery_id):
        """_send_delivery_email_if_client skips silently when gallery has no client_id."""
        from src.services.gallery_service import GalleryService

        svc = GalleryService.__new__(GalleryService)

        mock_conn = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
        svc.pool = mock_pool

        # Gallery row: no client_id
        mock_conn.fetchrow = AsyncMock(return_value={
            "title": "Wedding Photos",
            "client_id": None,
            "cover_asset_id": None,
            "delivery_email_sent_at": None,
            "photographer_name": "John Doe",
            "created_by_user_id": str(uuid4()),
        })

        with patch("src.services.gallery_service.get_postal_client") as mock_get_postal:
            await svc._send_delivery_email_if_client(workspace_id, gallery_id)
            # Postal client should never be used
            mock_get_postal.return_value.send_gallery_delivery.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_when_no_email_contact(
        self, workspace_id, gallery_id, client_id
    ):
        """_send_delivery_email_if_client skips silently when client has no email contact."""
        from src.services.gallery_service import GalleryService

        svc = GalleryService.__new__(GalleryService)

        mock_conn = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
        svc.pool = mock_pool

        mock_conn.fetchrow = AsyncMock(side_effect=[
            # Gallery info with client_id
            {
                "title": "Wedding Photos",
                "client_id": client_id,
                "cover_asset_id": None,
                "delivery_email_sent_at": None,
                "photographer_name": "John Doe",
                "created_by_user_id": str(uuid4()),
            },
            # No email found
            None,
        ])

        with patch("src.services.gallery_service.get_postal_client") as mock_get_postal:
            await svc._send_delivery_email_if_client(workspace_id, gallery_id)
            mock_get_postal.return_value.send_gallery_delivery.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_if_delivery_email_already_sent(
        self, workspace_id, gallery_id, client_id
    ):
        """_send_delivery_email_if_client skips if delivery_email_sent_at is already set."""
        from src.services.gallery_service import GalleryService
        from datetime import datetime, timezone

        svc = GalleryService.__new__(GalleryService)

        mock_conn = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
        svc.pool = mock_pool

        # Gallery row: delivery_email_sent_at already set
        mock_conn.fetchrow = AsyncMock(return_value={
            "title": "Wedding Photos",
            "client_id": client_id,
            "cover_asset_id": None,
            "delivery_email_sent_at": datetime.now(timezone.utc),
            "photographer_name": "John Doe",
            "created_by_user_id": str(uuid4()),
        })

        with patch("src.services.gallery_service.get_postal_client") as mock_get_postal:
            await svc._send_delivery_email_if_client(workspace_id, gallery_id)
            mock_get_postal.return_value.send_gallery_delivery.assert_not_called()

    @pytest.mark.asyncio
    async def test_creates_magic_link_with_correct_ids(
        self, workspace_id, gallery_id, user_id, client_id
    ):
        """_send_delivery_email_if_client creates magic link with correct workspace_id and gallery_id."""
        from src.services.gallery_service import GalleryService

        svc = GalleryService.__new__(GalleryService)

        mock_conn = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
        svc.pool = mock_pool

        mock_conn.fetchrow = AsyncMock(side_effect=[
            {
                "title": "Wedding Photos",
                "client_id": client_id,
                "cover_asset_id": None,
                "delivery_email_sent_at": None,
                "photographer_name": "John Doe",
                "created_by_user_id": user_id,
            },
            {"email": "client@example.com"},
        ])
        mock_conn.execute = AsyncMock()

        mock_magic_link_svc = AsyncMock()
        mock_magic_link_svc.create_magic_link = AsyncMock(return_value={
            "link_id": str(uuid4()),
            "gallery_id": str(gallery_id),
            "token": "xyz789",
            "url": "/g/xyz789",
        })
        svc.magic_link_service = mock_magic_link_svc

        mock_postal = AsyncMock()
        mock_postal.send_gallery_delivery = AsyncMock()

        with patch("src.services.gallery_service.get_postal_client", return_value=mock_postal):
            await svc._send_delivery_email_if_client(workspace_id, gallery_id)

        # Verify magic link created with correct IDs
        mock_magic_link_svc.create_magic_link.assert_called_once_with(
            workspace_id=str(workspace_id),
            gallery_id=str(gallery_id),
            created_by_user_id=str(user_id),
            label="Gallery delivery email",
        )
