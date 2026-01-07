"""0122_client_merge_audit_table

Create client_merge_audit table for tracking client merge operations.

Revision ID: 0122
Revises: 0121
Create Date: 2024-01-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0122"
down_revision = "0121"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create client_merge_audit table."""
    op.create_table(
        "client_merge_audit",
        sa.Column(
            "audit_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "primary_client_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "merged_client_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False,
        ),
        sa.Column(
            "performed_by",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "performed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "merge_details",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    # Create indexes
    op.create_index(
        "idx_client_merge_audit_workspace",
        "client_merge_audit",
        ["workspace_id"],
    )
    op.create_index(
        "idx_client_merge_audit_primary_client",
        "client_merge_audit",
        ["workspace_id", "primary_client_id"],
    )
    op.create_index(
        "idx_client_merge_audit_performed_at",
        "client_merge_audit",
        ["workspace_id", "performed_at"],
    )

    # Add foreign key to workspace
    op.create_foreign_key(
        "fk_client_merge_audit_workspace",
        "client_merge_audit",
        "workspaces",
        ["workspace_id"],
        ["workspace_id"],
        ondelete="CASCADE",
    )

    # Add foreign key to primary client
    op.create_foreign_key(
        "fk_client_merge_audit_primary_client",
        "client_merge_audit",
        "clients",
        ["primary_client_id"],
        ["client_id"],
        ondelete="CASCADE",
    )

    # Add foreign key to performed_by user
    op.create_foreign_key(
        "fk_client_merge_audit_user",
        "client_merge_audit",
        "users",
        ["performed_by"],
        ["user_id"],
        ondelete="SET NULL",
    )

    # Add merged_into_client_id column to clients table if not exists
    op.add_column(
        "clients",
        sa.Column(
            "merged_into_client_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )

    # Create index on merged_into_client_id
    op.create_index(
        "idx_clients_merged_into",
        "clients",
        ["workspace_id", "merged_into_client_id"],
    )


def downgrade() -> None:
    """Drop client_merge_audit table."""
    # Drop indexes
    op.drop_index("idx_clients_merged_into", table_name="clients")
    op.drop_column("clients", "merged_into_client_id")

    op.drop_index("idx_client_merge_audit_performed_at", table_name="client_merge_audit")
    op.drop_index("idx_client_merge_audit_primary_client", table_name="client_merge_audit")
    op.drop_index("idx_client_merge_audit_workspace", table_name="client_merge_audit")

    # Drop foreign keys
    op.drop_constraint(
        "fk_client_merge_audit_user",
        "client_merge_audit",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_client_merge_audit_primary_client",
        "client_merge_audit",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_client_merge_audit_workspace",
        "client_merge_audit",
        type_="foreignkey",
    )

    # Drop table
    op.drop_table("client_merge_audit")
