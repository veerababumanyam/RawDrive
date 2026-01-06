"""Add session security enhancements for remember me

Revision ID: 0100
Revises: 0099
Create Date: 2026-01-06

Adds device fingerprinting and IP change tracking to sessions table
to support remember me functionality with enhanced security.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0100'
down_revision = '0099'
branch_labels = None
depends_on = None


def upgrade():
    """Add device fingerprint and IP tracking columns to sessions table."""

    # Add device_fingerprint column for device identification
    op.add_column('sessions', sa.Column('device_fingerprint', sa.String(64), nullable=True))

    # Add last_ip_address to track IP changes
    op.add_column('sessions', sa.Column('last_ip_address', sa.String(45), nullable=True))

    # Add ip_changed_at timestamp
    op.add_column('sessions', sa.Column('ip_changed_at', sa.DateTime(timezone=True), nullable=True))

    # Create indexes for performance
    op.create_index(
        'ix_sessions_device_fingerprint',
        'sessions',
        ['device_fingerprint'],
        unique=False
    )

    op.create_index(
        'ix_sessions_user_id_revoked',
        'sessions',
        ['user_id', 'revoked_at'],
        unique=False
    )

    # Initialize last_ip_address with current ip_address for existing sessions
    op.execute("""
        UPDATE sessions
        SET last_ip_address = ip_address::text::varchar(45)
        WHERE ip_address IS NOT NULL AND last_ip_address IS NULL
    """)


def downgrade():
    """Remove session security enhancement columns."""

    # Drop indexes
    op.drop_index('ix_sessions_user_id_revoked', table_name='sessions')
    op.drop_index('ix_sessions_device_fingerprint', table_name='sessions')

    # Drop columns
    op.drop_column('sessions', 'ip_changed_at')
    op.drop_column('sessions', 'last_ip_address')
    op.drop_column('sessions', 'device_fingerprint')
