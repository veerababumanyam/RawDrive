"""Enable pgvectorscale extension for enhanced vector search performance.

This migration enables the pgvectorscale extension which provides:
- StreamingDiskANN index type for improved vector search at scale
- Better memory efficiency compared to HNSW indexes
- Optimized for large embedding datasets (millions+ vectors)

pgvectorscale requires:
- PostgreSQL 15+
- pgvector extension (enabled in migration 0024)
- timescaledb-ha Docker image or pgvectorscale installed on the server

The extension enhances pgvector with advanced indexing algorithms from Timescale.
Existing pgvector functionality remains unchanged.

Rollback procedure:
1. Ensure no StreamingDiskANN indexes exist
2. Run: alembic downgrade 0092
3. Verify with: SELECT * FROM pg_extension WHERE extname = 'vectorscale';

Revision ID: 0093
Revises: 0092
Create Date: 2026-01-06
"""

from alembic import op
from sqlalchemy import text

# Revision identifiers used by Alembic
revision = "0093"
down_revision = "0092"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Enable pgvectorscale extension for enhanced vector indexing.

    pgvectorscale provides:
    - StreamingDiskANN index type for scalable approximate nearest neighbor search
    - Better performance characteristics for large vector datasets
    - Works alongside existing pgvector operators (<=> for cosine, <-> for L2, etc.)

    Note: This migration will gracefully handle environments where pgvectorscale
    is not installed by logging a warning rather than failing.
    """
    # Get connection for checking extension availability
    connection = op.get_bind()

    # First, verify pgvector is enabled (required dependency)
    result = connection.execute(
        text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
    )
    if not result.fetchone():
        # pgvector not enabled - this shouldn't happen if migrations run in order
        # but we handle it gracefully
        print("WARNING: pgvector extension not found. Enabling it first...")
        op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # Check if vectorscale is available in the PostgreSQL installation
    result = connection.execute(
        text("""
            SELECT 1 FROM pg_available_extensions
            WHERE name = 'vectorscale'
        """)
    )

    if result.fetchone():
        # pgvectorscale is available - enable it
        op.execute("CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;")
        print("SUCCESS: pgvectorscale extension enabled successfully.")
    else:
        # pgvectorscale is not available in this PostgreSQL installation
        # Log warning but don't fail - system continues with standard pgvector
        print(
            "WARNING: pgvectorscale extension is not available in this PostgreSQL "
            "installation. The system will continue using standard pgvector indexes. "
            "To enable pgvectorscale, use the timescale/timescaledb-ha Docker image "
            "or install pgvectorscale on your PostgreSQL server."
        )


def downgrade() -> None:
    """Disable pgvectorscale extension.

    WARNING: This will fail if any StreamingDiskANN indexes exist.
    Ensure all StreamingDiskANN indexes are dropped before running downgrade.
    The CASCADE option will also drop dependent objects.
    """
    # Check if extension exists before attempting to drop
    connection = op.get_bind()
    result = connection.execute(
        text("SELECT 1 FROM pg_extension WHERE extname = 'vectorscale'")
    )

    if result.fetchone():
        op.execute("DROP EXTENSION IF EXISTS vectorscale CASCADE;")
        print("pgvectorscale extension disabled.")
    else:
        print("pgvectorscale extension was not enabled - nothing to downgrade.")
