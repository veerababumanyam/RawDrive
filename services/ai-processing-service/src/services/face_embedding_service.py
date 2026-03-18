"""Face Embedding Extraction Service

Extracts 512-dimensional face embeddings using InsightFace's recognition model.
Embeddings are L2-normalized vectors suitable for cosine similarity comparison
and storage in pgvector.

Feature: Face Detection and Identification
Task: T008 - Create face embedding extraction service
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from config import get_settings

from typing import TYPE_CHECKING as _TC
if _TC:
    import cv2
    import numpy as np
    import torch
    from PIL import Image
from services.face_detection_service import (
    DetectedFace,
    FaceDetectionService,
    FaceLandmarks,
    get_face_detection_service,
)

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class FaceEmbeddingResult:
    """Result of face embedding extraction.

    Attributes:
        embedding: 512-dimensional L2-normalized embedding vector
        face: Original detected face with bounding box and landmarks
        quality_score: Estimated quality of the embedding (0.0-1.0)
        aligned_face: Optional aligned face crop used for embedding
    """

    embedding: np.ndarray
    face: DetectedFace
    quality_score: float
    aligned_face: Optional[np.ndarray] = None

    def to_dict(
        self, image_width: int, image_height: int, include_aligned_face: bool = False
    ) -> Dict[str, Any]:
        """Convert result to dictionary format.

        Args:
            image_width: Original image width for bbox percentage conversion
            image_height: Original image height for bbox percentage conversion
            include_aligned_face: Whether to include base64-encoded aligned face

        Returns:
            Dictionary with embedding and face detection data
        """
        result = {
            "embedding": self.embedding.tolist(),
            "embedding_dim": len(self.embedding),
            "quality_score": round(self.quality_score, 4),
            "face": self.face.to_dict(image_width, image_height),
        }

        if include_aligned_face and self.aligned_face is not None:
            import base64

            _, buffer = cv2.imencode(".jpg", self.aligned_face)
            result["aligned_face_base64"] = base64.b64encode(buffer).decode("utf-8")

        return result

    @property
    def embedding_list(self) -> List[float]:
        """Get embedding as Python list for database storage."""
        return self.embedding.tolist()


@dataclass
class BatchEmbeddingResult:
    """Result of batch embedding extraction for a single image.

    Attributes:
        image_path: Source image path
        embeddings: List of embedding results for all faces in image
        processing_time_ms: Time taken to process in milliseconds
        error: Error message if processing failed
    """

    image_path: str
    embeddings: List[FaceEmbeddingResult]
    processing_time_ms: float
    error: Optional[str] = None

    @property
    def face_count(self) -> int:
        """Number of faces with embeddings extracted."""
        return len(self.embeddings)

    @property
    def success(self) -> bool:
        """Whether extraction succeeded (at least partially)."""
        return self.error is None


# =============================================================================
# FACE EMBEDDING SERVICE
# =============================================================================


class FaceEmbeddingService:
    """Service for extracting face embeddings using InsightFace.

    Provides GPU-accelerated face embedding extraction from detected faces.
    Uses InsightFace's recognition model (ArcFace) to generate 512-dimensional
    embeddings that are L2-normalized for cosine similarity comparison.

    The service supports:
    - Single face embedding extraction
    - Batch processing for multiple faces/images
    - Face alignment before embedding extraction
    - Quality estimation for embeddings
    - GPU acceleration with fallback to CPU

    Example:
        service = get_face_embedding_service()
        results = service.extract_embeddings("photo.jpg")
        for result in results:
            print(f"Face embedding: {result.embedding.shape}")
            print(f"Quality: {result.quality_score}")
    """

    # InsightFace embedding dimension (ArcFace)
    EMBEDDING_DIM = 512

    # Minimum face size for reliable embedding extraction (pixels)
    MIN_FACE_SIZE = 32

    # Quality thresholds based on face characteristics
    QUALITY_HIGH_THRESHOLD = 0.8
    QUALITY_LOW_THRESHOLD = 0.3

    def __init__(
        self,
        detection_service: Optional[FaceDetectionService] = None,
    ):
        """Initialize face embedding service.

        Args:
            detection_service: Optional pre-configured FaceDetectionService.
                If None, will use singleton instance.
        """
        self.settings = get_settings()
        self._detection_service = detection_service
        self.device: Optional[str] = None
        self._initialized = False

        # Get embedding dimension from config (default 512)
        self.embedding_dim = getattr(
            self.settings, "FACE_EMBEDDING_DIM", self.EMBEDDING_DIM
        )

        logger.info(
            f"Face embedding service created "
            f"(embedding_dim: {self.embedding_dim})"
        )

    def _get_device(self) -> str:
        """Determine the best available compute device.

        Returns:
            Device string: "cuda", "mps", or "cpu"
        """
        import torch

        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"

    @property
    def detection_service(self) -> FaceDetectionService:
        """Get face detection service (lazy initialization).

        Returns:
            FaceDetectionService instance
        """
        if self._detection_service is None:
            self._detection_service = get_face_detection_service()
        return self._detection_service

    def _ensure_model_initialized(self) -> None:
        """Ensure InsightFace model is loaded.

        The detection service's model includes the recognition (embedding)
        component which is used for embedding extraction.
        """
        if not self._initialized:
            if self.device is None:
                self.device = self._get_device()
            # Force model initialization via detection service
            self.detection_service._ensure_initialized()
            self._initialized = True
            logger.debug("Face embedding model initialized via detection service")

    def extract_embeddings(
        self,
        image_source: Union[str, Path, np.ndarray, Image.Image],
        detected_faces: Optional[List[DetectedFace]] = None,
        min_confidence: Optional[float] = None,
        return_aligned_faces: bool = False,
    ) -> List[FaceEmbeddingResult]:
        """Extract embeddings for all faces in an image.

        If detected_faces is not provided, face detection will be performed first.

        Args:
            image_source: Path to image file, numpy array, or PIL Image
            detected_faces: Pre-detected faces (optional, will detect if None)
            min_confidence: Minimum detection confidence (default from config)
            return_aligned_faces: Whether to include aligned face crops in results

        Returns:
            List of FaceEmbeddingResult objects for each detected face

        Raises:
            FileNotFoundError: If image file doesn't exist
            ValueError: If image cannot be loaded
            RuntimeError: If embedding extraction fails
        """
        self._ensure_model_initialized()

        start_time = time.time()

        # Load image
        image, img_width, img_height = self._load_image(image_source)

        # Detect faces if not provided
        if detected_faces is None:
            detected_faces = self.detection_service.detect_faces(
                image,
                min_confidence=min_confidence,
            )

        if not detected_faces:
            logger.debug("No faces found in image")
            return []

        # Extract embeddings for each face
        results = []
        for face in detected_faces:
            try:
                result = self._extract_single_embedding(
                    image, face, img_width, img_height, return_aligned_faces
                )
                if result is not None:
                    results.append(result)
            except Exception as e:
                logger.warning(
                    f"Failed to extract embedding for face at "
                    f"({face.bounding_box.x}, {face.bounding_box.y}): {e}"
                )
                continue

        extraction_time = (time.time() - start_time) * 1000
        logger.info(
            f"Extracted {len(results)} embeddings from {len(detected_faces)} faces "
            f"in {extraction_time:.2f}ms"
        )

        return results

    def _extract_single_embedding(
        self,
        image: np.ndarray,
        face: DetectedFace,
        image_width: int,
        image_height: int,
        return_aligned_face: bool = False,
    ) -> Optional[FaceEmbeddingResult]:
        """Extract embedding for a single detected face.

        Args:
            image: BGR image array
            face: Detected face with bounding box and landmarks
            image_width: Original image width
            image_height: Original image height
            return_aligned_face: Whether to include aligned face in result

        Returns:
            FaceEmbeddingResult or None if extraction fails
        """
        # Check minimum face size
        if (
            face.bounding_box.width < self.MIN_FACE_SIZE
            or face.bounding_box.height < self.MIN_FACE_SIZE
        ):
            logger.debug(
                f"Face too small for embedding: "
                f"{face.bounding_box.width}x{face.bounding_box.height}"
            )
            return None

        # Get face embedding from InsightFace model
        # The model uses landmarks for face alignment before embedding
        embedding, aligned_face = self._get_insightface_embedding(image, face)

        if embedding is None:
            return None

        # L2 normalize embedding
        embedding = self._normalize_embedding(embedding)

        # Estimate embedding quality
        quality_score = self._estimate_quality(face, embedding)

        return FaceEmbeddingResult(
            embedding=embedding,
            face=face,
            quality_score=quality_score,
            aligned_face=aligned_face if return_aligned_face else None,
        )

    def _get_insightface_embedding(
        self, image, face: DetectedFace
    ) -> Tuple[Optional["np.ndarray"], Optional["np.ndarray"]]:
        """Get embedding using InsightFace's recognition model.

        InsightFace uses ArcFace for face recognition which produces
        512-dimensional embeddings.

        Args:
            image: BGR image array
            face: Detected face with landmarks

        Returns:
            Tuple of (embedding array, aligned face array) or (None, None)
        """
        try:
            import numpy as np

            # Re-run InsightFace detection to get embedding
            # The InsightFace model populates the 'embedding' attribute
            model = self.detection_service.model

            # Get faces with embeddings
            faces = model.get(image, max_num=100)

            # Find matching face by bounding box overlap
            best_match = None
            best_iou = 0.0

            for detected in faces:
                iou = self._calculate_iou(
                    face.bounding_box, detected.bbox, image.shape[1], image.shape[0]
                )
                if iou > best_iou:
                    best_iou = iou
                    best_match = detected

            if best_match is None or best_iou < 0.5:
                logger.debug(f"No matching face found (best IoU: {best_iou:.3f})")
                return None, None

            # Check if embedding is available
            if not hasattr(best_match, "embedding") or best_match.embedding is None:
                logger.debug("Face detected but embedding not available")
                return None, None

            embedding = best_match.embedding.astype(np.float32)

            # Get aligned face if available (normed_embedding is from aligned face)
            aligned_face = None
            if hasattr(best_match, "normed_embedding"):
                # InsightFace stores the aligned face internally
                # We can crop it from the original for thumbnail generation
                bbox = best_match.bbox.astype(int)
                x1, y1, x2, y2 = bbox
                x1 = max(0, x1)
                y1 = max(0, y1)
                x2 = min(image.shape[1], x2)
                y2 = min(image.shape[0], y2)
                aligned_face = image[y1:y2, x1:x2].copy()

            return embedding, aligned_face

        except Exception as e:
            logger.error(f"InsightFace embedding extraction failed: {e}")
            return None, None

    def _calculate_iou(
        self,
        face_bbox: Any,
        detected_bbox: np.ndarray,
        image_width: int,
        image_height: int,
    ) -> float:
        """Calculate Intersection over Union between two bounding boxes.

        Args:
            face_bbox: BoundingBoxResult from DetectedFace (pixel coordinates)
            detected_bbox: InsightFace bbox array [x1, y1, x2, y2]
            image_width: Image width
            image_height: Image height

        Returns:
            IoU score (0.0-1.0)
        """
        # Convert face_bbox to [x1, y1, x2, y2] format
        x1_a = face_bbox.x
        y1_a = face_bbox.y
        x2_a = face_bbox.x + face_bbox.width
        y2_a = face_bbox.y + face_bbox.height

        # Get detected bbox
        x1_b, y1_b, x2_b, y2_b = detected_bbox[:4]

        # Calculate intersection
        x1_i = max(x1_a, x1_b)
        y1_i = max(y1_a, y1_b)
        x2_i = min(x2_a, x2_b)
        y2_i = min(y2_a, y2_b)

        if x2_i <= x1_i or y2_i <= y1_i:
            return 0.0

        intersection = (x2_i - x1_i) * (y2_i - y1_i)

        # Calculate union
        area_a = (x2_a - x1_a) * (y2_a - y1_a)
        area_b = (x2_b - x1_b) * (y2_b - y1_b)
        union = area_a + area_b - intersection

        if union <= 0:
            return 0.0

        return intersection / union

    def _normalize_embedding(self, embedding):
        """L2 normalize embedding to unit length.

        Args:
            embedding: Raw embedding vector

        Returns:
            L2-normalized embedding vector
        """
        import numpy as np

        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        return embedding.astype(np.float32)

    def _estimate_quality(
        self, face: DetectedFace, embedding
    ) -> float:
        """Estimate quality score for the embedding.

        Quality is estimated based on:
        - Detection confidence
        - Face size (larger faces generally produce better embeddings)
        - Head pose (frontal faces are better than profile)
        - Embedding norm before normalization (higher norm often indicates clearer features)

        Args:
            face: Detected face with attributes
            embedding: Extracted embedding

        Returns:
            Quality score between 0.0 and 1.0
        """
        scores = []

        # Detection confidence contributes to quality
        scores.append(face.confidence)

        # Face size factor (normalize by typical face size)
        typical_face_size = 150  # pixels
        face_size = (face.bounding_box.width + face.bounding_box.height) / 2
        size_score = min(1.0, face_size / typical_face_size)
        scores.append(size_score)

        # Head pose factor (penalize extreme angles)
        if face.attributes and face.attributes.pose:
            pose = face.attributes.pose
            yaw = abs(pose.get("yaw", 0))
            pitch = abs(pose.get("pitch", 0))
            roll = abs(pose.get("roll", 0))

            # Penalize angles > 30 degrees
            max_good_angle = 30.0
            yaw_score = max(0, 1.0 - (yaw / 90.0))
            pitch_score = max(0, 1.0 - (pitch / 90.0))
            roll_score = max(0, 1.0 - (roll / 90.0))

            pose_score = (yaw_score + pitch_score + roll_score) / 3
            scores.append(pose_score)
        else:
            # Assume moderate quality if no pose info
            scores.append(0.7)

        import numpy as np

        # Calculate weighted average
        # Detection confidence is most important
        weights = [0.4, 0.3, 0.3]
        quality = sum(s * w for s, w in zip(scores, weights))

        return float(np.clip(quality, 0.0, 1.0))

    def _load_image(
        self, image_source
    ) -> Tuple["np.ndarray", int, int]:
        """Load image from various sources.

        Args:
            image_source: Image path, numpy array, or PIL Image

        Returns:
            Tuple of (BGR numpy array, width, height)

        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If image cannot be loaded
        """
        import cv2
        import numpy as np
        from PIL import Image

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
            raise ValueError(f"Unsupported image source type: {type(image_source)}")

        height, width = image.shape[:2]
        return image, width, height

    def extract_embeddings_batch(
        self,
        image_sources: List[Union[str, Path]],
        min_confidence: Optional[float] = None,
    ) -> List[BatchEmbeddingResult]:
        """Extract embeddings from multiple images.

        Processes images sequentially (GPU memory constraints) but provides
        batch-level progress tracking and error handling.

        Args:
            image_sources: List of image paths
            min_confidence: Minimum detection confidence

        Returns:
            List of BatchEmbeddingResult objects (one per image)
        """
        results = []
        total_faces = 0

        start_time = time.time()

        for i, source in enumerate(image_sources):
            source_path = str(source)
            img_start = time.time()

            try:
                embeddings = self.extract_embeddings(
                    source,
                    min_confidence=min_confidence,
                )
                processing_time = (time.time() - img_start) * 1000

                result = BatchEmbeddingResult(
                    image_path=source_path,
                    embeddings=embeddings,
                    processing_time_ms=processing_time,
                )
                total_faces += len(embeddings)

            except Exception as e:
                logger.error(f"Failed to process {source_path}: {e}")
                result = BatchEmbeddingResult(
                    image_path=source_path,
                    embeddings=[],
                    processing_time_ms=(time.time() - img_start) * 1000,
                    error=str(e),
                )

            results.append(result)

            # Log progress for large batches
            if (i + 1) % 10 == 0:
                logger.info(
                    f"Batch progress: {i + 1}/{len(image_sources)} images, "
                    f"{total_faces} faces extracted"
                )

        total_time = (time.time() - start_time) * 1000
        logger.info(
            f"Batch extraction complete: {len(image_sources)} images, "
            f"{total_faces} faces, {total_time:.2f}ms total"
        )

        return results

    def compute_similarity(
        self, embedding1, embedding2
    ) -> float:
        """Compute cosine similarity between two embeddings.

        Args:
            embedding1: First embedding (512-dim)
            embedding2: Second embedding (512-dim)

        Returns:
            Cosine similarity score (0.0-1.0, higher = more similar)
        """
        # Ensure normalized
        emb1 = self._normalize_embedding(embedding1)
        emb2 = self._normalize_embedding(embedding2)

        import numpy as np

        # Cosine similarity (dot product of normalized vectors)
        similarity = float(np.dot(emb1, emb2))

        # Clamp to [0, 1] range (should already be in range for L2-normalized vectors)
        return float(np.clip(similarity, 0.0, 1.0))

    def compute_distance(
        self, embedding1, embedding2
    ) -> float:
        """Compute cosine distance between two embeddings.

        Args:
            embedding1: First embedding (512-dim)
            embedding2: Second embedding (512-dim)

        Returns:
            Cosine distance (0.0 = identical, 2.0 = opposite)
        """
        similarity = self.compute_similarity(embedding1, embedding2)
        return 1.0 - similarity

    def are_same_person(
        self,
        embedding1,
        embedding2,
        threshold: float = 0.6,
    ) -> Tuple[bool, float]:
        """Determine if two face embeddings belong to the same person.

        Args:
            embedding1: First face embedding
            embedding2: Second face embedding
            threshold: Similarity threshold (default 0.6)

        Returns:
            Tuple of (is_same_person, similarity_score)
        """
        similarity = self.compute_similarity(embedding1, embedding2)
        return similarity >= threshold, similarity

    @staticmethod
    def embedding_to_list(embedding) -> List[float]:
        """Convert numpy embedding to Python list for database storage.

        Args:
            embedding: numpy array embedding

        Returns:
            Python list of floats
        """
        return embedding.tolist()

    @staticmethod
    def list_to_embedding(embedding_list: List[float]):
        """Convert Python list back to numpy embedding.

        Args:
            embedding_list: Python list of floats

        Returns:
            numpy array embedding
        """
        import numpy as np

        return np.array(embedding_list, dtype=np.float32)

    def get_embedding_dim(self) -> int:
        """Get the embedding vector dimension.

        Returns:
            Embedding dimension (512 for InsightFace/ArcFace)
        """
        return self.embedding_dim

    def get_service_info(self) -> Dict[str, Any]:
        """Get information about the embedding service.

        Returns:
            Dictionary with service configuration
        """
        return {
            "device": self.device,
            "embedding_dim": self.embedding_dim,
            "min_face_size": self.MIN_FACE_SIZE,
            "initialized": self._initialized,
            "detection_service": self.detection_service.get_model_info()
            if self._detection_service
            else None,
        }

    def clear_cache(self) -> None:
        """Clear GPU memory cache."""
        if self.device == "cuda":
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.debug("GPU cache cleared")

    def unload_model(self) -> None:
        """Unload models from memory.

        Also unloads the detection service model.
        """
        if self._initialized:
            self._initialized = False

            if self._detection_service is not None:
                self._detection_service.unload_model()

            if self.device == "cuda":
                import torch
                torch.cuda.empty_cache()

            logger.info("Face embedding service models unloaded")


# =============================================================================
# SINGLETON ACCESSOR
# =============================================================================

_face_embedding_service: Optional[FaceEmbeddingService] = None


def get_face_embedding_service() -> FaceEmbeddingService:
    """Get singleton face embedding service instance.

    The model is lazily loaded on first embedding extraction call.

    Returns:
        FaceEmbeddingService instance

    Example:
        service = get_face_embedding_service()
        results = service.extract_embeddings("photo.jpg")
        for result in results:
            print(f"Embedding shape: {result.embedding.shape}")
    """
    global _face_embedding_service
    if _face_embedding_service is None:
        _face_embedding_service = FaceEmbeddingService()
    return _face_embedding_service


def reset_face_embedding_service() -> None:
    """Reset the singleton instance.

    Useful for testing or when configuration changes.
    """
    global _face_embedding_service
    if _face_embedding_service is not None:
        _face_embedding_service.unload_model()
    _face_embedding_service = None


# =============================================================================
# MODULE EXPORTS
# =============================================================================

__all__ = [
    "FaceEmbeddingService",
    "FaceEmbeddingResult",
    "BatchEmbeddingResult",
    "get_face_embedding_service",
    "reset_face_embedding_service",
]
