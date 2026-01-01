"""Create image_generation_settings table for AI provider config.

Feature: 017-digital-wedding-invitations
Revision ID: 0069
Revises: 0068
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create image_generation_settings table."""
    op.execute(
        """
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
        """
    )

    # Indexes
    op.execute(
        """
        CREATE INDEX idx_image_gen_settings_user ON image_generation_settings(user_id);
        CREATE INDEX idx_image_gen_settings_provider ON image_generation_settings(provider);
        """
    )


def downgrade() -> None:
    """Drop image_generation_settings table."""
    op.execute("DROP TABLE IF EXISTS image_generation_settings;")
