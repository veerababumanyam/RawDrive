"""Face Detection Celery Worker.

Background worker tasks for face detection and embedding extraction.
Processes images asynchronously and stores results for downstream services.

Features:
- Single image face detection with embedding extraction
- Batch processing for multiple images
- Gallery-wide face scanning with progress tracking
- Retry logic with exponential backoff
- GPU memory management between tasks

Feature: Face Detection and Identification
Task: T010 - Add face detection Celery worker task
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from celery import shared_task

from workers.celery_app import celery_app
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# =============================================================================
# Constants
# =============================================================================

# Retry configuration
MAX_RETRIES = 3
BASE_RETRY_DELAY = 60  # seconds

# Batch processing
DEFAULT_BATCH_SIZE = 10
MAX_BATCH_SIZE = 100

# Face detection defaults (can be overridden per-task)
DEFAULT_MIN_CONFIDENCE = 0.5
DEFAULT_MAX_FACES = 100


# =============================================================================
# Enums and Data Classes
# =============================================================================


class FaceScanStatus(str, Enum):
    """Status of face scanning operation."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"  # Some images failed but others succeeded


@dataclass
class FaceDetectionResult:
    """Result of face detection for a single face."""

    face_index: int
    bounding_box: Dict[str, int]  # {x, y, width, height} in pixels
    bounding_box_percent: Dict[str, float]  # {x, y, width, height} as percentages
    confidence: float
    landmarks: Optional[Dict[str, List[float]]] = None
    attributes: Optional[Dict[str, Any]] = None
    embedding: Optional[List[float]] = None
    quality_score: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        result = {
            "face_index": self.face_index,
            "bounding_box": self.bounding_box,
            "bounding_box_percent": self.bounding_box_percent,
            "confidence": self.confidence,
        }
        if self.landmarks:
            result["landmarks"] = self.landmarks
        if self.attributes:
            result["attributes"] = self.attributes
        if self.embedding:
            result["embedding"] = self.embedding
        if self.quality_score is not None:
            result["quality_score"] = self.quality_score
        return result


@dataclass
class ImageProcessingResult:
    """Result of processing a single image."""

    asset_id: str
    status: str
    face_count: int
    faces: List[Dict[str, Any]]
    image_width: int
    image_height: int
    processing_time_ms: float
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "asset_id": self.asset_id,
            "status": self.status,
            "face_count": self.face_count,
            "faces": self.faces,
            "image_width": self.image_width,
            "image_height": self.image_height,
            "processing_time_ms": self.processing_time_ms,
            "error": self.error,
        }


# =============================================================================
# Helper Functions
# =============================================================================


def _get_face_detection_service():
    """Lazy import face detection service to avoid loading models at import time."""
    from services.face_detection_service import get_face_detection_service
    return get_face_detection_service()


def _get_face_embedding_service():
    """Lazy import face embedding service to avoid loading models at import time."""
    from services.face_embedding_service import get_face_embedding_service
    return get_face_embedding_service()


def _clear_gpu_cache():
    """Clear GPU memory cache after processing."""
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.debug("GPU cache cleared")
    except ImportError:
        pass  # torch not available


def _load_image_from_path(image_path: str) -> tuple:
    """Load image from file path.

    Args:
        image_path: Path to image file

    Returns:
        Tuple of (image array, width, height)

    Raises:
        FileNotFoundError: If image file doesn't exist
        ValueError: If image cannot be loaded
    """
    import cv2

    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")

    image = cv2.imread(str(path))
    if image is None:
        raise ValueError(f"Failed to load image: {image_path}")

    height, width = image.shape[:2]
    return image, width, height


def _load_image_from_url(image_url: str) -> tuple:
    """Load image from URL.

    Args:
        image_url: URL to fetch image from

    Returns:
        Tuple of (image array, width, height)

    Raises:
        ValueError: If image cannot be loaded from URL
    """
    import urllib.request
    from io import BytesIO

    import cv2
    import numpy as np
    from PIL import Image

    try:
        headers = {"User-Agent": "RawDrive-AI-Processing/1.0"}
        request = urllib.request.Request(image_url, headers=headers)

        with urllib.request.urlopen(request, timeout=30) as response:
            image_bytes = response.read()

        pil_image = Image.open(BytesIO(image_bytes))

        if pil_image.mode == "RGBA":
            pil_image = pil_image.convert("RGB")

        image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        height, width = image.shape[:2]

        return image, width, height

    except Exception as e:
        raise ValueError(f"Failed to load image from URL: {e}")


