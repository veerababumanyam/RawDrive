"""DBSCAN clustering service for grouping similar photos by CLIP embeddings.

Uses cosine distance matrix with DBSCAN to identify groups of visually
similar photos for curation review.
"""

from __future__ import annotations

import logging
from collections import defaultdict

import numpy as np
from scipy.spatial.distance import pdist, squareform
from sklearn.cluster import DBSCAN

logger = logging.getLogger(__name__)


def cluster_embeddings(
    embeddings: list[dict],
    similarity_threshold: float = 0.85,
    min_samples: int = 2,
) -> list[list[dict]]:
    """Cluster embeddings using DBSCAN with cosine distance.

    Args:
        embeddings: List of dicts with "asset_id" and "embedding" keys.
        similarity_threshold: Minimum cosine similarity to consider two
            embeddings as neighbors (0.0 to 1.0). Higher = stricter.
        min_samples: Minimum number of samples in a neighborhood for a
            point to be considered a core point in DBSCAN.

    Returns:
        List of clusters, where each cluster is a list of embedding dicts.
        Noise points (DBSCAN label == -1) become singleton clusters.
    """
    if not embeddings:
        return []

    if len(embeddings) == 1:
        return [embeddings[:]]

    # Convert to numpy array
    vectors = np.array([e["embedding"] for e in embeddings], dtype=np.float64)

    # Compute pairwise cosine distance matrix
    # cosine distance = 1 - cosine similarity
    distances = squareform(pdist(vectors, metric="cosine"))

    # Clamp tiny negative values from floating point errors
    distances = np.clip(distances, 0.0, 2.0)

    # eps = 1 - similarity_threshold
    # e.g., threshold 0.85 -> eps 0.15 (points within 0.15 cosine distance are neighbors)
    eps = 1.0 - similarity_threshold

    # Run DBSCAN with precomputed distance matrix
    labels = DBSCAN(
        eps=eps,
        min_samples=min_samples,
        metric="precomputed",
    ).fit_predict(distances)

    # Group embeddings by cluster label
    clusters: defaultdict[int, list[dict]] = defaultdict(list)
    singleton_list: list[list[dict]] = []

    for i, label in enumerate(labels):
        if label == -1:
            # Noise points become singleton clusters
            singleton_list.append([embeddings[i]])
        else:
            clusters[label].append(embeddings[i])

    # Combine: real clusters first, then singletons
    result: list[list[dict]] = list(clusters.values()) + singleton_list

    logger.info(
        "Clustered %d embeddings into %d groups (%d clusters, %d singletons)",
        len(embeddings),
        len(result),
        len(clusters),
        len(singleton_list),
    )

    return result
