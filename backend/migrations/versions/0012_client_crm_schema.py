"""Add Client CRM schema with all related tables.

Creates the complete Client CRM module schema including:
- clients: Core client profiles
- client_contacts: Multiple contact methods (email, phone, social, website)
- client_addresses: Physical addresses with location data
- client_tags: Reusable workspace-scoped tags
- client_tag_assignments: Many-to-many client-tag relationship
- client_gallery_links: Client-gallery associations for proofing
- client_activities: Complete activity timeline
- client_communications: Communication history with follow-ups
- client_preferences: Client-specific gallery/delivery preferences
- client_smart_lists: Dynamic client segmentation

Revision ID: 0012
Revises: 0011
Create Date: 2025-12-20
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. CLIENTS TABLE - Core client profiles
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS clients (
            client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Identity fields
            full_name VARCHAR(255) NOT NULL,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100),
            nickname VARCHAR(100),

            -- Avatar
            avatar_asset_id UUID,
            avatar_crop_data JSONB,

            -- Professional info
            job_title VARCHAR(150),
            organization VARCHAR(255),

            -- Status and lifecycle
            status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

            -- Localization
            language VARCHAR(10),
            timezone VARCHAR(50),

            -- Important dates
            date_of_birth DATE,
            anniversary_date DATE,

            -- Notes and internal data
            internal_notes TEXT,

            -- Referral tracking
            referred_by_client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,

            -- Portal access
            portal_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            portal_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Audit fields
            created_by_user_id UUID NOT NULL REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Clients indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_clients_workspace ON clients(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clients_workspace_status ON clients(workspace_id, status);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clients_workspace_full_name ON clients(workspace_id, full_name);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clients_workspace_created ON clients(workspace_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clients_referred_by ON clients(referred_by_client_id) WHERE referred_by_client_id IS NOT NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clients_portal_user ON clients(portal_user_id) WHERE portal_user_id IS NOT NULL;")

    # Full-text search index on full_name for fast client search
    op.execute("CREATE INDEX IF NOT EXISTS idx_clients_full_name_search ON clients USING gin(to_tsvector('english', full_name));")

    # =========================================================================
    # 2. CLIENT_CONTACTS TABLE - Multiple contact methods per client
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_contacts (
            contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Contact type and subtype
            contact_type VARCHAR(20) NOT NULL CHECK (contact_type IN ('email', 'phone', 'website', 'social')),
            contact_subtype VARCHAR(50),

            -- Contact value
            value VARCHAR(500) NOT NULL,

            -- Primary flag (only one email and one phone can be primary per client)
            is_primary BOOLEAN NOT NULL DEFAULT FALSE,

            -- Verification status
            verified BOOLEAN NOT NULL DEFAULT FALSE,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),

            -- Unique constraint to prevent duplicate contact entries
            UNIQUE(workspace_id, client_id, contact_type, contact_subtype, value)
        );
        """
    )

    # Client contacts indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_contacts_workspace_client ON client_contacts(workspace_id, client_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_contacts_type_value ON client_contacts(workspace_id, contact_type, value);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_contacts_primary ON client_contacts(workspace_id, client_id, is_primary) WHERE is_primary = TRUE;")

    # =========================================================================
    # 3. CLIENT_ADDRESSES TABLE - Physical addresses
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_addresses (
            address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Address type
            address_type VARCHAR(20) NOT NULL DEFAULT 'home' CHECK (address_type IN ('home', 'work', 'billing', 'shipping')),

            -- Address fields
            address_line1 VARCHAR(255),
            address_line2 VARCHAR(255),
            city VARCHAR(100),
            state VARCHAR(100),
            country VARCHAR(100),
            postal_code VARCHAR(20),

            -- Primary flag
            is_primary BOOLEAN NOT NULL DEFAULT FALSE,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Client addresses indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_addresses_workspace_client ON client_addresses(workspace_id, client_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_addresses_primary ON client_addresses(workspace_id, client_id, is_primary) WHERE is_primary = TRUE;")

    # =========================================================================
    # 4. CLIENT_TAGS TABLE - Reusable tags for categorization
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_tags (
            tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Tag details
            name VARCHAR(50) NOT NULL,
            color VARCHAR(20),

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),

            -- Unique tag name per workspace
            UNIQUE(workspace_id, name)
        );
        """
    )

    # Client tags indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_tags_workspace ON client_tags(workspace_id);")

    # =========================================================================
    # 5. CLIENT_TAG_ASSIGNMENTS TABLE - Many-to-many client-tag relationship
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_tag_assignments (
            assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
            tag_id UUID NOT NULL REFERENCES client_tags(tag_id) ON DELETE CASCADE,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),

            -- Prevent duplicate assignments
            UNIQUE(workspace_id, client_id, tag_id)
        );
        """
    )

    # Client tag assignments indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_tag_assignments_workspace_client ON client_tag_assignments(workspace_id, client_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_tag_assignments_workspace_tag ON client_tag_assignments(workspace_id, tag_id);")

    # =========================================================================
    # 6. CLIENT_GALLERY_LINKS TABLE - Client-gallery associations
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_gallery_links (
            link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,

            -- Role in the gallery context
            role VARCHAR(20) NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'secondary', 'guest')),

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),

            -- One link per client-gallery pair
            UNIQUE(workspace_id, client_id, gallery_id)
        );
        """
    )

    # Client gallery links indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_gallery_links_workspace_client ON client_gallery_links(workspace_id, client_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_gallery_links_workspace_gallery ON client_gallery_links(workspace_id, gallery_id);")

    # =========================================================================
    # 7. CLIENT_ACTIVITIES TABLE - Complete activity timeline
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_activities (
            activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Activity type
            activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN (
                'gallery_linked', 'gallery_viewed', 'selection_made',
                'favorite_added', 'comment_added', 'payment_received',
                'communication_sent', 'note_added', 'status_changed'
            )),

            -- Related entity (optional)
            related_entity_type VARCHAR(30) CHECK (related_entity_type IN ('gallery', 'asset', 'payment', 'communication')),
            related_entity_id UUID,

            -- Activity description
            description TEXT,

            -- Additional metadata
            metadata JSONB,

            -- Who triggered this activity (null for client-initiated actions)
            created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Client activities indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_activities_workspace_client_time ON client_activities(workspace_id, client_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_activities_workspace_type_time ON client_activities(workspace_id, activity_type, created_at DESC);")

    # =========================================================================
    # 8. CLIENT_COMMUNICATIONS TABLE - Communication history
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_communications (
            communication_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Communication details
            communication_type VARCHAR(20) NOT NULL CHECK (communication_type IN (
                'email', 'phone', 'whatsapp', 'sms', 'in_person', 'other'
            )),
            direction VARCHAR(10) NOT NULL CHECK (direction IN ('outbound', 'inbound')),

            -- Content
            subject VARCHAR(255),
            notes TEXT,

            -- For phone calls
            duration_minutes INTEGER,

            -- Follow-up tracking
            follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
            follow_up_date TIMESTAMPTZ,

            -- Who logged this communication
            created_by_user_id UUID NOT NULL REFERENCES users(user_id),

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Client communications indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_communications_workspace_client_time ON client_communications(workspace_id, client_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_communications_follow_up ON client_communications(workspace_id, follow_up_date) WHERE follow_up_required = TRUE;")

    # =========================================================================
    # 9. CLIENT_PREFERENCES TABLE - Gallery and delivery preferences
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_preferences (
            preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,

            -- Gallery display preferences
            gallery_style VARCHAR(20) CHECK (gallery_style IN ('grid', 'masonry', 'slideshow')),

            -- Delivery preferences
            file_format VARCHAR(10) CHECK (file_format IN ('jpeg', 'png', 'tiff', 'raw')),
            resolution VARCHAR(20) CHECK (resolution IN ('web', 'print', 'original')),
            watermark_preference VARCHAR(20) CHECK (watermark_preference IN ('none', 'subtle', 'prominent')),

            -- Editing preferences
            color_grading_notes TEXT,

            -- Print preferences (stored as JSON for flexibility)
            print_preferences JSONB,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- One preferences record per client
            UNIQUE(workspace_id, client_id)
        );
        """
    )

    # Client preferences index (unique constraint already creates index)

    # =========================================================================
    # 10. CLIENT_SMART_LISTS TABLE - Dynamic client segmentation
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS client_smart_lists (
            list_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Smart list details
            name VARCHAR(100) NOT NULL,
            description TEXT,

            -- Filter criteria stored as JSONB for flexible querying
            filter_criteria JSONB NOT NULL,

            -- System vs user-created lists
            is_system BOOLEAN NOT NULL DEFAULT FALSE,

            -- Who created this list
            created_by_user_id UUID NOT NULL REFERENCES users(user_id),

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Client smart lists indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_smart_lists_workspace ON client_smart_lists(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_client_smart_lists_filter ON client_smart_lists USING gin(filter_criteria);")


def downgrade() -> None:
    # Drop indexes first
    op.execute("DROP INDEX IF EXISTS idx_client_smart_lists_filter;")
    op.execute("DROP INDEX IF EXISTS idx_client_smart_lists_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_client_communications_follow_up;")
    op.execute("DROP INDEX IF EXISTS idx_client_communications_workspace_client_time;")
    op.execute("DROP INDEX IF EXISTS idx_client_activities_workspace_type_time;")
    op.execute("DROP INDEX IF EXISTS idx_client_activities_workspace_client_time;")
    op.execute("DROP INDEX IF EXISTS idx_client_gallery_links_workspace_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_client_gallery_links_workspace_client;")
    op.execute("DROP INDEX IF EXISTS idx_client_tag_assignments_workspace_tag;")
    op.execute("DROP INDEX IF EXISTS idx_client_tag_assignments_workspace_client;")
    op.execute("DROP INDEX IF EXISTS idx_client_tags_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_client_addresses_primary;")
    op.execute("DROP INDEX IF EXISTS idx_client_addresses_workspace_client;")
    op.execute("DROP INDEX IF EXISTS idx_client_contacts_primary;")
    op.execute("DROP INDEX IF EXISTS idx_client_contacts_type_value;")
    op.execute("DROP INDEX IF EXISTS idx_client_contacts_workspace_client;")
    op.execute("DROP INDEX IF EXISTS idx_clients_full_name_search;")
    op.execute("DROP INDEX IF EXISTS idx_clients_portal_user;")
    op.execute("DROP INDEX IF EXISTS idx_clients_referred_by;")
    op.execute("DROP INDEX IF EXISTS idx_clients_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_clients_workspace_full_name;")
    op.execute("DROP INDEX IF EXISTS idx_clients_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_clients_workspace;")

    # Drop tables in reverse order (respecting foreign key constraints)
    op.execute("DROP TABLE IF EXISTS client_smart_lists;")
    op.execute("DROP TABLE IF EXISTS client_preferences;")
    op.execute("DROP TABLE IF EXISTS client_communications;")
    op.execute("DROP TABLE IF EXISTS client_activities;")
    op.execute("DROP TABLE IF EXISTS client_gallery_links;")
    op.execute("DROP TABLE IF EXISTS client_tag_assignments;")
    op.execute("DROP TABLE IF EXISTS client_tags;")
    op.execute("DROP TABLE IF EXISTS client_addresses;")
    op.execute("DROP TABLE IF EXISTS client_contacts;")
    op.execute("DROP TABLE IF EXISTS clients;")
