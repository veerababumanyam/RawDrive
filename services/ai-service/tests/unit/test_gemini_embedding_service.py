"""Unit Tests for GeminiEmbeddingService.

Tests Gemini API embedding generation, similarity calculation, and duplicate detection.
Uses customer-configured Gemini API keys (no local models).

Phase 2: AI Duplicate Detection
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import numpy as np

from services.gemini_embedding_service import (
    GeminiEmbeddingService,
    get_gemini_embedding_service,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def gemini_embedding_service():
    """Return a GeminiEmbeddingService instance."""
    return get_gemini_embedding_service()


@pytest.fixture
def sample_client_data():
    """Sample client data for embedding generation."""
    return {
        "full_name": "John Doe",
        "primary_email": "john.doe@example.com",
        "primary_phone": "+1-555-123-4567",
        "address": "123 Main St, City, State 12345",
    }


@pytest.fixture
def sample_client_data_similar():
    """Similar client data (typo in name)."""
    return {
        "full_name": "Jon Doe",  # Typo
        "primary_email": "john.doe@example.com",
        "primary_phone": "+1-555-123-4567",
        "address": "123 Main St, City, State 12345",
    }


@pytest.fixture
def sample_client_data_different():
    """Different client data."""
    return {
        "full_name": "Jane Smith",
        "primary_email": "jane.smith@example.com",
        "primary_phone": "+1-555-987-6543",
        "address": "456 Oak Ave, Town, State 54321",
    }


@pytest.fixture
def mock_gemini_embedding_768d():
    """Mock 768-dimensional Gemini embedding."""
    # Create normalized random vector
    vec = np.random.randn(768)
    vec = vec / np.linalg.norm(vec)
    return vec.tolist()


@pytest.fixture
def mock_gemini_api():
    """Mock Google Generative AI API."""
    with patch("services.gemini_embedding_service.genai") as mock_genai:
        yield mock_genai


@pytest.fixture
def mock_config_service():
    """Mock FaceConfigurationService for credential loading."""
    mock_service = AsyncMock()
    mock_service.get_provider_credentials.return_value = {
        "api_key": "test-gemini-api-key-12345",
        "model": "models/embedding-001",
    }
    return mock_service


# ---------------------------------------------------------------------------
# Test Client Initialization
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ensure_client_success(
    gemini_embedding_service,
    mock_config_service,
    mock_gemini_api
):
    """Test successful Gemini client initialization."""
    gemini_embedding_service._config_service = mock_config_service

    await gemini_embedding_service._ensure_client()

    # Verify API key configuration
    mock_gemini_api.configure.assert_called_once_with(api_key="test-gemini-api-key-12345")
    assert gemini_embedding_service._gen_ai is not None


@pytest.mark.asyncio
async def test_ensure_client_missing_api_key(
    gemini_embedding_service,
    mock_config_service
):
    """Test client initialization with missing API key."""
    mock_config_service.get_provider_credentials.return_value = {}
    gemini_embedding_service._config_service = mock_config_service

    with pytest.raises(ValueError, match="Gemini API key not configured"):
        await gemini_embedding_service._ensure_client()


@pytest.mark.asyncio
async def test_ensure_client_caching(
    gemini_embedding_service,
    mock_config_service,
    mock_gemini_api
):
    """Test that client is cached after first initialization."""
    gemini_embedding_service._config_service = mock_config_service

    # First call
    await gemini_embedding_service._ensure_client()
    first_client = gemini_embedding_service._gen_ai

    # Second call
    await gemini_embedding_service._ensure_client()
    second_client = gemini_embedding_service._gen_ai

    # Should be the same instance (cached)
    assert first_client is second_client
    # Configure should only be called once
    assert mock_gemini_api.configure.call_count == 1


# ---------------------------------------------------------------------------
# Test Client Text Construction
# ---------------------------------------------------------------------------


def test_construct_client_text_full_data(gemini_embedding_service, sample_client_data):
    """Test client text construction with all fields."""
    text = gemini_embedding_service._construct_client_text(sample_client_data)

    assert "John Doe" in text
    assert "john.doe@example.com" in text
    assert "+1-555-123-4567" in text
    assert "123 Main St, City, State 12345" in text


def test_construct_client_text_partial_data(gemini_embedding_service):
    """Test client text construction with partial data."""
    partial_data = {
        "full_name": "John Doe",
        "primary_email": "john.doe@example.com",
    }

    text = gemini_embedding_service._construct_client_text(partial_data)

    assert "John Doe" in text
    assert "john.doe@example.com" in text
    assert "Phone:" not in text  # No phone provided
    assert "Address:" not in text  # No address provided


def test_construct_client_text_name_only(gemini_embedding_service):
    """Test client text construction with only name."""
    minimal_data = {
        "full_name": "John Doe",
    }

    text = gemini_embedding_service._construct_client_text(minimal_data)

    assert "John Doe" in text
    assert len(text) > 0


def test_construct_client_text_normalization(gemini_embedding_service):
    """Test that client text is normalized (lowercase, trimmed)."""
    data = {
        "full_name": "  JOHN DOE  ",
        "primary_email": "  JOHN.DOE@EXAMPLE.COM  ",
    }

    text = gemini_embedding_service._construct_client_text(data)

    # Text should be normalized
    assert "john doe" in text.lower()
    assert "john.doe@example.com" in text.lower()


# ---------------------------------------------------------------------------
# Test Embedding Generation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_client_embedding_success(
    gemini_embedding_service,
    sample_client_data,
    mock_gemini_api,
    mock_config_service,
    mock_gemini_embedding_768d
):
    """Test successful client embedding generation."""
    gemini_embedding_service._config_service = mock_config_service

    # Mock Gemini API response
    mock_response = {"embedding": mock_gemini_embedding_768d}
    mock_gemini_api.embed_content.return_value = mock_response

    # Initialize client
    await gemini_embedding_service._ensure_client()
    gemini_embedding_service._gen_ai = mock_gemini_api

    # Generate embedding
    embedding = await gemini_embedding_service.generate_client_embedding(sample_client_data)

    # Verify embedding
    assert isinstance(embedding, list)
    assert len(embedding) == 768  # Gemini embedding dimension
    assert all(isinstance(x, (int, float)) for x in embedding)

    # Verify API call
    mock_gemini_api.embed_content.assert_called_once()
    call_kwargs = mock_gemini_api.embed_content.call_args[1]
    assert call_kwargs["model"] == "models/embedding-001"
    assert call_kwargs["task_type"] == "semantic_similarity"


@pytest.mark.asyncio
async def test_generate_client_embedding_api_error(
    gemini_embedding_service,
    sample_client_data,
    mock_gemini_api,
    mock_config_service
):
    """Test embedding generation with API error."""
    gemini_embedding_service._config_service = mock_config_service

    # Mock API error
    mock_gemini_api.embed_content.side_effect = Exception("Gemini API error")

    # Initialize client
    await gemini_embedding_service._ensure_client()
    gemini_embedding_service._gen_ai = mock_gemini_api

    # Should raise error
    with pytest.raises(Exception, match="Gemini API error"):
        await gemini_embedding_service.generate_client_embedding(sample_client_data)


# ---------------------------------------------------------------------------
# Test Batch Embedding Generation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batch_generate_embeddings_success(
    gemini_embedding_service,
    sample_client_data,
    sample_client_data_different,
    mock_gemini_api,
    mock_config_service,
    mock_gemini_embedding_768d
):
    """Test batch embedding generation."""
    gemini_embedding_service._config_service = mock_config_service

    clients = [
        {"client_id": "client1", **sample_client_data},
        {"client_id": "client2", **sample_client_data_different},
    ]

    # Mock Gemini API responses (different embeddings for different clients)
    def mock_embed_content(**kwargs):
        # Return different embeddings based on content
        content = kwargs.get("content", "")
        if "John Doe" in content:
            return {"embedding": mock_gemini_embedding_768d}
        else:
            # Different random embedding
            vec = np.random.randn(768)
            vec = vec / np.linalg.norm(vec)
            return {"embedding": vec.tolist()}

    mock_gemini_api.embed_content.side_effect = mock_embed_content

    # Initialize client
    await gemini_embedding_service._ensure_client()
    gemini_embedding_service._gen_ai = mock_gemini_api

    # Generate embeddings
    results = await gemini_embedding_service.batch_generate_embeddings(clients)

    # Verify results
    assert len(results) == 2
    assert results[0]["client_id"] == "client1"
    assert results[1]["client_id"] == "client2"
    assert len(results[0]["embedding"]) == 768
    assert len(results[1]["embedding"]) == 768

    # Verify API was called twice
    assert mock_gemini_api.embed_content.call_count == 2


@pytest.mark.asyncio
async def test_batch_generate_embeddings_empty_list(gemini_embedding_service):
    """Test batch generation with empty list."""
    results = await gemini_embedding_service.batch_generate_embeddings([])

    assert results == []


@pytest.mark.asyncio
async def test_batch_generate_embeddings_error_handling(
    gemini_embedding_service,
    sample_client_data,
    mock_gemini_api,
    mock_config_service
):
    """Test batch generation with some failures."""
    gemini_embedding_service._config_service = mock_config_service

    clients = [
        {"client_id": "client1", **sample_client_data},
        {"client_id": "client2", "full_name": "Invalid"},  # Will cause error
        {"client_id": "client3", **sample_client_data},
    ]

    # Mock API - fail on second call
    call_count = 0

    def mock_embed_content(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise Exception("API error")
        vec = np.random.randn(768)
        vec = vec / np.linalg.norm(vec)
        return {"embedding": vec.tolist()}

    mock_gemini_api.embed_content.side_effect = mock_embed_content

    # Initialize client
    await gemini_embedding_service._ensure_client()
    gemini_embedding_service._gen_ai = mock_gemini_api

    # Generate embeddings (should skip failed client)
    results = await gemini_embedding_service.batch_generate_embeddings(clients)

    # Should have 2 successful results (client1 and client3)
    assert len(results) == 2
    assert results[0]["client_id"] == "client1"
    assert results[1]["client_id"] == "client3"


# ---------------------------------------------------------------------------
# Test Cosine Similarity
# ---------------------------------------------------------------------------


def test_compute_cosine_similarity_identical(gemini_embedding_service):
    """Test cosine similarity for identical embeddings."""
    emb = [1.0] * 768
    similarity = gemini_embedding_service.compute_cosine_similarity(emb, emb)

    assert similarity == pytest.approx(1.0, abs=1e-6)


def test_compute_cosine_similarity_orthogonal(gemini_embedding_service):
    """Test cosine similarity for orthogonal embeddings."""
    emb1 = [1.0] + [0.0] * 767
    emb2 = [0.0, 1.0] + [0.0] * 766

    similarity = gemini_embedding_service.compute_cosine_similarity(emb1, emb2)

    assert similarity == pytest.approx(0.0, abs=1e-6)


def test_compute_cosine_similarity_opposite(gemini_embedding_service):
    """Test cosine similarity for opposite embeddings."""
    emb1 = [1.0] * 768
    emb2 = [-1.0] * 768

    similarity = gemini_embedding_service.compute_cosine_similarity(emb1, emb2)

    assert similarity == pytest.approx(-1.0, abs=1e-6)


def test_compute_cosine_similarity_normalized(gemini_embedding_service):
    """Test cosine similarity with normalized vectors."""
    # Create two normalized random vectors
    vec1 = np.random.randn(768)
    vec1 = vec1 / np.linalg.norm(vec1)

    vec2 = np.random.randn(768)
    vec2 = vec2 / np.linalg.norm(vec2)

    similarity = gemini_embedding_service.compute_cosine_similarity(
        vec1.tolist(),
        vec2.tolist()
    )

    # Similarity should be in [-1, 1]
    assert -1.0 <= similarity <= 1.0


def test_compute_cosine_similarity_zero_vector(gemini_embedding_service):
    """Test cosine similarity with zero vector."""
    emb1 = [1.0] * 768
    emb2 = [0.0] * 768

    # Should handle zero vector gracefully (or raise error)
    try:
        similarity = gemini_embedding_service.compute_cosine_similarity(emb1, emb2)
        assert similarity == 0.0  # Undefined, but handled as 0
    except (ValueError, ZeroDivisionError):
        pass  # Acceptable to raise error


# ---------------------------------------------------------------------------
# Test Find Similar Clients
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_similar_clients_exact_match(gemini_embedding_service):
    """Test finding similar clients with exact match."""
    target_emb = [1.0] + [0.0] * 767
    all_embeddings = [
        {"client_id": "client1", "embedding": [1.0] + [0.0] * 767},  # Exact match
        {"client_id": "client2", "embedding": [0.0, 1.0] + [0.0] * 766},  # Orthogonal
    ]

    similar = await gemini_embedding_service.find_similar_clients(
        target_emb,
        all_embeddings,
        threshold=0.99
    )

    assert len(similar) == 1
    assert similar[0]["client_id"] == "client1"
    assert similar[0]["similarity"] == pytest.approx(1.0, abs=1e-6)


@pytest.mark.asyncio
async def test_find_similar_clients_threshold(gemini_embedding_service):
    """Test finding similar clients with threshold."""
    target_emb = [1.0] + [0.0] * 767

    # Create embeddings with varying similarity
    all_embeddings = [
        {"client_id": "client1", "embedding": [1.0] + [0.0] * 767},  # 100% similar
        {"client_id": "client2", "embedding": [0.9] + [0.1] + [0.0] * 766},  # ~99% similar
        {"client_id": "client3", "embedding": [0.5] + [0.5] + [0.0] * 766},  # ~70% similar
        {"client_id": "client4", "embedding": [0.0, 1.0] + [0.0] * 766},  # 0% similar
    ]

    similar = await gemini_embedding_service.find_similar_clients(
        target_emb,
        all_embeddings,
        threshold=0.90
    )

    # Should find client1 and client2 (above 90% threshold)
    assert len(similar) >= 2
    client_ids = [s["client_id"] for s in similar]
    assert "client1" in client_ids
    assert "client2" in client_ids


@pytest.mark.asyncio
async def test_find_similar_clients_empty_list(gemini_embedding_service):
    """Test finding similar clients with empty list."""
    target_emb = [1.0] * 768

    similar = await gemini_embedding_service.find_similar_clients(
        target_emb,
        [],
        threshold=0.75
    )

    assert similar == []


# ---------------------------------------------------------------------------
# Test Duplicate Detection Helpers
# ---------------------------------------------------------------------------


def test_is_likely_duplicate_strict_mode(gemini_embedding_service):
    """Test duplicate detection in strict mode."""
    # Strict mode: threshold 0.90
    assert gemini_embedding_service.is_likely_duplicate(0.91, strict=True) is True
    assert gemini_embedding_service.is_likely_duplicate(0.89, strict=True) is False


def test_is_likely_duplicate_normal_mode(gemini_embedding_service):
    """Test duplicate detection in normal mode."""
    # Normal mode: threshold 0.75
    assert gemini_embedding_service.is_likely_duplicate(0.76, strict=False) is True
    assert gemini_embedding_service.is_likely_duplicate(0.74, strict=False) is False


# ---------------------------------------------------------------------------
# Test Singleton Pattern
# ---------------------------------------------------------------------------


def test_singleton_pattern():
    """Test that get_gemini_embedding_service returns same instance."""
    service1 = get_gemini_embedding_service()
    service2 = get_gemini_embedding_service()

    assert service1 is service2


# ---------------------------------------------------------------------------
# Integration Test: Full Workflow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_duplicate_detection_workflow(
    gemini_embedding_service,
    sample_client_data,
    sample_client_data_similar,
    sample_client_data_different,
    mock_gemini_api,
    mock_config_service
):
    """Test complete client duplicate detection workflow."""
    gemini_embedding_service._config_service = mock_config_service

    # Prepare clients
    clients = [
        {"client_id": "client1", **sample_client_data},
        {"client_id": "client2", **sample_client_data_similar},  # Similar
        {"client_id": "client3", **sample_client_data_different},  # Different
    ]

    # Mock Gemini API with consistent embeddings
    def mock_embed_content(**kwargs):
        content = kwargs.get("content", "")
        # Generate similar embeddings for similar content
        if "john" in content.lower() or "jon" in content.lower():
            # Use similar base vector with slight variation
            base = np.array([1.0] + [0.0] * 767)
            if "jon" in content.lower():  # Slight variation for typo
                base[0] = 0.98
                base[1] = 0.02
            vec = base / np.linalg.norm(base)
            return {"embedding": vec.tolist()}
        else:
            # Completely different vector for Jane
            vec = np.array([0.0, 0.0, 1.0] + [0.0] * 765)
            vec = vec / np.linalg.norm(vec)
            return {"embedding": vec.tolist()}

    mock_gemini_api.embed_content.side_effect = mock_embed_content

    # Initialize client
    await gemini_embedding_service._ensure_client()
    gemini_embedding_service._gen_ai = mock_gemini_api

    # Step 1: Generate embeddings
    emb_results = await gemini_embedding_service.batch_generate_embeddings(clients)
    assert len(emb_results) == 3

    # Step 2: Find duplicates for client1
    client1_emb = next(r["embedding"] for r in emb_results if r["client_id"] == "client1")

    similar = await gemini_embedding_service.find_similar_clients(
        client1_emb,
        [{"client_id": r["client_id"], "embedding": r["embedding"]} for r in emb_results],
        threshold=0.75
    )

    # Should find client1 and client2 (similar)
    assert len(similar) >= 2
    client_ids = [s["client_id"] for s in similar]
    assert "client1" in client_ids
    assert "client2" in client_ids

    # Step 3: Verify duplicate detection
    for sim in similar:
        is_dup = gemini_embedding_service.is_likely_duplicate(sim["similarity"])
        assert is_dup is True  # Should detect both as duplicates
