# Research: Save The Date - Digital Invitation System

**Feature**: 016-save-the-date | **Date**: December 30, 2025 | **Status**: Complete

## Executive Summary

This document captures research findings and architectural decisions for the Save The Date digital invitation system. All key decisions have been validated against existing RawDrive patterns and infrastructure.

---

## Research Questions & Findings

### RQ-1: Template Storage Strategy

**Question**: How should invitation templates and customizations be stored?

**Options Evaluated**:
1. **Separate tables** - `invitation_templates` + `invitation_customizations`
2. **JSONB in PostgreSQL** - Single `invitation_templates` table with JSONB columns
3. **File-based** - JSON files in R2 storage

**Decision**: **JSONB in PostgreSQL**

**Rationale**:
- Matches existing pattern in `gallery_settings` (JSONB for flexible config)
- Enables SQL queries on template metadata while keeping layout flexible
- Supports customization overlay without schema changes
- PostgreSQL 16 has excellent JSONB indexing and query performance

**Schema Pattern**:
```sql
-- Templates are system-wide (workspace_id NULL) or workspace-specific
CREATE TABLE invitation_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(workspace_id), -- NULL = system template
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL, -- wedding, birthday, festival, corporate
    subcategory VARCHAR(50), -- hindu, christian, muslim for weddings
    layout JSONB NOT NULL, -- { sections: [], fonts: {}, colors: {}, positions: {} }
    preview_image_url TEXT,
    supported_languages TEXT[] DEFAULT ARRAY['en-IN'],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invitation stores base template + customization overlay
CREATE TABLE invitations (
    invitation_id UUID PRIMARY KEY,
    template_id UUID REFERENCES invitation_templates(template_id),
    customization JSONB, -- Overlay on template layout
    -- ... other fields
);
```

---

### RQ-2: Public URL Pattern

**Question**: What URL pattern should public invitation pages use?

**Options Evaluated**:
1. `/invite/{slug}` - SEO-friendly, branded
2. `/i/{token}` - Short, similar to `/g/{token}` for galleries
3. `/invitations/{invitation_id}` - Predictable but long

**Decision**: **`/invite/{slug}`** for primary access, with `/i/{token}` fallback

**Rationale**:
- `/invite/{slug}` is SEO-friendly and memorable for sharing
- Slug generated from event title (e.g., `rahul-priya-wedding-2025`)
- Fallback `/i/{token}` for private/unlisted invitations
- Consistent with existing `/g/{token}` pattern for galleries
- Open Graph meta tags work better with semantic URLs

**Implementation**:
```python
# Public routes in public_invitations.py
@router.get("/portal/invitations/{slug}")  # Primary - SEO friendly
@router.get("/portal/i/{token}")           # Fallback - share link token
```

---

### RQ-3: Calendar Library Selection

**Question**: Which Python library should generate .ics calendar files?

**Options Evaluated**:
1. **icalendar** - Mature, RFC 5545 compliant
2. **ics** - Simpler API, fewer features
3. **Custom implementation** - Full control, maintenance burden

**Decision**: **`icalendar` Python package**

**Rationale**:
- RFC 5545 fully compliant (required for cross-calendar compatibility)
- Supports VTIMEZONE for timezone-aware events (critical for India + diaspora)
- Well-documented, actively maintained
- Handles edge cases (recurring events, alarms, attachments)
- Already used in enterprise calendaring systems

**Implementation**:
```python
from icalendar import Calendar, Event, vText
from datetime import datetime
import pytz

def generate_ics(invitation: Invitation) -> bytes:
    cal = Calendar()
    cal.add('prodid', '-//RawDrive//Save The Date//EN')
    cal.add('version', '2.0')
    cal.add('method', 'REQUEST')

    event = Event()
    event.add('uid', f'{invitation.invitation_id}@rawdrive.com')
    event.add('summary', invitation.title)
    event.add('description', invitation.description)
    event.add('dtstart', invitation.event_datetime)
    event.add('dtend', invitation.event_datetime + timedelta(hours=invitation.duration_hours))
    event.add('location', invitation.venue_address)

    # Add alarm reminder
    alarm = Alarm()
    alarm.add('action', 'DISPLAY')
    alarm.add('trigger', timedelta(days=-1))  # 1 day before
    alarm.add('description', f'Reminder: {invitation.title}')
    event.add_component(alarm)

    cal.add_component(event)
    return cal.to_ical()
```

