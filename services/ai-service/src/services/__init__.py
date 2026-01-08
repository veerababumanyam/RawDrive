"""AI Service - Services module."""

from services.emotion_detection_service import (
    EmotionDetectionService,
    EmotionResult,
    get_emotion_service,
)

__all__ = [
    "EmotionDetectionService",
    "EmotionResult",
    "get_emotion_service",
]
