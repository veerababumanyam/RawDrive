"""Personal Profile AI Service.

This service handles AI content generation for personal profile digital visiting cards
using the Gemini API through the GeminiClientService.

Feature: Personal Profile Digital Visiting Cards
"""

import logging
import json
from uuid import UUID
from typing import Optional, Dict, Any, List

from app.services.gemini_client_service import (
    get_gemini_client_service,
    GeminiClientConfig,
    AIConfigurationError,
    AIRuntimeError,
)

logger = logging.getLogger(__name__)


class PersonalProfileAIService:
    """Service for AI-assisted personal profile content generation."""

    def __init__(self):
        self.client_service = get_gemini_client_service()

    async def generate_bio(
        self,
        user_id: UUID,
        workspace_id: UUID,
        profile_title: Optional[str] = None,
        categories: Optional[List[str]] = None,
        style: str = "professional",
        language: str = "English",
        current_bio: Optional[str] = None,
        additional_context: Optional[str] = None,
    ) -> Dict[str, str]:
        """Generate or improve a professional bio for the photographer.

        Args:
            user_id: The requesting user's ID
            workspace_id: The workspace ID
            profile_title: Job title (e.g., "Wedding Photographer")
            categories: Photography specialties
            style: Writing style (professional, casual, creative)
            language: Target language for the content
            current_bio: Existing bio to improve (optional)
            additional_context: Extra context about the photographer

        Returns:
            Dict containing 'bio' key.

        Raises:
            AIConfigurationError: If AI is not configured
            AIRuntimeError: If the AI call fails
        """
        config = await self.client_service.get_client_config(user_id, workspace_id)

        prompt = self._build_bio_prompt(
            profile_title, categories, style, language, current_bio, additional_context
        )

        try:
            response = await self.client_service.make_api_call(
                config=config,
                endpoint=f"/v1beta/models/{config.model_identifier}:generateContent",
                payload={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 2048,
                        "responseMimeType": "application/json",
                    },
                },
            )

            return self._parse_single_field_response(response, "bio")

        except (AIConfigurationError, AIRuntimeError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error in generating bio: {e}", exc_info=True)
            raise AIRuntimeError(
                message="An unexpected error occurred while generating bio.",
                code="INTERNAL_ERROR",
            )

    async def generate_tagline(
        self,
        user_id: UUID,
        workspace_id: UUID,
        display_name: Optional[str] = None,
        profile_title: Optional[str] = None,
        categories: Optional[List[str]] = None,
        style: str = "professional",
        language: str = "English",
    ) -> Dict[str, str]:
        """Generate a catchy tagline for the photographer's profile.

        Args:
            user_id: The requesting user's ID
            workspace_id: The workspace ID
            display_name: Photographer's display name
            profile_title: Job title
            categories: Photography specialties
            style: Writing style
            language: Target language

        Returns:
            Dict containing 'tagline' key.
        """
        config = await self.client_service.get_client_config(user_id, workspace_id)

        prompt = self._build_tagline_prompt(
            display_name, profile_title, categories, style, language
        )

        try:
            response = await self.client_service.make_api_call(
                config=config,
                endpoint=f"/v1beta/models/{config.model_identifier}:generateContent",
                payload={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.8,
                        "maxOutputTokens": 512,
                        "responseMimeType": "application/json",
                    },
                },
            )

            return self._parse_single_field_response(response, "tagline")

        except (AIConfigurationError, AIRuntimeError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error in generating tagline: {e}", exc_info=True)
            raise AIRuntimeError(
                message="An unexpected error occurred while generating tagline.",
                code="INTERNAL_ERROR",
            )

    async def analyze_completeness(
        self,
        user_id: UUID,
        workspace_id: UUID,
        profile_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Analyze profile completeness and provide improvement suggestions.

        Args:
            user_id: The requesting user's ID
            workspace_id: The workspace ID
            profile_data: Current profile data to analyze

        Returns:
            Dict containing 'score', 'missing_fields', 'suggestions' keys.
        """
        config = await self.client_service.get_client_config(user_id, workspace_id)

        prompt = self._build_completeness_prompt(profile_data)

        try:
            response = await self.client_service.make_api_call(
                config=config,
                endpoint=f"/v1beta/models/{config.model_identifier}:generateContent",
                payload={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.3,
                        "maxOutputTokens": 2048,
                        "responseMimeType": "application/json",
                    },
                },
            )

            return self._parse_completeness_response(response)

        except (AIConfigurationError, AIRuntimeError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error in analyzing completeness: {e}", exc_info=True)
            raise AIRuntimeError(
                message="An unexpected error occurred while analyzing profile.",
                code="INTERNAL_ERROR",
            )

    async def optimize_seo(
        self,
        user_id: UUID,
        workspace_id: UUID,
        profile_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Optimize SEO metadata for the profile.

        Args:
            user_id: The requesting user's ID
            workspace_id: The workspace ID
            profile_data: Current profile data

        Returns:
            Dict containing 'meta_title', 'meta_description', 'keywords' keys.
        """
        config = await self.client_service.get_client_config(user_id, workspace_id)

        prompt = self._build_seo_prompt(profile_data)

        try:
            response = await self.client_service.make_api_call(
                config=config,
                endpoint=f"/v1beta/models/{config.model_identifier}:generateContent",
                payload={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.4,
                        "maxOutputTokens": 1024,
                        "responseMimeType": "application/json",
                    },
                },
            )

            return self._parse_seo_response(response)

        except (AIConfigurationError, AIRuntimeError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error in optimizing SEO: {e}", exc_info=True)
            raise AIRuntimeError(
                message="An unexpected error occurred while optimizing SEO.",
                code="INTERNAL_ERROR",
            )

    async def suggest_categories(
        self,
        user_id: UUID,
        workspace_id: UUID,
        bio: Optional[str] = None,
        profile_title: Optional[str] = None,
        gallery_names: Optional[List[str]] = None,
    ) -> Dict[str, List[str]]:
        """Suggest photography categories based on profile content.

        Args:
            user_id: The requesting user's ID
            workspace_id: The workspace ID
            bio: Current bio text
            profile_title: Job title
            gallery_names: Names of user's galleries

        Returns:
            Dict containing 'categories' list.
        """
        config = await self.client_service.get_client_config(user_id, workspace_id)

        prompt = self._build_categories_prompt(bio, profile_title, gallery_names)

        try:
            response = await self.client_service.make_api_call(
                config=config,
                endpoint=f"/v1beta/models/{config.model_identifier}:generateContent",
                payload={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.5,
                        "maxOutputTokens": 512,
                        "responseMimeType": "application/json",
                    },
                },
            )

            return self._parse_categories_response(response)

        except (AIConfigurationError, AIRuntimeError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error in suggesting categories: {e}", exc_info=True)
            raise AIRuntimeError(
                message="An unexpected error occurred while suggesting categories.",
                code="INTERNAL_ERROR",
            )

    # --- Prompt Builders ---

    def _build_bio_prompt(
        self,
        profile_title: Optional[str],
        categories: Optional[List[str]],
        style: str,
        language: str,
        current_bio: Optional[str],
        additional_context: Optional[str],
    ) -> str:
        """Build prompt for bio generation."""
        parts = [
            "You are a professional copywriter specializing in photographer portfolios.",
            f"Write a compelling professional bio for a photographer.",
            f"Language: {language}",
            f"Writing style: {style}",
        ]

        if profile_title:
            parts.append(f"Job title: {profile_title}")

        if categories:
            parts.append(f"Photography specialties: {', '.join(categories)}")

        if current_bio:
            parts.append(f"\nCurrent bio to improve:\n{current_bio}")
            parts.append("\nPlease enhance this bio while keeping the photographer's voice.")

        if additional_context:
            parts.append(f"\nAdditional context: {additional_context}")

        parts.append(
            "\nGuidelines:"
            "\n- Keep it concise (2-4 sentences for short style, 3-5 for longer)"
            "\n- Highlight unique selling points"
            "\n- Use active voice"
            "\n- Be authentic, not generic"
            "\n- Avoid cliches like 'capturing moments'"
            "\n\nOutput must be a valid JSON object with key 'bio'."
            "\nDo not include markdown formatting or code blocks."
        )

        return "\n".join(parts)

    def _build_tagline_prompt(
        self,
        display_name: Optional[str],
        profile_title: Optional[str],
        categories: Optional[List[str]],
        style: str,
        language: str,
    ) -> str:
        """Build prompt for tagline generation."""
        parts = [
            "You are a creative copywriter for photographer branding.",
            f"Create a catchy, memorable tagline for a photographer.",
            f"Language: {language}",
            f"Style: {style}",
        ]

        if display_name:
            parts.append(f"Photographer name: {display_name}")

        if profile_title:
            parts.append(f"Title: {profile_title}")

        if categories:
            parts.append(f"Specialties: {', '.join(categories)}")

        parts.append(
            "\nGuidelines:"
            "\n- Maximum 8-10 words"
            "\n- Memorable and unique"
            "\n- Reflects the photographer's style"
            "\n- Avoid generic phrases"
            "\n\nOutput must be a valid JSON object with key 'tagline'."
            "\nDo not include markdown formatting or code blocks."
        )

        return "\n".join(parts)

    def _build_completeness_prompt(self, profile_data: Dict[str, Any]) -> str:
        """Build prompt for completeness analysis."""
        # Define important fields for a complete profile
        important_fields = {
            "display_name": "Display Name",
            "profile_title": "Professional Title",
            "bio": "Bio/About",
            "avatar_url": "Profile Photo",
            "email": "Contact Email",
            "phone": "Phone Number",
            "location": "Location",
            "website": "Website",
            "socials": "Social Media Links",
            "categories": "Photography Categories",
            "service_areas": "Service Areas",
            "booking_calendar_url": "Booking Link",
        }

        # Check which fields are missing or empty
        present_fields = []
        missing_fields = []
        for field, label in important_fields.items():
            value = profile_data.get(field)
            if value and (not isinstance(value, (list, dict)) or len(value) > 0):
                present_fields.append(label)
            else:
                missing_fields.append(label)

        parts = [
            "You are a profile optimization expert for professional photographers.",
            "Analyze the following profile and provide improvement suggestions.",
            f"\nPresent information: {', '.join(present_fields) if present_fields else 'None'}",
            f"Missing information: {', '.join(missing_fields) if missing_fields else 'None'}",
        ]

        if profile_data.get("bio"):
            parts.append(f"\nCurrent bio: {profile_data['bio'][:500]}...")

        parts.append(
            "\nProvide:"
            "\n1. A completeness score (0-100)"
            "\n2. List of missing critical fields"
            "\n3. 3-5 specific, actionable suggestions to improve the profile"
            "\n\nOutput must be a valid JSON object with keys:"
            "\n- 'score': number 0-100"
            "\n- 'missing_fields': array of strings"
            "\n- 'suggestions': array of strings"
            "\nDo not include markdown formatting or code blocks."
        )

        return "\n".join(parts)

    def _build_seo_prompt(self, profile_data: Dict[str, Any]) -> str:
        """Build prompt for SEO optimization."""
        parts = [
            "You are an SEO expert for photographer portfolios.",
            "Generate optimized SEO metadata for a photographer's public profile page.",
        ]

        if profile_data.get("display_name"):
            parts.append(f"Photographer name: {profile_data['display_name']}")

        if profile_data.get("profile_title"):
            parts.append(f"Title: {profile_data['profile_title']}")

        if profile_data.get("location"):
            parts.append(f"Location: {profile_data['location']}")

        if profile_data.get("categories"):
            parts.append(f"Specialties: {', '.join(profile_data['categories'])}")

        if profile_data.get("bio"):
            parts.append(f"Bio excerpt: {profile_data['bio'][:300]}...")

        parts.append(
            "\nGenerate:"
            "\n1. meta_title: Page title optimized for SEO (50-60 characters)"
            "\n2. meta_description: Meta description (150-160 characters)"
            "\n3. keywords: 5-8 relevant SEO keywords"
            "\n\nOutput must be a valid JSON object with keys:"
            "\n- 'meta_title': string"
            "\n- 'meta_description': string"
            "\n- 'keywords': array of strings"
            "\nDo not include markdown formatting or code blocks."
        )

        return "\n".join(parts)

    def _build_categories_prompt(
        self,
        bio: Optional[str],
        profile_title: Optional[str],
        gallery_names: Optional[List[str]],
    ) -> str:
        """Build prompt for category suggestions."""
        parts = [
            "You are a photography industry expert.",
            "Suggest relevant photography categories based on the photographer's profile.",
        ]

        if profile_title:
            parts.append(f"Job title: {profile_title}")

        if bio:
            parts.append(f"Bio: {bio[:500]}")

        if gallery_names:
            parts.append(f"Gallery names: {', '.join(gallery_names[:10])}")

        parts.append(
            "\nCommon photography categories to choose from:"
            "\n- Wedding Photography"
            "\n- Portrait Photography"
            "\n- Event Photography"
            "\n- Product Photography"
            "\n- Fashion Photography"
            "\n- Landscape Photography"
            "\n- Wildlife Photography"
            "\n- Sports Photography"
            "\n- Documentary Photography"
            "\n- Food Photography"
            "\n- Real Estate Photography"
            "\n- Newborn Photography"
            "\n- Maternity Photography"
            "\n- Engagement Photography"
            "\n- Boudoir Photography"
            "\n- Commercial Photography"
            "\n- Fine Art Photography"
            "\n\nSuggest 3-6 most relevant categories."
            "\n\nOutput must be a valid JSON object with key 'categories' containing array of strings."
            "\nDo not include markdown formatting or code blocks."
        )

        return "\n".join(parts)

    # --- Response Parsers ---

    def _parse_single_field_response(self, response: Dict[str, Any], field: str) -> Dict[str, str]:
        """Parse response for single field output."""
        try:
            text_content = self._extract_text_content(response)
            cleaned_text = self._clean_json_text(text_content)
            data = json.loads(cleaned_text)
            return {field: data.get(field, "")}
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {e}. Raw: {text_content[:500]}")
            raise AIRuntimeError(
                message="Failed to parse AI response.",
                code="PARSE_ERROR",
            )
        except Exception as e:
            logger.error(f"Error parsing response: {e}")
            raise AIRuntimeError(
                message="Invalid response from AI service.",
                code="INVALID_RESPONSE",
            )

    def _parse_completeness_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse completeness analysis response."""
        try:
            text_content = self._extract_text_content(response)
            cleaned_text = self._clean_json_text(text_content)
            data = json.loads(cleaned_text)
            return {
                "score": data.get("score", 0),
                "missing_fields": data.get("missing_fields", []),
                "suggestions": data.get("suggestions", []),
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse completeness JSON: {e}")
            raise AIRuntimeError(
                message="Failed to parse AI response.",
                code="PARSE_ERROR",
            )
        except Exception as e:
            logger.error(f"Error parsing completeness response: {e}")
            raise AIRuntimeError(
                message="Invalid response from AI service.",
                code="INVALID_RESPONSE",
            )

    def _parse_seo_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse SEO optimization response."""
        try:
            text_content = self._extract_text_content(response)
            cleaned_text = self._clean_json_text(text_content)
            data = json.loads(cleaned_text)
            return {
                "meta_title": data.get("meta_title", ""),
                "meta_description": data.get("meta_description", ""),
                "keywords": data.get("keywords", []),
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse SEO JSON: {e}")
            raise AIRuntimeError(
                message="Failed to parse AI response.",
                code="PARSE_ERROR",
            )
        except Exception as e:
            logger.error(f"Error parsing SEO response: {e}")
            raise AIRuntimeError(
                message="Invalid response from AI service.",
                code="INVALID_RESPONSE",
            )

    def _parse_categories_response(self, response: Dict[str, Any]) -> Dict[str, List[str]]:
        """Parse category suggestions response."""
        try:
            text_content = self._extract_text_content(response)
            cleaned_text = self._clean_json_text(text_content)
            data = json.loads(cleaned_text)
            return {
                "categories": data.get("categories", []),
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse categories JSON: {e}")
            raise AIRuntimeError(
                message="Failed to parse AI response.",
                code="PARSE_ERROR",
            )
        except Exception as e:
            logger.error(f"Error parsing categories response: {e}")
            raise AIRuntimeError(
                message="Invalid response from AI service.",
                code="INVALID_RESPONSE",
            )

    def _extract_text_content(self, response: Dict[str, Any]) -> str:
        """Extract text content from Gemini response."""
        candidates = response.get("candidates", [])
        if not candidates:
            raise ValueError("No candidates in response")

        text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        if not text_content:
            raise ValueError("Empty text content")

        return text_content

    def _clean_json_text(self, text: str) -> str:
        """Clean up potential markdown code blocks from JSON text."""
        cleaned_text = text.strip()
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.startswith("```"):
            cleaned_text = cleaned_text[3:]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[:-3]
        cleaned_text = cleaned_text.strip()

        # Extract JSON if there's extra text
        if not cleaned_text.startswith("{"):
            start_idx = cleaned_text.find("{")
            end_idx = cleaned_text.rfind("}") + 1
            if start_idx != -1 and end_idx > start_idx:
                cleaned_text = cleaned_text[start_idx:end_idx]

        return cleaned_text


# Singleton instance
_service_instance: Optional[PersonalProfileAIService] = None


def get_personal_profile_ai_service() -> PersonalProfileAIService:
    """Get singleton instance of PersonalProfileAIService."""
    global _service_instance
    if _service_instance is None:
        _service_instance = PersonalProfileAIService()
    return _service_instance
