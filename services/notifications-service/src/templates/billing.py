"""Billing notification templates for the Notifications & Communication Microservice.

This module provides default templates for all billing-related notification events:
- Payment success/failure/refund notifications
- Subscription lifecycle notifications (created, upgraded, downgraded, cancelled, renewed)
- Invoice notifications (created, paid, overdue)
- Trial notifications (ending, expired)
- Usage notifications (warning, limit reached)

Each template includes:
- Email content (subject, HTML, plain text)
- SMS content (for supported events)
- Push notification content
- In-app notification content
- Variable schema definitions
- Default values for optional variables

All billing templates are marked as transactional (cannot be disabled by user preferences)
as they contain important account and payment information.

Templates use Jinja2 syntax for variable substitution: {{ variable_name }}

Feature: Notifications & Communication Microservice
Task: T039 - Create billing notification templates
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
class BillingTemplate:
    """Complete template definition for a billing notification.

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
    is_transactional: bool = True  # Billing emails are transactional by default

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
    in_app_icon: str = "billing"

    # Variable schema
    required_variables: list[str] = field(default_factory=list)
    optional_variables: list[str] = field(default_factory=list)
    default_values: dict[str, Any] = field(default_factory=dict)

    # Tags for categorization
    tags: list[str] = field(default_factory=list)


# =============================================================================
# COMMON HTML STYLES FOR BILLING TEMPLATES
# =============================================================================

BILLING_EMAIL_STYLES = """
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
  .amount-display {
    text-align: center;
    margin: 24px 0;
  }
  .amount-value {
    font-size: 48px;
    font-weight: 700;
    color: #0F172A;
  }
  .amount-label {
    font-size: 14px;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.5px;
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
  .invoice-table {
    width: 100%;
    border-collapse: collapse;
    margin: 24px 0;
  }
  .invoice-table th,
  .invoice-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #E2E8F0;
  }
  .invoice-table th {
    font-size: 12px;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }
  .invoice-table .total-row {
    font-weight: 700;
    border-top: 2px solid #E2E8F0;
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
  .footer {
    text-align: center;
    margin-top: 32px;
    font-size: 12px;
    color: #64748B;
  }
  .plan-features {
    background: #F8FAFC;
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
  }
  .plan-features ul {
    margin: 0;
    padding-left: 20px;
  }
  .plan-features li {
    margin: 8px 0;
    color: #475569;
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
</style>
"""


# =============================================================================
# PAYMENT SUCCESS TEMPLATE
# =============================================================================

PAYMENT_SUCCESS_EMAIL_SUBJECT = "Payment received - {{ amount }} {{ currency }}"

