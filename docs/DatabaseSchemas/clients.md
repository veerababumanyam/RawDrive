# Client CRM Database Schema

Migration: `0012_client_crm_schema.py`

## Overview

The Client CRM module consists of 10 tables that provide comprehensive customer relationship management for photographers:

| Table | Purpose |
|-------|---------|
| `clients` | Core client profiles with identity, status, and portal access |
| `client_contacts` | Multiple contact methods (email, phone, social, website) |
| `client_addresses` | Physical addresses with location data |
| `client_tags` | Reusable workspace-scoped tags for categorization |
| `client_tag_assignments` | Many-to-many client-tag relationships |
| `client_gallery_links` | Client-gallery associations for proofing |
| `client_activities` | Complete activity timeline |
| `client_communications` | Communication history with follow-ups |
| `client_preferences` | Client-specific gallery/delivery preferences |
| `client_smart_lists` | Dynamic client segmentation |

## Entity Relationship Diagram

```
workspaces
    │
    ├──< clients ──< client_contacts
    │       │
    │       ├──< client_addresses
    │       │
    │       ├──< client_tag_assignments >── client_tags
    │       │
    │       ├──< client_gallery_links >── galleries
    │       │
    │       ├──< client_activities
    │       │
    │       ├──< client_communications
    │       │
    │       └──< client_preferences
    │
    └──< client_smart_lists
```

## Tables

### clients

Core client profile with identity, professional info, and system metadata.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| client_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| full_name | VARCHAR(255) | NO | | Complete name for formal communications |
| first_name | VARCHAR(100) | NO | | First name |
| last_name | VARCHAR(100) | YES | | Last name |
| nickname | VARCHAR(100) | YES | | Friendly display name |
| avatar_asset_id | UUID | YES | | References assets.asset_id |
| avatar_crop_data | JSONB | YES | | Crop coordinates {x, y, width, height, zoom, rotation} |
| job_title | VARCHAR(150) | YES | | Professional title |
| organization | VARCHAR(255) | YES | | Company or organization name |
| status | VARCHAR(20) | NO | 'active' | CHECK: 'active', 'inactive' |
| language | VARCHAR(10) | YES | | ISO language code |
| timezone | VARCHAR(50) | YES | | IANA timezone |
| date_of_birth | DATE | YES | | Client's birthday |
| anniversary_date | DATE | YES | | Wedding/important anniversary |
| internal_notes | TEXT | YES | | Private notes for workspace members |
| referred_by_client_id | UUID | YES | | Self-reference for referral tracking |
| portal_access_enabled | BOOLEAN | NO | FALSE | Whether client can log into portal |
| portal_user_id | UUID | YES | | References users.user_id |
| created_by_user_id | UUID | NO | | User who created the record |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | YES | NOW() | Last update timestamp |

**Indexes:**
- `idx_clients_workspace` - workspace_id
- `idx_clients_workspace_status` - (workspace_id, status)
- `idx_clients_workspace_full_name` - (workspace_id, full_name)
- `idx_clients_workspace_created` - (workspace_id, created_at DESC)
- `idx_clients_referred_by` - referred_by_client_id WHERE NOT NULL
- `idx_clients_portal_user` - portal_user_id WHERE NOT NULL
- `idx_clients_full_name_search` - GIN index for full-text search

### client_contacts

Multiple contact methods per client (email, phone, website, social media).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| contact_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| client_id | UUID | NO | | References clients.client_id |
| contact_type | VARCHAR(20) | NO | | CHECK: 'email', 'phone', 'website', 'social' |
| contact_subtype | VARCHAR(50) | YES | | e.g., 'work', 'personal', 'instagram', 'whatsapp' |
| value | VARCHAR(500) | NO | | Contact value (email, phone, URL, handle) |
| is_primary | BOOLEAN | NO | FALSE | Primary contact flag |
| verified | BOOLEAN | NO | FALSE | Verification status |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |

**Constraints:**
- UNIQUE(workspace_id, client_id, contact_type, contact_subtype, value)

**Indexes:**
- `idx_client_contacts_workspace_client` - (workspace_id, client_id)
- `idx_client_contacts_type_value` - (workspace_id, contact_type, value)
- `idx_client_contacts_primary` - (workspace_id, client_id, is_primary) WHERE is_primary = TRUE

### client_addresses

Physical addresses for clients (home, work, billing, shipping).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| address_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| client_id | UUID | NO | | References clients.client_id |
| address_type | VARCHAR(20) | NO | 'home' | CHECK: 'home', 'work', 'billing', 'shipping' |
| address_line1 | VARCHAR(255) | YES | | Street address line 1 |
| address_line2 | VARCHAR(255) | YES | | Street address line 2 |
| city | VARCHAR(100) | YES | | City |
| state | VARCHAR(100) | YES | | State/Province |
| country | VARCHAR(100) | YES | | ISO country code |
| postal_code | VARCHAR(20) | YES | | Postal/ZIP code |
| is_primary | BOOLEAN | NO | FALSE | Primary address flag |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |

**Indexes:**
- `idx_client_addresses_workspace_client` - (workspace_id, client_id)
- `idx_client_addresses_primary` - (workspace_id, client_id, is_primary) WHERE is_primary = TRUE

### client_tags

Reusable tags for client categorization and filtering.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| tag_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| name | VARCHAR(50) | NO | | Tag name |
| color | VARCHAR(20) | YES | | Hex color code for UI |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |

**Constraints:**
- UNIQUE(workspace_id, name)

**Indexes:**
- `idx_client_tags_workspace` - workspace_id

