
import asyncio
import os
import sys
import json
from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

# Manual .env loading
try:
    with open(os.path.join(os.path.dirname(__file__), ".env")) as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                key, value = line.strip().split('=', 1)
                os.environ[key] = value
except Exception as e:
    print(f"Failed to load .env: {e}")

# Adjust path to find app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "src")))

from app.db.postgres import get_postgres_pool, init_postgres_pool
from app.repositories.photo_quality_repository import get_photo_quality_repository

# --- COPIED SCHEMAS AND HELPERS FROM smart_tagging.py ---

class PhotoQualityResultSchema(BaseModel):
    """Quality result for a single photo."""
    asset_id: UUID
    overall_score: float = Field(..., ge=0, le=100)
    sharpness_score: float = Field(..., ge=0, le=100)
    exposure_score: float = Field(..., ge=0, le=100)
    composition_score: float = Field(..., ge=0, le=100)
    blur_detected: bool
    blur_type: Optional[str] = Field(None, description="motion|focus|bokeh")
    blur_confidence: float = Field(default=0, ge=0, le=1)
    blur_severity: Optional[str] = Field(None, description="low|medium|high")
    blur_region: Optional[str] = Field(None, description="center|edges|full")
    is_intentional_blur: bool = Field(default=False, description="True for artistic bokeh")
    is_technical_reject: bool = Field(default=False, description="Flagged as reject candidate")
    expression_data: Optional[dict] = None
    scene_type: Optional[str] = None
    analyzed_at: Optional[datetime] = None
    event_type: Optional[str] = None
    key_elements: list[str] = []
    activity: Optional[str] = None
    semantic_description: Optional[str] = None
    lighting: Optional[str] = None
    mood: Optional[str] = None

class QualitySummarySchema(BaseModel):
    """Summary of quality analysis."""
    total_analyzed: int
    average_score: float
    blur_count: int
    excellent_count: int = 0
    good_count: int = 0
    fair_count: int = 0
    poor_count: int = 0

class GalleryQualityResultsResponse(BaseModel):
    """Response for gallery quality results."""
    gallery_id: UUID
    results: List[PhotoQualityResultSchema]
    total: int
    summary: Optional[QualitySummarySchema] = None

def _is_technical_reject(result: dict) -> bool:
    """Determine if a photo should be flagged as a technical reject."""
    blur_detected = result.get("blur_detected", False)
    is_intentional = result.get("is_intentional_blur", False)
    blur_confidence = result.get("blur_confidence", 0)
    blur_severity = result.get("blur_severity")
    sharpness_score = result.get("sharpness_score", 50)

    if blur_detected and not is_intentional:
        if blur_confidence >= 0.7 or blur_severity == "high":
            return True
    if sharpness_score < 40:
        return True
    return False

# --- REPRODUCTION LOGIC ---

async def reproduce():
    # IDs from logs
    workspace_id = UUID("9af3bc61-d271-50bf-92ae-efd8ca90f9ab")
    gallery_id = UUID("55e5c0d6-5a7f-4f21-adac-1c4bb5036e02")

    print(f"Connecting to database...")
    await init_postgres_pool()
    
    try:
        quality_repo = get_photo_quality_repository()
        
        print(f"Fetching quality analysis for gallery {gallery_id}...")
        results, total = await quality_repo.list_by_gallery(
            workspace_id, gallery_id, limit=100, offset=0
        )
        print(f"Retrieved {len(results)} records (total: {total}).")

        # Simulate the API logic
        filtered_results = []
        for r in results:
            filtered_results.append(r)
        
        print("Validating records against PhotoQualityResultSchema...")
        for i, r in enumerate(filtered_results):
            try:
                # Construct the schema exactly as in smart_tagging.py
                schema = PhotoQualityResultSchema(
                    asset_id=r["asset_id"],
                    overall_score=r["overall_score"],
                    sharpness_score=r["sharpness_score"],
                    exposure_score=r["exposure_score"],
                    composition_score=r["composition_score"],
                    blur_detected=r["blur_detected"],
                    blur_type=r.get("blur_type"),
                    blur_confidence=r.get("blur_confidence", 0),
                    blur_severity=r.get("blur_severity"),
                    blur_region=r.get("blur_region"),
                    is_intentional_blur=r.get("is_intentional_blur", False),
                    is_technical_reject=_is_technical_reject(r),
                    expression_data=r.get("expression_data"),
                    scene_type=r.get("scene_type"),
                    analyzed_at=r.get("analyzed_at"),  # Using the corrected key
                    event_type=r.get("event_type"),
                    key_elements=r.get("key_elements", []),
                    activity=r.get("activity"),
                    semantic_description=r.get("semantic_description"),
                    lighting=r.get("lighting"),
                    mood=r.get("mood"),
                )
                # print(f"  Record {i} OK: {schema.asset_id}")
            except Exception as e:
                print(f"  FAILED validation for record {i} (Asset: {r.get('asset_id')}):")
                print(f"  Error: {e}")
                print(f"  Row Data: {json.dumps(r, default=str, indent=2)}")
                return # Stop at first failure

        print("Validating Summary...")
        summary = await quality_repo.get_summary_by_gallery(workspace_id, gallery_id)
        if summary:
            try:
                summary_schema = QualitySummarySchema(
                    total_analyzed=summary["total_analyzed"],
                    average_score=summary["average_score"],
                    blur_count=summary["blur_count"],
                    excellent_count=summary.get("excellent_count", 0),
                    good_count=summary.get("good_count", 0),
                    fair_count=summary.get("fair_count", 0),
                    poor_count=summary.get("poor_count", 0),
                )
                print("  Summary OK")
            except Exception as e:
                print(f"  FAILED validation for summary:")
                print(f"  Error: {e}")
                print(f"  Summary Data: {json.dumps(summary, default=str, indent=2)}")

        print("Validation complete.")

    except Exception as e:
        print(f"Top level exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(reproduce())
