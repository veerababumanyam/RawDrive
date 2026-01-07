"""Gallery notification templates for the Notifications & Communication Microservice.

This module provides default templates for all gallery-related notification events:
- Gallery published notifications
- Gallery shared notifications
- Gallery updated notifications
- Gallery expiring warnings
- Gallery expired notifications
- Gallery comment notifications
- Gallery favorite notifications
- Gallery download notifications
- Selection submission notifications
- Selection approval notifications

Each template includes:
- Email content (subject, HTML, plain text)
- SMS content (for supported events)
- Push notification content
- In-app notification content
- Variable schema definitions
- Default values for optional variables

Templates use Jinja2 syntax for variable substitution: {{ variable_name }}

Feature: Notifications & Communication Microservice
Task: T038 - Create gallery notification templates
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
class GalleryTemplate:
    """Complete template definition for a gallery notification.

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
    in_app_icon: str = "gallery"

    # Variable schema
    required_variables: list[str] = field(default_factory=list)
    optional_variables: list[str] = field(default_factory=list)
    default_values: dict[str, Any] = field(default_factory=dict)

    # Tags for categorization
    tags: list[str] = field(default_factory=list)


# =============================================================================
# COMMON HTML STYLES
# =============================================================================

# Base email styles used across all gallery templates
GALLERY_EMAIL_STYLES = """
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
  .hero-image {
    width: 100%;
    height: 200px;
    background-size: cover;
    background-position: center;
    border-radius: 8px;
    margin-bottom: 24px;
  }
  .gallery-name {
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
  .urgent-badge {
    display: inline-block;
    background: #FEE2E2;
    color: #991B1B;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0;
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
</style>
"""


# =============================================================================
# GALLERY PUBLISHED TEMPLATE
# =============================================================================

GALLERY_PUBLISHED_EMAIL_SUBJECT = "Your photos are ready! {{ gallery_name }}"

GALLERY_PUBLISHED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Gallery is Ready</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
      </div>

      {{% if cover_photo_url %}}
      <div class="hero-image" style="background-image: url('{{{{ cover_photo_url }}}}');"></div>
      {{% endif %}}

      <div style="text-align: center;">
        <p class="photographer-name">{{{{ photographer_name }}}} shared a gallery with you</p>
        <h1 class="gallery-name">{{{{ gallery_name }}}}</h1>
      </div>

      <div class="stats">
        <div>
          <div class="stat-value">{{{{ photo_count }}}}</div>
          <div class="stat-label">Photos</div>
        </div>
        {{% if expiry_date %}}
        <div>
          <div class="stat-value">{{{{ days_until_expiry }}}}</div>
          <div class="stat-label">Days to View</div>
        </div>
        {{% endif %}}
      </div>

      {{% if custom_message %}}
      <div class="message-box">
        "{{{{ custom_message }}}}"
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ gallery_url }}}}" class="cta-button">View Your Photos</a>
      </div>

      {{% if download_enabled %}}
      <p style="text-align: center; margin-top: 16px; font-size: 14px; color: #64748B;">
        Downloads are enabled for this gallery
      </p>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>This gallery was shared with you by {{{{ photographer_name }}}}</p>
      {{% if expiry_date %}}
      <p>Please note: This gallery will expire on {{{{ expiry_date }}}}</p>
      {{% endif %}}
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

GALLERY_PUBLISHED_EMAIL_TEXT = """
Your photos are ready!

{{ photographer_name }} shared a gallery with you.

Gallery: {{ gallery_name }}
Photos: {{ photo_count }}

{% if custom_message %}
Message from {{ photographer_name }}:
"{{ custom_message }}"
{% endif %}

View your photos: {{ gallery_url }}

{% if expiry_date %}
Please note: This gallery will expire on {{ expiry_date }}. Make sure to download your photos before then.
{% endif %}

---
This gallery was shared with you by {{ photographer_name }}
To manage your notification preferences, visit: {{ unsubscribe_url }}
"""

GALLERY_PUBLISHED_SMS = """Your photos from {{ photographer_name }} are ready! View {{ photo_count }} photos: {{ gallery_url }}"""

GALLERY_PUBLISHED_PUSH_TITLE = "Photos Ready!"
GALLERY_PUBLISHED_PUSH_BODY = "{{ photographer_name }} shared {{ gallery_name }} with you"

GALLERY_PUBLISHED_IN_APP_TITLE = "Gallery Published"
GALLERY_PUBLISHED_IN_APP_BODY = "{{ photographer_name }} shared {{ gallery_name }} - {{ photo_count }} photos ready to view"


