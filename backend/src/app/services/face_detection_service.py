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
import os
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import cv2
import numpy as np

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
from app.services.biometric_consent_service import (
    BiometricConsentService,
    get_biometric_consent_service,
    ConsentNotGrantedError,
)
from app.services.face_exceptions import (
    FaceNotFoundError,
    FaceDetectionError,
    FaceDetectionErrorCode,
    DetectionDisabledError,
    PhotoNotFoundError,
)
from app.repositories.face_repository import FaceRepository, get_face_repository
from app.services.ai.face_embedder import FaceEmbedder

import cv2
import numpy as np


logger = logging.getLogger(__name__)


# Default minimum confidence for storing faces
# Set to 0.3 to include more real faces at the cost of occasional false positives
DEFAULT_MIN_CONFIDENCE = 0.3

# Default minimum photo dimensions for face detection
MIN_PHOTO_WIDTH = 50
MIN_PHOTO_HEIGHT = 50

def _evaluate_consent_bypass() -> bool:
    """Evaluate whether biometric consent checks can be bypassed.

    Consent bypass is ONLY allowed in development or test environments.
    In production (the default), bypass is always False regardless of
    the RAWDRIVE_BYPASS_BIOMETRIC_CONSENT env var.

    Returns:
        True if bypass is allowed, False otherwise.
    """
    _env = os.getenv("RAWDRIVE_ENV", "production").lower()
    if _env not in ("development", "test"):
        return False
    return os.getenv("RAWDRIVE_BYPASS_BIOMETRIC_CONSENT", "false").lower() == "true"


# Development mode: bypass consent checks (environment-gated)
BYPASS_CONSENT_CHECKS = _evaluate_consent_bypass()

