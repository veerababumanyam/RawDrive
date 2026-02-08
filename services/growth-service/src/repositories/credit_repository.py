"""
Repository for credit ledger database operations.

Handles:
- Credit balance management (AI credits & bill credits)
- Transaction history with ACID compliance
- Multi-tenant isolation via workspace_id
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from src.database import fetch, fetchrow, fetchval, transaction
from src.logging import get_logger

logger = get_logger(__name__)


class CreditRepository:
    """Repository for credit ledger operations."""

    # =========================================================================
    # Balance Operations
    # =========================================================================

    async def get_balance(
        self,
        user_id: UUID,
        workspace_id: UUID,
        credit_type: str,
    ) -> Optional[dict]:
        """Get credit balance for a user and credit type."""
        row = await fetchrow(
            """
            SELECT * FROM user_credits
            WHERE user_id = $1 AND workspace_id = $2 AND credit_type = $3
            """,
            user_id, workspace_id, credit_type,
            read_only=True,
        )
        return dict(row) if row else None

    async def get_all_balances(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> List[dict]:
        """Get all credit balances for a user."""
        rows = await fetch(
            """
            SELECT * FROM user_credits
            WHERE user_id = $1 AND workspace_id = $2
            ORDER BY credit_type
            """,
            user_id, workspace_id,
            read_only=True,
        )
        return [dict(row) for row in rows]

    async def ensure_balance_exists(
        self,
        user_id: UUID,
        workspace_id: UUID,
        credit_type: str,
        currency: str = "INR",
    ) -> dict:
        """Ensure a balance record exists, creating if needed."""
        # Try to get existing
        balance = await self.get_balance(user_id, workspace_id, credit_type)
        if balance:
            return balance

        # Create new balance record
        row = await fetchrow(
            """
            INSERT INTO user_credits (user_id, workspace_id, credit_type, balance, currency)
            VALUES ($1, $2, $3, 0, $4)
            ON CONFLICT (user_id, workspace_id, credit_type) DO UPDATE
            SET updated_at = NOW()
            RETURNING *
            """,
            user_id, workspace_id, credit_type, currency,
        )
        return dict(row) if row else None

    # =========================================================================
    # Credit Transaction Operations
    # =========================================================================

    async def add_credit(
        self,
        user_id: UUID,
        workspace_id: UUID,
        credit_type: str,
        amount: Decimal,
        source: str,
        description: Optional[str] = None,
        currency: str = "INR",
        reference_type: Optional[str] = None,
        reference_id: Optional[UUID] = None,
        idempotency_key: Optional[str] = None,
    ) -> Optional[dict]:
        """Add credits to a user's balance with full transaction logging.

        Uses a database transaction to ensure ACID compliance:
        1. Check idempotency key
        2. Update balance
        3. Create transaction record

        Returns:
            Transaction record if successful, None if idempotent duplicate
        """
        # Check idempotency key if provided
        if idempotency_key:
            existing = await fetchrow(
                """
                SELECT * FROM credit_transactions
                WHERE idempotency_key = $1
                """,
                idempotency_key,
                read_only=True,
            )
            if existing:
                logger.info(
                    "Idempotent credit request - returning existing transaction",
                    extra={"idempotency_key": idempotency_key},
                )
                return dict(existing)

        async with transaction() as conn:
            # Ensure balance record exists and get current balance
            await conn.execute(
                """
                INSERT INTO user_credits (user_id, workspace_id, credit_type, balance, currency)
                VALUES ($1, $2, $3, 0, $4)
                ON CONFLICT (user_id, workspace_id, credit_type) DO NOTHING
                """,
                user_id, workspace_id, credit_type, currency,
            )

            # Update balance
            new_balance = await conn.fetchval(
                """
                UPDATE user_credits
                SET
                    balance = balance + $1,
                    total_earned = total_earned + $1,
                    updated_at = NOW()
                WHERE user_id = $2 AND workspace_id = $3 AND credit_type = $4
                RETURNING balance
                """,
                amount, user_id, workspace_id, credit_type,
            )

            # Create transaction record
            tx_row = await conn.fetchrow(
                """
                INSERT INTO credit_transactions (
                    user_id, workspace_id, credit_type, transaction_type, amount,
                    currency, source, description, reference_type, reference_id,
                    balance_after, idempotency_key
                ) VALUES ($1, $2, $3, 'credit', $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
                """,
                user_id, workspace_id, credit_type, amount, currency,
                source, description, reference_type, reference_id,
                new_balance, idempotency_key,
            )

            logger.info(
                "Credit added",
                extra={
                    "user_id": str(user_id),
                    "credit_type": credit_type,
                    "amount": str(amount),
                    "new_balance": str(new_balance),
                    "source": source,
                },
            )

            return dict(tx_row) if tx_row else None

    async def deduct_credit(
        self,
        user_id: UUID,
        workspace_id: UUID,
        credit_type: str,
        amount: Decimal,
        description: Optional[str] = None,
        reference_type: Optional[str] = None,
        reference_id: Optional[UUID] = None,
        idempotency_key: Optional[str] = None,
        allow_negative: bool = False,
    ) -> Tuple[Optional[dict], bool]:
        """Deduct credits from a user's balance.

        Args:
            allow_negative: If False, will fail if balance would go negative

        Returns:
            Tuple of (transaction record, insufficient_balance flag)
        """
        # Check idempotency key if provided
        if idempotency_key:
            existing = await fetchrow(
                """
                SELECT * FROM credit_transactions
                WHERE idempotency_key = $1
                """,
                idempotency_key,
                read_only=True,
            )
            if existing:
                return dict(existing), False

        async with transaction() as conn:
            # Get current balance
            current = await conn.fetchrow(
                """
                SELECT balance FROM user_credits
                WHERE user_id = $1 AND workspace_id = $2 AND credit_type = $3
                FOR UPDATE
                """,
                user_id, workspace_id, credit_type,
            )

            if not current:
                return None, True  # No balance record = insufficient

            current_balance = current["balance"]
            if not allow_negative and current_balance < amount:
                return None, True  # Insufficient balance

            # Update balance
            new_balance = await conn.fetchval(
                """
                UPDATE user_credits
                SET
                    balance = balance - $1,
                    total_used = total_used + $1,
                    updated_at = NOW()
                WHERE user_id = $2 AND workspace_id = $3 AND credit_type = $4
                RETURNING balance
                """,
                amount, user_id, workspace_id, credit_type,
            )

            # Create transaction record
            tx_row = await conn.fetchrow(
                """
                INSERT INTO credit_transactions (
                    user_id, workspace_id, credit_type, transaction_type, amount,
                    source, description, reference_type, reference_id,
                    balance_after, idempotency_key
                ) VALUES ($1, $2, $3, 'debit', $4, 'usage', $5, $6, $7, $8, $9)
                RETURNING *
                """,
                user_id, workspace_id, credit_type, amount,
                description, reference_type, reference_id,
                new_balance, idempotency_key,
            )

            logger.info(
                "Credit deducted",
                extra={
                    "user_id": str(user_id),
                    "credit_type": credit_type,
                    "amount": str(amount),
                    "new_balance": str(new_balance),
                },
            )

            return dict(tx_row) if tx_row else None, False

    # =========================================================================
    # Transaction History
    # =========================================================================

    async def get_transactions(
        self,
        user_id: UUID,
        workspace_id: UUID,
        credit_type: Optional[str] = None,
        transaction_type: Optional[str] = None,
        source: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[dict], int]:
        """Get paginated transaction history with filters."""
        offset = (page - 1) * page_size

        # Build dynamic WHERE clause
        conditions = ["user_id = $1", "workspace_id = $2"]
        params = [user_id, workspace_id]
        param_idx = 3

        if credit_type:
            conditions.append(f"credit_type = ${param_idx}")
            params.append(credit_type)
            param_idx += 1

        if transaction_type:
            conditions.append(f"transaction_type = ${param_idx}")
            params.append(transaction_type)
            param_idx += 1

        if source:
            conditions.append(f"source = ${param_idx}")
            params.append(source)
            param_idx += 1

        if start_date:
            conditions.append(f"created_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            conditions.append(f"created_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Get total count
        count_query = f"SELECT COUNT(*) FROM credit_transactions WHERE {where_clause}"
        total = await fetchval(count_query, *params, read_only=True)

        # Get paginated results
        select_query = f"""
            SELECT * FROM credit_transactions
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """
        params.extend([page_size, offset])
        rows = await fetch(select_query, *params, read_only=True)

        return [dict(row) for row in rows], total

    async def get_summary(
        self,
        user_id: UUID,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
    ) -> dict:
        """Get credit summary for a time period."""
        row = await fetchrow(
            """
            SELECT
                COALESCE(SUM(CASE WHEN credit_type = 'ai_credits' AND transaction_type = 'credit' THEN amount ELSE 0 END), 0) as ai_credits_earned,
                COALESCE(SUM(CASE WHEN credit_type = 'ai_credits' AND transaction_type = 'debit' THEN amount ELSE 0 END), 0) as ai_credits_used,
                COALESCE(SUM(CASE WHEN credit_type = 'bill_credits' AND transaction_type = 'credit' THEN amount ELSE 0 END), 0) as bill_credits_earned,
                COALESCE(SUM(CASE WHEN credit_type = 'bill_credits' AND transaction_type = 'debit' THEN amount ELSE 0 END), 0) as bill_credits_used
            FROM credit_transactions
            WHERE user_id = $1 AND workspace_id = $2
            AND created_at >= $3 AND created_at <= $4
            """,
            user_id, workspace_id, start_date, end_date,
            read_only=True,
        )

        result = dict(row) if row else {}
        result["ai_credits_net"] = result.get("ai_credits_earned", 0) - result.get("ai_credits_used", 0)
        result["bill_credits_net"] = result.get("bill_credits_earned", 0) - result.get("bill_credits_used", 0)

        return result

    async def get_earnings_by_source(
        self,
        user_id: UUID,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
    ) -> dict:
        """Get credit earnings grouped by source."""
        rows = await fetch(
            """
            SELECT source, credit_type, SUM(amount) as total
            FROM credit_transactions
            WHERE user_id = $1 AND workspace_id = $2
            AND transaction_type = 'credit'
            AND created_at >= $3 AND created_at <= $4
            GROUP BY source, credit_type
            """,
            user_id, workspace_id, start_date, end_date,
            read_only=True,
        )

        result = {}
        for row in rows:
            key = f"{row['credit_type']}_{row['source']}"
            result[key] = float(row["total"])

        return result


# Global instance
credit_repository = CreditRepository()
