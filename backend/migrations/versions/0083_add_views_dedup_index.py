"""Add optimized index for invitation view deduplication queries.

The view deduplication query needs to find the most recent view per visitor
for each invitation. This compound index optimizes that specific query pattern.

Feature: 020-invitation-rsvp-hardening
Revision ID: 0083
Revises: 0082
Create Date: 2026-01-03

Query pattern optimized:
SELECT DISTINCT ON (visitor_hash) *
FROM invitation_views
WHERE invitation_id = $1
ORDER BY visitor_hash, viewed_at DESC
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0083"
down_revision = "0082"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add compound index for efficient view deduplication queries.

    This index supports the pattern:
    - Filter by invitation_id
    - Group by visitor_hash
    - Order by viewed_at DESC (to get most recent)

    The index ordering matches the DISTINCT ON query pattern exactly.
    """
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_views_dedup
        ON invitation_views (invitation_id, visitor_hash, viewed_at DESC);
        """
    )

    op.execute(
        """
        COMMENT ON INDEX idx_invitation_views_dedup IS
        'Optimizes view deduplication queries: SELECT DISTINCT ON (visitor_hash) ... ORDER BY visitor_hash, viewed_at DESC';
        """
    )


def downgrade() -> None:
    """Remove the dedup index."""
    op.execute("DROP INDEX IF EXISTS idx_invitation_views_dedup;")
