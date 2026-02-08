"""Add profile views analytics table.

Revision ID: 0184
Revises: 0183
Create Date: 2026-02-01

Implements profile view tracking for personal profiles.
Tracks anonymous views with device, geographic, and referrer data.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0184"
down_revision = "0183"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create profile_views table and related indexes."""
    # Create profile_views table for tracking anonymous profile views
    op.create_table(
        "profile_views",
        sa.Column("view_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("personal_profiles.profile_id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            index=True,
        ),
        # Anonymous visitor tracking (hashed IP, no PII)
        sa.Column("visitor_hash", sa.String(64), nullable=True),
        sa.Column("session_id", sa.String(64), nullable=True),
        # Device information
        sa.Column(
            "device_type",
            sa.String(20),
            nullable=True,
            comment="phone, tablet, desktop, unknown",
        ),
        sa.Column("browser", sa.String(50), nullable=True),
        sa.Column("os", sa.String(50), nullable=True),
        # Geographic data (country-level only for privacy)
        sa.Column("country_code", sa.String(2), nullable=True),
        sa.Column("region", sa.String(100), nullable=True),
        # Referrer information
        sa.Column("referrer_domain", sa.String(255), nullable=True),
        sa.Column(
            "referrer_type",
            sa.String(20),
            nullable=True,
            comment="direct, social, search, email, other",
        ),
        # Timestamps
        sa.Column(
            "viewed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # Create composite indexes for common queries
    op.create_index(
        "ix_profile_views_profile_workspace",
        "profile_views",
        ["profile_id", "workspace_id"],
    )
    op.create_index(
        "ix_profile_views_profile_date",
        "profile_views",
        ["profile_id", "viewed_at"],
    )
    op.create_index(
        "ix_profile_views_workspace_date",
        "profile_views",
        ["workspace_id", "viewed_at"],
    )

    # Add view_count and last_viewed_at columns to personal_profiles for quick access
    op.add_column(
        "personal_profiles",
        sa.Column("view_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "personal_profiles",
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Create daily aggregation table for efficient analytics queries
    op.create_table(
        "profile_view_daily_stats",
        sa.Column("stat_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("personal_profiles.profile_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stat_date", sa.Date(), nullable=False),
        sa.Column("view_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("unique_visitors", sa.Integer(), server_default="0", nullable=False),
        # Device breakdown
        sa.Column("desktop_views", sa.Integer(), server_default="0", nullable=False),
        sa.Column("mobile_views", sa.Integer(), server_default="0", nullable=False),
        sa.Column("tablet_views", sa.Integer(), server_default="0", nullable=False),
        # Top countries as JSONB (e.g., {"US": 10, "IN": 5})
        sa.Column("country_breakdown", postgresql.JSONB(), server_default="{}"),
        # Top referrers as JSONB
        sa.Column("referrer_breakdown", postgresql.JSONB(), server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # Unique constraint on profile + date for upsert operations
    op.create_unique_constraint(
        "uq_profile_view_daily_stats_profile_date",
        "profile_view_daily_stats",
        ["profile_id", "stat_date"],
    )

    op.create_index(
        "ix_profile_view_daily_stats_profile_date",
        "profile_view_daily_stats",
        ["profile_id", "stat_date"],
    )
    op.create_index(
        "ix_profile_view_daily_stats_workspace_date",
        "profile_view_daily_stats",
        ["workspace_id", "stat_date"],
    )


def downgrade() -> None:
    """Remove profile views analytics tables and columns."""
    op.drop_table("profile_view_daily_stats")
    op.drop_table("profile_views")
    op.drop_column("personal_profiles", "view_count")
    op.drop_column("personal_profiles", "last_viewed_at")
