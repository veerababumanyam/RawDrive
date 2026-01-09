"""Create webhook_events table for tracking platform events.

Records all events that trigger webhook deliveries, with deduplication
support and status tracking.

Revision ID: 0151
Revises: 0150
Create Date: 2026-01-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '0151'
down_revision = '0150'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop any orphaned enum from previous failed migration attempts
    op.execute("DROP TYPE IF EXISTS webhook_event_status CASCADE;")

    op.create_table(
        'webhook_events',
        # Identity
        sa.Column('event_id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True), nullable=False),

        # Event details
        sa.Column('event_type', sa.String(100), nullable=False,
                  comment='Event type (e.g., gallery.published, asset.uploaded)'),
        sa.Column('event_version', sa.String(10), nullable=False, server_default='v1',
                  comment='Payload schema version'),
        sa.Column('payload', JSONB(), nullable=False,
                  comment='Full event payload'),

        # Source tracking
        sa.Column('source_service', sa.String(50), nullable=False,
                  comment='Service that generated the event'),
        sa.Column('source_entity_id', UUID(as_uuid=True), nullable=True,
                  comment='Primary entity ID (gallery_id, asset_id, etc.)'),
        sa.Column('source_entity_type', sa.String(50), nullable=True,
                  comment='Entity type (gallery, asset, user, etc.)'),

        # Processing status (use TEXT with check constraint to avoid enum creation issues)
        sa.Column('status', sa.Text(), nullable=False, server_default='pending'),

        # Subscriber counts
        sa.Column('subscriber_count', sa.Integer(), nullable=False, server_default='0',
                  comment='Number of active subscriptions matched'),
        sa.Column('delivery_count', sa.Integer(), nullable=False, server_default='0',
                  comment='Number of delivery attempts created'),
        sa.Column('success_count', sa.Integer(), nullable=False, server_default='0',
                  comment='Number of successful deliveries'),
        sa.Column('failure_count', sa.Integer(), nullable=False, server_default='0',
                  comment='Number of failed deliveries'),

        # Deduplication
        sa.Column('idempotency_key', sa.String(255), nullable=True, unique=True,
                  comment='Optional key for idempotent event processing'),
        sa.Column('correlation_id', UUID(as_uuid=True), nullable=True,
                  comment='ID to correlate related events'),

        # Timestamps
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()'),
                  comment='When the event originally occurred'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()'),
                  comment='When the event was recorded'),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True,
                  comment='When event processing completed'),

        # Additional metadata
        sa.Column('metadata', JSONB(), nullable=False, server_default='{}',
                  comment='Additional event metadata'),

        # Constraints
        sa.ForeignKeyConstraint(
            ['workspace_id'], ['workspaces.workspace_id'],
            ondelete='CASCADE',
            name='fk_webhook_events_workspace'
        ),
    )

    # Index for queue processing (pending events)
    op.create_index(
        'idx_webhook_events_pending',
        'webhook_events',
        ['status', 'created_at'],
        postgresql_where=sa.text("status = 'pending'")
    )

    # Index for workspace event history
    op.create_index(
        'idx_webhook_events_workspace_history',
        'webhook_events',
        ['workspace_id', 'created_at'],
        postgresql_ops={'created_at': 'DESC'}
    )

    # Index for filtering by event type
    op.create_index(
        'idx_webhook_events_type',
        'webhook_events',
        ['event_type', 'workspace_id']
    )

    # Index for correlation lookups
    op.create_index(
        'idx_webhook_events_correlation',
        'webhook_events',
        ['correlation_id'],
        postgresql_where=sa.text('correlation_id IS NOT NULL')
    )

    # Index for source entity lookups
    op.create_index(
        'idx_webhook_events_source_entity',
        'webhook_events',
        ['source_entity_type', 'source_entity_id'],
        postgresql_where=sa.text('source_entity_id IS NOT NULL')
    )

    # Partial index for recent pending/processing events (hot data)
    op.create_index(
        'idx_webhook_events_active',
        'webhook_events',
        ['workspace_id', 'status'],
        postgresql_where=sa.text("status IN ('pending', 'processing')")
    )


def downgrade() -> None:
    op.drop_index('idx_webhook_events_active')
    op.drop_index('idx_webhook_events_source_entity')
    op.drop_index('idx_webhook_events_correlation')
    op.drop_index('idx_webhook_events_type')
    op.drop_index('idx_webhook_events_workspace_history')
    op.drop_index('idx_webhook_events_pending')
    op.drop_table('webhook_events')
    op.execute("DROP TYPE IF EXISTS webhook_event_status;")
