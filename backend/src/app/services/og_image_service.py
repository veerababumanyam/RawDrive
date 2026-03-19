"""OG Image Generation Service.

Generates Open Graph preview images (1200x630 PNG) for social media sharing.
Uses Pillow for image generation with gradient backgrounds, circular avatars,
and centered text rendering.
"""

import logging
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

FONTS_DIR = Path(__file__).parent.parent / "assets" / "fonts"


class OGImageService:
    """Service for generating Open Graph preview images."""

    WIDTH = 1200
    HEIGHT = 630

    def __init__(self):
        self._heading_font = self._load_font("Inter-Bold.ttf", 48)
        self._body_font = self._load_font("Inter-Regular.ttf", 28)
        self._brand_font = self._load_font("Inter-Regular.ttf", 22)

    def _load_font(self, filename: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
        """Load a TrueType font, falling back to Pillow default."""
        font_path = FONTS_DIR / filename
        if font_path.exists():
            return ImageFont.truetype(str(font_path), size)
        logger.warning("Font %s not found at %s, using default", filename, font_path)
        try:
            return ImageFont.load_default(size=size)
        except TypeError:
            # Older Pillow versions don't accept size parameter
            return ImageFont.load_default()

    def _draw_gradient(self, draw: ImageDraw.Draw, color1: str, color2: str) -> None:
        """Draw a vertical gradient from color1 (top) to color2 (bottom)."""
        r1, g1, b1 = self._hex_to_rgb(color1)
        r2, g2, b2 = self._hex_to_rgb(color2)
        for y in range(self.HEIGHT):
            ratio = y / self.HEIGHT
            r = int(r1 + (r2 - r1) * ratio)
            g = int(g1 + (g2 - g1) * ratio)
            b = int(b1 + (b2 - b1) * ratio)
            draw.line([(0, y), (self.WIDTH, y)], fill=(r, g, b))

    @staticmethod
    def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
        """Convert hex color string to RGB tuple. Returns fallback for invalid input."""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) != 6:
            return (26, 26, 26)  # fallback dark
        try:
            return (
                int(hex_color[0:2], 16),
                int(hex_color[2:4], 16),
                int(hex_color[4:6], 16),
            )
        except ValueError:
            return (26, 26, 26)

    def _make_circle_mask(self, size: int) -> Image.Image:
        """Create a circular alpha mask."""
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
        return mask

    def generate_og_image(
        self,
        name: str,
        title: str = "",
        avatar_bytes: Optional[bytes] = None,
        accent_color: str = "#3B82F6",
        primary_color: str = "#1A1A1A",
    ) -> bytes:
        """Generate a 1200x630 PNG Open Graph image.

        Args:
            name: Display name to render.
            title: Professional title / tagline.
            avatar_bytes: Optional avatar image bytes for circular crop.
            accent_color: Hex color for gradient bottom.
            primary_color: Hex color for gradient top.

        Returns:
            PNG image bytes.
        """
        img = Image.new("RGB", (self.WIDTH, self.HEIGHT))
        draw = ImageDraw.Draw(img)

        # Draw gradient background
        self._draw_gradient(draw, primary_color, accent_color)

        # RawDrive branding - top left
        draw.text((40, 30), "RawDrive", font=self._brand_font, fill=(255, 255, 255, 180))

        avatar_size = 160
        center_x = self.WIDTH // 2
        content_y = 180

        # Avatar (circular crop, centered)
        if avatar_bytes:
            try:
                avatar = Image.open(BytesIO(avatar_bytes)).convert("RGBA")
                avatar = avatar.resize((avatar_size, avatar_size), Image.LANCZOS)
                mask = self._make_circle_mask(avatar_size)
                avatar_x = center_x - avatar_size // 2
                img.paste(avatar, (avatar_x, content_y), mask)
                content_y += avatar_size + 30
            except Exception:
                logger.warning("Failed to composite avatar, skipping")
                content_y += 30

        # Name text (centered)
        if name:
            bbox = draw.textbbox((0, 0), name, font=self._heading_font)
            text_w = bbox[2] - bbox[0]
            draw.text(
                ((self.WIDTH - text_w) // 2, content_y),
                name,
                font=self._heading_font,
                fill="white",
            )
            content_y += 60

        # Title/tagline text (centered)
        if title:
            bbox = draw.textbbox((0, 0), title, font=self._body_font)
            text_w = bbox[2] - bbox[0]
            draw.text(
                ((self.WIDTH - text_w) // 2, content_y),
                title,
                font=self._body_font,
                fill=(255, 255, 255, 200),
            )

        buffer = BytesIO()
        img.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()


_og_service: Optional[OGImageService] = None


def get_og_image_service() -> OGImageService:
    """Get or create the OG image service singleton."""
    global _og_service
    if _og_service is None:
        _og_service = OGImageService()
    return _og_service
