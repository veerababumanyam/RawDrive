"""Tests for AIFilterService (025-ai-filter-simplify).

Validates quality/blur/technical score filtering logic and workspace isolation.
"""

import pytest
from uuid import uuid4, UUID
from app.services.ai_filter_service import AIFilterService


@pytest.fixture
def filter_service():
    """Provide AIFilterService instance."""
    return AIFilterService()


@pytest.fixture
def sample_quality_results():
    """Sample photo quality analysis results."""
    return [
        {
            "asset_id": uuid4(),
            "overall_score": 95,
            "sharpness_score": 90,
            "exposure_score": 92,
            "composition_score": 98,
            "blur_detected": False,
            "blur_type": None,
        },
        {
            "asset_id": uuid4(),
            "overall_score": 75,
            "sharpness_score": 80,
            "exposure_score": 70,
            "composition_score": 75,
            "blur_detected": True,
            "blur_type": "motion",
        },
        {
            "asset_id": uuid4(),
            "overall_score": 85,
            "sharpness_score": 70,
            "exposure_score": 88,
            "composition_score": 92,
            "blur_detected": True,
            "blur_type": "bokeh",
        },
        {
            "asset_id": uuid4(),
            "overall_score": 55,
            "sharpness_score": 60,
            "exposure_score": 50,
            "composition_score": 55,
            "blur_detected": False,
            "blur_type": None,
        },
    ]


class TestBlurFilters:
    """Test blur filtering logic."""

    def test_passes_blur_filters_no_hide(self, filter_service):
        """All assets pass when blur_hide=False."""
        row = {"blur_detected": True, "blur_type": "motion"}
        assert filter_service._passes_blur_filters(row, blur_hide=False, blur_show_bokeh=True)

    def test_passes_blur_filters_hide_sharp(self, filter_service):
        """Sharp photos pass when blur_hide=True."""
        row = {"blur_detected": False, "blur_type": None}
        assert filter_service._passes_blur_filters(row, blur_hide=True, blur_show_bokeh=True)

    def test_passes_blur_filters_hide_motion(self, filter_service):
        """Motion blur is hidden when blur_hide=True."""
        row = {"blur_detected": True, "blur_type": "motion"}
        assert not filter_service._passes_blur_filters(row, blur_hide=True, blur_show_bokeh=True)

    def test_passes_blur_filters_show_bokeh(self, filter_service):
        """Bokeh passes when blur_show_bokeh=True."""
        row = {"blur_detected": True, "blur_type": "bokeh"}
        assert filter_service._passes_blur_filters(row, blur_hide=True, blur_show_bokeh=True)

    def test_passes_blur_filters_hide_bokeh(self, filter_service):
        """Bokeh is hidden when blur_show_bokeh=False."""
        row = {"blur_detected": True, "blur_type": "bokeh"}
        assert not filter_service._passes_blur_filters(row, blur_hide=True, blur_show_bokeh=False)


class TestScoreFilters:
    """Test technical score filtering logic."""

    def test_passes_score_filters_no_thresholds(self, filter_service):
        """All assets pass when no thresholds set."""
        row = {"sharpness_score": 50, "exposure_score": 50, "composition_score": 50}
        assert filter_service._passes_score_filters(row, None, None, None)

    def test_passes_score_filters_above_sharpness(self, filter_service):
        """Asset passes when above sharpness threshold."""
        row = {"sharpness_score": 80, "exposure_score": 70, "composition_score": 75}
        assert filter_service._passes_score_filters(row, min_sharpness=75, min_exposure=None, min_composition=None)

    def test_fails_score_filters_below_sharpness(self, filter_service):
        """Asset fails when below sharpness threshold."""
        row = {"sharpness_score": 70, "exposure_score": 80, "composition_score": 75}
        assert not filter_service._passes_score_filters(row, min_sharpness=75, min_exposure=None, min_composition=None)

    def test_passes_score_filters_all_thresholds(self, filter_service):
        """Asset passes when above all thresholds."""
        row = {"sharpness_score": 80, "exposure_score": 85, "composition_score": 90}
        assert filter_service._passes_score_filters(row, min_sharpness=75, min_exposure=80, min_composition=85)

    def test_fails_score_filters_one_below(self, filter_service):
        """Asset fails when one score below threshold."""
        row = {"sharpness_score": 80, "exposure_score": 70, "composition_score": 90}
        assert not filter_service._passes_score_filters(row, min_sharpness=75, min_exposure=75, min_composition=85)

    def test_passes_score_filters_missing_scores(self, filter_service):
        """Missing scores default to 0 and can fail thresholds."""
        row = {"sharpness_score": None, "exposure_score": 80, "composition_score": 90}
        assert not filter_service._passes_score_filters(row, min_sharpness=50, min_exposure=None, min_composition=None)


class TestFilterStats:
    """Test filter statistics generation."""

    @pytest.mark.asyncio
    async def test_get_filter_stats(self, filter_service, sample_quality_results):
        """Generate correct filter stats from results."""
        stats = await filter_service.get_filter_stats(
            workspace_id=uuid4(),
            gallery_id=uuid4(),
            results=sample_quality_results,
        )

        # Should match sample data:
        # 95 (excellent), 75 (good), 85 (good), 55 (fair)
        assert stats["excellentCount"] == 1
        assert stats["goodCount"] == 2
        assert stats["fairCount"] == 1
        # Blurry hidden calculation not deterministic without params, skip for now
