"""Add gallery_views table for per-gallery view tracking.

Revision ID: 0205
Revises: 0203
Create Date: 2026-03-20

Creates gallery_views table to track individual gallery views with
visitor token, device type, country, and time spent.
Supports analytics dashboard with aggregation queries.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "0205"
down_revision = "0203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create gallery_views tracking table
    op.create_table(
        "gallery_views",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "gallery_id",
            UUID(as_uuid=True),
            sa.ForeignKey("galleries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=False),
        sa.Column("visitor_token", sa.VARCHAR(64), nullable=False),
        sa.Column("session_id", sa.VARCHAR(64), nullable=True),
        sa.Column("device_type", sa.VARCHAR(20), nullable=True),
        sa.Column("browser", sa.VARCHAR(50), nullable=True),
        sa.Column("os", sa.VARCHAR(50), nullable=True),
        sa.Column("country_code", sa.CHAR(2), nullable=True),
        sa.Column("region", sa.VARCHAR(100), nullable=True),
        sa.Column("referrer_domain", sa.VARCHAR(255), nullable=True),
        sa.Column("time_spent_seconds", sa.INTEGER, nullable=True),
        sa.Column(
            "viewed_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # Index for querying views by gallery + date (most common analytics query)
    op.create_index(
        "idx_gallery_views_gallery_date",
        "gallery_views",
        ["gallery_id", sa.text("viewed_at DESC")],
    )

    # Index for workspace-scoped queries (multi-tenant isolation)
    op.create_index(
        "idx_gallery_views_workspace",
        "gallery_views",
        ["workspace_id", "gallery_id"],
    )

    # Index for visitor deduplication queries
    op.create_index(
        "idx_gallery_views_visitor",
        "gallery_views",
        ["gallery_id", "visitor_token"],
    )


def downgrade() -> None:
    op.drop_index("idx_gallery_views_visitor")
    op.drop_index("idx_gallery_views_workspace")
    op.drop_index("idx_gallery_views_gallery_date")
    op.drop_table("gallery_views")