### client_tag_assignments

Many-to-many relationship between clients and tags.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| assignment_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| client_id | UUID | NO | | References clients.client_id |
| tag_id | UUID | NO | | References client_tags.tag_id |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |

**Constraints:**
- UNIQUE(workspace_id, client_id, tag_id)

**Indexes:**
- `idx_client_tag_assignments_workspace_client` - (workspace_id, client_id)
- `idx_client_tag_assignments_workspace_tag` - (workspace_id, tag_id)

### client_gallery_links

Links clients to galleries for proofing workflows.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| link_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| client_id | UUID | NO | | References clients.client_id |
| gallery_id | UUID | NO | | References galleries.gallery_id |
| role | VARCHAR(20) | NO | 'primary' | CHECK: 'primary', 'secondary', 'guest' |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |

**Constraints:**
- UNIQUE(workspace_id, client_id, gallery_id)

**Indexes:**
- `idx_client_gallery_links_workspace_client` - (workspace_id, client_id)
- `idx_client_gallery_links_workspace_gallery` - (workspace_id, gallery_id)

### client_activities

Timeline of all client interactions and events.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| activity_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| client_id | UUID | NO | | References clients.client_id |
| activity_type | VARCHAR(50) | NO | | CHECK: see activity types below |
| related_entity_type | VARCHAR(30) | YES | | CHECK: 'gallery', 'asset', 'payment', 'communication' |
| related_entity_id | UUID | YES | | ID of related entity |
| description | TEXT | YES | | Human-readable description |
| metadata | JSONB | YES | | Additional activity-specific data |
| created_by_user_id | UUID | YES | | User who triggered (null for client actions) |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |

**Activity Types:**
- gallery_linked, gallery_viewed, selection_made
- favorite_added, comment_added, payment_received
- communication_sent, note_added, status_changed

**Indexes:**
- `idx_client_activities_workspace_client_time` - (workspace_id, client_id, created_at DESC)
- `idx_client_activities_workspace_type_time` - (workspace_id, activity_type, created_at DESC)

### client_communications

Log of all communications with clients.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| communication_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| client_id | UUID | NO | | References clients.client_id |
| communication_type | VARCHAR(20) | NO | | CHECK: 'email', 'phone', 'whatsapp', 'sms', 'in_person', 'other' |
| direction | VARCHAR(10) | NO | | CHECK: 'outbound', 'inbound' |
| subject | VARCHAR(255) | YES | | Communication subject |
| notes | TEXT | YES | | Communication notes |
| duration_minutes | INTEGER | YES | | For phone calls |
| follow_up_required | BOOLEAN | NO | FALSE | Whether follow-up is needed |
| follow_up_date | TIMESTAMPTZ | YES | | Scheduled follow-up date |
| created_by_user_id | UUID | NO | | User who logged the communication |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |

**Indexes:**
- `idx_client_communications_workspace_client_time` - (workspace_id, client_id, created_at DESC)
- `idx_client_communications_follow_up` - (workspace_id, follow_up_date) WHERE follow_up_required = TRUE

### client_preferences

Client preferences for gallery styles and deliverables.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| preference_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| client_id | UUID | NO | | References clients.client_id |
| gallery_style | VARCHAR(20) | YES | | CHECK: 'grid', 'masonry', 'slideshow' |
| file_format | VARCHAR(10) | YES | | CHECK: 'jpeg', 'png', 'tiff', 'raw' |
| resolution | VARCHAR(20) | YES | | CHECK: 'web', 'print', 'original' |
| watermark_preference | VARCHAR(20) | YES | | CHECK: 'none', 'subtle', 'prominent' |
| color_grading_notes | TEXT | YES | | Editing preferences |
| print_preferences | JSONB | YES | | Preferred sizes, finishes, quantities |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | YES | NOW() | Last update timestamp |

**Constraints:**
- UNIQUE(workspace_id, client_id)

### client_smart_lists

Dynamic client lists based on filter criteria.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| list_id | UUID | NO | gen_random_uuid() | Primary key |
| workspace_id | UUID | NO | | Tenant isolation key |
| name | VARCHAR(100) | NO | | List name |
| description | TEXT | YES | | List description |
| filter_criteria | JSONB | NO | | Filter rules |
| is_system | BOOLEAN | NO | FALSE | Pre-built vs user-created |
| created_by_user_id | UUID | NO | | User who created the list |
| created_at | TIMESTAMPTZ | YES | NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | YES | NOW() | Last update timestamp |

**Indexes:**
- `idx_client_smart_lists_workspace` - workspace_id
- `idx_client_smart_lists_filter` - GIN index on filter_criteria

## Multi-Tenant Isolation

**CRITICAL**: All queries MUST include `workspace_id` filtering.

```sql
-- CORRECT
SELECT * FROM clients WHERE workspace_id = $1 AND status = 'active';

-- WRONG - Security vulnerability
SELECT * FROM clients WHERE status = 'active';
```

## Foreign Key Relationships

- All tables reference `workspaces(workspace_id)` with CASCADE delete
- `clients` references `users(user_id)` for `created_by_user_id` and `portal_user_id`
- `client_gallery_links` references `galleries(gallery_id)` with CASCADE delete
- Self-referential: `clients.referred_by_client_id` references `clients(client_id)`

## Performance Targets

| Query | Target P95 |
|-------|------------|
| Client list (10,000 clients) | < 300ms |
| Client search | < 200ms |
| Client detail | < 250ms |
| Activity timeline (1000 activities) | < 200ms |
| Smart list evaluation | < 400ms |
