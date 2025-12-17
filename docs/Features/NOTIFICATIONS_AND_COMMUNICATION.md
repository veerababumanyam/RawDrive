# Notifications and Communication

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive implements a comprehensive notification and communication system to keep photographers and clients informed about important events, updates, and actions. The system supports multiple channels including in-app notifications, emails, and SMS.

## Purpose

Notification features serve to:
- **Inform Users**: Keep users updated on important events
- **Enable Engagement**: Encourage user interaction and action
- **Provide Alerts**: Alert users to issues or opportunities
- **Support Workflows**: Notify about task completions and approvals
- **Maintain Communication**: Enable two-way communication
- **Ensure Compliance**: Notify about legal and regulatory matters

## Notification Types

### System Notifications

Platform-level notifications.

**System Notification Types:**
```typescript
type SystemNotification = 
  | 'maintenance_scheduled'
  | 'feature_released'
  | 'security_alert'
  | 'service_degradation'
  | 'policy_update'
  | 'terms_update';

interface SystemNotification {
  id: string,
  type: SystemNotification,
  title: string,
  message: string,
  severity: 'info' | 'warning' | 'critical',
  affectsAllUsers: boolean,
  targetUsers?: string[],
  createdAt: Date,
  expiresAt?: Date,
  actionUrl?: string,
  actionLabel?: string,
}
```

### Account Notifications

User account-related notifications.

**Account Notification Types:**
```typescript
type AccountNotification = 
  | 'login_attempt'
  | 'password_changed'
  | 'email_changed'
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'subscription_changed'
  | 'payment_failed'
  | 'payment_succeeded'
  | 'account_suspended'
  | 'account_deleted';

interface AccountNotification {
  id: string,
  userId: string,
  type: AccountNotification,
  title: string,
  message: string,
  severity: 'info' | 'warning' | 'critical',
  createdAt: Date,
  read: boolean,
  readAt?: Date,
  actionUrl?: string,
  actionLabel?: string,
}
```

### Gallery Notifications

Gallery-related notifications.

**Gallery Notification Types:**
```typescript
type GalleryNotification = 
  | 'gallery_created'
  | 'gallery_updated'
  | 'gallery_shared'
  | 'gallery_viewed'
  | 'photo_uploaded'
  | 'photo_analyzed'
  | 'client_invited'
  | 'client_viewed'
  | 'client_selected'
  | 'client_commented'
  | 'download_ready'
  | 'gallery_expiring'
  | 'gallery_expired';

interface GalleryNotification {
  id: string,
  userId: string,
  galleryId: string,
  type: GalleryNotification,
  title: string,
  message: string,
  severity: 'info' | 'warning',
  createdAt: Date,
  read: boolean,
  readAt?: Date,
  actionUrl?: string,
  actionLabel?: string,
}
```

### Album Notifications

Album design and print notifications.

**Album Notification Types:**
```typescript
type AlbumNotification = 
  | 'album_created'
  | 'album_updated'
  | 'album_shared_for_review'
  | 'album_comment_added'
  | 'album_approved'
  | 'album_rejected'
  | 'album_ready_for_print'
  | 'print_order_placed'
  | 'print_order_shipped'
  | 'print_order_delivered';

interface AlbumNotification {
  id: string,
  userId: string,
  albumId: string,
  type: AlbumNotification,
  title: string,
  message: string,
  severity: 'info' | 'warning',
  createdAt: Date,
  read: boolean,
  readAt?: Date,
  actionUrl?: string,
  actionLabel?: string,
}
```

### Storage Notifications

Storage and quota notifications.

**Storage Notification Types:**
```typescript
type StorageNotification = 
  | 'storage_limit_warning'
  | 'storage_limit_critical'
  | 'storage_limit_exceeded'
  | 'backup_completed'
  | 'backup_failed'
  | 'sync_completed'
  | 'sync_failed'
  | 'cleanup_suggested';

interface StorageNotification {
  id: string,
  userId: string,
  type: StorageNotification,
  title: string,
  message: string,
  severity: 'info' | 'warning' | 'critical',
  storageUsed: number,
  storageLimit: number,
  createdAt: Date,
  read: boolean,
  readAt?: Date,
  actionUrl?: string,
  actionLabel?: string,
}
```

### AI Notifications

AI feature notifications.

