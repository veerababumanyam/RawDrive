"""Local/OpenCV-based face detection provider (fallback).

This module implements the LocalProvider class that uses OpenCV's
DNN face detector for local face detection without requiring external APIs.

Features:
- No API key or credentials required
- Works offline
- Uses pre-trained deep learning model (OpenCV DNN)
- Suitable for development/testing or API quota exhaustion

Configuration:
- No environment variables required
- Model files are downloaded automatically on first use
"""

import asyncio
import logging
from pathlib import Path
from typing import Any, Optional
import tempfile
import urllib.request
import os

from app.api.face_schemas import (
    BoundingBox,
    FaceAttributes,
    FaceDetectionErrorCode,
    FaceDetectionResult,
)
from app.services.face_exceptions import (
    FaceDetectionError,
    ProviderUnavailableError,
)
from app.services.ai.providers.base_provider import BaseProvider
from app.services.ai.providers.types import DetectionOptions


logger = logging.getLogger(__name__)


# Model URLs for OpenCV DNN face detector
MODEL_URL = "https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20170830/res10_300x300_ssd_iter_140000.caffemodel"
PROTOTXT_URL = "https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/deploy.prototxt"

# Model cache directory
MODEL_DIR = Path(tempfile.gettempdir()) / "rawdrive_face_models"


