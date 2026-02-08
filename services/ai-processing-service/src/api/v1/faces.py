"""Face Detection API Endpoints.

Provides REST API endpoints for face detection and embedding extraction:
- POST /detect - Detect faces in an image
- POST /detect-with-embeddings - Detect faces and extract embeddings
- POST /compare - Compare two face embeddings
- GET /info - Get face service information

Feature: Face Detection and Identification
Task: T009 - Create face detection API endpoint
"""

import base64
import logging
import time
from io import BytesIO
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, status
from PIL import Image

from config import get_settings
from schemas.face_detection import (
    BoundingBoxPercentage,
    BoundingBoxPixels,
    CompareFacesRequest,
    CompareFacesResponse,
    DetectedFaceResponse,
    DetectFacesRequest,
    DetectFacesResponse,
    DetectFacesWithEmbeddingsRequest,
    DetectFacesWithEmbeddingsResponse,
    DetectionMetadataResponse,
    ErrorResponse,
    FaceAttributesResponse,
    FaceEmbeddingResponse,
    FaceLandmarksResponse,
    FacePoseResponse,
    FaceServiceInfoResponse,
    ImageDimensionsResponse,
)
from services.face_detection_service import (
    DetectedFace,
    get_face_detection_service,
)
from services.face_embedding_service import (
    FaceEmbeddingResult,
    get_face_embedding_service,
)

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()


# =============================================================================
# Helper Functions
# =============================================================================


def _decode_base64_image(base64_data: str) -> np.ndarray:
    """Decode base64 image data to numpy array.

    Args:
        base64_data: Base64-encoded image string

    Returns:
        BGR numpy array

    Raises:
        ValueError: If image cannot be decoded
    """
    try:
        # Remove data URL prefix if present
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]

        image_bytes = base64.b64decode(base64_data)
        image = Image.open(BytesIO(image_bytes))

        # Convert to BGR for OpenCV
        if image.mode == "RGBA":
            image = image.convert("RGB")

        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

    except Exception as e:
        raise ValueError(f"Failed to decode base64 image: {e}")


def _load_image_from_url(url: str) -> np.ndarray:
    """Load image from URL.

    Args:
        url: Image URL

    Returns:
        BGR numpy array

    Raises:
        ValueError: If image cannot be loaded from URL
    """
    try:
        import urllib.request

        # Add timeout and user agent
        headers = {"User-Agent": "RawDrive-AI-Processing/1.0"}
        request = urllib.request.Request(url, headers=headers)

        with urllib.request.urlopen(request, timeout=30) as response:
            image_bytes = response.read()

        image = Image.open(BytesIO(image_bytes))

        # Convert to BGR for OpenCV
        if image.mode == "RGBA":
            image = image.convert("RGB")

        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

    except Exception as e:
        raise ValueError(f"Failed to load image from URL: {e}")


def _get_image_source(
    image_path: Optional[str],
    image_base64: Optional[str],
    image_url: Optional[str],
) -> tuple[np.ndarray, int, int]:
    """Get image from one of the input sources.

    Args:
        image_path: Path to image file
        image_base64: Base64-encoded image
        image_url: Image URL

    Returns:
        Tuple of (BGR image array, width, height)

    Raises:
        HTTPException: If no valid source provided or image cannot be loaded
    """
    if not any([image_path, image_base64, image_url]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "MISSING_IMAGE",
                "message": "Provide image_path, image_base64, or image_url",
            },
        )

    try:
        if image_path:
            path = Path(image_path)
            if not path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={
                        "error": "IMAGE_NOT_FOUND",
                        "message": f"Image file not found: {image_path}",
                    },
                )
            image = cv2.imread(str(path))
            if image is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "error": "INVALID_IMAGE",
                        "message": f"Failed to load image: {image_path}",
                    },
                )

        elif image_base64:
            image = _decode_base64_image(image_base64)

        else:  # image_url
            image = _load_image_from_url(image_url)

        height, width = image.shape[:2]
        return image, width, height

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "INVALID_IMAGE", "message": str(e)},
        )
    except Exception as e:
        logger.error(f"Failed to load image: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "IMAGE_LOAD_ERROR", "message": str(e)},
        )