if BYPASS_CONSENT_CHECKS:
    logger.warning("BIOMETRIC CONSENT BYPASS ENABLED - dev/test only")


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
        consent_service: Optional[BiometricConsentService] = None,
    ):
        """Initialize the detection service with dependencies.

        Args:
            face_repository: Repository for face CRUD operations
            cluster_service: Service for face clustering
            configuration_service: Service for configuration settings
            consent_service: Service for biometric consent checks
        """
        self._face_repo = face_repository
        self._cluster_service = cluster_service
        self._config_service = configuration_service
        self._consent_service = consent_service
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

    @property
    def consent_service(self) -> BiometricConsentService:
        """Lazy load biometric consent service."""
        if self._consent_service is None:
            self._consent_service = get_biometric_consent_service()
        return self._consent_service

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

            # Generate embeddings for faces that don't have them
            # (Cloud Vision and Gemini don't return embeddings)
            await self._generate_embeddings_for_results(detection_results, image_buffer)

            # Filter and store faces
            stored_faces = []

            for result in detection_results:
                # Use provider from result metadata if available, otherwise unknown
                # The local provider puts this in raw_provider_response
                provider_name = "unknown"
                if result.raw_provider_response and "provider" in result.raw_provider_response:
                    provider_name = result.raw_provider_response["provider"]
                elif hasattr(result, "provider"):  # If we add this field to FaceDetectionResult later
                    provider_name = result.provider

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

            # Generate and upload face thumbnails
            try:
                nparr = np.frombuffer(image_buffer, np.uint8)
                decoded_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if decoded_image is not None:
                    for face in stored_faces:
                        try:
                            bb = face.get("bounding_box", {})
                            if all(k in bb for k in ("x", "y", "width", "height")):
                                thumb_urls = await self._generate_and_upload_thumbnails(
                                    face_id=face["id"],
                                    workspace_id=workspace_id,
                                    image=decoded_image,
                                    bounding_box=bb,
                                )
                                if thumb_urls:
                                    await self.face_repo.update(
                                        face_id=face["id"],
                                        workspace_id=workspace_id,
                                        thumbnail_urls=thumb_urls,
                                    )
                                    face["thumbnail_urls"] = thumb_urls
                        except Exception as thumb_err:
                            logger.warning(
                                "Failed to generate thumbnails for face",
                                extra={
                                    "face_id": str(face["id"]),
                                    "error": str(thumb_err),
                                },
                            )
            except Exception as e:
                logger.warning(
                    "Failed to decode image for thumbnail generation",
                    extra={"photo_id": str(photo_id), "error": str(e)},
                )

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

    async def _generate_embeddings_for_results(
        self,
        detection_results: list[FaceDetectionResult],
        image_buffer: bytes,
    ) -> None:
        """Generate embeddings for faces that don't have them.

        Cloud Vision and Gemini providers detect faces but don't return embeddings.
        This method uses the local FaceEmbedder to generate 512-d embeddings
        for faces that need them.

        Args:
            detection_results: List of face detection results to process
            image_buffer: Raw image data as bytes

        Note:
            Modifies detection_results in place by setting the embedding field.
            Failures are logged but don't raise exceptions.
        """
        # Check if any faces need embeddings
        faces_without_embeddings = [
            r for r in detection_results
            if not hasattr(r, 'embedding') or r.embedding is None
        ]

        if not faces_without_embeddings:
            logger.debug("All faces already have embeddings, skipping generation")
            return

        try:
            # Initialize embedder
            embedder = FaceEmbedder()
            await embedder.ensure_initialized()

            # Decode image
            nparr = np.frombuffer(image_buffer, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                logger.warning("Failed to decode image for embedding generation")
                return

            h, w = image.shape[:2]

            # Generate embeddings for each face
            embeddings_generated = 0
            for result in faces_without_embeddings:
                try:
                    box = result.bounding_box

                    # Convert percentage coords to pixels
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
                        face_crop = image[y_px:y_px + h_px, x_px:x_px + w_px]

                        if face_crop.size > 0:
                            # Generate embedding
                            embedding = await embedder.generate_embedding(face_crop)
                            if embedding:
                                result.embedding = embedding
                                embeddings_generated += 1

                except Exception as e:
                    logger.warning(
                        "Failed to generate embedding for face",
                        extra={"error": str(e)},
                    )

            logger.info(
                "Embeddings generated for Cloud Vision/Gemini results",
                extra={
                    "faces_total": len(detection_results),
                    "faces_needing_embeddings": len(faces_without_embeddings),
                    "embeddings_generated": embeddings_generated,
                },
            )

        except Exception as e:
            logger.warning(
                "Failed to generate embeddings",
                extra={"error": str(e)},
            )

    async def _generate_and_upload_thumbnails(
        self,
        face_id: UUID,
        workspace_id: UUID,
        image: "np.ndarray",
        bounding_box: dict[str, float],
    ) -> dict[str, str]:
        """Generate face thumbnail crops and upload to R2.

        Creates 3 sizes (64, 128, 256), uploads as JPEG, and returns
        the R2 object keys for storage in ``faces.thumbnail_urls``.

        Args:
            face_id: Face UUID (used in the storage path)
            workspace_id: Workspace UUID for tenant isolation
            image: Decoded source image (BGR numpy array)
            bounding_box: {x, y, width, height} as percentages

        Returns:
            Dict mapping size name to R2 object key,
            e.g. {"small": "workspaces/.../64.jpg", ...}
        """
        from app.services.r2_storage_service import get_r2_storage_service

        img_h, img_w = image.shape[:2]

        # Convert percentage coords to pixels
        x_px = int((bounding_box["x"] / 100.0) * img_w)
        y_px = int((bounding_box["y"] / 100.0) * img_h)
        w_px = int((bounding_box["width"] / 100.0) * img_w)
        h_px = int((bounding_box["height"] / 100.0) * img_h)

        # Add 20% padding
        pad_x = int(w_px * 0.2)
        pad_y = int(h_px * 0.2)
        x1 = max(0, x_px - pad_x)
        y1 = max(0, y_px - pad_y)
        x2 = min(img_w, x_px + w_px + pad_x)
        y2 = min(img_h, y_px + h_px + pad_y)

        face_crop = image[y1:y2, x1:x2]
        if face_crop.size == 0:
            return {}

        storage = get_r2_storage_service()
        sizes = {"small": 64, "medium": 128, "large": 256}
        thumbnail_urls: dict[str, str] = {}
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, 85]

        for size_name, px in sizes.items():
            resized = cv2.resize(face_crop, (px, px), interpolation=cv2.INTER_AREA)
            success, jpeg_buf = cv2.imencode(".jpg", resized, encode_params)
            if not success:
                continue

            r2_key = f"workspaces/{workspace_id}/faces/{face_id}/{px}.jpg"
            try:
                await storage.upload_bytes(
                    key=r2_key,
                    data=jpeg_buf.tobytes(),
                    content_type="image/jpeg",
                )
                thumbnail_urls[size_name] = r2_key
            except Exception as upload_err:
                logger.warning(
                    "Failed to upload face thumbnail",
                    extra={
                        "face_id": str(face_id),
                        "size": size_name,
                        "error": str(upload_err),
                    },
                )

        return thumbnail_urls

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
            # Upsert detection job with priority. Do not reset jobs that are already
            # completed, so repeated --queue runs do not undo progress.
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
                WHERE face_detection_jobs.status != 'completed'
                RETURNING id
                """,
                workspace_id,
                photo_id,
                priority,
            )
            if row is None:
                # Job already completed; WHERE excluded the update. Return existing id.
                row = await conn.fetchrow(
                    "SELECT id FROM face_detection_jobs WHERE photo_id = $1 AND workspace_id = $2",
                    photo_id,
                    workspace_id,
                )
            
            logger.info(
                "Photo queued for reprocessing",
                extra={
                    "photo_id": str(photo_id),
                    "job_id": str(row["id"]) if row else None,
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
                ON CONFLICT (photo_id) DO UPDATE SET
                    status = 'pending',
                    priority = GREATEST(face_detection_jobs.priority, $3),
                    error_message = NULL,
                    retry_count = 0
                WHERE face_detection_jobs.status = 'failed'
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
        """Check if face detection is enabled for a workspace.

        COM-001: Biometric consent must be checked FIRST. Face detection
        is blocked until explicit consent is granted in workspace settings.

        DEVELOPMENT MODE: If RAWDRIVE_BYPASS_BIOMETRIC_CONSENT=true,
        consent checks are bypassed for local development.

        Check order:
        1. Development bypass (NEVER in production!)
        2. Biometric consent (GDPR Article 9 compliance) - MUST be granted
        3. Workspace-level feature toggle
        4. Global feature toggle
        """
        try:
            # DEVELOPMENT ONLY: Bypass consent checks for testing
            # WARNING: This is NEVER safe in production!
            if BYPASS_CONSENT_CHECKS:
                logger.warning(
                    "CONSENT BYPASS ACTIVE: Face detection enabled without consent check",
                    extra={
                        "workspace_id": str(workspace_id),
                        "warning": "DEVELOPMENT MODE ONLY - NEVER USE IN PRODUCTION",
                    },
                )
                # Still check feature toggles
                value = await self.config_service.get_face_detection_setting(
                    f"workspace_{workspace_id}_enabled",
                    "true",
                )
                if value is not None:
                    return value.lower() == "true"
                return True

            # COM-001: Check biometric consent FIRST (GDPR Article 9)
            # This takes precedence over all other settings
            consent_allowed = await self.consent_service.is_face_detection_allowed(
                workspace_id
            )
            logger.info(
                "Face detection consent check",
                extra={"workspace_id": str(workspace_id), "allowed": consent_allowed},
            )
            if not consent_allowed:
                logger.debug(
                    "Face detection blocked: biometric consent not granted",
                    extra={"workspace_id": str(workspace_id)},
                )
                # Return detailed error for better UX
                raise DetectionDisabledError(
                    workspace_id=workspace_id,
                    reason="Biometric consent not granted. Please grant consent in workspace settings.",
                )

            # Check workspace-level setting
            value = await self.config_service.get_face_detection_setting(
                f"workspace_{workspace_id}_enabled",
                "true",
            )
            if value is not None:
                return value.lower() == "true"

            # Fall back to global setting
            global_value = await self.config_service.get_face_detection_setting(
                "enabled",
                "true",
            )
            if global_value is not None:
                return global_value.lower() == "true"

            # Default to enabled (if consent was granted above)
            logger.debug(
                "Face detection enabled for workspace",
                extra={"workspace_id": str(workspace_id)},
            )
            return True
        except DetectionDisabledError:
            # Re-raise with better context
            raise
        except Exception as e:
            logger.warning(
                "Error checking detection enabled status",
                extra={"workspace_id": str(workspace_id), "error": str(e)},
            )
            # Fail-closed: if we can't verify consent, block detection
            return False
    
    async def _get_min_confidence(self) -> float:
        """Get minimum confidence threshold for storing faces."""
        try:
            value = await self.config_service.get_face_detection_setting(
                "min_confidence",
                str(DEFAULT_MIN_CONFIDENCE),
            )
            return float(value) if value else DEFAULT_MIN_CONFIDENCE
        except Exception:
            return DEFAULT_MIN_CONFIDENCE
    
    async def _get_clustering_confidence_threshold(self) -> float:
        """Get confidence threshold for auto-clustering eligibility."""
        # Set to 0.6 to balance between catching real faces and filtering false positives
        DEFAULT_CLUSTERING_THRESHOLD = 0.6
        try:
            value = await self.config_service.get_face_detection_setting(
                "clustering_confidence_threshold",
                "0.6",
            )
            return float(value) if value else DEFAULT_CLUSTERING_THRESHOLD
        except Exception:
            return DEFAULT_CLUSTERING_THRESHOLD


# Singleton instance
_service: Optional[FaceDetectionService] = None


def get_face_detection_service() -> FaceDetectionService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = FaceDetectionService()
    return _service
