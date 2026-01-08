"""
Perceptual Hash Module

Generates perceptual hashes (pHash) for fast duplicate image detection.
Uses imagehash library with configurable hash sizes.
"""

import logging
from pathlib import Path
from typing import Optional, Union

import imagehash
from PIL import Image

from config import get_settings

logger = logging.getLogger(__name__)


class PerceptualHasher:
    """Perceptual hash generator for duplicate detection."""

    def __init__(self, hash_size: int = 16):
        """
        Initialize perceptual hasher.

        Args:
            hash_size: Hash size (default: 16 for 64-bit hash)
                      Larger = more accurate but slower comparison
        """
        self.settings = get_settings()
        self.hash_size = hash_size
        self.threshold = self.settings.DUPLICATE_PHASH_THRESHOLD
        logger.info(f"Perceptual hasher initialized (hash_size: {hash_size}, threshold: {self.threshold})")

    def hash_image(self, image_path: Union[str, Path]) -> str:
        """
        Generate perceptual hash for an image.

        Args:
            image_path: Path to image file

        Returns:
            Hex string representation of perceptual hash

        Raises:
            FileNotFoundError: If image file doesn't exist
            RuntimeError: If hashing fails
        """
        try:
            image = Image.open(image_path)
            phash = imagehash.phash(image, hash_size=self.hash_size)
            hash_str = str(phash)
            logger.debug(f"Generated pHash for {image_path}: {hash_str}")
            return hash_str

        except FileNotFoundError:
            logger.error(f"Image file not found: {image_path}")
            raise
        except Exception as e:
            logger.error(f"Failed to generate perceptual hash: {e}")
            raise RuntimeError(f"Perceptual hashing failed: {e}")

    def hash_pil_image(self, image: Image.Image) -> str:
        """
        Generate perceptual hash for a PIL Image object.

        Args:
            image: PIL Image object

        Returns:
            Hex string representation of perceptual hash
        """
        try:
            phash = imagehash.phash(image, hash_size=self.hash_size)
            return str(phash)
        except Exception as e:
            logger.error(f"Failed to generate perceptual hash from PIL image: {e}")
            raise RuntimeError(f"Perceptual hashing failed: {e}")

    def hamming_distance(self, hash1: str, hash2: str) -> int:
        """
        Calculate Hamming distance between two perceptual hashes.

        Args:
            hash1: First perceptual hash
            hash2: Second perceptual hash

        Returns:
            Hamming distance (0 = identical, higher = more different)
        """
        try:
            h1 = imagehash.hex_to_hash(hash1)
            h2 = imagehash.hex_to_hash(hash2)
            return h1 - h2
        except Exception as e:
            logger.error(f"Failed to calculate Hamming distance: {e}")
            return 999

    def is_duplicate(self, hash1: str, hash2: str) -> bool:
        """
        Check if two hashes represent duplicate/similar images.

        Args:
            hash1: First perceptual hash
            hash2: Second perceptual hash

        Returns:
            True if images are considered duplicates
        """
        distance = self.hamming_distance(hash1, hash2)
        is_dup = distance <= self.threshold
        if is_dup:
            logger.debug(f"Duplicate detected (distance: {distance} <= {self.threshold})")
        return is_dup

    def similarity_score(self, hash1: str, hash2: str) -> float:
        """
        Calculate similarity score between two hashes.

        Args:
            hash1: First perceptual hash
            hash2: Second perceptual hash

        Returns:
            Similarity score (0.0 to 1.0, where 1.0 = identical)
        """
        distance = self.hamming_distance(hash1, hash2)
        max_distance = self.hash_size * self.hash_size
        similarity = 1.0 - (distance / max_distance)
        return max(0.0, min(1.0, similarity))


_perceptual_hasher: Optional[PerceptualHasher] = None


def get_perceptual_hasher() -> PerceptualHasher:
    """Get singleton perceptual hasher instance."""
    global _perceptual_hasher
    if _perceptual_hasher is None:
        _perceptual_hasher = PerceptualHasher()
    return _perceptual_hasher
