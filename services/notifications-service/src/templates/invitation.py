"""Invitation notification templates for the Notifications & Communication Microservice.

This module provides default templates for all invitation-related notification events:
- Invitation sent (to invitee)
- Invitation accepted (to inviter)
- Invitation declined (to inviter)
- Invitation expired (to inviter)
- Invitation reminder (to invitee)
- Invitation cancelled (to invitee)

Each template includes:
- Email content (subject, HTML, plain text)
- SMS content (for supported events)
- Push notification content
- In-app notification content
- Variable schema definitions
- Default values for optional variables

Invitation-sent templates are marked as transactional (cannot be disabled by user
preferences) as they are critical for workspace collaboration.

Templates use Jinja2 syntax for variable substitution: {{ variable_name }}

Feature: Notifications & Communication Microservice
Task: T041 - Create invitation notification templates
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
class InvitationTemplate:
    """Complete template definition for an invitation notification.

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
    in_app_icon: str = "invitation"

    # Variable schema
    required_variables: list[str] = field(default_factory=list)
    optional_variables: list[str] = field(default_factory=list)
    default_values: dict[str, Any] = field(default_factory=dict)

    # Tags for categorization
    tags: list[str] = field(default_factory=list)


# =============================================================================
# COMMON HTML STYLES FOR INVITATION TEMPLATES
# =============================================================================

INVITATION_EMAIL_STYLES = """
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
  .workspace-card {
    background: linear-gradient(135deg, #EFF6FF, #DBEAFE);
    border: 1px solid #BFDBFE;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    margin: 24px 0;
  }
  .workspace-name {
    font-size: 20px;
    font-weight: 700;
    color: #1E40AF;
    margin: 0 0 8px;
  }
  .workspace-role {
    font-size: 14px;
    color: #3B82F6;
    text-transform: capitalize;
  }
  .inviter-section {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 24px 0;
  }
  .inviter-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #2563EB, #1D4ED8);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FFFFFF;
    font-weight: 700;
    font-size: 18px;
  }
  .inviter-info {
    text-align: left;
  }
  .inviter-name {
    font-weight: 600;
    color: #0F172A;
  }
  .inviter-label {
    font-size: 12px;
    color: #64748B;
  }
  .message-box {
    background: #F8FAFC;
    border-radius: 8px;
    padding: 16px;
    margin: 24px 0;
    font-style: italic;
    color: #475569;
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
  .invite-badge {
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
  .accept-button {
    display: inline-block;
    background: linear-gradient(135deg, #22C55E, #16A34A);
    color: #FFFFFF !important;
    padding: 14px 32px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    margin: 12px 8px;
  }
  .decline-button {
    display: inline-block;
    background: #F1F5F9;
    color: #64748B !important;
    padding: 14px 24px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    margin: 12px 8px;
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
  .footer {
    text-align: center;
    margin-top: 32px;
    font-size: 12px;
    color: #64748B;
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
  .permissions-list {
    background: #F8FAFC;
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
  }
  .permissions-list ul {
    margin: 0;
    padding-left: 20px;
  }
  .permissions-list li {
    margin: 8px 0;
    color: #475569;
  }
</style>
"""


# =============================================================================
# INVITATION SENT TEMPLATE (to invitee)
# =============================================================================

INVITATION_SENT_EMAIL_SUBJECT = "{{ inviter_name }} invited you to join {{ workspace_name }}"

