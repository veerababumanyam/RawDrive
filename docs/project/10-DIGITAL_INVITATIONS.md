# Digital Invitations

> Terminology: See [`docs/RawDrive_Project/GLOSSARY.md`](../RawDrive_Project/GLOSSARY.md) (Workspace, Share Link, Preferred Language/Locale).

## Overview

Digital invitations enable photographers to invite clients to view galleries through email, SMS, WhatsApp, and other digital channels. This document covers invitation creation, delivery, tracking, and management.

## Purpose

Digital invitations serve to:
- **Enable Sharing**: Easy gallery sharing with clients
- **Track Access**: Monitor client engagement
- **Customize Experience**: Personalized invitation messages
- **Multi-Channel**: Support email, SMS, WhatsApp
- **Security**: Password protection and access codes
- **Analytics**: Track invitation metrics
- **Compliance**: GDPR-compliant invitation management

**Key product alignment**

- RawDrive is **multi-tenant**: all invitations are scoped to a **Workspace** (`workspace_id`).
- Invitations distribute access using **Share Links** (capability-based access grants). Invitations are *not* the access primitive; they are the delivery mechanism.
- UI and invitation content support **i18n** with per-user and per-client language preferences (India-first).

---

## Invitation Types

### Email Invitations

Send invitations via email.

**Email Invitation Details:**
```typescript
interface EmailInvitation {
  id: string,
  workspaceId: string,
  galleryId: string,
  shareLinkId: string,
  createdByUserId: string,
  clientEmail: string,
  clientName?: string,
  
  // Invitation details
  accessLevel: 'view' | 'select' | 'download',
  message?: string,

  // i18n
  locale?: string, // e.g., 'en-IN', 'hi-IN', 'ur-IN'
  templateId?: string,
  
  // Security
  passwordProtected: boolean,
  // Never store plaintext passwords. If the Share Link is password-protected, store only a hash on the Share Link.
  accessCode?: string,
  
  // Expiration
  expiresAt?: Date,
  
  // Status
  status: 'pending' | 'sent' | 'opened' | 'clicked' | 'accepted' | 'revoked' | 'expired',
  
  // Tracking
  sentAt: Date,
  openedAt?: Date,
  clickedAt?: Date,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
}
```

**Email Template:**
```
Subject: [Photographer Name] shared a gallery with you

Hi [Client Name],

[Photographer Name] shared a gallery with you on RawDrive.

Gallery: [Gallery Name]
Photos: [Photo Count]

View Gallery: [Invitation Link]

[Custom Message]

Access expires: [Expiration Date]

If you don't have an account, create one:
[Sign Up Link]

Thanks,
RawDrive Team
```

**Note:** Invitations SHOULD allow access without account creation for typical client flows (Share Link). Account creation is optional (e.g., for persistent selections across devices).

### SMS Invitations

Send invitations via SMS.

**SMS Invitation Details:**
```typescript
interface SMSInvitation {
  id: string,
  workspaceId: string,
  galleryId: string,
  shareLinkId: string,
  createdByUserId: string,
  phoneNumber: string,
  
  // Message
  message: string,
  shortLink: string,

  // i18n
  locale?: string,
  
  // Status
  status: 'pending' | 'sent' | 'delivered' | 'failed',
  
  // Tracking
  sentAt: Date,
  deliveredAt?: Date,
  clickedAt?: Date,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
}
```

**SMS Template:**
```
Hi [Name], [Photographer] shared a gallery with you on RawDrive. View: [Short Link] Expires: [Date]
```

### WhatsApp Invitations

Send invitations via WhatsApp.

**WhatsApp Invitation Details:**
```typescript
interface WhatsAppInvitation {
  id: string,
  workspaceId: string,
  galleryId: string,
  shareLinkId: string,
  createdByUserId: string,
  phoneNumber: string,
  
  // Message
  message: string,
  galleryLink: string,

  // i18n
  locale?: string,
  
  // Status
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed',
  
  // Tracking
  sentAt: Date,
  deliveredAt?: Date,
  readAt?: Date,
  clickedAt?: Date,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
}
```

