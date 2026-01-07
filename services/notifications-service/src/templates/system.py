"""System notification templates for the Notifications & Communication Microservice.

This module provides default templates for all system-related notification events:
- Welcome and onboarding notifications
- Maintenance notifications (scheduled, complete)
- Feature announcements
- Policy updates
- Storage warnings and alerts
- Security notifications (login, password changes, 2FA, suspicious activity)
- Email and phone verification

Each template includes:
- Email content (subject, HTML, plain text)
- SMS content (for supported events)
- Push notification content
- In-app notification content
- Variable schema definitions
- Default values for optional variables

Security and verification templates are marked as transactional (cannot be disabled
by user preferences) as they contain critical account security information.

Templates use Jinja2 syntax for variable substitution: {{ variable_name }}

Feature: Notifications & Communication Microservice
Task: T040 - Create system notification templates
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from src.events.catalog import EventType
from src.schemas.notification import (
    NotificationCategory,
    NotificationChannel,
    NotificationPriority,
)


# =============================================================================
# TEMPLATE DATA CLASS
# =============================================================================


@dataclass
class SystemTemplate:
    """Complete template definition for a system notification.

    Contains all content variations for multi-channel delivery,
    variable requirements, and configuration options.
    """

    # Identity
    event_type: EventType
    code: str
    name: str
    description: str

    # Classification
    category: NotificationCategory
    supported_channels: list[NotificationChannel]
    default_priority: NotificationPriority
    is_transactional: bool = False

    # Email content
    email_subject: str = ""
    email_html: str = ""
    email_text: str = ""
    email_from_name: Optional[str] = None

    # SMS content
    sms_content: Optional[str] = None

    # Push notification content
    push_title: Optional[str] = None
    push_body: Optional[str] = None
    push_action_url: Optional[str] = None

    # In-app notification content
    in_app_title: Optional[str] = None
    in_app_body: Optional[str] = None
    in_app_action_url: Optional[str] = None
    in_app_icon: str = "system"

    # Variable schema
    required_variables: list[str] = field(default_factory=list)
    optional_variables: list[str] = field(default_factory=list)
    default_values: dict[str, Any] = field(default_factory=dict)

    # Tags for categorization
    tags: list[str] = field(default_factory=list)


# =============================================================================
# COMMON HTML STYLES FOR SYSTEM TEMPLATES
# =============================================================================

SYSTEM_EMAIL_STYLES = """
<style>
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.6;
    color: #0F172A;
    background-color: #F8FAFC;
    margin: 0;
    padding: 0;
  }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .card {
    background: #FFFFFF;
    border-radius: 12px;
    padding: 32px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .header { text-align: center; margin-bottom: 24px; }
  .logo { font-size: 24px; font-weight: 700; color: #2563EB; }
  .title {
    font-size: 24px;
    font-weight: 700;
    color: #0F172A;
    margin: 16px 0 8px;
  }
  .subtitle {
    font-size: 14px;
    color: #64748B;
    margin: 0;
  }
  .success-badge {
    display: inline-block;
    background: #DCFCE7;
    color: #166534;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0;
  }
  .warning-badge {
    display: inline-block;
    background: #FEF3C7;
    color: #92400E;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0;
  }
  .error-badge {
    display: inline-block;
    background: #FEE2E2;
    color: #991B1B;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0;
  }
  .info-badge {
    display: inline-block;
    background: #DBEAFE;
    color: #1E40AF;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0;
  }
  .security-badge {
    display: inline-block;
    background: #F3E8FF;
    color: #7C3AED;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0;
  }
  .info-row {
    padding: 12px 0;
    border-bottom: 1px solid #E2E8F0;
  }
  .info-row:last-child { border-bottom: none; }
  .info-label {
    font-size: 12px;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .info-value {
    font-size: 16px;
    color: #0F172A;
    margin-top: 4px;
  }
  .cta-button {
    display: inline-block;
    background: linear-gradient(135deg, #2563EB, #1D4ED8);
    color: #FFFFFF !important;
    padding: 14px 32px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    margin-top: 24px;
  }
  .secondary-button {
    display: inline-block;
    background: #F1F5F9;
    color: #475569 !important;
    padding: 12px 24px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    margin-top: 12px;
  }
  .urgent-button {
    display: inline-block;
    background: linear-gradient(135deg, #DC2626, #B91C1C);
    color: #FFFFFF !important;
    padding: 14px 32px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    margin-top: 24px;
  }
  .security-button {
    display: inline-block;
    background: linear-gradient(135deg, #7C3AED, #6D28D9);
    color: #FFFFFF !important;
    padding: 14px 32px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    margin-top: 24px;
  }
  .footer {
    text-align: center;
    margin-top: 32px;
    font-size: 12px;
    color: #64748B;
  }
  .alert-box {
    background: #FEF2F2;
    border: 1px solid #FECACA;
    border-radius: 8px;
    padding: 16px;
    margin: 24px 0;
  }
  .alert-box.warning {
    background: #FFFBEB;
    border-color: #FED7AA;
  }
  .alert-box.info {
    background: #EFF6FF;
    border-color: #BFDBFE;
  }
  .alert-box.success {
    background: #F0FDF4;
    border-color: #BBF7D0;
  }
  .verification-code {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 8px;
    color: #0F172A;
    background: #F1F5F9;
    padding: 16px 24px;
    border-radius: 8px;
    text-align: center;
    margin: 24px 0;
  }
  .countdown-box {
    background: #FEF3C7;
    border: 1px solid #F59E0B;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
    margin: 24px 0;
  }
  .countdown-number {
    font-size: 36px;
    font-weight: 700;
    color: #92400E;
  }
  .countdown-label {
    font-size: 14px;
    color: #92400E;
  }
  .usage-bar {
    background: #E2E8F0;
    border-radius: 4px;
    height: 8px;
    margin: 8px 0;
    overflow: hidden;
  }
  .usage-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .usage-bar-fill.normal { background: #22C55E; }
  .usage-bar-fill.warning { background: #F59E0B; }
  .usage-bar-fill.critical { background: #EF4444; }
  .feature-list {
    background: #F8FAFC;
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
  }
  .feature-list ul {
    margin: 0;
    padding-left: 20px;
  }
  .feature-list li {
    margin: 8px 0;
    color: #475569;
  }
  .device-info {
    background: #F8FAFC;
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
  }
  .device-icon {
    font-size: 24px;
    margin-bottom: 8px;
  }
</style>
"""


# =============================================================================
# WELCOME TEMPLATE
# =============================================================================

WELCOME_EMAIL_SUBJECT = "Welcome to RawDrive, {{ user_name }}!"

WELCOME_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to RawDrive</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <h1 class="title">Welcome, {{{{ user_name }}}}!</h1>
        <p class="subtitle">Your photography workflow starts here</p>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        We're thrilled to have you join the RawDrive community. Here's what you can do to get started:
      </p>

      <div class="feature-list">
        <ul>
          <li><strong>Upload your first gallery</strong> - Organize and share your work</li>
          <li><strong>Customize your brand</strong> - Add your logo and colors</li>
          <li><strong>Invite your clients</strong> - Start collaborating today</li>
          <li><strong>Set up your workflow</strong> - Automate your delivery process</li>
        </ul>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ getting_started_url | default(dashboard_url) }}}}" class="cta-button">Get Started</a>
      </div>

      {{% if features %}}
      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        Your plan includes: {{{{ features | join(', ') }}}}
      </p>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>Need help? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Visit our support center</a></p>
      <p style="margin-top: 8px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

WELCOME_EMAIL_TEXT = """
Welcome to RawDrive, {{ user_name }}!

We're thrilled to have you join the RawDrive community. Here's what you can do to get started:

- Upload your first gallery - Organize and share your work
- Customize your brand - Add your logo and colors
- Invite your clients - Start collaborating today
- Set up your workflow - Automate your delivery process

Get started: {{ getting_started_url | default(dashboard_url) }}

{% if features %}Your plan includes: {{ features | join(', ') }}{% endif %}

---
Need help? Visit our support center at {{ support_url | default('https://rawdrive.io/support') }}
"""

WELCOME_PUSH_TITLE = "Welcome to RawDrive!"
WELCOME_PUSH_BODY = "Start your photography journey - upload your first gallery"

WELCOME_IN_APP_TITLE = "Welcome to RawDrive!"
WELCOME_IN_APP_BODY = "Get started by uploading your first gallery and customizing your brand"


# =============================================================================
# MAINTENANCE SCHEDULED TEMPLATE
# =============================================================================

MAINTENANCE_SCHEDULED_EMAIL_SUBJECT = "Scheduled maintenance on {{ maintenance_start }}"

MAINTENANCE_SCHEDULED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scheduled Maintenance</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">Scheduled Maintenance</span>
        <h1 class="title">Planned System Maintenance</h1>
      </div>

      <div class="alert-box info">
        <p style="margin: 0; color: #1E40AF;">
          We'll be performing scheduled maintenance to improve your RawDrive experience.
        </p>
      </div>

      <div class="info-row">
        <div class="info-label">Start Time</div>
        <div class="info-value">{{{{ maintenance_start }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">End Time (Estimated)</div>
        <div class="info-value">{{{{ maintenance_end }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Affected Services</div>
        <div class="info-value">{{{{ affected_services | join(', ') }}}}</div>
      </div>

      {{% if reason %}}
      <div class="info-row">
        <div class="info-label">Purpose</div>
        <div class="info-value">{{{{ reason }}}}</div>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin: 24px 0; color: #475569;">
        During this time, the affected services may be temporarily unavailable. We apologize for any inconvenience.
      </p>

      {{% if status_page_url %}}
      <div style="text-align: center;">
        <a href="{{{{ status_page_url }}}}" class="secondary-button">View Status Page</a>
      </div>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>This is a system notification from RawDrive.</p>
    </div>
  </div>
</body>
</html>
"""

MAINTENANCE_SCHEDULED_EMAIL_TEXT = """
Scheduled Maintenance Notice

We'll be performing scheduled maintenance to improve your RawDrive experience.

Start Time: {{ maintenance_start }}
End Time (Estimated): {{ maintenance_end }}
Affected Services: {{ affected_services | join(', ') }}
{% if reason %}Purpose: {{ reason }}{% endif %}

During this time, the affected services may be temporarily unavailable. We apologize for any inconvenience.

{% if status_page_url %}View status updates: {{ status_page_url }}{% endif %}

---
This is a system notification from RawDrive.
"""

MAINTENANCE_SCHEDULED_PUSH_TITLE = "Maintenance Scheduled"
MAINTENANCE_SCHEDULED_PUSH_BODY = "RawDrive maintenance on {{ maintenance_start }}"

MAINTENANCE_SCHEDULED_IN_APP_TITLE = "Scheduled Maintenance"
MAINTENANCE_SCHEDULED_IN_APP_BODY = "Maintenance scheduled for {{ maintenance_start }}. Some services may be unavailable."


# =============================================================================
# MAINTENANCE COMPLETE TEMPLATE
# =============================================================================

MAINTENANCE_COMPLETE_EMAIL_SUBJECT = "Maintenance complete - RawDrive is back online"

MAINTENANCE_COMPLETE_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maintenance Complete</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">All Systems Operational</span>
        <h1 class="title">Maintenance Complete</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Our scheduled maintenance has been completed successfully. All services are now back online and running normally.
      </p>

      <div class="info-row">
        <div class="info-label">Completed At</div>
        <div class="info-value">{{{{ maintenance_end }}}}</div>
      </div>

      {{% if summary %}}
      <div class="alert-box success">
        <p style="margin: 0; font-weight: 600; color: #166534;">What we improved:</p>
        <p style="margin: 8px 0 0; color: #166534;">{{{{ summary }}}}</p>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ dashboard_url | default('https://app.rawdrive.io') }}}}" class="cta-button">Go to Dashboard</a>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for your patience during our maintenance window.</p>
      {{% if status_page_url %}}
      <p style="margin-top: 8px;">
        <a href="{{{{ status_page_url }}}}" style="color: #64748B;">View status page</a>
      </p>
      {{% endif %}}
    </div>
  </div>
</body>
</html>
"""

MAINTENANCE_COMPLETE_EMAIL_TEXT = """
Maintenance Complete

Our scheduled maintenance has been completed successfully. All services are now back online and running normally.

Completed At: {{ maintenance_end }}

{% if summary %}What we improved: {{ summary }}{% endif %}

Go to dashboard: {{ dashboard_url | default('https://app.rawdrive.io') }}

---
Thank you for your patience during our maintenance window.
"""

MAINTENANCE_COMPLETE_PUSH_TITLE = "Maintenance Complete"
MAINTENANCE_COMPLETE_PUSH_BODY = "RawDrive is back online and running normally"

MAINTENANCE_COMPLETE_IN_APP_TITLE = "Maintenance Complete"
MAINTENANCE_COMPLETE_IN_APP_BODY = "All systems are back online. Thank you for your patience."


# =============================================================================
# FEATURE ANNOUNCEMENT TEMPLATE
# =============================================================================

FEATURE_ANNOUNCEMENT_EMAIL_SUBJECT = "New in RawDrive: {{ feature_name }}"

FEATURE_ANNOUNCEMENT_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Feature Announcement</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">New Feature</span>
        <h1 class="title">{{{{ feature_name }}}}</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        {{{{ feature_description }}}}
      </p>

      {{% if video_url %}}
      <div style="text-align: center; margin: 24px 0;">
        <a href="{{{{ video_url }}}}" style="color: #2563EB; font-weight: 500;">Watch the tutorial video</a>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        {{% if try_it_url %}}
        <a href="{{{{ try_it_url }}}}" class="cta-button">Try It Now</a>
        {{% elif learn_more_url %}}
        <a href="{{{{ learn_more_url }}}}" class="cta-button">Learn More</a>
        {{% endif %}}
      </div>
    </div>

    <div class="footer">
      <p>We're always working to make RawDrive better for you.</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

FEATURE_ANNOUNCEMENT_EMAIL_TEXT = """
New in RawDrive: {{ feature_name }}

{{ feature_description }}

{% if video_url %}Watch the tutorial: {{ video_url }}{% endif %}

{% if try_it_url %}Try it now: {{ try_it_url }}{% elif learn_more_url %}Learn more: {{ learn_more_url }}{% endif %}

---
We're always working to make RawDrive better for you.
To manage your notification preferences: {{ unsubscribe_url }}
"""

FEATURE_ANNOUNCEMENT_PUSH_TITLE = "New Feature!"
FEATURE_ANNOUNCEMENT_PUSH_BODY = "{{ feature_name }} is now available in RawDrive"

FEATURE_ANNOUNCEMENT_IN_APP_TITLE = "New Feature: {{ feature_name }}"
FEATURE_ANNOUNCEMENT_IN_APP_BODY = "{{ feature_description }}"


# =============================================================================
# POLICY UPDATE TEMPLATE
# =============================================================================

POLICY_UPDATE_EMAIL_SUBJECT = "Important: {{ policy_type }} policy update"

POLICY_UPDATE_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Policy Update</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">Policy Update</span>
        <h1 class="title">{{{{ policy_type }}}} Policy Update</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        We've updated our {{{{ policy_type }}}} policy. These changes will take effect on <strong>{{{{ effective_date }}}}</strong>.
      </p>

      {{% if summary %}}
      <div class="alert-box info">
        <p style="margin: 0; font-weight: 600; color: #1E40AF;">Summary of Changes:</p>
        <p style="margin: 8px 0 0; color: #1E40AF;">{{{{ summary }}}}</p>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ full_policy_url }}}}" class="cta-button">Review Full Policy</a>
      </div>

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        By continuing to use RawDrive after {{{{ effective_date }}}}, you agree to the updated policy.
      </p>
    </div>

    <div class="footer">
      <p>This is a required notification about policy changes.</p>
      <p style="margin-top: 8px;">
        Questions? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

POLICY_UPDATE_EMAIL_TEXT = """
{{ policy_type }} Policy Update

We've updated our {{ policy_type }} policy. These changes will take effect on {{ effective_date }}.

{% if summary %}Summary of Changes: {{ summary }}{% endif %}

Review full policy: {{ full_policy_url }}

By continuing to use RawDrive after {{ effective_date }}, you agree to the updated policy.

---
This is a required notification about policy changes.
Questions? Contact support at {{ support_url | default('https://rawdrive.io/support') }}
"""

POLICY_UPDATE_PUSH_TITLE = "Policy Update"
POLICY_UPDATE_PUSH_BODY = "{{ policy_type }} policy has been updated. Review before {{ effective_date }}."

POLICY_UPDATE_IN_APP_TITLE = "Policy Update"
POLICY_UPDATE_IN_APP_BODY = "{{ policy_type }} policy updated. Effective {{ effective_date }}."


# =============================================================================
# STORAGE WARNING TEMPLATE
# =============================================================================

STORAGE_WARNING_EMAIL_SUBJECT = "Storage alert: {{ percentage }}% of your storage used"

STORAGE_WARNING_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Storage Warning</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Storage Warning</span>
        <h1 class="title">You're Running Low on Storage</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <div class="countdown-number">{{{{ percentage }}}}%</div>
        <div class="countdown-label">Storage Used</div>
      </div>

      <div class="usage-bar">
        <div class="usage-bar-fill warning" style="width: {{{{ percentage }}}}%;"></div>
      </div>

      <div class="info-row">
        <div class="info-label">Current Usage</div>
        <div class="info-value">{{{{ current_usage_gb }}}} GB of {{{{ limit_gb }}}} GB</div>
      </div>

      {{% if cleanup_suggestions %}}
      <div class="alert-box warning">
        <p style="margin: 0; font-weight: 600; color: #92400E;">Quick tips to free up space:</p>
        <p style="margin: 8px 0 0; color: #92400E;">{{{{ cleanup_suggestions }}}}</p>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        {{% if upgrade_url %}}
        <a href="{{{{ upgrade_url }}}}" class="cta-button">Upgrade Storage</a>
        {{% endif %}}
        <br>
        <a href="{{{{ manage_storage_url | default(dashboard_url) }}}}" class="secondary-button">Manage Storage</a>
      </div>
    </div>

    <div class="footer">
      <p>Avoid interruptions by upgrading your storage plan or freeing up space.</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

STORAGE_WARNING_EMAIL_TEXT = """
Storage Warning: You're Running Low on Storage

{{ percentage }}% of your storage is used.

Current Usage: {{ current_usage_gb }} GB of {{ limit_gb }} GB

{% if cleanup_suggestions %}Tips to free up space: {{ cleanup_suggestions }}{% endif %}

{% if upgrade_url %}Upgrade storage: {{ upgrade_url }}{% endif %}
Manage storage: {{ manage_storage_url | default(dashboard_url) }}

---
Avoid interruptions by upgrading your storage plan or freeing up space.
"""

STORAGE_WARNING_SMS = """RawDrive: Your storage is {{ percentage }}% full. Free up space or upgrade to avoid interruptions."""

STORAGE_WARNING_PUSH_TITLE = "Storage Warning"
STORAGE_WARNING_PUSH_BODY = "{{ percentage }}% of your storage used. Consider upgrading or cleaning up."

STORAGE_WARNING_IN_APP_TITLE = "Storage Running Low"
STORAGE_WARNING_IN_APP_BODY = "{{ current_usage_gb }} GB of {{ limit_gb }} GB used ({{ percentage }}%)"


# =============================================================================
# STORAGE FULL TEMPLATE
# =============================================================================

STORAGE_FULL_EMAIL_SUBJECT = "Action required: Your storage is full"

STORAGE_FULL_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Storage Full</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="error-badge">Storage Full</span>
        <h1 class="title">Your Storage is Full</h1>
      </div>

      <div class="alert-box">
        <p style="margin: 0; color: #991B1B; font-weight: 600;">
          You've reached your storage limit. You won't be able to upload new files until you free up space or upgrade your plan.
        </p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <div class="countdown-number">100%</div>
        <div class="countdown-label">Storage Used</div>
      </div>

      <div class="usage-bar">
        <div class="usage-bar-fill critical" style="width: 100%;"></div>
      </div>

      <div class="info-row">
        <div class="info-label">Current Usage</div>
        <div class="info-value">{{{{ current_usage_gb }}}} GB of {{{{ limit_gb }}}} GB</div>
      </div>

      <div style="text-align: center;">
        {{% if upgrade_url %}}
        <a href="{{{{ upgrade_url }}}}" class="urgent-button">Upgrade Now</a>
        {{% endif %}}
        <br>
        {{% if cleanup_url %}}
        <a href="{{{{ cleanup_url }}}}" class="secondary-button">Free Up Space</a>
        {{% endif %}}
      </div>
    </div>

    <div class="footer">
      <p>This is a transactional notification for your RawDrive account.</p>
      <p style="margin-top: 8px;">
        Need help? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

STORAGE_FULL_EMAIL_TEXT = """
ACTION REQUIRED: Your Storage is Full

You've reached your storage limit. You won't be able to upload new files until you free up space or upgrade your plan.

Current Usage: {{ current_usage_gb }} GB of {{ limit_gb }} GB (100%)

{% if upgrade_url %}Upgrade now: {{ upgrade_url }}{% endif %}
{% if cleanup_url %}Free up space: {{ cleanup_url }}{% endif %}

---
This is a transactional notification for your RawDrive account.
Need help? Contact support at {{ support_url | default('https://rawdrive.io/support') }}
"""

STORAGE_FULL_SMS = """RawDrive: Your storage is full! Upgrade or delete files to continue uploading. {{ upgrade_url | default(dashboard_url) }}"""

STORAGE_FULL_PUSH_TITLE = "Storage Full!"
STORAGE_FULL_PUSH_BODY = "You can't upload new files. Upgrade or free up space now."

STORAGE_FULL_IN_APP_TITLE = "Storage Full"
STORAGE_FULL_IN_APP_BODY = "Uploads disabled. Please upgrade your plan or delete files to continue."


# =============================================================================
# SECURITY: LOGIN NEW DEVICE TEMPLATE
# =============================================================================

LOGIN_NEW_DEVICE_EMAIL_SUBJECT = "New device sign-in to your RawDrive account"

LOGIN_NEW_DEVICE_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Device Sign-In</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="security-badge">Security Alert</span>
        <h1 class="title">New Device Sign-In</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Your account was accessed from a new device. If this was you, no action is needed.
      </p>

      <div class="device-info">
        <div class="info-row">
          <div class="info-label">Device</div>
          <div class="info-value">{{{{ device_name }}}}</div>
        </div>

        <div class="info-row">
          <div class="info-label">Device Type</div>
          <div class="info-value">{{{{ device_type }}}}</div>
        </div>

        <div class="info-row">
          <div class="info-label">Sign-In Time</div>
          <div class="info-value">{{{{ login_time }}}}</div>
        </div>

        {{% if location %}}
        <div class="info-row">
          <div class="info-label">Location</div>
          <div class="info-value">{{{{ location }}}}</div>
        </div>
        {{% endif %}}

        {{% if ip_address %}}
        <div class="info-row">
          <div class="info-label">IP Address</div>
          <div class="info-value">{{{{ ip_address }}}}</div>
        </div>
        {{% endif %}}

        {{% if browser %}}
        <div class="info-row">
          <div class="info-label">Browser</div>
          <div class="info-value">{{{{ browser }}}}</div>
        </div>
        {{% endif %}}
      </div>

      <div class="alert-box warning">
        <p style="margin: 0; color: #92400E;">
          <strong>Wasn't you?</strong> Secure your account immediately by changing your password.
        </p>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ secure_account_url | default(security_settings_url) }}}}" class="security-button">Secure My Account</a>
      </div>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
    </div>
  </div>
</body>
</html>
"""

LOGIN_NEW_DEVICE_EMAIL_TEXT = """
New Device Sign-In Alert

Your account was accessed from a new device. If this was you, no action is needed.

Device: {{ device_name }}
Device Type: {{ device_type }}
Sign-In Time: {{ login_time }}
{% if location %}Location: {{ location }}{% endif %}
{% if ip_address %}IP Address: {{ ip_address }}{% endif %}
{% if browser %}Browser: {{ browser }}{% endif %}

Wasn't you? Secure your account immediately by changing your password.

Secure your account: {{ secure_account_url | default(security_settings_url) }}

---
This is a security notification for your RawDrive account.
"""

LOGIN_NEW_DEVICE_SMS = """RawDrive: New sign-in from {{ device_type }} at {{ login_time }}. Not you? Secure your account now."""

LOGIN_NEW_DEVICE_PUSH_TITLE = "New Device Sign-In"
LOGIN_NEW_DEVICE_PUSH_BODY = "Sign-in from {{ device_name }}{% if location %} in {{ location }}{% endif %}"

LOGIN_NEW_DEVICE_IN_APP_TITLE = "New Device Sign-In"
LOGIN_NEW_DEVICE_IN_APP_BODY = "Your account was accessed from {{ device_name }} at {{ login_time }}"


# =============================================================================
# SECURITY: LOGIN NEW LOCATION TEMPLATE
# =============================================================================

LOGIN_NEW_LOCATION_EMAIL_SUBJECT = "Sign-in from new location: {{ location }}"

LOGIN_NEW_LOCATION_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Location Sign-In</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="security-badge">Security Alert</span>
        <h1 class="title">Sign-In From New Location</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Your account was accessed from a new location. If this was you, no action is needed.
      </p>

      <div class="device-info">
        <div class="info-row">
          <div class="info-label">Location</div>
          <div class="info-value" style="font-weight: 600;">{{{{ location }}}}</div>
        </div>

        <div class="info-row">
          <div class="info-label">Sign-In Time</div>
          <div class="info-value">{{{{ login_time }}}}</div>
        </div>

        {{% if device_name %}}
        <div class="info-row">
          <div class="info-label">Device</div>
          <div class="info-value">{{{{ device_name }}}}</div>
        </div>
        {{% endif %}}

        {{% if ip_address %}}
        <div class="info-row">
          <div class="info-label">IP Address</div>
          <div class="info-value">{{{{ ip_address }}}}</div>
        </div>
        {{% endif %}}
      </div>

      <div class="alert-box warning">
        <p style="margin: 0; color: #92400E;">
          <strong>Wasn't you?</strong> Secure your account immediately by changing your password.
        </p>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ secure_account_url | default(security_settings_url) }}}}" class="security-button">Secure My Account</a>
      </div>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
    </div>
  </div>
</body>
</html>
"""

LOGIN_NEW_LOCATION_EMAIL_TEXT = """
Sign-In From New Location

Your account was accessed from a new location. If this was you, no action is needed.

Location: {{ location }}
Sign-In Time: {{ login_time }}
{% if device_name %}Device: {{ device_name }}{% endif %}
{% if ip_address %}IP Address: {{ ip_address }}{% endif %}

Wasn't you? Secure your account immediately by changing your password.

Secure your account: {{ secure_account_url | default(security_settings_url) }}

---
This is a security notification for your RawDrive account.
"""

LOGIN_NEW_LOCATION_SMS = """RawDrive: Sign-in from {{ location }} at {{ login_time }}. Not you? Secure your account now."""

LOGIN_NEW_LOCATION_PUSH_TITLE = "New Location Sign-In"
LOGIN_NEW_LOCATION_PUSH_BODY = "Sign-in detected from {{ location }}"

LOGIN_NEW_LOCATION_IN_APP_TITLE = "New Location Sign-In"
LOGIN_NEW_LOCATION_IN_APP_BODY = "Sign-in detected from {{ location }} at {{ login_time }}"


# =============================================================================
# SECURITY: PASSWORD CHANGED TEMPLATE
# =============================================================================

PASSWORD_CHANGED_EMAIL_SUBJECT = "Your RawDrive password has been changed"

PASSWORD_CHANGED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Changed</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Password Updated</span>
        <h1 class="title">Password Changed Successfully</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Your account password was changed on <strong>{{{{ change_time }}}}</strong>.
      </p>

      {{% if device_name %}}
      <div class="info-row">
        <div class="info-label">Device</div>
        <div class="info-value">{{{{ device_name }}}}</div>
      </div>
      {{% endif %}}

      {{% if location %}}
      <div class="info-row">
        <div class="info-label">Location</div>
        <div class="info-value">{{{{ location }}}}</div>
      </div>
      {{% endif %}}

      <div class="alert-box warning">
        <p style="margin: 0; color: #92400E;">
          <strong>Didn't make this change?</strong> Your account may be compromised. Reset your password immediately and review your account security.
        </p>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ secure_account_url | default(security_settings_url) }}}}" class="security-button">Review Account Security</a>
      </div>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
    </div>
  </div>
</body>
</html>
"""

PASSWORD_CHANGED_EMAIL_TEXT = """
Password Changed Successfully

Your account password was changed on {{ change_time }}.

{% if device_name %}Device: {{ device_name }}{% endif %}
{% if location %}Location: {{ location }}{% endif %}

Didn't make this change? Your account may be compromised. Reset your password immediately and review your account security.

Review account security: {{ secure_account_url | default(security_settings_url) }}

---
This is a security notification for your RawDrive account.
"""

PASSWORD_CHANGED_PUSH_TITLE = "Password Changed"
PASSWORD_CHANGED_PUSH_BODY = "Your RawDrive password was changed. Wasn't you? Act now."

PASSWORD_CHANGED_IN_APP_TITLE = "Password Changed"
PASSWORD_CHANGED_IN_APP_BODY = "Your password was changed on {{ change_time }}"


# =============================================================================
# SECURITY: PASSWORD RESET REQUESTED TEMPLATE
# =============================================================================

PASSWORD_RESET_REQUESTED_EMAIL_SUBJECT = "Reset your RawDrive password"

PASSWORD_RESET_REQUESTED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="security-badge">Password Reset</span>
        <h1 class="title">Reset Your Password</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        We received a request to reset your password. Click the button below to create a new password.
      </p>

      <div class="countdown-box">
        <p style="margin: 0; color: #92400E; font-weight: 500;">This link expires in</p>
        <div class="countdown-number">{{{{ expiry_minutes }}}}</div>
        <div class="countdown-label">minutes</div>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ reset_link }}}}" class="urgent-button">Reset Password</a>
      </div>

      {{% if ip_address or location %}}
      <div class="info-row" style="margin-top: 24px;">
        <div class="info-label">Request Details</div>
        <div class="info-value">
          {{% if ip_address %}}IP: {{{{ ip_address }}}}{{% endif %}}
          {{% if location %}} from {{{{ location }}}}{{% endif %}}
        </div>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
    </div>
  </div>
