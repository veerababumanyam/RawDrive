"""AI Filter performance indexes

Revision ID: 0091
Revises: 0090
Create Date: 2026-01-05 13:00:00.000000

Feature: 025-ai-filter-simplify
Task: T062 - Performance tuning indexes

Adds indexes to optimize common AI filter query patterns:
1. photo_quality_analysis: workspace + session lookups
2. photo_quality_analysis: quality tier filtering (overall_score)
3. photo_quality_analysis: blur filtering
4. curation_sessions: gallery + status lookups
5. curation_sessions: progress polling queries
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '0091'
down_revision = '0090'
branch_labels = None
depends_on = None


def upgrade():
    # ===========================================================================
    # photo_quality_analysis indexes
    # ===========================================================================

    # Index 1: Workspace + Session lookup (common for listing analysis results)
    op.create_index(
        'ix_photo_quality_workspace_session',
        'photo_quality_analysis',
        ['workspace_id', 'session_id'],
        postgresql_concurrently=False,
    )

    # Index 2: Quality tier filtering - supports quality_tier queries
    # Covering index includes columns commonly selected with quality filters
    op.create_index(
        'ix_photo_quality_score_filter',
        'photo_quality_analysis',
        ['workspace_id', 'session_id', 'overall_score'],
        postgresql_concurrently=False,
    )

    # Index 3: Blur detection filtering
    op.create_index(
        'ix_photo_quality_blur_filter',
        'photo_quality_analysis',
        ['workspace_id', 'session_id', 'blur_detected'],
        postgresql_concurrently=False,
    )

    # Index 4: Asset lookup within workspace (for retry failed analysis)
    op.create_index(
        'ix_photo_quality_workspace_asset',
        'photo_quality_analysis',
        ['workspace_id', 'asset_id'],
        postgresql_concurrently=False,
    )

    # ===========================================================================
    # curation_sessions indexes
    # ===========================================================================

    # Index 5: Gallery session lookup (most common query pattern)
    op.create_index(
        'ix_curation_sessions_gallery_lookup',
        'curation_sessions',
        ['workspace_id', 'gallery_id', 'created_at'],
        postgresql_concurrently=False,
    )

    # Index 6: Active session lookup (for checking if session is in progress)
    op.create_index(
        'ix_curation_sessions_active',
        'curation_sessions',
        ['workspace_id', 'gallery_id', 'status'],
        postgresql_where="status NOT IN ('completed', 'failed')",
        postgresql_concurrently=False,
    )

    # Index 7: Progress polling - includes progress_stage for stage transition queries
    op.create_index(
        'ix_curation_sessions_progress',
        'curation_sessions',
        ['workspace_id', 'session_id', 'progress_percent', 'progress_stage'],
        postgresql_concurrently=False,
    )

    # ===========================================================================
    # similarity_groups indexes (if table exists)
    # ===========================================================================

    # Index 8: Similarity group lookup by session
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'similarity_groups') THEN
                CREATE INDEX IF NOT EXISTS ix_similarity_groups_session
                ON similarity_groups (workspace_id, session_id);
            END IF;
        END $$;
    """)


def downgrade():
    # Drop indexes in reverse order

    # Similarity groups (conditional)
    op.execute("""
        DROP INDEX IF EXISTS ix_similarity_groups_session;
    """)

    # curation_sessions indexes
    op.drop_index('ix_curation_sessions_progress', 'curation_sessions')
    op.drop_index('ix_curation_sessions_active', 'curation_sessions')
    op.drop_index('ix_curation_sessions_gallery_lookup', 'curation_sessions')

    # photo_quality_analysis indexes
    op.drop_index('ix_photo_quality_workspace_asset', 'photo_quality_analysis')
    op.drop_index('ix_photo_quality_blur_filter', 'photo_quality_analysis')
    op.drop_index('ix_photo_quality_score_filter', 'photo_quality_analysis')
    op.drop_index('ix_photo_quality_workspace_session', 'photo_quality_analysis')
