"""Create invitation_exports table.

Revision ID: 0125
Revises: 0124
Create Date: 2026-01-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0125"
down_revision = "0124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invitation_exports",
        sa.Column("export_id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.workspace_id", ondelete="CASCADE"), nullable=False),
        sa.Column("invitation_id", sa.UUID(), sa.ForeignKey("invitations.invitation_id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("format", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    
    op.create_index("ix_invitation_exports_workspace_id", "invitation_exports", ["workspace_id"])
    op.create_index("ix_invitation_exports_invitation_id", "invitation_exports", ["invitation_id"])


def downgrade() -> None:
    op.drop_index("ix_invitation_exports_invitation_id", table_name="invitation_exports")
    op.drop_index("ix_invitation_exports_workspace_id", table_name="invitation_exports")
    op.drop_table("invitation_exports")