**WhatsApp Template:**
```
Hi [Name]! 📸

[Photographer] shared a gallery with you on RawDrive.

Gallery: [Gallery Name]
Photos: [Photo Count]

View Gallery: [Link]

[Custom Message]

Access expires: [Date]

Thanks,
RawDrive Team
```

---

## Invitation Creation

### Create Email Invitation

Create and send email invitation.

**API Endpoint:**
```typescript
// Request
POST /api/v1/galleries/:galleryId/invitations
Headers: {
  Authorization: 'Bearer {token}',
  Content-Type: 'application/json',
}
Body: {
  type: 'email',
  clientEmail: 'client@example.com',
  clientName?: 'John Doe',
  accessLevel: 'view' | 'select' | 'download',
  message?: 'Custom message',
  // If password protection is needed, configure it on the Share Link.
  passwordProtected?: true,
  locale?: 'en-IN' | 'hi-IN' | 'bn-IN' | 'te-IN' | 'mr-IN' | 'ta-IN' | 'gu-IN' | 'kn-IN' | 'ml-IN' | 'pa-IN' | 'ur-IN',
  expiresAt?: '2025-12-31T23:59:59Z',
}

// Response (201 Created)
{
  data: {
    id: 'inv_123456',
    workspaceId: 'ws_123',
    galleryId: 'gal_123456',
    shareLinkId: 'sl_123456',
    clientEmail: 'client@example.com',
    accessLevel: 'view',
    status: 'sent',
    expiresAt: '2025-12-31T23:59:59Z',
    invitationLink: 'https://rawdrive.com/invite/inv_123456',
    sentAt: '2025-12-17T10:30:00Z',
  },
}
```

**Backend Implementation:**
```typescript
const createEmailInvitation = async (
  actorUserId: string,
  workspaceId: string,
  galleryId: string,
  invitationData: InvitationData
) => {
  // Verify workspace + permissions
  const gallery = await Gallery.findById(galleryId);
  if (gallery.workspaceId !== workspaceId) throw new Error('Unauthorized');
  await assertPermission(actorUserId, workspaceId, 'gallery:invite');

  // Create (or reuse) a Share Link as the access primitive
  const shareLink = await ShareLink.createOrReuse({
    workspaceId,
    galleryId,
    accessLevel: invitationData.accessLevel,
    passwordProtected: !!invitationData.passwordProtected,
    expiresAt: invitationData.expiresAt,
  });

  // Create invitation
  const invitation = await Invitation.create({
    workspaceId,
    galleryId,
    shareLinkId: shareLink.id,
    createdByUserId: actorUserId,
    clientEmail: invitationData.clientEmail,
    clientName: invitationData.clientName,
    accessLevel: invitationData.accessLevel,
    passwordProtected: invitationData.passwordProtected,
    expiresAt: invitationData.expiresAt,
    locale: invitationData.locale,
    templateId: invitationData.templateId,
    status: 'pending',
  });

  // Generate invitation link
  const invitationLink = `${process.env.APP_URL}/invite/${invitation.id}`;

  // Send email
  await sendInvitationEmail({
    to: invitationData.clientEmail,
    clientName: invitationData.clientName,
    galleryName: gallery.name,
    photographerName: await resolveDisplayName(actorUserId),
    invitationLink, // resolves to Share Link after acceptance
    message: invitationData.message,
    expiresAt: invitationData.expiresAt,
    locale: invitationData.locale,
    templateId: invitationData.templateId,
  });

  // Update status
  invitation.status = 'sent';
  invitation.sentAt = new Date();
  await invitation.save();

  return invitation;
};
```

### Create SMS Invitation

Create and send SMS invitation.

**API Endpoint:**
```typescript
// Request
POST /api/v1/galleries/:galleryId/invitations
Headers: {
  Authorization: 'Bearer {token}',
  Content-Type: 'application/json',
}
Body: {
  type: 'sms',
  phoneNumber: '+1-555-123-4567',
  message?: 'Custom message',
  locale?: 'en-IN' | 'hi-IN' | 'bn-IN' | 'te-IN' | 'mr-IN' | 'ta-IN' | 'gu-IN' | 'kn-IN' | 'ml-IN' | 'pa-IN' | 'ur-IN',
}

// Response (201 Created)
{
  data: {
    id: 'inv_123456',
    galleryId: 'gal_123456',
    phoneNumber: '+1-555-123-4567',
    status: 'sent',
    shortLink: 'https://rawdrive.com/g/abc123',
    sentAt: '2025-12-17T10:30:00Z',
  },
}
```

