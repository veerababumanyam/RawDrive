"""Change sharing_enabled default to TRUE.

Revision ID: 0054
Revises: 0053
Create Date: 2025-12-29

This migration changes the default value of sharing_enabled from FALSE to TRUE
so that galleries are shareable by default. This is the expected behavior for
photographers who want to share their galleries with clients.

Also updates all existing galleries to have sharing_enabled = TRUE.
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change the default value for new galleries to TRUE
    op.execute(
        """
        ALTER TABLE galleries
        ALTER COLUMN sharing_enabled SET DEFAULT TRUE;
        """
    )

    # Update all existing galleries to have sharing enabled
    op.execute(
        """
        UPDATE galleries
        SET sharing_enabled = TRUE
        WHERE sharing_enabled = FALSE;
        """
    )


def downgrade() -> None:
    # Revert default back to FALSE
    op.execute(
        """
        ALTER TABLE galleries
        ALTER COLUMN sharing_enabled SET DEFAULT FALSE;
        """
    )
    # Note: We don't revert existing galleries as that could break active shares
