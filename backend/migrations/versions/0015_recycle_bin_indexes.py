"""Add indexes for recycle bin query optimization

Revision ID: 0015_recycle_bin_indexes
Revises: 0014
Create Date: 2025-12-20

This migration adds composite indexes to optimize recycle bin queries:
- Galleries: (workspace_id, deleted, deleted_at DESC) for fast filtering
- Assets: (workspace_id, deleted, deleted_at DESC) for fast filtering

These indexes significantly improve performance when listing deleted items.
"""
from alembic import op


# revision identifiers
revision = '0015_recycle_bin_indexes'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add performance indexes for recycle bin queries."""
    
    # Index for galleries recycle bin lookup
    # Covers: WHERE workspace_id = X AND deleted = TRUE ORDER BY deleted_at DESC
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_galleries_recycle_lookup
        ON galleries(workspace_id, deleted, deleted_at DESC)
        WHERE deleted = TRUE
    """)
    
    # Index for assets recycle bin lookup
    # Covers: WHERE workspace_id = X AND deleted = TRUE ORDER BY deleted_at DESC
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_assets_recycle_lookup
        ON assets(workspace_id, deleted, deleted_at DESC)
        WHERE deleted = TRUE
    """)
    
    print("✅ Created recycle bin performance indexes")


def downgrade() -> None:
    """Remove recycle bin performance indexes."""
    
    op.execute("DROP INDEX IF EXISTS idx_galleries_recycle_lookup")
    op.execute("DROP INDEX IF EXISTS idx_assets_recycle_lookup")
    
    print("✅ Removed recycle bin performance indexes")