INVITATION_SENT_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited!</title>
  {INVITATION_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="invite-badge">You're Invited!</span>
        <h1 class="title">Join {{{{ workspace_name }}}}</h1>
      </div>

      <div class="inviter-section">
        <div class="inviter-avatar">{{{{ inviter_name[0] | upper }}}}</div>
        <div class="inviter-info">
          <div class="inviter-name">{{{{ inviter_name }}}}</div>
          <div class="inviter-label">invited you to collaborate</div>
        </div>
      </div>

      <div class="workspace-card">
        <div class="workspace-name">{{{{ workspace_name }}}}</div>
        {{% if role %}}
        <div class="workspace-role">Role: {{{{ role }}}}</div>
        {{% endif %}}
      </div>

      {{% if message %}}
      <div class="message-box">
        "{{{{ message }}}}"
        <div style="margin-top: 8px; font-style: normal; font-size: 12px; color: #94A3B8;">
          &mdash; {{{{ inviter_name }}}}
        </div>
      </div>
      {{% endif %}}

      {{% if role_permissions %}}
      <div class="permissions-list">
        <div style="font-weight: 600; margin-bottom: 12px; color: #0F172A;">
          As a{{{{ 'n' if role[0] | lower in ['a', 'e', 'i', 'o', 'u'] else '' }}}} {{{{ role }}}}, you'll be able to:
        </div>
        <ul>
          {{% for permission in role_permissions %}}
          <li>{{{{ permission }}}}</li>
          {{% endfor %}}
        </ul>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ accept_url }}}}" class="accept-button">Accept Invitation</a>
        {{% if decline_url %}}
        <a href="{{{{ decline_url }}}}" class="decline-button">Decline</a>
        {{% endif %}}
      </div>

      {{% if expiry_date %}}
      <p style="text-align: center; margin-top: 24px; font-size: 14px; color: #64748B;">
        This invitation expires on {{{{ expiry_date }}}}
      </p>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>This invitation was sent by {{{{ inviter_name }}}} via RawDrive</p>
      <p style="margin-top: 8px;">
        If you don't recognize this invitation, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>
"""

INVITATION_SENT_EMAIL_TEXT = """
You're Invited to Join {{ workspace_name }}!

{{ inviter_name }} has invited you to join {{ workspace_name }} on RawDrive.

{% if role %}
Your Role: {{ role }}
{% endif %}

{% if message %}
Message from {{ inviter_name }}:
"{{ message }}"
{% endif %}

Accept the invitation: {{ accept_url }}

{% if expiry_date %}
Note: This invitation expires on {{ expiry_date }}
{% endif %}

---
This invitation was sent by {{ inviter_name }} via RawDrive.
If you don't recognize this invitation, you can safely ignore this email.
"""

INVITATION_SENT_SMS = """{{ inviter_name }} invited you to {{ workspace_name }} on RawDrive. Join: {{ accept_url }}"""

INVITATION_SENT_PUSH_TITLE = "You're Invited!"
INVITATION_SENT_PUSH_BODY = "{{ inviter_name }} invited you to join {{ workspace_name }}"

INVITATION_SENT_IN_APP_TITLE = "Workspace Invitation"
INVITATION_SENT_IN_APP_BODY = "{{ inviter_name }} invited you to join {{ workspace_name }}"


# =============================================================================
# INVITATION ACCEPTED TEMPLATE (to inviter)
# =============================================================================

INVITATION_ACCEPTED_EMAIL_SUBJECT = "{{ invitee_name }} accepted your invitation to {{ workspace_name }}"

INVITATION_ACCEPTED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation Accepted</title>
  {INVITATION_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Invitation Accepted</span>
        <h1 class="title">New Team Member!</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 18px; color: #475569;">
          <strong>{{{{ invitee_name }}}}</strong> has joined <strong>{{{{ workspace_name }}}}</strong>
        </p>
      </div>

      <div class="workspace-card">
        <div class="inviter-avatar" style="margin: 0 auto 12px;">{{{{ invitee_name[0] | upper }}}}</div>
        <div class="workspace-name" style="font-size: 18px;">{{{{ invitee_name }}}}</div>
        {{% if role %}}
        <div class="workspace-role">{{{{ role }}}}</div>
        {{% endif %}}
      </div>

      {{% if joined_at %}}
      <div class="info-row" style="text-align: center;">
        <div class="info-label">Joined</div>
        <div class="info-value">{{{{ joined_at }}}}</div>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ workspace_url | default(dashboard_url) }}}}" class="cta-button">View Workspace</a>
      </div>
    </div>

    <div class="footer">
      <p>Your team is growing! {{{{ invitee_name }}}} can now collaborate with you on RawDrive.</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

INVITATION_ACCEPTED_EMAIL_TEXT = """
Invitation Accepted - New Team Member!

