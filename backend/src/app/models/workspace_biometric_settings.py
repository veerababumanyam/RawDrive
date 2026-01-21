"""Workspace Biometric Settings Models.

GDPR Article 9 compliant biometric consent tracking for face detection processing.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-001 - Biometric Consent Management
Finding: SEC-001 - Rate Limiting for Face Operations

Tasks: T006, T007
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# ENUMS
# =============================================================================


class BiometricConsentStatus(str, Enum):
    """Consent status for biometric data processing."""

    NOT_GRANTED = "not_granted"  # No consent given
    GRANTED = "granted"  # Active consent
    WITHDRAWN = "withdrawn"  # Consent revoked
    PENDING_DELETION = "pending_deletion"  # Awaiting cascade delete


# =============================================================================
# WORKSPACE BIOMETRIC SETTINGS MODEL (T006)
# =============================================================================


class WorkspaceBiometricSettings(BaseModel):
    """Workspace Biometric Settings Domain Model.

    Tracks GDPR Article 9 compliant consent for biometric data processing.
    Controls face detection feature access at the workspace level.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary fields
    id: UUID
    workspace_id: UUID

    # Consent status
    face_detection_enabled: bool = False
    consent_status: BiometricConsentStatus = BiometricConsentStatus.NOT_GRANTED

    # Consent audit trail
    consented_by: Optional[UUID] = None
    consented_at: Optional[datetime] = None
    consent_ip_address: Optional[str] = None
    consent_user_agent: Optional[str] = None
    consent_policy_version: Optional[str] = None

    # Withdrawal tracking
    withdrawn_by: Optional[UUID] = None
    withdrawn_at: Optional[datetime] = None
    withdrawal_ip_address: Optional[str] = None
    withdrawal_reason: Optional[str] = None

    # Feature toggles
    public_face_search_enabled: bool = False
    auto_clustering_enabled: bool = True
    ai_processing_consent: bool = False

    # Timestamps
    created_at: datetime
    updated_at: datetime


class WorkspaceBiometricSettingsCreate(BaseModel):
    """Schema for creating workspace biometric settings."""

    workspace_id: UUID
    face_detection_enabled: bool = False
    consent_status: BiometricConsentStatus = BiometricConsentStatus.NOT_GRANTED
    public_face_search_enabled: bool = False
    auto_clustering_enabled: bool = True
    ai_processing_consent: bool = False


class WorkspaceBiometricSettingsUpdate(BaseModel):
    """Schema for updating workspace biometric settings."""

    face_detection_enabled: Optional[bool] = None
    public_face_search_enabled: Optional[bool] = None
    auto_clustering_enabled: Optional[bool] = None
    ai_processing_consent: Optional[bool] = None


class BiometricConsentGrant(BaseModel):
    """Schema for granting biometric consent."""

    policy_version: str = Field(..., min_length=1, max_length=20)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class BiometricConsentWithdraw(BaseModel):
    """Schema for withdrawing biometric consent."""

    reason: Optional[str] = Field(None, max_length=1000)
    ip_address: Optional[str] = None


class WorkspaceBiometricSettingsSummary(BaseModel):
    """Summary view of biometric settings for API responses."""

    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    face_detection_enabled: bool
    consent_status: BiometricConsentStatus
    consented_at: Optional[datetime] = None
    public_face_search_enabled: bool
    auto_clustering_enabled: bool


# =============================================================================
# FACE RATE LIMIT CONFIG MODEL (T007)
# =============================================================================


class FaceRateLimitConfig(BaseModel):
    """Face Rate Limit Configuration Model.

    Per-workspace rate limit settings for face operations.
    Protects system resources and controls AI provider costs.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary fields
    id: UUID
    workspace_id: UUID

    # Rate limit thresholds
    face_search_rpm: int = Field(default=20, ge=1, le=1000)
    face_detection_daily_quota: int = Field(default=1000, ge=0, le=100000)
    bulk_operations_rpm: int = Field(default=30, ge=1, le=100)
    group_merge_rpm: int = Field(default=10, ge=1, le=50)

    # Current usage tracking
    current_daily_detections: int = 0
    daily_quota_reset_at: Optional[datetime] = None

    # Override flags
    is_unlimited: bool = False
    rate_limit_multiplier: Decimal = Field(default=Decimal("1.0"), ge=Decimal("0.1"), le=Decimal("10.0"))

    # Timestamps
    created_at: datetime
    updated_at: datetime


class FaceRateLimitConfigCreate(BaseModel):
    """Schema for creating face rate limit config."""

    workspace_id: UUID
    face_search_rpm: int = Field(default=20, ge=1, le=1000)
    face_detection_daily_quota: int = Field(default=1000, ge=0, le=100000)
    bulk_operations_rpm: int = Field(default=30, ge=1, le=100)
    group_merge_rpm: int = Field(default=10, ge=1, le=50)
    is_unlimited: bool = False
    rate_limit_multiplier: Decimal = Field(default=Decimal("1.0"), ge=Decimal("0.1"), le=Decimal("10.0"))


class FaceRateLimitConfigUpdate(BaseModel):
    """Schema for updating face rate limit config."""

    face_search_rpm: Optional[int] = Field(None, ge=1, le=1000)
    face_detection_daily_quota: Optional[int] = Field(None, ge=0, le=100000)
    bulk_operations_rpm: Optional[int] = Field(None, ge=1, le=100)
    group_merge_rpm: Optional[int] = Field(None, ge=1, le=50)
    is_unlimited: Optional[bool] = None
    rate_limit_multiplier: Optional[Decimal] = Field(None, ge=Decimal("0.1"), le=Decimal("10.0"))


class FaceRateLimitUsage(BaseModel):
    """Current rate limit usage for a workspace."""

    workspace_id: UUID
    face_search_rpm_limit: int
    face_detection_daily_quota: int
    current_daily_detections: int
    daily_quota_remaining: int
    daily_quota_reset_at: Optional[datetime] = None
    is_unlimited: bool = False


class FaceRateLimitConfigSummary(BaseModel):
    """Summary view of rate limit config for API responses."""

    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    face_search_rpm: int
    face_detection_daily_quota: int
    bulk_operations_rpm: int
    is_unlimited: bool
