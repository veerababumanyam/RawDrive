# Data Model: Save The Date - Digital Invitation System

**Feature**: 016-save-the-date | **Date**: December 30, 2025 | **Spec**: [spec.md](./spec.md)

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Save The Date Data Model                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────┐       ┌────────────────────┐       ┌───────────────────┐    │
│  │   workspaces   │       │ invitation_templates│       │   share_links     │    │
│  │  (existing)    │       │                    │       │   (existing)      │    │
│  └───────┬────────┘       └─────────┬──────────┘       └─────────┬─────────┘    │
│          │                          │                            │              │
│          │ 1                        │ 1                          │ 1            │
│          │                          │                            │              │
│          ▼ *                        ▼ *                          ▼ 1            │
│  ┌───────────────────────────────────────────────────────────────────────┐      │
│  │                           invitations                                  │      │
│  │  invitation_id, workspace_id, template_id, share_link_id              │      │
│  │  title, description, event_datetime, venue_*, status, ...             │      │
│  └───────────────────────────────────┬───────────────────────────────────┘      │
│                                      │                                          │
│          ┌───────────────┬───────────┼───────────┬───────────────┐              │
│          │               │           │           │               │              │
│          ▼ *             ▼ *         ▼ *         ▼ *             ▼ *            │
│  ┌───────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐        │
│  │invitation_    │ │invitation│ │invitation│ │invitation│ │invitation_ │        │
│  │  images       │ │ _guests  │ │  _rsvps  │ │_checkins │ │  _events   │        │
│  └───────────────┘ └──────────┘ └────┬─────┘ └────┬─────┘ └────────────┘        │
│                                      │            │                             │
│                                      │            │                             │
│                                      └────────────┘                             │
│                                           │                                     │
│                                    rsvp_id FK (checkin references rsvp)         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Table Definitions

### 1. invitation_templates

System-wide and workspace-specific invitation templates.

```sql
CREATE TABLE invitation_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        -- NULL = system template (available to all workspaces)
        -- NOT NULL = workspace-specific custom template

    -- Identity
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    description TEXT,

    -- Classification
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'wedding', 'birthday', 'anniversary', 'baby_shower',
        'engagement', 'festival', 'corporate', 'other'
    )),
    subcategory VARCHAR(50), -- e.g., 'hindu', 'christian', 'muslim' for weddings
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Template Content
    layout JSONB NOT NULL DEFAULT '{}'::JSONB,
        -- {
        --   "sections": ["header", "details", "venue", "rsvp", "footer"],
        --   "fonts": { "heading": "Playfair Display", "body": "Inter" },
        --   "colors": { "primary": "#D4AF37", "secondary": "#0F172A", "background": "#FFFDF7" },
        --   "positions": { "header": { "x": 0, "y": 0, "width": "100%", "height": "200px" } },
        --   "assets": { "border": "/templates/wedding-gold/border.svg" }
        -- }

    content_i18n JSONB DEFAULT '{}'::JSONB,
        -- Language-specific default content
        -- { "en-IN": { "header": "You're Invited" }, "hi-IN": { "header": "आप आमंत्रित हैं" } }

    supported_languages TEXT[] DEFAULT ARRAY['en-IN'],

    -- Preview
    preview_image_url TEXT,
    thumbnail_url TEXT,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_premium BOOLEAN DEFAULT false, -- Premium templates for paid plans

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id UUID REFERENCES users(user_id),

    -- Constraints
    CONSTRAINT invitation_templates_slug_workspace_unique
        UNIQUE NULLS NOT DISTINCT (workspace_id, slug)
);

-- Indexes
CREATE INDEX idx_invitation_templates_workspace ON invitation_templates(workspace_id);
CREATE INDEX idx_invitation_templates_category ON invitation_templates(category);
CREATE INDEX idx_invitation_templates_active ON invitation_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_invitation_templates_layout ON invitation_templates USING GIN (layout);
```

---

### 2. invitations

Core invitation entity with event details and customization.

