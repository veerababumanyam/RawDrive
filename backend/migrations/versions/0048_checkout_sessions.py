"""Create checkout_sessions table for Razorpay integration.

This migration adds:
- Checkout sessions for tracking payment flow
- Razorpay payment ID column to invoices

Revision ID: 0048
Revises: 0047
Create Date: 2025-12-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create checkout_sessions table
    op.create_table(
        "checkout_sessions",
        sa.Column("checkout_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=False),
        sa.Column("plan_id", UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", sa.String(100), nullable=False, unique=True),
        sa.Column("payment_id", sa.String(100), nullable=True),
        sa.Column("billing_cycle", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("success_url", sa.Text(), nullable=True),
        sa.Column("cancel_url", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["plans.plan_id"],
            ondelete="RESTRICT",
        ),
    )

    # Create indexes
    op.create_index(
        "idx_checkout_sessions_workspace_id",
        "checkout_sessions",
        ["workspace_id"],
    )
    op.create_index(
        "idx_checkout_sessions_order_id",
        "checkout_sessions",
        ["order_id"],
    )
    op.create_index(
        "idx_checkout_sessions_status",
        "checkout_sessions",
        ["status"],
    )
    op.create_index(
        "idx_checkout_sessions_expires_at",
        "checkout_sessions",
        ["expires_at"],
    )

    # Add razorpay_payment_id to invoices table
    op.add_column(
        "invoices",
        sa.Column("razorpay_payment_id", sa.String(100), nullable=True),
    )
    op.create_index(
        "idx_invoices_razorpay_payment_id",
        "invoices",
        ["razorpay_payment_id"],
    )


def downgrade() -> None:
    # Drop razorpay_payment_id from invoices
    op.drop_index("idx_invoices_razorpay_payment_id", table_name="invoices")
    op.drop_column("invoices", "razorpay_payment_id")

    # Drop checkout_sessions table
    op.drop_index("idx_checkout_sessions_expires_at", table_name="checkout_sessions")
    op.drop_index("idx_checkout_sessions_status", table_name="checkout_sessions")
    op.drop_index("idx_checkout_sessions_order_id", table_name="checkout_sessions")
    op.drop_index("idx_checkout_sessions_workspace_id", table_name="checkout_sessions")
    op.drop_table("checkout_sessions")
