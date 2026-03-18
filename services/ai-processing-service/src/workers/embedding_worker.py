"""Celery Embedding Worker.

Background tasks for computing CLIP embeddings on upload. Downloads images
from R2 storage, runs CLIP inference via CLIPEmbedder, and returns
512-dimensional embedding vectors.

Feature: 06-ai-ml-pipeline
"""

from __future__ import annotations

import logging
import tempfile
import time
from typing import Any, Dict, List, Optional

from workers.celery_app import celery_app
from models.clip_embedder import get_clip_embedder
from services.r2_download import download_from_r2

logger = logging.getLogger(__name__)


# =============================================================================
# Celery Tasks
# =============================================================================


@celery_app.task(
    bind=True,
    name="workers.embedding_worker.compute_embedding",
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(ConnectionError, RuntimeError),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    queue="embedding",
)
def compute_embedding(
    self,
    asset_id: str,
    workspace_id: str,
    object_key: str,
) -> Dict[str, Any]:
    """Compute CLIP embedding for a single image.

    Downloads the image from R2 storage, runs CLIP inference, and
    returns the 512-dimensional embedding vector.

    Args:
        asset_id: Unique identifier for the asset.
        workspace_id: Workspace ID for tenant context.
        object_key: R2 object key for the image file.

    Returns:
        Dict with asset_id, embedding (list of floats), and dimensions.
    """
    start_time = time.time()

    logger.info(
        "Computing embedding for asset",
        extra={
            "asset_id": asset_id,
            "workspace_id": workspace_id,
            "object_key": object_key,
            "retry_count": self.request.retries,
        },
    )

    try:
        # Download image bytes from R2
        image_bytes = download_from_r2(object_key)

        # Write to temp file for CLIP processing
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=True) as tmp:
            tmp.write(image_bytes)
            tmp.flush()

            # Compute CLIP embedding
            embedder = get_clip_embedder()
            embedding = embedder.embed_image(tmp.name)

        embedding_list = embedding.tolist()
        processing_time = (time.time() - start_time) * 1000

        logger.info(
            "Embedding computed",
            extra={
                "asset_id": asset_id,
                "dimensions": len(embedding_list),
                "processing_time_ms": processing_time,
            },
        )

        return {
            "asset_id": asset_id,
            "workspace_id": workspace_id,
            "embedding": embedding_list,
            "dimensions": len(embedding_list),
            "processing_time_ms": processing_time,
        }

    except Exception as e:
        processing_time = (time.time() - start_time) * 1000
        logger.error(
            "Embedding computation failed",
            extra={
                "asset_id": asset_id,
                "workspace_id": workspace_id,
                "error": str(e),
                "retry_count": self.request.retries,
                "processing_time_ms": processing_time,
            },
        )
        raise


@celery_app.task(
    bind=True,
    name="workers.embedding_worker.compute_batch_embeddings",
    max_retries=3,
    time_limit=1800,  # 30 minutes max for batch
    soft_time_limit=1700,
    queue="embedding",
)
def compute_batch_embeddings(
    self,
    assets: List[Dict[str, str]],
) -> List[Dict[str, Any]]:
    """Compute CLIP embeddings for a batch of assets.

    Processes each asset sequentially: download from R2, compute embedding.

    Args:
        assets: List of dicts with asset_id, workspace_id, object_key.

    Returns:
        List of result dicts with asset_id, embedding, dimensions.
    """
    start_time = time.time()
    total = len(assets)

    logger.info(
        "Starting batch embedding computation",
        extra={"batch_size": total},
    )

    results = []

    for idx, asset in enumerate(assets):
        asset_id = asset.get("asset_id", f"unknown_{idx}")
        workspace_id = asset.get("workspace_id", "")
        object_key = asset.get("object_key", "")

        if not object_key:
            results.append({
                "asset_id": asset_id,
                "error": "Missing object_key",
                "dimensions": 0,
            })
            continue

        try:
            image_bytes = download_from_r2(object_key)

            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=True) as tmp:
                tmp.write(image_bytes)
                tmp.flush()

                embedder = get_clip_embedder()
                embedding = embedder.embed_image(tmp.name)

            results.append({
                "asset_id": asset_id,
                "workspace_id": workspace_id,
                "embedding": embedding.tolist(),
                "dimensions": len(embedding.tolist()),
            })

        except Exception as e:
            logger.warning(
                "Failed to compute embedding for asset %s: %s",
                asset_id,
                e,
            )
            results.append({
                "asset_id": asset_id,
                "error": str(e),
                "dimensions": 0,
            })

        # Progress update
        if (idx + 1) % 10 == 0:
            self.update_state(
                state="PROGRESS",
                meta={"current": idx + 1, "total": total},
            )

    processing_time = (time.time() - start_time) * 1000

    logger.info(
        "Batch embedding completed",
        extra={
            "batch_size": total,
            "successful": sum(1 for r in results if "embedding" in r),
            "failed": sum(1 for r in results if "error" in r),
            "processing_time_ms": processing_time,
        },
    )

    return results


# =============================================================================
# Module Exports
# =============================================================================

__all__ = ["compute_embedding", "compute_batch_embeddings"]
