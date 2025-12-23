"""Enable pgvector extension for face embedding similarity search.

This migration enables the pgvector extension which provides:
- vector data type for storing face embeddings (512-dimensional)
- Cosine distance operator (<=>) for similarity search
- IVFFlat indexing for efficient approximate nearest neighbor search

The extension must be installed on the PostgreSQL server before running this migration.
For managed databases (e.g., AWS RDS, Supabase), pgvector is typically pre-installed.
For self-hosted PostgreSQL, install via: CREATE EXTENSION vector;

Revision ID: 0024
Revises: 0023
Create Date: 2025-12-23
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Enable pgvector extension for vector similarity search.
    
    pgvector provides:
    - vector(n) data type for n-dimensional vectors
    - <=> operator for cosine distance (1 - cosine_similarity)
    - <#> operator for negative inner product
    - <-> operator for L2 distance
    - IVFFlat and HNSW index types for approximate nearest neighbor search
    """
    # Enable pgvector extension
    # IF NOT EXISTS ensures idempotency - safe to run multiple times
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")


def downgrade() -> None:
    """Disable pgvector extension.
    
    WARNING: This will fail if any tables still use the vector type.
    Ensure all face-related tables are dropped before running downgrade.
    """
    op.execute("DROP EXTENSION IF EXISTS vector CASCADE;")
