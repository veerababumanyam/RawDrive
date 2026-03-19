"""Tests for OG Image Service.

Validates that OGImageService generates valid 1200x630 PNG images
with gradient backgrounds, circular avatar compositing, and centered text.
"""

import io
import pytest
from PIL import Image


class TestOGImageService:
    """Tests for OGImageService.generate_og_image."""

    def _get_service(self):
        from app.services.og_image_service import OGImageService
        return OGImageService()

    def _make_avatar_bytes(self, size: int = 200) -> bytes:
        """Create a simple test avatar image."""
        img = Image.new("RGBA", (size, size), (255, 0, 0, 255))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def test_generate_og_image_returns_png_bytes(self):
        """OG image bytes start with PNG magic bytes."""
        svc = self._get_service()
        result = svc.generate_og_image(name="Test User")
        assert isinstance(result, bytes)
        assert result[:4] == b"\x89PNG", "Result should be a valid PNG"

    def test_generate_og_image_dimensions(self):
        """OG image dimensions are exactly 1200x630."""
        svc = self._get_service()
        result = svc.generate_og_image(name="Test User", title="Photographer")
        img = Image.open(io.BytesIO(result))
        assert img.size == (1200, 630)

    def test_generate_og_image_with_avatar(self):
        """OG image with avatar_bytes produces valid PNG without error."""
        svc = self._get_service()
        avatar = self._make_avatar_bytes()
        result = svc.generate_og_image(
            name="Jane Doe",
            title="Wedding Photographer",
            avatar_bytes=avatar,
            accent_color="#E91E63",
            primary_color="#1A1A2E",
        )
        img = Image.open(io.BytesIO(result))
        assert img.size == (1200, 630)

    def test_generate_og_image_none_avatar(self):
        """OG image with avatar_bytes=None does not raise."""
        svc = self._get_service()
        result = svc.generate_og_image(name="No Avatar", avatar_bytes=None)
        assert result[:4] == b"\x89PNG"

    def test_generate_og_image_empty_name(self):
        """OG image with empty name still produces valid image."""
        svc = self._get_service()
        result = svc.generate_og_image(name="", title="")
        img = Image.open(io.BytesIO(result))
        assert img.size == (1200, 630)

    def test_generate_og_image_gradient_uses_colors(self):
        """OG image uses the provided accent/primary colors for gradient."""
        svc = self._get_service()
        # Generate with specific colors
        result = svc.generate_og_image(
            name="Color Test",
            accent_color="#FF0000",
            primary_color="#0000FF",
        )
        img = Image.open(io.BytesIO(result))
        # Top-left pixel should be close to primary_color (blue)
        r, g, b = img.getpixel((0, 0))[:3]
        # Primary is #0000FF -> R~0, B~255
        assert b > r, "Top of gradient should lean toward primary_color (blue)"

    def test_hex_to_rgb_valid(self):
        """_hex_to_rgb correctly converts hex strings."""
        svc = self._get_service()
        assert svc._hex_to_rgb("#FF0000") == (255, 0, 0)
        assert svc._hex_to_rgb("#00FF00") == (0, 255, 0)
        assert svc._hex_to_rgb("1A1A1A") == (26, 26, 26)

    def test_hex_to_rgb_invalid_falls_back(self):
        """_hex_to_rgb returns fallback for invalid hex."""
        svc = self._get_service()
        assert svc._hex_to_rgb("bad") == (26, 26, 26)
        assert svc._hex_to_rgb("") == (26, 26, 26)
