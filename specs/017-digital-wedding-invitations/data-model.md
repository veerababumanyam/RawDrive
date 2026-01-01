# Data Model: Digital Invitations Enhancement

**Feature Branch**: `017-digital-wedding-invitations`
**Date**: 2026-01-01
**Extends**: Feature 016-save-the-date

---

## Overview

This document defines the **data model extensions** for the Digital Invitations enhancement. It builds on the existing schema (migrations 0059-0066) and adds support for:

- Video and audio media types
- Multi-event (sub-event) support
- AI generation logging
- Enhanced analytics
- Image generation settings

---

## Existing Tables (Reference Only)

These tables already exist and are **not modified** by this feature:

| Table | Purpose |
|-------|---------|
| `invitation_templates` | Predefined design templates |
| `digital_invitations` | Core invitation entity |
| `invitation_images` | Photo attachments |
| `invitation_guests` | Guest list management |
| `invitation_rsvps` | RSVP responses |
| `invitation_checkins` | Event check-in records |
| `invitation_events` | Audit log |
| `invitation_stats` | Materialized view for analytics |

---

## New Tables

### 1. `invitation_sub_events`

Supports multi-event invitations (e.g., Mehndi + Ceremony + Reception for weddings, or multi-day corporate conferences).

```sql
CREATE TABLE invitation_sub_events (
    -- Primary key
    sub_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys (multi-tenant)
    invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Event details
    name VARCHAR(200) NOT NULL,
    event_type VARCHAR(50), -- optional sub-event type
    event_datetime TIMESTAMPTZ NOT NULL,
    event_end_datetime TIMESTAMPTZ,
    event_timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    description TEXT,

    -- Venue (can differ from main invitation)
    venue_name VARCHAR(300),
    venue_address TEXT,
    venue_city VARCHAR(100),
    venue_map_url TEXT,

    -- Display
    display_order INTEGER DEFAULT 0,
    show_countdown BOOLEAN DEFAULT TRUE,

    -- RSVP per event (optional)
    enable_individual_rsvp BOOLEAN DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_invitation_sub_events_invitation ON invitation_sub_events(invitation_id);
CREATE INDEX idx_invitation_sub_events_workspace ON invitation_sub_events(workspace_id);
CREATE INDEX idx_invitation_sub_events_datetime ON invitation_sub_events(event_datetime);
```

**Relationships**:
- Many sub_events → One invitation
- Each sub_event can have individual RSVP tracking (future)

---

### 2. `invitation_media`

Extends existing `invitation_images` to support video and audio. Uses a unified media table instead of multiple type-specific tables.

```sql
CREATE TABLE invitation_media (
    -- Primary key
    media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys (multi-tenant)
    invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Media identity
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('video', 'audio')),
    purpose VARCHAR(50) DEFAULT 'content',

    -- Storage
    original_object_key TEXT NOT NULL,
    original_url TEXT,
    original_filename VARCHAR(255),
    original_mime_type VARCHAR(100),
    original_size_bytes BIGINT,

    -- Transcoded variants (for video/audio)
    variants JSONB DEFAULT '[]'::JSONB,
    -- Example: [{"format": "mp4", "resolution": "720p", "object_key": "...", "url": "..."}]

    -- Thumbnail (for video)
    thumbnail_object_key TEXT,
    thumbnail_url TEXT,

    -- Metadata
    duration_seconds DECIMAL(10, 2),
    width INTEGER,
    height INTEGER,

    -- Processing status
    processing_status VARCHAR(20) DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    processing_error TEXT,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,

    -- Display
    position INTEGER DEFAULT 0,
    autoplay BOOLEAN DEFAULT TRUE,
    loop BOOLEAN DEFAULT FALSE,
    muted BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id UUID REFERENCES users(user_id)
);

-- Indexes
CREATE INDEX idx_invitation_media_invitation ON invitation_media(invitation_id);
CREATE INDEX idx_invitation_media_workspace ON invitation_media(workspace_id);
CREATE INDEX idx_invitation_media_type ON invitation_media(invitation_id, media_type);
CREATE INDEX idx_invitation_media_processing ON invitation_media(processing_status)
    WHERE processing_status IN ('pending', 'processing');
```

**Relationships**:
- Many media → One invitation
- Gallery assets can be referenced via `original_object_key` matching asset storage pattern

---

### 3. `image_generation_settings`

Stores user-specific API keys for image generation services (Imagen, Nano Banana, DALL-E).