**AI Notification Types:**
```typescript
type AINotification = 
  | 'analysis_completed'
  | 'analysis_failed'
  | 'face_detection_completed'
  | 'story_generated'
  | 'curation_completed'
  | 'ai_credits_low'
  | 'ai_credits_depleted';

interface AINotification {
  id: string,
  userId: string,
  type: AINotification,
  title: string,
  message: string,
  severity: 'info' | 'warning',
  createdAt: Date,
  read: boolean,
  readAt?: Date,
  actionUrl?: string,
  actionLabel?: string,
}
```

## Notification Channels

### In-App Notifications

Display notifications within the application.

**In-App Notification Features:**
```typescript
interface InAppNotification {
  // Display
  position: 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center',
  duration: number, // ms (0 = persistent)
  
  // Content
  title: string,
  message: string,
  icon?: string,
  
  // Styling
  type: 'success' | 'error' | 'warning' | 'info',
  
  // Actions
  actionLabel?: string,
  actionUrl?: string,
  dismissible: boolean,
  
  // Sound
  playSound: boolean,
}
```

**Notification Center:**
- View all notifications
- Filter by type
- Mark as read/unread
- Delete notifications
- Search notifications
- Notification history

### Email Notifications

Send notifications via email.

**Email Notification Configuration:**
```typescript
interface EmailNotification {
  // Recipient
  to: string,
  
  // Content
  subject: string,
  template: string,
  variables: Record<string, any>,
  
  // Delivery
  priority: 'high' | 'normal' | 'low',
  sendAt?: Date,
  retryCount: number,
  
  // Tracking
  trackOpens: boolean,
  trackClicks: boolean,
  
  // Unsubscribe
  unsubscribeUrl: string,
  unsubscribeToken: string,
}
```

**Email Templates:**
- Account notifications
- Gallery notifications
- Album notifications
- Storage notifications
- AI notifications
- Marketing emails
- Transactional emails

### SMS Notifications

Send notifications via SMS (optional).

**SMS Notification Configuration:**
```typescript
interface SMSNotification {
  // Recipient
  phoneNumber: string,
  
  // Content
  message: string,
  
  // Delivery
  priority: 'high' | 'normal' | 'low',
  sendAt?: Date,
  
  // Tracking
  trackDelivery: boolean,
  
  // Compliance
  consentRequired: true,
  consentRecorded: true,
}
```

**SMS Use Cases:**
- Critical alerts
- Payment notifications
- Account security
- Time-sensitive actions

### Push Notifications

Send push notifications to mobile/web apps.

**Push Notification Configuration:**
```typescript
interface PushNotification {
  // Recipient
  userId: string,
  deviceTokens: string[],
  
  // Content
  title: string,
  body: string,
  icon?: string,
  badge?: number,
  
  // Action
  actionUrl?: string,
  actionLabel?: string,
  
  // Delivery
  priority: 'high' | 'normal',
  ttl: number, // Time to live in seconds
  
  // Tracking
  trackDelivery: boolean,
}
```

## Notification Preferences

### User Preferences

Allow users to customize notifications.

**Notification Preferences:**
```typescript
interface NotificationPreferences {
  // Channel preferences
  channels: {
    inApp: boolean,
    email: boolean,
    sms: boolean,
    push: boolean,
  },
  
  // Notification type preferences
  types: {
    systemNotifications: boolean,
    accountNotifications: boolean,
    galleryNotifications: boolean,
    albumNotifications: boolean,
    storageNotifications: boolean,
    aiNotifications: boolean,
    marketingEmails: boolean,
  },
  
  // Frequency preferences
  frequency: {
    immediate: boolean,
    daily: boolean,
    weekly: boolean,
    never: boolean,
  },
  
  // Quiet hours
  quietHours: {
    enabled: boolean,
    startTime: string, // HH:MM
    endTime: string, // HH:MM
    timezone: string,
  },
  
  // Unsubscribe
  unsubscribeAll: boolean,
  unsubscribeToken: string,
}
```

### Preference Management

Allow users to manage preferences.

**Preference UI:**
- Notification center settings
- Email preference center
- SMS opt-in/opt-out
- Push notification settings
- Quiet hours configuration
- Unsubscribe options

## Notification Delivery

### Delivery Pipeline

Process notifications through delivery pipeline.

