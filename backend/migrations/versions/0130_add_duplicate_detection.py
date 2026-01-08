"""Add duplicate detection columns and tables

Revision ID: 0130
Revises: 0129
Create Date: 2026-01-08 12:00:00.000000

Adds support for AI-powered duplicate detection:
- Perceptual hashing for photo duplicates (visual similarity)
- Gemini embeddings for client duplicates (semantic similarity using customer API keys)
- Duplicate groups tracking and management
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0130'
down_revision = '0129'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add duplicate detection support."""

    # Ensure uuid-ossp extension exists
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # =========================================================================
    # 1. Add perceptual hash columns to assets table
    # =========================================================================

    op.add_column('assets',
        sa.Column('perceptual_hash', sa.String(16), nullable=True,
                  comment='16-character perceptual hash for visual duplicate detection')
    )
    op.add_column('assets',
        sa.Column('phash_computed_at', sa.DateTime(timezone=True), nullable=True,
                  comment='Timestamp when perceptual hash was computed')
    )

    # Index for finding photos with similar hashes
    op.execute("""
        CREATE INDEX idx_assets_perceptual_hash
        ON assets(perceptual_hash)
        WHERE perceptual_hash IS NOT NULL AND deleted = FALSE
    """)

    # =========================================================================
    # 2. Add Gemini embedding columns to clients table
    # =========================================================================

    # Use raw SQL for vector type to avoid requiring pgvector Python package
    # Vector dimension: 768 (Gemini embedding-001 model)
    # Uses customer-configured Gemini API keys (no local models)
    op.execute("""
        ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS gemini_embedding vector(768)
    """)

    op.execute("""
        COMMENT ON COLUMN clients.gemini_embedding IS '768-dimensional Gemini embedding for semantic similarity (customer API keys)'
    """)

    op.add_column('clients',
        sa.Column('embedding_computed_at', sa.DateTime(timezone=True), nullable=True,
                  comment='Timestamp when Gemini embedding was computed')
    )

    # HNSW index for efficient vector similarity search
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_clients_gemini_embedding
        ON clients USING hnsw(gemini_embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE gemini_embedding IS NOT NULL
    """)

    # =========================================================================
    # 3. Create duplicate_groups table
    # =========================================================================

    op.create_table(
        'duplicate_groups',
        sa.Column('group_id', sa.UUID(), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('workspace_id', sa.UUID(), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False,
                  comment='Type of duplicates: photo or client'),
        sa.Column('detection_method', sa.String(50), nullable=False,
                  comment='Detection method: perceptual_hash, gemini_embedding, levenshtein, manual'),
        sa.Column('similarity_score', sa.Float(), nullable=True,
                  comment='Average similarity score for the group (0-1)'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending',
                  comment='Status: pending, confirmed, dismissed'),
        sa.Column('reviewed_by_user_id', sa.UUID(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now(), onupdate=sa.func.now()),

        sa.PrimaryKeyConstraint('group_id'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reviewed_by_user_id'], ['users.user_id'], ondelete='SET NULL'),
        sa.CheckConstraint("entity_type IN ('photo', 'client')", name='ck_duplicate_groups_entity_type'),
        sa.CheckConstraint("detection_method IN ('perceptual_hash', 'gemini_embedding', 'levenshtein', 'manual')",
                          name='ck_duplicate_groups_detection_method'),
        sa.CheckConstraint("status IN ('pending', 'confirmed', 'dismissed')", name='ck_duplicate_groups_status'),
        sa.CheckConstraint("similarity_score >= 0 AND similarity_score <= 1", name='ck_duplicate_groups_similarity_score'),
    )

    # Indexes for duplicate_groups
    op.create_index('idx_duplicate_groups_workspace', 'duplicate_groups', ['workspace_id'])
    op.create_index('idx_duplicate_groups_status', 'duplicate_groups', ['status'])
    op.create_index('idx_duplicate_groups_entity_type', 'duplicate_groups', ['entity_type'])
    op.create_index('idx_duplicate_groups_workspace_status', 'duplicate_groups',
                    ['workspace_id', 'status', 'entity_type'])

    # =========================================================================
    # 4. Create duplicate_group_members table
    # =========================================================================

    op.create_table(
        'duplicate_group_members',
        sa.Column('member_id', sa.UUID(), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('group_id', sa.UUID(), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False,
                  comment='asset_id or client_id depending on group entity_type'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false',
                  comment='True if this is the primary/master entity in the group'),
        sa.Column('similarity_to_primary', sa.Float(), nullable=True,
                  comment='Similarity score relative to primary entity (0-1)'),
        sa.Column('added_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),

        sa.PrimaryKeyConstraint('member_id'),
        sa.ForeignKeyConstraint(['group_id'], ['duplicate_groups.group_id'], ondelete='CASCADE'),
        sa.CheckConstraint("similarity_to_primary IS NULL OR (similarity_to_primary >= 0 AND similarity_to_primary <= 1)",
                          name='ck_duplicate_members_similarity'),
    )

    # Indexes for duplicate_group_members
    op.create_index('idx_duplicate_group_members_group', 'duplicate_group_members', ['group_id'])
    op.create_index('idx_duplicate_group_members_entity', 'duplicate_group_members', ['entity_id'])

    # Unique constraint: entity can only be in one group per workspace
    op.create_index('idx_duplicate_group_members_entity_unique', 'duplicate_group_members',
                    ['entity_id', 'group_id'], unique=True)

    # =========================================================================
    # 5. Create function to auto-update updated_at timestamp
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_duplicate_groups_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trigger_duplicate_groups_updated_at
        BEFORE UPDATE ON duplicate_groups
        FOR EACH ROW
        EXECUTE FUNCTION update_duplicate_groups_updated_at();
    """)


def downgrade() -> None:
    """Remove duplicate detection support."""

    # Drop trigger and function
    op.execute('DROP TRIGGER IF EXISTS trigger_duplicate_groups_updated_at ON duplicate_groups')
    op.execute('DROP FUNCTION IF EXISTS update_duplicate_groups_updated_at()')

    # Drop tables
    op.drop_table('duplicate_group_members')
    op.drop_table('duplicate_groups')

    # Drop columns from clients
    op.drop_index('idx_clients_gemini_embedding', table_name='clients')
    op.drop_column('clients', 'embedding_computed_at')
    op.drop_column('clients', 'gemini_embedding')

    # Drop columns from assets
    op.drop_index('idx_assets_perceptual_hash', table_name='assets')
    op.drop_column('assets', 'phash_computed_at')
    op.drop_column('assets', 'perceptual_hash')