class LocalProvider(BaseProvider):
    """Local face detection provider using OpenCV DNN.
    
    Uses the SSD (Single Shot Detector) face detection model
    from OpenCV's DNN module. This provides reasonable accuracy
    without requiring any external API credentials.
    
    Pros:
    - No API key required
    - Works offline
    - No API quotas or rate limits
    - Fast (runs on CPU)
    
    Cons:
    - Less accurate than cloud APIs
    - No facial landmarks
    - No facial attributes/emotions
    - CPU-intensive for large images
    
    Attributes:
        name: Provider identifier ('local')
        _net: OpenCV DNN network
        _initialized: Whether model is loaded
    """
    
    def __init__(
        self,
        config_service: Any = None,  # Not needed for local provider
    ) -> None:
        """Initialize the local provider.
        
        Args:
            config_service: Configuration service (unused)
        """
        super().__init__()
        self._config_service = config_service
        self._net = None
        self._initialized = False
        self._init_lock = asyncio.Lock()

    @property
    def name(self) -> str:
        """Provider name for identification and logging."""
        return "local"

    async def _ensure_model_loaded(self) -> None:
        """Ensure OpenCV DNN model is loaded."""
        if self._initialized:
            return
        
        async with self._init_lock:
            if self._initialized:
                return
            
            await self._load_model()
            self._initialized = True

    async def _load_model(self) -> None:
        """Download and load the face detection model."""
        try:
            import cv2
        except ImportError:
            raise ProviderUnavailableError(
                provider_name=self.name,
                reason="OpenCV (cv2) is not installed. Install with: pip install opencv-python",
            )
        
        # Ensure model directory exists
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        
        model_path = MODEL_DIR / "res10_300x300_ssd_iter_140000.caffemodel"
        prototxt_path = MODEL_DIR / "deploy.prototxt"
        
        # Download model if not present
        if not model_path.exists():
            logger.info("Downloading face detection model...")
            await asyncio.to_thread(
                urllib.request.urlretrieve, MODEL_URL, str(model_path)
            )
            logger.info("Model downloaded successfully")
        
        # Download prototxt if not present
        if not prototxt_path.exists():
            logger.info("Downloading model config...")
            await asyncio.to_thread(
                urllib.request.urlretrieve, PROTOTXT_URL, str(prototxt_path)
            )
            logger.info("Config downloaded successfully")
        
        # Load the model
        self._net = cv2.dnn.readNetFromCaffe(
            str(prototxt_path), str(model_path)
        )
        
        logger.info(
            "Local face detection model loaded",
            extra={"provider": self.name},
        )

    async def detect_faces(
        self,
        image_buffer: bytes,
        options: Optional[DetectionOptions] = None,
    ) -> list[FaceDetectionResult]:
        """Detect faces in an image using OpenCV DNN.
        
        Args:
            image_buffer: Raw image data as bytes
            options: Detection options (max_faces, min_confidence, etc.)
            
        Returns:
            List of detected faces with bounding boxes and confidence scores
            
        Raises:
            FaceDetectionError: If detection fails
        """
        options = options or DetectionOptions()
        
        # Validate image
        self.validate_image(image_buffer)
        
        self.log_request("detect_faces", {
            "image_size": len(image_buffer),
            "max_faces": options.max_faces,
            "min_confidence": options.min_confidence,
        })
        
        try:
            # Ensure model is loaded
            await self._ensure_model_loaded()
            
            import cv2
            import numpy as np
            
            # Decode image
            nparr = np.frombuffer(image_buffer, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise FaceDetectionError(
                    code=FaceDetectionErrorCode.IMAGE_DECODE_FAILED,
                    message="Failed to decode image",
                    user_message="Could not read the image. Please try a different format.",
                )
            
            (h, w) = image.shape[:2]
            
            # Run face detection in thread pool (CPU-bound)
            faces = await asyncio.to_thread(
                self._detect_faces_sync, image, w, h, options
            )
            
            # Generate embeddings for detected faces
            # This enables face clustering which is critical for the "People" feature
            try:
                from app.services.ai.face_embedder import get_face_embedder
                embedder = get_face_embedder()
                
                # Ensure model is ready (downloads if needed)
                await embedder.ensure_initialized()
                
                for face in faces:
                    # Convert percentage coordinates back to pixels for cropping
                    box = face.bounding_box
                    x_px = int((box.x / 100.0) * w)
                    y_px = int((box.y / 100.0) * h)
                    w_px = int((box.width / 100.0) * w)
                    h_px = int((box.height / 100.0) * h)
                    
                    # Ensure coordinates are valid
                    x_px = max(0, x_px)
                    y_px = max(0, y_px)
                    w_px = min(w - x_px, w_px)
                    h_px = min(h - y_px, h_px)
                    
                    if w_px > 0 and h_px > 0:
                        # Extract face crop
                        face_crop = image[y_px:y_px+h_px, x_px:x_px+w_px]
                        
                        if face_crop.size > 0:
                            # Generate embedding
                            face.embedding = await embedder.generate_embedding(face_crop)
                            
            except Exception as e:
                # Log but don't fail the whole detection if embedding fails
                logger.warning(
                    "Failed to generate embeddings for detected faces",
                    extra={"error": str(e)}
                )
            
            self.log_response("detect_faces", True, {
                "faces_detected": len(faces),
                "opt_embeddings_generated": sum(1 for f in faces if f.embedding),
            })
            
            return faces
            
        except FaceDetectionError:
            raise
        except Exception as e:
            self.log_response("detect_faces", False, {"error": str(e)})
            raise self.wrap_provider_error(e, "detect_faces")

    def _detect_faces_sync(
        self,
        image,
        width: int,
        height: int,
        options: DetectionOptions,
    ) -> list[FaceDetectionResult]:
        """Synchronous face detection (runs in thread pool).
        
        Args:
            image: OpenCV image (BGR format)
            width: Image width
            height: Image height
            options: Detection options
            
        Returns:
            List of FaceDetectionResult
        """
        import cv2
        
        # Prepare image for DNN
        # Resize to 300x300 as expected by the model
        blob = cv2.dnn.blobFromImage(
            cv2.resize(image, (300, 300)),
            1.0,
            (300, 300),
            (104.0, 177.0, 123.0),  # Mean subtraction values
        )
        
        # Set input and run forward pass
        self._net.setInput(blob)
        detections = self._net.forward()
        
        results = []
        
        # Process detections
        for i in range(detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            
            # Filter by confidence
            if confidence < options.min_confidence:
                continue
            
            # Get bounding box coordinates (normalized 0-1)
            box = detections[0, 0, i, 3:7]
            
            # Convert to percentage (0-100)
            x = max(0, box[0] * 100)
            y = max(0, box[1] * 100)
            x2 = min(100, box[2] * 100)
            y2 = min(100, box[3] * 100)
            
            result = FaceDetectionResult(
                bounding_box=BoundingBox(
                    x=float(x),
                    y=float(y),
                    width=float(x2 - x),
                    height=float(y2 - y),
                ),
                confidence=float(confidence),
                landmarks=None,  # Local provider doesn't provide landmarks
                attributes=None,  # Local provider doesn't provide attributes
                raw_provider_response={
                    "index": i,
                    "confidence": float(confidence),
                    "provider": "local_opencv",
                },
            )
            
            results.append(result)
            
            # Limit number of faces
            if len(results) >= options.max_faces:
                break
        
        return results

    async def is_healthy(self) -> bool:
        """Check if the local provider is healthy.
        
        Returns:
            True if OpenCV is available and model can be loaded
        """
        try:
            import cv2
            await self._ensure_model_loaded()
            return self._net is not None
        except Exception as e:
            logger.warning(
                "Local provider health check failed",
                extra={"provider": self.name, "error": str(e)},
            )
            return False


# Singleton
_local_provider: Optional[LocalProvider] = None


def get_local_provider() -> LocalProvider:
    """Get singleton local provider instance."""
    global _local_provider
    if _local_provider is None:
        _local_provider = LocalProvider()
    return _local_provider