# =============================================================================
# GALLERY SHARED TEMPLATE
# =============================================================================

GALLERY_SHARED_EMAIL_SUBJECT = "{{ shared_by_name }} shared a gallery with you"

GALLERY_SHARED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gallery Shared With You</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Someone Shared Photos!</h1>
      </div>

      <div style="text-align: center;">
        <p style="font-size: 16px; color: #475569;">
          <strong>{{{{ shared_by_name }}}}</strong> wants you to see these photos
        </p>
        <h2 class="gallery-name">{{{{ gallery_name }}}}</h2>
      </div>

      {{% if message %}}
      <div class="message-box">
        "{{{{ message }}}}"
        <div style="margin-top: 8px; font-style: normal; font-size: 12px; color: #94A3B8;">
          — {{{{ shared_by_name }}}}
        </div>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ gallery_url }}}}" class="cta-button">View Gallery</a>
      </div>
    </div>

    <div class="footer">
      <p>This gallery was shared with you via RawDrive</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

GALLERY_SHARED_EMAIL_TEXT = """
{{ shared_by_name }} shared a gallery with you!

Gallery: {{ gallery_name }}

{% if message %}
Message: "{{ message }}"
{% endif %}

View the gallery: {{ gallery_url }}

---
This gallery was shared with you via RawDrive
"""

GALLERY_SHARED_PUSH_TITLE = "Gallery Shared"
GALLERY_SHARED_PUSH_BODY = "{{ shared_by_name }} shared {{ gallery_name }} with you"

GALLERY_SHARED_IN_APP_TITLE = "Gallery Shared"
GALLERY_SHARED_IN_APP_BODY = "{{ shared_by_name }} shared {{ gallery_name }} with you"


# =============================================================================
# GALLERY UPDATED TEMPLATE
# =============================================================================

GALLERY_UPDATED_EMAIL_SUBJECT = "New photos added to {{ gallery_name }}"

GALLERY_UPDATED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gallery Updated</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">New Photos Added</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ gallery_name }}}}</h1>
      </div>

      <div class="stats">
        <div>
          <div class="stat-value">+{{{{ new_photo_count }}}}</div>
          <div class="stat-label">New Photos</div>
        </div>
        <div>
          <div class="stat-value">{{{{ total_photo_count }}}}</div>
          <div class="stat-label">Total Photos</div>
        </div>
      </div>

      <div style="text-align: center;">
        <p style="color: #64748B;">
          {{{{ photographer_name }}}} added new photos to your gallery
        </p>
        <a href="{{{{ gallery_url }}}}" class="cta-button">View New Photos</a>
      </div>
    </div>

    <div class="footer">
      <p>You're receiving this because you have access to this gallery</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

GALLERY_UPDATED_EMAIL_TEXT = """
New photos added to {{ gallery_name }}!

{{ photographer_name }} added {{ new_photo_count }} new photos.
Total photos in gallery: {{ total_photo_count }}

View the new photos: {{ gallery_url }}

---
You're receiving this because you have access to this gallery
"""

GALLERY_UPDATED_PUSH_TITLE = "New Photos Added"
GALLERY_UPDATED_PUSH_BODY = "{{ new_photo_count }} new photos in {{ gallery_name }}"

GALLERY_UPDATED_IN_APP_TITLE = "Gallery Updated"
GALLERY_UPDATED_IN_APP_BODY = "{{ photographer_name }} added {{ new_photo_count }} photos to {{ gallery_name }}"


# =============================================================================
# GALLERY EXPIRING TEMPLATE
# =============================================================================

GALLERY_EXPIRING_EMAIL_SUBJECT = "Action required: {{ gallery_name }} expires in {{ days_remaining }} days"

GALLERY_EXPIRING_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gallery Expiring Soon</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Expiring Soon</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ gallery_name }}}}</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <div style="font-size: 48px; font-weight: 700; color: #D97706;">{{{{ days_remaining }}}}</div>
        <div style="font-size: 14px; color: #92400E; text-transform: uppercase;">Days Remaining</div>
      </div>

      <p style="text-align: center; color: #475569;">
        This gallery will be unavailable after <strong>{{{{ expiry_date }}}}</strong>.
        Make sure to download your photos before then.
      </p>

      <div style="text-align: center;">
        <a href="{{{{ gallery_url }}}}" class="cta-button">View Gallery</a>
        {{% if download_url %}}
        <br>
        <a href="{{{{ download_url }}}}" class="secondary-button">Download All Photos</a>
        {{% endif %}}
      </div>
    </div>

    <div class="footer">
      <p>Don't lose your photos! Download them before {{{{ expiry_date }}}}</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

