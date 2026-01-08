"""Unit Tests for PerceptualHashService.

Tests perceptual hash computation, similarity calculation, and duplicate detection.

Phase 2: AI Duplicate Detection
"""

import pytest
from io import BytesIO
from PIL import Image
import imagehash

from services.perceptual_hash_service import (
    PerceptualHashService,
    get_perceptual_hash_service,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def perceptual_hash_service():
    """Return a PerceptualHashService instance."""
    return get_perceptual_hash_service()


@pytest.fixture
def sample_image_bytes():
    """Create a sample 100x100 red image."""
    img = Image.new('RGB', (100, 100), color='red')
    buffer = BytesIO()
    img.save(buffer, format='JPEG')
    buffer.seek(0)
    return buffer.getvalue()


@pytest.fixture
def sample_image_bytes_similar():
    """Create a similar 100x100 image (slightly different red)."""
    img = Image.new('RGB', (100, 100), color=(255, 10, 10))
    buffer = BytesIO()
    img.save(buffer, format='JPEG')
    buffer.seek(0)
    return buffer.getvalue()


@pytest.fixture
def sample_image_bytes_different():
    """Create a different 100x100 blue image."""
    img = Image.new('RGB', (100, 100), color='blue')
    buffer = BytesIO()
    img.save(buffer, format='JPEG')
    buffer.seek(0)
    return buffer.getvalue()


@pytest.fixture
def sample_image_resized():
    """Create a resized version (200x200) of the red image."""
    img = Image.new('RGB', (200, 200), color='red')
    buffer = BytesIO()
    img.save(buffer, format='JPEG')
    buffer.seek(0)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Test Hash Computation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_phash_success(perceptual_hash_service, sample_image_bytes):
    """Test successful perceptual hash computation."""
    phash = await perceptual_hash_service.compute_phash(sample_image_bytes)

    # pHash should be 16-character hex string
    assert isinstance(phash, str)
    assert len(phash) == 16
    assert all(c in '0123456789abcdef' for c in phash)


@pytest.mark.asyncio
async def test_compute_phash_consistency(perceptual_hash_service, sample_image_bytes):
    """Test that same image produces same hash."""
    phash1 = await perceptual_hash_service.compute_phash(sample_image_bytes)
    phash2 = await perceptual_hash_service.compute_phash(sample_image_bytes)

    assert phash1 == phash2


@pytest.mark.asyncio
async def test_compute_phash_invalid_image(perceptual_hash_service):
    """Test hash computation with invalid image data."""
    invalid_bytes = b"not an image"

    with pytest.raises(Exception):  # Should raise PIL error
        await perceptual_hash_service.compute_phash(invalid_bytes)


@pytest.mark.asyncio
async def test_compute_phash_empty_image(perceptual_hash_service):
    """Test hash computation with empty bytes."""
    empty_bytes = b""

    with pytest.raises(Exception):
        await perceptual_hash_service.compute_phash(empty_bytes)


@pytest.mark.asyncio
async def test_compute_phash_resize_robustness(
    perceptual_hash_service,
    sample_image_bytes,
    sample_image_resized
):
    """Test that resized images produce similar hashes."""
    phash_original = await perceptual_hash_service.compute_phash(sample_image_bytes)
    phash_resized = await perceptual_hash_service.compute_phash(sample_image_resized)

    # Should be the same or very similar (perceptual hash is resize-invariant)
    similarity = perceptual_hash_service.compute_similarity(phash_original, phash_resized)
    assert similarity > 0.90  # At least 90% similar


# ---------------------------------------------------------------------------
# Test Hamming Distance
# ---------------------------------------------------------------------------


def test_compute_hamming_distance_identical(perceptual_hash_service):
    """Test Hamming distance for identical hashes."""
    hash1 = "0123456789abcdef"
    hash2 = "0123456789abcdef"

    distance = perceptual_hash_service.compute_hamming_distance(hash1, hash2)
    assert distance == 0


def test_compute_hamming_distance_different(perceptual_hash_service):
    """Test Hamming distance for completely different hashes."""
    hash1 = "0000000000000000"
    hash2 = "ffffffffffffffff"

    distance = perceptual_hash_service.compute_hamming_distance(hash1, hash2)
    assert distance == 64  # All 64 bits differ


def test_compute_hamming_distance_partial(perceptual_hash_service):
    """Test Hamming distance for partially different hashes."""
    hash1 = "0000000000000000"
    hash2 = "0000000000000001"  # 1 bit different

    distance = perceptual_hash_service.compute_hamming_distance(hash1, hash2)
    assert distance == 1


def test_compute_hamming_distance_invalid_length(perceptual_hash_service):
    """Test Hamming distance with invalid hash length."""
    hash1 = "0123456789abcdef"
    hash2 = "0123456789abcd"  # Too short

    with pytest.raises(ValueError):
        perceptual_hash_service.compute_hamming_distance(hash1, hash2)


# ---------------------------------------------------------------------------
# Test Similarity Calculation
# ---------------------------------------------------------------------------


def test_compute_similarity_identical(perceptual_hash_service):
    """Test similarity for identical hashes (100% similar)."""
    hash1 = "0123456789abcdef"
    hash2 = "0123456789abcdef"

    similarity = perceptual_hash_service.compute_similarity(hash1, hash2)
    assert similarity == 1.0


def test_compute_similarity_completely_different(perceptual_hash_service):
    """Test similarity for completely different hashes (0% similar)."""
    hash1 = "0000000000000000"
    hash2 = "ffffffffffffffff"

    similarity = perceptual_hash_service.compute_similarity(hash1, hash2)
    assert similarity == 0.0


def test_compute_similarity_partial(perceptual_hash_service):
    """Test similarity for partially similar hashes."""
    hash1 = "0000000000000000"
    hash2 = "0000000000000001"  # 1 bit different (63/64 bits match)

    similarity = perceptual_hash_service.compute_similarity(hash1, hash2)
    expected = 1.0 - (1.0 / 64.0)  # 63/64 = 0.984375
    assert abs(similarity - expected) < 0.001


def test_compute_similarity_range(perceptual_hash_service):
    """Test that similarity is always in range [0, 1]."""
    hash1 = "0123456789abcdef"
    hash2 = "fedcba9876543210"

    similarity = perceptual_hash_service.compute_similarity(hash1, hash2)
    assert 0.0 <= similarity <= 1.0


# ---------------------------------------------------------------------------
# Test Batch Hash Computation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batch_compute_phashes_success(
    perceptual_hash_service,
    sample_image_bytes,
    sample_image_bytes_different
):
    """Test batch hash computation."""
    image_data_list = [
        {"asset_id": "asset1", "image_bytes": sample_image_bytes},
        {"asset_id": "asset2", "image_bytes": sample_image_bytes_different},
    ]

    results = await perceptual_hash_service.batch_compute_phashes(image_data_list)

    assert len(results) == 2
    assert results[0]["asset_id"] == "asset1"
    assert results[1]["asset_id"] == "asset2"
    assert len(results[0]["phash"]) == 16
    assert len(results[1]["phash"]) == 16
    assert results[0]["phash"] != results[1]["phash"]  # Different images