**Backend Implementation:**
```typescript
const createSMSInvitation = async (
  actorUserId: string,
  workspaceId: string,
  galleryId: string,
  phoneNumber: string,
  message?: string
) => {
  const gallery = await Gallery.findById(galleryId);
  if (gallery.workspaceId !== workspaceId) throw new Error('Unauthorized');
  await assertPermission(actorUserId, workspaceId, 'gallery:invite');

  const shareLink = await ShareLink.createOrReuse({ workspaceId, galleryId, accessLevel: 'view' });

  // Create invitation
  const invitation = await Invitation.create({
    workspaceId,
    galleryId,
    phoneNumber,
    type: 'sms',
    shareLinkId: shareLink.id,
    createdByUserId: actorUserId,
    locale: invitationData?.locale,
    status: 'pending',
  });

  // Generate short link
  const shortLink = await generateShortLink(
    `${process.env.APP_URL}/s/${shareLink.token}`
  );

  // Send SMS
  const smsMessage = message ||
    `Hi! ${await resolveDisplayName(actorUserId)} shared a gallery with you on RawDrive. View: ${shortLink}`;

  await sendSMS({
    to: phoneNumber,
    message: smsMessage,
  });

  // Update status
  invitation.status = 'sent';
  invitation.sentAt = new Date();
  await invitation.save();

  return invitation;
};
```

### Create WhatsApp Invitation

Create and send WhatsApp invitation.

**API Endpoint:**
```typescript
// Request
POST /api/v1/galleries/:galleryId/invitations
Headers: {
  Authorization: 'Bearer {token}',
  Content-Type: 'application/json',
}
Body: {
  type: 'whatsapp',
  phoneNumber: '+1-555-123-4567',
  message?: 'Custom message',
  locale?: 'en-IN' | 'hi-IN' | 'bn-IN' | 'te-IN' | 'mr-IN' | 'ta-IN' | 'gu-IN' | 'kn-IN' | 'ml-IN' | 'pa-IN' | 'ur-IN',
}

// Response (201 Created)
{
  data: {
    id: 'inv_123456',
    galleryId: 'gal_123456',
    phoneNumber: '+1-555-123-4567',
    status: 'sent',
    sentAt: '2025-12-17T10:30:00Z',
  },
}
```

**Backend Implementation:**
```typescript
const createWhatsAppInvitation = async (
  actorUserId: string,
  workspaceId: string,
  galleryId: string,
  phoneNumber: string,
  message?: string
) => {
  const gallery = await Gallery.findById(galleryId);
  if (gallery.workspaceId !== workspaceId) throw new Error('Unauthorized');
  await assertPermission(actorUserId, workspaceId, 'gallery:invite');

  const shareLink = await ShareLink.createOrReuse({ workspaceId, galleryId, accessLevel: 'view' });

  // Create invitation
  const invitation = await Invitation.create({
    workspaceId,
    galleryId,
    phoneNumber,
    type: 'whatsapp',
    shareLinkId: shareLink.id,
    createdByUserId: actorUserId,
    locale: invitationData?.locale,
    status: 'pending',
  });

  // Generate gallery link
  const galleryLink = `${process.env.APP_URL}/s/${shareLink.token}`;

  // Send WhatsApp message
  const whatsappMessage = message ||
    `Hi! 📸\n\n${await resolveDisplayName(actorUserId)} shared a gallery with you on RawDrive.\n\nGallery: ${gallery.name}\nPhotos: ${gallery.photoCount}\n\nView: ${galleryLink}`;

  await sendWhatsApp({
    to: phoneNumber,
    message: whatsappMessage,
  });

  // Update status
  invitation.status = 'sent';
  invitation.sentAt = new Date();
  await invitation.save();

  return invitation;
};
```

---

## Invitation Management

### List Invitations

List all invitations for a gallery.

