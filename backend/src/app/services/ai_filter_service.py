"""AI Filter Service for One-Click AI Analysis & Filtering (025-ai-filter-simplify).

Handles quality/blur/content/similarity filtering logic for gallery assets,
enforcing workspace isolation and providing a clean abstraction over repository
queries.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from app.repositories.photo_quality_repository import get_photo_quality_repository
from app.services.curation_session_service import get_curation_session_service
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class AIFilterService:
    """Service for AI-powered filtering of gallery assets."""

    def __init__(self):
        self.quality_repo = get_photo_quality_repository()

    async def apply_quality_and_blur_filters(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        quality_tier: str = "all",
        quality_min: Optional[int] = None,
        blur_hide: bool = False,
        blur_show_bokeh: bool = True,
        min_sharpness: Optional[int] = None,
        min_exposure: Optional[int] = None,
        min_composition: Optional[int] = None,
        page: int = 1,
        limit: int = 100,
    ) -> tuple[list[dict[str, Any]], int]:
        """Apply quality and blur filters to gallery assets.
        
        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            quality_tier: Quality tier filter (all|excellent|good|fair)
            quality_min: Minimum overall quality score (0-100)
            blur_hide: Hide blurred photos
            blur_show_bokeh: Show artistic bokeh even when hiding blur
            min_sharpness: Minimum sharpness score (0-100)
            min_exposure: Minimum exposure score (0-100)
            min_composition: Minimum composition score (0-100)
            page: Page number (1-based)
            limit: Results per page
            
        Returns:
            Tuple of (filtered asset list, total count)
        """
        # Map quality tier to minimum score
        tier_map = {
            "excellent": 90,
            "good": 70,
            "fair": 50,
            "all": None,
        }
        tier_min = tier_map.get(quality_tier, None)
        effective_min = quality_min if quality_min is not None else tier_min

        # Fetch quality analysis results from repository
        results, total = await self.quality_repo.list_by_gallery(
            workspace_id,
            gallery_id,
            min_score=effective_min,
            blur_only=False,
            limit=2000,  # Fetch enough for client-side filtering
            offset=0,
        )

        # Apply blur filters
        filtered = []
        for row in results:
            if not self._passes_blur_filters(row, blur_hide, blur_show_bokeh):
                continue
            if not self._passes_score_filters(
                row, min_sharpness, min_exposure, min_composition
            ):
                continue
            filtered.append(row)

        # Pagination
        start = (page - 1) * limit
        end = start + limit
        paged = filtered[start:end]

        return paged, len(filtered)

    def _passes_blur_filters(
        self, row: dict, blur_hide: bool, blur_show_bokeh: bool
    ) -> bool:
        """Check if asset passes blur filters."""
        if not blur_hide:
            return True
        if not row.get("blur_detected"):
            return True
        # Allow artistic bokeh if configured
        if blur_show_bokeh and row.get("blur_type") == "bokeh":
            return True
        # Otherwise hide blurred
        return False

    def _passes_score_filters(
        self,
        row: dict,
        min_sharpness: Optional[int],
        min_exposure: Optional[int],
        min_composition: Optional[int],
    ) -> bool:
        """Check if asset passes technical score filters."""
        if min_sharpness is not None and (row.get("sharpness_score") or 0) < min_sharpness:
            return False
        if min_exposure is not None and (row.get("exposure_score") or 0) < min_exposure:
            return False
        if min_composition is not None and (row.get("composition_score") or 0) < min_composition:
            return False
        return True

    async def apply_content_filters(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        include_tags: Optional[list[str]] = None,
        exclude_tags: Optional[list[str]] = None,
        has_faces: Optional[bool] = None,
        min_faces: Optional[int] = None,
        max_faces: Optional[int] = None,
    ) -> list[UUID]:
        """Apply content-based filters using AI tags and face detection.

        Returns list of asset IDs matching all specified content filters.
        Uses AND semantics for includes, any match for face count range.

        Args:
            workspace_id: Workspace UUID for tenant isolation
            gallery_id: Gallery UUID to filter
            include_tags: Tags that must be present (all required)
            exclude_tags: Tags that must NOT be present (any excludes)
            has_faces: If True, only assets with faces; if False, only without
            min_faces: Minimum face count (inclusive)
            max_faces: Maximum face count (inclusive)
        """
        pool = await get_postgres_pool()

        # Start with all assets in gallery
        base_query = """
            SELECT ga.asset_id
            FROM gallery_assets ga
            WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
        """
        params: list[Any] = [workspace_id, gallery_id]
        param_idx = 3

        # Filter by included tags (asset must have ALL specified tags)
        if include_tags:
            base_query += f"""
                AND ga.asset_id IN (
                    SELECT at.asset_id
                    FROM asset_tags at
                    JOIN tags t ON at.tag_id = t.tag_id
                    WHERE at.workspace_id = $1 AND t.name = ANY(${param_idx})
                    GROUP BY at.asset_id
                    HAVING COUNT(DISTINCT t.name) = ${param_idx + 1}
                )
            """
            params.append(include_tags)
            params.append(len(include_tags))
            param_idx += 2

        # Filter by excluded tags (asset must NOT have ANY of these)
        if exclude_tags:
            base_query += f"""
                AND ga.asset_id NOT IN (
                    SELECT at.asset_id
                    FROM asset_tags at
                    JOIN tags t ON at.tag_id = t.tag_id
                    WHERE at.workspace_id = $1 AND t.name = ANY(${param_idx})
                )
            """
            params.append(exclude_tags)
            param_idx += 1

        # Filter by face presence/count
        if has_faces is not None or min_faces is not None or max_faces is not None:
            face_conditions = []

            if has_faces is True:
                face_conditions.append("fd.face_count > 0")
            elif has_faces is False:
                face_conditions.append("(fd.face_count IS NULL OR fd.face_count = 0)")

            if min_faces is not None:
                face_conditions.append(f"fd.face_count >= ${param_idx}")
                params.append(min_faces)
                param_idx += 1

            if max_faces is not None:
                face_conditions.append(f"fd.face_count <= ${param_idx}")
                params.append(max_faces)
                param_idx += 1

            if face_conditions:
                face_where = " AND ".join(face_conditions)
                base_query += f"""
                    AND ga.asset_id IN (
                        SELECT fd.asset_id
                        FROM face_detection_results fd
                        WHERE fd.workspace_id = $1 AND {face_where}
                    )
                """

        rows = await pool.fetch(base_query, *params)
        return [row["asset_id"] for row in rows]

    async def generate_content(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
        mode: str,
        style: Optional[str] = None,
        tone: Optional[str] = None,
        max_length: Optional[int] = None,
        user_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Generate AI content (story, captions, hashtags) from selected photos.

        US6: AI Create feature for generating narrative content from photos.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_ids: List of asset UUIDs to include in generation
            mode: Content type - 'story', 'caption', or 'hashtags'
            style: Writing style (e.g., 'professional', 'casual', 'poetic')
            tone: Tone of voice (e.g., 'warm', 'formal', 'playful')
            max_length: Maximum content length in characters
            user_id: User ID for accessing their Gemini configuration

        Returns:
            Dict with 'content' string and optional 'tokens_used' int
        """
        from app.services.gemini_client_service import (
            get_gemini_client_service,
            AIConfigurationError,
            AIRuntimeError,
        )

        pool = await get_postgres_pool()

        # Fetch metadata for selected assets
        rows = await pool.fetch(
            """
            SELECT
                a.asset_id,
                a.original_object_key,
                aa.ai_metadata,
                aa.caption,
                array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as tags
            FROM assets a
            LEFT JOIN asset_analysis aa ON a.asset_id = aa.asset_id AND a.workspace_id = aa.workspace_id
            LEFT JOIN asset_tags at ON a.asset_id = at.asset_id AND a.workspace_id = at.workspace_id
            LEFT JOIN tags t ON at.tag_id = t.tag_id
            WHERE a.workspace_id = $1 AND a.asset_id = ANY($2)
            GROUP BY a.asset_id, a.original_object_key, aa.ai_metadata, aa.caption
            """,
            workspace_id,
            asset_ids,
        )

        if not rows:
            return {"content": "", "tokens_used": 0}

        # Build context from asset metadata
        photo_descriptions = []
        for row in rows:
            desc_parts = []

            # Add AI caption if available
            if row["caption"]:
                desc_parts.append(row["caption"])

            # Add AI metadata insights
            if row["ai_metadata"]:
                meta = row["ai_metadata"] if isinstance(row["ai_metadata"], dict) else {}
                if meta.get("scene"):
                    desc_parts.append(f"Scene: {meta['scene']}")
                if meta.get("mood"):
                    desc_parts.append(f"Mood: {meta['mood']}")
                if meta.get("activity"):
                    desc_parts.append(f"Activity: {meta['activity']}")

            # Add tags
            if row["tags"] and row["tags"][0]:
                desc_parts.append(f"Tags: {', '.join(row['tags'][:10])}")

            if desc_parts:
                photo_descriptions.append(" | ".join(desc_parts))
            else:
                # Extract filename for minimal context
                filename = row["original_object_key"].split("/")[-1] if row["original_object_key"] else "photo"
                photo_descriptions.append(f"Photo: {filename}")

        # Build prompt based on mode
        prompt = self._build_generate_prompt(
            mode=mode,
            photo_count=len(rows),
            descriptions=photo_descriptions,
            style=style,
            tone=tone,
            max_length=max_length,
        )

        # If no user_id provided, generate placeholder content
        # (In production, user_id comes from current_user in the endpoint)
        if not user_id:
            # Return a placeholder indicating AI generation would happen
            placeholder = self._generate_placeholder_content(mode, len(rows), style, tone)
            return {"content": placeholder, "tokens_used": 0}

        try:
            gemini_service = get_gemini_client_service()
            client = await gemini_service.get_client_for_user(user_id, workspace_id)

            response = await client.generate_content([{"role": "user", "parts": [{"text": prompt}]}])
            content = self._parse_gemini_response(response, mode)

            # Estimate tokens (rough approximation)
            tokens_used = len(prompt.split()) + len(content.split())

            return {"content": content, "tokens_used": tokens_used}

        except AIConfigurationError as e:
            logger.warning(f"AI not configured for user: {e.message}")
            return {"content": f"[AI not configured: {e.message}]", "tokens_used": 0}
        except AIRuntimeError as e:
            logger.error(f"AI runtime error: {e.message}")
            return {"content": f"[AI error: {e.message}]", "tokens_used": 0}
        except Exception as e:
            logger.exception("Unexpected error in generate_content")
            return {"content": "[Generation failed - please try again]", "tokens_used": 0}

    def _build_generate_prompt(
        self,
        mode: str,
        photo_count: int,
        descriptions: list[str],
        style: Optional[str] = None,
        tone: Optional[str] = None,
        max_length: Optional[int] = None,
    ) -> str:
        """Build the AI prompt for content generation."""
        style_str = style or "professional"
        tone_str = tone or "warm and engaging"

        # Photo context
        photo_context = "\n".join(f"- {desc}" for desc in descriptions[:20])  # Limit to 20

        if mode == "story":
            length_hint = f" Keep it under {max_length} characters." if max_length else ""
            return f"""Create a compelling story based on these {photo_count} photos from a photography session.

Photo descriptions:
{photo_context}

Style: {style_str}
Tone: {tone_str}

Write a narrative that:
- Weaves together the moments captured in these photos
- Evokes emotion and tells a cohesive story
- Is suitable for sharing on a photography portfolio or social media
- Includes natural transitions between scenes{length_hint}

Story:"""

        elif mode == "caption":
            length_hint = f" Each caption should be under {max_length // photo_count} characters." if max_length else ""
            return f"""Create engaging social media captions for these {photo_count} photos.

Photo descriptions:
{photo_context}

Style: {style_str}
Tone: {tone_str}

For each photo, write a caption that:
- Is attention-grabbing and engaging
- Reflects the mood and content of the image
- Is suitable for Instagram or similar platforms{length_hint}

Return one caption per line, numbered 1-{photo_count}:"""

        elif mode == "hashtags":
            return f"""Generate relevant hashtags for these {photo_count} photos from a photography session.

Photo descriptions:
{photo_context}

Style: {style_str}

Generate:
- 15-25 relevant hashtags total
- Mix of popular and niche photography hashtags
- Include location/event-specific tags if apparent
- Include style and mood hashtags

Return hashtags as a single line, space-separated, each starting with #:"""

        else:
            return f"Describe these {photo_count} photos in a {style_str}, {tone_str} way:\n{photo_context}"

    def _parse_gemini_response(self, response: Any, mode: str) -> str:
        """Parse Gemini response and extract content."""
        try:
            # Handle the response text
            text = response.text if hasattr(response, "text") else str(response)

            # Try to parse as JSON if it looks like JSON
            if text.startswith("{") or text.startswith("["):
                try:
                    data = json.loads(text)
                    if isinstance(data, dict):
                        # Extract from Gemini response structure
                        candidates = data.get("candidates", [])
                        if candidates:
                            content = candidates[0].get("content", {})
                            parts = content.get("parts", [])
                            if parts:
                                return parts[0].get("text", text)
                    return text
                except json.JSONDecodeError:
                    pass

            return text.strip()
        except Exception as e:
            logger.warning(f"Failed to parse Gemini response: {e}")
            return str(response)

    def _generate_placeholder_content(
        self,
        mode: str,
        photo_count: int,
        style: Optional[str] = None,
        tone: Optional[str] = None,
    ) -> str:
        """Generate placeholder content when AI is not available."""
        style_str = style or "professional"
        tone_str = tone or "warm"

        if mode == "story":
            return f"[AI Story will be generated for {photo_count} photos in {style_str}, {tone_str} style. Configure your Gemini API key in Settings to enable this feature.]"
        elif mode == "caption":
            return f"[AI Captions will be generated for {photo_count} photos. Configure your Gemini API key in Settings to enable this feature.]"
        elif mode == "hashtags":
            return f"[AI Hashtags will be generated based on {photo_count} photos. Configure your Gemini API key in Settings to enable this feature.]"
        else:
            return f"[AI Content generation for {photo_count} photos. Configure your Gemini API key in Settings.]"

    async def get_filter_stats(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        results: list[dict[str, Any]],
    ) -> dict[str, int]:
        """Generate filter statistics from results."""
        stats = {
            "excellentCount": sum(1 for r in results if (r.get("overall_score", 0) >= 90)),
            "goodCount": sum(
                1 for r in results if 70 <= (r.get("overall_score", 0)) < 90
            ),
            "fairCount": sum(
                1 for r in results if 50 <= (r.get("overall_score", 0)) < 70
            ),
            "blurryHidden": sum(
                1
                for r in results
                if not self._passes_blur_filters(r, blur_hide=True, blur_show_bokeh=True)
            ),
        }
        return stats


def get_ai_filter_service() -> AIFilterService:
    """Dependency injection factory for AIFilterService."""
    return AIFilterService()
