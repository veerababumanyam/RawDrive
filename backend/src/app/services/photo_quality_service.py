"""Photo Quality Service.

AI-powered photo quality analysis for curation sessions.
Uses Gemini Vision API to compute sharpness, exposure, composition,
and blur detection scores for batches of photos.

Feature: 023-enhanced-smart-curate (US1)
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional
from uuid import UUID

import httpx

from app.config.settings import get_settings
from app.db.postgres import get_postgres_pool
from app.services.gemini_client_service import (
    get_gemini_client_service,
    GeminiClientService,
    GeminiClientConfig,
    AIConfigurationError,
    AIRuntimeError,
)
from app.services.r2_storage_service import get_r2_storage_service
from app.services.ai_usage_service import get_ai_usage_service, AIFeatureType
from app.repositories.photo_quality_repository import get_photo_quality_repository

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Batch configuration
DEFAULT_BATCH_SIZE = 5  # Photos per Gemini call
MAX_BATCH_SIZE = 10
MAX_CONCURRENT_BATCHES = 3  # Parallel batch limit

# Rate limiting (respects Gemini API limits)
RATE_LIMIT_REQUESTS_PER_MINUTE = 15  # Conservative default
RATE_LIMIT_DELAY_SECONDS = 4.0  # 60/15 = 4 seconds between requests

# Image preprocessing
MAX_IMAGE_DIMENSION = 1024  # Resize larger images
MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024  # 4MB per image


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


@dataclass
class PhotoQualityResult:
    """Quality analysis result for a single photo."""

    asset_id: UUID
    overall_score: float  # 0-100 weighted composite
    sharpness_score: float  # 0-100 focus/clarity
    exposure_score: float  # 0-100 brightness/contrast
    composition_score: float  # 0-100 framing/balance
    blur_detected: bool  # Motion or out-of-focus blur
    blur_type: Optional[str] = None  # "motion", "focus", "bokeh", None
    blur_confidence: float = 0.0  # 0-1
    blur_severity: Optional[str] = None  # "low", "medium", "high", None
    blur_region: Optional[str] = None  # "center", "edges", "full", None
    is_intentional_blur: bool = False  # True for artistic bokeh
    expression_data: Optional[dict] = None  # Face expressions if detected
    scene_type: Optional[str] = None  # "portrait", "landscape", etc.
    raw_response: Optional[dict] = None  # Full AI response for debugging

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "asset_id": self.asset_id,
            "overall_score": self.overall_score,
            "sharpness_score": self.sharpness_score,
            "exposure_score": self.exposure_score,
            "composition_score": self.composition_score,
            "blur_detected": self.blur_detected,
            "blur_type": self.blur_type,
            "blur_confidence": self.blur_confidence,
            "blur_severity": self.blur_severity,
            "blur_region": self.blur_region,
            "is_intentional_blur": self.is_intentional_blur,
            "expression_data": self.expression_data,
            "scene_type": self.scene_type,
        }

    @property
    def is_technical_reject(self) -> bool:
        """Check if photo should be flagged as a technical reject.

        A photo is a technical reject if:
        - Blur detected with high confidence AND not intentional
        - Sharpness score below acceptable threshold
        """
        if self.blur_detected and not self.is_intentional_blur:
            if self.blur_confidence >= 0.7 or self.blur_severity == "high":
                return True
        if self.sharpness_score < 40:
            return True
        return False


@dataclass
class BatchAnalysisResult:
    """Result of analyzing a batch of photos."""

    results: list[PhotoQualityResult] = field(default_factory=list)
    errors: list[tuple[UUID, str]] = field(default_factory=list)  # (asset_id, error)
    processed_count: int = 0
    failed_count: int = 0


@dataclass
class AnalysisProgress:
    """Progress tracking for batch analysis."""

    total_photos: int
    processed: int = 0
    successful: int = 0
    failed: int = 0
    current_batch: int = 0
    total_batches: int = 0

    @property
    def percent_complete(self) -> int:
        """Calculate completion percentage."""
        if self.total_photos == 0:
            return 100
        return int((self.processed / self.total_photos) * 100)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PhotoQualityService:
    """Service for AI-powered photo quality analysis.

    Analyzes photos in batches using Gemini Vision API to compute:
    - Sharpness/focus scores
    - Exposure/lighting scores
    - Composition scores
    - Blur detection (motion/focus)
    - Overall quality ranking

    Supports rate limiting and concurrent batch processing.
    """

    def __init__(self):
        self.settings = get_settings()
        self._gemini_client: Optional[GeminiClientService] = None
        self._storage: Optional[Any] = None
        self._ai_usage: Optional[Any] = None
        self._quality_repo: Optional[Any] = None
        self._rate_limit_lock = asyncio.Lock()
        self._last_request_time: float = 0

    @property
    def gemini_client(self) -> GeminiClientService:
        """Lazy load Gemini client service."""
        if self._gemini_client is None:
            self._gemini_client = get_gemini_client_service()
        return self._gemini_client

    @property
    def storage(self):
        """Lazy load storage service."""
        if self._storage is None:
            self._storage = get_r2_storage_service()
        return self._storage

    @property
    def ai_usage(self):
        """Lazy load AI usage service."""
        if self._ai_usage is None:
            self._ai_usage = get_ai_usage_service()
        return self._ai_usage

    @property
    def quality_repo(self):
        """Lazy load quality repository."""
        if self._quality_repo is None:
            self._quality_repo = get_photo_quality_repository()
        return self._quality_repo

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    async def analyze_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        session_id: UUID,
        user_id: UUID,
        *,
        batch_size: int = DEFAULT_BATCH_SIZE,
        include_expression_analysis: bool = False,
        include_scene_detection: bool = False,
        progress_callback: Optional[callable] = None,
    ) -> BatchAnalysisResult:
        """Analyze all photos in a gallery.

        Args:
            workspace_id: Workspace containing the gallery
            gallery_id: Gallery to analyze
            session_id: Curation session ID
            user_id: User requesting analysis (for API key)
            batch_size: Photos per API call
            include_expression_analysis: Include face expression data
            include_scene_detection: Include scene classification
            progress_callback: Optional callback(progress: AnalysisProgress)

        Returns:
            BatchAnalysisResult with all quality scores
        """
        # Get gallery assets
        photos = await self._get_gallery_assets(workspace_id, gallery_id)

        if not photos:
            logger.info(f"No photos to analyze in gallery {gallery_id}")
            return BatchAnalysisResult()

        # Initialize progress
        progress = AnalysisProgress(
            total_photos=len(photos),
            total_batches=(len(photos) + batch_size - 1) // batch_size,
        )

        # Get Gemini client config
        try:
            client_config = await self.gemini_client.get_client_config(
                user_id, workspace_id
            )
        except AIConfigurationError as e:
            logger.error(f"AI not configured for user {user_id}: {e}")
            raise

        # Process in batches
        result = BatchAnalysisResult()
        batch_size = min(batch_size, MAX_BATCH_SIZE)

        for i in range(0, len(photos), batch_size):
            batch = photos[i : i + batch_size]
            progress.current_batch += 1

            try:
                batch_result = await self._analyze_batch(
                    batch=batch,
                    workspace_id=workspace_id,
                    session_id=session_id,
                    client_config=client_config,
                    include_expression_analysis=include_expression_analysis,
                    include_scene_detection=include_scene_detection,
                )

                result.results.extend(batch_result.results)
                result.errors.extend(batch_result.errors)
                result.processed_count += batch_result.processed_count
                result.failed_count += batch_result.failed_count

                progress.processed += len(batch)
                progress.successful += batch_result.processed_count
                progress.failed += batch_result.failed_count

            except Exception as e:
                logger.exception(f"Batch analysis failed: {e}")
                # Record all photos in batch as failed
                for photo in batch:
                    result.errors.append((photo["asset_id"], str(e)))
                    result.failed_count += 1
                progress.processed += len(batch)
                progress.failed += len(batch)

            # Report progress
            if progress_callback:
                try:
                    await progress_callback(progress)
                except Exception as e:
                    logger.warning(f"Progress callback failed: {e}")

        # Persist results
        if result.results:
            await self._persist_results(workspace_id, session_id, result.results)

        logger.info(
            f"Gallery analysis complete: {result.processed_count} success, "
            f"{result.failed_count} failed",
            extra={
                "gallery_id": str(gallery_id),
                "session_id": str(session_id),
            },
        )

        return result

    async def analyze_single_photo(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        session_id: UUID,
        user_id: UUID,
        object_key: str,
    ) -> PhotoQualityResult:
        """Analyze a single photo.

        Args:
            workspace_id: Workspace ID
            asset_id: Asset to analyze
            session_id: Curation session
            user_id: User requesting analysis
            object_key: Storage key for the image

        Returns:
            PhotoQualityResult
        """
        client_config = await self.gemini_client.get_client_config(
            user_id, workspace_id
        )

        photo = {
            "asset_id": asset_id,
            "processed_object_key": object_key,
        }

        batch_result = await self._analyze_batch(
            batch=[photo],
            workspace_id=workspace_id,
            session_id=session_id,
            client_config=client_config,
        )

        if batch_result.results:
            return batch_result.results[0]
        elif batch_result.errors:
            raise AIRuntimeError(
                message=f"Photo analysis failed: {batch_result.errors[0][1]}",
                code="ANALYSIS_FAILED",
            )
        else:
            raise AIRuntimeError(
                message="No results from photo analysis",
                code="NO_RESULTS",
            )

    # -------------------------------------------------------------------------
    # Batch Processing
    # -------------------------------------------------------------------------

    async def _analyze_batch(
        self,
        batch: list[dict],
        workspace_id: UUID,
        session_id: UUID,
        client_config: GeminiClientConfig,
        *,
        include_expression_analysis: bool = False,
        include_scene_detection: bool = False,
    ) -> BatchAnalysisResult:
        """Analyze a batch of photos.

        Args:
            batch: List of photo dicts with asset_id and processed_object_key
            workspace_id: Workspace ID
            session_id: Session ID
            client_config: Gemini client config
            include_expression_analysis: Include face expression data
            include_scene_detection: Include scene type

        Returns:
            BatchAnalysisResult
        """
        result = BatchAnalysisResult()

        # Apply rate limiting
        await self._apply_rate_limit()

        # Prepare batch images
        image_parts = []
        valid_assets = []

        for photo in batch:
            try:
                image_data = await self._fetch_image_data(
                    workspace_id, photo["processed_object_key"]
                )
                image_parts.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64.b64encode(image_data).decode("utf-8"),
                    }
                })
                valid_assets.append(photo["asset_id"])
            except Exception as e:
                logger.warning(f"Failed to fetch image for asset {photo['asset_id']}: {e}")
                result.errors.append((photo["asset_id"], str(e)))
                result.failed_count += 1

        if not image_parts:
            return result

        # Build prompt
        prompt = self._build_batch_quality_prompt(
            len(valid_assets),
            include_expression_analysis,
            include_scene_detection,
        )

        # Build content parts: prompt followed by images
        content_parts = [{"text": prompt}] + image_parts

        try:
            # Make API call
            response = await self._make_gemini_call(
                client_config,
                [{"parts": content_parts}],
            )

            # Parse response
            quality_data = self._parse_batch_response(response, valid_assets)

            for asset_id, data in quality_data.items():
                quality_result = PhotoQualityResult(
                    asset_id=asset_id,
                    overall_score=data.get("overall_score", 50.0),
                    sharpness_score=data.get("sharpness_score", 50.0),
                    exposure_score=data.get("exposure_score", 50.0),
                    composition_score=data.get("composition_score", 50.0),
                    blur_detected=data.get("blur_detected", False),
                    blur_type=data.get("blur_type"),
                    blur_confidence=data.get("blur_confidence", 0.0),
                    blur_severity=data.get("blur_severity"),
                    blur_region=data.get("blur_region"),
                    is_intentional_blur=data.get("is_intentional_blur", False),
                    expression_data=data.get("expression_data") if include_expression_analysis else None,
                    scene_type=data.get("scene_type") if include_scene_detection else None,
                    raw_response=data,
                )
                result.results.append(quality_result)
                result.processed_count += 1

            # Log usage
            await self.ai_usage.log_ai_call(
                user_id=client_config.user_id,
                workspace_id=workspace_id,
                model_identifier=client_config.model_identifier,
                feature_type=AIFeatureType.PHOTO_ANALYSIS,
                success=True,
                metadata={
                    "session_id": str(session_id),
                    "batch_size": len(valid_assets),
                    "feature": "quality_analysis",
                },
            )

        except AIRuntimeError as e:
            logger.error(f"Gemini API error: {e.code} - {e.message}")
            # Mark all assets in batch as failed
            for asset_id in valid_assets:
                result.errors.append((asset_id, f"{e.code}: {e.message}"))
                result.failed_count += 1

            # Log failed usage
            await self.ai_usage.log_ai_call(
                user_id=client_config.user_id,
                workspace_id=workspace_id,
                model_identifier=client_config.model_identifier,
                feature_type=AIFeatureType.PHOTO_ANALYSIS,
                success=False,
                error_code=e.code,
            )

        except Exception as e:
            logger.exception(f"Unexpected error in batch analysis: {e}")
            for asset_id in valid_assets:
                result.errors.append((asset_id, str(e)))
                result.failed_count += 1

        return result

    async def _make_gemini_call(
        self,
        config: GeminiClientConfig,
        contents: list[dict],
    ) -> dict:
        """Make a Gemini API call with error handling.

        Args:
            config: Client configuration
            contents: Request contents

        Returns:
            Parsed API response
        """
        endpoint = f"/v1beta/models/{config.model_identifier}:generateContent"
        payload = {"contents": contents}

        return await self.gemini_client.make_api_call(
            config, endpoint, payload, timeout=120.0  # Longer timeout for batches
        )

    # -------------------------------------------------------------------------
    # Prompts
    # -------------------------------------------------------------------------

    def _build_batch_quality_prompt(
        self,
        num_images: int,
        include_expression: bool,
        include_scene: bool,
    ) -> str:
        """Build quality analysis prompt for batch processing.

        Args:
            num_images: Number of images in batch
            include_expression: Include face expression analysis
            include_scene: Include scene type detection

        Returns:
            Prompt string
        """
        base_prompt = f"""Analyze the following {num_images} photo(s) for technical quality.