```sql
CREATE TABLE image_generation_settings (
    -- Primary key
    setting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Provider config
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('imagen', 'nano_banana', 'dalle', 'midjourney')),
    api_key_encrypted TEXT NOT NULL,
    api_key_iv TEXT NOT NULL,

    -- Validation
    is_validated BOOLEAN DEFAULT FALSE,
    validated_at TIMESTAMPTZ,

    -- Status
    is_enabled BOOLEAN DEFAULT TRUE,

    -- Usage tracking
    credits_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT image_gen_settings_user_provider_unique UNIQUE (user_id, provider)
);

-- Indexes
CREATE INDEX idx_image_gen_settings_user ON image_generation_settings(user_id);
CREATE INDEX idx_image_gen_settings_provider ON image_generation_settings(provider);
```

**Security**:
- API keys encrypted with AES-256-GCM (same pattern as `user_gemini_settings`)
- Never exposed in API responses
- Validated on save

---

### 4. `invitation_ai_generations`

Audit log for AI-generated content (text and images).

```sql
CREATE TABLE invitation_ai_generations (
    -- Primary key
    generation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),

    -- Generation type
    generation_type VARCHAR(20) NOT NULL CHECK (generation_type IN ('text', 'image')),

    -- Request
    prompt TEXT NOT NULL,
    field_target VARCHAR(100), -- 'headline', 'bio', 'rsvp_text', 'background'
    language VARCHAR(10),
    provider VARCHAR(50), -- 'gemini', 'imagen', 'nano_banana'
    model VARCHAR(100),

    -- Response
    generated_options JSONB, -- Array of generated options
    selected_option_index INTEGER,
    was_used BOOLEAN DEFAULT FALSE,

    -- Performance
    latency_ms INTEGER,
    tokens_used INTEGER,
    cost_estimate DECIMAL(10, 6),

    -- Status
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'timeout')),
    error_message TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_invitation_ai_gen_invitation ON invitation_ai_generations(invitation_id);
CREATE INDEX idx_invitation_ai_gen_workspace ON invitation_ai_generations(workspace_id);
CREATE INDEX idx_invitation_ai_gen_user ON invitation_ai_generations(user_id);
CREATE INDEX idx_invitation_ai_gen_type ON invitation_ai_generations(generation_type, status);
CREATE INDEX idx_invitation_ai_gen_time ON invitation_ai_generations(created_at DESC);
```

**Purpose**:
- Transparency: Track AI usage for billing and compliance
- Analytics: Monitor AI feature adoption
- Debugging: Troubleshoot generation issues

---

### 5. `invitation_view_analytics`

Detailed view tracking for enhanced analytics (device, geo, referrer).

```sql
CREATE TABLE invitation_view_analytics (
    -- Primary key
    view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Visitor identification (hashed for privacy)
    visitor_hash VARCHAR(64), -- SHA256 of IP + User-Agent
    session_id VARCHAR(64),

    -- Device info
    device_type VARCHAR(20) CHECK (device_type IN ('phone', 'tablet', 'desktop', 'unknown')),
    browser VARCHAR(50),
    os VARCHAR(50),

    -- Geographic (from IP geolocation)
    country_code CHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),

    -- Referrer
    referrer_domain VARCHAR(255),
    referrer_type VARCHAR(20) CHECK (referrer_type IN ('direct', 'social', 'search', 'email', 'other')),

    -- Engagement
    duration_seconds INTEGER,
    scrolled_to_rsvp BOOLEAN DEFAULT FALSE,
    interacted_with_media BOOLEAN DEFAULT FALSE,

    -- Timestamp
    viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_invitation_views_invitation ON invitation_view_analytics(invitation_id);
CREATE INDEX idx_invitation_views_workspace ON invitation_view_analytics(workspace_id);
CREATE INDEX idx_invitation_views_time ON invitation_view_analytics(viewed_at DESC);
CREATE INDEX idx_invitation_views_device ON invitation_view_analytics(invitation_id, device_type);
CREATE INDEX idx_invitation_views_geo ON invitation_view_analytics(invitation_id, country_code);

-- Partitioning by month for performance (optional, at scale)
-- CREATE TABLE invitation_view_analytics_2026_01 PARTITION OF invitation_view_analytics
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

**Privacy**:
- IP addresses are hashed, not stored raw
- PII-free by design
- Supports data retention policies

---

## Schema Changes to Existing Tables

### `digital_invitations` (Additions)

```sql
ALTER TABLE digital_invitations
    ADD COLUMN IF NOT EXISTS video_object_key TEXT,
    ADD COLUMN IF NOT EXISTS audio_object_key TEXT,
    ADD COLUMN IF NOT EXISTS has_sub_events BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS layout_density VARCHAR(20) DEFAULT 'normal'
        CHECK (layout_density IN ('compact', 'normal', 'spacious')),
    ADD COLUMN IF NOT EXISTS font_heading VARCHAR(100) DEFAULT 'Playfair Display',
    ADD COLUMN IF NOT EXISTS font_body VARCHAR(100) DEFAULT 'Lora',
    ADD COLUMN IF NOT EXISTS ai_generated_content JSONB DEFAULT '{}'::JSONB;
