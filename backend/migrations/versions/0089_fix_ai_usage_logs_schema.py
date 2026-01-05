"""Fix ai_usage_logs schema - add missing columns

Revision ID: 0089
Revises: 0088
Create Date: 2026-01-05 10:35:00.000000

The ai_usage_logs table is missing tokens_used, latency_ms, and metadata columns
that the code expects. This migration adds them.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0089'
down_revision = '0088'
branch_labels = None
depends_on = None


def upgrade():
    # Add missing columns to ai_usage_logs
    # Using raw SQL with IF NOT EXISTS for safety

    # tokens_used - tracks API token consumption
    op.execute("""
        ALTER TABLE ai_usage_logs
        ADD COLUMN IF NOT EXISTS tokens_used INTEGER
    """)

    # latency_ms - tracks API response time
    op.execute("""
        ALTER TABLE ai_usage_logs
        ADD COLUMN IF NOT EXISTS latency_ms INTEGER
    """)

    # metadata - stores additional context as JSON
    op.execute("""
        ALTER TABLE ai_usage_logs
        ADD COLUMN IF NOT EXISTS metadata JSONB
    """)


def downgrade():
    # Remove the columns added in upgrade
    op.drop_column('ai_usage_logs', 'metadata')
    op.drop_column('ai_usage_logs', 'latency_ms')
    op.drop_column('ai_usage_logs', 'tokens_used')