---

### RQ-4: RSVP Deduplication Strategy

**Question**: How to prevent duplicate RSVPs while allowing updates without requiring accounts?

**Options Evaluated**:
1. **Email-based with edit token** - Simple, privacy-respecting
2. **Phone OTP verification** - Secure but friction
3. **Cookie/fingerprint** - Unreliable, privacy concerns
4. **No deduplication** - Leads to data quality issues

**Decision**: **Email-based with edit token**

**Rationale**:
- Email is natural unique identifier for RSVPs
- Edit token (JWT) sent in confirmation email enables updates
- No account required - matches Indian wedding invitation workflow
- Token expires 7 days post-event (matches invitation lifecycle)
- Can add optional phone verification for high-security events

**Implementation Flow**:
```
1. Guest submits RSVP with email
2. Check if email exists for this invitation
   - If exists: Return "Already RSVP'd, check email for edit link"
   - If new: Create RSVP record
3. Generate edit_token (signed JWT with rsvp_id, expires post-event)
4. Send confirmation email with edit_token link
5. Edit link: /invite/{slug}/rsvp?edit={token}
6. Token validated server-side, allows RSVP update
```

**Schema**:
```sql
CREATE TABLE invitation_rsvps (
    rsvp_id UUID PRIMARY KEY,
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id),
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_phone VARCHAR(20),
    attending BOOLEAN NOT NULL,
    party_size INTEGER DEFAULT 1,
    dietary_preferences TEXT,
    message TEXT,
    edit_token_hash VARCHAR(64), -- SHA256 of edit token
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(invitation_id, guest_email) -- Deduplication constraint
);
```

---

### RQ-5: Auto-Save Implementation

**Question**: How to implement auto-save for invitation drafts?

**Options Evaluated**:
1. **Redis with TTL** - Fast, simple, matches existing patterns
2. **PostgreSQL drafts table** - Persistent, queryable
3. **LocalStorage** - Client-side, no server cost
4. **Hybrid** - LocalStorage + periodic Redis sync

**Decision**: **Redis with 30-second debounce**

**Rationale**:
- Matches existing session patterns in RawDrive
- Fast writes (< 5ms) don't block UI
- TTL-based expiration (24 hours) handles cleanup automatically
- User can resume from any device (unlike LocalStorage)
- Drafts promoted to PostgreSQL on explicit save

**Implementation**:
```python
# Redis key pattern
DRAFT_KEY = "invitation:draft:{workspace_id}:{user_id}:{draft_id}"
DRAFT_TTL = 86400  # 24 hours

async def save_draft(workspace_id: str, user_id: str, draft_id: str, data: dict):
    key = DRAFT_KEY.format(workspace_id=workspace_id, user_id=user_id, draft_id=draft_id)
    await redis.setex(key, DRAFT_TTL, json.dumps(data))

async def get_draft(workspace_id: str, user_id: str, draft_id: str) -> dict | None:
    key = DRAFT_KEY.format(workspace_id=workspace_id, user_id=user_id, draft_id=draft_id)
    data = await redis.get(key)
    return json.loads(data) if data else None

async def list_drafts(workspace_id: str, user_id: str) -> list[dict]:
    pattern = f"invitation:draft:{workspace_id}:{user_id}:*"
    keys = await redis.keys(pattern)
    drafts = []
    for key in keys:
        data = await redis.get(key)
        if data:
            draft = json.loads(data)
            draft['draft_id'] = key.split(':')[-1]
            drafts.append(draft)
    return drafts
```

**Frontend Debounce**:
```typescript
// InvitationWizard.tsx
const debouncedSave = useMemo(
  () => debounce(async (data: InvitationDraft) => {
    await invitationService.saveDraft(data);
    setLastSaved(new Date());
  }, 30000), // 30 second debounce
  []
);

// Auto-save on form changes
useEffect(() => {
  if (isDirty) {
    debouncedSave(formData);
  }
  return () => debouncedSave.cancel();
}, [formData, isDirty]);
```