GALLERY_EXPIRING_EMAIL_TEXT = """
IMPORTANT: Your gallery is expiring soon!

Gallery: {{ gallery_name }}
Expires: {{ expiry_date }}
Days remaining: {{ days_remaining }}

This gallery will be unavailable after the expiry date. Make sure to download your photos before then.

View gallery: {{ gallery_url }}
{% if download_url %}
Download all photos: {{ download_url }}
{% endif %}

---
Don't lose your photos! Download them before {{ expiry_date }}
"""

GALLERY_EXPIRING_SMS = """REMINDER: {{ gallery_name }} expires in {{ days_remaining }} days! Download your photos now: {{ gallery_url }}"""

GALLERY_EXPIRING_PUSH_TITLE = "Gallery Expiring!"
GALLERY_EXPIRING_PUSH_BODY = "{{ gallery_name }} expires in {{ days_remaining }} days - download now!"

GALLERY_EXPIRING_IN_APP_TITLE = "Gallery Expiring Soon"
GALLERY_EXPIRING_IN_APP_BODY = "{{ gallery_name }} will expire on {{ expiry_date }} ({{ days_remaining }} days)"


# =============================================================================
# GALLERY EXPIRED TEMPLATE
# =============================================================================

GALLERY_EXPIRED_EMAIL_SUBJECT = "{{ gallery_name }} has expired"

GALLERY_EXPIRED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gallery Expired</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="urgent-badge">Expired</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ gallery_name }}}}</h1>
      </div>

      <p style="text-align: center; color: #475569; margin: 24px 0;">
        This gallery is no longer available for viewing. If you need access to these photos,
        please contact the photographer.
      </p>

      {{% if photographer_email %}}
      <div style="text-align: center;">
        <a href="mailto:{{{{ photographer_email }}}}" class="cta-button">Contact Photographer</a>
      </div>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>Gallery expired on {{{{ expiry_date }}}}</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

GALLERY_EXPIRED_EMAIL_TEXT = """
Gallery Expired

The gallery "{{ gallery_name }}" is no longer available.

If you need access to these photos, please contact the photographer.
{% if photographer_email %}
Photographer email: {{ photographer_email }}
{% endif %}

---
Gallery expired on {{ expiry_date }}
"""

GALLERY_EXPIRED_IN_APP_TITLE = "Gallery Expired"
GALLERY_EXPIRED_IN_APP_BODY = "{{ gallery_name }} is no longer available"


# =============================================================================
# GALLERY COMMENTED TEMPLATE
# =============================================================================

GALLERY_COMMENTED_EMAIL_SUBJECT = "{{ commenter_name }} commented on {{ gallery_name }}"

GALLERY_COMMENTED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Comment</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">New Comment</h1>
        <p style="color: #64748B;">on {{{{ gallery_name }}}}</p>
      </div>

      <div class="message-box">
        <div style="font-weight: 600; color: #0F172A; margin-bottom: 8px;">{{{{ commenter_name }}}}</div>
        "{{{{ comment_preview }}}}"
      </div>

      <div style="text-align: center;">
        <a href="{{{{ gallery_url }}}}" class="cta-button">View Comment</a>
      </div>
    </div>

    <div class="footer">
      <p>You're receiving this because you own this gallery</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

GALLERY_COMMENTED_EMAIL_TEXT = """
New Comment on {{ gallery_name }}

{{ commenter_name }} wrote:
"{{ comment_preview }}"

View comment: {{ gallery_url }}

---
You're receiving this because you own this gallery
"""

GALLERY_COMMENTED_PUSH_TITLE = "New Comment"
GALLERY_COMMENTED_PUSH_BODY = "{{ commenter_name }}: {{ comment_preview }}"

GALLERY_COMMENTED_IN_APP_TITLE = "New Comment"
GALLERY_COMMENTED_IN_APP_BODY = "{{ commenter_name }} commented on {{ gallery_name }}"


# =============================================================================
# GALLERY FAVORITE TEMPLATE (for photographers)
# =============================================================================

GALLERY_FAVORITE_EMAIL_SUBJECT = "{{ client_name }} favorited photos in {{ gallery_name }}"

