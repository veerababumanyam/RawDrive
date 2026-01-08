"""
Gemini Vision API Service

Handles custom content moderation using Google Gemini Vision API.
Provides second opinion on flagged content and custom policy enforcement.
"""

import base64
import logging
from pathlib import Path
from typing import Dict, List, Optional, Union

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from config import get_settings

logger = logging.getLogger(__name__)


class GeminiVisionService:
    """Gemini Vision API service for custom content moderation."""

    def __init__(self):
        """Initialize Gemini Vision service."""
        self.settings = get_settings()
        self.model = None
        self._initialized = False

    def _ensure_initialized(self) -> None:
        """Lazy load Gemini API client."""
        if self._initialized:
            return

        try:
            logger.info("Initializing Gemini Vision API")

            if not self.settings.GOOGLE_GEMINI_API_KEY:
                raise ValueError("GOOGLE_GEMINI_API_KEY not configured")

            genai.configure(api_key=self.settings.GOOGLE_GEMINI_API_KEY)

            self.model = genai.GenerativeModel(
                model_name=self.settings.GEMINI_MODEL_NAME,
                safety_settings={
                    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                },
            )

            self._initialized = True
            logger.info("Gemini Vision API initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize Gemini Vision API: {e}")
            raise RuntimeError(f"Gemini Vision API initialization failed: {e}")

    def analyze_image(
        self, image_path: Union[str, Path], prompt: str
    ) -> str:
        """
        Analyze image with custom prompt.

        Args:
            image_path: Path to image file
            prompt: Analysis prompt

        Returns:
            Gemini's text response

        Raises:
            FileNotFoundError: If image file doesn't exist
            RuntimeError: If API call fails
        """
        self._ensure_initialized()

        try:
            with open(image_path, "rb") as image_file:
                image_data = image_file.read()

            image_parts = [
                {
                    "mime_type": "image/jpeg",
                    "data": base64.b64encode(image_data).decode("utf-8"),
                }
            ]

            response = self.model.generate_content([prompt, image_parts[0]])

            if not response.text:
                logger.warning("Gemini returned empty response")
                return ""

            logger.debug(f"Gemini analysis for {image_path}: {response.text[:100]}")
            return response.text

        except FileNotFoundError:
            logger.error(f"Image file not found: {image_path}")
            raise
        except Exception as e:
            logger.error(f"Gemini image analysis failed: {e}")
            raise RuntimeError(f"Gemini analysis failed: {e}")

    def verify_violations(
        self, image_path: Union[str, Path], violations: List[str]
    ) -> Dict[str, bool]:
        """
        Get Gemini's second opinion on flagged violations.

        Args:
            image_path: Path to image file
            violations: List of violations flagged by Vision API

        Returns:
            Dict mapping violation to Gemini's confirmation (True/False)
        """
        if not violations:
            return {}

        results = {}

        for violation in violations:
            prompt = self._get_verification_prompt(violation)

            try:
                response = self.analyze_image(image_path, prompt)

                confirmed = self._parse_confirmation(response)
                results[violation] = confirmed

                logger.info(
                    f"Gemini verification for {violation}: "
                    f"{'CONFIRMED' if confirmed else 'REJECTED'}"
                )

            except Exception as e:
                logger.error(f"Failed to verify {violation}: {e}")
                results[violation] = True

        return results

    def _get_verification_prompt(self, violation: str) -> str:
        """
        Get verification prompt for specific violation.

        Args:
            violation: Violation category

        Returns:
            Verification prompt
        """
        prompts = {
            "adult": (
                "Analyze this image for adult or sexually explicit content. "
                "Respond with YES if the image contains adult content, "
                "or NO if it does not. Be objective and specific."
            ),
            "violence": (
                "Analyze this image for violent or graphic content. "
                "Respond with YES if the image contains violence, "
                "or NO if it does not. Consider context and severity."
            ),
            "racy": (
                "Analyze this image for racy or suggestive content. "
                "Respond with YES if the image is racy or suggestive, "
                "or NO if it is appropriate. Consider artistic context."
            ),
            "spoof": (
                "Analyze this image to determine if it appears to be manipulated, "
                "fake, or a spoof. Respond with YES if it seems fake, "
                "or NO if it appears authentic."
            ),
            "medical": (
                "Analyze this image for graphic medical or surgical content. "
                "Respond with YES if it contains graphic medical imagery, "
                "or NO if it does not."
            ),
        }

        return prompts.get(
            violation,
            f"Analyze this image for {violation} content. "
            f"Respond with YES or NO."
        )

    def _parse_confirmation(self, response: str) -> bool:
        """
        Parse Gemini's response for confirmation.

        Args:
            response: Gemini's text response

        Returns:
            True if confirmed, False if rejected
        """
        response_lower = response.lower().strip()

        if "yes" in response_lower[:50]:
            return True
        elif "no" in response_lower[:50]:
            return False
        else:
            logger.warning(f"Ambiguous Gemini response: {response[:100]}")
            return True

    def custom_policy_check(
        self, image_path: Union[str, Path], policy_description: str
    ) -> bool:
        """
        Check image against custom content policy.

        Args:
            image_path: Path to image file
            policy_description: Custom policy description

        Returns:
            True if image violates policy
        """
        prompt = (
            f"Analyze this image according to the following content policy:\n\n"
            f"{policy_description}\n\n"
            f"Respond with YES if the image violates this policy, "
            f"or NO if it complies with the policy."
        )

        try:
            response = self.analyze_image(image_path, prompt)
            violates = self._parse_confirmation(response)

            logger.info(
                f"Custom policy check: "
                f"{'VIOLATION' if violates else 'COMPLIANT'}"
            )

            return violates

        except Exception as e:
            logger.error(f"Custom policy check failed: {e}")
            return False


_gemini_vision_service: Optional[GeminiVisionService] = None


def get_gemini_vision_service() -> GeminiVisionService:
    """Get singleton Gemini Vision service instance."""
    global _gemini_vision_service
    if _gemini_vision_service is None:
        _gemini_vision_service = GeminiVisionService()
    return _gemini_vision_service