---

### RQ-6: Share Link Integration

**Question**: How to integrate with existing share_links system for public URLs?

**Finding**: The existing `share_links` table supports multiple target types via `target_type` enum.

**Decision**: Extend `share_links` with `target_type: 'invitation'`

**Implementation**:
```sql
-- Add new target type (migration)
ALTER TYPE share_link_target_type ADD VALUE 'invitation';

-- Share link for invitation
INSERT INTO share_links (
    link_id, workspace_id, target_type, target_id,
    token, slug, is_active, expires_at
) VALUES (
    gen_random_uuid(), $1, 'invitation', $2,
    generate_token(), generate_slug($3), true, $4
);
```

**Service Integration**:
```python
class InvitationService:
    def __init__(self, share_link_service: ShareLinkService):
        self.share_link_service = share_link_service

    async def publish(self, invitation_id: UUID) -> ShareLink:
        """Publish invitation and create public share link."""
        invitation = await self.repository.get(invitation_id)

        # Generate SEO-friendly slug from title
        slug = slugify(invitation.title)

        # Create share link with invitation target
        share_link = await self.share_link_service.create(
            workspace_id=invitation.workspace_id,
            target_type='invitation',
            target_id=invitation_id,
            slug=slug,
            expires_at=invitation.event_datetime + timedelta(days=7),
        )

        # Update invitation status
        await self.repository.update(invitation_id, {
            'status': 'published',
            'share_link_id': share_link.link_id,
            'public_url': f'/invite/{slug}',
        })

        return share_link
```

---

### RQ-7: QR Code Generation Integration

**Question**: How to leverage existing QRCodeService for invitation QR codes?

**Finding**: `backend/src/app/services/qr_service.py` provides:
- `generate_qr_code()` - PNG output
- `generate_qr_svg()` - SVG output
- `generate_qr_pdf()` - PDF with branding
- `generate_qr_with_logo()` - Logo overlay support

**Decision**: Direct integration with existing QRCodeService

**Implementation**:
```python
class InvitationQRService:
    def __init__(self, qr_service: QRCodeService, storage_service: StorageService):
        self.qr_service = qr_service
        self.storage_service = storage_service

    async def generate_qr(
        self,
        invitation: Invitation,
        format: Literal['png', 'svg', 'pdf'] = 'png',
        size: int = 512,
        include_logo: bool = False,
    ) -> bytes:
        """Generate QR code for invitation public URL."""
        url = f"https://rawdrive.com/invite/{invitation.slug}"

        if format == 'png':
            if include_logo and invitation.cover_image_url:
                logo_bytes = await self.storage_service.get_object(invitation.cover_image_url)
                return self.qr_service.generate_qr_with_logo(
                    data=url,
                    logo_bytes=logo_bytes,
                    size=size,
                    logo_size_percent=0.15,
                )
            return self.qr_service.generate_qr_code(data=url, min_size=size)

        elif format == 'svg':
            return self.qr_service.generate_qr_svg(data=url, size=size)

        elif format == 'pdf':
            return self.qr_service.generate_qr_pdf(
                data=url,
                size=size,
                title=invitation.title,
                subtitle=invitation.event_date.strftime('%B %d, %Y'),
            )
```

---

### RQ-8: Multi-Language Support

**Question**: How to support 6 regional languages for invitations?

**Finding**: Existing i18n infrastructure supports 11 Indian languages including:
- en-IN (English)
- hi-IN (Hindi)
- ta-IN (Tamil)
- te-IN (Telugu)
- kn-IN (Kannada)
- ml-IN (Malayalam)

**Decision**: Use existing i18n infrastructure with invitation-specific extensions

**Implementation**:

1. **Template Language Support**:
```sql
-- Templates declare supported languages
CREATE TABLE invitation_templates (
    -- ...
    supported_languages TEXT[] DEFAULT ARRAY['en-IN'],
    -- Language-specific content in JSONB
    content_i18n JSONB, -- { "en-IN": {...}, "hi-IN": {...} }
);
```

2. **Invitation Language Selection**:
```python
class Invitation:
    primary_language: str = 'en-IN'  # Default display language
    secondary_language: str | None   # Optional bilingual support
```

