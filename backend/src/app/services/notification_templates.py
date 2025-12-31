"""Notification email templates for RSVP alerts.

Feature: 016-save-the-date
Task: T111 - Notification templates for RSVP topics

Provides HTML and text templates for:
- Immediate RSVP notifications to hosts
- Daily digest emails to hosts
- Guest RSVP confirmations

Template variables use Jinja2-style placeholders: {{ variable_name }}
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class EmailTemplate:
    """Email template with subject, HTML, and plain text content."""

    subject: str
    html: str
    text: str


# ---------------------------------------------------------------------------
# RSVP Host Immediate Notification
# ---------------------------------------------------------------------------

RSVP_HOST_IMMEDIATE_SUBJECT = "New RSVP: {{ guest_name }} - {{ invitation_title }}"

RSVP_HOST_IMMEDIATE_HTML = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New RSVP Received</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #0F172A; background-color: #F8FAFC; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #FFFFFF; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 700; color: #2563EB; }
    .status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; }
    .status-attending { background: #DCFCE7; color: #166534; }
    .status-not-attending { background: #FEE2E2; color: #991B1B; }
    .info-row { padding: 12px 0; border-bottom: 1px solid #E2E8F0; }
    .info-row:last-child { border-bottom: none; }
    .info-label { font-size: 12px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { font-size: 16px; color: #0F172A; margin-top: 4px; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #2563EB, #1D4ED8); color: #FFFFFF; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 24px; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #64748B; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">New RSVP Received!</h1>
        <p style="color: #64748B; margin: 0;">{{ invitation_title }}</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <span class="status-badge {{ 'status-attending' if attending else 'status-not-attending' }}">
          {{ status_text }}
        </span>
      </div>

      <div class="info-row">
        <div class="info-label">Guest Name</div>
        <div class="info-value">{{ guest_name }}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Party Size</div>
        <div class="info-value">{{ party_size }} {{ 'guest' if party_size == 1 else 'guests' }}</div>
      </div>

      {% if dietary_preferences %}
      <div class="info-row">
        <div class="info-label">Dietary Preferences</div>
        <div class="info-value">{{ dietary_preferences }}</div>
      </div>
      {% endif %}

      {% if message %}
      <div class="info-row">
        <div class="info-label">Message</div>
        <div class="info-value">{{ message }}</div>
      </div>
      {% endif %}

      <div style="text-align: center;">
        <a href="{{ dashboard_link }}" class="cta-button">View All RSVPs</a>
      </div>
    </div>

    <div class="footer">
      <p>You're receiving this because you're the host of "{{ invitation_title }}"</p>
      <p>Manage your notification preferences in the invitation settings.</p>
    </div>
  </div>
</body>
</html>
"""

RSVP_HOST_IMMEDIATE_TEXT = """
New RSVP Received!

{{ invitation_title }}

{{ status_text }}

Guest Name: {{ guest_name }}
Party Size: {{ party_size }} {{ 'guest' if party_size == 1 else 'guests' }}
{% if dietary_preferences %}Dietary Preferences: {{ dietary_preferences }}{% endif %}
{% if message %}Message: {{ message }}{% endif %}

View all RSVPs: {{ dashboard_link }}

---
You're receiving this because you're the host of "{{ invitation_title }}"
Manage your notification preferences in the invitation settings.
"""


# ---------------------------------------------------------------------------
# RSVP Host Daily Digest
# ---------------------------------------------------------------------------

RSVP_HOST_DIGEST_SUBJECT = "Daily RSVP Summary: {{ rsvp_count }} new response{{ 's' if rsvp_count > 1 else '' }} - {{ invitation_title }}"

