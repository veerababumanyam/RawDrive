"""Create notification_templates table for notifications microservice.

This migration creates the notification_templates table that stores reusable
notification templates for multi-channel delivery (email, SMS, push, in-app).

The table supports:
- Multi-tenant isolation via workspace_id (NULL = system templates)
- Template versioning for audit trails and A/B testing
- Multi-channel content (HTML email, plain text, SMS)
- Jinja2 template variables with schema validation
- Template categorization matching notification_category enum
- Localization via JSONB content fields

Feature: Notifications & Communication Microservice
Task: T012 - Create notification_templates table migration
Revision ID: 0120
Revises: 0119
Create Date: 2026-01-07
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0120"
down_revision = "0119"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create notification_templates table with supporting indexes and triggers."""

    # =========================================================================
    # 1. Create notification_template_status enum type
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notification_template_status AS ENUM (
                'draft',
                'active',
                'archived',
                'deprecated'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create notification_templates table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_templates (
            -- Primary key: UUID for template identification
            template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Workspace scoping (NULL = system template available to all workspaces)
            workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- =========================================================================
            -- TEMPLATE IDENTITY
            -- =========================================================================

            -- Unique template code for API/programmatic reference
            -- Examples: 'gallery.published', 'billing.payment_failed', 'rsvp.received'
            code VARCHAR(100) NOT NULL,

            -- Human-readable template name
            name VARCHAR(200) NOT NULL,

            -- Template description for admin/management purposes
            description TEXT,

            -- =========================================================================
            -- TEMPLATE CLASSIFICATION
            -- =========================================================================

            -- Category matching notification_category enum from notification_events
            category notification_category NOT NULL,

            -- Channels this template supports (can be used for multiple channels)
            -- Uses the notification_channel enum type from notification_events
            supported_channels notification_channel[] NOT NULL DEFAULT ARRAY['email']::notification_channel[],

            -- Template status for lifecycle management
            status notification_template_status NOT NULL DEFAULT 'draft',

            -- =========================================================================
            -- EMAIL CONTENT
            -- =========================================================================

            -- Email subject line (supports Jinja2 template variables)
            email_subject VARCHAR(500),

            -- HTML email content (Jinja2 template)
            email_html TEXT,

            -- Plain text email content (Jinja2 template)
            email_text TEXT,

            -- Email sender name override (if different from default)
            email_from_name VARCHAR(100),

            -- Reply-to email address override
            email_reply_to VARCHAR(320),

            -- =========================================================================
            -- SMS CONTENT
            -- =========================================================================

            -- SMS message content (Jinja2 template, max 1600 chars for concatenated SMS)
            sms_content TEXT,

            -- =========================================================================
            -- PUSH NOTIFICATION CONTENT
            -- =========================================================================

            -- Push notification title (Jinja2 template)
            push_title VARCHAR(100),

            -- Push notification body (Jinja2 template)
            push_body TEXT,

            -- Push notification action URL
            push_action_url TEXT,

            -- Push notification icon URL
            push_icon_url TEXT,

            -- =========================================================================
            -- IN-APP NOTIFICATION CONTENT
            -- =========================================================================

            -- In-app notification title (Jinja2 template)
            in_app_title VARCHAR(200),

            -- In-app notification body (Jinja2 template)
            in_app_body TEXT,

            -- In-app notification action URL
            in_app_action_url TEXT,

            -- In-app notification icon/type
            in_app_icon VARCHAR(50),

            -- =========================================================================
            -- TEMPLATE VARIABLES
            -- =========================================================================

            -- Schema defining required and optional template variables
            -- Format: {"required": ["guest_name", "event_date"], "optional": ["venue_name"]}
            variable_schema JSONB DEFAULT '{"required": [], "optional": []}'::JSONB,

            -- Default values for optional variables
            -- Format: {"venue_name": "TBD", "party_size": 1}
            default_values JSONB DEFAULT '{}'::JSONB,

            -- =========================================================================
            -- LOCALIZATION
            -- =========================================================================

            -- Default language code (ISO 639-1)
            default_language VARCHAR(5) DEFAULT 'en',

            -- Localized content overrides
            -- Format: {"hi": {"email_subject": "...", "email_html": "..."}, "es": {...}}
            localized_content JSONB DEFAULT '{}'::JSONB,

            -- =========================================================================
            -- VERSIONING
            -- =========================================================================

            -- Semantic version of the template
            version VARCHAR(20) NOT NULL DEFAULT '1.0.0',

            -- Previous version template ID for version chain
            previous_version_id UUID REFERENCES notification_templates(template_id) ON DELETE SET NULL,

            -- =========================================================================
            -- DELIVERY OPTIONS
            -- =========================================================================

            -- Priority level for notifications using this template
            default_priority notification_priority DEFAULT 'normal',

            -- Whether notifications using this template can be opted out
            is_transactional BOOLEAN DEFAULT FALSE,

            -- Time-to-live in seconds (notifications expire after this if not delivered)
            ttl_seconds INTEGER,

            -- =========================================================================
            -- METADATA
            -- =========================================================================

            -- Tags for filtering and categorization
            tags TEXT[] DEFAULT ARRAY[]::TEXT[],

            -- Additional metadata (A/B testing info, analytics tags, etc.)
            metadata JSONB DEFAULT '{}'::JSONB,

            -- =========================================================================
            -- AUDIT FIELDS
            -- =========================================================================

            -- Who created this template
            created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Who last updated this template
            updated_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- When the template was created
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- When the template was last updated
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- =========================================================================
            -- CONSTRAINTS
            -- =========================================================================

            -- Template code must be unique per workspace (NULLS NOT DISTINCT for system templates)
            CONSTRAINT notification_templates_code_workspace_unique
                UNIQUE NULLS NOT DISTINCT (workspace_id, code, version)
        );
        """
    )

    # =========================================================================
    # 3. Create indexes for common query patterns
    # =========================================================================

    # Workspace + status queries (list active templates for a workspace)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_templates_workspace_status
        ON notification_templates(workspace_id, status)
        WHERE status = 'active';
        """
    )

    # Code-based lookups (most common - finding template by code)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_templates_code
        ON notification_templates(code, workspace_id, status)
        WHERE status = 'active';
        """
    )

    # Category-based queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_templates_category
        ON notification_templates(category, workspace_id)
        WHERE status = 'active';
        """
    )

    # Channel-based queries (GIN index for array containment)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_templates_channels
        ON notification_templates USING GIN (supported_channels);
        """
    )

    # System templates lookup (workspace_id IS NULL)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_templates_system
        ON notification_templates(code, status)
        WHERE workspace_id IS NULL AND status = 'active';
        """
    )

    # Tags filtering (GIN index for array operations)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_templates_tags
        ON notification_templates USING GIN (tags);
        """
    )

    # Version chain traversal
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_templates_previous_version
        ON notification_templates(previous_version_id)
        WHERE previous_version_id IS NOT NULL;
        """
    )

    # Variable schema lookups (for template validation)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notification_templates_variable_schema
        ON notification_templates USING GIN (variable_schema);
        """
    )

    # =========================================================================
    # 4. Add foreign key from notification_events.template_id
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_notification_events_template'
            ) THEN
                ALTER TABLE notification_events
                ADD CONSTRAINT fk_notification_events_template
                FOREIGN KEY (template_id) REFERENCES notification_templates(template_id)
                ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 5. Create trigger for updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_notification_templates_updated_at()
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
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_templates_updated_at'
            ) THEN
                CREATE TRIGGER trg_notification_templates_updated_at
                BEFORE UPDATE ON notification_templates
                FOR EACH ROW
                EXECUTE FUNCTION update_notification_templates_updated_at();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 6. Create trigger to handle version chain integrity
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION handle_notification_template_versioning()
        RETURNS TRIGGER AS $$
        BEGIN
            -- When a template is deprecated, ensure there's an active version
            IF NEW.status = 'deprecated' AND OLD.status != 'deprecated' THEN
                -- Just log a warning - don't block the deprecation
                RAISE NOTICE 'Template % version % has been deprecated', NEW.code, NEW.version;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_templates_versioning'
            ) THEN
                CREATE TRIGGER trg_notification_templates_versioning
                BEFORE UPDATE OF status ON notification_templates
                FOR EACH ROW
                EXECUTE FUNCTION handle_notification_template_versioning();
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 7. Add check constraints for content validation
    # =========================================================================

    # Email template must have at least subject and one content format if email is supported
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_template_email_content'
            ) THEN
                ALTER TABLE notification_templates
                ADD CONSTRAINT check_notification_template_email_content
                CHECK (
                    NOT ('email' = ANY(supported_channels)) OR
                    (email_subject IS NOT NULL AND (email_html IS NOT NULL OR email_text IS NOT NULL))
                );
            END IF;
        END $$;
        """
    )

    # SMS template must have content if SMS is supported
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_template_sms_content'
            ) THEN
                ALTER TABLE notification_templates
                ADD CONSTRAINT check_notification_template_sms_content
                CHECK (
                    NOT ('sms' = ANY(supported_channels)) OR
                    sms_content IS NOT NULL
                );
            END IF;
        END $$;
        """
    )

    # Push template must have title and body if push is supported
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_template_push_content'
            ) THEN
                ALTER TABLE notification_templates
                ADD CONSTRAINT check_notification_template_push_content
                CHECK (
                    NOT ('push' = ANY(supported_channels)) OR
                    (push_title IS NOT NULL AND push_body IS NOT NULL)
                );
            END IF;
        END $$;
        """
    )

    # In-app template must have title and body if in_app is supported
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_template_in_app_content'
            ) THEN
                ALTER TABLE notification_templates
                ADD CONSTRAINT check_notification_template_in_app_content
                CHECK (
                    NOT ('in_app' = ANY(supported_channels)) OR
                    (in_app_title IS NOT NULL AND in_app_body IS NOT NULL)
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 8. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE notification_templates IS
        'Reusable notification templates for multi-channel delivery (email, SMS, push, in-app). Supports multi-tenant isolation, versioning, and localization.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_templates.workspace_id IS
        'NULL for system templates (available to all workspaces), non-NULL for workspace-specific custom templates';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_templates.code IS
        'Unique template identifier for programmatic access. Format: category.event (e.g., gallery.published, billing.payment_failed)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_templates.variable_schema IS
        'JSON schema defining required and optional Jinja2 template variables: {"required": ["name"], "optional": ["venue"]}';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_templates.is_transactional IS
        'If TRUE, notifications using this template cannot be opted out by users (e.g., password reset, payment confirmation)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_templates.ttl_seconds IS
        'Time-to-live for notifications. If delivery fails within this window, notification is dropped. NULL = no expiry.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_templates.supported_channels IS
        'Array of channels this template supports. Template must have content for each supported channel.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_templates.localized_content IS
        'Localized content overrides keyed by language code: {"hi": {"email_subject": "..."}, "es": {...}}';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN notification_templates.previous_version_id IS
        'Links to the previous version of this template for version chain traversal and audit trails';
        """
    )


def downgrade() -> None:
    """Drop notification_templates table and related objects."""

    # Remove foreign key from notification_events first
    op.execute(
        """
        ALTER TABLE notification_events
        DROP CONSTRAINT IF EXISTS fk_notification_events_template;
        """
    )

    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS trg_notification_templates_versioning ON notification_templates;")
    op.execute("DROP FUNCTION IF EXISTS handle_notification_template_versioning();")
    op.execute("DROP TRIGGER IF EXISTS trg_notification_templates_updated_at ON notification_templates;")
    op.execute("DROP FUNCTION IF EXISTS update_notification_templates_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_notification_templates_variable_schema;")
    op.execute("DROP INDEX IF EXISTS idx_notification_templates_previous_version;")
    op.execute("DROP INDEX IF EXISTS idx_notification_templates_tags;")
    op.execute("DROP INDEX IF EXISTS idx_notification_templates_system;")
    op.execute("DROP INDEX IF EXISTS idx_notification_templates_channels;")
    op.execute("DROP INDEX IF EXISTS idx_notification_templates_category;")
    op.execute("DROP INDEX IF EXISTS idx_notification_templates_code;")
    op.execute("DROP INDEX IF EXISTS idx_notification_templates_workspace_status;")

    # Drop table (constraints are dropped automatically)
    op.execute("DROP TABLE IF EXISTS notification_templates CASCADE;")

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS notification_template_status;")
