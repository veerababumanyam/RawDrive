"""Add AI filter simplify presets

Revision ID: 0090_ai_filter_presets
Revises: 0089
Create Date: 2026-01-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0090_ai_filter_presets'
down_revision = '0089'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Insert system presets for AI filter simplify feature (025-ai-filter-simplify)."""
    
    # Insert three new system presets as per data-model.md
    op.execute(
        """
        INSERT INTO curation_presets (
            preset_id, workspace_id, name, description,
            target_count_ratio, target_count_fixed, quality_threshold,
            similarity_threshold, prioritize_expressions, prioritize_composition,
            enforce_story_coverage, enforce_person_coverage, is_system
        )
        VALUES
            (
                'a1b2c3d4-0001-4000-8000-000000000001', NULL,
                'Highlights',
                'Top 10-15% highest quality photos with visual diversity',
                0.12, NULL, 80.0,
                0.85, true, true,
                true, false, true
            ),
            (
                'a1b2c3d4-0002-4000-8000-000000000002', NULL,
                'Portraits',
                'Photos with detected faces and good expressions',
                NULL, NULL, 70.0,
                0.80, true, false,
                false, true, true
            ),
            (
                'a1b2c3d4-0003-4000-8000-000000000003', NULL,
                'Event Coverage',
                'Balanced selection covering all event moments',
                0.25, NULL, 60.0,
                0.75, true, true,
                true, true, true
            )
        ON CONFLICT (preset_id) DO NOTHING;
        """
    )


def downgrade() -> None:
    """Remove AI filter simplify presets."""
    
    op.execute(
        """
        DELETE FROM curation_presets 
        WHERE preset_id IN (
            'a1b2c3d4-0001-4000-8000-000000000001',
            'a1b2c3d4-0002-4000-8000-000000000002',
            'a1b2c3d4-0003-4000-8000-000000000003'
        );
        """
    )