def _process_single_image(
    image_source: Union[str, Any],
    asset_id: str,
    extract_embeddings: bool = True,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    max_faces: int = DEFAULT_MAX_FACES,
) -> ImageProcessingResult:
    """Process a single image for face detection and optional embedding extraction.

    Args:
        image_source: Image path, URL, or numpy array
        asset_id: Unique identifier for the asset
        extract_embeddings: Whether to extract embeddings for each face
        min_confidence: Minimum confidence threshold
        max_faces: Maximum number of faces to detect

    Returns:
        ImageProcessingResult with detection results
    """
    start_time = time.time()

    try:
        # Load image
        if isinstance(image_source, str):
            if image_source.startswith(("http://", "https://")):
                image, width, height = _load_image_from_url(image_source)
            else:
                image, width, height = _load_image_from_path(image_source)
        else:
            # Assume numpy array
            import numpy as np
            if isinstance(image_source, np.ndarray):
                image = image_source
                height, width = image.shape[:2]
            else:
                raise ValueError(f"Unsupported image source type: {type(image_source)}")

        # Get services
        detection_service = _get_face_detection_service()

        # Detect faces
        detected_faces = detection_service.detect_faces(
            image,
            min_confidence=min_confidence,
            max_faces=max_faces,
            extract_attributes=True,
        )

        # Process results
        faces = []

        if extract_embeddings and detected_faces:
            # Use embedding service for full results
            embedding_service = _get_face_embedding_service()
            embedding_results = embedding_service.extract_embeddings(
                image,
                detected_faces=detected_faces,
                min_confidence=min_confidence,
            )

            for idx, result in enumerate(embedding_results):
                face = result.face
                bbox = face.bounding_box

                face_result = FaceDetectionResult(
                    face_index=idx,
                    bounding_box={
                        "x": bbox.x,
                        "y": bbox.y,
                        "width": bbox.width,
                        "height": bbox.height,
                    },
                    bounding_box_percent=bbox.to_percentage(width, height),
                    confidence=face.confidence,
                    landmarks=face.landmarks.to_dict() if face.landmarks else None,
                    attributes=face.attributes.to_dict() if face.attributes else None,
                    embedding=result.embedding.tolist(),
                    quality_score=result.quality_score,
                )
                faces.append(face_result.to_dict())
        else:
            # Detection only (no embeddings)
            for idx, face in enumerate(detected_faces):
                bbox = face.bounding_box

                face_result = FaceDetectionResult(
                    face_index=idx,
                    bounding_box={
                        "x": bbox.x,
                        "y": bbox.y,
                        "width": bbox.width,
                        "height": bbox.height,
                    },
                    bounding_box_percent=bbox.to_percentage(width, height),
                    confidence=face.confidence,
                    landmarks=face.landmarks.to_dict() if face.landmarks else None,
                    attributes=face.attributes.to_dict() if face.attributes else None,
                )
                faces.append(face_result.to_dict())

        processing_time = (time.time() - start_time) * 1000

        return ImageProcessingResult(
            asset_id=asset_id,
            status="success",
            face_count=len(faces),
            faces=faces,
            image_width=width,
            image_height=height,
            processing_time_ms=processing_time,
        )

    except Exception as e:
        processing_time = (time.time() - start_time) * 1000
        logger.error(f"Face detection failed for asset {asset_id}: {e}")

        return ImageProcessingResult(
            asset_id=asset_id,
            status="failed",
            face_count=0,
            faces=[],
            image_width=0,
            image_height=0,
            processing_time_ms=processing_time,
            error=str(e),
        )


# =============================================================================
# Celery Tasks
# =============================================================================


