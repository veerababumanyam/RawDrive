"""Tests for DBSCAN clustering service.

TDD RED phase: These tests define the expected behavior of cluster_embeddings.
"""

import numpy as np
import pytest

from services.clustering_service import cluster_embeddings


def _make_embedding(asset_id: str, vector: list[float]) -> dict:
    """Helper to create an embedding dict."""
    return {"asset_id": asset_id, "embedding": vector}


def _random_unit_vector(rng: np.random.Generator, dim: int = 512) -> list[float]:
    """Generate a random unit vector."""
    v = rng.standard_normal(dim)
    v = v / np.linalg.norm(v)
    return v.tolist()


def _similar_vector(base: list[float], rng: np.random.Generator, noise: float = 0.05) -> list[float]:
    """Generate a vector similar to base by adding small noise."""
    arr = np.array(base)
    perturbation = rng.standard_normal(len(base)) * noise
    result = arr + perturbation
    result = result / np.linalg.norm(result)
    return result.tolist()


class TestClusterEmbeddings:
    """Test suite for cluster_embeddings function."""

    def test_empty_input_returns_empty_list(self):
        """Empty embeddings returns empty list."""
        result = cluster_embeddings([])
        assert result == []

    def test_single_embedding_returns_singleton_cluster(self):
        """Single embedding returns one cluster containing that embedding."""
        rng = np.random.default_rng(42)
        emb = _make_embedding("asset-1", _random_unit_vector(rng))
        result = cluster_embeddings([emb])
        assert len(result) == 1
        assert len(result[0]) == 1
        assert result[0][0]["asset_id"] == "asset-1"

    def test_two_identical_embeddings_grouped(self):
        """Two identical embeddings should be in the same cluster."""
        vec = [1.0] * 512
        norm = np.linalg.norm(vec)
        vec = [v / norm for v in vec]
        emb1 = _make_embedding("asset-1", vec)
        emb2 = _make_embedding("asset-2", vec[:])
        result = cluster_embeddings([emb1, emb2], similarity_threshold=0.85, min_samples=2)
        assert len(result) == 1
        asset_ids = {e["asset_id"] for e in result[0]}
        assert asset_ids == {"asset-1", "asset-2"}

    def test_two_orthogonal_embeddings_separate(self):
        """Two orthogonal embeddings should be in separate clusters."""
        dim = 512
        vec1 = [0.0] * dim
        vec1[0] = 1.0
        vec2 = [0.0] * dim
        vec2[1] = 1.0
        emb1 = _make_embedding("asset-1", vec1)
        emb2 = _make_embedding("asset-2", vec2)
        result = cluster_embeddings([emb1, emb2], similarity_threshold=0.85, min_samples=2)
        assert len(result) == 2
        assert len(result[0]) == 1
        assert len(result[1]) == 1

    def test_mixed_similar_and_different(self):
        """Three similar + two different embeddings -> 3 clusters."""
        rng = np.random.default_rng(42)
        base = _random_unit_vector(rng)
        # Three similar vectors (close to base)
        emb1 = _make_embedding("sim-1", base)
        emb2 = _make_embedding("sim-2", _similar_vector(base, rng, noise=0.02))
        emb3 = _make_embedding("sim-3", _similar_vector(base, rng, noise=0.02))
        # Two different vectors (random, far from base)
        emb4 = _make_embedding("diff-1", _random_unit_vector(rng))
        emb5 = _make_embedding("diff-2", _random_unit_vector(rng))

        result = cluster_embeddings(
            [emb1, emb2, emb3, emb4, emb5],
            similarity_threshold=0.85,
            min_samples=2,
        )
        # Should have 3 clusters: 1 group of 3 similar, 2 singletons
        assert len(result) == 3
        # Find the big cluster
        sizes = sorted([len(c) for c in result], reverse=True)
        assert sizes[0] == 3
        assert sizes[1] == 1
        assert sizes[2] == 1

    def test_lower_threshold_groups_more(self):
        """Lower similarity_threshold should group more liberally."""
        rng = np.random.default_rng(42)
        base = _random_unit_vector(rng)
        # Create 4 vectors with moderate similarity
        embeddings = [_make_embedding(f"a-{i}", _similar_vector(base, rng, noise=0.15)) for i in range(4)]

        strict = cluster_embeddings(embeddings, similarity_threshold=0.95, min_samples=2)
        liberal = cluster_embeddings(embeddings, similarity_threshold=0.5, min_samples=2)

        # Liberal threshold should produce fewer or equal clusters
        assert len(liberal) <= len(strict)

    def test_all_same_embedding_one_cluster(self):
        """All identical embeddings form one big cluster."""
        vec = [0.0] * 512
        vec[0] = 1.0
        embeddings = [_make_embedding(f"asset-{i}", vec[:]) for i in range(10)]
        result = cluster_embeddings(embeddings, similarity_threshold=0.85, min_samples=2)
        assert len(result) == 1
        assert len(result[0]) == 10

    def test_min_samples_parameter(self):
        """Higher min_samples requires more neighbors to form a cluster."""
        rng = np.random.default_rng(42)
        base = _random_unit_vector(rng)
        # 3 similar vectors
        embeddings = [
            _make_embedding("a", base),
            _make_embedding("b", _similar_vector(base, rng, noise=0.02)),
            _make_embedding("c", _similar_vector(base, rng, noise=0.02)),
        ]

        # With min_samples=2, they form a cluster
        result_2 = cluster_embeddings(embeddings, similarity_threshold=0.85, min_samples=2)
        cluster_sizes_2 = sorted([len(c) for c in result_2], reverse=True)

        # With min_samples=4 (more than we have), all become singletons
        result_4 = cluster_embeddings(embeddings, similarity_threshold=0.85, min_samples=4)

        assert cluster_sizes_2[0] == 3  # grouped with min_samples=2
        assert len(result_4) == 3  # all singletons with min_samples=4
