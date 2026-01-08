"""Perceptual hashing service for visual duplicate detection.

Uses pHash algorithm to detect visually similar images even if they have been
resized, compressed, or slightly modified.

Phase 2: AI Duplicate Detection
"""

from __future__ import annotations

import logging
from io import BytesIO
from typing import List, Tuple, Optional
from uuid import UUID

import imagehash
from PIL import Image

logger = logging.getLogger(__name__)


class PerceptualHashError(Exception):
    """Base exception for perceptual hash errors."""
    pass


class ImageProcessingError(PerceptualHashError):
    """Raised when image cannot be processed."""
    pass


class PerceptualHashService:
    """Service for computing and comparing perceptual hashes.

    Uses pHash (perceptual hash) algorithm which creates a fingerprint of
    an image based on frequency domain analysis. Similar images will have
    similar hashes, enabling duplicate detection even after modifications.

    Hash Format: 16-character hexadecimal string (64-bit hash)
    Example: "8f373fc0ffc4f800"
    """

    def __init__(self, hash_size: int = 8):
        """Initialize perceptual hash service.

        Args:
            hash_size: Size of hash grid (default 8x8 = 64 bits)
                      Higher values = more precise but less tolerant to modifications
        """
        self.hash_size = hash_size
        self.max_hamming_distance = hash_size * hash_size  # 64 for 8x8

    async def compute_phash(self, image_bytes: bytes) -> str:
        """Compute perceptual hash for an image.

        Args:
            image_bytes: Raw image data (JPEG, PNG, etc.)

        Returns:
            16-character hex string representing the perceptual hash

        Raises:
            ImageProcessingError: If image cannot be processed

        Example:
            >>> service = PerceptualHashService()
            >>> hash_value = await service.compute_phash(image_data)
            >>> print(hash_value)
            "8f373fc0ffc4f800"
        """
        try:
            # Open image from bytes
            img = Image.open(BytesIO(image_bytes))

            # Convert to RGB if needed (handles RGBA, grayscale, etc.)
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')

            # Compute perceptual hash using DCT-based algorithm
            phash = imagehash.phash(img, hash_size=self.hash_size)

            # Convert to hex string (16 characters for 64-bit hash)
            hash_str = str(phash)

            logger.debug(f"Computed pHash: {hash_str} for image {img.size} {img.mode}")

            return hash_str

        except IOError as e:
            raise ImageProcessingError(f"Failed to open image: {e}")
        except Exception as e:
            raise ImageProcessingError(f"Failed to compute perceptual hash: {e}")

    def compute_hamming_distance(self, hash1: str, hash2: str) -> int:
        """Compute Hamming distance between two perceptual hashes.

        Hamming distance = number of differing bits between two hashes.
        Lower distance = more similar images.

        Args:
            hash1: First perceptual hash (16 hex chars)
            hash2: Second perceptual hash (16 hex chars)

        Returns:
            Hamming distance (0-64 for 8x8 hash)

        Example:
            >>> distance = service.compute_hamming_distance("8f373fc0ffc4f800", "8f373fc0ffc4f801")
            >>> print(distance)
            1
        """
        try:
            h1 = imagehash.hex_to_hash(hash1)
            h2 = imagehash.hex_to_hash(hash2)

            # Hamming distance (number of differing bits)
            distance = h1 - h2

            return int(distance)

        except Exception as e:
            raise PerceptualHashError(f"Failed to compare hashes: {e}")

    def compute_similarity(self, hash1: str, hash2: str) -> float:
        """Compute similarity score between two perceptual hashes.

        Converts Hamming distance to normalized similarity score.

        Args:
            hash1: First perceptual hash (16 hex chars)
            hash2: Second perceptual hash (16 hex chars)

        Returns:
            Similarity score (0.0 = completely different, 1.0 = identical)

        Example:
            >>> similarity = service.compute_similarity("8f373fc0ffc4f800", "8f373fc0ffc4f801")
            >>> print(f"{similarity:.2%}")
            "98.44%"
        """
        distance = self.compute_hamming_distance(hash1, hash2)

        # Normalize to 0-1 range (inverse of distance)
        # With 8x8 hash, max distance is 64 bits
        similarity = 1.0 - (distance / self.max_hamming_distance)

        return similarity

    async def find_similar_hashes(
        self,
        target_hash: str,
        all_hashes: List[Tuple[str, str]],  # [(asset_id, hash)]
        threshold: float = 0.85,
        max_results: Optional[int] = None
    ) -> List[Tuple[str, float]]:
        """Find all hashes similar to target hash.

        Args:
            target_hash: Hash to compare against
            all_hashes: List of (asset_id, hash) tuples to search
            threshold: Minimum similarity threshold (0.0-1.0)
            max_results: Maximum number of results to return (None = all)

        Returns:
            List of (asset_id, similarity_score) tuples above threshold,
            sorted by similarity (descending)

        Example:
            >>> all_hashes = [
            ...     ("uuid1", "8f373fc0ffc4f800"),
            ...     ("uuid2", "8f373fc0ffc4f801"),  # Very similar
            ...     ("uuid3", "1234567890abcdef"),  # Different
            ... ]
            >>> similar = await service.find_similar_hashes(
            ...     "8f373fc0ffc4f800", all_hashes, threshold=0.9
            ... )
            >>> print(similar)
            [("uuid2", 0.984)]
        """
        results = []

        for asset_id, hash_value in all_hashes:
            # Skip self-comparison
            if hash_value == target_hash:
                continue

            try:
                similarity = self.compute_similarity(target_hash, hash_value)

                if similarity >= threshold:
                    results.append((asset_id, similarity))

            except PerceptualHashError as e:
                logger.warning(f"Failed to compare hash for {asset_id}: {e}")
                continue

        # Sort by similarity (descending)
        results.sort(key=lambda x: x[1], reverse=True)

        # Limit results if requested
        if max_results is not None:
            results = results[:max_results]

        return results

    async def batch_compute_phashes(
        self,
        image_data_list: List[Tuple[str, bytes]]  # [(asset_id, image_bytes)]
    ) -> List[Tuple[str, str, Optional[str]]]:
        """Compute perceptual hashes for multiple images.

        Args:
            image_data_list: List of (asset_id, image_bytes) tuples

        Returns:
            List of (asset_id, phash, error_message) tuples
            If successful, error_message is None

        Example:
            >>> images = [
            ...     ("uuid1", image_data_1),
            ...     ("uuid2", image_data_2),
            ... ]
            >>> results = await service.batch_compute_phashes(images)
            >>> for asset_id, phash, error in results:
            ...     if error:
            ...         print(f"{asset_id}: ERROR - {error}")
            ...     else:
            ...         print(f"{asset_id}: {phash}")
        """
        results = []

        for asset_id, image_bytes in image_data_list:
            try:
                phash = await self.compute_phash(image_bytes)
                results.append((asset_id, phash, None))

            except ImageProcessingError as e:
                error_msg = str(e)
                logger.warning(f"Failed to hash {asset_id}: {error_msg}")
                results.append((asset_id, "", error_msg))

        return results

    def is_likely_duplicate(
        self,
        similarity: float,
        strict: bool = False
    ) -> bool:
        """Determine if similarity score indicates likely duplicate.

        Args:
            similarity: Similarity score (0-1)
            strict: If True, use stricter threshold

        Returns:
            True if likely duplicate

        Thresholds:
        - Strict mode: >= 0.95 (almost identical)
        - Normal mode: >= 0.85 (very similar, accounting for compression/resize)
        """
        threshold = 0.95 if strict else 0.85
        return similarity >= threshold

    async def compute_average_hash(self, image_bytes: bytes) -> str:
        """Compute average hash (aHash) as fallback.

        Average hash is faster but less robust than pHash.
        Use for quick preliminary filtering.

        Args:
            image_bytes: Raw image data

        Returns:
            16-character hex string (average hash)
        """
        try:
            img = Image.open(BytesIO(image_bytes))

            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')

            ahash = imagehash.average_hash(img, hash_size=self.hash_size)
            return str(ahash)

        except Exception as e:
            raise ImageProcessingError(f"Failed to compute average hash: {e}")


# Singleton instance for dependency injection
_perceptual_hash_service: Optional[PerceptualHashService] = None


def get_perceptual_hash_service() -> PerceptualHashService:
    """Get or create singleton perceptual hash service instance.

    Returns:
        PerceptualHashService instance
    """
    global _perceptual_hash_service

    if _perceptual_hash_service is None:
        _perceptual_hash_service = PerceptualHashService()

    return _perceptual_hash_service