**Delivery Steps:**
```typescript
const deliverNotification = async (notification: Notification) => {
  // 1. Check user preferences
  const preferences = await getUserPreferences(notification.userId);
  if (!preferences.channels[notification.channel]) {
    return; // User opted out
  }
  
  // 2. Check quiet hours
  if (isInQuietHours(preferences)) {
    scheduleForLater(notification);
    return;
  }
  
  // 3. Render notification
  const rendered = renderNotification(notification, preferences.language);
  
  // 4. Send via channel
  switch (notification.channel) {
    case 'email':
      await sendEmail(rendered);
      break;
    case 'sms':
      await sendSMS(rendered);
      break;
    case 'push':
      await sendPush(rendered);
      break;
    case 'inApp':
      await saveInApp(rendered);
      break;
  }
  
  // 5. Log delivery
  await logDelivery(notification);
};
```

### Retry Logic

Retry failed deliveries.

**Retry Configuration:**
```typescript
interface RetryConfiguration {
  maxRetries: 3,
  retryDelays: [
    60000, // 1 minute
    300000, // 5 minutes
    900000, // 15 minutes
  ],
  backoffMultiplier: 2,
  maxBackoffDelay: 3600000, // 1 hour
}
```

### Delivery Tracking

Track notification delivery.

**Delivery Status:**
```typescript
interface DeliveryTracking {
  notificationId: string,
  userId: string,
  channel: string,
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced',
  sentAt?: Date,
  deliveredAt?: Date,
  failureReason?: string,
  retryCount: number,
  nextRetryAt?: Date,
}
```

## Email Communication

### Email Templates

Professional email templates.

**Template Structure:**
```typescript
interface EmailTemplate {
  id: string,
  name: string,
  subject: string,
  preheader: string,
  body: string,
  variables: string[], // {{variable}}
  
  // Styling
  brandColor: string,
  logoUrl: string,
  
  // Footer
  unsubscribeUrl: string,
  supportEmail: string,
  
  // Tracking
  trackOpens: boolean,
  trackClicks: boolean,
}
```

**Common Templates:**
- Welcome email
- Password reset
- Email verification
- Payment confirmation
- Subscription renewal
- Gallery shared
- Client invitation
- Album ready for review
- Print order confirmation
- Account suspended
- Data deletion confirmation

### Email Personalization

Personalize emails for recipients.

**Personalization Variables:**
```typescript
interface EmailPersonalization {
  firstName: string,
  lastName: string,
  email: string,
  businessName: string,
  tier: string,
  galleryCount: number,
  clientCount: number,
  storageUsed: number,
  storageLimit: number,
  // Custom variables
}
```

**Personalization Examples:**
- "Hi {{firstName}}"
- "You have {{galleryCount}} galleries"
- "Your {{tier}} plan includes {{storageLimit}} GB"

### Email Analytics

Track email performance.

**Email Metrics:**
```typescript
interface EmailAnalytics {
  templateId: string,
  sentCount: number,
  deliveredCount: number,
  bounceCount: number,
  openCount: number,
  openRate: number,
  clickCount: number,
  clickRate: number,
  unsubscribeCount: number,
  complaintCount: number,
}
```

## Notification Center

### Notification Center UI

Central hub for all notifications.

**Features:**
- View all notifications
- Filter by type
- Filter by date range
- Search notifications
- Mark as read/unread
- Delete notifications
- Archive notifications
- Notification history

**Notification Display:**
```typescript
interface NotificationCenterUI {
  // List view
  notifications: Notification[],
  totalCount: number,
  unreadCount: number,
  
  // Filters
  typeFilter: string[],
  dateFilter: DateRange,
  searchQuery: string,
  
  // Actions
  markAsRead: (id: string) => void,
  markAllAsRead: () => void,
  delete: (id: string) => void,
  deleteAll: () => void,
  archive: (id: string) => void,
}
```

### Notification Badge

Show unread notification count.

**Badge Display:**
- Show in header
- Show in sidebar
- Show in tab title
- Show in favicon
- Update in real-time

## Accessibility

### Notification Accessibility

Ensure notifications are accessible.

**Requirements:**
- Announce notifications to screen readers
- Use ARIA live regions
- Provide keyboard navigation
- High contrast for notification content
- Clear focus indicators
- Readable text sizes
- Color not the only indicator

**ARIA Implementation:**
```typescript
<div role="status" aria-live="polite" aria-atomic="true">
  {notification.message}
</div>
```

## Related Files

- `frontend/src/components/NotificationCenter.tsx` - Notification center
- `frontend/src/components/trial/TrialBanner.tsx` - Trial notifications
- `frontend/src/components/subscription/UpgradePrompt.tsx` - Upgrade notifications
- `services/notificationService.ts` - Notification service
- `docs/CUSTOMER_AUTOMATED_ONBOARDING.md` - Onboarding emails

## Last Updated

2025-12-17
