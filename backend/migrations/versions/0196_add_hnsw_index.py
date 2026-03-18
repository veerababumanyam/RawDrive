"""Replace DiskANN indexes with HNSW on image_embeddings.

HNSW (Hierarchical Navigable Small World) provides excellent recall
and low latency for cosine similarity searches on pgvector columns.
Parameters: m=16 (connections per layer), ef_construction=64 (build quality).

Also adds a workspace_id btree index for efficient multi-tenant filtering.

Revision ID: 0196
Revises: 0195
Create Date: 2026-03-18
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0196"
down_revision = "0195"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop existing DiskANN index on image_embeddings
    op.execute("DROP INDEX IF EXISTS idx_image_embeddings_diskann;")

    # Drop existing IVFFlat index on image_embeddings (from migration 0085)
    op.execute("DROP INDEX IF EXISTS idx_embeddings_ivfflat;")

    # Create HNSW index with cosine distance operator class
    op.execute(
        """
        CREATE INDEX idx_image_embeddings_hnsw
        ON image_embeddings USING hnsw (embedding_vector vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
        """
    )

    # Add workspace_id btree index for multi-tenant query filtering
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_image_embeddings_workspace
        ON image_embeddings (workspace_id);
        """
    )


def downgrade() -> None:
    # Drop HNSW index
    op.execute("DROP INDEX IF EXISTS idx_image_embeddings_hnsw;")

    # Drop workspace index
    op.execute("DROP INDEX IF EXISTS idx_image_embeddings_workspace;")

    # Recreate IVFFlat index (original from migration 0085)
    op.execute(
        """
        CREATE INDEX idx_embeddings_ivfflat ON image_embeddings
        USING ivfflat (embedding_vector vector_cosine_ops)
        WITH (lists = 100);
        """
    )