RSVP_HOST_DIGEST_HTML = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily RSVP Summary</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #0F172A; background-color: #F8FAFC; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #FFFFFF; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 700; color: #2563EB; }
    .stats { display: flex; justify-content: center; gap: 24px; margin: 24px 0; text-align: center; }
    .stat { padding: 16px; }
    .stat-value { font-size: 32px; font-weight: 700; }
    .stat-value.attending { color: #166534; }
    .stat-value.not-attending { color: #991B1B; }
    .stat-value.total { color: #2563EB; }
    .stat-label { font-size: 12px; color: #64748B; text-transform: uppercase; }
    .rsvp-list { margin: 24px 0; }
    .rsvp-item { padding: 12px 16px; background: #F8FAFC; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .rsvp-name { font-weight: 600; }
    .rsvp-status { font-size: 12px; padding: 4px 12px; border-radius: 12px; }
    .rsvp-attending { background: #DCFCE7; color: #166534; }
    .rsvp-not-attending { background: #FEE2E2; color: #991B1B; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #2563EB, #1D4ED8); color: #FFFFFF; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #64748B; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Daily RSVP Summary</h1>
        <p style="color: #64748B; margin: 0;">{{ invitation_title }}</p>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value total">{{ rsvp_count }}</div>
          <div class="stat-label">New Responses</div>
        </div>
        <div class="stat">
          <div class="stat-value attending">{{ attending_count }}</div>
          <div class="stat-label">Attending</div>
        </div>
        <div class="stat">
          <div class="stat-value not-attending">{{ not_attending_count }}</div>
          <div class="stat-label">Not Attending</div>
        </div>
      </div>

      <p style="text-align: center; color: #64748B;">
        Total guests confirmed: <strong>{{ total_party_size }}</strong>
      </p>

      <div class="rsvp-list">
        <h3 style="font-size: 14px; color: #64748B; text-transform: uppercase; margin-bottom: 12px;">Today's Responses</h3>
        {% for rsvp in rsvps %}
        <div class="rsvp-item">
          <div>
            <div class="rsvp-name">{{ rsvp.guest_name }}</div>
            <div style="font-size: 12px; color: #64748B;">{{ rsvp.party_size }} {{ 'guest' if rsvp.party_size == 1 else 'guests' }}</div>
          </div>
          <span class="rsvp-status {{ 'rsvp-attending' if rsvp.attending else 'rsvp-not-attending' }}">
            {{ 'Attending' if rsvp.attending else 'Not Attending' }}
          </span>
        </div>
        {% endfor %}
      </div>

      <div style="text-align: center;">
        <a href="{{ dashboard_link }}" class="cta-button">View All RSVPs</a>
      </div>
    </div>

    <div class="footer">
      <p>You're receiving this daily digest because you enabled it for "{{ invitation_title }}"</p>
      <p>Change to immediate notifications or disable in your invitation settings.</p>
    </div>
  </div>
</body>
</html>
"""

RSVP_HOST_DIGEST_TEXT = """
Daily RSVP Summary

{{ invitation_title }}

{{ rsvp_count }} new response{{ 's' if rsvp_count > 1 else '' }} today

Summary:
- Attending: {{ attending_count }}
- Not Attending: {{ not_attending_count }}
- Total guests confirmed: {{ total_party_size }}

Today's Responses:
{% for rsvp in rsvps %}
- {{ rsvp.guest_name }} ({{ rsvp.party_size }} guest{{ 's' if rsvp.party_size > 1 else '' }}): {{ 'Attending' if rsvp.attending else 'Not Attending' }}
{% endfor %}

View all RSVPs: {{ dashboard_link }}

---
You're receiving this daily digest because you enabled it for "{{ invitation_title }}"
Change to immediate notifications or disable in your invitation settings.
"""


# ---------------------------------------------------------------------------
# RSVP Guest Confirmation
# ---------------------------------------------------------------------------

RSVP_GUEST_CONFIRMATION_SUBJECT = "RSVP Confirmed: {{ invitation_title }}"

RSVP_GUEST_CONFIRMATION_HTML = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RSVP Confirmation</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #0F172A; background-color: #F8FAFC; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #FFFFFF; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 700; color: #2563EB; }
    .checkmark { width: 64px; height: 64px; background: #DCFCE7; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .checkmark svg { width: 32px; height: 32px; color: #166534; }
    .status-text { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    .status-attending { color: #166534; }
    .status-not-attending { color: #991B1B; }
    .event-card { background: #F8FAFC; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .event-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    .event-detail { display: flex; gap: 8px; margin-bottom: 8px; font-size: 14px; color: #64748B; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #2563EB, #1D4ED8); color: #FFFFFF; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .edit-link { display: block; text-align: center; margin-top: 16px; color: #2563EB; font-size: 14px; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #64748B; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
      </div>

      <div style="text-align: center;">
        <div class="checkmark">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p class="status-text {{ 'status-attending' if attending else 'status-not-attending' }}">
          {{ 'You\'re going!' if attending else 'You\'ve declined' }}
        </p>
        <p style="color: #64748B;">Thank you for your response, {{ guest_name }}!</p>
      </div>

      <div class="event-card">
        <div class="event-title">{{ invitation_title }}</div>
        <div class="event-detail">
          <span>📅</span>
          <span>{{ event_datetime }}</span>
        </div>
        {% if venue_name %}
        <div class="event-detail">
          <span>📍</span>
          <span>{{ venue_name }}</span>
        </div>
        {% endif %}
        {% if party_size > 1 %}
        <div class="event-detail">
          <span>👥</span>
          <span>{{ party_size }} guests in your party</span>
        </div>
        {% endif %}
      </div>

      <div style="text-align: center;">
        <a href="{{ edit_link }}" class="cta-button">Add to Calendar</a>
        <a href="{{ edit_link }}" class="edit-link">Need to change your response?</a>
      </div>
    </div>

    <div class="footer">
      <p>This confirmation was sent to {{ guest_email }}</p>
      <p>Use the edit link above if you need to update your RSVP.</p>
    </div>
  </div>
</body>
</html>
"""

RSVP_GUEST_CONFIRMATION_TEXT = """
RSVP Confirmed!

Thank you for your response, {{ guest_name }}!

Your response: {{ 'Attending' if attending else 'Not Attending' }}

Event Details:
{{ invitation_title }}
Date: {{ event_datetime }}
{% if venue_name %}Venue: {{ venue_name }}{% endif %}
{% if party_size > 1 %}Party Size: {{ party_size }} guests{% endif %}

Need to change your response?
{{ edit_link }}

---
This confirmation was sent to {{ guest_email }}
"""


# ---------------------------------------------------------------------------
# Template Registry
# ---------------------------------------------------------------------------

TEMPLATES = {
    "rsvp_host_immediate": EmailTemplate(
        subject=RSVP_HOST_IMMEDIATE_SUBJECT,
        html=RSVP_HOST_IMMEDIATE_HTML,
        text=RSVP_HOST_IMMEDIATE_TEXT,
    ),
    "rsvp_host_digest": EmailTemplate(
        subject=RSVP_HOST_DIGEST_SUBJECT,
        html=RSVP_HOST_DIGEST_HTML,
        text=RSVP_HOST_DIGEST_TEXT,
    ),
    "rsvp_confirmation": EmailTemplate(
        subject=RSVP_GUEST_CONFIRMATION_SUBJECT,
        html=RSVP_GUEST_CONFIRMATION_HTML,
        text=RSVP_GUEST_CONFIRMATION_TEXT,
    ),
}


def get_template(template_name: str) -> EmailTemplate | None:
    """Get an email template by name."""
    return TEMPLATES.get(template_name)


def render_template(template_name: str, context: dict[str, Any]) -> dict[str, str] | None:
    """Render an email template with the given context.

    This is a simple implementation using string replace.
    For production, use Jinja2 for proper template rendering.

    Args:
        template_name: Name of the template
        context: Variables to substitute in the template

    Returns:
        Dict with 'subject', 'html', 'text' keys, or None if template not found
    """
    template = get_template(template_name)
    if not template:
        return None

    # Simple variable substitution (for production, use Jinja2)
    def substitute(text: str, ctx: dict) -> str:
        result = text
        for key, value in ctx.items():
            result = result.replace(f"{{{{ {key} }}}}", str(value))
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result

    return {
        "subject": substitute(template.subject, context),
        "html": substitute(template.html, context),
        "text": substitute(template.text, context),
    }


def list_templates() -> list[str]:
    """List all available template names."""
    return list(TEMPLATES.keys())
