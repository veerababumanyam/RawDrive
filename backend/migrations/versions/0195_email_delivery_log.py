"""Add email_delivery_log table for PostgreSQL persistence of Postal webhook events.

Stores delivery status events from Postal webhooks so delivery history
is queryable and survives Redis eviction (MAIL-09).

Revision ID: 0195
Revises: 0194
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0195"
down_revision = "0194"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create email_delivery_log table with indexes."""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_delivery_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            postal_message_id VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            email_type VARCHAR(50),
            recipient_email VARCHAR(255),
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            payload JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(postal_message_id, event_type)
        );

        CREATE INDEX IF NOT EXISTS idx_edl_message_id
            ON email_delivery_log(postal_message_id);

        CREATE INDEX IF NOT EXISTS idx_edl_status
            ON email_delivery_log(status, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_edl_recipient
            ON email_delivery_log(recipient_email, created_at DESC);
        """
    )


def downgrade() -> None:
    """Drop email_delivery_log table and indexes."""
    op.execute("DROP TABLE IF EXISTS email_delivery_log CASCADE;")
