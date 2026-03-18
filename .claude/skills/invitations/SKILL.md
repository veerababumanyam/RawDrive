---
name: invitations
description: "Digital wedding invitation system for RawDrive: invitation CRUD, guest management, RSVP, sub-events, AI-generated content, exports, analytics, and the invitations-service microservice. Use this skill when building invitation features, managing guest lists, implementing RSVP flows, handling sub-events (engagement, mehndi, wedding), working with invitation templates/fonts/colors, or building the invitations-service (port 8007). Also use for invitation media, venue input, layout configuration, or invitation analytics. Triggers on: invitation, RSVP, guest, wedding, sub-event, invitation template, guest list, invitation analytics, invitations-service, ceremony, venue, save the date."
---

# Digital Invitations

RawDrive's invitation system lets photographers create digital wedding invitations with RSVP, guest management, and analytics.

## Invitations Service Architecture

```
services/invitations-service/src/
├── api/v1/
│   ├── invitations.py        # Core invitation CRUD
│   ├── guests.py             # Guest management
│   ├── analytics.py          # RSVP and view analytics
│   ├── audit.py              # Audit logging
│   ├── invitation_ai.py      # AI-generated content
│   └── invitation_exports.py # Export functionality
├── api/
│   ├── invitation_schemas.py # Pydantic models
│   └── dependencies/auth.py  # JWT validation
└── main.py
```

## Shared Types

Import from `@rawdrive/shared-types`:
```typescript
import {
  InvitationStatus,   // DRAFT, PUBLISHED, ARCHIVED
  RSVPStatus,         // PENDING, ACCEPTED, DECLINED, MAYBE
  EventType,          // ENGAGEMENT, MEHNDI, HALDI, WEDDING, RECEPTION
  TemplateCategory,   // TRADITIONAL, MODERN, MINIMALIST, FLORAL
  GuestStatus,        // INVITED, VIEWED, RESPONDED
  MediaType,          // IMAGE, VIDEO, AUDIO
  MediaPurpose,       // COVER, BACKGROUND, GALLERY, ICON
  LayoutMode,         // SINGLE_PAGE, MULTI_PAGE, SCROLLING
  LayoutDensity,      // COMPACT, COMFORTABLE, SPACIOUS
  RSVPSource,         // LINK, QR_CODE, WHATSAPP, EMAIL
} from '@rawdrive/shared-types';
```

## Frontend Components

Located in `frontend/src/components/invitations/`:
- `ColorPicker.tsx` — Color theme selection
- `DateTimePicker.tsx` — Event date/time picker
- `FontSelector.tsx` — Typography selection for invitations
- `LayoutDensitySelector.tsx` — Layout density control
- `VenueInput.tsx` — Venue details with map integration

## Sub-Events (Indian Wedding)

A single invitation can have multiple sub-events:
```typescript
interface SubEvent {
  id: string;
  type: EventType;        // ENGAGEMENT, MEHNDI, HALDI, WEDDING, RECEPTION
  title: string;          // "Mehndi Ceremony"
  date: string;           // ISO date
  time: string;
  venue: VenueInfo;       // name, address, coordinates
  description?: string;
  dress_code?: string;
  rsvp_enabled: boolean;  // Per-event RSVP
}
```

## Guest Management

```python
# Guest CRUD with workspace isolation
@router.post("/invitations/{invitation_id}/guests")
async def add_guest(invitation_id: UUID, data: GuestCreate, ...):
    # Validate invitation belongs to workspace
    # Add guest with RSVP tracking
    # Support bulk import (CSV)

# Guest statuses: INVITED → VIEWED → RESPONDED (ACCEPTED/DECLINED/MAYBE)
```

## RSVP Flow

```
Guest receives link/QR → Opens invitation → Views sub-events
    → Selects attendance per sub-event → Adds +1/dietary notes
    → Submits RSVP → Photographer gets notification

RSVP Sources: LINK, QR_CODE, WHATSAPP, EMAIL
Verification: CheckinVerificationMethod (QR scan at venue)
```

## AI-Generated Content

```python
# AI assists with:
# - Invitation text generation (formal/casual/poetic)
# - Translation to regional languages
# - Image generation for invitation backgrounds
# - Smart scheduling suggestions

@router.post("/invitations/{id}/ai/generate-text")
async def generate_text(id: UUID, data: AITextRequest, ...):
    # Uses LLM service for culturally appropriate text
```

## Analytics

Track invitation engagement:
- View count and unique viewers
- RSVP response rates per sub-event
- Guest engagement timeline
- Device and location analytics
- Source tracking (which share method works best)

## Backend Models

```python
# Key models in backend/src/app/models/
InvitationAIGeneration    # AI-generated content tracking
InvitationMedia           # Media assets (covers, backgrounds)
InvitationSubEvent        # Sub-events with venues
InvitationViewAnalytics   # View and engagement tracking
```

## Multi-Language Support

Invitations support all 13 RawDrive languages. Key patterns:
- Template text stored per language
- Font selection appropriate for script (Devanagari, Telugu, etc.)
- RTL support for Urdu invitations
- Cultural formatting for dates and names