def _convert_detected_face_to_response(
    face: DetectedFace,
    image_width: int,
    image_height: int,
) -> DetectedFaceResponse:
    """Convert DetectedFace to API response format.

    Args:
        face: DetectedFace object from service
        image_width: Original image width
        image_height: Original image height

    Returns:
        DetectedFaceResponse object
    """
    # Bounding box as percentages
    bbox_pct = face.bounding_box.to_percentage(image_width, image_height)
    bounding_box = BoundingBoxPercentage(
        x=bbox_pct["x"],
        y=bbox_pct["y"],
        width=bbox_pct["width"],
        height=bbox_pct["height"],
    )

    # Bounding box in pixels
    bounding_box_pixels = BoundingBoxPixels(
        x=face.bounding_box.x,
        y=face.bounding_box.y,
        width=face.bounding_box.width,
        height=face.bounding_box.height,
    )

    # Landmarks
    landmarks = None
    if face.landmarks:
        landmarks = FaceLandmarksResponse(
            left_eye=list(face.landmarks.left_eye),
            right_eye=list(face.landmarks.right_eye),
            nose=list(face.landmarks.nose),
            left_mouth=list(face.landmarks.left_mouth),
            right_mouth=list(face.landmarks.right_mouth),
        )

    # Attributes
    attributes = None
    if face.attributes:
        pose = None
        if face.attributes.pose:
            pose = FacePoseResponse(
                pitch=face.attributes.pose["pitch"],
                yaw=face.attributes.pose["yaw"],
                roll=face.attributes.pose["roll"],
            )

        attributes = FaceAttributesResponse(
            age=face.attributes.age,
            gender=face.attributes.gender,
            pose=pose,
        )

    # Metadata
    metadata = None
    if face.detection_metadata:
        metadata = DetectionMetadataResponse(
            model=face.detection_metadata.get("model", "unknown"),
            det_size=list(face.detection_metadata.get("det_size", [640, 640])),
        )

    return DetectedFaceResponse(
        bounding_box=bounding_box,
        bounding_box_pixels=bounding_box_pixels,
        confidence=round(face.confidence, 6),
        landmarks=landmarks,
        attributes=attributes,
        metadata=metadata,
    )


def _convert_embedding_result_to_response(
    result: FaceEmbeddingResult,
    image_width: int,
    image_height: int,
    include_aligned_face: bool = False,
) -> FaceEmbeddingResponse:
    """Convert FaceEmbeddingResult to API response format.

    Args:
        result: FaceEmbeddingResult from service
        image_width: Original image width
        image_height: Original image height
        include_aligned_face: Whether to include aligned face image

    Returns:
        FaceEmbeddingResponse object
    """
    face_response = _convert_detected_face_to_response(
        result.face, image_width, image_height
    )

    aligned_face_base64 = None
    if include_aligned_face and result.aligned_face is not None:
        _, buffer = cv2.imencode(".jpg", result.aligned_face)
        aligned_face_base64 = base64.b64encode(buffer).decode("utf-8")

    return FaceEmbeddingResponse(
        embedding=result.embedding.tolist(),
        embedding_dim=len(result.embedding),
        quality_score=round(result.quality_score, 4),
        face=face_response,
        aligned_face_base64=aligned_face_base64,
    )


# =============================================================================
# API Endpoints
# =============================================================================


@router.post(
    "/detect",
    response_model=DetectFacesResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect faces in an image",
    responses={
        400: {"model": ErrorResponse, "description": "Missing image source"},
        404: {"model": ErrorResponse, "description": "Image file not found"},
        422: {"model": ErrorResponse, "description": "Invalid image"},
        500: {"model": ErrorResponse, "description": "Processing error"},
    },
)
async def detect_faces(request: DetectFacesRequest) -> DetectFacesResponse:
    """Detect faces in an image.

    Analyzes an image and returns detected faces with bounding boxes,
    confidence scores, landmarks, and optional attributes (age, gender, pose).

    **Input Options** (provide one):
    - `image_path`: Path to image file on server
    - `image_base64`: Base64-encoded image data
    - `image_url`: URL to fetch image from

    **Returns**:
    - List of detected faces with coordinates and metadata
    - Processing time in milliseconds
    - Original image dimensions
    """
    start_time = time.time()

    # Load image
    image, width, height = _get_image_source(
        request.image_path,
        request.image_base64,
        request.image_url,
    )

    try:
        # Get face detection service
        service = get_face_detection_service()

        # Detect faces
        detected_faces = service.detect_faces(
            image,
            min_confidence=request.min_confidence,
            max_faces=request.max_faces,
            extract_attributes=request.extract_attributes,
        )

        # Convert to response format
        faces_response = [
            _convert_detected_face_to_response(face, width, height)
            for face in detected_faces
        ]

        processing_time_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Face detection completed: {len(faces_response)} faces "
            f"in {processing_time_ms:.2f}ms"
        )

        return DetectFacesResponse(
            faces=faces_response,
            face_count=len(faces_response),
            image_dimensions=ImageDimensionsResponse(width=width, height=height),
            processing_time_ms=round(processing_time_ms, 2),
        )

    except RuntimeError as e:
        logger.error(f"Face detection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "DETECTION_FAILED", "message": str(e)},
        )
    except Exception as e:
        logger.error(f"Unexpected error during face detection: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "INTERNAL_ERROR", "message": str(e)},
        )


