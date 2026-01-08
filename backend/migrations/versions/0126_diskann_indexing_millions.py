"""Upgrade vector search to StreamingDiskANN for millions of photos.

This migration replaces existing IVFFlat indexes with StreamingDiskANN (DiskANN) 
indexes provided by pgvectorscale. This is critical for scaling similarity search 
to millions of photos while maintaining millisecond-level responsiveness.

StreamingDiskANN benefits:
- 10-100x faster than HNSW/IVFFlat at scale
- Optimized for datasets larger than RAM (Disk-based)
- Lower memory footprint
- Better accuracy-performance trade-off

Revision ID: 0126
Revises: 0125
Create Date: 2026-01-08
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0126"
down_revision = "0125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. FACES TABLE - Change from ivfflat to diskann
    # Drop existing ivfflat index
    op.execute("DROP INDEX IF EXISTS idx_faces_embedding;")
    
    # Create StreamingDiskANN index
    # We use vector_cosine_ops as typically embeddings are compared via cosine similarity
    op.execute(
        """
        CREATE INDEX idx_faces_embedding_diskann ON faces 
        USING diskann (embedding vector_cosine_ops);
        """
    )
    print("Upgraded faces table to StreamingDiskANN indexing.")

    # 2. IMAGE_EMBEDDINGS TABLE - Change from ivfflat to diskann
    op.execute("DROP INDEX IF EXISTS idx_embeddings_ivfflat;")
    
    op.execute(
        """
        CREATE INDEX idx_image_embeddings_diskann ON image_embeddings 
        USING diskann (embedding vector_cosine_ops);
        """
    )
    print("Upgraded image_embeddings table to StreamingDiskANN indexing.")

    # 3. EMBEDDINGS TABLE - Generic center for all other embeddings
    op.execute("DROP INDEX IF EXISTS idx_embeddings_vector_cosine;")
    
    op.execute(
        """
        CREATE INDEX idx_embeddings_diskann ON embeddings 
        USING diskann (embedding vector_cosine_ops);
        """
    )
    print("Upgraded generic embeddings table to StreamingDiskANN indexing.")


def downgrade() -> None:
    # Revert back to IVFFlat (or HNSW) if needed
    
    # Revert faces
    op.execute("DROP INDEX IF EXISTS idx_faces_embedding_diskann;")
    op.execute(
        """
        CREATE INDEX idx_faces_embedding ON faces 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
        """
    )

    # Revert image_embeddings
    op.execute("DROP INDEX IF EXISTS idx_image_embeddings_diskann;")
    op.execute(
        """
        CREATE INDEX idx_embeddings_ivfflat ON image_embeddings 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
        """
    )

    # Revert generic embeddings
    op.execute("DROP INDEX IF EXISTS idx_embeddings_diskann;")
    op.execute(
        """
        CREATE INDEX idx_embeddings_vector_cosine ON embeddings 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
        """
    )