</body>
</html>
"""

PASSWORD_RESET_REQUESTED_EMAIL_TEXT = """
Reset Your Password

We received a request to reset your password. Click the link below to create a new password.

Reset your password: {{ reset_link }}

This link expires in {{ expiry_minutes }} minutes.

{% if ip_address %}Request from IP: {{ ip_address }}{% endif %}
{% if location %}Location: {{ location }}{% endif %}

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

---
This is a security notification for your RawDrive account.
"""

PASSWORD_RESET_REQUESTED_SMS = """RawDrive: Use this link to reset your password (expires in {{ expiry_minutes }} min): {{ reset_link }}"""

PASSWORD_RESET_REQUESTED_PUSH_TITLE = "Password Reset Requested"
PASSWORD_RESET_REQUESTED_PUSH_BODY = "Check your email for password reset instructions"

PASSWORD_RESET_REQUESTED_IN_APP_TITLE = "Password Reset Requested"
PASSWORD_RESET_REQUESTED_IN_APP_BODY = "Check your email for a password reset link"


# =============================================================================
# SECURITY: PASSWORD RESET COMPLETE TEMPLATE
# =============================================================================

PASSWORD_RESET_COMPLETE_EMAIL_SUBJECT = "Your RawDrive password has been reset"

PASSWORD_RESET_COMPLETE_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Complete</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Password Reset</span>
        <h1 class="title">Password Reset Successfully</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Your password was reset on <strong>{{{{ reset_time }}}}</strong>. You can now sign in with your new password.
      </p>

      {{% if device_name %}}
      <div class="info-row">
        <div class="info-label">Device</div>
        <div class="info-value">{{{{ device_name }}}}</div>
      </div>
      {{% endif %}}

      {{% if location %}}
      <div class="info-row">
        <div class="info-label">Location</div>
        <div class="info-value">{{{{ location }}}}</div>
      </div>
      {{% endif %}}

      <div class="alert-box warning">
        <p style="margin: 0; color: #92400E;">
          <strong>Didn't do this?</strong> Contact us immediately at <a href="mailto:security@rawdrive.io" style="color: #92400E;">security@rawdrive.io</a>
        </p>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ login_url | default('https://app.rawdrive.io/login') }}}}" class="cta-button">Sign In</a>
      </div>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
    </div>
  </div>
</body>
</html>
"""

