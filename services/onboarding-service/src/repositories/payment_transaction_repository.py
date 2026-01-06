"""Repository for payment transaction data operations.

This module provides the PaymentTransactionRepository class that handles all CRUD
operations for payment transactions, with idempotency support for webhook processing.

Feature: Automated Onboarding System
Task: T012 - Create PaymentTransactionRepository
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID, uuid4

from src.database import get_pool


logger = logging.getLogger(__name__)


class PaymentTransactionRepository:
    """Data access layer for payment transaction records.

    This repository handles all CRUD operations for payment transactions,
    ensuring idempotency for webhook processing and proper workspace isolation.

    Key Features:
    - Idempotency key support for duplicate webhook prevention
    - Workspace isolation for all operations
    - Transaction lifecycle tracking
    - Payment method detail storage for audit
    """

    # =========================================================================
    # TRANSACTION CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        workspace_id: UUID,
        amount: Decimal,
        currency: str = "INR",
        idempotency_key: Optional[str] = None,
        subscription_id: Optional[UUID] = None,
        invoice_id: Optional[UUID] = None,
        onboarding_session_id: Optional[UUID] = None,
        transaction_type: str = "payment",
        status: str = "pending",
        stripe_payment_intent_id: Optional[str] = None,
        stripe_charge_id: Optional[str] = None,
        stripe_event_id: Optional[str] = None,
        stripe_event_type: Optional[str] = None,
        stripe_payment_method_id: Optional[str] = None,
        fee_amount: Optional[Decimal] = None,
        tax_amount: Optional[Decimal] = None,
        payment_method_type: Optional[str] = None,
        card_brand: Optional[str] = None,
        card_last_four: Optional[str] = None,
        card_exp_month: Optional[int] = None,
        card_exp_year: Optional[int] = None,
        bank_name: Optional[str] = None,
        upi_id: Optional[str] = None,
        description: Optional[str] = None,
        webhook_payload: Optional[dict[str, Any]] = None,
        provider_response: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new payment transaction record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            amount: Transaction amount
            currency: Currency code (default: INR)
            idempotency_key: Unique key for duplicate prevention
            subscription_id: Related subscription ID
            invoice_id: Related invoice ID
            onboarding_session_id: Related onboarding session ID
            transaction_type: Type (payment, refund, chargeback, etc.)
            status: Transaction status
            stripe_payment_intent_id: Stripe Payment Intent ID
            stripe_charge_id: Stripe Charge ID
            stripe_event_id: Stripe Event ID (for webhooks)
            stripe_event_type: Stripe Event type
            stripe_payment_method_id: Stripe Payment Method ID
            fee_amount: Processing fee amount
            tax_amount: Tax amount
            payment_method_type: Payment method type (card, upi, etc.)
            card_brand: Card brand (visa, mastercard, etc.)
            card_last_four: Last 4 digits of card
            card_exp_month: Card expiry month
            card_exp_year: Card expiry year
            bank_name: Bank name for netbanking
            upi_id: UPI ID for UPI payments
            description: Transaction description
            webhook_payload: Raw webhook payload for audit
            provider_response: Provider API response
            ip_address: Client IP address
            metadata: Additional metadata

        Returns:
            Created transaction record as dict
        """
        pool = await get_pool()

        transaction_id = uuid4()
        if not idempotency_key:
            idempotency_key = str(transaction_id)

        # Calculate net amount
        net_amount = amount - (fee_amount or Decimal("0"))

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO payment_transactions (
                    transaction_id, idempotency_key, workspace_id,
                    subscription_id, invoice_id, onboarding_session_id,
                    transaction_type, status,
                    stripe_payment_intent_id, stripe_charge_id,
                    stripe_event_id, stripe_event_type, stripe_payment_method_id,
                    amount, currency, fee_amount, net_amount, tax_amount,
                    payment_method_type, card_brand, card_last_four,
                    card_exp_month, card_exp_year, bank_name, upi_id,
                    description, webhook_payload, provider_response,
                    ip_address, metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
                )
                RETURNING *
                """,
                transaction_id,
                idempotency_key,
                workspace_id,
                subscription_id,
                invoice_id,
                onboarding_session_id,
                transaction_type,
                status,
                stripe_payment_intent_id,
                stripe_charge_id,
                stripe_event_id,
                stripe_event_type,
                stripe_payment_method_id,
                amount,
                currency,
                fee_amount or Decimal("0"),
                net_amount,
                tax_amount,
                payment_method_type,
                card_brand,
                card_last_four,
                card_exp_month,
                card_exp_year,
                bank_name,
                upi_id,
                description,
                webhook_payload,
                provider_response,
                ip_address,
                metadata or {},
            )

            logger.info(
                "Payment transaction created",
                extra={
                    "transaction_id": str(transaction_id),
                    "workspace_id": str(workspace_id),
                    "amount": str(amount),
                    "currency": currency,
                    "type": transaction_type,
                    "status": status,
                },
            )

            return self._row_to_dict(row)

    async def create_or_get_by_idempotency_key(
        self,
        idempotency_key: str,
        workspace_id: UUID,
        amount: Decimal,
        **kwargs,
    ) -> tuple[dict[str, Any], bool]:
        """Create a transaction or return existing one with same idempotency key.

        This ensures webhook events are processed exactly once.

        Args:
            idempotency_key: Unique key for duplicate prevention
            workspace_id: Workspace ID for tenant isolation
            amount: Transaction amount
            **kwargs: Additional fields for create()

        Returns:
            Tuple of (transaction record, was_created boolean)
        """
        # Check for existing transaction
        existing = await self.get_by_idempotency_key(idempotency_key)
        if existing:
            logger.debug(
                "Duplicate transaction detected via idempotency key",
                extra={
                    "idempotency_key": idempotency_key,
                    "transaction_id": existing.get("transaction_id"),
                },
            )
            return existing, False

        # Create new transaction
        transaction = await self.create(
            workspace_id=workspace_id,
            amount=amount,
            idempotency_key=idempotency_key,
            **kwargs,
        )
        return transaction, True

    # =========================================================================
    # TRANSACTION READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        workspace_id: UUID,
        transaction_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a transaction by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            transaction_id: Transaction ID to retrieve

        Returns:
            Transaction record as dict or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM payment_transactions
                WHERE transaction_id = $1 AND workspace_id = $2
                """,
                transaction_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_idempotency_key(
        self,
        idempotency_key: str,
    ) -> Optional[dict[str, Any]]:
        """Get a transaction by idempotency key.

        Note: Does not require workspace_id as idempotency keys are globally unique.

        Args:
            idempotency_key: Idempotency key to look up

        Returns:
            Transaction record as dict or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM payment_transactions
                WHERE idempotency_key = $1
                """,
                idempotency_key,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_stripe_payment_intent(
        self,
        stripe_payment_intent_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get a transaction by Stripe Payment Intent ID.

        Args:
            stripe_payment_intent_id: Stripe Payment Intent ID

        Returns:
            Transaction record as dict or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM payment_transactions
                WHERE stripe_payment_intent_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                stripe_payment_intent_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_stripe_event(
        self,
        stripe_event_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get a transaction by Stripe Event ID.

        Used to check if a webhook event has already been processed.

        Args:
            stripe_event_id: Stripe Event ID

        Returns:
            Transaction record as dict or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM payment_transactions
                WHERE stripe_event_id = $1
                """,
                stripe_event_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        transaction_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """List transactions for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum number of records to return
            offset: Number of records to skip
            status: Optional status filter
            transaction_type: Optional type filter

        Returns:
            List of transaction records
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            conditions = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_index = 2

            if status:
                conditions.append(f"status = ${param_index}")
                params.append(status)
                param_index += 1

            if transaction_type:
                conditions.append(f"transaction_type = ${param_index}")
                params.append(transaction_type)
                param_index += 1

            params.extend([limit, offset])

            query = f"""
                SELECT * FROM payment_transactions
                WHERE {" AND ".join(conditions)}
                ORDER BY created_at DESC
                LIMIT ${param_index} OFFSET ${param_index + 1}
            """

            rows = await conn.fetch(query, *params)
            return [self._row_to_dict(row) for row in rows]

    async def list_by_subscription(
        self,
        workspace_id: UUID,
        subscription_id: UUID,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """List transactions for a subscription.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subscription_id: Subscription ID to filter by
            limit: Maximum number of records to return

        Returns:
            List of transaction records
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM payment_transactions
                WHERE workspace_id = $1 AND subscription_id = $2
                ORDER BY created_at DESC
                LIMIT $3
                """,
                workspace_id,
                subscription_id,
                limit,
            )
            return [self._row_to_dict(row) for row in rows]

    async def list_by_onboarding_session(
        self,
        onboarding_session_id: UUID,
    ) -> list[dict[str, Any]]:
        """List transactions for an onboarding session.

        Note: Does not require workspace_id as onboarding sessions
        may not yet have a workspace.

        Args:
            onboarding_session_id: Onboarding session ID

        Returns:
            List of transaction records
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM payment_transactions
                WHERE onboarding_session_id = $1
                ORDER BY created_at DESC
                """,
                onboarding_session_id,
            )
            return [self._row_to_dict(row) for row in rows]

    # =========================================================================
    # TRANSACTION UPDATE OPERATIONS
    # =========================================================================

    async def update_status(
        self,
        transaction_id: UUID,
        status: str,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        decline_code: Optional[str] = None,
        confirmed_at: Optional[datetime] = None,
        provider_response: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        """Update transaction status.

        Args:
            transaction_id: Transaction ID to update
            status: New status
            error_code: Error code if failed
            error_message: Error message if failed
            decline_code: Card decline code if applicable
            confirmed_at: Confirmation timestamp
            provider_response: Provider API response

        Returns:
            Updated transaction record or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE payment_transactions
                SET status = $2,
                    error_code = COALESCE($3, error_code),
                    error_message = COALESCE($4, error_message),
                    decline_code = COALESCE($5, decline_code),
                    confirmed_at = COALESCE($6, confirmed_at),
                    provider_response = COALESCE($7, provider_response)
                WHERE transaction_id = $1
                RETURNING *
                """,
                transaction_id,
                status,
                error_code,
                error_message,
                decline_code,
                confirmed_at,
                provider_response,
            )

            if row:
                logger.info(
                    "Transaction status updated",
                    extra={
                        "transaction_id": str(transaction_id),
                        "status": status,
                        "error_code": error_code,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_stripe_ids(
        self,
        transaction_id: UUID,
        stripe_payment_intent_id: Optional[str] = None,
        stripe_charge_id: Optional[str] = None,
        stripe_payment_method_id: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update Stripe IDs for a transaction.

        Args:
            transaction_id: Transaction ID to update
            stripe_payment_intent_id: Stripe Payment Intent ID
            stripe_charge_id: Stripe Charge ID
            stripe_payment_method_id: Stripe Payment Method ID

        Returns:
            Updated transaction record or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE payment_transactions
                SET stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
                    stripe_charge_id = COALESCE($3, stripe_charge_id),
                    stripe_payment_method_id = COALESCE($4, stripe_payment_method_id)
                WHERE transaction_id = $1
                RETURNING *
                """,
                transaction_id,
                stripe_payment_intent_id,
                stripe_charge_id,
                stripe_payment_method_id,
            )
            return self._row_to_dict(row) if row else None

    async def increment_retry(
        self,
        transaction_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Increment retry count for a transaction.

        Args:
            transaction_id: Transaction ID to update

        Returns:
            Updated transaction record or None if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE payment_transactions
                SET retry_count = retry_count + 1
                WHERE transaction_id = $1
                RETURNING *
                """,
                transaction_id,
            )
            return self._row_to_dict(row) if row else None

    async def record_refund(
        self,
        transaction_id: UUID,
        refund_amount: Decimal,
        stripe_refund_id: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Record a refund for a transaction.

        Args:
            transaction_id: Transaction ID to update
            refund_amount: Amount refunded
            stripe_refund_id: Stripe Refund ID

        Returns:
            Updated transaction record or None if not found
        """
        now = datetime.now(timezone.utc)
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE payment_transactions
                SET refund_amount = COALESCE(refund_amount, 0) + $2,
                    stripe_refund_id = COALESCE($3, stripe_refund_id),
                    refunded_at = $4,
                    status = CASE
                        WHEN (COALESCE(refund_amount, 0) + $2) >= amount THEN 'refunded'
                        ELSE 'partially_refunded'
                    END
                WHERE transaction_id = $1
                RETURNING *
                """,
                transaction_id,
                refund_amount,
                stripe_refund_id,
                now,
            )

            if row:
                logger.info(
                    "Refund recorded",
                    extra={
                        "transaction_id": str(transaction_id),
                        "refund_amount": str(refund_amount),
                        "stripe_refund_id": stripe_refund_id,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def record_dispute(
        self,
        transaction_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Mark a transaction as disputed.

        Args:
            transaction_id: Transaction ID to update

        Returns:
            Updated transaction record or None if not found
        """
        now = datetime.now(timezone.utc)
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE payment_transactions
                SET status = 'disputed',
                    disputed_at = $2
                WHERE transaction_id = $1
                RETURNING *
                """,
                transaction_id,
                now,
            )

            if row:
                logger.warning(
                    "Transaction disputed",
                    extra={"transaction_id": str(transaction_id)},
                )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # ANALYTICS QUERIES
    # =========================================================================

    async def get_revenue_stats(
        self,
        workspace_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Get revenue statistics for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Dict with revenue statistics
        """
        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)

        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_transactions,
                    SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as total_revenue,
                    SUM(CASE WHEN status = 'succeeded' THEN fee_amount ELSE 0 END) as total_fees,
                    SUM(CASE WHEN status = 'succeeded' THEN net_amount ELSE 0 END) as net_revenue,
                    SUM(COALESCE(refund_amount, 0)) as total_refunds,
                    COUNT(*) FILTER (WHERE status = 'succeeded') as successful_count,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
                    COUNT(*) FILTER (WHERE status = 'disputed') as disputed_count
                FROM payment_transactions
                WHERE workspace_id = $1
                  AND transaction_type = 'payment'
                  AND created_at BETWEEN $2 AND $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            result = dict(row) if row else {}

            # Convert Decimals to strings for JSON serialization
            for key in ["total_revenue", "total_fees", "net_revenue", "total_refunds"]:
                if key in result and result[key] is not None:
                    result[key] = str(result[key])

            return result

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary.

        Args:
            row: asyncpg Record object

        Returns:
            Dictionary representation of the row
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = [
            "transaction_id",
            "workspace_id",
            "subscription_id",
            "invoice_id",
            "onboarding_session_id",
        ]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format strings
        datetime_fields = [
            "created_at",
            "updated_at",
            "confirmed_at",
            "refunded_at",
            "disputed_at",
            "provider_created_at",
        ]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Convert Decimals to strings
        decimal_fields = [
            "amount",
            "fee_amount",
            "net_amount",
            "refund_amount",
            "tax_amount",
        ]
        for field in decimal_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_payment_transaction_repository: Optional[PaymentTransactionRepository] = None


def get_payment_transaction_repository() -> PaymentTransactionRepository:
    """Get the singleton PaymentTransactionRepository instance.

    Returns:
        PaymentTransactionRepository singleton instance
    """
    global _payment_transaction_repository
    if _payment_transaction_repository is None:
        _payment_transaction_repository = PaymentTransactionRepository()
    return _payment_transaction_repository