```sql
CREATE TABLE invitations (
    invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Template Reference
    template_id UUID REFERENCES invitation_templates(template_id) ON DELETE SET NULL,
    customization JSONB DEFAULT '{}'::JSONB,
        -- Overlay on template layout (colors, fonts, custom text)
        -- { "colors": { "primary": "#FF5733" }, "fonts": { "heading": "Dancing Script" } }

    -- Identity
    title VARCHAR(300) NOT NULL,
    slug VARCHAR(300), -- SEO-friendly URL slug
    description TEXT,

    -- Event Details
    event_type VARCHAR(50) NOT NULL DEFAULT 'wedding',
    event_datetime TIMESTAMPTZ NOT NULL,
    event_end_datetime TIMESTAMPTZ, -- Optional end time
    event_timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',

    -- Venue Information
    venue_name VARCHAR(300),
    venue_address TEXT,
    venue_city VARCHAR(100),
    venue_state VARCHAR(100),
    venue_country VARCHAR(100) DEFAULT 'India',
    venue_postal_code VARCHAR(20),
    venue_latitude DECIMAL(10, 8),
    venue_longitude DECIMAL(11, 8),
    venue_map_url TEXT, -- Google Maps / custom map URL

    -- Host Information
    host_names TEXT[], -- Array of host names
    host_contact_phone VARCHAR(20),
    host_contact_email VARCHAR(255),

    -- RSVP Settings
    rsvp_enabled BOOLEAN DEFAULT true,
    rsvp_deadline TIMESTAMPTZ,
    rsvp_max_party_size INTEGER DEFAULT 10,
    rsvp_collect_dietary BOOLEAN DEFAULT false,
    rsvp_collect_phone BOOLEAN DEFAULT false,
    rsvp_custom_questions JSONB DEFAULT '[]'::JSONB,
        -- [{ "question": "Any song requests?", "type": "text", "required": false }]

    -- Cover Image
    cover_image_url TEXT,
    cover_image_object_key TEXT, -- R2 storage key

    -- Languages
    primary_language VARCHAR(10) DEFAULT 'en-IN',
    secondary_language VARCHAR(10), -- Optional bilingual support
    content_i18n JSONB DEFAULT '{}'::JSONB,
        -- Custom content translations

    -- Share Link
    share_link_id UUID REFERENCES share_links(link_id) ON DELETE SET NULL,
    public_url TEXT, -- Computed: /invite/{slug}

    -- Security
    password_protected BOOLEAN DEFAULT false,
    password_hash VARCHAR(255), -- bcrypt hash
    pin_protected BOOLEAN DEFAULT false,
    pin_hash VARCHAR(255),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'published', 'archived', 'deleted'
    )),
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,

    -- Auto-Deletion
    auto_delete_enabled BOOLEAN DEFAULT true,
    auto_delete_days INTEGER DEFAULT 7, -- Days after event
    scheduled_deletion_at TIMESTAMPTZ, -- Computed from event_datetime + auto_delete_days

    -- Analytics
    view_count INTEGER DEFAULT 0,
    unique_view_count INTEGER DEFAULT 0,
    rsvp_count INTEGER DEFAULT 0, -- Denormalized for performance

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id UUID NOT NULL REFERENCES users(user_id),

    -- Constraints
    CONSTRAINT invitations_slug_workspace_unique UNIQUE (workspace_id, slug),
    CONSTRAINT invitations_event_datetime_future CHECK (
        status = 'draft' OR event_datetime > created_at - INTERVAL '1 day'
    )
);

-- Indexes
CREATE INDEX idx_invitations_workspace ON invitations(workspace_id);
CREATE INDEX idx_invitations_workspace_status ON invitations(workspace_id, status);
CREATE INDEX idx_invitations_slug ON invitations(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_invitations_event_datetime ON invitations(event_datetime);
CREATE INDEX idx_invitations_scheduled_deletion ON invitations(scheduled_deletion_at)
    WHERE auto_delete_enabled = true AND status != 'deleted';
CREATE INDEX idx_invitations_share_link ON invitations(share_link_id);
CREATE INDEX idx_invitations_created_by ON invitations(created_by_user_id);
```

---

### 3. invitation_images

Images associated with invitations (gallery, hero images, etc.).

```sql
CREATE TABLE invitation_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Image Details
    object_key TEXT NOT NULL, -- R2 storage key
    url TEXT NOT NULL, -- Public URL
    thumbnail_url TEXT,

    -- Metadata
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    width INTEGER,
    height INTEGER,

    -- Ordering & Purpose
    position INTEGER DEFAULT 0,
    purpose VARCHAR(50) DEFAULT 'gallery' CHECK (purpose IN (
        'cover', 'gallery', 'logo', 'background', 'pattern'
    )),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by_user_id UUID REFERENCES users(user_id),

    -- Constraints
    CONSTRAINT invitation_images_max_per_invitation CHECK (position < 20)
);

-- Indexes
CREATE INDEX idx_invitation_images_invitation ON invitation_images(invitation_id);
CREATE INDEX idx_invitation_images_workspace ON invitation_images(workspace_id);
CREATE INDEX idx_invitation_images_purpose ON invitation_images(invitation_id, purpose);
```

