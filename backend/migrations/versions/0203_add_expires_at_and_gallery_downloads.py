"""Add expires_at column to galleries and gallery_downloads tracking table.

Revision ID: 0203
Revises: 0202
Create Date: 2026-03-20

Adds expires_at (TIMESTAMP, nullable) to galleries table for gallery expiration.
Creates gallery_downloads table for download tracking with workspace_id isolation.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "0203"
down_revision = "0202"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add expires_at column to galleries
    op.add_column(
        "galleries",
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # Create gallery_downloads tracking table
    op.create_table(
        "gallery_downloads",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "gallery_id",
            UUID(as_uuid=True),
            sa.ForeignKey("galleries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("asset_id", UUID(as_uuid=True), nullable=False),
        sa.Column("visitor_token", sa.VARCHAR(255), nullable=False),
        sa.Column("size", sa.VARCHAR(20), nullable=False),
        sa.Column("format", sa.VARCHAR(10), server_default="jpeg"),
        sa.Column("file_size_bytes", sa.BIGINT, nullable=True),
        sa.Column("ip_address", sa.VARCHAR(45), nullable=True),
        sa.Column("user_agent", sa.TEXT, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )

    # Index for querying downloads by gallery (most common query)
    op.create_index(
        "ix_gallery_downloads_gallery_created",
        "gallery_downloads",
        ["gallery_id", sa.text("created_at DESC")],
    )

    # Index for workspace-scoped queries (multi-tenant isolation)
    op.create_index(
        "ix_gallery_downloads_workspace_gallery",
        "gallery_downloads",
        ["workspace_id", "gallery_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_gallery_downloads_workspace_gallery")
    op.drop_index("ix_gallery_downloads_gallery_created")
    op.drop_table("gallery_downloads")
    op.drop_column("galleries", "expires_at")