@pytest.mark.asyncio
async def test_batch_compute_phashes_empty_list(perceptual_hash_service):
    """Test batch computation with empty list."""
    results = await perceptual_hash_service.batch_compute_phashes([])

    assert results == []


@pytest.mark.asyncio
async def test_batch_compute_phashes_error_handling(
    perceptual_hash_service,
    sample_image_bytes
):
    """Test batch computation with some invalid images."""
    image_data_list = [
        {"asset_id": "asset1", "image_bytes": sample_image_bytes},
        {"asset_id": "asset2", "image_bytes": b"invalid"},
        {"asset_id": "asset3", "image_bytes": sample_image_bytes},
    ]

    results = await perceptual_hash_service.batch_compute_phashes(image_data_list)

    # Should skip invalid image but process others
    assert len(results) == 2
    assert results[0]["asset_id"] == "asset1"
    assert results[1]["asset_id"] == "asset3"


# ---------------------------------------------------------------------------
# Test Find Similar Hashes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_similar_hashes_exact_match(perceptual_hash_service):
    """Test finding similar hashes with exact match."""
    target_hash = "0123456789abcdef"
    all_hashes = [
        {"asset_id": "asset1", "phash": "0123456789abcdef"},
        {"asset_id": "asset2", "phash": "fedcba9876543210"},
        {"asset_id": "asset3", "phash": "0000000000000000"},
    ]

    similar = await perceptual_hash_service.find_similar_hashes(
        target_hash,
        all_hashes,
        threshold=0.99
    )

    assert len(similar) == 1
    assert similar[0]["asset_id"] == "asset1"
    assert similar[0]["similarity"] == 1.0