For EACH photo (numbered 1 to {num_images} in order), provide:

{{
  "photos": [
    {{
      "index": 1,
      "overall_score": 85,
      "sharpness_score": 80,
      "exposure_score": 90,
      "composition_score": 85,
      "blur_detected": false,
      "blur_type": null,
      "blur_confidence": 0.0,
      "blur_severity": null,
      "blur_region": null,
      "is_intentional_blur": false"""

        if include_expression:
            base_prompt += """,
      "expression_data": {
        "faces_detected": 2,
        "primary_expression": "happy",
        "eyes_open": true,
        "natural_smile": true
      }"""

        if include_scene:
            base_prompt += """,
      "scene_type": "portrait\""""

        base_prompt += """
    }
  ]
}

Scoring Guidelines (0-100):
- **overall_score**: Weighted composite (sharpness 40%, exposure 30%, composition 30%)
- **sharpness_score**: Focus accuracy, edge definition, noise level
  - 90-100: Tack sharp, excellent detail
  - 70-89: Acceptably sharp, minor softness
  - 50-69: Noticeable softness, usable at smaller sizes
  - 0-49: Out of focus, unusable

- **exposure_score**: Dynamic range, highlight/shadow detail
  - 90-100: Perfect exposure, full tonal range
  - 70-89: Slightly over/under, recoverable
  - 50-69: Significant exposure issues
  - 0-49: Severely blown/blocked

- **composition_score**: Subject placement, balance, visual flow
  - 90-100: Excellent framing, strong composition
  - 70-89: Good composition, minor issues
  - 50-69: Acceptable, could be improved
  - 0-49: Poor composition, significant issues

- **blur_detected**: true if motion blur OR focus blur is present (NOT intentional bokeh)
- **blur_type**: "motion" | "focus" | "bokeh" | null
  - "motion": camera shake or subject movement
  - "focus": missed focus (wrong subject in focus)
  - "bokeh": intentional background blur (artistic)
- **blur_confidence**: 0.0-1.0 confidence in blur detection
- **blur_severity**: "low" | "medium" | "high" | null
  - "low": minor blur, image still usable
  - "medium": noticeable blur, may need client approval
  - "high": severe blur, likely reject candidate
- **blur_region**: "center" | "edges" | "full" | null
  - Where the problematic blur occurs
- **is_intentional_blur**: true if blur appears artistic/intentional (shallow DOF, panning)"""

        if include_expression:
            base_prompt += """

- **expression_data**: Only if faces detected
  - primary_expression: "happy", "neutral", "surprised", "sad", "serious"
  - eyes_open: Whether primary subject has eyes open
  - natural_smile: Whether smile looks natural (not forced/awkward)"""

        if include_scene:
            base_prompt += """

- **scene_type**: "portrait", "group", "landscape", "event", "product", "detail", "candid\""""

        base_prompt += """

Return ONLY valid JSON. No explanations."""

        return base_prompt

    # -------------------------------------------------------------------------
    # Response Parsing
    # -------------------------------------------------------------------------

    def _parse_batch_response(
        self,
        response: dict,
        asset_ids: list[UUID],
    ) -> dict[UUID, dict]:
        """Parse Gemini batch response into per-photo results.

        Args:
            response: Raw API response
            asset_ids: Asset IDs in order

        Returns:
            Dict mapping asset_id to quality data
        """
        results = {}

        try:
            # Extract text from response
            candidates = response.get("candidates", [])
            if not candidates:
                logger.warning("No candidates in Gemini response")
                return results

            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")

            # Extract JSON from response
            json_start = text.find("{")
            json_end = text.rfind("}") + 1
            if json_start == -1 or json_end == 0:
                logger.warning("No JSON found in response")
                return results

            json_str = text[json_start:json_end]
            data = json.loads(json_str)

            # Map results to asset IDs
            photos = data.get("photos", [])
            for photo_data in photos:
                index = photo_data.get("index", 0) - 1  # Convert 1-based to 0-based
                if 0 <= index < len(asset_ids):
                    asset_id = asset_ids[index]
                    results[asset_id] = self._normalize_quality_data(photo_data)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
        except Exception as e:
            logger.exception(f"Error parsing batch response: {e}")

        return results

    def _normalize_quality_data(self, data: dict) -> dict:
        """Normalize and validate quality data.

        Args:
            data: Raw quality data from API

        Returns:
            Normalized data with valid ranges
        """
        def clamp(val, min_val=0, max_val=100):
            if val is None:
                return 50.0
            return max(min_val, min(max_val, float(val)))

        def validate_enum(val, valid_values, default=None):
            """Validate enum value against allowed values."""
            if val is None or val not in valid_values:
                return default
            return val

        blur_type = validate_enum(
            data.get("blur_type"),
            ["motion", "focus", "bokeh"],
        )
        blur_severity = validate_enum(
            data.get("blur_severity"),
            ["low", "medium", "high"],
        )
        blur_region = validate_enum(
            data.get("blur_region"),
            ["center", "edges", "full"],
        )

        return {
            "overall_score": clamp(data.get("overall_score")),
            "sharpness_score": clamp(data.get("sharpness_score")),
            "exposure_score": clamp(data.get("exposure_score")),
            "composition_score": clamp(data.get("composition_score")),
            "blur_detected": bool(data.get("blur_detected", False)),
            "blur_type": blur_type,
            "blur_confidence": clamp(data.get("blur_confidence", 0), 0, 1),
            "blur_severity": blur_severity,
            "blur_region": blur_region,
            "is_intentional_blur": bool(data.get("is_intentional_blur", False)),
            "expression_data": data.get("expression_data"),
            "scene_type": data.get("scene_type"),
        }

    # -------------------------------------------------------------------------
    # Rate Limiting
    # -------------------------------------------------------------------------

    async def _apply_rate_limit(self) -> None:
        """Apply rate limiting between API calls.

        Uses a simple time-based rate limit to stay within Gemini quotas.
        """
        async with self._rate_limit_lock:
            import time

            now = time.time()
            elapsed = now - self._last_request_time

            if elapsed < RATE_LIMIT_DELAY_SECONDS:
                wait_time = RATE_LIMIT_DELAY_SECONDS - elapsed
                logger.debug(f"Rate limiting: waiting {wait_time:.2f}s")
                await asyncio.sleep(wait_time)

            self._last_request_time = time.time()

    # -------------------------------------------------------------------------
    # Image Handling
    # -------------------------------------------------------------------------

    async def _fetch_image_data(
        self,
        workspace_id: UUID,
        object_key: str,
    ) -> bytes:
        """Fetch image data from storage.

        Args:
            workspace_id: Workspace ID
            object_key: Storage object key

        Returns:
            Image bytes
        """
        # Use processed/thumbnail for analysis (faster, sufficient quality)
        image_data = await self.storage.get_object(object_key)

        if len(image_data) > MAX_IMAGE_SIZE_BYTES:
            logger.warning(
                f"Image exceeds size limit: {len(image_data)} > {MAX_IMAGE_SIZE_BYTES}"
            )
            # In production, we'd resize here. For now, truncate is not ideal.
            # The actual implementation would use PIL to resize.

        return image_data

    async def _get_gallery_assets(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> list[dict]:
        """Get all available assets in a gallery.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID

        Returns:
            List of asset dicts with asset_id and processed_object_key
        """
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT
                a.asset_id,
                a.processed_object_key,
                a.thumbnail_object_key
            FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE ga.gallery_id = $1
              AND a.workspace_id = $2
              AND a.status = 'available'
            ORDER BY a.created_at ASC
            """,
            gallery_id,
            workspace_id,
        )

        return [dict(row) for row in rows]

    # -------------------------------------------------------------------------
    # Persistence
    # -------------------------------------------------------------------------

    async def _persist_results(
        self,
        workspace_id: UUID,
        session_id: UUID,
        results: list[PhotoQualityResult],
    ) -> None:
        """Persist quality results to database.

        Args:
            workspace_id: Workspace ID
            session_id: Session ID
            results: Quality results to persist
        """
        records = [
            {
                "asset_id": r.asset_id,
                "session_id": session_id,
                "overall_score": r.overall_score,
                "sharpness_score": r.sharpness_score,
                "exposure_score": r.exposure_score,
                "composition_score": r.composition_score,
                "blur_detected": r.blur_detected,
                "blur_type": r.blur_type,
                "blur_confidence": r.blur_confidence,
                "blur_severity": r.blur_severity,
                "blur_region": r.blur_region,
                "is_intentional_blur": r.is_intentional_blur,
                "expression_data": r.expression_data,
                "scene_type": r.scene_type,
            }
            for r in results
        ]

        await self.quality_repo.bulk_upsert(workspace_id, records)

        logger.debug(
            f"Persisted {len(records)} quality results",
            extra={"session_id": str(session_id)},
        )


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------

_photo_quality_service: Optional[PhotoQualityService] = None


def get_photo_quality_service() -> PhotoQualityService:
    """Get the photo quality service singleton."""
    global _photo_quality_service
    if _photo_quality_service is None:
        _photo_quality_service = PhotoQualityService()
    return _photo_quality_service
