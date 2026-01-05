"""Create database indexes on critical query paths for invitation system.

Revision ID: 0092
Revises: 0091
Create Date: 2026-01-05 16:00:00.000000

Feature: database-indexing
Description: Performance optimization indexes for invitation_id, workspace_id,
             email, and created_date query paths.

This migration adds optimized indexes for the invitation system tables:
1. digital_invitations: workspace + created_at for listing with date sort
2. invitation_guests: invitation + created_at for paginated guest lists
3. invitation_guests: workspace + email for cross-invitation email lookups
4. invitation_rsvps: workspace + created_at for workspace-level RSVP queries
5. invitation_rsvps: workspace + guest_email for email-based lookups

These indexes target critical query paths identified in:
- invitation_repository.py (list_invitations, get_guests)
- rsvp_repository.py (list_rsvps, get_rsvp_by_email)

Note: Using regular CREATE INDEX instead of CONCURRENTLY to work within
Alembic's transaction model. For production, consider running these
indexes manually with CONCURRENTLY during low-traffic periods.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '0092'
down_revision = '0091'
branch_labels = None
depends_on = None


def upgrade():
    # ===========================================================================
    # digital_invitations indexes
    # ===========================================================================

    # Index 1: Workspace + created_at for listing invitations sorted by creation date
    # Supports: list_invitations with ORDER BY created_at
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_digital_invitations_workspace_created
        ON digital_invitations (workspace_id, created_at DESC);
    """)

    # ===========================================================================
    # invitation_guests indexes
    # ===========================================================================

    # Index 2: Invitation + created_at for paginated guest lists
    # Supports: listing guests for an invitation with pagination
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_invitation_created
        ON invitation_guests (invitation_id, created_at DESC);
    """)

    # Index 3: Workspace + email for cross-invitation email lookups
    # Supports: finding guests by email across workspace (deduplication, analytics)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_invitation_guests_workspace_email
        ON invitation_guests (workspace_id, email)
        WHERE email IS NOT NULL;
    """)

    # ===========================================================================
    # invitation_rsvps indexes
    # ===========================================================================

    # Index 4: Workspace + created_at for workspace-level RSVP analytics
    # Supports: recent RSVPs across all invitations in a workspace
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_workspace_created
        ON invitation_rsvps (workspace_id, created_at DESC);
    """)

    # Index 5: Workspace + guest_email for email-based lookups
    # Supports: finding all RSVPs by email across workspace
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_workspace_email
        ON invitation_rsvps (workspace_id, guest_email);
    """)

    # Index 6: Composite index for common filtering pattern
    # Supports: invitation + workspace + status (tenant-isolated status queries)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_invitation_workspace_status
        ON invitation_rsvps (invitation_id, workspace_id, status);
    """)


def downgrade():
    # Drop indexes in reverse order

    # invitation_rsvps indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_invitation_workspace_status;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_workspace_email;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_rsvps_workspace_created;")

    # invitation_guests indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_workspace_email;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_guests_invitation_created;")

    # digital_invitations indexes
    op.execute("DROP INDEX IF EXISTS idx_digital_invitations_workspace_created;")
