"""Repositories Module for Notifications Service.

This module provides data access layer classes for:
- Notification events (create, read, update, delete)
- Delivery logs (tracking delivery attempts and status)
- Notification preferences (user/workspace settings)
- Notification templates (email/SMS templates)

All repositories enforce workspace_id filtering for multi-tenant isolation.
"""

from src.repositories.notification_repository import (
    NotificationRepository,
    notification_repository,
)
from src.repositories.preference_repository import (
    PreferenceRepository,
    preference_repository,
)
from src.repositories.template_repository import (
    TemplateRepository,
    template_repository,
)

__all__ = [
    "NotificationRepository",
    "notification_repository",
    "PreferenceRepository",
    "preference_repository",
    "TemplateRepository",
    "template_repository",
]
