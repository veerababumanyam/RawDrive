"""Invitation AI Service.

This service handles AI content generation for digital invitations using the
Gemini API through the GeminiClientService.

Feature: 016-save-the-date
"""

import logging
import json
from uuid import UUID
from typing import Optional, Dict, Any

from app.services.gemini_client_service import (
    get_gemini_client_service,
    GeminiClientConfig,
    AIConfigurationError,
    AIRuntimeError,
)

logger = logging.getLogger(__name__)


class InvitationAIService:
    """Service for AI-assisted invitation content generation."""

    def __init__(self):
        self.client_service = get_gemini_client_service()

    async def generate_invitation_content(
        self,
        user_id: UUID,
        workspace_id: UUID,
        event_type: str,
        mood: str,
        tone: Optional[str] = None,
        language: str = "English",
        additional_details: Optional[str] = None,
        host_names: Optional[list[str]] = None,
    ) -> Dict[str, str]:
        """Generate title and description for an invitation.

        Args:
            user_id: The requesting user's ID
            workspace_id: The workspace ID
            event_type: Type of event (e.g., "Wedding", "Birthday")
            mood: Desired mood (e.g., "Formal", "Fun")
            tone: Optional specific tone instructions
            language: Target language for the content
            additional_details: Optional extra context
            host_names: Optional list of host names to include

        Returns:
            Dict containing 'title' and 'description' keys.

        Raises:
            AIConfigurationError: If AI is not configured
            AIRuntimeError: If the AI call fails
        """
        # 1. Get Client Config
        config = await self.client_service.get_client_config(user_id, workspace_id)

        # 2. Construct Prompt
        prompt = self._build_prompt(
            event_type, mood, tone, language, additional_details, host_names
        )

        # 3. Call Gemini API
        try:
            response = await self.client_service.make_api_call(
                config=config,
                endpoint=f"/v1beta/models/{config.model_identifier}:generateContent",
                payload={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 800,
                        "responseMimeType": "application/json",
                    },
                },
            )
            
            # 4. Parse Response
            return self._parse_response(response)

        except (AIConfigurationError, AIRuntimeError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error in generating content: {e}", exc_info=True)
            raise AIRuntimeError(
                message="An unexpected error occurred while generating content.",
                code="INTERNAL_ERROR",
            )

    # Languages that require cultural context guidance
    # Feature: 019-invitation-indian-languages
    INDIAN_REGIONAL_LANGUAGES = {
        "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam",
        "Bengali", "Assamese", "Gujarati", "Marathi", "Odia", "Punjabi", "Urdu"
    }

    def _build_prompt(
        self,
        event_type: str,
        mood: str,
        tone: Optional[str],
        language: str,
        additional_details: Optional[str],
        host_names: Optional[list[str]],
    ) -> str:
        """Build the prompt for the AI model.

        Features: 016-save-the-date, 019-invitation-indian-languages
        Enhanced to include cultural context for Indian regional languages.
        """
        parts = [
            "You are a professional copywriter for digital invitations.",
            f"Please generate a Title and a Description for a {event_type} invitation.",
            f"Language: {language}",
            f"Mood: {mood}",
        ]

        if tone:
            parts.append(f"Tone: {tone}")

        if host_names:
            parts.append(f"Hosts: {', '.join(host_names)}")

        # Add cultural context for Indian regional languages
        # Feature: 019-invitation-indian-languages
        if language in self.INDIAN_REGIONAL_LANGUAGES:
            parts.append(f"\nCultural guidelines for {language}:")
            parts.append(
                f"- Write the entire content in authentic {language} script "
                "(not transliteration)."
            )
            parts.append(
                f"- Use culturally appropriate phrasing and expressions "
                f"common in {language}-speaking regions."
            )

            # Event-specific cultural guidance
            if event_type.lower() == "wedding":
                parts.append(
                    f"- For weddings, use traditional blessings and "
                    f"auspicious phrases common in {language} culture."
                )
                parts.append(
                    "- If appropriate for the mood, include references "
                    "to traditional customs or values."
                )

            # Formality guidance for Indian languages
            if mood == "Formal":
                parts.append(
                    f"- Use respectful honorifics and formal language "
                    f"registers appropriate in {language}."
                )

            # Special handling for Urdu (RTL language)
            if language == "Urdu":
                parts.append(
                    "- Use poetic and elegant Urdu vocabulary "
                    "(Rekhta style where appropriate)."
                )
                parts.append(
                    "- The text will be displayed right-to-left; "
                    "ensure natural flow."
                )

        if additional_details:
            parts.append(f"\nAdditional details: {additional_details}")

        parts.append(
            "\nOutput must be a valid JSON object with keys 'title' and 'description'."
            "\nDo not include markdown formatting or code blocks in the output, "
            "just the raw JSON string."
            "\nThe title should be catchy and short."
            "\nThe description should be warm and inviting, around 2-3 sentences."
        )

        return "\n".join(parts)

    def _parse_response(self, response: Dict[str, Any]) -> Dict[str, str]:
        """Parse the Gemini API response."""
        try:
            candidates = response.get("candidates", [])
            if not candidates:
                raise ValueError("No candidates in response")

            text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if not text_content:
                raise ValueError("Empty text content")

            # Clean up potential markdown code blocks if the model ignores instruction
            cleaned_text = text_content.strip()
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]
            cleaned_text = cleaned_text.strip()

            # Try to extract JSON if text contains extra content
            # Sometimes LLMs return JSON with leading/trailing text
            if not cleaned_text.startswith("{"):
                # Try to find JSON object in the text
                start_idx = cleaned_text.find("{")
                end_idx = cleaned_text.rfind("}") + 1
                if start_idx != -1 and end_idx > start_idx:
                    cleaned_text = cleaned_text[start_idx:end_idx]

            data = json.loads(cleaned_text)

            return {
                "title": data.get("title", ""),
                "description": data.get("description", ""),
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from AI response: {e}. Raw text: {text_content[:500]}")
            raise AIRuntimeError(
                message="Failed to parse AI response. Please try again.",
                code="PARSE_ERROR",
                hint="The AI generated an invalid response format. Retrying usually helps."
            )
        except Exception as e:
            logger.error(f"Error parsing AI response: {e}")
            raise AIRuntimeError(
                message="Invalid response from AI service.",
                code="INVALID_RESPONSE",
            )


# Singleton instance
_service_instance: Optional[InvitationAIService] = None


def get_invitation_ai_service() -> InvitationAIService:
    """Get singleton instance of InvitationAIService."""
    global _service_instance
    if _service_instance is None:
        _service_instance = InvitationAIService()
    return _service_instance
