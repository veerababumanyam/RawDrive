"""Add language preference and font configuration to invitation schema.

This migration enhances the digital invitations and templates tables with:
- Font family preference (primary and heading fonts)
- Language code validation for 6 regional Indian languages
- UI language preference for invitation interface

Supported Languages (T001):
- en (English)
- hi (Hindi - Devanagari)
- ta (Tamil)
- te (Telugu)
- kn (Kannada)
- ml (Malayalam)

Associated Font Families (T002):
- Noto Sans (Latin)
- Noto Sans Devanagari
- Noto Sans Tamil
- Noto Sans Telugu
- Noto Sans Kannada
- Noto Sans Malayalam

Feature: Digital Invitation Service - Multi-Language & Regional Font Support
Revision ID: 0179
Revises: 0178
Create Date: 2026-02-01
"""

from alembic import op

revision = "0179"
down_revision = "0178"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. Create invitation_language enum for supported language codes
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_language') THEN
                CREATE TYPE invitation_language AS ENUM ('en', 'hi', 'ta', 'te', 'kn', 'ml');
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 2. Add font preference columns to digital_invitations
    # =========================================================================

    # Primary font family for body text
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD COLUMN IF NOT EXISTS font_family_primary VARCHAR(100) DEFAULT 'Noto Sans';
        """
    )

    # Heading font family for titles
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD COLUMN IF NOT EXISTS font_family_heading VARCHAR(100) DEFAULT 'Noto Serif';
        """
    )

    # UI language preference (for invitation interface labels)
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD COLUMN IF NOT EXISTS ui_language VARCHAR(10) DEFAULT 'en';
        """
    )

    # Script type (for CSS/rendering hints)
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD COLUMN IF NOT EXISTS script_type VARCHAR(20) DEFAULT 'Latin';
        """
    )

    # =========================================================================
    # 3. Add font preference columns to invitation_templates
    # =========================================================================

    # Primary font family for body text in template
    op.execute(
        """
        ALTER TABLE invitation_templates
        ADD COLUMN IF NOT EXISTS font_family_primary VARCHAR(100) DEFAULT 'Noto Sans';
        """
    )

    # Heading font family for titles in template
    op.execute(
        """
        ALTER TABLE invitation_templates
        ADD COLUMN IF NOT EXISTS font_family_heading VARCHAR(100) DEFAULT 'Noto Serif';
        """
    )

    # Regional variant hint (for template categorization)
    op.execute(
        """
        ALTER TABLE invitation_templates
        ADD COLUMN IF NOT EXISTS regional_variant VARCHAR(50);
        """
    )

    # =========================================================================
    # 4. Add constraints for valid font families
    # =========================================================================

    # Constraint on digital_invitations for valid font families
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD CONSTRAINT digital_invitations_font_family_primary_valid
        CHECK (font_family_primary IN (
            'Noto Sans',
            'Noto Sans Devanagari',
            'Noto Sans Tamil',
            'Noto Sans Telugu',
            'Noto Sans Kannada',
            'Noto Sans Malayalam',
            'Inter',
            'Playfair Display'
        ));
        """
    )

    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD CONSTRAINT digital_invitations_font_family_heading_valid
        CHECK (font_family_heading IN (
            'Noto Serif',
            'Noto Serif Devanagari',
            'Noto Serif Tamil',
            'Noto Serif Telugu',
            'Noto Serif Kannada',
            'Noto Serif Malayalam',
            'Playfair Display',
            'Noto Sans',
            'Noto Sans Devanagari',
            'Noto Sans Tamil',
            'Noto Sans Telugu',
            'Noto Sans Kannada',
            'Noto Sans Malayalam'
        ));
        """
    )

    # Constraint on digital_invitations for valid UI language
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD CONSTRAINT digital_invitations_ui_language_valid
        CHECK (ui_language IN ('en', 'hi', 'ta', 'te', 'kn', 'ml', 'en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'));
        """
    )

    # Constraint on digital_invitations for valid script type
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD CONSTRAINT digital_invitations_script_type_valid
        CHECK (script_type IN ('Latin', 'Devanagari', 'Tamil', 'Telugu', 'Kannada', 'Malayalam'));
        """
    )

    # =========================================================================
    # 5. Create index for language-based queries
    # =========================================================================

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_language
        ON digital_invitations (primary_language, ui_language);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_templates_regional
        ON invitation_templates (regional_variant)
        WHERE regional_variant IS NOT NULL;
        """
    )

    # =========================================================================
    # 6. Add documentation comments
    # =========================================================================

    op.execute(
        """
        COMMENT ON COLUMN digital_invitations.font_family_primary IS
        'Primary font family for body text. Auto-selected based on primary_language. Noto Sans family for regional scripts.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN digital_invitations.font_family_heading IS
        'Heading font family for titles and headers. Noto Serif family or Playfair Display for decorative headings.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN digital_invitations.ui_language IS
        'Language code for UI labels (RSVP button, venue label, etc.). ISO 639-1 or BCP 47 format.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN digital_invitations.script_type IS
        'Writing script used for rendering hints: Latin, Devanagari, Tamil, Telugu, Kannada, Malayalam.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_templates.font_family_primary IS
        'Default primary font for templates using this template. Inherited by invitations if not overridden.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_templates.font_family_heading IS
        'Default heading font for templates. Inherited by invitations if not overridden.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_templates.regional_variant IS
        'Regional cultural variant: North Indian, South Indian, Telugu, Tamil, Punjabi, Bengali, etc.';
        """
    )

    op.execute(
        """
        COMMENT ON TYPE invitation_language IS
        'Supported language codes for digital invitations: en (English), hi (Hindi), ta (Tamil), te (Telugu), kn (Kannada), ml (Malayalam).';
        """
    )


def downgrade() -> None:
    # Drop indexes first
    op.execute("DROP INDEX IF EXISTS idx_invitation_templates_regional;")
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_language;")

    # Drop constraints
    op.execute(
        "ALTER TABLE digital_invitations DROP CONSTRAINT IF EXISTS digital_invitations_script_type_valid;"
    )
    op.execute(
        "ALTER TABLE digital_invitations DROP CONSTRAINT IF EXISTS digital_invitations_ui_language_valid;"
    )
    op.execute(
        "ALTER TABLE digital_invitations DROP CONSTRAINT IF EXISTS digital_invitations_font_family_heading_valid;"
    )
    op.execute(
        "ALTER TABLE digital_invitations DROP CONSTRAINT IF EXISTS digital_invitations_font_family_primary_valid;"
    )

    # Drop columns from invitation_templates
    op.execute("ALTER TABLE invitation_templates DROP COLUMN IF EXISTS regional_variant;")
    op.execute("ALTER TABLE invitation_templates DROP COLUMN IF EXISTS font_family_heading;")
    op.execute("ALTER TABLE invitation_templates DROP COLUMN IF EXISTS font_family_primary;")

    # Drop columns from digital_invitations
    op.execute("ALTER TABLE digital_invitations DROP COLUMN IF EXISTS script_type;")
    op.execute("ALTER TABLE digital_invitations DROP COLUMN IF EXISTS ui_language;")
    op.execute("ALTER TABLE digital_invitations DROP COLUMN IF EXISTS font_family_heading;")
    op.execute("ALTER TABLE digital_invitations DROP COLUMN IF EXISTS font_family_primary;")

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS invitation_language;")
