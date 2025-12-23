"""Add visitors schema.

Revision ID: 0023
Revises: 0022
Create Date: 2025-12-23
"""

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Visitors table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS visitors (
            visitor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL,
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            phone VARCHAR(50),
            address TEXT,
            metadata JSONB DEFAULT '{}',
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(workspace_id, email)
        );
        """
    )

    # Gallery Visitors table (Access Log / Leads)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS gallery_visitors (
            access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            visitor_id UUID NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,
            accessed_at TIMESTAMPTZ DEFAULT NOW(),
            source VARCHAR(50) DEFAULT 'magic_link',
            metadata JSONB DEFAULT '{}'
        );
        """
    )
    
    # Indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_visitors_workspace ON visitors(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_visitors_email ON visitors(email);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gallery_visitors_gallery ON gallery_visitors(gallery_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gallery_visitors_visitor ON gallery_visitors(visitor_id);")

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_gallery_visitors_visitor;")
    op.execute("DROP INDEX IF EXISTS idx_gallery_visitors_gallery;")
    op.execute("DROP INDEX IF EXISTS idx_visitors_email;")
    op.execute("DROP INDEX IF EXISTS idx_visitors_workspace;")
    
    op.execute("DROP TABLE IF EXISTS gallery_visitors;")
    op.execute("DROP TABLE IF EXISTS visitors;")
