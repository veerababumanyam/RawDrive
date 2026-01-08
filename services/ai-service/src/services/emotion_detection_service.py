"""Emotion Detection Service for AI Microservice.

Detects emotions in photo faces using customer API keys.
Stores results in PostgreSQL (hybrid architecture: PostgreSQL + Milvus).

Emotion Types:
- joy, sadness, anger, surprise, fear, disgust, contentment

Architecture:
- PostgreSQL: Stores emotion scores (JSONB) in asset_analysis table
- Milvus: Not used for emotions (only for face embeddings)
- Cloud Vision / Gemini: AI providers for emotion detection
"""

import logging
import os
from typing import Any, Dict, List, Optional
from uuid import UUID
from datetime import datetime, timezone

import httpx
from google.cloud import vision
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

# Backend API URL for fetching user credentials
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")


class EmotionResult:
    """Emotion detection result for a photo."""

    def __init__(
        self,
        photo_id: UUID,
        faces: List[Dict[str, Any]],
        photo_emotion_summary: Dict[str, Any],
        provider: str,
        credits_used: int = 10,
    ):
        self.photo_id = photo_id
        self.faces = faces
        self.photo_emotion_summary = photo_emotion_summary
        self.provider = provider
        self.credits_used = credits_used

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format."""
        return {
            "photo_id": str(self.photo_id),
            "faces": self.faces,
            "photo_emotion_summary": self.photo_emotion_summary,
            "provider": self.provider,
            "credits_used": self.credits_used,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }


class EmotionDetectionService:
    """Service for detecting emotions in photos using customer API keys."""

    def __init__(self, db_pool):
        """Initialize emotion detection service.

        Args:
            db_pool: asyncpg connection pool for PostgreSQL
        """
        self.db_pool = db_pool

    async def _get_user_credentials(
        self, user_id: UUID, workspace_id: UUID, provider: str = "cloud_vision"
    ) -> Optional[Dict[str, Any]]:
        """Fetch decrypted user credentials from backend service.

        Args:
            user_id: User UUID
            workspace_id: Workspace UUID
            provider: AI provider name (cloud_vision, gemini)

        Returns:
            Decrypted credentials or None if not configured
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{BACKEND_URL}/api/v1/internal/ai-providers/{provider}/credentials",
                    params={
                        "user_id": str(user_id),
                        "workspace_id": str(workspace_id),
                    },
                    timeout=5.0,
                )

                if response.status_code == 404:
                    logger.warning(
                        f"No credentials found for user {user_id}, provider {provider}"
                    )
                    return None

                response.raise_for_status()
                return response.json()

        except Exception as e:
            logger.error(f"Failed to fetch user credentials: {e}")
            return None

    async def _fetch_photo_data(
        self, asset_id: UUID, workspace_id: UUID
    ) -> Optional[bytes]:
        """Fetch photo data from storage.

        Args:
            asset_id: Asset UUID
            workspace_id: Workspace UUID

        Returns:
            Photo bytes or None if not found
        """
        try:
            async with self.db_pool.acquire() as conn:
                # Get asset storage path
                row = await conn.fetchrow(
                    """
                    SELECT object_key, storage_provider
                    FROM assets
                    WHERE asset_id = $1 AND workspace_id = $2
                    """,
                    asset_id,
                    workspace_id,
                )

                if not row:
                    logger.error(f"Asset {asset_id} not found in workspace {workspace_id}")
                    return None

                object_key = row["object_key"]

                # TODO: Fetch from R2/BYOS storage
                # For now, call backend API to get photo data
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"{BACKEND_URL}/api/v1/internal/assets/{asset_id}/data",
                        params={"workspace_id": str(workspace_id)},
                        timeout=30.0,
                    )
                    response.raise_for_status()
                    return response.content

        except Exception as e:
            logger.error(f"Failed to fetch photo data: {e}")
            return None

    def _likelihood_to_score(self, likelihood: str) -> float:
        """Convert Google Vision likelihood to float score.

        Args:
            likelihood: VERY_LIKELY, LIKELY, POSSIBLE, UNLIKELY, VERY_UNLIKELY

        Returns:
            Float score between 0.0 and 1.0
        """
        mapping = {
            "VERY_LIKELY": 0.95,
            "LIKELY": 0.75,
            "POSSIBLE": 0.5,
            "UNLIKELY": 0.25,
            "VERY_UNLIKELY": 0.05,
            "UNKNOWN": 0.0,
        }
        return mapping.get(likelihood, 0.0)

    async def _detect_emotions_cloud_vision(
        self, image_bytes: bytes, credentials_json: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Detect emotions using Google Cloud Vision API.

        Args:
            image_bytes: Photo image data
            credentials_json: Service account JSON credentials

        Returns:
            List of face emotions with scores
        """
        try:
            # Create credentials from JSON
            credentials = service_account.Credentials.from_service_account_info(
                credentials_json
            )

            # Initialize Vision API client
            client = vision.ImageAnnotatorClient(credentials=credentials)

            # Create image
            image = vision.Image(content=image_bytes)

            # Detect faces with emotions
            response = client.face_detection(image=image)
            faces = response.face_annotations

            if response.error.message:
                raise Exception(f"Cloud Vision error: {response.error.message}")

            # Parse emotion results
            face_emotions = []
            for i, face in enumerate(faces):
                emotions = {
                    "joy": self._likelihood_to_score(
                        vision.Likelihood(face.joy_likelihood).name
                    ),
                    "sadness": self._likelihood_to_score(
                        vision.Likelihood(face.sorrow_likelihood).name
                    ),
                    "anger": self._likelihood_to_score(
                        vision.Likelihood(face.anger_likelihood).name
                    ),
                    "surprise": self._likelihood_to_score(
                        vision.Likelihood(face.surprise_likelihood).name
                    ),
                    "fear": 0.0,  # Cloud Vision doesn't provide fear
                    "disgust": 0.0,  # Cloud Vision doesn't provide disgust
                    "contentment": 0.0,  # Cloud Vision doesn't provide contentment
                }

                # Find dominant emotion
                dominant_emotion = max(emotions.items(), key=lambda x: x[1])

                face_emotions.append(
                    {
                        "face_index": i,
                        "emotions": emotions,
                        "dominant_emotion": dominant_emotion[0],
                        "confidence": dominant_emotion[1],
                        "bounding_box": {
                            "x": face.bounding_poly.vertices[0].x,
                            "y": face.bounding_poly.vertices[0].y,
                            "width": face.bounding_poly.vertices[2].x
                            - face.bounding_poly.vertices[0].x,
                            "height": face.bounding_poly.vertices[2].y
                            - face.bounding_poly.vertices[0].y,
                        },
                    }
                )

            return face_emotions

        except Exception as e:
            logger.error(f"Cloud Vision emotion detection failed: {e}")
            raise

    def _calculate_photo_emotion_summary(
        self, face_emotions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Calculate photo-level emotion summary from face emotions.

        Args:
            face_emotions: List of per-face emotion results

        Returns:
            Photo-level emotion summary
        """
        if not face_emotions:
            return {
                "dominant_emotion": None,
                "average_confidence": 0.0,
                "emotion_distribution": {},
                "face_count": 0,
            }

        # Aggregate emotions across all faces
        emotion_sums = {
            "joy": 0.0,
            "sadness": 0.0,
            "anger": 0.0,
            "surprise": 0.0,
            "fear": 0.0,
            "disgust": 0.0,
            "contentment": 0.0,
        }

        confidence_sum = 0.0

        for face in face_emotions:
            for emotion, score in face["emotions"].items():
                emotion_sums[emotion] += score
            confidence_sum += face["confidence"]

        # Calculate averages
        face_count = len(face_emotions)
        emotion_averages = {
            emotion: score / face_count for emotion, score in emotion_sums.items()
        }

        # Find dominant emotion
        dominant_emotion = max(emotion_averages.items(), key=lambda x: x[1])

        return {
            "dominant_emotion": dominant_emotion[0],
            "average_confidence": confidence_sum / face_count,
            "emotion_distribution": emotion_averages,
            "face_count": face_count,
        }

    async def detect_emotions(
        self,
        photo_id: UUID,
        user_id: UUID,
        workspace_id: UUID,
        provider: str = "cloud_vision",
    ) -> EmotionResult:
        """Detect emotions in a photo using customer API keys.

        Args:
            photo_id: Photo UUID
            user_id: User UUID (for fetching credentials)
            workspace_id: Workspace UUID
            provider: AI provider (cloud_vision or gemini)

        Returns:
            EmotionResult with face-level and photo-level emotions

        Raises:
            ValueError: If credentials not configured
            Exception: If emotion detection fails
        """
        # 1. Get user's AI provider credentials
        credentials = await self._get_user_credentials(user_id, workspace_id, provider)

        if not credentials:
            raise ValueError(
                f"No {provider} credentials configured for user {user_id}. "
                "Please configure API credentials in AI Provider Settings."
            )

        # 2. Fetch photo data
        image_bytes = await self._fetch_photo_data(photo_id, workspace_id)

        if not image_bytes:
            raise ValueError(f"Photo {photo_id} not found or inaccessible")

        # 3. Detect emotions using provider
        if provider == "cloud_vision":
            if "service_account_json" not in credentials:
                raise ValueError("Cloud Vision requires service account JSON credentials")

            face_emotions = await self._detect_emotions_cloud_vision(
                image_bytes, credentials["service_account_json"]
            )
        else:
            raise ValueError(f"Unsupported provider: {provider}")

        # 4. Calculate photo-level emotion summary
        photo_summary = self._calculate_photo_emotion_summary(face_emotions)

        # 5. Store results in PostgreSQL
        await self._store_emotion_results(photo_id, workspace_id, face_emotions, photo_summary)

        # 6. Track credit usage (call backend API)
        await self._track_credit_usage(user_id, workspace_id, provider, credits=10)

        return EmotionResult(
            photo_id=photo_id,
            faces=face_emotions,
            photo_emotion_summary=photo_summary,
            provider=provider,
            credits_used=10,
        )

    async def _store_emotion_results(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        face_emotions: List[Dict[str, Any]],
        photo_summary: Dict[str, Any],
    ) -> None:
        """Store emotion detection results in PostgreSQL.

        Args:
            asset_id: Asset UUID
            workspace_id: Workspace UUID
            face_emotions: Per-face emotion results
            photo_summary: Photo-level emotion summary
        """
        try:
            async with self.db_pool.acquire() as conn:
                # Update asset_analysis table with photo-level emotions
                await conn.execute(
                    """
                    INSERT INTO asset_analysis (
                        asset_id, workspace_id,
                        emotions, dominant_emotion, emotion_confidence,
                        analyzed_at
                    )
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (asset_id)
                    DO UPDATE SET
                        emotions = EXCLUDED.emotions,
                        dominant_emotion = EXCLUDED.dominant_emotion,
                        emotion_confidence = EXCLUDED.emotion_confidence,
                        analyzed_at = NOW()
                    """,
                    asset_id,
                    workspace_id,
                    photo_summary["emotion_distribution"],
                    photo_summary["dominant_emotion"],
                    photo_summary["average_confidence"],
                )

                logger.info(f"Stored emotion results for asset {asset_id}")

        except Exception as e:
            logger.error(f"Failed to store emotion results: {e}")
            raise

    async def _track_credit_usage(
        self, user_id: UUID, workspace_id: UUID, provider: str, credits: int
    ) -> None:
        """Track AI credit usage by calling backend API.

        Args:
            user_id: User UUID
            workspace_id: Workspace UUID
            provider: AI provider
            credits: Number of credits used
        """
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{BACKEND_URL}/api/v1/internal/ai-providers/{provider}/credits",
                    json={
                        "user_id": str(user_id),
                        "workspace_id": str(workspace_id),
                        "credits_used": credits,
                        "operation": "emotion_detection",
                    },
                    timeout=5.0,
                )

        except Exception as e:
            logger.warning(f"Failed to track credit usage: {e}")
            # Don't fail the operation if credit tracking fails


# Singleton instance
_emotion_service: Optional[EmotionDetectionService] = None


def get_emotion_service(db_pool) -> EmotionDetectionService:
    """Get singleton emotion detection service instance."""
    global _emotion_service
    if _emotion_service is None:
        _emotion_service = EmotionDetectionService(db_pool)
    return _emotion_service