{{ invitee_name }} has accepted your invitation to join {{ workspace_name }}.

{% if role %}
Role: {{ role }}
{% endif %}

{% if joined_at %}
Joined: {{ joined_at }}
{% endif %}

View your workspace: {{ workspace_url | default(dashboard_url) }}

---
Your team is growing! {{ invitee_name }} can now collaborate with you on RawDrive.
"""

INVITATION_ACCEPTED_PUSH_TITLE = "Invitation Accepted"
INVITATION_ACCEPTED_PUSH_BODY = "{{ invitee_name }} joined {{ workspace_name }}"

INVITATION_ACCEPTED_IN_APP_TITLE = "Invitation Accepted"
INVITATION_ACCEPTED_IN_APP_BODY = "{{ invitee_name }} has joined {{ workspace_name }}"


# =============================================================================
# INVITATION DECLINED TEMPLATE (to inviter)
# =============================================================================

INVITATION_DECLINED_EMAIL_SUBJECT = "Invitation to {{ workspace_name }} was declined"

INVITATION_DECLINED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation Declined</title>
  {INVITATION_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">Invitation Declined</span>
        <h1 class="title">{{{{ workspace_name }}}}</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 16px; color: #475569;">
          The invitation to <strong>{{{{ invitee_email }}}}</strong> has been declined.
        </p>
      </div>

      {{% if decline_reason %}}
      <div class="message-box">
        <div style="font-weight: 600; margin-bottom: 8px;">Reason provided:</div>
        "{{{{ decline_reason }}}}"
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <p style="color: #64748B; font-size: 14px; margin-bottom: 16px;">
          You can send another invitation if needed.
        </p>
        {{% if reinvite_url %}}
        <a href="{{{{ reinvite_url }}}}" class="secondary-button">Send New Invitation</a>
        {{% endif %}}
      </div>
    </div>

    <div class="footer">
      <p>Invitation status update for {{{{ workspace_name }}}}</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

INVITATION_DECLINED_EMAIL_TEXT = """
Invitation Declined - {{ workspace_name }}

The invitation to {{ invitee_email }} has been declined.

{% if decline_reason %}
Reason provided:
"{{ decline_reason }}"
{% endif %}

You can send another invitation if needed.

{% if reinvite_url %}
Send new invitation: {{ reinvite_url }}
{% endif %}

---
Invitation status update for {{ workspace_name }}
"""

INVITATION_DECLINED_PUSH_TITLE = "Invitation Declined"
INVITATION_DECLINED_PUSH_BODY = "Your invitation to {{ workspace_name }} was declined"

INVITATION_DECLINED_IN_APP_TITLE = "Invitation Declined"
INVITATION_DECLINED_IN_APP_BODY = "{{ invitee_email }} declined the invitation to {{ workspace_name }}"


# =============================================================================
# INVITATION EXPIRED TEMPLATE (to inviter)
# =============================================================================

INVITATION_EXPIRED_EMAIL_SUBJECT = "Invitation to {{ workspace_name }} has expired"

INVITATION_EXPIRED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation Expired</title>
  {INVITATION_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Invitation Expired</span>
        <h1 class="title">{{{{ workspace_name }}}}</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 16px; color: #475569;">
          The invitation to <strong>{{{{ invitee_email }}}}</strong> has expired without a response.
        </p>
      </div>

      <div class="info-row" style="text-align: center;">
        <div class="info-label">Expired On</div>
        <div class="info-value">{{{{ expiry_date }}}}</div>
      </div>

      <div style="text-align: center; margin-top: 24px;">
        <p style="color: #64748B; font-size: 14px; margin-bottom: 16px;">
          Would you like to send a new invitation?
        </p>
        {{% if reinvite_url %}}
        <a href="{{{{ reinvite_url }}}}" class="cta-button">Resend Invitation</a>
        {{% endif %}}
      </div>
    </div>

    <div class="footer">
      <p>Invitation status update for {{{{ workspace_name }}}}</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

INVITATION_EXPIRED_EMAIL_TEXT = """
Invitation Expired - {{ workspace_name }}

The invitation to {{ invitee_email }} has expired without a response.

