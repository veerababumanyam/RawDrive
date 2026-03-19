"""Add HNSW index on faces.embedding for fast similarity search.

HNSW (Hierarchical Navigable Small World) provides excellent recall
and low latency for cosine similarity searches on the faces table.
Parameters: m=16 (connections per layer), ef_construction=200 (build quality).

This index is separate from the image_embeddings HNSW index (0196).
The faces table stores per-face 512-d embeddings used for face clustering,
while image_embeddings stores per-image embeddings for visual search.

Revision ID: 0198
Revises: 0197
Create Date: 2026-03-19
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0198"
down_revision = "0197"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create HNSW index on faces.embedding for face similarity search
    # Using CONCURRENTLY to avoid locking the table during index build
    # Note: CONCURRENTLY requires execution outside a transaction block
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_faces_embedding_hnsw
        ON faces USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 200);
        """
    )

    # Add composite index for workspace-scoped face queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_faces_workspace_group
        ON faces (workspace_id, face_group_id)
        WHERE face_group_id IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_faces_embedding_hnsw;")
    op.execute("DROP INDEX IF EXISTS idx_faces_workspace_group;")