**API Endpoint:**
```typescript
// Request
GET /api/v1/galleries/:galleryId/invitations
Query: {
  page?: number,
  limit?: number,
  status?: 'pending' | 'sent' | 'opened' | 'expired',
  type?: 'email' | 'sms' | 'whatsapp',
}

// Response
{
  data: [
    {
      id: 'inv_123456',
      workspaceId: 'ws_123',
      clientEmail: 'client@example.com',
      type: 'email',
      status: 'opened',
      accessLevel: 'view',
      sentAt: '2025-12-17T10:30:00Z',
      openedAt: '2025-12-17T11:00:00Z',
      expiresAt: '2025-12-31T23:59:59Z',
    }
  ],
  meta: { page: 1, limit: 20, total: 50 },
}
```

### Resend Invitation

Resend invitation to client.

**API Endpoint:**
```typescript
// Request
POST /api/v1/invitations/:invitationId/resend
Headers: {
  Authorization: 'Bearer {token}',
}

// Response
{
  data: {
    id: 'inv_123456',
    status: 'sent',
    sentAt: '2025-12-17T10:35:00Z',
  },
}
```

### Revoke Invitation

Revoke invitation access.

**API Endpoint:**
```typescript
// Request
DELETE /api/v1/invitations/:invitationId
Headers: {
  Authorization: 'Bearer {token}',
}

// Response (204 No Content)
```

### Update Invitation

Update invitation settings.

**API Endpoint:**
```typescript
// Request
PATCH /api/v1/invitations/:invitationId
Headers: {
  Authorization: 'Bearer {token}',
  Content-Type: 'application/json',
}
Body: {
  accessLevel?: 'view' | 'select' | 'download',
  expiresAt?: Date,
  passwordProtected?: boolean,
  password?: string,
}

// Response
{
  data: {
    id: 'inv_123456',
    accessLevel: 'download',
    expiresAt: '2026-01-31T23:59:59Z',
  },
}
```

---

## Invitation Tracking

### Track Invitation Metrics

Track invitation engagement.

**Invitation Metrics:**
```typescript
interface InvitationMetrics {
  // Counts
  totalInvitations: number,
  sentInvitations: number,
  openedInvitations: number,
  clickedInvitations: number,
  expiredInvitations: number,
  
  // Rates
  openRate: number, // opened / sent
  clickRate: number, // clicked / sent
  conversionRate: number, // registered / sent
  
  // By type
  byType: {
    email: number,
    sms: number,
    whatsapp: number,
  },
  
  // By access level
  byAccessLevel: {
    view: number,
    select: number,
    download: number,
  },
}
```

**Tracking Implementation:**
```typescript
const trackInvitationOpen = async (invitationId: string) => {
  const invitation = await Invitation.findById(invitationId);
  
  if (!invitation.openedAt) {
    invitation.openedAt = new Date();
    await invitation.save();
    
    // Log event
    await logEvent({
      type: 'invitation_opened',
      invitationId,
      galleryId: invitation.galleryId,
      timestamp: new Date(),
    });
  }
};

const trackInvitationClick = async (invitationId: string) => {
  const invitation = await Invitation.findById(invitationId);
  
  if (!invitation.clickedAt) {
    invitation.clickedAt = new Date();
    await invitation.save();
    
    // Log event
    await logEvent({
      type: 'invitation_clicked',
      invitationId,
      galleryId: invitation.galleryId,
      timestamp: new Date(),
    });
  }
};
```

### View Invitation Analytics

View invitation performance.

**Analytics Dashboard:**
```
Invitation Performance

Total Invitations: 150
├── Sent: 150 (100%)
├── Opened: 120 (80%)
├── Clicked: 100 (67%)
└── Registered: 45 (30%)

By Channel:
├── Email: 100 invitations (80 opened, 67%)
├── SMS: 30 invitations (24 opened, 80%)
└── WhatsApp: 20 invitations (16 opened, 80%)

By Access Level:
├── View: 80 invitations (53%)
├── Select: 50 invitations (33%)
└── Download: 20 invitations (13%)

Top Galleries:
1. Wedding Photos - 45 invitations, 80% open rate
2. Event Coverage - 35 invitations, 75% open rate
3. Portrait Session - 25 invitations, 70% open rate
```

