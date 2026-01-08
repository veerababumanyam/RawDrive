"""add GDPR and SOC2 compliance features

Adds compliance features for client-service:
- Soft delete columns (deleted, deleted_at, retention_expires_at)
- Consent tracking (marketing, analytics, date, IP address)
- Audit logs table for SOC2 CC6.3 compliance

GDPR Article 15 (Right to Access) and Article 20 (Data Portability)
SOC2 CC6.3 (Audit Trails), CC6.7 (Log Retention), CC7.2 (Security Monitoring)

Revision ID: 0133
Revises: 0132
Create Date: 2026-01-08

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision = '0133'
down_revision = 'ef31b4d133bd'  # Skip 0131/0132, depend on upload monitoring
branch_labels = None
depends_on = None


def table_exists(table_name):
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    return table_name in inspector.get_table_names()


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    if not table_exists(table_name):
        return False
    columns = [c['name'] for c in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add GDPR and SOC2 compliance features."""

    # ============================================================================
    # PART 1: GDPR - Soft Delete Columns
    # ============================================================================

    # Add soft delete columns to clients table
    if not column_exists('clients', 'deleted'):
        op.add_column('clients',
            sa.Column('deleted', sa.Boolean(), nullable=False, server_default='false',
                     comment='Soft delete flag for GDPR compliance'))

    if not column_exists('clients', 'deleted_at'):
        op.add_column('clients',
            sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True,
                     comment='Timestamp when client was soft deleted'))

    if not column_exists('clients', 'retention_expires_at'):
        op.add_column('clients',
            sa.Column('retention_expires_at', sa.TIMESTAMP(timezone=True), nullable=True,
                     comment='When client data should be permanently deleted (GDPR retention period)'))

    # Index for GDPR cleanup job (find expired clients)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_clients_retention_expired
        ON clients(retention_expires_at)
        WHERE deleted = TRUE AND retention_expires_at IS NOT NULL
    """)

    # ============================================================================
    # PART 2: GDPR - Consent Tracking
    # ============================================================================

    if not column_exists('clients', 'consent_marketing'):
        op.add_column('clients',
            sa.Column('consent_marketing', sa.Boolean(), nullable=False, server_default='false',
                     comment='Consent for marketing communications (GDPR Article 6)'))

    if not column_exists('clients', 'consent_analytics'):
        op.add_column('clients',
            sa.Column('consent_analytics', sa.Boolean(), nullable=False, server_default='false',
                     comment='Consent for analytics and tracking (GDPR Article 6)'))

    if not column_exists('clients', 'consent_date'):
        op.add_column('clients',
            sa.Column('consent_date', sa.TIMESTAMP(timezone=True), nullable=True,
                     comment='When consent was last updated'))

    if not column_exists('clients', 'consent_ip_address'):
        op.add_column('clients',
            sa.Column('consent_ip_address', sa.String(45), nullable=True,
                     comment='IP address where consent was recorded (IPv4 or IPv6)'))

    # ============================================================================
    # PART 3: Soft Delete for Related Tables
    # ============================================================================

    # Add soft delete to client_contacts
    if table_exists('client_contacts'):
        if not column_exists('client_contacts', 'deleted'):
            op.add_column('client_contacts',
                sa.Column('deleted', sa.Boolean(), nullable=False, server_default='false'))

        if not column_exists('client_contacts', 'deleted_at'):
            op.add_column('client_contacts',
                sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True))

    # Add soft delete to client_addresses
    if table_exists('client_addresses'):
        if not column_exists('client_addresses', 'deleted'):
            op.add_column('client_addresses',
                sa.Column('deleted', sa.Boolean(), nullable=False, server_default='false'))

        if not column_exists('client_addresses', 'deleted_at'):
            op.add_column('client_addresses',
                sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True))

    # Add soft delete to client_activities
    if table_exists('client_activities'):
        if not column_exists('client_activities', 'deleted'):
            op.add_column('client_activities',
                sa.Column('deleted', sa.Boolean(), nullable=False, server_default='false'))

        if not column_exists('client_activities', 'deleted_at'):
            op.add_column('client_activities',
                sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True))

    # Add soft delete to client_communications
    if table_exists('client_communications'):
        if not column_exists('client_communications', 'deleted'):
            op.add_column('client_communications',
                sa.Column('deleted', sa.Boolean(), nullable=False, server_default='false'))

        if not column_exists('client_communications', 'deleted_at'):
            op.add_column('client_communications',
                sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True))

    # ============================================================================
    # PART 4: SOC2 - Audit Logs Table
    # ============================================================================

    if not table_exists('audit_logs'):
        op.create_table('audit_logs',
            sa.Column('audit_id', postgresql.UUID(as_uuid=True), primary_key=True,
                     server_default=sa.text('gen_random_uuid()'),
                     comment='Unique identifier for audit log entry'),

            sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False,
                     comment='Workspace ID for multi-tenant isolation'),

            sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True,
                     comment='User who performed the action (NULL for system actions)'),

            sa.Column('entity_type', sa.String(50), nullable=False,
                     comment='Type of entity (client, contact, address, etc.)'),

            sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=False,
                     comment='ID of the entity that was modified'),

            sa.Column('action', sa.String(50), nullable=False,
                     comment='Action performed: create, update, delete, export'),

            sa.Column('changes_before', postgresql.JSONB, nullable=True,
                     comment='Entity state before change (for update/delete)'),

            sa.Column('changes_after', postgresql.JSONB, nullable=True,
                     comment='Entity state after change (for create/update)'),

            sa.Column('ip_address', sa.String(45), nullable=True,
                     comment='IP address of the request'),

            sa.Column('user_agent', sa.String(500), nullable=True,
                     comment='User agent string from request'),

            sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False,
                     server_default=sa.text('NOW()'),
                     comment='When the audit log entry was created'),

            # Check constraint for valid actions
            sa.CheckConstraint("action IN ('create', 'update', 'delete', 'export', 'restore')",
                             name='ck_audit_logs_action')
        )

        # Composite index for workspace + time queries (most common)
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_time
            ON audit_logs(workspace_id, created_at DESC)
        """)

        # Index for entity lookups
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
            ON audit_logs(entity_type, entity_id)
        """)

        # Index for user activity tracking
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_logs_user
            ON audit_logs(user_id, created_at DESC)
            WHERE user_id IS NOT NULL
        """)

        # Index for action filtering
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_logs_action
            ON audit_logs(workspace_id, action, created_at DESC)
        """)

        # GIN index for JSONB queries on changes
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_logs_changes_before
            ON audit_logs USING gin(changes_before)
            WHERE changes_before IS NOT NULL
        """)

        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_logs_changes_after
            ON audit_logs USING gin(changes_after)
            WHERE changes_after IS NOT NULL
        """)


def downgrade() -> None:
    """Remove GDPR and SOC2 compliance features."""

    # Drop audit logs table and indexes
    if table_exists('audit_logs'):
        op.execute("DROP INDEX IF EXISTS idx_audit_logs_changes_after")
        op.execute("DROP INDEX IF EXISTS idx_audit_logs_changes_before")
        op.execute("DROP INDEX IF EXISTS idx_audit_logs_action")
        op.execute("DROP INDEX IF EXISTS idx_audit_logs_user")
        op.execute("DROP INDEX IF EXISTS idx_audit_logs_entity")
        op.execute("DROP INDEX IF EXISTS idx_audit_logs_workspace_time")
        op.drop_table('audit_logs')

    # Remove soft delete from related tables
    if table_exists('client_communications'):
        if column_exists('client_communications', 'deleted_at'):
            op.drop_column('client_communications', 'deleted_at')
        if column_exists('client_communications', 'deleted'):
            op.drop_column('client_communications', 'deleted')

    if table_exists('client_activities'):
        if column_exists('client_activities', 'deleted_at'):
            op.drop_column('client_activities', 'deleted_at')
        if column_exists('client_activities', 'deleted'):
            op.drop_column('client_activities', 'deleted')

    if table_exists('client_addresses'):
        if column_exists('client_addresses', 'deleted_at'):
            op.drop_column('client_addresses', 'deleted_at')
        if column_exists('client_addresses', 'deleted'):
            op.drop_column('client_addresses', 'deleted')

    if table_exists('client_contacts'):
        if column_exists('client_contacts', 'deleted_at'):
            op.drop_column('client_contacts', 'deleted_at')
        if column_exists('client_contacts', 'deleted'):
            op.drop_column('client_contacts', 'deleted')

    # Remove consent tracking from clients
    if column_exists('clients', 'consent_ip_address'):
        op.drop_column('clients', 'consent_ip_address')
    if column_exists('clients', 'consent_date'):
        op.drop_column('clients', 'consent_date')
    if column_exists('clients', 'consent_analytics'):
        op.drop_column('clients', 'consent_analytics')
    if column_exists('clients', 'consent_marketing'):
        op.drop_column('clients', 'consent_marketing')

    # Remove soft delete from clients
    op.execute("DROP INDEX IF EXISTS idx_clients_retention_expired")

    if column_exists('clients', 'retention_expires_at'):
        op.drop_column('clients', 'retention_expires_at')
    if column_exists('clients', 'deleted_at'):
        op.drop_column('clients', 'deleted_at')
    if column_exists('clients', 'deleted'):
        op.drop_column('clients', 'deleted')