---

### 4. invitation_guests

Pre-populated guest list (optional, for personalized invitations).

```sql
CREATE TABLE invitation_guests (
    guest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Guest Details
    name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),

    -- Personalization
    salutation VARCHAR(50), -- "Mr. & Mrs.", "Dr.", etc.
    group_name VARCHAR(100), -- "Family", "Friends", "Colleagues"
    personalized_message TEXT,
    expected_party_size INTEGER DEFAULT 1,

    -- Personal Invite Token (for tracking)
    personal_token VARCHAR(64) UNIQUE, -- Unique link per guest

    -- Status
    invitation_sent BOOLEAN DEFAULT false,
    invitation_sent_at TIMESTAMPTZ,
    invitation_viewed BOOLEAN DEFAULT false,
    invitation_viewed_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT invitation_guests_email_unique UNIQUE (invitation_id, email)
);

-- Indexes
CREATE INDEX idx_invitation_guests_invitation ON invitation_guests(invitation_id);
CREATE INDEX idx_invitation_guests_workspace ON invitation_guests(workspace_id);
CREATE INDEX idx_invitation_guests_personal_token ON invitation_guests(personal_token);
CREATE INDEX idx_invitation_guests_group ON invitation_guests(invitation_id, group_name);
```

---

### 5. invitation_rsvps

Guest RSVP responses.

```sql
CREATE TABLE invitation_rsvps (
    rsvp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Link to pre-registered guest (optional)
    guest_id UUID REFERENCES invitation_guests(guest_id) ON DELETE SET NULL,

    -- Guest Information
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_phone VARCHAR(20),

    -- RSVP Response
    attending BOOLEAN NOT NULL,
    party_size INTEGER DEFAULT 1 CHECK (party_size >= 1 AND party_size <= 20),
    party_names TEXT[], -- Names of accompanying guests
    dietary_preferences TEXT,
    message TEXT, -- Personal message to host
    custom_answers JSONB DEFAULT '{}'::JSONB, -- Answers to custom questions

    -- Edit Token (for updating RSVP without account)
    edit_token_hash VARCHAR(64), -- SHA256 hash
    token_expires_at TIMESTAMPTZ,

    -- Tracking
    ip_address INET,
    user_agent TEXT,
    source VARCHAR(50) DEFAULT 'web' CHECK (source IN (
        'web', 'qr_code', 'whatsapp', 'email_link', 'personal_link'
    )),

    -- Status
    status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN (
        'pending', 'confirmed', 'declined', 'maybe', 'cancelled'
    )),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT invitation_rsvps_email_unique UNIQUE (invitation_id, guest_email)
);

-- Indexes
CREATE INDEX idx_invitation_rsvps_invitation ON invitation_rsvps(invitation_id);
CREATE INDEX idx_invitation_rsvps_workspace ON invitation_rsvps(workspace_id);
CREATE INDEX idx_invitation_rsvps_email ON invitation_rsvps(guest_email);
CREATE INDEX idx_invitation_rsvps_attending ON invitation_rsvps(invitation_id, attending);
CREATE INDEX idx_invitation_rsvps_created ON invitation_rsvps(invitation_id, created_at DESC);
```

---

### 6. invitation_checkins

Event-day check-in records.

```sql
CREATE TABLE invitation_checkins (
    checkin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Link to RSVP or Guest
    rsvp_id UUID REFERENCES invitation_rsvps(rsvp_id) ON DELETE SET NULL,
    guest_id UUID REFERENCES invitation_guests(guest_id) ON DELETE SET NULL,

    -- Check-in Details
    guest_name VARCHAR(200) NOT NULL,
    party_size_checked_in INTEGER DEFAULT 1,

    -- Verification
    verification_method VARCHAR(50) DEFAULT 'qr_scan' CHECK (verification_method IN (
        'qr_scan', 'manual', 'name_lookup', 'token'
    )),
    qr_token_used VARCHAR(255), -- The token from QR code (for audit)

    -- Operator
    checked_in_by_user_id UUID REFERENCES users(user_id),

    -- Timestamp
    checked_in_at TIMESTAMPTZ DEFAULT NOW(),

    -- Location (optional, for venue verification)
    checkin_latitude DECIMAL(10, 8),
    checkin_longitude DECIMAL(11, 8),

    -- Notes
    notes TEXT
);

-- Indexes
CREATE INDEX idx_invitation_checkins_invitation ON invitation_checkins(invitation_id);
CREATE INDEX idx_invitation_checkins_workspace ON invitation_checkins(workspace_id);
CREATE INDEX idx_invitation_checkins_rsvp ON invitation_checkins(rsvp_id);
CREATE INDEX idx_invitation_checkins_time ON invitation_checkins(invitation_id, checked_in_at);
```