@pytest.mark.asyncio
async def test_find_similar_hashes_threshold(perceptual_hash_service):
    """Test finding similar hashes with threshold."""
    target_hash = "0000000000000000"
    all_hashes = [
        {"asset_id": "asset1", "phash": "0000000000000000"},  # 100% similar
        {"asset_id": "asset2", "phash": "0000000000000001"},  # 98.4% similar (1 bit diff)
        {"asset_id": "asset3", "phash": "000000000000000f"},  # 93.75% similar (4 bits diff)
        {"asset_id": "asset4", "phash": "ffffffffffffffff"},  # 0% similar
    ]

    similar = await perceptual_hash_service.find_similar_hashes(
        target_hash,
        all_hashes,
        threshold=0.95
    )

    # Should find asset1 (100%) and asset2 (98.4%)
    assert len(similar) == 2
    assert similar[0]["asset_id"] in ["asset1", "asset2"]
    assert similar[1]["asset_id"] in ["asset1", "asset2"]


@pytest.mark.asyncio
async def test_find_similar_hashes_empty_list(perceptual_hash_service):
    """Test finding similar hashes with empty list."""
    target_hash = "0123456789abcdef"

    similar = await perceptual_hash_service.find_similar_hashes(
        target_hash,
        [],
        threshold=0.85
    )

    assert similar == []


@pytest.mark.asyncio
async def test_find_similar_hashes_no_matches(perceptual_hash_service):
    """Test finding similar hashes with no matches above threshold."""
    target_hash = "0000000000000000"
    all_hashes = [
        {"asset_id": "asset1", "phash": "ffffffffffffffff"},
        {"asset_id": "asset2", "phash": "fedcba9876543210"},
    ]

    similar = await perceptual_hash_service.find_similar_hashes(
        target_hash,
        all_hashes,
        threshold=0.85
    )

    assert similar == []


# ---------------------------------------------------------------------------
# Test Duplicate Detection Helpers
# ---------------------------------------------------------------------------


def test_is_likely_duplicate_strict_mode(perceptual_hash_service):
    """Test duplicate detection in strict mode."""
    # Strict mode: threshold 0.95
    assert perceptual_hash_service.is_likely_duplicate(0.96, strict=True) is True
    assert perceptual_hash_service.is_likely_duplicate(0.94, strict=True) is False


def test_is_likely_duplicate_normal_mode(perceptual_hash_service):
    """Test duplicate detection in normal mode."""
    # Normal mode: threshold 0.85
    assert perceptual_hash_service.is_likely_duplicate(0.86, strict=False) is True
    assert perceptual_hash_service.is_likely_duplicate(0.84, strict=False) is False


def test_is_likely_duplicate_edge_cases(perceptual_hash_service):
    """Test duplicate detection edge cases."""
    # Exact threshold values
    assert perceptual_hash_service.is_likely_duplicate(0.85, strict=False) is True
    assert perceptual_hash_service.is_likely_duplicate(0.95, strict=True) is True

    # Extreme values
    assert perceptual_hash_service.is_likely_duplicate(1.0, strict=False) is True
    assert perceptual_hash_service.is_likely_duplicate(0.0, strict=False) is False


# ---------------------------------------------------------------------------
# Test Singleton Pattern
# ---------------------------------------------------------------------------


def test_singleton_pattern():
    """Test that get_perceptual_hash_service returns same instance."""
    service1 = get_perceptual_hash_service()
    service2 = get_perceptual_hash_service()

    assert service1 is service2


# ---------------------------------------------------------------------------
# Integration Test: Full Workflow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_duplicate_detection_workflow(
    perceptual_hash_service,
    sample_image_bytes,
    sample_image_bytes_similar,
    sample_image_bytes_different
):
    """Test complete duplicate detection workflow."""
    # Step 1: Compute hashes for all images
    image_data_list = [
        {"asset_id": "photo1", "image_bytes": sample_image_bytes},
        {"asset_id": "photo2", "image_bytes": sample_image_bytes_similar},
        {"asset_id": "photo3", "image_bytes": sample_image_bytes_different},
    ]

    hash_results = await perceptual_hash_service.batch_compute_phashes(image_data_list)
    assert len(hash_results) == 3

    # Step 2: Find duplicates for photo1
    photo1_hash = next(r["phash"] for r in hash_results if r["asset_id"] == "photo1")

    similar = await perceptual_hash_service.find_similar_hashes(
        photo1_hash,
        [{"asset_id": r["asset_id"], "phash": r["phash"]} for r in hash_results],
        threshold=0.85
    )

    # Should find photo1 (itself) and photo2 (similar)
    assert len(similar) >= 1  # At minimum, itself

    # Step 3: Check duplicate status
    for sim in similar:
        is_dup = perceptual_hash_service.is_likely_duplicate(sim["similarity"])
        if sim["asset_id"] == "photo1":
            assert is_dup is True  # Identical to itself
        elif sim["asset_id"] == "photo2":
            # Similar image should be detected as duplicate
            assert sim["similarity"] > 0.80
