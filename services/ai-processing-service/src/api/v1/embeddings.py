"""CLIP Embedding API Endpoints.

Provides REST API for computing CLIP embeddings from images stored in R2.
Used by the backend similarity_worker to offload ML inference.
"""

from __future__ import annotations

import logging
import tempfile
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class EmbedImagesRequest(BaseModel):
    """Request to compute CLIP embeddings for a batch of images."""
    image_urls: list[str] = Field(..., description="List of R2 object keys to embed")
    workspace_id: str = Field(..., description="Workspace ID for audit logging")


class EmbeddingResult(BaseModel):
    """Result for a single image embedding."""
    url: str = Field(..., description="Original R2 object key")
    embedding: Optional[list[float]] = Field(None, description="512-dim CLIP embedding")
    error: Optional[str] = Field(None, description="Error message if embedding failed")
    dimensions: int = Field(default=512, description="Embedding dimensionality")


class EmbedImagesResponse(BaseModel):
    """Response containing computed embeddings."""
    embeddings: list[EmbeddingResult] = Field(..., description="Embedding results")
    processing_time_ms: float = Field(..., description="Total processing time in ms")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/images", response_model=EmbedImagesResponse)
async def embed_images(request: EmbedImagesRequest) -> EmbedImagesResponse:
    """Compute CLIP embeddings for a batch of images from R2 storage.

    Downloads each image from R2, runs CLIP inference, and returns
    512-dimensional embeddings. Individual image failures do not
    crash the batch -- they are reported per-image in the response.
    """
    start_time = time.perf_counter()

    if not request.image_urls:
        return EmbedImagesResponse(
            embeddings=[],
            processing_time_ms=0.0,
        )

    logger.info(
        f"Embedding {len(request.image_urls)} images for workspace {request.workspace_id}"
    )

    from models.clip_embedder import get_clip_embedder
    from services.r2_download import download_from_r2

    embedder = get_clip_embedder()
    results: list[EmbeddingResult] = []
    temp_paths: list[Optional[Path]] = []

    # Phase 1: Download all images from R2
    for url in request.image_urls:
        try:
            image_bytes = download_from_r2(url)
            # Save to temp file for CLIP processing
            from PIL import Image
            import io

            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            image.save(tmp.name)
            tmp.close()
            temp_paths.append(Path(tmp.name))
        except Exception as e:
            logger.warning(f"Failed to download/process {url}: {e}")
            temp_paths.append(None)
            results.append(EmbeddingResult(
                url=url,
                embedding=None,
                error=str(e),
                dimensions=512,
            ))

    # Phase 2: Batch embed all successfully downloaded images
    valid_paths = [p for p in temp_paths if p is not None]
    valid_indices = [i for i, p in enumerate(temp_paths) if p is not None]

    if valid_paths:
        try:
            embeddings = embedder.embed_images([str(p) for p in valid_paths])

            for idx, valid_idx in enumerate(valid_indices):
                url = request.image_urls[valid_idx]
                emb = embeddings[idx]
                if emb is not None:
                    from models.clip_embedder import CLIPEmbedder
                    results.append(EmbeddingResult(
                        url=url,
                        embedding=CLIPEmbedder.embedding_to_list(emb),
                        error=None,
                        dimensions=len(CLIPEmbedder.embedding_to_list(emb)),
                    ))
                else:
                    results.append(EmbeddingResult(
                        url=url,
                        embedding=None,
                        error="Embedding returned None",
                        dimensions=512,
                    ))
        except Exception as e:
            logger.error(f"Batch embedding failed: {e}")
            for valid_idx in valid_indices:
                url = request.image_urls[valid_idx]
                results.append(EmbeddingResult(
                    url=url,
                    embedding=None,
                    error=f"Batch processing error: {e}",
                    dimensions=512,
                ))

    # Phase 3: Cleanup temp files
    for p in valid_paths:
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass

    # Sort results to match input order
    url_to_result = {r.url: r for r in results}
    ordered_results = [url_to_result[url] for url in request.image_urls if url in url_to_result]

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        f"Embedded {sum(1 for r in ordered_results if r.embedding)} / "
        f"{len(request.image_urls)} images in {elapsed_ms:.1f}ms"
    )

    return EmbedImagesResponse(
        embeddings=ordered_results,
        processing_time_ms=round(elapsed_ms, 2),
    )