---

### 7. invitation_events (Audit Log)

Activity log for invitation events.

```sql
CREATE TABLE invitation_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Event Type
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'created', 'updated', 'published', 'unpublished', 'archived',
        'viewed', 'shared', 'rsvp_received', 'rsvp_updated',
        'checkin', 'exported', 'deleted'
    )),

    -- Actor
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('user', 'guest', 'system')),
    actor_user_id UUID REFERENCES users(user_id),
    actor_guest_email VARCHAR(255),
    actor_ip_address INET,

    -- Event Data
    event_data JSONB DEFAULT '{}'::JSONB,
        -- Flexible payload for event-specific data

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_invitation_events_invitation ON invitation_events(invitation_id);
CREATE INDEX idx_invitation_events_workspace ON invitation_events(workspace_id);
CREATE INDEX idx_invitation_events_type ON invitation_events(invitation_id, event_type);
CREATE INDEX idx_invitation_events_time ON invitation_events(invitation_id, created_at DESC);

-- Partitioning for large datasets (optional)
-- PARTITION BY RANGE (created_at);
```

---

## Enum Type Additions

```sql
-- Add to existing share_link_target_type enum
ALTER TYPE share_link_target_type ADD VALUE IF NOT EXISTS 'invitation';
```

---

## Views

### invitation_stats (Materialized View)

```sql
CREATE MATERIALIZED VIEW invitation_stats AS
SELECT
    i.invitation_id,
    i.workspace_id,
    i.title,
    i.event_datetime,
    i.status,
    i.view_count,
    COUNT(r.rsvp_id) FILTER (WHERE r.attending = true) AS attending_count,
    COUNT(r.rsvp_id) FILTER (WHERE r.attending = false) AS not_attending_count,
    SUM(r.party_size) FILTER (WHERE r.attending = true) AS total_party_size,
    COUNT(c.checkin_id) AS checked_in_count,
    SUM(c.party_size_checked_in) AS total_checked_in
FROM invitations i
LEFT JOIN invitation_rsvps r ON i.invitation_id = r.invitation_id
LEFT JOIN invitation_checkins c ON i.invitation_id = c.invitation_id
GROUP BY i.invitation_id;

-- Refresh every 5 minutes
CREATE INDEX idx_invitation_stats_workspace ON invitation_stats(workspace_id);
CREATE INDEX idx_invitation_stats_invitation ON invitation_stats(invitation_id);
```

---

## Pydantic Models (Python)

