"""Notification templates module for the Notifications & Communication Microservice.

This module provides default notification templates for all event types in the
RawDrive platform. Templates support multi-channel delivery (email, SMS, push,
in-app) with Jinja2 templating for variable substitution.

Submodules:
- gallery: Gallery-related notification templates
- billing: Billing and payment notification templates (T039)
- system: System and security notification templates (T040)
- invitation: Invitation notification templates (T041)

Feature: Notifications & Communication Microservice
"""

from __future__ import annotations

from src.templates.gallery import (
    GALLERY_EMAIL_STYLES,
    GALLERY_TEMPLATES,
    GalleryTemplate,
    get_client_facing_templates,
    get_gallery_template,
    get_photographer_facing_templates,
    get_template_for_event as get_gallery_template_for_event,
    get_template_variable_schema as get_gallery_template_variable_schema,
    get_templates_by_channel as get_gallery_templates_by_channel,
    get_templates_by_priority as get_gallery_templates_by_priority,
    list_gallery_templates,
)

from src.templates.billing import (
    BILLING_EMAIL_STYLES,
    BILLING_TEMPLATES,
    BillingTemplate,
    get_action_required_templates,
    get_billing_template,
    get_invoice_templates,
    get_payment_templates,
    get_subscription_templates,
    get_template_for_event as get_billing_template_for_event,
    get_template_variable_schema as get_billing_template_variable_schema,
    get_templates_by_channel as get_billing_templates_by_channel,
    get_templates_by_priority as get_billing_templates_by_priority,
    get_transactional_templates as get_billing_transactional_templates,
    get_trial_templates,
    get_usage_templates,
    list_billing_templates,
)

from src.templates.system import (
    SYSTEM_EMAIL_STYLES,
    SYSTEM_TEMPLATES,
    SystemTemplate,
    get_action_required_templates as get_system_action_required_templates,
    get_maintenance_templates,
    get_security_templates,
    get_system_template,
    get_template_for_event as get_system_template_for_event,
    get_template_variable_schema as get_system_template_variable_schema,
    get_templates_by_channel as get_system_templates_by_channel,
    get_templates_by_priority as get_system_templates_by_priority,
    get_transactional_templates as get_system_transactional_templates,
    get_verification_templates,
    list_system_templates,
)

from src.templates.invitation import (
    INVITATION_EMAIL_STYLES,
    INVITATION_TEMPLATES,
    InvitationTemplate,
    get_invitation_template,
    get_invitee_templates,
    get_inviter_templates,
    get_template_for_event as get_invitation_template_for_event,
    get_template_variable_schema as get_invitation_template_variable_schema,
    get_templates_by_channel as get_invitation_templates_by_channel,
    get_templates_by_priority as get_invitation_templates_by_priority,
    get_transactional_templates as get_invitation_transactional_templates,
    list_invitation_templates,
)

from src.templates.album import (
    ALBUM_EMAIL_STYLES,
    ALBUM_TEMPLATES,
    AlbumTemplate,
    get_album_template,
    get_template_for_album_event,
    list_album_templates,
)

__all__ = [
    # Gallery templates
    "GalleryTemplate",
    "GALLERY_TEMPLATES",
    "GALLERY_EMAIL_STYLES",
    "get_gallery_template",
    "get_gallery_template_for_event",
    "list_gallery_templates",
    "get_gallery_template_variable_schema",
    "get_gallery_templates_by_channel",
    "get_gallery_templates_by_priority",
    "get_client_facing_templates",
    "get_photographer_facing_templates",
    # Billing templates
    "BillingTemplate",
    "BILLING_TEMPLATES",
    "BILLING_EMAIL_STYLES",
    "get_billing_template",
    "get_billing_template_for_event",
    "list_billing_templates",
    "get_billing_template_variable_schema",
    "get_billing_templates_by_channel",
    "get_billing_templates_by_priority",
    "get_billing_transactional_templates",
    "get_payment_templates",
    "get_subscription_templates",
    "get_invoice_templates",
    "get_trial_templates",
    "get_usage_templates",
    "get_action_required_templates",
    # System templates
    "SystemTemplate",
    "SYSTEM_TEMPLATES",
    "SYSTEM_EMAIL_STYLES",
    "get_system_template",
    "get_system_template_for_event",
    "list_system_templates",
    "get_system_template_variable_schema",
    "get_system_templates_by_channel",
    "get_system_templates_by_priority",
    "get_security_templates",
    "get_verification_templates",
    "get_system_transactional_templates",
    "get_maintenance_templates",
    "get_system_action_required_templates",
    # Invitation templates
    "InvitationTemplate",
    "INVITATION_TEMPLATES",
    "INVITATION_EMAIL_STYLES",
    "get_invitation_template",
    "get_invitation_template_for_event",
    "list_invitation_templates",
    "get_invitation_template_variable_schema",
    "get_invitation_templates_by_channel",
    "get_invitation_templates_by_priority",
    "get_invitation_transactional_templates",
    "get_invitee_templates",
    "get_inviter_templates",
    # Album templates (026-album-proofing)
    "AlbumTemplate",
    "ALBUM_TEMPLATES",
    "ALBUM_EMAIL_STYLES",
    "get_album_template",
    "get_template_for_album_event",
    "list_album_templates",
]
