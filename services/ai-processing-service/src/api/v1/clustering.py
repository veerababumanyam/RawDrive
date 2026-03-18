"""Clustering API endpoint for DBSCAN photo grouping.

Exposes the clustering service via HTTP so the backend similarity_worker
can delegate clustering to the ai-processing-service.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from services.clustering_service import cluster_embeddings

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class EmbeddingItem(BaseModel):
    """Single embedding with asset identifier."""

    asset_id: str
    embedding: list[float]


class ClusterRequest(BaseModel):
    """Request body for the /cluster endpoint."""

    embeddings: list[EmbeddingItem] = Field(
        ..., description="List of embeddings to cluster"
    )
    similarity_threshold: float = Field(
        default=0.85,
        ge=0.0,
        le=1.0,
        description="Minimum cosine similarity for grouping (0-1)",
    )
    min_samples: int = Field(
        default=2,
        ge=1,
        description="Minimum samples for DBSCAN core point",
    )


class ClusterResponse(BaseModel):
    """Response from the /cluster endpoint."""

    clusters: list[list[dict[str, Any]]]
    num_clusters: int
    num_singletons: int
    processing_time_ms: float


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/cluster",
    response_model=ClusterResponse,
    status_code=status.HTTP_200_OK,
    summary="Cluster embeddings using DBSCAN",
)
async def cluster_endpoint(request: ClusterRequest) -> ClusterResponse:
    """Cluster photo embeddings using DBSCAN with cosine distance.

    Groups visually similar photos based on their CLIP embeddings.
    Noise points (not belonging to any dense cluster) are returned
    as singleton clusters.
    """
    start = time.monotonic()

    try:
        # Convert Pydantic models to plain dicts for the service
        embedding_dicts = [
            {"asset_id": item.asset_id, "embedding": item.embedding}
            for item in request.embeddings
        ]

        clusters = cluster_embeddings(
            embedding_dicts,
            similarity_threshold=request.similarity_threshold,
            min_samples=request.min_samples,
        )

        num_singletons = sum(1 for c in clusters if len(c) == 1)
        elapsed_ms = (time.monotonic() - start) * 1000

        logger.info(
            "Clustered %d embeddings -> %d groups (%d singletons) in %.1fms",
            len(request.embeddings),
            len(clusters),
            num_singletons,
            elapsed_ms,
        )

        return ClusterResponse(
            clusters=clusters,
            num_clusters=len(clusters),
            num_singletons=num_singletons,
            processing_time_ms=round(elapsed_ms, 1),
        )

    except Exception as e:
        logger.exception("Clustering failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clustering failed: {e}",
        )