```python
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, HttpUrl


class InvitationStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    DELETED = "deleted"


class EventType(str, Enum):
    WEDDING = "wedding"
    BIRTHDAY = "birthday"
    ANNIVERSARY = "anniversary"
    BABY_SHOWER = "baby_shower"
    ENGAGEMENT = "engagement"
    FESTIVAL = "festival"
    CORPORATE = "corporate"
    OTHER = "other"


class RSVPStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DECLINED = "declined"
    MAYBE = "maybe"
    CANCELLED = "cancelled"


class RSVPSource(str, Enum):
    WEB = "web"
    QR_CODE = "qr_code"
    WHATSAPP = "whatsapp"
    EMAIL_LINK = "email_link"
    PERSONAL_LINK = "personal_link"


# Template Models
class TemplateLayout(BaseModel):
    sections: list[str] = Field(default_factory=list)
    fonts: dict[str, str] = Field(default_factory=dict)
    colors: dict[str, str] = Field(default_factory=dict)
    positions: dict[str, dict] = Field(default_factory=dict)
    assets: dict[str, str] = Field(default_factory=dict)


class InvitationTemplate(BaseModel):
    template_id: UUID
    workspace_id: Optional[UUID] = None
    name: str
    slug: str
    description: Optional[str] = None
    category: str
    subcategory: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    layout: TemplateLayout
    content_i18n: dict[str, dict] = Field(default_factory=dict)
    supported_languages: list[str] = Field(default=["en-IN"])
    preview_image_url: Optional[HttpUrl] = None
    thumbnail_url: Optional[HttpUrl] = None
    is_active: bool = True
    is_premium: bool = False
    created_at: datetime
    updated_at: datetime


# Invitation Models
class VenueInfo(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "India"
    postal_code: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    map_url: Optional[HttpUrl] = None


class RSVPSettings(BaseModel):
    enabled: bool = True
    deadline: Optional[datetime] = None
    max_party_size: int = 10
    collect_dietary: bool = False
    collect_phone: bool = False
    custom_questions: list[dict] = Field(default_factory=list)


class Invitation(BaseModel):
    invitation_id: UUID
    workspace_id: UUID
    template_id: Optional[UUID] = None
    customization: dict = Field(default_factory=dict)
    title: str
    slug: Optional[str] = None
    description: Optional[str] = None
    event_type: EventType = EventType.WEDDING
    event_datetime: datetime
    event_end_datetime: Optional[datetime] = None
    event_timezone: str = "Asia/Kolkata"
    venue: VenueInfo = Field(default_factory=VenueInfo)
    host_names: list[str] = Field(default_factory=list)
    host_contact_phone: Optional[str] = None
    host_contact_email: Optional[EmailStr] = None
    rsvp_settings: RSVPSettings = Field(default_factory=RSVPSettings)
    cover_image_url: Optional[HttpUrl] = None
    primary_language: str = "en-IN"
    secondary_language: Optional[str] = None
    content_i18n: dict[str, dict] = Field(default_factory=dict)
    share_link_id: Optional[UUID] = None
    public_url: Optional[str] = None
    password_protected: bool = False
    pin_protected: bool = False
    status: InvitationStatus = InvitationStatus.DRAFT
    published_at: Optional[datetime] = None
    auto_delete_enabled: bool = True
    auto_delete_days: int = 7
    view_count: int = 0
    rsvp_count: int = 0
    created_at: datetime
    updated_at: datetime
    created_by_user_id: UUID


# RSVP Models
class InvitationRSVP(BaseModel):
    rsvp_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    guest_id: Optional[UUID] = None
    guest_name: str
    guest_email: EmailStr
    guest_phone: Optional[str] = None
    attending: bool
    party_size: int = 1
    party_names: list[str] = Field(default_factory=list)
    dietary_preferences: Optional[str] = None
    message: Optional[str] = None
    custom_answers: dict = Field(default_factory=dict)
    source: RSVPSource = RSVPSource.WEB
    status: RSVPStatus = RSVPStatus.CONFIRMED
    created_at: datetime
    updated_at: datetime


# Check-in Models
class InvitationCheckin(BaseModel):
    checkin_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    rsvp_id: Optional[UUID] = None
    guest_id: Optional[UUID] = None
    guest_name: str
    party_size_checked_in: int = 1
    verification_method: str = "qr_scan"
    checked_in_by_user_id: Optional[UUID] = None
    checked_in_at: datetime
    notes: Optional[str] = None
```

---

## TypeScript Interfaces (Frontend)

