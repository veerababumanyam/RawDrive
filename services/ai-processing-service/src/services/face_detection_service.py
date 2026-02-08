"""
Face Detection Service using InsightFace

Provides GPU-accelerated face detection and landmark extraction using InsightFace.
Detects faces in images and returns bounding boxes, confidence scores, landmarks,
and basic face attributes.

Feature: Face Detection and Identification
Task: T007 - Add InsightFace model loader and face detection service
"""

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import torch
from PIL import Image

from config import get_settings

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class FaceLandmarks:
    """Facial landmark points.

    InsightFace provides 5-point landmarks:
    - Left eye center
    - Right eye center
    - Nose tip
    - Left mouth corner
    - Right mouth corner
    """

    left_eye: Tuple[float, float]
    right_eye: Tuple[float, float]
    nose: Tuple[float, float]
    left_mouth: Tuple[float, float]
    right_mouth: Tuple[float, float]

    def to_dict(self) -> Dict[str, Tuple[float, float]]:
        """Convert landmarks to dictionary format."""
        return {
            "left_eye": self.left_eye,
            "right_eye": self.right_eye,
            "nose": self.nose,
            "left_mouth": self.left_mouth,
            "right_mouth": self.right_mouth,
        }

    def to_list(self) -> List[Tuple[float, float]]:
        """Convert landmarks to list format (InsightFace order)."""
        return [
            self.left_eye,
            self.right_eye,
            self.nose,
            self.left_mouth,
            self.right_mouth,
        ]


