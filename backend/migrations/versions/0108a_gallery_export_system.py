"""Gallery Export System

Revision ID: 0108a
Revises: 0107
Create Date: 2026-01-06

Multi-format gallery export functionality:
- Print-ready PDF albums (with layouts)
- Animated slideshows (MP4/WebM)
- Shareable ZIP archives
- Cloud sync to Google Photos/Amazon Photos/Dropbox/Apple Photos
- Batch export scheduling for large catalogs
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = '0108a'
down_revision = '0107'
branch_labels = None
depends_on = None


def upgrade():
    """Create gallery export system tables."""

    # ---------------------------------------------------------------------------
    # Export Format Enum
    # ---------------------------------------------------------------------------
    # Enums are created by SQLAlchemy via create_type=True in the first table definition

    # ---------------------------------------------------------------------------
    # Gallery Exports Table
    # ---------------------------------------------------------------------------
    op.create_table(
        'gallery_exports',
        sa.Column('export_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.workspace_id', ondelete='CASCADE'), nullable=False),
        sa.Column('gallery_id', UUID(as_uuid=True), sa.ForeignKey('galleries.gallery_id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='SET NULL'), nullable=True),

        # Export configuration
        sa.Column('format', sa.Enum('zip', 'pdf_album', 'slideshow_mp4', 'slideshow_webm',
                                     'cloud_google_photos', 'cloud_amazon_photos', 'cloud_dropbox', 'cloud_apple_photos',
                                     name='export_format'), nullable=False),
        sa.Column('config', JSONB, nullable=False, server_default='{}'),

        # Scope: which assets to export
        sa.Column('sub_gallery_ids', sa.ARRAY(UUID(as_uuid=True)), nullable=True),
        sa.Column('asset_ids', sa.ARRAY(UUID(as_uuid=True)), nullable=True),

        # Status tracking
        sa.Column('status', sa.Enum('pending', 'queued', 'processing', 'uploading', 'completed',
                                    'failed', 'cancelled', 'expired',
                                    name='export_status'), nullable=False, server_default='pending'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('progress_message', sa.String(500), nullable=True),

        # Asset counts
        sa.Column('total_assets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('processed_assets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_assets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('skipped_assets', sa.Integer(), nullable=False, server_default='0'),

        # Output
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('download_url', sa.Text(), nullable=True),
        sa.Column('storage_key', sa.String(500), nullable=True),

        # Error handling
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_code', sa.String(50), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_retries', sa.Integer(), nullable=False, server_default='3'),

        # Scheduling
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),

        # Timestamps
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )

    # ---------------------------------------------------------------------------
    # Cloud Provider Connections Table
    # ---------------------------------------------------------------------------
    op.create_table(
        'cloud_provider_connections',
        sa.Column('connection_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.workspace_id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),

        # Provider info
        sa.Column('provider', sa.Enum('google_photos', 'amazon_photos', 'dropbox', 'apple_photos',
                                       name='cloud_provider'), nullable=False),
        sa.Column('account_email', sa.String(255), nullable=True),
        sa.Column('account_name', sa.String(255), nullable=True),
        sa.Column('account_id', sa.String(255), nullable=True),

        # OAuth tokens (encrypted)
        sa.Column('access_token_encrypted', sa.Text(), nullable=True),
        sa.Column('refresh_token_encrypted', sa.Text(), nullable=True),
        sa.Column('token_iv', sa.String(32), nullable=True),
        sa.Column('token_expires_at', sa.DateTime(timezone=True), nullable=True),

        # Connection state
        sa.Column('connected', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('scopes', sa.ARRAY(sa.String(100)), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),

        # Timestamps
        sa.Column('connected_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('disconnected_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),

        # Constraints
        sa.UniqueConstraint('workspace_id', 'user_id', 'provider', name='uq_cloud_provider_per_user'),
    )

    # ---------------------------------------------------------------------------
    # Cloud Sync Items Table (tracks individual asset sync status)
    # ---------------------------------------------------------------------------
    op.create_table(
        'cloud_sync_items',
        sa.Column('sync_item_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('export_id', UUID(as_uuid=True), sa.ForeignKey('gallery_exports.export_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', UUID(as_uuid=True), sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),

        # Sync status
        sa.Column('status', sa.Enum('pending', 'uploading', 'synced', 'failed', 'skipped',
                                    name='cloud_sync_item_status'), nullable=False, server_default='pending'),

        # Remote reference
        sa.Column('remote_id', sa.String(500), nullable=True),
        sa.Column('remote_path', sa.String(1000), nullable=True),
        sa.Column('remote_url', sa.Text(), nullable=True),

        # Error tracking
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),

        # Timestamps
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),

        # Constraints
        sa.UniqueConstraint('export_id', 'asset_id', name='uq_export_asset_sync'),
    )

    # ---------------------------------------------------------------------------
    # Export Batch Table (for batch export scheduling)
    # ---------------------------------------------------------------------------
    op.create_table(
        'export_batches',
        sa.Column('batch_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.workspace_id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='SET NULL'), nullable=True),

        # Batch info
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('format', sa.Enum('zip', 'pdf_album', 'slideshow_mp4', 'slideshow_webm',
                                     'cloud_google_photos', 'cloud_amazon_photos', 'cloud_dropbox', 'cloud_apple_photos',
                                     name='export_format', create_type=False), nullable=False),
        sa.Column('config', JSONB, nullable=False, server_default='{}'),

        # Progress
        sa.Column('total_exports', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completed_exports', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_exports', sa.Integer(), nullable=False, server_default='0'),

        # Status
        sa.Column('status', sa.Enum('pending', 'queued', 'processing', 'uploading', 'completed',
                                    'failed', 'cancelled', 'expired',
                                    name='export_status', create_type=False), nullable=False, server_default='pending'),

        # Scheduling
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )

    # Add batch_id to gallery_exports (optional, for batch tracking)
    op.add_column('gallery_exports',
        sa.Column('batch_id', UUID(as_uuid=True), sa.ForeignKey('export_batches.batch_id', ondelete='SET NULL'), nullable=True)
    )

    # ---------------------------------------------------------------------------
    # Indexes for Performance
    # ---------------------------------------------------------------------------

    # Gallery exports indexes
    op.create_index('ix_gallery_exports_workspace_id', 'gallery_exports', ['workspace_id'])
    op.create_index('ix_gallery_exports_gallery_id', 'gallery_exports', ['gallery_id'])
    op.create_index('ix_gallery_exports_user_id', 'gallery_exports', ['user_id'])
    op.create_index('ix_gallery_exports_status', 'gallery_exports', ['status'])
    op.create_index('ix_gallery_exports_format', 'gallery_exports', ['format'])
    op.create_index('ix_gallery_exports_scheduled_at', 'gallery_exports', ['scheduled_at'])
    op.create_index('ix_gallery_exports_created_at', 'gallery_exports', ['created_at'])

    # Composite index for pending jobs processing (worker polling)
    op.create_index(
        'ix_gallery_exports_pending_jobs',
        'gallery_exports',
        ['status', 'scheduled_at', 'priority', 'created_at'],
        postgresql_where=sa.text("status IN ('pending', 'queued')")
    )

    # Index for workspace exports lookup
    op.create_index(
        'ix_gallery_exports_workspace_status',
        'gallery_exports',
        ['workspace_id', 'status', 'created_at']
    )

    # Cloud provider connections indexes
    op.create_index('ix_cloud_provider_connections_workspace_id', 'cloud_provider_connections', ['workspace_id'])
    op.create_index('ix_cloud_provider_connections_user_id', 'cloud_provider_connections', ['user_id'])
    op.create_index('ix_cloud_provider_connections_provider', 'cloud_provider_connections', ['provider'])

    # Cloud sync items indexes
    op.create_index('ix_cloud_sync_items_export_id', 'cloud_sync_items', ['export_id'])
    op.create_index('ix_cloud_sync_items_asset_id', 'cloud_sync_items', ['asset_id'])
    op.create_index('ix_cloud_sync_items_status', 'cloud_sync_items', ['status'])

    # Export batches indexes
    op.create_index('ix_export_batches_workspace_id', 'export_batches', ['workspace_id'])
    op.create_index('ix_export_batches_user_id', 'export_batches', ['user_id'])
    op.create_index('ix_export_batches_status', 'export_batches', ['status'])

    # ---------------------------------------------------------------------------
    # Trigger for updated_at
    # ---------------------------------------------------------------------------
    op.execute("""
        CREATE OR REPLACE FUNCTION update_gallery_exports_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trigger_gallery_exports_updated_at
        BEFORE UPDATE ON gallery_exports
        FOR EACH ROW EXECUTE FUNCTION update_gallery_exports_updated_at();
    """)

    op.execute("""
        CREATE TRIGGER trigger_cloud_provider_connections_updated_at
        BEFORE UPDATE ON cloud_provider_connections
        FOR EACH ROW EXECUTE FUNCTION update_gallery_exports_updated_at();
    """)

    op.execute("""
        CREATE TRIGGER trigger_cloud_sync_items_updated_at
        BEFORE UPDATE ON cloud_sync_items
        FOR EACH ROW EXECUTE FUNCTION update_gallery_exports_updated_at();
    """)

    op.execute("""
        CREATE TRIGGER trigger_export_batches_updated_at
        BEFORE UPDATE ON export_batches
        FOR EACH ROW EXECUTE FUNCTION update_gallery_exports_updated_at();
    """)


def downgrade():
    """Remove gallery export system tables."""

    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS trigger_export_batches_updated_at ON export_batches")
    op.execute("DROP TRIGGER IF EXISTS trigger_cloud_sync_items_updated_at ON cloud_sync_items")
    op.execute("DROP TRIGGER IF EXISTS trigger_cloud_provider_connections_updated_at ON cloud_provider_connections")
    op.execute("DROP TRIGGER IF EXISTS trigger_gallery_exports_updated_at ON gallery_exports")
    op.execute("DROP FUNCTION IF EXISTS update_gallery_exports_updated_at()")

    # Drop indexes
    op.drop_index('ix_export_batches_status', table_name='export_batches')
    op.drop_index('ix_export_batches_user_id', table_name='export_batches')
    op.drop_index('ix_export_batches_workspace_id', table_name='export_batches')

    op.drop_index('ix_cloud_sync_items_status', table_name='cloud_sync_items')
    op.drop_index('ix_cloud_sync_items_asset_id', table_name='cloud_sync_items')
    op.drop_index('ix_cloud_sync_items_export_id', table_name='cloud_sync_items')

    op.drop_index('ix_cloud_provider_connections_provider', table_name='cloud_provider_connections')
    op.drop_index('ix_cloud_provider_connections_user_id', table_name='cloud_provider_connections')
    op.drop_index('ix_cloud_provider_connections_workspace_id', table_name='cloud_provider_connections')

    op.drop_index('ix_gallery_exports_workspace_status', table_name='gallery_exports')
    op.drop_index('ix_gallery_exports_pending_jobs', table_name='gallery_exports')
    op.drop_index('ix_gallery_exports_created_at', table_name='gallery_exports')
    op.drop_index('ix_gallery_exports_scheduled_at', table_name='gallery_exports')
    op.drop_index('ix_gallery_exports_format', table_name='gallery_exports')
    op.drop_index('ix_gallery_exports_status', table_name='gallery_exports')
    op.drop_index('ix_gallery_exports_user_id', table_name='gallery_exports')
    op.drop_index('ix_gallery_exports_gallery_id', table_name='gallery_exports')
    op.drop_index('ix_gallery_exports_workspace_id', table_name='gallery_exports')

    # Drop batch_id column from gallery_exports
    op.drop_column('gallery_exports', 'batch_id')

    # Drop tables
    op.drop_table('export_batches')
    op.drop_table('cloud_sync_items')
    op.drop_table('cloud_provider_connections')
    op.drop_table('gallery_exports')

    # Drop enums
    op.execute("DROP TYPE IF EXISTS cloud_sync_item_status")
    op.execute("DROP TYPE IF EXISTS cloud_provider")
    op.execute("DROP TYPE IF EXISTS export_status")
    op.execute("DROP TYPE IF EXISTS export_format")
