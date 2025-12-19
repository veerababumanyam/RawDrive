"""Deletion and recycle bin configuration.

This module provides configuration settings for the soft delete, recycle bin,
and permanent deletion features. All values can be overridden via environment
variables for flexibility across different environments.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DeletionSettings(BaseSettings):
    """Configuration for deletion and recycle bin operations.

    These settings control the behavior of soft delete, recycle bin,
    and permanent deletion workflows across the application.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Retention period (days before auto-deletion)
    retention_days: int = Field(
        30,
        alias="DELETION_RETENTION_DAYS",
        description="Days to retain items in recycle bin before auto-deletion",
        ge=1,
        le=365,
    )

    # Name confirmation threshold
    name_confirmation_threshold: int = Field(
        100,
        alias="DELETION_NAME_CONFIRM_THRESHOLD",
        description="Number of photos requiring name confirmation for gallery deletion",
        ge=0,
    )

    # R2 cleanup settings
    r2_batch_size: int = Field(
        1000,
        alias="DELETION_R2_BATCH_SIZE",
        description="Maximum objects to delete per R2 batch request",
        ge=1,
        le=1000,
    )

    r2_max_retries: int = Field(
        3,
        alias="DELETION_R2_MAX_RETRIES",
        description="Maximum retry attempts for failed R2 deletions",
        ge=1,
        le=10,
    )

    r2_retry_base_delay_ms: int = Field(
        1000,
        alias="DELETION_R2_RETRY_BASE_DELAY_MS",
        description="Base delay in milliseconds for exponential backoff",
        ge=100,
        le=10000,
    )

    r2_retry_max_delay_ms: int = Field(
        30000,
        alias="DELETION_R2_RETRY_MAX_DELAY_MS",
        description="Maximum delay in milliseconds for exponential backoff",
        ge=1000,
        le=120000,
    )

    # Cleanup worker settings
    cleanup_cron_schedule: str = Field(
        "0 2 * * *",
        alias="DELETION_CLEANUP_CRON",
        description="Cron schedule for auto-cleanup worker (default: 2 AM daily)",
    )

    cleanup_batch_size: int = Field(
        100,
        alias="DELETION_CLEANUP_BATCH_SIZE",
        description="Number of items to process per cleanup batch",
        ge=1,
        le=1000,
    )

    cleanup_max_concurrent: int = Field(
        5,
        alias="DELETION_CLEANUP_MAX_CONCURRENT",
        description="Maximum concurrent permanent deletions during cleanup",
        ge=1,
        le=20,
    )

    cleanup_enabled: bool = Field(
        True,
        alias="DELETION_CLEANUP_ENABLED",
        description="Enable/disable automatic cleanup worker",
    )

    # Lock timeout for permanent deletion
    permanent_delete_lock_timeout_sec: int = Field(
        300,
        alias="DELETION_LOCK_TIMEOUT_SEC",
        description="Timeout for permanent deletion lock in seconds",
        ge=60,
        le=3600,
    )

    # Audit log settings
    audit_log_r2_keys: bool = Field(
        True,
        alias="DELETION_AUDIT_LOG_R2_KEYS",
        description="Log deleted R2 keys in audit log (disable for very large deletions)",
    )

    max_r2_keys_to_log: int = Field(
        1000,
        alias="DELETION_MAX_R2_KEYS_LOG",
        description="Maximum R2 keys to log per operation (truncate if exceeded)",
        ge=0,
    )


@lru_cache
def get_deletion_settings() -> DeletionSettings:
    """Load and cache deletion settings.

    Returns:
        DeletionSettings: The deletion configuration instance.
    """
    return DeletionSettings()


def get_retention_cutoff_sql() -> str:
    """Get SQL fragment for retention cutoff calculation.

    Returns:
        str: SQL fragment like "NOW() - INTERVAL '30 days'"
    """
    settings = get_deletion_settings()
    return f"NOW() - INTERVAL '{settings.retention_days} days'"
