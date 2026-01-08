"""Event schemas for AI processing.

Defines Kafka event schemas for AI processing pipeline including:
- Asset processing events
- AI analysis results
- Content moderation events
- Duplicate detection events
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID


# =============================================================================
# Enums
# =============================================================================


class AIFeature(str, Enum):
    """AI processing features."""

    UPSCALE = "upscale"
    TAG = "tag"
    MODERATE = "moderate"
    DEDUPLICATE = "deduplicate"


class ModerationPolicy(str, Enum):
    """Content moderation policies."""

    STANDARD = "standard"
    STRICT = "strict"
    CUSTOM = "custom"


class ModerationStatus(str, Enum):
    """Content moderation status."""

    SAFE = "safe"
    REVIEW = "review"
    BLOCKED = "blocked"
    PENDING = "pending"
    ERROR = "error"


class UpscaleStatus(str, Enum):
    """Image upscaling status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DuplicateMethod(str, Enum):
    """Duplicate detection method."""

    PERCEPTUAL_HASH = "perceptual_hash"
    CLIP_EMBEDDING = "clip_embedding"
    EXACT_MATCH = "exact_match"


# =============================================================================
# AI Processing Metadata
# =============================================================================


@dataclass
class AIProcessingMetadata:
    """AI processing configuration for an asset."""

    features: list[AIFeature] = field(default_factory=list)
    """AI features to apply: upscale, tag, moderate, deduplicate"""

    upscale_factor: int = 2
    """Upscaling factor: 2x or 4x"""

    moderation_policy: ModerationPolicy = ModerationPolicy.STANDARD
    """Content moderation policy: standard, strict, custom"""

    duplicate_threshold: float = 0.95
    """Similarity threshold for duplicate detection (0.0-1.0)"""

    priority: int = 5
    """Processing priority (1-10, higher = faster)"""

    skip_if_exists: bool = True
    """Skip AI processing if results already exist"""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Kafka serialization."""
        return {
            "features": [f.value for f in self.features],
            "upscale_factor": self.upscale_factor,
            "moderation_policy": self.moderation_policy.value,
            "duplicate_threshold": self.duplicate_threshold,
            "priority": self.priority,
            "skip_if_exists": self.skip_if_exists,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AIProcessingMetadata:
        """Create from dictionary (Kafka deserialization)."""
        return cls(
            features=[AIFeature(f) for f in data.get("features", [])],
            upscale_factor=data.get("upscale_factor", 2),
            moderation_policy=ModerationPolicy(
                data.get("moderation_policy", "standard")
            ),
            duplicate_threshold=data.get("duplicate_threshold", 0.95),
            priority=data.get("priority", 5),
            skip_if_exists=data.get("skip_if_exists", True),
        )


# =============================================================================
# Asset Processing Event (Extended from upload-service)
# =============================================================================


@dataclass
class AssetProcessingEvent:
    """Asset processing event published by upload-service.

    Extended with AI processing configuration.
    """

    asset_id: str
    """Asset UUID"""

    workspace_id: str
    """Workspace UUID"""

    gallery_id: Optional[str] = None
    """Gallery UUID (optional)"""

    file_type: str = "image"
    """File type: image, video, etc."""

    mime_type: str = "image/jpeg"
    """MIME type"""

    original_object_key: str = ""
    """R2 object key for original file"""

    priority: int = 5
    """Processing priority (1-10)"""

    metadata: dict[str, Any] = field(default_factory=dict)
    """Additional metadata"""

    ai_config: Optional[AIProcessingMetadata] = None
    """AI processing configuration (NEW in v2.0)"""

    event_id: Optional[str] = None
    """Event UUID for tracking"""

    timestamp: Optional[str] = None
    """ISO 8601 timestamp"""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Kafka serialization."""
        return {
            "asset_id": self.asset_id,
            "workspace_id": self.workspace_id,
            "gallery_id": self.gallery_id,
            "file_type": self.file_type,
            "mime_type": self.mime_type,
            "original_object_key": self.original_object_key,
            "priority": self.priority,
            "metadata": self.metadata,
            "ai_config": self.ai_config.to_dict() if self.ai_config else None,
            "event_id": self.event_id,
            "timestamp": self.timestamp or datetime.utcnow().isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AssetProcessingEvent:
        """Create from dictionary (Kafka deserialization)."""
        ai_config_data = data.get("ai_config")
        ai_config = (
            AIProcessingMetadata.from_dict(ai_config_data) if ai_config_data else None
        )

        return cls(
            asset_id=data["asset_id"],
            workspace_id=data["workspace_id"],
            gallery_id=data.get("gallery_id"),
            file_type=data.get("file_type", "image"),
            mime_type=data.get("mime_type", "image/jpeg"),
            original_object_key=data.get("original_object_key", ""),
            priority=data.get("priority", 5),
            metadata=data.get("metadata", {}),
            ai_config=ai_config,
            event_id=data.get("event_id"),
            timestamp=data.get("timestamp"),
        )


# =============================================================================
# Duplicate Detection Event
# =============================================================================


@dataclass
class DuplicateDetectionResult:
    """Duplicate detection result."""

    asset_id: str
    """Asset UUID"""

    workspace_id: str
    """Workspace UUID"""

    is_duplicate: bool = False
    """True if duplicate found"""

    duplicate_asset_id: Optional[str] = None
    """Duplicate asset UUID (if found)"""

    similarity_score: float = 0.0
    """Similarity score (0.0-1.0)"""

    method: Optional[DuplicateMethod] = None
    """Detection method used"""

    perceptual_hash: Optional[str] = None
    """Perceptual hash (pHash)"""

    clip_embedding: Optional[list[float]] = None
    """CLIP embedding vector"""

    processing_time_ms: int = 0
    """Processing time in milliseconds"""

    timestamp: Optional[str] = None
    """ISO 8601 timestamp"""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Kafka serialization."""
        return {
            "asset_id": self.asset_id,
            "workspace_id": self.workspace_id,
            "is_duplicate": self.is_duplicate,
            "duplicate_asset_id": self.duplicate_asset_id,
            "similarity_score": self.similarity_score,
            "method": self.method.value if self.method else None,
            "perceptual_hash": self.perceptual_hash,
            "clip_embedding": self.clip_embedding,
            "processing_time_ms": self.processing_time_ms,
            "timestamp": self.timestamp or datetime.utcnow().isoformat(),
        }


# =============================================================================
# Content Moderation Event
# =============================================================================


@dataclass
class ContentModerationResult:
    """Content moderation result."""

    asset_id: str
    """Asset UUID"""

    workspace_id: str
    """Workspace UUID"""

    status: ModerationStatus = ModerationStatus.PENDING
    """Moderation status"""

    violations: list[str] = field(default_factory=list)
    """List of violations (e.g., 'adult_content', 'violence')"""

    safe_search_scores: dict[str, str] = field(default_factory=dict)
    """Google Vision API Safe Search scores"""

    confidence_score: float = 0.0
    """Confidence score (0.0-1.0)"""

    manual_review_required: bool = False
    """True if manual review required"""

    policy_applied: ModerationPolicy = ModerationPolicy.STANDARD
    """Moderation policy applied"""

    processing_time_ms: int = 0
    """Processing time in milliseconds"""

    timestamp: Optional[str] = None
    """ISO 8601 timestamp"""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Kafka serialization."""
        return {
            "asset_id": self.asset_id,
            "workspace_id": self.workspace_id,
            "status": self.status.value,
            "violations": self.violations,
            "safe_search_scores": self.safe_search_scores,
            "confidence_score": self.confidence_score,
            "manual_review_required": self.manual_review_required,
            "policy_applied": self.policy_applied.value,
            "processing_time_ms": self.processing_time_ms,
            "timestamp": self.timestamp or datetime.utcnow().isoformat(),
        }


# =============================================================================
# Upscaling Event
# =============================================================================


@dataclass
class UpscalingResult:
    """Image upscaling result."""

    asset_id: str
    """Original asset UUID"""

    workspace_id: str
    """Workspace UUID"""

    status: UpscaleStatus = UpscaleStatus.PENDING
    """Upscaling status"""

    upscaled_asset_id: Optional[str] = None
    """Upscaled asset UUID (if completed)"""

    upscaled_object_key: Optional[str] = None
    """R2 object key for upscaled file"""

    scale_factor: int = 2
    """Upscaling factor applied"""

    original_size: tuple[int, int] = (0, 0)
    """Original image dimensions (width, height)"""

    upscaled_size: tuple[int, int] = (0, 0)
    """Upscaled image dimensions (width, height)"""

    processing_time_ms: int = 0
    """Processing time in milliseconds"""

    model_used: str = "RealESRGAN_x4plus"
    """Upscaling model used"""

    error_message: Optional[str] = None
    """Error message (if failed)"""

    timestamp: Optional[str] = None
    """ISO 8601 timestamp"""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Kafka serialization."""
        return {
            "asset_id": self.asset_id,
            "workspace_id": self.workspace_id,
            "status": self.status.value,
            "upscaled_asset_id": self.upscaled_asset_id,
            "upscaled_object_key": self.upscaled_object_key,
            "scale_factor": self.scale_factor,
            "original_size": list(self.original_size),
            "upscaled_size": list(self.upscaled_size),
            "processing_time_ms": self.processing_time_ms,
            "model_used": self.model_used,
            "error_message": self.error_message,
            "timestamp": self.timestamp or datetime.utcnow().isoformat(),
        }


# =============================================================================
# Combined AI Results Event
# =============================================================================


@dataclass
class AIProcessingResultsEvent:
    """Combined AI processing results for an asset."""

    asset_id: str
    """Asset UUID"""

    workspace_id: str
    """Workspace UUID"""

    duplicate_detection: Optional[DuplicateDetectionResult] = None
    """Duplicate detection results"""

    content_moderation: Optional[ContentModerationResult] = None
    """Content moderation results"""

    upscaling: Optional[UpscalingResult] = None
    """Upscaling results"""

    total_processing_time_ms: int = 0
    """Total processing time across all features"""

    features_completed: list[AIFeature] = field(default_factory=list)
    """List of completed AI features"""

    features_failed: list[AIFeature] = field(default_factory=list)
    """List of failed AI features"""

    timestamp: Optional[str] = None
    """ISO 8601 timestamp"""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for Kafka serialization."""
        return {
            "asset_id": self.asset_id,
            "workspace_id": self.workspace_id,
            "duplicate_detection": (
                self.duplicate_detection.to_dict() if self.duplicate_detection else None
            ),
            "content_moderation": (
                self.content_moderation.to_dict() if self.content_moderation else None
            ),
            "upscaling": self.upscaling.to_dict() if self.upscaling else None,
            "total_processing_time_ms": self.total_processing_time_ms,
            "features_completed": [f.value for f in self.features_completed],
            "features_failed": [f.value for f in self.features_failed],
            "timestamp": self.timestamp or datetime.utcnow().isoformat(),
        }