PAYMENT_SUCCESS_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Payment Successful</span>
      </div>

      <div class="amount-display">
        <div class="amount-label">Amount Paid</div>
        <div class="amount-value">{{{{ currency_symbol }}}}{{{{ amount }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Payment Date</div>
        <div class="info-value">{{{{ payment_date }}}}</div>
      </div>

      {{% if invoice_id %}}
      <div class="info-row">
        <div class="info-label">Invoice Number</div>
        <div class="info-value">{{{{ invoice_id }}}}</div>
      </div>
      {{% endif %}}

      {{% if payment_method %}}
      <div class="info-row">
        <div class="info-label">Payment Method</div>
        <div class="info-value">{{{{ payment_method }}}}</div>
      </div>
      {{% endif %}}

      {{% if receipt_url %}}
      <div style="text-align: center;">
        <a href="{{{{ receipt_url }}}}" class="cta-button">View Receipt</a>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        Thank you for your payment. Your account has been updated.
      </p>
    </div>

    <div class="footer">
      <p>This is a transactional email for your RawDrive account.</p>
      <p style="margin-top: 8px;">
        Questions? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

PAYMENT_SUCCESS_EMAIL_TEXT = """
Payment Successful

Amount Paid: {{ currency_symbol }}{{ amount }} {{ currency }}
Payment Date: {{ payment_date }}
{% if invoice_id %}Invoice Number: {{ invoice_id }}{% endif %}
{% if payment_method %}Payment Method: {{ payment_method }}{% endif %}

{% if receipt_url %}
View your receipt: {{ receipt_url }}
{% endif %}

Thank you for your payment. Your account has been updated.

---
This is a transactional email for your RawDrive account.
Questions? Contact support at {{ support_url | default('https://rawdrive.io/support') }}
"""

PAYMENT_SUCCESS_SMS = """RawDrive: Payment of {{ currency_symbol }}{{ amount }} received. Thank you!"""

PAYMENT_SUCCESS_PUSH_TITLE = "Payment Received"
PAYMENT_SUCCESS_PUSH_BODY = "Your payment of {{ currency_symbol }}{{ amount }} was successful"

PAYMENT_SUCCESS_IN_APP_TITLE = "Payment Successful"
PAYMENT_SUCCESS_IN_APP_BODY = "Payment of {{ currency_symbol }}{{ amount }} received on {{ payment_date }}"


# =============================================================================
# PAYMENT FAILED TEMPLATE
# =============================================================================

PAYMENT_FAILED_EMAIL_SUBJECT = "Action required: Payment failed - {{ amount }} {{ currency }}"

PAYMENT_FAILED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="error-badge">Payment Failed</span>
      </div>

      <div class="amount-display">
        <div class="amount-label">Amount Due</div>
        <div class="amount-value">{{{{ currency_symbol }}}}{{{{ amount }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Failure Reason</div>
        <div class="info-value" style="color: #DC2626;">{{{{ failure_reason }}}}</div>
      </div>

      {{% if invoice_id %}}
      <div class="info-row">
        <div class="info-label">Invoice Number</div>
        <div class="info-value">{{{{ invoice_id }}}}</div>
      </div>
      {{% endif %}}

      {{% if retry_date %}}
      <div class="info-row">
        <div class="info-label">Next Retry</div>
        <div class="info-value">{{{{ retry_date }}}}</div>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin: 24px 0; color: #475569;">
        We were unable to process your payment. Please update your payment method to avoid service interruption.
      </p>

      <div style="text-align: center;">
        <a href="{{{{ update_payment_url | default(billing_url) }}}}" class="urgent-button">Update Payment Method</a>
      </div>
    </div>

    <div class="footer">
      <p>This is a transactional email for your RawDrive account.</p>
      <p style="margin-top: 8px;">
        Need help? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

PAYMENT_FAILED_EMAIL_TEXT = """
PAYMENT FAILED - Action Required

Amount Due: {{ currency_symbol }}{{ amount }} {{ currency }}
Failure Reason: {{ failure_reason }}
{% if invoice_id %}Invoice Number: {{ invoice_id }}{% endif %}
{% if retry_date %}Next Retry: {{ retry_date }}{% endif %}

We were unable to process your payment. Please update your payment method to avoid service interruption.

Update your payment method: {{ update_payment_url | default(billing_url) }}

---
This is a transactional email for your RawDrive account.
Need help? Contact support at {{ support_url | default('https://rawdrive.io/support') }}
"""

PAYMENT_FAILED_SMS = """RawDrive: Payment of {{ currency_symbol }}{{ amount }} failed. Please update your payment method to avoid service interruption."""

PAYMENT_FAILED_PUSH_TITLE = "Payment Failed"
PAYMENT_FAILED_PUSH_BODY = "Your payment of {{ currency_symbol }}{{ amount }} could not be processed"

PAYMENT_FAILED_IN_APP_TITLE = "Payment Failed"
PAYMENT_FAILED_IN_APP_BODY = "Payment of {{ currency_symbol }}{{ amount }} failed. Please update your payment method."


# =============================================================================
# PAYMENT REFUNDED TEMPLATE
# =============================================================================

PAYMENT_REFUNDED_EMAIL_SUBJECT = "Refund processed - {{ amount }} {{ currency }}"

PAYMENT_REFUNDED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Processed</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">Refund Processed</span>
      </div>

      <div class="amount-display">
        <div class="amount-label">Refund Amount</div>
        <div class="amount-value">{{{{ currency_symbol }}}}{{{{ amount }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Reason</div>
        <div class="info-value">{{{{ refund_reason }}}}</div>
      </div>

      {{% if original_payment_date %}}
      <div class="info-row">
        <div class="info-label">Original Payment Date</div>
        <div class="info-value">{{{{ original_payment_date }}}}</div>
      </div>
      {{% endif %}}

      {{% if refund_id %}}
      <div class="info-row">
        <div class="info-label">Refund ID</div>
        <div class="info-value">{{{{ refund_id }}}}</div>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        This refund will be credited to your original payment method within 5-10 business days.
      </p>
    </div>

    <div class="footer">
      <p>This is a transactional email for your RawDrive account.</p>
      <p style="margin-top: 8px;">
        Questions? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

PAYMENT_REFUNDED_EMAIL_TEXT = """
Refund Processed

Refund Amount: {{ currency_symbol }}{{ amount }} {{ currency }}
Reason: {{ refund_reason }}
{% if original_payment_date %}Original Payment Date: {{ original_payment_date }}{% endif %}
{% if refund_id %}Refund ID: {{ refund_id }}{% endif %}

This refund will be credited to your original payment method within 5-10 business days.

---
This is a transactional email for your RawDrive account.
Questions? Contact support at {{ support_url | default('https://rawdrive.io/support') }}
"""

PAYMENT_REFUNDED_PUSH_TITLE = "Refund Processed"
PAYMENT_REFUNDED_PUSH_BODY = "A refund of {{ currency_symbol }}{{ amount }} has been processed"

PAYMENT_REFUNDED_IN_APP_TITLE = "Refund Processed"
PAYMENT_REFUNDED_IN_APP_BODY = "Refund of {{ currency_symbol }}{{ amount }} has been processed"


# =============================================================================
# SUBSCRIPTION CREATED TEMPLATE
# =============================================================================

SUBSCRIPTION_CREATED_EMAIL_SUBJECT = "Welcome to {{ plan_name }}!"

SUBSCRIPTION_CREATED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Your New Plan</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Subscription Active</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Welcome to {{{{ plan_name }}}}!</h1>
      </div>

      <div class="amount-display">
        <div class="amount-label">{{{{ billing_cycle }}}} Rate</div>
        <div class="amount-value">{{{{ currency_symbol }}}}{{{{ amount }}}}</div>
      </div>

      {{% if trial_days %}}
      <div class="countdown-box">
        <div class="countdown-number">{{{{ trial_days }}}}</div>
        <div class="countdown-label">Day Free Trial</div>
      </div>
      <p style="text-align: center; color: #64748B; font-size: 14px;">
        Your trial starts today. You won't be charged until your trial ends.
      </p>
      {{% endif %}}

      {{% if next_billing_date %}}
      <div class="info-row">
        <div class="info-label">Next Billing Date</div>
        <div class="info-value">{{{{ next_billing_date }}}}</div>
      </div>
      {{% endif %}}

      {{% if features %}}
      <div class="plan-features">
        <div style="font-weight: 600; margin-bottom: 8px;">Your plan includes:</div>
        <ul>
          {{% for feature in features %}}
          <li>{{{{ feature }}}}</li>
          {{% endfor %}}
        </ul>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ getting_started_url | default(dashboard_url) }}}}" class="cta-button">Get Started</a>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for choosing RawDrive!</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ billing_url | default('https://rawdrive.io/settings/billing') }}}}" style="color: #64748B;">Manage subscription</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SUBSCRIPTION_CREATED_EMAIL_TEXT = """
Welcome to {{ plan_name }}!

Your subscription is now active.

{{ billing_cycle }} Rate: {{ currency_symbol }}{{ amount }}
{% if trial_days %}
You have a {{ trial_days }}-day free trial. You won't be charged until your trial ends.
{% endif %}
{% if next_billing_date %}Next Billing Date: {{ next_billing_date }}{% endif %}

{% if features %}
Your plan includes:
{% for feature in features %}
- {{ feature }}
{% endfor %}
{% endif %}

Get started: {{ getting_started_url | default(dashboard_url) }}

---
Thank you for choosing RawDrive!
Manage subscription: {{ billing_url | default('https://rawdrive.io/settings/billing') }}
"""

SUBSCRIPTION_CREATED_SMS = """Welcome to RawDrive {{ plan_name }}! Your subscription is now active. {% if trial_days %}Enjoy your {{ trial_days }}-day free trial!{% endif %}"""

SUBSCRIPTION_CREATED_PUSH_TITLE = "Subscription Active"
SUBSCRIPTION_CREATED_PUSH_BODY = "Welcome to {{ plan_name }}! Your subscription is now active."

SUBSCRIPTION_CREATED_IN_APP_TITLE = "Welcome to {{ plan_name }}"
SUBSCRIPTION_CREATED_IN_APP_BODY = "Your subscription is now active. Enjoy all the features!"


# =============================================================================
# SUBSCRIPTION UPGRADED TEMPLATE
# =============================================================================

SUBSCRIPTION_UPGRADED_EMAIL_SUBJECT = "Your plan has been upgraded to {{ new_plan }}"

SUBSCRIPTION_UPGRADED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plan Upgraded</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Plan Upgraded</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Welcome to {{{{ new_plan }}}}!</h1>
      </div>

      <div style="display: flex; justify-content: center; align-items: center; gap: 16px; margin: 24px 0;">
        <div style="text-align: center; padding: 16px; background: #F1F5F9; border-radius: 8px;">
          <div style="font-size: 12px; color: #64748B;">Previous Plan</div>
          <div style="font-size: 16px; font-weight: 600;">{{{{ old_plan }}}}</div>
        </div>
        <div style="font-size: 24px; color: #22C55E;">&#8594;</div>
        <div style="text-align: center; padding: 16px; background: #DCFCE7; border-radius: 8px;">
          <div style="font-size: 12px; color: #166534;">New Plan</div>
          <div style="font-size: 16px; font-weight: 600; color: #166534;">{{{{ new_plan }}}}</div>
        </div>
      </div>

      <div class="info-row">
        <div class="info-label">Effective Date</div>
        <div class="info-value">{{{{ effective_date }}}}</div>
      </div>

      {{% if price_difference %}}
      <div class="info-row">
        <div class="info-label">Price Adjustment</div>
        <div class="info-value">{{{{ price_difference }}}}</div>
      </div>
      {{% endif %}}

      {{% if new_features %}}
      <div class="plan-features">
        <div style="font-weight: 600; margin-bottom: 8px; color: #166534;">New features unlocked:</div>
        <ul>
          {{% for feature in new_features %}}
          <li>{{{{ feature }}}}</li>
          {{% endfor %}}
        </ul>
      </div>
      {{% endif %}}

      <div style="text-align: center;">
        <a href="{{{{ dashboard_url }}}}" class="cta-button">Explore New Features</a>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for upgrading!</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ billing_url | default('https://rawdrive.io/settings/billing') }}}}" style="color: #64748B;">Manage subscription</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SUBSCRIPTION_UPGRADED_EMAIL_TEXT = """
Plan Upgraded!

You've upgraded from {{ old_plan }} to {{ new_plan }}.

Effective Date: {{ effective_date }}
{% if price_difference %}Price Adjustment: {{ price_difference }}{% endif %}

{% if new_features %}
New features unlocked:
{% for feature in new_features %}
- {{ feature }}
{% endfor %}
{% endif %}

Explore your new features: {{ dashboard_url }}

---
Thank you for upgrading!
Manage subscription: {{ billing_url | default('https://rawdrive.io/settings/billing') }}
"""

SUBSCRIPTION_UPGRADED_PUSH_TITLE = "Plan Upgraded"
SUBSCRIPTION_UPGRADED_PUSH_BODY = "You've upgraded to {{ new_plan }}. Enjoy your new features!"

SUBSCRIPTION_UPGRADED_IN_APP_TITLE = "Plan Upgraded"
SUBSCRIPTION_UPGRADED_IN_APP_BODY = "You've upgraded from {{ old_plan }} to {{ new_plan }}"


# =============================================================================
# SUBSCRIPTION DOWNGRADED TEMPLATE
# =============================================================================

SUBSCRIPTION_DOWNGRADED_EMAIL_SUBJECT = "Your plan has been changed to {{ new_plan }}"

SUBSCRIPTION_DOWNGRADED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plan Changed</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">Plan Changed</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Your Plan Has Changed</h1>
      </div>

      <div style="display: flex; justify-content: center; align-items: center; gap: 16px; margin: 24px 0;">
        <div style="text-align: center; padding: 16px; background: #F1F5F9; border-radius: 8px;">
          <div style="font-size: 12px; color: #64748B;">Previous Plan</div>
          <div style="font-size: 16px; font-weight: 600;">{{{{ old_plan }}}}</div>
        </div>
        <div style="font-size: 24px; color: #64748B;">&#8594;</div>
        <div style="text-align: center; padding: 16px; background: #F1F5F9; border-radius: 8px;">
          <div style="font-size: 12px; color: #64748B;">New Plan</div>
          <div style="font-size: 16px; font-weight: 600;">{{{{ new_plan }}}}</div>
        </div>
      </div>

      <div class="info-row">
        <div class="info-label">Effective Date</div>
        <div class="info-value">{{{{ effective_date }}}}</div>
      </div>

      {{% if features_losing %}}
      <div class="plan-features" style="background: #FEF3C7;">
        <div style="font-weight: 600; margin-bottom: 8px; color: #92400E;">Features no longer available:</div>
        <ul style="color: #92400E;">
          {{% for feature in features_losing %}}
          <li>{{{{ feature }}}}</li>
          {{% endfor %}}
        </ul>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin: 24px 0; color: #64748B; font-size: 14px;">
        Your new plan is effective from {{{{ effective_date }}}}. If you change your mind, you can upgrade anytime.
      </p>

      <div style="text-align: center;">
        <a href="{{{{ billing_url | default('https://rawdrive.io/settings/billing') }}}}" class="secondary-button">View Billing</a>
      </div>
    </div>

    <div class="footer">
      <p>We hope to see you back on a higher plan soon!</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #64748B;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SUBSCRIPTION_DOWNGRADED_EMAIL_TEXT = """
Plan Changed

Your plan has been changed from {{ old_plan }} to {{ new_plan }}.

Effective Date: {{ effective_date }}

{% if features_losing %}
Features no longer available:
{% for feature in features_losing %}
- {{ feature }}
{% endfor %}
{% endif %}

Your new plan is effective from {{ effective_date }}. If you change your mind, you can upgrade anytime.

View billing: {{ billing_url | default('https://rawdrive.io/settings/billing') }}

---
We hope to see you back on a higher plan soon!
Contact support: {{ support_url | default('https://rawdrive.io/support') }}
"""

SUBSCRIPTION_DOWNGRADED_PUSH_TITLE = "Plan Changed"
SUBSCRIPTION_DOWNGRADED_PUSH_BODY = "Your plan has been changed to {{ new_plan }}"

SUBSCRIPTION_DOWNGRADED_IN_APP_TITLE = "Plan Changed"
SUBSCRIPTION_DOWNGRADED_IN_APP_BODY = "Your plan has been changed from {{ old_plan }} to {{ new_plan }}"


# =============================================================================
# SUBSCRIPTION CANCELLED TEMPLATE
# =============================================================================

SUBSCRIPTION_CANCELLED_EMAIL_SUBJECT = "Your {{ plan_name }} subscription has been cancelled"

SUBSCRIPTION_CANCELLED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Cancelled</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Subscription Cancelled</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">We're Sorry to See You Go</h1>
      </div>

      <div class="info-row">
        <div class="info-label">Plan</div>
        <div class="info-value">{{{{ plan_name }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Cancellation Date</div>
        <div class="info-value">{{{{ cancellation_date }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Access Until</div>
        <div class="info-value">{{{{ access_until }}}}</div>
      </div>

      {{% if cancellation_reason %}}
      <div class="info-row">
        <div class="info-label">Reason</div>
        <div class="info-value">{{{{ cancellation_reason }}}}</div>
      </div>
      {{% endif %}}

      <div style="background: #DBEAFE; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0; color: #1E40AF;">
          <strong>Good news:</strong> You can continue using RawDrive until {{{{ access_until }}}}.
          All your data will remain available during this period.
        </p>
      </div>

      {{% if reactivate_url %}}
      <p style="text-align: center; margin: 24px 0; color: #475569;">
        Changed your mind? You can reactivate your subscription anytime before {{{{ access_until }}}}.
      </p>

      <div style="text-align: center;">
        <a href="{{{{ reactivate_url }}}}" class="cta-button">Reactivate Subscription</a>
      </div>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>Thank you for being a RawDrive customer.</p>
      <p style="margin-top: 8px;">
        Feedback? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Let us know how we can improve</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SUBSCRIPTION_CANCELLED_EMAIL_TEXT = """
Subscription Cancelled

We're sorry to see you go.

Plan: {{ plan_name }}
Cancellation Date: {{ cancellation_date }}
Access Until: {{ access_until }}
{% if cancellation_reason %}Reason: {{ cancellation_reason }}{% endif %}

Good news: You can continue using RawDrive until {{ access_until }}. All your data will remain available during this period.

{% if reactivate_url %}
Changed your mind? You can reactivate your subscription anytime before {{ access_until }}.
Reactivate: {{ reactivate_url }}
{% endif %}

---
Thank you for being a RawDrive customer.
Feedback? Let us know how we can improve: {{ support_url | default('https://rawdrive.io/support') }}
"""

SUBSCRIPTION_CANCELLED_PUSH_TITLE = "Subscription Cancelled"
SUBSCRIPTION_CANCELLED_PUSH_BODY = "Your {{ plan_name }} subscription has been cancelled. Access until {{ access_until }}."

SUBSCRIPTION_CANCELLED_IN_APP_TITLE = "Subscription Cancelled"
SUBSCRIPTION_CANCELLED_IN_APP_BODY = "Your {{ plan_name }} has been cancelled. Access continues until {{ access_until }}."


# =============================================================================
# SUBSCRIPTION RENEWED TEMPLATE
# =============================================================================

SUBSCRIPTION_RENEWED_EMAIL_SUBJECT = "Your {{ plan_name }} subscription has been renewed"

SUBSCRIPTION_RENEWED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Renewed</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Renewed</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Subscription Renewed</h1>
      </div>

      <div class="amount-display">
        <div class="amount-label">Amount Charged</div>
        <div class="amount-value">{{{{ currency_symbol }}}}{{{{ amount }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Plan</div>
        <div class="info-value">{{{{ plan_name }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Next Billing Date</div>
        <div class="info-value">{{{{ next_billing_date }}}}</div>
      </div>

      {{% if receipt_url %}}
      <div style="text-align: center;">
        <a href="{{{{ receipt_url }}}}" class="cta-button">View Receipt</a>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        Thank you for continuing with RawDrive!
      </p>
    </div>

    <div class="footer">
      <p>This is an automatic renewal confirmation.</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ billing_url | default('https://rawdrive.io/settings/billing') }}}}" style="color: #64748B;">Manage subscription</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SUBSCRIPTION_RENEWED_EMAIL_TEXT = """
Subscription Renewed

Your {{ plan_name }} subscription has been automatically renewed.

Amount Charged: {{ currency_symbol }}{{ amount }}
Next Billing Date: {{ next_billing_date }}

{% if receipt_url %}
View your receipt: {{ receipt_url }}
{% endif %}

Thank you for continuing with RawDrive!

---
This is an automatic renewal confirmation.
Manage subscription: {{ billing_url | default('https://rawdrive.io/settings/billing') }}
"""

SUBSCRIPTION_RENEWED_PUSH_TITLE = "Subscription Renewed"
SUBSCRIPTION_RENEWED_PUSH_BODY = "Your {{ plan_name }} has been renewed for {{ currency_symbol }}{{ amount }}"

SUBSCRIPTION_RENEWED_IN_APP_TITLE = "Subscription Renewed"
SUBSCRIPTION_RENEWED_IN_APP_BODY = "Your {{ plan_name }} subscription has been renewed"


# =============================================================================
# SUBSCRIPTION EXPIRING TEMPLATE
# =============================================================================

SUBSCRIPTION_EXPIRING_EMAIL_SUBJECT = "Your {{ plan_name }} subscription expires in {{ days_remaining }} days"

SUBSCRIPTION_EXPIRING_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Expiring Soon</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Expiring Soon</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Your Subscription is Expiring</h1>
      </div>

      <div class="countdown-box">
        <div class="countdown-number">{{{{ days_remaining }}}}</div>
        <div class="countdown-label">Days Remaining</div>
      </div>

      <div class="info-row">
        <div class="info-label">Plan</div>
        <div class="info-value">{{{{ plan_name }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Expiry Date</div>
        <div class="info-value">{{{{ expiry_date }}}}</div>
      </div>

      <p style="text-align: center; margin: 24px 0; color: #475569;">
        Your subscription will expire on {{{{ expiry_date }}}}. Renew now to keep your access to all RawDrive features.
      </p>

      <div style="text-align: center;">
        <a href="{{{{ renewal_url | default(billing_url) }}}}" class="cta-button">Renew Now</a>
        {{% if upgrade_url %}}
        <br>
        <a href="{{{{ upgrade_url }}}}" class="secondary-button">Upgrade Plan</a>
        {{% endif %}}
      </div>
    </div>

    <div class="footer">
      <p>Don't lose access to your galleries and client data.</p>
      <p style="margin-top: 8px;">
        Questions? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

SUBSCRIPTION_EXPIRING_EMAIL_TEXT = """
Your Subscription is Expiring

Your {{ plan_name }} subscription will expire in {{ days_remaining }} days.

Expiry Date: {{ expiry_date }}

Your subscription will expire on {{ expiry_date }}. Renew now to keep your access to all RawDrive features.

Renew now: {{ renewal_url | default(billing_url) }}
{% if upgrade_url %}Upgrade plan: {{ upgrade_url }}{% endif %}

---
Don't lose access to your galleries and client data.
Questions? Contact support: {{ support_url | default('https://rawdrive.io/support') }}
"""

SUBSCRIPTION_EXPIRING_SMS = """RawDrive: Your {{ plan_name }} expires in {{ days_remaining }} days. Renew now to keep access: {{ renewal_url | default(billing_url) }}"""

SUBSCRIPTION_EXPIRING_PUSH_TITLE = "Subscription Expiring"
SUBSCRIPTION_EXPIRING_PUSH_BODY = "Your {{ plan_name }} expires in {{ days_remaining }} days"

SUBSCRIPTION_EXPIRING_IN_APP_TITLE = "Subscription Expiring"
SUBSCRIPTION_EXPIRING_IN_APP_BODY = "Your {{ plan_name }} subscription expires on {{ expiry_date }}"


# =============================================================================
# INVOICE CREATED TEMPLATE
# =============================================================================

INVOICE_CREATED_EMAIL_SUBJECT = "Invoice {{ invoice_id }} - {{ amount }} {{ currency }}"

INVOICE_CREATED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Invoice</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="info-badge">New Invoice</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Invoice {{{{ invoice_id }}}}</h1>
      </div>

      <div class="amount-display">
        <div class="amount-label">Amount Due</div>
        <div class="amount-value">{{{{ currency_symbol }}}}{{{{ amount }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Due Date</div>
        <div class="info-value">{{{{ due_date }}}}</div>
      </div>

      {{% if items %}}
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          {{% for item in items %}}
          <tr>
            <td>{{{{ item.description }}}}</td>
            <td style="text-align: right;">{{{{ currency_symbol }}}}{{{{ item.amount }}}}</td>
          </tr>
          {{% endfor %}}
          <tr class="total-row">
            <td>Total</td>
            <td style="text-align: right;">{{{{ currency_symbol }}}}{{{{ amount }}}}</td>
          </tr>
        </tbody>
      </table>
      {{% endif %}}

      {{% if invoice_url %}}
      <div style="text-align: center;">
        <a href="{{{{ invoice_url }}}}" class="cta-button">View Invoice</a>
      </div>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>Payment is due by {{{{ due_date }}}}.</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ billing_url | default('https://rawdrive.io/settings/billing') }}}}" style="color: #64748B;">Manage billing</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

INVOICE_CREATED_EMAIL_TEXT = """
New Invoice - {{ invoice_id }}

Amount Due: {{ currency_symbol }}{{ amount }} {{ currency }}
Due Date: {{ due_date }}

{% if items %}
Line Items:
{% for item in items %}
- {{ item.description }}: {{ currency_symbol }}{{ item.amount }}
{% endfor %}
Total: {{ currency_symbol }}{{ amount }}
{% endif %}

{% if invoice_url %}View invoice: {{ invoice_url }}{% endif %}

---
Payment is due by {{ due_date }}.
Manage billing: {{ billing_url | default('https://rawdrive.io/settings/billing') }}
"""

INVOICE_CREATED_PUSH_TITLE = "New Invoice"
INVOICE_CREATED_PUSH_BODY = "Invoice {{ invoice_id }} for {{ currency_symbol }}{{ amount }} is due {{ due_date }}"

INVOICE_CREATED_IN_APP_TITLE = "New Invoice"
INVOICE_CREATED_IN_APP_BODY = "Invoice {{ invoice_id }} for {{ currency_symbol }}{{ amount }} due {{ due_date }}"


# =============================================================================
# INVOICE PAID TEMPLATE
# =============================================================================

INVOICE_PAID_EMAIL_SUBJECT = "Invoice {{ invoice_id }} paid - Thank you!"

INVOICE_PAID_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Paid</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="success-badge">Paid</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Invoice {{{{ invoice_id }}}}</h1>
      </div>

      <div class="amount-display">
        <div class="amount-label">Amount Paid</div>
        <div class="amount-value">{{{{ currency_symbol }}}}{{{{ amount }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Payment Date</div>
        <div class="info-value">{{{{ payment_date }}}}</div>
      </div>

      {{% if receipt_url %}}
      <div style="text-align: center;">
        <a href="{{{{ receipt_url }}}}" class="cta-button">View Receipt</a>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin-top: 24px; color: #64748B; font-size: 14px;">
        Thank you for your payment!
      </p>
    </div>

    <div class="footer">
      <p>This invoice has been marked as paid.</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ billing_url | default('https://rawdrive.io/settings/billing') }}}}" style="color: #64748B;">View billing history</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

INVOICE_PAID_EMAIL_TEXT = """
Invoice Paid - {{ invoice_id }}

Amount Paid: {{ currency_symbol }}{{ amount }} {{ currency }}
Payment Date: {{ payment_date }}

{% if receipt_url %}View receipt: {{ receipt_url }}{% endif %}

Thank you for your payment!

---
This invoice has been marked as paid.
View billing history: {{ billing_url | default('https://rawdrive.io/settings/billing') }}
"""

INVOICE_PAID_PUSH_TITLE = "Invoice Paid"
INVOICE_PAID_PUSH_BODY = "Invoice {{ invoice_id }} for {{ currency_symbol }}{{ amount }} has been paid"

INVOICE_PAID_IN_APP_TITLE = "Invoice Paid"
INVOICE_PAID_IN_APP_BODY = "Invoice {{ invoice_id }} has been paid"


# =============================================================================
# INVOICE OVERDUE TEMPLATE
# =============================================================================

INVOICE_OVERDUE_EMAIL_SUBJECT = "OVERDUE: Invoice {{ invoice_id }} - {{ amount }} {{ currency }}"

INVOICE_OVERDUE_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Overdue</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="error-badge">Overdue</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Invoice {{{{ invoice_id }}}}</h1>
      </div>

      <div class="amount-display">
        <div class="amount-label">Amount Due</div>
        <div class="amount-value" style="color: #DC2626;">{{{{ currency_symbol }}}}{{{{ amount }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Original Due Date</div>
        <div class="info-value" style="color: #DC2626;">{{{{ due_date }}}}</div>
      </div>

      <div class="info-row">
        <div class="info-label">Days Overdue</div>
        <div class="info-value" style="color: #DC2626;">{{{{ days_overdue }}}} days</div>
      </div>

      {{% if late_fee %}}
      <div class="info-row">
        <div class="info-label">Late Fee</div>
        <div class="info-value">{{{{ currency_symbol }}}}{{{{ late_fee }}}}</div>
      </div>
      {{% endif %}}

      <div style="background: #FEE2E2; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0; color: #991B1B;">
          <strong>Action Required:</strong> Please pay this invoice immediately to avoid service interruption.
        </p>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ payment_url | default(billing_url) }}}}" class="urgent-button">Pay Now</a>
      </div>
    </div>

    <div class="footer">
      <p>Please pay immediately to maintain access to your account.</p>
      <p style="margin-top: 8px;">
        Need help? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

INVOICE_OVERDUE_EMAIL_TEXT = """
INVOICE OVERDUE - {{ invoice_id }}

Amount Due: {{ currency_symbol }}{{ amount }} {{ currency }}
Original Due Date: {{ due_date }}
Days Overdue: {{ days_overdue }} days
{% if late_fee %}Late Fee: {{ currency_symbol }}{{ late_fee }}{% endif %}

ACTION REQUIRED: Please pay this invoice immediately to avoid service interruption.

Pay now: {{ payment_url | default(billing_url) }}

---
Please pay immediately to maintain access to your account.
Need help? Contact support: {{ support_url | default('https://rawdrive.io/support') }}
"""

INVOICE_OVERDUE_SMS = """RawDrive: Invoice {{ invoice_id }} is overdue by {{ days_overdue }} days. Pay now to avoid service interruption: {{ payment_url | default(billing_url) }}"""

INVOICE_OVERDUE_PUSH_TITLE = "Invoice Overdue"
INVOICE_OVERDUE_PUSH_BODY = "Invoice {{ invoice_id }} is {{ days_overdue }} days overdue. Pay now."

INVOICE_OVERDUE_IN_APP_TITLE = "Invoice Overdue"
INVOICE_OVERDUE_IN_APP_BODY = "Invoice {{ invoice_id }} for {{ currency_symbol }}{{ amount }} is {{ days_overdue }} days overdue"


# =============================================================================
# TRIAL ENDING TEMPLATE
# =============================================================================

TRIAL_ENDING_EMAIL_SUBJECT = "Your free trial ends in {{ days_remaining }} days"

TRIAL_ENDING_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trial Ending Soon</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Trial Ending</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Your Free Trial is Ending</h1>
      </div>

      <div class="countdown-box">
        <div class="countdown-number">{{{{ days_remaining }}}}</div>
        <div class="countdown-label">Days Left</div>
      </div>

      <div class="info-row">
        <div class="info-label">Trial Ends</div>
        <div class="info-value">{{{{ trial_end_date }}}}</div>
      </div>

      {{% if plan_name %}}
      <div class="info-row">
        <div class="info-label">Continue With</div>
        <div class="info-value">{{{{ plan_name }}}}</div>
      </div>
      {{% endif %}}

      {{% if features_used %}}
      <div class="plan-features">
        <div style="font-weight: 600; margin-bottom: 8px;">Features you've been using:</div>
        <ul>
          {{% for feature in features_used %}}
          <li>{{{{ feature }}}}</li>
          {{% endfor %}}
        </ul>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin: 24px 0; color: #475569;">
        Subscribe now to keep access to all your galleries and client data.
      </p>

      <div style="text-align: center;">
        <a href="{{{{ upgrade_url | default(billing_url) }}}}" class="cta-button">Subscribe Now</a>
      </div>
    </div>

    <div class="footer">
      <p>Don't lose your work - subscribe before your trial ends!</p>
      <p style="margin-top: 8px;">
        Questions? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

TRIAL_ENDING_EMAIL_TEXT = """
Your Free Trial is Ending

Your free trial ends in {{ days_remaining }} days.

Trial Ends: {{ trial_end_date }}
{% if plan_name %}Continue With: {{ plan_name }}{% endif %}

{% if features_used %}
Features you've been using:
{% for feature in features_used %}
- {{ feature }}
{% endfor %}
{% endif %}

Subscribe now to keep access to all your galleries and client data.

Subscribe now: {{ upgrade_url | default(billing_url) }}

---
Don't lose your work - subscribe before your trial ends!
Questions? Contact support: {{ support_url | default('https://rawdrive.io/support') }}
"""

TRIAL_ENDING_SMS = """RawDrive: Your free trial ends in {{ days_remaining }} days. Subscribe now to keep access: {{ upgrade_url | default(billing_url) }}"""

TRIAL_ENDING_PUSH_TITLE = "Trial Ending"
TRIAL_ENDING_PUSH_BODY = "Your free trial ends in {{ days_remaining }} days. Subscribe to continue."

TRIAL_ENDING_IN_APP_TITLE = "Trial Ending"
TRIAL_ENDING_IN_APP_BODY = "Your free trial ends on {{ trial_end_date }}. Subscribe to keep access."


# =============================================================================
# TRIAL EXPIRED TEMPLATE
# =============================================================================

TRIAL_EXPIRED_EMAIL_SUBJECT = "Your free trial has ended"

TRIAL_EXPIRED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trial Expired</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="error-badge">Trial Expired</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Your Free Trial Has Ended</h1>
      </div>

      <div class="info-row">
        <div class="info-label">Trial Ended</div>
        <div class="info-value">{{{{ trial_end_date }}}}</div>
      </div>

      {{% if data_retention_days %}}
      <div style="background: #DBEAFE; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0; color: #1E40AF;">
          <strong>Good news:</strong> Your data will be kept for {{{{ data_retention_days }}}} days.
          Subscribe anytime to regain full access.
        </p>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin: 24px 0; color: #475569;">
        Your trial has ended, but it's not too late! Subscribe now to continue where you left off.
      </p>

      <div style="text-align: center;">
        <a href="{{{{ upgrade_url | default(billing_url) }}}}" class="cta-button">Subscribe Now</a>
      </div>
    </div>

    <div class="footer">
      <p>We hope you enjoyed your trial!</p>
      <p style="margin-top: 8px;">
        Questions? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

TRIAL_EXPIRED_EMAIL_TEXT = """
Your Free Trial Has Ended

Your free trial ended on {{ trial_end_date }}.

{% if data_retention_days %}
Good news: Your data will be kept for {{ data_retention_days }} days. Subscribe anytime to regain full access.
{% endif %}

Your trial has ended, but it's not too late! Subscribe now to continue where you left off.

Subscribe now: {{ upgrade_url | default(billing_url) }}

---
We hope you enjoyed your trial!
Questions? Contact support: {{ support_url | default('https://rawdrive.io/support') }}
"""

TRIAL_EXPIRED_PUSH_TITLE = "Trial Expired"
TRIAL_EXPIRED_PUSH_BODY = "Your free trial has ended. Subscribe to continue using RawDrive."

TRIAL_EXPIRED_IN_APP_TITLE = "Trial Expired"
TRIAL_EXPIRED_IN_APP_BODY = "Your free trial has ended. Subscribe to regain access."


# =============================================================================
# USAGE WARNING TEMPLATE
# =============================================================================

USAGE_WARNING_EMAIL_SUBJECT = "{{ resource_type }} usage at {{ percentage }}%"

USAGE_WARNING_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Usage Warning</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="warning-badge">Usage Warning</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">Approaching {{{{ resource_type }}}} Limit</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <div style="font-size: 48px; font-weight: 700; color: #D97706;">{{{{ percentage }}}}%</div>
        <div style="font-size: 14px; color: #92400E;">Usage</div>
      </div>

      <div style="margin: 24px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
          <span style="color: #64748B;">Used</span>
          <span style="font-weight: 600;">{{{{ current_usage }}}} / {{{{ limit }}}}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-bar-fill warning" style="width: {{{{ percentage }}}}%;"></div>
        </div>
      </div>

      {{% if usage_reset_date %}}
      <div class="info-row">
        <div class="info-label">Usage Resets</div>
        <div class="info-value">{{{{ usage_reset_date }}}}</div>
      </div>
      {{% endif %}}

      <p style="text-align: center; margin: 24px 0; color: #475569;">
        You're approaching your {{{{ resource_type | lower }}}} limit. Consider upgrading your plan for more capacity.
      </p>

      {{% if upgrade_url %}}
      <div style="text-align: center;">
        <a href="{{{{ upgrade_url }}}}" class="cta-button">Upgrade Plan</a>
      </div>
      {{% endif %}}
    </div>

    <div class="footer">
      <p>Manage your usage in the dashboard.</p>
      <p style="margin-top: 8px;">
        <a href="{{{{ billing_url | default('https://rawdrive.io/settings/billing') }}}}" style="color: #64748B;">View billing</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

USAGE_WARNING_EMAIL_TEXT = """
Usage Warning - {{ resource_type }}

You've used {{ percentage }}% of your {{ resource_type | lower }} limit.

Used: {{ current_usage }} / {{ limit }}
{% if usage_reset_date %}Usage Resets: {{ usage_reset_date }}{% endif %}

You're approaching your {{ resource_type | lower }} limit. Consider upgrading your plan for more capacity.

{% if upgrade_url %}Upgrade plan: {{ upgrade_url }}{% endif %}

---
Manage your usage in the dashboard.
View billing: {{ billing_url | default('https://rawdrive.io/settings/billing') }}
"""

USAGE_WARNING_PUSH_TITLE = "Usage Warning"
USAGE_WARNING_PUSH_BODY = "{{ resource_type }} at {{ percentage }}% - consider upgrading"

USAGE_WARNING_IN_APP_TITLE = "{{ resource_type }} Usage Warning"
USAGE_WARNING_IN_APP_BODY = "You've used {{ percentage }}% of your {{ resource_type | lower }} limit"


# =============================================================================
# USAGE LIMIT REACHED TEMPLATE
# =============================================================================

USAGE_LIMIT_REACHED_EMAIL_SUBJECT = "{{ resource_type }} limit reached"

USAGE_LIMIT_REACHED_EMAIL_HTML = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Usage Limit Reached</title>
  {BILLING_EMAIL_STYLES}
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">RawDrive</div>
        <span class="error-badge">Limit Reached</span>
        <h1 style="margin: 16px 0 8px; font-size: 24px;">{{{{ resource_type }}}} Limit Reached</h1>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <div style="font-size: 48px; font-weight: 700; color: #DC2626;">100%</div>
        <div style="font-size: 14px; color: #991B1B;">Limit Reached</div>
      </div>

      <div style="margin: 24px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
          <span style="color: #64748B;">Limit</span>
          <span style="font-weight: 600;">{{{{ limit }}}}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-bar-fill critical" style="width: 100%;"></div>
        </div>
      </div>

      {{% if usage_reset_date %}}
      <div class="info-row">
        <div class="info-label">Usage Resets</div>
        <div class="info-value">{{{{ usage_reset_date }}}}</div>
      </div>
      {{% endif %}}

      {{% if overage_rate %}}
      <div class="info-row">
        <div class="info-label">Overage Rate</div>
        <div class="info-value">{{{{ overage_rate }}}}</div>
      </div>
      {{% endif %}}

      <div style="background: #FEE2E2; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0; color: #991B1B;">
          <strong>Limit Reached:</strong> You've reached your {{{{ resource_type | lower }}}} limit.
          Upgrade now to continue without interruption.
        </p>
      </div>

      <div style="text-align: center;">
        <a href="{{{{ upgrade_url | default(billing_url) }}}}" class="urgent-button">Upgrade Now</a>
      </div>
    </div>

    <div class="footer">
      <p>Upgrade to get more capacity immediately.</p>
      <p style="margin-top: 8px;">
        Questions? <a href="{{{{ support_url | default('https://rawdrive.io/support') }}}}" style="color: #2563EB;">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

USAGE_LIMIT_REACHED_EMAIL_TEXT = """
{{ resource_type }} Limit Reached

You've reached your {{ resource_type | lower }} limit.

Limit: {{ limit }}
{% if usage_reset_date %}Usage Resets: {{ usage_reset_date }}{% endif %}
{% if overage_rate %}Overage Rate: {{ overage_rate }}{% endif %}

LIMIT REACHED: You've reached your {{ resource_type | lower }} limit. Upgrade now to continue without interruption.

Upgrade now: {{ upgrade_url | default(billing_url) }}

---
Upgrade to get more capacity immediately.
Questions? Contact support: {{ support_url | default('https://rawdrive.io/support') }}
"""

USAGE_LIMIT_REACHED_SMS = """RawDrive: You've reached your {{ resource_type | lower }} limit. Upgrade now: {{ upgrade_url | default(billing_url) }}"""

USAGE_LIMIT_REACHED_PUSH_TITLE = "Limit Reached"
USAGE_LIMIT_REACHED_PUSH_BODY = "{{ resource_type }} limit reached. Upgrade to continue."

USAGE_LIMIT_REACHED_IN_APP_TITLE = "{{ resource_type }} Limit Reached"
USAGE_LIMIT_REACHED_IN_APP_BODY = "You've reached your {{ resource_type | lower }} limit. Upgrade now."


# =============================================================================
# TEMPLATE DEFINITIONS
# =============================================================================

BILLING_TEMPLATES: dict[str, BillingTemplate] = {
    "billing_payment_success": BillingTemplate(
        event_type=EventType.BILLING_PAYMENT_SUCCESS,
        code="billing_payment_success",
        name="Payment Successful",
        description="Confirmation when a payment processes successfully",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=PAYMENT_SUCCESS_EMAIL_SUBJECT,
        email_html=PAYMENT_SUCCESS_EMAIL_HTML,
        email_text=PAYMENT_SUCCESS_EMAIL_TEXT,
        sms_content=PAYMENT_SUCCESS_SMS,
        push_title=PAYMENT_SUCCESS_PUSH_TITLE,
        push_body=PAYMENT_SUCCESS_PUSH_BODY,
        push_action_url="{{ receipt_url }}",
        in_app_title=PAYMENT_SUCCESS_IN_APP_TITLE,
        in_app_body=PAYMENT_SUCCESS_IN_APP_BODY,
        in_app_action_url="/settings/billing",
        in_app_icon="payment",
        required_variables=["amount", "currency", "payment_date"],
        optional_variables=[
            "invoice_id",
            "payment_method",
            "receipt_url",
            "currency_symbol",
            "support_url",
        ],
        default_values={
            "currency_symbol": "$",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "payment"],
    ),
    "billing_payment_failed": BillingTemplate(
        event_type=EventType.BILLING_PAYMENT_FAILED,
        code="billing_payment_failed",
        name="Payment Failed",
        description="Alert when a payment fails to process",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        email_subject=PAYMENT_FAILED_EMAIL_SUBJECT,
        email_html=PAYMENT_FAILED_EMAIL_HTML,
        email_text=PAYMENT_FAILED_EMAIL_TEXT,
        sms_content=PAYMENT_FAILED_SMS,
        push_title=PAYMENT_FAILED_PUSH_TITLE,
        push_body=PAYMENT_FAILED_PUSH_BODY,
        push_action_url="{{ update_payment_url }}",
        in_app_title=PAYMENT_FAILED_IN_APP_TITLE,
        in_app_body=PAYMENT_FAILED_IN_APP_BODY,
        in_app_action_url="/settings/billing/payment-methods",
        in_app_icon="payment-error",
        required_variables=["amount", "currency", "failure_reason"],
        optional_variables=[
            "invoice_id",
            "retry_date",
            "update_payment_url",
            "billing_url",
            "currency_symbol",
            "support_url",
        ],
        default_values={
            "currency_symbol": "$",
            "billing_url": "https://rawdrive.io/settings/billing",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "payment", "action-required"],
    ),
    "billing_payment_refunded": BillingTemplate(
        event_type=EventType.BILLING_PAYMENT_REFUNDED,
        code="billing_payment_refunded",
        name="Payment Refunded",
        description="Notification when a refund is processed",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=PAYMENT_REFUNDED_EMAIL_SUBJECT,
        email_html=PAYMENT_REFUNDED_EMAIL_HTML,
        email_text=PAYMENT_REFUNDED_EMAIL_TEXT,
        push_title=PAYMENT_REFUNDED_PUSH_TITLE,
        push_body=PAYMENT_REFUNDED_PUSH_BODY,
        in_app_title=PAYMENT_REFUNDED_IN_APP_TITLE,
        in_app_body=PAYMENT_REFUNDED_IN_APP_BODY,
        in_app_action_url="/settings/billing",
        in_app_icon="refund",
        required_variables=["amount", "currency", "refund_reason"],
        optional_variables=[
            "original_payment_date",
            "refund_id",
            "currency_symbol",
            "support_url",
        ],
        default_values={
            "currency_symbol": "$",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "refund"],
    ),
    "billing_subscription_created": BillingTemplate(
        event_type=EventType.BILLING_SUBSCRIPTION_CREATED,
        code="billing_subscription_created",
        name="Subscription Created",
        description="Welcome email when a new subscription starts",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=SUBSCRIPTION_CREATED_EMAIL_SUBJECT,
        email_html=SUBSCRIPTION_CREATED_EMAIL_HTML,
        email_text=SUBSCRIPTION_CREATED_EMAIL_TEXT,
        sms_content=SUBSCRIPTION_CREATED_SMS,
        push_title=SUBSCRIPTION_CREATED_PUSH_TITLE,
        push_body=SUBSCRIPTION_CREATED_PUSH_BODY,
        push_action_url="{{ getting_started_url }}",
        in_app_title=SUBSCRIPTION_CREATED_IN_APP_TITLE,
        in_app_body=SUBSCRIPTION_CREATED_IN_APP_BODY,
        in_app_action_url="/dashboard",
        in_app_icon="subscription",
        required_variables=["plan_name", "amount", "billing_cycle"],
        optional_variables=[
            "trial_days",
            "next_billing_date",
            "features",
            "getting_started_url",
            "dashboard_url",
            "billing_url",
            "currency_symbol",
        ],
        default_values={
            "currency_symbol": "$",
            "dashboard_url": "https://rawdrive.io/dashboard",
            "billing_url": "https://rawdrive.io/settings/billing",
        },
        tags=["transactional", "billing", "subscription", "onboarding"],
    ),
    "billing_subscription_upgraded": BillingTemplate(
        event_type=EventType.BILLING_SUBSCRIPTION_UPGRADED,
        code="billing_subscription_upgraded",
        name="Subscription Upgraded",
        description="Confirmation of subscription plan upgrade",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        email_subject=SUBSCRIPTION_UPGRADED_EMAIL_SUBJECT,
        email_html=SUBSCRIPTION_UPGRADED_EMAIL_HTML,
        email_text=SUBSCRIPTION_UPGRADED_EMAIL_TEXT,
        push_title=SUBSCRIPTION_UPGRADED_PUSH_TITLE,
        push_body=SUBSCRIPTION_UPGRADED_PUSH_BODY,
        push_action_url="{{ dashboard_url }}",
        in_app_title=SUBSCRIPTION_UPGRADED_IN_APP_TITLE,
        in_app_body=SUBSCRIPTION_UPGRADED_IN_APP_BODY,
        in_app_action_url="/dashboard",
        in_app_icon="upgrade",
        required_variables=["old_plan", "new_plan", "effective_date"],
        optional_variables=[
            "price_difference",
            "new_features",
            "dashboard_url",
            "billing_url",
        ],
        default_values={
            "dashboard_url": "https://rawdrive.io/dashboard",
            "billing_url": "https://rawdrive.io/settings/billing",
        },
        tags=["transactional", "billing", "subscription"],
    ),
    "billing_subscription_downgraded": BillingTemplate(
        event_type=EventType.BILLING_SUBSCRIPTION_DOWNGRADED,
        code="billing_subscription_downgraded",
        name="Subscription Downgraded",
        description="Confirmation of subscription plan downgrade",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        email_subject=SUBSCRIPTION_DOWNGRADED_EMAIL_SUBJECT,
        email_html=SUBSCRIPTION_DOWNGRADED_EMAIL_HTML,
        email_text=SUBSCRIPTION_DOWNGRADED_EMAIL_TEXT,
        push_title=SUBSCRIPTION_DOWNGRADED_PUSH_TITLE,
        push_body=SUBSCRIPTION_DOWNGRADED_PUSH_BODY,
        in_app_title=SUBSCRIPTION_DOWNGRADED_IN_APP_TITLE,
        in_app_body=SUBSCRIPTION_DOWNGRADED_IN_APP_BODY,
        in_app_action_url="/settings/billing",
        in_app_icon="downgrade",
        required_variables=["old_plan", "new_plan", "effective_date"],
        optional_variables=["features_losing", "billing_url", "support_url"],
        default_values={
            "billing_url": "https://rawdrive.io/settings/billing",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "subscription"],
    ),
    "billing_subscription_cancelled": BillingTemplate(
        event_type=EventType.BILLING_SUBSCRIPTION_CANCELLED,
        code="billing_subscription_cancelled",
        name="Subscription Cancelled",
        description="Confirmation when subscription is cancelled",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=SUBSCRIPTION_CANCELLED_EMAIL_SUBJECT,
        email_html=SUBSCRIPTION_CANCELLED_EMAIL_HTML,
        email_text=SUBSCRIPTION_CANCELLED_EMAIL_TEXT,
        push_title=SUBSCRIPTION_CANCELLED_PUSH_TITLE,
        push_body=SUBSCRIPTION_CANCELLED_PUSH_BODY,
        in_app_title=SUBSCRIPTION_CANCELLED_IN_APP_TITLE,
        in_app_body=SUBSCRIPTION_CANCELLED_IN_APP_BODY,
        in_app_action_url="/settings/billing",
        in_app_icon="cancelled",
        required_variables=["plan_name", "cancellation_date", "access_until"],
        optional_variables=["cancellation_reason", "reactivate_url", "support_url"],
        default_values={
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "subscription"],
    ),
    "billing_subscription_renewed": BillingTemplate(
        event_type=EventType.BILLING_SUBSCRIPTION_RENEWED,
        code="billing_subscription_renewed",
        name="Subscription Renewed",
        description="Notification when subscription auto-renews",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        email_subject=SUBSCRIPTION_RENEWED_EMAIL_SUBJECT,
        email_html=SUBSCRIPTION_RENEWED_EMAIL_HTML,
        email_text=SUBSCRIPTION_RENEWED_EMAIL_TEXT,
        push_title=SUBSCRIPTION_RENEWED_PUSH_TITLE,
        push_body=SUBSCRIPTION_RENEWED_PUSH_BODY,
        in_app_title=SUBSCRIPTION_RENEWED_IN_APP_TITLE,
        in_app_body=SUBSCRIPTION_RENEWED_IN_APP_BODY,
        in_app_action_url="/settings/billing",
        in_app_icon="renewal",
        required_variables=["plan_name", "amount", "next_billing_date"],
        optional_variables=["receipt_url", "billing_url", "currency_symbol"],
        default_values={
            "currency_symbol": "$",
            "billing_url": "https://rawdrive.io/settings/billing",
        },
        tags=["transactional", "billing", "subscription"],
    ),
    "billing_subscription_expiring": BillingTemplate(
        event_type=EventType.BILLING_SUBSCRIPTION_EXPIRING,
        code="billing_subscription_expiring",
        name="Subscription Expiring",
        description="Warning before subscription expires",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=SUBSCRIPTION_EXPIRING_EMAIL_SUBJECT,
        email_html=SUBSCRIPTION_EXPIRING_EMAIL_HTML,
        email_text=SUBSCRIPTION_EXPIRING_EMAIL_TEXT,
        sms_content=SUBSCRIPTION_EXPIRING_SMS,
        push_title=SUBSCRIPTION_EXPIRING_PUSH_TITLE,
        push_body=SUBSCRIPTION_EXPIRING_PUSH_BODY,
        push_action_url="{{ renewal_url }}",
        in_app_title=SUBSCRIPTION_EXPIRING_IN_APP_TITLE,
        in_app_body=SUBSCRIPTION_EXPIRING_IN_APP_BODY,
        in_app_action_url="/settings/billing",
        in_app_icon="expiring",
        required_variables=["plan_name", "expiry_date", "days_remaining"],
        optional_variables=["renewal_url", "upgrade_url", "billing_url", "support_url"],
        default_values={
            "billing_url": "https://rawdrive.io/settings/billing",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "subscription", "action-required"],
    ),
    "billing_invoice_created": BillingTemplate(
        event_type=EventType.BILLING_INVOICE_CREATED,
        code="billing_invoice_created",
        name="Invoice Created",
        description="Notification when a new invoice is generated",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        email_subject=INVOICE_CREATED_EMAIL_SUBJECT,
        email_html=INVOICE_CREATED_EMAIL_HTML,
        email_text=INVOICE_CREATED_EMAIL_TEXT,
        push_title=INVOICE_CREATED_PUSH_TITLE,
        push_body=INVOICE_CREATED_PUSH_BODY,
        push_action_url="{{ invoice_url }}",
        in_app_title=INVOICE_CREATED_IN_APP_TITLE,
        in_app_body=INVOICE_CREATED_IN_APP_BODY,
        in_app_action_url="/settings/billing/invoices",
        in_app_icon="invoice",
        required_variables=["invoice_id", "amount", "due_date"],
        optional_variables=["invoice_url", "items", "billing_url", "currency", "currency_symbol"],
        default_values={
            "currency": "USD",
            "currency_symbol": "$",
            "billing_url": "https://rawdrive.io/settings/billing",
        },
        tags=["transactional", "billing", "invoice"],
    ),
    "billing_invoice_paid": BillingTemplate(
        event_type=EventType.BILLING_INVOICE_PAID,
        code="billing_invoice_paid",
        name="Invoice Paid",
        description="Confirmation when an invoice is paid",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        email_subject=INVOICE_PAID_EMAIL_SUBJECT,
        email_html=INVOICE_PAID_EMAIL_HTML,
        email_text=INVOICE_PAID_EMAIL_TEXT,
        push_title=INVOICE_PAID_PUSH_TITLE,
        push_body=INVOICE_PAID_PUSH_BODY,
        in_app_title=INVOICE_PAID_IN_APP_TITLE,
        in_app_body=INVOICE_PAID_IN_APP_BODY,
        in_app_action_url="/settings/billing/invoices",
        in_app_icon="invoice-paid",
        required_variables=["invoice_id", "amount", "payment_date"],
        optional_variables=["receipt_url", "billing_url", "currency", "currency_symbol"],
        default_values={
            "currency": "USD",
            "currency_symbol": "$",
            "billing_url": "https://rawdrive.io/settings/billing",
        },
        tags=["transactional", "billing", "invoice"],
    ),
    "billing_invoice_overdue": BillingTemplate(
        event_type=EventType.BILLING_INVOICE_OVERDUE,
        code="billing_invoice_overdue",
        name="Invoice Overdue",
        description="Alert when an invoice is past due",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        email_subject=INVOICE_OVERDUE_EMAIL_SUBJECT,
        email_html=INVOICE_OVERDUE_EMAIL_HTML,
        email_text=INVOICE_OVERDUE_EMAIL_TEXT,
        sms_content=INVOICE_OVERDUE_SMS,
        push_title=INVOICE_OVERDUE_PUSH_TITLE,
        push_body=INVOICE_OVERDUE_PUSH_BODY,
        push_action_url="{{ payment_url }}",
        in_app_title=INVOICE_OVERDUE_IN_APP_TITLE,
        in_app_body=INVOICE_OVERDUE_IN_APP_BODY,
        in_app_action_url="/settings/billing/invoices",
        in_app_icon="invoice-overdue",
        required_variables=["invoice_id", "amount", "due_date", "days_overdue"],
        optional_variables=["payment_url", "late_fee", "billing_url", "support_url", "currency", "currency_symbol"],
        default_values={
            "currency": "USD",
            "currency_symbol": "$",
            "billing_url": "https://rawdrive.io/settings/billing",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "invoice", "action-required"],
    ),
    "billing_trial_ending": BillingTemplate(
        event_type=EventType.BILLING_TRIAL_ENDING,
        code="billing_trial_ending",
        name="Trial Ending Soon",
        description="Reminder before trial period ends",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=TRIAL_ENDING_EMAIL_SUBJECT,
        email_html=TRIAL_ENDING_EMAIL_HTML,
        email_text=TRIAL_ENDING_EMAIL_TEXT,
        sms_content=TRIAL_ENDING_SMS,
        push_title=TRIAL_ENDING_PUSH_TITLE,
        push_body=TRIAL_ENDING_PUSH_BODY,
        push_action_url="{{ upgrade_url }}",
        in_app_title=TRIAL_ENDING_IN_APP_TITLE,
        in_app_body=TRIAL_ENDING_IN_APP_BODY,
        in_app_action_url="/settings/billing",
        in_app_icon="trial",
        required_variables=["trial_end_date", "days_remaining"],
        optional_variables=["plan_name", "upgrade_url", "features_used", "billing_url", "support_url"],
        default_values={
            "billing_url": "https://rawdrive.io/settings/billing",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "trial", "action-required"],
    ),
    "billing_trial_expired": BillingTemplate(
        event_type=EventType.BILLING_TRIAL_EXPIRED,
        code="billing_trial_expired",
        name="Trial Expired",
        description="Notification when trial period ends",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=TRIAL_EXPIRED_EMAIL_SUBJECT,
        email_html=TRIAL_EXPIRED_EMAIL_HTML,
        email_text=TRIAL_EXPIRED_EMAIL_TEXT,
        push_title=TRIAL_EXPIRED_PUSH_TITLE,
        push_body=TRIAL_EXPIRED_PUSH_BODY,
        push_action_url="{{ upgrade_url }}",
        in_app_title=TRIAL_EXPIRED_IN_APP_TITLE,
        in_app_body=TRIAL_EXPIRED_IN_APP_BODY,
        in_app_action_url="/settings/billing",
        in_app_icon="trial-expired",
        required_variables=["trial_end_date"],
        optional_variables=["upgrade_url", "data_retention_days", "billing_url", "support_url"],
        default_values={
            "billing_url": "https://rawdrive.io/settings/billing",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "trial"],
    ),
    "billing_usage_warning": BillingTemplate(
        event_type=EventType.BILLING_USAGE_WARNING,
        code="billing_usage_warning",
        name="Usage Warning",
        description="Alert when approaching usage limits",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.NORMAL,
        is_transactional=False,  # Usage warnings can be disabled
        email_subject=USAGE_WARNING_EMAIL_SUBJECT,
        email_html=USAGE_WARNING_EMAIL_HTML,
        email_text=USAGE_WARNING_EMAIL_TEXT,
        push_title=USAGE_WARNING_PUSH_TITLE,
        push_body=USAGE_WARNING_PUSH_BODY,
        in_app_title=USAGE_WARNING_IN_APP_TITLE,
        in_app_body=USAGE_WARNING_IN_APP_BODY,
        in_app_action_url="/settings/billing/usage",
        in_app_icon="usage-warning",
        required_variables=["resource_type", "current_usage", "limit", "percentage"],
        optional_variables=["upgrade_url", "usage_reset_date", "billing_url"],
        default_values={
            "billing_url": "https://rawdrive.io/settings/billing",
        },
        tags=["billing", "usage"],
    ),
    "billing_usage_limit_reached": BillingTemplate(
        event_type=EventType.BILLING_USAGE_LIMIT_REACHED,
        code="billing_usage_limit_reached",
        name="Usage Limit Reached",
        description="Alert when usage limit is reached",
        category=NotificationCategory.BILLING,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        email_subject=USAGE_LIMIT_REACHED_EMAIL_SUBJECT,
        email_html=USAGE_LIMIT_REACHED_EMAIL_HTML,
        email_text=USAGE_LIMIT_REACHED_EMAIL_TEXT,
        sms_content=USAGE_LIMIT_REACHED_SMS,
        push_title=USAGE_LIMIT_REACHED_PUSH_TITLE,
        push_body=USAGE_LIMIT_REACHED_PUSH_BODY,
        push_action_url="{{ upgrade_url }}",
        in_app_title=USAGE_LIMIT_REACHED_IN_APP_TITLE,
        in_app_body=USAGE_LIMIT_REACHED_IN_APP_BODY,
        in_app_action_url="/settings/billing/usage",
        in_app_icon="usage-limit",
        required_variables=["resource_type", "limit"],
        optional_variables=["upgrade_url", "usage_reset_date", "overage_rate", "billing_url", "support_url"],
        default_values={
            "billing_url": "https://rawdrive.io/settings/billing",
            "support_url": "https://rawdrive.io/support",
        },
        tags=["transactional", "billing", "usage", "action-required"],
    ),
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_billing_template(template_code: str) -> BillingTemplate | None:
    """Get a billing template by its code.

    Args:
        template_code: The template code (e.g., 'billing_payment_success')

    Returns:
        BillingTemplate or None if not found
    """
    return BILLING_TEMPLATES.get(template_code)


def get_template_for_event(event_type: EventType | str) -> BillingTemplate | None:
    """Get a billing template by its event type.

    Args:
        event_type: The event type enum or string value

    Returns:
        BillingTemplate or None if not found
    """
    if isinstance(event_type, str):
        try:
            event_type = EventType(event_type)
        except ValueError:
            return None

    for template in BILLING_TEMPLATES.values():
        if template.event_type == event_type:
            return template
    return None


def list_billing_templates() -> list[str]:
    """Get a list of all billing template codes.

    Returns:
        List of template codes
    """
    return list(BILLING_TEMPLATES.keys())


def get_template_variable_schema(template_code: str) -> dict[str, Any] | None:
    """Get the variable schema for a template.

    Args:
        template_code: The template code

    Returns:
        Dict with 'required' and 'optional' keys, or None if template not found
    """
    template = get_billing_template(template_code)
    if not template:
        return None

    return {
        "required": template.required_variables,
        "optional": template.optional_variables,
    }


def get_templates_by_channel(channel: NotificationChannel) -> list[BillingTemplate]:
    """Get all templates that support a specific channel.

    Args:
        channel: The notification channel

    Returns:
        List of BillingTemplate instances
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if channel in template.supported_channels
    ]


def get_templates_by_priority(priority: NotificationPriority) -> list[BillingTemplate]:
    """Get all templates with a specific priority.

    Args:
        priority: The notification priority

    Returns:
        List of BillingTemplate instances
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if template.default_priority == priority
    ]


def get_transactional_templates() -> list[BillingTemplate]:
    """Get all transactional billing templates.

    Returns:
        List of BillingTemplate instances that cannot be disabled
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if template.is_transactional
    ]


def get_payment_templates() -> list[BillingTemplate]:
    """Get all payment-related billing templates.

    Returns:
        List of BillingTemplate instances with 'payment' tag
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if "payment" in template.tags
    ]