@celery_app.task(
    bind=True,
    name="workers.face_detection_worker.process_face_detection",
    max_retries=MAX_RETRIES,
    default_retry_delay=BASE_RETRY_DELAY,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def process_face_detection(
    self,
    asset_id: str,
    workspace_id: str,
    image_source: str,
    extract_embeddings: bool = True,
    min_confidence: Optional[float] = None,
    max_faces: Optional[int] = None,
    callback_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Process face detection for a single image.

    Detects faces in the provided image and optionally extracts 512-dimensional
    embeddings for each face. Results are returned directly and can optionally
    be sent to a callback URL.

    Args:
        asset_id: Unique identifier for the asset being processed
        workspace_id: Workspace ID for isolation
        image_source: Path to image file or URL
        extract_embeddings: Whether to extract face embeddings (default: True)
        min_confidence: Minimum detection confidence (default: 0.5)
        max_faces: Maximum faces to detect (default: 100)
        callback_url: Optional URL to POST results to

    Returns:
        Dict containing:
            - status: "success", "failed", or "partial"
            - asset_id: The processed asset ID
            - workspace_id: The workspace ID
            - face_count: Number of faces detected
            - faces: List of face detection results
            - image_dimensions: {width, height}
            - processing_time_ms: Total processing time
            - error: Error message if failed

    Raises:
        Retries on transient failures with exponential backoff.
    """
    task_start = time.time()

    logger.info(
        "Starting face detection",
        extra={
            "asset_id": asset_id,
            "workspace_id": workspace_id,
            "extract_embeddings": extract_embeddings,
            "retry_count": self.request.retries,
        },
    )

    try:
        # Update task state to PROGRESS
        self.update_state(
            state="PROGRESS",
            meta={
                "asset_id": asset_id,
                "workspace_id": workspace_id,
                "stage": "processing",
            },
        )

        # Process the image
        result = _process_single_image(
            image_source=image_source,
            asset_id=asset_id,
            extract_embeddings=extract_embeddings,
            min_confidence=min_confidence or DEFAULT_MIN_CONFIDENCE,
            max_faces=max_faces or DEFAULT_MAX_FACES,
        )

        # Build response
        response = {
            "status": result.status,
            "asset_id": asset_id,
            "workspace_id": workspace_id,
            "face_count": result.face_count,
            "faces": result.faces,
            "image_dimensions": {
                "width": result.image_width,
                "height": result.image_height,
            },
            "processing_time_ms": result.processing_time_ms,
        }

        if result.error:
            response["error"] = result.error

        # Clear GPU cache after processing
        _clear_gpu_cache()

        # Send callback if configured
        if callback_url and result.status == "success":
            _send_callback(callback_url, response)

        task_time = (time.time() - task_start) * 1000

        logger.info(
            "Face detection completed",
            extra={
                "asset_id": asset_id,
                "workspace_id": workspace_id,
                "face_count": result.face_count,
                "processing_time_ms": task_time,
                "status": result.status,
            },
        )

        return response

    except Exception as e:
        logger.error(
            "Face detection task failed",
            extra={
                "asset_id": asset_id,
                "workspace_id": workspace_id,
                "error": str(e),
                "retry_count": self.request.retries,
            },
        )

        # Clear GPU cache even on failure
        _clear_gpu_cache()

        # Check if we've exhausted retries
        if self.request.retries >= MAX_RETRIES:
            return {
                "status": "failed",
                "asset_id": asset_id,
                "workspace_id": workspace_id,
                "face_count": 0,
                "faces": [],
                "error": f"Max retries exceeded: {str(e)}",
                "processing_time_ms": (time.time() - task_start) * 1000,
            }

        # Retry with exponential backoff
        raise


@celery_app.task(
    bind=True,
    name="workers.face_detection_worker.process_batch_face_detection",
    max_retries=MAX_RETRIES,
    time_limit=3600,  # 1 hour max for batch operations
    soft_time_limit=3300,  # Soft limit at 55 minutes
)
def process_batch_face_detection(
    self,
    batch_items: List[Dict[str, str]],
    workspace_id: str,
    extract_embeddings: bool = True,
    min_confidence: Optional[float] = None,
    max_faces: Optional[int] = None,
) -> Dict[str, Any]:
    """Process face detection for a batch of images.

    Processes multiple images sequentially, reporting progress and handling
    individual failures gracefully.

    Args:
        batch_items: List of dicts with {asset_id, image_source}
        workspace_id: Workspace ID for isolation
        extract_embeddings: Whether to extract face embeddings
        min_confidence: Minimum detection confidence
        max_faces: Maximum faces per image

    Returns:
        Dict containing:
            - status: "success", "failed", or "partial"
            - workspace_id: The workspace ID
            - total: Total items in batch
            - successful: Number of successfully processed items
            - failed: Number of failed items
            - results: List of individual results
            - total_faces: Total faces detected across all images
            - processing_time_ms: Total processing time
    """
    task_start = time.time()
    total_items = len(batch_items)

    logger.info(
        "Starting batch face detection",
        extra={
            "workspace_id": workspace_id,
            "batch_size": total_items,
            "extract_embeddings": extract_embeddings,
        },
    )

    results = []
    successful = 0
    failed = 0
    total_faces = 0

    for idx, item in enumerate(batch_items):
        asset_id = item.get("asset_id", f"unknown_{idx}")
        image_source = item.get("image_source")

        if not image_source:
            results.append({
                "asset_id": asset_id,
                "status": "failed",
                "error": "Missing image_source",
            })
            failed += 1
            continue

        try:
            # Update progress
            self.update_state(
                state="PROGRESS",
                meta={
                    "workspace_id": workspace_id,
                    "current": idx + 1,
                    "total": total_items,
                    "processed": successful + failed,
                    "successful": successful,
                    "failed": failed,
                },
            )

            # Process single image
            result = _process_single_image(
                image_source=image_source,
                asset_id=asset_id,
                extract_embeddings=extract_embeddings,
                min_confidence=min_confidence or DEFAULT_MIN_CONFIDENCE,
                max_faces=max_faces or DEFAULT_MAX_FACES,
            )

            results.append(result.to_dict())

            if result.status == "success":
                successful += 1
                total_faces += result.face_count
            else:
                failed += 1

            # Log progress every 10 items
            if (idx + 1) % 10 == 0:
                logger.info(
                    f"Batch progress: {idx + 1}/{total_items}",
                    extra={
                        "workspace_id": workspace_id,
                        "successful": successful,
                        "failed": failed,
                        "total_faces": total_faces,
                    },
                )

        except Exception as e:
            logger.error(
                f"Failed to process batch item {asset_id}: {e}",
                extra={"workspace_id": workspace_id, "asset_id": asset_id},
            )
            results.append({
                "asset_id": asset_id,
                "status": "failed",
                "error": str(e),
            })
            failed += 1

    # Clear GPU cache after batch
    _clear_gpu_cache()

    # Determine overall status
    if failed == 0:
        status = "success"
    elif successful == 0:
        status = "failed"
    else:
        status = "partial"

    processing_time = (time.time() - task_start) * 1000

    logger.info(
        "Batch face detection completed",
        extra={
            "workspace_id": workspace_id,
            "status": status,
            "total": total_items,
            "successful": successful,
            "failed": failed,
            "total_faces": total_faces,
            "processing_time_ms": processing_time,
        },
    )

    return {
        "status": status,
        "workspace_id": workspace_id,
        "total": total_items,
        "successful": successful,
        "failed": failed,
        "results": results,
        "total_faces": total_faces,
        "processing_time_ms": processing_time,
    }


@celery_app.task(
    bind=True,
    name="workers.face_detection_worker.process_gallery_face_scan",
    max_retries=2,
    time_limit=7200,  # 2 hours max for gallery scan
    soft_time_limit=7000,
)
def process_gallery_face_scan(
    self,
    gallery_id: str,
    workspace_id: str,
    asset_ids: List[str],
    asset_sources: Dict[str, str],
    extract_embeddings: bool = True,
    min_confidence: Optional[float] = None,
    max_faces: Optional[int] = None,
    progress_callback_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Scan an entire gallery for faces.

    Processes all assets in a gallery, tracking progress and supporting
    progress callbacks for UI updates.

    Args:
        gallery_id: Gallery identifier
        workspace_id: Workspace ID for isolation
        asset_ids: List of asset IDs to process
        asset_sources: Dict mapping asset_id to image source (path/URL)
        extract_embeddings: Whether to extract face embeddings
        min_confidence: Minimum detection confidence
        max_faces: Maximum faces per image
        progress_callback_url: URL to POST progress updates to

    Returns:
        Dict containing:
            - status: Overall scan status
            - gallery_id: The gallery ID
            - workspace_id: The workspace ID
            - total_assets: Total assets scanned
            - assets_with_faces: Assets that had faces detected
            - total_faces: Total faces detected
            - results: Individual asset results
            - processing_time_ms: Total processing time
    """
    task_start = time.time()
    total_assets = len(asset_ids)

    logger.info(
        "Starting gallery face scan",
        extra={
            "gallery_id": gallery_id,
            "workspace_id": workspace_id,
            "total_assets": total_assets,
        },
    )

    results = []
    successful = 0
    failed = 0
    assets_with_faces = 0
    total_faces = 0

    for idx, asset_id in enumerate(asset_ids):
        image_source = asset_sources.get(asset_id)

        if not image_source:
            logger.warning(f"No image source for asset {asset_id}, skipping")
            results.append({
                "asset_id": asset_id,
                "status": "skipped",
                "error": "No image source provided",
            })
            failed += 1
            continue

        try:
            # Update progress state
            progress = {
                "gallery_id": gallery_id,
                "workspace_id": workspace_id,
                "current_asset": idx + 1,
                "total_assets": total_assets,
                "successful": successful,
                "failed": failed,
                "total_faces": total_faces,
                "percent_complete": round((idx / total_assets) * 100, 1),
            }

            self.update_state(state="PROGRESS", meta=progress)

            # Send progress callback
            if progress_callback_url and (idx % 5 == 0 or idx == total_assets - 1):
                _send_progress_callback(progress_callback_url, progress)

            # Process image
            result = _process_single_image(
                image_source=image_source,
                asset_id=asset_id,
                extract_embeddings=extract_embeddings,
                min_confidence=min_confidence or DEFAULT_MIN_CONFIDENCE,
                max_faces=max_faces or DEFAULT_MAX_FACES,
            )

            results.append(result.to_dict())

            if result.status == "success":
                successful += 1
                if result.face_count > 0:
                    assets_with_faces += 1
                    total_faces += result.face_count
            else:
                failed += 1

            # Log progress every 20 items
            if (idx + 1) % 20 == 0:
                logger.info(
                    f"Gallery scan progress: {idx + 1}/{total_assets}",
                    extra={
                        "gallery_id": gallery_id,
                        "successful": successful,
                        "failed": failed,
                        "assets_with_faces": assets_with_faces,
                        "total_faces": total_faces,
                    },
                )

        except Exception as e:
            logger.error(
                f"Failed to process asset {asset_id}: {e}",
                extra={"gallery_id": gallery_id, "asset_id": asset_id},
            )
            results.append({
                "asset_id": asset_id,
                "status": "failed",
                "error": str(e),
            })
            failed += 1

    # Clear GPU cache
    _clear_gpu_cache()

    # Determine overall status
    if failed == 0:
        status = FaceScanStatus.COMPLETED.value
    elif successful == 0:
        status = FaceScanStatus.FAILED.value
    else:
        status = FaceScanStatus.PARTIAL.value

    processing_time = (time.time() - task_start) * 1000

    response = {
        "status": status,
        "gallery_id": gallery_id,
        "workspace_id": workspace_id,
        "total_assets": total_assets,
        "successful": successful,
        "failed": failed,
        "assets_with_faces": assets_with_faces,
        "total_faces": total_faces,
        "results": results,
        "processing_time_ms": processing_time,
    }

    # Send final progress callback
    if progress_callback_url:
        _send_progress_callback(
            progress_callback_url,
            {**response, "percent_complete": 100.0},
        )

    logger.info(
        "Gallery face scan completed",
        extra={
            "gallery_id": gallery_id,
            "workspace_id": workspace_id,
            "status": status,
            "total_assets": total_assets,
            "successful": successful,
            "failed": failed,
            "assets_with_faces": assets_with_faces,
            "total_faces": total_faces,
            "processing_time_ms": processing_time,
        },
    )

    return response


# =============================================================================
# Callback Functions
# =============================================================================


def _send_callback(callback_url: str, data: Dict[str, Any]) -> None:
    """Send results to a callback URL.

    Args:
        callback_url: URL to POST data to
        data: Data to send
    """
    try:
        import json
        import urllib.request

        payload = json.dumps(data).encode("utf-8")
        request = urllib.request.Request(
            callback_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status not in (200, 201, 202, 204):
                logger.warning(
                    f"Callback returned status {response.status}",
                    extra={"callback_url": callback_url},
                )

    except Exception as e:
        logger.warning(
            f"Failed to send callback: {e}",
            extra={"callback_url": callback_url},
        )


def _send_progress_callback(callback_url: str, progress: Dict[str, Any]) -> None:
    """Send progress update to callback URL.

    Args:
        callback_url: URL to POST progress to
        progress: Progress data to send
    """
    try:
        import json
        import urllib.request

        payload = json.dumps({"type": "progress", "data": progress}).encode("utf-8")
        request = urllib.request.Request(
            callback_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=5) as response:
            pass  # Just send, don't wait for response processing

    except Exception as e:
        # Don't fail the task for progress callback failures
        logger.debug(f"Progress callback failed: {e}")


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "process_face_detection",
    "process_batch_face_detection",
    "process_gallery_face_scan",
    "FaceScanStatus",
    "FaceDetectionResult",
    "ImageProcessingResult",
]