```

### `invitation_templates` (Additions)

```sql
ALTER TABLE invitation_templates
    ADD COLUMN IF NOT EXISTS gradient_config JSONB DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS animation_config JSONB DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
```

---

## Entity Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DIGITAL INVITATIONS SCHEMA                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐         ┌──────────────────────┐                  │
│  │ invitation_      │ 1    N  │ invitation_sub_      │                  │
│  │ templates        │─────────│ events               │                  │
│  └────────┬─────────┘         └──────────────────────┘                  │
│           │ 1                                                            │
│           │                                                              │
│           ▼ N                                                            │
│  ┌──────────────────┐                                                    │
│  │ digital_         │                                                    │
│  │ invitations      │                                                    │
│  └────────┬─────────┘                                                    │
│           │ 1                                                            │
│    ┌──────┼──────┬──────────┬──────────┬──────────────┐                 │
│    │      │      │          │          │              │                 │
│    ▼ N    ▼ N    ▼ N        ▼ N        ▼ N            ▼ N               │
│  ┌──────┐┌──────┐┌────────┐┌────────┐┌───────────┐┌───────────────┐     │
│  │images││media ││guests  ││rsvps   ││ai_gens    ││view_analytics │     │
│  └──────┘└──────┘└────────┘└────────┘└───────────┘└───────────────┘     │
│                      │          │                                        │
│                      │          ▼ N                                      │
│                      │     ┌──────────┐                                  │
│                      └─────│ checkins │                                  │
│                            └──────────┘                                  │
│                                                                          │
│  ┌──────────────────┐                                                    │
│  │ users            │ 1    N  ┌──────────────────────┐                  │
│  │                  │─────────│ image_generation_    │                  │
│  │                  │         │ settings             │                  │
│  └──────────────────┘         └──────────────────────┘                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Validation Rules

### `invitation_sub_events`

| Field | Validation |
|-------|------------|
| name | 1-200 characters, no HTML |
| event_datetime | Required, must be future for new events |
| display_order | 0-99 |

### `invitation_media`

| Field | Validation |
|-------|------------|
| media_type | Enum: 'video', 'audio' |
| original_size_bytes | Max 100MB for video, 10MB for audio |
| duration_seconds | Max 90s for video, 180s for audio |
| original_mime_type | video/mp4, video/quicktime, video/webm, audio/mpeg, audio/wav |

### `image_generation_settings`

| Field | Validation |
|-------|------------|
| provider | Enum: 'imagen', 'nano_banana', 'dalle', 'midjourney' |
| api_key_encrypted | Non-empty when enabled |
| is_validated | Must pass API ping test before use |

---

## State Machines

### Media Processing Status

```
pending ──▶ processing ──▶ completed
              │
              ▼
           failed
```

### AI Generation Status

```
pending ──▶ completed
     │
     ├──▶ failed
     │
     └──▶ timeout
```

---

## Migration Order

1. `0067_invitation_sub_events.py` - Multi-event support
2. `0068_invitation_media.py` - Video/audio media
3. `0069_image_generation_settings.py` - AI image config
4. `0070_invitation_ai_generations.py` - AI audit log
5. `0071_invitation_view_analytics.py` - Enhanced analytics
6. `0072_invitation_schema_updates.py` - Alter existing tables

---

## Data Retention

| Table | Retention | Notes |
|-------|-----------|-------|
| `invitation_view_analytics` | 90 days | Aggregate then purge raw views |
| `invitation_ai_generations` | 1 year | Audit compliance |
| `invitation_media` | Follows invitation | Cascade delete |
| `invitation_sub_events` | Follows invitation | Cascade delete |

---

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| invitation_sub_events | invitation_id | List sub-events |
| invitation_sub_events | event_datetime | Sort/filter by date |
| invitation_media | processing_status | Worker queue queries |
| invitation_view_analytics | invitation_id, device_type | Device analytics |
| invitation_view_analytics | invitation_id, country_code | Geo analytics |
| invitation_ai_generations | user_id, created_at | Usage tracking |
