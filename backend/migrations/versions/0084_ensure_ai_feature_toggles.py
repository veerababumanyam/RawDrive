"""Ensure AI feature toggles exist.

This migration ensures the AI feature toggle columns exist in user_gemini_settings.
These were originally in 0049b but might have been skipped due to migration history edits.

Feature: 010-ai-powered-features
Revision ID: 0084
Revises: 0083
Create Date: 2026-01-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0084"
down_revision = "0083"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add AI feature toggle columns if they don't exist."""
    # We use IF NOT EXISTS in the SQL to be safe
    op.execute("""
        ALTER TABLE user_gemini_settings
        ADD COLUMN IF NOT EXISTS feature_photo_analysis BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS feature_captions BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS feature_hashtags BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS feature_gallery_story BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS feature_smart_curation BOOLEAN NOT NULL DEFAULT TRUE;

        -- Add comments
        COMMENT ON COLUMN user_gemini_settings.feature_photo_analysis IS 'Enable AI-powered photo analysis (quality, tags, etc.)';
        COMMENT ON COLUMN user_gemini_settings.feature_captions IS 'Enable AI caption generation';
        COMMENT ON COLUMN user_gemini_settings.feature_hashtags IS 'Enable AI hashtag generation';
        COMMENT ON COLUMN user_gemini_settings.feature_gallery_story IS 'Enable AI gallery story generation';
        COMMENT ON COLUMN user_gemini_settings.feature_smart_curation IS 'Enable AI smart curation';
    """)


def downgrade() -> None:
    """Remove AI feature toggle columns."""
    # We don't drop them in downgrade to avoid data loss if we roll back this specific migration
    # but keep the original 0049b intention. 
    # However, strictly speaking, downgrade should reverse upgrade.
    # Since this is a "fix" migration, we can leave them or drop them.
    # Let's drop them only if they were created by this migration? Hard to track.
    # We'll just do nothing or drop them. Let's drop them to be compliant.
    op.execute("""
        ALTER TABLE user_gemini_settings
        DROP COLUMN IF EXISTS feature_photo_analysis,
        DROP COLUMN IF EXISTS feature_captions,
        DROP COLUMN IF EXISTS feature_hashtags,
        DROP COLUMN IF EXISTS feature_gallery_story,
        DROP COLUMN IF EXISTS feature_smart_curation;
    """)
