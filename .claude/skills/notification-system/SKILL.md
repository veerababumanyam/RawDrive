---
name: notification-system
description: "Notification system patterns for RawDrive: email (transactional + marketing), SMS, push notifications, in-app notifications, the notifications-service microservice (port 8010), and notification preferences. Use this skill when implementing email sending, SMS alerts, push notification delivery, notification templates, user preference management, delivery tracking, or working with the notifications-service. Also use for notification batching, digest emails, unsubscribe handling, or real-time notification delivery via WebSocket. Triggers on: notification, email, SMS, push notification, notifications-service, notification template, email template, digest, unsubscribe, notification preference, alert, transactional email, in-app notification."
---

# Notification System Patterns

RawDrive's notification-service (port 8010) handles all outbound communications across four channels: email, SMS, push, and in-app.

## Service Architecture

```
services/notifications-service/src/
├── api/v1/
│   ├── notifications.py    # CRUD + send endpoints
│   └── preferences.py      # User notification preferences
├── services/
│   ├── notification_service.py   # Orchestration + routing
│   ├── email_service.py          # Email provider abstraction
│   ├── sms_service.py            # SMS provider abstraction
│   ├── push_service.py           # Push notification delivery
│   └── template_service.py       # Template rendering
├── providers/
│   ├── sendgrid.py         # Email: SendGrid
│   ├── ses.py              # Email: AWS SES (fallback)
│   ├── twilio.py           # SMS: Twilio
│   └── fcm.py              # Push: Firebase Cloud Messaging
├── templates/              # Email/SMS templates (Jinja2)
├── workers/
│   ├── email_worker.py     # Async email processing
│   ├── digest_worker.py    # Daily/weekly digest compilation
│   └── retry_worker.py     # Failed delivery retry
└── config.py
```

## Notification Types

```python
class NotificationType(str, Enum):
    # Gallery events
    GALLERY_SHARED = "gallery_shared"
    GALLERY_COMMENT = "gallery_comment"
    GALLERY_DOWNLOAD = "gallery_download"
    GALLERY_FAVORITES = "gallery_favorites"
    # Invitation events
    INVITATION_RECEIVED = "invitation_received"
    RSVP_RECEIVED = "rsvp_received"
    # Upload events
    UPLOAD_COMPLETE = "upload_complete"
    PROCESSING_COMPLETE = "processing_complete"
    # Billing events
    PAYMENT_RECEIVED = "payment_received"
    SUBSCRIPTION_EXPIRING = "subscription_expiring"
    STORAGE_LIMIT_WARNING = "storage_limit_warning"
    # System events
    WELCOME = "welcome"
    PASSWORD_RESET = "password_reset"
    SECURITY_ALERT = "security_alert"

class NotificationChannel(str, Enum):
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    IN_APP = "in_app"
```

## Sending Notifications

```python
class NotificationService:
    async def send(
        self,
        workspace_id: UUID,
        recipient_id: UUID,
        notification_type: NotificationType,
        data: dict,
        channels: list[NotificationChannel] | None = None,
    ) -> Notification:
        # 1. Check user preferences (respect opt-outs)
        prefs = await self.pref_repo.get_preferences(recipient_id, workspace_id)
        allowed_channels = channels or self._resolve_channels(notification_type, prefs)

        # 2. Create notification record
        notification = await self.notification_repo.create(
            workspace_id=workspace_id,
            recipient_id=recipient_id,
            type=notification_type,
            data=data,
            channels=allowed_channels,
        )

        # 3. Dispatch to each channel
        for channel in allowed_channels:
            await self._dispatch(channel, notification, data)

        return notification

    async def _dispatch(
        self, channel: NotificationChannel, notification: Notification, data: dict
    ):
        """Route to appropriate provider — enqueue for async delivery."""
        match channel:
            case NotificationChannel.EMAIL:
                await self.task_queue.enqueue("send_email", {
                    "notification_id": str(notification.id),
                    "template": notification.type.value,
                    "data": data,
                })
            case NotificationChannel.IN_APP:
                # Deliver immediately via WebSocket if user is online
                await self.ws_manager.send_to_user(
                    notification.recipient_id,
                    {"type": "notification", "payload": notification.to_dict()},
                )
```

## Email Templates

```python
# Template rendering with Jinja2
class TemplateService:
    def render(self, template_name: str, data: dict, locale: str = "en") -> str:
        """Render notification template with i18n support."""
        template = self.env.get_template(f"{locale}/{template_name}.html")
        return template.render(**data, app_url=settings.APP_URL)

# Templates follow this structure:
# templates/
#   en/
#     gallery_shared.html
#     welcome.html
#     password_reset.html
#   hi/   (Hindi)
#   te/   (Telugu)
```

## User Preferences

```python
# Per-user, per-notification-type channel preferences
class NotificationPreference(Base):
    user_id: UUID
    workspace_id: UUID
    notification_type: NotificationType
    email_enabled: bool = True
    sms_enabled: bool = False
    push_enabled: bool = True
    in_app_enabled: bool = True
    # Digest settings
    digest_mode: DigestMode = DigestMode.INSTANT  # instant | daily | weekly
```

## Delivery Tracking & Retry

```python
class DeliveryStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    BOUNCED = "bounced"

# Retry strategy: exponential backoff, max 3 attempts
# After 3 failures: mark as failed, alert admin
# Bounced emails: auto-disable email channel for that user
```

## Batching & Digest

For high-frequency events (gallery comments, favorites), batch into digests:

```python
class DigestWorker:
    async def compile_daily_digest(self, workspace_id: UUID, user_id: UUID):
        """Aggregate undelivered notifications into a single digest email."""
        pending = await self.notification_repo.get_pending_digest(
            workspace_id, user_id, since=datetime.utcnow() - timedelta(days=1)
        )
        if not pending:
            return
        # Group by type, render digest template
        grouped = self._group_by_type(pending)
        await self.email_service.send_digest(user_id, grouped)
        # Mark all as delivered
        await self.notification_repo.mark_delivered(
            [n.id for n in pending]
        )
```