GALLERY_FAVORITE_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Photos Favorited</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Client Activity</h1>
        <p style="color: #64748B;">{{{{ gallery_name }}}}</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <div style="font-size: 14px; color: #64748B;">{{{{ client_name }}}} favorited</div>
        <div style="font-size: 48px; font-weight: 700; color: #2563EB;">{{{{ favorite_count }}}}</div>
        <div style="font-size: 14px; color: #64748B;">photos</div>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ gallery_url }}}}" class="cta-button">View Favorites</a>
      </div>
    </div>

    <div class="footer">
      <p>Client engagement notification</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

GALLERY_FAVORITE_EMAIL_TEXT = """
Client Activity - {{ gallery_name }}

{{ client_name }} favorited {{ favorite_count }} photos in your gallery.

View their favorites: {{ gallery_url }}

---
Client engagement notification
"""

GALLERY_FAVORITE_PUSH_TITLE = "Photos Favorited"
GALLERY_FAVORITE_PUSH_BODY = "{{ client_name }} favorited {{ favorite_count }} photos"

GALLERY_FAVORITE_IN_APP_TITLE = "Photos Favorited"
GALLERY_FAVORITE_IN_APP_BODY = "{{ client_name }} favorited {{ favorite_count }} photos in {{ gallery_name }}"


# =============================================================================
# GALLERY DOWNLOADED TEMPLATE (for photographers)
# =============================================================================

GALLERY_DOWNLOADED_EMAIL_SUBJECT = "{{ client_name }} downloaded from {{ gallery_name }}"

GALLERY_DOWNLOADED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gallery Download</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Download Activity</h1>
        <p style="color: #64748B;">{{{{ gallery_name }}}}</p>
      </div>

      <div class="info-row">
        <div class="info-label">Client</div>
        <div class="info-value">{{{{ client_name }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Download Type</div>
        <div class="info-value">{{{{ download_type }}}}</div>
      </div>

      {{% if photo_count %}}
      <div class="info-row">
        <div class="info-label">Photos Downloaded</div>
        <div class="info-value">{{{{ photo_count }}}}</div>
      </div>
      {{% endif %}}

      {{% if download_size_mb %}}
      <div class="info-row">
        <div class="info-label">Download Size</div>
        <div class="info-value">{{{{ download_size_mb }}}} MB</div>
      </div>
      {{% endif %}}

      <div style="text-align: center; margin-top: 24px;">
        <a href="{{{{ gallery_url }}}}" class="cta-button">View Gallery</a>
      </div>
    </div>

    <div class="footer">
      <p>Download notification for gallery owners</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

GALLERY_DOWNLOADED_EMAIL_TEXT = """
Download Activity - {{ gallery_name }}

Client: {{ client_name }}
Download Type: {{ download_type }}
{% if photo_count %}Photos Downloaded: {{ photo_count }}{% endif %}
{% if download_size_mb %}Download Size: {{ download_size_mb }} MB{% endif %}

View gallery: {{ gallery_url }}

---
Download notification for gallery owners
"""

GALLERY_DOWNLOADED_PUSH_TITLE = "Gallery Downloaded"
GALLERY_DOWNLOADED_PUSH_BODY = "{{ client_name }} downloaded {{ download_type }} from {{ gallery_name }}"

GALLERY_DOWNLOADED_IN_APP_TITLE = "Gallery Downloaded"
GALLERY_DOWNLOADED_IN_APP_BODY = "{{ client_name }} downloaded from {{ gallery_name }}"


# =============================================================================
# SELECTION SUBMITTED TEMPLATE (for photographers)
# =============================================================================

SELECTION_SUBMITTED_EMAIL_SUBJECT = "{{ client_name }} submitted their selections - {{ gallery_name }}"

SELECTION_SUBMITTED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Selection Submitted</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Selection Received</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ gallery_name }}}}</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 16px; color: #475569;">{{{{ client_name }}}} has submitted their photo selections</p>
        <div style="font-size: 48px; font-weight: 700; color: #166534;">{{{{ selection_count }}}}</div>
        <div style="font-size: 14px; color: #64748B;">Photos Selected</div>
      </div>

      {{% if notes %}}
      <div class="message-box">
        <div style="font-weight: 600; margin-bottom: 8px;">Client Notes:</div>
        "{{{{ notes }}}}"
      </div>
      {{% endif %}}

      {{% if submission_deadline %}}
      <p style="text-align: center; color: #64748B; font-size: 14px;">
        Note: Selection deadline was {{{{ submission_deadline }}}}
      </p>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ gallery_url }}}}" class="cta-button">Review Selections</a>
      </div>
    </div>

    <div class="footer">
      <p>Action required: Review and approve client selections</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SELECTION_SUBMITTED_EMAIL_TEXT = """
Selection Submitted - {{ gallery_name }}

{{ client_name }} has submitted their photo selections.

Photos Selected: {{ selection_count }}

{% if notes %}
Client Notes: "{{ notes }}"
{% endif %}

Review selections: {{ gallery_url }}

---
Action required: Review and approve client selections
"""

