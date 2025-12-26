"""Add magic links, QR code support, and face search logging tables.

This migration creates the infrastructure for Magic Links feature:
- magic_links: Token-based shareable URLs for galleries
- magic_link_accesses: Analytics and access logging
- face_search_logs: Privacy-conscious logging of face searches
- Adds sharing_enabled column to galleries

Security considerations:
- Token is stored as SHA-256 hash (never plaintext)
- All tables enforce workspace isolation
- Rate limiting supported via access logs

Revision ID: 0031
Revises: 0030
Create Date: 2025-12-26
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create magic links infrastructure with full security and analytics support."""

    # =========================================================================
    # 1. Add sharing_enabled column to galleries
    # =========================================================================
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN galleries.sharing_enabled IS
        'Master switch to enable/disable all Magic Links for this gallery';
        """
    )

    # =========================================================================
    # 2. Create magic_link_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'magic_link_status') THEN
                CREATE TYPE magic_link_status AS ENUM ('active', 'expired', 'revoked');
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'magic_link_target_type') THEN
                CREATE TYPE magic_link_target_type AS ENUM ('gallery', 'sub_gallery', 'photo');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 3. Create magic_links table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS magic_links (
            -- Primary key
            link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Gallery association
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,

            -- Token security: SHA-256 hash of the token (64 hex chars)
            -- The plaintext token is returned only on creation, never stored
            token_hash VARCHAR(64) NOT NULL,

            -- Scoping: what does this link give access to?
            target_type magic_link_target_type NOT NULL DEFAULT 'gallery',
            target_id UUID,  -- sub_gallery_id or photo_id (NULL for gallery-level)

            -- User-friendly label for management
            label VARCHAR(100),

            -- Access controls
            expires_at TIMESTAMPTZ,  -- NULL = never expires
            max_accesses INTEGER,    -- NULL = unlimited
            access_count INTEGER NOT NULL DEFAULT 0,

            -- Link status
            status magic_link_status NOT NULL DEFAULT 'active',

            -- QR code configuration
            qr_config JSONB NOT NULL DEFAULT '{
                "size": 1024,
                "color": null,
                "logo_enabled": true,
                "error_correction": "H"
            }'::jsonb,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Constraints
            CONSTRAINT magic_links_token_hash_unique UNIQUE (token_hash),
            CONSTRAINT magic_links_max_accesses_positive CHECK (max_accesses IS NULL OR max_accesses > 0),
            CONSTRAINT magic_links_target_id_required CHECK (
                (target_type = 'gallery' AND target_id IS NULL) OR
                (target_type != 'gallery' AND target_id IS NOT NULL)
            )
        );
        """
    )

    # =========================================================================
    # 4. Create magic_link_accesses table for analytics
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS magic_link_accesses (
            -- Primary key
            access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Link reference
            link_id UUID NOT NULL REFERENCES magic_links(link_id) ON DELETE CASCADE,

            -- Visitor tracking (optional - only if email registration completed)
            visitor_id UUID REFERENCES visitors(visitor_id) ON DELETE SET NULL,

            -- Access metadata
            ip_address INET,
            user_agent TEXT,
            referer TEXT,

            -- Geolocation (resolved asynchronously)
            country_code VARCHAR(2),
            region VARCHAR(100),
            city VARCHAR(100),

            -- Gate completion tracking
            email_gate_passed BOOLEAN DEFAULT FALSE,
            pin_gate_passed BOOLEAN DEFAULT FALSE,

            -- Device info (parsed from user_agent)
            device_type VARCHAR(20),  -- desktop, mobile, tablet
            browser VARCHAR(50),
            os VARCHAR(50),

            -- Timestamp
            accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 5. Create face_search_logs table (privacy-conscious)
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS face_search_logs (
            -- Primary key
            log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Context
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            link_id UUID REFERENCES magic_links(link_id) ON DELETE SET NULL,

            -- Visitor tracking (optional)
            visitor_id UUID REFERENCES visitors(visitor_id) ON DELETE SET NULL,

            -- Privacy-conscious: Only store hash of embedding, not the embedding itself
            embedding_hash VARCHAR(16) NOT NULL,

            -- Results summary (no PII)
            matches_count INTEGER NOT NULL DEFAULT 0,
            top_similarity DECIMAL(5,4),  -- Highest similarity score

            -- Performance metrics
            processing_ms INTEGER,

            -- Rate limiting metadata
            ip_address INET,
            user_agent TEXT,

            -- Timestamp
            searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 6. Create indexes for query optimization
    # =========================================================================

    # magic_links indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_workspace_gallery
        ON magic_links(workspace_id, gallery_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_token_hash
        ON magic_links(token_hash);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_status_expires
        ON magic_links(status, expires_at)
        WHERE status = 'active';
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_gallery_active
        ON magic_links(gallery_id)
        WHERE status = 'active';
        """
    )

    # magic_link_accesses indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_link_accesses_link
        ON magic_link_accesses(link_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_link_accesses_time
        ON magic_link_accesses(link_id, accessed_at DESC);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_link_accesses_visitor
        ON magic_link_accesses(visitor_id)
        WHERE visitor_id IS NOT NULL;
        """
    )

    # face_search_logs indexes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_search_logs_gallery
        ON face_search_logs(gallery_id, searched_at DESC);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_search_logs_rate_limit
        ON face_search_logs(gallery_id, ip_address, searched_at DESC);
        """
    )

    # =========================================================================
    # 7. Create trigger for automatic updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_magic_links_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_magic_links_updated_at ON magic_links;
        CREATE TRIGGER trigger_magic_links_updated_at
            BEFORE UPDATE ON magic_links
            FOR EACH ROW
            EXECUTE FUNCTION update_magic_links_updated_at();
        """
    )

    # =========================================================================
    # 8. Add comments for documentation
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE magic_links IS
        'Shareable token-based URLs for public gallery access with security controls';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN magic_links.token_hash IS
        'SHA-256 hash of the access token. Plaintext token is returned only on creation.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN magic_links.qr_config IS
        'QR code generation settings: size (px), color (hex), logo_enabled, error_correction (L/M/Q/H)';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE magic_link_accesses IS
        'Access log for Magic Link analytics, including gate completion and geolocation';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE face_search_logs IS
        'Privacy-conscious logging of face searches. Stores embedding hash only, never raw data.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN face_search_logs.embedding_hash IS
        'First 16 chars of SHA-256 hash of embedding array. Used for dedup, never for reconstruction.';
        """
    )


def downgrade() -> None:
    """Remove magic links infrastructure.

    WARNING: This will permanently delete all magic links and their access logs.
    """
    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_magic_links_updated_at ON magic_links;")
    op.execute("DROP FUNCTION IF EXISTS update_magic_links_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_face_search_logs_rate_limit;")
    op.execute("DROP INDEX IF EXISTS idx_face_search_logs_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_magic_link_accesses_visitor;")
    op.execute("DROP INDEX IF EXISTS idx_magic_link_accesses_time;")
    op.execute("DROP INDEX IF EXISTS idx_magic_link_accesses_link;")
    op.execute("DROP INDEX IF EXISTS idx_magic_links_gallery_active;")
    op.execute("DROP INDEX IF EXISTS idx_magic_links_status_expires;")
    op.execute("DROP INDEX IF EXISTS idx_magic_links_token_hash;")
    op.execute("DROP INDEX IF EXISTS idx_magic_links_workspace_gallery;")

    # Drop tables (order matters due to foreign keys)
    op.execute("DROP TABLE IF EXISTS face_search_logs;")
    op.execute("DROP TABLE IF EXISTS magic_link_accesses;")
    op.execute("DROP TABLE IF EXISTS magic_links;")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS magic_link_target_type;")
    op.execute("DROP TYPE IF EXISTS magic_link_status;")

    # Remove column from galleries
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS sharing_enabled;")
