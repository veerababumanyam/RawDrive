"""Celery application configuration for AI Processing Service.

Configures Celery for background AI processing tasks including:
- Face detection and embedding extraction
- Batch image processing
- GPU-accelerated tasks

Feature: Face Detection and Identification
Task: T010 - Add face detection Celery worker task
"""

from celery import Celery

from config import get_settings

settings = get_settings()

# =============================================================================
# Celery Application
# =============================================================================

# Create Celery app with Redis as broker and backend
celery_app = Celery(
    "ai-processing",
    broker=str(settings.REDIS_URL),
    backend=str(settings.REDIS_URL),
    include=[
        "workers.face_detection_worker",
        "workers.embedding_worker",
    ],
)

# =============================================================================
# Celery Configuration
# =============================================================================

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task tracking
    task_track_started=True,

    # Task limits
    task_time_limit=600,  # 10 minutes max per task (AI processing can be slow)
    task_soft_time_limit=540,  # Soft limit at 9 minutes for graceful shutdown

    # Worker behavior
    worker_prefetch_multiplier=1,  # Important for GPU tasks - process one at a time
    task_acks_late=True,  # Acknowledge after completion
    task_reject_on_worker_lost=True,  # Retry if worker dies

    # Result expiration
    result_expires=86400,  # 24 hours

    # Retry policy for transient errors
    task_default_retry_delay=60,
    task_max_retries=3,
)

# =============================================================================
# Task Routing
# =============================================================================

# Route tasks to specific queues based on resource requirements
celery_app.conf.task_routes = {
    # Face detection tasks go to dedicated queue (may use GPU)
    "workers.face_detection_worker.process_face_detection": {"queue": "face_detection"},
    "workers.face_detection_worker.process_batch_face_detection": {"queue": "face_detection"},
    "workers.face_detection_worker.process_gallery_face_scan": {"queue": "face_detection"},
    # Embedding tasks go to dedicated embedding queue
    "workers.embedding_worker.compute_embedding": {"queue": "embedding"},
    "workers.embedding_worker.compute_batch_embeddings": {"queue": "embedding"},
}

# =============================================================================
# Queue Configuration
# =============================================================================

# Define queues
celery_app.conf.task_queues = {
    "face_detection": {
        "exchange": "face_detection",
        "routing_key": "face_detection",
    },
    "embedding": {
        "exchange": "embedding",
        "routing_key": "embedding",
    },
    "celery": {
        "exchange": "celery",
        "routing_key": "celery",
    },
}

# Default queue
celery_app.conf.task_default_queue = "celery"

# =============================================================================
# Module Exports
# =============================================================================

__all__ = ["celery_app"]
