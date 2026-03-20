"""
Public Gallery Sharing Endpoints.

Provides OG-tagged HTML shells for social media crawlers,
browser redirects for normal visitors, and embeddable gallery pages.
"""

import json
import os
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from src.services.magic_link_service import get_magic_link_service, MagicLinkNotFoundError
from src.services.sharing_service import get_sharing_service
from src.database import get_connection
from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.api.v1.errors import raise_http_exception, ErrorCode

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()

# Load Jinja2 template once at module level
_TEMPLATE_DIR = Path(__file__).resolve().parents[3] / "templates"


def _render_template(template_name: str, context: dict) -> str:
    """Render a Jinja2 template with the given context.

    Uses jinja2 if available, falls back to simple string replacement.
    """
    try:
        from jinja2 import Environment, FileSystemLoader

        env = Environment(
            loader=FileSystemLoader(str(_TEMPLATE_DIR)),
            autoescape=True,
        )
        template = env.get_template(template_name)
        return template.render(**context)
    except ImportError:
        # Fallback: read template and do basic substitution
        template_path = _TEMPLATE_DIR / template_name
        content = template_path.read_text(encoding="utf-8")
        for key, value in context.items():
            content = content.replace("{{ " + key + " }}", str(value))
        return content


async def _get_gallery_for_sharing(token: str) -> dict:
    """Validate magic link and fetch gallery data needed for sharing.

    Returns dict with gallery info + photographer name.
    Raises MagicLinkNotFoundError if token is invalid.
    """
    ml_service = get_magic_link_service()
    link_data = await ml_service.validate_magic_link(token)

    if not link_data.get("valid"):
        raise MagicLinkNotFoundError(token)

    gallery_id = link_data["gallery_id"]
    workspace_id = link_data.get("workspace_id")

    async with get_connection(read_only=True) as conn:
        gallery = await conn.fetchrow(
            """
            SELECT
                g.title,
                g.description,
                g.cover_image_url,
                g.workspace_id,
                (SELECT COUNT(*) FROM gallery_assets ga WHERE ga.gallery_id = g.gallery_id) as photo_count,
                (
                    SELECT a.thumbnail_url
                    FROM gallery_assets ga
                    JOIN assets a ON ga.asset_id = a.asset_id
                    WHERE ga.gallery_id = g.gallery_id
                    ORDER BY ga.sort_order ASC NULLS LAST
                    LIMIT 1
                ) as first_asset_url,
                u.display_name as photographer_name
            FROM galleries g
            JOIN users u ON g.created_by = u.user_id
            WHERE g.gallery_id = $1 AND g.workspace_id = $2
            """,
            gallery_id,
            workspace_id,
        )

    if not gallery:
        raise MagicLinkNotFoundError(token)

    return dict(gallery)


@router.get("/{token}/page", response_class=HTMLResponse)
async def gallery_page(token: str, request: Request):
    """Serve OG-tagged HTML shell for crawlers, redirect browsers to SPA.

    Social media crawlers (Facebook, Twitter, LinkedIn, etc.) receive an HTML page
    with Open Graph meta tags for rich link previews. Normal browsers get a 302
    redirect to the SPA gallery view.
    """
    sharing_service = get_sharing_service()
    user_agent = request.headers.get("user-agent", "")

    # Normal browsers get redirected to the SPA
    if not sharing_service.is_crawler(user_agent):
        spa_url = f"/gallery/{token}"
        return RedirectResponse(url=spa_url, status_code=302)

    # Crawlers get the HTML shell with OG tags
    try:
        gallery_data = await _get_gallery_for_sharing(token)
    except MagicLinkNotFoundError:
        raise_http_exception(
            status_code=404,
            error_code=ErrorCode.GALLERY_NOT_FOUND
            if hasattr(ErrorCode, "GALLERY_NOT_FOUND")
            else "GALLERY_NOT_FOUND",
            message="Gallery not found",
            request_id=str(request.state.request_id)
            if hasattr(request.state, "request_id")
            else "",
        )

    photographer_name = gallery_data.get("photographer_name", "Photographer")
    base_url = str(request.base_url).rstrip("/") + f"/api/v1/public/galleries/{token}/page"

    og = sharing_service.build_og_metadata(
        gallery=gallery_data,
        photographer_name=photographer_name,
        base_url=base_url,
    )
    json_ld = sharing_service.build_json_ld(
        gallery=gallery_data,
        photographer_name=photographer_name,
        base_url=base_url,
    )

    html = _render_template(
        "gallery_shell.html",
        {
            "title": og["title"],
            "description": og["description"],
            "og_image": og["og_image"],
            "canonical_url": og["canonical_url"],
            "json_ld": json.dumps(json_ld),
            "dev_mode": os.getenv("RAWDRIVE_ENV", "production") == "development",
        },
    )

    return HTMLResponse(content=html, status_code=200)


@router.get("/{token}/embed", response_class=HTMLResponse)
async def gallery_embed(
    token: str,
    request: Request,
    layout: str = "grid",
    theme: str = "light",
):
    """Serve an embeddable gallery page for iframe embedding.

    Returns a minimal HTML page suitable for iframe embedding on external websites.
    Supports layout and theme query parameters for customization.
    """
    try:
        gallery_data = await _get_gallery_for_sharing(token)
    except MagicLinkNotFoundError:
        raise_http_exception(
            status_code=404,
            error_code=ErrorCode.GALLERY_NOT_FOUND
            if hasattr(ErrorCode, "GALLERY_NOT_FOUND")
            else "GALLERY_NOT_FOUND",
            message="Gallery not found",
            request_id=str(request.state.request_id)
            if hasattr(request.state, "request_id")
            else "",
        )

    # Minimal embed page that loads the SPA in embed mode
    embed_url = f"/gallery/{token}?embed=true&layout={layout}&theme={theme}"
    bg_color = "#0f0f0f" if theme == "dark" else "#fafafa"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{gallery_data.get('title', 'Gallery')} | RawDrive</title>
    <style>
        html, body {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: {bg_color}; }}
        iframe {{ width: 100%; height: 100%; border: none; }}
    </style>
</head>
<body>
    <iframe src="{embed_url}" allowfullscreen></iframe>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)
