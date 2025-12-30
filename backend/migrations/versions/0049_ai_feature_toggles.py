"""Add AI feature toggles to user settings.

This migration adds columns to user_gemini_settings for enabling/disabling
specific AI features per user.

Feature: 010-ai-powered-features
Task: T080 - Add AI feature toggles in user settings

Revision ID: 0049
Revises: 0048
Create Date: 2025-12-28
"""

from alembic import op

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add AI feature toggle columns to user_gemini_settings."""
    op.execute("""
        ALTER TABLE user_gemini_settings
        ADD COLUMN IF NOT EXISTS feature_photo_analysis BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS feature_captions BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS feature_hashtags BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS feature_gallery_story BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS feature_smart_curation BOOLEAN NOT NULL DEFAULT TRUE;

        -- Add comment for documentation
        COMMENT ON COLUMN user_gemini_settings.feature_photo_analysis IS 'Enable AI-powered photo analysis (quality, tags, etc.)';
        COMMENT ON COLUMN user_gemini_settings.feature_captions IS 'Enable AI caption generation';
        COMMENT ON COLUMN user_gemini_settings.feature_hashtags IS 'Enable AI hashtag generation';
        COMMENT ON COLUMN user_gemini_settings.feature_gallery_story IS 'Enable AI gallery story generation';
        COMMENT ON COLUMN user_gemini_settings.feature_smart_curation IS 'Enable AI smart curation';
    """)


def downgrade() -> None:
    """Remove AI feature toggle columns."""
    op.execute("""
        ALTER TABLE user_gemini_settings
        DROP COLUMN IF EXISTS feature_photo_analysis,
        DROP COLUMN IF EXISTS feature_captions,
        DROP COLUMN IF EXISTS feature_hashtags,
        DROP COLUMN IF EXISTS feature_gallery_story,
        DROP COLUMN IF EXISTS feature_smart_curation;
    """)
