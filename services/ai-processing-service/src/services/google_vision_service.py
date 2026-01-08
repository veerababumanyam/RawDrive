"""
Google Vision API Service

Handles content moderation using Google Cloud Vision API Safe Search.
Detects adult content, violence, racy content, and other inappropriate material.
"""

import logging
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Union

from google.cloud import vision
from google.cloud.vision_v1 import SafeSearchAnnotation

from config import get_settings

logger = logging.getLogger(__name__)


class Likelihood(Enum):
    """Google Vision API likelihood levels."""
    UNKNOWN = 0
    VERY_UNLIKELY = 1
    UNLIKELY = 2
    POSSIBLE = 3
    LIKELY = 4
    VERY_LIKELY = 5


class ModerationCategory(Enum):
    """Content moderation categories."""
    ADULT = "adult"
    VIOLENCE = "violence"
    RACY = "racy"
    SPOOF = "spoof"
    MEDICAL = "medical"


class GoogleVisionService:
    """Google Cloud Vision API service for content moderation."""

    def __init__(self):
        """Initialize Google Vision service."""
        self.settings = get_settings()
        self.client: Optional[vision.ImageAnnotatorClient] = None
        self._initialized = False

    def _ensure_initialized(self) -> None:
        """Lazy load Vision API client."""
        if self._initialized:
            return

        try:
            logger.info("Initializing Google Vision API client")
            self.client = vision.ImageAnnotatorClient()
            self._initialized = True
            logger.info("Google Vision API client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Google Vision API: {e}")
            raise RuntimeError(f"Google Vision API initialization failed: {e}")

    def safe_search_detection(
        self, image_path: Union[str, Path]
    ) -> Dict[str, str]:
        """
        Perform Safe Search detection on an image.

        Args:
            image_path: Path to image file

        Returns:
            Dict with Safe Search scores for each category

        Raises:
            FileNotFoundError: If image file doesn't exist
            RuntimeError: If API call fails
        """
        self._ensure_initialized()

        try:
            with open(image_path, "rb") as image_file:
                content = image_file.read()

            image = vision.Image(content=content)
            response = self.client.safe_search_detection(image=image)
            safe_search = response.safe_search_annotation

            if response.error.message:
                raise RuntimeError(
                    f"Vision API error: {response.error.message}"
                )

            scores = {
                "adult": safe_search.adult.name,
                "violence": safe_search.violence.name,
                "racy": safe_search.racy.name,
                "spoof": safe_search.spoof.name,
                "medical": safe_search.medical.name,
            }

            logger.debug(f"Safe Search results for {image_path}: {scores}")
            return scores

        except FileNotFoundError:
            logger.error(f"Image file not found: {image_path}")
            raise
        except Exception as e:
            logger.error(f"Safe Search detection failed: {e}")
            raise RuntimeError(f"Safe Search detection failed: {e}")

    def check_violations(
        self,
        safe_search_scores: Dict[str, str],
        policy: str = "standard",
    ) -> List[str]:
        """
        Check if Safe Search scores violate content policy.

        Args:
            safe_search_scores: Safe Search scores from API
            policy: Policy name (standard, strict, permissive)

        Returns:
            List of violated categories
        """
        policies = {
            "standard": {
                "adult": Likelihood.POSSIBLE,
                "violence": Likelihood.LIKELY,
                "racy": Likelihood.VERY_LIKELY,
                "spoof": Likelihood.VERY_LIKELY,
                "medical": Likelihood.VERY_LIKELY,
            },
            "strict": {
                "adult": Likelihood.UNLIKELY,
                "violence": Likelihood.POSSIBLE,
                "racy": Likelihood.LIKELY,
                "spoof": Likelihood.LIKELY,
                "medical": Likelihood.LIKELY,
            },
            "permissive": {
                "adult": Likelihood.LIKELY,
                "violence": Likelihood.VERY_LIKELY,
                "racy": Likelihood.VERY_LIKELY,
                "spoof": Likelihood.VERY_LIKELY,
                "medical": Likelihood.VERY_LIKELY,
            },
        }

        policy_thresholds = policies.get(policy, policies["standard"])
        violations = []

        likelihood_map = {
            "UNKNOWN": Likelihood.UNKNOWN,
            "VERY_UNLIKELY": Likelihood.VERY_UNLIKELY,
            "UNLIKELY": Likelihood.UNLIKELY,
            "POSSIBLE": Likelihood.POSSIBLE,
            "LIKELY": Likelihood.LIKELY,
            "VERY_LIKELY": Likelihood.VERY_LIKELY,
        }

        for category, score_str in safe_search_scores.items():
            score_level = likelihood_map.get(score_str, Likelihood.UNKNOWN)
            threshold = policy_thresholds.get(category, Likelihood.VERY_LIKELY)

            if score_level.value >= threshold.value:
                violations.append(category)
                logger.info(
                    f"Policy violation detected: {category} "
                    f"(score: {score_str}, threshold: {threshold.name})"
                )

        return violations

    def get_moderation_confidence(
        self, safe_search_scores: Dict[str, str]
    ) -> float:
        """
        Calculate overall moderation confidence score.

        Args:
            safe_search_scores: Safe Search scores from API

        Returns:
            Confidence score (0.0 to 1.0)
        """
        likelihood_map = {
            "UNKNOWN": 0.0,
            "VERY_UNLIKELY": 0.1,
            "UNLIKELY": 0.3,
            "POSSIBLE": 0.5,
            "LIKELY": 0.7,
            "VERY_LIKELY": 0.9,
        }

        scores = [
            likelihood_map.get(score, 0.0)
            for score in safe_search_scores.values()
        ]

        if not scores:
            return 0.0

        avg_confidence = sum(scores) / len(scores)
        return round(avg_confidence, 4)

    def is_safe(
        self,
        safe_search_scores: Dict[str, str],
        policy: str = "standard",
    ) -> bool:
        """
        Check if image is safe according to policy.

        Args:
            safe_search_scores: Safe Search scores from API
            policy: Policy name

        Returns:
            True if image passes moderation
        """
        violations = self.check_violations(safe_search_scores, policy)
        return len(violations) == 0


_google_vision_service: Optional[GoogleVisionService] = None


def get_google_vision_service() -> GoogleVisionService:
    """Get singleton Google Vision service instance."""
    global _google_vision_service
    if _google_vision_service is None:
        _google_vision_service = GoogleVisionService()
    return _google_vision_service
