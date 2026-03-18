"""
Configuration settings for the Gallery Microservice.

Handles 50K concurrent gallery views with KEDA autoscaling.
"""

import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


def get_cors_origins() -> List[str]:
    """Get CORS origins from environment or return defaults."""
    env_value = os.getenv("CORS_ORIGINS", "")
    if env_value:
        return [origin.strip() for origin in env_value.split(",") if origin.strip()]
    return [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://rawdrive.io",
        "https://*.rawdrive.io",
    ]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",  # Ignore extra env vars
    )

    # Service
    SERVICE_NAME: str = "gallery-service"
    SERVICE_VERSION: str = "1.0.0"
    SERVICE_PORT: int = int(os.getenv("SERVICE_PORT", "8004"))
    SERVICE_HOST: str = os.getenv("SERVICE_HOST", "0.0.0.0")
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Database - Read replicas for public endpoints
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/rawdrive"
    )
    DATABASE_READ_REPLICA_URL: str = os.getenv(
        "DATABASE_READ_REPLICA_URL",
        ""  # Falls back to main if empty
    )
    DB_POOL_MIN_SIZE: int = 10
    DB_POOL_MAX_SIZE: int = 100  # High for 50K concurrent users
    DB_COMMAND_TIMEOUT: int = 60

    # PgBouncer connection pooler (for 5000+ concurrent scaling)
    # When enabled, all connections route through PgBouncer for efficient pooling
    PGBOUNCER_ENABLED: bool = os.getenv("PGBOUNCER_ENABLED", "false").lower() == "true"
    PGBOUNCER_HOST: str = os.getenv("PGBOUNCER_HOST", "pgbouncer")
    PGBOUNCER_PORT: int = int(os.getenv("PGBOUNCER_PORT", "6432"))

    # Redis - Multi-tier caching
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_MAX_CONNECTIONS: int = 50

    # JWT Authentication
    # CRITICAL: JWT_SECRET must be set in environment - no default for security
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    if not JWT_SECRET:
        raise ValueError("JWT_SECRET environment variable must be set and must be at least 32 bytes")
    JWT_PUBLIC_KEY_PATH: str = os.getenv("JWT_PUBLIC_KEY_PATH", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "EdDSA")

    # Encryption
    # CRITICAL: ENCRYPTION_MASTER_KEY must be set in environment - no default for security
    ENCRYPTION_MASTER_KEY: str = os.getenv("ENCRYPTION_MASTER_KEY", "")
    if not ENCRYPTION_MASTER_KEY:
        raise ValueError("ENCRYPTION_MASTER_KEY environment variable must be set and must be 64 hex characters")

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "1000/minute"  # High for public gallery views

    # Cache TTLs (seconds) - 3-tier caching
    CACHE_TTL_GALLERY_METADATA: int = 300      # 5 minutes - L1
    CACHE_TTL_GALLERY_ASSETS: int = 120        # 2 minutes - L2
    CACHE_TTL_PROOFING_STATE: int = 30         # 30 seconds - L3 (real-time)
    CACHE_TTL_SIGNED_URL: int = 14400          # 4 hours - R2 signed URLs (optimized for cache hits)
    CACHE_TTL_MAGIC_LINK: int = 600            # 10 minutes

    # Storage (R2)
    R2_ENDPOINT: str = os.getenv("R2_ENDPOINT", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "rawdrive")
    R2_SIGNED_URL_EXPIRY: int = 14400  # 4 hours (optimized for browser/CDN cache hits)

    # WebSocket - Real-time proofing
    WS_MAX_CONNECTIONS_PER_GALLERY: int = 1000
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MESSAGE_QUEUE_SIZE: int = 100

    # Metrics - KEDA scaling triggers
    METRICS_ENABLED: bool = True
    METRICS_CUSTOM_PREFIX: str = "gallery"

    # Security
    PIN_MAX_ATTEMPTS: int = 5
    PIN_LOCKOUT_MINUTES: int = 15
    PASSWORD_MAX_ATTEMPTS: int = 5
    PASSWORD_LOCKOUT_MINUTES: int = 30

    # Email (Postal -- self-hosted transactional email)
    POSTAL_API_URL: str = os.getenv("POSTAL_API_URL", "")
    POSTAL_API_KEY: str = os.getenv("POSTAL_API_KEY", "")
    POSTAL_SENDER_EMAIL: str = os.getenv("POSTAL_SENDER_EMAIL", "noreply@rawdrive.io")
    APP_BASE_URL: str = os.getenv("APP_BASE_URL", "https://rawdrive.io")

    # Circuit Breaker
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: int = 30
    CIRCUIT_BREAKER_EXPECTED_EXCEPTION: str = "ConnectionError"

    # AI Service Client Configuration
    # CRITICAL: 2-second timeout prevents cascading failures from slow AI service
    AI_SERVICE_URL: str = os.getenv("AI_SERVICE_URL", "http://ai-service:8013")
    AI_SERVICE_TIMEOUT_SECONDS: float = float(os.getenv("AI_SERVICE_TIMEOUT", "2.0"))
    AI_SERVICE_CONNECT_TIMEOUT: float = float(os.getenv("AI_SERVICE_CONNECT_TIMEOUT", "1.0"))

    # Exponential Backoff Configuration
    AI_SERVICE_MAX_RETRIES: int = int(os.getenv("AI_SERVICE_MAX_RETRIES", "3"))
    AI_SERVICE_BASE_DELAY: float = float(os.getenv("AI_SERVICE_BASE_DELAY", "0.1"))  # 100ms base
    AI_SERVICE_MAX_DELAY: float = float(os.getenv("AI_SERVICE_MAX_DELAY", "2.0"))    # 2s max
    AI_SERVICE_JITTER: float = float(os.getenv("AI_SERVICE_JITTER", "0.1"))          # 10% jitter

    # Fallback Configuration
    AI_SERVICE_FALLBACK_ENABLED: bool = os.getenv("AI_SERVICE_FALLBACK_ENABLED", "true").lower() == "true"

    # =========================================================================
    # AI Provider Configuration (Face Detection & Recognition)
    # =========================================================================

    # Primary AI Provider for Face Detection
    # Options: "cloud_vision", "gemini", "local"
    # - cloud_vision: Google Cloud Vision API (highest accuracy, requires API key)
    # - gemini: Google Gemini API (good accuracy, multimodal support)
    # - local: InsightFace local detection (no API required, lower accuracy)
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "cloud_vision")

    # Provider API Keys
    # Cloud Vision API Key (https://cloud.google.com/vision/docs)
    GOOGLE_CLOUD_VISION_API_KEY: str = os.getenv("GOOGLE_CLOUD_VISION_API_KEY", "")

    # Gemini API Key (https://ai.google.dev/)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Local Provider Configuration (InsightFace)
    LOCAL_FACE_DETECTION_MODEL_PATH: str = os.getenv(
        "LOCAL_FACE_DETECTION_MODEL_PATH",
        "/app/models/face_recognition"
    )
    LOCAL_FACE_DETECTION_MODEL_URL: str = os.getenv(
        "LOCAL_FACE_DETECTION_MODEL_URL",
        "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
    )
    LOCAL_FACE_DETECTION_CONFIDENCE_THRESHOLD: float = float(
        os.getenv("LOCAL_FACE_DETECTION_CONFIDENCE_THRESHOLD", "0.7")
    )

    # Face Detection Settings
    FACE_DETECTION_CONFIDENCE_THRESHOLD: float = float(
        os.getenv("FACE_DETECTION_CONFIDENCE_THRESHOLD", "0.7")
    )
    FACE_DETECTION_MIN_FACE_SIZE: int = int(
        os.getenv("FACE_DETECTION_MIN_FACE_SIZE", "40")
    )
    FACE_DETECTION_MAX_FACES_PER_IMAGE: int = int(
        os.getenv("FACE_DETECTION_MAX_FACES_PER_IMAGE", "50")
    )

    # Face Embedding Settings (ArcFace)
    FACE_EMBEDDING_DIMENSION: int = int(
        os.getenv("FACE_EMBEDDING_DIMENSION", "512")
    )
    FACE_EMBEDDING_MODEL: str = os.getenv(
        "FACE_EMBEDDING_MODEL",
        "w600k_r50.onnx"  # ArcFace model
    )

    # Face Clustering Settings
    FACE_CLUSTERING_SIMILARITY_THRESHOLD: float = float(
        os.getenv("FACE_CLUSTERING_SIMILARITY_THRESHOLD", "0.5")
    )
    FACE_CLUSTERING_MIN_CLUSTER_SIZE: int = int(
        os.getenv("FACE_CLUSTERING_MIN_CLUSTER_SIZE", "3")
    )
    FACE_CLUSTERING_ALGORITHM: str = os.getenv(
        "FACE_CLUSTERING_ALGORITHM",
        "dbscan"  # Options: dbscan, hierarchical, kmeans
    )

    # Face Detection Rate Limiting
    FACE_DETECTION_RATE_LIMIT_PER_MINUTE: int = int(
        os.getenv("FACE_DETECTION_RATE_LIMIT_PER_MINUTE", "100")
    )
    FACE_DETECTION_CONCURRENT_JOBS: int = int(
        os.getenv("FACE_DETECTION_CONCURRENT_JOBS", "5")
    )

    # Face Detection Timeout
    FACE_DETECTION_TIMEOUT_SECONDS: int = int(
        os.getenv("FACE_DETECTION_TIMEOUT_SECONDS", "120")
    )

    # Model Download Settings
    FACE_MODEL_DOWNLOAD_TIMEOUT_SECONDS: int = int(
        os.getenv("FACE_MODEL_DOWNLOAD_TIMEOUT_SECONDS", "300")
    )
    FACE_MODEL_DOWNLOAD_MAX_RETRIES: int = int(
        os.getenv("FACE_MODEL_DOWNLOAD_MAX_RETRIES", "3")
    )

    # Circuit Breaker Settings for Face Detection
    FACE_DETECTION_CIRCUIT_FAILURE_THRESHOLD: int = int(
        os.getenv("FACE_DETECTION_CIRCUIT_FAILURE_THRESHOLD", "3")
    )
    FACE_DETECTION_CIRCUIT_RECOVERY_TIMEOUT_SECONDS: int = int(
        os.getenv("FACE_DETECTION_CIRCUIT_RECOVERY_TIMEOUT_SECONDS", "60")
    )

    @property
    def CORS_ORIGINS(self) -> List[str]:
        """Get CORS origins - handled as property to avoid pydantic env parsing issues."""
        return get_cors_origins()


settings = Settings()


def get_settings() -> Settings:
    """Get application settings singleton."""
    return settings
