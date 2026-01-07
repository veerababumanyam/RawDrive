"""Pydantic schemas for the notifications microservice.

This module exports all schema classes for:
- Notification events and delivery
- User notification preferences
- Notification templates

Feature: Notifications & Communication Microservice
"""

from src.schemas.notification import (
    # Enums
    NotificationChannel,
    NotificationCategory,
    NotificationPriority,
    NotificationEventStatus,
    NotificationDeliveryStatus,
    NotificationProvider,
    # Common schemas
    PaginationMeta,
    ErrorResponse,
    SuccessResponse,
    # Request schemas
    NotificationRecipient,
    NotificationCreateRequest,
    NotificationBatchCreateRequest,
    NotificationCancelRequest,
    NotificationRetryRequest,
    # Response schemas
    NotificationEventResponse,
    NotificationEventSummary,
    NotificationListResponse,
    NotificationBatchCreateResponse,
    # Delivery log schemas
    DeliveryLogResponse,
    DeliveryLogSummary,
    DeliveryLogListResponse,
    # Statistics schemas
    NotificationStats,
    NotificationStatsByCategory,
    NotificationStatsResponse,
    # Webhook schemas
    SendGridWebhookEvent,
    SendGridWebhookPayload,
    # Internal schemas
    NotificationTask,
    NotificationResult,
)

from src.schemas.preference import (
    # Enums
    DigestFrequency,
    PreferenceUpdateSource,
    DayOfWeek,
    # Category preference schemas
    CategoryPreference,
    CategoryPreferenceWithName,
    # Configuration schemas
    QuietHoursConfig,
    DigestSchedule,
    # Request schemas
    PreferenceCreateRequest,
    PreferenceUpdateRequest,
    CategoryPreferenceUpdateRequest,
    ChannelToggleRequest,
    UnsubscribeRequest,
    ResubscribeRequest,
    # Response schemas
    PreferenceResponse,
    PreferenceSummary,
    PreferenceListResponse,
    # Internal/processing schemas
    PreferenceCheckRequest,
    PreferenceCheckResult,
    MergedPreferences,
    # Bulk operation schemas
    BulkPreferenceUpdateRequest,
    BulkPreferenceUpdateResponse,
    # Export/import schemas
    PreferenceExport,
    PreferenceImportRequest,
)

from src.schemas.template import (
    # Enums
    TemplateStatus,
    # Variable schemas
    TemplateVariableSchema,
    TemplateDefaultValues,
    # Content schemas
    EmailContent,
    SMSContent,
    PushContent,
    InAppContent,
    # Localization schemas
    LocalizedContent,
    LocalizedContentMap,
    # Request schemas
    TemplateCreateRequest,
    TemplateUpdateRequest,
    TemplateVersionRequest,
    TemplateCloneRequest,
    # Response schemas
    TemplateResponse,
    TemplateSummary,
    TemplateListResponse,
    TemplateVersionHistory,
    TemplateVersionListResponse,
    # Rendering schemas
    TemplateRenderRequest,
    RenderedEmail,
    RenderedSMS,
    RenderedPush,
    RenderedInApp,
    TemplateRenderResponse,
    TemplatePreviewRequest,
    # Validation schemas
    TemplateValidationRequest,
    TemplateValidationError,
    TemplateValidationResult,
    # Search schemas
    TemplateSearchRequest,
    # Internal schemas
    TemplateForRendering,
    TemplateRenderResult,
    # Bulk operation schemas
    BulkTemplateStatusUpdate,
    BulkTemplateUpdateResponse,
)

__all__ = [
    # Notification Enums
    "NotificationChannel",
    "NotificationCategory",
    "NotificationPriority",
    "NotificationEventStatus",
    "NotificationDeliveryStatus",
    "NotificationProvider",
    # Preference Enums
    "DigestFrequency",
    "PreferenceUpdateSource",
    "DayOfWeek",
    # Template Enums
    "TemplateStatus",
    # Common schemas
    "PaginationMeta",
    "ErrorResponse",
    "SuccessResponse",
    # Notification Request schemas
    "NotificationRecipient",
    "NotificationCreateRequest",
    "NotificationBatchCreateRequest",
    "NotificationCancelRequest",
    "NotificationRetryRequest",
    # Notification Response schemas
    "NotificationEventResponse",
    "NotificationEventSummary",
    "NotificationListResponse",
    "NotificationBatchCreateResponse",
    # Delivery log schemas
    "DeliveryLogResponse",
    "DeliveryLogSummary",
    "DeliveryLogListResponse",
    # Statistics schemas
    "NotificationStats",
    "NotificationStatsByCategory",
    "NotificationStatsResponse",
    # Webhook schemas
    "SendGridWebhookEvent",
    "SendGridWebhookPayload",
    # Notification Internal schemas
    "NotificationTask",
    "NotificationResult",
    # Category preference schemas
    "CategoryPreference",
    "CategoryPreferenceWithName",
    # Configuration schemas
    "QuietHoursConfig",
    "DigestSchedule",
    # Preference Request schemas
    "PreferenceCreateRequest",
    "PreferenceUpdateRequest",
    "CategoryPreferenceUpdateRequest",
    "ChannelToggleRequest",
    "UnsubscribeRequest",
    "ResubscribeRequest",
    # Preference Response schemas
    "PreferenceResponse",
    "PreferenceSummary",
    "PreferenceListResponse",
    # Preference Internal/processing schemas
    "PreferenceCheckRequest",
    "PreferenceCheckResult",
    "MergedPreferences",
    # Preference Bulk operation schemas
    "BulkPreferenceUpdateRequest",
    "BulkPreferenceUpdateResponse",
    # Export/import schemas
    "PreferenceExport",
    "PreferenceImportRequest",
    # Template Variable schemas
    "TemplateVariableSchema",
    "TemplateDefaultValues",
    # Template Content schemas
    "EmailContent",
    "SMSContent",
    "PushContent",
    "InAppContent",
    # Template Localization schemas
    "LocalizedContent",
    "LocalizedContentMap",
    # Template Request schemas
    "TemplateCreateRequest",
    "TemplateUpdateRequest",
    "TemplateVersionRequest",
    "TemplateCloneRequest",
    # Template Response schemas
    "TemplateResponse",
    "TemplateSummary",
    "TemplateListResponse",
    "TemplateVersionHistory",
    "TemplateVersionListResponse",
    # Template Rendering schemas
    "TemplateRenderRequest",
    "RenderedEmail",
    "RenderedSMS",
    "RenderedPush",
    "RenderedInApp",
    "TemplateRenderResponse",
    "TemplatePreviewRequest",
    # Template Validation schemas
    "TemplateValidationRequest",
    "TemplateValidationError",
    "TemplateValidationResult",
    # Template Search schemas
    "TemplateSearchRequest",
    # Template Internal schemas
    "TemplateForRendering",
    "TemplateRenderResult",
    # Template Bulk operation schemas
    "BulkTemplateStatusUpdate",
    "BulkTemplateUpdateResponse",
]
