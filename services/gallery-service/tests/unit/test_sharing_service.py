"""
Tests for the Gallery Sharing Service.

Tests OG metadata generation, crawler detection, and embed code generation.
"""

import pytest
from src.services.sharing_service import SharingService


class TestSharingService:
    """Test suite for SharingService."""

    def setup_method(self):
        self.service = SharingService()

    # =========================================================================
    # OG Metadata Generation
    # =========================================================================

    def test_build_og_metadata_with_cover_image(self):
        """OG metadata includes cover image when available."""
        gallery = {
            "title": "Wedding Day",
            "description": "A beautiful ceremony",
            "cover_image_url": "https://cdn.rawdrive.io/cover.jpg",
            "photo_count": 150,
        }
        result = self.service.build_og_metadata(
            gallery=gallery,
            photographer_name="Jane Smith",
            base_url="https://rawdrive.io/g/abc123",
        )
        assert result["title"] == "Wedding Day by Jane Smith"
        assert result["description"] == "A beautiful ceremony"
        assert result["og_image"] == "https://cdn.rawdrive.io/cover.jpg"
        assert result["canonical_url"] == "https://rawdrive.io/g/abc123"

    def test_build_og_metadata_without_cover_image(self):
        """OG metadata falls back to first asset when no cover image."""
        gallery = {
            "title": "Portrait Session",
            "description": None,
            "cover_image_url": None,
            "photo_count": 42,
            "first_asset_url": "https://cdn.rawdrive.io/first.jpg",
        }
        result = self.service.build_og_metadata(
            gallery=gallery,
            photographer_name="John Doe",
            base_url="https://rawdrive.io/g/xyz789",
        )
        assert result["title"] == "Portrait Session by John Doe"
        assert result["description"] == "42 photos"
        assert result["og_image"] == "https://cdn.rawdrive.io/first.jpg"

    def test_build_og_metadata_no_images(self):
        """OG metadata handles missing images gracefully."""
        gallery = {
            "title": "Empty Gallery",
            "description": None,
            "cover_image_url": None,
            "photo_count": 0,
        }
        result = self.service.build_og_metadata(
            gallery=gallery,
            photographer_name="Photographer",
            base_url="https://rawdrive.io/g/empty",
        )
        assert result["title"] == "Empty Gallery by Photographer"
        assert result["description"] == "0 photos"
        assert result["og_image"] == ""

    # =========================================================================
    # Crawler Detection
    # =========================================================================

    @pytest.mark.parametrize(
        "user_agent",
        [
            "facebookexternalhit/1.1",
            "Twitterbot/1.0",
            "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
            "iMessageBot/1.0",
            "WhatsApp/2.21.4.22 A",
            "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
            "Discordbot/2.0",
        ],
    )
    def test_is_crawler_known_bots(self, user_agent):
        """Known social media crawlers are detected."""
        assert self.service.is_crawler(user_agent) is True

    def test_is_crawler_normal_browser(self):
        """Normal browser user agents are not detected as crawlers."""
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        assert self.service.is_crawler(ua) is False

    def test_is_crawler_empty_string(self):
        """Empty user agent is not a crawler."""
        assert self.service.is_crawler("") is False

    def test_is_crawler_none(self):
        """None user agent is not a crawler."""
        assert self.service.is_crawler(None) is False

    # =========================================================================
    # Embed Code Generation
    # =========================================================================

    def test_generate_embed_code_defaults(self):
        """Embed code uses default dimensions."""
        code = self.service.generate_embed_code("https://rawdrive.io/g/abc123")
        assert 'src="https://rawdrive.io/g/abc123/embed"' in code
        assert 'width="800"' in code
        assert 'height="600"' in code
        assert "frameborder" in code
        assert "allowfullscreen" in code
        assert "<iframe" in code

    def test_generate_embed_code_custom_dimensions(self):
        """Embed code respects custom width and height."""
        code = self.service.generate_embed_code(
            "https://rawdrive.io/g/xyz",
            width=1024,
            height=768,
        )
        assert 'width="1024"' in code
        assert 'height="768"' in code

    def test_generate_embed_code_escapes_url(self):
        """Embed code properly handles URL characters."""
        code = self.service.generate_embed_code("https://rawdrive.io/g/abc&test")
        assert "<iframe" in code
        # URL should be in the src attribute
        assert "abc&amp;test" in code or "abc&test" in code

    # =========================================================================
    # JSON-LD Generation
    # =========================================================================

    def test_build_json_ld(self):
        """JSON-LD structured data includes ImageGallery type."""
        gallery = {
            "title": "Wedding Day",
            "description": "A beautiful ceremony",
            "cover_image_url": "https://cdn.rawdrive.io/cover.jpg",
            "photo_count": 150,
        }
        json_ld = self.service.build_json_ld(
            gallery=gallery,
            photographer_name="Jane Smith",
            base_url="https://rawdrive.io/g/abc123",
        )
        assert json_ld["@type"] == "ImageGallery"
        assert json_ld["author"]["name"] == "Jane Smith"
        assert json_ld["name"] == "Wedding Day"
