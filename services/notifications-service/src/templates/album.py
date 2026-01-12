"""Album Proofing notification templates for the Notifications & Communication Microservice.

This module provides default templates for all album proofing notification events:
- Album proof sent notifications (to client)
- Album comment added notifications (to photographer)
- Album comment resolved notifications (to client)
- Album approved notifications (to photographer)
- Album version created notifications (to client)
- Album changes requested notifications (to photographer)

Each template includes:
- Email content (subject, HTML, plain text)
- Push notification content
- In-app notification content
- Variable schema definitions
- Default values for optional variables

Templates use Jinja2 syntax for variable substitution: {{ variable_name }}

Feature: 026-album-proofing
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
# COMMON HTML STYLES
# =============================================================================

ALBUM_EMAIL_STYLES = """
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
  .album-preview {
    width: 100%;
    height: 200px;
    background-size: cover;
    background-position: center;
    border-radius: 8px;
    margin-bottom: 24px;
    position: relative;
  }
  .album-badge {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
  }
  .album-name {
    font-size: 24px;
    font-weight: 700;
    color: #0F172A;
    margin: 16px 0 8px;
  }
  .photographer-name {
    font-size: 14px;
    color: #64748B;
    margin: 0;
  }
  .stats {
    display: flex;
    justify-content: center;
    gap: 32px;
    margin: 24px 0;
    text-align: center;
  }
  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: #2563EB;
  }
  .stat-label {
    font-size: 12px;
    color: #64748B;
    text-transform: uppercase;
  }
  .message-box {
    background: #F8FAFC;
    border-radius: 8px;
    padding: 16px;
    margin: 24px 0;
    font-style: italic;
    color: #475569;
  }
  .comment-box {
    background: #FEF3C7;
    border-left: 4px solid #F59E0B;
    border-radius: 0 8px 8px 0;
    padding: 16px;
    margin: 24px 0;
  }
  .comment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .comment-author {
    font-weight: 600;
    color: #0F172A;
  }
  .comment-location {
    font-size: 12px;
    color: #92400E;
    background: #FEF3C7;
    padding: 2px 8px;
    border-radius: 12px;
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
  .footer {
    text-align: center;
    margin-top: 32px;
    font-size: 12px;
    color: #64748B;
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
</style>
"""


# =============================================================================
# TEMPLATE DATA CLASS
# =============================================================================


@dataclass
class AlbumTemplate:
    """Complete template definition for an album proofing notification."""

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

    # Push notification content
    push_title: Optional[str] = None
    push_body: Optional[str] = None
    push_action_url: Optional[str] = None

    # In-app notification content
    in_app_title: Optional[str] = None
    in_app_body: Optional[str] = None
    in_app_action_url: Optional[str] = None
    in_app_icon: str = "album"

    # Variable schema
    required_variables: list[str] = field(default_factory=list)
    optional_variables: list[str] = field(default_factory=list)
    default_values: dict[str, Any] = field(default_factory=dict)

    # Tags for categorization
    tags: list[str] = field(default_factory=list)


# =============================================================================
# ALBUM PROOF SENT TEMPLATE (to client)
# =============================================================================

ALBUM_PROOF_SENT_EMAIL_SUBJECT = "Your album proof is ready for review - {{ album_name }}"

ALBUM_PROOF_SENT_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Album Proof Ready</title>
  {ALBUM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">Album Proof Ready</span>
      </div>

      {{% if cover_image_url %}}
      <div class="album-preview" style="background-image: url('{{{{ cover_image_url }}}}');">
        <span class="album-badge">{{{{ spread_count }}}} Spreads</span>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <p class="photographer-name">{{{{ photographer_name }}}} shared an album proof with you</p>
        <h1 class="album-name">{{{{ album_name }}}}</h1>
      </div>

      {{% if spread_count %}}
      <div class="stats">
        <div>
          <div class="stat-value">{{{{ spread_count }}}}</div>
          <div class="stat-label">Spreads</div>
        </div>
      </div>
      {{% endif %}}

      {{% if custom_message %}}
      <div class="message-box">
        "{{{{ custom_message }}}}"
        <div style="margin-top: 8px; font-style: normal; font-size: 12px; color: #94A3B8;">
          — {{{{ photographer_name }}}}
        </div>
      </div>
      {{% endif %}}

      <p style="text-align: center; color: #475569;">
        Please review the album and leave any feedback or comments directly on the pages.
        Once you're satisfied, you can approve the album for printing.
      </p>

      <div style="text-align: center;">
        <a href="{{{{ proof_url }}}}" class="cta-button">Review Album</a>
      </div>

      {{% if expiry_date %}}
      <p style="text-align: center; margin-top: 16px; font-size: 14px; color: #64748B;">
        This proof link expires on {{{{ expiry_date }}}}
      </p>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>This album proof was shared by {{{{ photographer_name }}}}</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

ALBUM_PROOF_SENT_EMAIL_TEXT = """
Your Album Proof is Ready for Review

{{ photographer_name }} has shared an album proof with you.

Album: {{ album_name }}
{% if spread_count %}Spreads: {{ spread_count }}{% endif %}

{% if custom_message %}
Message from {{ photographer_name }}:
"{{ custom_message }}"
{% endif %}

Please review the album and leave any feedback or comments directly on the pages.
Once you're satisfied, you can approve the album for printing.

Review your album: {{ proof_url }}

{% if expiry_date %}
Note: This proof link expires on {{ expiry_date }}
{% endif %}

---
This album proof was shared by {{ photographer_name }}
"""

ALBUM_PROOF_SENT_PUSH_TITLE = "Album Proof Ready"
ALBUM_PROOF_SENT_PUSH_BODY = "{{ photographer_name }} shared {{ album_name }} for your review"

ALBUM_PROOF_SENT_IN_APP_TITLE = "Album Proof Ready"
ALBUM_PROOF_SENT_IN_APP_BODY = "{{ photographer_name }} shared {{ album_name }} - {{ spread_count }} spreads ready for review"


# =============================================================================
# ALBUM COMMENT ADDED TEMPLATE (to photographer)
# =============================================================================

ALBUM_COMMENT_ADDED_EMAIL_SUBJECT = "New comment on {{ album_name }} - {{ commenter_name }}"

ALBUM_COMMENT_ADDED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Album Comment</title>
  {ALBUM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">New Comment</h1>
        <p style="color: #64748B;">on {{{{ album_name }}}}</p>
      </div>

      <div class="comment-box">
        <div class="comment-header">
          <span class="comment-author">{{{{ commenter_name }}}}</span>
          <span class="comment-location">Spread {{{{ spread_number }}}}</span>
        </div>
        "{{{{ comment_preview }}}}"
      </div>

      <div style="text-align: center;">
        <a href="{{{{ album_url }}}}" class="cta-button">View Comment</a>
      </div>
    </div>

    <div class="footer">
      <p>Client feedback on your album proof</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

ALBUM_COMMENT_ADDED_EMAIL_TEXT = """
New Comment on {{ album_name }}

{{ commenter_name }} commented on Spread {{ spread_number }}:

"{{ comment_preview }}"

View comment: {{ album_url }}

---
Client feedback on your album proof
"""

ALBUM_COMMENT_ADDED_PUSH_TITLE = "New Album Comment"
ALBUM_COMMENT_ADDED_PUSH_BODY = "{{ commenter_name }} on spread {{ spread_number }}: {{ comment_preview }}"

ALBUM_COMMENT_ADDED_IN_APP_TITLE = "New Album Comment"
ALBUM_COMMENT_ADDED_IN_APP_BODY = "{{ commenter_name }} commented on {{ album_name }} (Spread {{ spread_number }})"


# =============================================================================
# ALBUM COMMENT RESOLVED TEMPLATE (to client)
# =============================================================================

ALBUM_COMMENT_RESOLVED_EMAIL_SUBJECT = "Your feedback has been addressed - {{ album_name }}"

ALBUM_COMMENT_RESOLVED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comment Resolved</title>
  {ALBUM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Feedback Addressed</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ album_name }}}}</h1>
      </div>

      <p style="text-align: center; color: #475569;">
        Your feedback has been reviewed and addressed:
      </p>

      <div class="message-box">
        "{{{{ comment_preview }}}}"
      </div>

      {{% if resolution_note %}}
      <div style="background: #DCFCE7; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <strong style="color: #166534;">Resolution:</strong>
        <p style="margin: 8px 0 0; color: #166534;">{{{{ resolution_note }}}}</p>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ album_url }}}}" class="cta-button">Review Changes</a>
      </div>
    </div>

    <div class="footer">
      <p>Your feedback helps create the perfect album</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

ALBUM_COMMENT_RESOLVED_EMAIL_TEXT = """
Your Feedback Has Been Addressed

Album: {{ album_name }}

Your comment:
"{{ comment_preview }}"

{% if resolution_note %}
Resolution: {{ resolution_note }}
{% endif %}

Review the changes: {{ album_url }}

---
Your feedback helps create the perfect album
"""

ALBUM_COMMENT_RESOLVED_PUSH_TITLE = "Feedback Addressed"
ALBUM_COMMENT_RESOLVED_PUSH_BODY = "Your comment on {{ album_name }} has been resolved"

ALBUM_COMMENT_RESOLVED_IN_APP_TITLE = "Comment Resolved"
ALBUM_COMMENT_RESOLVED_IN_APP_BODY = "Your feedback on {{ album_name }} has been addressed"


# =============================================================================
# ALBUM APPROVED TEMPLATE (to photographer)
# =============================================================================

ALBUM_APPROVED_EMAIL_SUBJECT = "Album Approved! {{ album_name }} is ready for print"

ALBUM_APPROVED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Album Approved</title>
  {ALBUM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Album Approved!</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ album_name }}}}</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 18px; color: #166534; font-weight: 600;">
          {{{{ client_name }}}} has approved this album for printing
        </p>
      </div>

      <div style="background: #F8FAFC; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <div style="display: grid; gap: 12px;">
          <div>
            <span style="font-size: 12px; color: #64748B; text-transform: uppercase;">Client</span>
            <p style="margin: 4px 0 0; font-weight: 600;">{{{{ client_name }}}}</p>
          </div>
          <div>
            <span style="font-size: 12px; color: #64748B; text-transform: uppercase;">Email</span>
            <p style="margin: 4px 0 0;">{{{{ client_email }}}}</p>
          </div>
          <div>
            <span style="font-size: 12px; color: #64748B; text-transform: uppercase;">Approved On</span>
            <p style="margin: 4px 0 0;">{{{{ approval_date }}}}</p>
          </div>
          {{% if version_number %}}
          <div>
            <span style="font-size: 12px; color: #64748B; text-transform: uppercase;">Version</span>
            <p style="margin: 4px 0 0;">Version {{{{ version_number }}}}</p>
          </div>
          {{% endif %}}
        </div>
      </div>

      {{% if unresolved_comment_count and unresolved_comment_count > 0 %}}
      <div class="warning-badge" style="display: block; text-align: center;">
        Note: {{{{ unresolved_comment_count }}}} unresolved comment(s) were acknowledged
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ album_url }}}}" class="cta-button">View Album</a>
      </div>
    </div>

    <div class="footer">
      <p>The client has signed off on this album design</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

ALBUM_APPROVED_EMAIL_TEXT = """
Album Approved!

{{ client_name }} has approved {{ album_name }} for printing.

Details:
- Client: {{ client_name }}
- Email: {{ client_email }}
- Approved: {{ approval_date }}
{% if version_number %}- Version: {{ version_number }}{% endif %}

{% if unresolved_comment_count and unresolved_comment_count > 0 %}
Note: {{ unresolved_comment_count }} unresolved comment(s) were acknowledged by the client.
{% endif %}

View album: {{ album_url }}

---
The client has signed off on this album design
"""

ALBUM_APPROVED_PUSH_TITLE = "Album Approved!"
ALBUM_APPROVED_PUSH_BODY = "{{ client_name }} approved {{ album_name }} for print"

ALBUM_APPROVED_IN_APP_TITLE = "Album Approved"
ALBUM_APPROVED_IN_APP_BODY = "{{ client_name }} approved {{ album_name }} - ready for print"


# =============================================================================
# ALBUM VERSION CREATED TEMPLATE (to client)
# =============================================================================

ALBUM_VERSION_CREATED_EMAIL_SUBJECT = "New version available - {{ album_name }}"

ALBUM_VERSION_CREATED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Album Version</title>
  {ALBUM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">Version {{{{ version_number }}}}</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ album_name }}}}</h1>
      </div>

      <p style="text-align: center; color: #475569;">
        {{{{ photographer_name }}}} has created a new version of your album
        {{% if version_label %}}
        <br><strong>"{{{{ version_label }}}}"</strong>
        {{% endif %}}
      </p>

      {{% if change_summary %}}
      <div class="message-box">
        <strong>What's changed:</strong>
        <p style="margin: 8px 0 0;">{{{{ change_summary }}}}</p>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ proof_url }}}}" class="cta-button">Review New Version</a>
      </div>
    </div>

    <div class="footer">
      <p>Updated album proof from {{{{ photographer_name }}}}</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

ALBUM_VERSION_CREATED_EMAIL_TEXT = """
New Album Version Available

{{ photographer_name }} has created a new version of your album.

Album: {{ album_name }}
Version: {{ version_number }}{% if version_label %} - "{{ version_label }}"{% endif %}

{% if change_summary %}
What's changed:
{{ change_summary }}
{% endif %}

Review new version: {{ proof_url }}

---
Updated album proof from {{ photographer_name }}
"""

ALBUM_VERSION_CREATED_PUSH_TITLE = "New Album Version"
ALBUM_VERSION_CREATED_PUSH_BODY = "Version {{ version_number }} of {{ album_name }} is ready for review"

ALBUM_VERSION_CREATED_IN_APP_TITLE = "New Album Version"
ALBUM_VERSION_CREATED_IN_APP_BODY = "{{ photographer_name }} created version {{ version_number }} of {{ album_name }}"


# =============================================================================
# ALBUM CHANGES REQUESTED TEMPLATE (to photographer)
# =============================================================================

ALBUM_CHANGES_REQUESTED_EMAIL_SUBJECT = "Changes requested on {{ album_name }}"

ALBUM_CHANGES_REQUESTED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Changes Requested</title>
  {ALBUM_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Changes Requested</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ album_name }}}}</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 16px; color: #475569;">
          {{{{ client_name }}}} has requested changes to this album
        </p>
        <div style="font-size: 48px; font-weight: 700; color: #F59E0B;">{{{{ comment_count }}}}</div>
        <div style="font-size: 14px; color: #92400E;">Comment(s) to Address</div>
      </div>

      {{% if summary %}}
      <div class="message-box">
        <strong>Summary:</strong>
        <p style="margin: 8px 0 0;">{{{{ summary }}}}</p>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ album_url }}}}" class="cta-button">Review Feedback</a>
      </div>
    </div>

    <div class="footer">
      <p>Action required: Address client feedback</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

ALBUM_CHANGES_REQUESTED_EMAIL_TEXT = """
Changes Requested on {{ album_name }}

{{ client_name }} has requested changes to this album.

Comments to address: {{ comment_count }}

{% if summary %}
Summary: {{ summary }}
{% endif %}

Review feedback: {{ album_url }}

---
Action required: Address client feedback
"""

ALBUM_CHANGES_REQUESTED_PUSH_TITLE = "Changes Requested"
ALBUM_CHANGES_REQUESTED_PUSH_BODY = "{{ client_name }} requested {{ comment_count }} change(s) on {{ album_name }}"

ALBUM_CHANGES_REQUESTED_IN_APP_TITLE = "Changes Requested"
ALBUM_CHANGES_REQUESTED_IN_APP_BODY = "{{ client_name }} requested changes to {{ album_name }} ({{ comment_count }} comments)"


# =============================================================================
# TEMPLATE DEFINITIONS
# =============================================================================

ALBUM_TEMPLATES: dict[str, AlbumTemplate] = {
    "album_proof_sent": AlbumTemplate(
        event_type=EventType.ALBUM_PROOF_SENT,
        code="album_proof_sent",
        name="Album Proof Sent",
        description="Sent to client when photographer shares an album proof for review",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        email_subject=ALBUM_PROOF_SENT_EMAIL_SUBJECT,
        email_html=ALBUM_PROOF_SENT_EMAIL_HTML,
        email_text=ALBUM_PROOF_SENT_EMAIL_TEXT,
        email_from_name="{{ photographer_name }} via RawDrive",
        push_title=ALBUM_PROOF_SENT_PUSH_TITLE,
        push_body=ALBUM_PROOF_SENT_PUSH_BODY,
        push_action_url="{{ proof_url }}",
        in_app_title=ALBUM_PROOF_SENT_IN_APP_TITLE,
        in_app_body=ALBUM_PROOF_SENT_IN_APP_BODY,
        in_app_action_url="/album/{{ album_id }}",
        in_app_icon="album",
        required_variables=["album_id", "album_name", "proof_url", "photographer_name"],
        optional_variables=[
            "spread_count", "custom_message", "expiry_date",
            "cover_image_url", "unsubscribe_url"
        ],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "album-proofing", "action-required"],
    ),
    "album_comment_added": AlbumTemplate(
        event_type=EventType.ALBUM_COMMENT_ADDED,
        code="album_comment_added",
        name="Album Comment Added",
        description="Sent to photographer when client adds a comment on album proof",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        email_subject=ALBUM_COMMENT_ADDED_EMAIL_SUBJECT,
        email_html=ALBUM_COMMENT_ADDED_EMAIL_HTML,
        email_text=ALBUM_COMMENT_ADDED_EMAIL_TEXT,
        push_title=ALBUM_COMMENT_ADDED_PUSH_TITLE,
        push_body=ALBUM_COMMENT_ADDED_PUSH_BODY,
        push_action_url="{{ album_url }}",
        in_app_title=ALBUM_COMMENT_ADDED_IN_APP_TITLE,
        in_app_body=ALBUM_COMMENT_ADDED_IN_APP_BODY,
        in_app_action_url="/albums/{{ album_id }}/comments",
        in_app_icon="comment",
        required_variables=[
            "album_id", "album_name", "comment_id",
            "commenter_name", "comment_preview", "spread_number"
        ],
        optional_variables=["album_url", "position_x", "position_y", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["photographer-facing", "album-proofing", "engagement"],
    ),
    "album_comment_resolved": AlbumTemplate(
        event_type=EventType.ALBUM_COMMENT_RESOLVED,
        code="album_comment_resolved",
        name="Album Comment Resolved",
        description="Sent to client when photographer resolves their comment",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.LOW,
        email_subject=ALBUM_COMMENT_RESOLVED_EMAIL_SUBJECT,
        email_html=ALBUM_COMMENT_RESOLVED_EMAIL_HTML,
        email_text=ALBUM_COMMENT_RESOLVED_EMAIL_TEXT,
        push_title=ALBUM_COMMENT_RESOLVED_PUSH_TITLE,
        push_body=ALBUM_COMMENT_RESOLVED_PUSH_BODY,
        push_action_url="{{ album_url }}",
        in_app_title=ALBUM_COMMENT_RESOLVED_IN_APP_TITLE,
        in_app_body=ALBUM_COMMENT_RESOLVED_IN_APP_BODY,
        in_app_action_url="/album/{{ album_id }}",
        in_app_icon="check",
        required_variables=["album_id", "album_name", "comment_preview"],
        optional_variables=["album_url", "resolved_by", "resolution_note", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "album-proofing"],
    ),
    "album_approved": AlbumTemplate(
        event_type=EventType.ALBUM_APPROVED,
        code="album_approved",
        name="Album Approved",
        description="Sent to photographer when client approves album for print",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        email_subject=ALBUM_APPROVED_EMAIL_SUBJECT,
        email_html=ALBUM_APPROVED_EMAIL_HTML,
        email_text=ALBUM_APPROVED_EMAIL_TEXT,
        push_title=ALBUM_APPROVED_PUSH_TITLE,
        push_body=ALBUM_APPROVED_PUSH_BODY,
        push_action_url="{{ album_url }}",
        in_app_title=ALBUM_APPROVED_IN_APP_TITLE,
        in_app_body=ALBUM_APPROVED_IN_APP_BODY,
        in_app_action_url="/albums/{{ album_id }}",
        in_app_icon="check-circle",
        required_variables=[
            "album_id", "album_name", "client_name", "client_email", "approval_date"
        ],
        optional_variables=["album_url", "unresolved_comment_count", "version_number", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["photographer-facing", "album-proofing", "milestone", "action-required"],
    ),
    "album_version_created": AlbumTemplate(
        event_type=EventType.ALBUM_VERSION_CREATED,
        code="album_version_created",
        name="Album Version Created",
        description="Sent to client when photographer creates a new album version",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        email_subject=ALBUM_VERSION_CREATED_EMAIL_SUBJECT,
        email_html=ALBUM_VERSION_CREATED_EMAIL_HTML,
        email_text=ALBUM_VERSION_CREATED_EMAIL_TEXT,
        push_title=ALBUM_VERSION_CREATED_PUSH_TITLE,
        push_body=ALBUM_VERSION_CREATED_PUSH_BODY,
        push_action_url="{{ proof_url }}",
        in_app_title=ALBUM_VERSION_CREATED_IN_APP_TITLE,
        in_app_body=ALBUM_VERSION_CREATED_IN_APP_BODY,
        in_app_action_url="/album/{{ album_id }}",
        in_app_icon="refresh",
        required_variables=[
            "album_id", "album_name", "version_number", "version_label", "proof_url"
        ],
        optional_variables=["photographer_name", "change_summary", "unsubscribe_url"],
        default_values={
            "photographer_name": "Your photographer",
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "album-proofing"],
    ),
    "album_changes_requested": AlbumTemplate(
        event_type=EventType.ALBUM_CHANGES_REQUESTED,
        code="album_changes_requested",
        name="Album Changes Requested",
        description="Sent to photographer when client requests changes to album",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        email_subject=ALBUM_CHANGES_REQUESTED_EMAIL_SUBJECT,
        email_html=ALBUM_CHANGES_REQUESTED_EMAIL_HTML,
        email_text=ALBUM_CHANGES_REQUESTED_EMAIL_TEXT,
        push_title=ALBUM_CHANGES_REQUESTED_PUSH_TITLE,
        push_body=ALBUM_CHANGES_REQUESTED_PUSH_BODY,
        push_action_url="{{ album_url }}",
        in_app_title=ALBUM_CHANGES_REQUESTED_IN_APP_TITLE,
        in_app_body=ALBUM_CHANGES_REQUESTED_IN_APP_BODY,
        in_app_action_url="/albums/{{ album_id }}/comments",
        in_app_icon="edit",
        required_variables=["album_id", "album_name", "client_name", "comment_count"],
        optional_variables=["album_url", "summary", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["photographer-facing", "album-proofing", "action-required"],
    ),
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_album_template(template_code: str) -> AlbumTemplate | None:
    """Get an album template by its code."""
    return ALBUM_TEMPLATES.get(template_code)


def get_template_for_album_event(event_type: EventType | str) -> AlbumTemplate | None:
    """Get an album template by its event type."""
    if isinstance(event_type, str):
        try:
            event_type = EventType(event_type)
        except ValueError:
            return None

    for template in ALBUM_TEMPLATES.values():
        if template.event_type == event_type:
            return template
    return None


def list_album_templates() -> list[str]:
    """Get a list of all album template codes."""
    return list(ALBUM_TEMPLATES.keys())


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    # Data class
    "AlbumTemplate",
    # Template registry
    "ALBUM_TEMPLATES",
    # Helper functions
    "get_album_template",
    "get_template_for_album_event",
    "list_album_templates",
    # Common styles
    "ALBUM_EMAIL_STYLES",
]
