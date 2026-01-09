"""Create webhook_subscriptions table for webhook event system.

Stores webhook endpoint configurations with security credentials,
event filtering, and delivery settings.

Revision ID: 0150
Revises: 0149
Create Date: 2026-01-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

revision = '0150'
down_revision = '0149'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'webhook_subscriptions',
        # Identity
        sa.Column('subscription_id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True), nullable=False),

        # Endpoint configuration
        sa.Column('name', sa.String(200), nullable=False,
                  comment='Human-readable name for the webhook'),
        sa.Column('description', sa.Text(), nullable=True,
                  comment='Optional description of what this webhook is used for'),
        sa.Column('endpoint_url', sa.Text(), nullable=False,
                  comment='HTTPS URL to receive webhook payloads'),
        sa.Column('http_method', sa.String(10), nullable=False, server_default='POST',
                  comment='HTTP method: POST, PUT, or PATCH'),

        # Security
        sa.Column('secret_key', sa.String(64), nullable=False,
                  comment='Shared secret for HMAC-SHA256 signing (64 hex chars)'),
        sa.Column('secret_version', sa.Integer(), nullable=False, server_default='1',
                  comment='Version number for secret rotation tracking'),
        sa.Column('previous_secret_key', sa.String(64), nullable=True,
                  comment='Previous secret during rotation (valid for 24h)'),
        sa.Column('previous_secret_expires_at', sa.DateTime(timezone=True), nullable=True,
                  comment='Expiration time for previous secret'),

        # Event filtering
        sa.Column('event_types', ARRAY(sa.Text()), nullable=False,
                  comment='Array of event types to subscribe to (e.g., gallery.published)'),
        sa.Column('event_filters', JSONB(), nullable=False, server_default='{}',
                  comment='Additional JSON filters for event matching'),

        # Configuration
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true',
                  comment='Whether the webhook is active and should receive events'),
        sa.Column('include_payload', sa.Boolean(), nullable=False, server_default='true',
                  comment='Whether to include full payload or just event metadata'),
        sa.Column('payload_version', sa.String(10), nullable=False, server_default='v1',
                  comment='Payload format version for backwards compatibility'),

        # Custom headers
        sa.Column('custom_headers', JSONB(), nullable=False, server_default='{}',
                  comment='Custom HTTP headers to include in webhook requests'),

        # Retry configuration
        sa.Column('max_retries', sa.Integer(), nullable=False, server_default='5',
                  comment='Maximum number of retry attempts for failed deliveries'),
        sa.Column('timeout_seconds', sa.Integer(), nullable=False, server_default='30',
                  comment='HTTP request timeout in seconds'),

        # Rate limiting
        sa.Column('rate_limit_per_minute', sa.Integer(), nullable=True,
                  comment='Optional rate limit (deliveries per minute)'),

        # IP allowlisting (optional)
        sa.Column('allowed_source_ips', ARRAY(sa.Text()), nullable=True,
                  comment='Optional IP allowlist for incoming verification requests'),

        # Metadata
        sa.Column('created_by_user_id', UUID(as_uuid=True), nullable=True,
                  comment='User who created the webhook'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),

        # Constraints
        sa.ForeignKeyConstraint(
            ['workspace_id'], ['workspaces.workspace_id'],
            ondelete='CASCADE',
            name='fk_webhook_subscriptions_workspace'
        ),
        sa.ForeignKeyConstraint(
            ['created_by_user_id'], ['users.user_id'],
            ondelete='SET NULL',
            name='fk_webhook_subscriptions_user'
        ),
        sa.CheckConstraint(
            "endpoint_url ~* '^https?://'",
            name='check_webhook_endpoint_url_protocol'
        ),
        sa.CheckConstraint(
            "http_method IN ('POST', 'PUT', 'PATCH')",
            name='check_webhook_http_method'
        ),
        sa.CheckConstraint(
            "max_retries >= 0 AND max_retries <= 10",
            name='check_webhook_max_retries_range'
        ),
        sa.CheckConstraint(
            "timeout_seconds >= 5 AND timeout_seconds <= 60",
            name='check_webhook_timeout_range'
        ),
    )

    # Indexes for efficient querying
    op.create_index(
        'idx_webhook_subscriptions_workspace_active',
        'webhook_subscriptions',
        ['workspace_id', 'is_active'],
        postgresql_where=sa.text('is_active = true')
    )

    op.create_index(
        'idx_webhook_subscriptions_event_types',
        'webhook_subscriptions',
        ['event_types'],
        postgresql_using='gin'
    )

    # Unique constraint: one active webhook per name per workspace
    op.create_index(
        'idx_webhook_subscriptions_unique_name',
        'webhook_subscriptions',
        ['workspace_id', 'name'],
        unique=True,
        postgresql_where=sa.text('is_active = true')
    )

    # Index for finding webhooks by endpoint URL (for circuit breaker lookups)
    op.create_index(
        'idx_webhook_subscriptions_endpoint',
        'webhook_subscriptions',
        [sa.text("(regexp_replace(endpoint_url, '^https?://([^/]+).*', '\\1'))")]
    )

    # Add updated_at trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION update_webhook_subscription_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_webhook_subscriptions_updated_at
        BEFORE UPDATE ON webhook_subscriptions
        FOR EACH ROW
        EXECUTE FUNCTION update_webhook_subscription_timestamp();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_webhook_subscriptions_updated_at ON webhook_subscriptions;")
    op.execute("DROP FUNCTION IF EXISTS update_webhook_subscription_timestamp();")
    op.drop_index('idx_webhook_subscriptions_endpoint')
    op.drop_index('idx_webhook_subscriptions_unique_name')
    op.drop_index('idx_webhook_subscriptions_event_types')
    op.drop_index('idx_webhook_subscriptions_workspace_active')
    op.drop_table('webhook_subscriptions')
