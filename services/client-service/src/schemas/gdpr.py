"""
GDPR schemas for data export and consent management.

Implements GDPR Article 15 (Right to Access) and Article 20 (Data Portability)
response schemas in machine-readable format.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, UUID4


# =============================================================================
# GDPR Data Export Schemas
# =============================================================================


class ExportMetadata(BaseModel):
    """Metadata for GDPR data export."""

    date: datetime = Field(..., description="Export generation timestamp")
    version: str = Field(..., description="Export format version")
    client_id: UUID4 = Field(..., description="Client ID being exported")
    workspace_id: UUID4 = Field(..., description="Workspace ID")
    export_type: str = Field(default="gdpr_article_15", description="Export type")


class ProfileData(BaseModel):
    """Client profile data for export."""

    client_id: UUID4
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nickname: Optional[str] = None
    job_title: Optional[str] = None
    organization: Optional[str] = None
    status: str
    language: Optional[str] = None
    timezone: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    anniversary_date: Optional[datetime] = None
    internal_notes: Optional[str] = None
    portal_access_enabled: bool
    consent_marketing: bool
    consent_analytics: bool
    consent_date: Optional[datetime] = None
    consent_ip_address: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    deleted: Optional[bool] = None
    deleted_at: Optional[datetime] = None
    retention_expires_at: Optional[datetime] = None


class ContactData(BaseModel):
    """Contact information for export."""

    contact_id: UUID4
    contact_type: str  # email, phone, etc.
    value: str
    is_primary: bool
    label: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AddressData(BaseModel):
    """Address information for export."""

    address_id: UUID4
    address_type: str  # home, work, billing, etc.
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: str
    is_primary: bool
    created_at: datetime
    updated_at: datetime


class ActivityData(BaseModel):
    """Activity history for export."""

    activity_id: UUID4
    activity_type: str
    title: str
    description: Optional[str] = None
    activity_date: datetime
    created_by_user_id: Optional[UUID4] = None
    created_at: datetime


class CommunicationData(BaseModel):
    """Communication history for export."""

    communication_id: UUID4
    communication_type: str  # email, sms, call, etc.
    direction: str  # inbound, outbound
    subject: Optional[str] = None
    body: Optional[str] = None
    sent_at: datetime
    created_by_user_id: Optional[UUID4] = None
    created_at: datetime


class GalleryLinkData(BaseModel):
    """Gallery access records for export."""

    link_id: UUID4
    gallery_id: UUID4
    access_type: str  # view, download, etc.
    can_download: bool
    access_expires_at: Optional[datetime] = None
    created_at: datetime


class VisitorData(BaseModel):
    """Visitor conversion records for export."""

    visitor_id: UUID4
    converted_at: datetime
    visitor_data: Optional[Dict[str, Any]] = None
    created_at: datetime


class GalleryInteractions(BaseModel):
    """Gallery interaction data for export."""

    gallery_links: List[GalleryLinkData] = []
    visitor_records: List[VisitorData] = []


class ConsentRecords(BaseModel):
    """Consent tracking records for export."""

    marketing_consent: bool
    analytics_consent: bool
    consent_date: Optional[datetime] = None
    consent_ip_address: Optional[str] = None


class GDPRDataExportResponse(BaseModel):
    """
    Complete GDPR data export response.

    GDPR Article 15: Right to Access
    GDPR Article 20: Right to Data Portability
    """

    export_metadata: ExportMetadata
    profile: Optional[ProfileData] = None
    contacts: List[ContactData] = []
    addresses: List[AddressData] = []
    activities: List[ActivityData] = []
    communications: List[CommunicationData] = []
    gallery_interactions: GalleryInteractions
    consent_records: ConsentRecords


# =============================================================================
# Consent Update Schemas
# =============================================================================


class ConsentUpdateRequest(BaseModel):
    """Request to update client consent preferences."""

    consent_marketing: Optional[bool] = Field(
        None,
        description="Consent for marketing communications",
    )
    consent_analytics: Optional[bool] = Field(
        None,
        description="Consent for analytics and tracking",
    )


class ConsentUpdateResponse(BaseModel):
    """Response after updating consent preferences."""

    client_id: UUID4
    consent_marketing: bool
    consent_analytics: bool
    consent_date: datetime
    consent_ip_address: Optional[str] = None
    message: str = Field(default="Consent preferences updated successfully")


# =============================================================================
# Deletion Request Schemas (GDPR Article 17 - Right to Erasure)
# =============================================================================


class DeletionRequest(BaseModel):
    """Request to delete client data (soft delete with retention)."""

    retention_days: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Days to retain data before permanent deletion (1-365)",
    )
    reason: Optional[str] = Field(
        None,
        description="Reason for deletion request (optional)",
    )


class DeletionResponse(BaseModel):
    """Response after soft delete request."""

    client_id: UUID4
    deleted: bool
    deleted_at: datetime
    retention_expires_at: datetime
    message: str = Field(
        default="Client data marked for deletion. Will be permanently deleted after retention period."
    )


class RestoreRequest(BaseModel):
    """Request to restore soft-deleted client."""

    pass  # No additional fields needed


class RestoreResponse(BaseModel):
    """Response after restore request."""

    client_id: UUID4
    restored: bool
    message: str = Field(default="Client data restored successfully")
