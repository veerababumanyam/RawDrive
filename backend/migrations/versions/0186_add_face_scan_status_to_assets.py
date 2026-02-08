"""Add face_scan_status field to assets table.

This migration adds the face_scan_status column directly to the assets table
for quick filtering and display without joining asset_analysis. This provides
a denormalized view of face scan status for better query performance.

The asset_analysis.face_status column still tracks detailed face analysis state,
while assets.face_scan_status provides a quick summary for UI purposes.

Feature: Face Recognition & Tagging
Task: T005 - Add face_scan_status field to Asset model

Revision ID: 0186
Revises: 0185
Create Date: 2026-02-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0186"
down_revision = "0185a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add face_scan_status and related columns to assets table.

    New columns:
    - face_scan_status: Overall face scan status for quick filtering
    - faces_count: Number of faces detected (cached from faces table)
    - face_scan_error: Error message if scan failed
    - face_scanned_at: When face scanning completed

    These columns provide denormalized data for efficient queries without
    joining the asset_analysis or faces tables.
    """

    # Add face_scan_status column with default 'not_scanned'
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS face_scan_status VARCHAR(20)
            DEFAULT 'not_scanned'
            CHECK (face_scan_status IN (
                'not_scanned', 'pending', 'scanning', 'completed', 'failed', 'skipped'
            ));
        """
    )

    # Add faces_count column (cached count of detected faces)
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS faces_count INTEGER DEFAULT NULL;
        """
    )

    # Add face_scan_error column for storing error messages
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS face_scan_error TEXT DEFAULT NULL;
        """
    )

    # Add face_scanned_at timestamp
    op.execute(
        """
        ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS face_scanned_at TIMESTAMPTZ DEFAULT NULL;
        """
    )

    # Create index for filtering by face_scan_status
    # Partial index for assets that need scanning
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assets_face_scan_pending
        ON assets(workspace_id, face_scan_status)
        WHERE face_scan_status IN ('not_scanned', 'pending', 'failed');
        """
    )

    # Index for finding assets with faces
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_assets_with_faces
        ON assets(workspace_id, faces_count)
        WHERE faces_count IS NOT NULL AND faces_count > 0;
        """
    )

    # Add column comments for documentation
    op.execute(
        """
        COMMENT ON COLUMN assets.face_scan_status IS
        'Face scan status: not_scanned (default), pending, scanning, completed, failed, skipped. Used for filtering and UI display.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN assets.faces_count IS
        'Cached count of detected faces for quick filtering. NULL if not scanned, 0 if scanned but no faces found.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN assets.face_scan_error IS
        'Error message if face_scan_status is failed. Used for debugging and retry logic.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN assets.face_scanned_at IS
        'Timestamp when face scanning completed (regardless of result). NULL if not yet scanned.';
        """
    )

    # Backfill face_scan_status from existing asset_analysis data
    # This syncs the new column with existing face analysis results
    op.execute(
        """
        UPDATE assets a
        SET
            face_scan_status = CASE aa.face_status
                WHEN 'pending' THEN 'pending'
                WHEN 'processing' THEN 'scanning'
                WHEN 'completed' THEN 'completed'
                WHEN 'failed' THEN 'failed'
                WHEN 'skipped' THEN 'skipped'
                ELSE 'not_scanned'
            END,
            faces_count = aa.faces_detected,
            face_scanned_at = aa.face_analyzed_at
        FROM asset_analysis aa
        WHERE a.asset_id = aa.asset_id;
        """
    )


def downgrade() -> None:
    """Remove face_scan_status and related columns from assets table."""

    # Drop indexes first
    op.execute("DROP INDEX IF EXISTS idx_assets_with_faces;")
    op.execute("DROP INDEX IF EXISTS idx_assets_face_scan_pending;")

    # Drop columns
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS face_scanned_at;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS face_scan_error;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS faces_count;")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS face_scan_status;")