@dataclass
class BoundingBoxResult:
    """Face bounding box with absolute pixel coordinates.

    Attributes:
        x: Left edge X coordinate (pixels)
        y: Top edge Y coordinate (pixels)
        width: Box width (pixels)
        height: Box height (pixels)
    """

    x: int
    y: int
    width: int
    height: int

    def to_percentage(
        self, image_width: int, image_height: int
    ) -> Dict[str, float]:
        """Convert to percentage-based coordinates.

        Args:
            image_width: Original image width in pixels
            image_height: Original image height in pixels

        Returns:
            Dict with x, y, width, height as percentages (0-100)
        """
        return {
            "x": round((self.x / image_width) * 100, 4),
            "y": round((self.y / image_height) * 100, 4),
            "width": round((self.width / image_width) * 100, 4),
            "height": round((self.height / image_height) * 100, 4),
        }

    @property
    def center(self) -> Tuple[int, int]:
        """Calculate center point of bounding box."""
        return (self.x + self.width // 2, self.y + self.height // 2)

    @property
    def area(self) -> int:
        """Calculate area in pixels."""
        return self.width * self.height


@dataclass
class FaceAttributes:
    """Additional face attributes from detection.

    Attributes:
        age: Estimated age (if available)
        gender: Estimated gender (if available)
        pose: Head pose angles (pitch, yaw, roll) in degrees
    """

    age: Optional[int] = None
    gender: Optional[str] = None
    pose: Optional[Dict[str, float]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert attributes to dictionary."""
        result = {}
        if self.age is not None:
            result["age"] = self.age
        if self.gender is not None:
            result["gender"] = self.gender
        if self.pose is not None:
            result["pose"] = self.pose
        return result


@dataclass
class DetectedFace:
    """Complete face detection result.

    Contains all information about a single detected face including
    bounding box, confidence, landmarks, and optional attributes.
    """

    bounding_box: BoundingBoxResult
    confidence: float
    landmarks: Optional[FaceLandmarks] = None
    attributes: Optional[FaceAttributes] = None
    detection_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(
        self, image_width: int, image_height: int
    ) -> Dict[str, Any]:
        """Convert detection result to dictionary format.

        Args:
            image_width: Original image width for percentage conversion
            image_height: Original image height for percentage conversion

        Returns:
            Dictionary with all detection data
        """
        result = {
            "bounding_box": self.bounding_box.to_percentage(
                image_width, image_height
            ),
            "bounding_box_pixels": {
                "x": self.bounding_box.x,
                "y": self.bounding_box.y,
                "width": self.bounding_box.width,
                "height": self.bounding_box.height,
            },
            "confidence": round(self.confidence, 6),
        }

        if self.landmarks:
            result["landmarks"] = self.landmarks.to_dict()

        if self.attributes:
            result["attributes"] = self.attributes.to_dict()

        if self.detection_metadata:
            result["metadata"] = self.detection_metadata

        return result


# =============================================================================
# FACE DETECTION SERVICE
# =============================================================================


class FaceDetectionService:
    """InsightFace-based face detection service.

    Provides face detection with configurable model selection and
    GPU acceleration support. Uses lazy initialization to defer
    model loading until first use.

    Supported models:
        - buffalo_l: Large model, highest accuracy (default)
        - buffalo_m: Medium model, balanced accuracy/speed
        - buffalo_s: Small model, fastest inference
        - buffalo_sc: Small model for edge devices

    Example:
        service = get_face_detection_service()
        faces = service.detect_faces("/path/to/image.jpg")
        for face in faces:
            print(f"Face at {face.bounding_box}, confidence: {face.confidence}")
    """

    # Available InsightFace models
    AVAILABLE_MODELS = [
        "buffalo_l",  # Large - highest accuracy
        "buffalo_m",  # Medium - balanced
        "buffalo_s",  # Small - faster
        "buffalo_sc", # Small for edge
        "antelopev2", # Alternative model pack
    ]

    def __init__(
        self,
        model_name: Optional[str] = None,
        det_size: Tuple[int, int] = (640, 640),
        providers: Optional[List[str]] = None,
    ):
        """Initialize face detection service.

        Model is loaded lazily on first detection call.

        Args:
            model_name: InsightFace model pack name (default from config)
            det_size: Detection resolution (width, height)
            providers: ONNX execution providers (auto-detected if None)
        """
        self.settings = get_settings()
        self.model_name = model_name or getattr(
            self.settings, "FACE_DETECTION_MODEL", "buffalo_l"
        )
        self.det_size = det_size
        self._providers = providers
        self.model = None
        self._initialized = False
        self.device = self._get_device()

        # Get configuration values with defaults
        self.min_confidence = getattr(
            self.settings, "FACE_DETECTION_CONFIDENCE_THRESHOLD", 0.5
        )
        self.max_faces = getattr(
            self.settings, "FACE_DETECTION_MAX_FACES", 100
        )

        logger.info(
            f"Face detection service initialized "
            f"(model: {self.model_name}, device: {self.device}, "
            f"det_size: {self.det_size})"
        )

    def _get_device(self) -> str:
        """Determine the best available compute device.

        Returns:
            Device string: "cuda", "mps", or "cpu"
        """
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"

    def _get_providers(self) -> List[str]:
        """Get ONNX Runtime execution providers.

        Returns ordered list of providers to try, with GPU providers first.

        Returns:
            List of ONNX execution provider names
        """
        if self._providers:
            return self._providers

        providers = []

        # Check for GPU providers
        if self.device == "cuda":
            providers.append("CUDAExecutionProvider")
        elif self.device == "mps":
            providers.append("CoreMLExecutionProvider")

        # Always include CPU as fallback
        providers.append("CPUExecutionProvider")

        return providers

    def _ensure_initialized(self) -> None:
        """Lazy load InsightFace model.

        Raises:
            RuntimeError: If model loading fails
        """
        if self._initialized:
            return

        logger.info(f"Loading InsightFace model: {self.model_name}")
        start_time = time.time()

        try:
            from insightface.app import FaceAnalysis

            # Initialize FaceAnalysis app
            self.model = FaceAnalysis(
                name=self.model_name,
                providers=self._get_providers(),
            )

            # Prepare model for detection
            self.model.prepare(
                ctx_id=0 if self.device == "cuda" else -1,
                det_size=self.det_size,
            )

            self._initialized = True
            load_time = time.time() - start_time
            logger.info(
                f"InsightFace model loaded successfully "
                f"(time: {load_time:.2f}s, providers: {self._get_providers()})"
            )

        except ImportError as e:
            logger.error(
                f"InsightFace not installed. Install with: "
                f"pip install insightface onnxruntime-gpu"
            )
            raise RuntimeError(f"InsightFace not available: {e}")
        except Exception as e:
            logger.error(f"Failed to load InsightFace model: {e}")
            raise RuntimeError(f"InsightFace model loading failed: {e}")

    def detect_faces(
        self,
        image_source: Union[str, Path, np.ndarray, Image.Image],
        min_confidence: Optional[float] = None,
        max_faces: Optional[int] = None,
        extract_attributes: bool = True,
    ) -> List[DetectedFace]:
        """Detect faces in an image.

        Args:
            image_source: Path to image file, numpy array, or PIL Image
            min_confidence: Minimum confidence threshold (default from config)
            max_faces: Maximum number of faces to return (default from config)
            extract_attributes: Whether to extract age/gender attributes

        Returns:
            List of DetectedFace objects sorted by confidence (highest first)

        Raises:
            FileNotFoundError: If image file doesn't exist
            ValueError: If image cannot be loaded
            RuntimeError: If detection fails
        """
        self._ensure_initialized()

        min_conf = min_confidence if min_confidence is not None else self.min_confidence
        max_face_count = max_faces if max_faces is not None else self.max_faces

        # Load image
        image, image_width, image_height = self._load_image(image_source)

        logger.debug(
            f"Running face detection on image "
            f"({image_width}x{image_height})"
        )

        start_time = time.time()

        try:
            # Run InsightFace detection
            faces = self.model.get(image, max_num=max_face_count)

            detection_time = time.time() - start_time
            logger.debug(
                f"Face detection completed: {len(faces)} faces found "
                f"in {detection_time:.3f}s"
            )

            # Convert to DetectedFace objects
            results = []
            for face in faces:
                confidence = float(face.det_score)

                # Skip low confidence detections
                if confidence < min_conf:
                    continue

                detected = self._convert_face_result(
                    face,
                    image_width,
                    image_height,
                    extract_attributes,
                )
                results.append(detected)

            # Sort by confidence (highest first)
            results.sort(key=lambda f: f.confidence, reverse=True)

            logger.info(
                f"Detected {len(results)} faces "
                f"(filtered from {len(faces)} raw detections, "
                f"min_confidence: {min_conf}, time: {detection_time:.3f}s)"
            )

            return results

        except Exception as e:
            logger.error(f"Face detection failed: {e}")
            raise RuntimeError(f"Face detection failed: {e}")

    def _load_image(
        self, image_source: Union[str, Path, np.ndarray, Image.Image]
    ) -> Tuple[np.ndarray, int, int]:
        """Load image from various sources.

        Args:
            image_source: Image path, numpy array, or PIL Image

        Returns:
            Tuple of (BGR numpy array, width, height)

        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If image cannot be loaded
        """
        if isinstance(image_source, (str, Path)):
            path = Path(image_source)
            if not path.exists():
                raise FileNotFoundError(f"Image file not found: {path}")

            image = cv2.imread(str(path))
            if image is None:
                raise ValueError(f"Failed to load image: {path}")

        elif isinstance(image_source, Image.Image):
            # Convert PIL to OpenCV BGR format
            image = cv2.cvtColor(np.array(image_source), cv2.COLOR_RGB2BGR)

        elif isinstance(image_source, np.ndarray):
            # Assume already in correct format (BGR for OpenCV)
            image = image_source

        else:
            raise ValueError(
                f"Unsupported image source type: {type(image_source)}"
            )

        height, width = image.shape[:2]
        return image, width, height

    def _convert_face_result(
        self,
        face: Any,
        image_width: int,
        image_height: int,
        extract_attributes: bool,
    ) -> DetectedFace:
        """Convert InsightFace result to DetectedFace.

        Args:
            face: InsightFace Face object
            image_width: Original image width
            image_height: Original image height
            extract_attributes: Whether to include age/gender

        Returns:
            DetectedFace object
        """
        # Extract bounding box (InsightFace returns [x1, y1, x2, y2])
        bbox = face.bbox.astype(int)
        x1, y1, x2, y2 = bbox
        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(image_width, x2)
        y2 = min(image_height, y2)

        bounding_box = BoundingBoxResult(
            x=x1,
            y=y1,
            width=x2 - x1,
            height=y2 - y1,
        )

        # Extract landmarks (5-point)
        landmarks = None
        if hasattr(face, "kps") and face.kps is not None:
            kps = face.kps.astype(float)
            if len(kps) >= 5:
                landmarks = FaceLandmarks(
                    left_eye=(float(kps[0][0]), float(kps[0][1])),
                    right_eye=(float(kps[1][0]), float(kps[1][1])),
                    nose=(float(kps[2][0]), float(kps[2][1])),
                    left_mouth=(float(kps[3][0]), float(kps[3][1])),
                    right_mouth=(float(kps[4][0]), float(kps[4][1])),
                )

        # Extract attributes (age, gender, pose)
        attributes = None
        if extract_attributes:
            age = None
            gender = None
            pose = None

            if hasattr(face, "age") and face.age is not None:
                age = int(face.age)

            if hasattr(face, "gender") and face.gender is not None:
                # InsightFace returns 0 for female, 1 for male
                gender = "male" if face.gender == 1 else "female"

            if hasattr(face, "pose") and face.pose is not None:
                pose_vals = face.pose
                pose = {
                    "pitch": float(pose_vals[0]),
                    "yaw": float(pose_vals[1]),
                    "roll": float(pose_vals[2]),
                }

            if age is not None or gender is not None or pose is not None:
                attributes = FaceAttributes(
                    age=age,
                    gender=gender,
                    pose=pose,
                )

        # Build metadata
        metadata = {
            "model": self.model_name,
            "det_size": self.det_size,
        }

        return DetectedFace(
            bounding_box=bounding_box,
            confidence=float(face.det_score),
            landmarks=landmarks,
            attributes=attributes,
            detection_metadata=metadata,
        )

    def detect_faces_batch(
        self,
        image_sources: List[Union[str, Path, np.ndarray, Image.Image]],
        min_confidence: Optional[float] = None,
        max_faces: Optional[int] = None,
    ) -> List[List[DetectedFace]]:
        """Detect faces in multiple images.

        Args:
            image_sources: List of image paths, arrays, or PIL Images
            min_confidence: Minimum confidence threshold
            max_faces: Maximum faces per image

        Returns:
            List of face detection results per image
        """
        results = []
        for source in image_sources:
            try:
                faces = self.detect_faces(
                    source,
                    min_confidence=min_confidence,
                    max_faces=max_faces,
                )
                results.append(faces)
            except Exception as e:
                logger.warning(f"Failed to process image: {e}")
                results.append([])  # Empty list for failed images

        return results

    def get_face_crop(
        self,
        image_source: Union[str, Path, np.ndarray, Image.Image],
        face: DetectedFace,
        margin: float = 0.2,
        target_size: Optional[Tuple[int, int]] = None,
    ) -> np.ndarray:
        """Crop a detected face from the image.

        Args:
            image_source: Source image
            face: DetectedFace to crop
            margin: Margin around face as fraction of face size
            target_size: Optional resize target (width, height)

        Returns:
            Cropped face image as numpy array (BGR)
        """
        image, img_width, img_height = self._load_image(image_source)

        # Calculate crop region with margin
        bbox = face.bounding_box
        margin_x = int(bbox.width * margin)
        margin_y = int(bbox.height * margin)

        x1 = max(0, bbox.x - margin_x)
        y1 = max(0, bbox.y - margin_y)
        x2 = min(img_width, bbox.x + bbox.width + margin_x)
        y2 = min(img_height, bbox.y + bbox.height + margin_y)

        crop = image[y1:y2, x1:x2]

        if target_size is not None:
            crop = cv2.resize(crop, target_size, interpolation=cv2.INTER_AREA)

        return crop

    def is_initialized(self) -> bool:
        """Check if model is loaded."""
        return self._initialized

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model.

        Returns:
            Dictionary with model details
        """
        return {
            "model_name": self.model_name,
            "initialized": self._initialized,
            "device": self.device,
            "providers": self._get_providers(),
            "det_size": self.det_size,
            "min_confidence": self.min_confidence,
            "max_faces": self.max_faces,
        }

    def clear_cache(self) -> None:
        """Clear GPU memory cache."""
        if self.device == "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.debug("GPU cache cleared")

    def unload_model(self) -> None:
        """Unload model from memory.

        Call this to free GPU/CPU memory when detection is no longer needed.
        """
        if self._initialized:
            del self.model
            self.model = None
            self._initialized = False

            if self.device == "cuda":
                torch.cuda.empty_cache()

            logger.info("InsightFace model unloaded from memory")


# =============================================================================
# SINGLETON ACCESSOR
# =============================================================================

_face_detection_service: Optional[FaceDetectionService] = None


def get_face_detection_service() -> FaceDetectionService:
    """Get singleton face detection service instance.

    The model is lazily loaded on first detection call.

    Returns:
        FaceDetectionService instance

    Example:
        service = get_face_detection_service()
        faces = service.detect_faces("photo.jpg")
    """
    global _face_detection_service
    if _face_detection_service is None:
        _face_detection_service = FaceDetectionService()
    return _face_detection_service


def reset_face_detection_service() -> None:
    """Reset the singleton instance.

    Useful for testing or when configuration changes.
    """
    global _face_detection_service
    if _face_detection_service is not None:
        _face_detection_service.unload_model()
    _face_detection_service = None


# =============================================================================
# MODULE EXPORTS
# =============================================================================

__all__ = [
    "FaceDetectionService",
    "DetectedFace",
    "BoundingBoxResult",
    "FaceLandmarks",
    "FaceAttributes",
    "get_face_detection_service",
    "reset_face_detection_service",
]
