# Data Model: Gallery Feature Completion

**Feature Branch**: `027-gallery-feature-completion`
**Created**: 2026-01-10

## Entity Relationship Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    galleries    │────<│   sub_galleries  │────<│   sub_galleries │
│                 │     │ (with parent_id) │     │  (nested child) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │
        │                        │
        ▼                        ▼
┌─────────────────┐     ┌──────────────────┐
│ gallery_assets  │     │  magic_links     │
│ (access_code)   │     │  (utm_params)    │
└─────────────────┘     └──────────────────┘
        │
        │
        ▼
┌─────────────────┐
│ download_quota  │
│   (Redis key)   │
└─────────────────┘
```

---

## Entity Definitions

### 1. galleries (Extended)

**Existing table - add fields:**

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `daily_download_limit` | INTEGER | Max downloads per client per day (null = unlimited) | NULL |
| `slideshow_audio_url` | VARCHAR(512) | R2 URL for background music | NULL |

**Migration SQL:**
```sql
ALTER TABLE galleries
ADD COLUMN daily_download_limit INTEGER DEFAULT NULL,
ADD COLUMN slideshow_audio_url VARCHAR(512) DEFAULT NULL;

COMMENT ON COLUMN galleries.daily_download_limit IS 'Max downloads per client per day. NULL = unlimited. Values: 5, 10, 25, 50, 100';
COMMENT ON COLUMN galleries.slideshow_audio_url IS 'Cloudflare R2 URL for slideshow background music. Max 10MB.';
```

---

### 2. sub_galleries (Extended)

**Existing table - add fields for nesting:**

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `parent_sub_gallery_id` | UUID | FK to parent sub_gallery (null = root level) | NULL |
| `depth` | INTEGER | Nesting level (0=root, 1=child, 2=grandchild) | 0 |

**Constraints:**
- `parent_sub_gallery_id` must reference same `gallery_id`
- `depth` must be <= 2 (max 3 levels total)
- Prevent circular references via trigger

**Migration SQL:**
```sql
ALTER TABLE sub_galleries
ADD COLUMN parent_sub_gallery_id UUID REFERENCES sub_galleries(sub_gallery_id) ON DELETE CASCADE,
ADD COLUMN depth INTEGER DEFAULT 0 NOT NULL;

-- Constraint: max 3 levels (depth 0, 1, 2)
ALTER TABLE sub_galleries
ADD CONSTRAINT max_nesting_depth CHECK (depth >= 0 AND depth <= 2);

-- Index for hierarchy queries
CREATE INDEX idx_sub_galleries_parent ON sub_galleries(parent_sub_gallery_id);
CREATE INDEX idx_sub_galleries_depth ON sub_galleries(gallery_id, depth);
```

**Validation Trigger:**
```sql
CREATE OR REPLACE FUNCTION validate_sub_gallery_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure parent belongs to same gallery
    IF NEW.parent_sub_gallery_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM sub_galleries
            WHERE sub_gallery_id = NEW.parent_sub_gallery_id
            AND gallery_id = NEW.gallery_id
        ) THEN
            RAISE EXCEPTION 'Parent sub-gallery must belong to same gallery';
        END IF;

        -- Set depth based on parent
        SELECT depth + 1 INTO NEW.depth
        FROM sub_galleries
        WHERE sub_gallery_id = NEW.parent_sub_gallery_id;

        IF NEW.depth > 2 THEN
            RAISE EXCEPTION 'Maximum nesting depth (3 levels) exceeded';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_sub_gallery_hierarchy
BEFORE INSERT OR UPDATE ON sub_galleries
FOR EACH ROW EXECUTE FUNCTION validate_sub_gallery_hierarchy();
```

---

### 3. gallery_assets (Extended)

**Existing table - leverage existing field:**

| Field | Type | Description | Notes |
|-------|------|-------------|-------|
| `access_code_hash` | VARCHAR(255) | bcrypt hash of access code | **Already exists** (migration 0002) |

**New behavior:**
- If `access_code_hash` is set, photo requires code to view
- Code verified via `bcrypt.verify(submitted, stored_hash)`
- Lockout tracked in Redis (5 min after 3 failures)

---

### 4. magic_links (Extended)

**Existing table - add UTM tracking:**

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `utm_params` | JSONB | UTM tracking parameters | NULL |

**JSONB Schema:**
```json
{
  "utm_source": "string | null",
  "utm_medium": "string | null",
  "utm_campaign": "string | null",
  "utm_content": "string | null",
  "utm_term": "string | null"
}
```

**Migration SQL:**
```sql
ALTER TABLE magic_links
ADD COLUMN utm_params JSONB DEFAULT NULL;

COMMENT ON COLUMN magic_links.utm_params IS 'UTM tracking parameters for analytics attribution';

