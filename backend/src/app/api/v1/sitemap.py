"""Sitemap generation endpoint.

Provides dynamic sitemap.xml generation for SEO purposes.
Includes all public profiles with search engine indexing enabled.
"""

import logging
from fastapi import APIRouter, Response
from app.services.seo_service import get_seo_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["SEO"])


@router.get(
    "/sitemap.xml",
    response_class=Response,
    summary="Get dynamic sitemap",
    description="Returns an XML sitemap with all indexable profiles and static pages.",
)
async def get_sitemap():
    """
    Generate and return sitemap.xml.

    The sitemap includes:
    - Static pages (home, pricing, features)
    - Company profiles with indexing enabled
    - Personal profiles with indexing enabled

    Returns XML conforming to sitemaps.org protocol.
    """
    try:
        seo_service = get_seo_service()
        sitemap_xml = await seo_service.generate_sitemap()

        return Response(
            content=sitemap_xml,
            media_type="application/xml",
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "X-Robots-Tag": "noindex",  # Don't index the sitemap itself
            }
        )
    except Exception as e:
        logger.exception("Failed to generate sitemap")
        # Return a minimal valid sitemap on error
        fallback_xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
        return Response(
            content=fallback_xml,
            media_type="application/xml",
            status_code=500
        )
