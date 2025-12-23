"""Google Gemini API provider for face detection (fallback).

This module implements the GeminiProvider class that uses Google Gemini's
vision capabilities for face detection. It serves as a fallback provider
when Cloud Vision is unavailable.

Features:
- Multi-modal vision analysis
- Configurable model selection (gemini-2.5-flash, gemini-3-flash-preview, etc.)
- Structured JSON output for face data

Configuration:
- Requires GEMINI_API_KEY
- Model configurable via admin settings or GEMINI_MODEL env var
- Default models: gemini-2.5-flash, gemini-3-flash-preview, gemini-3-pro-preview
"""

import asyncio
import json
import logging
import re
from typing import Any, Optional

from app.api.face_schemas import (
    BoundingBox,
    FaceAttributes,
    FaceDetectionResult,
)
from app.services.face_exceptions import (
    FaceDetectionError,
    ProviderNotConfiguredError,
    ProviderUnavailableError,
)
from app.services.ai.providers.base_provider import BaseProvider
from app.services.ai.providers.types import DetectionOptions


logger = logging.getLogger(__name__)


# Default Gemini model for face detection
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

# Supported Gemini models for face detection
SUPPORTED_MODELS = [
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
]


class GeminiProvider(BaseProvider):
    """Google Gemini API provider for face detection (fallback).
    
    Uses Gemini's vision capabilities to detect faces when Cloud Vision
    is unavailable. Less accurate than Cloud Vision but provides redundancy.
    
    The provider uses a structured prompt to instruct Gemini to return
    face detection results in JSON format.
    
    Attributes:
        name: Provider identifier ('gemini')
        _gen_ai: Lazily initialized GoogleGenerativeAI client
        _client_init_lock: Lock to prevent concurrent initialization
        _config_service: Configuration service for credentials
        _model_name: Configured model name
    """
    
    def __init__(
        self,
        config_service: Any,  # FaceConfigurationService
    ) -> None:
        """Initialize the Gemini provider.
        
        Args:
            config_service: Configuration service for loading credentials
        """
        super().__init__()
        self._config_service = config_service
        self._gen_ai: Any = None  # google.generativeai.GenerativeModel
        self._client_init_lock = asyncio.Lock()
        self._model_name: Optional[str] = None
        self._api_key: Optional[str] = None

    @property
    def name(self) -> str:
        """Provider name for identification and logging."""
        return "gemini"

    # =========================================================================
    # CLIENT INITIALIZATION
    # =========================================================================

    async def _ensure_client(self) -> Any:
        """Lazily initialize the Gemini client.
        
        Returns:
            Initialized GenerativeModel
            
        Raises:
            ProviderNotConfiguredError: If API key is not available
            ProviderUnavailableError: If client initialization fails
        """
        if self._gen_ai is not None:
            return self._gen_ai
        
        async with self._client_init_lock:
            # Double-check after acquiring lock
            if self._gen_ai is not None:
                return self._gen_ai
            
            await self._initialize_client()
            return self._gen_ai

    async def _initialize_client(self) -> None:
        """Initialize the Gemini client with API key.
        
        Raises:
            ProviderNotConfiguredError: If API key is not available
            ProviderUnavailableError: If client initialization fails
        """
        try:
            # Load credentials from configuration service
            credentials = await self._config_service.get_provider_credentials("gemini")
            
            self._api_key = credentials.get("api_key")
            if not self._api_key:
                raise ProviderNotConfiguredError(
                    provider_name=self.name,
                    missing_config="api_key",
                )
            
            # Get model name from credentials or use default
            self._model_name = credentials.get("model", DEFAULT_GEMINI_MODEL)
            
            # Import Google Generative AI library
            try:
                import google.generativeai as genai
            except ImportError as e:
                raise ProviderUnavailableError(
                    provider_name=self.name,
                    reason="Google Generative AI library not installed. "
                           "Install with: pip install google-generativeai",
                ) from e
            
            # Configure the API key
            genai.configure(api_key=self._api_key)
            
            # Create the generative model
            self._gen_ai = genai.GenerativeModel(self._model_name)
            
            logger.info(
                "Gemini client initialized",
                extra={
                    "provider": self.name,
                    "model": self._model_name,
                },
            )
            
        except ProviderNotConfiguredError:
            raise
        except Exception as e:
            logger.error(
                "Failed to initialize Gemini client",
                extra={"provider": self.name, "error": str(e)},
            )
            raise ProviderUnavailableError(
                provider_name=self.name,
                reason=f"Failed to initialize client: {str(e)}",
            ) from e

    async def _get_model_name(self) -> str:
        """Get the configured Gemini model name.
        
        Returns:
            Model name string
        """
        if self._model_name:
            return self._model_name
        
        try:
            credentials = await self._config_service.get_provider_credentials("gemini")
            return credentials.get("model", DEFAULT_GEMINI_MODEL)
        except Exception:
            return DEFAULT_GEMINI_MODEL

    # =========================================================================
    # FACE DETECTION
    # =========================================================================

    async def detect_faces(
        self,
        image_buffer: bytes,
        options: Optional[DetectionOptions] = None,
    ) -> list[FaceDetectionResult]:
        """Detect faces in an image using Google Gemini API.
        
        Uses a structured prompt to extract face information in JSON format.
        Less accurate than Cloud Vision but provides fallback capability.
        
        Args:
            image_buffer: Raw image data as bytes
            options: Detection options (max_faces, min_confidence, etc.)
            
        Returns:
            List of detected faces with bounding boxes and confidence scores
            
        Raises:
            FaceDetectionError: If detection fails
        """
        # Use default options if not provided
        options = options or DetectionOptions()
        
        # Validate image before sending to API
        self.validate_image(image_buffer)
        
        self.log_request("detect_faces", {
            "image_size": len(image_buffer),
            "max_faces": options.max_faces,
            "min_confidence": options.min_confidence,
        })
        
        try:
            # Ensure client is initialized
            model = await self._ensure_client()
            model_name = await self._get_model_name()
            
            # Import PIL for image handling
            try:
                from PIL import Image
                import io
            except ImportError:
                # If PIL not available, use base64 directly
                pass
            
            # Build the prompt for face detection
            prompt = self._build_face_detection_prompt(options.max_faces)
            
            # Create image part for Gemini
            import base64
            image_data = base64.b64encode(image_buffer).decode("utf-8")
            
            # Determine MIME type (default to JPEG)
            mime_type = self._detect_mime_type(image_buffer)
            
            # Send image to Gemini for analysis
            # Run in thread pool since the client may be synchronous
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: model.generate_content([
                    prompt,
                    {
                        "mime_type": mime_type,
                        "data": image_data,
                    },
                ]),
            )
            
            # Extract text response
            text = response.text
            
            # Parse the JSON response
            faces = self._parse_gemini_response(text)
            
            self.log_response("detect_faces", True, {
                "faces_detected": len(faces),
                "model": model_name,
            })
            
            # Filter by confidence threshold
            return [
                face for face in faces
                if face.confidence >= options.min_confidence
            ]
            
        except FaceDetectionError:
            raise
        except Exception as e:
            self.log_response("detect_faces", False, {"error": str(e)})
            raise self.wrap_provider_error(e, "detect_faces")

    def _detect_mime_type(self, image_buffer: bytes) -> str:
        """Detect MIME type from image buffer magic bytes.
        
        Args:
            image_buffer: Raw image data
            
        Returns:
            MIME type string
        """
        # Check magic bytes
        if image_buffer[:2] == b'\xff\xd8':
            return "image/jpeg"
        elif image_buffer[:8] == b'\x89PNG\r\n\x1a\n':
            return "image/png"
        elif image_buffer[:4] == b'RIFF' and image_buffer[8:12] == b'WEBP':
            return "image/webp"
        elif image_buffer[4:12] == b'ftypheic' or image_buffer[4:12] == b'ftypmif1':
            return "image/heic"
        else:
            # Default to JPEG
            return "image/jpeg"

    def _build_face_detection_prompt(self, max_faces: int) -> str:
        """Build the prompt for face detection.
        
        Instructs Gemini to return structured JSON with face data.
        
        Args:
            max_faces: Maximum number of faces to detect
            
        Returns:
            Prompt string
        """
        return f"""Analyze this image and detect all human faces (up to {max_faces}).

For each face detected, provide the following information in JSON format:
- boundingBox: Object with x, y, width, height as percentages (0-100) of image dimensions
- confidence: Detection confidence score from 0 to 1
- attributes: Optional object with any notable features

Return ONLY a valid JSON array. If no faces are detected, return an empty array [].

Example response format:
[
  {{
    "boundingBox": {{ "x": 25.5, "y": 10.2, "width": 15.3, "height": 20.1 }},
    "confidence": 0.95,
    "attributes": {{}}
  }}
]

Important:
- Coordinates should be percentages of image dimensions (0-100)
- Only include faces you are confident about (confidence > 0.5)
- Return valid JSON only, no additional text or markdown"""

    def _parse_gemini_response(self, text: str) -> list[FaceDetectionResult]:
        """Parse Gemini's text response into FaceDetectionResult array.
        
        Handles various response formats and extracts JSON.
        
        Args:
            text: Raw text response from Gemini
            
        Returns:
            List of FaceDetectionResult objects
        """
        try:
            # Try to extract JSON from the response
            # Gemini sometimes wraps JSON in markdown code blocks
            json_text = text.strip()
            
            # Remove markdown code block if present
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', json_text)
            if json_match:
                json_text = json_match.group(1).strip()
            
            # Try to find JSON array in the text
            array_match = re.search(r'\[[\s\S]*\]', json_text)
            if array_match:
                json_text = array_match.group(0)
            
            # Parse the JSON
            parsed = json.loads(json_text)
            
            # Validate and transform the response
            if not isinstance(parsed, list):
                logger.warning(
                    "Gemini response is not an array",
                    extra={"provider": self.name, "response": text[:500]},
                )
                return []
            
            results = []
            for face_data in parsed:
                if self._is_valid_face_object(face_data):
                    result = self._transform_gemini_face(face_data)
                    results.append(result)
            
            return results
            
        except json.JSONDecodeError as e:
            logger.warning(
                "Failed to parse Gemini response as JSON",
                extra={
                    "provider": self.name,
                    "error": str(e),
                    "response": text[:500],
                },
            )
            # Return empty array on parse failure rather than throwing
            # This allows the system to continue with other providers
            return []

    def _is_valid_face_object(self, obj: Any) -> bool:
        """Validate that an object has the required face detection fields.
        
        Args:
            obj: Object to validate
            
        Returns:
            True if object has required fields
        """
        if not isinstance(obj, dict):
            return False
        
        bounding_box = obj.get("boundingBox")
        if not isinstance(bounding_box, dict):
            return False
        
        required_fields = ["x", "y", "width", "height"]
        for field in required_fields:
            if field not in bounding_box:
                return False
            if not isinstance(bounding_box[field], (int, float)):
                return False
        
        confidence = obj.get("confidence")
        if not isinstance(confidence, (int, float)):
            return False
        
        return True

    def _transform_gemini_face(self, face_data: dict[str, Any]) -> FaceDetectionResult:
        """Transform Gemini face data to our standard format.
        
        Args:
            face_data: Face data dictionary from Gemini
            
        Returns:
            FaceDetectionResult in our standard format
        """
        bbox = face_data["boundingBox"]
        
        # Extract attributes if present
        attributes: Optional[FaceAttributes] = None
        if "attributes" in face_data and face_data["attributes"]:
            attributes = FaceAttributes()
        
        return FaceDetectionResult(
            bounding_box=BoundingBox(
                x=float(bbox["x"]),
                y=float(bbox["y"]),
                width=float(bbox["width"]),
                height=float(bbox["height"]),
            ),
            confidence=float(face_data["confidence"]),
            landmarks=None,  # Gemini doesn't provide landmarks
            attributes=attributes,
            raw_provider_response=face_data,
        )

    # =========================================================================
    # HEALTH CHECK
    # =========================================================================

    async def is_healthy(self) -> bool:
        """Check if the Gemini API is healthy and accessible.
        
        Performs a lightweight health check by generating a short response.
        
        Returns:
            True if provider is healthy, False otherwise
        """
        try:
            model = await self._ensure_client()
            
            # Simple health check - generate a short response
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: model.generate_content("Reply with OK"),
            )
            
            # Check if we got a valid response
            return len(response.text) > 0
            
        except Exception as e:
            logger.warning(
                "Gemini health check failed",
                extra={"provider": self.name, "error": str(e)},
            )
            return False

    # =========================================================================
    # ERROR HANDLING OVERRIDES
    # =========================================================================

    def _is_rate_limit_error(self, error: Exception) -> bool:
        """Check if error is a Gemini rate limit error.
        
        Args:
            error: The exception to check
            
        Returns:
            True if this is a rate limit error
        """
        # Check parent implementation first
        if super()._is_rate_limit_error(error):
            return True
        
        # Check for Gemini-specific rate limit errors
        message = str(error).lower()
        return (
            "resource exhausted" in message or
            "quota" in message or
            "rate limit" in message or
            "too many requests" in message
        )
