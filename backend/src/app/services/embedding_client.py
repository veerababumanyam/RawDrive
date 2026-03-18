"""HTTP client for ai-processing-service embedding API.

Sends image object keys to ai-processing-service for CLIP embedding
computation. Backend never runs ML inference locally -- all inference
is offloaded to the ai-processing-service container.

Feature: 06-ai-ml-pipeline
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# Default service URL (Docker network name)
_DEFAULT_AI_PROCESSING_URL = "http://rawdrive-ai-processing:8012"

# Timeout for batch CLIP processing (can be slow for large batches)
_REQUEST_TIMEOUT = 120.0


class EmbeddingClient:
    """HTTP client to ai-processing-service for CLIP embeddings.

    Calls POST /api/v1/embed/images on the ai-processing-service
    to compute 512-dimensional CLIP embeddings for a batch of images.
    """

    def __init__(self, base_url: Optional[str] = None):
        """Initialize EmbeddingClient.

        Args:
            base_url: Base URL of ai-processing-service.
                      Defaults to http://rawdrive-ai-processing:8012.
        """
        self.base_url = (base_url or _DEFAULT_AI_PROCESSING_URL).rstrip("/")
        logger.info(f"EmbeddingClient initialized (base_url={self.base_url})")

    async def embed_images(
        self, image_urls: list[str], workspace_id: str
    ) -> list[dict[str, Any]]:
        """Compute CLIP embeddings for a batch of images via HTTP.

        Args:
            image_urls: List of R2 object keys to embed.
            workspace_id: Workspace ID for tenant context.

        Returns:
            List of dicts with keys 'url' and 'embedding' (512-dim float list).

        Raises:
            httpx.HTTPStatusError: On non-2xx response.
            httpx.ConnectError: On connection failure (retried once).
        """
        url = f"{self.base_url}/api/v1/embed/images"
        payload = {
            "image_urls": image_urls,
            "workspace_id": workspace_id,
        }

        last_error: Optional[Exception] = None

        # Retry once on connection error
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                    response = await client.post(url, json=payload)
                    response.raise_for_status()

                data = response.json()
                embeddings = data.get("embeddings", [])

                logger.info(
                    "Embedding API returned %d embeddings (%.1fms)",
                    len(embeddings),
                    data.get("processing_time_ms", 0),
                )

                return [
                    {
                        "url": emb["url"],
                        "embedding": emb["embedding"],
                    }
                    for emb in embeddings
                ]

            except httpx.ConnectError as exc:
                last_error = exc
                if attempt == 0:
                    logger.warning(
                        "Connection error to ai-processing-service, retrying: %s", exc
                    )
                    continue
                raise
            except Exception:
                raise

        # Should not reach here, but satisfy type checker
        if last_error:
            raise last_error
        return []

    async def cluster_embeddings(
        self,
        embeddings: list[dict[str, Any]],
        similarity_threshold: float = 0.85,
    ) -> list[list[dict[str, Any]]]:
        """Cluster embeddings via ai-processing-service DBSCAN endpoint.

        Args:
            embeddings: List of dicts with "asset_id" and "embedding" keys.
            similarity_threshold: Minimum cosine similarity for grouping.

        Returns:
            List of clusters, each a list of embedding dicts.

        Raises:
            httpx.HTTPStatusError: On non-2xx response.
            httpx.ConnectError: On connection failure (retried once).
        """
        url = f"{self.base_url}/api/v1/clustering/cluster"
        payload = {
            "embeddings": [
                {"asset_id": str(e["asset_id"]), "embedding": e["embedding"]}
                for e in embeddings
            ],
            "similarity_threshold": similarity_threshold,
        }

        last_error: Optional[Exception] = None

        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                    response = await client.post(url, json=payload)
                    response.raise_for_status()

                data = response.json()
                clusters = data.get("clusters", [])

                logger.info(
                    "Clustering API returned %d clusters (%.1fms)",
                    len(clusters),
                    data.get("processing_time_ms", 0),
                )

                return clusters

            except httpx.ConnectError as exc:
                last_error = exc
                if attempt == 0:
                    logger.warning(
                        "Connection error to ai-processing-service clustering, retrying: %s",
                        exc,
                    )
                    continue
                raise
            except Exception:
                raise

        if last_error:
            raise last_error
        return []


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_client: Optional[EmbeddingClient] = None


def get_embedding_client() -> EmbeddingClient:
    """Get or create the singleton EmbeddingClient."""
    global _client
    if _client is None:
        _client = EmbeddingClient()
    return _client
