# Services Module
"""
Notification services for the Notifications & Communication Microservice.

This module exports the core services:
- notification_service: Main orchestration service for all notifications
- preference_service: User notification preference management
- template_service: Jinja2 template rendering and validation
- email_delivery_service: SendGrid email delivery with tracking
- sms_delivery_service: Twilio SMS delivery (placeholder in Phase 1)
- task_queue_service: Redis-backed task queue for background processing

Feature: Notifications & Communication Microservice
"""

from src.services.template_service import template_service, TemplateService
from src.services.email_delivery_service import (
    email_delivery_service,
    EmailDeliveryService,
    get_email_delivery_service,
    close_http_client,
    # Data classes
    EmailMessage,
    EmailRecipient,
    EmailAttachment,
    EmailResult,
    EmailStatus,
    WebhookEvent,
    # Exceptions
    EmailDeliveryError,
    SendGridNotConfiguredError,
    SendGridAPIError,
    SendGridRateLimitError,
    InvalidRecipientError,
    RecipientSuppressedError,
)
from src.services.sms_delivery_service import (
    sms_delivery_service,
    SMSDeliveryService,
    get_sms_delivery_service,
    # Data classes
    SMSMessage,
    SMSResult,
    SMSStatus,
    SMSWebhookEvent,
    # Exceptions
    SMSDeliveryError,
    SMSNotEnabledError,
    TwilioNotConfiguredError,
    TwilioAPIError,
    TwilioRateLimitError,
    InvalidPhoneNumberError,
    RecipientOptedOutError,
)
from src.services.notification_service import (
    notification_service,
    NotificationService,
    get_notification_service,
    # Exceptions
    NotificationServiceError,
    NotificationNotFoundError,
    DuplicateNotificationError,
    NotificationPreferenceBlockedError,
    NotificationProcessingError,
)
from src.services.preference_service import (
    preference_service,
    PreferenceService,
    get_preference_service,
    # Exceptions
    PreferenceServiceError,
    PreferenceNotFoundError,
    PreferenceAlreadyExistsError,
    InvalidUnsubscribeTokenError,
    PreferenceValidationError,
)
from src.services.task_queue_service import (
    task_queue_service,
    TaskQueueService,
    get_task_queue,
    # Convenience functions
    enqueue_task,
    enqueue_email_task,
    enqueue_digest_task,
    get_queue_stats,
    # Task handler registration
    register_task_handler,
    get_handler,
    get_registered_handlers,
    # Data classes
    Task,
    TaskStatus,
    TaskPriority,
    # Task type constants
    TASK_SEND_EMAIL,
    TASK_SEND_EMAIL_BATCH,
    TASK_RETRY_EMAIL,
    TASK_SEND_SMS,
    TASK_SEND_SMS_BATCH,
    TASK_RETRY_SMS,
    TASK_SEND_IN_APP,
    TASK_SEND_IN_APP_BATCH,
    TASK_SEND_PUSH,
    TASK_SEND_PUSH_BATCH,
    TASK_AGGREGATE_DIGEST,
    TASK_SEND_DIGEST,
    TASK_PROCESS_DAILY_DIGEST,
    TASK_PROCESS_WEEKLY_DIGEST,
    TASK_SYNC_PREFERENCES,
    TASK_PROCESS_UNSUBSCRIBE,
    TASK_COMPILE_TEMPLATE,
    TASK_INVALIDATE_TEMPLATE_CACHE,
    TASK_PROCESS_WEBHOOK,
    TASK_UPDATE_DELIVERY_STATUS,
    TASK_CLEANUP_OLD_EVENTS,
    TASK_CLEANUP_DELIVERY_LOGS,
    TASK_CLEANUP_DEAD_LETTER,
    TASK_PROCESS_RETRIES,
)

__all__ = [
    # Main notification service
    "notification_service",
    "NotificationService",
    "get_notification_service",
    # Notification service exceptions
    "NotificationServiceError",
    "NotificationNotFoundError",
    "DuplicateNotificationError",
    "NotificationPreferenceBlockedError",
    "NotificationProcessingError",
    # Preference service
    "preference_service",
    "PreferenceService",
    "get_preference_service",
    # Preference service exceptions
    "PreferenceServiceError",
    "PreferenceNotFoundError",
    "PreferenceAlreadyExistsError",
    "InvalidUnsubscribeTokenError",
    "PreferenceValidationError",
    # Template service
    "template_service",
    "TemplateService",
    # Email delivery service
    "email_delivery_service",
    "EmailDeliveryService",
    "get_email_delivery_service",
    "close_http_client",
    # Email data classes
    "EmailMessage",
    "EmailRecipient",
    "EmailAttachment",
    "EmailResult",
    "EmailStatus",
    "WebhookEvent",
    # Email exceptions
    "EmailDeliveryError",
    "SendGridNotConfiguredError",
    "SendGridAPIError",
    "SendGridRateLimitError",
    "InvalidRecipientError",
    "RecipientSuppressedError",
    # SMS delivery service
    "sms_delivery_service",
    "SMSDeliveryService",
    "get_sms_delivery_service",
    # SMS data classes
    "SMSMessage",
    "SMSResult",
    "SMSStatus",
    "SMSWebhookEvent",
    # SMS exceptions
    "SMSDeliveryError",
    "SMSNotEnabledError",
    "TwilioNotConfiguredError",
    "TwilioAPIError",
    "TwilioRateLimitError",
    "InvalidPhoneNumberError",
    "RecipientOptedOutError",
    # Task queue service
    "task_queue_service",
    "TaskQueueService",
    "get_task_queue",
    # Task queue convenience functions
    "enqueue_task",
    "enqueue_email_task",
    "enqueue_digest_task",
    "get_queue_stats",
    # Task handler registration
    "register_task_handler",
    "get_handler",
    "get_registered_handlers",
    # Task data classes
    "Task",
    "TaskStatus",
    "TaskPriority",
    # Task type constants
    "TASK_SEND_EMAIL",
    "TASK_SEND_EMAIL_BATCH",
    "TASK_RETRY_EMAIL",
    "TASK_SEND_SMS",
    "TASK_SEND_SMS_BATCH",
    "TASK_RETRY_SMS",
    "TASK_SEND_IN_APP",
    "TASK_SEND_IN_APP_BATCH",
    "TASK_SEND_PUSH",
    "TASK_SEND_PUSH_BATCH",
    "TASK_AGGREGATE_DIGEST",
    "TASK_SEND_DIGEST",
    "TASK_PROCESS_DAILY_DIGEST",
    "TASK_PROCESS_WEEKLY_DIGEST",
    "TASK_SYNC_PREFERENCES",
    "TASK_PROCESS_UNSUBSCRIBE",
    "TASK_COMPILE_TEMPLATE",
    "TASK_INVALIDATE_TEMPLATE_CACHE",
    "TASK_PROCESS_WEBHOOK",
    "TASK_UPDATE_DELIVERY_STATUS",
    "TASK_CLEANUP_OLD_EVENTS",
    "TASK_CLEANUP_DELIVERY_LOGS",
    "TASK_CLEANUP_DEAD_LETTER",
    "TASK_PROCESS_RETRIES",
]
