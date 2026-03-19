"""
Client Service Configuration.

Environment-based configuration using Pydantic Settings.
All settings are loaded from environment variables with sensible defaults.
"""

from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Client service configuration from environment variables."""

    # ==========================================================================
    # Service Metadata
    # ==========================================================================
    SERVICE_NAME: str = "client-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ==========================================================================
    # Database Configuration (Shared PostgreSQL)
    # ==========================================================================
    DATABASE_URL: str
    DATABASE_READ_REPLICA_URL: str = ""  # Optional read replica for read-heavy endpoints
    DB_POOL_MIN_SIZE: int = 10
    DB_POOL_MAX_SIZE: int = 50  # Client service: moderate concurrency
    DB_COMMAND_TIMEOUT: int = 60  # seconds
    DB_STATEMENT_CACHE_SIZE: int = 0  # Disable for PgBouncer compatibility

    # PgBouncer connection pooler (for 5000+ concurrent scaling)
    # When enabled, all connections route through PgBouncer for efficient pooling
    PGBOUNCER_ENABLED: bool = False
    PGBOUNCER_HOST: str = "pgbouncer"
    PGBOUNCER_PORT: int = 6432

    # ==========================================================================
    # Redis Configuration (Shared Cache)
    # ==========================================================================
    REDIS_URL: str
    REDIS_MAX_CONNECTIONS: int = 30
    REDIS_SOCKET_TIMEOUT: int = 5  # seconds
    REDIS_SOCKET_CONNECT_TIMEOUT: int = 5  # seconds

    # ==========================================================================
    # JWT Authentication (MUST match other services)
    # ==========================================================================
    # Backend uses EdDSA (Ed25519) with asymmetric keys
    # Client-service only needs public key for token verification
    JWT_PUBLIC_KEY_PATH: str = "/run/secrets/jwt_public_key"
    JWT_ALGORITHM: str = "EdDSA"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ==========================================================================
    # Rate Limiting
    # ==========================================================================
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_STORAGE_URL: str = ""  # Defaults to REDIS_URL

    # ==========================================================================
    # Cache TTLs (3-Tier Caching Strategy)
    # ==========================================================================
    # L1: Metadata (long TTL for stable data)
    CACHE_TTL_CLIENT_METADATA: int = 300  # 5 min - basic profile, tags, counts
    CACHE_TTL_TAGS: int = 600  # 10 min - workspace tags rarely change

    # L2: Details (medium TTL for frequently accessed data)
    CACHE_TTL_CLIENT_DETAILS: int = 120  # 2 min - full profile with relationships
    CACHE_TTL_GALLERY_LINKS: int = 180  # 3 min - client-gallery associations

    # L3: Real-time (short TTL for dynamic data)
    CACHE_TTL_ACTIVITY_TIMELINE: int = 30  # 30 sec - activity timeline
    CACHE_TTL_COMMUNICATIONS: int = 60  # 1 min - communication history
    CACHE_TTL_SMART_LIST_RESULTS: int = 180  # 3 min - smart list evaluation

    # List views (medium TTL)
    CACHE_TTL_CLIENT_LIST: int = 120  # 2 min - paginated client lists

    # ==========================================================================
    # CORS Configuration
    # ==========================================================================
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:8080",
        "https://rawdrive.io",
        "https://www.rawdrive.io",
        "https://*.rawdrive.ai",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]

    # ==========================================================================
    # Pagination Defaults
    # ==========================================================================
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # ==========================================================================
    # Import/Export Configuration
    # ==========================================================================
    MAX_IMPORT_FILE_SIZE_MB: int = 10
    MAX_IMPORT_ROWS: int = 10000
    EXPORT_BATCH_SIZE: int = 1000

    # ==========================================================================
    # File Upload Configuration (Avatars)
    # ==========================================================================
    MAX_AVATAR_FILE_SIZE_MB: int = 5
    ALLOWED_AVATAR_EXTENSIONS: List[str] = [".jpg", ".jpeg", ".png", ".webp"]
    AVATAR_SIZES: List[int] = [64, 128, 256]  # Generate multiple sizes

    # ==========================================================================
    # GDPR Compliance
    # ==========================================================================
    # Data retention period for soft-deleted clients (GDPR Article 17)
    GDPR_RETENTION_DAYS: int = 30
    # Maximum clients to export in single GDPR data export request
    GDPR_MAX_EXPORT_CLIENTS: int = 10000

    # ==========================================================================
    # SOC2 Compliance
    # ==========================================================================
    # Enable comprehensive audit logging for all CRUD operations (SOC2 CC6.3)
    AUDIT_LOG_ENABLED: bool = True
    # Audit log retention period in days (SOC2 CC6.7 - 7 years = 2555 days)
    AUDIT_LOG_RETENTION_DAYS: int = 2555
    # Log IP addresses and user agents for security monitoring (SOC2 CC7.2)
    AUDIT_LOG_IP_TRACKING: bool = True

    # ==========================================================================
    # Observability
    # ==========================================================================
    METRICS_ENABLED: bool = True
    METRICS_CUSTOM_PREFIX: str = "client"
    HEALTH_CHECK_TIMEOUT_SECONDS: int = 5

    # ==========================================================================
    # Feature Flags
    # ==========================================================================
    ENABLE_SMART_LISTS: bool = True
    ENABLE_DUPLICATE_DETECTION: bool = True
    ENABLE_VISITOR_CONVERSION: bool = True
    ENABLE_ANALYTICS: bool = True

    class Config:
        """Pydantic configuration."""

        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """
    Get the settings instance.

    Used as a FastAPI dependency for dependency injection.
    Returns the global settings instance.
    """
    return settings
