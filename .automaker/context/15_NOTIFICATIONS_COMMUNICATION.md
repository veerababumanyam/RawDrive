# Notifications & Communication

> **Reference Documentation**:
> - `docs/Features/NOTIFICATIONS_AND_COMMUNICATION.md` - Detailed feature specifications
> - `docs/Features/GLOSSARY.md` - Terminology

## Business Value Proposition

The Notifications & Communication module is the central nervous system of the RawDrive platform, ensuring timely and relevant information flow between photographers, their clients, and the system. It moves beyond simple email alerts to provide a comprehensive engagement layer that drives user action, confirms critical workflows, and keeps all stakeholders aligned.

### Key Business Benefits
- **Increased Engagement**: Timely notifications drive users back to the platform.
- **Workflow Clarity**: Automated confirmations reduce "did it work?" support queries.
- **Brand Professionalism**: Branded emails and SMS reinforce the studio's identity.
- **Revenue Protection**: Alerts for billing issues or expiring links prevent revenue loss.
- **Compliance**: Standardized handling of transactional vs. marketing communications.

---

## User Personas

### Primary Users
1. **Photographer/Studio Owner**
   - Receives alerts about new bookings, orders, and system events.
   - Configures notification preferences and templates.
   - Monitors delivery status of client communications.

2. **Client (End User)**
   - Receives gallery invites, download links, and order updates.
   - Gets reminders for selection deadlines or expiration dates.

3. **System Administrator**
   - Broadcasts platform-wide announcements (maintenance, new features).
   - Monitors email delivery rates and system health.

---

## Key Capabilities

### 1. Multi-Channel Delivery
The system supports delivery across multiple channels to ensure messages are seen:
- **Email**: Primary channel for rich content, galleries, and receipts.
- **SMS**: Urgent alerts, 2FA codes, and quick reminders.
- **In-App**: Real-time updates within the dashboard and client portal.
- **Push Notifications**: Mobile app alerts for immediate attention (future roadmap).

### 2. Notification Types & Triggers
Notifications are grouped into **Transactional** (cannot be fully disabled) and **Marketing** (must support unsubscribe/opt-out):

- **System Notifications** (Transactional): Maintenance alerts, security warnings, policy updates.
- **Account Notifications** (Transactional): Subscription updates, billing alerts, storage limits, workspace ownership changes.
- **Workflow Notifications** (Transactional):
   - "Gallery Ready" for clients.
   - "New Selection Made" for photographers.
   - "Order Received" for both parties.
   - "Invitation RSVP Received" for hosts.
- **Marketing/Engagement** (Marketing): "Review your year," feature announcements, upsell campaigns.

All notification types are tagged with: `category`, `channel_defaults` (email/SMS/in-app), and `is_marketing` flag for compliance.

### 3. Template Management
- **Branded Templates**: Emails automatically inherit the studio's branding (logo, colors) defined in the Company Profile.
- **Customization**: Photographers can customize welcome messages and footer text.
- **Variables**: Dynamic insertion of client names, gallery links, and dates.

### 4. Preference Center
- **Granular Control**: Users can toggle specific notification types on/off.
- **Channel Selection**: Choose between Email, SMS, or both for certain alert types.
- **Unsubscribe Management**: Compliance with anti-spam laws (CAN-SPAM, GDPR) for marketing messages.

### 5. Event Catalog

Representative (non-exhaustive) catalog of notification events:

| Event Key | Type | Default Channels | Can User Disable? |
|-----------|------|------------------|-------------------|
| `gallery.published` | Transactional | Email (client), In-App (photographer) | Client: No (txn); Photographer: Yes (per-workspace) |
| `gallery.expiring_soon` | Transactional | Email, In-App | Yes (per-channel) |
| `invitation.sent` | Transactional | Email | No |
| `invitation.auto_delete_warning` | Transactional | Email | No |
| `rsvp.received` | Transactional | Email, In-App | Yes (per-channel) |
| `billing.payment_failed` | Transactional | Email, In-App | No |
| `billing.trial_expiring` | Transactional | Email | No |
| `marketing.product_update` | Marketing | Email | Yes (global marketing toggle) |
| `marketing.year_in_review` | Marketing | Email | Yes (global marketing toggle) |

All events are emitted with `workspace_id`, `user_id` (where applicable), and are written to the audit/notification log for traceability.

---

## Integration Points

- **Company Profile**: Inherits branding assets for email templates.
- **Client CRM**: Logs communication history to the client profile.
- **Gallery Management**: Triggers notifications based on gallery lifecycle events (published, expiring).
- **Billing**: Triggers invoice and payment failure alerts.
 - **Audit & Compliance**: Stores notification logs and delivery outcomes for investigations.

---

## Scalability Considerations

- **Queue-Based Delivery**: Uses background workers (Celery) to handle high volumes of emails without blocking user actions.
- **Provider Abstraction**: Designed to switch between email providers (AWS SES, SendGrid) if needed for deliverability or cost.
- **Rate Limiting**: Prevents spamming users with too many notifications in a short window.

## Metrics & KPIs

- **Delivery Rate**: % of notifications successfully accepted by providers (per channel).
- **Open/Click-Through Rate**: For email marketing and key transactional emails (e.g., "Gallery Ready").
- **Time-to-Notification**: P95 delay from triggering event to delivery attempt.
- **Unsubscribe Rate**: Per marketing campaign and globally.
- **Notification Volume**: Per workspace and per category for cost and noise analysis.