3. **Regional Fonts**:
```css
/* Load regional fonts dynamically */
@font-face {
  font-family: 'Noto Sans Devanagari';
  src: url('/fonts/NotoSansDevanagari-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'Noto Sans Tamil';
  src: url('/fonts/NotoSansTamil-Regular.woff2') format('woff2');
}
/* ... other regional fonts */
```

4. **Frontend Language Picker**:
```typescript
// TemplateCustomizer.tsx
const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', name: 'English', nativeName: 'English' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം' },
];
```

---

### RQ-9: Notification Integration

**Question**: How to integrate with notification service for RSVP alerts?

**Finding**: Existing notification service supports:
- Multiple channels: email, WhatsApp, SMS, in-app, push
- Template-based messaging with i18n
- Per-workspace preferences
- Idempotent sends with dedupe keys

**Decision**: Create invitation-specific notification topics

**Topics**:
| Topic | Trigger | Channels |
|-------|---------|----------|
| `invitation.rsvp_received` | New RSVP submitted | email, in_app, push |
| `invitation.rsvp_updated` | RSVP modified | email, in_app |
| `invitation.reminder` | 7d, 3d, 1d before event | email, WhatsApp |
| `invitation.checkin` | Guest checked in | in_app, push |

**Implementation**:
```python
async def handle_rsvp_submission(rsvp: InvitationRSVP, invitation: Invitation):
    """Emit notification event for new RSVP."""
    await notification_service.emit(
        topic='invitation.rsvp_received',
        workspace_id=invitation.workspace_id,
        recipient_user_ids=[invitation.created_by_user_id],
        data={
            'invitation_title': invitation.title,
            'guest_name': rsvp.guest_name,
            'attending': rsvp.attending,
            'party_size': rsvp.party_size,
        },
        dedupe_key=f'rsvp:{rsvp.rsvp_id}',
    )
```

---

## Dependency Analysis

### Existing Services to Reuse

| Service | Purpose | Integration Point |
|---------|---------|-------------------|
| `ShareLinkService` | Public URL generation | `publish()` method |
| `QRCodeService` | QR code generation | PNG/SVG/PDF export |
| `NotificationService` | RSVP alerts | Event emission |
| `StorageService` | Image storage | Cover images, QR codes |
| `EncryptionService` | Token signing | Edit tokens |

### New Services Required

| Service | Purpose |
|---------|---------|
| `InvitationService` | Core CRUD, publish, archive |
| `InvitationRSVPService` | RSVP management |
| `InvitationTemplateService` | Template rendering |
| `CalendarService` | .ics generation |
| `InvitationQRService` | QR code orchestration |

### Database Migrations Required

1. Add `invitation` to `share_link_target_type` enum
2. Create `invitation_templates` table
3. Create `invitations` table
4. Create `invitation_images` table
5. Create `invitation_guests` table (optional pre-populated list)
6. Create `invitation_rsvps` table
7. Create `invitation_checkins` table

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Template rendering performance | Medium | High | Pre-render popular templates, cache aggressively |
| RSVP spam/abuse | Medium | Medium | Rate limiting, optional Turnstile captcha |
| QR code scanning issues | Low | High | High error correction (H level), test across devices |
| i18n font loading | Medium | Medium | Subset fonts, lazy load regional fonts |
| Event timezone confusion | Medium | High | Store all times in UTC, display in user/event timezone |

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Should templates be workspace-scoped? | Yes, system templates + workspace custom templates |
| Support recurring events? | No, MVP is single-event invitations |
| Allow guest list import? | Yes, CSV import in Phase 6 |
| Support video invitations? | No, out of scope for MVP |
| WhatsApp Business API integration? | Future enhancement, use share URL for now |

---

## References

- [Spec: 016-save-the-date/spec.md](./spec.md)
- [Technical Spec: digital_invitations.json](../../docs/TechnicalSpecs/digital_invitations.json)
- [Technical Spec: share_links_access.json](../../docs/TechnicalSpecs/share_links_access.json)
- [Technical Spec: notifications.json](../../docs/TechnicalSpecs/notifications.json)
- [Technical Spec: i18n_localization.json](../../docs/TechnicalSpecs/i18n_localization.json)
- [icalendar RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)