PASSWORD_RESET_COMPLETE_EMAIL_TEXT = """
Password Reset Successfully

Your password was reset on {{ reset_time }}. You can now sign in with your new password.

{% if device_name %}Device: {{ device_name }}{% endif %}
{% if location %}Location: {{ location }}{% endif %}

Didn't do this? Contact us immediately at security@rawdrive.io

Sign in: {{ login_url | default('https://app.rawdrive.io/login') }}

---
This is a security notification for your RawDrive account.
"""

PASSWORD_RESET_COMPLETE_PUSH_TITLE = "Password Reset Complete"
PASSWORD_RESET_COMPLETE_PUSH_BODY = "Your password has been reset successfully"

PASSWORD_RESET_COMPLETE_IN_APP_TITLE = "Password Reset Complete"
PASSWORD_RESET_COMPLETE_IN_APP_BODY = "Your password was reset on {{ reset_time }}"


# =============================================================================
# SECURITY: EMAIL CHANGED TEMPLATE
# =============================================================================

EMAIL_CHANGED_EMAIL_SUBJECT = "Your RawDrive email address has been changed"

EMAIL_CHANGED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Changed</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="security-badge">Email Changed</span>
        <h1 class="title">Email Address Updated</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        The email address associated with your RawDrive account has been changed.
      </p>

      <div class="info-row">
        <div class="info-label">Previous Email</div>
        <div class="info-value">{{{{ old_email }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">New Email</div>
        <div class="info-value" style="font-weight: 600;">{{{{ new_email }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Changed At</div>
        <div class="info-value">{{{{ change_time }}}}</div>
      </div>

      <div class="alert-box">
        <p style="margin: 0; color: #991B1B;">
          <strong>Didn't make this change?</strong> Your account may be compromised. Contact us immediately.
        </p>
      </div>

      {{% if revert_url %}}
      <div style="text-align: center;">
        <a href="{{{{ revert_url }}}}" class="urgent-button">Revert This Change</a>
      </div>
      {{% endif %}}

      <div style="text-align: center; margin-top: 16px;">
        <a href="{{{{ secure_account_url | default(security_settings_url) }}}}" class="secondary-button">Review Account Security</a>
      </div>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
      <p style="margin-top: 8px;">
        Need help? Contact <a href="mailto:security@rawdrive.io" style="color: #2563EB;">security@rawdrive.io</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

EMAIL_CHANGED_EMAIL_TEXT = """
Email Address Updated

The email address associated with your RawDrive account has been changed.

Previous Email: {{ old_email }}
New Email: {{ new_email }}
Changed At: {{ change_time }}

Didn't make this change? Your account may be compromised. Contact us immediately.

{% if revert_url %}Revert this change: {{ revert_url }}{% endif %}

Review account security: {{ secure_account_url | default(security_settings_url) }}

---
This is a security notification for your RawDrive account.
Need help? Contact security@rawdrive.io
"""

EMAIL_CHANGED_SMS = """RawDrive: Your email was changed to {{ new_email }}. Not you? Contact security@rawdrive.io immediately."""

EMAIL_CHANGED_PUSH_TITLE = "Email Changed"
EMAIL_CHANGED_PUSH_BODY = "Your account email was changed to {{ new_email }}"

EMAIL_CHANGED_IN_APP_TITLE = "Email Changed"
EMAIL_CHANGED_IN_APP_BODY = "Email changed from {{ old_email }} to {{ new_email }}"


# =============================================================================
# SECURITY: TWO FACTOR ENABLED TEMPLATE
# =============================================================================

TWO_FACTOR_ENABLED_EMAIL_SUBJECT = "Two-factor authentication enabled"

TWO_FACTOR_ENABLED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>2FA Enabled</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Security Enhanced</span>
        <h1 class="title">Two-Factor Authentication Enabled</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Great news! Your account is now protected with two-factor authentication.
      </p>

      <div class="info-row">
        <div class="info-label">Enabled At</div>
        <div class="info-value">{{{{ enabled_time }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Method</div>
        <div class="info-value">{{{{ method }}}}</div>
      </div>

      <div class="alert-box success">
        <p style="margin: 0; color: #166534;">
          <strong>Important:</strong> Save your backup codes in a secure location. You'll need them if you lose access to your authentication device.
        </p>
      </div>

      {{% if backup_codes_url %}}
      <div style="text-align: center;">
        <a href="{{{{ backup_codes_url }}}}" class="cta-button">View Backup Codes</a>
      </div>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
    </div>
  </div>
</body>
</html>
"""

TWO_FACTOR_ENABLED_EMAIL_TEXT = """
Two-Factor Authentication Enabled

Great news! Your account is now protected with two-factor authentication.

Enabled At: {{ enabled_time }}
Method: {{ method }}

Important: Save your backup codes in a secure location. You'll need them if you lose access to your authentication device.

{% if backup_codes_url %}View backup codes: {{ backup_codes_url }}{% endif %}

---
This is a security notification for your RawDrive account.
"""

TWO_FACTOR_ENABLED_PUSH_TITLE = "2FA Enabled"
TWO_FACTOR_ENABLED_PUSH_BODY = "Two-factor authentication is now active on your account"

TWO_FACTOR_ENABLED_IN_APP_TITLE = "2FA Enabled"
TWO_FACTOR_ENABLED_IN_APP_BODY = "Two-factor authentication enabled using {{ method }}"


# =============================================================================
# SECURITY: TWO FACTOR DISABLED TEMPLATE
# =============================================================================

TWO_FACTOR_DISABLED_EMAIL_SUBJECT = "Two-factor authentication has been disabled"

TWO_FACTOR_DISABLED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>2FA Disabled</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Security Alert</span>
        <h1 class="title">Two-Factor Authentication Disabled</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Two-factor authentication has been disabled on your account.
      </p>

      <div class="info-row">
        <div class="info-label">Disabled At</div>
        <div class="info-value">{{{{ disabled_time }}}}</div>
      </div>

      {{% if device_name %}}
      <div class="info-row">
        <div class="info-label">Device</div>
        <div class="info-value">{{{{ device_name }}}}</div>
      </div>
      {{% endif %}}

      {{% if location %}}
      <div class="info-row">
        <div class="info-label">Location</div>
        <div class="info-value">{{{{ location }}}}</div>
      </div>
      {{% endif %}}

      <div class="alert-box warning">
        <p style="margin: 0; color: #92400E;">
          <strong>Your account is now less secure.</strong> We recommend re-enabling two-factor authentication to protect your account.
        </p>
      </div>

      <div style="text-align: center;">
        {{% if re_enable_url %}}
        <a href="{{{{ re_enable_url }}}}" class="security-button">Re-enable 2FA</a>
        {{% else %}}
        <a href="{{{{ secure_account_url | default(security_settings_url) }}}}" class="security-button">Security Settings</a>
        {{% endif %}}
      </div>

      <p style="text-align: center; margin-top: 24px; color: #991B1B; font-size: 14px;">
        If you didn't make this change, your account may be compromised. Please secure your account immediately.
      </p>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
    </div>
  </div>
</body>
</html>
"""

TWO_FACTOR_DISABLED_EMAIL_TEXT = """
Two-Factor Authentication Disabled

Two-factor authentication has been disabled on your account.

Disabled At: {{ disabled_time }}
{% if device_name %}Device: {{ device_name }}{% endif %}
{% if location %}Location: {{ location }}{% endif %}

Your account is now less secure. We recommend re-enabling two-factor authentication to protect your account.

{% if re_enable_url %}Re-enable 2FA: {{ re_enable_url }}{% else %}Security settings: {{ secure_account_url | default(security_settings_url) }}{% endif %}

If you didn't make this change, your account may be compromised. Please secure your account immediately.

---
This is a security notification for your RawDrive account.
"""

TWO_FACTOR_DISABLED_SMS = """RawDrive: 2FA was disabled on your account. Not you? Secure your account immediately."""

TWO_FACTOR_DISABLED_PUSH_TITLE = "2FA Disabled"
TWO_FACTOR_DISABLED_PUSH_BODY = "Two-factor authentication was disabled. Wasn't you? Act now."

TWO_FACTOR_DISABLED_IN_APP_TITLE = "2FA Disabled"
TWO_FACTOR_DISABLED_IN_APP_BODY = "Two-factor authentication was disabled on {{ disabled_time }}"


# =============================================================================
# SECURITY: SUSPICIOUS ACTIVITY TEMPLATE
# =============================================================================

SUSPICIOUS_ACTIVITY_EMAIL_SUBJECT = "Suspicious activity detected on your RawDrive account"

SUSPICIOUS_ACTIVITY_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suspicious Activity</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="error-badge">Security Alert</span>
        <h1 class="title">Suspicious Activity Detected</h1>
      </div>

      <div class="alert-box">
        <p style="margin: 0; color: #991B1B; font-weight: 600;">
          We detected unusual activity on your account that may indicate unauthorized access.
        </p>
      </div>

      <div class="info-row">
        <div class="info-label">Activity Type</div>
        <div class="info-value" style="font-weight: 600; color: #991B1B;">{{{{ activity_type }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Detected At</div>
        <div class="info-value">{{{{ activity_time }}}}</div>
      </div>

      {{% if ip_address %}}
      <div class="info-row">
        <div class="info-label">IP Address</div>
        <div class="info-value">{{{{ ip_address }}}}</div>
      </div>
      {{% endif %}}

      {{% if location %}}
      <div class="info-row">
        <div class="info-label">Location</div>
        <div class="info-value">{{{{ location }}}}</div>
      </div>
      {{% endif %}}

      {{% if details %}}
      <div class="info-row">
        <div class="info-label">Details</div>
        <div class="info-value">{{{{ details }}}}</div>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ secure_account_url | default(security_settings_url) }}}}" class="urgent-button">Secure My Account Now</a>
      </div>

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        If this was you, you can safely ignore this email.
      </p>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
      <p style="margin-top: 8px;">
        Need immediate help? Contact <a href="mailto:security@rawdrive.io" style="color: #2563EB;">security@rawdrive.io</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SUSPICIOUS_ACTIVITY_EMAIL_TEXT = """
SECURITY ALERT: Suspicious Activity Detected

We detected unusual activity on your account that may indicate unauthorized access.

Activity Type: {{ activity_type }}
Detected At: {{ activity_time }}
{% if ip_address %}IP Address: {{ ip_address }}{% endif %}
{% if location %}Location: {{ location }}{% endif %}
{% if details %}Details: {{ details }}{% endif %}

Secure your account now: {{ secure_account_url | default(security_settings_url) }}

If this was you, you can safely ignore this email.

---
This is a security notification for your RawDrive account.
Need immediate help? Contact security@rawdrive.io
"""

SUSPICIOUS_ACTIVITY_SMS = """RawDrive ALERT: Suspicious activity detected on your account. Secure it now: {{ secure_account_url | default(security_settings_url) }}"""

SUSPICIOUS_ACTIVITY_PUSH_TITLE = "Suspicious Activity!"
SUSPICIOUS_ACTIVITY_PUSH_BODY = "{{ activity_type }} detected on your account. Take action now."

SUSPICIOUS_ACTIVITY_IN_APP_TITLE = "Suspicious Activity Detected"
SUSPICIOUS_ACTIVITY_IN_APP_BODY = "{{ activity_type }} detected at {{ activity_time }}. Review your account security."


# =============================================================================
# SECURITY: ACCOUNT LOCKED TEMPLATE
# =============================================================================

ACCOUNT_LOCKED_EMAIL_SUBJECT = "Your RawDrive account has been locked"

ACCOUNT_LOCKED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Locked</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="error-badge">Account Locked</span>
        <h1 class="title">Your Account Has Been Locked</h1>
      </div>

      <div class="alert-box">
        <p style="margin: 0; color: #991B1B;">
          Your account has been temporarily locked for security reasons.
        </p>
      </div>

      <div class="info-row">
        <div class="info-label">Reason</div>
        <div class="info-value" style="font-weight: 600;">{{{{ lock_reason }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Locked At</div>
        <div class="info-value">{{{{ lock_time }}}}</div>
      </div>

      {{% if auto_unlock_time %}}
      <div class="info-row">
        <div class="info-label">Auto-Unlock</div>
        <div class="info-value">{{{{ auto_unlock_time }}}}</div>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        {{% if unlock_url %}}
        <a href="{{{{ unlock_url }}}}" class="urgent-button">Unlock My Account</a>
        {{% endif %}}
        <br>
        <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" class="secondary-button">Contact Support</a>
      </div>

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        If you believe this was a mistake, please contact our support team for assistance.
      </p>
    </div>

    <div class="footer">
      <p>This is a security notification for your RawDrive account.</p>
    </div>
  </div>
</body>
</html>
"""

ACCOUNT_LOCKED_EMAIL_TEXT = """
Your Account Has Been Locked

Your account has been temporarily locked for security reasons.

Reason: {{ lock_reason }}
Locked At: {{ lock_time }}
{% if auto_unlock_time %}Auto-Unlock: {{ auto_unlock_time }}{% endif %}

{% if unlock_url %}Unlock your account: {{ unlock_url }}{% endif %}
Contact support: {{ support_url | default('https://rawdrive.io/support') }}

If you believe this was a mistake, please contact our support team for assistance.

---
This is a security notification for your RawDrive account.
"""

ACCOUNT_LOCKED_SMS = """RawDrive: Your account has been locked. Reason: {{ lock_reason }}. Contact support for help."""

ACCOUNT_LOCKED_PUSH_TITLE = "Account Locked"
ACCOUNT_LOCKED_PUSH_BODY = "Your account was locked: {{ lock_reason }}"

ACCOUNT_LOCKED_IN_APP_TITLE = "Account Locked"
ACCOUNT_LOCKED_IN_APP_BODY = "Your account was locked: {{ lock_reason }}"


# =============================================================================
# VERIFICATION: EMAIL CONFIRM TEMPLATE
# =============================================================================

EMAIL_CONFIRM_EMAIL_SUBJECT = "Verify your email address"

EMAIL_CONFIRM_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Email</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">Verify Email</span>
        <h1 class="title">Confirm Your Email Address</h1>
      </div>

      {{% if user_name %}}
      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Hi {{{{ user_name }}}}, please verify your email to complete your registration.
      </p>
      {{% else %}}
      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Please verify your email address to complete your registration.
      </p>
      {{% endif %}}

      <div class="countdown-box">
        <p style="margin: 0; color: #92400E; font-weight: 500;">This link expires in</p>
        <div class="countdown-number">{{{{ expiry_hours }}}}</div>
        <div class="countdown-label">hours</div>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ verification_link }}}}" class="cta-button">Verify Email Address</a>
      </div>

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        If you didn't create a RawDrive account, you can safely ignore this email.
      </p>
    </div>

    <div class="footer">
      <p>This is a verification email for RawDrive.</p>
      <p style="margin-top: 8px; font-size: 11px; color: #94A3B8;">
        Button not working? Copy and paste this link: {{{{ verification_link }}}}
      </p>
    </div>
  </div>
</body>
</html>
"""

EMAIL_CONFIRM_EMAIL_TEXT = """
Confirm Your Email Address

{% if user_name %}Hi {{ user_name }}, please{% else %}Please{% endif %} verify your email address to complete your registration.

Verify your email: {{ verification_link }}

This link expires in {{ expiry_hours }} hours.

If you didn't create a RawDrive account, you can safely ignore this email.

---
This is a verification email for RawDrive.
"""

EMAIL_CONFIRM_PUSH_TITLE = "Verify Your Email"
EMAIL_CONFIRM_PUSH_BODY = "Check your email to verify your RawDrive account"

EMAIL_CONFIRM_IN_APP_TITLE = "Email Verification Required"
EMAIL_CONFIRM_IN_APP_BODY = "Please check your email and click the verification link"


# =============================================================================
# VERIFICATION: EMAIL RESEND TEMPLATE
# =============================================================================

EMAIL_RESEND_EMAIL_SUBJECT = "Your new verification link"

EMAIL_RESEND_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Verification Link</title>
  {SYSTEM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">New Link</span>
        <h1 class="title">Here's Your New Verification Link</h1>
      </div>

      {{% if user_name %}}
      <p style="text-align: center; color: #475569; margin: 24px 0;">
        Hi {{{{ user_name }}}}, you requested a new email verification link. Use the button below to verify your email.
      </p>
      {{% else %}}
      <p style="text-align: center; color: #475569; margin: 24px 0;">
        You requested a new email verification link. Use the button below to verify your email.
      </p>
      {{% endif %}}

      <div class="countdown-box">
        <p style="margin: 0; color: #92400E; font-weight: 500;">This link expires in</p>
        <div class="countdown-number">{{{{ expiry_hours }}}}</div>
        <div class="countdown-label">hours</div>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ verification_link }}}}" class="cta-button">Verify Email Address</a>
      </div>

      {{% if resend_count and resend_count > 2 %}}
      <div class="alert-box warning" style="margin-top: 24px;">
        <p style="margin: 0; color: #92400E;">
          Having trouble? Make sure to check your spam folder, or <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #92400E;">contact support</a>.
        </p>
      </div>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>This is a verification email for RawDrive.</p>
    </div>
  </div>
</body>
</html>
"""

EMAIL_RESEND_EMAIL_TEXT = """
Here's Your New Verification Link

{% if user_name %}Hi {{ user_name }}, you{% else %}You{% endif %} requested a new email verification link. Use the link below to verify your email.

Verify your email: {{ verification_link }}

This link expires in {{ expiry_hours }} hours.

{% if resend_count and resend_count > 2 %}Having trouble? Check your spam folder or contact support at {{ support_url | default('https://rawdrive.io/support') }}{% endif %}

---
This is a verification email for RawDrive.
"""

EMAIL_RESEND_PUSH_TITLE = "New Verification Link"
EMAIL_RESEND_PUSH_BODY = "Check your email for a new verification link"

EMAIL_RESEND_IN_APP_TITLE = "Verification Link Sent"
EMAIL_RESEND_IN_APP_BODY = "A new verification link has been sent to your email"


# =============================================================================
# VERIFICATION: PHONE CONFIRM TEMPLATE (SMS only)
# =============================================================================

PHONE_CONFIRM_SMS = """RawDrive: Your verification code is {{ verification_code }}. Expires in {{ expiry_minutes }} minutes. Do not share this code."""


# =============================================================================
# TEMPLATE DEFINITIONS
# =============================================================================

SYSTEM_TEMPLATES: dict[str, SystemTemplate] = {
    # System events
    "system_welcome": SystemTemplate(
        event_type=EventType.SYSTEM_WELCOME,
        code="system_welcome",
        name="Welcome Email",
        description="Welcome email for new users with onboarding information",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=WELCOME_EMAIL_SUBJECT,
        email_html=WELCOME_EMAIL_HTML,
        email_text=WELCOME_EMAIL_TEXT,
        push_title=WELCOME_PUSH_TITLE,
        push_body=WELCOME_PUSH_BODY,
        push_action_url="{{ getting_started_url | default(dashboard_url) }}",
        in_app_title=WELCOME_IN_APP_TITLE,
        in_app_body=WELCOME_IN_APP_BODY,
        in_app_action_url="/getting-started",
        in_app_icon="welcome",
        required_variables=["user_name"],
        optional_variables=[
            "getting_started_url",
            "dashboard_url",
            "support_url",
            "features",
            "unsubscribe_url",
        ],
        default_values={
            "dashboard_url": "https://app.rawdrive.io",
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["transactional", "onboarding", "welcome"],
    ),
    "system_maintenance_scheduled": SystemTemplate(
        event_type=EventType.SYSTEM_MAINTENANCE_SCHEDULED,
        code="system_maintenance_scheduled",
        name="Scheduled Maintenance Notice",
        description="Advance notice of planned system maintenance",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=False,
        email_subject=MAINTENANCE_SCHEDULED_EMAIL_SUBJECT,
        email_html=MAINTENANCE_SCHEDULED_EMAIL_HTML,
        email_text=MAINTENANCE_SCHEDULED_EMAIL_TEXT,
        push_title=MAINTENANCE_SCHEDULED_PUSH_TITLE,
        push_body=MAINTENANCE_SCHEDULED_PUSH_BODY,
        in_app_title=MAINTENANCE_SCHEDULED_IN_APP_TITLE,
        in_app_body=MAINTENANCE_SCHEDULED_IN_APP_BODY,
        in_app_action_url="{{ status_page_url }}",
        in_app_icon="maintenance",
        required_variables=["maintenance_start", "maintenance_end", "affected_services"],
        optional_variables=["reason", "status_page_url"],
        tags=["system", "maintenance"],
    ),
    "system_maintenance_complete": SystemTemplate(
        event_type=EventType.SYSTEM_MAINTENANCE_COMPLETE,
        code="system_maintenance_complete",
        name="Maintenance Complete Notice",
        description="Notification that system maintenance is finished",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.LOW,
        is_transactional=False,
        email_subject=MAINTENANCE_COMPLETE_EMAIL_SUBJECT,
        email_html=MAINTENANCE_COMPLETE_EMAIL_HTML,
        email_text=MAINTENANCE_COMPLETE_EMAIL_TEXT,
        push_title=MAINTENANCE_COMPLETE_PUSH_TITLE,
        push_body=MAINTENANCE_COMPLETE_PUSH_BODY,
        in_app_title=MAINTENANCE_COMPLETE_IN_APP_TITLE,
        in_app_body=MAINTENANCE_COMPLETE_IN_APP_BODY,
        in_app_icon="check",
        required_variables=["maintenance_end"],
        optional_variables=["summary", "status_page_url", "dashboard_url"],
        default_values={
            "dashboard_url": "https://app.rawdrive.io",
        },
        tags=["system", "maintenance"],
    ),
    "system_feature_announcement": SystemTemplate(
        event_type=EventType.SYSTEM_FEATURE_ANNOUNCEMENT,
        code="system_feature_announcement",
        name="New Feature Announcement",
        description="Announcement of new platform features",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.LOW,
        is_transactional=False,
        email_subject=FEATURE_ANNOUNCEMENT_EMAIL_SUBJECT,
        email_html=FEATURE_ANNOUNCEMENT_EMAIL_HTML,
        email_text=FEATURE_ANNOUNCEMENT_EMAIL_TEXT,
        push_title=FEATURE_ANNOUNCEMENT_PUSH_TITLE,
        push_body=FEATURE_ANNOUNCEMENT_PUSH_BODY,
        push_action_url="{{ try_it_url | default(learn_more_url) }}",
        in_app_title=FEATURE_ANNOUNCEMENT_IN_APP_TITLE,
        in_app_body=FEATURE_ANNOUNCEMENT_IN_APP_BODY,
        in_app_action_url="{{ try_it_url | default(learn_more_url) }}",
        in_app_icon="sparkle",
        required_variables=["feature_name", "feature_description"],
        optional_variables=["learn_more_url", "try_it_url", "video_url", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["product", "announcement"],
    ),
    "system_policy_update": SystemTemplate(
        event_type=EventType.SYSTEM_POLICY_UPDATE,
        code="system_policy_update",
        name="Policy Update Notice",
        description="Notification of terms or privacy policy updates",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        email_subject=POLICY_UPDATE_EMAIL_SUBJECT,
        email_html=POLICY_UPDATE_EMAIL_HTML,
        email_text=POLICY_UPDATE_EMAIL_TEXT,
        push_title=POLICY_UPDATE_PUSH_TITLE,
        push_body=POLICY_UPDATE_PUSH_BODY,
        push_action_url="{{ full_policy_url }}",
        in_app_title=POLICY_UPDATE_IN_APP_TITLE,
        in_app_body=POLICY_UPDATE_IN_APP_BODY,
        in_app_action_url="{{ full_policy_url }}",
        in_app_icon="document",
        required_variables=["policy_type", "effective_date"],
        optional_variables=["summary", "full_policy_url", "support_url"],
        tags=["transactional", "legal"],
    ),
    "system_storage_warning": SystemTemplate(
        event_type=EventType.SYSTEM_STORAGE_WARNING,
        code="system_storage_warning",
        name="Storage Warning",
        description="Alert when approaching storage limit",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=False,
        email_subject=STORAGE_WARNING_EMAIL_SUBJECT,
        email_html=STORAGE_WARNING_EMAIL_HTML,
        email_text=STORAGE_WARNING_EMAIL_TEXT,
        sms_content=STORAGE_WARNING_SMS,
        push_title=STORAGE_WARNING_PUSH_TITLE,
        push_body=STORAGE_WARNING_PUSH_BODY,
        push_action_url="{{ upgrade_url | default(manage_storage_url) }}",
        in_app_title=STORAGE_WARNING_IN_APP_TITLE,
        in_app_body=STORAGE_WARNING_IN_APP_BODY,
        in_app_action_url="/settings/storage",
        in_app_icon="storage",
        required_variables=["current_usage_gb", "limit_gb", "percentage"],
        optional_variables=[
            "upgrade_url",
            "manage_storage_url",
            "dashboard_url",
            "cleanup_suggestions",
            "unsubscribe_url",
        ],
        tags=["usage", "action-required"],
    ),
    "system_storage_full": SystemTemplate(
        event_type=EventType.SYSTEM_STORAGE_FULL,
        code="system_storage_full",
        name="Storage Full Alert",
        description="Alert when storage limit is reached",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        email_subject=STORAGE_FULL_EMAIL_SUBJECT,
        email_html=STORAGE_FULL_EMAIL_HTML,
        email_text=STORAGE_FULL_EMAIL_TEXT,
        sms_content=STORAGE_FULL_SMS,
        push_title=STORAGE_FULL_PUSH_TITLE,
        push_body=STORAGE_FULL_PUSH_BODY,
        push_action_url="{{ upgrade_url | default(dashboard_url) }}",
        in_app_title=STORAGE_FULL_IN_APP_TITLE,
        in_app_body=STORAGE_FULL_IN_APP_BODY,
        in_app_action_url="/settings/storage",
        in_app_icon="alert",
        required_variables=["current_usage_gb", "limit_gb"],
        optional_variables=["upgrade_url", "cleanup_url", "support_url", "dashboard_url"],
        default_values={
            "dashboard_url": "https://app.rawdrive.io",
        },
        tags=["transactional", "usage", "action-required"],
    ),

    # Security events
    "security_login_new_device": SystemTemplate(
        event_type=EventType.SECURITY_LOGIN_NEW_DEVICE,
        code="security_login_new_device",
        name="New Device Login Alert",
        description="Alert when account is accessed from a new device",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=LOGIN_NEW_DEVICE_EMAIL_SUBJECT,
        email_html=LOGIN_NEW_DEVICE_EMAIL_HTML,
        email_text=LOGIN_NEW_DEVICE_EMAIL_TEXT,
        sms_content=LOGIN_NEW_DEVICE_SMS,
        push_title=LOGIN_NEW_DEVICE_PUSH_TITLE,
        push_body=LOGIN_NEW_DEVICE_PUSH_BODY,
        push_action_url="{{ secure_account_url }}",
        in_app_title=LOGIN_NEW_DEVICE_IN_APP_TITLE,
        in_app_body=LOGIN_NEW_DEVICE_IN_APP_BODY,
        in_app_action_url="/settings/security",
        in_app_icon="device",
        required_variables=["device_type", "device_name", "login_time"],
        optional_variables=[
            "ip_address",
            "location",
            "browser",
            "secure_account_url",
            "security_settings_url",
        ],
        tags=["transactional", "security"],
    ),
    "security_login_new_location": SystemTemplate(
        event_type=EventType.SECURITY_LOGIN_NEW_LOCATION,
        code="security_login_new_location",
        name="New Location Login Alert",
        description="Alert when account is accessed from an unusual location",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=LOGIN_NEW_LOCATION_EMAIL_SUBJECT,
        email_html=LOGIN_NEW_LOCATION_EMAIL_HTML,
        email_text=LOGIN_NEW_LOCATION_EMAIL_TEXT,
        sms_content=LOGIN_NEW_LOCATION_SMS,
        push_title=LOGIN_NEW_LOCATION_PUSH_TITLE,
        push_body=LOGIN_NEW_LOCATION_PUSH_BODY,
        push_action_url="{{ secure_account_url }}",
        in_app_title=LOGIN_NEW_LOCATION_IN_APP_TITLE,
        in_app_body=LOGIN_NEW_LOCATION_IN_APP_BODY,
        in_app_action_url="/settings/security",
        in_app_icon="location",
        required_variables=["location", "login_time"],
        optional_variables=[
            "device_name",
            "ip_address",
            "secure_account_url",
            "security_settings_url",
        ],
        tags=["transactional", "security"],
    ),
    "security_password_changed": SystemTemplate(
        event_type=EventType.SECURITY_PASSWORD_CHANGED,
        code="security_password_changed",
        name="Password Changed Confirmation",
        description="Confirmation when password is changed",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=PASSWORD_CHANGED_EMAIL_SUBJECT,
        email_html=PASSWORD_CHANGED_EMAIL_HTML,
        email_text=PASSWORD_CHANGED_EMAIL_TEXT,
        push_title=PASSWORD_CHANGED_PUSH_TITLE,
        push_body=PASSWORD_CHANGED_PUSH_BODY,
        push_action_url="{{ secure_account_url }}",
        in_app_title=PASSWORD_CHANGED_IN_APP_TITLE,
        in_app_body=PASSWORD_CHANGED_IN_APP_BODY,
        in_app_action_url="/settings/security",
        in_app_icon="key",
        required_variables=["change_time"],
        optional_variables=[
            "device_name",
            "location",
            "secure_account_url",
            "security_settings_url",
        ],
        tags=["transactional", "security"],
    ),
    "security_password_reset_requested": SystemTemplate(
        event_type=EventType.SECURITY_PASSWORD_RESET_REQUESTED,
        code="security_password_reset_requested",
        name="Password Reset Request",
        description="Email with password reset link",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        email_subject=PASSWORD_RESET_REQUESTED_EMAIL_SUBJECT,
        email_html=PASSWORD_RESET_REQUESTED_EMAIL_HTML,
        email_text=PASSWORD_RESET_REQUESTED_EMAIL_TEXT,
        sms_content=PASSWORD_RESET_REQUESTED_SMS,
        push_title=PASSWORD_RESET_REQUESTED_PUSH_TITLE,
        push_body=PASSWORD_RESET_REQUESTED_PUSH_BODY,
        in_app_title=PASSWORD_RESET_REQUESTED_IN_APP_TITLE,
        in_app_body=PASSWORD_RESET_REQUESTED_IN_APP_BODY,
        in_app_icon="key",
        required_variables=["reset_link", "expiry_minutes"],
        optional_variables=["ip_address", "location"],
        tags=["transactional", "security", "action-required"],
    ),
    "security_password_reset_complete": SystemTemplate(
        event_type=EventType.SECURITY_PASSWORD_RESET_COMPLETE,
        code="security_password_reset_complete",
        name="Password Reset Complete",
        description="Confirmation that password was reset",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=PASSWORD_RESET_COMPLETE_EMAIL_SUBJECT,
        email_html=PASSWORD_RESET_COMPLETE_EMAIL_HTML,
        email_text=PASSWORD_RESET_COMPLETE_EMAIL_TEXT,
        push_title=PASSWORD_RESET_COMPLETE_PUSH_TITLE,
        push_body=PASSWORD_RESET_COMPLETE_PUSH_BODY,
        in_app_title=PASSWORD_RESET_COMPLETE_IN_APP_TITLE,
        in_app_body=PASSWORD_RESET_COMPLETE_IN_APP_BODY,
        in_app_action_url="/login",
        in_app_icon="check",
        required_variables=["reset_time"],
        optional_variables=["device_name", "location", "login_url", "secure_account_url"],
        default_values={
            "login_url": "https://app.rawdrive.io/login",
        },
        tags=["transactional", "security"],
    ),
    "security_email_changed": SystemTemplate(
        event_type=EventType.SECURITY_EMAIL_CHANGED,
        code="security_email_changed",
        name="Email Changed Alert",
        description="Alert when account email is changed (sent to both old and new)",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=EMAIL_CHANGED_EMAIL_SUBJECT,
        email_html=EMAIL_CHANGED_EMAIL_HTML,
        email_text=EMAIL_CHANGED_EMAIL_TEXT,
        sms_content=EMAIL_CHANGED_SMS,
        push_title=EMAIL_CHANGED_PUSH_TITLE,
        push_body=EMAIL_CHANGED_PUSH_BODY,
        push_action_url="{{ secure_account_url }}",
        in_app_title=EMAIL_CHANGED_IN_APP_TITLE,
        in_app_body=EMAIL_CHANGED_IN_APP_BODY,
        in_app_action_url="/settings/security",
        in_app_icon="email",
        required_variables=["old_email", "new_email", "change_time"],
        optional_variables=["revert_url", "secure_account_url", "security_settings_url"],
        tags=["transactional", "security"],
    ),
    "security_two_factor_enabled": SystemTemplate(
        event_type=EventType.SECURITY_TWO_FACTOR_ENABLED,
        code="security_two_factor_enabled",
        name="Two-Factor Enabled",
        description="Confirmation when 2FA is enabled",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        email_subject=TWO_FACTOR_ENABLED_EMAIL_SUBJECT,
        email_html=TWO_FACTOR_ENABLED_EMAIL_HTML,
        email_text=TWO_FACTOR_ENABLED_EMAIL_TEXT,
        push_title=TWO_FACTOR_ENABLED_PUSH_TITLE,
        push_body=TWO_FACTOR_ENABLED_PUSH_BODY,
        in_app_title=TWO_FACTOR_ENABLED_IN_APP_TITLE,
        in_app_body=TWO_FACTOR_ENABLED_IN_APP_BODY,
        in_app_action_url="/settings/security",
        in_app_icon="shield",
        required_variables=["enabled_time", "method"],
        optional_variables=["backup_codes_url"],
        tags=["transactional", "security"],
    ),
    "security_two_factor_disabled": SystemTemplate(
        event_type=EventType.SECURITY_TWO_FACTOR_DISABLED,
        code="security_two_factor_disabled",
        name="Two-Factor Disabled Alert",
        description="Alert when 2FA is disabled",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=TWO_FACTOR_DISABLED_EMAIL_SUBJECT,
        email_html=TWO_FACTOR_DISABLED_EMAIL_HTML,
        email_text=TWO_FACTOR_DISABLED_EMAIL_TEXT,
        sms_content=TWO_FACTOR_DISABLED_SMS,
        push_title=TWO_FACTOR_DISABLED_PUSH_TITLE,
        push_body=TWO_FACTOR_DISABLED_PUSH_BODY,
        push_action_url="{{ re_enable_url | default(secure_account_url) }}",
        in_app_title=TWO_FACTOR_DISABLED_IN_APP_TITLE,
        in_app_body=TWO_FACTOR_DISABLED_IN_APP_BODY,
        in_app_action_url="/settings/security",
        in_app_icon="shield-off",
        required_variables=["disabled_time"],
        optional_variables=[
            "device_name",
            "location",
            "re_enable_url",
            "secure_account_url",
            "security_settings_url",
        ],
        tags=["transactional", "security"],
    ),
    "security_suspicious_activity": SystemTemplate(
        event_type=EventType.SECURITY_SUSPICIOUS_ACTIVITY,
        code="security_suspicious_activity",
        name="Suspicious Activity Alert",
        description="Alert when suspicious activity is detected",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        email_subject=SUSPICIOUS_ACTIVITY_EMAIL_SUBJECT,
        email_html=SUSPICIOUS_ACTIVITY_EMAIL_HTML,
        email_text=SUSPICIOUS_ACTIVITY_EMAIL_TEXT,
        sms_content=SUSPICIOUS_ACTIVITY_SMS,
        push_title=SUSPICIOUS_ACTIVITY_PUSH_TITLE,
        push_body=SUSPICIOUS_ACTIVITY_PUSH_BODY,
        push_action_url="{{ secure_account_url }}",
        in_app_title=SUSPICIOUS_ACTIVITY_IN_APP_TITLE,
        in_app_body=SUSPICIOUS_ACTIVITY_IN_APP_BODY,
        in_app_action_url="/settings/security",
        in_app_icon="alert",
        required_variables=["activity_type", "activity_time"],
        optional_variables=[
            "ip_address",
            "location",
            "details",
            "secure_account_url",
            "security_settings_url",
        ],
        tags=["transactional", "security", "action-required"],
    ),
    "security_account_locked": SystemTemplate(
        event_type=EventType.SECURITY_ACCOUNT_LOCKED,
        code="security_account_locked",
        name="Account Locked Notification",
        description="Notification when account is locked due to security",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        email_subject=ACCOUNT_LOCKED_EMAIL_SUBJECT,
        email_html=ACCOUNT_LOCKED_EMAIL_HTML,
        email_text=ACCOUNT_LOCKED_EMAIL_TEXT,
        sms_content=ACCOUNT_LOCKED_SMS,
        push_title=ACCOUNT_LOCKED_PUSH_TITLE,
        push_body=ACCOUNT_LOCKED_PUSH_BODY,
        in_app_title=ACCOUNT_LOCKED_IN_APP_TITLE,
        in_app_body=ACCOUNT_LOCKED_IN_APP_BODY,
        in_app_icon="lock",
        required_variables=["lock_reason", "lock_time"],
        optional_variables=["unlock_url", "support_url", "auto_unlock_time"],
        default_values={
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "security", "action-required"],
    ),

    # Verification events
    "verification_email_confirm": SystemTemplate(
        event_type=EventType.VERIFICATION_EMAIL_CONFIRM,
        code="verification_email_confirm",
        name="Email Verification",
        description="Email verification link for new accounts",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        email_subject=EMAIL_CONFIRM_EMAIL_SUBJECT,
        email_html=EMAIL_CONFIRM_EMAIL_HTML,
        email_text=EMAIL_CONFIRM_EMAIL_TEXT,
        push_title=EMAIL_CONFIRM_PUSH_TITLE,
        push_body=EMAIL_CONFIRM_PUSH_BODY,
        in_app_title=EMAIL_CONFIRM_IN_APP_TITLE,
        in_app_body=EMAIL_CONFIRM_IN_APP_BODY,
        in_app_icon="email",
        required_variables=["verification_link", "expiry_hours"],
        optional_variables=["user_name"],
        tags=["transactional", "verification", "action-required"],
    ),
    "verification_email_resend": SystemTemplate(
        event_type=EventType.VERIFICATION_EMAIL_RESEND,
        code="verification_email_resend",
        name="Email Verification Resent",
        description="Resent email verification link",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        email_subject=EMAIL_RESEND_EMAIL_SUBJECT,
        email_html=EMAIL_RESEND_EMAIL_HTML,
        email_text=EMAIL_RESEND_EMAIL_TEXT,
        push_title=EMAIL_RESEND_PUSH_TITLE,
        push_body=EMAIL_RESEND_PUSH_BODY,
        in_app_title=EMAIL_RESEND_IN_APP_TITLE,
        in_app_body=EMAIL_RESEND_IN_APP_BODY,
        in_app_icon="email",
        required_variables=["verification_link", "expiry_hours"],
        optional_variables=["user_name", "resend_count", "support_url"],
        default_values={
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "verification", "action-required"],
    ),
    "verification_phone_confirm": SystemTemplate(
        event_type=EventType.VERIFICATION_PHONE_CONFIRM,
        code="verification_phone_confirm",
        name="Phone Verification",
        description="Phone verification code via SMS",
        category=NotificationCategory.SYSTEM_ALERTS,
        supported_channels=[
            NotificationChannel.SMS,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        sms_content=PHONE_CONFIRM_SMS,
        in_app_icon="phone",
        required_variables=["verification_code", "expiry_minutes"],
        tags=["transactional", "verification", "sms"],
    ),
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_system_template(template_code: str) -> SystemTemplate | None:
    """Get a system template by its code.

    Args:
        template_code: The template code (e.g., 'system_welcome')

    Returns:
        SystemTemplate or None if not found
    """
    return SYSTEM_TEMPLATES.get(template_code)


def get_template_for_event(event_type: EventType | str) -> SystemTemplate | None:
    """Get a system template by its event type.

    Args:
        event_type: The event type enum or string value

    Returns:
        SystemTemplate or None if not found
    """
    if isinstance(event_type, str):
        try:
            event_type = EventType(event_type)
        except ValueError:
            return None

    for template in SYSTEM_TEMPLATES.values():
        if template.event_type == event_type:
            return template
    return None


def list_system_templates() -> list[str]:
    """Get a list of all system template codes.

    Returns:
        List of template codes
    """
    return list(SYSTEM_TEMPLATES.keys())


def get_template_variable_schema(template_code: str) -> dict[str, Any] | None:
    """Get the variable schema for a template.

    Args:
        template_code: The template code

    Returns:
        Dict with 'required' and 'optional' keys, or None if template not found
    """
    template = get_system_template(template_code)
    if not template:
        return None

    return {
        "required": template.required_variables,
        "optional": template.optional_variables,
    }


def get_templates_by_channel(channel: NotificationChannel) -> list[SystemTemplate]:
    """Get all templates that support a specific channel.

    Args:
        channel: The notification channel

    Returns:
        List of SystemTemplate instances
    """
    return [
        template
        for template in SYSTEM_TEMPLATES.values()
        if channel in template.supported_channels
    ]


def get_templates_by_priority(priority: NotificationPriority) -> list[SystemTemplate]:
    """Get all templates with a specific priority.

    Args:
        priority: The notification priority

    Returns:
        List of SystemTemplate instances
    """
    return [
        template
        for template in SYSTEM_TEMPLATES.values()
        if template.default_priority == priority
    ]


def get_security_templates() -> list[SystemTemplate]:
    """Get all security-related system templates.

    Returns:
        List of SystemTemplate instances with 'security' tag
    """
    return [
        template
        for template in SYSTEM_TEMPLATES.values()
        if "security" in template.tags
    ]


def get_verification_templates() -> list[SystemTemplate]:
    """Get all verification-related system templates.

    Returns:
        List of SystemTemplate instances with 'verification' tag
    """
    return [
        template
        for template in SYSTEM_TEMPLATES.values()
        if "verification" in template.tags
    ]


def get_transactional_templates() -> list[SystemTemplate]:
    """Get all transactional system templates.

    Transactional templates cannot be disabled by user preferences.

    Returns:
        List of transactional SystemTemplate instances
    """
    return [
        template
        for template in SYSTEM_TEMPLATES.values()
        if template.is_transactional
    ]


def get_maintenance_templates() -> list[SystemTemplate]:
    """Get all maintenance-related system templates.

    Returns:
        List of SystemTemplate instances with 'maintenance' tag
    """
    return [
        template
        for template in SYSTEM_TEMPLATES.values()
        if "maintenance" in template.tags
    ]


def get_action_required_templates() -> list[SystemTemplate]:
    """Get all templates that require user action.

    Returns:
        List of SystemTemplate instances with 'action-required' tag
    """
    return [
        template
        for template in SYSTEM_TEMPLATES.values()
        if "action-required" in template.tags
    ]


# =============================================================================
# EXPORTS
# =============================================================================


__all__ = [
    # Data class
    "SystemTemplate",
    # Template registry
    "SYSTEM_TEMPLATES",
    # Helper functions
    "get_system_template",
    "get_template_for_event",
    "list_system_templates",
    "get_template_variable_schema",
    "get_templates_by_channel",
    "get_templates_by_priority",
    "get_security_templates",
    "get_verification_templates",
    "get_transactional_templates",
    "get_maintenance_templates",
    "get_action_required_templates",
    # Common styles (for custom templates)
    "SYSTEM_EMAIL_STYLES",
]
