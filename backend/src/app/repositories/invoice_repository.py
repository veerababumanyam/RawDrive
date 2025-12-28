"""Repository for invoice and payment method data operations.

This module provides the InvoiceRepository class that handles all CRUD
operations for invoices and payment methods, with proper workspace isolation
for multi-tenant security.

All queries enforce workspace_id filtering to ensure data isolation
between tenants.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class InvoiceRepository:
    """Data access layer for invoice and payment method records.

    This repository handles all CRUD operations for billing data, ensuring
    proper workspace isolation for multi-tenant security.

    All methods that access data require workspace_id to enforce
    tenant isolation at the data layer.
    """

    # =========================================================================
    # INVOICE CREATE OPERATIONS
    # =========================================================================

    async def create_invoice(
        self,
        workspace_id: UUID,
        invoice_number: str,
        amount: Decimal,
        currency: str = "INR",
        subscription_id: Optional[UUID] = None,
        external_id: Optional[str] = None,
        tax_amount: Optional[Decimal] = None,
        status: str = "pending",
        billing_period_start: Optional[date] = None,
        billing_period_end: Optional[date] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new invoice record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            invoice_number: Human-readable invoice number (unique)
            amount: Invoice amount
            currency: Currency code (default INR)
            subscription_id: Optional subscription ID
            external_id: Optional external provider invoice ID
            tax_amount: Optional GST/tax amount
            status: Invoice status (default pending)
            billing_period_start: Optional billing period start date
            billing_period_end: Optional billing period end date
            metadata: Optional additional data (line items, GST details)

        Returns:
            Created invoice record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            invoice_id = uuid4()
            row = await conn.fetchrow(
                """
                INSERT INTO invoices (
                    invoice_id, workspace_id, subscription_id, invoice_number,
                    external_id, amount, currency, tax_amount, status,
                    billing_period_start, billing_period_end, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
                """,
                invoice_id,
                workspace_id,
                subscription_id,
                invoice_number,
                external_id,
                amount,
                currency,
                tax_amount,
                status,
                billing_period_start,
                billing_period_end,
                metadata,
            )
            return dict(row)

    # =========================================================================
    # INVOICE READ OPERATIONS
    # =========================================================================

    async def get_invoice(
        self,
        workspace_id: UUID,
        invoice_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single invoice by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            invoice_id: Invoice ID to retrieve

        Returns:
            Invoice record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invoices
                WHERE invoice_id = $1 AND workspace_id = $2
                """,
                invoice_id,
                workspace_id,
            )
            return dict(row) if row else None

    async def get_invoice_by_external_id(
        self,
        workspace_id: UUID,
        external_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get invoice by external provider ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            external_id: External provider invoice ID

        Returns:
            Invoice record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invoices
                WHERE external_id = $1 AND workspace_id = $2
                """,
                external_id,
                workspace_id,
            )
            return dict(row) if row else None

    async def list_invoices(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """List invoices for a workspace with pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter

        Returns:
            Dict with items list and pagination metadata
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            # Build query with optional status filter
            where_clause = "WHERE workspace_id = $1"
            params: list[Any] = [workspace_id]

            if status:
                where_clause += " AND status = $2"
                params.append(status)

            # Get total count
            count_query = f"SELECT COUNT(*) FROM invoices {where_clause}"
            total = await conn.fetchval(count_query, *params)

            # Get paginated results
            query = f"""
                SELECT * FROM invoices
                {where_clause}
                ORDER BY created_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """
            params.extend([limit, offset])
            rows = await conn.fetch(query, *params)

            return {
                "items": [dict(row) for row in rows],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    # =========================================================================
    # INVOICE UPDATE OPERATIONS
    # =========================================================================

    async def update_invoice_status(
        self,
        workspace_id: UUID,
        invoice_id: UUID,
        status: str,
        paid_at: Optional[datetime] = None,
        pdf_url: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update invoice status.

        Args:
            workspace_id: Workspace ID for tenant isolation
            invoice_id: Invoice ID to update
            status: New status value
            paid_at: Optional payment timestamp
            pdf_url: Optional PDF download URL

        Returns:
            Updated invoice record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE invoices
                SET status = $3, paid_at = $4, pdf_url = $5
                WHERE invoice_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                invoice_id,
                workspace_id,
                status,
                paid_at,
                pdf_url,
            )
            return dict(row) if row else None

    # =========================================================================
    # PAYMENT METHOD OPERATIONS
    # =========================================================================

    async def create_payment_method(
        self,
        workspace_id: UUID,
        provider: str,
        external_id: str,
        payment_type: str,
        last_four: Optional[str] = None,
        brand: Optional[str] = None,
        expiry_month: Optional[int] = None,
        expiry_year: Optional[int] = None,
        is_default: bool = False,
    ) -> dict[str, Any]:
        """Create a new payment method record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            provider: Payment provider (razorpay/stripe)
            external_id: Provider payment method ID
            payment_type: Payment type (card/upi/netbanking)
            last_four: Last 4 digits for cards
            brand: Card brand
            expiry_month: Card expiry month
            expiry_year: Card expiry year
            is_default: Whether this is the default payment method

        Returns:
            Created payment method record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            payment_method_id = uuid4()

            # If setting as default, unset existing default first
            if is_default:
                await conn.execute(
                    """
                    UPDATE payment_methods
                    SET is_default = false, updated_at = NOW()
                    WHERE workspace_id = $1 AND is_default = true
                    """,
                    workspace_id,
                )

            row = await conn.fetchrow(
                """
                INSERT INTO payment_methods (
                    payment_method_id, workspace_id, provider, external_id,
                    type, last_four, brand, expiry_month, expiry_year, is_default
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (workspace_id, provider, external_id) DO UPDATE SET
                    type = EXCLUDED.type,
                    last_four = EXCLUDED.last_four,
                    brand = EXCLUDED.brand,
                    expiry_month = EXCLUDED.expiry_month,
                    expiry_year = EXCLUDED.expiry_year,
                    is_default = EXCLUDED.is_default,
                    updated_at = NOW()
                RETURNING *
                """,
                payment_method_id,
                workspace_id,
                provider,
                external_id,
                payment_type,
                last_four,
                brand,
                expiry_month,
                expiry_year,
                is_default,
            )
            return dict(row)

    async def list_payment_methods(
        self,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """List all payment methods for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            List of payment method records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM payment_methods
                WHERE workspace_id = $1
                ORDER BY is_default DESC, created_at DESC
                """,
                workspace_id,
            )
            return [dict(row) for row in rows]

    async def get_default_payment_method(
        self,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get the default payment method for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Default payment method record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM payment_methods
                WHERE workspace_id = $1 AND is_default = true
                """,
                workspace_id,
            )
            return dict(row) if row else None

    async def delete_payment_method(
        self,
        workspace_id: UUID,
        payment_method_id: UUID,
    ) -> bool:
        """Delete a payment method.

        Args:
            workspace_id: Workspace ID for tenant isolation
            payment_method_id: Payment method ID to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM payment_methods
                WHERE payment_method_id = $1 AND workspace_id = $2
                """,
                payment_method_id,
                workspace_id,
            )
            return result == "DELETE 1"


# Singleton instance for use across the application
invoice_repository = InvoiceRepository()
