"""Add ai_metadata column to asset_analysis.

Revision ID: 0087
Revises: 0086
Create Date: 2026-01-05 10:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0087"
down_revision = "0086"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add ai_metadata column
    op.add_column(
        "asset_analysis",
        sa.Column("ai_metadata", JSONB, nullable=True)
    )

    # Create GIN index for efficient JSON querying
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_analysis_ai_metadata 
        ON asset_analysis USING GIN (ai_metadata);
        """
    )


def downgrade() -> None:
    op.drop_index("idx_asset_analysis_ai_metadata", table_name="asset_analysis")
    op.drop_column("asset_analysis", "ai_metadata")
