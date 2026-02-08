"""Face detection API schemas.

Pydantic schemas for face detection and embedding extraction API endpoints.

Feature: Face Detection and Identification
Task: T009 - Create face detection API endpoint
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================


class ImageInputType(str, Enum):
    """Image input format type."""

    FILE_PATH = "file_path"
    BASE64 = "base64"
    URL = "url"


# =============================================================================
# Bounding Box Schemas
# =============================================================================


class BoundingBoxPercentage(BaseModel):
    """Bounding box coordinates as percentages (0-100)."""

    x: float = Field(..., ge=0, le=100, description="Left edge X coordinate as percentage")
    y: float = Field(..., ge=0, le=100, description="Top edge Y coordinate as percentage")
    width: float = Field(..., ge=0, le=100, description="Box width as percentage")
    height: float = Field(..., ge=0, le=100, description="Box height as percentage")


class BoundingBoxPixels(BaseModel):
    """Bounding box coordinates in absolute pixels."""

    x: int = Field(..., ge=0, description="Left edge X coordinate in pixels")
    y: int = Field(..., ge=0, description="Top edge Y coordinate in pixels")
    width: int = Field(..., ge=0, description="Box width in pixels")
    height: int = Field(..., ge=0, description="Box height in pixels")


# =============================================================================
# Face Detection Schemas
# =============================================================================


class FaceLandmarksResponse(BaseModel):
    """Facial landmark points response."""

    left_eye: List[float] = Field(..., description="Left eye center coordinates (x, y)")
    right_eye: List[float] = Field(..., description="Right eye center coordinates (x, y)")
    nose: List[float] = Field(..., description="Nose tip coordinates (x, y)")
    left_mouth: List[float] = Field(..., description="Left mouth corner coordinates (x, y)")
    right_mouth: List[float] = Field(..., description="Right mouth corner coordinates (x, y)")


class FacePoseResponse(BaseModel):
    """Head pose angles in degrees."""

    pitch: float = Field(..., description="Pitch angle (vertical tilt)")
    yaw: float = Field(..., description="Yaw angle (horizontal rotation)")
    roll: float = Field(..., description="Roll angle (tilt)")


class FaceAttributesResponse(BaseModel):
    """Additional face attributes."""

    age: Optional[int] = Field(None, description="Estimated age")
    gender: Optional[str] = Field(None, description="Estimated gender (male/female)")
    pose: Optional[FacePoseResponse] = Field(None, description="Head pose angles")


class DetectionMetadataResponse(BaseModel):
    """Face detection metadata."""

    model: str = Field(..., description="Detection model used")
    det_size: List[int] = Field(..., description="Detection resolution (width, height)")


class DetectedFaceResponse(BaseModel):
    """Single detected face result."""

    bounding_box: BoundingBoxPercentage = Field(
        ..., description="Face bounding box as percentages"
    )
    bounding_box_pixels: BoundingBoxPixels = Field(
        ..., description="Face bounding box in pixels"
    )
    confidence: float = Field(
        ..., ge=0, le=1, description="Detection confidence score (0-1)"
    )
    landmarks: Optional[FaceLandmarksResponse] = Field(
        None, description="Facial landmarks (5-point)"
    )
    attributes: Optional[FaceAttributesResponse] = Field(
        None, description="Face attributes (age, gender, pose)"
    )
    metadata: Optional[DetectionMetadataResponse] = Field(
        None, description="Detection metadata"
    )


# =============================================================================
# Embedding Schemas
# =============================================================================


class FaceEmbeddingResponse(BaseModel):
    """Face embedding extraction result."""

    embedding: List[float] = Field(
        ..., description="512-dimensional L2-normalized face embedding"
    )
    embedding_dim: int = Field(512, description="Embedding vector dimension")
    quality_score: float = Field(
        ..., ge=0, le=1, description="Embedding quality score (0-1)"
    )
    face: DetectedFaceResponse = Field(
        ..., description="Associated face detection result"
    )
    aligned_face_base64: Optional[str] = Field(
        None, description="Base64-encoded aligned face crop (JPEG)"
    )


# =============================================================================
# Request Schemas
# =============================================================================


class DetectFacesRequest(BaseModel):
    """Request to detect faces in an image."""

    image_path: Optional[str] = Field(
        None, description="Path to the image file on server"
    )
    image_base64: Optional[str] = Field(
        None, description="Base64-encoded image data"
    )
    image_url: Optional[str] = Field(
        None, description="URL to fetch the image from"
    )
    min_confidence: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="Minimum confidence threshold (0-1, default: 0.5)",
    )
    max_faces: Optional[int] = Field(
        None,
        ge=1,
        le=1000,
        description="Maximum number of faces to detect (default: 100)",
    )
    extract_attributes: bool = Field(
        True, description="Whether to extract age, gender, and pose attributes"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "image_path": "/data/assets/workspace123/photo.jpg",
                "min_confidence": 0.5,
                "max_faces": 50,
                "extract_attributes": True,
            }
        }


class DetectFacesWithEmbeddingsRequest(BaseModel):
    """Request to detect faces and extract embeddings."""

    image_path: Optional[str] = Field(
        None, description="Path to the image file on server"
    )
    image_base64: Optional[str] = Field(
        None, description="Base64-encoded image data"
    )
    image_url: Optional[str] = Field(
        None, description="URL to fetch the image from"
    )
    min_confidence: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="Minimum confidence threshold (0-1, default: 0.5)",
    )
    max_faces: Optional[int] = Field(
        None,
        ge=1,
        le=1000,
        description="Maximum number of faces to process (default: 100)",
    )
    return_aligned_faces: bool = Field(
        False, description="Whether to return base64-encoded aligned face crops"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "image_path": "/data/assets/workspace123/photo.jpg",
                "min_confidence": 0.6,
                "max_faces": 20,
                "return_aligned_faces": False,
            }
        }


class CompareFacesRequest(BaseModel):
    """Request to compare two face embeddings."""

    embedding1: List[float] = Field(
        ..., min_length=512, max_length=512, description="First face embedding (512-dim)"
    )
    embedding2: List[float] = Field(
        ..., min_length=512, max_length=512, description="Second face embedding (512-dim)"
    )
    threshold: float = Field(
        0.6, ge=0, le=1, description="Similarity threshold for same person determination"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "embedding1": [0.1] * 512,
                "embedding2": [0.2] * 512,
                "threshold": 0.6,
            }
        }


# =============================================================================
# Response Schemas
# =============================================================================


class ImageDimensionsResponse(BaseModel):
    """Image dimensions in response."""

    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")


class DetectFacesResponse(BaseModel):
    """Response from face detection endpoint."""

    faces: List[DetectedFaceResponse] = Field(
        ..., description="List of detected faces"
    )
    face_count: int = Field(..., description="Number of faces detected")
    image_dimensions: ImageDimensionsResponse = Field(
        ..., description="Original image dimensions"
    )
    processing_time_ms: float = Field(
        ..., description="Processing time in milliseconds"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "faces": [
                    {
                        "bounding_box": {"x": 25.5, "y": 10.2, "width": 15.0, "height": 20.0},
                        "bounding_box_pixels": {"x": 255, "y": 102, "width": 150, "height": 200},
                        "confidence": 0.98,
                        "landmarks": {
                            "left_eye": [270.5, 140.2],
                            "right_eye": [320.5, 142.1],
                            "nose": [295.0, 180.5],
                            "left_mouth": [275.0, 220.0],
                            "right_mouth": [315.0, 218.5],
                        },
                        "attributes": {"age": 28, "gender": "male", "pose": {"pitch": 2.5, "yaw": -5.0, "roll": 1.2}},
                    }
                ],
                "face_count": 1,
                "image_dimensions": {"width": 1000, "height": 800},
                "processing_time_ms": 125.5,
            }
        }


class DetectFacesWithEmbeddingsResponse(BaseModel):
    """Response from face detection with embedding extraction endpoint."""

    faces: List[FaceEmbeddingResponse] = Field(
        ..., description="List of faces with embeddings"
    )
    face_count: int = Field(..., description="Number of faces processed")
    image_dimensions: ImageDimensionsResponse = Field(
        ..., description="Original image dimensions"
    )
    processing_time_ms: float = Field(
        ..., description="Processing time in milliseconds"
    )


class CompareFacesResponse(BaseModel):
    """Response from face comparison endpoint."""

    is_same_person: bool = Field(
        ..., description="Whether the faces belong to the same person"
    )
    similarity_score: float = Field(
        ..., ge=0, le=1, description="Cosine similarity score (0-1)"
    )
    threshold_used: float = Field(
        ..., description="Similarity threshold used for determination"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "is_same_person": True,
                "similarity_score": 0.85,
                "threshold_used": 0.6,
            }
        }


class FaceServiceInfoResponse(BaseModel):
    """Response with face service information."""

    model_name: str = Field(..., description="Face detection model name")
    initialized: bool = Field(..., description="Whether model is loaded")
    device: str = Field(..., description="Compute device (cuda, mps, cpu)")
    providers: List[str] = Field(..., description="ONNX execution providers")
    det_size: List[int] = Field(..., description="Detection resolution")
    embedding_dim: int = Field(512, description="Embedding vector dimension")
    min_confidence: float = Field(..., description="Default minimum confidence")
    max_faces: int = Field(..., description="Default maximum faces")


class ErrorResponse(BaseModel):
    """Error response schema."""

    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional details")


# =============================================================================
# Module exports
# =============================================================================

__all__ = [
    # Enums
    "ImageInputType",
    # Bounding box
    "BoundingBoxPercentage",
    "BoundingBoxPixels",
    # Face detection
    "FaceLandmarksResponse",
    "FacePoseResponse",
    "FaceAttributesResponse",
    "DetectionMetadataResponse",
    "DetectedFaceResponse",
    # Embeddings
    "FaceEmbeddingResponse",
    # Requests
    "DetectFacesRequest",
    "DetectFacesWithEmbeddingsRequest",
    "CompareFacesRequest",
    # Responses
    "ImageDimensionsResponse",
    "DetectFacesResponse",
    "DetectFacesWithEmbeddingsResponse",
    "CompareFacesResponse",
    "FaceServiceInfoResponse",
    "ErrorResponse",
]
