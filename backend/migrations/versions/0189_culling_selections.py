"""Create culling_selections table for bulk photo culling workflow.

Revision ID: 0189_culling_selections
Revises: 0188_collaborative_album_design
Create Date: 2026-02-01

Feature: Bulk Photo Culling Workflow
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0189"
down_revision = "0188"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create culling_selections table."""
    op.create_table(
        "culling_selections",
        sa.Column("selection_id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gallery_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_selected", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_rejected", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("rejection_reason", sa.String(length=255), nullable=True),
        sa.Column("selected_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("selection_id"),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.workspace_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["gallery_id"],
            ["galleries.gallery_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["assets.asset_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["selected_by"],
            ["users.user_id"],
            ondelete="SET NULL",
        ),
    )

    # Create unique constraint on workspace + gallery + asset
    op.create_unique_constraint(
        "uq_culling_selections_workspace_gallery_asset",
        "culling_selections",
        ["workspace_id", "gallery_id", "asset_id"],
    )

    # Create indexes for common queries
    op.create_index(
        "ix_culling_selections_workspace_gallery",
        "culling_selections",
        ["workspace_id", "gallery_id"],
    )

    op.create_index(
        "ix_culling_selections_selected",
        "culling_selections",
        ["workspace_id", "gallery_id"],
        postgresql_where=sa.text("is_selected = true"),
    )

    op.create_index(
        "ix_culling_selections_rejected",
        "culling_selections",
        ["workspace_id", "gallery_id"],
        postgresql_where=sa.text("is_rejected = true"),
    )


def downgrade() -> None:
    """Drop culling_selections table."""
    op.drop_index("ix_culling_selections_rejected", table_name="culling_selections")
    op.drop_index("ix_culling_selections_selected", table_name="culling_selections")
    op.drop_index("ix_culling_selections_workspace_gallery", table_name="culling_selections")
    op.drop_constraint("uq_culling_selections_workspace_gallery_asset", "culling_selections", type_="unique")
    op.drop_table("culling_selections")