Expired On: {{ expiry_date }}

{% if reinvite_url %}
Resend invitation: {{ reinvite_url }}
{% endif %}

---
Invitation status update for {{ workspace_name }}
"""

INVITATION_EXPIRED_PUSH_TITLE = "Invitation Expired"
INVITATION_EXPIRED_PUSH_BODY = "Invitation to {{ workspace_name }} has expired"

INVITATION_EXPIRED_IN_APP_TITLE = "Invitation Expired"
INVITATION_EXPIRED_IN_APP_BODY = "Invitation to {{ invitee_email }} for {{ workspace_name }} has expired"


# =============================================================================
# INVITATION REMINDER TEMPLATE (to invitee)
# =============================================================================

INVITATION_REMINDER_EMAIL_SUBJECT = "Reminder: You have a pending invitation to {{ workspace_name }}"

INVITATION_REMINDER_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation Reminder</title>
  {INVITATION_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Reminder</span>
        <h1 class="title">Pending Invitation</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 16px; color: #475569;">
          <strong>{{{{ inviter_name }}}}</strong> is waiting for your response
        </p>
      </div>

      <div class="workspace-card">
        <div class="workspace-name">{{{{ workspace_name }}}}</div>
        {{% if role %}}
        <div class="workspace-role">Role: {{{{ role }}}}</div>
        {{% endif %}}
      </div>

      {{% if days_remaining %}}
      <div class="countdown-box">
        <div class="countdown-number">{{{{ days_remaining }}}}</div>
        <div class="countdown-label">days remaining to respond</div>
      </div>
      {{% endif %}}

      {{% if expiry_date %}}
      <p style="text-align: center; color: #92400E; font-size: 14px; margin: 0 0 24px;">
        This invitation will expire on {{{{ expiry_date }}}}
      </p>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ accept_url }}}}" class="accept-button">Accept Invitation</a>
        {{% if decline_url %}}
        <a href="{{{{ decline_url }}}}" class="decline-button">Decline</a>
        {{% endif %}}
      </div>
    </div>

    <div class="footer">
      <p>This is a friendly reminder from RawDrive</p>
      <p style="margin-top: 8px;">
        If you don't wish to join, you can decline the invitation or simply ignore this email.
      </p>
    </div>
  </div>
</body>
</html>
"""

INVITATION_REMINDER_EMAIL_TEXT = """
Reminder: Pending Invitation to {{ workspace_name }}

{{ inviter_name }} is waiting for your response to join {{ workspace_name }}.

{% if role %}
Role: {{ role }}
{% endif %}

{% if days_remaining %}
Days remaining to respond: {{ days_remaining }}
{% endif %}

{% if expiry_date %}
This invitation will expire on {{ expiry_date }}
{% endif %}

Accept the invitation: {{ accept_url }}

---
This is a friendly reminder from RawDrive.
If you don't wish to join, you can decline the invitation or simply ignore this email.
"""

INVITATION_REMINDER_SMS = """Reminder: {{ inviter_name }} invited you to {{ workspace_name }}. Respond before {{ expiry_date }}: {{ accept_url }}"""

INVITATION_REMINDER_PUSH_TITLE = "Invitation Reminder"
INVITATION_REMINDER_PUSH_BODY = "Pending invitation to {{ workspace_name }} expires soon"

INVITATION_REMINDER_IN_APP_TITLE = "Pending Invitation"
INVITATION_REMINDER_IN_APP_BODY = "Don't forget! {{ inviter_name }}'s invitation to {{ workspace_name }} is waiting"


# =============================================================================
# INVITATION CANCELLED TEMPLATE (to invitee)
# =============================================================================

INVITATION_CANCELLED_EMAIL_SUBJECT = "Invitation to {{ workspace_name }} has been cancelled"

