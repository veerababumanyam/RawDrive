# Notifications & Email Best Practices

A guide for the `notifications-service`, email templates, and delivery channels.

---

## 1. Architecture

### Decoupling
*   **Trigger:** Services emit events (`USER_REGISTERED`) to the event bus.
*   **Listener:** `notifications-service` consumes events.
*   **Logic:** Service decides *who* to notify and *how* (Email, SMS, Push) based on User Preferences.

### Providers
*   **Transactional Email:** AWS SES / Postmark / SendGrid.
*   **Marketing Email:** Sync contacts to specialized tools (Mailchimp/ConvertKit). Don't use transactional IP pools for marketing.

---

## 2. Templates

### Engine
Use **Jinja2** (Python) or **React Email** (if generating HTML in frontend/node). RawDrive currently uses Jinja2.

### Layouts
*   **Base Template:** Header (Logo), Footer (Unsubscribe, Address), Preheader.
*   **Content:** Dynamic body.

### Variables
*   **Localization:** Emails must be localized. Pass `locale` to the renderer.
    *   `{{ t('welcome_message', locale=user.locale) }}`

---

## 3. Delivery

### Reliability
*   **Async Sending:** Never block the API response waiting for SMTP. Always use a background worker.
*   **Tracking:** Store `message_id` to map webhooks (Open/Click) back to the notification record.

### Reputation
*   **DKIM / SPF / DMARC:** Mandatory DNS records.
*   **Bounce Handling:** Listen to provider webhooks. If hard bounce, mark user `email_valid=False` and stop sending.

---

## 4. User Preferences

### Granularity
Allow users to toggle categories:
*   `marketing`: Product updates (Non-critical).
*   `transactional`: Invoices, Password Reset (Critical, usually forced).
*   `activity`: Client comments, Favorites (High volume).

### Logic
```python
if user.settings.notifications.activity_email:
    send_email(...)
```

---

## 5. Security

### Sensitive Data
*   **Magic Links:** Short-lived tokens (15m).
*   **No PII in Subject:** Avoid names or private info in Subject lines (visible in notifications).
*   **Phishing:** Verify links point to valid domains. Signed URLs.
