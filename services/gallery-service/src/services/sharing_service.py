"""
Gallery Sharing Service.

Handles OG metadata generation, crawler detection, and embed code generation
for social media sharing and website embedding of public galleries.
"""

from __future__ import annotations

import json
import re
from html import escape as html_escape
from typing import Any, Optional

from src.log_config import get_logger

logger = get_logger(__name__)

# Known social media crawler user-agent patterns
_CRAWLER_PATTERNS = re.compile(
    r"facebookexternalhit|Twitterbot|LinkedInBot|iMessageBot|WhatsApp|Slackbot|Discordbot",
    re.IGNORECASE,
)


class SharingService:
    """Service for gallery sharing features: OG tags, embeds, QR metadata."""

    def build_og_metadata(
        self,
        gallery: dict[str, Any],
        photographer_name: str,
        base_url: str,
    ) -> dict[str, str]:
        """Build Open Graph metadata dict from gallery data.

        Args:
            gallery: Gallery data dict with title, description, cover_image_url, photo_count.
            photographer_name: Display name of the photographer.
            base_url: Canonical URL for the gallery page.

        Returns:
            Dict with title, description, og_image, canonical_url keys.
        """
        title = f"{gallery['title']} by {photographer_name}"

        description = gallery.get("description") or f"{gallery.get('photo_count', 0)} photos"

        og_image = (
            gallery.get("cover_image_url")
            or gallery.get("first_asset_url")
            or ""
        )

        return {
            "title": title,
            "description": description,
            "og_image": og_image,
            "canonical_url": base_url,
        }

    def build_json_ld(
        self,
        gallery: dict[str, Any],
        photographer_name: str,
        base_url: str,
    ) -> dict[str, Any]:
        """Build JSON-LD structured data for the gallery.

        Returns:
            Dict suitable for serialization into a <script type="application/ld+json"> tag.
        """
        og = self.build_og_metadata(gallery, photographer_name, base_url)

        json_ld: dict[str, Any] = {
            "@context": "https://schema.org",
            "@type": "ImageGallery",
            "name": gallery["title"],
            "description": og["description"],
            "url": base_url,
            "author": {
                "@type": "Person",
                "name": photographer_name,
            },
        }

        if og["og_image"]:
            json_ld["image"] = og["og_image"]

        photo_count = gallery.get("photo_count")
        if photo_count:
            json_ld["numberOfItems"] = photo_count

        return json_ld

    def is_crawler(self, user_agent: Optional[str]) -> bool:
        """Check if the user agent string matches a known social media crawler.

        Args:
            user_agent: The User-Agent header value.

        Returns:
            True if the UA matches a known crawler pattern.
        """
        if not user_agent:
            return False
        return bool(_CRAWLER_PATTERNS.search(user_agent))

    def generate_embed_code(
        self,
        gallery_url: str,
        width: int = 800,
        height: int = 600,
    ) -> str:
        """Generate an iframe embed code for a gallery.

        Args:
            gallery_url: The public gallery URL.
            width: Iframe width in pixels (default 800).
            height: Iframe height in pixels (default 600).

        Returns:
            HTML iframe string ready for embedding.
        """
        embed_url = html_escape(f"{gallery_url}/embed")
        return (
            f'<iframe src="{embed_url}" '
            f'width="{width}" height="{height}" '
            f'frameborder="0" allowfullscreen '
            f'style="border:none;border-radius:8px;">'
            f"</iframe>"
        )


def get_sharing_service() -> SharingService:
    """Factory function for SharingService."""
    return SharingService()
