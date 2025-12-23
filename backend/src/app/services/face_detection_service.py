"""Face Detection Service for orchestrating face detection operations.

This module provides the FaceDetectionService class that handles:
- Face detection orchestration with AI providers
- Photo processing pipeline (detect → cluster → thumbnail)
- Detection job management
- Reprocessing triggers

Requirements: 1.1, 1.2, 1.4, 1.6, 1.8
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.api.face_schemas import (
    FaceDetectionResult,
    BoundingBox,
    FaceDetectionJobStatus,
)
from app.services.face_cluster_service import (
    FaceClusterService,
    get_face_cluster_service,
)
from app.services.face_configuration_service import (
    FaceConfigurationService,
    get_face_configuration_service,
)
from app.services.face_exceptions import (
    FaceNotFoundError,
    FaceDetectionError,
    FaceDetectionErrorCode,
    DetectionDisabledError,
    PhotoNotFoundError,
)
from app.repositories.face_repository import FaceRepository, get_face_repository


logger = logging.getLogger(__name__)


# Default minimum confidence for storing faces
DEFAULT_MIN_CONFIDENCE = 0.3

# Default minimum photo dimensions for face detection
MIN_PHOTO_WIDTH = 50
MIN_PHOTO_HEIGHT = 50


class FaceDetectionService:
    """Orchestration service for face detection operations.
    
    This service coordinates the face detection pipeline:
    1. Receive photo for processing
    2. Call AI provider to detect faces
    3. Store detected faces with bounding boxes and embeddings
    4. Cluster faces into groups
    5. Generate thumbnails (delegated to thumbnail service)
    
    The service handles:
    - Provider failover via ProviderManager
    - Low-confidence filtering
    - Detection job tracking
    - Workspace-level detection settings
    """
    
    def __init__(
        self,
        face_repository: Optional[FaceRepository] = None,
        cluster_service: Optional[FaceClusterService] = None,
        configuration_service: Optional[FaceConfigurationService] = None,
    ):
        """Initialize the detection service with dependencies.
        
        Args:
            face_repository: Repository for face CRUD operations
            cluster_service: Service for face clustering
            configuration_service: Service for configuration settings
        """
        self._face_repo = face_repository
        self._cluster_service = cluster_service
        self._config_service = configuration_service
        self._provider_manager = None  # Lazy initialized
    
    @property
    def face_repo(self) -> FaceRepository:
        """Lazy load face repository."""
        if self._face_repo is None:
            self._face_repo = get_face_repository()
        return self._face_repo
    
    @property
    def cluster_service(self) -> FaceClusterService:
        """Lazy load cluster service."""
        if self._cluster_service is None:
            self._cluster_service = get_face_cluster_service()
        return self._cluster_service
    
    @property
    def config_service(self) -> FaceConfigurationService:
        """Lazy load configuration service."""
        if self._config_service is None:
            self._config_service = get_face_configuration_service()
        return self._config_service
    
    async def _get_provider_manager(self):
        """Lazy load provider manager."""
        if self._provider_manager is None:
            from app.services.ai.providers.provider_manager import ProviderManager
            self._provider_manager = ProviderManager(self.config_service)
            await self._provider_manager.initialize()
        return self._provider_manager
    
    # =========================================================================
    # DETECTION OPERATIONS
    # =========================================================================
    
    async def detect_faces(
        self,
        photo_id: UUID,
        workspace_id: UUID,
        image_buffer: bytes,
    ) -> list[FaceDetectionResult]:
        """Detect all faces in a photo using AI providers.
        
        This method:
        1. Calls the AI provider (with failover) to detect faces
        2. Returns raw detection results for further processing
        
        Args:
            photo_id: ID of the photo being processed
            workspace_id: Workspace ID for tenant isolation
            image_buffer: Raw image data as bytes
            
        Returns:
            List of FaceDetectionResult objects with bounding boxes and confidence
            
        Raises:
            AllProvidersFailedError: If all AI providers fail
            DetectionDisabledError: If face detection is disabled for workspace
            
        Requirements: 1.2, 1.3
        """
        # Check if detection is enabled for this workspace
        if not await self._is_detection_enabled(workspace_id):
            raise DetectionDisabledError(workspace_id=workspace_id)
        
        logger.info(
            "Starting face detection",
            extra={
                "photo_id": str(photo_id),
                "workspace_id": str(workspace_id),
                "image_size": len(image_buffer),
            },
        )
        
        # Get provider manager and detect faces
        provider_manager = await self._get_provider_manager()
        
        results = await provider_manager.detect_faces(image_buffer)
        
        logger.info(
            "Face detection complete",
            extra={
                "photo_id": str(photo_id),
                "faces_detected": len(results),
            },
        )
        
        return results
    
    async def process_photo(
        self,
        photo_id: UUID,
        workspace_id: UUID,
        image_buffer: bytes,
        auto_cluster: bool = True,
    ) -> list[dict[str, Any]]:
        """Process a photo through the full detection pipeline.
        
        The complete pipeline:
        1. Detect faces using AI provider
        2. Filter by minimum confidence
        3. Store face records with bounding boxes
        4. Optionally cluster faces into groups
        
        Args:
            photo_id: ID of the photo to process
            workspace_id: Workspace ID for tenant isolation
            image_buffer: Raw image data as bytes
            auto_cluster: If True, automatically cluster detected faces
            
        Returns:
            List of created face records
            
        Raises:
            AllProvidersFailedError: If all AI providers fail
            DetectionDisabledError: If detection is disabled
            
        Requirements: 1.1, 1.4, 1.6, 1.8
        """
        # Update job status to processing
        await self._update_job_status(
            photo_id, workspace_id, FaceDetectionJobStatus.PROCESSING
        )
        
        try:
            # Detect faces
            detection_results = await self.detect_faces(
                photo_id, workspace_id, image_buffer
            )
            
            if not detection_results:
                # No faces found - mark as complete
                await self._update_job_status(
                    photo_id,
                    workspace_id,
                    FaceDetectionJobStatus.COMPLETED,
                    faces_detected=0,
                )
                return []
            
            # Get minimum confidence threshold
            min_confidence = await self._get_min_confidence()
            
            # Filter and store faces
            stored_faces = []
            provider_manager = await self._get_provider_manager()
            provider = await provider_manager.select_provider()
            provider_name = provider.name
            
            for result in detection_results:
                # Skip very low confidence detections
                if result.confidence < min_confidence:
                    logger.debug(
                        "Skipping low-confidence face",
                        extra={
                            "photo_id": str(photo_id),
                            "confidence": result.confidence,
                            "threshold": min_confidence,
                        },
                    )
                    continue
                
                # Create face record
                face = await self.face_repo.create(
                    workspace_id=workspace_id,
                    photo_id=photo_id,
                    bounding_box={
                        "x": result.bounding_box.x,
                        "y": result.bounding_box.y,
                        "width": result.bounding_box.width,
                        "height": result.bounding_box.height,
                    },
                    confidence=result.confidence,
                    provider=provider_name,
                    embedding=result.embedding if hasattr(result, 'embedding') else None,
                    detection_metadata={
                        "landmarks": [l.model_dump() for l in (result.landmarks or [])],
                        "attributes": result.attributes.model_dump() if result.attributes else None,
                    },
                )
                
                stored_faces.append(face)
            
            # Auto-cluster faces if enabled and threshold met
            if auto_cluster:
                clustering_threshold = await self._get_clustering_confidence_threshold()
                for face in stored_faces:
                    if face.get("confidence", 0) >= clustering_threshold:
                        try:
                            await self.cluster_service.assign_to_cluster(
                                face["id"], workspace_id
                            )
                        except Exception as e:
                            logger.warning(
                                "Failed to cluster face",
                                extra={
                                    "face_id": str(face["id"]),
                                    "error": str(e),
                                },
                            )
            
            # Update job status to complete
            await self._update_job_status(
                photo_id,
                workspace_id,
                FaceDetectionJobStatus.COMPLETED,
                faces_detected=len(stored_faces),
                provider_used=provider_name,
            )
            
            logger.info(
                "Photo processing complete",
                extra={
                    "photo_id": str(photo_id),
                    "faces_stored": len(stored_faces),
                    "total_detected": len(detection_results),
                },
            )
            
            return stored_faces
            
        except Exception as e:
            # Update job status to failed
            await self._update_job_status(
                photo_id,
                workspace_id,
                FaceDetectionJobStatus.FAILED,
                error_message=str(e),
            )
            raise
    
    async def reprocess_photo(
        self,
        photo_id: UUID,
        workspace_id: UUID,
        priority: int = 10,
    ) -> UUID:
        """Trigger reprocessing of a photo for face detection.
        
        Creates or updates a detection job with higher priority.
        Existing faces for this photo are NOT deleted until new
        detection completes.
        
        Args:
            photo_id: ID of the photo to reprocess
            workspace_id: Workspace ID for tenant isolation
            priority: Job priority (higher = processed sooner)
            
        Returns:
            The job ID for tracking
            
        Requirements: 5.7
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Upsert detection job with priority
            row = await conn.fetchrow(
                """
                INSERT INTO face_detection_jobs (
                    workspace_id, photo_id, status, priority
                )
                VALUES ($1, $2, 'pending', $3)
                ON CONFLICT (photo_id) DO UPDATE SET
                    status = 'pending',
                    priority = GREATEST(face_detection_jobs.priority, $3),
                    error_message = NULL,
                    retry_count = 0
                RETURNING id
                """,
                workspace_id,
                photo_id,
                priority,
            )
            
            logger.info(
                "Photo queued for reprocessing",
                extra={
                    "photo_id": str(photo_id),
                    "job_id": str(row["id"]),
                    "priority": priority,
                },
            )
            
            return row["id"]
    
    async def get_detection_status(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get the detection job status for a photo.
        
        Args:
            photo_id: ID of the photo
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            Detection job record or None if no job exists
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT *
                FROM face_detection_jobs
                WHERE photo_id = $1 AND workspace_id = $2
                """,
                photo_id,
                workspace_id,
            )
            
            return dict(row) if row else None
    
    async def get_detection_stats(
        self,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Get detection statistics for a workspace.
        
        Returns:
            Dict with counts: total_photos, processed_photos,
            pending_photos, failed_photos, total_faces_detected
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_jobs,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'processing') as processing,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    COALESCE(SUM(faces_detected), 0) as total_faces
                FROM face_detection_jobs
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            
            return {
                "total_photos": stats["total_jobs"],
                "processed_photos": stats["completed"],
                "pending_photos": stats["pending"],
                "processing_photos": stats["processing"],
                "failed_photos": stats["failed"],
                "total_faces_detected": stats["total_faces"],
            }
    
    # =========================================================================
    # FACE RETRIEVAL
    # =========================================================================
    
    async def get_faces_by_photo(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """Get all detected faces in a photo.
        
        Args:
            photo_id: ID of the photo
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            List of face records ordered by confidence descending
        """
        return await self.face_repo.find_by_photo_id(photo_id, workspace_id)
    
    async def get_face(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get a specific face by ID.
        
        Args:
            face_id: ID of the face
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            Face record
            
        Raises:
            FaceNotFoundError: If face doesn't exist
        """
        return await self.face_repo.get_by_id(face_id, workspace_id)
    
    # =========================================================================
    # JOB MANAGEMENT
    # =========================================================================
    
    async def create_detection_job(
        self,
        photo_id: UUID,
        workspace_id: UUID,
        priority: int = 0,
    ) -> UUID:
        """Create a detection job for a photo.
        
        Args:
            photo_id: ID of the photo to process
            workspace_id: Workspace ID for tenant isolation
            priority: Job priority (higher = processed sooner)
            
        Returns:
            The created job ID
            
        Requirements: 1.1
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO face_detection_jobs (
                    workspace_id, photo_id, status, priority
                )
                VALUES ($1, $2, 'pending', $3)
                ON CONFLICT (photo_id) DO NOTHING
                RETURNING id
                """,
                workspace_id,
                photo_id,
                priority,
            )
            
            if row:
                logger.debug(
                    "Detection job created",
                    extra={
                        "photo_id": str(photo_id),
                        "job_id": str(row["id"]),
                    },
                )
                return row["id"]
            
            # Job already exists - return existing
            existing = await conn.fetchval(
                "SELECT id FROM face_detection_jobs WHERE photo_id = $1",
                photo_id,
            )
            return existing
    
    async def _update_job_status(
        self,
        photo_id: UUID,
        workspace_id: UUID,
        status: FaceDetectionJobStatus,
        faces_detected: Optional[int] = None,
        provider_used: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Update the status of a detection job."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            updates = ["status = $3"]
            params = [photo_id, workspace_id, status.value]
            param_idx = 4
            
            if status == FaceDetectionJobStatus.PROCESSING:
                updates.append(f"started_at = NOW()")
            
            if status in (FaceDetectionJobStatus.COMPLETED, FaceDetectionJobStatus.FAILED):
                updates.append(f"completed_at = NOW()")
            
            if faces_detected is not None:
                updates.append(f"faces_detected = ${param_idx}")
                params.append(faces_detected)
                param_idx += 1
            
            if provider_used:
                updates.append(f"provider_used = ${param_idx}")
                params.append(provider_used)
                param_idx += 1
            
            if error_message:
                updates.append(f"error_message = ${param_idx}")
                params.append(error_message)
                param_idx += 1
            
            await conn.execute(
                f"""
                UPDATE face_detection_jobs
                SET {", ".join(updates)}
                WHERE photo_id = $1 AND workspace_id = $2
                """,
                *params,
            )
    
    # =========================================================================
    # CONFIGURATION HELPERS
    # =========================================================================
    
    async def _is_detection_enabled(self, workspace_id: UUID) -> bool:
        """Check if face detection is enabled for a workspace."""
        try:
            # Check workspace-level setting
            value = await self.config_service.get_face_detection_setting(
                f"workspace_{workspace_id}_enabled"
            )
            if value is not None:
                return value.lower() == "true"
            
            # Fall back to global setting
            global_value = await self.config_service.get_face_detection_setting(
                "enabled"
            )
            if global_value is not None:
                return global_value.lower() == "true"
            
            # Default to enabled
            return True
        except Exception:
            return True
    
    async def _get_min_confidence(self) -> float:
        """Get minimum confidence threshold for storing faces."""
        try:
            value = await self.config_service.get_face_detection_setting(
                "min_confidence"
            )
            return float(value) if value else DEFAULT_MIN_CONFIDENCE
        except Exception:
            return DEFAULT_MIN_CONFIDENCE
    
    async def _get_clustering_confidence_threshold(self) -> float:
        """Get confidence threshold for auto-clustering eligibility."""
        try:
            value = await self.config_service.get_face_detection_setting(
                "clustering_confidence_threshold"
            )
            return float(value) if value else 0.6
        except Exception:
            return 0.6


# Singleton instance
_service: Optional[FaceDetectionService] = None


def get_face_detection_service() -> FaceDetectionService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = FaceDetectionService()
    return _service