def get_subscription_templates() -> list[BillingTemplate]:
    """Get all subscription-related billing templates.

    Returns:
        List of BillingTemplate instances with 'subscription' tag
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if "subscription" in template.tags
    ]


def get_invoice_templates() -> list[BillingTemplate]:
    """Get all invoice-related billing templates.

    Returns:
        List of BillingTemplate instances with 'invoice' tag
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if "invoice" in template.tags
    ]


def get_trial_templates() -> list[BillingTemplate]:
    """Get all trial-related billing templates.

    Returns:
        List of BillingTemplate instances with 'trial' tag
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if "trial" in template.tags
    ]


def get_usage_templates() -> list[BillingTemplate]:
    """Get all usage-related billing templates.

    Returns:
        List of BillingTemplate instances with 'usage' tag
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if "usage" in template.tags
    ]


def get_action_required_templates() -> list[BillingTemplate]:
    """Get all templates that require user action.

    Returns:
        List of BillingTemplate instances with 'action-required' tag
    """
    return [
        template
        for template in BILLING_TEMPLATES.values()
        if "action-required" in template.tags
    ]


# =============================================================================
# EXPORTS
# =============================================================================


__all__ = [
    # Data class
    "BillingTemplate",
    # Template registry
    "BILLING_TEMPLATES",
    # Helper functions
    "get_billing_template",
    "get_template_for_event",
    "list_billing_templates",
    "get_template_variable_schema",
    "get_templates_by_channel",
    "get_templates_by_priority",
    "get_transactional_templates",
    "get_payment_templates",
    "get_subscription_templates",
    "get_invoice_templates",
    "get_trial_templates",
    "get_usage_templates",
    "get_action_required_templates",
    # Common styles (for custom templates)
    "BILLING_EMAIL_STYLES",
]