```typescript
// types/invitations.ts

export type InvitationStatus = 'draft' | 'published' | 'archived' | 'deleted';

export type EventType =
  | 'wedding'
  | 'birthday'
  | 'anniversary'
  | 'baby_shower'
  | 'engagement'
  | 'festival'
  | 'corporate'
  | 'other';

export type RSVPStatus = 'pending' | 'confirmed' | 'declined' | 'maybe' | 'cancelled';

export type RSVPSource = 'web' | 'qr_code' | 'whatsapp' | 'email_link' | 'personal_link';

export interface TemplateLayout {
  sections: string[];
  fonts: Record<string, string>;
  colors: Record<string, string>;
  positions: Record<string, { x: number; y: number; width: string; height: string }>;
  assets: Record<string, string>;
}

export interface InvitationTemplate {
  template_id: string;
  workspace_id: string | null;
  name: string;
  slug: string;
  description?: string;
  category: string;
  subcategory?: string;
  tags: string[];
  layout: TemplateLayout;
  content_i18n: Record<string, Record<string, string>>;
  supported_languages: string[];
  preview_image_url?: string;
  thumbnail_url?: string;
  is_active: boolean;
  is_premium: boolean;
  created_at: string;
  updated_at: string;
}

export interface VenueInfo {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  map_url?: string;
}

export interface RSVPSettings {
  enabled: boolean;
  deadline?: string;
  max_party_size: number;
  collect_dietary: boolean;
  collect_phone: boolean;
  custom_questions: Array<{
    question: string;
    type: 'text' | 'select' | 'checkbox';
    options?: string[];
    required: boolean;
  }>;
}

export interface Invitation {
  invitation_id: string;
  workspace_id: string;
  template_id?: string;
  customization: Record<string, unknown>;
  title: string;
  slug?: string;
  description?: string;
  event_type: EventType;
  event_datetime: string;
  event_end_datetime?: string;
  event_timezone: string;
  venue: VenueInfo;
  host_names: string[];
  host_contact_phone?: string;
  host_contact_email?: string;
  rsvp_settings: RSVPSettings;
  cover_image_url?: string;
  primary_language: string;
  secondary_language?: string;
  content_i18n: Record<string, Record<string, string>>;
  share_link_id?: string;
  public_url?: string;
  password_protected: boolean;
  pin_protected: boolean;
  status: InvitationStatus;
  published_at?: string;
  auto_delete_enabled: boolean;
  auto_delete_days: number;
  view_count: number;
  rsvp_count: number;
  created_at: string;
  updated_at: string;
  created_by_user_id: string;
}

export interface InvitationRSVP {
  rsvp_id: string;
  invitation_id: string;
  workspace_id: string;
  guest_id?: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  attending: boolean;
  party_size: number;
  party_names: string[];
  dietary_preferences?: string;
  message?: string;
  custom_answers: Record<string, string>;
  source: RSVPSource;
  status: RSVPStatus;
  created_at: string;
  updated_at: string;
}

export interface InvitationCheckin {
  checkin_id: string;
  invitation_id: string;
  workspace_id: string;
  rsvp_id?: string;
  guest_id?: string;
  guest_name: string;
  party_size_checked_in: number;
  verification_method: string;
  checked_in_by_user_id?: string;
  checked_in_at: string;
  notes?: string;
}

export interface InvitationStats {
  invitation_id: string;
  attending_count: number;
  not_attending_count: number;
  total_party_size: number;
  checked_in_count: number;
  total_checked_in: number;
  view_count: number;
}

// API Request/Response Types
export interface CreateInvitationRequest {
  template_id?: string;
  title: string;
  description?: string;
  event_type: EventType;
  event_datetime: string;
  event_end_datetime?: string;
  event_timezone?: string;
  venue?: Partial<VenueInfo>;
  host_names?: string[];
  rsvp_settings?: Partial<RSVPSettings>;
  primary_language?: string;
  secondary_language?: string;
}

export interface UpdateInvitationRequest {
  title?: string;
  description?: string;
  event_datetime?: string;
  event_end_datetime?: string;
  venue?: Partial<VenueInfo>;
  host_names?: string[];
  rsvp_settings?: Partial<RSVPSettings>;
  customization?: Record<string, unknown>;
  password_protected?: boolean;
  password?: string;
  auto_delete_enabled?: boolean;
  auto_delete_days?: number;
}

export interface SubmitRSVPRequest {
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  attending: boolean;
  party_size?: number;
  party_names?: string[];
  dietary_preferences?: string;
  message?: string;
  custom_answers?: Record<string, string>;
}

export interface RSVPListResponse {
  rsvps: InvitationRSVP[];
  stats: {
    total: number;
    attending: number;
    not_attending: number;
    pending: number;
    total_party_size: number;
  };
  pagination: {
    page: number;
    limit: number;
    total_pages: number;
    total_items: number;
  };
}
```

---

## Migration Script