---

## Security

### Password Protection

Protect invitations with passwords.

**Password Protection:**
```typescript
interface PasswordProtectedInvitation {
  id: string,
  galleryId: string,
  passwordHash: string,
  passwordSalt: string,
  
  // Attempts
  failedAttempts: number,
  lockedUntil?: Date,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
}

// Verify password
const verifyInvitationPassword = async (
  invitationId: string,
  password: string
) => {
  const invitation = await Invitation.findById(invitationId);
  
  // Check if locked
  if (invitation.lockedUntil && invitation.lockedUntil > new Date()) {
    throw new Error('Too many failed attempts. Try again later.');
  }
  
  // Verify password
  const isValid = await bcrypt.compare(password, invitation.passwordHash);
  
  if (!isValid) {
    invitation.failedAttempts++;
    
    // Lock after 5 failed attempts
    if (invitation.failedAttempts >= 5) {
      invitation.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }
    
    await invitation.save();
    throw new Error('Invalid password');
  }
  
  // Reset attempts on success
  invitation.failedAttempts = 0;
  invitation.lockedUntil = null;
  await invitation.save();
  
  return true;
};
```

### Access Codes

Use access codes for additional security.

**Access Code Generation:**
```typescript
const generateAccessCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Example: ABC123
```

### Expiration

Set invitation expiration dates.

**Expiration Handling:**
```typescript
const checkInvitationExpiration = async (invitationId: string) => {
  const invitation = await Invitation.findById(invitationId);
  
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    await invitation.save();
    throw new Error('Invitation has expired');
  }
  
  return invitation;
};

// Auto-expire old invitations
const expireOldInvitations = async () => {
  await Invitation.updateMany(
    {
      expiresAt: { $lt: new Date() },
      status: { $ne: 'expired' },
    },
    { status: 'expired' }
  );
};
```

---

## Invitation Acceptance

### Accept Invitation

Client accepts invitation and views gallery.

**Acceptance Flow:**
```typescript
const acceptInvitation = async (invitationId: string, password?: string) => {
  // Get invitation
  const invitation = await Invitation.findById(invitationId);
  
  // Check expiration
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    throw new Error('Invitation has expired');
  }
  
  // Verify Share Link password (if configured) before granting access
  if (invitation.passwordProtected) {
    await verifyShareLinkPassword(invitation.shareLinkId, password);
  }
  
  // Update invitation status
  invitation.status = 'accepted';
  invitation.acceptedAt = new Date();
  await invitation.save();
  
  // Get gallery
  const gallery = await Gallery.findById(invitation.galleryId);
  
  // Return gallery data + share link
  return {
    gallery,
    accessLevel: invitation.accessLevel,
    shareUrl: await resolveShareUrl(invitation.shareLinkId),
  };
};
```

### Create Client Account

Client creates account from invitation.

**Account Creation from Invitation:**
```typescript
const createClientAccountFromInvitation = async (
  invitationId: string,
  email: string,
  password: string,
  firstName: string,
  lastName: string
) => {
  // Get invitation
  const invitation = await Invitation.findById(invitationId);
  
  // Verify email matches
  if (invitation.clientEmail !== email) {
    throw new Error('Email does not match invitation');
  }
  
  // Create user account
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    firstName,
    lastName,
    role: 'client',
  });
  
  // Link to invitation
  invitation.clientId = user.id;
  invitation.status = 'accepted';
  invitation.acceptedAt = new Date();
  await invitation.save();
  
  // Grant gallery access
  await grantGalleryAccess(user.id, invitation.galleryId, invitation.accessLevel);
  
  return user;
};
```

---

## Bulk Invitations

### Bulk Email Invitations

Send invitations to multiple clients.

