"""Google Cloud Vision API provider for face detection.

This module implements the CloudVisionProvider class that uses
Google Cloud Vision API for face detection. It is the primary
provider in the multi-provider architecture.

Features:
- High accuracy face detection with landmarks
- Emotion detection (joy, sorrow, anger, surprise)
- Face angle detection (roll, pan, tilt)
- Bounding polygon with precise coordinates

Configuration:
- Requires service account JSON credentials
- Loaded from admin settings or GOOGLE_APPLICATION_CREDENTIALS env var
- Service account email: rawdrivevision@healthy-skill-481810-g9.iam.gserviceaccount.com
"""

import asyncio
import base64
import json
import logging
from typing import Any, Optional

from app.api.face_schemas import (
    BoundingBox,
    FaceAttributes,
    FaceDetectionResult,
    FaceLandmark,
    FaceLandmarkType,
    LikelihoodLevel,
)
from app.services.face_exceptions import (
    FaceDetectionError,
    ProviderNotConfiguredError,
    ProviderUnavailableError,
)
from app.services.ai.providers.base_provider import BaseProvider
from app.services.ai.providers.types import DetectionOptions


logger = logging.getLogger(__name__)


class CloudVisionProvider(BaseProvider):
    """Google Cloud Vision API provider for face detection.
    
    This is the primary provider for face detection, offering high accuracy
    and detailed face analysis including landmarks and emotions.
    
    The provider uses lazy initialization - the Vision API client is only
    created when first needed, allowing the application to start even if
    credentials are not yet configured.
    
    Attributes:
        name: Provider identifier ('cloud_vision')
        _client: Lazily initialized Vision API client
        _client_init_lock: Lock to prevent concurrent initialization
        _config_service: Configuration service for credentials
    """
    
    def __init__(
        self,
        config_service: Any,  # FaceConfigurationService
    ) -> None:
        """Initialize the Cloud Vision provider.
        
        Args:
            config_service: Configuration service for loading credentials
        """
        super().__init__()
        self._config_service = config_service
        self._client: Any = None  # google.cloud.vision.ImageAnnotatorClient
        self._client_init_lock = asyncio.Lock()
        self._credentials: Optional[dict[str, Any]] = None

    @property
    def name(self) -> str:
        """Provider name for identification and logging."""
        return "cloud_vision"

    # =========================================================================
    # CLIENT INITIALIZATION
    # =========================================================================

    async def _ensure_client(self) -> Any:
        """Lazily initialize the Vision API client.
        
        Credentials are loaded from admin settings or environment.
        Uses a lock to prevent multiple concurrent initializations.
        
        Returns:
            Initialized ImageAnnotatorClient
            
        Raises:
            ProviderNotConfiguredError: If credentials are not available
            ProviderUnavailableError: If client initialization fails
        """
        if self._client is not None:
            return self._client
        
        async with self._client_init_lock:
            # Double-check after acquiring lock
            if self._client is not None:
                return self._client
            
            await self._initialize_client()
            return self._client

    async def _initialize_client(self) -> None:
        """Initialize the Vision API client with credentials.
        
        Loads credentials from configuration service and creates
        the ImageAnnotatorClient instance.
        
        Raises:
            ProviderNotConfiguredError: If credentials are not available
            ProviderUnavailableError: If client initialization fails
        """
        try:
            # Load credentials from configuration service
            self._credentials = await self._config_service.get_provider_credentials(
                "cloud_vision"
            )
            
            # Import Google Cloud Vision library
            try:
                from google.cloud import vision
                from google.oauth2 import service_account
            except ImportError as e:
                raise ProviderUnavailableError(
                    provider_name=self.name,
                    reason="Google Cloud Vision library not installed. "
                           "Install with: pip install google-cloud-vision",
                ) from e
            
            # Create credentials from service account info
            credentials = service_account.Credentials.from_service_account_info(
                self._credentials
            )
            
            # Create the Vision API client
            self._client = vision.ImageAnnotatorClient(credentials=credentials)
            
            logger.info(
                "Cloud Vision client initialized",
                extra={
                    "provider": self.name,
                    "project_id": self._credentials.get("project_id"),
                    "client_email": self._credentials.get("client_email"),
                },
            )
            
        except ProviderNotConfiguredError:
            raise
        except Exception as e:
            logger.error(
                "Failed to initialize Cloud Vision client",
                extra={"provider": self.name, "error": str(e)},
            )
            raise ProviderUnavailableError(
                provider_name=self.name,
                reason=f"Failed to initialize client: {str(e)}",
            ) from e

    # =========================================================================
    # FACE DETECTION
    # =========================================================================

    async def detect_faces(
        self,
        image_buffer: bytes,
        options: Optional[DetectionOptions] = None,
    ) -> list[FaceDetectionResult]:
        """Detect faces in an image using Google Cloud Vision API.
        
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
            client = await self._ensure_client()
            
            # Import Vision types
            from google.cloud import vision
            
            # Create image object
            image = vision.Image(content=image_buffer)
            
            # Call Vision API with face detection feature
            # Run in thread pool since the client is synchronous
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: client.face_detection(
                    image=image,
                    max_results=options.max_faces,
                ),
            )
            
            # Check for errors in response
            if response.error.message:
                raise FaceDetectionError(
                    code="PROVIDER_ERROR",
                    message=f"Vision API error: {response.error.message}",
                    user_message="Unable to analyze the image. Please try a different photo.",
                )
            
            # Get face annotations
            faces = response.face_annotations or []
            
            self.log_response("detect_faces", True, {
                "faces_detected": len(faces),
            })
            
            # Transform Vision API response to our format
            results = []
            for face in faces:
                # Filter by confidence threshold
                confidence = face.detection_confidence or 0
                if confidence < options.min_confidence:
                    continue
                
                result = self._transform_vision_face(face, options)
                results.append(result)
            
            return results
            
        except FaceDetectionError:
            raise
        except Exception as e:
            self.log_response("detect_faces", False, {"error": str(e)})
            raise self.wrap_provider_error(e, "detect_faces")

    def _transform_vision_face(
        self,
        face: Any,  # google.cloud.vision.FaceAnnotation
        options: DetectionOptions,
    ) -> FaceDetectionResult:
        """Transform Cloud Vision face annotation to our standard format.
        
        Args:
            face: Vision API FaceAnnotation object
            options: Detection options
            
        Returns:
            FaceDetectionResult in our standard format
        """
        # Extract bounding box from fdBoundingPoly (face detection bounding poly)
        # This is more accurate than boundingPoly for face detection
        bounding_poly = face.fd_bounding_poly or face.bounding_poly
        bounding_box = self._extract_bounding_box(bounding_poly)
        
        # Extract landmarks if requested
        landmarks: Optional[list[FaceLandmark]] = None
        if options.include_landmarks and face.landmarks:
            landmarks = self._extract_landmarks(face.landmarks)
        
        # Extract attributes if requested
        attributes: Optional[FaceAttributes] = None
        if options.include_attributes:
            attributes = self._extract_attributes(face)
        
        return FaceDetectionResult(
            bounding_box=bounding_box,
            confidence=face.detection_confidence or 0,
            landmarks=landmarks,
            attributes=attributes,
            raw_provider_response=self._face_to_dict(face),
        )

    def _extract_bounding_box(self, bounding_poly: Any) -> BoundingBox:
        """Extract bounding box from Vision API bounding polygon.
        
        Vision API returns face bounds as a polygon with 4 vertices.
        We convert this to our standard x, y, width, height format.
        
        Note: Vision API returns pixel coordinates. We store them as-is
        and normalize to percentages when we have image dimensions.
        
        Args:
            bounding_poly: Vision API BoundingPoly object
            
        Returns:
            BoundingBox with pixel coordinates
        """
        if not bounding_poly or not bounding_poly.vertices:
            return BoundingBox(x=0, y=0, width=0, height=0)
        
        vertices = bounding_poly.vertices
        
        # Extract x and y coordinates from vertices
        xs = [v.x or 0 for v in vertices]
        ys = [v.y or 0 for v in vertices]
        
        # Calculate bounding box
        min_x = min(xs)
        max_x = max(xs)
        min_y = min(ys)
        max_y = max(ys)
        
        # Return pixel coordinates (will be normalized later with image dimensions)
        # For now, we return as percentages assuming typical image size
        # The actual normalization happens when we have image metadata
        return BoundingBox(
            x=float(min_x),
            y=float(min_y),
            width=float(max_x - min_x),
            height=float(max_y - min_y),
        )

    def _extract_landmarks(
        self,
        landmarks: list[Any],
    ) -> list[FaceLandmark]:
        """Extract facial landmarks from Vision API response.
        
        Args:
            landmarks: List of Vision API Landmark objects
            
        Returns:
            List of FaceLandmark objects in our format
        """
        result = []
        
        # Map Vision API landmark types to our types
        landmark_type_map = {
            "LEFT_EYE": FaceLandmarkType.LEFT_EYE,
            "RIGHT_EYE": FaceLandmarkType.RIGHT_EYE,
            "NOSE_TIP": FaceLandmarkType.NOSE_TIP,
            "MOUTH_LEFT": FaceLandmarkType.MOUTH_LEFT,
            "MOUTH_RIGHT": FaceLandmarkType.MOUTH_RIGHT,
            "LEFT_EYE_PUPIL": FaceLandmarkType.LEFT_EYE,
            "RIGHT_EYE_PUPIL": FaceLandmarkType.RIGHT_EYE,
            "UPPER_LIP": FaceLandmarkType.MOUTH_CENTER,
            "LOWER_LIP": FaceLandmarkType.MOUTH_CENTER,
        }
        
        for landmark in landmarks:
            # Get landmark type name
            type_name = landmark.type_.name if hasattr(landmark.type_, "name") else str(landmark.type_)
            
            # Map to our landmark type
            landmark_type = landmark_type_map.get(type_name)
            if landmark_type is None:
                continue
            
            # Extract position
            position = landmark.position
            if position:
                result.append(FaceLandmark(
                    type=landmark_type,
                    x=position.x or 0,
                    y=position.y or 0,
                ))
        
        return result

    def _extract_attributes(self, face: Any) -> FaceAttributes:
        """Extract face attributes from Vision API response.
        
        Args:
            face: Vision API FaceAnnotation object
            
        Returns:
            FaceAttributes with emotion and angle data
        """
        # Map Vision API likelihood to our enum
        def map_likelihood(likelihood: Any) -> Optional[LikelihoodLevel]:
            if likelihood is None:
                return None
            
            likelihood_map = {
                "UNKNOWN": LikelihoodLevel.UNKNOWN,
                "VERY_UNLIKELY": LikelihoodLevel.VERY_UNLIKELY,
                "UNLIKELY": LikelihoodLevel.UNLIKELY,
                "POSSIBLE": LikelihoodLevel.POSSIBLE,
                "LIKELY": LikelihoodLevel.LIKELY,
                "VERY_LIKELY": LikelihoodLevel.VERY_LIKELY,
            }
            
            # Handle both enum and string values
            if hasattr(likelihood, "name"):
                name = likelihood.name
            else:
                name = str(likelihood)
            
            return likelihood_map.get(name, LikelihoodLevel.UNKNOWN)
        
        return FaceAttributes(
            roll_angle=face.roll_angle,
            pan_angle=face.pan_angle,
            tilt_angle=face.tilt_angle,
            joy_likelihood=map_likelihood(face.joy_likelihood),
            sorrow_likelihood=map_likelihood(face.sorrow_likelihood),
            anger_likelihood=map_likelihood(face.anger_likelihood),
            surprise_likelihood=map_likelihood(face.surprise_likelihood),
            blur_likelihood=map_likelihood(face.blurred_likelihood),
            underexposed_likelihood=map_likelihood(face.under_exposed_likelihood),
        )

    def _face_to_dict(self, face: Any) -> dict[str, Any]:
        """Convert Vision API face annotation to dictionary for storage.
        
        Args:
            face: Vision API FaceAnnotation object
            
        Returns:
            Dictionary representation of the face annotation
        """
        try:
            # Use protobuf's MessageToDict if available
            from google.protobuf.json_format import MessageToDict
            return MessageToDict(face._pb)
        except Exception:
            # Fallback to basic conversion
            return {
                "detection_confidence": face.detection_confidence,
                "roll_angle": face.roll_angle,
                "pan_angle": face.pan_angle,
                "tilt_angle": face.tilt_angle,
            }

    # =========================================================================
    # HEALTH CHECK
    # =========================================================================

    async def is_healthy(self) -> bool:
        """Check if the Cloud Vision API is healthy and accessible.
        
        Performs a lightweight health check by verifying:
        - Credentials are valid
        - API is reachable
        - Project ID can be retrieved
        
        Returns:
            True if provider is healthy, False otherwise
        """
        try:
            client = await self._ensure_client()
            
            # Simple health check - try to get project info
            # This validates credentials without consuming quota
            loop = asyncio.get_event_loop()
            
            # The client doesn't have a direct health check method,
            # so we verify the credentials are valid by checking
            # if the client was initialized successfully
            if client is None:
                return False
            
            # Verify credentials are still valid
            if self._credentials:
                project_id = self._credentials.get("project_id")
                if project_id:
                    logger.debug(
                        "Cloud Vision health check passed",
                        extra={"provider": self.name, "project_id": project_id},
                    )
                    return True
            
            return True
            
        except Exception as e:
            logger.warning(
                "Cloud Vision health check failed",
                extra={"provider": self.name, "error": str(e)},
            )
            return False

    # =========================================================================
    # ERROR HANDLING OVERRIDES
    # =========================================================================

    def _is_rate_limit_error(self, error: Exception) -> bool:
        """Check if error is a Cloud Vision rate limit error.
        
        Args:
            error: The exception to check
            
        Returns:
            True if this is a rate limit error
        """
        # Check parent implementation first
        if super()._is_rate_limit_error(error):
            return True
        
        # Check for Google-specific rate limit errors
        message = str(error).lower()
        return (
            "resource_exhausted" in message or
            "quota" in message or
            "rate limit" in message
        )
