"""Face Embedding Retention Job Model.

Tracks scheduled cleanup jobs for face embedding retention policy enforcement.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-002 - Face Data Retention Policy

Task: T008
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# ENUMS
# =============================================================================


class RetentionJobType(str, Enum):
    """Type of retention cleanup job."""

    SCHEDULED_CLEANUP = "scheduled_cleanup"  # Nightly retention cleanup
    CONSENT_WITHDRAWAL = "consent_withdrawal"  # Cascade delete on consent revoke
    MANUAL_CLEANUP = "manual_cleanup"  # Admin-triggered cleanup
    GDPR_DELETION = "gdpr_deletion"  # GDPR right-to-erasure request


class RetentionJobStatus(str, Enum):
    """Status of retention cleanup job."""

    PENDING = "pending"  # Awaiting execution
    RUNNING = "running"  # Currently processing
    COMPLETED = "completed"  # Successfully finished
    FAILED = "failed"  # Execution failed
    CANCELLED = "cancelled"  # Cancelled before completion
    PAUSED = "paused"  # Temporarily paused


# =============================================================================
# FACE EMBEDDING RETENTION JOB MODEL (T008)
# =============================================================================


class FaceEmbeddingRetentionJob(BaseModel):
    """Face Embedding Retention Job Domain Model.

    Tracks face embedding cleanup jobs for retention policy enforcement.
    Supports scheduled nightly cleanup, consent withdrawal cascade,
    manual admin cleanup, and GDPR deletion requests.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary fields
    id: UUID
    workspace_id: Optional[UUID] = None  # NULL for system-wide cleanup

    # Job details
    job_type: RetentionJobType = RetentionJobType.SCHEDULED_CLEANUP
    status: RetentionJobStatus = RetentionJobStatus.PENDING

    # Execution details
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_embeddings: int = 0
    processed_embeddings: int = 0
    deleted_embeddings: int = 0
    skipped_embeddings: int = 0
    last_processed_face_id: Optional[UUID] = None
    batch_size: int = 1000

    # Retention criteria
    retention_cutoff_date: Optional[datetime] = None
    retention_days: Optional[int] = None

    # Error handling
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3

    # Audit trail
    triggered_by: Optional[UUID] = None
    trigger_reason: Optional[str] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime

    @property
    def progress_percent(self) -> float:
        """Calculate job progress percentage."""
        if self.total_embeddings == 0:
            return 0.0
        return round((self.processed_embeddings / self.total_embeddings) * 100, 2)

    @property
    def is_active(self) -> bool:
        """Check if job is currently active."""
        return self.status in (RetentionJobStatus.PENDING, RetentionJobStatus.RUNNING)

    @property
    def is_terminal(self) -> bool:
        """Check if job has reached a terminal state."""
        return self.status in (
            RetentionJobStatus.COMPLETED,
            RetentionJobStatus.FAILED,
            RetentionJobStatus.CANCELLED,
        )


class FaceEmbeddingRetentionJobCreate(BaseModel):
    """Schema for creating a retention job."""

    workspace_id: Optional[UUID] = None
    job_type: RetentionJobType = RetentionJobType.SCHEDULED_CLEANUP
    retention_cutoff_date: Optional[datetime] = None
    retention_days: Optional[int] = Field(None, ge=30, le=3650)
    batch_size: int = Field(default=1000, ge=100, le=10000)
    triggered_by: Optional[UUID] = None
    trigger_reason: Optional[str] = Field(None, max_length=500)


class FaceEmbeddingRetentionJobUpdate(BaseModel):
    """Schema for updating a retention job."""

    status: Optional[RetentionJobStatus] = None
    processed_embeddings: Optional[int] = Field(None, ge=0)
    deleted_embeddings: Optional[int] = Field(None, ge=0)
    skipped_embeddings: Optional[int] = Field(None, ge=0)
    last_processed_face_id: Optional[UUID] = None
    error_message: Optional[str] = None
    retry_count: Optional[int] = Field(None, ge=0)


class FaceEmbeddingRetentionJobSummary(BaseModel):
    """Summary view of retention job for API responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: Optional[UUID] = None
    job_type: RetentionJobType
    status: RetentionJobStatus
    total_embeddings: int
    processed_embeddings: int
    deleted_embeddings: int
    progress_percent: float
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class RetentionJobProgress(BaseModel):
    """Progress information for a running retention job."""

    job_id: UUID
    status: RetentionJobStatus
    total_embeddings: int
    processed_embeddings: int
    deleted_embeddings: int
    skipped_embeddings: int
    progress_percent: float
    estimated_remaining_seconds: Optional[int] = None


class RetentionStats(BaseModel):
    """Statistics about face embedding retention for a workspace."""

    workspace_id: UUID
    retention_days: int
    total_embeddings: int
    embeddings_within_retention: int
    embeddings_expired: int
    last_cleanup_at: Optional[datetime] = None
    next_scheduled_cleanup: Optional[datetime] = None
    pending_deletion_count: int = 0