**API Endpoint:**
```typescript
// Request
POST /api/v1/galleries/:galleryId/invitations/bulk
Headers: {
  Authorization: 'Bearer {token}',
  Content-Type: 'application/json',
}
Body: {
  invitations: [
    {
      clientEmail: 'client1@example.com',
      clientName: 'Client 1',
      accessLevel: 'view',
    },
    {
      clientEmail: 'client2@example.com',
      clientName: 'Client 2',
      accessLevel: 'download',
    },
  ],
  message?: 'Custom message',
  expiresAt?: '2025-12-31T23:59:59Z',
}

// Response
{
  data: {
    created: 2,
    sent: 2,
    failed: 0,
    invitations: [
      { id: 'inv_1', email: 'client1@example.com', status: 'sent' },
      { id: 'inv_2', email: 'client2@example.com', status: 'sent' },
    ],
  },
}
```

### CSV Import

Import invitations from CSV.

**CSV Format:**
```
email,name,access_level,expires_at
client1@example.com,Client 1,view,2025-12-31
client2@example.com,Client 2,download,2025-12-31
client3@example.com,Client 3,select,2025-12-31
```

---

## Invitation Templates

### Custom Templates

Create custom invitation templates.

**Template Variables:**
```
{photographer_name} - Photographer name
{gallery_name} - Gallery name
{photo_count} - Number of photos
{invitation_link} - Invitation link
{expiration_date} - Expiration date
{custom_message} - Custom message
{access_level} - Access level
{language} - UI language / locale
```

**Template Example:**
```
Subject: {photographer_name} shared "{gallery_name}" with you

Hi {client_name},

{photographer_name} shared a gallery with you on RawDrive.

Gallery: {gallery_name}
Photos: {photo_count}
Access: {access_level}

{custom_message}

View Gallery: {invitation_link}

This invitation expires on {expiration_date}.

Thanks,
RawDrive Team
```

---

## Compliance

### GDPR Compliance

Handle invitations in GDPR-compliant manner.

**GDPR Requirements:**
- Consent for email/SMS
- Right to be forgotten
- Data portability
- Privacy policy
- Unsubscribe option

**Implementation:**
```typescript
// Check consent before sending
const canSendInvitation = async (email: string) => {
  const consent = await EmailConsent.findOne({ email });
  return consent?.hasConsent === true;
};

// Provide unsubscribe option
const unsubscribeFromInvitations = async (email: string) => {
  await EmailConsent.updateOne(
    { email },
    { hasConsent: false, unsubscribedAt: new Date() }
  );
};
```

### Data Retention

Retain invitation data appropriately.

**Retention Policy:**
- Active invitations: Keep indefinitely
- Expired invitations: Keep for 90 days
- Accepted invitations: Keep for 1 year
- Rejected invitations: Keep for 30 days

**Workspace deletion:** If a workspace is deleted, invitation records MUST be deleted/anonymized according to the platform’s customer removal policy.

---

## i18n & India-first language support

Invitations and invite acceptance pages SHOULD be localized using the product i18n system.

**Supported languages (initial):**
- English (default)
- Hindi (हिन्दी)
- Bengali (বাংলা)
- Telugu (తెలుగు)
- Marathi (मराठी)
- Tamil (தமிழ்)
- Gujarati (ગુજરાતી)
- Kannada (ಕನ್ನಡ)
- Malayalam (മലയാളം)
- Punjabi (ਪੰਜਾਬੀ)
- Urdu (اردو) — RTL

**Rules**
- The invite email/SMS/WhatsApp content SHOULD be rendered in the recipient locale when available.
- The invite acceptance page MUST respect RTL rendering for Urdu.

---

## Optional: AI-assisted invitation copy (AI-native)

RawDrive MAY use the AI Platform to suggest invitation text (tone, brevity, language) while keeping human review.

**Requirements**
- Generate copy in the selected locale (including Indian languages).
- Use the Model Router (Gemini default; fallback to other configured providers).
- Never include secrets (passwords/tokens) in generated text.
- Store the chosen prompt/version for auditability.

---

## Related Files

- `docs/RawDrive_Project/CLIENT_FACING_FEATURES.md` - Client features
- `docs/RawDrive_Project/NOTIFICATIONS_AND_COMMUNICATION.md` - Communication
- `docs/RawDrive_Project/API_AND_INTEGRATIONS.md` - API documentation
- `backend/src/models/Invitation.ts` - Invitation model
- `backend/src/services/invitationService.ts` - Invitation service

## Last Updated

2025-12-17
