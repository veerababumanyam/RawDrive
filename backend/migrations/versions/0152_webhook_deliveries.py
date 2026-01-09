"""Create webhook_deliveries table for tracking delivery attempts.

Records individual delivery attempts for each webhook subscription,
with retry tracking, request/response details, and error information.

Revision ID: 0152
Revises: 0151
Create Date: 2026-01-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '0152'
down_revision = '0151'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop any orphaned enum from previous failed migration attempts
    op.execute("DROP TYPE IF EXISTS webhook_delivery_status CASCADE;")

    op.create_table(
        'webhook_deliveries',
        # Identity
        sa.Column('delivery_id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('event_id', UUID(as_uuid=True), nullable=False),
        sa.Column('subscription_id', UUID(as_uuid=True), nullable=False),
        sa.Column('workspace_id', UUID(as_uuid=True), nullable=False),

        # Event info (denormalized for query performance)
        sa.Column('event_type', sa.String(100), nullable=False,
                  comment='Denormalized from webhook_events'),

        # Delivery status (TEXT to avoid enum creation issues)
        sa.Column('status', sa.Text(), nullable=False, server_default='pending'),

        # Request details
        sa.Column('request_url', sa.Text(), nullable=False,
                  comment='URL the webhook was sent to'),
        sa.Column('request_method', sa.String(10), nullable=False, server_default='POST'),
        sa.Column('request_headers', JSONB(), nullable=True,
                  comment='Headers sent with the request (secrets redacted)'),
        sa.Column('request_body', JSONB(), nullable=True,
                  comment='Request payload'),
        sa.Column('request_timestamp', sa.DateTime(timezone=True), nullable=True,
                  comment='When the request was sent'),

        # Response details
        sa.Column('response_status_code', sa.Integer(), nullable=True,
                  comment='HTTP response status code'),
        sa.Column('response_headers', JSONB(), nullable=True,
                  comment='Response headers'),
        sa.Column('response_body', sa.Text(), nullable=True,
                  comment='Response body (truncated to 10KB)'),
        sa.Column('response_timestamp', sa.DateTime(timezone=True), nullable=True,
                  comment='When the response was received'),
        sa.Column('response_duration_ms', sa.Integer(), nullable=True,
                  comment='Request duration in milliseconds'),

        # Retry tracking
        sa.Column('attempt_number', sa.Integer(), nullable=False, server_default='1',
                  comment='Current attempt number (starts at 1)'),
        sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='5',
                  comment='Maximum retry attempts allowed'),
        sa.Column('next_retry_at', sa.DateTime(timezone=True), nullable=True,
                  comment='Scheduled time for next retry'),

        # Error details
        sa.Column('error_code', sa.String(50), nullable=True,
                  comment='Error classification code'),
        sa.Column('error_message', sa.Text(), nullable=True,
                  comment='Human-readable error description'),
        sa.Column('error_details', JSONB(), nullable=True,
                  comment='Additional error context'),

        # Signature info
        sa.Column('signature_sent', sa.String(100), nullable=True,
                  comment='Signature header value sent'),
        sa.Column('signature_timestamp', sa.BigInteger(), nullable=True,
                  comment='Unix timestamp used in signature'),

        # Circuit breaker
        sa.Column('circuit_breaker_blocked', sa.Boolean(), nullable=False,
                  server_default='false',
                  comment='Whether delivery was blocked by circuit breaker'),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True,
                  comment='When delivery reached terminal state'),

        # Constraints
        sa.ForeignKeyConstraint(
            ['event_id'], ['webhook_events.event_id'],
            ondelete='CASCADE',
            name='fk_webhook_deliveries_event'
        ),
        sa.ForeignKeyConstraint(
            ['subscription_id'], ['webhook_subscriptions.subscription_id'],
            ondelete='CASCADE',
            name='fk_webhook_deliveries_subscription'
        ),
        sa.ForeignKeyConstraint(
            ['workspace_id'], ['workspaces.workspace_id'],
            ondelete='CASCADE',
            name='fk_webhook_deliveries_workspace'
        ),
        sa.CheckConstraint(
            "attempt_number >= 1 AND attempt_number <= max_attempts + 1",
            name='check_delivery_attempt_range'
        ),
    )

    # Index for delivery queue processing
    op.create_index(
        'idx_webhook_deliveries_pending_queue',
        'webhook_deliveries',
        ['status', 'next_retry_at'],
        postgresql_where=sa.text("status IN ('pending', 'retrying')")
    )

    # Index for subscription delivery history
    op.create_index(
        'idx_webhook_deliveries_subscription_history',
        'webhook_deliveries',
        ['subscription_id', 'created_at'],
        postgresql_ops={'created_at': 'DESC'}
    )

    # Index for event deliveries
    op.create_index(
        'idx_webhook_deliveries_event',
        'webhook_deliveries',
        ['event_id']
    )

    # Index for workspace delivery history
    op.create_index(
        'idx_webhook_deliveries_workspace_history',
        'webhook_deliveries',
        ['workspace_id', 'created_at'],
        postgresql_ops={'created_at': 'DESC'}
    )

    # Index for statistics queries
    op.create_index(
        'idx_webhook_deliveries_stats',
        'webhook_deliveries',
        ['subscription_id', 'status', 'created_at']
    )

    # Index for finding exhausted deliveries (dead letter queue)
    op.create_index(
        'idx_webhook_deliveries_dlq',
        'webhook_deliveries',
        ['workspace_id', 'created_at'],
        postgresql_where=sa.text("status = 'exhausted'")
    )

    # Index for in-progress deliveries (to detect stuck jobs)
    op.create_index(
        'idx_webhook_deliveries_in_progress',
        'webhook_deliveries',
        ['status', 'updated_at'],
        postgresql_where=sa.text("status = 'in_progress'")
    )

    # Add updated_at trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION update_webhook_delivery_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_webhook_deliveries_updated_at
        BEFORE UPDATE ON webhook_deliveries
        FOR EACH ROW
        EXECUTE FUNCTION update_webhook_delivery_timestamp();
    """)

    # Add trigger to update event counts when delivery status changes
    op.execute("""
        CREATE OR REPLACE FUNCTION update_webhook_event_counts()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE webhook_events
                SET delivery_count = delivery_count + 1
                WHERE event_id = NEW.event_id;
            ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
                -- Update success/failure counts based on new status
                IF NEW.status = 'succeeded' AND OLD.status != 'succeeded' THEN
                    UPDATE webhook_events
                    SET success_count = success_count + 1
                    WHERE event_id = NEW.event_id;
                ELSIF NEW.status IN ('failed', 'exhausted') AND OLD.status NOT IN ('failed', 'exhausted') THEN
                    UPDATE webhook_events
                    SET failure_count = failure_count + 1
                    WHERE event_id = NEW.event_id;
                END IF;

                -- Update event status based on delivery outcomes
                UPDATE webhook_events e
                SET
                    status = CASE
                        WHEN e.success_count = e.subscriber_count THEN 'delivered'
                        WHEN e.success_count > 0 AND e.failure_count > 0 THEN 'partially_delivered'
                        WHEN e.failure_count = e.subscriber_count THEN 'failed'
                        ELSE e.status
                    END,
                    processed_at = CASE
                        WHEN e.success_count + e.failure_count >= e.subscriber_count THEN NOW()
                        ELSE e.processed_at
                    END
                WHERE e.event_id = NEW.event_id;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_webhook_deliveries_update_event_counts
        AFTER INSERT OR UPDATE OF status ON webhook_deliveries
        FOR EACH ROW
        EXECUTE FUNCTION update_webhook_event_counts();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_webhook_deliveries_update_event_counts ON webhook_deliveries;")
    op.execute("DROP FUNCTION IF EXISTS update_webhook_event_counts();")
    op.execute("DROP TRIGGER IF EXISTS trg_webhook_deliveries_updated_at ON webhook_deliveries;")
    op.execute("DROP FUNCTION IF EXISTS update_webhook_delivery_timestamp();")
    op.drop_index('idx_webhook_deliveries_in_progress')
    op.drop_index('idx_webhook_deliveries_dlq')
    op.drop_index('idx_webhook_deliveries_stats')
    op.drop_index('idx_webhook_deliveries_workspace_history')
    op.drop_index('idx_webhook_deliveries_event')
    op.drop_index('idx_webhook_deliveries_subscription_history')
    op.drop_index('idx_webhook_deliveries_pending_queue')
    op.drop_table('webhook_deliveries')
    op.execute("DROP TYPE IF EXISTS webhook_delivery_status;")
