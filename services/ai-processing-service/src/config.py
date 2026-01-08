"""Configuration module for AI Processing Service.

Loads environment variables and provides typed settings for all service components.
"""

from __future__ import annotations

import os
from enum import Enum
from typing import Optional

from pydantic import Field, PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """Deployment environment."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TEST = "test"


class AIProvider(str, Enum):
    """AI service providers."""

    GOOGLE_VISION = "google_vision"
    GOOGLE_GEMINI = "google_gemini"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class Settings(BaseSettings):
    """AI Processing Service configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ==========================================================================
    # Service Configuration
    # ==========================================================================
    SERVICE_NAME: str = Field(default="ai-processing-service")
    ENVIRONMENT: Environment = Field(default=Environment.DEVELOPMENT)
    DEBUG: bool = Field(default=False)
    LOG_LEVEL: str = Field(default="INFO")

    # API Server
    API_HOST: str = Field(default="0.0.0.0")
    API_PORT: int = Field(default=8012)
    RELOAD: bool = Field(default=False)

    # ==========================================================================
    # Database Configuration (PostgreSQL 16 + pgvector)
    # ==========================================================================
    DATABASE_URL: PostgresDsn = Field(
        default="postgresql+asyncpg://rawdrive:rawdrive@localhost:5432/rawdrive"
    )
    DATABASE_POOL_SIZE: int = Field(default=20)
    DATABASE_MAX_OVERFLOW: int = Field(default=10)
    DATABASE_POOL_TIMEOUT: int = Field(default=30)
    
    # ==========================================================================
    # Milvus Configuration (Vector Database)
    # ==========================================================================
    MILVUS_ENABLED: bool = Field(default=True)
    MILVUS_HOST: str = Field(default="localhost")
    MILVUS_PORT: int = Field(default=19530)
    MILVUS_USER: str = Field(default="")
    MILVUS_PASSWORD: str = Field(default="")

    # Milvus Collections
    MILVUS_COLLECTION_ASSET: str = Field(default="asset_embeddings")
    MILVUS_COLLECTION_FACE: str = Field(default="face_embeddings")
    MILVUS_INIT_FACE_COLLECTION: bool = Field(default=False)

    # Milvus Index Parameters (HNSW)
    MILVUS_METRIC_TYPE: str = Field(default="COSINE")
    MILVUS_HNSW_M: int = Field(default=16, description="HNSW M parameter")
    MILVUS_HNSW_EF_CONSTRUCTION: int = Field(default=200, description="HNSW efConstruction")
    MILVUS_HNSW_EF_SEARCH: int = Field(default=100, description="HNSW ef for search")

    # ==========================================================================
    # Redis Configuration
    # ==========================================================================
    REDIS_URL: RedisDsn = Field(default="redis://localhost:6379/0")
    REDIS_MAX_CONNECTIONS: int = Field(default=50)
    REDIS_SOCKET_TIMEOUT: float = Field(default=5.0)
    REDIS_SOCKET_CONNECT_TIMEOUT: float = Field(default=5.0)

    # ==========================================================================
    # Kafka Configuration
    # ==========================================================================
    KAFKA_BOOTSTRAP_SERVERS: str = Field(default="localhost:9092")
    KAFKA_CONSUMER_GROUP: str = Field(default="ai-processing-consumer")
    KAFKA_DUPLICATE_CONSUMER_GROUP: str = Field(default="duplicate-detection-consumer")
    KAFKA_MODERATION_CONSUMER_GROUP: str = Field(default="content-moderation-consumer")
    KAFKA_AUTO_OFFSET_RESET: str = Field(default="earliest")
    KAFKA_MAX_POLL_RECORDS: int = Field(default=500)

    # Kafka Topics
    KAFKA_TOPIC_AI_PROCESSING: str = Field(default="asset-ai-processing")
    KAFKA_TOPIC_AI_RESULTS: str = Field(default="asset-ai-results")
    KAFKA_TOPIC_MODERATION: str = Field(default="asset-moderation")
    KAFKA_TOPIC_DUPLICATES: str = Field(default="asset-duplicates")

    # ==========================================================================
    # AI Provider Configuration
    # ==========================================================================
    AI_PROVIDER: AIProvider = Field(default=AIProvider.GOOGLE_VISION)

    # Google Cloud AI
    GOOGLE_CLOUD_PROJECT: Optional[str] = Field(default=None)
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = Field(default=None)
    GOOGLE_VISION_API_KEY: Optional[str] = Field(default=None)
    GOOGLE_GEMINI_API_KEY: Optional[str] = Field(default=None)
    GEMINI_MODEL_NAME: str = Field(default="gemini-1.5-flash")
    GEMINI_SECOND_OPINION_ENABLED: bool = Field(
        default=True, description="Enable Gemini second opinion for flagged content"
    )

    # Anthropic (for MCP tools)
    ANTHROPIC_API_KEY: Optional[str] = Field(default=None)

    # OpenAI (CLIP embeddings fallback)
    OPENAI_API_KEY: Optional[str] = Field(default=None)

    # ==========================================================================
    # AI Processing Configuration
    # ==========================================================================

    # Duplicate Detection
    DUPLICATE_PHASH_THRESHOLD: int = Field(
        default=10, description="Hamming distance threshold for perceptual hash"
    )
    DUPLICATE_CLIP_THRESHOLD: float = Field(
        default=0.95, description="Cosine similarity threshold for CLIP embeddings"
    )
    CLIP_MODEL_NAME: str = Field(default="openai/clip-vit-base-patch32")

    # Content Moderation
    MODERATION_POLICY: str = Field(
        default="standard", description="Moderation policy: standard, strict, custom"
    )
    MODERATION_ADULT_THRESHOLD: str = Field(default="POSSIBLE")
    MODERATION_VIOLENCE_THRESHOLD: str = Field(default="LIKELY")
    MODERATION_RACY_THRESHOLD: str = Field(default="VERY_LIKELY")

    # Image Upscaling
    UPSCALE_MODEL: str = Field(
        default="RealESRGAN_x4plus", description="Upscaling model name"
    )
    UPSCALE_DEFAULT_FACTOR: int = Field(default=2, ge=1, le=4)
    UPSCALE_GPU_ENABLED: bool = Field(default=False)
    UPSCALE_GPU_DEVICE: str = Field(default="cuda")
    UPSCALE_GPU_MEMORY_FRACTION: float = Field(default=0.9, ge=0.1, le=1.0)

    # AI Tagging
    AI_TAGGING_ENABLED: bool = Field(default=True)
    AI_TAGGING_MIN_CONFIDENCE: float = Field(default=0.7)

    # ==========================================================================
    # Google A2A Configuration
    # ==========================================================================
    A2A_ENABLED: bool = Field(default=True)
    A2A_UPLOAD_AGENT_ID: str = Field(default="upload-agent")
    A2A_GALLERY_AGENT_ID: str = Field(default="gallery-agent")
    A2A_STORAGE_AGENT_ID: str = Field(default="storage-agent")

    # ==========================================================================
    # MCP Configuration (Upload Monitoring)
    # ==========================================================================
    MCP_ENABLED: bool = Field(default=True)
    MCP_SERVER_NAME: str = Field(default="RawDrive AI Processing")
    MCP_TOOLS_ENABLED: list[str] = Field(
        default=[
            "get_upload_status",
            "list_recent_uploads",
            "get_upload_metrics",
            "get_ai_processing_status",
        ]
    )

    # ==========================================================================
    # Worker Configuration
    # ==========================================================================

    # CPU Workers (duplicate detection, moderation, tagging)
    CPU_WORKERS: int = Field(default=4, description="Number of CPU worker processes")
    CPU_WORKER_BATCH_SIZE: int = Field(default=10)
    CPU_WORKER_TIMEOUT: int = Field(default=300)

    # GPU Workers (upscaling)
    GPU_WORKERS: int = Field(default=1, description="Number of GPU worker processes")
    GPU_WORKER_BATCH_SIZE: int = Field(default=5)
    GPU_WORKER_TIMEOUT: int = Field(default=600)

    # ==========================================================================
    # Queue Configuration
    # ==========================================================================
    QUEUE_DUPLICATE_DETECTION: str = Field(default="duplicate_detection_queue")
    QUEUE_CONTENT_MODERATION: str = Field(default="content_moderation_queue")
    QUEUE_AI_TAGGING: str = Field(default="ai_tagging_queue")
    QUEUE_GPU_UPSCALE: str = Field(default="gpu_upscale_queue")

    # ==========================================================================
    # Storage Configuration (R2)
    # ==========================================================================
    R2_ENDPOINT_URL: str = Field(default="https://account.r2.cloudflarestorage.com")
    R2_ACCESS_KEY_ID: Optional[str] = Field(default=None)
    R2_SECRET_ACCESS_KEY: Optional[str] = Field(default=None)
    R2_BUCKET_NAME: str = Field(default="rawdrive-assets")

    # ==========================================================================
    # Security Configuration
    # ==========================================================================
    JWT_SECRET: str = Field(
        default="development-secret-key-change-in-production-must-be-64-bytes-long"
    )
    JWT_ALGORITHM: str = Field(default="HS256")
    JWT_PUBLIC_KEY_PATH: Optional[str] = Field(default=None)

    # ==========================================================================
    # Observability Configuration
    # ==========================================================================
    METRICS_ENABLED: bool = Field(default=True)
    TRACING_ENABLED: bool = Field(default=False)
    TRACING_ENDPOINT: Optional[str] = Field(default=None)

    # Prometheus
    PROMETHEUS_PORT: int = Field(default=9091)
    PROMETHEUS_METRICS_PATH: str = Field(default="/metrics")

    # ==========================================================================
    # Validators
    # ==========================================================================

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def validate_environment(cls, v: str) -> Environment:
        """Validate and convert environment string to enum."""
        if isinstance(v, Environment):
            return v
        return Environment(v.lower())

    @field_validator("AI_PROVIDER", mode="before")
    @classmethod
    def validate_ai_provider(cls, v: str) -> AIProvider:
        """Validate and convert AI provider string to enum."""
        if isinstance(v, AIProvider):
            return v
        return AIProvider(v.lower())

    # ==========================================================================
    # Helper Methods
    # ==========================================================================

    # Database connection pool settings (used by asyncpg directly)
    DB_POOL_MIN_SIZE: int = Field(default=5)
    DB_POOL_MAX_SIZE: int = Field(default=20)
    DB_COMMAND_TIMEOUT: int = Field(default=60)

    @property
    def DATABASE_HOST(self) -> str:
        """Extract database host from DATABASE_URL."""
        from urllib.parse import urlparse
        url_str = str(self.DATABASE_URL).replace("+asyncpg", "")
        parsed = urlparse(url_str)
        return parsed.hostname or "localhost"

    @property
    def DATABASE_PORT(self) -> int:
        """Extract database port from DATABASE_URL."""
        from urllib.parse import urlparse
        url_str = str(self.DATABASE_URL).replace("+asyncpg", "")
        parsed = urlparse(url_str)
        return parsed.port or 5432

    @property
    def DATABASE_NAME(self) -> str:
        """Extract database name from DATABASE_URL."""
        from urllib.parse import urlparse
        url_str = str(self.DATABASE_URL).replace("+asyncpg", "")
        parsed = urlparse(url_str)
        path = parsed.path
        return path.lstrip("/") if path else "rawdrive"

    @property
    def DATABASE_USER(self) -> str:
        """Extract database user from DATABASE_URL."""
        from urllib.parse import urlparse
        url_str = str(self.DATABASE_URL).replace("+asyncpg", "")
        parsed = urlparse(url_str)
        return parsed.username or "rawdrive"

    @property
    def DATABASE_PASSWORD(self) -> str:
        """Extract database password from DATABASE_URL."""
        from urllib.parse import urlparse
        url_str = str(self.DATABASE_URL).replace("+asyncpg", "")
        parsed = urlparse(url_str)
        return parsed.password or ""

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.ENVIRONMENT == Environment.PRODUCTION

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.ENVIRONMENT == Environment.DEVELOPMENT

    @property
    def is_test(self) -> bool:
        """Check if running in test mode."""
        return self.ENVIRONMENT == Environment.TEST or bool(
            os.getenv("PYTEST_CURRENT_TEST")
        )

    @property
    def kafka_bootstrap_servers_list(self) -> list[str]:
        """Get Kafka bootstrap servers as list."""
        return [s.strip() for s in self.KAFKA_BOOTSTRAP_SERVERS.split(",")]


# Global settings instance
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get or create global settings instance.

    Returns:
        Settings: The application settings.

    Example:
        from config import get_settings

        settings = get_settings()
        print(settings.SERVICE_NAME)
    """
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# Export commonly used settings
__all__ = [
    "Settings",
    "Environment",
    "AIProvider",
    "get_settings",
]