INVITATION_CANCELLED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation Cancelled</title>
  {INVITATION_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="error-badge">Invitation Cancelled</span>
        <h1 class="title">{{{{ workspace_name }}}}</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 16px; color: #475569;">
          The invitation to join <strong>{{{{ workspace_name }}}}</strong> has been cancelled by the workspace administrator.
        </p>
      </div>

      {{% if cancellation_reason %}}
      <div class="message-box">
        <div style="font-weight: 600; margin-bottom: 8px;">Reason:</div>
        "{{{{ cancellation_reason }}}}"
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <p style="color: #64748B; font-size: 14px;">
          If you believe this was a mistake, please contact the workspace administrator.
        </p>
      </div>
    </div>

    <div class="footer">
      <p>This is a notification from RawDrive</p>
      <p style="margin-top: 8px;">
        No action is required on your part.
      </p>
    </div>
  </div>
</body>
</html>
"""

INVITATION_CANCELLED_EMAIL_TEXT = """
Invitation Cancelled - {{ workspace_name }}

The invitation to join {{ workspace_name }} has been cancelled by the workspace administrator.

{% if cancellation_reason %}
Reason: "{{ cancellation_reason }}"
{% endif %}

If you believe this was a mistake, please contact the workspace administrator.

---
This is a notification from RawDrive.
No action is required on your part.
"""

INVITATION_CANCELLED_PUSH_TITLE = "Invitation Cancelled"
INVITATION_CANCELLED_PUSH_BODY = "Invitation to {{ workspace_name }} was cancelled"

INVITATION_CANCELLED_IN_APP_TITLE = "Invitation Cancelled"
INVITATION_CANCELLED_IN_APP_BODY = "The invitation to join {{ workspace_name }} has been cancelled"


# =============================================================================
# TEMPLATE DEFINITIONS
# =============================================================================

INVITATION_TEMPLATES: dict[str, InvitationTemplate] = {
    "invitation_sent": InvitationTemplate(
        event_type=EventType.INVITATION_SENT,
        code="invitation_sent",
        name="Invitation Sent",
        description="Sent to the invitee when they receive a workspace invitation",
        category=NotificationCategory.INVITATION,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,  # Invitations are transactional
        email_subject=INVITATION_SENT_EMAIL_SUBJECT,
        email_html=INVITATION_SENT_EMAIL_HTML,
        email_text=INVITATION_SENT_EMAIL_TEXT,
        email_from_name="{{ inviter_name }} via RawDrive",
        sms_content=INVITATION_SENT_SMS,
        push_title=INVITATION_SENT_PUSH_TITLE,
        push_body=INVITATION_SENT_PUSH_BODY,
        push_action_url="{{ accept_url }}",
        in_app_title=INVITATION_SENT_IN_APP_TITLE,
        in_app_body=INVITATION_SENT_IN_APP_BODY,
        in_app_action_url="/invitations/{{ invitation_id }}",
        in_app_icon="user-plus",
        required_variables=["inviter_name", "workspace_name", "accept_url"],
        optional_variables=[
            "role",
            "message",
            "expiry_date",
            "decline_url",
            "role_permissions",
            "invitation_id",
        ],
        default_values={
            "role": "member",
        },
        tags=["transactional", "invitation", "action-required"],
    ),
    "invitation_accepted": InvitationTemplate(
        event_type=EventType.INVITATION_ACCEPTED,
        code="invitation_accepted",
        name="Invitation Accepted",
        description="Sent to the inviter when the invitee accepts the invitation",
        category=NotificationCategory.INVITATION,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        email_subject=INVITATION_ACCEPTED_EMAIL_SUBJECT,
        email_html=INVITATION_ACCEPTED_EMAIL_HTML,
        email_text=INVITATION_ACCEPTED_EMAIL_TEXT,
        push_title=INVITATION_ACCEPTED_PUSH_TITLE,
        push_body=INVITATION_ACCEPTED_PUSH_BODY,
        push_action_url="{{ workspace_url | default(dashboard_url) }}",
        in_app_title=INVITATION_ACCEPTED_IN_APP_TITLE,
        in_app_body=INVITATION_ACCEPTED_IN_APP_BODY,
        in_app_action_url="/workspaces/{{ workspace_id }}/members",
        in_app_icon="user-check",
        required_variables=["invitee_name", "workspace_name"],
        optional_variables=[
            "role",
            "joined_at",
            "workspace_url",
            "dashboard_url",
            "workspace_id",
            "unsubscribe_url",
        ],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["invitation", "team"],
    ),
    "invitation_declined": InvitationTemplate(
        event_type=EventType.INVITATION_DECLINED,
        code="invitation_declined",
        name="Invitation Declined",
        description="Sent to the inviter when the invitee declines the invitation",
        category=NotificationCategory.INVITATION,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.LOW,
        email_subject=INVITATION_DECLINED_EMAIL_SUBJECT,
        email_html=INVITATION_DECLINED_EMAIL_HTML,
        email_text=INVITATION_DECLINED_EMAIL_TEXT,
        push_title=INVITATION_DECLINED_PUSH_TITLE,
        push_body=INVITATION_DECLINED_PUSH_BODY,
        in_app_title=INVITATION_DECLINED_IN_APP_TITLE,
        in_app_body=INVITATION_DECLINED_IN_APP_BODY,
        in_app_action_url="/workspaces/{{ workspace_id }}/members",
        in_app_icon="user-x",
        required_variables=["invitee_email", "workspace_name"],
        optional_variables=[
            "decline_reason",
            "reinvite_url",
            "workspace_id",
            "unsubscribe_url",
        ],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["invitation"],
    ),
    "invitation_expired": InvitationTemplate(
        event_type=EventType.INVITATION_EXPIRED,
        code="invitation_expired",
        name="Invitation Expired",
        description="Sent to the inviter when the invitation expires without a response",
        category=NotificationCategory.INVITATION,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.LOW,
        email_subject=INVITATION_EXPIRED_EMAIL_SUBJECT,
        email_html=INVITATION_EXPIRED_EMAIL_HTML,
        email_text=INVITATION_EXPIRED_EMAIL_TEXT,
        push_title=INVITATION_EXPIRED_PUSH_TITLE,
        push_body=INVITATION_EXPIRED_PUSH_BODY,
        in_app_title=INVITATION_EXPIRED_IN_APP_TITLE,
        in_app_body=INVITATION_EXPIRED_IN_APP_BODY,
        in_app_action_url="/workspaces/{{ workspace_id }}/invitations",
        in_app_icon="clock",
        required_variables=["invitee_email", "workspace_name", "expiry_date"],
        optional_variables=[
            "reinvite_url",
            "workspace_id",
            "unsubscribe_url",
        ],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["invitation"],
    ),
    "invitation_reminder": InvitationTemplate(
        event_type=EventType.INVITATION_REMINDER,
        code="invitation_reminder",
        name="Invitation Reminder",
        description="Reminder sent to the invitee about a pending invitation",
        category=NotificationCategory.INVITATION,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        email_subject=INVITATION_REMINDER_EMAIL_SUBJECT,
        email_html=INVITATION_REMINDER_EMAIL_HTML,
        email_text=INVITATION_REMINDER_EMAIL_TEXT,
        sms_content=INVITATION_REMINDER_SMS,
        push_title=INVITATION_REMINDER_PUSH_TITLE,
        push_body=INVITATION_REMINDER_PUSH_BODY,
        push_action_url="{{ accept_url }}",
        in_app_title=INVITATION_REMINDER_IN_APP_TITLE,
        in_app_body=INVITATION_REMINDER_IN_APP_BODY,
        in_app_action_url="/invitations/{{ invitation_id }}",
        in_app_icon="bell",
        required_variables=["inviter_name", "workspace_name", "accept_url"],
        optional_variables=[
            "role",
            "days_remaining",
            "expiry_date",
            "decline_url",
            "invitation_id",
        ],
        default_values={},
        tags=["invitation", "reminder"],
    ),
    "invitation_cancelled": InvitationTemplate(
        event_type=EventType.INVITATION_CANCELLED,
        code="invitation_cancelled",
        name="Invitation Cancelled",
        description="Sent to the invitee when the invitation is cancelled by the inviter",
        category=NotificationCategory.INVITATION,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.LOW,
        email_subject=INVITATION_CANCELLED_EMAIL_SUBJECT,
        email_html=INVITATION_CANCELLED_EMAIL_HTML,
        email_text=INVITATION_CANCELLED_EMAIL_TEXT,
        push_title=INVITATION_CANCELLED_PUSH_TITLE,
        push_body=INVITATION_CANCELLED_PUSH_BODY,
        in_app_title=INVITATION_CANCELLED_IN_APP_TITLE,
        in_app_body=INVITATION_CANCELLED_IN_APP_BODY,
        in_app_action_url="/dashboard",
        in_app_icon="x-circle",
        required_variables=["workspace_name"],
        optional_variables=["cancellation_reason"],
        default_values={},
        tags=["invitation"],
    ),
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_invitation_template(template_code: str) -> InvitationTemplate | None:
    """Get an invitation template by its code.

    Args:
        template_code: The template code (e.g., 'invitation_sent')

    Returns:
        InvitationTemplate or None if not found
    """
    return INVITATION_TEMPLATES.get(template_code)


def get_template_for_event(event_type: EventType | str) -> InvitationTemplate | None:
    """Get an invitation template by its event type.

    Args:
        event_type: The event type enum or string value

    Returns:
        InvitationTemplate or None if not found
    """
    if isinstance(event_type, str):
        try:
            event_type = EventType(event_type)
        except ValueError:
            return None

    for template in INVITATION_TEMPLATES.values():
        if template.event_type == event_type:
            return template
    return None


def list_invitation_templates() -> list[str]:
    """Get a list of all invitation template codes.

    Returns:
        List of template codes
    """
    return list(INVITATION_TEMPLATES.keys())


def get_template_variable_schema(template_code: str) -> dict[str, Any] | None:
    """Get the variable schema for a template.

    Args:
        template_code: The template code

    Returns:
        Dict with 'required' and 'optional' keys, or None if template not found
    """
    template = get_invitation_template(template_code)
    if not template:
        return None

    return {
        "required": template.required_variables,
        "optional": template.optional_variables,
        "defaults": template.default_values,
    }


def get_templates_by_channel(channel: NotificationChannel) -> list[InvitationTemplate]:
    """Get all templates that support a specific channel.

    Args:
        channel: The notification channel

    Returns:
        List of InvitationTemplate instances
    """
    return [
        template
        for template in INVITATION_TEMPLATES.values()
        if channel in template.supported_channels
    ]


def get_templates_by_priority(priority: NotificationPriority) -> list[InvitationTemplate]:
    """Get all templates with a specific priority.

    Args:
        priority: The notification priority

    Returns:
        List of InvitationTemplate instances
    """
    return [
        template
        for template in INVITATION_TEMPLATES.values()
        if template.default_priority == priority
    ]


def get_transactional_templates() -> list[InvitationTemplate]:
    """Get all transactional invitation templates.

    Returns:
        List of InvitationTemplate instances that are transactional
    """
    return [
        template
        for template in INVITATION_TEMPLATES.values()
        if template.is_transactional
    ]


def get_invitee_templates() -> list[InvitationTemplate]:
    """Get all templates sent to invitees.

    Returns:
        List of InvitationTemplate instances for invitees
    """
    invitee_codes = ["invitation_sent", "invitation_reminder", "invitation_cancelled"]
    return [
        template
        for code, template in INVITATION_TEMPLATES.items()
        if code in invitee_codes
    ]


def get_inviter_templates() -> list[InvitationTemplate]:
    """Get all templates sent to inviters.

    Returns:
        List of InvitationTemplate instances for inviters
    """
    inviter_codes = ["invitation_accepted", "invitation_declined", "invitation_expired"]
    return [
        template
        for code, template in INVITATION_TEMPLATES.items()
        if code in inviter_codes
    ]


# =============================================================================
# EXPORTS
# =============================================================================


__all__ = [
    # Data class
    "InvitationTemplate",
    # Template registry
    "INVITATION_TEMPLATES",
    # Helper functions
    "get_invitation_template",
    "get_template_for_event",
    "list_invitation_templates",
    "get_template_variable_schema",
    "get_templates_by_channel",
    "get_templates_by_priority",
    "get_transactional_templates",
    "get_invitee_templates",
    "get_inviter_templates",
    # Common styles (for custom templates)
    "INVITATION_EMAIL_STYLES",
]
