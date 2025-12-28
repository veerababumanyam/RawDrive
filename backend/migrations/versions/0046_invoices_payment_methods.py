"""Create invoices and payment_methods tables for subscription billing.

This migration adds support for:
- Invoice history with GST-compliant billing
- Payment method storage for subscriptions

Revision ID: 0046
Revises: 0045
Create Date: 2025-12-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create invoices table
    op.create_table(
        "invoices",
        sa.Column("invoice_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=False),
        sa.Column("subscription_id", UUID(as_uuid=True), nullable=True),
        sa.Column("invoice_number", sa.String(50), nullable=False, unique=True),
        sa.Column("external_id", sa.String(100), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("tax_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("billing_period_start", sa.Date(), nullable=True),
        sa.Column("billing_period_end", sa.Date(), nullable=True),
        sa.Column("pdf_url", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("metadata", JSONB(), nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.workspace_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["workspace_subscriptions.subscription_id"],
            ondelete="SET NULL",
        ),
    )

    # Create indexes for invoices
    op.create_index("idx_invoices_workspace_id", "invoices", ["workspace_id"])
    op.create_index("idx_invoices_subscription_id", "invoices", ["subscription_id"])
    op.create_index("idx_invoices_external_id", "invoices", ["external_id"])
    op.create_index(
        "idx_invoices_workspace_created",
        "invoices",
        ["workspace_id", "created_at"],
    )

    # Create payment_methods table
    op.create_table(
        "payment_methods",
        sa.Column("payment_method_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("last_four", sa.String(4), nullable=True),
        sa.Column("brand", sa.String(20), nullable=True),
        sa.Column("expiry_month", sa.Integer(), nullable=True),
        sa.Column("expiry_year", sa.Integer(), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.workspace_id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "provider",
            "external_id",
            name="uq_payment_methods_workspace_provider_external",
        ),
    )

    # Create indexes for payment_methods
    op.create_index(
        "idx_payment_methods_workspace_id", "payment_methods", ["workspace_id"]
    )
    op.create_index(
        "idx_payment_methods_external_id", "payment_methods", ["external_id"]
    )


def downgrade() -> None:
    # Drop payment_methods table and indexes
    op.drop_index("idx_payment_methods_external_id", table_name="payment_methods")
    op.drop_index("idx_payment_methods_workspace_id", table_name="payment_methods")
    op.drop_table("payment_methods")

    # Drop invoices table and indexes
    op.drop_index("idx_invoices_workspace_created", table_name="invoices")
    op.drop_index("idx_invoices_external_id", table_name="invoices")
    op.drop_index("idx_invoices_subscription_id", table_name="invoices")
    op.drop_index("idx_invoices_workspace_id", table_name="invoices")
    op.drop_table("invoices")