@router.post(
    "/detect-with-embeddings",
    response_model=DetectFacesWithEmbeddingsResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect faces and extract embeddings",
    responses={
        400: {"model": ErrorResponse, "description": "Missing image source"},
        404: {"model": ErrorResponse, "description": "Image file not found"},
        422: {"model": ErrorResponse, "description": "Invalid image"},
        500: {"model": ErrorResponse, "description": "Processing error"},
    },
)
async def detect_faces_with_embeddings(
    request: DetectFacesWithEmbeddingsRequest,
) -> DetectFacesWithEmbeddingsResponse:
    """Detect faces and extract 512-dimensional embeddings.

    Performs face detection followed by embedding extraction for each
    detected face. Embeddings are L2-normalized vectors suitable for
    cosine similarity comparison.

    **Input Options** (provide one):
    - `image_path`: Path to image file on server
    - `image_base64`: Base64-encoded image data
    - `image_url`: URL to fetch image from

    **Returns**:
    - List of faces with embeddings and quality scores
    - Processing time in milliseconds
    - Original image dimensions

    **Use Cases**:
    - Face clustering for person grouping
    - Face matching for identification
    - Building face databases for search
    """
    start_time = time.time()

    # Load image
    image, width, height = _get_image_source(
        request.image_path,
        request.image_base64,
        request.image_url,
    )

    try:
        # Get embedding service
        service = get_face_embedding_service()

        # Extract embeddings (includes face detection)
        results = service.extract_embeddings(
            image,
            min_confidence=request.min_confidence,
            return_aligned_faces=request.return_aligned_faces,
        )

        # Apply max_faces limit if specified
        if request.max_faces and len(results) > request.max_faces:
            results = results[: request.max_faces]

        # Convert to response format
        faces_response = [
            _convert_embedding_result_to_response(
                result, width, height, request.return_aligned_faces
            )
            for result in results
        ]

        processing_time_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Face detection with embeddings completed: {len(faces_response)} faces "
            f"in {processing_time_ms:.2f}ms"
        )

        return DetectFacesWithEmbeddingsResponse(
            faces=faces_response,
            face_count=len(faces_response),
            image_dimensions=ImageDimensionsResponse(width=width, height=height),
            processing_time_ms=round(processing_time_ms, 2),
        )

    except RuntimeError as e:
        logger.error(f"Face embedding extraction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "EXTRACTION_FAILED", "message": str(e)},
        )
    except Exception as e:
        logger.error(f"Unexpected error during embedding extraction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "INTERNAL_ERROR", "message": str(e)},
        )


@router.post(
    "/compare",
    response_model=CompareFacesResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare two face embeddings",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid embeddings"},
        500: {"model": ErrorResponse, "description": "Processing error"},
    },
)
async def compare_faces(request: CompareFacesRequest) -> CompareFacesResponse:
    """Compare two face embeddings to determine if they're the same person.

    Takes two 512-dimensional face embeddings and computes their
    cosine similarity to determine if they belong to the same person.

    **Parameters**:
    - `embedding1`: First face embedding (512-dim)
    - `embedding2`: Second face embedding (512-dim)
    - `threshold`: Similarity threshold (default: 0.6)

    **Returns**:
    - Whether faces are same person (based on threshold)
    - Similarity score (0-1, higher = more similar)
    - Threshold used
    """
    try:
        service = get_face_embedding_service()

        # Convert to numpy arrays
        emb1 = np.array(request.embedding1, dtype=np.float32)
        emb2 = np.array(request.embedding2, dtype=np.float32)

        # Compare embeddings
        is_same, similarity = service.are_same_person(
            emb1, emb2, threshold=request.threshold
        )

        return CompareFacesResponse(
            is_same_person=is_same,
            similarity_score=round(similarity, 4),
            threshold_used=request.threshold,
        )

    except Exception as e:
        logger.error(f"Face comparison failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "COMPARISON_FAILED", "message": str(e)},
        )


@router.get(
    "/info",
    response_model=FaceServiceInfoResponse,
    status_code=status.HTTP_200_OK,
    summary="Get face detection service information",
)
async def get_service_info() -> FaceServiceInfoResponse:
    """Get information about the face detection service.

    Returns configuration and status of the face detection and
    embedding extraction services.

    **Returns**:
    - Model name and initialization status
    - Compute device (CUDA, MPS, CPU)
    - Detection configuration (resolution, thresholds)
    - Embedding dimension
    """
    try:
        detection_service = get_face_detection_service()
        model_info = detection_service.get_model_info()

        return FaceServiceInfoResponse(
            model_name=model_info["model_name"],
            initialized=model_info["initialized"],
            device=model_info["device"],
            providers=model_info["providers"],
            det_size=list(model_info["det_size"]),
            embedding_dim=getattr(settings, "FACE_EMBEDDING_DIM", 512),
            min_confidence=model_info["min_confidence"],
            max_faces=model_info["max_faces"],
        )

    except Exception as e:
        logger.error(f"Failed to get service info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "SERVICE_INFO_ERROR", "message": str(e)},
        )


# =============================================================================
# Module exports
# =============================================================================

__all__ = ["router"]