SELECTION_SUBMITTED_SMS = """{{ client_name }} submitted {{ selection_count }} photo selections for {{ gallery_name }}. Review now: {{ gallery_url }}"""

SELECTION_SUBMITTED_PUSH_TITLE = "Selection Submitted"
SELECTION_SUBMITTED_PUSH_BODY = "{{ client_name }} selected {{ selection_count }} photos from {{ gallery_name }}"

SELECTION_SUBMITTED_IN_APP_TITLE = "Selection Submitted"
SELECTION_SUBMITTED_IN_APP_BODY = "{{ client_name }} submitted {{ selection_count }} photo selections for {{ gallery_name }}"


# =============================================================================
# SELECTION APPROVED TEMPLATE (for clients)
# =============================================================================

SELECTION_APPROVED_EMAIL_SUBJECT = "Your selections have been approved - {{ gallery_name }}"

SELECTION_APPROVED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Selections Approved</title>
  {GALLERY_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Approved!</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Your Selections Are Ready</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="font-size: 16px; color: #475569;">
          Great news! Your photo selections from <strong>{{{{ gallery_name }}}}</strong> have been approved.
        </p>
        <div style="font-size: 48px; font-weight: 700; color: #2563EB;">{{{{ approved_count }}}}</div>
        <div style="font-size: 14px; color: #64748B;">Photos Approved</div>
      </div>

      {{% if next_steps %}}
      <div class="message-box">
        <div style="font-weight: 600; margin-bottom: 8px;">Next Steps:</div>
        {{{{ next_steps }}}}
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        {{% if download_url %}}
        <a href="{{{{ download_url }}}}" class="cta-button">Download Your Photos</a>
        {{% else %}}
        <a href="{{{{ gallery_url }}}}" class="cta-button">View Your Photos</a>
        {{% endif %}}
      </div>
    </div>

    <div class="footer">
      <p>Your photo selections from {{{{ gallery_name }}}} have been processed</p>
      <p style="margin-top: 16px;">
        <a href="{{{{ unsubscribe_url }}}}" style="color: #64748B;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SELECTION_APPROVED_EMAIL_TEXT = """
Your Selections Are Approved!

Great news! Your photo selections from "{{ gallery_name }}" have been approved.

Photos Approved: {{ approved_count }}

{% if next_steps %}
Next Steps: {{ next_steps }}
{% endif %}

{% if download_url %}
Download your photos: {{ download_url }}
{% else %}
View your photos: {{ gallery_url }}
{% endif %}

---
Your photo selections from {{ gallery_name }} have been processed
"""

SELECTION_APPROVED_SMS = """Great news! Your {{ approved_count }} photo selections from {{ gallery_name }} are approved! {% if download_url %}Download: {{ download_url }}{% endif %}"""

SELECTION_APPROVED_PUSH_TITLE = "Selections Approved!"
SELECTION_APPROVED_PUSH_BODY = "Your {{ approved_count }} photos from {{ gallery_name }} are ready"

SELECTION_APPROVED_IN_APP_TITLE = "Selections Approved"
SELECTION_APPROVED_IN_APP_BODY = "{{ approved_count }} photos from {{ gallery_name }} have been approved"


# =============================================================================
# TEMPLATE DEFINITIONS
# =============================================================================

GALLERY_TEMPLATES: dict[str, GalleryTemplate] = {
    "gallery_published": GalleryTemplate(
        event_type=EventType.GALLERY_PUBLISHED,
        code="gallery_published",
        name="Gallery Published Notification",
        description="Sent to clients when a photographer publishes a new gallery for them",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        email_subject=GALLERY_PUBLISHED_EMAIL_SUBJECT,
        email_html=GALLERY_PUBLISHED_EMAIL_HTML,
        email_text=GALLERY_PUBLISHED_EMAIL_TEXT,
        email_from_name="{{ photographer_name }} via RawDrive",
        sms_content=GALLERY_PUBLISHED_SMS,
        push_title=GALLERY_PUBLISHED_PUSH_TITLE,
        push_body=GALLERY_PUBLISHED_PUSH_BODY,
        push_action_url="{{ gallery_url }}",
        in_app_title=GALLERY_PUBLISHED_IN_APP_TITLE,
        in_app_body=GALLERY_PUBLISHED_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}",
        in_app_icon="gallery",
        required_variables=["gallery_id", "gallery_name", "gallery_url", "photographer_name", "photo_count"],
        optional_variables=[
            "cover_photo_url",
            "expiry_date",
            "days_until_expiry",
            "custom_message",
            "download_enabled",
            "unsubscribe_url",
        ],
        default_values={
            "download_enabled": False,
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "high-engagement", "gallery"],
    ),
    "gallery_shared": GalleryTemplate(
        event_type=EventType.GALLERY_SHARED,
        code="gallery_shared",
        name="Gallery Shared Notification",
        description="Sent when someone shares a gallery with another person",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        email_subject=GALLERY_SHARED_EMAIL_SUBJECT,
        email_html=GALLERY_SHARED_EMAIL_HTML,
        email_text=GALLERY_SHARED_EMAIL_TEXT,
        push_title=GALLERY_SHARED_PUSH_TITLE,
        push_body=GALLERY_SHARED_PUSH_BODY,
        push_action_url="{{ gallery_url }}",
        in_app_title=GALLERY_SHARED_IN_APP_TITLE,
        in_app_body=GALLERY_SHARED_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}",
        in_app_icon="share",
        required_variables=["gallery_id", "gallery_name", "shared_by_name", "gallery_url"],
        optional_variables=["message", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "social", "gallery"],
    ),
    "gallery_updated": GalleryTemplate(
        event_type=EventType.GALLERY_UPDATED,
        code="gallery_updated",
        name="Gallery Updated Notification",
        description="Sent when new photos are added to an existing gallery",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        email_subject=GALLERY_UPDATED_EMAIL_SUBJECT,
        email_html=GALLERY_UPDATED_EMAIL_HTML,
        email_text=GALLERY_UPDATED_EMAIL_TEXT,
        push_title=GALLERY_UPDATED_PUSH_TITLE,
        push_body=GALLERY_UPDATED_PUSH_BODY,
        push_action_url="{{ gallery_url }}",
        in_app_title=GALLERY_UPDATED_IN_APP_TITLE,
        in_app_body=GALLERY_UPDATED_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}",
        in_app_icon="gallery",
        required_variables=["gallery_id", "gallery_name", "new_photo_count", "gallery_url"],
        optional_variables=["total_photo_count", "photographer_name", "unsubscribe_url"],
        default_values={
            "photographer_name": "Your photographer",
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "gallery"],
    ),
    "gallery_expiring": GalleryTemplate(
        event_type=EventType.GALLERY_EXPIRING,
        code="gallery_expiring",
        name="Gallery Expiring Warning",
        description="Warning sent before a gallery expires and is no longer accessible",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        email_subject=GALLERY_EXPIRING_EMAIL_SUBJECT,
        email_html=GALLERY_EXPIRING_EMAIL_HTML,
        email_text=GALLERY_EXPIRING_EMAIL_TEXT,
        sms_content=GALLERY_EXPIRING_SMS,
        push_title=GALLERY_EXPIRING_PUSH_TITLE,
        push_body=GALLERY_EXPIRING_PUSH_BODY,
        push_action_url="{{ gallery_url }}",
        in_app_title=GALLERY_EXPIRING_IN_APP_TITLE,
        in_app_body=GALLERY_EXPIRING_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}",
        in_app_icon="warning",
        required_variables=["gallery_id", "gallery_name", "expiry_date", "days_remaining", "gallery_url"],
        optional_variables=["download_url", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "time-sensitive", "action-required", "gallery"],
    ),
    "gallery_expired": GalleryTemplate(
        event_type=EventType.GALLERY_EXPIRED,
        code="gallery_expired",
        name="Gallery Expired Notification",
        description="Notification when a gallery has expired",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        email_subject=GALLERY_EXPIRED_EMAIL_SUBJECT,
        email_html=GALLERY_EXPIRED_EMAIL_HTML,
        email_text=GALLERY_EXPIRED_EMAIL_TEXT,
        in_app_title=GALLERY_EXPIRED_IN_APP_TITLE,
        in_app_body=GALLERY_EXPIRED_IN_APP_BODY,
        in_app_action_url="/galleries",
        in_app_icon="expired",
        required_variables=["gallery_id", "gallery_name"],
        optional_variables=["expiry_date", "photographer_email", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "gallery"],
    ),
    "gallery_commented": GalleryTemplate(
        event_type=EventType.GALLERY_COMMENTED,
        code="gallery_commented",
        name="New Gallery Comment",
        description="Sent when someone comments on a gallery",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        email_subject=GALLERY_COMMENTED_EMAIL_SUBJECT,
        email_html=GALLERY_COMMENTED_EMAIL_HTML,
        email_text=GALLERY_COMMENTED_EMAIL_TEXT,
        push_title=GALLERY_COMMENTED_PUSH_TITLE,
        push_body=GALLERY_COMMENTED_PUSH_BODY,
        push_action_url="{{ gallery_url }}",
        in_app_title=GALLERY_COMMENTED_IN_APP_TITLE,
        in_app_body=GALLERY_COMMENTED_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}",
        in_app_icon="comment",
        required_variables=["gallery_id", "gallery_name", "commenter_name", "comment_preview", "gallery_url"],
        optional_variables=["comment_id", "photo_id", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["engagement", "social", "gallery"],
    ),
    "gallery_favorite": GalleryTemplate(
        event_type=EventType.GALLERY_FAVORITE,
        code="gallery_favorite",
        name="Gallery Favorited",
        description="Sent to photographer when a client favorites photos in a gallery",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.LOW,
        email_subject=GALLERY_FAVORITE_EMAIL_SUBJECT,
        email_html=GALLERY_FAVORITE_EMAIL_HTML,
        email_text=GALLERY_FAVORITE_EMAIL_TEXT,
        push_title=GALLERY_FAVORITE_PUSH_TITLE,
        push_body=GALLERY_FAVORITE_PUSH_BODY,
        push_action_url="{{ gallery_url }}",
        in_app_title=GALLERY_FAVORITE_IN_APP_TITLE,
        in_app_body=GALLERY_FAVORITE_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}/favorites",
        in_app_icon="heart",
        required_variables=["gallery_id", "gallery_name", "favorite_count", "gallery_url"],
        optional_variables=["client_name", "photo_ids", "unsubscribe_url"],
        default_values={
            "client_name": "A client",
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["engagement", "photographer-facing", "gallery"],
    ),
    "gallery_downloaded": GalleryTemplate(
        event_type=EventType.GALLERY_DOWNLOADED,
        code="gallery_downloaded",
        name="Gallery Downloaded",
        description="Sent to photographer when a client downloads from a gallery",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.LOW,
        email_subject=GALLERY_DOWNLOADED_EMAIL_SUBJECT,
        email_html=GALLERY_DOWNLOADED_EMAIL_HTML,
        email_text=GALLERY_DOWNLOADED_EMAIL_TEXT,
        push_title=GALLERY_DOWNLOADED_PUSH_TITLE,
        push_body=GALLERY_DOWNLOADED_PUSH_BODY,
        push_action_url="{{ gallery_url }}",
        in_app_title=GALLERY_DOWNLOADED_IN_APP_TITLE,
        in_app_body=GALLERY_DOWNLOADED_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}",
        in_app_icon="download",
        required_variables=["gallery_id", "gallery_name", "download_type", "gallery_url"],
        optional_variables=["client_name", "photo_count", "download_size_mb", "unsubscribe_url"],
        default_values={
            "client_name": "A client",
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["engagement", "photographer-facing", "gallery"],
    ),
    "gallery_selection_submitted": GalleryTemplate(
        event_type=EventType.GALLERY_SELECTION_SUBMITTED,
        code="gallery_selection_submitted",
        name="Selection Submitted",
        description="Sent to photographer when client submits their photo selections",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        email_subject=SELECTION_SUBMITTED_EMAIL_SUBJECT,
        email_html=SELECTION_SUBMITTED_EMAIL_HTML,
        email_text=SELECTION_SUBMITTED_EMAIL_TEXT,
        sms_content=SELECTION_SUBMITTED_SMS,
        push_title=SELECTION_SUBMITTED_PUSH_TITLE,
        push_body=SELECTION_SUBMITTED_PUSH_BODY,
        push_action_url="{{ gallery_url }}",
        in_app_title=SELECTION_SUBMITTED_IN_APP_TITLE,
        in_app_body=SELECTION_SUBMITTED_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}/selections",
        in_app_icon="selection",
        required_variables=["gallery_id", "gallery_name", "selection_count", "client_name", "gallery_url"],
        optional_variables=["notes", "submission_deadline", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["action-required", "photographer-facing", "gallery"],
    ),
    "gallery_selection_approved": GalleryTemplate(
        event_type=EventType.GALLERY_SELECTION_APPROVED,
        code="gallery_selection_approved",
        name="Selection Approved",
        description="Sent to client when photographer approves their selections",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        email_subject=SELECTION_APPROVED_EMAIL_SUBJECT,
        email_html=SELECTION_APPROVED_EMAIL_HTML,
        email_text=SELECTION_APPROVED_EMAIL_TEXT,
        sms_content=SELECTION_APPROVED_SMS,
        push_title=SELECTION_APPROVED_PUSH_TITLE,
        push_body=SELECTION_APPROVED_PUSH_BODY,
        push_action_url="{{ download_url | default(gallery_url) }}",
        in_app_title=SELECTION_APPROVED_IN_APP_TITLE,
        in_app_body=SELECTION_APPROVED_IN_APP_BODY,
        in_app_action_url="/galleries/{{ gallery_id }}/selections",
        in_app_icon="check",
        required_variables=["gallery_id", "gallery_name", "approved_count", "gallery_url"],
        optional_variables=["download_url", "next_steps", "unsubscribe_url"],
        default_values={
            "unsubscribe_url": "{{ base_url }}/preferences",
        },
        tags=["client-facing", "milestone", "gallery"],
    ),
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_gallery_template(template_code: str) -> GalleryTemplate | None:
    """Get a gallery template by its code.

    Args:
        template_code: The template code (e.g., 'gallery_published')

    Returns:
        GalleryTemplate or None if not found
    """
    return GALLERY_TEMPLATES.get(template_code)


def get_template_for_event(event_type: EventType | str) -> GalleryTemplate | None:
    """Get a gallery template by its event type.

    Args:
        event_type: The event type enum or string value

    Returns:
        GalleryTemplate or None if not found
    """
    if isinstance(event_type, str):
        try:
            event_type = EventType(event_type)
        except ValueError:
            return None

    for template in GALLERY_TEMPLATES.values():
        if template.event_type == event_type:
            return template
    return None


def list_gallery_templates() -> list[str]:
    """Get a list of all gallery template codes.

    Returns:
        List of template codes
    """
    return list(GALLERY_TEMPLATES.keys())


def get_template_variable_schema(template_code: str) -> dict[str, Any] | None:
    """Get the variable schema for a template.

    Args:
        template_code: The template code

    Returns:
        Dict with 'required' and 'optional' keys, or None if template not found
    """
    template = get_gallery_template(template_code)
    if not template:
        return None

    return {
        "required": template.required_variables,
        "optional": template.optional_variables,
    }


def get_templates_by_channel(channel: NotificationChannel) -> list[GalleryTemplate]:
    """Get all templates that support a specific channel.

    Args:
        channel: The notification channel

    Returns:
        List of GalleryTemplate instances
    """
    return [
        template
        for template in GALLERY_TEMPLATES.values()
        if channel in template.supported_channels
    ]


def get_templates_by_priority(priority: NotificationPriority) -> list[GalleryTemplate]:
    """Get all templates with a specific priority.

    Args:
        priority: The notification priority

    Returns:
        List of GalleryTemplate instances
    """
    return [
        template
        for template in GALLERY_TEMPLATES.values()
        if template.default_priority == priority
    ]


def get_client_facing_templates() -> list[GalleryTemplate]:
    """Get all client-facing gallery templates.

    Returns:
        List of GalleryTemplate instances with 'client-facing' tag
    """
    return [
        template
        for template in GALLERY_TEMPLATES.values()
        if "client-facing" in template.tags
    ]


def get_photographer_facing_templates() -> list[GalleryTemplate]:
    """Get all photographer-facing gallery templates.

    Returns:
        List of GalleryTemplate instances with 'photographer-facing' tag
    """
    return [
        template
        for template in GALLERY_TEMPLATES.values()
        if "photographer-facing" in template.tags
    ]


# =============================================================================
# EXPORTS
# =============================================================================


__all__ = [
    # Data class
    "GalleryTemplate",
    # Template registry
    "GALLERY_TEMPLATES",
    # Helper functions
    "get_gallery_template",
    "get_template_for_event",
    "list_gallery_templates",
    "get_template_variable_schema",
    "get_templates_by_channel",
    "get_templates_by_priority",
    "get_client_facing_templates",
    "get_photographer_facing_templates",
    # Common styles (for custom templates)
    "GALLERY_EMAIL_STYLES",
]