-- Index for analytics queries
CREATE INDEX idx_magic_links_utm_source ON magic_links((utm_params->>'utm_source'));
```

---

### 5. gallery_password_resets (New Table)

**Purpose:** Track password reset tokens for gallery access recovery

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `reset_id` | UUID | Primary key | PK, DEFAULT gen_random_uuid() |
| `gallery_id` | UUID | Target gallery | FK galleries, NOT NULL |
| `email` | VARCHAR(255) | Requester email | NOT NULL |
| `token_hash` | VARCHAR(255) | bcrypt hash of reset token | NOT NULL |
| `expires_at` | TIMESTAMP WITH TIME ZONE | Expiry time (1 hour) | NOT NULL |
| `used_at` | TIMESTAMP WITH TIME ZONE | When token was used | NULL |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp | DEFAULT now() |

**Migration SQL:**
```sql
CREATE TABLE gallery_password_resets (
    reset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for token lookup
CREATE INDEX idx_gallery_password_resets_gallery ON gallery_password_resets(gallery_id);
CREATE INDEX idx_gallery_password_resets_expires ON gallery_password_resets(expires_at) WHERE used_at IS NULL;

-- Cleanup job: delete expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_password_resets()
RETURNS void AS $$
BEGIN
    DELETE FROM gallery_password_resets
    WHERE expires_at < now() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;
```

---

## Redis Data Structures

### Download Quota Tracking

**Key Pattern:** `download_quota:{gallery_id}:{client_identifier}:{date_utc}`

| Field | Type | Description |
|-------|------|-------------|
| Key | String | Composite key with gallery, client, date |
| Value | Integer | Download count for the day |
| TTL | Integer | Seconds until midnight UTC |

**Example:**
```
Key: download_quota:gallery-uuid:client-abc123:2026-01-10
Value: 7
TTL: 43200 (12 hours until midnight)
```

**Operations:**
- `INCR` on each download
- `GET` to check current count
- Automatic expiry at midnight UTC

---

### Access Code Lockout

**Key Pattern:** `access_code_lockout:{gallery_id}:{asset_id}:{client_identifier}`

| Field | Type | Description |
|-------|------|-------------|
| Key | String | Composite key |
| Value | Integer | Failed attempt count |
| TTL | Integer | 300 (5 minutes) |

**Example:**
```
Key: access_code_lockout:gallery-uuid:asset-uuid:client-abc123
Value: 3
TTL: 300
```

**Logic:**
- Increment on failed verification
- Block if value >= 3
- TTL auto-clears after 5 minutes

---

## State Transitions

### Access Code Verification States

```
┌─────────────┐
│   LOCKED    │ (access_code_hash is set)
└──────┬──────┘
       │
       ▼ submit code
┌─────────────┐     incorrect (< 3 attempts)     ┌─────────────┐
│  VERIFYING  │ ─────────────────────────────────>│   LOCKED    │
└──────┬──────┘                                   └─────────────┘
       │                                                  │
       │ correct                                          │ incorrect (3+ attempts)
       ▼                                                  ▼
┌─────────────┐                                   ┌─────────────┐
│  UNLOCKED   │                                   │   BLOCKED   │
│ (session)   │                                   │  (5 min)    │
└─────────────┘                                   └─────────────┘
```

### Password Reset Flow States

```
┌─────────────┐
│  REQUESTED  │ (email submitted)
└──────┬──────┘
       │
       ▼ token generated
┌─────────────┐
│   PENDING   │ (email sent, awaiting click)
└──────┬──────┘
       │
       │ link clicked           │ expired (1 hour)
       ▼                        ▼
┌─────────────┐         ┌─────────────┐
│    USED     │         │   EXPIRED   │
│ (used_at)   │         │ (cleanup)   │
└─────────────┘         └─────────────┘
```

---

## Indexes Summary

| Table | Index Name | Columns | Purpose |
|-------|------------|---------|---------|
| sub_galleries | idx_sub_galleries_parent | parent_sub_gallery_id | Hierarchy queries |
| sub_galleries | idx_sub_galleries_depth | gallery_id, depth | Level filtering |
| magic_links | idx_magic_links_utm_source | utm_params->>'utm_source' | Analytics |
| gallery_password_resets | idx_gallery_password_resets_gallery | gallery_id | Lookup by gallery |
| gallery_password_resets | idx_gallery_password_resets_expires | expires_at (partial) | Cleanup job |

---

## Migration File

**Filename:** `0162_gallery_feature_completion.py`

**Contents:**
1. Add `daily_download_limit` to galleries
2. Add `slideshow_audio_url` to galleries
3. Add `parent_sub_gallery_id` and `depth` to sub_galleries
4. Add nesting constraint and validation trigger
5. Add `utm_params` to magic_links
6. Create `gallery_password_resets` table
7. Add indexes