```sql
-- Migration: 0045_invitations.sql
-- Description: Create invitation system tables
-- Date: 2025-12-30

BEGIN;

-- 1. Create invitation_templates table
CREATE TABLE invitation_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    subcategory VARCHAR(50),
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    layout JSONB NOT NULL DEFAULT '{}'::JSONB,
    content_i18n JSONB DEFAULT '{}'::JSONB,
    supported_languages TEXT[] DEFAULT ARRAY['en-IN'],
    preview_image_url TEXT,
    thumbnail_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id UUID REFERENCES users(user_id),
    CONSTRAINT invitation_templates_slug_workspace_unique
        UNIQUE NULLS NOT DISTINCT (workspace_id, slug)
);

-- 2. Add invitation to share_link_target_type enum
ALTER TYPE share_link_target_type ADD VALUE IF NOT EXISTS 'invitation';

-- 3. Create invitations table
CREATE TABLE invitations (
    invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    template_id UUID REFERENCES invitation_templates(template_id) ON DELETE SET NULL,
    customization JSONB DEFAULT '{}'::JSONB,
    title VARCHAR(300) NOT NULL,
    slug VARCHAR(300),
    description TEXT,
    event_type VARCHAR(50) NOT NULL DEFAULT 'wedding',
    event_datetime TIMESTAMPTZ NOT NULL,
    event_end_datetime TIMESTAMPTZ,
    event_timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    venue_name VARCHAR(300),
    venue_address TEXT,
    venue_city VARCHAR(100),
    venue_state VARCHAR(100),
    venue_country VARCHAR(100) DEFAULT 'India',
    venue_postal_code VARCHAR(20),
    venue_latitude DECIMAL(10, 8),
    venue_longitude DECIMAL(11, 8),
    venue_map_url TEXT,
    host_names TEXT[],
    host_contact_phone VARCHAR(20),
    host_contact_email VARCHAR(255),
    rsvp_enabled BOOLEAN DEFAULT true,
    rsvp_deadline TIMESTAMPTZ,
    rsvp_max_party_size INTEGER DEFAULT 10,
    rsvp_collect_dietary BOOLEAN DEFAULT false,
    rsvp_collect_phone BOOLEAN DEFAULT false,
    rsvp_custom_questions JSONB DEFAULT '[]'::JSONB,
    cover_image_url TEXT,
    cover_image_object_key TEXT,
    primary_language VARCHAR(10) DEFAULT 'en-IN',
    secondary_language VARCHAR(10),
    content_i18n JSONB DEFAULT '{}'::JSONB,
    share_link_id UUID REFERENCES share_links(link_id) ON DELETE SET NULL,
    public_url TEXT,
    password_protected BOOLEAN DEFAULT false,
    password_hash VARCHAR(255),
    pin_protected BOOLEAN DEFAULT false,
    pin_hash VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    auto_delete_enabled BOOLEAN DEFAULT true,
    auto_delete_days INTEGER DEFAULT 7,
    scheduled_deletion_at TIMESTAMPTZ,
    view_count INTEGER DEFAULT 0,
    unique_view_count INTEGER DEFAULT 0,
    rsvp_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id UUID NOT NULL REFERENCES users(user_id),
    CONSTRAINT invitations_slug_workspace_unique UNIQUE (workspace_id, slug)
);

-- 4. Create invitation_images table
CREATE TABLE invitation_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    width INTEGER,
    height INTEGER,
    position INTEGER DEFAULT 0,
    purpose VARCHAR(50) DEFAULT 'gallery',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by_user_id UUID REFERENCES users(user_id)
);

-- 5. Create invitation_guests table
CREATE TABLE invitation_guests (
    guest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    salutation VARCHAR(50),
    group_name VARCHAR(100),
    personalized_message TEXT,
    expected_party_size INTEGER DEFAULT 1,
    personal_token VARCHAR(64) UNIQUE,
    invitation_sent BOOLEAN DEFAULT false,
    invitation_sent_at TIMESTAMPTZ,
    invitation_viewed BOOLEAN DEFAULT false,
    invitation_viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT invitation_guests_email_unique UNIQUE (invitation_id, email)
);

-- 6. Create invitation_rsvps table
CREATE TABLE invitation_rsvps (
    rsvp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    guest_id UUID REFERENCES invitation_guests(guest_id) ON DELETE SET NULL,
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_phone VARCHAR(20),
    attending BOOLEAN NOT NULL,
    party_size INTEGER DEFAULT 1,
    party_names TEXT[],
    dietary_preferences TEXT,
    message TEXT,
    custom_answers JSONB DEFAULT '{}'::JSONB,
    edit_token_hash VARCHAR(64),
    token_expires_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    source VARCHAR(50) DEFAULT 'web',
    status VARCHAR(20) DEFAULT 'confirmed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT invitation_rsvps_email_unique UNIQUE (invitation_id, guest_email)
);

-- 7. Create invitation_checkins table
CREATE TABLE invitation_checkins (
    checkin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    rsvp_id UUID REFERENCES invitation_rsvps(rsvp_id) ON DELETE SET NULL,
    guest_id UUID REFERENCES invitation_guests(guest_id) ON DELETE SET NULL,
    guest_name VARCHAR(200) NOT NULL,
    party_size_checked_in INTEGER DEFAULT 1,
    verification_method VARCHAR(50) DEFAULT 'qr_scan',
    qr_token_used VARCHAR(255),
    checked_in_by_user_id UUID REFERENCES users(user_id),
    checked_in_at TIMESTAMPTZ DEFAULT NOW(),
    checkin_latitude DECIMAL(10, 8),
    checkin_longitude DECIMAL(11, 8),
    notes TEXT
);

-- 8. Create invitation_events audit table
CREATE TABLE invitation_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    actor_type VARCHAR(20) NOT NULL,
    actor_user_id UUID REFERENCES users(user_id),
    actor_guest_email VARCHAR(255),
    actor_ip_address INET,
    event_data JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Create indexes
CREATE INDEX idx_invitation_templates_workspace ON invitation_templates(workspace_id);
CREATE INDEX idx_invitation_templates_category ON invitation_templates(category);
CREATE INDEX idx_invitation_templates_active ON invitation_templates(is_active) WHERE is_active = true;

CREATE INDEX idx_invitations_workspace ON invitations(workspace_id);
CREATE INDEX idx_invitations_workspace_status ON invitations(workspace_id, status);
CREATE INDEX idx_invitations_slug ON invitations(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_invitations_event_datetime ON invitations(event_datetime);
CREATE INDEX idx_invitations_scheduled_deletion ON invitations(scheduled_deletion_at)
    WHERE auto_delete_enabled = true AND status != 'deleted';
CREATE INDEX idx_invitations_share_link ON invitations(share_link_id);
CREATE INDEX idx_invitations_created_by ON invitations(created_by_user_id);

CREATE INDEX idx_invitation_images_invitation ON invitation_images(invitation_id);
CREATE INDEX idx_invitation_images_workspace ON invitation_images(workspace_id);

CREATE INDEX idx_invitation_guests_invitation ON invitation_guests(invitation_id);
CREATE INDEX idx_invitation_guests_workspace ON invitation_guests(workspace_id);
CREATE INDEX idx_invitation_guests_personal_token ON invitation_guests(personal_token);

CREATE INDEX idx_invitation_rsvps_invitation ON invitation_rsvps(invitation_id);
CREATE INDEX idx_invitation_rsvps_workspace ON invitation_rsvps(workspace_id);
CREATE INDEX idx_invitation_rsvps_email ON invitation_rsvps(guest_email);
CREATE INDEX idx_invitation_rsvps_attending ON invitation_rsvps(invitation_id, attending);

CREATE INDEX idx_invitation_checkins_invitation ON invitation_checkins(invitation_id);
CREATE INDEX idx_invitation_checkins_workspace ON invitation_checkins(workspace_id);
CREATE INDEX idx_invitation_checkins_rsvp ON invitation_checkins(rsvp_id);

CREATE INDEX idx_invitation_events_invitation ON invitation_events(invitation_id);
CREATE INDEX idx_invitation_events_workspace ON invitation_events(workspace_id);
CREATE INDEX idx_invitation_events_type ON invitation_events(invitation_id, event_type);

-- 10. Create materialized view for stats
CREATE MATERIALIZED VIEW invitation_stats AS
SELECT
    i.invitation_id,
    i.workspace_id,
    i.title,
    i.event_datetime,
    i.status,
    i.view_count,
    COUNT(r.rsvp_id) FILTER (WHERE r.attending = true) AS attending_count,
    COUNT(r.rsvp_id) FILTER (WHERE r.attending = false) AS not_attending_count,
    COALESCE(SUM(r.party_size) FILTER (WHERE r.attending = true), 0) AS total_party_size,
    COUNT(c.checkin_id) AS checked_in_count,
    COALESCE(SUM(c.party_size_checked_in), 0) AS total_checked_in
FROM invitations i
LEFT JOIN invitation_rsvps r ON i.invitation_id = r.invitation_id
LEFT JOIN invitation_checkins c ON i.invitation_id = c.invitation_id
GROUP BY i.invitation_id;

CREATE INDEX idx_invitation_stats_workspace ON invitation_stats(workspace_id);
CREATE UNIQUE INDEX idx_invitation_stats_invitation ON invitation_stats(invitation_id);

-- 11. Create refresh function
CREATE OR REPLACE FUNCTION refresh_invitation_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY invitation_stats;
END;
$$ LANGUAGE plpgsql;

COMMIT;
```

---

## References

- [Spec: 016-save-the-date/spec.md](./spec.md)
- [Research: 016-save-the-date/research.md](./research.md)
- [Technical Spec: share_links_access.json](../../docs/TechnicalSpecs/share_links_access.json)
