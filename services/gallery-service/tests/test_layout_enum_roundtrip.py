"""
LayoutStyle enum round-trip tests.

Ensures LayoutStyle enum stays synchronized across TypeScript shared-types,
Python gallery-service schemas, and database constraints.
"""

import pytest
from pydantic import ValidationError

from src.schemas.gallery import GalleryUpdateRequest, GalleryResponse, VALID_LAYOUT_STYLES

# Expected values must match TypeScript LayoutStyle exactly
EXPECTED_LAYOUT_STYLES = {
    'tabs', 'continuous', 'grid', 'masonry',
    'justified', 'mosaic', 'filmstrip', 'slideshow',
}


class TestLayoutStyleEnumSync:
    """Ensures LayoutStyle enum stays synchronized across TypeScript and Python layers."""

    def test_valid_layout_styles_matches_typescript(self):
        """VALID_LAYOUT_STYLES in Python must exactly match TypeScript LayoutStyle values."""
        assert VALID_LAYOUT_STYLES == EXPECTED_LAYOUT_STYLES

    def test_valid_layout_styles_has_eight_values(self):
        assert len(VALID_LAYOUT_STYLES) == 8

    @pytest.mark.parametrize("layout_style", sorted(EXPECTED_LAYOUT_STYLES))
    def test_update_request_accepts_valid_layout(self, layout_style: str):
        """GalleryUpdateRequest should accept each valid layout_style."""
        req = GalleryUpdateRequest(layout_style=layout_style)
        assert req.layout_style == layout_style

    def test_update_request_rejects_invalid_layout(self):
        """GalleryUpdateRequest should reject unknown layout_style values."""
        with pytest.raises(ValidationError):
            GalleryUpdateRequest(layout_style='invalid_layout')

    @pytest.mark.parametrize("layout_style", sorted(EXPECTED_LAYOUT_STYLES))
    def test_response_serializes_valid_layout(self, layout_style: str):
        """GalleryResponse should serialize each valid layout_style."""
        resp = GalleryResponse(
            gallery_id="00000000-0000-0000-0000-000000000001",
            workspace_id="00000000-0000-0000-0000-000000000002",
            title="Test Gallery",
            status="draft",
            layout_style=layout_style,
        )
        assert resp.layout_style == layout_style
